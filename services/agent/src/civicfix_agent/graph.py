from typing import NotRequired, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph


class ComplaintState(TypedDict):
    """State carried through the complaint processing graph."""

    photo_url: str
    coords: tuple[float, float]
    description: str
    classification: NotRequired[str | None]
    jurisdiction: NotRequired[str | None]
    draft: NotRequired[str | None]
    approval: NotRequired[str | None]


def classify(state: ComplaintState) -> dict[str, str]:
    """Placeholder classifier until the agent model is connected."""

    return {'classification': 'other'}


def resolve_location(state: ComplaintState) -> dict[str, str]:
    """Placeholder jurisdiction resolver based on the submitted coordinates."""

    return {'jurisdiction': 'unresolved'}


def write_draft(state: ComplaintState) -> dict[str, str]:
    """Placeholder draft writer until the agent model is connected."""

    return {'draft': state['description']}


def await_approval(state: ComplaintState) -> dict[str, str]:
    """Placeholder approval node resumed after a human decision."""

    return {'approval': state.get('approval') or 'pending'}


def build_complaint_graph(checkpointer: MemorySaver | None = None):
    """Build a checkpointed graph that interrupts before human approval."""

    builder = StateGraph(ComplaintState)
    builder.add_node('classify', classify)
    builder.add_node('resolve_location', resolve_location)
    builder.add_node('write_draft', write_draft)
    builder.add_node('await_approval', await_approval)
    builder.add_edge(START, 'classify')
    builder.add_edge('classify', 'resolve_location')
    builder.add_edge('resolve_location', 'write_draft')
    builder.add_edge('write_draft', 'await_approval')
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
