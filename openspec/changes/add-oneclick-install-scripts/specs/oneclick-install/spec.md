## ADDED Requirements

### Requirement: 单命令引导入口
系统 MUST 提供一行命令 `curl -fsSL https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.sh | bash`(macOS / Linux)和 `iwr -useb https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.ps1 -OutFile $env:TEMP\rag-install.ps1; & $env:TEMP\rag-install.ps1`(Windows PowerShell)。用户在崭新机器上粘贴执行后,脚本 SHALL 自动完成 Docker 运行时安装、镜像拉取、容器启动、浏览器打开全流程,除以下例外外不要求任何用户操作:
- macOS:OrbStack 首次启动的 ToS 接受(1 次 GUI 点击)
- Windows:UAC 提权确认(1 次)+ 首次 WSL2 安装后的电脑重启(1 次)

#### Scenario: 完全崭新 macOS arm64 机器
- **WHEN** 用户在从未装过 Docker、可能无 brew 的 macOS arm64 机器上粘贴并执行一键命令
- **THEN** 脚本依次:检测无 Docker → 检测无 brew → 用 Homebrew 官方 oneliner 以 `NONINTERACTIVE=1` 静默安装 brew → `brew install orbstack` → `open -a OrbStack` 等待用户接受 ToS(轮询 `docker info` 直到 OK)→ 拉取 `altriayu/rag-kb:latest` arm64 manifest → `docker run` → 等待 `/api/health` 就绪 → 自动打开默认浏览器到 setup 页

#### Scenario: 完全崭新 Windows 11 x64 机器
- **WHEN** 用户在普通(非管理员)PowerShell 中粘贴并执行一键命令
- **THEN** 脚本下载自身到 `$env:TEMP\rag-install.ps1` → 自检非管理员 → `Start-Process -Verb RunAs` 重新以管理员身份启动 → UAC 弹窗用户点"是"→ 新窗口继续 → 检测无 WSL2 → `wsl --install` → 打印"请重启电脑后重跑命令" → 退出码 0 → 用户重启后重跑 → 脚本检测 WSL2 已就绪 → `winget install Docker.DockerDesktop`(或下载 installer 跑 `install --quiet --accept-license`) → 启动 Docker Desktop → 轮询 daemon → 拉取 amd64 镜像 → `docker run` → 等待 `/api/health` → 打开浏览器

### Requirement: Docker 运行时静默安装 (macOS)
macOS 脚本 MUST 在检测无 Docker 时自动安装 OrbStack 作为 Docker 运行时,不要求用户手动下载任何文件。流程:检测 `brew` → 缺则用 Homebrew 官方非交互安装(传 `NONINTERACTIVE=1`)→ `brew install orbstack` → `open -a OrbStack` 拉起 GUI。脚本 MUST 在 OrbStack 启动后轮询 `docker info` 最多 120 秒,期间打印进度提示;若用户未接受 OrbStack ToS 导致 daemon 一直未就绪,脚本 MUST 在超时后清晰指引 "请在 OrbStack 窗口接受 ToS,然后重跑本命令"。

#### Scenario: 崭新机器无 brew 无 Docker
- **WHEN** macOS 机器无 brew 也无 Docker,脚本运行
- **THEN** 脚本 SHALL 用 `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` 装 brew,然后 `brew install orbstack`,完成后继续主流程;不要求用户输入任何东西(brew install 的 sudo 提示用 `NONINTERACTIVE` 跳过,brew 会用预设方式处理)

#### Scenario: 已有 brew 但无 Docker
- **WHEN** macOS 已装 brew,无 Docker
- **THEN** 脚本 SHALL 跳过 brew 安装,直接 `brew install orbstack`

#### Scenario: 已有 Docker Desktop 在运行
- **WHEN** macOS 已有 Docker Desktop 安装并 daemon 在运行
- **THEN** 脚本 SHALL 检测到 `docker info` 成功,跳过 OrbStack 安装,直接进入镜像拉取(不强迫用户切换运行时)

#### Scenario: OrbStack 首启 ToS 未接受
- **WHEN** 脚本启动 OrbStack 后 120 秒内 `docker info` 仍失败
- **THEN** 脚本 SHALL 输出 "⚠️ OrbStack 似乎需要您在窗口中接受 ToS 完成首次配置。请完成后重新运行本命令,脚本会从镜像拉取步骤继续。" 并以退出码 0 退出

### Requirement: Docker 运行时静默安装 + 自动提权 (Windows)
Windows 脚本 MUST 自动处理 UAC 提权(用户从普通 PowerShell 即可粘贴命令)、自动检测并启用 WSL2、自动用 Docker 官方支持的 `--quiet --accept-license` 参数静默安装 Docker Desktop。不要求用户右键以管理员身份打开 PowerShell,不要求用户去 Docker 网站手动下载。

#### Scenario: 普通 PowerShell 自动提权
- **WHEN** 用户在普通(非管理员)PowerShell 中执行一键命令,脚本下载到 `$env:TEMP\rag-install.ps1` 并启动
- **THEN** 脚本 SHALL 检测非管理员身份 → 执行 `Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""` 弹 UAC → 当前(非管理员)进程退出 → UAC 通过后新管理员窗口继续脚本主流程

#### Scenario: 用户拒绝 UAC
- **WHEN** UAC 弹窗用户点"否"
- **THEN** 提权失败,管理员进程不启动;原非管理员进程已退出。下次重跑可再次触发 UAC。**注**:脚本本身无法捕获用户拒绝 UAC,所以不需要给出额外提示;退出后用户重跑即可

#### Scenario: WSL2 未启用
- **WHEN** 管理员窗口中执行,检测 `wsl --status` 显示 WSL 未安装或非 v2
- **THEN** 脚本 SHALL 执行 `wsl --install`,完成后输出 "⚠️ WSL2 已安装,请立即重启电脑;重启后再次执行同样的一键命令,脚本会自动从下一步继续。" 并以退出码 0 退出

#### Scenario: WSL2 已就绪,Docker 缺失
- **WHEN** 管理员 + WSL2 就绪,检测无 docker
- **THEN** 脚本 SHALL 优先 `winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`;若 winget 不可用,SHALL 直接 `Invoke-WebRequest` 从 docker.com 下载 `Docker Desktop Installer.exe` 到 `$env:TEMP`,然后 `& "$env:TEMP\Docker Desktop Installer.exe" install --quiet --accept-license --backend=wsl-2`(Docker 官方支持的静默安装参数),完成后启动 Docker Desktop

#### Scenario: Docker Desktop 安装后启动
- **WHEN** Docker Desktop 安装完成
- **THEN** 脚本 SHALL `Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"`,轮询 `docker info` 最多 120 秒;成功则继续主流程,失败则提示用户手动启动 Docker Desktop 并重跑

### Requirement: 镜像拉取与容器启动
脚本 MUST 执行 `docker pull altriayu/rag-kb:latest`(支持 `RAG_IMAGE` 环境变量覆盖),然后 `docker run -d --name <name> -p <port>:3000 -v <volume>:/data <image>` 启动容器;若同名容器已存在,脚本 SHALL 先 `docker rm -f <name>` 再启动新容器(数据卷不动)。

#### Scenario: 全新安装
- **WHEN** 无任何同名容器存在
- **THEN** `docker run -d --name rag -p 3000:3000 -v rag-data:/data altriayu/rag-kb:latest` 执行成功,容器进入 running 状态

#### Scenario: 升级 / 重跑
- **WHEN** 已有同名 `rag` 容器(running 或 stopped),用户重跑脚本
- **THEN** 脚本 SHALL `docker rm -f rag` → `docker pull` → `docker run` 新容器;`rag-data` 卷保留,用户数据 / 账号 / 已下载模型不丢

#### Scenario: 镜像版本固定
- **WHEN** 用户执行 `RAG_IMAGE=altriayu/rag-kb:v0.1.0 bash install.sh`
- **THEN** 脚本 SHALL 拉取并启动指定版本,而不是 `latest`

#### Scenario: 镜像拉取失败
- **WHEN** `docker pull` 因网络问题失败
- **THEN** 脚本 SHALL 重试最多 3 次,每次间隔 5 秒;仍失败则打印失败原因 + 手动重试命令,以非零退出码退出

### Requirement: 端口冲突自动 fallback
脚本 MUST 在 `docker run` 之前检测目标端口是否被占用;若 3000 被占,SHALL 自动尝试 3001-3009,使用第一个空闲端口;若 3000-3009 全被占用,SHALL 退出并要求用户用 `RAG_PORT=<port>` 显式指定;用户显式指定的端口若被占用,SHALL 直接报错不 fallback。

#### Scenario: 3000 被占用
- **WHEN** 宿主机 3000 被占,用户运行脚本(未指定 RAG_PORT)
- **THEN** 脚本 SHALL 检测冲突,尝试 3001 → 成功,容器以 `-p 3001:3000` 启动,所有后续提示使用 3001

#### Scenario: 用户显式指定端口
- **WHEN** 用户执行 `RAG_PORT=8080 bash install.sh`
- **THEN** 脚本 SHALL 跳过端口扫描,直接尝试 8080;8080 被占用则直接报错退出,不 fallback

### Requirement: 服务就绪检测与浏览器打开
脚本 MUST 在 `docker run` 后轮询 `http://localhost:<port>/api/health` 最多 180 秒;返回 200 后,SHALL 调用平台命令(`open URL` / `Start-Process URL`)打开默认浏览器到根路径;超时则提示用户手动打开 URL 并查看 `docker logs rag` 排查。

#### Scenario: 服务正常就绪
- **WHEN** 容器启动后 30 秒内 `/api/health` 返回 200
- **THEN** 脚本 SHALL 打开默认浏览器到 setup 页,终端输出 "✓ RAG 已启动,访问 http://localhost:3000"

#### Scenario: 服务长时间不就绪
- **WHEN** 180 秒后 `/api/health` 仍未返回 200(通常是 BGE 模型首次下载慢)
- **THEN** 脚本 SHALL 提示用户 "服务启动较慢,可能首次下载 BGE 模型中。请运行 `docker logs -f rag` 查看进度,模型下载完成后访问 http://localhost:3000",不阻塞退出

### Requirement: 幂等重跑
脚本 MUST 是幂等的:在已正常运行的机器上重跑等价于"停止 → 拉最新 → 重启",不破坏数据卷、不重复安装 Docker / OrbStack、不重复启用 WSL2、不重复请求 UAC(若已是管理员窗口)。

#### Scenario: 在已运行机器上重跑
- **WHEN** 用户在已经成功部署的机器上重新执行一键命令
- **THEN** 脚本 SHALL 检测 Docker 已装且 daemon 已起 → 跳过 OrbStack / Docker Desktop 安装步骤 → 拉取最新镜像 → 重建容器 → 验证健康 → 打开浏览器;数据卷 `rag-data` 完全不动

### Requirement: 错误提示可执行性
脚本 MUST 对所有可预见的失败模式(无网络、Docker pull 失败、端口全占、Docker 静默安装被 Smart App Control 拦截等)给出**用户可直接执行的下一步**,提示中 MUST 包含:失败原因(一句话)、用户可执行的命令或操作(可复制粘贴)、获取更多帮助的链接(README 故障排查锚点)。

#### Scenario: 网络不通
- **WHEN** `docker pull` 因 DNS 解析或连接超时失败
- **THEN** 脚本输出 "✗ 无法连接 Docker Hub。请检查网络;如果使用代理,运行 `docker info` 确认代理已配置。详见 README 故障排查。" + 退出码 1,不打印 Docker daemon 原始 stack

#### Scenario: Docker Desktop 静默安装被拦截 (Windows)
- **WHEN** Windows Smart App Control 或第三方杀毒拦截 `Docker Desktop Installer.exe install`,installer 退出码非零
- **THEN** 脚本输出 "✗ Docker Desktop 静默安装失败,可能被 Smart App Control 拦截。请从 https://docker.com/products/docker-desktop 手动下载安装后,重跑本命令,脚本会自动跳过安装步骤继续。"

### Requirement: 卸载支持
脚本 MUST 支持 `--uninstall` 参数(`bash install.sh --uninstall` / `install.ps1 -Uninstall`),执行时停止并删除容器 + 删除 RAG 镜像,但**默认保留数据卷**和 Docker 运行时(OrbStack / Docker Desktop);只有再加 `--purge` 时才删除 `rag-data` 卷。脚本 MUST NOT 卸载 OrbStack / Docker Desktop(它们可能服务用户的其他用途)。

#### Scenario: 标准卸载
- **WHEN** 用户执行 `bash install.sh --uninstall`
- **THEN** 脚本 SHALL `docker rm -f rag` + `docker rmi altriayu/rag-kb:latest`,输出 "已卸载。数据保留在 docker volume rag-data 中,如需彻底清除请加 --purge。OrbStack/Docker Desktop 未卸载,如需卸载请手动操作。"

#### Scenario: 彻底清除
- **WHEN** 用户执行 `bash install.sh --uninstall --purge`
- **THEN** 脚本 SHALL 先提示二次确认 ("将永久删除所有 RAG 数据,输入 yes 继续:"),用户确认后执行 `docker rm -f rag` + `docker rmi` + `docker volume rm rag-data`,所有 RAG 数据彻底删除(Docker 运行时仍保留)

### Requirement: WSL2 重启的中断 + 恢复模式
脚本 MUST 在 Windows 上首次执行 `wsl --install` 后,打印清晰的"立即重启 + 重启后重跑同样命令"提示并以退出码 0 退出(非失败,是预期流程);用户重启后重跑命令,脚本下次检测 WSL2 已就绪时 SHALL 跳过此步,从下一步继续。

#### Scenario: WSL2 安装后等待重启
- **WHEN** 脚本执行 `wsl --install` 完成
- **THEN** 脚本 SHALL 打印 "⚠️ WSL2 已安装,请立即重启电脑;重启后重新打开 PowerShell 执行同样的一键命令,脚本会自动从下一步继续。" 并以退出码 0 退出

#### Scenario: 重启后重跑
- **WHEN** 用户重启电脑后重跑一键命令
- **THEN** 脚本 SHALL 检测 WSL2 已就绪,跳过 `wsl --install` 步骤,直接进入 Docker Desktop 安装流程
