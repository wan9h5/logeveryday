# 数据模型

## 核心关系

```text
User
 └── Document
      └── Block
           └── Record
```

`Document` 保存一个日志文档，`Block` 保存文档内的文本或生活模块位置，`Record` 保存可统计的数据。这样消费、心情、Bristol 不会被埋在 Markdown 中。

## MVP 表

- `users`：账户与密码哈希
- `documents`：标题、编辑器 JSON、纯文本搜索内容
- `blocks`：块类型、顺序、块配置
- `records`：统一记录索引，按 `record_type` 区分具体数据
- `moods`：1–5 分、颜色、备注
- `bristol_records`：Type 1–7、备注
- `expenses`：金额、分类、用途、消费时间
- `images`：文件 URL、大小、宽高
- `notification_settings`：每日提醒开关与时间

## 设计约束

- 所有业务数据带 `user_id`，为多用户隔离预留。
- 记录通过 `journal_entry_id`（预留）或 `block_id` 关联到文档上下文。
- 图片文件不存入 MySQL，只保存元数据和 URL。
- 金额使用 `DECIMAL(12, 2)`，避免浮点误差。
