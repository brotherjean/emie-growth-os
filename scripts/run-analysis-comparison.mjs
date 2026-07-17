import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const rootDir = process.cwd();
const dataPath = path.join(rootDir, "src/data/prototypeData.json");
const outputDir = path.join(rootDir, "outputs");

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
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

function shorten(value, maxLength = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function pick(row, keys) {
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
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

function buildDataPack(raw) {
  return {
    meta: raw.meta,
    employee_summary: (raw.employee_summary ?? []).map((row) =>
      pick(row, [
        "姓名",
        "部门",
        "周报数",
        "准时次数",
        "迟交次数",
        "平均分",
        "等级",
        "趋势",
        "弱问题周数",
        "人工校准说明",
        "一句话成长判断",
      ]),
    ),
    weekly_scores: (raw.weekly_scores ?? []).map((row) => ({
      姓名: row["姓名"],
      部门: row["部门"],
      周次: row["周次"],
      状态: row["状态"],
      总分: row["总分"],
      等级: row["等级"],
      本周成果摘要: shorten(row["本周成果摘要"], 260),
      问题摘要: shorten(row["问题摘要"], 260),
      下周计划摘要: shorten(row["下周计划摘要"], 260),
    })),
    boss_tasks: (raw.boss_tasks ?? []).map((row) => ({
      优先级: row["优先级"],
      来源人员: row["来源人员"],
      部门: row["部门"],
      主题: row["主题"],
      建议任务标题: row["建议任务标题"],
      建议负责人: row["建议负责人"],
      截止日期: row["截止日期"],
      证据: shorten(row["证据"], 340),
    })),
    employee_tasks: (raw.employee_tasks ?? []).map((row) => ({
      优先级: row["优先级"],
      来源人员: row["来源人员"],
      部门: row["部门"],
      主题: row["主题"],
      建议任务标题: row["建议任务标题"],
      建议负责人: row["建议负责人"],
      截止日期: row["截止日期"],
      证据: shorten(row["证据"], 260),
    })),
    group_message_draft: raw.group_message_draft,
  };
}

function buildAnalysisModules(dataPack) {
  const weeklyByDepartment = new Map();
  for (const week of dataPack.weekly_scores) {
    const department = week["部门"] || "未分部门";
    if (!weeklyByDepartment.has(department)) weeklyByDepartment.set(department, []);
    weeklyByDepartment.get(department).push(week);
  }

  const departmentModules = Array.from(weeklyByDepartment.entries()).map(([department, weeks]) => ({
    id: `department-${department}`,
    title: `${department}周报执行与问题`,
    data: {
      department,
      weekly_scores: weeks,
      employee_summary: dataPack.employee_summary.filter((employee) => employee["部门"] === department),
      employee_tasks: dataPack.employee_tasks.filter((task) => task["部门"] === department).slice(0, 20),
    },
  }));

  return [
    {
      id: "company-overview",
      title: "公司整体健康度与提交质量",
      data: {
        meta: dataPack.meta,
        employee_summary: dataPack.employee_summary,
        group_message_draft: dataPack.group_message_draft,
      },
    },
    {
      id: "boss-attention",
      title: "老板注意力队列与P0/P1风险",
      data: {
        boss_tasks: dataPack.boss_tasks,
      },
    },
    {
      id: "task-backlog",
      title: "任务候选池与闭环风险",
      data: {
        employee_tasks: dataPack.employee_tasks,
      },
    },
    ...departmentModules,
  ];
}

function compactJson(value) {
  return JSON.stringify(value);
}

function coarsePrompt(dataPack) {
  return `请对以下公司周报历史数据做“粗分拣”。目标不是写漂亮报告，而是把真实执行问题、正向样本、风险线索先分出来。

请输出中文 JSON，字段如下：
{
  "themes": [{"name": "", "severity": "P0/P1/P2", "why": "", "people": [], "evidence": []}],
  "execution_risks": [{"risk": "", "why_it_matters": "", "owner_hint": ""}],
  "positive_patterns": [{"pattern": "", "people": [], "why": ""}],
  "data_gaps": [{"gap": "", "fix": ""}],
  "task_candidates": [{"title": "", "priority": "P0/P1/P2", "owner": "", "acceptance": ""}]
}

数据包：
${compactJson(dataPack)}`;
}

function modulePrompt(module) {
  return `请分析一个周报历史数据模块。你的目标是做“高质量中间分析”，供后续老板级总报告引用。

模块：${module.title}

请输出中文 JSON，字段如下：
{
  "module": "${module.title}",
  "real_problems": [{"problem": "", "severity": "P0/P1/P2", "evidence": ["必须引用人名/部门/周报原文线索"], "why_it_matters": ""}],
  "execution_signals": [{"signal": "", "evidence": [], "management_meaning": ""}],
  "task_suggestions": [{"title": "", "owner_hint": "", "acceptance": "", "priority": "P0/P1/P2"}],
  "positive_examples": [{"person": "", "why": "", "copyable_behavior": ""}],
  "data_gaps": [{"gap": "", "how_to_fix": ""}]
}

要求：
1. 只分析当前模块，不要臆测模块外信息。
2. 每个关键判断都要带证据线索。
3. 优先识别真正的问题，不要把普通待办夸大成风险。

模块数据：
${compactJson(module.data)}`;
}

function deepPrompt(dataPack, coarseResult, providerName) {
  return `你是老板级组织执行分析顾问。请基于同一份周报历史数据和前置粗分拣结果，生成一份可直接给老板看的“全面执行历史数据分析”。

模型/策略：${providerName}

输出要求：
1. 用中文。
2. 先给 8 行以内的老板摘要。
3. 再分章节写：公司整体执行状态、P0/P1 注意力队列、必须完整阅读的周报、跨周主题问题、员工成长与周报质量、任务闭环建议、下周公司大群可发总结。
4. 每个关键判断必须引用员工/部门/周报内容线索，不要只有抽象评价。
5. 给出“模型输出自评”：它擅长什么、不足是什么、老板该如何使用它。
6. 不要输出代码，不要输出 Markdown 表格，用清楚的小标题和列表即可。

前置粗分拣结果：
${coarseResult}

原始数据包：
${compactJson(dataPack)}`;
}

function synthesisPrompt(dataPack, moduleAnalyses, providerName) {
  return `你是老板级组织执行分析顾问。请基于“分模块分析结果”和必要的公司元数据，生成一份可直接给老板看的“全面执行历史数据分析”。

模型/策略：${providerName}

输出要求：
1. 用中文。
2. 先给 8 行以内老板摘要。
3. 再分章节写：公司整体执行状态、P0/P1 注意力队列、必须完整阅读的周报、跨周主题问题、员工成长与周报质量、任务闭环建议、下周公司大群可发总结。
4. 每个关键判断必须引用员工/部门/周报内容线索，不要只有抽象评价。
5. 给出“模型输出自评”：它擅长什么、不足是什么、老板该如何使用它。
6. 不要输出代码，不要输出 Markdown 表格，用清楚的小标题和列表即可。

公司元数据：
${compactJson({ meta: dataPack.meta, group_message_draft: dataPack.group_message_draft })}

分模块分析结果：
${moduleAnalyses.map((item, index) => `【模块${index + 1}】${item.title}\n${item.analysis}`).join("\n\n")}`;
}

function textFromKimi(data) {
  const message = data?.choices?.[0]?.message;
  return (message?.content || message?.reasoning_content || "").trim();
}

function textFromGemini(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function callKimi(env, model, messages, maxTokens) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY;
  if (!key) throw new Error("MOONSHOT_API_KEY is not configured");
  const baseUrl = stripTrailingSlash(env.MOONSHOT_BASE_URL || env.KIMI_BASE_URL || "https://api.moonshot.cn/v1");
  const timeoutMs = Number(env.AI_ANALYSIS_TIMEOUT_MS || 180000);
  const data = await postJson(`${baseUrl}/chat/completions`, {
    timeoutMs,
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: {
      model,
      messages,
      temperature: 0.6,
      max_completion_tokens: maxTokens,
      thinking: {
        type: "disabled",
      },
    },
  });
  return textFromKimi(data);
}

async function callGemini(env, model, system, prompt, maxTokens) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const baseUrl = stripTrailingSlash(env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta");
  const timeoutMs = Number(env.AI_ANALYSIS_TIMEOUT_MS || 180000);
  const data = await postJson(`${baseUrl}/models/${model}:generateContent`, {
    timeoutMs,
    headers: {
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: {
      system_instruction: {
        parts: [{ text: system }],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1,
        maxOutputTokens: maxTokens,
      },
    },
  });
  return textFromGemini(data);
}

async function runProvider({ name, env, dataPack, type }) {
  const started = performance.now();
  try {
    const modules = buildAnalysisModules(dataPack);
    if (type === "kimi") {
      const lightModel = env.KIMI_LIGHT_MODEL || "kimi-k2.5";
      const deepModel = env.KIMI_DEEP_MODEL || env.KIMI_MODEL || "kimi-k2.6";
      const moduleAnalyses = [];
      for (const module of modules) {
        const analysis = await callKimi(
          env,
          lightModel,
          [
            { role: "system", content: "你是执行数据分模块分析助手，只负责从当前模块中提取真实问题、证据和任务建议。" },
            { role: "user", content: modulePrompt(module) },
          ],
          1400,
        );
        moduleAnalyses.push({ title: module.title, analysis });
      }
      const report = await callKimi(
        env,
        deepModel,
        [
          { role: "system", content: "你是老板级组织执行分析顾问，擅长把周报历史数据转成管理注意力排序。" },
          { role: "user", content: synthesisPrompt(dataPack, moduleAnalyses, "Kimi: K2.5 分模块粗分析 + K2.6 老板级综合分析") },
        ],
        2600,
      );
      const coarse = moduleAnalyses.map((item) => `## ${item.title}\n${item.analysis}`).join("\n\n");
      return { ok: true, name, coarse, report, latencyMs: Math.round(performance.now() - started), models: `${lightModel} modules + ${deepModel}` };
    }

    const flashModel = env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash";
    const proModel = env.GEMINI_PRO_MODEL || "gemini-2.5-pro";
    const system = "你是企业周报执行数据分析助手，输出务实、引用证据、能帮助老板排序管理注意力。";
    const moduleAnalyses = [];
    for (const module of modules) {
      const analysis = await callGemini(env, flashModel, system, modulePrompt(module), 1400);
      moduleAnalyses.push({ title: module.title, analysis });
    }
    const report = await callGemini(
      env,
      proModel,
      system,
      synthesisPrompt(dataPack, moduleAnalyses, "Gemini: Flash 分模块粗分析 + Pro 老板级综合分析"),
      2600,
    );
    const coarse = moduleAnalyses.map((item) => `## ${item.title}\n${item.analysis}`).join("\n\n");
    return { ok: true, name, coarse, report, latencyMs: Math.round(performance.now() - started), models: `${flashModel} modules + ${proModel}` };
  } catch (error) {
    return { ok: false, name, error: error.message, latencyMs: Math.round(performance.now() - started), models: type };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPage(result) {
  const status = result.ok ? "OK" : "BLOCKED";
  const body = result.ok
    ? `<section class="report"><h2>老板级分析报告</h2><pre>${escapeHtml(result.report)}</pre></section>
<section class="report muted"><h2>前置粗分拣结果</h2><pre>${escapeHtml(result.coarse)}</pre></section>`
    : `<section class="report error"><h2>本轮无法生成完整报告</h2><p>${escapeHtml(result.error)}</p><p>这通常表示 key、额度、模型名或网络连通性需要调整。脚本保留该页面，方便对比运行状态。</p></section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(result.name)} · 周报执行历史分析</title>
  <style>
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fb; }
    body { margin: 0; }
    header { padding: 28px 34px; background: #101827; color: #fff; }
    header h1 { margin: 0; font-size: 24px; }
    header p { margin: 10px 0 0; color: #cbd5e1; }
    main { display: grid; gap: 18px; padding: 24px 34px 42px; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px; }
    .meta span { border: 1px solid #d8dee8; border-radius: 999px; padding: 7px 11px; background: #fff; font-size: 13px; }
    .status-ok { color: #0f766e; }
    .status-blocked { color: #b45309; }
    .report { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: #fff; box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05); }
    .report h2 { margin: 0 0 14px; font-size: 18px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: inherit; line-height: 1.72; }
    .muted { background: #fbfdff; }
    .error { border-color: #fed7aa; background: #fff7ed; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(result.name)} · 周报执行历史分析</h1>
    <p>同一份历史数据，不同模型策略生成。用于判断哪条模型链路更适合进入生产。</p>
  </header>
  <main>
    <div class="meta">
      <span class="status-${status.toLowerCase()}">状态：${status}</span>
      <span>模型：${escapeHtml(result.models)}</span>
      <span>耗时：${result.latencyMs}ms</span>
      <span>生成时间：${new Date().toLocaleString("zh-CN")}</span>
    </div>
    ${body}
  </main>
</body>
</html>`;
}

function renderIndex(results) {
  const links = results
    .map((result) => {
      const filename = result.name.toLowerCase().includes("kimi") ? "analysis-kimi.html" : "analysis-gemini.html";
      return `<a href="./${filename}">${escapeHtml(result.name)} · ${result.ok ? "OK" : "BLOCKED"}</a>`;
    })
    .join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>AI 分析对比入口</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fb;margin:0;padding:34px;color:#172033}main{display:grid;gap:14px;max-width:760px}a{display:block;padding:18px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#2563eb;text-decoration:none;font-weight:700}</style><main><h1>AI 周报执行历史分析对比</h1>${links}</main></html>`;
}

async function main() {
  const [env, rawText] = await Promise.all([
    loadDotEnv(path.join(rootDir, ".env")),
    readFile(dataPath, "utf8"),
  ]);
  const dataPack = buildDataPack(JSON.parse(rawText));
  await mkdir(outputDir, { recursive: true });

  const requestedProviders = String(env.AI_ANALYSIS_PROVIDERS || "kimi,gemini")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const providers = [
    { name: "Kimi Pipeline", type: "kimi", env, dataPack },
    { name: "Gemini Pipeline", type: "gemini", env, dataPack },
  ].filter((provider) => requestedProviders.includes(provider.type));

  const results = [];
  for (const provider of providers) {
    console.log(`${provider.name}: running analysis`);
    const result = await runProvider(provider);
    console.log(`${provider.name}: ${result.ok ? "OK" : "BLOCKED"} (${result.latencyMs}ms)`);
    results.push(result);
  }

  for (const result of results) {
    const filename = result.name.toLowerCase().includes("kimi") ? "analysis-kimi.html" : "analysis-gemini.html";
    await writeFile(path.join(outputDir, filename), renderPage(result), "utf8");
  }
  await writeFile(path.join(outputDir, "analysis-comparison-index.html"), renderIndex(results), "utf8");

  console.log(`Index: ${path.join(outputDir, "analysis-comparison-index.html")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
