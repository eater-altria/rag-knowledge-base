<#
.SYNOPSIS
    RAG Knowledge Base - one-click installer (Windows).
.DESCRIPTION
    Installs and runs the RAG knowledge base on a fresh Windows 11 machine.
    Handles WSL2, Docker Desktop, container, browser launch in one flow.
.PARAMETER Uninstall
    Stop and remove the container + RAG image. Keeps the data volume.
.PARAMETER Purge
    Used with -Uninstall: also delete the data volume (irreversible).
.EXAMPLE
    iwr -useb https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.ps1 -OutFile $env:TEMP\rag-install.ps1; & $env:TEMP\rag-install.ps1
.NOTES
    Maintenance:
    - Docker Desktop silent install args (--quiet --accept-license) documented at
      https://docs.docker.com/desktop/setup/install/windows-install/
      If Docker changes these flags, this script must be updated.
    - WSL2 install via `wsl --install` requires Windows 10 2004 (build 19041)+.
    - winget is Windows 10 1809+; script falls back to direct installer download
      if winget is missing or fails.
    - WSL2 detection uses `wsl --status` exit code only (avoids locale-dependent
      string matching).
#>

[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Purge
)

$ErrorActionPreference = 'Stop'

# ---------- Config (env vars win over defaults) ----------
$RagImage = if ($env:RAG_IMAGE) { $env:RAG_IMAGE } else { 'altriayu/rag-kb:latest' }
$RagPort = if ($env:RAG_PORT) { [int]$env:RAG_PORT } else { 3000 }
$RagPortExplicit = [bool]$env:RAG_PORT
$RagContainerName = if ($env:RAG_CONTAINER_NAME) { $env:RAG_CONTAINER_NAME } else { 'rag' }
$RagVolume = if ($env:RAG_VOLUME) { $env:RAG_VOLUME } else { 'rag-data' }

# ---------- Logging ----------
function Write-Step  { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-LogInfo  { param([string]$Message) Write-Host "    $Message" }
function Write-Warn  { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message) Write-Host "[X] $Message" -ForegroundColor Red }
function Write-Ok    { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }

# ---------- Admin + elevation ----------
function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Elevation {
    if (Test-Admin) { return }
    if (-not $PSCommandPath) {
        Write-Err "脚本必须以文件形式运行(不能用 iwr | iex)。请使用:"
        Write-LogInfo "iwr -useb https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.ps1 -OutFile `$env:TEMP\rag-install.ps1; & `$env:TEMP\rag-install.ps1"
        exit 1
    }
    Write-Step "请求管理员权限(UAC 弹窗即将出现,请点 '是')..."

    $argList = @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($Uninstall) { $argList += '-Uninstall' }
    if ($Purge)     { $argList += '-Purge' }

    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argList -ErrorAction Stop
    } catch {
        Write-Err "UAC 提权被取消或失败。安装 Docker 需要管理员权限,无法继续。"
        Write-LogInfo "如不接受提权,可改用 README 中的手动 docker run 方式。"
        exit 1
    }
    exit 0
}

# ---------- Windows version ----------
function Test-WindowsVersion {
    $build = [System.Environment]::OSVersion.Version.Build
    # Windows 10 2004 = build 19041 (needed for `wsl --install`)
    if ($build -lt 19041) {
        Write-Err "需要 Windows 10 2004 (build 19041) 或更高版本(当前: $build)。"
        Write-LogInfo "请升级 Windows 后重试,或参照 README 手动安装。"
        exit 1
    }
}

# ---------- WSL2 ----------
function Test-Wsl2 {
    # `wsl --status` exit code is the most reliable, locale-independent signal.
    # Output strings are localized (e.g. Chinese Windows says "默认版本: 2"),
    # so parsing the text is fragile.
    & wsl --status 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Install-Wsl2 {
    Write-Step "正在安装 WSL2(自动启用 Hyper-V / VirtualMachinePlatform / 装 Ubuntu)..."
    & wsl --install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "wsl --install 失败(退出码 $LASTEXITCODE)。请检查 Windows 版本和网络后重试。"
        exit 1
    }
    Write-Warn "WSL2 已安装,请立即重启电脑。"
    Write-LogInfo "重启后,重新打开 PowerShell 执行同样的一键命令,脚本会自动从下一步继续。"
    exit 0
}

# ---------- Docker ----------
function Test-Docker {
    # 0 = ready, 1 = installed but daemon down, 2 = not installed
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return 2
    }
    & docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { return 0 } else { return 1 }
}

function Install-DockerDesktop {
    Write-Step "正在安装 Docker Desktop..."

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-LogInfo "使用 winget 安装(推荐)..."
        & winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Docker Desktop 安装成功"
            return
        }
        Write-Warn "winget 安装失败(退出码 $LASTEXITCODE),fallback 到直接下载 installer..."
    } else {
        Write-LogInfo "winget 不可用,直接下载 Docker Desktop installer..."
    }

    $installer = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
    $url = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
    Write-LogInfo "下载 Docker Desktop Installer..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
    } catch {
        Write-Err "下载失败: $($_.Exception.Message)"
        Write-LogInfo "请从 https://www.docker.com/products/docker-desktop 手动下载安装后,重跑本脚本。"
        exit 1
    }
    Write-LogInfo "静默安装(install --quiet --accept-license,Docker 官方支持)..."
    $proc = Start-Process -FilePath $installer -ArgumentList @('install', '--quiet', '--accept-license', '--backend=wsl-2') -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Err "Docker Desktop 静默安装失败(退出码 $($proc.ExitCode)),可能被 Smart App Control 或杀毒软件拦截。"
        Write-LogInfo "请从 https://www.docker.com/products/docker-desktop 手动下载安装后,重跑本命令,脚本会自动跳过安装步骤。"
        exit 1
    }
    Write-Ok "Docker Desktop 安装成功"
}

function Start-DockerDesktop {
    Write-Step "启动 Docker Desktop..."
    $exePath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $exePath)) {
        Write-Err "找不到 Docker Desktop 可执行文件: $exePath。请确认安装是否成功。"
        exit 1
    }
    Start-Process $exePath
    $elapsed = 0
    $timeout = 120
    while ($elapsed -lt $timeout) {
        & docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host ''
            Write-Ok "Docker daemon 已就绪 (${elapsed}s)"
            return
        }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 2
        $elapsed += 2
    }
    Write-Host ''
    Write-Warn "Docker daemon 在 120 秒内未就绪。请在 Docker Desktop 窗口完成首次配置后重跑本命令。"
    exit 0
}

# ---------- Port ----------
function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Find-FreePort {
    if ($RagPortExplicit) {
        if (Test-PortInUse -Port $RagPort) {
            Write-Err "您指定的端口 $RagPort 已被占用。请释放或换一个: `$env:RAG_PORT = '<port>'"
            exit 1
        }
        return $RagPort
    }
    for ($offset = 0; $offset -lt 10; $offset++) {
        $p = $RagPort + $offset
        if (-not (Test-PortInUse -Port $p)) {
            if ($offset -ne 0) {
                Write-Warn "端口 $RagPort 被占用,自动 fallback 到 $p"
            }
            return $p
        }
    }
    Write-Err "端口 $RagPort - $($RagPort + 9) 全部被占用。请用 `$env:RAG_PORT = '<port>' 显式指定。"
    exit 1
}

# ---------- Image / container ----------
function Invoke-PullWithRetry {
    Write-Step "拉取镜像 $RagImage..."
    for ($i = 1; $i -le 3; $i++) {
        & docker pull $RagImage
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "镜像拉取成功"
            return
        }
        Write-Warn "第 $i 次拉取失败,5 秒后重试..."
        Start-Sleep -Seconds 5
    }
    Write-Err "镜像拉取失败(3 次重试后)。请检查网络;手动重试: docker pull $RagImage"
    exit 1
}

function Start-RagContainer {
    param([int]$Port)
    Write-Step "启动容器 $RagContainerName..."
    $existing = & docker ps -a --format '{{.Names}}' 2>$null
    if ($existing -and ($existing -split "`n" | Where-Object { $_.Trim() -eq $RagContainerName })) {
        Write-LogInfo "清理旧容器..."
        & docker rm -f $RagContainerName | Out-Null
    }
    & docker run -d --name $RagContainerName -p "${Port}:3000" -v "${RagVolume}:/data" $RagImage | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker run 失败。请检查 Docker 状态后重试。"
        exit 1
    }
    Write-Ok "容器已启动"
}

function Wait-Health {
    param([int]$Port)
    Write-Step "等待服务就绪(首次启动可能需要下载 BGE 模型,约 2-3 分钟)..."
    $elapsed = 0
    $timeout = 180
    while ($elapsed -lt $timeout) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Host ''
                Write-Ok "服务已就绪"
                return $true
            }
        } catch {
            # not ready yet, keep polling
        }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    Write-Host ''
    Write-Warn "服务启动较慢(180 秒内 /api/health 未返回),可能在下载 BGE 模型。"
    Write-LogInfo "查看进度: docker logs -f $RagContainerName"
    Write-LogInfo "模型下载完成后,访问 http://localhost:$Port"
    return $false
}

function Open-Browser {
    param([int]$Port)
    Start-Process "http://localhost:$Port"
}

# ---------- Summary ----------
function Show-Summary {
    param([int]$Port)
    $url = "http://localhost:$Port"
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Ok "RAG 知识库已启动"
    Write-Host ''
    Write-Host "  访问地址:  $url" -ForegroundColor Cyan
    Write-Host "  容器名:    $RagContainerName"
    Write-Host "  查看日志:  docker logs -f $RagContainerName"
    Write-Host "  停止服务:  docker stop $RagContainerName"
    Write-Host "  卸载:      & '$PSCommandPath' -Uninstall"
    Write-Host '============================================================' -ForegroundColor Green
}

# ---------- Uninstall ----------
function Invoke-Uninstall {
    param([bool]$DoPurge)
    Write-Step "卸载 RAG 容器和镜像..."
    $existing = & docker ps -a --format '{{.Names}}' 2>$null
    if ($existing -and ($existing -split "`n" | Where-Object { $_.Trim() -eq $RagContainerName })) {
        & docker rm -f $RagContainerName | Out-Null
        Write-Ok "容器已删除"
    }
    & docker image inspect $RagImage 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & docker rmi $RagImage 2>&1 | Out-Null
        Write-Ok "镜像已删除"
    }
    if ($DoPurge) {
        Write-Host "将永久删除数据卷 $RagVolume(包含所有知识库、文档、账号、模型)。" -ForegroundColor Yellow
        $confirm = Read-Host "输入 yes 继续"
        if ($confirm -eq 'yes') {
            & docker volume rm $RagVolume 2>&1 | Out-Null
            Write-Ok "数据卷 $RagVolume 已删除"
        } else {
            Write-LogInfo "已取消 purge,数据保留"
        }
    } else {
        Write-LogInfo "数据保留在 docker volume $RagVolume 中。"
        Write-LogInfo "如需彻底清除请重跑加 -Purge。"
    }
    Write-LogInfo "Docker Desktop 未卸载(可能服务其他用途,如需卸载请手动操作)。"
}

# ---------- Main ----------
function Invoke-Main {
    Invoke-Elevation
    Test-WindowsVersion

    if ($Uninstall) {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            Write-Warn "Docker 不在 PATH 中,无法卸载(可能已被卸载)。"
            return
        }
        Invoke-Uninstall -DoPurge:$Purge
        return
    }

    Write-Step "检测 WSL2..."
    if (-not (Test-Wsl2)) {
        Install-Wsl2  # exits the script
    }
    Write-Ok "WSL2 已就绪"

    Write-Step "检测 Docker 运行时..."
    $dockerStatus = Test-Docker
    switch ($dockerStatus) {
        0 { Write-Ok "Docker 已就绪" }
        1 { Start-DockerDesktop }
        2 {
            Install-DockerDesktop
            Start-DockerDesktop
        }
    }

    $port = Find-FreePort
    Invoke-PullWithRetry
    Start-RagContainer -Port $port
    $healthy = Wait-Health -Port $port
    if ($healthy) {
        Open-Browser -Port $port
    }
    Show-Summary -Port $port
}

try {
    Invoke-Main
} catch {
    Write-Err "意外错误: $($_.Exception.Message)"
    Write-LogInfo "请到 https://github.com/eater-altria/rag-knowledge-base/issues 提交 issue,附上上面的错误信息。"
    exit 1
}
