## 1. 脚手架

- [x] 1.1 新建 `tools/install.sh`(bash,带 `set -euo pipefail`,顶部脚本说明 + License)
- [x] 1.2 新建 `tools/install.ps1`(PowerShell,带 `$ErrorActionPreference = 'Stop'`,顶部脚本说明)
- [x] 1.3 定义两个脚本共享的环境变量约定:`RAG_IMAGE`(默认 `altriayu/rag-kb:latest`)、`RAG_PORT`(默认 3000)、`RAG_CONTAINER_NAME`(默认 `rag`)、`RAG_VOLUME`(默认 `rag-data`)
- [x] 1.4 定义统一日志函数:`log_info` / `log_warn` / `log_error` / `log_step`,带颜色,Windows 端用 `Write-Host -ForegroundColor`

## 2. macOS / Linux 脚本核心 (install.sh)

- [x] 2.1 实现 `detect_platform`:输出 `os=darwin|linux`、`arch=arm64|amd64`;不支持的平台直接报错退出
- [x] 2.2 实现 `check_docker`:`command -v docker` + `docker info > /dev/null`,返回 0/1/2(已就绪 / 已装但 daemon 未起 / 未装)
- [x] 2.3 实现 `ensure_brew`:检测 `brew`;缺则用 `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` 静默安装,并设置 brew shellenv 到当前 shell
- [x] 2.4 实现 `install_orbstack`:`brew install orbstack`(已装则跳过)
- [x] 2.5 实现 `start_orbstack`:`open -a OrbStack`,轮询 `docker info` 最多 120 秒,带进度提示;超时给出"请在 OrbStack 窗口接受 ToS 后重跑"提示
- [x] 2.6 实现 `find_free_port`:从 `RAG_PORT` 开始尝试(默认 3000),占用就 +1,扫到 +9 失败则报错
- [x] 2.7 实现 `pull_image_with_retry`:`docker pull` 失败重试 3 次,间隔 5 秒
- [x] 2.8 实现 `run_container`:`docker rm -f` 同名容器 → `docker run -d --name ... -p ... -v ... <image>`
- [x] 2.9 实现 `wait_for_health`:轮询 `curl -fsS http://localhost:<port>/api/health` 最多 180 秒
- [x] 2.10 实现 `open_browser`:`open http://localhost:<port>`
- [x] 2.11 主流程串联:detect → check_docker → (缺则 ensure_brew → install_orbstack → start_orbstack) → find_port → pull → run → wait_health → open_browser → 输出最终访问 URL
- [x] 2.12 实现 `--uninstall` 分支:`docker rm -f` + `docker rmi`,保留 volume + 保留 OrbStack/Docker Desktop
- [x] 2.13 实现 `--uninstall --purge` 分支:二次确认 → 额外 `docker volume rm rag-data`
- [x] 2.14 全部错误路径都给可执行的 next-step 提示,绝不打印 raw stack
- [x] 2.15 末尾输出汇总:访问 URL / 容器名 / 日志命令 / 卸载命令 / OrbStack 商业 license 说明

## 3. Windows 脚本核心 (install.ps1)

- [x] 3.1 顶部检测 `[Environment]::OSVersion`,< Win10 1903 直接报错退出 (实际收紧到 build 19041 / Win10 2004,因为 `wsl --install` 需要此版本)
- [x] 3.2 实现 `Test-Admin`:返回当前进程是否管理员身份
- [x] 3.3 实现 `Invoke-Elevation`:非管理员时 `Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $($MyInvocation.UnboundArguments)"`,然后当前进程 `exit`;脚本入口最早处调用这个函数
- [x] 3.4 实现 `Test-Wsl2`:执行 `wsl --status`,解析输出确认 "Default Version: 2";未启用返回 false (实际改用 exit code 检测,避免中文 Windows 上字符串本地化失败)
- [x] 3.5 实现 `Install-Wsl2`:管理员模式下执行 `wsl --install`,完成后打印 "请重启电脑后重跑此命令" 并以退出码 0 退出
- [x] 3.6 实现 `Test-Docker`:`Get-Command docker` + `docker info` 探活,返回 0/1/2
- [x] 3.7 实现 `Install-DockerDesktop`:首选 `winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`;winget 不可用时 `Invoke-WebRequest -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile "$env:TEMP\DockerInstaller.exe"`,然后 `& "$env:TEMP\DockerInstaller.exe" install --quiet --accept-license --backend=wsl-2`
- [x] 3.8 实现 `Start-DockerDesktop`:`Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"`,轮询 `docker info` 最多 120 秒
- [x] 3.9 实现 `Find-FreePort`:从 `RAG_PORT` 开始(默认 3000),用 `Test-NetConnection -ComputerName localhost -Port` 探活,占用就 +1 (实际改用 `Get-NetTCPConnection -State Listen` 更准确)
- [x] 3.10 实现 `Invoke-PullWithRetry`:`docker pull` 3 次重试
- [x] 3.11 实现 `Start-RagContainer`:`docker rm -f` + `docker run`
- [x] 3.12 实现 `Wait-Health`:轮询 `Invoke-WebRequest http://localhost:$port/api/health` 最多 180 秒
- [x] 3.13 实现 `Open-Browser`:`Start-Process "http://localhost:$port"`
- [x] 3.14 主流程串联:Invoke-Elevation(必须最早) → Test-Wsl2 → (缺则 Install-Wsl2 + exit) → Test-Docker → (缺则 Install-DockerDesktop + Start-DockerDesktop) → Find-FreePort → Invoke-PullWithRetry → Start-RagContainer → Wait-Health → Open-Browser
- [x] 3.15 实现 `-Uninstall` 和 `-Uninstall -Purge` 参数处理(不卸载 Docker Desktop)
- [x] 3.16 所有错误给可执行 next-step,不打印 raw exception 堆栈;Docker 静默安装被 Smart App Control 拦截时清晰提示手动下载

## 4. 幂等性 + 边缘情况

代码层面已实现下列幂等逻辑,**实际跑测仍需在真实 / VM 环境验证**(见第 6 节):

- [x] 4.1 重跑测试:已运行容器 → 脚本第二次执行应该是 stop → pull → run,数据卷保留 (代码实现完成: `run_container` / `Start-RagContainer` 先 `docker rm -f`)
- [x] 4.2 重跑测试:Docker 已装但 daemon 没起 → 脚本应该启动 daemon,不重装 (代码完成: `check_docker` 返回 1 时走 `start_docker_daemon` / `Start-DockerDesktop`)
- [x] 4.3 重跑测试(Windows):已是管理员窗口 → 不重复 Invoke-Elevation,不弹 UAC (代码完成: `Test-Admin` 优先判断)
- [x] 4.4 重跑测试(Windows):WSL2 已就绪 → 不重复 wsl --install (代码完成: `Test-Wsl2` 优先判断 exit code)
- [x] 4.5 Ctrl+C 中途中断 → 重跑应能从干净状态恢复(无残留 stopped 容器导致冲突) (代码完成: `docker ps -a` 检测 + `docker rm -f`)
- [x] 4.6 网络中断模拟:`docker pull` 失败 → 重试 3 次后清晰报错 (代码完成: `pull_image_with_retry` / `Invoke-PullWithRetry`)
- [x] 4.7 端口被占模拟:在 3000 上跑一个 dummy server → 脚本应 fallback 到 3001 (代码完成: `find_free_port` / `Find-FreePort`)
- [x] 4.8 `RAG_PORT=8080` 显式指定 + 8080 被占 → 脚本应直接报错,不 fallback (代码完成: `RAG_PORT_EXPLICIT` / `$RagPortExplicit` 分支)
- [x] 4.9 macOS 已装 Docker Desktop 场景:脚本检测到 docker info OK → 跳过 OrbStack 安装,不强迫切换运行时 (代码完成: `check_docker` 返回 0 时直接进入拉镜像)

## 5. README 集成

- [x] 5.1 README "一键运行" 章节顶部插入 `## 极简模式 - 一键安装`(在现有 `docker run` 命令之前)
- [x] 5.2 给出 macOS/Linux 命令: `curl -fsSL https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.sh | bash`
- [x] 5.3 给出 Windows PowerShell 命令: `iwr -useb https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.ps1 -OutFile $env:TEMP\rag-install.ps1; & $env:TEMP\rag-install.ps1` (实际不是 `iex` 形式,因为提权后需要 `$PSCommandPath`)
- [x] 5.4 给出"先审计再运行"的版本作为安全选项
- [x] 5.5 简要说明:首次运行会自动装 Docker 运行时(macOS = OrbStack,Windows = Docker Desktop) + 启动服务 + 打开浏览器,共需 5-10 分钟
- [x] 5.6 macOS 说明:用 OrbStack 而非 Docker Desktop,以及 OrbStack 商业 license 提示(个人免费)
- [x] 5.7 Windows 说明:一键命令会自动弹 UAC 提权;首次安装 WSL2 后需重启,重启后重跑同一命令即可继续
- [x] 5.8 列出脚本支持的环境变量(`RAG_PORT` / `RAG_IMAGE` / `RAG_CONTAINER_NAME` / `RAG_VOLUME`)
- [x] 5.9 列出卸载命令(`--uninstall` / `--uninstall --purge`)

## 6. 文档与跨平台手动测试

**deferred — 这些任务需要干净的 macOS arm64 / Windows 11 x64 环境(VM 或真机),代码作者本地无法完整执行**。建议作为合并前的 review checklist 由 reviewer 在 VM 中跑一次,或集成到 CI(GitHub Actions self-hosted runner)。

- [ ] 6.1 在干净 macOS arm64 VM(或借真机)上完整跑一次:无 Docker → 完成 → 浏览器打开 setup 页 → 创建管理员账户成功
- [ ] 6.2 在干净 macOS arm64 上跑卸载:`bash install.sh --uninstall` → 容器消失,volume 还在
- [ ] 6.3 在干净 Windows 11 x64 VM 上完整跑一次:无 WSL2 → 触发 WSL2 安装 → 重启 → 重跑 → 装 Docker → 完成
- [ ] 6.4 在已有 Docker 的 Windows 上跑:跳过装 Docker → 直接拉镜像 + run → 成功
- [ ] 6.5 在端口冲突场景(`nc -l 3000` 模拟占用)下跑:fallback 到 3001,浏览器打开 :3001
- [ ] 6.6 文档化测试矩阵:记录每个场景的实际通过状态,作为 PR 描述附件

## 7. 收尾

- [x] 7.1 给两个脚本加上文件级注释:用途、维护方式、Docker Desktop 升级时需要检查哪些点
- [ ] 7.2 ShellCheck 通过 `install.sh`(`shellcheck tools/install.sh`,目标 0 warning) — **deferred**: shellcheck 未在开发机安装。建议在 CI 中加入此检查,或本地 `brew install shellcheck` 后跑
- [ ] 7.3 PSScriptAnalyzer 通过 `install.ps1`(`Invoke-ScriptAnalyzer tools/install.ps1`,目标 0 warning) — **deferred**: pwsh 未在开发机(macOS)安装。建议在 Windows CI 中加入此检查
- [x] 7.4 README 故障排查表新增 4 行: 一键脚本卡在"等待 Docker daemon" / 一键脚本说 winget 不存在 / 一键脚本说端口全占 / 一键脚本完成但浏览器没打开
- [x] 7.5 验证 OpenSpec change: `openspec validate add-oneclick-install-scripts --strict` 通过
