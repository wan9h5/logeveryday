from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content_json: dict[str, Any] = Field(default_factory=dict)
    search_text: str = ""


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content_json: dict[str, Any] | None = None
    search_text: str | None = None


class DocumentOut(DocumentBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecordCreate(BaseModel):
    record_type: Literal["mood", "bristol", "expense", "image", "daily", "sleep"]
    block_id: str | None = None
    recorded_at: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RecordOut(RecordCreate):
    id: str
    recorded_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ExpenseSummary(BaseModel):
    period: str
    total: Decimal


class MoodCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    color: str = "#F3A86F"
    note: str = ""
    recorded_at: datetime | None = None


class BristolCreate(BaseModel):
    bristol_type: int = Field(ge=1, le=7)
    note: str = ""
    recorded_at: datetime | None = None


class ExpenseCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(min_length=1, max_length=50)
    description: str = ""
    expense_time: datetime | None = None


class DailyStats(BaseModel):
    date: date
    total: Decimal
