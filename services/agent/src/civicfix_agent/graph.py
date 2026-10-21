from datetime import date
from typing import Literal, NotRequired, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from civicfix_agent.classifier import ClassifierOutput
from civicfix_agent.resolver import LocationResolution
from civicfix_agent.resolver import resolve_location as resolve_location_with_rag
from civicfix_agent.vector_store import VectorStore
from civicfix_agent.vision import LLMClient
from civicfix_agent.writer import DraftOutput, write_complaint_draft


class ComplaintState(TypedDict):
    """State carried through the complaint processing graph."""

    photo_url: str
    coords: tuple[float, float]
    description: str
    geocoded_address: NotRequired[dict[str, str | None] | None]
    report_date: NotRequired[str | None]
    legal_references: NotRequired[list[object]]
    classification: NotRequired[ClassifierOutput | None]
    jurisdiction: NotRequired[LocationResolution | str | None]
    draft: NotRequired[DraftOutput | str | None]
    approval: NotRequired[str | None]
    needs_input: NotRequired[bool]


def classify(
    state: ComplaintState,
    llm_client: LLMClient | None = None,
) -> dict[str, ClassifierOutput]:
    """Placeholder classifier until the agent model is connected."""

    if llm_client:
        from civicfix_agent.classifier import classify_with_retry

        return {'classification': classify_with_retry(llm_client, state)}
    return {
        'classification': ClassifierOutput(
            issue_type='other',
            severity=1,
            confidence=0,
            visible_details=state['description'],
            safety_risk=False,
        )
    }


def resolve_location(
    state: ComplaintState,
    vector_store: VectorStore | None = None,
) -> dict[str, LocationResolution | str]:
    """Resolve jurisdiction with RAG when a geocoded address and store are available."""

    if vector_store and state.get('geocoded_address') and state.get('classification'):
        return {
            'jurisdiction': resolve_location_with_rag(
                state['geocoded_address'] or {},
                state['classification'].issue_type,
                vector_store,
            )
        }
    return {'jurisdiction': 'unresolved'}


def route_after_classification(
    state: ComplaintState,
) -> Literal['resolve_location', 'needs_input']:
    classification = state.get('classification')
    if not classification or classification.issue_type == 'not_an_issue':
        return 'needs_input'
    if classification.confidence < 0.4:
        return 'needs_input'
    return 'resolve_location'


def route_after_resolution(
    state: ComplaintState,
) -> Literal['write_draft', 'needs_input']:
    jurisdiction = state.get('jurisdiction')
    if isinstance(jurisdiction, LocationResolution):
        if jurisdiction.needs_user_review or jurisdiction.confidence < 0.4:
            return 'needs_input'
        return 'write_draft'
    return 'needs_input'


def write_draft(state: ComplaintState) -> dict[str, DraftOutput | str]:
    """Write a validated complaint draft from the current graph state."""

    classification = state.get('classification')
    if not classification:
        return {'draft': state['description']}
    return {
        'draft': write_complaint_draft(
            issue_type=classification.issue_type,
            severity=classification.severity,
            address=state.get('geocoded_address') or {},
            coordinates=state['coords'],
            photo_url=state['photo_url'],
            description=state['description'],
            report_date=(
                date.fromisoformat(report_date)
                if (report_date := state.get('report_date'))
                else None
            ),
            legal_references=[
                reference
                for reference in state.get('legal_references', [])
                if hasattr(reference, 'metadata')
            ],
        )
    }


def needs_input(state: ComplaintState) -> dict[str, bool]:
    """Terminal state for reports requiring more user input or review."""

    return {'needs_input': True}


def await_approval(state: ComplaintState) -> dict[str, str]:
    """Placeholder approval node resumed after a human decision."""

    return {'approval': state.get('approval') or 'pending'}


def build_complaint_graph(
    checkpointer: MemorySaver | None = None,
    llm_client: LLMClient | None = None,
    vector_store: VectorStore | None = None,
):
    """Build a checkpointed graph that interrupts before human approval."""

    builder = StateGraph(ComplaintState)
    builder.add_node('classify', lambda state: classify(state, llm_client))
    builder.add_node('resolve_location', lambda state: resolve_location(state, vector_store))
    builder.add_node('write_draft', write_draft)
    builder.add_node('needs_input', needs_input)
    builder.add_node('await_approval', await_approval)
    builder.add_edge(START, 'classify')
    builder.add_conditional_edges(
        'classify',
        route_after_classification,
        {'resolve_location': 'resolve_location', 'needs_input': 'needs_input'},
    )
    builder.add_conditional_edges(
        'resolve_location',
        route_after_resolution,
        {'write_draft': 'write_draft', 'needs_input': 'needs_input'},
    )
    builder.add_edge('write_draft', 'await_approval')
    builder.add_edge('needs_input', END)
    builder.add_edge('await_approval', END)

    return builder.compile(
        checkpointer=checkpointer or MemorySaver(),
        interrupt_before=['await_approval'],
    )


def run_complaint(
    state: ComplaintState,
    *,
    thread_id: str,
    graph=None,
) -> dict[str, object]:
    """Run a complaint until the approval interrupt and return its checkpointed state."""

    compiled_graph = graph or build_complaint_graph()
    return compiled_graph.invoke(state, {'configurable': {'thread_id': thread_id}})
