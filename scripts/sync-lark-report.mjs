import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const outputDir = path.join(rootDir, "outputs");
const importDir = path.join(outputDir, "imports");
const skillScript =
  process.env.LARK_REPORT_SKILL_SCRIPT || path.join(rootDir, "scripts", "query-lark-report-tasks.py");
const pythonBin = process.env.PYTHON || process.env.PYTHON3 || "python3";

function parseArgs(argv) {
  const args = {
    identity: process.env.LARK_REPORT_SYNC_IDENTITY || "user",
    timezone: "Asia/Shanghai",
    pageAll: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "page-all") {
      args.pageAll = true;
      continue;
    }
    if (key === "no-page-all") {
      args.pageAll = false;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "";
    }
  }
  if (!args.input && (!args.start || !args.end)) {
    throw new Error("Usage: node scripts/sync-lark-report.mjs --start YYYY-MM-DD --end YYYY-MM-DD [--rule-id xxx] [--as user|bot] OR --input raw.json");
  }
  return args;
}

function optionValue(value) {
  const text = String(value ?? "").trim();
  return text && !text.startsWith("--") ? text : "";
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localTime(seconds) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(Number(seconds) * 1000))
    .replace(" ", " ");
}

function normalizeFieldName(name) {
  return clean(name).replace(/\s+$/g, "");
}

function responseItems(raw) {
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data?.items)) return raw.data.items;
  if (Array.isArray(raw?.data?.data?.items)) return raw.data.data.items;
  return [];
}

async function queryLarkReport(args, rawOutputPath) {
  const commandArgs = [
    skillScript,
    "--start",
    args.start,
    "--end",
    args.end,
    "--as",
    args.as || args.identity,
    "--timezone",
    args.timezone,
    "--output",
    rawOutputPath,
  ];
  const ruleId = optionValue(args.ruleId || args["rule-id"]);
  const userId = optionValue(args.userId || args["user-id"]);
  if (ruleId) commandArgs.push("--rule-id", ruleId);
  if (userId) commandArgs.push("--user-id", userId);
  if (args.pageAll) commandArgs.push("--page-all");
  const { stderr } = await execFileAsync(pythonBin, commandArgs, {
    cwd: rootDir,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (stderr) process.stderr.write(stderr);
}

function normalizeItem(item, index) {
  const fields = Object.fromEntries(
    (item.form_contents || []).map((field) => [normalizeFieldName(field.field_name), clean(field.field_value)]),
  );
  const content = {
    results: fields["本周成果（只写最重要的3-5件事，用数据说话，拒绝流水账）"] || "",
    problems: fields["问题与挑战（暴露风险，寻求支持，不要隐瞒）"] || "",
    nextPlan: fields["下周工作计划与目标（目标明确，优先级排序）"] || "",
    reflection: fields["思考与复盘"] || "",
    files: fields["相关文件"] || "",
  };
  const stable = [
    item.from_user_id,
    item.from_user_name,
    item.commit_time,
    content.results,
    content.problems,
    content.nextPlan,
    content.reflection,
  ].join("\n");
  const sourceHash = hash(stable);
  return {
    id: item.task_id ? `lark-report-${item.task_id}` : `lark-report-${sourceHash.slice(0, 16)}`,
    rowNumber: index + 2,
    employeeNo: "",
    employeeName: clean(item.from_user_name),
    email: "",
    department: clean(item.department_name),
    submittedAt: item.commit_time ? localTime(item.commit_time) : "",
    editStatus: "",
    submitStatus: "准时提交",
    lark: {
      taskId: item.task_id || "",
      ruleId: item.rule_id || "",
      ruleName: item.rule_name || "",
      fromUserId: item.from_user_id || "",
      toUserIds: item.to_user_ids || [],
      toUserNames: item.to_user_names || [],
      departmentIds: item.department_ids || [],
    },
    interaction: {
      commentCount: 0,
      likeCount: 0,
      readCount: 0,
      unreadCount: 0,
      commentInfo: "",
    },
    content,
    sourceHash,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(importDir, { recursive: true });
  const runStamp = stamp();
  const rawOutputPath = args.input
    ? path.resolve(rootDir, args.input)
    : path.join(outputDir, `lark-report-${runStamp}-${args.start}-to-${args.end}.json`);

  if (!args.input) {
    await queryLarkReport(args, rawOutputPath);
  }

  const raw = JSON.parse(await readFile(rawOutputPath, "utf8"));
  const items = responseItems(raw);
  const records = items
    .map(normalizeItem)
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)) || a.employeeName.localeCompare(b.employeeName, "zh-Hans-CN"));
  const ruleNames = Array.from(new Set(records.map((record) => record.lark.ruleName).filter(Boolean)));
  const ruleIds = Array.from(new Set(records.map((record) => record.lark.ruleId).filter(Boolean)));
  const payload = {
    meta: {
      sourceName: path.basename(rawOutputPath),
      importedAt: new Date().toISOString(),
      rowCount: records.length,
      parser: "lark-report-api",
      rawOutputPath,
      ruleNames,
      ruleIds,
      commitStart: args.start || "",
      commitEnd: args.end || "",
    },
    records,
  };
  const importOutputPath = path.join(importDir, `${runStamp}-lark-report-${args.start || "input"}-${args.end || "raw"}.json`);
  await writeFile(importOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    rawOutputPath,
    importOutputPath,
    rowCount: records.length,
    ruleNames,
    sampleNames: records.slice(0, 5).map((record) => record.employeeName),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
