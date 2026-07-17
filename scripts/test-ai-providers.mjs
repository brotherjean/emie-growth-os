import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const rootDir = process.cwd();

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
      const key = trimmed.slice(0, equalsAt).trim();
      const value = parseEnvValue(trimmed.slice(equalsAt + 1));
      env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...env, ...process.env };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function textFromGemini(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function timedCall(name, fn) {
  const started = performance.now();
  try {
    const text = await fn();
    return {
      ok: true,
      name,
      latencyMs: Math.round(performance.now() - started),
      text: text || "",
    };
  } catch (error) {
    return {
      ok: false,
      name,
      latencyMs: Math.round(performance.now() - started),
      error: error.message,
      text: "",
    };
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

function buildPrompt() {
  return `你是企业周报 AI 教练。请根据以下上下文，输出一份可以帮助员工立刻开始执行的方案。

【任务候选】
明确「系统/数据」现状与影响范围

【周报证据】
随着 AI 设计普及落地，各部门都在学习 AI 工具，但工具使用后是否提升效率、减少返工、形成可复用方法还不清楚。请把问题拆成现状、原因、下周动作、衡量指标。

【公司知识库摘要】
公司当前希望周报从“老板检查作业”变成“每个人的成长抓手”；任务要能落到飞书，能被负责人、截止日、验收指标持续跟进。

请用中文输出：
1. 这个任务真正要解决的意图
2. 第一小时应该做什么
3. 需要谁支持，如何开口
4. 可直接写入飞书任务的标题、描述、截止日、验收指标
5. 一句鼓励但不空泛的教练反馈`;
}

async function callKimi(env, prompt, timeoutMs) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY;
  if (!key) return null;

  const baseUrl = stripTrailingSlash(env.MOONSHOT_BASE_URL || env.KIMI_BASE_URL || "https://api.moonshot.cn/v1");
  const model = env.KIMI_MODEL || "kimi-k2.6";
  const data = await postJson(`${baseUrl}/chat/completions`, {
    timeoutMs,
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: {
      model,
      messages: [
        {
          role: "system",
          content: "你是一个严谨、鼓励型、非常擅长把模糊意图拆成行动方案的企业管理教练。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_completion_tokens: 900,
      thinking: {
        type: "disabled",
      },
    },
  });

  const message = data?.choices?.[0]?.message;
  return (message?.content || message?.reasoning_content || "").trim();
}

async function callGemini(env, prompt, timeoutMs) {
  const key = env.GEMINI_API_KEY;
  if (!key) return null;

  const baseUrl = stripTrailingSlash(env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta");
  const model = env.GEMINI_MODEL || "gemini-3-flash-preview";
  const data = await postJson(`${baseUrl}/models/${model}:generateContent`, {
    timeoutMs,
    headers: {
      "x-goog-api-key": key,
    },
    body: {
      system_instruction: {
        parts: [
          {
            text: "你是一个严谨、鼓励型、非常擅长把模糊意图拆成行动方案的企业管理教练。",
          },
        ],
      },
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    },
  });

  return textFromGemini(data) ?? "";
}

function renderResult(result) {
  if (!result) return "";
  if (!result.ok) {
    return `## ${result.name}\n\n- Status: ERROR\n- Latency: ${result.latencyMs}ms\n- Error: ${result.error}\n`;
  }
  return `## ${result.name}\n\n- Status: OK\n- Latency: ${result.latencyMs}ms\n- Output length: ${result.text.length} chars\n\n${result.text}\n`;
}

async function main() {
  const env = await loadDotEnv(path.join(rootDir, ".env"));
  const timeoutMs = Number(env.AI_TEST_TIMEOUT_MS || 60000);
  const outputPath = path.resolve(rootDir, env.AI_TEST_OUTPUT || "outputs/ai-provider-comparison.md");
  const prompt = buildPrompt();

  const providers = [
    {
      name: "Kimi",
      configured: Boolean(env.MOONSHOT_API_KEY || env.KIMI_API_KEY),
      call: () => callKimi(env, prompt, timeoutMs),
    },
    {
      name: "Gemini",
      configured: Boolean(env.GEMINI_API_KEY),
      call: () => callGemini(env, prompt, timeoutMs),
    },
  ];

  const results = [];
  for (const provider of providers) {
    if (!provider.configured) {
      results.push({
        ok: false,
        name: provider.name,
        latencyMs: 0,
        error: "API key is not configured in .env",
        text: "",
      });
      continue;
    }
    console.log(`${provider.name}: testing configured provider`);
    results.push(await timedCall(provider.name, provider.call));
  }

  const report = `# AI Provider Connectivity And Output Comparison

Generated: ${new Date().toISOString()}

## Shared Prompt

${prompt}

${results.map(renderResult).join("\n")}
`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");

  for (const result of results) {
    const status = result.ok ? "OK" : "ERROR";
    const detail = result.ok ? `${result.latencyMs}ms, ${result.text.length} chars` : result.error;
    console.log(`${result.name}: ${status} (${detail})`);
  }
  console.log(`Report written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
