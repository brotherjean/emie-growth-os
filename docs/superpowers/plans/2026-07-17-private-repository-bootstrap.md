# 亿觅成长 OS 私有仓库初始化计划

**目标：** 在不改动生产目录的前提下，建立一个可构建、无生产隐私、支持 IT 通过 PR 协作的私有 GitHub 仓库。

## 任务

- [x] 确认源目录不是 Git 仓库，目标目录和 GitHub 仓库名无冲突。
- [x] 建立独立目录并复制代码，排除 `.env`、生产数据、数据库、备份和构建产物。
- [x] 添加匿名演示数据，保持前端和测试可运行。
- [x] 补充 README、项目历史、项目现状、安全说明和 PR 规范。
- [x] 安装依赖并执行构建、闭环测试、360 策略/API 测试、静态校验、依赖审计和秘密扫描。
- [x] 初始化 Git，提交安全基线并创建 Private GitHub 仓库。
- [x] 验证远端可见性、默认分支、CI 和协作入口。

## 验证记录

- Private 仓库：`https://github.com/brotherjean/emie-growth-os`
- 默认分支：`main`
- GitHub Actions：`verify` 已通过
- 合并策略：允许 squash/rebase，关闭 merge commit，合并后删除分支
- Branch Protection：当前 GitHub 个人套餐对 Private 仓库返回 HTTP 403；已用 CODEOWNERS、PR 模板、CI 和协作规范替代，升级 GitHub Pro 后可强制执行。

## 成功标准

1. 原生产目录无改动。
2. 新目录能在匿名数据下完成 `npm run build`。
3. Git 跟踪内容不包含真实凭证、数据库、Excel、备份或真实周报数据。
4. GitHub 仓库为 Private，`main` 有 CODEOWNER 和 PR 模板。
5. IT 获得 GitHub 账号权限后可以从分支提 PR，由 `@brotherjean` 审阅。
