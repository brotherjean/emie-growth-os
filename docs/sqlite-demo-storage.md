# SQLite Demo Storage

当前阶段数据库只存轻量状态，不承担 Kimi 分析计算。

## 推荐服务器路径

```bash
/var/lib/weekly-report-os/data/app.sqlite
```

不要放在代码目录或静态页面目录里，避免发布时覆盖。

## 本地初始化

```bash
npm run db:init
npm run db:seed
```

指定路径：

```bash
npm run db:seed -- --db /tmp/weekly-report-os.sqlite
```

## 服务器初始化建议

```bash
mkdir -p /var/lib/weekly-report-os/data
sqlite3 /var/lib/weekly-report-os/data/app.sqlite < db/schema.sql
```

或者使用脚本：

```bash
WEEKLY_REPORT_DB_PATH=/var/lib/weekly-report-os/data/app.sqlite npm run db:seed
```

## 存储边界

SQLite 存：

- 透明度策略
- 评论
- 点赞
- 员工主动公开周报
- 飞书任务创建记录
- 贡献度事件
- 导入批次和周报索引
- 静态 release / analysis run 元数据

静态文件和大文件不进 SQLite：

- Excel 原始导出
- HTML 分析报告
- 静态 release 包
- 附件

这些后续放 OSS 或服务器独立目录。

## 备份

SQLite 是单文件数据库，demo 阶段可以直接备份：

```bash
sqlite3 /var/lib/weekly-report-os/data/app.sqlite ".backup '/var/backups/weekly-report-os/app-$(date +%Y%m%d%H%M%S).sqlite'"
```

正式生产化后迁移到 RDS PostgreSQL。
