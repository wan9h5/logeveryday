# 我的人生这本书

这是一个运行在本机的个人日志系统，支持随手记录、填写生活日志，以及按日期回看和统计。

## 当前版本

当前发布版为 **v1.2.0**。[GitHub 发布说明](https://github.com/wan9h5/logeveryday/releases/tag/v1.2.0)

前端使用 React、TypeScript、Vite 和 TipTap，后端使用 FastAPI、SQLAlchemy 和 MySQL。

## 已实现功能

### 栏目与编辑器

- 支持新建、重命名和删除栏目。新建时可以选主题色。
- 支持 Markdown 标题、列表、引用和代码块。文档大纲按一级至六级标题生成，点击可跳到对应位置。
- 支持加粗、斜体、下划线、删除线、文字颜色和背景高亮。选中文字可通过浮动工具栏调整格式和字号。
- 停止编辑约 5 秒后自动保存。页面显示保存状态，保存失败时可以重试。长文档可一键滚动到底部。

### 随记与生活日志

- **随记模式**可直接在正文里输入。停笔约 3 秒后出现 `time` 按钮，点击会记录日期和时间，光标移到下一行。修改已标记的段落会显示更新时间。
- **日志模式**在正文中打开生活日志表单。点击 `time` 换行后，可从「填写日志」打开新表单，也可关闭提示继续写随记。
- **三餐与消费**分别记录早餐、午餐和晚餐的餐食、金额及地点。每餐可从该餐次的历史记录里选常吃的内容。其他消费可添加多条，表单会合计当日花费。
- **生活指标**包括 Bristol 排便分类、整体心情和睡眠质量分数。已保存的生活日志可修改或删除，日历和统计随之更新。
- **游戏记录**可选择当天有没有玩游戏。选「有」后可填游戏名和是否开黑，选择开黑时可填开黑对象。

### 日历与统计

- 日历支持按月切换，标记有记录的日期，并展示当天的生活日志和随记。当天只有一个 `time` 标记时，点击日期直接跳到原文。有多个标记时，可选择具体时间。
- 统计中心按日、周、月、季度和年汇总已保存的消费、餐食、心情、排便、睡眠分数和记录天数，支持切换历史时段。
- 使用 ECharts 展示消费柱状图、心情和睡眠分数折线图，以及 Bristol 类型分布。图表悬停可查看数值，页面下方可查明细。

### 本地备份与接口

- 支持手动导出和导入 JSON 备份。导入会补回缺失记录，同一条记录保留当前版本。
- 服务运行时每天保留一份自动备份，启动时补当天缺失的备份。设置页可查看备份目录和最近备份时间。
- 日志保存在 MySQL 中。后端提供文档关键词查询接口 `GET /api/documents?search=关键词`，可在 `/docs` 查看接口文档。

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
