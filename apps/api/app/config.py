from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "我的人生这本书 API"
    database_url: str = "mysql+pymysql://journal:journal@localhost:3306/modular_life_journal"
    cors_origins: str = "http://localhost:5173"
    automatic_backup_enabled: bool = True
    backup_directory: Path = Path(__file__).resolve().parents[1] / "backups"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
