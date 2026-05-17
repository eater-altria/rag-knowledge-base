# skill/

本项目附带的 Claude Code skills。每个子目录是一个 skill（含 `SKILL.md`），可以装到 Claude Code 让 Claude 自动按 skill 的描述触发。

## 列表

| Skill | 作用 |
|-------|------|
| [`rag-search`](./rag-search/SKILL.md) | 通过本仓库的 RAG MCP server 查询知识库，AI 自己总结回答；空结果时先问用户是否要 AI 用通用知识答 |

## 如何安装

Skill 必须放在 `~/.claude/skills/<name>/SKILL.md`（用户级，所有项目可见）或某个仓库的 `.claude/skills/<name>/SKILL.md`（项目级，只在该仓库生效）。复制即装好：

### 装到用户级（推荐，到处可用）

```bash
mkdir -p ~/.claude/skills/
cp -r skill/rag-search ~/.claude/skills/
```

### 装到当前项目级

```bash
mkdir -p .claude/skills/
cp -r skill/rag-search .claude/skills/
```

装完直接打开新的 Claude Code 会话即可，无需 restart。Claude 会按 SKILL.md frontmatter 里的 `description` 自动判断何时触发。

## 前置：挂载 RAG MCP server

`rag-search` 这个 skill 依赖一个名为 `rag` 的 MCP server，**约定地址为 `http://rag.local:3000/mcp`**：

```bash
claude mcp add --transport http rag http://rag.local:3000/mcp
claude mcp list   # 应该能看到 rag
```

> 为什么用 `rag.local` 不写具体 IP？因为局域网 DHCP 分配的 IP 会变、不同人/不同时间不一样。把 skill 文件写死成 IP 就废了。`rag.local` 是约定的稳定逻辑域名，靠下面任一方式解析到当前实际地址。

### 稳定域名：让 `rag.local` 解析到 RAG 服务

**方案 A：mDNS 广播（推荐，零客户端配置）**

在**服务机器**（跑 `make up` 的那台）上执行：

```bash
./tools/mdns-publish.sh         # 前台运行，Ctrl+C 退出
```

广播跑起来后，同局域网的任何 macOS / iOS / Linux + Avahi / Windows + Bonjour 设备都能直接 `ping rag.local` / `curl http://rag.local:3000`，不用改任何东西。

要让它一直在后台跑，可以：

- **macOS** 用 launchd 包装（创建 `~/Library/LaunchAgents/com.rag.mdns.plist`）
- **Linux** 用 systemd service 包装
- 或者直接 `nohup ./tools/mdns-publish.sh > /tmp/rag-mdns.log 2>&1 &`

**方案 B：hosts 文件（最通用，每台客户端改一次）**

如果不想跑后台进程，或者客户端不支持 mDNS（比如某些 Windows 环境），在**每台需要访问的客户端机器**上加一行：

```
# macOS / Linux: 编辑 /etc/hosts
# Windows: 编辑 C:\Windows\System32\drivers\etc\hosts（管理员权限）

192.168.1.100   rag.local       # 把 IP 换成 RAG 服务实际地址
```

服务机器自己访问也建议加 `127.0.0.1 rag.local`，这样本机和别人用一样的 URL，skill 真正做到"一次配置到处可用"。

### 验证

```bash
ping rag.local                              # 能 ping 通
curl http://rag.local:3000/api/health       # {"ok":true,...}
claude mcp list                             # 看到 rag
```

三个都通就 OK。如果 ping 不通，看上面"稳定域名"段是不是漏了配置。

## 验证 skill 是否触发

在 Claude Code 里随便问一个明显需要查内部资料的问题，例如：

> 查一下知识库，cheap-coder 是怎么工作的？

正常的话 Claude 会先调 `mcp__rag__list_knowledge_bases` → `mcp__rag__retrieve`，然后基于召回结果总结回答；如果没召回到，会先问你"要不要用通用知识答"。
