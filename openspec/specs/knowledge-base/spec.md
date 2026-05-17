## Requirements

### Requirement: 创建知识库
系统 SHALL 允许管理员创建独立的知识库（namespace），每个知识库由系统生成的 UUID 标识，并由管理员提供唯一的可读名称（1-64 字符）和可选描述（≤ 500 字符）。同名知识库 MUST 被拒绝。

#### Scenario: 成功创建知识库
- **WHEN** 已登录管理员调用 `POST /api/admin/kb` 提交 `{ "name": "产品文档", "description": "..." }`
- **THEN** 系统返回 201 与新建知识库对象 `{ id, name, description, created_at }`，并在 Qdrant 中创建对应 collection `kb_<id>`

#### Scenario: 名称重复
- **WHEN** 管理员提交的 `name` 与已有知识库重复
- **THEN** 系统返回 409 `{ error: "kb_name_exists" }`，不创建任何资源

#### Scenario: 未登录访问
- **WHEN** 调用 `POST /api/admin/kb` 时未携带有效 JWT
- **THEN** 系统返回 401，不创建任何资源

### Requirement: 列出知识库
系统 SHALL 提供接口返回当前所有知识库及其文档总数、chunk 总数。

#### Scenario: 管理员查询列表
- **WHEN** 管理员调用 `GET /api/admin/kb`
- **THEN** 系统返回 `[{ id, name, description, document_count, chunk_count, created_at }]`，按 `created_at` 倒序排列

### Requirement: 知识库隔离
系统 MUST 保证所有文档、chunk、向量按 `kb_id` 隔离：在任一知识库下的检索、列表、删除操作 MUST NOT 返回或影响其它知识库的数据。

#### Scenario: 跨知识库检索互不影响
- **WHEN** 知识库 A 含 100 个 chunk、知识库 B 含 0 个 chunk，对 B 发起召回
- **THEN** 系统返回空结果，不会泄露 A 的任何 chunk

#### Scenario: Qdrant collection 物理隔离
- **WHEN** 系统创建知识库 X 与 Y
- **THEN** Qdrant 中存在两个独立 collection `kb_<X>` 与 `kb_<Y>`，向量写入/查询基于该 collection 隔离

### Requirement: 删除知识库
系统 SHALL 允许管理员删除知识库；删除操作 MUST 级联清除该知识库下的所有文档、chunk 及 Qdrant 中对应 collection。

#### Scenario: 删除非空知识库
- **WHEN** 管理员调用 `DELETE /api/admin/kb/:id`，且该知识库下含若干文档与向量
- **THEN** 系统先删除 Qdrant collection，再在 PG 事务中删除 `chunks`、`documents`、`knowledge_bases` 行，返回 204

#### Scenario: 删除不存在的知识库
- **WHEN** `:id` 不存在
- **THEN** 系统返回 404
