import type {
  ClosurePair,
  ClosurePersona,
  ClosureStatus,
  EmployeeClosureInsight,
  OrganizationClosureRadar,
  WeeklyScore,
} from "./types";

const ACTION_KEYWORDS = ["完成", "输出", "交付", "推进", "跟进", "验证", "确认", "复盘", "优化", "建立", "沉淀", "公示", "上线"];
const EVIDENCE_KEYWORDS = ["完成", "已", "输出", "交付", "上线", "确认", "反馈", "截图", "链接", "数据", "会议", "文档", "清单", "模板"];
const DELAY_KEYWORDS = ["延期", "未完成", "等待", "卡住", "阻塞", "困难", "风险", "下周继续", "仍然", "需要支持", "对方", "供应商", "客户"];
const MECHANISM_KEYWORDS = ["SOP", "机制", "流程", "模板", "清单", "台账", "规范", "标准", "看板", "制度", "复用", "沉淀", "职责"];
const AI_THINKING_KEYWORDS = ["AI", "提示词", "智能体", "模型", "数据", "变量", "约束", "假设", "验证", "反馈", "迭代", "人机协同", "知识库"];
const VAGUE_PLAN_PATTERNS = [/继续(推进|跟进|优化|完善)?$/, /正常推进/, /持续推进/, /做好/, /加强/, /学习/];

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
}

function countAny(text: string, keywords: string[]) {
  return keywords.reduce((count, keyword) => count + (text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function normalize(text: string) {
  return String(text || "")
    .replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, " ")
    .trim()
    .toLowerCase();
}

function extractTerms(text: string) {
  const normalized = normalize(text);
  const latinTerms = normalized.match(/[a-zA-Z][a-zA-Z0-9_-]{1,}/g) || [];
  const chineseTerms = normalized
    .split(/\s+/)
    .flatMap((part) => {
      const chunks = part.match(/[\p{Script=Han}]{2,}/gu) || [];
      return chunks.flatMap((chunk) => {
        const terms: string[] = [];
        for (let length = 2; length <= Math.min(5, chunk.length); length += 1) {
          for (let index = 0; index <= chunk.length - length; index += 1) {
            terms.push(chunk.slice(index, index + length));
          }
        }
        return terms;
      });
    });
  return [...new Set([...latinTerms, ...chineseTerms])].filter((term) => term.length >= 2);
}

function lexicalOverlap(left: string, right: string) {
  const leftTerms = extractTerms(left);
  if (leftTerms.length === 0) return 0;
  const rightText = normalize(right);
  const matched = leftTerms.filter((term) => rightText.includes(term));
  return matched.length / Math.min(leftTerms.length, 16);
}

function isVaguePlan(plan: string) {
  const text = plan.trim();
  if (!text) return true;
  if (text.length < 16) return true;
  return VAGUE_PLAN_PATTERNS.some((pattern) => pattern.test(text));
}

function formatWeekText(week: WeeklyScore) {
  return week.week || week.weekId || "周报";
}

function buildPair(previous: WeeklyScore, current: WeeklyScore): ClosurePair {
  const previousPlan = previous.nextPlanSummary || "";
  const evidence = [current.resultSummary, current.problemSummary, current.reflectionSummary]
    .filter(Boolean)
    .join("\n");
  const repeatText = `${previous.problemSummary}\n${current.problemSummary}`;
  const overlap = lexicalOverlap(previousPlan, evidence);
  const problemOverlap = lexicalOverlap(previous.problemSummary || previousPlan, current.problemSummary || evidence);
  const planSpecific = !isVaguePlan(previousPlan);
  const hasEvidence = overlap >= 0.22 || hasAny(evidence, EVIDENCE_KEYWORDS);
  const hasDelay = hasAny(evidence, DELAY_KEYWORDS);
  const mechanismSignal = hasAny(`${previousPlan}\n${evidence}`, MECHANISM_KEYWORDS);
  const aiThinkingSignal = hasAny(`${previousPlan}\n${evidence}`, AI_THINKING_KEYWORDS);

  let status: ClosureStatus = "no_evidence";
  if (problemOverlap >= 0.3 && /仍然|继续|反复|还是/.test(repeatText)) {
    status = "repeated_loop";
  } else if (planSpecific && overlap >= 0.3 && hasEvidence) {
    status = "closed";
  } else if (problemOverlap >= 0.28 && hasDelay && !hasEvidence) {
    status = "repeated_loop";
  } else if (hasDelay && (overlap >= 0.14 || problemOverlap >= 0.2)) {
    status = "explained_delay";
  } else if (planSpecific && hasEvidence) {
    status = "partial";
  }

  const baseScore = {
    closed: 88,
    partial: 70,
    explained_delay: 64,
    no_evidence: 44,
    repeated_loop: 34,
  }[status];
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        baseScore +
          Math.min(8, overlap * 12) +
          (mechanismSignal ? 6 : 0) +
          (aiThinkingSignal ? 4 : 0) +
          (planSpecific ? 2 : -6),
      ),
    ),
  );

  const signal = {
    closed: "上周承诺在本周结果里找到了明确回应，具备闭环证据。",
    partial: "本周有相关动作，但结果、验收物或影响还不够清楚。",
    explained_delay: "本周解释了延期或阻塞，下一步需要明确责任人和升级节点。",
    no_evidence: "上周计划在本周周报里缺少可验证回应，容易变成口头承诺。",
    repeated_loop: "同一问题跨周反复出现，行动和机制没有跟上问题识别。",
  }[status];
  const nextStep = {
    closed: mechanismSignal ? "把这次闭环沉淀为可复用模板或团队方法。" : "下周继续补充结果数据，让闭环从完成升级为可复用经验。",
    partial: "把相关动作补成验收物：链接、截图、数据、会议结论或明确完成口径。",
    explained_delay: "写清楚谁支持、何时再检查、超过什么时间升级给 Leader 或老板。",
    no_evidence: "下周周报先回应上周承诺，再写新计划，避免计划漂浮。",
    repeated_loop: "把反复问题拆成一个最小可执行动作，并明确阻塞责任人。",
  }[status];

  return {
    id: `${previous.name}-${formatWeekText(previous)}-${formatWeekText(current)}`,
    previousWeek: formatWeekText(previous),
    currentWeek: formatWeekText(current),
    previousPlan,
    currentEvidence: evidence,
    status,
    score,
    signal,
    nextStep,
    mechanismSignal,
    aiThinkingSignal,
  };
}

function personaFor(insight: Omit<EmployeeClosureInsight, "persona" | "summary">): ClosurePersona {
  if (insight.mechanismCount > 0 && insight.score >= 74) return "机制型成员";
  if (insight.closedCount >= 2 && insight.score >= 76) return "闭环型成员";
  if (insight.repeatedCount >= 2 || (insight.riskCount >= 3 && insight.score < 58)) return "抱怨型成员";
  if (insight.score >= 64) return "执行型成员";
  return "漂浮型成员";
}

function summaryFor(persona: ClosurePersona, insight: Omit<EmployeeClosureInsight, "persona" | "summary">) {
  if (persona === "机制型成员") {
    return `能把问题推进到机制沉淀，近 ${insight.pairs.length} 个跨周片段中有 ${insight.mechanismCount} 个机制信号，是管理岗/后备合伙人的重要观察样本。`;
  }
  if (persona === "闭环型成员") {
    return `承诺回应稳定，近 ${insight.pairs.length} 个跨周片段中完成 ${insight.closedCount} 个闭环，适合给更多机会和资源。`;
  }
  if (persona === "执行型成员") {
    return "能完成任务，但还需要把复盘、验收口径和方法沉淀补强。";
  }
  if (persona === "抱怨型成员") {
    return "能识别问题，但反复卡在同类问题上，需要管理者帮助拆出行动和支持路径。";
  }
  return "计划与结果之间缺少连续证据，容易每周交作业但原地打转。";
}

export function buildEmployeeClosureInsight(name: string, department: string, weeks: WeeklyScore[]): EmployeeClosureInsight {
  const pairs = weeks
    .slice(-7)
    .reduce<ClosurePair[]>((items, week, index, source) => {
      if (index === 0) return items;
      const previous = source[index - 1];
      if (!previous?.nextPlanSummary && !week?.resultSummary) return items;
      items.push(buildPair(previous, week));
      return items;
    }, [])
    .slice(-6);

  const closedCount = pairs.filter((pair) => pair.status === "closed").length;
  const partialCount = pairs.filter((pair) => pair.status === "partial" || pair.status === "explained_delay").length;
  const repeatedCount = pairs.filter((pair) => pair.status === "repeated_loop").length;
  const riskCount = pairs.filter((pair) => pair.status === "repeated_loop" || pair.status === "no_evidence").length;
  const mechanismCount = pairs.filter((pair) => pair.mechanismSignal).length;
  const aiThinkingScore = pairs.length
    ? Math.round((pairs.filter((pair) => pair.aiThinkingSignal).length / pairs.length) * 100)
    : 0;
  const score = pairs.length
    ? Math.round(pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length)
    : 0;
  const baseInsight = {
    name,
    department,
    score,
    closedCount,
    partialCount,
    riskCount,
    repeatedCount,
    mechanismCount,
    aiThinkingScore,
    latestPair: pairs.at(-1),
    pairs,
  };
  const persona = personaFor(baseInsight);
  return {
    ...baseInsight,
    persona,
    summary: summaryFor(persona, baseInsight),
  };
}

export function buildOrganizationClosureRadar(insights: EmployeeClosureInsight[]): OrganizationClosureRadar {
  const activeInsights = insights.filter((insight) => insight.pairs.length > 0);
  const averageScore = activeInsights.length
    ? Math.round(activeInsights.reduce((sum, insight) => sum + insight.score, 0) / activeInsights.length)
    : 0;
  return {
    averageScore,
    leaders: [...activeInsights].sort((a, b) => b.score - a.score || b.closedCount - a.closedCount).slice(0, 6),
    risks: [...activeInsights].sort((a, b) => b.riskCount - a.riskCount || a.score - b.score).slice(0, 6),
    mechanismSamples: activeInsights
      .filter((insight) => insight.mechanismCount > 0)
      .sort((a, b) => b.mechanismCount - a.mechanismCount || b.score - a.score)
      .slice(0, 4),
    repeatedIssues: activeInsights
      .filter((insight) => insight.repeatedCount > 0)
      .sort((a, b) => b.repeatedCount - a.repeatedCount || a.score - b.score)
      .slice(0, 4),
    clearThinkers: [...activeInsights]
      .sort((a, b) => b.aiThinkingScore - a.aiThinkingScore || b.mechanismCount - a.mechanismCount || b.score - a.score)
      .slice(0, 5),
  };
}
