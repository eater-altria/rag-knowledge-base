---
name: rag-search
description: 通过本仓库的 RAG MCP server 查询自托管知识库，基于召回的原文 chunk 自己总结回答。当用户的问题可能在内部知识库里有答案、或显式让你"查知识库 / 查一下 / 根据文档"时使用。空召回时必须先问用户是否要 AI 用通用知识回答，不要默认绕过。
---

# rag-search

把用户的问题落到 RAG 知识库的 MCP 检索上，**先查后答**。检索是工具调用，回答是你自己的总结——不要把工具返回的原文 chunk 直接粘出来当答案。

## 前置条件

宿主必须挂载名为 `rag` 的 MCP server，约定指向 `http://rag.local:3000/mcp`：

```bash
claude mcp add --transport http rag http://rag.local:3000/mcp
```

`rag.local` 是项目约定的稳定域名，**不要写成具体 IP**（IP 一变 skill 就失效）。把 `rag.local` 解析到 RAG 服务实际地址的方法见 `skill/README.md`「稳定域名」一节：
- **首选**：服务机器跑 mDNS publisher 广播（所有支持 mDNS 的设备自动解析）
- **备选**：每台客户端机器 `/etc/hosts` 加一行 `<server-IP> rag.local`

部署完成后验证：`curl http://rag.local:3000/api/health` 能返回 `{"ok":true,...}`。

## 何时触发本 skill

- 用户说"**查知识库**"、"**查一下**"、"**根据文档/资料**"、"**内部 wiki 里**"
- 问题指向**具体事实、原文、内部资料、过往记录**（而非通用知识或编程任务）
- 你不确定答案、且当前会话连了 `rag` MCP 时，主动用一次再回答

**不要**用在：闲聊、纯推理、写代码、明确不需要查的常识问题。

## 可用工具

挂载的 MCP server `rag` 提供两个工具：

| 工具 | 参数 | 何时用 |
|------|------|------|
| `list_knowledge_bases` | — | 第一次或本会话还没查过，拿到 `kb_id` 与名称/描述，决定查哪个库 |
| `retrieve` | `kb_id` (uuid), `query` (string), `top_k?` (默认 5) | 拿到 `kb_id` 后做实际检索；复杂/开放问题可以提到 8-10 |

返回的每条 chunk 含 `content` / `document_filename` / `score` / `source` / `chunk_id`。`source` 是 `vector` / `keyword` / `both`，`both` 通常质量更高。`score` 是 reranker cross-encoder 分数，越大越相关。

## 工作流程

### 1. 选库

如果本会话已经 `list_knowledge_bases` 过、`kb_id` 还有效，直接进入第 2 步。否则：

```
调 list_knowledge_bases
→ 看每个库的 name + description
→ 选 1 个最相关的；如果多个库都可能相关，分别查（多次 retrieve）
```

如果一个库都没有（空列表），直接进入"空结果"路径告诉用户。

### 2. 检索

```
调 retrieve(kb_id, query, top_k=5)
```

- `query` 用**用户问题里的核心实体 / 关键短语**，不要把整段问题塞进去（reranker 对短查询效果好）
- 第一次召回质量差时可以换个 query 再试一次（最多两次，不要无脑刷）

### 3. 判断结果质量

| 情况 | 判断 |
|------|------|
| 返回 0 条 | 空结果 |
| 全部 score < 0.5，或全部 content 跟问题无关 | 视为空结果 |
| ≥ 1 条 `score > 1.0`，或 `source = "both"` | 命中，可总结 |
| 命中但只是间接相关 | 总结时如实说"知识库里没直接覆盖，但相关段落提到 X" |

### 4. 总结回答（命中）

- 用**自然语言**综合多条 chunk 给一个回答，**不要**把原文 chunk 整段粘出来当答案
- 如果不同 chunk 内容冲突，指出冲突并标注来源
- **每个非常识的事实点后面附出处**：`(来源: <document_filename>)`
- **不要编造**——chunk 里没有的细节不要补，宁可说"知识库里没覆盖这一点"
- 简洁优先，用户问什么答什么，不要扩展无关内容

### 5. 空结果 / 失败（关键）

明确告诉用户**知识库里没有相关内容**，然后**主动询问**是否要用通用知识回答：

> 知识库里没找到关于 "<用户问题摘要>" 的内容。
>
> 要我用通用知识帮你回答吗？（这种情况下答案不一定反映你们内部的实际情况）

**等用户确认后再用自己的知识回答**。不要默认绕过这一步——用户挂这个 skill 就是希望先走 RAG。

如果 MCP 调用本身报错（网络/服务挂了），告诉用户出错的具体原因（"MCP server 无法连接"等），然后同样问是否用通用知识答。

## 完整示例

### 示例 A：命中

> **User**: cheap-coder 是怎么工作的？

```
[工具调用]
list_knowledge_bases
→ [{ id: "83c9...", name: "我的知识库", ... }]

retrieve(kb_id="83c9...", query="cheap-coder 工作原理")
→ 3 条 chunk，top: score=4.21, source=both
  content: "强模型 (Opus) → 规划...便宜模型 (DeepSeek) → 实现..."
```

> **Assistant**:
> cheap-coder 把"判断"和"执行"两件事拆开：强模型（Claude Opus）负责把任务规划成「文件 + 接口 + 验收标准」并审查 worker 写的变更；便宜模型（DeepSeek / Qwen / Haiku）按规划做具体实现、跑测试、自报变更。整套流程通过一个 MCP server + skill 编排 (来源: cheap-coder-opus-deepseek.md)。
>
> 节省 token 的核心思路是：80% 的代码工作是机械活，没必要让贵模型干。

### 示例 B：未命中 → 询问用户

> **User**: 帮我查一下公司年假政策

```
[工具调用]
list_knowledge_bases → 一个知识库 "我的知识库"
retrieve(kb_id, "年假政策") → 0 条 / 全部低分无关
```

> **Assistant**:
> 知识库里没找到关于"公司年假政策"的内容。
>
> 要我用通用知识帮你回答吗？（注意：通用回答不会反映你们公司的实际制度，建议最终以 HR 文档为准。）

### 示例 C：MCP 失败

> **User**: 根据文档介绍下我们的产品

```
[工具调用]
list_knowledge_bases → Error: connection refused (host:3000/mcp)
```

> **Assistant**:
> 调用 RAG 知识库时失败了（`http://rag.local:3000/mcp` 无法连接，可能服务没启动，或 `rag.local` 没解析到——可以试 `curl http://rag.local:3000/api/health` 验证）。
>
> 要我用通用知识帮你回答吗？还是你先检查下服务状态？

## 故障排查

MCP 调用失败时，**根据具体错误信号给用户精准建议**——不要笼统说"服务出错了"。先识别错误类型，再告诉用户该改哪里。然后照"空结果 / 失败"流程问用户要不要用通用知识答。

### 诊断顺序

按这个顺序判断卡在哪一环：

1. **看自己的工具列表**：能看到 `mcp__rag__list_knowledge_bases` / `mcp__rag__retrieve` 吗？看不到 → 客户端根本没注册 MCP server。
2. **域名解析**：错误里有 `ENOTFOUND` / `getaddrinfo` / `dns` 字样？→ `rag.local` 没解析到。
3. **网络连通**：错误里有 `ECONNREFUSED` / `ETIMEDOUT` / `connect`？→ 域名通了但端口连不上。
4. **业务结果**：调用成功但 `list_knowledge_bases` 返回空数组 → 服务在跑但还没人建过知识库。

### 常见错误对应建议

| 错误信号 | 根因 | 给用户的话 |
|---------|------|----------|
| 工具列表里没有 `mcp__rag__*` | 当前 Claude 会话没挂 `rag` MCP server | 让用户先跑 `claude mcp add --transport http rag http://rag.local:3000/mcp`，然后**新开**一个会话（已有会话不会热加载 MCP）|
| `getaddrinfo ENOTFOUND rag.local` / DNS 错误 | `rag.local` 没解析（mDNS publisher 没起或客户端不支持，且 hosts 没改） | 让用户在 RAG 服务机器跑 `./tools/mdns-publish.sh`；或在客户端 `/etc/hosts` 加一行 `<server-IP> rag.local`（详见仓库 README "稳定域名" 一节）|
| `ECONNREFUSED` / `ETIMEDOUT` | 域名解析到了，但 RAG 服务没起 / 防火墙挡了 | 让用户在服务机器跑 `make ps` 看四个容器是否都 healthy；如果是，让用户 `curl http://rag.local:3000/api/health` 验证；都不通就检查防火墙放行 3000 端口 |
| `tools/list` 返回空 / 缺工具 | MCP server 起来了但工具没注册（版本不对） | 让用户在服务机器 `make build && make up` 重建 |
| `list_knowledge_bases` 返回 `[]` | 服务正常但还没创建任何知识库 | **不要去 retrieve**；直接告诉用户："系统里还没有任何知识库，请到 `http://rag.local:3000` 创建一个并上传文档"。不要尝试用通用知识回答 — 用户得先建库 |
| `retrieve` 报 503 / `models not ready` | embedding/reranker 还在加载（首次启动要下 ~600MB 模型） | 让用户等 1-3 分钟，然后看 `make logs` 里出现 `rag-backend listening` 再重试 |
| `retrieve` 超时（30s+） | 模型推理慢或 query 太复杂 | 减小 `top_k`（试 3）重试一次；还不行就走"失败"流程 |
| 返回的 chunk 全部 `score < 0.5` | 不算错误，是召回质量差 | 不要硬拼。换个更短的 query 重试一次；还不行就走"空结果"流程问用户 |

### 例：DNS 失败时

> **User**: 查一下知识库里 cheap-coder 的资料

```
[工具调用]
list_knowledge_bases → Error: getaddrinfo ENOTFOUND rag.local
```

> **Assistant**:
> RAG 知识库连不上 — 错误是 `rag.local` 这个域名没解析到任何地址。常见原因：
>
> - 服务机器没在跑 mDNS publisher（在 RAG 服务机器跑 `./tools/mdns-publish.sh` 试试）
> - 或者你这台机器不支持 mDNS（Windows 没装 Bonjour），可以在 `/etc/hosts`（Windows 是 `C:\Windows\System32\drivers\etc\hosts`）加一行 `<RAG 服务机器IP> rag.local`
>
> 修好后让我重试一次，或者你现在要我用通用知识帮你回答关于 cheap-coder 的内容？

### 例：MCP 没挂载

> **User**: 查知识库，有没有关于产品发布会的资料

```
[当前可用工具列表里没有 mcp__rag__*]
```

> **Assistant**:
> 当前会话没挂载 RAG 知识库的 MCP server。需要先在终端跑：
>
> ```
> claude mcp add --transport http rag http://rag.local:3000/mcp
> ```
>
> 然后**新开一个 Claude 会话**（已有会话不会热加载 MCP）就能用了。要我现在用通用知识帮你回答关于产品发布会的内容吗？

## 约束（do / don't）

**Do**:
- 每个非常识事实点后面附 `(来源: <filename>)`
- 召回不充分时坦白说出来（"知识库里关于 X 的部分提到 Y，但没覆盖 Z"）
- 空结果 / 失败时**先问用户**再用通用知识答

**Don't**:
- 把 `retrieve` 返回的 chunk 原文整段粘出来当答案（那是素材不是回答）
- 忽略 score / source 字段，把低分无关 chunk 当真
- 没问用户就默默用通用知识答（用户挂这个 skill 就是希望优先 RAG）
- 编造 chunk 里没出现的细节
- 没必要的反复检索（同一 query 改写 ≤ 2 次）
