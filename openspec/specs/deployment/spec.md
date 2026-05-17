## Requirements

### Requirement: docker compose 一键启动
系统 SHALL 提供 `docker/compose.yaml`，使用户在仓库根目录执行 `docker compose -f docker/compose.yaml up -d` 即可启动 backend、frontend、postgres、qdrant 四个服务，无需任何额外手动步骤（仅需先复制 `.env.example` 为 `.env` 填密钥）。

#### Scenario: 全新机器单命令启动
- **WHEN** 用户在干净的 Docker 环境执行启动命令
- **THEN** 四个容器先后启动，健康检查全部通过后，浏览器访问 `http://localhost:8080` 可见 setup 引导页

#### Scenario: 缺失必填环境变量
- **WHEN** `.env` 未设置 `POSTGRES_PASSWORD` 或 `JWT_SECRET`
- **THEN** backend 启动时立即退出并在日志输出明确缺失项

### Requirement: 多架构镜像
系统的所有自构建镜像（`rag-backend`、`rag-frontend`、必要时的 `rag-postgres-zhparser`）MUST 通过 `docker buildx` 同时构建 `linux/amd64` 与 `linux/arm64`，可在 Apple Silicon Mac 与 x86 Windows/Linux 上原生运行（无需模拟）。

#### Scenario: 在 Apple Silicon 上运行
- **WHEN** 在 M 系列 Mac 上 `docker compose up`
- **THEN** Docker 拉取/构建 arm64 架构镜像并运行，不出现 `exec format error`

#### Scenario: 在 x86 Windows 上运行
- **WHEN** 在 x86 Windows 上 `docker compose up`
- **THEN** Docker 拉取/构建 amd64 架构镜像并运行

#### Scenario: CI / 发布构建
- **WHEN** 执行 `docker buildx bake -f docker/bake.hcl` 或等价命令
- **THEN** 每个自构建镜像输出 manifest list，含 `linux/amd64` 与 `linux/arm64` 两个 platform 条目

### Requirement: 数据持久化
系统 MUST 通过命名 Docker volumes 持久化 PostgreSQL 数据、Qdrant 数据、本地 embedding/reranker 模型权重，使 `docker compose down`（不带 `-v`）+ `up` 不丢失任何数据或重新下载模型。

#### Scenario: 停启不丢数据
- **WHEN** `docker compose down` 后再次 `up`
- **THEN** 之前创建的知识库、文档、向量、管理员账户、已下载模型全部保留

#### Scenario: 显式清理
- **WHEN** `docker compose down -v`
- **THEN** 命名 volumes 被一并删除，重新 `up` 时回到全新状态

### Requirement: 健康检查与启动顺序
系统 MUST 为每个服务定义健康检查：postgres 用 `pg_isready`、qdrant 用 `GET /readyz`、backend 用 `GET /api/health`；frontend 容器 MUST `depends_on: { backend: { condition: service_healthy } }`。

#### Scenario: 后端等待数据库就绪
- **WHEN** postgres 容器首次初始化耗时较长
- **THEN** backend 容器在 postgres `healthy` 之前不会启动业务循环；compose 视图中可见每个服务的健康状态

### Requirement: 数据库初始化
系统 MUST 提供 PostgreSQL 初始化 SQL（挂载到 postgres 容器 `/docker-entrypoint-initdb.d/`），首次启动自动创建 `admin`、`knowledge_bases`、`documents`、`chunks` 表，并启用 `zhparser` 中文分词扩展与对应 text search configuration `chinese_zh`，且在 `chunks.content` 上创建 GIN 全文索引。

#### Scenario: 首次启动建表
- **WHEN** 全新卷启动 postgres
- **THEN** 上述表与扩展均存在，`SELECT to_tsvector('chinese_zh', '产品发布会')` 能正确分词

### Requirement: 配置与密钥
系统 MUST 提供 `docker/.env.example`，列出全部可配置环境变量及示例值；compose 文件 MUST 通过 `env_file: .env` 读取，不在 yaml 中硬编码密钥。

#### Scenario: 文档化所有变量
- **WHEN** 用户查看 `.env.example`
- **THEN** 文件含 `POSTGRES_PASSWORD`、`JWT_SECRET`、`EMBEDDING_MODEL`、`RERANKER_MODEL`、`MAX_UPLOAD_MB`、`CHUNK_SIZE`、`CHUNK_OVERLAP`、`HTTP_PORT` 等条目并附简要说明
