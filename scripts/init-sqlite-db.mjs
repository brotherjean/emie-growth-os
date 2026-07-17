import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const defaultDbPath = process.env.WEEKLY_REPORT_DB_PATH || path.join(rootDir, "outputs", "demo", "weekly-report-os.sqlite");

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function runSqlite(dbPath, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [dbPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `sqlite3 exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

async function main() {
  const dbPath = getArg("--db", defaultDbPath);
  await mkdir(path.dirname(dbPath), { recursive: true });
  const schema = await readFile(path.join(rootDir, "db", "schema.sql"), "utf8");
  await runSqlite(dbPath, schema);

  if (hasFlag("--seed")) {
    await runSqlite(
      dbPath,
      `
INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
VALUES
  ('transparency.mode', '{"mode":"balanced_transparency","label":"稳健透明模式"}', datetime('now')),
  ('release.channel', '{"type":"static","latestReleaseFromLocal":true}', datetime('now'));

INSERT OR REPLACE INTO visibility_policies (id, mode, content_type, default_visibility, redaction_level, rule_json)
VALUES
  ('balanced.boss_dashboard', 'balanced_transparency', 'boss_dashboard', 'boss', 'raw', '{"description":"完整老板驾驶舱仅老板/核心管理层可见"}'),
  ('balanced.attention_queue', 'balanced_transparency', 'attention_queue', 'management', 'summary', '{"description":"P0/P1 话题列表管理层可见"}'),
  ('balanced.company_briefing', 'balanced_transparency', 'company_briefing', 'all', 'anonymous', '{"description":"全员看脱敏公司简报"}'),
  ('balanced.employee_coach', 'balanced_transparency', 'employee_coach', 'self_manager', 'raw', '{"description":"个人点评仅本人和直属上级可见"}'),
  ('balanced.task_candidate', 'balanced_transparency', 'task_candidate', 'assignee_manager', 'summary', '{"description":"任务候选仅负责人、上级、协作者可见"}'),
  ('balanced.public_highlight', 'balanced_transparency', 'public_highlight', 'all', 'summary', '{"description":"员工主动公开的优秀周报全员可见"}');
`,
    );
  }

  const result = await runSqlite(
    dbPath,
    `
.headers on
.mode column
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
SELECT key, value_json FROM app_settings ORDER BY key;
`,
  );
  console.log(`SQLite ready: ${dbPath}`);
  console.log(result.stdout.trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
