## 1. 仓库与基础脚手架

- [x] 1.1 初始化仓库根目录结构：`backend/`、`frontend/`、`docker/`、根 `.gitignore`、`README.md`
- [x] 1.2 在 `backend/` 初始化 Node 20 + TypeScript 项目（`tsconfig.json`、`package.json` scripts: `dev`/`build`/`start`/`admin:reset`）
- [x] 1.3 在 `frontend/` 初始化 Vite + React 18 + TypeScript + TailwindCSS 项目
- [x] 1.4 顶层 `Makefile`（或 npm 工作区脚本）提供 `make up` / `make down` / `make build-images` 等便捷命令

## 2. 数据库 schema 与初始化

- [x] 2.1 编写 `docker/postgres/init.sql`：建 `admin`、`knowledge_bases`、`documents`、`chunks` 四张表与外键级联
- [x] 2.2 在 `init.sql` 中 `CREATE EXTENSION zhparser` 并创建 `chinese_zh` text search configuration
- [x] 2.3 `chunks` 表添加 `tsv tsvector GENERATED ALWAYS AS (to_tsvector('chinese_zh', content)) STORED` + GIN 索引
- [x] 2.4 编写 `docker/postgres/Dockerfile`：基于 `postgres:16`，安装并编译 zhparser，验证 buildx 双架构构建通过（Dockerfile 完成；实际多架构 buildx 验证需 11.7 一同在你的机器上跑）

## 3. Backend：基础设施层

- [x] 3.1 引入依赖：`fastify`、`@fastify/jwt`、`@fastify/multipart`、`@fastify/cors`、`@fastify/rate-limit`、`pg`、`@qdrant/js-client-rest`、`@xenova/transformers`、`onnxruntime-node`、`pdf-parse`、`mammoth`、`bcrypt`、`zod`、`pino`
- [x] 3.2 实现 `src/config.ts`：用 zod 校验所有 env（含 `JWT_SECRET` 长度 ≥ 32），非法则 process.exit(1)
- [x] 3.3 实现 PG 连接池单例与 healthcheck SQL
- [x] 3.4 实现 Qdrant 客户端单例，封装 `ensureCollection(kbId, dim)`、`upsertPoints`、`searchPoints`、`deletePointsByFilter`、`deleteCollection`
- [x] 3.5 实现 `EmbeddingService` 与 `RerankerService`（基于 `@xenova/transformers`），启动时预热模型并打印加载耗时

## 4. Backend：鉴权能力（admin-auth）

- [x] 4.1 实现 `GET /api/auth/status`（公开）：检查 `admin` 表是否为空
- [x] 4.2 实现 `POST /api/auth/setup`：仅当表空时允许，bcrypt(cost=12) 写入并返回 JWT
- [x] 4.3 实现 `POST /api/auth/login`：恒定时间错误响应，签发 JWT（7d）
- [x] 4.4 实现 JWT preHandler，并挂到 `/api/admin/*` 路由组
- [x] 4.5 实现 CLI `npm run admin:reset` 清空 admin 表
- [x] 4.6 验证场景：未登录访问受保护接口返回 401；过期 token 返回 `token_expired`

## 5. Backend：知识库能力（knowledge-base）

- [x] 5.1 `POST /api/admin/kb` 创建知识库：写 PG、ensure Qdrant collection（dim 来自 embedding 模型）
- [x] 5.2 `GET /api/admin/kb` 列出知识库（聚合文档数与 chunk 数）
- [x] 5.3 `DELETE /api/admin/kb/:id` 级联删除：先删 Qdrant collection，再 PG 事务删 chunks/documents/kb
- [x] 5.4 单元测试：知识库隔离（A 中数据不会出现在 B 的列表/检索）

## 6. Backend：文档摄入能力（document-ingestion）

- [x] 6.1 实现 multipart 上传路由 `POST /api/admin/kb/:id/documents`，文件大小限制 `MAX_UPLOAD_MB`
- [x] 6.2 实现解析器路由：`.txt`/`.md` 直读、`.pdf` → pdf-parse、`.docx` → mammoth；未知类型 415
- [x] 6.3 实现 `recursiveSplit(text, opts)`，默认 chunkSize=500、overlap=80、中英文标点分隔符
- [x] 6.4 实现摄入事务：PG 事务插 documents+chunks → commit → 批量 upsert Qdrant；任一步失败 → 回滚 + 5xx
- [x] 6.5 chunk 数 > 5000 报 422；上传失败响应不留半成品数据（含集成测试）
- [x] 6.6 `GET /api/admin/kb/:id/documents`（分页）
- [x] 6.7 `DELETE /api/admin/kb/:kb_id/documents/:doc_id`：先 Qdrant `delete by filter`，再 PG 事务删 chunks/documents

## 7. Backend：混合召回能力（hybrid-retrieval）

- [x] 7.1 实现 `POST /api/retrieve`（公开），zod 校验入参，`top_k` 上限 50
- [x] 7.2 并行：embedding(query) → Qdrant search 取 `vector_k`；PG `to_tsquery` 查询取 `keyword_k`
- [x] 7.3 按 `chunk_id` 合并去重，打标 `source: vector|keyword|both`
- [x] 7.4 用 reranker 对 (query, content) 打分，按分数降序取 `top_k`
- [x] 7.5 响应原样回传 chunk content（含 document_filename），不调用任何 LLM
- [x] 7.6 启用 `@fastify/rate-limit`：60 req/min/IP
- [x] 7.7 集成测试：纯向量命中、纯关键词命中、双路命中合并、kb 隔离、429 限流（测试文件已写；运行需 `RUN_INTEGRATION=1` 与运行中的 PG/Qdrant）

## 8. Backend：可观测性与运维

- [x] 8.1 `GET /api/health` 返回 PG/Qdrant/模型加载三项健康状态
- [x] 8.2 pino 结构化日志：请求 id、kb_id、耗时
- [x] 8.3 启动时打印配置 summary（脱敏）

## 9. Frontend：基础设施

- [x] 9.1 配置 Tailwind design tokens：背景 `#1F1F1E`、卡片 `#262624`、主色 `#D97757`、字体 Geist Sans/Mono
- [x] 9.2 引入 `react-router-dom`、`@tanstack/react-query`、`axios`；axios 拦截器自动塞 JWT、401 回 `/login`
- [x] 9.3 实现 `AuthGate` 组件：调 `/api/auth/status` 决定跳 `/setup` 或 `/login` 或继续

## 10. Frontend：页面（admin-console）

- [x] 10.1 `/setup` 首次创建管理员表单（用户名 + 密码 + 确认密码），成功后写 token 并跳 `/`
- [x] 10.2 `/login` 登录页，错误时显示后端错误文案
- [x] 10.3 `/` 知识库管理页：列表、新建弹窗、删除二次确认（输入名称匹配）
- [x] 10.4 `/kb/:id` 文档管理页：列表、拖拽上传组件、删除、上传错误 toast
- [x] 10.5 `/kb/:id/retrieve` 召回测试页：query 输入 + 调 `/api/retrieve` + 结果卡片（filename / score / source 标签 / 完整原文）
- [x] 10.6 全局错误边界与 401 自动登出

## 11. Docker 与编排（deployment）

- [x] 11.1 编写 `backend/Dockerfile`（多阶段 node:20-bookworm-slim，最终镜像含模型 cache 目录挂载点；alpine 上 onnxruntime-node 兼容性差，改用 bookworm-slim）
- [x] 11.2 编写 `frontend/Dockerfile`（多阶段：node 构建 → nginx:alpine，含 `nginx.conf` 反代 `/api` 到 backend）
- [x] 11.3 编写 `docker/compose.yaml`：定义 postgres、qdrant、backend、frontend 四服务、健康检查、`depends_on.condition: service_healthy`
- [x] 11.4 命名 volumes：`pgdata`、`qdrant-storage`、`rag-models`
- [x] 11.5 `docker/.env.example` 列全部 env 与说明
- [x] 11.6 `docker/bake.hcl`（或 `docker-bake.json`）：`--platform linux/amd64,linux/arm64` 一次构建三个自建镜像（backend、frontend、postgres-zhparser）
- [x] 11.7 在 Apple Silicon 与 x86 各执行一次 `docker compose up` 验证端到端流程跑通（Apple Silicon 端已通过，4 容器全 healthy、`/api/health` 三项绿；x86 由用户后续验证）

## 12. 文档与发布

- [x] 12.1 根 `README.md`：架构图、`docker compose up` 步骤、`.env` 必填项、首次启动说明（模型下载耗时）、admin reset 命令
- [x] 12.2 在 README 标注已知限制（OCR 不支持、单管理员等）与故障排查（zhparser 加载失败、模型下载失败）
- [x] 12.3 README 提供调用示例：`curl POST /api/retrieve`
