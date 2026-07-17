import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "weekly-report-os-sc360-"));
const dbPath = path.join(tempDir, "weekly-report-os.sqlite");
const port = 5900 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    AUTH_MODE: "mock",
    SERVER_PORT: String(port),
    BASE_URL: baseUrl,
    WEEKLY_REPORT_DB_PATH: dbPath,
    SCORING360_ACTIVE_DATE: "2026-06-24T10:00:00+08:00",
    MOCK_USER_OPEN_ID: "mock_manager",
    MOCK_USER_NAME: "Demo Manager",
    MOCK_USER_EMAIL: "manager@example.invalid",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await waitForHealth(baseUrl);

  const me = await fetchJson(`${baseUrl}/api/me`);
  assert(me.user?.name === "Demo Manager", `expected mock manager user, got ${me.user?.name}`);
  assert(me.access?.bossView === true, "configured manager should have full boss view access");
  assert(me.access?.canManageScoring360 === true, "configured manager should manage scoring360");

  const overview = await fetchJson(`${baseUrl}/api/scoring360`);
  assert(overview.cycle?.id === "2026-05-round2-360", `expected current round cycle, got ${overview.cycle?.id}`);
  assert(overview.cycle?.status === "open", `expected open cycle, got ${overview.cycle?.status}`);

  const tasks = await fetchJson(`${baseUrl}/api/scoring360/my-tasks?evaluator=${encodeURIComponent("Demo Manager")}`);
  assert(tasks.cycleId === "2026-05-round2-360", `expected current tasks cycle, got ${tasks.cycleId}`);
  assert(tasks.tasks.length > 0, "expected manager scoring tasks copied from template");
  assert(tasks.tasks.every((task) => task.submitted === false), "new cycle tasks should not be submitted");
  assert(tasks.tasks.every((task) => task.locked === false), "new cycle tasks should be editable");

  console.log("scoring360 api test passed");
} finally {
  child.kill("SIGTERM");
  await waitForExit(child).catch(() => child.kill("SIGKILL"));
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early code=${child.exitCode}\nstdout=${stdout}\nstderr=${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become healthy: ${lastError?.message || "timeout"}\nstdout=${stdout}\nstderr=${stderr}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`invalid JSON from ${url}: ${text}`);
  }
  if (!response.ok || json?.ok === false) {
    throw new Error(`request failed ${url}: ${response.status} ${text}`);
  }
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForExit(childProcess) {
  if (childProcess.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    childProcess.once("exit", resolve);
    setTimeout(resolve, 2000);
  });
}
