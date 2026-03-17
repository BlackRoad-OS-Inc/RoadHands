# IMPORTANT: LEGACY V0 CODE - Deprecated since version 1.0.0, scheduled for removal April 1, 2026
# This file is part of the legacy (V0) implementation of OpenHands and will be removed soon as we complete the migration to V1.
# OpenHands V1 uses the Software Agent SDK for the agentic core and runs a new application server. Please refer to:
#   - V1 agentic core (SDK): https://github.com/OpenHands/software-agent-sdk
#   - V1 application server (in this repo): openhands/app_server/
# Unless you are working on deprecation, please avoid extending this legacy file and consult the V1 codepaths above.
# Tag: Legacy-V0
# This module belongs to the old V0 web server. The V1 application server lives under openhands/app_server/.
import os
from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from openhands.core.logger import openhands_logger as logger
from openhands.integrations.provider import (
    PROVIDER_TOKEN_TYPE,
    ProviderType,
)
from openhands.server.dependencies import get_dependencies
from openhands.server.routes.secrets import invalidate_legacy_secrets_store
from openhands.server.settings import (
    GETSettingsModel,
)
from openhands.server.shared import config
from openhands.server.user_auth import (
    get_provider_tokens,
    get_secrets_store,
    get_user_settings,
    get_user_settings_store,
)
from openhands.storage.data_models.settings import Settings
from openhands.storage.secrets.secrets_store import SecretsStore
from openhands.storage.settings.settings_store import SettingsStore
from openhands.utils.llm import get_provider_api_base, is_openhands_model

LITE_LLM_API_URL = os.environ.get(
    'LITE_LLM_API_URL', 'https://llm-proxy.app.all-hands.dev'
)


def _get_sdk_settings_schema() -> dict[str, Any] | None:
    """Return the SDK settings schema when the SDK package is installed.

    Uses ``OpenHandsAgentSettings`` which extends the base SDK
    ``AgentSettings`` with OpenHands-specific sections (e.g. *security*).
    """
    try:
        from openhands.storage.data_models.settings import OpenHandsAgentSettings
    except Exception:
        return None

    return OpenHandsAgentSettings.export_schema().model_dump(mode='json')


def _get_sdk_field_keys(schema: dict[str, Any] | None) -> set[str]:
    if not schema:
        return set()

    return {
        field['key']
        for section in schema.get('sections', [])
        for field in section.get('fields', [])
    }


def _get_sdk_secret_field_keys(schema: dict[str, Any] | None) -> set[str]:
    if not schema:
        return set()

    return {
        field['key']
        for section in schema.get('sections', [])
        for field in section.get('fields', [])
        if field.get('secret')
    }


# Maps dotted SDK keys to the corresponding flat Settings attribute.
# When the user saves a value via the schema-driven UI the dotted key
# lands in ``sdk_settings_values``; this map ensures the same value is
# also written to the legacy flat field so existing consumers (session
# init, security-analyzer setup, etc.) keep working.
_SDK_TO_FLAT_SETTINGS: dict[str, str] = {
    'security.confirmation_mode': 'confirmation_mode',
    'security.security_analyzer': 'security_analyzer',
}


def _extract_sdk_settings_values(
    settings: Settings, schema: dict[str, Any] | None
) -> dict[str, Any]:
    values = dict(settings.sdk_settings_values)

    # Seed dotted keys from flat Settings fields so existing values are
    # visible in the schema-driven UI even if they were never set via the
    # SDK path.  We only fill when the dotted key is absent to avoid
    # overwriting explicit SDK-path values.
    for dotted_key, flat_attr in _SDK_TO_FLAT_SETTINGS.items():
        if dotted_key not in values:
            flat_value = getattr(settings, flat_attr, None)
            if flat_value is not None:
                values[dotted_key] = flat_value

    for field_key in _get_sdk_secret_field_keys(schema):
        values[field_key] = None
    return values


def _apply_settings_payload(
    payload: dict[str, Any],
    existing_settings: Settings | None,
    sdk_schema: dict[str, Any] | None,
) -> Settings:
    settings = existing_settings.model_copy() if existing_settings else Settings()

    sdk_field_keys = _get_sdk_field_keys(sdk_schema)
    secret_field_keys = _get_sdk_secret_field_keys(sdk_schema)
    sdk_settings_values = dict(settings.sdk_settings_values)

    for key, value in payload.items():
        if key in Settings.model_fields:
            setattr(settings, key, value)

        if key in sdk_field_keys and key not in secret_field_keys:
            sdk_settings_values[key] = value

    # Sync dotted SDK security values → flat Settings fields.
    for dotted_key, flat_attr in _SDK_TO_FLAT_SETTINGS.items():
        if dotted_key in sdk_settings_values:
            setattr(settings, flat_attr, sdk_settings_values[dotted_key])

    settings.sdk_settings_values = sdk_settings_values
    return settings


app = APIRouter(prefix='/api', dependencies=get_dependencies())


@app.get(
    '/settings',
    response_model=GETSettingsModel,
    responses={
        404: {'description': 'Settings not found', 'model': dict},
        401: {'description': 'Invalid token', 'model': dict},
    },
)
async def load_settings(
    provider_tokens: PROVIDER_TOKEN_TYPE | None = Depends(get_provider_tokens),
    settings_store: SettingsStore = Depends(get_user_settings_store),
    settings: Settings = Depends(get_user_settings),
    secrets_store: SecretsStore = Depends(get_secrets_store),
) -> GETSettingsModel | JSONResponse:
    try:
        if not settings:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={'error': 'Settings not found'},
            )

        # On initial load, user secrets may not be populated with values migrated from settings store
        user_secrets = await invalidate_legacy_secrets_store(
            settings, settings_store, secrets_store
        )

        # If invalidation is successful, then the returned user secrets holds the most recent values
        git_providers = (
            user_secrets.provider_tokens if user_secrets else provider_tokens
        )

        provider_tokens_set: dict[ProviderType, str | None] = {}
        if git_providers:
            for provider_type, provider_token in git_providers.items():
                if provider_token.token or provider_token.user_id:
                    provider_tokens_set[provider_type] = provider_token.host

        sdk_settings_schema = _get_sdk_settings_schema()
        settings_with_token_data = GETSettingsModel(
            **settings.model_dump(exclude={'secrets_store', 'sdk_settings_values'}),
            llm_api_key_set=settings.llm_api_key is not None
            and bool(settings.llm_api_key),
            search_api_key_set=settings.search_api_key is not None
            and bool(settings.search_api_key),
            provider_tokens_set=provider_tokens_set,
            sdk_settings_schema=sdk_settings_schema,
            sdk_settings_values=_extract_sdk_settings_values(
                settings, sdk_settings_schema
            ),
        )

        # If the base url matches the default for the provider, we don't send it
        # So that the frontend can display basic mode
        if is_openhands_model(settings.llm_model):
            if settings.llm_base_url == LITE_LLM_API_URL:
                settings_with_token_data.llm_base_url = None
        elif settings.llm_model and settings.llm_base_url == get_provider_api_base(
            settings.llm_model
        ):
            settings_with_token_data.llm_base_url = None

        settings_with_token_data.sdk_settings_values['llm.base_url'] = (
            settings_with_token_data.llm_base_url
        )

        settings_with_token_data.llm_api_key = None
        settings_with_token_data.search_api_key = None
        settings_with_token_data.sandbox_api_key = None
        return settings_with_token_data
    except Exception as e:
        logger.warning(f'Invalid token: {e}')
        # Get user_id from settings if available
        user_id = getattr(settings, 'user_id', 'unknown') if settings else 'unknown'
        logger.info(
            f'Returning 401 Unauthorized - Invalid token for user_id: {user_id}'
        )
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={'error': 'Invalid token'},
        )


async def store_llm_settings(
    settings: Settings, existing_settings: Settings
) -> Settings:
    # Convert to Settings model and merge with existing settings
    if existing_settings:
        # Keep existing LLM settings if not provided
        if settings.llm_api_key is None:
            settings.llm_api_key = existing_settings.llm_api_key
        if settings.llm_model is None:
            settings.llm_model = existing_settings.llm_model
        # if llm_base_url is missing or empty, try to preserve existing or determine appropriate URL
        if not settings.llm_base_url:
            if settings.llm_base_url is None and existing_settings.llm_base_url:
                # Not provided at all (e.g. MCP config save) - preserve existing
                settings.llm_base_url = existing_settings.llm_base_url
            elif is_openhands_model(settings.llm_model):
                # OpenHands models use the LiteLLM proxy
                settings.llm_base_url = LITE_LLM_API_URL
            elif settings.llm_model:
                # For non-openhands models, try to get URL from litellm
                try:
                    api_base = get_provider_api_base(settings.llm_model)
                    if api_base:
                        settings.llm_base_url = api_base
                    else:
                        logger.debug(
                            f'No api_base found in litellm for model: {settings.llm_model}'
                        )
                except Exception as e:
                    logger.error(
                        f'Failed to get api_base from litellm for model {settings.llm_model}: {e}'
                    )
        # Keep search API key if missing or empty
        if not settings.search_api_key:
            settings.search_api_key = existing_settings.search_api_key

    return settings


# NOTE: We use response_model=None for endpoints that return JSONResponse directly.
# This is because FastAPI's response_model expects a Pydantic model, but we're returning
# a response object directly. We document the possible responses using the 'responses'
# parameter and maintain proper type annotations for mypy.
@app.post(
    '/settings',
    response_model=None,
    responses={
        200: {'description': 'Settings stored successfully', 'model': dict},
        500: {'description': 'Error storing settings', 'model': dict},
    },
)
async def store_settings(
    payload: dict[str, Any],
    settings_store: SettingsStore = Depends(get_user_settings_store),
) -> JSONResponse:
    # Check provider tokens are valid
    try:
        existing_settings = await settings_store.load()
        sdk_settings_schema = _get_sdk_settings_schema()
        settings = _apply_settings_payload(
            payload, existing_settings, sdk_settings_schema
        )

        if existing_settings:
            settings = await store_llm_settings(settings, existing_settings)

            # Keep existing analytics consent if not provided
            if settings.user_consents_to_analytics is None:
                settings.user_consents_to_analytics = (
                    existing_settings.user_consents_to_analytics
                )

        # Update sandbox config with new settings
        if settings.remote_runtime_resource_factor is not None:
            config.sandbox.remote_runtime_resource_factor = (
                settings.remote_runtime_resource_factor
            )

        # Update git configuration with new settings
        git_config_updated = False
        if settings.git_user_name is not None:
            config.git_user_name = settings.git_user_name
            git_config_updated = True
        if settings.git_user_email is not None:
            config.git_user_email = settings.git_user_email
            git_config_updated = True

        # Note: Git configuration will be applied when new sessions are initialized
        # Existing sessions will continue with their current git configuration
        if git_config_updated:
            logger.info(
                f'Updated global git configuration: name={config.git_user_name}, email={config.git_user_email}'
            )

        await settings_store.store(settings)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={'message': 'Settings stored'},
        )
    except Exception as e:
        logger.warning(f'Something went wrong storing settings: {e}')
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={'error': 'Something went wrong storing settings'},
        )
