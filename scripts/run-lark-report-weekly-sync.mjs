import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const statusPath = path.join(rootDir, "outputs/lark-report-sync-status.json");
const releasesDir = path.join(rootDir, "outputs", "static-releases");
const distDir = path.join(rootDir, "dist");
const defaultExemptPeople = process.env.LARK_REPORT_AUTO_SYNC_EXEMPT || "";
const defaultSyncIdentity = process.env.LARK_REPORT_SYNC_IDENTITY || "user";

function parseArgs(argv) {
  const args = {
    exempt: defaultExemptPeople,
    commitEndOffsetDays: 2,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "";
    }
  }
  const period = inferPeriod(args);
  return { ...args, ...period };
}

function optionValue(value) {
  const text = String(value ?? "").trim();
  return text && !text.startsWith("--") ? text : "";
}

function inferPeriod(args) {
  const now = args.today ? new Date(`${args.today}T12:00:00+08:00`) : new Date();
  const currentMonday = mondayOf(now);
  const start = args.start || formatDate(addDays(currentMonday, -7));
  const end = args.end || formatDate(addDays(currentMonday, -3));
  const commitStart = args.commitStart || start;
  const commitEnd = args.commitEnd || formatDate(addDays(parseDate(end), Number(args.commitEndOffsetDays || 2)));
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  return {
    id: args.id || isoWeekId(startDate),
    label: args.label || chineseWeekLabel(startDate),
    range: args.range || `${startDate.getMonth() + 1}/${startDate.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`,
    start,
    end,
    generatedOn: args.generatedOn || formatDate(now),
    commitStart,
    commitEnd,
  };
}

function parseDate(value) {
  return new Date(`${value}T00:00:00+08:00`);
}

function mondayOf(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isoWeekId(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function chineseWeekLabel(date) {
  const month = date.getMonth() + 1;
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMonday = mondayOf(firstDay);
  if (firstMonday.getMonth() !== date.getMonth()) firstMonday.setDate(firstMonday.getDate() + 7);
  const index = Math.max(1, Math.floor((date - firstMonday) / (7 * 86400000)) + 1);
  const numerals = ["零", "一", "二", "三", "四", "五", "六"];
  return `${month}月第${numerals[index] || index}周`;
}

async function updateStatus(patch) {
  await mkdir(path.dirname(statusPath), { recursive: true });
  let previous = {};
  try {
    previous = JSON.parse(await readFile(statusPath, "utf8"));
  } catch {
    previous = {};
  }
  await writeFile(statusPath, `${JSON.stringify({ ...previous, ...patch, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

async function runStep(name, command, args, options = {}) {
  await updateStatus({ phase: name, message: options.message || name });
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: options.maxBuffer || 160 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return stdout;
}

async function publishLatestStaticRelease() {
  const releaseId = (await readFile(path.join(releasesDir, "latest.txt"), "utf8")).trim();
  if (!releaseId) throw new Error("static release latest.txt is empty");

  const releaseDir = path.join(releasesDir, releaseId);
  await readFile(path.join(releaseDir, "index.html"), "utf8");
  await readFile(path.join(releaseDir, "release-manifest.json"), "utf8");

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(releaseDir, distDir, { recursive: true });
  return releaseId;
}

async function verifyMonthlyMeetingIncluded(releaseId) {
  const releaseDir = path.join(releasesDir, releaseId);
  const assetsDir = path.join(releaseDir, "assets");
  const assetFiles = await readdir(assetsDir).catch(() => []);
  const jsFiles = assetFiles.filter((file) => file.endsWith(".js"));
  for (const file of jsFiles) {
    const content = await readFile(path.join(assetsDir, file), "utf8");
    if (content.includes("月度会议") && content.includes("经营复盘议程")) {
      return true;
    }
  }
  throw new Error("monthly meeting page marker not found in static release");
}

function parseLastJsonObject(text) {
  const cleaned = String(text || "").trim();
  const first = cleaned.lastIndexOf("{\n");
  const jsonText = first >= 0 ? cleaned.slice(first) : cleaned;
  return JSON.parse(jsonText);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedStatus = {
    ok: true,
    running: true,
    phase: "started",
    message: "飞书汇报同步已开始",
    source: args.source || "manual_script",
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    rawOutputPath: undefined,
    importOutputPath: undefined,
    releaseId: undefined,
    monthlyMeetingIncluded: undefined,
    monthlyMeetingMessage: undefined,
    rowCount: undefined,
    error: undefined,
    period: {
      id: args.id,
      label: args.label,
      range: args.range,
      start: args.start,
      end: args.end,
      commitStart: args.commitStart,
      commitEnd: args.commitEnd,
    },
  };
  if (!args.source) startedStatus.queuedAt = undefined;
  await updateStatus(startedStatus);

  try {
    const syncOutput = await runStep(
      "pull_lark_report",
      "node",
      [
        "scripts/sync-lark-report.mjs",
        "--start",
        args.commitStart,
        "--end",
        args.commitEnd,
        "--as",
        args.as || defaultSyncIdentity,
        ...(optionValue(args["rule-id"]) ? ["--rule-id", optionValue(args["rule-id"])] : []),
      ],
      { message: "正在从飞书汇报接口拉取本周期数据" },
    );
    const syncResult = parseLastJsonObject(syncOutput);

    await runStep(
      "merge_weekly_data",
      "node",
      [
        "scripts/apply-weekly-import-to-prototype.mjs",
        syncResult.importOutputPath,
        "--id",
        args.id,
        "--label",
        args.label,
        "--range",
        args.range,
        "--start",
        args.start,
        "--end",
        args.end,
        "--generatedOn",
        args.generatedOn,
        "--exempt",
        args.exempt || "",
      ],
      { message: "正在合并本周数据到成长 OS 历史库" },
    );

    await runStep("kimi_analysis", "npm", ["run", "ai:app-data"], {
      message: "正在运行 Kimi 周报预处理",
      env: { KIMI_APP_IGNORE_CACHE: "1" },
    });
    await runStep("weekly_reminder_outbox", "npm", ["run", "reminders:prepare"], {
      message: "正在预生成周五成长提醒 outbox",
    });
    await runStep("weekly_update_reminder_outbox", "npm", ["run", "reminders:prepare"], {
      message: "正在预生成周一更新通知 outbox",
      env: { WEEKLY_REMINDER_KIND: "monday_update" },
    });
    await runStep("static_release", "npm", ["run", "static:release"], {
      message: "正在校验并构建最新页面",
    });
    await updateStatus({ phase: "publish_static_release", message: "正在发布最新页面到线上 dist" });
    const releaseId = await publishLatestStaticRelease();
    const monthlyMeetingIncluded = await verifyMonthlyMeetingIncluded(releaseId);

    await updateStatus({
      ok: true,
      running: false,
      phase: "done",
      message: "飞书汇报同步、AI 预处理和页面构建已完成",
      finishedAt: new Date().toISOString(),
      rawOutputPath: syncResult.rawOutputPath,
      importOutputPath: syncResult.importOutputPath,
      releaseId,
      monthlyMeetingIncluded,
      monthlyMeetingMessage: "月度经营复盘会页面已纳入本次静态页面构建",
      rowCount: syncResult.rowCount,
    });
  } catch (error) {
    await updateStatus({
      ok: false,
      running: false,
      phase: "failed",
      message: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
