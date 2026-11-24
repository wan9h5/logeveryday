"""create core journal tables

Revision ID: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def id_column():
    return sa.Column("id", sa.String(36), primary_key=True)


def user_column():
    return sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True)


def upgrade() -> None:
    op.create_table("users", id_column(), sa.Column("email", sa.String(255), nullable=False, unique=True), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("documents", id_column(), user_column(), sa.Column("title", sa.String(255), nullable=False), sa.Column("content_json", sa.JSON(), nullable=False), sa.Column("search_text", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_table("blocks", id_column(), sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=False, index=True), sa.Column("block_type", sa.String(50), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("config", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("records", id_column(), user_column(), sa.Column("block_id", sa.String(36), sa.ForeignKey("blocks.id"), nullable=True), sa.Column("record_type", sa.String(50), nullable=False), sa.Column("recorded_at", sa.DateTime(), nullable=False, index=True), sa.Column("payload", sa.JSON(), nullable=False))
    op.create_table("expenses", id_column(), user_column(), sa.Column("amount", sa.Numeric(12, 2), nullable=False), sa.Column("category", sa.String(50), nullable=False), sa.Column("description", sa.String(255), nullable=False), sa.Column("expense_time", sa.DateTime(), nullable=False, index=True))
    op.create_table("moods", id_column(), user_column(), sa.Column("score", sa.Integer(), nullable=False), sa.Column("color", sa.String(20), nullable=False), sa.Column("note", sa.String(255), nullable=False), sa.Column("recorded_at", sa.DateTime(), nullable=False, index=True))
    op.create_table("bristol_records", id_column(), user_column(), sa.Column("bristol_type", sa.Integer(), nullable=False), sa.Column("note", sa.String(255), nullable=False), sa.Column("recorded_at", sa.DateTime(), nullable=False, index=True))
    op.create_table("images", id_column(), user_column(), sa.Column("url", sa.String(500), nullable=False), sa.Column("filename", sa.String(255), nullable=False), sa.Column("size", sa.Integer(), nullable=False), sa.Column("width", sa.Integer(), nullable=True), sa.Column("height", sa.Integer(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False))


def downgrade() -> None:
    for table in ("images", "bristol_records", "moods", "expenses", "records", "blocks", "documents", "users"):
        op.drop_table(table)
