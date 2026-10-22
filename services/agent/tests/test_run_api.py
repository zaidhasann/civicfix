from pathlib import Path

from fastapi.testclient import TestClient

from civicfix_agent.main import app, settings
from civicfix_agent.run_service import create_run_service


def test_run_api_rejects_missing_shared_secret() -> None:
    with TestClient(app) as client:
        response = client.post(
            '/run',
            json={
                'photo_url': 'https://example.com/photo.jpg',
                'coords': [18.52, 73.85],
                'description': 'Pothole',
            },
        )

    assert response.status_code == 401


def test_run_api_start_and_status_survive_service_recreation(tmp_path: Path) -> None:
    original_secret = settings.run_secret
    original_db = settings.checkpoint_db
    settings.run_secret = 'test-secret'
    settings.checkpoint_db = str(tmp_path / 'runs.sqlite')
    try:
        with TestClient(app) as client:
            response = client.post(
                '/run',
                headers={'X-Agent-Secret': 'test-secret'},
                json={
                    'photo_url': 'https://example.com/photo.jpg',
                    'coords': [18.52, 73.85],
                    'description': 'Pothole',
                },
            )
            assert response.status_code == 200
            run_id = response.json()['run_id']
            assert client.get(
                f'/runs/{run_id}',
                headers={'X-Agent-Secret': 'test-secret'},
            ).json()['status'] == 'needs_input'

        with create_run_service(settings.checkpoint_db) as service:
            restored = service.get(run_id)
        assert restored['run_id'] == run_id
        assert restored['status'] == 'needs_input'
    finally:
        settings.run_secret = original_secret
        settings.checkpoint_db = original_db
