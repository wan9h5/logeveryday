import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.automatic_backup import AutomaticBackup, write_daily_backup
from app.backup import JournalBackup, restore_backup
from app.db import Base
from app.models import Document, User


class AutomaticBackupTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name) / "backups"
        self.engine = create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        factory = patch("app.automatic_backup.SessionLocal", self.sessions)
        factory.start()
        self.addCleanup(factory.stop)
        with self.sessions() as session:
            session.add(User(id="demo-user", email="journal@example.org", password_hash="private"))
            session.add(Document(id="journal", user_id="demo-user", title="日记", content_json={"type": "doc"}))
            session.commit()

    def test_daily_file_is_restorable_and_keeps_earlier_snapshots(self):
        first_day = date(2026, 11, 28)
        first = write_daily_backup(self.directory, first_day)
        self.assertEqual(first.name, "logeveryday-auto-2026-11-28.json")
        original = first.read_bytes()
        self.assertNotIn(b"password_hash", original)

        with self.sessions() as session:
            session.get(Document, "journal").title = "修改后的日记"
            session.commit()
        self.assertIsNone(write_daily_backup(self.directory, first_day))
        self.assertEqual(first.read_bytes(), original)
        second = write_daily_backup(self.directory, date(2026, 11, 29))
        self.assertEqual(len(list(self.directory.glob("*.json"))), 2)
        self.assertIsNotNone(AutomaticBackup(self.directory, True).status()["last_success_at"])

        another_engine = create_engine("sqlite://")
        self.addCleanup(another_engine.dispose)
        Base.metadata.create_all(another_engine)
        with Session(another_engine) as target:
            target.add(User(id="demo-user", email="restore@example.org", password_hash="private"))
            target.commit()
            result = restore_backup(JournalBackup.model_validate_json(second.read_bytes()), target)
            self.assertEqual(result["documents"]["added"], 1)
            self.assertEqual(target.get(Document, "journal").title, "修改后的日记")

    def test_publish_failure_leaves_no_partial_backup_and_can_retry(self):
        day = date(2026, 11, 28)
        with patch("app.automatic_backup.os.replace", side_effect=OSError("write failed")):
            with self.assertRaises(OSError):
                write_daily_backup(self.directory, day)
        self.assertEqual(list(self.directory.iterdir()), [])
        self.assertIsNotNone(write_daily_backup(self.directory, day))


if __name__ == "__main__":
    unittest.main()
