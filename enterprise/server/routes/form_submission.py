"""Form submission API routes.

Handles form submissions for enterprise lead capture and other form types.
Supports both authenticated and unauthenticated submissions.
"""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, ValidationError
from server.auth.saas_user_auth import SaasUserAuth
from storage.database import a_session_maker
from storage.form_submission import FormSubmission

from openhands.core.logger import openhands_logger as logger
from openhands.server.user_auth.user_auth import UserAuth

router = APIRouter(prefix="/api/v1/forms", tags=["forms"])


class FormSubmissionRequest(BaseModel):
    """Request model for form submission."""

    form_type: str = Field(
        ..., max_length=50, description="Type of form being submitted"
    )
    answers: dict[str, Any] = Field(..., description="Form answers as key-value pairs")


class FormSubmissionResponse(BaseModel):
    """Response model for successful form submission."""

    id: str
    status: str
    created_at: datetime


class EnterpriseLeadAnswers(BaseModel):
    """Validation model for enterprise lead form answers."""

    request_type: str = Field(..., pattern="^(saas|self-hosted)$")
    name: str = Field(..., min_length=1, max_length=255)
    company: str = Field(..., min_length=1, max_length=255)
    email: EmailStr = Field(..., max_length=255)
    message: str = Field(..., min_length=1, max_length=5000)


def _get_user_id_from_request(request: Request) -> UUID | None:
    """Extract user ID from request if authenticated.

    Returns None for unauthenticated requests.
    """
    user_auth: UserAuth | None = getattr(request.state, "user_auth", None)
    if user_auth is None:
        return None

    if isinstance(user_auth, SaasUserAuth):
        user_id = user_auth.user_id
        if user_id:
            try:
                return UUID(user_id)
            except ValueError:
                logger.warning(f"Invalid user_id format: {user_id}")
                return None
    return None


def _validate_enterprise_lead_answers(answers: dict[str, Any]) -> None:
    """Validate answers for enterprise_lead form type."""
    try:
        EnterpriseLeadAnswers(**answers)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid enterprise lead form answers: {str(e)}",
        )


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_form(
    request: Request,
    submission: FormSubmissionRequest,
) -> FormSubmissionResponse:
    """Submit a form.

    This endpoint accepts form submissions for various form types.
    Works for both authenticated and unauthenticated users.

    For enterprise_lead forms, validates that answers contain:
    - request_type: 'saas' or 'self-hosted'
    - name: submitter's name
    - company: company name
    - email: contact email
    - message: inquiry message
    """
    # Validate form type
    valid_form_types = {"enterprise_lead"}
    if submission.form_type not in valid_form_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid form_type. Must be one of: {', '.join(valid_form_types)}",
        )

    # Validate answers based on form type
    if submission.form_type == "enterprise_lead":
        _validate_enterprise_lead_answers(submission.answers)

    # Get user ID if authenticated (optional)
    user_id = _get_user_id_from_request(request)

    # Create submission record
    submission_id = uuid4()
    new_submission = FormSubmission(
        id=submission_id,
        form_type=submission.form_type,
        answers=submission.answers,
        status="pending",
        user_id=user_id,
    )

    # Save to database
    async with a_session_maker() as session:
        session.add(new_submission)
        await session.commit()
        await session.refresh(new_submission)

    logger.info(
        "form_submission_created",
        extra={
            "submission_id": str(submission_id),
            "form_type": submission.form_type,
            "user_id": str(user_id) if user_id else None,
        },
    )

    return FormSubmissionResponse(
        id=str(new_submission.id),
        status=new_submission.status,
        created_at=new_submission.created_at,
    )
