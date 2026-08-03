import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const dataPath = path.join(rootDir, "src/data/prototypeData.json");
const weeklyInsightsPath = path.join(rootDir, "src/data/kimiInsightsByPeriod.json");
const archivePath = path.join(rootDir, "src/data/monthlyMeetingInsights.json");
const outputDir = path.join(rootDir, "outputs/monthly-meetings");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const next = argv[index + 1];
    args[item.slice(2)] = next && !next.startsWith("--") ? next : "";
    if (next && !next.startsWith("--")) index += 1;
  }
  return args;
}

function parseEnvValue(value) {
  const text = value.trim();
  return ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
}

async function loadEnv() {
  const values = {};
  try {
    const text = await readFile(path.join(rootDir, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsAt = trimmed.indexOf("=");
      if (equalsAt < 1) continue;
      values[trimmed.slice(0, equalsAt).trim()] = parseEnvValue(trimmed.slice(equalsAt + 1));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...values, ...process.env };
}

function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromDate(value) {
  return /^\d{4}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 7) : "";
}

function periodMonthKey(period, fallbackYear) {
  const labelMonth = String(period?.label || "").match(/(\d{1,2})月/)?.[1];
  if (labelMonth) {
    const paddedMonth = labelMonth.padStart(2, "0");
    const matchingDate = [period?.start, period?.end].find((value) => String(value || "").slice(5, 7) === paddedMonth);
    const year = String(matchingDate || period?.end || period?.start || fallbackYear).slice(0, 4);
    return `${year}-${paddedMonth}`;
  }
  return monthKeyFromDate(period?.start) || monthKeyFromDate(period?.end);
}

function compact(value, maxLength = 420) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildPack(raw, insightsByPeriod, monthKey) {
  const previousKey = previousMonthKey(monthKey);
  const year = monthKey.slice(0, 4);
  const periods = raw.meta?.periods ?? [];
  const periodMonth = new Map(periods.map((period) => [period.id, periodMonthKey(period, year)]));
  const periodLabels = new Map(periods.map((period) => [period.id, `${period.label} ${period.range}`.trim()]));
  const rowsFor = (targetMonth) => (raw.weekly_scores ?? [])
    .filter((row) => periodMonth.get(row["周期ID"]) === targetMonth)
    .map((row) => ({
      name: row["姓名"],
      department: row["部门"],
      periodId: row["周期ID"],
      period: periodLabels.get(row["周期ID"]) || row["周次"],
      score: row["总分"],
      result: compact(row["本周成果摘要"]),
      problem: compact(row["问题摘要"]),
      plan: compact(row["下周计划摘要"]),
      reflection: compact(row["思考与复盘摘要"], 300),
    }));
  const periodIdsFor = (targetMonth) => periods.filter((period) => periodMonthKey(period, year) === targetMonth).map((period) => period.id);
  const insightsFor = (targetMonth) => periodIdsFor(targetMonth).map((periodId) => {
    const insight = insightsByPeriod[periodId] ?? {};
    return {
      periodId,
      period: periodLabels.get(periodId) || periodId,
      executiveSummary: (insight.executiveSummary ?? []).slice(0, 8),
      attentionQueue: (insight.attentionQueue ?? []).slice(0, 12).map((item) => ({
        priority: item.priority,
        title: item.title,
        source: item.source,
        department: item.department,
        owner: item.owner,
        evidence: compact(item.evidence, 520),
      })),
      themes: (insight.themes ?? []).slice(0, 8).map((item) => ({ title: item.title, score: item.score, summary: compact(item.summary) })),
    };
  });
  return {
    monthKey,
    previousMonthKey: previousKey,
    current: { rows: rowsFor(monthKey), insights: insightsFor(monthKey) },
    previous: { rows: rowsFor(previousKey), insights: insightsFor(previousKey) },
  };
}

function buildPrompt(pack, meetingDate) {
  return `你是成长OS的月度经营复盘分析引擎。请基于周报评分摘要、问题证据和周级AI分析，生成${pack.monthKey}月度复盘，会议日期为${meetingDate || "待定"}。

分析原则：
1. 只依据输入事实，不虚构财务数字、完成状态或责任人。
2. 重点比较上月与本月：哪些真的改善、哪些跨月重复、哪些是本月新风险。
3. 改善必须有连续证据；重复问题要说明重复模式；新风险要指出首次出现的事实。
4. 结论服务老板全天会议，具体、克制、可追问，避免空泛口号。
5. 不输出员工完整周报正文，只输出必要的归纳结论。

只输出一个严格 JSON object：
{
  "executiveSummary": ["6-8条月度总览，每条40-100字"],
  "comparison": {
    "improvements": ["2-5条有证据的进步"],
    "recurringIssues": ["2-6条跨月未闭环问题"],
    "newRisks": ["2-6条本月新增风险"]
  }
}

输入数据：
${JSON.stringify(pack)}`;
}

function responseText(data) {
  return String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning_content || "").trim();
}

async function callModel(env, model, prompt) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");
  const baseUrl = String(env.MOONSHOT_BASE_URL || env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, "");
  const isK3 = model === "kimi-k3";
  const body = {
    model,
    messages: [
      { role: "system", content: "你是企业月度复盘分析引擎，只输出符合字段要求的 JSON object。" },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: Number(env.KIMI_MONTHLY_MAX_TOKENS || 7600),
    response_format: { type: "json_object" },
    ...(isK3
      ? { reasoning_effort: env.KIMI_MONTHLY_REASONING_EFFORT || "high" }
      : { temperature: 0.6, thinking: { type: "disabled" } }),
  };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(env.KIMI_MONTHLY_TIMEOUT_MS || 300000)),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${model}: ${response.status} ${data?.error?.message || response.statusText}`);
  const content = responseText(data);
  if (!content) throw new Error(`${model}: empty response`);
  return JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
}

function normalizeResult(result) {
  return {
    executiveSummary: Array.isArray(result.executiveSummary) ? result.executiveSummary.slice(0, 8).map(String) : [],
    comparison: {
      improvements: Array.isArray(result.comparison?.improvements) ? result.comparison.improvements.slice(0, 6).map(String) : [],
      recurringIssues: Array.isArray(result.comparison?.recurringIssues) ? result.comparison.recurringIssues.slice(0, 8).map(String) : [],
      newRisks: Array.isArray(result.comparison?.newRisks) ? result.comparison.newRisks.slice(0, 8).map(String) : [],
    },
  };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [env, rawText, weeklyInsightsText] = await Promise.all([
    loadEnv(),
    readFile(dataPath, "utf8"),
    readFile(weeklyInsightsPath, "utf8"),
  ]);
  const raw = JSON.parse(rawText);
  const generatedMonth = monthKeyFromDate(raw.meta?.generated_on);
  const monthKey = args.month || (generatedMonth ? previousMonthKey(generatedMonth) : "");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("A valid --month YYYY-MM is required");
  const pack = buildPack(raw, JSON.parse(weeklyInsightsText), monthKey);
  if (pack.current.rows.length === 0) throw new Error(`No weekly report rows found for ${monthKey}`);
  const sourceHash = createHash("sha256").update(JSON.stringify(pack)).digest("hex");
  let archive = { records: [] };
  try {
    archive = JSON.parse(await readFile(archivePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const existing = (archive.records ?? []).find((record) => record.monthKey === monthKey);
  const meetingDate = args["meeting-date"] || existing?.meetingDate || "";
  if (existing?.sourceHash === sourceHash && env.MONTHLY_MEETING_IGNORE_CACHE !== "1" && !args.force) {
    console.log(JSON.stringify({ ok: true, skipped: true, monthKey, model: existing.model, sourceHash }, null, 2));
    return;
  }

  const primaryModel = env.KIMI_MONTHLY_MODEL || "kimi-k3";
  const fallbackModel = env.KIMI_MONTHLY_FALLBACK_MODEL || env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  let model = primaryModel;
  let result;
  try {
    result = await callModel(env, primaryModel, buildPrompt(pack, meetingDate));
  } catch (error) {
    if (!fallbackModel || fallbackModel === primaryModel) throw error;
    console.warn(`Monthly meeting analysis fallback: ${error.message}`);
    model = fallbackModel;
    result = await callModel(env, fallbackModel, buildPrompt(pack, meetingDate));
  }
  const normalized = normalizeResult(result);
  const record = {
    monthKey,
    meetingDate,
    status: meetingDate ? "scheduled" : "archived",
    provider: "kimi",
    model,
    generatedAt: new Date().toISOString(),
    sourceHash,
    sourcePeriodIds: [...new Set(pack.current.rows.map((row) => row.periodId))],
    ...normalized,
  };
  const records = (archive.records ?? []).filter((item) => item.monthKey !== monthKey);
  records.push(record);
  records.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  archive = { records };
  await Promise.all([
    writeJsonAtomic(archivePath, archive),
    writeJsonAtomic(path.join(outputDir, `${monthKey}.json`), record),
  ]);
  console.log(JSON.stringify({ ok: true, skipped: false, monthKey, model, sourceHash, recordCount: records.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
