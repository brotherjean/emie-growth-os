import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "outputs");

function fail(message, detail = {}) {
  return { level: "error", message, detail };
}

function warn(message, detail = {}) {
  return { level: "warn", message, detail };
}

function isArray(value) {
  return Array.isArray(value);
}

function unique(values) {
  return new Set(values.filter(Boolean));
}

async function main() {
  const [rawText, insightsText] = await Promise.all([
    readFile(path.join(rootDir, "src/data/prototypeData.json"), "utf8"),
    readFile(path.join(rootDir, "src/data/kimiInsights.json"), "utf8"),
  ]);
  const raw = JSON.parse(rawText);
  const insights = JSON.parse(insightsText);
  const issues = [];
  const isDemo = raw.meta?.source_xlsx === "ANONYMIZED_DEMO" || insights.meta?.source?.startsWith("ANONYMIZED_DEMO");
  const minimums = isDemo
    ? { executiveSummary: 1, attentionQueue: 1, themes: 1, mustReadReports: 1, tasksPerEmployee: 1 }
    : { executiveSummary: 3, attentionQueue: 6, themes: 5, mustReadReports: 4, tasksPerEmployee: 2 };

  const expectedEmployees = (raw.employee_summary ?? []).map((item) => item["姓名"]);
  const expectedEmployeeSet = unique(expectedEmployees);
  const insightEmployees = (insights.employeeInsights ?? []).map((item) => item.name);
  const insightEmployeeSet = unique(insightEmployees);
  const missingEmployees = expectedEmployees.filter((name) => !insightEmployeeSet.has(name));
  const duplicateEmployees = insightEmployees.filter((name, index) => insightEmployees.indexOf(name) !== index);

  if (!isDemo && insights.meta?.provider !== "kimi") issues.push(warn("provider is not kimi", { provider: insights.meta?.provider }));
  if (!insights.meta?.generatedAt) issues.push(fail("missing generatedAt"));
  if (!isArray(insights.executiveSummary) || insights.executiveSummary.length < minimums.executiveSummary) {
    issues.push(fail(`executiveSummary should contain at least ${minimums.executiveSummary} items`));
  }
  if (!isArray(insights.attentionQueue) || insights.attentionQueue.length < minimums.attentionQueue) {
    issues.push(fail(`attentionQueue should contain at least ${minimums.attentionQueue} items`));
  }
  if (!isArray(insights.themes) || insights.themes.length < minimums.themes) {
    issues.push(fail(`themes should contain at least ${minimums.themes} items`));
  }
  if (!isArray(insights.mustReadReports) || insights.mustReadReports.length < minimums.mustReadReports) {
    issues.push(fail(`mustReadReports should contain at least ${minimums.mustReadReports} items`));
  }
  if (missingEmployees.length > 0) issues.push(fail("missing employeeInsights", { missingEmployees }));
  if (duplicateEmployees.length > 0) issues.push(fail("duplicate employeeInsights", { duplicateEmployees }));

  const taskCounts = [];
  const malformedQuestionEmployees = [];
  const malformedTaskEmployees = [];
  for (const employee of insights.employeeInsights ?? []) {
    if (!isArray(employee.coachQuestions)) malformedQuestionEmployees.push(employee.name);
    if (!isArray(employee.taskCandidates)) {
      malformedTaskEmployees.push(employee.name);
      continue;
    }
    taskCounts.push({ name: employee.name, count: employee.taskCandidates.length });
    if (employee.taskCandidates.length < minimums.tasksPerEmployee) {
      issues.push(warn(`employee has fewer than ${minimums.tasksPerEmployee} task candidates`, { name: employee.name }));
    }
    for (const task of employee.taskCandidates) {
      for (const field of ["title", "description", "dueDate", "metric", "evidence", "aiIntent", "firstStep"]) {
        if (!String(task[field] ?? "").trim()) issues.push(warn("task candidate missing field", { employee: employee.name, title: task.title, field }));
      }
    }
  }
  if (malformedQuestionEmployees.length > 0) issues.push(fail("coachQuestions must be arrays", { malformedQuestionEmployees }));
  if (malformedTaskEmployees.length > 0) issues.push(fail("taskCandidates must be arrays", { malformedTaskEmployees }));

  for (const theme of insights.themes ?? []) {
    if (!isArray(theme.quotes) || theme.quotes.length < 1) {
      issues.push(warn("theme has no quotes", { label: theme.label }));
    }
  }

  const summary = {
    ok: !issues.some((issue) => issue.level === "error"),
    mode: isDemo ? "demo" : "production",
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: insights.meta?.generatedAt,
    expectedEmployees: expectedEmployeeSet.size,
    insightEmployees: insightEmployeeSet.size,
    attentionQueue: insights.attentionQueue?.length ?? 0,
    themes: insights.themes?.length ?? 0,
    mustReadReports: insights.mustReadReports?.length ?? 0,
    taskCandidates: taskCounts.reduce((sum, item) => sum + item.count, 0),
    minTasksPerEmployee: Math.min(...taskCounts.map((item) => item.count)),
    maxTasksPerEmployee: Math.max(...taskCounts.map((item) => item.count)),
    issues,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "kimi-validation-report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
