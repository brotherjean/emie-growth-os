# Local preprocessing workflow

The long Kimi run is not a normal weekly page-load cost. It was a one-time historical backfill plus pipeline tuning over about 200 accumulated reports. Weekly operation should process the new export first, then merge it into the existing knowledge base by `sourceHash` and `week`.

## Why local first

The weekly report system values analysis quality more than instant response. Running Kimi locally gives us:

- better timeout control for long prompts
- saved raw model output for repair and audit
- validation before publishing to employees
- no production outage if the model returns malformed JSON

The server should stay small: Feishu SSO, SQLite state, comments, reactions, public highlights, task creation, and event callbacks.

## Standard weekly flow

1. Export Feishu reports as xlsx.
2. Normalize the export:

```bash
npm run import:reports -- "/Users/cyberfish/Downloads/汇报内容导出-20260516.xlsx"
```

3. Run Kimi map-reduce analysis against the latest normalized data and historical context.
4. Validate generated JSON.
5. Build and export a static release.
6. Upload static release to the server.
7. Keep lightweight interaction state in SQLite.

## Incremental import rules

- Use `sourceHash` to deduplicate reports.
- If the same employee/week is re-imported, keep the latest submitted version and preserve the old source in import history.
- Late submissions are not special operationally: import the new xlsx, detect the changed row, rerun only the affected employee batch plus the final overview.
- Historical reports beyond the recent window should be kept in the knowledge base, but not rendered all at once in the personal page.

## Batching strategy

The model should run in small batches:

- company overview from compact report summaries
- theme/problem radar from extracted evidence
- employee insight batches of about 3 to 5 people
- final merge/validation pass

This keeps the overall analysis coherent without asking a single model call to return one giant JSON object.
