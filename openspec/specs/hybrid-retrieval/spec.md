## Requirements

### Requirement: 公开召回接口
系统 SHALL 提供公开的 `POST /api/retrieve` 接口，不要求鉴权，接受 `{ kb_id, query, top_k?, vector_k?, keyword_k? }` 并返回原文 chunk 列表。

#### Scenario: 匿名调用召回
- **WHEN** 任意客户端不携带 JWT 调用 `POST /api/retrieve` 并提供有效参数
- **THEN** 系统返回 200 与结果数组，不要求登录

#### Scenario: 缺失或非法参数
- **WHEN** 请求体缺少 `kb_id` 或 `query`，或 `top_k > 50`
- **THEN** 系统返回 400 `{ error: "invalid_request", details }`

#### Scenario: 知识库不存在
- **WHEN** `kb_id` 在系统中不存在
- **THEN** 系统返回 404 `{ error: "kb_not_found" }`

### Requirement: 召回限流
系统 MUST 对召回接口按客户端 IP 限流，默认 60 次/分钟，超出返回 429。

#### Scenario: 超过限流阈值
- **WHEN** 同一 IP 在 1 分钟内对 `/api/retrieve` 发起 61 次请求
- **THEN** 第 61 次起返回 429 `{ error: "rate_limited" }`，并在 `Retry-After` 头中给出秒数

### Requirement: 向量检索
系统 MUST 使用本地 embedding 模型对 `query` 生成向量，并在 Qdrant 中对应 collection 内做 ANN 检索，取前 `vector_k`（默认 20）。

#### Scenario: 纯向量召回
- **WHEN** query 与某 chunk 语义相似但用词不同
- **THEN** 该 chunk 应出现在向量召回候选集中

### Requirement: 关键词检索
系统 MUST 同时基于 PostgreSQL 中文全文索引（`zhparser` 配置 `chinese_zh`）做关键词检索，取按 `ts_rank` 排序的前 `keyword_k`（默认 20）。

#### Scenario: 关键词精确命中
- **WHEN** query 中包含 chunk 原文的专有名词
- **THEN** 该 chunk MUST 出现在关键词召回候选集中，即便向量召回未命中

#### Scenario: 中文分词生效
- **WHEN** query 为"产品发布会"，chunk 含"产品 发布 会议"
- **THEN** zhparser 应按词切分匹配相关 chunk

### Requirement: 候选合并与重排
系统 MUST 将向量候选与关键词候选按 `chunk_id` 去重合并形成候选集（标注 `source`：`vector` / `keyword` / `both`），再用本地 reranker（cross-encoder）对每个 `(query, chunk.content)` 对打分，按分数降序取前 `top_k`（默认 10）。

#### Scenario: 重排改变顺序
- **WHEN** 关键词召回排序与最终语义相关性不一致
- **THEN** reranker 分数最高的 chunk MUST 排在响应的第一位

#### Scenario: 双路命中合并
- **WHEN** 某 chunk 同时被向量与关键词召回命中
- **THEN** 结果中该项 `source = "both"`，且只出现一次

### Requirement: 返回原始文本
系统 MUST 在响应中按重排后的顺序返回 chunk，原样回传 chunk 原文，**MUST NOT** 调用任何 LLM 做摘要、改写或合成。

#### Scenario: 原文逐字返回
- **WHEN** chunk 原文为 "X"
- **THEN** 响应中的 `content` 字段等于 "X"，无任何裁剪、加工

#### Scenario: 响应结构
- **WHEN** 召回成功
- **THEN** 响应形如 `{ results: [{ chunk_id, document_id, kb_id, content, score, source, document_filename }] }`
