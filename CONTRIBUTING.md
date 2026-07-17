# 协作开发指南

## 分支与 PR

- `main` 始终保持可构建。
- 功能开发使用 `feature/<主题>`。
- Bug 修复使用 `fix/<主题>`。
- 分析和数据规则实验使用 `analysis/<主题>`。
- 不直接向 `main` 推送功能修改；通过 Pull Request 提交给仓库所有者审阅。

## 修改原则

1. 每个 PR 只解决一个明确问题，避免顺手重构无关代码。
2. 延续现有 React、TypeScript、Node 和 CSS 风格。
3. PR 必须说明目标、影响页面/API、数据迁移、验证方式和回滚方式。
4. 涉及权限、消息、任务、数据库和自动化时，要明确 dry-run 与真实写入边界。

## 必做检查

```bash
npm ci
npm run build
node scripts/test-closure-insights.mjs
node scripts/test-scoring360-policy.mjs
```

修改 Kimi 静态数据结构时再运行：

```bash
npm run static:validate
```

## 数据安全

禁止提交：

- 批量员工名单、open_id、邮箱、手机号和组织映射
- 新增代码中硬编码的真实姓名；授权名单和豁免名单必须通过环境变量配置
- 周报原文、评论、AI 对话、360 评价明细和访问日志
- `.env`、API Key、App Secret、token、SSH 私钥
- SQLite、Excel、CSV、outbox、构建产物和服务器备份

测试必须使用虚构人员和匿名内容。若需要复现生产问题，只保留最小结构，不复制业务正文。

## PR 审阅重点

- 行为是否符合需求且没有扩大权限范围
- 是否影响历史周期、现有数据或飞书真实写入
- 是否有可复现验证证据
- 是否包含生产数据或密钥
- 是否提供必要的回滚说明
