## ADDED Requirements

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
