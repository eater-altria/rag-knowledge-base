## Context

仓库目前是空的（只有 `openspec/` 骨架），需要从零搭一个自托管 RAG 知识库。技术栈被用户锁定为 Node.js + React，部署形态为 Docker compose 多容器、镜像必须同时支持 `linux/amd64` 与 `linux/arm64`。Embedding 与 reranker 都跑本地模型（用户选项），向量库使用 Qdrant，元数据 + 原文使用 PostgreSQL，文档语言以中文为主、兼顾英文，召回接口公开、其它接口需管理员鉴权。

## Goals / Non-Goals

**Goals:**
- 一份 `docker compose up` 就能跑起来的完整产物（含初始化 SQL、模型 volume、健康检查）。
- 多知识库逻辑隔离：所有数据按 `kb_id` 分区/过滤；删知识库即清空其全部文档与向量。
- 文档上传后**同步**完成抽取→切分→向量化→入库，接口返回时数据已可检索（非异步队列）。
- 召回 = 向量召回(top-N) ⊕ 关键词召回(top-N) → 去重合并 → reranker 重排 → 返回原文切片。
- 单管理员账户 + JWT，召回接口完全公开，其它接口必须 Bearer token。
- 前端风格对齐 Claude Code 官网：近黑背景 / 暖橙强调色 (#D97757) / 等宽 Geist Mono / 卡片留白克制。
- 任何自构建镜像通过 `docker buildx --platform linux/amd64,linux/arm64` 同时出双架构。

**Non-Goals:**
- 不做 LLM 摘要、不做 chat 接口（仅返回原文 chunk）。
- 不做多管理员/RBAC/审计日志，只有一个 admin。
- 不做异步任务队列、不引入 Redis；上传走同步阻塞（接受单文档处理延迟）。
- 不做大规模分布式部署（百万级向量以下场景）。
- 不做 OCR、扫描件 PDF（仅文本型 PDF）、不做表格/图片提取。
- 不做模型微调，仅消费 HuggingFace 上已有的 BGE 系列权重。

## Decisions

### 1. 后端框架：Fastify (TypeScript)
- **Why**：原生 schema 校验（与 zod 集成顺）、JSON 解析快、生态有 `@fastify/multipart`、`@fastify/jwt`、`@fastify/static`，与本项目需求几乎一一对应。
- **Alternatives**：Express（生态最大但中间件链冗长，缺原生类型）、NestJS（重，需要 DI/装饰器，过度工程）。Fastify 是甜点。

### 2. Embedding & Reranker：transformers.js + ONNX
- **模型**：`Xenova/bge-base-zh-v1.5`（768 维，中英文）做 embedding；`Xenova/bge-reranker-base` 做重排。两个都是 ONNX 量化版本，在 ARM64 与 x86 上都能跑，CPU 即可。
- **运行方式**：`@xenova/transformers` 在 Node 进程内通过 `onnxruntime-node` 推理；模型在容器首次启动时自动下载到 `/app/models`，挂载命名 volume `rag-models` 持久化，重建容器不重复下载。
- **Why not Ollama 独立容器**：用户在选项里选了"transformers.js 方案"。少一个容器、少一次 HTTP 跨进程开销。
- **Why not OpenAI**：用户要求离线 / 无外部 API key。
- **风险**：首次模型下载 ~600MB（base 模型），冷启动慢；通过 healthcheck + 启动期日志缓解。如果以后要换更大的 BGE-M3，只改环境变量 `EMBEDDING_MODEL` / `RERANKER_MODEL` 即可。

### 3. 数据存储：PostgreSQL 16 + Qdrant 1.x
- **PostgreSQL** 存知识库、文档元数据、chunk 原文、管理员账号。chunk 表保留 `content` 与 `tsvector`（GIN 索引）字段供关键词召回。
- **Qdrant** 每个知识库一个 collection（命名 `kb_<id>`），向量维度跟随 embedding 模型；payload 里冗余 `chunk_id` 用于回查 PG。
- **Why 双库**：用户在 AskUserQuestion 中明确选了该方案；Qdrant 的 HNSW 在 100k+ 向量量级查询稳定快，与 PG 的关系/全文检索能力互补。
- **一致性策略**：所有写操作以 PG 为真源，先写 PG → 再写 Qdrant；删除反向：先删 Qdrant，再删 PG（即使 Qdrant 删除失败也安全，因为没了 PG 记录就召回不到孤儿向量；上线后跑后台清理脚本最终一致即可）。失败回滚逻辑放在 service 层。

### 4. 关键词检索 / 中文分词
- PG 14+ 自带的 `simple` tokenizer 对中文支持差。采用 **`zhparser` 扩展**（基于 SCWS），在 init SQL 中 `CREATE EXTENSION zhparser; CREATE TEXT SEARCH CONFIGURATION chinese_zh (PARSER = zhparser);`。
- chunk 表上 `tsv tsvector GENERATED ALWAYS AS (to_tsvector('chinese_zh', content)) STORED` + `GIN(tsv)` 索引。
- 查询时 `plainto_tsquery('chinese_zh', $1) @@ tsv`，按 `ts_rank` 排序拿 top-N。
- **Alternative**：MeiliSearch 独立容器 — 多一个容器，得不偿失。

### 5. 召回流程（hybrid retrieval）
1. 入参：`kb_id`、`query`、`top_k`（默认 10）、`vector_k`/`keyword_k`（默认各 20）。
2. 并行：向量查 Qdrant 拿 `vector_k`；关键词查 PG 拿 `keyword_k`。
3. 按 `chunk_id` 去重合并；如果只有一路命中也保留。
4. 取候选 chunk 的 `content` 喂 reranker（cross-encoder 打分），按分数降序取 `top_k`。
5. 返回 `[{chunk_id, document_id, kb_id, content, score, source: 'vector'|'keyword'|'both'}]`，**原样返回 content，不做摘要**。

### 6. 文档处理流水线（同步）
- 解析器路由：`.txt`/`.md` 直读；`.pdf` 用 `pdf-parse`；`.docx` 用 `mammoth.extractRawText`。
- 切分：自实现 `recursiveSplit(text, {chunkSize: 500, overlap: 80, separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', '']})`，对中文标点优先断句。
- Embedding：分批 32 条调 transformers.js pipeline；每个 chunk 拿到 768-d float32 向量。
- 写库：在一个 PG 事务中插 `documents` + `chunks` 两表 → commit 后再批量 upsert 到 Qdrant。上传接口在全部完成后才返回 200。
- **上传体积限制**：单文件 ≤ 50MB（multipart 限制）；超长文档解析后切片数 > 5000 报错（防止误传日志/数据库 dump）。

### 7. 鉴权：单 admin + JWT
- 启动时 `GET /api/auth/status` 返回 `{ initialized: boolean }`；前端若 `initialized = false` 强制跳到 setup 页。
- `POST /api/auth/setup` 仅当 admin 表为空时可调，写入 bcrypt(cost=12) 哈希。
- `POST /api/auth/login` 返回 JWT（HS256，secret 来自 env `JWT_SECRET`，默认有效期 7d）。
- Fastify 路由分两组：`/api/retrieve` 公开；其余 `/api/admin/*` 注册 `preHandler` 做 JWT 校验。
- 不做 refresh token / session 撤销（单人系统不必要）；改密码即修改 hash。

### 8. 前端：Vite + React 18 + TypeScript + TailwindCSS
- **路由**：`react-router-dom` v6；`/setup`、`/login`、`/`（知识库列表）、`/kb/:id`（文档列表）、`/kb/:id/retrieve`（召回测试）。
- **数据层**：`@tanstack/react-query` 管理服务端状态；axios 拦截器自动塞 JWT、401 时回登录页。
- **样式**：Tailwind + 自定义 design token：背景 `#1F1F1E`、卡片 `#262624`、主色 `#D97757`、字体 `Geist Sans` + `Geist Mono`，紧贴 Claude Code 官网视觉。
- **构建产物**：`vite build` → 静态文件由独立 `nginx:alpine`（多架构官方镜像）容器服务，反代 `/api` 到 backend，避免 CORS。

### 9. Docker / Compose 编排
四个容器：
| 服务 | 镜像 | 多架构 |
|------|------|--------|
| `postgres` | `postgres:16-alpine` | 官方多架构 |
| `qdrant`   | `qdrant/qdrant:v1.12.0` | 官方多架构 |
| `backend`  | 自构建 `rag-backend` (node:20-alpine 基) | `buildx --platform linux/amd64,linux/arm64` |
| `frontend` | 自构建 `rag-frontend` (多阶段：node 构建 → nginx:alpine 提供) | `buildx --platform linux/amd64,linux/arm64` |

- 自构建镜像用 `docker buildx bake -f docker/bake.hcl --push` 一次产双架构；本地开发可 `docker compose build` 走当前平台。
- 命名 volumes：`pgdata`、`qdrant-storage`、`rag-models`（共享给 backend，存模型权重）。
- 健康检查：postgres `pg_isready`、qdrant `/readyz`、backend `/api/health` 等绿后 frontend 才启动。
- Compose 文件包含 `.env.example`：`POSTGRES_PASSWORD`、`JWT_SECRET`、`EMBEDDING_MODEL`、`RERANKER_MODEL` 等。

### 10. 配置与环境变量
| 名称 | 默认 | 说明 |
|------|------|------|
| `POSTGRES_HOST` | `postgres` | compose 内服务名 |
| `POSTGRES_PASSWORD` | — | 必填 |
| `QDRANT_URL` | `http://qdrant:6333` | |
| `JWT_SECRET` | — | 必填，≥32 字符 |
| `EMBEDDING_MODEL` | `Xenova/bge-base-zh-v1.5` | |
| `RERANKER_MODEL` | `Xenova/bge-reranker-base` | |
| `MAX_UPLOAD_MB` | `50` | |
| `CHUNK_SIZE` | `500` | 字符数 |
| `CHUNK_OVERLAP` | `80` | |

## Risks / Trade-offs

- **[模型冷启动慢]** → 首次拉镜像后第一次启动需下载 ~600MB 模型；用命名 volume 持久化避免重复下载，并在 README 注明"首次启动等待 1-3 分钟"。
- **[ONNX 在 ARM64 性能]** → `onnxruntime-node` 1.18+ 已支持 ARM64 NEON；Apple Silicon 实测中文 embedding ~30ms/条，可接受。如果性能不达标，回退方案是切换 Ollama 独立容器（已在 design 中标注路径）。
- **[同步上传导致大文件 HTTP 超时]** → multipart 限 50MB；如果实际文档超大，前端在上传卡 30s 后给提示但保持等待，超过 5 分钟 504。后续可改异步任务，但当前规模不必要。
- **[zhparser 扩展可移植性]** → `postgres:16-alpine` 默认不含 zhparser，需要自定义 Dockerfile（基于官方镜像 apk add 编译）；编译产物同样要双架构。若编译复杂度过高，回退方案是用 `pg_jieba` 或纯 ngram 索引。这是计划中第一周需要验证的点。
- **[PG 与 Qdrant 一致性]** → 写失败回滚已覆盖；崩溃场景下可能留下"PG 有 chunk、Qdrant 没向量"或反之，提供 `npm run consistency-check` 脚本（M3 阶段输出）做最终一致清理。
- **[单管理员账号丢失密码]** → 提供 `docker compose exec backend npm run admin:reset` 命令清空 admin 表，重新走 setup 流程。
- **[前端打包体积]** → react + tanstack + tailwind 预计 gzip 后 < 200KB，可接受。
- **[安全]** → JWT_SECRET 弱会导致 token 伪造，启动时校验长度 ≥ 32；bcrypt cost 12 平衡安全与登录延迟；上传文件名做路径穿越过滤；rate-limit 召回接口（`@fastify/rate-limit`，默认 60 req/min/IP），防止滥用。

## Migration Plan

不涉及数据迁移（全新项目）。部署路径：
1. clone 仓库 → `cp docker/.env.example docker/.env` 填密钥。
2. `docker compose -f docker/compose.yaml up -d` （首次会 build 镜像 + 拉模型）。
3. 浏览器开 `http://localhost:8080`，按引导创建 admin。
4. 创建知识库 → 上传文档 → 召回测试。

**回滚**：直接 `docker compose down -v` 清理；没有线上历史数据需要保留。

## Open Questions

- **zhparser 镜像编译**：是否能在 `postgres:16-alpine` 上 musl 编译通过？若不行就基于 `postgres:16-bookworm`，镜像变大但稳定。决定放在实现阶段第 1 周验证。
- **reranker batch size**：transformers.js cross-encoder 在 CPU 上的最佳 batch size 待实测（候选 8 / 16 / 32），先以 16 起步。
- **embedding 模型升级路径**：BGE-M3（多语 + 8k token）效果更好但 ~2GB，是否做成可选大模型方案？先不做，留口子。
