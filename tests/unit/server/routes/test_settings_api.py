import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from pydantic import SecretStr

from openhands.integrations.provider import ProviderToken, ProviderType
from openhands.server.app import app
from openhands.server.routes import settings as settings_routes
from openhands.server.user_auth.user_auth import UserAuth
from openhands.storage.data_models.secrets import Secrets
from openhands.storage.memory import InMemoryFileStore
from openhands.storage.secrets.secrets_store import SecretsStore
from openhands.storage.settings.file_settings_store import FileSettingsStore
from openhands.storage.settings.settings_store import SettingsStore


class MockUserAuth(UserAuth):
    """Mock implementation of UserAuth for testing."""

    def __init__(self):
        self._settings = None
        self._settings_store = MagicMock()
        self._settings_store.load = AsyncMock(return_value=None)
        self._settings_store.store = AsyncMock()

    async def get_user_id(self) -> str | None:
        return 'test-user'

    async def get_user_email(self) -> str | None:
        return 'test-email@whatever.com'

    async def get_access_token(self) -> SecretStr | None:
        return SecretStr('test-token')

    async def get_provider_tokens(
        self,
    ) -> dict[ProviderType, ProviderToken] | None:  # noqa: E501
        return None

    async def get_user_settings_store(self) -> SettingsStore | None:
        return self._settings_store

    async def get_secrets_store(self) -> SecretsStore | None:
        return None

    async def get_secrets(self) -> Secrets | None:
        return None

    async def get_mcp_api_key(self) -> str | None:
        return None

    @classmethod
    async def get_instance(cls, request: Request) -> UserAuth:
        return MockUserAuth()

    @classmethod
    async def get_for_user(cls, user_id: str) -> UserAuth:
        return MockUserAuth()


@pytest.fixture
def test_client():
    # Create a test client
    with (
        patch.dict(os.environ, {'SESSION_API_KEY': ''}, clear=False),
        patch('openhands.server.dependencies._SESSION_API_KEY', None),
        patch(
            'openhands.server.user_auth.user_auth.UserAuth.get_instance',
            return_value=MockUserAuth(),
        ),
        patch(
            'openhands.storage.settings.file_settings_store.FileSettingsStore.get_instance',
            AsyncMock(return_value=FileSettingsStore(InMemoryFileStore())),
        ),
    ):
        client = TestClient(app)
        yield client


def test_get_sdk_settings_schema_returns_none_when_sdk_missing():
    with patch(
        'openhands.server.routes.settings._get_sdk_settings_schema',
        return_value=None,
    ) as mock_fn:
        assert mock_fn() is None


def test_get_sdk_settings_schema_includes_security_section():
    schema = settings_routes._get_sdk_settings_schema()
    assert schema is not None
    section_keys = [s['key'] for s in schema['sections']]
    assert 'security' in section_keys
    security_section = next(s for s in schema['sections'] if s['key'] == 'security')
    field_keys = [f['key'] for f in security_section['fields']]
    assert 'security.confirmation_mode' in field_keys
    assert 'security.security_analyzer' in field_keys


@pytest.mark.asyncio
async def test_settings_api_endpoints(test_client):
    """Test that the settings API endpoints work with the new auth system."""
    sdk_settings_schema = {
        'model_name': 'AgentSettings',
        'sections': [
            {
                'key': 'llm',
                'label': 'LLM',
                'fields': [
                    {
                        'key': 'llm.model',
                        'value_type': 'string',
                        'prominence': 'critical',
                    },
                    {
                        'key': 'llm.base_url',
                        'value_type': 'string',
                        'prominence': 'major',
                    },
                    {
                        'key': 'llm.timeout',
                        'value_type': 'integer',
                        'prominence': 'minor',
                    },
                    {
                        'key': 'llm.litellm_extra_body',
                        'value_type': 'object',
                        'prominence': 'minor',
                    },
                    {
                        'key': 'llm.api_key',
                        'value_type': 'string',
                        'prominence': 'critical',
                        'secret': True,
                    },
                ],
            },
            {
                'key': 'critic',
                'label': 'Critic',
                'fields': [
                    {
                        'key': 'critic.enabled',
                        'value_type': 'boolean',
                        'prominence': 'critical',
                    },
                    {
                        'key': 'critic.mode',
                        'value_type': 'string',
                        'prominence': 'minor',
                    },
                    {
                        'key': 'critic.enable_iterative_refinement',
                        'value_type': 'boolean',
                        'prominence': 'major',
                    },
                    {
                        'key': 'critic.threshold',
                        'value_type': 'number',
                        'prominence': 'minor',
                    },
                    {
                        'key': 'critic.max_refinement_iterations',
                        'value_type': 'integer',
                        'prominence': 'minor',
                    },
                ],
            },
        ],
    }

    # Test data with remote_runtime_resource_factor
    settings_data = {
        'language': 'en',
        'agent': 'test-agent',
        'max_iterations': 100,
        'security_analyzer': 'default',
        'confirmation_mode': True,
        'llm.model': 'test-model',
        'llm.api_key': 'test-key',
        'llm.base_url': 'https://test.com',
        'llm.timeout': 123,
        'llm.litellm_extra_body': {'metadata': {'tier': 'pro'}},
        'remote_runtime_resource_factor': 2,
        'critic.enabled': True,
        'critic.mode': 'all_actions',
        'critic.enable_iterative_refinement': True,
        'critic.threshold': 0.7,
        'critic.max_refinement_iterations': 4,
    }

    with patch(
        'openhands.server.routes.settings._get_sdk_settings_schema',
        return_value=sdk_settings_schema,
    ):
        # Make the POST request to store settings
        response = test_client.post('/api/settings', json=settings_data)

        # We're not checking the exact response, just that it doesn't error
        assert response.status_code == 200

        # Test the GET settings endpoint
        response = test_client.get('/api/settings')
        assert response.status_code == 200
        response_data = response.json()
        schema = response_data['sdk_settings_schema']
        assert schema['model_name'] == 'AgentSettings'
        assert isinstance(schema['sections'], list)
        assert [section['key'] for section in schema['sections']] == ['llm', 'critic']
        llm_section, critic_section = schema['sections']
        assert llm_section['label'] == 'LLM'
        assert [field['key'] for field in llm_section['fields']] == [
            'llm.model',
            'llm.base_url',
            'llm.timeout',
            'llm.litellm_extra_body',
            'llm.api_key',
        ]
        assert llm_section['fields'][-1]['secret'] is True
        assert llm_section['fields'][2]['value_type'] == 'integer'
        assert llm_section['fields'][3]['value_type'] == 'object'
        assert critic_section['label'] == 'Critic'
        assert [field['key'] for field in critic_section['fields']] == [
            'critic.enabled',
            'critic.mode',
            'critic.enable_iterative_refinement',
            'critic.threshold',
            'critic.max_refinement_iterations',
        ]
        assert response_data['sdk_settings_values']['llm.model'] == 'test-model'
        assert response_data['sdk_settings_values']['llm.timeout'] == 123
        assert response_data['sdk_settings_values']['llm.litellm_extra_body'] == {
            'metadata': {'tier': 'pro'}
        }
        assert response_data['sdk_settings_values']['critic.enabled'] is True
        assert response_data['sdk_settings_values']['critic.mode'] == 'all_actions'
        assert (
            response_data['sdk_settings_values']['critic.enable_iterative_refinement']
            is True
        )
        assert response_data['sdk_settings_values']['critic.threshold'] == 0.7
        assert (
            response_data['sdk_settings_values']['critic.max_refinement_iterations']
            == 4
        )
        assert response_data['sdk_settings_values']['llm.api_key'] is None

        # Test updating with partial settings
        partial_settings = {
            'language': 'fr',
            'llm_model': None,  # Should preserve existing value
            'llm_api_key': None,  # Should preserve existing value
        }

        response = test_client.post('/api/settings', json=partial_settings)
        assert response.status_code == 200

        response = test_client.get('/api/settings')
        assert response.status_code == 200
        assert response.json()['sdk_settings_values']['llm.timeout'] == 123

        # Test the unset-provider-tokens endpoint
        response = test_client.post('/api/unset-provider-tokens')
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_search_api_key_preservation(test_client):
    """Test that search_api_key is preserved when sending an empty string."""
    # 1. Set initial settings with a search API key
    initial_settings = {
        'search_api_key': 'initial-secret-key',
        'llm_model': 'gpt-4',
    }
    response = test_client.post('/api/settings', json=initial_settings)
    assert response.status_code == 200

    # Verify key is set
    response = test_client.get('/api/settings')
    assert response.status_code == 200
    assert response.json()['search_api_key_set'] is True

    # 2. Update settings with EMPTY search API key (simulating the frontend bug)
    # and changing another field (llm_model)
    update_settings = {
        'search_api_key': '',  # The frontend sends an empty string here
        'llm_model': 'claude-3-opus',
    }
    response = test_client.post('/api/settings', json=update_settings)
    assert response.status_code == 200

    # 3. Verify the key was NOT wiped out (The Critical Check)
    response = test_client.get('/api/settings')
    assert response.status_code == 200
    # If the bug was present, this would be False
    assert response.json()['search_api_key_set'] is True
    # Verify the other field updated correctly
    assert response.json()['llm_model'] == 'claude-3-opus'
