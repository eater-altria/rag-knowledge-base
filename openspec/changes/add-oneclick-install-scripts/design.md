## Context

rag-repo 已有 `docker compose` 和 all-in-one 单镜像两种部署形态。后者已经把"5 分钟试用"压到一行 `docker run`,但**前提是宿主机已装好 Docker 运行时**。

目标用户是"从未碰过 Docker 的 macOS / Windows 普通用户",当前真实路径流失率高(经验值 50-70%)。一键安装脚本目标是把流程压到:

```
访问项目页 → 复制一行命令 → 粘到终端
  ↓
(Windows) 弹 UAC 提权窗口 → 点"是"
  ↓
脚本自动: 装 Docker 运行时 → 拉镜像 → 跑容器 → 等待健康
  ↓
浏览器自动打开 setup 页
```

唯一无法消除的用户交互:
- **macOS**:OrbStack 首次启动的极简引导(~1 次点击)
- **Windows**:UAC 提权(1 次)+ 首次启用 WSL2 后必须重启(Microsoft 限制,无解)

除此之外 100% 脚本化。

## Goals / Non-Goals

**Goals:**
- 在崭新的 macOS (arm64 / x64) 和 Windows 11 x64 上,一行命令走完"从无 Docker 到服务运行 + 浏览器打开"全过程
- macOS 端使用 OrbStack(Docker Desktop 的现代替代),全程 brew 静默安装,无 EULA 弹窗
- Windows 端使用 Docker Desktop with `--quiet --accept-license`(Docker 官方支持的静默参数)
- 脚本失败时给出**具体可执行**的错误提示(不是栈,是"你需要做 X")
- 幂等:重跑等价于"升级 + 重启",不破坏数据卷
- 一键命令本身自动处理 Windows 提权(UAC),用户不需要先右键以管理员打开 PowerShell

**Non-Goals:**
- ❌ 不做 GUI 安装器(.dmg/.msi) — 那需要代码签名 + 公证,工程量另一个数量级
- ❌ 不替代现有 compose / docker run 路线 — 这是新增最低门槛入口,老路保留
- ❌ 不绕过 Microsoft 的 WSL2 首装后重启要求(技术上不可能)
- ❌ 不在 macOS 上自动接受 OrbStack 首启的 ToS(首次一次性 GUI 接受,后续无)
- ❌ 不支持 Linux 一键(已有 Docker 官方 `get.docker.com` 脚本,README 引用即可)

## Decisions

### 决策 1: shell script(bash + PowerShell)而不是跨平台 binary

**选择**:macOS 用 bash,Windows 用 PowerShell,两份独立脚本

**为什么**:
- bash 和 PowerShell 是系统自带,**不需要任何运行时**
- 跨平台方案(Go / Rust binary、Node CLI)要么需要先装 runtime,要么要签名/分发 binary,跟"零依赖"目标冲突
- 脚本逻辑简单(< 300 行 / 每个脚本),不值得抽象成框架

### 决策 2: macOS 端用 OrbStack 而不是 Docker Desktop

**选择**:
1. 检测 `docker` 命令 + `docker info` 是否能 ping 通运行时
2. 都不行 → 检测 `brew` 是否存在
3. 无 brew → 用 Homebrew 官方 oneliner 静默安装(`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` 传 `NONINTERACTIVE=1`)
4. `brew install orbstack`
5. `open -a OrbStack`(首启会弹一次极简引导,用户接受 ToS 后无后续弹窗)
6. 轮询 `docker info` 直到成功

**为什么**:
- **OrbStack vs Docker Desktop**:
  - 启动时间:OrbStack ~2 秒 / Docker Desktop ~15 秒
  - 内存占用:OrbStack ~300MB idle / Docker Desktop ~2GB idle
  - 性能:OrbStack 基于 Apple Virtualization.framework + virtio-fs,文件 I/O 比 Docker Desktop 快 2-3 倍
  - License:**个人使用免费**,商业付费 $8/月(用户群是个人,符合)
- **OrbStack vs colima**:
  - OrbStack 有 GUI 状态栏,普通用户看到"运行中"图标心安,colima 是纯 CLI
  - OrbStack 配置更智能(自动磁盘/内存),colima 要手动调
  - 二者都开源 CLI / 提供完整 Docker socket
- **不用 Docker Desktop 的理由**:macOS 上 Docker Desktop 没有官方静默安装路径,EULA 是 GUI 弹窗;OrbStack 用 brew 一行装完,首启引导也比 Docker Desktop 简短

**替代方案考虑过**:
- *Docker Desktop*:macOS 无静默安装,EULA GUI 强制 — 不符合"自动安装"目标
- *colima*:可行,但无 GUI 状态栏,对非技术用户不如 OrbStack 直观
- *Lima 裸跑*:配置复杂,不适合一键场景
- *Podman Machine*:跟 OrbStack 性能差距大,Podman 团队近期更偏 Linux

**OrbStack 首启的 ToS 是否可以预先接受?**:
- OrbStack 的设置存在 `~/.orbstack/config/`,但 ToS 接受状态由 GUI 写入,无文档化的"预先接受"方式
- 接受 1 次后永久保留,后续启动无弹窗
- 这是唯一无法消除的 1 次 GUI 交互(脚本会清晰提示"OrbStack 首次启动,请在弹出窗口接受 ToS")

### 决策 3: Windows 端 Docker Desktop 静默安装 + 自动 UAC 提权

**选择**:
1. 一键命令把脚本下载到 `$env:TEMP\rag-install.ps1` 再执行(因为提权后需要再 invoke 自己,`iex` 模式拿不到 `$PSCommandPath`)
2. 脚本顶部检测 `IsInRole(Administrator)`,**非管理员时自动 `Start-Process powershell -Verb RunAs -ArgumentList "-File $PSCommandPath"` 弹 UAC 窗口**,当前进程退出
3. 提权后的新窗口加 `-NoExit`,确保用户看到全部日志即使脚本结束
4. 检测 `wsl --status` 看 WSL2 是否启用;未启用 → `wsl --install`(自动启用 Hyper-V / VirtualMachinePlatform / 装 Ubuntu) → 打印"请重启电脑后重跑命令" → 退出
5. WSL2 就绪后,`winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`
6. winget 不可用(Win 10 极老版本)→ 用 `Invoke-WebRequest` 直接下载 `Docker Desktop Installer.exe`,然后 `& "$env:TEMP\Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl-2` —— **这是 Docker 官方支持的静默安装命令**
7. 启动 Docker Desktop(`Start-Process`),轮询 `docker info`

**为什么**:
- Docker Desktop for Windows 4.x **官方支持** `install --quiet --accept-license` 参数,这是 Docker 文档里写明的企业批量部署用法,合规且可靠
- winget 是 Win 10 1809+/Win 11 自带,但版本号匹配麻烦(微软 store 上的 Docker Desktop 偶尔滞后)。直接走 Docker 官方 installer + 静默参数最稳
- 自动 UAC 提权用 `-Verb RunAs` 是 PowerShell 标准做法,UAC 弹窗是 Windows 安全模型必经的一步,无法绕过(也不应该绕过)
- WSL2 安装后必须重启 是 Microsoft 限制,**任何方案都无解** — 唯一做法是清晰告知用户

**一键命令最终形式**:

```powershell
# Windows (普通 PowerShell 即可粘贴)
iwr -useb https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.ps1 -OutFile $env:TEMP\rag-install.ps1; & $env:TEMP\rag-install.ps1
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.sh | bash
```

### 决策 4: 中断 + 恢复仅用于 Windows WSL2 重启

**选择**:除了 Windows WSL2 首装后必须重启这一情况外,所有步骤都连续执行,无中断。WSL2 重启情况下脚本打印明确提示并退出(退出码 0,因为不是失败);用户重启后重跑同一命令,脚本检测到 WSL2 已就绪,自动跳过此步从下一步继续。

**为什么**:
- 之前的"Docker EULA 中断"已被 OrbStack(brew install + GUI 引导一次) 和 Windows Docker Desktop(--accept-license)消除,不再需要中断
- 仅剩 WSL2 重启一个中断点,跟用户预期一致("Windows 装系统级东西需要重启"是普遍认知)

### 决策 5: 镜像 tag:`latest` 优先,环境变量覆盖

**选择**:默认 `docker pull altriayu/rag-kb:latest`;支持 `RAG_IMAGE=altriayu/rag-kb:v0.1.0` 环境变量覆盖。

**为什么**:
- 一键安装最佳体验是"一直用最新"
- 提供覆盖让出问题时可回滚

### 决策 6: 端口冲突处理

**选择**:默认 `-p 3000:3000`;检测到 3000 被占用时自动尝试 3001-3009;用户用 `RAG_PORT=8080` 显式指定时不 fallback,直接报错。

**为什么**:用户机器 3000 被占很常见(Node dev server);自动 fallback 比报错友好;显式指定时尊重用户意图。

### 决策 7: 服务就绪后自动打开浏览器

**选择**:容器起来后轮询 `/api/health` 200,然后 `open URL` / `Start-Process URL` 打开默认浏览器到根路径。

**为什么**:消除"复制 URL 到浏览器"这个流失点;等服务真就绪再打开,避免用户看到连接拒绝。

### 决策 8: 远程执行模式 `curl | bash` 的安全性

**选择**:接受 `curl | bash` / `iwr | iex` 的固有信任要求,通过以下方式降低风险:
- 脚本托管在 GitHub raw URL,HTTPS 强制
- README 同时提供"先下载脚本审计再运行"的版本(`curl -fsSL ... -o install.sh && less install.sh && bash install.sh`)
- 脚本本体不下载除 Docker 运行时安装包 + Docker 镜像之外的任何东西
- 所有外部下载源都是官方:`brew.sh`、`orbstack.dev`、`docker.com`、Docker Hub
- Docker 镜像本身在 Docker Hub 公开,任何人可独立审计

**为什么**:一键体验跟"先审计再跑"是此消彼长;目标用户群实际不会审计,提供选项即可。

## Risks / Trade-offs

- **[OrbStack 商业 license 风险]** → 用户群是个人,符合免费条款;若用户进入商业场景,脚本输出最终提示中说明"OrbStack 商业使用需付费,如不适用请改用 colima(brew install colima)"
- **[OrbStack 团队规模 / 长期维护性]** → OrbStack 是独立小团队,若未来停止维护,脚本可平滑切换到 colima 后端(逻辑共用,只换安装命令)
- **[Docker Desktop 静默安装参数变更]** → Docker 官方一直支持 `--quiet --accept-license`,变更概率低;若变更脚本检测到 installer 行为异常时输出手动安装指引
- **[winget Win 10 老版本不可用]** → 已有 fallback:直接下载 Docker installer .exe 跑 `--quiet`
- **[Docker pull 中途失败 / 网络抖动]** → 捕获,重试 3 次,失败提示用户检查网络
- **[BGE 模型首次下载 500MB]** → 跟现有 README 一致,脚本最后提示"首次启动模型下载 2-3 分钟,见 `docker logs -f rag`"
- **[3000-3009 全被占用]** → 报错要求 `RAG_PORT=<port>` 显式指定
- **[企业 macOS 锁定 Gatekeeper 不许装非 App Store 应用]** → 这类机器无解,脚本检测权限拒绝时清晰报错,提示联系 IT
- **[Windows Smart App Control 拦截 Docker 静默安装]** → 极端情况下 Smart App Control 静默拦截,脚本检测 installer 退出码,失败时提示用户手动从 docker.com 下载安装
- **[UAC 提权用户拒绝]** → 用户点"否"时无法继续,脚本(权限提权前的初始检测)清晰告知"安装 Docker 需要管理员权限,如不接受请使用 README 里的手动 docker run 方式"
- **[幂等性破坏]** → 用户 Ctrl+C 中断,容器可能残留 stopped 状态;重跑时 `docker rm -f rag` 后 `docker run`,确保干净启动,数据卷不动

## Migration Plan

- 这是**纯新增**功能,无迁移
- 现有用户继续用 `docker compose` 或 `docker run`,无影响
- README 更新后,新用户看到一键命令在最顶部
- 回滚:从 README 删除一键命令一节、删除 `tools/install.sh` 和 `tools/install.ps1`,无副作用

## Open Questions

- 是否要在脚本输出末尾自动检测网络环境,若在中国大陆给出 HF 镜像源建议(`HF_ENDPOINT=https://hf-mirror.com`)?
  - 倾向: 是,简单的 IP 地理位置检测(`curl -s ipinfo.io/country`),mainland 就提示;不强求
- 是否需要 uninstall 同时移除 OrbStack / Docker Desktop?
  - 倾向: 否。OrbStack/Docker 是用户系统级软件,可能服务其他用途,只卸载 RAG 自己的容器和镜像即可。`--purge` 也只删 `rag-data` 卷,不动 Docker 运行时
- 一键命令的 URL 是否要走自有短域名(如 `install.rag.io`)?
  - 倾向: 否。GitHub raw URL 长但可审计,自有短域名增加运维负担且对用户不可读
