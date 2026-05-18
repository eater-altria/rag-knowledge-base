#!/usr/bin/env bash
# RAG Knowledge Base — one-click installer (macOS / Linux)
# https://github.com/eater-altria/rag-knowledge-base
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/eater-altria/rag-knowledge-base/main/tools/install.sh | bash
#   bash install.sh --uninstall          # remove container + image, keep data
#   bash install.sh --uninstall --purge  # remove everything including data volume
#
# Env vars:
#   RAG_IMAGE          (default: altriayu/rag-kb:latest)
#   RAG_PORT           (default: 3000, auto-fallback 3001-3009 if busy)
#   RAG_CONTAINER_NAME (default: rag)
#   RAG_VOLUME         (default: rag-data)
#
# Maintenance notes:
# - macOS Docker runtime: this script installs OrbStack via Homebrew. If OrbStack
#   ever stops being maintained, switch to colima: `brew install colima docker`
#   then `colima start`. The rest of the flow (docker pull/run) is unchanged.
# - macOS Docker Desktop is NOT auto-installed (no silent install path on macOS,
#   EULA is GUI). If user already has Docker Desktop, we detect and use it.
# - Linux: we don't auto-install Docker; users are pointed at the official
#   get.docker.com script.

set -euo pipefail

# ---------- Config (env vars win over defaults) ----------
RAG_IMAGE="${RAG_IMAGE:-altriayu/rag-kb:latest}"
RAG_CONTAINER_NAME="${RAG_CONTAINER_NAME:-rag}"
RAG_VOLUME="${RAG_VOLUME:-rag-data}"

# Track whether RAG_PORT was explicitly set by the user (no fallback in that case)
if [ -n "${RAG_PORT:-}" ]; then
  RAG_PORT_EXPLICIT=1
else
  RAG_PORT_EXPLICIT=0
  RAG_PORT=3000
fi

# ---------- Color logging ----------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_RED=$(tput setaf 1); C_GREEN=$(tput setaf 2); C_YELLOW=$(tput setaf 3); C_BLUE=$(tput setaf 4); C_RESET=$(tput sgr0)
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_RESET=""
fi

log_step()  { printf "\n%s==> %s%s\n" "$C_BLUE" "$*" "$C_RESET"; }
log_info()  { printf "    %s\n" "$*"; }
log_warn()  { printf "%s⚠  %s%s\n" "$C_YELLOW" "$*" "$C_RESET"; }
log_error() { printf "%s✗  %s%s\n" "$C_RED" "$*" "$C_RESET" >&2; }
log_ok()    { printf "%s✓  %s%s\n" "$C_GREEN" "$*" "$C_RESET"; }

# ---------- Platform detection ----------
detect_platform() {
  local uname_s uname_m
  uname_s=$(uname -s)
  uname_m=$(uname -m)
  case "$uname_s" in
    Darwin) OS="darwin" ;;
    Linux)  OS="linux"  ;;
    *) log_error "不支持的操作系统: $uname_s。本脚本仅支持 macOS 和 Linux。"; exit 1 ;;
  esac
  case "$uname_m" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64)  ARCH="amd64" ;;
    *) log_error "不支持的 CPU 架构: $uname_m。"; exit 1 ;;
  esac
}

# ---------- Docker presence check ----------
# Returns: 0 = ready, 1 = installed but daemon down, 2 = not installed
check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    return 2
  fi
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# ---------- Homebrew bootstrap (macOS) ----------
ensure_brew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  log_step "未检测到 Homebrew,正在静默安装..."
  log_info "(brew 用于装 OrbStack;过程中可能需要您的 sudo 密码)"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # brew default prefix: /opt/homebrew on Apple Silicon, /usr/local on Intel
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi

  if ! command -v brew >/dev/null 2>&1; then
    log_error "Homebrew 安装似乎失败。请访问 https://brew.sh 手动安装后重跑本脚本。"
    exit 1
  fi
  log_ok "Homebrew 已就绪"
}

# ---------- OrbStack install + start ----------
install_orbstack() {
  if brew list --cask orbstack >/dev/null 2>&1 || [ -d "/Applications/OrbStack.app" ]; then
    log_info "OrbStack 已安装,跳过安装步骤"
    return 0
  fi
  log_step "正在安装 OrbStack(Docker 运行时,启动快、资源占用低)..."
  brew install --cask orbstack
  log_ok "OrbStack 已安装"
}

start_orbstack() {
  log_step "启动 OrbStack..."
  open -a OrbStack 2>/dev/null || true

  local elapsed=0
  local timeout=120
  while [ $elapsed -lt $timeout ]; do
    if docker info >/dev/null 2>&1; then
      printf "\n"
      log_ok "OrbStack 已就绪 (${elapsed}s)"
      return 0
    fi
    printf "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  printf "\n"
  log_warn "OrbStack 似乎需要您在窗口中接受 ToS 完成首次配置。"
  log_warn "请完成后重新运行本命令,脚本会从镜像拉取步骤继续。"
  exit 0
}

# ---------- Generic Docker daemon start (Docker Desktop case) ----------
start_docker_daemon() {
  log_step "Docker 已安装但 daemon 未运行,尝试启动..."
  if [ "$OS" = "darwin" ]; then
    if [ -d "/Applications/OrbStack.app" ]; then
      open -a OrbStack 2>/dev/null || true
    elif [ -d "/Applications/Docker.app" ]; then
      open -a Docker 2>/dev/null || true
    fi
  fi
  local elapsed=0
  local timeout=120
  while [ $elapsed -lt $timeout ]; do
    if docker info >/dev/null 2>&1; then
      printf "\n"
      log_ok "Docker daemon 已就绪"
      return 0
    fi
    printf "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  printf "\n"
  log_error "Docker daemon 启动超时。请手动启动 Docker Desktop / OrbStack 后重跑本脚本。"
  exit 1
}

# ---------- Port detection ----------
port_in_use() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z localhost "$port" >/dev/null 2>&1
  else
    # Bash /dev/tcp fallback (suppress any output / job control noise)
    (exec 3<>/dev/tcp/localhost/"$port") >/dev/null 2>&1 && exec 3<&- 3>&-
  fi
}

find_free_port() {
  if [ "$RAG_PORT_EXPLICIT" = "1" ]; then
    if port_in_use "$RAG_PORT"; then
      log_error "您指定的端口 $RAG_PORT 已被占用。请释放或换一个: RAG_PORT=<port> bash $0"
      exit 1
    fi
    SELECTED_PORT=$RAG_PORT
    return 0
  fi
  local p
  for offset in 0 1 2 3 4 5 6 7 8 9; do
    p=$((RAG_PORT + offset))
    if ! port_in_use "$p"; then
      SELECTED_PORT=$p
      if [ $offset -ne 0 ]; then
        log_warn "端口 $RAG_PORT 被占用,自动 fallback 到 $p"
      fi
      return 0
    fi
  done
  log_error "端口 $RAG_PORT-$((RAG_PORT + 9)) 全部被占用。请用 RAG_PORT=<port> bash $0 显式指定一个空闲端口。"
  exit 1
}

# ---------- Image pull with retry ----------
pull_image_with_retry() {
  log_step "拉取镜像 $RAG_IMAGE..."
  local i=1
  while [ $i -le 3 ]; do
    if docker pull "$RAG_IMAGE"; then
      log_ok "镜像拉取成功"
      return 0
    fi
    log_warn "第 $i 次拉取失败,5 秒后重试..."
    sleep 5
    i=$((i + 1))
  done
  log_error "镜像拉取失败 (3 次重试后)。请检查网络;手动重试: docker pull $RAG_IMAGE"
  exit 1
}

# ---------- Container ----------
run_container() {
  log_step "启动容器 $RAG_CONTAINER_NAME..."
  if docker ps -a --format '{{.Names}}' | grep -q "^${RAG_CONTAINER_NAME}$"; then
    log_info "清理旧容器..."
    docker rm -f "$RAG_CONTAINER_NAME" >/dev/null
  fi

  # Pass through HF_ENDPOINT for users in regions where huggingface.co is
  # slow/blocked (e.g. mainland China uses hf-mirror.com).
  local env_args=()
  if [ -n "${HF_ENDPOINT:-}" ]; then
    env_args+=(-e "HF_ENDPOINT=$HF_ENDPOINT")
    log_info "透传 HF_ENDPOINT=$HF_ENDPOINT 给容器"
  fi

  if ! docker run -d \
    --name "$RAG_CONTAINER_NAME" \
    -p "${SELECTED_PORT}:3000" \
    -v "${RAG_VOLUME}:/data" \
    "${env_args[@]}" \
    "$RAG_IMAGE" >/dev/null; then
    log_error "docker run 失败。手动重试看完整错误:"
    local env_flag=""
    [ -n "${HF_ENDPOINT:-}" ] && env_flag=" -e HF_ENDPOINT=$HF_ENDPOINT"
    log_info "  docker run -d --name $RAG_CONTAINER_NAME -p ${SELECTED_PORT}:3000 -v ${RAG_VOLUME}:/data${env_flag} $RAG_IMAGE"
    exit 1
  fi

  # Verify the container actually exists (defensive: trust docker ps, not just exit code)
  sleep 1
  if ! docker ps --format '{{.Names}}' | grep -q "^${RAG_CONTAINER_NAME}$"; then
    log_error "容器创建后立即消失。运行 'docker ps -a' 和 'docker logs $RAG_CONTAINER_NAME' 排查。"
    exit 1
  fi
  log_ok "容器已启动"
}

# ---------- Health check ----------
wait_for_health() {
  log_step "等待服务就绪(首次启动可能需要下载 BGE 模型,约 2-3 分钟)..."
  local elapsed=0
  local timeout=180
  while [ $elapsed -lt $timeout ]; do
    if curl -fsS "http://localhost:${SELECTED_PORT}/api/health" >/dev/null 2>&1; then
      printf "\n"
      log_ok "服务已就绪"
      return 0
    fi
    printf "."
    sleep 3
    elapsed=$((elapsed + 3))
  done
  printf "\n"
  log_warn "服务启动较慢(180 秒内 /api/health 未返回),可能在下载 BGE 模型。"
  log_info "查看进度: docker logs -f $RAG_CONTAINER_NAME"
  log_info "模型下载完成后,访问 http://localhost:${SELECTED_PORT}"
  return 1
}

open_browser() {
  local url="http://localhost:${SELECTED_PORT}"
  if [ "$OS" = "darwin" ]; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

# ---------- Summary ----------
print_summary() {
  local url="http://localhost:${SELECTED_PORT}"
  printf "\n"
  printf "%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n" "$C_GREEN" "$C_RESET"
  log_ok "RAG 知识库已启动"
  printf "\n"
  printf "  访问地址:  %s%s%s\n" "$C_BLUE" "$url" "$C_RESET"
  printf "  容器名:    %s\n" "$RAG_CONTAINER_NAME"
  printf "  查看日志:  docker logs -f %s\n" "$RAG_CONTAINER_NAME"
  printf "  停止服务:  docker stop %s\n" "$RAG_CONTAINER_NAME"
  printf "  卸载:      bash install.sh --uninstall\n"
  printf "%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n" "$C_GREEN" "$C_RESET"
  if [ "$OS" = "darwin" ] && [ -d "/Applications/OrbStack.app" ]; then
    printf "\n"
    log_info "Docker 运行时使用的是 OrbStack(个人免费,商业使用 \$8/月)。"
    log_info "如不适用,可改用 colima 替代: brew install colima docker && colima start"
  fi
}

# ---------- Uninstall ----------
uninstall() {
  local purge=$1
  log_step "卸载 RAG 容器和镜像..."
  if docker ps -a --format '{{.Names}}' | grep -q "^${RAG_CONTAINER_NAME}$"; then
    docker rm -f "$RAG_CONTAINER_NAME" >/dev/null
    log_ok "容器已删除"
  fi
  if docker image inspect "$RAG_IMAGE" >/dev/null 2>&1; then
    docker rmi "$RAG_IMAGE" >/dev/null 2>&1 || true
    log_ok "镜像已删除"
  fi
  if [ "$purge" = "1" ]; then
    printf "%s将永久删除数据卷 %s(包含所有知识库、文档、账号、模型)。%s\n" "$C_YELLOW" "$RAG_VOLUME" "$C_RESET"
    printf "%s输入 yes 继续: %s" "$C_YELLOW" "$C_RESET"
    read -r confirm
    if [ "$confirm" = "yes" ]; then
      docker volume rm "$RAG_VOLUME" >/dev/null 2>&1 || true
      log_ok "数据卷 $RAG_VOLUME 已删除"
    else
      log_info "已取消 purge,数据保留"
    fi
  else
    log_info "数据保留在 docker volume $RAG_VOLUME 中。"
    log_info "如需彻底清除请重跑: bash install.sh --uninstall --purge"
  fi
  log_info "OrbStack/Docker Desktop 未卸载(可能服务其他用途,如需卸载请手动操作)。"
}

# ---------- Argument parsing ----------
parse_args() {
  ACTION="install"
  PURGE=0
  for arg in "$@"; do
    case "$arg" in
      --uninstall) ACTION="uninstall" ;;
      --purge)     PURGE=1 ;;
      -h|--help)
        cat <<'EOF'
RAG 知识库一键安装脚本

用法:
  bash install.sh                       安装并启动
  bash install.sh --uninstall           卸载容器和镜像,保留数据
  bash install.sh --uninstall --purge   彻底删除(包括数据)

环境变量:
  RAG_IMAGE          镜像 (默认 altriayu/rag-kb:latest)
  RAG_PORT           端口 (默认 3000, 自动 fallback 3001-3009)
  RAG_CONTAINER_NAME 容器名 (默认 rag)
  RAG_VOLUME         数据卷 (默认 rag-data)
EOF
        exit 0
        ;;
      *)
        log_error "未知参数: $arg。用 -h 查看帮助。"
        exit 1
        ;;
    esac
  done
}

# ---------- Main ----------
main() {
  parse_args "$@"
  detect_platform

  if [ "$ACTION" = "uninstall" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      log_warn "Docker 不在 PATH 中,无法卸载(可能已被卸载)。"
      exit 0
    fi
    uninstall "$PURGE"
    exit 0
  fi

  log_step "检测 Docker 运行时..."
  local docker_status=0
  check_docker || docker_status=$?
  case "$docker_status" in
    0) log_ok "Docker 已就绪" ;;
    1) start_docker_daemon ;;
    2)
      if [ "$OS" = "linux" ]; then
        log_error "未检测到 Docker。请用官方脚本安装: curl -fsSL https://get.docker.com | sudo sh"
        log_info "安装完成后,把当前用户加入 docker 用户组: sudo usermod -aG docker \$USER && newgrp docker"
        log_info "然后重跑本脚本。"
        exit 1
      fi
      # macOS: auto-install OrbStack
      ensure_brew
      install_orbstack
      start_orbstack
      ;;
  esac

  find_free_port
  pull_image_with_retry
  run_container
  if wait_for_health; then
    open_browser
  fi
  print_summary
}

main "$@"
