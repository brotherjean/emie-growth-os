import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const rootDir = process.cwd();
const dataPath = path.join(rootDir, "src/data/prototypeData.json");
const insightsPath = path.join(rootDir, "src/data/kimiInsights.json");
const outputDir = path.join(rootDir, "outputs");
const cacheSchemaVersion = 2;

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
  return value.replace(/\/+$/, "");
}

function shorten(value, maxLength = 320) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactEmployee(row) {
  return {
    name: row["姓名"],
    department: row["部门"],
    openId: row["open_id"],
    reportCount: row["周报数"],
    onTimeCount: row["准时次数"],
    lateCount: row["迟交次数"],
    averageScore: row["平均分"],
    level: row["等级"],
    trend: row["趋势"],
    weakProblemWeeks: row["弱问题周数"],
    calibrationNote: row["人工校准说明"],
    growthSummary: shorten(row["一句话成长判断"], 520),
  };
}

function isActiveEmployee(row) {
  return String(row?.["在职状态"] ?? "").trim() !== "离职";
}

function buildDataPack(raw) {
  const activeEmployees = (raw.employee_summary ?? []).filter(isActiveEmployee);
  const activeNames = new Set(activeEmployees.map((row) => row["姓名"]).filter(Boolean));
  const latestWeeksByName = new Map();
  const currentWeekId = raw.meta?.current_week_id;
  const currentWeekLabel = [raw.meta?.current_week_label, raw.meta?.current_week_range].filter(Boolean).join(" ");
  const currentWeeklyRecords = [];
  for (const row of raw.weekly_scores ?? []) {
    if (!activeNames.has(row["姓名"])) continue;
    const isCurrentWeek =
      (currentWeekId && row["周期ID"] === currentWeekId) ||
      (currentWeekLabel && row["周次"] === currentWeekLabel);
    const compactWeek = {
      name: row["姓名"],
      department: row["部门"],
      week: row["周次"],
      weekId: row["周期ID"],
      status: row["状态"],
      submittedAt: row["提交时间"],
      total: row["总分"],
      level: row["等级"],
      result: shorten(row["本周成果摘要"], 360),
      problem: shorten(row["问题摘要"], 360),
      plan: shorten(row["下周计划摘要"], 360),
      reflection: shorten(row["思考与复盘摘要"], 260),
    };
    if (isCurrentWeek) currentWeeklyRecords.push(compactWeek);
    const list = latestWeeksByName.get(row["姓名"]) ?? [];
    list.push(compactWeek);
    latestWeeksByName.set(row["姓名"], list);
  }

  return {
    meta: raw.meta,
    currentWeek: {
      id: currentWeekId,
      label: currentWeekLabel,
      submittedCount: raw.meta?.submitted_count,
      exemptPeople: raw.meta?.exempt_people,
    },
    currentWeeklyRecords,
    employees: activeEmployees.map(compactEmployee),
    weeklyRecordsByEmployee: Object.fromEntries(
      Array.from(latestWeeksByName.entries()).map(([name, weeks]) => [name, weeks.slice(-9)]),
    ),
    currentBossTasks: (raw.boss_tasks ?? []).map((row) => ({
      priority: row["优先级"],
      source: row["来源人员"],
      department: row["部门"],
      theme: row["主题"],
      title: row["建议任务标题"],
      description: shorten(row["建议任务描述"], 300),
      owner: row["建议负责人"],
      ownerOpenId: row["建议负责人open_id"],
      dueDate: row["截止日期"],
      evidence: shorten(row["证据"], 420),
    })),
    currentEmployeeTasks: (raw.employee_tasks ?? []).map((row) => ({
      priority: row["优先级"],
      source: row["来源人员"],
      department: row["部门"],
      theme: row["主题"],
      title: row["建议任务标题"],
      description: shorten(row["建议任务描述"], 300),
      owner: row["建议负责人"],
      ownerOpenId: row["负责人open_id"],
      dueDate: row["截止日期"],
      evidence: shorten(row["证据"], 420),
    })),
    currentGroupMessageDraft: raw.group_message_draft,
  };
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
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

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

async function callKimi(env, prompt, maxTokens, { model, reasoningEffort } = {}) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");
  const baseUrl = stripTrailingSlash(env.MOONSHOT_BASE_URL || env.KIMI_BASE_URL || "https://api.moonshot.cn/v1");
  const resolvedModel = model || env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  const timeoutMs = Number(env.AI_ANALYSIS_TIMEOUT_MS || 240000);
  const isK3 = resolvedModel === "kimi-k3";
  const data = await postJson(`${baseUrl}/chat/completions`, {
    timeoutMs,
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: {
      model: resolvedModel,
      messages: [
        {
          role: "system",
          content:
            "你是企业周报 OS 的老板级分析引擎。你只输出严格 JSON，不输出 Markdown，不输出解释。判断要务实，必须引用周报证据，任务要拆小到可以直接建立飞书任务。",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(isK3
        ? { reasoning_effort: reasoningEffort || env.KIMI_MANAGEMENT_REASONING_EFFORT || "high" }
        : { temperature: 0.6, thinking: { type: "disabled" } }),
    },
  });
  return { text: textFromKimi(data), model: resolvedModel };
}

function extractJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) throw new Error("Kimi output did not contain a JSON object");
    return JSON.parse(cleaned.slice(first, last + 1));
  }
}

function normalizeInsights(value, { models, generatedAt }) {
  const insight = value && typeof value === "object" ? value : {};
  const modelValues = Object.values(models ?? {}).flat().filter(Boolean);
  const uniqueModels = [...new Set(modelValues)];
  return {
    meta: {
      ...(insight.meta ?? {}),
      provider: "kimi",
      model: uniqueModels.length === 1 ? uniqueModels[0] : "mixed",
      modelStrategy: "hybrid",
      models,
      generatedAt,
      source: "prototypeData",
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

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function callKimiJson(env, prompt, { label, maxTokens, model, fallbackModel, reasoningEffort }) {
  const requestedModel = model || env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ cacheSchemaVersion, requestedModel, prompt }))
    .digest("hex");
  if (env.KIMI_APP_IGNORE_CACHE !== "1") {
    const cachedCandidates = [];
    for (const cachedLabel of [label, `${label}.retry`]) {
      try {
        const cachedMeta = JSON.parse(
          await readFile(path.join(outputDir, `kimi-app-data.${cachedLabel}.meta.json`), "utf8"),
        );
        if (
          cachedMeta.model !== requestedModel ||
          cachedMeta.inputHash !== inputHash ||
          cachedMeta.schemaVersion !== cacheSchemaVersion
        ) continue;
        const cachedText = await readFile(path.join(outputDir, `kimi-app-data.${cachedLabel}.raw.txt`), "utf8");
        cachedCandidates.push({ cachedLabel, cachedMeta, cachedText });
      } catch {
        // Cache without matching model, input and schema metadata is not safe to reuse.
      }
    }
    cachedCandidates.sort((left, right) => Date.parse(right.cachedMeta.generatedAt || 0) - Date.parse(left.cachedMeta.generatedAt || 0));
    for (const candidate of cachedCandidates) {
      try {
        return {
          parsed: extractJson(candidate.cachedText),
          model: candidate.cachedMeta.model,
          rawLabel: candidate.cachedLabel,
          inputHash,
        };
      } catch {
        // Try the next matching cache candidate before calling the model.
      }
    }
  }
  const tokenAttempts = [maxTokens, Math.min(12000, Math.ceil(maxTokens * 1.8))];
  let lastError;
  const modelCandidates = [...new Set([requestedModel, fallbackModel].filter(Boolean))];
  for (const candidateModel of modelCandidates) {
    if (candidateModel !== requestedModel) {
      console.log(`Kimi app data: ${label} falling back from ${requestedModel} to ${candidateModel}`);
    }
    for (const [index, tokenBudget] of tokenAttempts.entries()) {
      const attemptLabel = index === 0 ? label : `${label}.retry`;
      let text = "";
      for (let networkAttempt = 1; networkAttempt <= 3; networkAttempt += 1) {
        try {
          const result = await callKimi(env, prompt, tokenBudget, {
            model: candidateModel,
            reasoningEffort,
          });
          text = result.text;
          break;
        } catch (error) {
          lastError = error;
          if (networkAttempt < 3) {
            console.log(`Kimi app data: ${label} ${candidateModel} request failed, retrying ${networkAttempt + 1}/3`);
            await new Promise((resolve) => setTimeout(resolve, 1500 * networkAttempt));
          }
        }
      }
      if (!text) break;
      const generatedAt = new Date().toISOString();
      await Promise.all([
        writeFile(path.join(outputDir, `kimi-app-data.${attemptLabel}.raw.txt`), text, "utf8"),
        writeFile(
          path.join(outputDir, `kimi-app-data.${attemptLabel}.meta.json`),
          `${JSON.stringify({
            schemaVersion: cacheSchemaVersion,
            model: candidateModel,
            requestedModel,
            inputHash,
            generatedAt,
          }, null, 2)}\n`,
          "utf8",
        ),
      ]);
      try {
        return { parsed: extractJson(text), model: candidateModel, rawLabel: attemptLabel, inputHash };
      } catch (error) {
        lastError = error;
        if (index < tokenAttempts.length - 1) {
          console.log(`Kimi app data: ${label} JSON parse failed, retrying with ${tokenAttempts[index + 1]} tokens`);
        }
      }
    }
  }
  throw lastError;
}

function buildOverviewPrompt(dataPack) {
  const overviewPack = {
    meta: dataPack.meta,
    employees: dataPack.employees,
    currentBossTasks: dataPack.currentBossTasks,
    currentEmployeeTasks: dataPack.currentEmployeeTasks,
    currentGroupMessageDraft: dataPack.currentGroupMessageDraft,
  };

  return `请把以下真实周报历史数据转换成“成长周报 OS 老板驾驶舱可直接使用的结构化 JSON”。

核心目标：
1. 老板只看最该看的 10 个问题，其余进入任务系统持续推动。
2. 问题主题必须能展开，包含周报原文证据和 AI 总结后的问题详述。
3. 输出公司大群可发总结，鼓励为主，也点出必须闭环的细节。
4. P0 不只按严重程度排序，还要识别是否属于跨部门协调、外部卡点、机制/SOP 缺失、老板拍板或资源支持问题。

只输出一个严格 JSON 对象，字段和类型如下：
{
  "executiveSummary": ["老板视角公司整体情况，最多 8 条，每条 30-70 字，必须具体"],
  "collectiveFocus": [{"title": "集体关注点", "detail": "为什么这周要一起关注"}],
  "companyMessageDraft": "一段可直接发公司大群的总结，鼓励为主，也点出需要集体闭环的细节",
  "attentionQueue": [
    {
      "priority": "P0/P1/P2",
      "title": "老板注意力事项标题",
      "source": "来源人员",
      "department": "部门",
      "theme": "主题",
      "owner": "建议负责人",
      "ownerOpenId": "如果数据里有则填写",
      "dueDate": "YYYY-MM-DD 或 下周五",
      "evidence": "引用周报线索，必须具体",
      "whyBoss": "为什么需要老板/管理者看",
      "acceptance": "闭环验收口径"
    }
  ],
  "mustReadReports": [
    {"name": "员工名", "department": "部门", "reason": "为什么老板必须完整读", "focus": "阅读时重点看什么", "evidence": "周报线索"}
  ],
  "themes": [
    {
      "label": "问题主题",
      "value": 1到10的数字,
      "severity": "P0/P1/P2",
      "summary": "一句话概括",
      "detail": "具体是什么问题，为什么它不是普通待办",
      "quotes": [{"author": "员工名", "department": "部门", "week": "周次或近周", "text": "一到两句周报原文或贴近原文的证据"}],
      "nextStep": "管理上的下一步"
    }
  ],
  "feishuTaskPlan": {
    "tasklistName": "周报闭环任务池",
    "requiredScopes": ["task:task:write", "task:task:read", "task:tasklist:write", "task:tasklist:read"],
    "creationMode": "review_then_create"
  }
}

数量要求：
- attentionQueue 6-10 条。
- themes 5-7 条。
- mustReadReports 4-6 条。

真实数据包：
${JSON.stringify(overviewPack)}`;
}

function buildBriefingPrompt(dataPack) {
  const pack = {
    meta: dataPack.meta,
    currentWeek: dataPack.currentWeek,
    currentWeeklyRecords: dataPack.currentWeeklyRecords,
    employees: dataPack.employees,
    currentGroupMessageDraft: dataPack.currentGroupMessageDraft,
  };
  return `请基于“本周期周报”为主、历史评分为辅，输出老板驾驶舱的摘要模块。只输出严格 JSON：
{
  "executiveSummary": ["最多 6 条老板视角公司整体情况，每条 30-70 字，具体、有证据感"],
  "collectiveFocus": [{"title": "集体关注点", "detail": "为什么这周要一起关注"}],
  "companyMessageDraft": "一段可直接发公司大群的总结，鼓励为主，也点出需要集体闭环的细节",
  "mustReadReports": [
    {"name": "员工名", "department": "部门", "reason": "为什么老板必须完整读", "focus": "阅读时重点看什么", "evidence": "周报线索"}
  ]
}
数量：collectiveFocus 4-6 条，mustReadReports 4-6 条。
数据：
${JSON.stringify(pack)}`;
}

function buildAttentionPrompt(dataPack) {
  const pack = {
    meta: dataPack.meta,
    currentWeek: dataPack.currentWeek,
    currentWeeklyRecords: dataPack.currentWeeklyRecords,
    employees: dataPack.employees,
    currentBossTasks: dataPack.currentBossTasks,
    currentEmployeeTasks: dataPack.currentEmployeeTasks,
  };
  return `请基于“本周期周报”为主、历史未闭环线索为辅，输出老板 P0/P1/P2 注意力队列。只输出严格 JSON：
{
  "attentionQueue": [
    {
      "priority": "P0/P1/P2",
      "title": "老板注意力事项标题",
      "source": "来源人员",
      "department": "部门",
      "theme": "主题",
      "owner": "建议负责人",
      "ownerOpenId": "如果数据里有则填写",
      "dueDate": "YYYY-MM-DD 或 下周五",
      "evidence": "引用周报线索，必须具体",
      "whyBoss": "为什么需要老板/管理者看",
      "acceptance": "闭环验收口径"
    }
  ]
}
要求：6-10 条，P0/P1 优先；不要把普通待办夸大成老板事项。对跨部门协调、外部卡点、机制/SOP 缺失、老板拍板或资源支持问题要在 title/theme/whyBoss 中明确写出原因。
数据：
${JSON.stringify(pack)}`;
}

function buildThemesPrompt(dataPack) {
  const pack = {
    meta: dataPack.meta,
    currentWeek: dataPack.currentWeek,
    currentWeeklyRecords: dataPack.currentWeeklyRecords,
    currentBossTasks: dataPack.currentBossTasks,
    currentEmployeeTasks: dataPack.currentEmployeeTasks,
    weeklyRecordsByEmployee: dataPack.weeklyRecordsByEmployee,
  };
  return `请基于本周期周报和个人近 9 周历史，输出跨周问题主题雷达。只输出严格 JSON：
{
  "themes": [
    {
      "label": "问题主题",
      "value": 1到10的数字,
      "severity": "P0/P1/P2",
      "summary": "一句话概括",
      "detail": "具体是什么问题，为什么它不是普通待办",
      "quotes": [{"author": "员工名", "department": "部门", "week": "周次或近周", "text": "一到两句周报原文或贴近原文的证据"}],
      "nextStep": "管理上的下一步"
    }
  ]
}
要求：5-7 条主题；每个主题 2-3 条 quotes；必须引用具体员工或部门。主题要区分普通执行问题与跨部门协调问题，凡是需要老板拆墙、拍板、调资源或推动外部合作方的，severity 优先评估为 P0/P1，并在 detail 中写清楚涉及部门与升级理由。
数据：
${JSON.stringify(pack)}`;
}

function buildEmployeeBatchPrompt(dataPack, batch) {
  const names = new Set(batch.map((employee) => employee.name));
  const batchPack = {
    employees: batch,
    currentWeek: dataPack.currentWeek,
    currentWeeklyRecords: dataPack.currentWeeklyRecords.filter((week) => names.has(week.name)),
    weeklyRecordsByEmployee: Object.fromEntries(
      Array.from(names).map((name) => [name, dataPack.weeklyRecordsByEmployee[name] ?? []]),
    ),
    currentEmployeeTasks: dataPack.currentEmployeeTasks.filter((task) => names.has(task.source) || names.has(task.owner)),
    currentBossTasks: dataPack.currentBossTasks.filter((task) => names.has(task.source) || names.has(task.owner)),
  };

  return `请把以下员工周报历史数据转换成“成长周报 OS 员工侧 AI 点评和飞书任务候选 JSON”。

核心目标：
1. 员工侧反馈以鼓励和教练式提问为主，负面情绪或心性问题用提问帮助自我对照。
2. 必须做 Week-over-Week：先看本周期新增内容，再和最近 1-3 周历史对照，识别是新问题、复发问题、恶化问题、还是已闭环问题。
3. 从本周期周报问题拆出小颗粒度任务候选，不要把一整段周报塞成一个任务。
4. 任务标题清楚、负责人明确、截止日明确、验收指标明确，能被勾选后直接创建到飞书任务。
5. 任务要帮助员工形成意图：把模糊想法变成可验证动作。

硬性要求：
- coachSummary 必须明确提到本周期表现，并说明相对上一周期/历史趋势的变化。
- coachQuestions 必须是 3 个问题，至少 2 个问题要同时引用“本周期新增内容”和“历史上下文”。
- 每人 2-3 个 taskCandidates，至少 2 个必须优先来自 currentWeeklyRecords；如果任务来自历史遗留，evidence 必须同时包含本周期是否继续出现或为何仍未闭环。
- evidence 必须出现本周期周次（例如 ${dataPack.currentWeek.label || "本周期"}）或清楚说明“历史遗留但本周未闭环”。
- 不要只复用上一周任务候选；如果本周新增内容已经替代旧问题，必须生成新任务。

只输出一个严格 JSON 对象，字段如下：
{
  "employeeInsights": [
    {
      "name": "员工名",
      "coachSummary": "给员工自己的 AI 点评，鼓励为主，指出成长空间",
      "coachQuestions": ["教练式问题 1", "教练式问题 2", "教练式问题 3"],
      "taskCandidates": [
        {
          "id": "稳定英文/拼音/数字 id",
          "priority": "P0/P1/P2",
          "source": "来源人员",
          "department": "部门",
          "owner": "负责人",
          "ownerOpenId": "如果数据里有则填写",
          "title": "能直接变成飞书任务的小颗粒标题",
          "description": "任务要做什么，避免空泛",
          "dueDate": "YYYY-MM-DD 或 下周五",
          "metric": "验收指标，必须可验证",
          "evidence": "周报证据",
          "aiIntent": "AI 帮他澄清后的任务意图",
          "firstStep": "今天或 3 天内第一步",
          "supportNeeded": "需要谁支持什么",
          "contextNeed": "执行前应引用哪些个人/公司知识库上下文"
        }
      ]
    }
  ]
}

数量要求：
- 必须覆盖本批次所有员工。
- 每人 2-3 个 taskCandidates，优先来自本周期真实周报问题、跨周未闭环、下周计划。
- 每个 taskCandidates.evidence 必须引用具体周报线索。

本批次数据：
${JSON.stringify(batchPack)}`;
}

function safeLabel(value) {
  return String(value || "current")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const started = performance.now();
  const [env, rawText] = await Promise.all([loadDotEnv(path.join(rootDir, ".env")), readFile(dataPath, "utf8")]);
  const dataPack = buildDataPack(JSON.parse(rawText));
  const cachePrefix = safeLabel(dataPack.currentWeek.id || dataPack.currentWeek.label);
  const managementModel = env.KIMI_MANAGEMENT_MODEL || "kimi-k3";
  const managementFallbackModel =
    env.KIMI_MANAGEMENT_FALLBACK_MODEL || env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  const employeeModel = env.KIMI_EMPLOYEE_MODEL || env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
  await mkdir(outputDir, { recursive: true });

  console.log("Kimi app data: running briefing analysis");
  const briefing = await callKimiJson(env, buildBriefingPrompt(dataPack), {
    label: `${cachePrefix}-briefing`,
    maxTokens: Number(env.KIMI_APP_BRIEFING_MAX_TOKENS || 3200),
    model: managementModel,
    fallbackModel: managementFallbackModel,
    reasoningEffort: env.KIMI_MANAGEMENT_REASONING_EFFORT || "high",
  });

  console.log("Kimi app data: running attention queue analysis");
  const attention = await callKimiJson(env, buildAttentionPrompt(dataPack), {
    label: `${cachePrefix}-attention`,
    maxTokens: Number(env.KIMI_APP_ATTENTION_MAX_TOKENS || 4200),
    model: managementModel,
    fallbackModel: managementFallbackModel,
    reasoningEffort: env.KIMI_MANAGEMENT_REASONING_EFFORT || "high",
  });

  console.log("Kimi app data: running theme radar analysis");
  const themes = await callKimiJson(env, buildThemesPrompt(dataPack), {
    label: `${cachePrefix}-themes`,
    maxTokens: Number(env.KIMI_APP_THEMES_MAX_TOKENS || 4600),
    model: managementModel,
    fallbackModel: managementFallbackModel,
    reasoningEffort: env.KIMI_MANAGEMENT_REASONING_EFFORT || "high",
  });

  const employeeInsights = [];
  const employeeModels = new Set();
  const runBlocks = [
    { kind: "briefing", rawLabel: briefing.rawLabel, model: briefing.model, inputHash: briefing.inputHash },
    { kind: "attention", rawLabel: attention.rawLabel, model: attention.model, inputHash: attention.inputHash },
    { kind: "themes", rawLabel: themes.rawLabel, model: themes.model, inputHash: themes.inputHash },
  ];
  const batches = chunk(dataPack.employees, Number(env.KIMI_APP_BATCH_SIZE || 3));
  for (const [index, batch] of batches.entries()) {
    const label = `${cachePrefix}-employees-${String(index + 1).padStart(2, "0")}`;
    console.log(`Kimi app data: running employee batch ${index + 1}/${batches.length}`);
    try {
      const result = await callKimiJson(env, buildEmployeeBatchPrompt(dataPack, batch), {
        label,
        maxTokens: Number(env.KIMI_APP_EMPLOYEE_MAX_TOKENS || 7600),
        model: employeeModel,
      });
      employeeModels.add(result.model);
      runBlocks.push({ kind: "employees", rawLabel: result.rawLabel, model: result.model, inputHash: result.inputHash });
      employeeInsights.push(...(Array.isArray(result.parsed.employeeInsights) ? result.parsed.employeeInsights : []));
    } catch (error) {
      if (batch.length <= 1) throw error;
      console.log(`Kimi app data: batch ${index + 1} parse failed, splitting into single employees`);
      for (const employee of batch) {
        const singleLabel = `${label}-${employee.name}`;
        const result = await callKimiJson(env, buildEmployeeBatchPrompt(dataPack, [employee]), {
          label: singleLabel,
          maxTokens: Number(env.KIMI_APP_SINGLE_EMPLOYEE_MAX_TOKENS || 3200),
          model: employeeModel,
        });
        employeeModels.add(result.model);
        runBlocks.push({ kind: "employees", rawLabel: result.rawLabel, model: result.model, inputHash: result.inputHash });
        employeeInsights.push(...(Array.isArray(result.parsed.employeeInsights) ? result.parsed.employeeInsights : []));
      }
    }
  }

  const parsed = {
    ...briefing.parsed,
    ...attention.parsed,
    ...themes.parsed,
    employeeInsights,
  };
  const insights = normalizeInsights(parsed, {
    models: {
      briefing: briefing.model,
      attention: attention.model,
      themes: themes.model,
      employees: [...employeeModels],
    },
    generatedAt: new Date().toISOString(),
  });
  await writeFile(insightsPath, `${JSON.stringify(insights, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "kimi-app-data.json"), `${JSON.stringify(insights, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(outputDir, `kimi-app-data.${cachePrefix}.run.json`),
    `${JSON.stringify({
      schemaVersion: cacheSchemaVersion,
      periodId: dataPack.currentWeek.id,
      generatedAt: insights.meta.generatedAt,
      blocks: runBlocks,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Kimi app data: OK (${Math.round(performance.now() - started)}ms)`);
  console.log(`Wrote: ${insightsPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
