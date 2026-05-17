## Requirements

### Requirement: 文档上传与同步向量化
系统 SHALL 允许管理员向指定知识库上传单个文档文件，并在 HTTP 响应返回前同步完成解析、切分、向量化、入库的全流程。响应 MUST 包含生成的 chunk 数。

#### Scenario: 上传文本文档并即刻可检索
- **WHEN** 管理员 `POST /api/admin/kb/:id/documents`（multipart）上传 `intro.md`
- **THEN** 系统解析文本 → 切分为 N 个 chunk → 调本地 embedding 模型生成 N 个向量 → 在 PG 事务中插入 `documents` + `chunks` → upsert N 个点到 Qdrant collection `kb_<id>` → 返回 201 `{ document_id, chunk_count: N }`，且此时立即对该文档发起召回能命中其 chunk

#### Scenario: 上传过程中 embedding 失败
- **WHEN** 向量化阶段抛错（如 OOM）
- **THEN** 系统回滚 PG 事务、不写 Qdrant，返回 500 `{ error: "ingestion_failed", reason }`，不留下任何半成品数据

### Requirement: 支持的文档格式
系统 MUST 支持 `.txt`、`.md`、`.pdf`、`.docx` 四种扩展名的文档上传，并对其它扩展名拒绝。

#### Scenario: 上传支持的格式
- **WHEN** 上传 `report.pdf`、`note.docx`、`readme.md`、`raw.txt`
- **THEN** 系统分别使用 `pdf-parse`、`mammoth`、原始文本读取处理，并成功入库

#### Scenario: 上传不支持的格式
- **WHEN** 上传 `image.png` 或 `archive.zip`
- **THEN** 系统返回 415 `{ error: "unsupported_file_type" }`

### Requirement: 文档切分策略
系统 SHALL 使用 recursive character splitter 切分原文，默认 `chunkSize=500` 字符、`overlap=80` 字符，分隔符按 `["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]` 顺序回退，确保中英文标点优先切句。

#### Scenario: 中文长文档按句号优先切分
- **WHEN** 输入一段无换行但含句号的 2000 字中文
- **THEN** 切片首选按 `。` 断开，每片 ≤ 500 字符，相邻片之间有 ≤ 80 字符的内容重叠

### Requirement: 上传体积与切片上限
系统 MUST 拒绝单个文件 > `MAX_UPLOAD_MB`（默认 50MB）的上传，并拒绝切分后 chunk 数 > 5000 的文档。

#### Scenario: 文件过大
- **WHEN** 上传 80MB 的 PDF
- **THEN** 系统返回 413 `{ error: "file_too_large" }`

#### Scenario: 切片爆炸
- **WHEN** 解析后 chunk 数 > 5000
- **THEN** 系统返回 422 `{ error: "too_many_chunks", chunks: N }`，回滚已写入的事务

### Requirement: 列出知识库下的文档
系统 SHALL 提供分页接口列出某知识库下的文档元数据。

#### Scenario: 分页列出
- **WHEN** 管理员调用 `GET /api/admin/kb/:id/documents?limit=20&offset=0`
- **THEN** 系统返回 `{ items: [{ id, filename, mime_type, size_bytes, chunk_count, created_at }], total }`

### Requirement: 删除文档
系统 SHALL 允许管理员删除指定文档；删除 MUST 同时清除该文档在 PG 中的原文/chunk 与在 Qdrant 中的所有向量点。

#### Scenario: 成功删除
- **WHEN** 管理员调用 `DELETE /api/admin/kb/:kb_id/documents/:doc_id`
- **THEN** 系统先按 `document_id` 在 Qdrant 中 `delete points by filter` → 再在 PG 事务中删除 `chunks` 与 `documents` 行 → 返回 204

#### Scenario: 删除后无法再被召回
- **WHEN** 在删除操作完成后立即对原内容关键词发起召回
- **THEN** 系统结果集中 MUST NOT 包含该文档的任何 chunk
