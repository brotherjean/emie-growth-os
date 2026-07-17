import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const insightsPath = path.join(rootDir, "src/data/kimiInsights.json");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function hash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function nextFriday() {
  const date = new Date();
  const day = date.getDay();
  const distance = (5 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + distance);
  return date.toISOString().slice(0, 10);
}

function normalizeDueDate(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  return nextFriday();
}

function makeDescription(task, type) {
  const line = (label, value) => {
    const text = String(value ?? "").trim();
    return text ? `${label}：${text}` : "";
  };
  return [
    line("来源", type === "attention" ? "老板注意力队列" : "员工周报任务候选"),
    line("人员", task.source || task.owner),
    line("部门", task.department),
    line("主题/上下文", task.theme || task.contextNeed),
    "",
    line("任务说明", task.description || task.whyBoss),
    line("AI 澄清意图", task.aiIntent || task.whyBoss),
    line("第一步", task.firstStep),
    line("验收口径", task.metric || task.acceptance),
    line("需要支持", task.supportNeeded),
    "",
    line("周报证据", task.evidence),
  ]
    .filter((item) => item.trim() !== "")
    .join("\n");
}

function toTaskRows(insights) {
  const attentionRows = (insights.attentionQueue ?? []).map((task, index) => ({
    type: "attention",
    id: `attention-${index}-${hash(task.title ?? "")}`,
    priority: task.priority,
    title: task.title,
    ownerOpenId: task.ownerOpenId,
    dueDate: task.dueDate,
    description: makeDescription(task, "attention"),
  }));

  const employeeRows = (insights.employeeInsights ?? []).flatMap((employee) =>
    (employee.taskCandidates ?? []).map((task, index) => ({
      type: "employee",
      id: task.id || `${employee.name}-${index}-${hash(task.title ?? "")}`,
      priority: task.priority,
      title: task.title,
      ownerOpenId: task.ownerOpenId,
      dueDate: task.dueDate,
      description: makeDescription(task, "employee"),
      employeeName: employee.name,
    })),
  );

  return [...attentionRows, ...employeeRows];
}

function runLark(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("lark-cli", args, { stdio: ["ignore", "pipe", "pipe"] });
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
      else reject(new Error(stderr || stdout || `lark-cli exited with ${code}`));
    });
  });
}

async function main() {
  const execute = hasFlag("--execute");
  const type = getArg("--type", "all");
  const employee = getArg("--employee", "");
  const limit = Number(getArg("--limit", execute ? "0" : "3"));
  const insights = JSON.parse(await readFile(insightsPath, "utf8"));
  let rows = toTaskRows(insights).filter((row) => type === "all" || row.type === type);
  if (employee) rows = rows.filter((row) => row.employeeName === employee);
  if (limit > 0) rows = rows.slice(0, limit);

  if (rows.length === 0) {
    console.log("No task candidates matched.");
    return;
  }

  console.log(`${execute ? "Creating" : "Dry-running"} ${rows.length} Feishu tasks`);
  for (const row of rows) {
    const args = [
      "task",
      "+create",
      "--as",
      "user",
      "--summary",
      `[${row.priority}] ${row.title}`,
      "--description",
      row.description,
      "--due",
      normalizeDueDate(row.dueDate),
      "--idempotency-key",
      `weekly-report-os-${row.type}-${hash(`${row.id}-${row.title}`)}`,
      "--format",
      "json",
    ];
    if (row.ownerOpenId) args.push("--assignee", row.ownerOpenId);
    if (!execute) args.push("--dry-run");

    const result = await runLark(args);
    console.log(result.stdout.trim());
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
