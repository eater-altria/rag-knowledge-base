## Why

团队需要一个自托管、离线可用的 RAG 知识库系统，用来对内部文档做向量+关键词混合检索，把检索结果原文回传给上游应用（不做 AI 汇总）。目前没有现成系统满足"多知识库隔离、本地 embedding、跨架构 Docker 部署、零外部依赖"这几个组合需求，因此从零搭建。

## What Changes

- 新增一个 Node.js + React 的全栈 RAG 系统，包含管理后台与公开召回 API。
- 支持创建/删除多个相互隔离的知识库（namespace），文档归属于某个知识库。
- 文档上传支持 `.txt` / `.md` / `.pdf` / `.docx`；上传后同步切分、向量化、入库（不入异步队列）。
- 检索接口走向量召回 + 关键词召回（中英文，PG `zhparser` + tsvector），再用本地 reranker 重排，返回原始切片文本（不做 LLM 摘要）。
- 文档删除：同时清理 PostgreSQL 原文/元数据与 Qdrant 向量。
- 管理后台：知识库管理、文档浏览/删除、召回测试三大页面，UI 风格对齐 Claude Code 官网（黑底 / 暖橙强调色 / 等宽字体 / 简洁卡片）。
- 鉴权：单一管理员账号，凭证存 PostgreSQL（bcrypt），首次访问引导创建；JWT 鉴权；**召回接口公开，其他接口必须管理员登录**。
- 部署：`docker compose up` 一键启动，多容器（backend / postgres / qdrant / frontend），所有自构建镜像通过 `docker buildx` 同时产出 `linux/amd64` 和 `linux/arm64`，在 Apple Silicon 与 x86 Windows 上都能跑。

## Capabilities

### New Capabilities

- `knowledge-base`: 知识库（namespace）的创建、列表、删除及隔离语义。
- `document-ingestion`: 文档上传、解析、切分、向量化、入库的同步流水线。
- `hybrid-retrieval`: 向量 + 关键词混合召回、本地 reranker 重排、原文返回的公开 API。
- `admin-auth`: 单管理员账号创建、登录、JWT 会话与受保护接口的鉴权机制。
- `admin-console`: React 管理后台（知识库/文档/召回测试页面）与首次进入引导。
- `deployment`: 多架构（amd64/arm64）Docker 镜像与 docker compose 一键部署编排。

### Modified Capabilities

无（全新项目，仓库目前没有任何已存在的 spec）。

## Impact

- **代码**：在仓库根新增 `backend/`（Node + TypeScript）、`frontend/`（Vite + React + TS）、`docker/`（Dockerfile、compose、初始化 SQL）三个顶层目录。
- **依赖**：
  - Backend：`fastify`、`@fastify/jwt`、`@fastify/multipart`、`pg`、`@qdrant/js-client-rest`、`@xenova/transformers`（BGE 系列模型，ONNX runtime）、`pdf-parse`、`mammoth`、`bcrypt`、`zod`。
  - Frontend：`react`、`react-router`、`tanstack-query`、`tailwindcss`、`lucide-react`。
- **基础设施**：引入 PostgreSQL 16（启用 `vector`、`zhparser` 扩展可选；本方案 vector 走 Qdrant，PG 仅做 tsvector 关键词检索）与 Qdrant 1.x 两个外部服务，均以官方多架构镜像运行。
- **模型资产**：首次启动需下载 BGE embedding + reranker 模型权重（~600MB），通过命名 volume 持久化，避免每次重建容器重复下载。
- **API 契约**：对外暴露 `POST /api/retrieve`（公开）与一组 `/api/admin/*` 受保护接口；管理后台以 SPA 形式部署。
