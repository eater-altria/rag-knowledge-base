## Why

管理员目前只能看到文档元数据（文件名、大小、chunk 数），无法在后台核对入库后的实际文本，导致"切片是否符合预期、是否漏内容"只能靠重新调召回测试来间接验证；同时上传时文件名带乱码、批量上传后想统一规范命名也只能删了重传。补一个预览 + 改名，是后台日常使用最缺的两个动作。

## What Changes

- 新增 `GET /api/admin/kb/:id/documents/:doc_id/preview`：按 `chunk_index` 升序拼接所有 chunk 的 `content`，以纯文本形式返回（含分页/截断保护，单次最多返回前 N 个 chunk 与总 chunk 数）。
- 新增 `PATCH /api/admin/kb/:id/documents/:doc_id`：仅允许修改 `filename` 字段，校验非空、长度 ≤ 255，保留原扩展名前后的内容不强制约束（不重新解析、不影响向量）。
- 两个新接口都挂在 `/api/admin/*` 路由组下，复用现有 `requireAdmin` JWT preHandler，未登录或 token 失效一律 401。
- 前端 `DocumentList` 表格行新增「预览」「重命名」两个操作：预览打开一个 Modal，调接口取文本并以等宽字体滚动展示；重命名打开输入框 Modal 提交后刷新列表。
- 文件名展示从纯文本改为可点击触发预览的入口（保留独立的小按钮亦可，二选一在 design 里定）。

## Capabilities

### New Capabilities

无。本次改动复用既有的 `document-ingestion` 与 `admin-console` capability。

### Modified Capabilities

- `document-ingestion`: 新增"读取文档原文"与"重命名文档"两条 requirement，删除接口与上传流程不变。
- `admin-console`: 文档列表页新增预览与重命名两个交互入口的 UI 行为约束。

## Impact

- **代码**：
  - `backend/src/routes/documents.ts` 增加两个 handler。
  - `backend/src/services/ingestion.ts` 增加 `getDocumentText(kbId, docId, limit, offset)` 与 `renameDocument(kbId, docId, filename)`。
  - `frontend/src/api/documents.ts` 增加 `preview` 与 `rename` 方法。
  - `frontend/src/pages/DocumentList.tsx` 新增预览 Modal、重命名 Modal 与两个 action button。
- **依赖 / 数据库**：无新依赖，无 schema 变更（不需要 migration）。
- **API 契约**：仅新增，对现有调用方零影响。
- **鉴权**：复用 `requireAdmin`，不引入新角色或新 token 形态。
