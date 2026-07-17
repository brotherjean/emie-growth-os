# Static Release Workflow

## Recommended MVP Path

周报系统先走本地预处理，再发布静态页面：

1. 导入飞书汇报导出的 Excel/CSV。
2. 本地生成 `prototypeData.json`。
3. 本地调用 Kimi 生成 `kimiInsights.json`。
4. 本地归一化和校验结构。
5. 本地构建静态页面。
6. 将 `outputs/static-releases/<releaseId>/` 同步到 ECS 静态目录。

服务器在这个阶段只负责稳定展示，不负责大模型分析。

## Commands

```bash
npm run sync:lark-report -- --start 2026-05-25 --end 2026-06-01
npm run sync:lark-report:weekly
npm run ai:app-data
npm run static:release
```

`sync:lark-report` 会通过本机 `lark-cli` 调用飞书原生汇报 API，并生成 `outputs/imports/*lark-report*.json` 标准导入包。

`sync:lark-report:weekly` 是完整链路：拉取上一工作周汇报、合并进 `prototypeData.json`、运行 Kimi 预处理、校验并构建页面。远端服务器需要先完成：

```bash
lark-cli auth login --scope "report:task:readonly"
```

服务器端提供 `/api/lark-report-sync`，设置页的“立即同步飞书汇报”按钮会把完整链路放入后台队列。若需要周一早上自动兜底同步，在 `.env` 中设置：

```bash
LARK_REPORT_AUTO_SYNC_ENABLED=true
LARK_REPORT_AUTO_SYNC_HOUR=8
LARK_REPORT_SKILL_SCRIPT=
```

默认使用项目内置的 `scripts/query-lark-report-tasks.py`。如果服务器已有自定义 skill 路径，可再填写 `LARK_REPORT_SKILL_SCRIPT` 覆盖。

`static:release` 会依次执行：

```bash
npm run static:normalize
npm run static:validate
npm run build
node scripts/export-static-release.mjs
```

发布到 ECS 时使用：

```bash
npm run deploy:static
```

如果 SSH 私钥有口令，先在本机执行：

```bash
ssh-add "/Users/cyberfish/AI Workspace/飞书CLI/SSH_EMIE_New(1).pem"
```

## Integrity Rule

拆分模型调用只允许用于个人点评和任务候选。以下模块必须使用全量数据：

- 老板摘要
- P0/P1 注意力队列
- 主题雷达
- 必读周报
- 公司大群总结

每次静态发布前必须通过 `static:validate`，至少确认：

- 员工覆盖数等于原始导入人数
- 每人任务候选数量达标
- 主题包含证据引用
- 老板注意力队列数量达标
- Kimi 输出字段类型已归一化

## Database Boundary

静态发布适合当前 MVP 的展示与复盘。等需要真实互动时，再引入 PostgreSQL：

- 评论
- 点赞
- 全员开放可见性
- 飞书任务状态回传
- 贡献度排行
- 导入批次和补交周报 upsert

原始 Excel、HTML 报告、静态 release 包建议放 OSS；结构化业务状态放 PostgreSQL。
