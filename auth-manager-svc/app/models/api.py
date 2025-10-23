"""Unified API response models."""

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: str = Field(..., description="Human-readable error message")
    code: str = Field(..., description="Machine-readable error code")
    reason: Optional[str] = Field(default=None, description="Additional error reason or context")


class SuccessResponse(BaseModel, Generic[T]):
    """Standard success response wrapper."""

    data: T = Field(..., description="Response data")
