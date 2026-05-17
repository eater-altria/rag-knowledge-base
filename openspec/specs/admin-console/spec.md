## Requirements

### Requirement: 首次访问引导创建管理员
前端 SHALL 在用户访问任何受保护页面时调用 `GET /api/auth/status`；若 `initialized = false`，则强制路由到 `/setup` 引导页。

#### Scenario: 干净环境首次进入
- **WHEN** 系统未初始化，用户访问 `/`
- **THEN** 前端跳转到 `/setup`，展示"创建管理员账户"表单（用户名、密码、确认密码）

#### Scenario: setup 完成后自动登录
- **WHEN** setup 表单提交成功
- **THEN** 前端将后端返回的 JWT 写入 localStorage 并跳转到 `/`

### Requirement: 登录页
前端 SHALL 提供 `/login` 页面；表单错误时显示后端错误信息，成功后跳转到原目标页或 `/`。

#### Scenario: 错误密码
- **WHEN** 用户输入错误密码并提交
- **THEN** 表单下方显示"用户名或密码错误"，不跳转

### Requirement: 知识库管理页
前端 SHALL 在 `/` 页面展示知识库列表（名称、文档数、chunk 数、创建时间），并提供"新建知识库"按钮（弹窗表单）与每行"删除"按钮（二次确认）。

#### Scenario: 列表展示
- **WHEN** 已登录管理员访问 `/`
- **THEN** 页面以卡片或表格形式展示后端返回的所有知识库

#### Scenario: 删除二次确认
- **WHEN** 用户点击"删除"
- **THEN** 弹出确认框，需手动输入知识库名称匹配后才执行删除

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

### Requirement: 召回测试页
前端 SHALL 在 `/kb/:id/retrieve` 页面提供 query 输入框与"召回"按钮，调用 `POST /api/retrieve` 后以列表形式渲染结果（文档名、score、source 标签、原文 chunk，原文 MUST 完整展示）。

#### Scenario: 召回测试
- **WHEN** 用户输入 query 点击"召回"
- **THEN** 前端渲染每条结果：标题为 `document_filename`、副标题为 `score (source)`、正文为 chunk `content`，原文 MUST NOT 被截断或加工

### Requirement: 视觉风格对齐 Claude Code 官网
前端 SHALL 采用近黑背景（`#1F1F1E`）、卡片色（`#262624`）、暖橙强调色（`#D97757`）、`Geist Sans` 与 `Geist Mono` 字体的设计 token，整体布局简洁克制，参照 Claude Code 官网风格。

#### Scenario: 风格 token 落实
- **WHEN** 任意页面渲染
- **THEN** 主背景、卡片、按钮主色、字体均匹配上述设计 token；按钮 hover/focus 有可见状态

### Requirement: 鉴权 UX
前端 SHALL 在 HTTP 401 响应时清除本地 token 并跳转 `/login`；JWT 临近过期时 SHALL 在右上角提示用户重新登录。

#### Scenario: token 失效自动登出
- **WHEN** 任一管理接口返回 401
- **THEN** 前端清空 localStorage 中的 token，跳转 `/login?from=<原路径>`
