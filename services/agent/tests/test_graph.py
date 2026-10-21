from civicfix_agent.graph import build_complaint_graph, run_complaint


def test_graph_runs_until_approval_interrupt() -> None:
    graph = build_complaint_graph()

    state = run_complaint(
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'A pothole is blocking the lane.',
        },
        thread_id='test-complaint',
        graph=graph,
    )

    assert state['classification'].issue_type == 'other'
    assert state['jurisdiction'] == 'unresolved'
    assert state['draft'] == 'A pothole is blocking the lane.'
    assert state.get('approval') is None

    snapshot = graph.get_state({'configurable': {'thread_id': 'test-complaint'}})
    assert snapshot.next == ('await_approval',)
