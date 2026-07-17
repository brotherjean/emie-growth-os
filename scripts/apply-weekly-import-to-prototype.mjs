import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const prototypePath = path.join(rootDir, "src/data/prototypeData.json");

const DEFAULT_WEEK = {
  id: "2026-W21",
  label: "5月第四周",
  range: "5/18-5/22",
  start: "2026-05-18",
  end: "2026-05-22",
  generatedOn: "2026-05-23",
};

function parseArgs(argv) {
  const args = { ...DEFAULT_WEEK, exempt: ["小宇"] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args.importPath = item;
      continue;
    }
    const key = item.slice(2);
    const value = argv[index + 1];
    index += 1;
    if (key === "exempt") {
      args.exempt = String(value || "")
        .split(/[,，、]/)
        .map((name) => name.trim())
        .filter(Boolean);
    } else {
      args[key] = value;
    }
  }
  if (!args.importPath) {
    throw new Error("Usage: node scripts/apply-weekly-import-to-prototype.mjs <import-json> [--id 2026-W21] [--label 5月第四周] [--range 5/18-5/22]");
  }
  return args;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/&#xA;/g, "\n")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function compact(value, maxLength = 6000) {
  const text = cleanText(value).replace(/\n{3,}/g, "\n\n");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function countNumbers(value) {
  return (cleanText(value).match(/\d+(?:\.\d+)?%?/g) || []).length;
}

function countKeywords(value, keywords) {
  const text = cleanText(value);
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function scoreRecord(record) {
  const result = cleanText(record.content?.results);
  const problem = cleanText(record.content?.problems);
  const plan = cleanText(record.content?.nextPlan);
  const reflection = cleanText(record.content?.reflection);
  const allText = [result, problem, plan, reflection].join("\n");
  const numberCount = countNumbers(allText);
  const textLength = allText.length;
  const resultScore = clamp(21 + Math.min(7, result.length / 120) + Math.min(2, countNumbers(result) * 0.18), 18, 30);
  const problemScore = clamp(13 + Math.min(4.5, problem.length / 180) + countKeywords(problem, ["风险", "问题", "挑战", "卡", "待", "需要"]) * 0.55, 10, 20);
  const reflectionScore = clamp(12 + Math.min(4.5, reflection.length / 170) + countKeywords(reflection, ["复盘", "建议", "后续", "沉淀", "提升"]) * 0.55, 9, 20);
  const planScore = clamp(12 + Math.min(4.5, plan.length / 170) + countKeywords(plan, ["完成", "推进", "目标", "评审", "验证"]) * 0.5, 9, 20);
  const punctualityScore = /准时/.test(record.submitStatus || "") ? 10 : 6;
  const total = clamp(resultScore + problemScore + reflectionScore + planScore + punctualityScore, 55, 96);
  return {
    resultScore: round1(resultScore),
    problemScore: round1(problemScore),
    reflectionScore: round1(reflectionScore),
    planScore: round1(planScore),
    punctualityScore,
    total: round1(total),
    level: levelFor(total),
    numberCount,
    textLength,
  };
}

function levelFor(score) {
  if (score >= 88) return "A";
  if (score >= 82) return "A-";
  if (score >= 76) return "B+";
  if (score >= 68) return "B";
  return "C";
}

function dedupeLatest(records) {
  const latest = new Map();
  for (const record of records) {
    const name = cleanText(record.employeeName);
    if (!name) continue;
    const previous = latest.get(name);
    if (!previous || String(record.submittedAt || "") > String(previous.submittedAt || "")) {
      latest.set(name, record);
    }
  }
  return Array.from(latest.values()).sort((a, b) => cleanText(a.employeeName).localeCompare(cleanText(b.employeeName), "zh-Hans-CN"));
}

function recordOpenId(record) {
  return cleanText(record.lark?.fromUserId || record.openId || record.open_id);
}

function buildWeeklyRow(record, options, employeeIndex) {
  const score = scoreRecord(record);
  const week = `${options.label} ${options.range}`;
  const name = cleanText(record.employeeName);
  const previous = employeeIndex.get(name) || {};
  return {
    "姓名": name,
    "部门": cleanText(record.department),
    "open_id": recordOpenId(record) || previous["open_id"] || "",
    "企业邮箱": cleanText(record.email) || previous["企业邮箱"] || "",
    "周期ID": options.id,
    "周次": week,
    "开始日期": options.start,
    "结束日期": options.end,
    "提交时间": cleanText(record.submittedAt),
    "导入批次": path.basename(options.importPath),
    "源记录ID": record.id || record.sourceHash || `${cleanText(record.employeeName)}-${options.id}`,
    "状态": /准时/.test(record.submitStatus || "") ? "准时" : cleanText(record.submitStatus) || "已提交",
    "总分": score.total,
    "等级": score.level,
    "成果分": score.resultScore,
    "问题分": score.problemScore,
    "复盘分": score.reflectionScore,
    "计划分": score.planScore,
    "准时分": score.punctualityScore,
    "数字个数": score.numberCount,
    "字数": score.textLength,
    "本周成果摘要": compact(record.content?.results),
    "问题摘要": compact(record.content?.problems || "本周未显式填写问题与挑战。", 5000),
    "下周计划摘要": compact(record.content?.nextPlan, 5000),
    "思考与复盘摘要": compact(record.content?.reflection, 5000),
    "相关文件": cleanText(record.content?.files),
    "评论数": Number(record.interaction?.commentCount || 0),
    "点赞数": Number(record.interaction?.likeCount || 0),
    "已读数": Number(record.interaction?.readCount || 0),
    "未读数": Number(record.interaction?.unreadCount || 0),
  };
}

function scoreTrend(rows) {
  if (rows.length < 2) return 0;
  return round1(Number(rows.at(-1)?.["总分"] || 0) - Number(rows.at(-2)?.["总分"] || 0));
}

function rebuildEmployeeSummary(data, weeklyRows, importRecords) {
  const previousByName = new Map((data.employee_summary || []).map((row) => [row["姓名"], row]));
  const latestEmailByName = new Map(importRecords.map((record) => [cleanText(record.employeeName), cleanText(record.email)]));
  const rowsByName = new Map();
  for (const row of weeklyRows) {
    const name = row["姓名"];
    if (!rowsByName.has(name)) rowsByName.set(name, []);
    rowsByName.get(name).push(row);
  }

  return Array.from(rowsByName.entries())
    .map(([name, rows]) => {
      const previous = previousByName.get(name) || {};
      const sorted = rows.slice();
      const scores = sorted.map((row) => Number(row["总分"] || 0)).filter(Number.isFinite);
      const average = scores.length ? round1(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
      const lateCount = sorted.filter((row) => row["状态"] && row["状态"] !== "准时").length;
      const weakProblemWeeks = sorted.filter((row) => Number(row["问题分"] || 0) < 12).length;
      const latest = sorted.at(-1) || {};
      return {
        "姓名": name,
        "部门": latest["部门"] || previous["部门"] || "",
        "open_id": previous["open_id"] || latest["open_id"] || "",
        "企业邮箱": latestEmailByName.get(name) || previous["企业邮箱"] || latest["企业邮箱"] || "",
        "周报数": sorted.length,
        "准时次数": sorted.length - lateCount,
        "迟交次数": lateCount,
        "平均分": average,
        "等级": levelFor(average),
        "自动等级": levelFor(average),
        "趋势": scoreTrend(sorted),
        "弱问题周数": weakProblemWeeks,
        "人工校准说明": previous["人工校准说明"] || "由周报 OS 根据历史周报、提交状态和内容完整度自动生成。",
        "一句话成长判断": `${name}，当前累计 ${sorted.length} 周周报，最近一周 ${latest["总分"] || average} 分（${latest["等级"] || levelFor(average)}）。建议结合本周问题与下周计划继续形成可验证闭环。`,
      };
    })
    .sort((a, b) => Number(b["平均分"] || 0) - Number(a["平均分"] || 0));
}

function rebuildMeta(data, options, weeklyRows, submittedRecords) {
  const classDistribution = {};
  for (const row of weeklyRows) {
    const level = row["等级"] || "C";
    classDistribution[level] = (classDistribution[level] || 0) + 1;
  }

  const departmentBuckets = new Map();
  for (const row of weeklyRows.filter((item) => item["周期ID"] === options.id)) {
    const department = row["部门"] || "未分组";
    if (!departmentBuckets.has(department)) departmentBuckets.set(department, []);
    departmentBuckets.get(department).push(Number(row["总分"] || 0));
  }
  const deptAverageScores = Object.fromEntries(
    Array.from(departmentBuckets.entries()).map(([department, scores]) => [
      department,
      round1(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)),
    ]),
  );

  const existingPeriods = Array.isArray(data.meta?.periods) ? data.meta.periods : buildPeriodsFromWeeks(weeklyRows);
  const nextPeriod = {
    id: options.id,
    label: options.label,
    range: options.range,
    start: options.start,
    end: options.end,
    submitted_count: submittedRecords.length,
    exempt_people: options.exempt,
    status: "准时",
  };
  const periods = [
    ...existingPeriods.filter((period) => period.id !== options.id && period.label !== options.label),
    nextPeriod,
  ];

  return {
    ...(data.meta || {}),
    source_xlsx: path.basename(options.importPath),
    generated_on: options.generatedOn,
    current_week_id: options.id,
    current_week_label: options.label,
    current_week_range: options.range,
    current_week_start: options.start,
    current_week_end: options.end,
    submitted_count: submittedRecords.length,
    exempt_count: options.exempt.length,
    exempt_people: options.exempt,
    periods,
    people_count: submittedRecords.length + options.exempt.length,
    weekly_record_count: weeklyRows.length,
    class_distribution: classDistribution,
    dept_average_scores: deptAverageScores,
  };
}

function buildPeriodsFromWeeks(weeklyRows) {
  const periodMap = new Map();
  for (const row of weeklyRows) {
    const week = row["周次"] || "";
    if (!/^\d+月第[一二三四五六七八九十\d]+周/.test(week)) continue;
    const label = week.split(/\s+/)[0];
    const range = week.split(/\s+/)[1] || "";
    const id = row["周期ID"] || `${label}-${range}`;
    if (!periodMap.has(id)) {
      periodMap.set(id, {
        id,
        label,
        range,
        start: row["开始日期"] || "",
        end: row["结束日期"] || "",
        submitted_count: 0,
        exempt_people: [],
        status: "历史",
      });
    }
    periodMap.get(id).submitted_count += 1;
  }
  return Array.from(periodMap.values());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [prototypeText, importText] = await Promise.all([
    readFile(prototypePath, "utf8"),
    readFile(path.resolve(rootDir, options.importPath), "utf8"),
  ]);
  const data = JSON.parse(prototypeText);
  const importData = JSON.parse(importText);
  const records = dedupeLatest(importData.records || []);
  const employeeIndex = new Map((data.employee_summary || []).map((row) => [row["姓名"], row]));
  const importedWeeklyRows = records.map((record) => buildWeeklyRow(record, options, employeeIndex));
  const historicalRows = (data.weekly_scores || []).filter((row) => {
    if (row["周期ID"] && row["周期ID"] === options.id) return false;
    if (!row["周期ID"] && row["周次"] === `${options.label} ${options.range}`) return false;
    return true;
  });
  const weeklyRows = [...historicalRows, ...importedWeeklyRows];
  const nextData = {
    ...data,
    meta: rebuildMeta(data, options, weeklyRows, records),
    employee_summary: rebuildEmployeeSummary(data, weeklyRows, records),
    weekly_scores: weeklyRows,
  };
  await writeFile(prototypePath, `${JSON.stringify(nextData, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    currentWeekId: options.id,
    currentWeek: `${options.label} ${options.range}`,
    importedRows: importedWeeklyRows.length,
    totalWeeklyRows: weeklyRows.length,
    peopleCount: nextData.meta.people_count,
    submittedCount: nextData.meta.submitted_count,
    exemptPeople: nextData.meta.exempt_people,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
