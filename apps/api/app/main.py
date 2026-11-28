from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .insights import JOURNAL_ZONE, JournalStats, Period, as_utc_boundary, local_day, period_bounds
from .models import BristolRecord, Document, Expense, Mood, Record, User
from .schemas import BristolCreate, DocumentCreate, DocumentOut, DocumentUpdate, ExpenseCreate, MoodCreate, RecordCreate, RecordOut

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    # Development convenience; production should run Alembic migrations.
    Base.metadata.create_all(bind=engine)
    with next(get_db()) as db:
        if not db.get(User, "demo-user"):
            db.add(User(id="demo-user", email="demo@example.com", password_hash="development-only"))
            db.commit()


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok", "database": "connected", "service": "modular-life-journal-api"}


@app.get("/api/documents", response_model=list[DocumentOut])
def list_documents(search: str | None = Query(default=None), db: Session = Depends(get_db)):
    query = select(Document).order_by(Document.updated_at.desc())
    if search:
        query = query.where(Document.search_text.ilike(f"%{search}%"))
    return db.scalars(query).all()


@app.get("/api/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@app.post("/api/documents", response_model=DocumentOut, status_code=201)
def create_document(payload: DocumentCreate, db: Session = Depends(get_db)):
    document = Document(title=payload.title, content_json=payload.content_json, search_text=payload.search_text)
    # Authentication is intentionally stubbed in MVP; replace with current_user.
    document.user_id = "demo-user"
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@app.patch("/api/documents/{document_id}", response_model=DocumentOut)
def update_document(document_id: str, payload: DocumentUpdate, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(document, key, value)
    db.commit()
    db.refresh(document)
    return document


@app.delete("/api/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(document)
    db.commit()


@app.get("/api/records", response_model=list[RecordOut])
def list_records(record_type: str | None = None, db: Session = Depends(get_db)):
    query = select(Record).order_by(Record.recorded_at.desc())
    if record_type:
        query = query.where(Record.record_type == record_type)
    return db.scalars(query).all()


@app.post("/api/records", response_model=RecordOut, status_code=201)
def create_record(payload: RecordCreate, db: Session = Depends(get_db)):
    record = Record(
        user_id="demo-user",
        block_id=payload.block_id,
        record_type=payload.record_type,
        recorded_at=payload.recorded_at or datetime.utcnow(),
        payload=payload.payload,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.post("/api/moods", status_code=201)
def create_mood(payload: MoodCreate, db: Session = Depends(get_db)):
    mood = Mood(user_id="demo-user", score=payload.score, color=payload.color, note=payload.note, recorded_at=payload.recorded_at or datetime.utcnow())
    db.add(mood)
    db.commit()
    db.refresh(mood)
    return mood


@app.get("/api/moods")
def list_moods(limit: int = Query(default=30, le=100), db: Session = Depends(get_db)):
    return db.scalars(select(Mood).where(Mood.user_id == "demo-user").order_by(Mood.recorded_at.desc()).limit(limit)).all()


@app.post("/api/bristol", status_code=201)
def create_bristol(payload: BristolCreate, db: Session = Depends(get_db)):
    record = BristolRecord(user_id="demo-user", bristol_type=payload.bristol_type, note=payload.note, recorded_at=payload.recorded_at or datetime.utcnow())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/bristol")
def list_bristol(limit: int = Query(default=30, le=100), db: Session = Depends(get_db)):
    return db.scalars(select(BristolRecord).where(BristolRecord.user_id == "demo-user").order_by(BristolRecord.recorded_at.desc()).limit(limit)).all()


@app.post("/api/expenses", status_code=201)
def create_expense(payload: ExpenseCreate, db: Session = Depends(get_db)):
    expense = Expense(user_id="demo-user", amount=payload.amount, category=payload.category, description=payload.description, expense_time=payload.expense_time or datetime.utcnow())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@app.get("/api/expenses")
def list_expenses(limit: int = Query(default=100, le=500), db: Session = Depends(get_db)):
    return db.scalars(select(Expense).where(Expense.user_id == "demo-user").order_by(Expense.expense_time.desc()).limit(limit)).all()


@app.get("/api/insights/expenses")
def expense_insights(period: str = Query(default="month"), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total = db.scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.user_id == "demo-user", Expense.expense_time >= start)) or Decimal("0")
    rows = db.execute(select(Expense.category, func.sum(Expense.amount)).where(Expense.user_id == "demo-user", Expense.expense_time >= start).group_by(Expense.category)).all()
    return {"period": period, "total": total, "currency": "CNY", "by_category": [{"category": category, "total": amount} for category, amount in rows]}


@app.get("/api/insights/journal")
def journal_insights(
    period: Period = "month",
    anchor: date | None = None,
    db: Session = Depends(get_db),
):
    try:
        start, end = period_bounds(period, anchor or datetime.now(JOURNAL_ZONE).date())
        start_utc, end_utc = as_utc_boundary(start), as_utc_boundary(end)
    except (OverflowError, ValueError):
        raise HTTPException(status_code=422, detail="Date is outside the supported range") from None
    stats = JournalStats(period, start, end)
    user_id = "demo-user"
    documents = select(Document.content_json).where(Document.user_id == user_id)
    for content in db.scalars(documents.execution_options(yield_per=32)):
        stats.add_document(content)

    expenses = select(Expense.amount, Expense.category, Expense.description, Expense.expense_time).where(
        Expense.user_id == user_id, Expense.expense_time >= start_utc, Expense.expense_time < end_utc,
    )
    for amount, category, description, stamp in db.execute(expenses):
        stats.add_expense(local_day(stamp), amount, category, description)

    moods = select(Mood.score, Mood.recorded_at).where(
        Mood.user_id == user_id, Mood.recorded_at >= start_utc, Mood.recorded_at < end_utc,
    )
    for score, stamp in db.execute(moods):
        stats.add_mood(local_day(stamp), score)

    bristol = select(BristolRecord.bristol_type, BristolRecord.recorded_at).where(
        BristolRecord.user_id == user_id, BristolRecord.recorded_at >= start_utc, BristolRecord.recorded_at < end_utc,
    )
    for bristol_type, stamp in db.execute(bristol):
        stats.add_bristol(local_day(stamp), bristol_type)

    return stats.summary()
