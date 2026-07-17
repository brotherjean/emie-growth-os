import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "outputs");
const insightsPath = path.join(rootDir, "src/data/kimiInsights.json");
const prototypePath = path.join(rootDir, "src/data/prototypeData.json");
const periodInsightsPath = path.join(rootDir, "src/data/kimiInsightsByPeriod.json");

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) throw new Error("raw block did not contain a JSON object");
    return JSON.parse(cleaned.slice(first, last + 1));
  }
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeInsights(value, meta = {}) {
  const insight = value && typeof value === "object" ? value : {};
  return {
    meta: {
      provider: "kimi",
      model: "kimi-k2.6",
      generatedAt: meta.generatedAt || new Date().toISOString(),
      source: "raw-cache",
      ...(insight.meta ?? {}),
    },
    executiveSummary: Array.isArray(insight.executiveSummary) ? insight.executiveSummary.slice(0, 8) : [],
    collectiveFocus: Array.isArray(insight.collectiveFocus) ? insight.collectiveFocus.slice(0, 8) : [],
    companyMessageDraft: String(insight.companyMessageDraft ?? ""),
    attentionQueue: Array.isArray(insight.attentionQueue) ? insight.attentionQueue.slice(0, 12) : [],
    mustReadReports: Array.isArray(insight.mustReadReports) ? insight.mustReadReports.slice(0, 8) : [],
    themes: Array.isArray(insight.themes) ? insight.themes.slice(0, 8) : [],
    employeeInsights: Array.isArray(insight.employeeInsights) ? insight.employeeInsights : [],
    feishuTaskPlan: {
      tasklistName: "周报闭环任务池",
      requiredScopes: ["task:task:write", "task:task:read", "task:tasklist:write", "task:tasklist:read"],
      creationMode: "review_then_create",
      ...(insight.feishuTaskPlan ?? {}),
    },
  };
}

function shouldPrefer(nextLabel, currentLabel = "") {
  if (!currentLabel) return true;
  if (nextLabel.endsWith(".retry") && !currentLabel.endsWith(".retry")) return true;
  if (nextLabel.includes("-employees-") && !nextLabel.includes(".retry") && currentLabel.endsWith(".retry")) return false;
  return nextLabel > currentLabel;
}

function mergeEmployeeInsights(target, rawInsights) {
  const byName = new Map(target.map((item) => [item.name, item]));
  for (const item of rawInsights) {
    if (!item?.name) continue;
    byName.set(item.name, item);
  }
  return Array.from(byName.values());
}

async function parseRawFiles() {
  await mkdir(outputDir, { recursive: true });
  const files = await readdir(outputDir);
  const periods = new Map();
  const rawPattern = /^kimi-app-data\.(2026-W\d{2})-(briefing|attention|themes|employees-\d{2}(?:-[^.]+)?(?:\.retry)?)\.raw\.txt$/;

  for (const file of files) {
    const match = file.match(rawPattern);
    if (!match) continue;
    const [, periodId, block] = match;
    const filePath = path.join(outputDir, file);
    let parsed;
    try {
      parsed = extractJson(await readFile(filePath, "utf8"));
    } catch (error) {
      console.warn(`Skipping invalid Kimi raw block: ${file} (${error.message})`);
      continue;
    }

    const entry = periods.get(periodId) ?? {
      label: "",
      generatedAt: (await stat(filePath)).mtime.toISOString(),
      rawLabels: {},
      data: {},
      employeeInsights: [],
    };
    entry.generatedAt = new Date(Math.max(Date.parse(entry.generatedAt), (await stat(filePath)).mtimeMs)).toISOString();

    if (block === "briefing") {
      if (shouldPrefer(block, entry.rawLabels.briefing)) {
        entry.rawLabels.briefing = block;
        entry.data = {
          ...entry.data,
          executiveSummary: parsed.executiveSummary,
          collectiveFocus: parsed.collectiveFocus,
          companyMessageDraft: parsed.companyMessageDraft,
          mustReadReports: parsed.mustReadReports,
        };
      }
    } else if (block === "attention") {
      if (shouldPrefer(block, entry.rawLabels.attention)) {
        entry.rawLabels.attention = block;
        entry.data.attentionQueue = parsed.attentionQueue;
      }
    } else if (block === "themes") {
      if (shouldPrefer(block, entry.rawLabels.themes)) {
        entry.rawLabels.themes = block;
        entry.data.themes = parsed.themes;
      }
    } else if (block.startsWith("employees-")) {
      entry.employeeInsights = mergeEmployeeInsights(entry.employeeInsights, parsed.employeeInsights ?? []);
    }
    periods.set(periodId, entry);
  }

  return periods;
}

async function main() {
  const [prototypeData, currentInsights] = await Promise.all([
    readJson(prototypePath),
    readJson(insightsPath),
  ]);
  const currentPeriodId = String(prototypeData?.meta?.current_week_id || "");
  const currentGeneratedAt = String(currentInsights?.meta?.generatedAt || new Date().toISOString());
  const rawPeriods = await parseRawFiles();
  const byPeriod = {};

  for (const [periodId, entry] of rawPeriods.entries()) {
    byPeriod[periodId] = normalizeInsights({
      ...entry.data,
      employeeInsights: entry.employeeInsights,
      feishuTaskPlan: currentInsights.feishuTaskPlan,
    }, { generatedAt: entry.generatedAt });
  }

  if (currentPeriodId) {
    byPeriod[currentPeriodId] = normalizeInsights(currentInsights, { generatedAt: currentGeneratedAt });
  }

  await writeFile(periodInsightsPath, `${JSON.stringify(byPeriod, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(byPeriod).length} period Kimi insight snapshots: ${periodInsightsPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
