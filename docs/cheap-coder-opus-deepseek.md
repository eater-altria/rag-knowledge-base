# cheap-coder:让 Opus 当甲方,DeepSeek 当乙方

> Source: https://docs.altriayu.uk/writing/cheap-coder-opus-deepseek

[←返回文章归档](/writing)

Essay2026年5月15日

# cheap-coder:让 Opus 当甲方,DeepSeek 当乙方

阅读 96 · 评论 1

朗读全文
1x

目录

- [cheap-coder:让 Opus 当甲方,DeepSeek 当乙方](#cheap-coder-opus-deepseek)
- [为什么写这个](#section-1woreiw)
- [工作原理](#section-c6dj8e)
- [三道防线](#section-ag72d3)
- [1. 工具批准(live 模式默认)](#1-live)
- [2. Changelog(worker 自报变更)](#2-changelogworker)
- [3. Diff(按需拉取)](#3-diff)
- [怎么用](#section-egga6)
- [1. 装](#1)
- [2. 配置 agents](#2-agents)
- [3. 注册 MCP server 和 skill 到 Claude Code](#3-mcp-server-skill-claude-code)
- [4. 重启 Claude Code,直接用](#4-claude-code)
- [节省效果](#section-gyiekz)
- [适用 / 不适用](#section-dgmqvc)
- [还有什么坑](#section-7i6sqg)
- [项目地址](#section-jq5y79)
- [致谢](#section-mvfy)

目录

- [cheap-coder:让 Opus 当甲方,DeepSeek 当乙方](#cheap-coder-opus-deepseek)
- [为什么写这个](#section-1woreiw)
- [工作原理](#section-c6dj8e)
- [三道防线](#section-ag72d3)
- [1. 工具批准(live 模式默认)](#1-live)
- [2. Changelog(worker 自报变更)](#2-changelogworker)
- [3. Diff(按需拉取)](#3-diff)
- [怎么用](#section-egga6)
- [1. 装](#1)
- [2. 配置 agents](#2-agents)
- [3. 注册 MCP server 和 skill 到 Claude Code](#3-mcp-server-skill-claude-code)
- [4. 重启 Claude Code,直接用](#4-claude-code)
- [节省效果](#section-gyiekz)
- [适用 / 不适用](#section-dgmqvc)
- [还有什么坑](#section-7i6sqg)
- [项目地址](#section-jq5y79)
- [致谢](#section-mvfy)

# cheap-coder:让 Opus 当甲方,DeepSeek 当乙方

仓库地址:**[https://github.com/eater-altria/claude-cheap-coder](https://github.com/eater-altria/claude-cheap-coder)**

一个 MCP server + skill,让强模型(Claude Opus 4.7 等)只负责**规划和审查**,
具体的代码实现交给便宜的 worker 模型(DeepSeek、Qwen、Haiku 等)。在保持
代码质量的前提下,大幅压缩 token 成本。

## 为什么写这个

用 Claude Code 跑 Opus 4.7 写代码,质量很好,但**80% 的工作其实是机械活**:
按规范连接接口、加测试、改类型、做重命名 —— 这些没有"判断"成分的活,
完全是 token 的浪费。

但直接用便宜模型(DeepSeek 等)替代 Opus 也不行:它们会跑偏、问问题、
过度修改、改坏边界。**便宜模型不缺执行力,缺的是「知道什么该做、什么
不该做」的判断力。**

cheap-coder 的思路是把这两件事拆开:

```
强模型 (Opus)        →  规划:把任务分解到「文件 + 接口 + 验收标准」
便宜模型 (DeepSeek)  →  实现:按规划改文件、跑测试、自报变更
强模型 (Opus)        →  审查:看 worker 写的变更记录,必要时再看 diff
```

判断的活 Opus 干,机械的活 DeepSeek 干。

## 工作原理

```
你 (用户)
  │
  ▼
Claude Code (Opus 4.7) ── 编排者 (orchestrator)
   │
   ├─ Skill: cheap-coder       ← 告诉 Opus 这套工作流
   │
   └─ MCP: cheap-coder         ← TypeScript stdio server
       ├─ list_agents          ← 有哪些 worker?
       ├─ implement_plan       ── 拉起子进程:
       │                          $ claude -p "..." \
       │                              --model deepseek-chat \
       │                              --append-system-prompt ""
       │                          env: ANTHROPIC_BASE_URL → DeepSeek 端点
       │
       ├─ get_diff             ← 按需拉 diff,可按文件过滤
       └─ get_last_report      ← 历史结果查询
```

关键点:**worker 是一个真正的 `claude` CLI 子进程**,不是内嵌的 API 调用。
通过设 `ANTHROPIC_BASE_URL` 指向 DeepSeek 的 Anthropic-compatible 端点,
让 Claude Code 完整的工具能力(Read/Edit/Bash/Grep…)跑在 DeepSeek 后端上。

支持 `display: "terminal"` 模式 —— **macOS Terminal.app 新开一个窗口**,
你能亲眼看 DeepSeek 干活、思考、调工具,就像你自己开了第二个 Claude Code
会话一样。完事后窗口不关,你可以继续在里面跟 worker 对话。

## 三道防线

便宜模型的最大风险是不可靠,所以审查必须严密。但全审又会让"省 token"
变成空话。cheap-coder 用三道防线分级把关:

### 1. 工具批准(live 模式默认)

`display: "terminal"` 时,worker 子进程跑在 `--permission-mode default`。
DeepSeek 想读文件、改文件、跑 bash,**每次都要先弹给你看,你按 y/n**。
这是最强的关卡 —— 还没改成代码就先过你这一关。

### 2. Changelog(worker 自报变更)

worker 完成时必须写 `.agent/changelog.md`,结构化记录:

- **Files touched** — 改了哪些文件、规模

- **Scope check** — 是否全在 plan 范围内

- **Contract changes** — 对外接口有没有变

- **Surprises / deviations** — 计划外的临场决策

- **Tests** — 跑了什么、过没过

- **Risk assessment** — LOW / MEDIUM / HIGH + 理由

Opus 拿到 changelog **先读这个**,而不是直接看 diff。

### 3. Diff(按需拉取)

**完整 diff 默认不返回 Opus**,只返回 `git diff --stat`(几百字节)+ 一个
`.agent/last-diff.patch` 路径。Opus 看完 changelog 自己判断:

changelog 信号
动作

LOW + 全干净
跳过 diff,接受

MEDIUM
`get_diff({ paths: ["..."] })` 只看可疑文件

HIGH
`get_diff()` 完整读

这一刀**省 token 最多** —— 因为 diff 一旦进入 Opus 的 context,后续每一轮
对话都按 input token 重复计费。让它**永远不进 context**,效果立竿见影。

## 怎么用

详细安装步骤见仓库 [README](https://github.com/eater-altria/claude-cheap-coder/blob/main/README.md),
精简版:

### 1. 装

```
git clone https://github.com/eater-altria/claude-cheap-coder.git
cd claude-cheap-coder
npm install
npm run build
```

### 2. 配置 agents

```
mkdir -p ~/.config/cheap-coder
cp config/agents.example.json ~/.config/cheap-coder/agents.json
```

编辑 `~/.config/cheap-coder/agents.json`,填上 DeepSeek 的 key:

```
{
  "defaultAgent": "deepseek",
  "agents": [{
    "name": "deepseek",
    "model": "deepseek-chat",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "sk-你的-deepseek-key"
    },
    "display": "terminal",
    "permissionMode": "default",
    "allowedTools": ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    "cost": { "inputPer1K": 0.00014, "outputPer1K": 0.00028 },
    "budgetUSD": 0.50
  }]
}
```

### 3. 注册 MCP server 和 skill 到 Claude Code

```
claude mcp add claude-cheap-coder -s user \
  -e CHEAP_CODER_CONFIG=$HOME/.config/cheap-coder/agents.json \
  -- node $PWD/dist/server.js

mkdir -p ~/.claude/skills/cheap-coder
cp skill/SKILL.md ~/.claude/skills/cheap-coder/SKILL.md
```

### 4. 重启 Claude Code,直接用

```
你> /cheap-coder 帮我加一个 /health endpoint,返回 status + version

Opus> [激活 skill]
      [把规划写到 .agent/plan.md]
      [调用 implement_plan]

      → macOS Terminal 弹一个新窗口
      → 你看着 DeepSeek 读 plan、改文件、跑测试
      → 它写完 changelog 后 Opus 检测到 done.flag

Opus> [读 changelog,LOW 风险,直接接受]
      "完成。`src/routes/health.ts` 新建,3 个测试通过。$0.003。"
```

## 节省效果

测试数据:

- **原始版本(纯 spawn,不做 lazy diff)**:Opus token 节省约 **30%**

- **加上 changelog-first review + lazy diff + report 合并**:预期 **60-70%**

成本省的根源:**diff 不进 Opus context**。一个 10KB 的 diff,在 20 轮对话里
被重复计 input token 就是 200KB,按 Opus 的 input 价格能省一杯咖啡的钱。
项目越长、迭代越多,优势越明显。

## 适用 / 不适用

**适合派出去**:

- 边界清晰的单一功能添加

- bug 修复(有明确 reproduce + fix 目标)

- 文件范围明确的机械重构、重命名、加测试

**不适合派出去**:

- 跨多个模块的架构改动

- 设计还没定的任务

- 需要跟用户讨论才能决策的事

- 改动不足 50 行的小修改(你自己改更快)

不合适的任务硬派,changelog 会写 HIGH,Opus 还要 `get_diff()` 完整读,结果
反而比直接 Opus 做更贵 —— 这是设计上的"反激励",会让你自然学会哪些任务该派。

## 还有什么坑

- worker 模型自评诚实度需要校准 —— 前几次用某个 agent 即便 changelog 写 LOW
也抽一个文件 `get_diff` 看,准了再放心跳过

- DeepSeek 的 Anthropic-compatible 端点偶尔会变,以官方文档为准

- live 模式仅 macOS(用 osascript),Linux 用户用 headless + `tail -f`

- worker 跑的是真正的 Claude CLI,会读你的 `~/.claude/` 配置 —— 包括 skills
和 MCP servers。要完全隔离需要单独配 `CLAUDE_CONFIG_DIR`

## 项目地址

🔗 **[https://github.com/eater-altria/claude-cheap-coder](https://github.com/eater-altria/claude-cheap-coder)**

开源,MIT-style。issue / PR 欢迎,尤其欢迎:

- 其他 router 的接入示例(LiteLLM、OpenRouter 等)

- Linux 下的 live 模式实现

- 更准的 token 计费(目前 live 模式拿不到 stream-json 用量)

## 致谢

灵感来自 [aider](https://github.com/Aider-AI/aider) 的 architect-coder 模式。
这个项目把这个思路搬到了 Claude Code 生态里,让 MCP + skill + 真实 `claude`
子进程作为载体,体验更接近"两个 Claude 协作"。

## 评论

登录后可以发表评论，游客仍然可以完整阅读正文。

1 条留言
- x35913894932026/5/15 15:50:50好想法🤓