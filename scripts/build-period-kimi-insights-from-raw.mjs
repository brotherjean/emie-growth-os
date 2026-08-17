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
  const models = meta.models ?? insight.meta?.models;
  const modelValues = Object.values(models ?? {}).flat().filter(Boolean);
  const uniqueModels = [...new Set(modelValues)];
  return {
    meta: {
      ...(insight.meta ?? {}),
      provider: "kimi",
      model: uniqueModels.length > 1 ? "mixed" : uniqueModels[0] || insight.meta?.model || "kimi-k2.6",
      modelStrategy: models ? "hybrid" : insight.meta?.modelStrategy,
      ...(models ? { models } : {}),
      generatedAt: meta.generatedAt || new Date().toISOString(),
      source: "raw-cache",
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
  const runFilesByPeriod = new Map();
  for (const file of files.filter((name) => /^kimi-app-data\.2026-W\d{2}\.run\.json$/.test(name))) {
    const run = await readJson(path.join(outputDir, file));
    const periodId = file.match(/kimi-app-data\.(2026-W\d{2})\.run\.json/)?.[1];
    if (!periodId || !Array.isArray(run.blocks)) continue;
    runFilesByPeriod.set(periodId, new Set(run.blocks.map((block) => block.rawLabel).filter(Boolean)));
  }
  const rawPattern = /^kimi-app-data\.(2026-W\d{2})-((?:briefing|attention|themes)(?:\.retry)?|employees-\d{2}(?:-[^.]+)?(?:\.retry)?)\.raw\.txt$/;

  for (const file of files) {
    const match = file.match(rawPattern);
    if (!match) continue;
    const [, periodId, block] = match;
    const rawLabel = file.slice("kimi-app-data.".length, -".raw.txt".length);
    const allowedLabels = runFilesByPeriod.get(periodId);
    if (allowedLabels && !allowedLabels.has(rawLabel)) continue;
    const blockKind = block.replace(/\.retry$/, "");
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
      models: {},
      data: {},
      employeeInsights: [],
    };
    const rawMeta = await readJson(filePath.replace(/\.raw\.txt$/, ".meta.json"));
    entry.generatedAt = new Date(Math.max(Date.parse(entry.generatedAt), (await stat(filePath)).mtimeMs)).toISOString();

    if (blockKind === "briefing") {
      if (shouldPrefer(block, entry.rawLabels.briefing)) {
        entry.rawLabels.briefing = block;
        if (rawMeta.model) entry.models.briefing = rawMeta.model;
        entry.data = {
          ...entry.data,
          executiveSummary: parsed.executiveSummary,
          collectiveFocus: parsed.collectiveFocus,
          companyMessageDraft: parsed.companyMessageDraft,
          mustReadReports: parsed.mustReadReports,
        };
      }
    } else if (blockKind === "attention") {
      if (shouldPrefer(block, entry.rawLabels.attention)) {
        entry.rawLabels.attention = block;
        if (rawMeta.model) entry.models.attention = rawMeta.model;
        entry.data.attentionQueue = parsed.attentionQueue;
      }
    } else if (blockKind === "themes") {
      if (shouldPrefer(block, entry.rawLabels.themes)) {
        entry.rawLabels.themes = block;
        if (rawMeta.model) entry.models.themes = rawMeta.model;
        entry.data.themes = parsed.themes;
      }
    } else if (blockKind.startsWith("employees-")) {
      if (rawMeta.model) {
        entry.models.employees = [...new Set([...(entry.models.employees ?? []), rawMeta.model])];
      }
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
    }, { generatedAt: entry.generatedAt, models: Object.keys(entry.models).length > 0 ? entry.models : undefined });
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
