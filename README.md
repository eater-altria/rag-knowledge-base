# RAG Knowledge Base

自托管、离线可用的 RAG 知识库。多知识库隔离 / 本地 BGE embedding + reranker / Postgres + Qdrant 双库 / Node + React / Docker compose 一键启动 / amd64 + arm64 双架构。

## 架构

```
┌─────────────┐   /api proxy   ┌──────────────┐
│  frontend   │ ─────────────▶ │   backend    │ (Fastify + TS)
│  React+Vite │                │  - auth/JWT  │
│   nginx     │                │  - ingestion │
└─────────────┘                │  - retrieval │
                               │  - BGE 模型   │
                               └─────┬────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   ┌────────────┐        ┌─────────────┐
                   │ PostgreSQL │        │   Qdrant    │
                   │ + zhparser │        │  (vectors)  │
                   │ 元数据/原文 │        └─────────────┘
                   └────────────┘
```

## 环境准备（零基础）

这套系统只需要两样东西：**Docker** 和 **make**。下面分平台说怎么装。装完一次以后不用再管。

### 1. 安装 Docker

Docker 用来跑 Postgres / Qdrant / 后端 / 前端这 4 个容器。

**macOS（Intel 或 Apple Silicon）**

下载 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，双击安装；首次启动会要求授权。安装好后菜单栏出现鲸鱼图标 = 正在跑。

也可以用 Homebrew：

```bash
brew install --cask docker
open -a Docker     # 启动 Docker Desktop
```

**Windows 10/11**

1. 先打开 WSL2（[官方步骤](https://learn.microsoft.com/zh-cn/windows/wsl/install)）：`wsl --install`，按提示重启。
2. 下载并安装 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)，安装时勾上 "Use WSL 2 instead of Hyper-V"。
3. 装完启动 Docker Desktop，等到鲸鱼图标变成"running"。

> 建议在 PowerShell 或 WSL 里跑命令，CMD 也行但路径写法会折腾。

**Linux**

```bash
# Debian/Ubuntu 一行装好：
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 让当前用户免 sudo 用 docker
newgrp docker                    # 立即生效（或者退出重登）
```

**验证 Docker 安装成功：**

```bash
docker --version              # 输出 Docker version 20.x+ 即可
docker compose version        # 输出 Docker Compose version v2.x+
docker run --rm hello-world   # 看到 "Hello from Docker!" 说明能跑
```

> 必须看到 `docker compose version`（注意是空格，不是 `docker-compose` 横杠）。如果只装了老版本的 `docker-compose`（横杠版），升级到 Docker 24+ 自带 `docker compose` 子命令。

### 2. 安装 make

`make` 用来读 `Makefile`，把 `make up` 翻译成几行长 docker compose 命令。**可选**——不装也能用，下面会写等价命令。

**macOS**

自带 BSD make，但通常你已经装了 Xcode Command Line Tools：

```bash
xcode-select --install   # 首次需要，会弹窗确认
make --version           # 看到 GNU Make 3.x 即可
```

**Windows**

最简单：在 WSL2 里装（Linux 命令）：

```bash
sudo apt update && sudo apt install -y make
```

或者用 Chocolatey 在原生 Windows 装：

```powershell
choco install make
```

**Linux**

```bash
sudo apt install -y make    # Debian/Ubuntu
sudo dnf install -y make    # Fedora/RHEL
```

**验证：**

```bash
make --version    # 输出 GNU Make 3.x 或 4.x
```

### 3. 不想装 make 怎么办？

每个 `make xxx` 都等价于一条 `docker compose` 命令，直接抄下面这张表即可：

| Make 命令 | 等价的 docker 命令 |
|-----------|------------------|
| `make up` | `docker compose -f docker/compose.yaml up -d` |
| `make down` | `docker compose -f docker/compose.yaml down` |
| `make logs` | `docker compose -f docker/compose.yaml logs -f` |
| `make ps` | `docker compose -f docker/compose.yaml ps` |
| `make build` | `docker compose -f docker/compose.yaml build` |
| `make clean` | `docker compose -f docker/compose.yaml down -v` |
| `make reset-admin` | `docker compose -f docker/compose.yaml exec backend npm run admin:reset` |
| `make build-images` | `docker buildx bake -f docker/bake.hcl --load` |

下面的"快速开始"和命令表都用 `make` 写，看不顺眼直接替换成上面的等价命令即可。

## 快速开始

确认 Docker 在跑（鲸鱼图标 / `docker ps` 不报错），然后：

```bash
# 1. 拿到代码
git clone https://github.com/eater-altria/rag-knowledge-base.git
cd rag-knowledge-base

# 2. 复制环境变量模板
cp docker/.env.example docker/.env

# 3. 编辑 docker/.env：至少改 POSTGRES_PASSWORD 和 JWT_SECRET（>= 32 字符）
#    macOS/Linux 用 nano 或 vim
#    Windows 用 notepad docker\.env
#    JWT_SECRET 可以这样生成一个：
#       openssl rand -hex 32     （macOS/Linux/WSL）

# 4. 启动
make up
```

浏览器打开 http://localhost:3000 → 按引导创建管理员账户。

> **首次启动** 会编译 Postgres 的 zhparser 扩展、拉取 BGE 模型权重（约 600MB），可能需要 5–10 分钟（取决于网速）。看 `make logs` 等到日志里出现 `rag-backend listening` 即可。后续重启走缓存几秒内完成。

常用命令：

```bash
make up            # 启动
make down          # 停止（保留数据）
make clean         # 停止并清空 volume（含模型缓存，下次启动会重新下载）
make logs          # 实时日志（Ctrl+C 退出，不会停容器）
make ps            # 看容器状态
make reset-admin   # 清空管理员账户，下次访问会重新引导 setup
make build-images  # 用 buildx 构建多架构镜像（本地 load）
make push-images   # 同上，但 push 到 registry
```

### 常见安装坑

| 现象 | 原因 / 处理 |
|------|------|
| `docker: command not found` | Docker Desktop 没启动，或没装 — 回到上面"安装 Docker"步骤 |
| Windows 上 `make` 报 `bash` / 路径错误 | 在 **WSL2 终端** 里跑，不要在 PowerShell/CMD 里跑 make |
| `make up` 报 `Cannot connect to the Docker daemon` | Docker Desktop 没启动，启动后等鲸鱼图标变绿再试 |
| `make: docker compose: No such file or directory` | Docker 太老了，升级到 24+，或者老版本用 `docker-compose`（横杠）替换 |
| 端口 3000 被占用 | 改 `docker/.env` 的 `HTTP_PORT=3000` 为其他值（比如 8080）再 `make up` |

## 局域网访问

容器默认就绑到 `0.0.0.0:3000`，同一局域网的其它设备（手机、另一台电脑）直接访问 `http://<宿主机IP>:3000` 即可，**不需要改任何代码**。

### 三步

1. **查宿主机的局域网 IP**

   ```bash
   # macOS / Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   # 或
   ipconfig getifaddr en0      # macOS Wi-Fi
   hostname -I                  # Linux

   # Windows
   ipconfig                     # 看 "IPv4 地址"
   ```

   假设拿到 `192.168.1.100`。

2. **从其它设备访问**

   - 浏览器：`http://192.168.1.100:3000`
   - 召回 API：`curl http://192.168.1.100:3000/api/retrieve ...`
   - MCP 客户端配置里的 `url` 也换成 `http://192.168.1.100:3000/mcp`

3. **放行防火墙**（如有）

   ```bash
   # macOS：系统设置 → 网络 → 防火墙 → 允许 Docker 接收入站连接
   # Windows：首次访问会弹"允许 Docker Desktop 通过防火墙"，勾上 "专用网络"
   # Ubuntu：
   sudo ufw allow 3000/tcp
   ```

### 暴露到非可信网络的注意事项

如果不只是家庭/办公局域网而是更大范围（比如办公室共享 WiFi 或要走 VPN），建议：

- `JWT_SECRET` 用 `openssl rand -hex 32` 生成强随机串
- 管理员密码 ≥ 12 位
- `RETRIEVE_RATE_PER_MIN` 调小，或在 `frontend/nginx.conf` 给 `/mcp` 加 `limit_req_zone`
- **不要直接暴露公网**——召回接口和 MCP 接口本身公开无鉴权，会被滥用。要公网用就套一层 Cloudflare Tunnel / Tailscale，或在 nginx 加 Basic Auth

### 稳定域名 `rag.local`

上一节解决了「能在局域网访问」，但 DHCP 给的 IP 会变（重启路由器 / 服务器换网 / 换办公区都可能变）。如果客户端配置里写死 IP，IP 一变全员失效。

约定一个**稳定的逻辑域名 `rag.local`**——所有 MCP 客户端配置、脚本、skill 文件里固定写 `http://rag.local:3000`，**只在部署侧做一次解析配置**，以后 IP 怎么变都不用改任何客户端。

#### 方案对比

| 方案 | 一次性配置在 | 客户端零配置 | 局限 |
|------|------------|------------|------|
| **A. mDNS 广播** | 服务机器（跑一个 publisher 进程） | ✓ | 客户端要支持 mDNS；不跨网段 |
| **B. hosts 文件** | 每台客户端 | ✗ | 客户端多了维护烦；但跨网段、跨平台兜底最稳 |
| **C. 内网 DNS** | 路由器/DNS 服务器 | ✓ | 需要有可控的内网 DNS |

家庭/小办公场景推荐 **A**，企业有内网 DNS 推荐 **C**，**B** 是兜底。下面写 A 和 B，C 自行加一条 A record 即可。

---

#### 方案 A：mDNS 广播（推荐）

在**服务机器**（跑 `make up` 那台）上运行 publisher。**任选一个**：

**Shell 版（macOS / Linux）**

```bash
./tools/mdns-publish.sh         # 前台运行；Ctrl+C 退出
```

依赖系统自带 `dns-sd`（macOS）或 `avahi-publish`（Linux 装 `avahi-utils`）。

**Python 版（macOS / Linux / Windows，跨平台）**

```bash
pip install zeroconf            # 一次性
python tools/mdns_publish.py    # 前台运行；Ctrl+C 退出
```

Windows 上**只能用这个**（没有原生 `dns-sd`/`avahi-publish`）。也是给跨平台团队的统一选项。两个脚本行为等价、自动 detect 本机局域网 IP，把 `rag.local` 广播到 LAN。同局域网内任何支持 mDNS 的设备（macOS / iOS 原生、Linux 装了 Avahi、Windows 装了 Bonjour）直接能 ping `rag.local`、curl `rag.local:3000`，**不需要在客户端做任何配置**。

**让它一直在后台跑**

前台跑要一直开着终端，重启就没了。包成系统服务：

**macOS（launchd）** — 新建 `~/Library/LaunchAgents/com.rag.mdns.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.rag.mdns</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOUR_NAME/projects/rag-repo/tools/mdns-publish.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/rag-mdns.log</string>
  <key>StandardErrorPath</key><string>/tmp/rag-mdns.log</string>
</dict>
</plist>
```

加载：

```bash
launchctl load ~/Library/LaunchAgents/com.rag.mdns.plist
launchctl list | grep rag   # 看到 com.rag.mdns 就 OK
# 卸载: launchctl unload ~/Library/LaunchAgents/com.rag.mdns.plist
```

**Linux（systemd）** — 新建 `/etc/systemd/system/rag-mdns.service`：

```ini
[Unit]
Description=RAG mDNS publisher
After=network.target avahi-daemon.service
Requires=avahi-daemon.service

[Service]
ExecStart=/path/to/rag-repo/tools/mdns-publish.sh
Restart=always
User=YOUR_USER

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rag-mdns
sudo systemctl status rag-mdns
```

**快速后台（不做服务化）**：

```bash
nohup ./tools/mdns-publish.sh > /tmp/rag-mdns.log 2>&1 &
```

#### 平台兼容矩阵

| 平台 | Shell publisher | Python publisher | 作为客户端解析 `rag.local` |
|------|---------------|-----------------|------------------------|
| macOS | ✓（dns-sd 自带） | ✓ | ✓（原生 mDNS） |
| Linux + Avahi | ✓（`sudo apt install avahi-utils`） | ✓ | ✓（原生 mDNS） |
| **Windows** | ✗ | ✓（`pip install zeroconf`） | 需装 [Bonjour Print Services](https://support.apple.com/kb/dl999)；不装就走方案 B |
| WSL2（Windows 上） | ✓（在 Linux 子系统里） | ✓ | 见下方说明 |
| iOS / Android | — | — | iOS 原生支持；Android 部分版本要 app 支持 |

> **Windows 上想用 Shell 版？** 进 WSL2 跑 — 但默认 NAT 网络下 WSL 里的 publisher 广播的是 WSL 子网 IP（172.x.x.x），局域网设备得到的地址不可达。Windows 11 + WSL 2.0+ 可以在 `%UserProfile%\.wslconfig` 里设 `[wsl2]\nnetworkingMode=mirrored` 解决（WSL 跟 Windows 共享网络命名空间）。**更简单的方案是直接在 Windows 上跑 Python publisher**。

---

#### 方案 B：hosts 文件（兜底）

如果不想跑后台进程，或者客户端有 Windows 没装 Bonjour、或者跨网段，在**每台需要访问的客户端机器**上加一行：

```
# macOS / Linux: /etc/hosts                              （sudo 编辑）
# Windows: C:\Windows\System32\drivers\etc\hosts        （管理员权限）

192.168.1.100   rag.local       # 把 IP 换成 RAG 服务实际地址
```

服务机器自己也加 `127.0.0.1 rag.local`，本机和别的设备就用同一个 URL，配置统一。

---

#### 验证

```bash
ping rag.local                              # 能 ping 通
curl http://rag.local:3000/api/health       # {"ok":true,...}
```

两条都过就 OK。所有客户端配置（MCP server URL、脚本、`skill/rag-search/SKILL.md` 里的示例）就都用 `rag.local:3000`，IP 怎么变都不用改一处。

#### 故障排查

| 现象 | 原因 / 处理 |
|------|------|
| `ping: cannot resolve rag.local` | mDNS 没起来。看 `/tmp/rag-mdns.log`；或服务机器没跑 publisher；或客户端不支持 mDNS（→ 用方案 B）|
| Linux 上 `avahi-publish: command not found` | `sudo apt install avahi-utils && sudo systemctl enable --now avahi-daemon`；或者改用 Python 版（`pip install zeroconf`）|
| Python 版报 `No module named 'zeroconf'` | `pip install zeroconf`（或 `pip3` / `python -m pip install zeroconf`，看本机 Python 装在哪）|
| Windows 上 publisher 跑不起来 | 用 Python 版（`python tools/mdns_publish.py`）；不要用 Shell 版 |
| Windows 上 `ping rag.local` 失败 | 装 Bonjour Print Services；或在 `hosts` 文件加一行（方案 B）|
| WSL2 里跑 publisher，局域网设备 ping 通了但访问的是 WSL 内部 IP | WSL2 默认 NAT 网络问题。Windows 11 + WSL 2.0+ 在 `.wslconfig` 加 `[wsl2]\nnetworkingMode=mirrored` 后重启 WSL；或者直接在 Windows 上跑 Python 版 |
| `ping` 通但 `curl` 超时 | RAG 服务没启动 / 端口不通；查 `docker compose ps`、防火墙 |
| 跨网段（不同 VLAN / VPN）失败 | mDNS 设计上不跨网段；必须用方案 B 或方案 C（内网 DNS）|
| IP 变了 publisher 没更新 | 脚本在启动时 detect IP。换网后 `launchctl unload && load` 或 `systemctl restart rag-mdns` 重启 publisher |

#### 进阶

- **改名**：默认广播 `rag.local`。想叫别的名字（比如多套环境共存）：`./tools/mdns-publish.sh my-rag-dev 3000`，然后客户端配 `my-rag-dev.local:3000`。
- **多端口**：当前只广播一个端口（默认 3000）。要广播多个（比如同时暴露 MCP 5000 + frontend 3000），多跑几个 publisher 实例。
- **企业内网**：跳过 mDNS，直接让 IT 在内网 DNS 加 A record `rag.intra.company.com → 192.168.1.100`，客户端用这个完整域名。

### 锁回本机访问

如果暂时不想对外，把 `docker/compose.yaml` 里的 frontend ports 改成：

```yaml
ports:
  - "127.0.0.1:${HTTP_PORT:-3000}:80"
```

`make down && make up` 后就只有宿主机能访问。

## 公开召回 API

无鉴权，限流 60 次/分钟/IP。

```bash
curl -X POST http://localhost:3000/api/retrieve \
  -H 'Content-Type: application/json' \
  -d '{
    "kb_id": "<your-kb-uuid>",
    "query": "产品发布会的时间和地点",
    "top_k": 5
  }'
```

返回：

```json
{
  "results": [
    {
      "chunk_id": "...",
      "document_id": "...",
      "kb_id": "...",
      "content": "产品发布会将在下周举行，地点为北京。",
      "document_filename": "notes.md",
      "score": 2.1873,
      "source": "both"
    }
  ]
}
```

`source` 取值：`vector`（仅向量召回）/ `keyword`（仅关键词召回）/ `both`（双路命中）。`score` 是 reranker 的 cross-encoder 分数，越大越相关。响应中的 `content` **逐字** 返回 chunk 原文，不会做任何 LLM 汇总或改写。

## MCP Server

系统内置一个**公开**的 MCP server，路径 `POST /mcp`，无需鉴权，可被任何 MCP 客户端挂载。

### 工具列表

| 工具 | 参数 | 说明 |
|------|------|------|
| `list_knowledge_bases` | — | 列出所有知识库，含 `id` / `name` / `description` / `document_count` / `chunk_count` |
| `retrieve` | `kb_id` (uuid, required)<br>`query` (string, required)<br>`top_k` (int 1-50, 默认 5) | 在指定知识库做向量+关键词混合召回，本地 reranker 重排后返回原文 chunk（不做 LLM 汇总） |

### 客户端配置

**Claude Desktop** — 编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "rag": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**Claude Code** — 一行命令：

```bash
claude mcp add --transport http rag http://localhost:3000/mcp
```

**Cursor** — `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "rag": { "url": "http://rag.local:3000/mcp" }
  }
}
```

**Codex CLI** — 编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.rag]
url = "http://rag.local:3000/mcp"
# 可选：
# tool_timeout_sec = 60         # 单次工具调用超时
# startup_timeout_sec = 10      # 初始化超时
# required = false              # 启动连不上时是否中止 Codex
# enabled_tools = ["list_knowledge_bases", "retrieve"]
```

Codex 同时支持 stdio 和 streamable HTTP transport，我们的 `/mcp` 是 HTTP 模式直接 `url=` 即可。

挂载后 LLM 通常先调 `list_knowledge_bases` 拿 `kb_id`，再调 `retrieve` 检索。

### 直接 HTTP 调用（curl）

如果不走 MCP 客户端，可以直接发 JSON-RPC：

```bash
# 1. initialize（握手）
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl", "version": "1.0"}
    }
  }'

# 2. 列出工具
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. 调用 list_knowledge_bases
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":3,
    "method":"tools/call",
    "params":{"name":"list_knowledge_bases","arguments":{}}
  }'

# 4. 调用 retrieve
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":4,
    "method":"tools/call",
    "params":{
      "name":"retrieve",
      "arguments":{
        "kb_id":"<knowledge-base-uuid>",
        "query":"产品发布会的时间和地点",
        "top_k":5
      }
    }
  }'
```

响应是 MCP 标准 `content[]` 结构，`text` 字段是序列化后的 JSON 字符串（chunk 列表）：

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"content\":\"...原文...\",\"document_filename\":\"a.md\",\"score\":4.21,\"source\":\"both\",\"chunk_id\":\"...\"}]"
      }
    ]
  }
}
```

### 配套接口

`GET /api/kb`（同样公开、无鉴权）返回完整知识库列表 JSON，方便不走 MCP 的客户端用：

```bash
curl http://localhost:3000/api/kb
```

### 实现说明 & 限制

- 内部用 SDK 的 `InMemoryTransport` 一对在进程内中转 JSON-RPC，**只支持单请求 POST 模式**（不支持 SSE 流式推送、不支持批处理）。对 LLM 调工具来说足够，但如果你的客户端依赖 streamable HTTP 的 SSE 事件流，可能不兼容。
- MCP 接口和 `/api/retrieve` **不共享**限流配置：MCP 调用走默认的全局限流（很宽松），如果暴露公网建议在 nginx 层加 rate limit。
- 该端点和 `/api/retrieve` 一样**完全不做 LLM 汇总**，原文 chunk 逐字返回。

## Claude / Codex Skill（可选）

仓库自带一个 `rag-search` skill（在 `skill/rag-search/`），装到 Claude Code 或 Codex CLI 后，AI 会**自动**判断什么时候该查知识库、调对 MCP 工具、用召回原文总结回答，召回为空时还会主动问你"要不要用通用知识答"——免去你每次手动提示。

### 装到 Claude Code

```bash
# 用户级（所有项目可用，推荐）
mkdir -p ~/.claude/skills/
cp -r skill/rag-search ~/.claude/skills/

# 或项目级（只在当前仓库生效）
mkdir -p .claude/skills/
cp -r skill/rag-search .claude/skills/
```

下次新开 Claude Code 会话即生效，无需 restart。

### 装到 Codex CLI

Codex 不自动扫目录，需要 `~/.codex/config.toml` 里显式列：

```bash
mkdir -p ~/.codex/skills/
cp -r skill/rag-search ~/.codex/skills/
```

```toml
# 编辑 ~/.codex/config.toml 追加：
[[skills.config]]
path = "~/.codex/skills/rag-search"
enabled = true
```

### 验证

打开新会话问一句明显需要查内部资料的话：

> 查一下知识库里 cheap-coder 是怎么工作的？

正常的话 AI 会先调 `mcp__rag__list_knowledge_bases` → `mcp__rag__retrieve`，然后基于召回 chunk 总结回答（带出处）。如果什么工具调用都没发生，说明 skill 没触发——见 `skill/README.md` 的故障排查。

> 完整文档（含 SKILL.md 内容、触发条件、回答约束、错误处理）见 [`skill/README.md`](./skill/README.md)。

## 批量上传

**前端方式**：进入某个知识库的"管理文档"页 → 点 "**批量上传文件夹**" → 选一个文件夹 → 系统自动筛出 `.txt/.md/.pdf/.docx` → 依次上传并显示每个文件的状态（成功 chunk 数 / 失败原因）。子目录会被递归扫描。

**API 方式**（脚本/自动化）：`POST /api/admin/kb/:id/documents/batch`，需要管理员 JWT，一次 multipart 最多 200 个文件，串行处理后返回汇总：

```bash
# 用 admin token 上传整个文件夹下的所有 md/pdf
TOKEN=<admin-jwt>
KB_ID=<knowledge-base-uuid>

curl -X POST "http://localhost:3000/api/admin/kb/$KB_ID/documents/batch" \
  -H "Authorization: Bearer $TOKEN" \
  $(find ./docs -type f \( -name '*.md' -o -name '*.pdf' \) -exec printf -- '-F file=@%s ' {} +)
```

响应：

```json
{
  "uploaded": [
    {"filename": "intro.md", "document_id": "...", "chunk_count": 12}
  ],
  "failed": [
    {"filename": "huge.pdf", "error": "too_many_chunks", "reason": "5421"}
  ]
}
```

> 串行处理是有意为之：embedding 模型是单实例 CPU bound，并发只会争资源不会更快。单批 200 个中等文档大约几分钟，注意 nginx/反代的 `proxy_read_timeout`（compose 自带 nginx 已配 600s）。

## 支持的文档格式

`.txt` / `.md` / `.pdf` / `.docx`。单文件 ≤ `MAX_UPLOAD_MB`（默认 50MB），切分后 chunk 数 ≤ 5000。

## 已知限制

- 单管理员账号，无 RBAC / 多用户。
- 不支持扫描件 PDF 的 OCR。
- 上传同步处理，单大文件会占用 HTTP 连接（最长 5 分钟）。
- 中文分词依赖 zhparser，已封装在自建 Postgres 镜像。

## 故障排查

| 现象 | 原因 / 处理 |
|------|------|
| backend 启动循环 `JWT_SECRET must be at least 32 characters` | 在 `docker/.env` 中把 `JWT_SECRET` 改成 ≥ 32 字符的随机串 |
| backend 启动循环 `POSTGRES_PASSWORD is required` | 在 `.env` 设 `POSTGRES_PASSWORD` |
| 首次启动 backend 长时间日志停在 `loading embedding model` | 正在下载 BGE 权重（约 600MB），等待即可；后续启动走 `rag-models` volume |
| Postgres 容器构建失败 `make: zhparser/Makefile not found` | 网络问题导致 git clone 失败，重试 `make build` 即可 |
| 上传报 `unsupported_file_type` | 仅接受 txt/md/pdf/docx |
| 召回返回 429 | 触发限流，调整 `RETRIEVE_RATE_PER_MIN` 或等待 1 分钟 |
| 忘记管理员密码 | `make reset-admin`，刷新页面会重新触发 setup |

## 仓库结构

```
backend/         Fastify + TypeScript
frontend/        Vite + React + Tailwind
docker/
  compose.yaml   一键编排
  bake.hcl       多架构镜像构建
  .env.example   全部可配置项
  postgres/
    Dockerfile   基于 postgres:16 + zhparser
    init.sql     建表 + 中文 ts_config + GIN
openspec/        change & spec 文档（详见 openspec/changes/add-rag-knowledge-base/）
```
