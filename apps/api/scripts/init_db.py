"""Initialize the configured database and seed the development user."""
from app.db import Base, SessionLocal, engine
from app.models import User


Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    if not db.get(User, "demo-user"):
        db.add(User(id="demo-user", email="demo@example.com", password_hash="development-only"))
        db.commit()
print("Database tables created and demo user initialized.")
