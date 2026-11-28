# Modular Life Journal

一个以 Markdown / 富文本日志为核心、通过可插拔生活模块记录结构化个人数据的个人生活日志系统。

## 当前版本

v1.1.0 面向本机个人使用。正文支持 Markdown 和富文本，生活日志记录三餐、消费、心情、Bristol 分类和睡眠质量。已保存的卡片可以编辑或删除。日历可定位到带时间的随记，统计中心按周、月、年等周期汇总已保存的记录，并用 ECharts 展示消费、心情、睡眠趋势和 Bristol 类型分布。

前端使用 React、TypeScript、Vite 和 TipTap，后端使用 FastAPI、SQLAlchemy 和 MySQL。

## 目录

```text
modular-life-journal/
├── apps/
│   ├── api/                 # FastAPI 后端
│   └── web/                 # React + Vite 前端
├── packages/
│   └── shared/              # 前后端共享领域类型
├── infra/
│   └── docker-compose.yml   # MySQL
├── docs/
│   ├── DEVELOPMENT_PLAN.md
│   └── DATA_MODEL.md
└── .env.example
```

## 启动

### 前端

```bash
cd apps/web
npm install
npm run dev
```

### 后端

```bash
cd apps/api
python -m venv .venv
\.venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### MySQL

```bash
docker compose -f infra/docker-compose.yml up -d
```

复制根目录的 `.env.example` 为 `apps/api/.env`，填写本机 MySQL 的连接信息。开发环境启动时会初始化数据表和本地账户。正式环境使用 Alembic 迁移。

## 备份与恢复

后端会在北京时间每天生成一份自动备份。当天首次启动时如果还没有备份，就补一份当前已保存的数据。每个日期的备份会留在本机，旧备份可以按需归档。

默认目录是 `apps/api/backups/`，文件名为 `logeveryday-auto-YYYY-MM-DD.json`。可在 `apps/api/.env` 中用 `BACKUP_DIRECTORY` 指定其他本机目录，或把 `AUTOMATIC_BACKUP_ENABLED` 设为 `false`。默认备份目录已加入 Git 忽略列表。

在「设置 → 备份与恢复」可查看最近备份、手动导出，或导入任一备份文件。恢复会补回缺失项，同一记录保留当前版本。

访问控制仍采用本机账户配置。跨设备使用前，需要先接入登录和访问保护。
