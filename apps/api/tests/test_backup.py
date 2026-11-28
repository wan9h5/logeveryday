import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.backup import JournalBackup, export_backup, restore_backup
from app.db import Base
from app.models import Block, Document, Expense, Record, User


class JournalBackupTests(unittest.TestCase):
    def database(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        database = Session(engine)
        self.addCleanup(database.close)
        database.add(User(id="demo-user", email="journal@example.org", password_hash="private"))
        database.commit()
        return database

    def test_round_trip_preserves_links_amounts_and_existing_edits(self):
        source = self.database()
        source.add(Document(id="journal", user_id="demo-user", title="日记", content_json={"type": "doc"}))
        source.add(Block(id="block", document_id="journal", block_type="dailyJournal"))
        source.flush()
        source.add(Record(id="record", user_id="demo-user", block_id="block", record_type="daily", payload={"score": 95}))
        source.add(Expense(id="expense", user_id="demo-user", amount=Decimal("10.25"), category="餐饮",
                           expense_time=source.get(Document, "journal").created_at))
        source.commit()
        data = export_backup(source).model_dump_json()
        self.assertNotIn("password_hash", data)
        backup = JournalBackup.model_validate_json(data)

        target = self.database()
        results = restore_backup(backup, target)
        self.assertEqual(results["documents"]["added"], 1)
        self.assertEqual(target.get(Record, "record").block_id, "block")
        self.assertEqual(target.get(Expense, "expense").amount, Decimal("10.25"))
        target.get(Document, "journal").title = "已修改标题"
        target.commit()
        results = restore_backup(backup, target)
        self.assertEqual(results["documents"], {"added": 0, "skipped": 1})
        self.assertEqual(target.get(Document, "journal").title, "已修改标题")

    def test_invalid_reference_rolls_back_other_rows(self):
        source = self.database()
        source.add(Document(id="journal", user_id="demo-user", title="日记"))
        source.add(Block(id="block", document_id="journal", block_type="dailyJournal"))
        source.commit()
        backup = export_backup(source)
        backup.blocks[0].document_id = "missing"
        target = self.database()
        with self.assertRaises(HTTPException) as failure:
            restore_backup(backup, target)
        self.assertEqual(failure.exception.status_code, 422)
        self.assertEqual(list(target.scalars(select(Document.id))), [])


if __name__ == "__main__":
    unittest.main()
