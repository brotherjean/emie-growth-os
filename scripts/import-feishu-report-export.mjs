import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-feishu-report-export.mjs <feishu-report-export.xlsx>");
  process.exit(1);
}

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "outputs/imports");
const sourceName = path.basename(inputPath);
const importedAt = new Date().toISOString();

function unzipEntry(entry) {
  return execFileSync("unzip", ["-p", inputPath, entry], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function decodeXml(value = "") {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function stripTags(value = "") {
  return decodeXml(value.replace(/<[^>]+>/g, ""));
}

function parseSharedStrings(xml) {
  const items = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const textParts = [];
    const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textRegex.exec(match[1]))) {
      textParts.push(decodeXml(textMatch[1]));
    }
    items.push(textParts.join("") || stripTags(match[1]));
  }
  return items;
}

function columnIndex(ref) {
  const letters = ref.replace(/\d+/g, "");
  return letters.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cellXml, sharedStrings) {
  const type = /<c\b[^>]*\bt="([^"]+)"/.exec(cellXml)?.[1] || "";
  const rawValue = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cellXml)?.[1];
  if (type === "s" && rawValue !== undefined) return sharedStrings[Number(rawValue)] ?? "";
  if (type === "inlineStr" && inline) return stripTags(inline);
  return rawValue ? decodeXml(rawValue) : "";
}

function parseRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const row = [];
    const cellRegex = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      row[columnIndex(cellMatch[1])] = cellValue(cellMatch[0], sharedStrings).trim();
    }
    rows.push(row.map((item) => item || ""));
  }
  return rows;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRecord(row, headers, index) {
  const record = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] || ""]));
  const content = {
    results: record["本周成果（只写最重要的3-5件事，用数据说话，拒绝流水账）"] || "",
    problems: record["问题与挑战（暴露风险，寻求支持，不要隐瞒）"] || "",
    nextPlan: record["下周工作计划与目标（目标明确，优先级排序）"] || "",
    reflection: record["思考与复盘 "] || record["思考与复盘"] || "",
    files: record["相关文件"] || "",
  };
  const stable = [
    record["邮箱"],
    record["姓名"],
    record["提交时间"],
    content.results,
    content.problems,
    content.nextPlan,
    content.reflection,
  ].join("\n");
  return {
    id: `report-${hash(stable).slice(0, 16)}`,
    rowNumber: index + 2,
    employeeNo: record["工号"] || "",
    employeeName: record["姓名"] || "",
    email: record["邮箱"] || "",
    department: record["部门"] || "",
    submittedAt: record["提交时间"] || "",
    editStatus: record["编辑状态"] || "",
    submitStatus: record["提交状态"] || "",
    interaction: {
      commentCount: Number(record["评论数"] || 0),
      likeCount: Number(record["点赞数"] || 0),
      readCount: Number(record["已读数"] || 0),
      unreadCount: Number(record["未读数"] || 0),
      commentInfo: record["评论信息"] || "",
    },
    content,
    sourceHash: hash(stable),
  };
}

const sharedStrings = parseSharedStrings(unzipEntry("xl/sharedStrings.xml"));
const sheetXml = unzipEntry("xl/worksheets/sheet1.xml");
const rows = parseRows(sheetXml, sharedStrings).filter((row) => row.some(Boolean));
const headers = rows[0] || [];
const records = rows.slice(1).map((row, index) => normalizeRecord(row, headers, index));
const payload = {
  meta: {
    sourceName,
    importedAt,
    rowCount: records.length,
    headers,
    parser: "xlsx-xml-direct",
  },
  records,
};

await mkdir(outputDir, { recursive: true });
const stamp = importedAt.replace(/[-:]/g, "").replace(/\..+/, "Z");
const outputPath = path.join(outputDir, `${stamp}-${sourceName.replace(/\.xlsx$/i, "")}.json`);
await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  sourceName,
  outputPath,
  rowCount: records.length,
  columns: headers.length,
  sampleNames: records.slice(0, 5).map((record) => record.employeeName),
}, null, 2));
