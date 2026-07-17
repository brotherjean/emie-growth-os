# Feishu Open Platform setup

Weekly Report OS should use a separate Feishu app from Emie AI Central. The Emie app can be used as the SSO code reference, but this product needs its own task, contact, event, and later report/import permissions.

## 1. Basic app settings

Create an internal app in Feishu Open Platform.

Set the redirect URL:

```text
https://reportos.emie.cn/auth/feishu/callback
```

For local testing, also add:

```text
http://localhost:5174/auth/feishu/callback
```

Copy the app credentials into `.env`:

```text
BASE_URL=https://reportos.emie.cn
AUTH_MODE=feishu
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
SESSION_SECRET=<long random string>
WEEKLY_REPORT_DB_PATH=/var/lib/weekly-report-os/data/app.sqlite
FEISHU_TASK_CREATE_ENABLED=false
```

Keep `FEISHU_TASK_CREATE_ENABLED=false` until task creation has passed dry-run and one controlled live test.

## 2. Minimum scopes for the first release

SSO:

```text
authen:user_info:read
```

Task creation and task list use:

```text
task:task:write
task:task:read
task:tasklist:write
task:tasklist:read
task:comment:write
```

Contact lookup, so the system can map names/emails to `open_id`:

```text
contact:user.base:readonly
contact:user.basic_profile:readonly
contact:user:search
```

Later, for richer organization permissions, add department read scopes after the first SSO/task loop is stable.

## 3. Event callback

Configure the event request URL:

```text
https://reportos.emie.cn/api/feishu/events
```

Put the verification token in `.env`:

```text
FEISHU_EVENT_VERIFICATION_TOKEN=xxx
FEISHU_EVENT_ENCRYPT_KEY=xxx
```

The backend supports Feishu URL verification by echoing `challenge`. If the Feishu app has Encrypt Key enabled, the backend decrypts `encrypt` with `FEISHU_EVENT_ENCRYPT_KEY` before reading `challenge` or event payloads.

## 4. Server commands

Local backend smoke test:

```bash
npm run build
npm run server:dev
curl http://localhost:5174/health
```

Production start:

```bash
npm run build
npm run db:init
npm run server:start
```

For deployment, keep runtime data outside code:

```text
/var/www/weekly-report-os
/var/lib/weekly-report-os/data/app.sqlite
/var/backups/weekly-report-os
```

## 5. Weekly data flow

The heavy AI job is local preprocessing:

1. Export the weekly report Excel from Feishu.
2. Import/normalize the Excel locally.
3. Run Kimi analysis in batches.
4. Validate JSON.
5. Build a static release.
6. Upload static assets and sync light SQLite state.

The server is not designed to run the long Kimi analysis job on every page load. It serves the reviewed result and handles interaction state: login, comments, likes, public highlights, task creation, and event callbacks.
