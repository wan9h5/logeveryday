# Modular Life Journal

一个以 Markdown / 富文本日志为核心、通过可插拔生活模块记录结构化个人数据的个人生活日志系统。

## 当前版本

当前仓库是 MVP 基础版本，包含：

- React + TypeScript + Vite 前端工作台
- Python + FastAPI 后端 API 骨架
- SQLAlchemy 2 + Alembic 数据库基础
- MySQL 连接配置与 Docker Compose
- `Document / Block / Record` 数据模型
- 三栏布局：文档区、编辑区、标题目录
- TipTap 富文本编辑器工具栏
- 可插拔模块注册机制：今日记录、心情、Bristol 排便、消费、图片
- 本地演示数据，后端不可用时前端仍可预览

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

复制 `.env.example` 为 `.env` 后即可连接本地数据库。后端会自动创建演示数据；正式环境使用 Alembic 迁移。

## 下一步

1. 接入真实登录与 JWT 会话。
2. 将编辑器 JSON 和结构化记录保存到 API。
3. 增加图片上传到本地存储 / MinIO。
4. 完成全文搜索、提醒设置和消费统计接口。
5. 增加日历、统计中心、导出与备份。
