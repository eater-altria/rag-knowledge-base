## Context

后台 `DocumentList` 页面目前只能列出文档元数据与删除文档。摄入侧把原始二进制丢掉了——`documents` 表只保留 `filename / mime_type / size_bytes`，文本只活在 `chunks.content` 里。鉴权侧已经有成熟的 `requireAdmin` JWT preHandler 挂在整组 `/api/admin/*` 上。本次改动是一个纯粹的"补功能"动作，不涉及摄入流水线、向量库或检索路径。

## Goals / Non-Goals

**Goals:**
- 让管理员能在后台直接看到入库后用于召回的实际文本（即解析+切分后的内容），用于核对切分质量与排查"召回不命中"。
- 让管理员能在不重新上传的前提下修改文档显示用文件名。
- 接口和现有 admin API 风格一致（路由前缀、错误码 shape、鉴权方式都不变）。
- 零数据库迁移、零新依赖。

**Non-Goals:**
- 不还原 PDF/docx 的版式、图片、表格——预览的就是"切片后的纯文本"，UI 上要把这一点说清楚。
- 不存原始二进制，因此不提供"下载原文"。
- 不允许通过重命名修改扩展名后触发重新解析（重命名只是元数据修改，不影响 chunks/向量）。
- 不做权限分级（只有单 admin，沿用现状）。

## Decisions

### 1. 预览：拼接 chunks，而不是单独存"全文"列
- **做法**：`GET /api/admin/kb/:id/documents/:doc_id/preview?limit=&offset=` → 按 `chunk_index ASC` 取 chunks，服务端把若干个 chunk 的 `content` 用 `\n\n` 连接返回，附带 `total_chunks`、`returned_chunks`、`truncated` 字段。
- **Why**：DB 里已经有这份文本，再加一份"全文"列既冗余又会让上传流水线多写一次。chunks 之间有 80 字符 overlap，拼回时**不去重**——预览的目的是"看实际入库内容"，去重会掩盖切分行为。这一点要在前端 UI 上用一句小字说明。
- **Alternatives 考虑过**：①新增 `documents.full_text` 列。被否，多余且要 backfill 历史数据。②前端自己拼。被否，要拉所有 chunk 元数据会浪费一次往返。

### 2. 预览分页 / 截断
- **做法**：默认 `limit=50`、`offset=0`，上限 `limit ≤ 200`。响应里给 `total_chunks` 让前端能渲染"显示 50 / 共 142 切片，加载更多"。
- **Why**：单文档最多 5000 chunk × 500 字符 ≈ 2.5MB，一次 JSON 回传给浏览器风险不大但浪费；按 chunk 分页是天然的边界（不会切到半个 chunk），比按字符分页好处理。

### 3. 重命名：只改 `documents.filename`，不动 `mime_type`
- **做法**：`PATCH /api/admin/kb/:id/documents/:doc_id`，body `{ "filename": string }`。服务端用 zod 校验：trim 后非空、长度 ≤ 255、不含 `\0` 与 `/`。
- **Why**：扩展名仅在**初次上传**的 `isSupported` 检查里用过，入库后既不影响向量也不影响检索；强制用户保留扩展名反而妨碍"把乱码改成中文名"的常见场景。mime_type 是上传时的 multipart 字段，重命名不该让它和 filename 互相依赖。
- **不做**：不校验"扩展名仍然是支持的格式"——预览不靠扩展名，召回也不靠扩展名。

### 4. 错误码与已有风格保持一致
- 文档不存在 → 404 `{ error: "document_not_found" }`（与 DELETE 接口一致）。
- KB 不存在 → 404 `{ error: "kb_not_found" }`（与 list/upload 一致）。
- 重命名 body 不合法 → 400 `{ error: "invalid_request" }`。
- 未鉴权 → 401，由 `requireAdmin` 统一返回。

### 5. 前端交互
- 表格行的"文件名"单元格本身保留为纯文本（避免误点）；右侧 actions 列从「删除」一个按钮扩为「预览 / 重命名 / 删除」三个图标按钮，复用 `lucide-react`（`Eye`、`Pencil`、`Trash2`）。
- 预览 Modal：用现有的 `Modal` 组件，里面 `<pre>` + `whitespace-pre-wrap` + 等宽字体；底部展示"已加载 X / 共 Y 切片"，若 truncated 给一个"加载更多"按钮 append。
- 重命名 Modal：输入框默认填充当前文件名，回车或点确认提交，loading/错误状态走 `useMutation` + `pushToast`，成功后 `invalidateQueries(['documents', kbId])`。

## Risks / Trade-offs

- [预览展示的是切分后文本，而非原始版式] → 在预览 Modal 顶部加一行小字「以下是入库后用于召回的纯文本，不含原文档的图片、表格、排版」。这是设计上接受的局限，不是 bug。
- [chunks 之间 80 字符重叠会在预览里出现] → 同上，用同一行说明覆盖；不在服务端做去重以保持"所见即所召回"。
- [大文档（数千 chunk）一次性渲染卡浏览器] → 默认分页 + `limit` 上限 200 + 前端"加载更多"。不引入虚拟列表，超出场景属于非目标。
- [改名后引用旧文件名的外部系统] → 当前没有任何外部系统会拿 `filename` 当 ID，文档主键是 UUID；接受改名是 destructive 文本操作，不引入历史名审计（保持单 admin 的轻量风格）。
