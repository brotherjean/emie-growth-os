# 访问与审阅流程

## 私有访问方式

GitHub Private 仓库没有共享访问密码。每位开发者必须使用自己的 GitHub 账号，并由仓库所有者单独邀请。

网页操作：

1. 打开仓库 `Settings`。
2. 进入 `Collaborators`。
3. 点击 `Add people`，输入 IT 同学的 GitHub 用户名或邮箱。
4. 开发人员授予 `Write` 权限；只读评审授予 `Read` 或 `Triage` 权限。

CLI 操作：

```bash
gh api --method PUT repos/brotherjean/emie-growth-os/collaborators/<github-username> -f permission=push
```

## IT 开发流程

```bash
git clone https://github.com/brotherjean/emie-growth-os.git
cd emie-growth-os
npm ci
git switch -c feature/<主题>
```

完成修改和验证后：

```bash
git push -u origin feature/<主题>
gh pr create --base main --fill
```

PR 会自动运行 CI。仓库所有者重点审阅行为变化、权限范围、数据安全、验证证据和回滚方式。

## 当前套餐限制

当前个人账号套餐不能对 Private 仓库启用 GitHub Branch Protection。仓库已经配置：

- Private 可见性
- `@brotherjean` CODEOWNER
- PR 模板
- GitHub Actions CI
- 合并后自动删除分支
- 默认使用 squash/rebase，关闭 merge commit

因此目前需要团队遵守“不直接推送 main”的流程约定。若升级 GitHub Pro，可进一步强制：

- 必须通过 Pull Request
- 至少一位 CODEOWNER 审批
- `verify` CI 必须通过
- 旧审批在新提交后自动失效

