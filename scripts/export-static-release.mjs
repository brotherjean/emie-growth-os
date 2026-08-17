import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const releasesDir = path.join(rootDir, "outputs", "static-releases");

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath, base)));
    else files.push(path.relative(base, fullPath));
  }
  return files;
}

async function main() {
  await stat(path.join(distDir, "index.html"));
  const insights = JSON.parse(await readFile(path.join(rootDir, "src/data/kimiInsights.json"), "utf8"));
  const validation = JSON.parse(await readFile(path.join(rootDir, "outputs/kimi-validation-report.json"), "utf8"));
  if (!validation.ok) throw new Error("kimiInsights validation failed; run npm run static:validate for details");

  const releaseId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const releaseDir = path.join(releasesDir, releaseId);
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });
  await cp(distDir, releaseDir, { recursive: true });

  const files = await walk(releaseDir);
  const manifest = {
    releaseId,
    createdAt: new Date().toISOString(),
    app: "weekly-report-os",
    sourceGeneratedAt: insights.meta?.generatedAt,
    model: insights.meta?.model,
    modelStrategy: insights.meta?.modelStrategy,
    models: insights.meta?.models,
    validation: {
      employees: validation.insightEmployees,
      attentionQueue: validation.attentionQueue,
      themes: validation.themes,
      taskCandidates: validation.taskCandidates,
    },
    files: Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          file,
          {
            sha256: await hashFile(path.join(releaseDir, file)),
            bytes: (await stat(path.join(releaseDir, file))).size,
          },
        ]),
      ),
    ),
  };
  await writeFile(path.join(releaseDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(releasesDir, "latest.txt"), `${releaseId}\n`, "utf8");
  console.log(`Static release created: ${releaseDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
