import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function asNumber(value) {
  return Number(value ?? 0);
}

function average(values) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function scoreLevel(score) {
  if (score == null) return "N/A";
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  return "C";
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function queryScores(dbPath) {
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    dbPath,
    "SELECT evaluee, evaluator, score, submitted_at FROM scores ORDER BY evaluee, evaluator;",
  ], { maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}

async function main() {
  const configPath = path.resolve(rootDir, arg("--config", "/Users/cyberfish/Downloads/scoring-app/scoring_config.json"));
  const dbPath = path.resolve(rootDir, arg("--db", "/Users/cyberfish/Downloads/scoring-app/scoring.db"));
  const cycleId = arg("--cycle-id", "2026-05-monthly-360");
  const cycleLabel = arg("--cycle-label", "2026年5月协同360评分");
  const startDate = arg("--start", "2026-05-01");
  const endDate = arg("--end", "2026-05-31");
  const mode = arg("--mode", "monthly");
  const output = path.resolve(rootDir, arg("--output", "src/data/scoring360.json"));

  const config = JSON.parse(await readFile(configPath, "utf8"));
  const scores = await queryScores(dbPath);
  const assignments = [];
  const employees = new Set();
  for (const item of config) {
    const evaluee = String(item.evaluee || "").trim();
    if (!evaluee) continue;
    employees.add(evaluee);
    for (const evaluatorRaw of item.evaluators || []) {
      const evaluator = String(evaluatorRaw || "").trim();
      if (!evaluator) continue;
      employees.add(evaluator);
      assignments.push({
        id: hash(`${cycleId}:${evaluee}:${evaluator}`).slice(0, 24),
        cycleId,
        evaluee,
        evaluator,
      });
    }
  }

  const scoreKey = new Map(scores.map((row) => [`${row.evaluee}::${row.evaluator}`, row]));
  const responseRows = assignments
    .map((assignment) => {
      const row = scoreKey.get(`${assignment.evaluee}::${assignment.evaluator}`);
      if (!row) return null;
      return {
        id: hash(`${assignment.id}:${row.submitted_at}:${row.score}`).slice(0, 24),
        assignmentId: assignment.id,
        cycleId,
        evaluee: assignment.evaluee,
        evaluator: assignment.evaluator,
        score: asNumber(row.score),
        submittedAt: String(row.submitted_at || ""),
      };
    })
    .filter(Boolean);

  const byEvaluee = new Map();
  for (const assignment of assignments) {
    if (!byEvaluee.has(assignment.evaluee)) byEvaluee.set(assignment.evaluee, []);
  }
  for (const response of responseRows) {
    if (!byEvaluee.has(response.evaluee)) byEvaluee.set(response.evaluee, []);
    byEvaluee.get(response.evaluee).push(response);
  }

  const results = Array.from(byEvaluee.entries()).map(([name, rows]) => {
    const expected = assignments.filter((assignment) => assignment.evaluee === name).length;
    const values = rows.map((row) => row.score);
    const avg = average(values);
    return {
      name,
      expected,
      submitted: rows.length,
      completionRate: expected ? Math.round((rows.length / expected) * 1000) / 10 : 0,
      averageScore: avg,
      level: scoreLevel(avg),
      minScore: values.length ? Math.min(...values) : null,
      maxScore: values.length ? Math.max(...values) : null,
      evaluators: rows.map((row) => row.evaluator),
    };
  }).sort((left, right) => (right.averageScore ?? -1) - (left.averageScore ?? -1));

  const payload = {
    meta: {
      importedAt: new Date().toISOString(),
      source: {
        configPath,
        dbPath,
      },
    },
    cycles: [
      {
        id: cycleId,
        label: cycleLabel,
        mode,
        startDate,
        endDate,
        status: "closed",
        totalEmployees: employees.size,
        totalEvaluees: config.length,
        totalAssignments: assignments.length,
        totalResponses: responseRows.length,
        progressPct: assignments.length ? Math.round((responseRows.length / assignments.length) * 1000) / 10 : 0,
        averageScore: average(responseRows.map((row) => row.score)),
      },
    ],
    employees: Array.from(employees).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    assignments,
    responses: responseRows,
    results,
  };

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    output,
    cycleId,
    employees: employees.size,
    assignments: assignments.length,
    responses: responseRows.length,
    averageScore: payload.cycles[0].averageScore,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
