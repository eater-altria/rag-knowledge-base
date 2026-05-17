## Requirements

### Requirement: 单管理员账户
系统 SHALL 仅允许存在一个管理员账户。账户凭证（用户名 + bcrypt 密码哈希）持久化在 PostgreSQL 的 `admin` 表中。

#### Scenario: 首次启动无管理员
- **WHEN** 系统启动且 `admin` 表为空
- **THEN** `GET /api/auth/status` 返回 `{ initialized: false }`

#### Scenario: 已存在管理员
- **WHEN** `admin` 表中存在一行
- **THEN** `GET /api/auth/status` 返回 `{ initialized: true, username }`

### Requirement: 首次创建管理员
系统 SHALL 在且仅在 `admin` 表为空时允许通过 `POST /api/auth/setup` 创建管理员；接口接受 `{ username, password }`，`password` MUST ≥ 8 字符，`username` MUST 1-32 字符。

#### Scenario: 成功创建
- **WHEN** 表为空且请求体合法
- **THEN** 系统对密码做 bcrypt(cost=12) 哈希后写入 `admin` 表，返回 201 与 JWT，使前端可直接登入

#### Scenario: 已存在时再次调用 setup
- **WHEN** 表中已有一行管理员
- **THEN** `POST /api/auth/setup` 返回 409 `{ error: "already_initialized" }`，**MUST NOT** 覆盖已有账户

#### Scenario: 弱密码
- **WHEN** `password.length < 8`
- **THEN** 返回 400 `{ error: "weak_password" }`

### Requirement: 管理员登录
系统 SHALL 提供 `POST /api/auth/login` 接受 `{ username, password }`，验证通过后签发 JWT（HS256，默认有效期 7 天）。

#### Scenario: 登录成功
- **WHEN** 用户名密码与表中记录匹配
- **THEN** 返回 200 `{ token, expires_at }`

#### Scenario: 凭证错误
- **WHEN** 用户名或密码错误
- **THEN** 返回 401 `{ error: "invalid_credentials" }`，错误响应时间 MUST 不可由调用者区分用户名是否存在（恒定时间比较 + 错误信息一致）

### Requirement: 受保护接口的鉴权
系统 MUST 对 `/api/admin/*` 下所有接口要求 `Authorization: Bearer <jwt>`，无效或缺失返回 401。召回接口 `/api/retrieve` 与 `/api/auth/*` 与 `/api/health` MUST 保持公开。

#### Scenario: 受保护接口缺 token
- **WHEN** 调用 `POST /api/admin/kb` 时不带 Authorization 头
- **THEN** 返回 401 `{ error: "unauthorized" }`，不执行业务逻辑

#### Scenario: token 过期
- **WHEN** JWT 已过期
- **THEN** 返回 401 `{ error: "token_expired" }`

#### Scenario: 召回接口不需鉴权
- **WHEN** 匿名请求 `POST /api/retrieve`
- **THEN** 不被鉴权中间件拦截

### Requirement: JWT 配置
系统 MUST 在启动时校验 `JWT_SECRET` 环境变量长度 ≥ 32 字符；未满足时拒绝启动。

#### Scenario: JWT_SECRET 不合规
- **WHEN** 容器启动时 `JWT_SECRET` 缺失或 < 32 字符
- **THEN** 进程立即退出（非 0 code），日志输出配置错误
