import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const prototypePath = path.join(rootDir, "src/data/prototypeData.json");

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadDotEnv(filePath) {
  const env = {};
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsAt = trimmed.indexOf("=");
      if (equalsAt === -1) continue;
      env[trimmed.slice(0, equalsAt).trim()] = parseEnvValue(trimmed.slice(equalsAt + 1));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...env, ...process.env };
}

async function readRoster(dbPath) {
  const sql = `
    SELECT
      COALESCE(open_id, ''),
      COALESCE(name, ''),
      COALESCE(department, ''),
      COALESCE(email, ''),
      COALESCE(is_active, 1)
    FROM employees
    ORDER BY name;
  `;
  const { stdout } = await execFileAsync("sqlite3", ["-separator", "\t", dbPath, sql], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [openId, name, department, email, active] = line.split("\t");
      return { openId, name, department, email, active: Number(active) === 1 };
    })
    .filter((row) => row.name);
}

function defaultSummary(row) {
  return {
    "姓名": row.name,
    "部门": row.department,
    "open_id": row.openId,
    "企业邮箱": row.email,
    "在职状态": "在职",
    "周报数": 0,
    "准时次数": 0,
    "迟交次数": 0,
    "平均分": 0,
    "等级": "待评",
    "自动等级": "待评",
    "趋势": 0,
    "弱问题周数": 0,
    "人工校准说明": "尚无可用周报记录。",
    "一句话成长判断": `${row.name}尚无可用周报记录。`,
  };
}

async function main() {
  const env = await loadDotEnv(path.join(rootDir, ".env"));
  const dbPath = path.resolve(rootDir, env.WEEKLY_REPORT_DB_PATH || "outputs/demo/weekly-report-os.sqlite");
  const [prototypeText, roster] = await Promise.all([readFile(prototypePath, "utf8"), readRoster(dbPath)]);
  const data = JSON.parse(prototypeText);
  const previousSummary = data.employee_summary ?? [];
  const previousByName = new Map(previousSummary.map((row) => [row["姓名"], row]));
  const previousByOpenId = new Map(previousSummary.filter((row) => row.open_id).map((row) => [row.open_id, row]));
  const activeRoster = roster.filter((row) => row.active);
  const inactiveNames = roster.filter((row) => !row.active).map((row) => row.name);
  if (activeRoster.length === 0) throw new Error("Active roster is empty; refusing to replace employee_summary");

  const previousActiveCount = previousSummary.filter((row) => String(row["在职状态"] ?? "在职") !== "离职").length;
  const minimumRatio = Number(env.ROSTER_SYNC_MIN_RATIO || 0.7);
  if (
    env.ROSTER_SYNC_ALLOW_SHRINK !== "1" &&
    previousActiveCount >= 5 &&
    activeRoster.length < Math.floor(previousActiveCount * minimumRatio)
  ) {
    throw new Error(
      `Active roster shrank from ${previousActiveCount} to ${activeRoster.length}; set ROSTER_SYNC_ALLOW_SHRINK=1 only after verification`,
    );
  }

  const duplicateNames = activeRoster
    .map((row) => row.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) throw new Error(`Duplicate active roster names: ${[...new Set(duplicateNames)].join(", ")}`);

  const currentWeekId = data.meta?.current_week_id;
  const currentSubmitters = new Set(
    (currentWeekId ? (data.weekly_scores ?? []).filter((row) => row["周期ID"] === currentWeekId) : [])
      .map((row) => row["姓名"])
      .filter(Boolean),
  );
  const allRosterNames = new Set(roster.map((row) => row.name));
  const unmappedSubmitters = [...currentSubmitters].filter((name) => !allRosterNames.has(name));
  if (unmappedSubmitters.length > 0) {
    throw new Error(`Current-period submitters are missing from employees table: ${unmappedSubmitters.join(", ")}`);
  }

  const employeeSummary = activeRoster.map((row) => {
    const previous = previousByOpenId.get(row.openId) ?? previousByName.get(row.name) ?? {};
    return {
      ...defaultSummary(row),
      ...previous,
      "姓名": row.name,
      "部门": row.department || previous["部门"] || "",
      "open_id": row.openId || previous["open_id"] || "",
      "企业邮箱": row.email || previous["企业邮箱"] || "",
      "在职状态": "在职",
    };
  });

  const nextData = {
    ...data,
    meta: {
      ...(data.meta ?? {}),
      people_count: employeeSummary.length,
      roster_synced_at: new Date().toISOString(),
    },
    employee_summary: employeeSummary,
  };
  const temporaryPath = `${prototypePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(nextData, null, 2)}\n`, "utf8");
  await rename(temporaryPath, prototypePath);
  console.log(JSON.stringify({
    ok: true,
    activeEmployees: employeeSummary.length,
    inactiveEmployees: inactiveNames.length,
    inactiveNames,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
