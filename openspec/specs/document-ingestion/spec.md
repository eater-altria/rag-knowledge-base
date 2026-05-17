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

### Requirement: 读取文档解析后原文
系统 SHALL 提供受管理员鉴权的接口，按 `chunk_index` 升序拼接指定文档的所有 chunk 文本并返回，用于后台核对入库后用于召回的实际文本。响应 MUST 包含总切片数 `total_chunks`、本次返回的切片数 `returned_chunks` 与是否被截断的标志 `truncated`，以便前端分页加载。

#### Scenario: 管理员预览文档全文
- **WHEN** 已登录管理员调用 `GET /api/admin/kb/:id/documents/:doc_id/preview?limit=50&offset=0`
- **THEN** 系统按 `chunk_index ASC` 取出该文档的前 50 个 chunk，将其 `content` 用 `\n\n` 顺序拼接为 `text` 字段返回，并返回 `{ text, total_chunks, returned_chunks, truncated, next_offset }`；当 `total_chunks > offset + returned_chunks` 时 `truncated = true`、`next_offset` 为下一页起点

#### Scenario: 预览请求超过 limit 上限
- **WHEN** 调用方传入 `limit > 200`
- **THEN** 系统返回 400 `{ error: "invalid_request" }`

#### Scenario: 文档不存在或不属于该知识库
- **WHEN** `:doc_id` 不存在，或文档存在但 `kb_id` 与 `:id` 不匹配
- **THEN** 系统返回 404 `{ error: "document_not_found" }`，且不暴露文档是否在别的知识库

#### Scenario: 未登录访问预览
- **WHEN** 调用方未携带或携带无效的 JWT 访问预览接口
- **THEN** 系统返回 401，与其它 `/api/admin/*` 接口的鉴权行为一致

### Requirement: 重命名文档
系统 SHALL 允许管理员通过 `PATCH /api/admin/kb/:id/documents/:doc_id` 修改文档的 `filename`，且 MUST NOT 触发任何重新解析、切分或向量化——重命名是纯元数据修改，不会改变 `chunks` 与 Qdrant 中的向量点。

#### Scenario: 成功重命名
- **WHEN** 已登录管理员发送 `PATCH /api/admin/kb/:id/documents/:doc_id`，body `{ "filename": "新文件名.pdf" }`
- **THEN** 系统更新 `documents.filename`，返回 200 `{ id, filename, mime_type, size_bytes, chunk_count, created_at }`；后续 `GET .../documents` 列表中该行的 `filename` MUST 反映新值

#### Scenario: 重命名后向量与 chunk 不受影响
- **WHEN** 在重命名完成后立即对原文档内容关键词发起召回
- **THEN** 召回结果中该文档对应 chunk 的命中数与重命名前一致，且返回的 `document_filename` 字段 MUST 反映新值

#### Scenario: 文件名非法
- **WHEN** body 中的 `filename` 经 trim 后为空字符串、长度 > 255、或包含 `/` 或 `\0`
- **THEN** 系统返回 400 `{ error: "invalid_request" }`，不修改任何数据

#### Scenario: 文档不存在
- **WHEN** `:doc_id` 不存在或不属于 `:id` 指定的知识库
- **THEN** 系统返回 404 `{ error: "document_not_found" }`

#### Scenario: 未登录访问重命名
- **WHEN** 调用方未携带或携带无效的 JWT 访问重命名接口
- **THEN** 系统返回 401
