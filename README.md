# 亿觅成长 OS

亿觅成长 OS 是一套围绕周报、成长分析、管理注意力排序和任务闭环构建的内部工作系统。它把飞书汇报数据转成可追踪的个人成长轨迹、组织问题雷达和现实任务，并通过飞书完成提醒与回写。

本仓库是用于协作开发的**脱敏代码仓库**。生产数据、员工周报正文、AI 分析结果、SQLite 数据库、上传文件、部署密钥和 API Key 均不在 Git 中。

## 当前能力

- 飞书原生汇报或 Excel 导出的增量导入与周期归档
- Kimi 驱动的个人点评、教练式提问、任务候选和公司级分析
- 老板驾驶舱、个人成长、组织趋势、月度会议、任务闭环和协同 360
- 飞书 SSO、老板视角白名单和组织可见范围控制
- 飞书任务创建、评论互动、通知提醒和用户活跃审计
- 周一自动更新、周五复盘提醒、授权有效期预警和通知巡检
- 本地预处理、静态发布与服务器 SQLite 运行数据分层

## 架构概览

```text
飞书汇报 / Excel
        |
        v
导入与周期化归档 -> Kimi 分块分析 -> 跨周合并与校验
        |                              |
        v                              v
匿名静态数据 / 生产数据          个人、部门、公司洞察
        |                              |
        +------------> React 页面 <---+
                          |
                          v
                Node API + SQLite
                          |
                          v
               飞书消息 / 飞书任务
```

代码分层：

- `src/`：React 前端、页面、数据映射和分析规则
- `server/`：SSO、权限、互动、任务、通知、360 和运行日志 API
- `scripts/`：导入、AI 预处理、周期快照、静态发布和自动化任务
- `db/schema.sql`：SQLite 结构定义
- `docs/`：运行方式、项目历史、当前状态和安全边界
- `src/data/`：仅允许提交匿名演示数据和中国工作日日历

## 本地启动

```bash
npm ci
npm run build
npm run dev
```

默认演示数据只包含虚构员工，不连接飞书，也不会发送消息或创建任务。

需要同时启动本地 API 时：

```bash
npm run server:dev
```

## 验证

提交 PR 前至少执行：

```bash
npm run build
node scripts/test-closure-insights.mjs
node scripts/test-scoring360-policy.mjs
```

涉及静态分析数据时，再执行：

```bash
npm run static:validate
```

## 数据与部署边界

本仓库不是生产数据库的备份，也不应成为真实周报数据的共享渠道。

- 生产代码目录、运行数据目录和本仓库相互独立。
- `.env`、SQLite、Excel、AI 输出、通知 outbox 和服务器备份不得提交。
- 仓库中的 `src/data/*.json` 必须保持匿名、虚构、可公开给公司开发人员阅读。
- 生产发布必须经过备份、构建、验证和人工确认，不能从未审阅的 PR 直接覆盖服务器。

详细说明见 [项目现状](docs/PROJECT_STATUS.md)、[项目历史](docs/PROJECT_HISTORY.md) 和 [安全说明](SECURITY.md)。

## 协作方式

1. 从 `main` 创建 `feature/...`、`fix/...` 或 `analysis/...` 分支。
2. 在分支完成小范围修改和验证。
3. 提交 Pull Request，说明修改目标、影响范围、测试证据和数据安全检查。
4. 由仓库所有者审阅并决定是否合并、是否进入生产部署。

完整规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

