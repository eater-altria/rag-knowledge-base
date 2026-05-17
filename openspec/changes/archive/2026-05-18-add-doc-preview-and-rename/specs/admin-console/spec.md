## MODIFIED Requirements

### Requirement: 文档管理页
前端 SHALL 在 `/kb/:id` 页面展示该知识库下的文档列表，并提供文件上传组件（支持拖拽，多次上传一次一文件）；每行 SHALL 提供「预览」「重命名」「删除」三个操作入口。预览 MUST 以 Modal 形式展示由后端拼接的解析后纯文本，UI 上 MUST 明示「这是切分后用于召回的文本，不含原文档的图片、表格、排版」；重命名 MUST 以 Modal 表单的形式提交，成功后刷新当前列表。

#### Scenario: 上传文件
- **WHEN** 用户拖拽 `.pdf` 文件到上传区
- **THEN** 前端以 `multipart/form-data` 发起请求，UI 展示进度/状态；成功后列表自动刷新

#### Scenario: 上传失败提示
- **WHEN** 后端返回 413/415/422/500
- **THEN** 前端以 toast 展示对应的中文错误信息

#### Scenario: 预览文档解析后文本
- **WHEN** 用户在某行点击「预览」按钮
- **THEN** 前端调用 `GET /api/admin/kb/:id/documents/:doc_id/preview` 并在 Modal 中以等宽字体 + `whitespace-pre-wrap` 展示返回的 `text`；Modal 底部 MUST 展示「已加载 X / 共 Y 切片」；当 `truncated = true` 时 MUST 渲染「加载更多」按钮，点击后用返回的 `next_offset` 继续追加内容

#### Scenario: 重命名文档
- **WHEN** 用户在某行点击「重命名」按钮，输入新文件名并提交
- **THEN** 前端调用 `PATCH /api/admin/kb/:id/documents/:doc_id` 提交 `{ filename }`；成功后 toast 提示「已重命名」并触发当前知识库的文档列表 invalidate；失败时按后端返回的 `error` 字段展示对应中文提示

#### Scenario: 预览 / 重命名接口 401
- **WHEN** 后端对预览或重命名接口返回 401
- **THEN** 前端按既有「鉴权 UX」要求清空 token 并跳转 `/login`
