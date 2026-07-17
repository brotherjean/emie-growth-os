import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const dataPath = path.join(rootDir, "src/data/prototypeData.json");
const insightsPath = path.join(rootDir, "src/data/kimiInsights.json");
const outputDir = path.join(rootDir, "outputs");

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

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function shorten(value, maxLength = 360) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Kimi response is not valid JSON");
  }
}

async function postJson(url, { headers, body, timeoutMs }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const data = safeJsonParse(text, { raw: text });
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return data;
}

function textFromKimi(data) {
  const message = data?.choices?.[0]?.message;
  return (message?.content || message?.reasoning_content || "").trim();
}

async function callKimi(env, prompt) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");
  const baseUrl = stripTrailingSlash(env.MOONSHOT_BASE_URL || env.KIMI_BASE_URL || "https://api.moonshot.cn/v1");
  const model = env.KIMI_REMINDER_MODEL || env.KIMI_LIGHT_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  const timeoutMs = Number(env.KIMI_REMINDER_TIMEOUT_MS || env.AI_ANALYSIS_TIMEOUT_MS || 120000);
  const data = await postJson(`${baseUrl}/chat/completions`, {
    timeoutMs,
    headers: { Authorization: `Bearer ${key}` },
    body: {
      model,
      messages: [
        {
          role: "system",
          content:
            "你是成长周报 OS 的员工提醒文案助手。你只输出严格 JSON，不输出 Markdown。语气温暖、具体、克制，以邀请和分享为主，不制造压力，不夸大事实。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_completion_tokens: Number(env.KIMI_REMINDER_MAX_TOKENS || 900),
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
    },
  });
  return { parsed: extractJsonObject(textFromKimi(data)), model };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callKimiWithRetry(env, prompt) {
  const attempts = Number(env.KIMI_REMINDER_RETRIES || 3);
  const baseDelayMs = Number(env.KIMI_REMINDER_RETRY_DELAY_MS || 3000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callKimi(env, prompt);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      const retryable = /429|overloaded|timeout|JSON/i.test(message);
      if (!retryable || attempt === attempts) break;
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

function currentPeriod(raw) {
  const meta = raw.meta || {};
  const periods = Array.isArray(meta.periods) ? meta.periods : [];
  const period = periods.find((item) => String(item.id || "") === String(meta.current_week_id || ""))
    || periods.at(-1)
    || {};
  return {
    id: String(period.id || meta.current_week_id || "latest"),
    label: [period.label || meta.current_week_label, period.range || meta.current_week_range].filter(Boolean).join(" ").trim(),
    rawLabel: String(period.label || meta.current_week_label || ""),
    range: String(period.range || meta.current_week_range || ""),
    exemptPeople: [
      ...toSimpleList(period.exempt_people || period.exemptPeople),
      ...toSimpleList(meta.exempt_people || meta.exemptPeople),
    ],
  };
}

function toSimpleList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,\n;，、]/).map((item) => item.trim()).filter(Boolean);
  return value ? [value] : [];
}

function recentWeeks(raw, name) {
  return (raw.weekly_scores || [])
    .filter((row) => String(row["姓名"] || "") === name)
    .slice(-6)
    .map((row) => ({
      week: row["周次"],
      score: row["总分"],
      level: row["等级"],
      status: row["状态"],
      result: shorten(row["本周成果摘要"], 260),
      problem: shorten(row["问题摘要"], 260),
      plan: shorten(row["下周计划摘要"], 220),
    }));
}

function compactInsight(insights, name) {
  const item = (insights.employeeInsights || []).find((row) => String(row.name || "") === name) || {};
  return {
    coachSummary: shorten(item.coachSummary, 520),
    coachQuestions: Array.isArray(item.coachQuestions) ? item.coachQuestions.slice(0, 3) : [],
    taskCandidates: Array.isArray(item.taskCandidates)
      ? item.taskCandidates.slice(0, 3).map((task) => ({
        priority: task.priority,
        title: task.title,
        description: shorten(task.description, 220),
      }))
      : [],
  };
}

function friendlyName(name) {
  const text = String(name || "").trim();
  if (text.length <= 2) return text;
  return text.slice(-2);
}

function buildOutboxPeriodId(periodId, kind) {
  return kind === "monday_update" ? `${periodId || "latest"}::monday_update` : String(periodId || "latest");
}

function buildPrompt({ employee, period, weeks, insight, baseUrl, kind }) {
  const displayName = friendlyName(employee.name);
  if (kind === "monday_update") {
    return `请为这位同事生成一条周一上午 10:30 发送的成长 OS 更新提醒。

固定目标：
1. 感谢他/她上周认真、详细地完成周报。
2. 明确说明：上周的周报分析已经更新到成长 OS。
3. 温柔鼓励他/她抽空阅读 AI 点评、成长记录和任务建议，并期待本周继续成长和进步。
4. 文案 100-220 个中文字符，包含入口 ${baseUrl}。
5. 结合历史周报表现、个人关注点或当前任务，写得像“对这个人说话”，但不要夸张、不要PUA、不要点名批评。
6. 不要编造没有给出的事实。

输出严格 JSON：
{
  "message": "最终发送给员工的完整文本",
  "personalizationNote": "一句话说明你根据哪些上下文做了个性化"
}

当前周期：${period.label}
同事：${employee.name} / ${employee.department}
建议称呼：${displayName}（除两字姓名外，尽量不要直呼全名）
员工概览：${JSON.stringify({
      averageScore: employee.averageScore,
      level: employee.level,
      trend: employee.trend,
      growthSummary: employee.growthSummary,
    })}
最近周报：${JSON.stringify(weeks)}
AI 点评上下文：${JSON.stringify(insight)}`;
  }

  return `请为这位同事生成一条周五下午 3 点发送的成长 OS 个性化提醒。

固定目标：
1. 周五提醒回顾的是上一周期周报，所以描述成绩、亮点、卡点时一律使用“上周”，不要写“本周”。
2. 明确说明：成长 OS 会在每周一早上自动更新周报分析。
3. 结合历史周报表现、个人关注点或当前任务，写得像“对这个人说话”，但不要夸张、不要PUA、不要点名批评。
4. 感谢他/她上一周的付出，建议他/她写新周报前先回看成长 OS。
5. 语气以邀请和分享为主，少用命令式表达；优先使用“我觉得”“我建议”“经过我的分析，我推荐你可以...”这类低压表达。
6. 除两字姓名外，开头称呼用名字，不要直呼全名。
7. 文案 100-220 个中文字符，包含入口 ${baseUrl}。
8. 不要编造没有给出的事实。

输出严格 JSON：
{
  "message": "最终发送给员工的完整文本",
  "personalizationNote": "一句话说明你根据哪些上下文做了个性化"
}

当前周期：${period.label}
同事：${employee.name} / ${employee.department}
建议称呼：${displayName}（除两字姓名外，尽量不要直呼全名）
员工概览：${JSON.stringify({
    averageScore: employee.averageScore,
    level: employee.level,
    trend: employee.trend,
    growthSummary: employee.growthSummary,
  })}
最近周报：${JSON.stringify(weeks)}
AI 点评上下文：${JSON.stringify(insight)}`;
}

function fallbackMessage(employee, period, baseUrl, kind) {
  const name = friendlyName(employee.name);
  if (kind === "monday_update") {
    return `${name}，早上好。

感谢你上周认真、详细地完成周报。上周的周报分析已经更新到成长 OS，你可以抽空看看自己的 AI 点评、成长记录和任务建议。

入口：${baseUrl}

期待你在这一周里，也继续带着复盘往前走，看到自己的成长和进步。`;
  }
  const periodText = period.label ? `上一周期「${period.label}」` : "上一周期";
  return `${name}，又到每周总结时间了。\n\n感谢你上一周的辛勤付出。成长 OS 会在每周一早上自动更新周报分析。我建议你在撰写新一周周报之前，可以先打开成长 OS 回看一下${periodText}的个人成长页：看看上周的 AI 点评、任务候选和未闭环事项，再滚动总结这一周的新进展。\n\n入口：${baseUrl}\n\n我觉得周报不只是提交给老板看的结果，也可以成为你自己的成长轨迹。`;
}

function normalizeReminderMessage(message, employee, baseUrl) {
  let text = String(message || "").trim();
  const fullName = String(employee.name || "").trim();
  const displayName = friendlyName(fullName);
  if (displayName && !text.startsWith(displayName) && !text.startsWith(fullName)) text = `${displayName}，${text}`;
  if (displayName && displayName !== fullName) {
    text = text.replace(new RegExp(`^${escapeRegExp(fullName)}([，,])`), `${displayName}$1`);
    text = text.replace(new RegExp(`^${escapeRegExp(fullName)}[，,]\\s*${escapeRegExp(displayName)}[，,]`), `${displayName}，`);
  }
  if (!text.includes(baseUrl)) text = `${text}\n\n入口：${baseUrl}`;
  return text;
}

function isMalformedReminderMessage(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  return /(?:这种|下周\s*plan\s*是|连续几周)\s*入口[:：]/i.test(text);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function upsertOutbox(dbPath, rows) {
  if (!dbPath || rows.length === 0) return;
  const statements = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    statements.push(`
      INSERT INTO weekly_reminder_outbox (
        id, period_id, period_label, recipient_open_id, recipient_name, department, message,
        personalization_note, provider, model, prompt_hash, status, source_json, updated_at
      ) VALUES (
        ${sqlValue(row.id)}, ${sqlValue(row.periodId)}, ${sqlValue(row.periodLabel)},
        ${sqlValue(row.recipientOpenId)}, ${sqlValue(row.recipientName)}, ${sqlValue(row.department)},
        ${sqlValue(row.message)}, ${sqlValue(row.personalizationNote)}, ${sqlValue(row.provider)},
        ${sqlValue(row.model)}, ${sqlValue(row.promptHash)}, 'prepared', ${sqlValue(JSON.stringify(row.source))},
        datetime('now')
      )
      ON CONFLICT(period_id, recipient_open_id) DO UPDATE SET
        period_label = excluded.period_label,
        recipient_name = excluded.recipient_name,
        department = excluded.department,
        message = CASE
          WHEN excluded.provider = 'local' AND weekly_reminder_outbox.provider = 'kimi' THEN weekly_reminder_outbox.message
          ELSE excluded.message
        END,
        personalization_note = CASE
          WHEN excluded.provider = 'local' AND weekly_reminder_outbox.provider = 'kimi' THEN weekly_reminder_outbox.personalization_note
          ELSE excluded.personalization_note
        END,
        provider = CASE
          WHEN excluded.provider = 'local' AND weekly_reminder_outbox.provider = 'kimi' THEN weekly_reminder_outbox.provider
          ELSE excluded.provider
        END,
        model = CASE
          WHEN excluded.provider = 'local' AND weekly_reminder_outbox.provider = 'kimi' THEN weekly_reminder_outbox.model
          ELSE excluded.model
        END,
        prompt_hash = CASE
          WHEN excluded.provider = 'local' AND weekly_reminder_outbox.provider = 'kimi' THEN weekly_reminder_outbox.prompt_hash
          ELSE excluded.prompt_hash
        END,
        status = 'prepared',
        source_json = excluded.source_json,
        feishu_message_id = NULL,
        sent_at = NULL,
        updated_at = datetime('now');
    `);
  }
  statements.push("COMMIT;");
  await execSql(dbPath, statements.join("\n"));
}

async function ensureDatabase(dbPath) {
  const schema = await readFile(path.join(rootDir, "db/schema.sql"), "utf8");
  await execSql(dbPath, schema);
}

async function execSql(dbPath, sql) {
  await new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [dbPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `sqlite3 exited with ${code}`));
    });
    child.stdin.end(`PRAGMA busy_timeout = 5000;\n${sql}`);
  });
}

async function main() {
  const env = await loadDotEnv(path.join(rootDir, ".env"));
  const [rawText, insightsText] = await Promise.all([
    readFile(dataPath, "utf8"),
    readFile(insightsPath, "utf8").catch(() => "{}"),
  ]);
  const raw = JSON.parse(rawText);
  const insights = safeJsonParse(insightsText, {});
  const period = currentPeriod(raw);
  const exempt = new Set(period.exemptPeople.map((name) => String(name || "").trim()).filter(Boolean));
  const limit = Number(env.WEEKLY_REMINDER_PREPARE_LIMIT || 0);
  const selectedNames = new Set(toSimpleList(env.WEEKLY_REMINDER_PREPARE_NAMES).map((name) => String(name || "").trim()).filter(Boolean));
  const kind = env.WEEKLY_REMINDER_KIND === "monday_update" ? "monday_update" : "friday_review";
  const outboxPeriodId = buildOutboxPeriodId(period.id, kind);
  const baseUrl = stripTrailingSlash(env.BASE_URL || "https://reportos.emie.cn");
  const employees = (raw.employee_summary || [])
    .map((row) => ({
      openId: String(row.open_id || row.openId || "").trim(),
      name: String(row["姓名"] || row.name || "").trim(),
      department: String(row["部门"] || row.department || "").trim(),
      averageScore: row["平均分"],
      level: row["等级"],
      trend: row["趋势"],
      growthSummary: shorten(row["一句话成长判断"], 360),
    }))
    .filter((employee) => employee.openId && employee.name && !exempt.has(employee.name))
    .filter((employee) => selectedNames.size === 0 || selectedNames.has(employee.name))
    .slice(0, limit > 0 ? limit : undefined);

  const rows = [];
  for (const [index, employee] of employees.entries()) {
    const weeks = recentWeeks(raw, employee.name);
    const insight = compactInsight(insights, employee.name);
    const prompt = buildPrompt({ employee, period, weeks, insight, baseUrl, kind });
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    process.stdout.write(`Preparing reminder ${index + 1}/${employees.length}: ${employee.name}\n`);
    let message = fallbackMessage(employee, period, baseUrl, kind);
    let personalizationNote = "使用通用提醒文案";
    let model = "fallback";
    let provider = "local";
    try {
      const result = await callKimiWithRetry(env, prompt);
      message = String(result.parsed.message || "").trim() || message;
      personalizationNote = String(result.parsed.personalizationNote || "").trim() || personalizationNote;
      model = result.model;
      provider = "kimi";
    } catch (error) {
      process.stderr.write(`Kimi reminder fallback for ${employee.name}: ${error.message}\n`);
    }
    message = normalizeReminderMessage(message, employee, baseUrl);
    if (provider === "kimi" && isMalformedReminderMessage(message)) {
      process.stderr.write(`Kimi reminder malformed for ${employee.name}, using fallback\n`);
      message = normalizeReminderMessage(fallbackMessage(employee, period, baseUrl, kind), employee, baseUrl);
      personalizationNote = "Kimi 文案断句异常，使用通用提醒文案";
      model = "fallback";
      provider = "local";
    }
    rows.push({
      id: randomUUID(),
      periodId: outboxPeriodId,
      periodLabel: period.label,
      recipientOpenId: employee.openId,
      recipientName: employee.name,
      department: employee.department,
      message,
      personalizationNote,
      provider,
      model,
      promptHash,
      source: { employee, period, weeks, insight, kind },
    });
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `weekly-reminder-outbox.${outboxPeriodId.replace(/[:/\\]/g, "-")}.json`);
  await writeFile(outputPath, `${JSON.stringify({ period, kind, outboxPeriodId, count: rows.length, rows }, null, 2)}\n`, "utf8");

  const dbPath = env.WEEKLY_REPORT_DB_PATH
    ? path.resolve(rootDir, env.WEEKLY_REPORT_DB_PATH)
    : path.join(rootDir, "outputs/demo/weekly-report-os.sqlite");
  await ensureDatabase(dbPath);
  await upsertOutbox(dbPath, rows);

  console.log(JSON.stringify({ ok: true, period, kind, outboxPeriodId, count: rows.length, outputPath, dbPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
