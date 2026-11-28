from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import Block, BristolRecord, Document, Expense, Image, Mood, Record, User

router = APIRouter(prefix="/api/backup")
USER_ID = "demo-user"
Identifier = Annotated[str, Field(min_length=1, max_length=36)]


class BackupRow(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: Identifier


class BackupDocument(BackupRow):
    title: str = Field(min_length=1, max_length=255)
    content_json: dict[str, Any]
    search_text: str
    created_at: datetime
    updated_at: datetime


class BackupBlock(BackupRow):
    document_id: Identifier
    block_type: str = Field(max_length=50)
    position: int
    config: dict[str, Any]
    created_at: datetime


class BackupRecord(BackupRow):
    block_id: Identifier | None
    record_type: str = Field(max_length=50)
    recorded_at: datetime
    payload: dict[str, Any]


class BackupExpense(BackupRow):
    amount: Decimal = Field(max_digits=12, decimal_places=2)
    category: str = Field(max_length=50)
    description: str = Field(max_length=255)
    expense_time: datetime


class BackupMood(BackupRow):
    score: int
    color: str = Field(max_length=20)
    note: str = Field(max_length=255)
    recorded_at: datetime


class BackupBristol(BackupRow):
    bristol_type: int
    note: str = Field(max_length=255)
    recorded_at: datetime


class BackupImage(BackupRow):
    url: str = Field(max_length=500)
    filename: str = Field(max_length=255)
    size: int
    width: int | None
    height: int | None
    created_at: datetime


class JournalBackup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["modular-life-journal"]
    version: Literal[1]
    exported_at: datetime
    documents: list[BackupDocument]
    blocks: list[BackupBlock]
    records: list[BackupRecord]
    expenses: list[BackupExpense]
    moods: list[BackupMood]
    bristol_records: list[BackupBristol]
    images: list[BackupImage]


TABLES = (
    ("documents", Document, BackupDocument),
    ("blocks", Block, BackupBlock),
    ("records", Record, BackupRecord),
    ("expenses", Expense, BackupExpense),
    ("moods", Mood, BackupMood),
    ("bristol_records", BristolRecord, BackupBristol),
    ("images", Image, BackupImage),
)


def owned(model):
    if model is Block:
        return select(Block).join(Document).where(Document.user_id == USER_ID)
    return select(model).where(model.user_id == USER_ID)


@router.get("", response_model=JournalBackup)
def export_backup(db: Session = Depends(get_db)):
    exported = {}
    for key, model, schema in TABLES:
        exported[key] = [schema.model_validate(row) for row in db.scalars(owned(model).order_by(model.id))]
    block_ids = {row.id for row in exported["blocks"]}
    for record in exported["records"]:
        if record.block_id not in block_ids:
            record.block_id = None
    return JournalBackup(format="modular-life-journal", version=1, exported_at=datetime.now(timezone.utc), **exported)


def owned_ids(db: Session, model, identifiers: set[str]) -> set[str]:
    values = sorted(identifiers)
    query = owned(model).with_only_columns(model.id, maintain_column_froms=True)
    found = set()
    for offset in range(0, len(values), 500):
        found.update(db.scalars(query.where(model.id.in_(values[offset:offset + 500]))))
    return found


@router.post("/restore")
def restore_backup(backup: JournalBackup, db: Session = Depends(get_db)):
    # Serialize restore attempts for this account so re-imports skip existing IDs.
    db.execute(select(User.id).where(User.id == USER_ID).with_for_update()).scalar_one()
    results = {}
    try:
        for key, model, _ in TABLES:
            rows = getattr(backup, key)
            ids = {row.id for row in rows}
            if len(ids) != len(rows):
                raise HTTPException(422, f"Duplicate identifiers in {key}")
            existing = owned_ids(db, model, ids)
            new_rows = [row for row in rows if row.id not in existing]

            if model is Block:
                references = {row.document_id for row in new_rows}
                if references != owned_ids(db, Document, references):
                    raise HTTPException(422, "A block refers to a missing document")
            if model is Record:
                references = {row.block_id for row in new_rows if row.block_id is not None}
                if references != owned_ids(db, Block, references):
                    raise HTTPException(422, "A record refers to a missing block")

            for row in new_rows:
                values = row.model_dump()
                for name, value in values.items():
                    if isinstance(value, datetime) and value.tzinfo is not None:
                        values[name] = value.astimezone(timezone.utc).replace(tzinfo=None)
                if model is not Block:
                    values["user_id"] = USER_ID
                db.add(model(**values))
            db.flush()
            results[key] = {"added": len(new_rows), "skipped": len(existing)}
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Backup conflicts with data already present") from error
    except HTTPException:
        db.rollback()
        raise
    return results
