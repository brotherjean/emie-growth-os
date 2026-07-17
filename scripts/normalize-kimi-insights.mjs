import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const insightsPath = path.join(rootDir, "src/data/kimiInsights.json");

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value ? [value] : [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.startsWith("'") && inner.endsWith("'")) {
      return inner
        .slice(1, -1)
        .split("','")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [trimmed];
  } catch {
    return trimmed
      .split(/[;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function deriveTitle(task) {
  const metric = text(task.metric);
  const docMatch = metric.match(/《([^》]+)》/);
  if (docMatch) return `输出${docMatch[1]}`;
  const firstStep = text(task.firstStep);
  if (firstStep) return firstStep.replace(/[，。；].+$/, "").slice(0, 34);
  const evidence = text(task.evidence);
  if (evidence) return `补齐${evidence.slice(0, 24)}的闭环`;
  return "补齐周报问题闭环任务";
}

function normalizeTask(task, employee) {
  const next = { ...task };
  next.source = text(next.source) || employee.name;
  next.department = text(next.department) || employee.department || "";
  next.owner = text(next.owner) || employee.name;
  next.priority = ["P0", "P1", "P2"].includes(next.priority) ? next.priority : "P2";
  next.title = text(next.title) || deriveTitle(next);
  next.description = text(next.description) || [text(next.aiIntent), text(next.firstStep)].filter(Boolean).join("；") || next.title;
  next.dueDate = text(next.dueDate) || "下周五";
  next.metric = text(next.metric) || "下周周报可回传完成状态、证据和下一步动作。";
  next.evidence = text(next.evidence);
  next.aiIntent = text(next.aiIntent) || "把周报里暴露的问题转成可执行、可验证的下一步。";
  next.firstStep = text(next.firstStep) || "先补齐现状、原因、下一步动作和验收口径。";
  next.supportNeeded = text(next.supportNeeded);
  next.contextNeed = text(next.contextNeed) || "个人历史周报、相关项目背景、公司知识库。";
  next.id = text(next.id) || `${employee.name}-${next.title}`.replace(/\s+/g, "-");
  return next;
}

async function main() {
  const insights = JSON.parse(await readFile(insightsPath, "utf8"));
  insights.executiveSummary = arrayFrom(insights.executiveSummary).map(text).filter(Boolean);
  insights.collectiveFocus = arrayFrom(insights.collectiveFocus);
  insights.attentionQueue = arrayFrom(insights.attentionQueue);
  insights.mustReadReports = arrayFrom(insights.mustReadReports);
  insights.themes = arrayFrom(insights.themes).map((theme) => ({
    ...theme,
    quotes: arrayFrom(theme.quotes),
  }));
  insights.employeeInsights = arrayFrom(insights.employeeInsights).map((employee) => ({
    ...employee,
    coachQuestions: arrayFrom(employee.coachQuestions).map(text).filter(Boolean),
    taskCandidates: arrayFrom(employee.taskCandidates).map((task) => normalizeTask(task, employee)),
  }));

  await writeFile(insightsPath, `${JSON.stringify(insights, null, 2)}\n`, "utf8");
  console.log(`Normalized: ${insightsPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
