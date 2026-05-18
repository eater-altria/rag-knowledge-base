## Why

当前最低门槛的路线是 README 里的 all-in-one 镜像 `docker run`,但**前提是用户已经装好了 Docker Desktop**。对完全崭新的 macOS / Windows 机器,从零到能访问 `http://localhost:3000` 仍要:下载 Docker Desktop、装、首次启动接受 EULA、(Windows) 启用 WSL2、复制 docker run 命令。这中间的每一步都是非技术用户的流失点。

一行命令(`curl ... | bash` 或 `iwr ... | iex`)把这条路全自动化,是把"5 分钟试用"承诺真正兑现的最小改动。它不重写架构、不替换技术栈,只是把现有 all-in-one 镜像加一层引导器,把"装 Docker → 拉镜像 → 跑容器 → 开浏览器"串成单步。

## What Changes

- 新增 `tools/install.sh`(macOS / Linux 通用,bash):检测 Docker → 缺则引导安装(`brew install --cask docker` 或下载 .dmg) → 等待 Docker daemon 起来 → `docker pull altriayu/rag-kb:latest` → `docker run` → `open http://localhost:3000`
- 新增 `tools/install.ps1`(Windows,PowerShell):检测 Docker → 缺则引导安装(`winget install Docker.DockerDesktop`,顺带处理 WSL2 启用) → 等待 daemon → `docker pull` + `docker run` → 打开浏览器
- 两个脚本 MUST 是**幂等的**:在已经运行的机器上重跑等价于 "stop → pull 最新 → run"
- 两个脚本 MUST 处理**需要用户手动介入的步骤**(Docker Desktop 首次启动 EULA、Windows WSL2 启用后重启):打印明确提示并以非零退出码暂停,用户完成后重新运行脚本继续
- README 的 "一键运行" 章节顶部加一行 `curl/iwr` 命令,作为最推荐的入口
- 不改 backend / frontend / Docker 镜像本身,只新增脚本和 README 链接

## Capabilities

### New Capabilities
- `oneclick-install`: 提供 macOS 和 Windows 平台上的一键安装脚本,封装从"零依赖崭新机器"到"服务运行 + 浏览器打开"的全流程,处理 Docker 安装引导、镜像拉取、容器启动、首次启动用户介入(EULA / 重启 / 防火墙)、幂等重跑

### Modified Capabilities
- (无 — 现有 deployment capability 的 docker compose / 多架构 / 持久化等要求不变;这是新增的安装入口,不替换现有路径)

## Impact

- 新增文件: `tools/install.sh`、`tools/install.ps1`
- README.md "一键运行" 章节顶部增加 `curl ... | bash` 和 `iwr ... | iex` 两条命令
- 不影响 backend / frontend / Docker 镜像 / compose.yaml / Makefile
- 不引入新的运行时依赖(脚本只调用系统命令: `curl`、`bash`、`open`、`powershell`、`winget`、`docker`)
- 用户体验影响: 把"跟着 README 操作 10 分钟"压缩到"贴一行命令 + 接受 1-2 次系统弹窗"
- 维护成本: 新增两份脚本要随着 Docker Desktop 安装方式变化而维护(预计变更频率低,1-2 年一次)
