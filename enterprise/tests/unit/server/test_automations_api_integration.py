"""Integration tests for automation CRUD API using a real in-memory SQLite database.

These tests exercise actual SQL queries (list, get, create+verify, pagination, delete)
rather than mocking the database layer.
"""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from server.routes.automations import automation_router
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from storage.automation import Automation, AutomationRun

from openhands.app_server.utils.sql_utils import Base
from openhands.server.user_auth import get_user_id

TEST_USER_ID = 'integration-test-user'
OTHER_USER_ID = 'other-user'


@pytest.fixture
async def db_engine():
    engine = create_async_engine('sqlite+aiosqlite://', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
def session_maker(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
def app(session_maker):
    """FastAPI app wired to a real SQLite database."""
    app = FastAPI()
    app.include_router(automation_router)
    app.dependency_overrides[get_user_id] = lambda: TEST_USER_ID

    @asynccontextmanager
    async def _session_ctx():
        async with session_maker() as session:
            yield session

    with patch('server.routes.automations.a_session_maker', _session_ctx):
        yield app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as c:
        yield c


def _make_automation_obj(
    user_id: str = TEST_USER_ID,
    name: str = 'Test Auto',
    created_at: datetime | None = None,
    **kwargs,
) -> Automation:
    return Automation(
        id=kwargs.get('automation_id', uuid.uuid4().hex),
        user_id=user_id,
        name=name,
        enabled=kwargs.get('enabled', True),
        config=kwargs.get(
            'config',
            {
                'name': name,
                'triggers': {'cron': {'schedule': '0 9 * * 5', 'timezone': 'UTC'}},
                'prompt': 'Do something',
            },
        ),
        trigger_type='cron',
        file_store_key=kwargs.get('file_store_key', f'automations/{uuid.uuid4().hex}/automation.py'),
        created_at=created_at or datetime.now(UTC),
        updated_at=created_at or datetime.now(UTC),
    )


# ---------- Test: list (search) returns correct results ----------


@pytest.mark.asyncio
async def test_search_returns_user_automations(client, session_maker):
    """GET /search returns only automations owned by the requesting user."""
    async with session_maker() as session:
        a1 = _make_automation_obj(name='Auto A', created_at=datetime(2026, 1, 1, tzinfo=UTC))
        a2 = _make_automation_obj(name='Auto B', created_at=datetime(2026, 1, 2, tzinfo=UTC))
        a_other = _make_automation_obj(user_id=OTHER_USER_ID, name='Other User Auto')
        session.add_all([a1, a2, a_other])
        await session.commit()

    response = await client.get('/api/v1/automations/search')
    assert response.status_code == 200
    data = response.json()
    assert data['total'] == 2
    assert len(data['items']) == 2
    names = {item['name'] for item in data['items']}
    assert names == {'Auto A', 'Auto B'}


# ---------- Test: get returns the right object ----------


@pytest.mark.asyncio
async def test_get_returns_correct_automation(client, session_maker):
    """GET /{id} returns the correct automation by ID."""
    auto_id = uuid.uuid4().hex
    async with session_maker() as session:
        auto = _make_automation_obj(automation_id=auto_id, name='Specific Auto')
        session.add(auto)
        await session.commit()

    response = await client.get(f'/api/v1/automations/{auto_id}')
    assert response.status_code == 200
    data = response.json()
    assert data['id'] == auto_id
    assert data['name'] == 'Specific Auto'


@pytest.mark.asyncio
async def test_get_nonexistent_returns_404(client):
    """GET /{id} for non-existent automation returns 404."""
    response = await client.get('/api/v1/automations/does-not-exist')
    assert response.status_code == 404


# ---------- Test: create + verify in DB ----------


@pytest.mark.asyncio
async def test_create_stores_in_db(client, session_maker):
    """POST creates an automation and it's readable from the database."""
    mock_file_store = MagicMock()
    config = {
        'name': 'New Auto',
        'triggers': {'cron': {'schedule': '0 9 * * 5', 'timezone': 'UTC'}},
    }

    with (
        patch(
            'server.routes.automations.generate_automation_file',
            return_value='__config__ = {}',
        ),
        patch('server.routes.automations.extract_config', return_value=config),
        patch('server.routes.automations.validate_config'),
        patch('server.routes.automations.file_store', mock_file_store),
    ):
        response = await client.post(
            '/api/v1/automations',
            json={
                'name': 'New Auto',
                'schedule': '0 9 * * 5',
                'prompt': 'Summarize PRs',
            },
        )

    assert response.status_code == 201
    data = response.json()
    created_id = data['id']

    # Verify it's in the DB via the GET endpoint
    get_response = await client.get(f'/api/v1/automations/{created_id}')
    assert get_response.status_code == 200
    assert get_response.json()['name'] == 'New Auto'
    # Verify prompt is stored in config
    assert get_response.json()['config'].get('prompt') == 'Summarize PRs'


# ---------- Test: delete actually deletes ----------


@pytest.mark.asyncio
async def test_delete_removes_from_db(client, session_maker):
    """DELETE removes the automation from the database."""
    auto_id = uuid.uuid4().hex
    async with session_maker() as session:
        auto = _make_automation_obj(automation_id=auto_id, name='To Delete')
        session.add(auto)
        await session.commit()

    mock_file_store = MagicMock()
    with patch('server.routes.automations.file_store', mock_file_store):
        response = await client.delete(f'/api/v1/automations/{auto_id}')
    assert response.status_code == 204

    # Verify it's gone
    get_response = await client.get(f'/api/v1/automations/{auto_id}')
    assert get_response.status_code == 404


# ---------- Test: pagination actually works ----------


@pytest.mark.asyncio
async def test_pagination_returns_correct_pages(client, session_maker):
    """Pagination with limit returns correct page sizes and next_page_id."""
    base_time = datetime(2026, 1, 1, tzinfo=UTC)
    async with session_maker() as session:
        for i in range(5):
            auto = _make_automation_obj(
                name=f'Auto {i}',
                created_at=base_time + timedelta(hours=i),
            )
            session.add(auto)
        await session.commit()

    # First page with limit=2
    response = await client.get('/api/v1/automations/search?limit=2')
    assert response.status_code == 200
    data = response.json()
    assert data['total'] == 5
    assert len(data['items']) == 2
    assert data['next_page_id'] is not None

    # Second page using cursor — should return remaining items before cursor
    next_id = data['next_page_id']
    response2 = await client.get(f'/api/v1/automations/search?limit=2&page_id={next_id}')
    assert response2.status_code == 200
    data2 = response2.json()
    assert len(data2['items']) == 2

    # Collect all items from both pages and verify no duplicates
    all_ids = [item['id'] for item in data['items']] + [
        item['id'] for item in data2['items']
    ]
    assert len(all_ids) == len(set(all_ids)), 'Pages must not contain duplicate items'


# ---------- Test: user isolation at DB level ----------


@pytest.mark.asyncio
async def test_user_isolation(client, session_maker):
    """User A cannot see or access User B's automations via actual DB queries."""
    auto_id = uuid.uuid4().hex
    async with session_maker() as session:
        other_auto = _make_automation_obj(
            automation_id=auto_id,
            user_id=OTHER_USER_ID,
            name='Other User Auto',
        )
        session.add(other_auto)
        await session.commit()

    # Should not be found by TEST_USER_ID
    response = await client.get(f'/api/v1/automations/{auto_id}')
    assert response.status_code == 404

    # Should not appear in search
    search_response = await client.get('/api/v1/automations/search')
    assert search_response.status_code == 200
    assert search_response.json()['total'] == 0
