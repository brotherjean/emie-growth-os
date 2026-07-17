import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const releasesDir = path.join(rootDir, "outputs", "static-releases");

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function isNewerIsoDate(left, right) {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime > rightTime;
}

async function main() {
  const releaseId = arg("--release", (await readFile(path.join(releasesDir, "latest.txt"), "utf8")).trim());
  const releaseDir = path.join(releasesDir, releaseId);
  const remote = arg("--remote", "root@8.135.51.39");
  const remoteDir = arg("--remote-dir", "/var/www/weekly-report-os");
  const remoteStaticDir = arg("--remote-static-dir", `${remoteDir}/dist`);
  const keyPath = arg("--key", "/Users/cyberfish/AI Workspace/飞书CLI/SSH_EMIE_New(1).pem");
  const sshArgs = ["-i", keyPath, "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=accept-new"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const allowStaleData = process.argv.includes("--allow-stale-data");
  const manifest = JSON.parse(await readFile(path.join(releaseDir, "release-manifest.json"), "utf8"));

  console.log(`Deploying static release ${releaseId} to ${remote}:${remoteStaticDir}`);
  console.log("This script does not store or print private key passphrases. If the key is encrypted, load it into ssh-agent first.");

  if (!allowStaleData) {
    const remoteGeneratedAt = (
      await runCapture("ssh", [
        ...sshArgs,
        remote,
        `cd ${shellQuote(remoteDir)} && node -e "try { const data = require('./src/data/kimiInsights.json'); console.log(data.meta && data.meta.generatedAt || '') } catch { console.log('') }"`,
      ])
    ).trim();

    if (isNewerIsoDate(remoteGeneratedAt, manifest.sourceGeneratedAt)) {
      throw new Error(
        `Refusing to deploy stale local release. Remote data is newer (${remoteGeneratedAt}) than local release (${manifest.sourceGeneratedAt}). Pull remote data or rerun local preprocessing first. Use --allow-stale-data only for an intentional rollback.`,
      );
    }
  }

  await run("ssh", [
    ...sshArgs,
    remote,
    `set -e; test -f '${remoteDir}/server/index.mjs'; mkdir -p '${remoteStaticDir}' /var/backups/weekly-report-os; set +e; tar -C '${remoteDir}' -czf '/var/backups/weekly-report-os/${stamp}.tar.gz' .; code=$?; set -e; if [ "$code" -gt 1 ]; then exit "$code"; fi`,
  ]);
  await run("rsync", [
    "-az",
    "--delete",
    "-e",
    `ssh ${sshArgs.map((item) => `'${item.replaceAll("'", "'\\''")}'`).join(" ")}`,
    `${releaseDir}/`,
    `${remote}:${remoteStaticDir}/`,
  ]);
  await run("rsync", [
    "-az",
    "-e",
    `ssh ${sshArgs.map((item) => `'${item.replaceAll("'", "'\\''")}'`).join(" ")}`,
    `${path.join(rootDir, "server")}/`,
    `${remote}:${remoteDir}/server/`,
  ]);
  await run("rsync", [
    "-az",
    "-e",
    `ssh ${sshArgs.map((item) => `'${item.replaceAll("'", "'\\''")}'`).join(" ")}`,
    `${path.join(rootDir, "scripts")}/`,
    `${remote}:${remoteDir}/scripts/`,
  ]);
  await run("rsync", [
    "-az",
    "--delete",
    "--exclude",
    "data/kimiInsights.json",
    "--exclude",
    "data/kimiInsightsByPeriod.json",
    "--exclude",
    "data/prototypeData.json",
    "--exclude",
    "data/scoring360.json",
    "-e",
    `ssh ${sshArgs.map((item) => `'${item.replaceAll("'", "'\\''")}'`).join(" ")}`,
    `${path.join(rootDir, "src")}/`,
    `${remote}:${remoteDir}/src/`,
  ]);
  await run("rsync", [
    "-az",
    "-e",
    `ssh ${sshArgs.map((item) => `'${item.replaceAll("'", "'\\''")}'`).join(" ")}`,
    ...["index.html", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json", "vite.config.ts"]
      .map((file) => path.join(rootDir, file)),
    `${remote}:${remoteDir}/`,
  ]);
  await run("ssh", [
    ...sshArgs,
    remote,
    `cd '${remoteDir}' && node --check server/index.mjs && pm2 reload weekly-report-os --update-env >/dev/null`,
  ]);
  await run("ssh", [...sshArgs, remote, `test -f '${remoteDir}/server/index.mjs' && test -f '${remoteStaticDir}/index.html' && test -f '${remoteStaticDir}/release-manifest.json'`]);
  console.log("Deploy completed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
