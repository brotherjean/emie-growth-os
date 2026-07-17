import rawData from "../data/prototypeData.json";
import rawKimiInsights from "../data/kimiInsights.json";
import rawKimiInsightsByPeriod from "../data/kimiInsightsByPeriod.json";
import rawScoring360 from "../data/scoring360.json";
import { buildEmployeeClosureInsight, buildOrganizationClosureRadar } from "./closure";
import type {
  AppData,
  AttentionTask,
  DepartmentClosureSignal,
  DepartmentMeetingBrief,
  DepartmentMeetingIssue,
  EmployeeClosureInsight,
  CoordinationSignal,
  CoordinationTag,
  EmployeeSummary,
  EmployeeTask,
  FeedbackDraft,
  KimiInsights,
  KimiTaskCandidate,
  MonthlyDepartmentReview,
  MonthlyMeetingAgendaItem,
  MonthlyMeetingBrief,
  MonthlyMeetingCategory,
  MustReadReport,
  OrganizationClosureRadar,
  MonthlyDepartmentGroup,
  MonthlyFinanceBridge,
  Priority,
  ReportPeriod,
  Scoring360Data,
  Scoring360Result,
  ThemeInsight,
  WeeklyScore,
} from "./types";

type RawRecord = Record<string, any>;

const raw = rawData as RawRecord;

const toNumber = (value: unknown) => Number(value ?? 0);
const toText = (value: unknown) => String(value ?? "");
const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed.replaceAll("'", '"'));
      return Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      return trimmed
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return value ? [value] : [];
};
const toRecordArray = (value: unknown): RawRecord[] => toArray(value) as RawRecord[];

function mapEmployee(row: RawRecord): EmployeeSummary {
  return {
    name: toText(row["姓名"]),
    department: toText(row["部门"]),
    openId: toText(row["open_id"]),
    email: toText(row["企业邮箱"]),
    reportCount: toNumber(row["周报数"]),
    onTimeCount: toNumber(row["准时次数"]),
    lateCount: toNumber(row["迟交次数"]),
    averageScore: toNumber(row["平均分"]),
    level: toText(row["等级"]) as EmployeeSummary["level"],
    autoLevel: toText(row["自动等级"]) as EmployeeSummary["autoLevel"],
    trend: toNumber(row["趋势"]),
    weakProblemWeeks: toNumber(row["弱问题周数"]),
    calibrationNote: toText(row["人工校准说明"]),
    growthSummary: toText(row["一句话成长判断"]),
  };
}

function mapWeekly(row: RawRecord): WeeklyScore {
  return {
    name: toText(row["姓名"]),
    department: toText(row["部门"]),
    weekId: toText(row["周期ID"]),
    week: toText(row["周次"]),
    weekStart: toText(row["开始日期"]),
    weekEnd: toText(row["结束日期"]),
    submittedAt: toText(row["提交时间"]),
    sourceReportId: toText(row["源记录ID"]),
    status: toText(row["状态"]),
    total: toNumber(row["总分"]),
    level: toText(row["等级"]) as WeeklyScore["level"],
    resultScore: toNumber(row["成果分"]),
    problemScore: toNumber(row["问题分"]),
    reflectionScore: toNumber(row["复盘分"]),
    planScore: toNumber(row["计划分"]),
    punctualityScore: toNumber(row["准时分"]),
    numberCount: toNumber(row["数字个数"]),
    textLength: toNumber(row["字数"]),
    resultSummary: toText(row["本周成果摘要"]),
    problemSummary: toText(row["问题摘要"]),
    nextPlanSummary: toText(row["下周计划摘要"]),
    reflectionSummary: toText(row["思考与复盘摘要"]),
    files: toText(row["相关文件"]),
    commentCount: toNumber(row["评论数"]),
    likeCount: toNumber(row["点赞数"]),
    readCount: toNumber(row["已读数"]),
    unreadCount: toNumber(row["未读数"]),
  };
}

function inferPeriodId(week: string) {
  const monthMatch = week.match(/(\d{1,2})月/);
  const weekMatch = week.match(/第([一二三四五六七八九十\d]+)周/);
  if (!monthMatch || !weekMatch) return week;
  return `${monthMatch[1].padStart(2, "0")}W${chineseWeekNumber(weekMatch[1])}`;
}

function chineseWeekNumber(value: string) {
  if (/^\d+$/.test(value)) return value;
  const map: Record<string, string> = {
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
    十: "10",
  };
  return map[value] || value;
}

function mapPeriod(row: RawRecord): ReportPeriod {
  return {
    id: toText(row.id),
    label: toText(row.label),
    range: toText(row.range),
    start: toText(row.start),
    end: toText(row.end),
    submittedCount: toNumber(row.submitted_count ?? row.submittedCount),
    exemptPeople: toArray(row.exempt_people ?? row.exemptPeople).map(toText),
    status: toText(row.status),
  };
}

function inferPeriods(weeklyScores: WeeklyScore[]): ReportPeriod[] {
  const map = new Map<string, ReportPeriod>();
  for (const week of weeklyScores) {
    if (!week.week || week.week.length > 32) continue;
    const label = week.week.split(/\s+/)[0] || week.week;
    const range = week.week.split(/\s+/)[1] || "";
    const id = week.weekId || inferPeriodId(week.week);
    if (!map.has(id)) {
      map.set(id, {
        id,
        label,
        range,
        start: week.weekStart,
        end: week.weekEnd,
        submittedCount: 0,
        exemptPeople: [],
        status: "历史",
      });
    }
    map.get(id)!.submittedCount += 1;
  }
  return Array.from(map.values());
}

function mapBossTask(row: RawRecord): AttentionTask {
  return {
    priority: toText(row["优先级"]) as AttentionTask["priority"],
    source: toText(row["来源人员"]),
    department: toText(row["部门"]),
    theme: toText(row["主题"]),
    status: toText(row["审核状态"]) || "待老板确认",
    title: toText(row["建议任务标题"]),
    description: toText(row["建议任务描述"]),
    owner: toText(row["建议负责人"]),
    ownerOpenId: toText(row["建议负责人open_id"]),
    dueDate: toText(row["截止日期"]),
    evidence: toText(row["证据"]),
  };
}

function mapEmployeeTask(row: RawRecord): EmployeeTask {
  return {
    priority: toText(row["优先级"]) as EmployeeTask["priority"],
    source: toText(row["来源人员"]),
    department: toText(row["部门"]),
    assigneeOpenId: toText(row["负责人open_id"]),
    theme: toText(row["主题"]),
    title: toText(row["建议任务标题"]),
    description: toText(row["建议任务描述"]),
    assignee: toText(row["建议负责人"]),
    dueDate: toText(row["截止日期"]),
    evidence: toText(row["证据"]),
  };
}

function mapFeedback(row: RawRecord): FeedbackDraft {
  return {
    name: toText(row["姓名"]),
    department: toText(row["部门"]),
    openId: toText(row["open_id"]),
    delivery: toText(row["建议发送方式"]),
    body: toText(row["反馈草稿"]),
  };
}

function toPriority(value: unknown) {
  const text = toText(value);
  return text === "P0" || text === "P1" || text === "P2" ? text : "P2";
}

function mapInsightAttention(row: RawRecord): AttentionTask {
  return {
    priority: toPriority(row.priority),
    source: toText(row.source),
    department: toText(row.department),
    theme: toText(row.theme),
    status: "待老板确认",
    title: toText(row.title),
    description: toText(row.whyBoss || row.description || row.acceptance),
    owner: toText(row.owner),
    ownerOpenId: toText(row.ownerOpenId),
    dueDate: toText(row.dueDate),
    evidence: toText(row.evidence),
  };
}

function mapThemeInsight(row: RawRecord): ThemeInsight {
  return {
    label: toText(row.label),
    value: toNumber(row.value),
    severity: toPriority(row.severity),
    summary: toText(row.summary),
    detail: toText(row.detail),
    quotes: toRecordArray(row.quotes).map((quote) => ({
      author: toText(quote.author),
      department: toText(quote.department),
      week: toText(quote.week),
      text: toText(quote.text),
    })),
    nextStep: toText(row.nextStep),
  };
}

function mapMustRead(row: RawRecord): MustReadReport {
  return {
    name: toText(row.name),
    department: toText(row.department),
    reason: toText(row.reason),
    focus: toText(row.focus),
    evidence: toText(row.evidence),
  };
}

function mapCandidate(row: RawRecord, fallbackName: string, index: number): KimiTaskCandidate {
  return {
    id: toText(row.id) || `${fallbackName}-${index}`,
    priority: toPriority(row.priority),
    source: toText(row.source) || fallbackName,
    department: toText(row.department),
    owner: toText(row.owner) || fallbackName,
    ownerOpenId: toText(row.ownerOpenId),
    title: toText(row.title),
    description: toText(row.description),
    dueDate: toText(row.dueDate),
    metric: toText(row.metric),
    evidence: toText(row.evidence),
    aiIntent: toText(row.aiIntent),
    firstStep: toText(row.firstStep),
    supportNeeded: toText(row.supportNeeded),
    contextNeed: toText(row.contextNeed),
  };
}

export const appData: AppData = {
  generatedOn: toText(raw.meta?.generated_on),
  currentWeekId: toText(raw.meta?.current_week_id),
  currentWeekLabel: toText(raw.meta?.current_week_label),
  currentWeekRange: toText(raw.meta?.current_week_range),
  submittedCount: toNumber(raw.meta?.submitted_count),
  exemptCount: toNumber(raw.meta?.exempt_count),
  exemptPeople: toArray(raw.meta?.exempt_people).map(toText),
  periods: (raw.meta?.periods ?? []).map(mapPeriod),
  peopleCount: toNumber(raw.meta?.people_count),
  weeklyRecordCount: toNumber(raw.meta?.weekly_record_count),
  companyChatName: toText(raw.meta?.company_chat?.name),
  companyChatId: toText(raw.meta?.company_chat?.chat_id),
  employeeSummary: (raw.employee_summary ?? []).map(mapEmployee),
  weeklyScores: (raw.weekly_scores ?? []).map(mapWeekly),
  bossTasks: (raw.boss_tasks ?? []).map(mapBossTask),
  employeeTasks: (raw.employee_tasks ?? []).map(mapEmployeeTask),
  feedbackDrafts: (raw.feedback_drafts ?? []).map(mapFeedback),
  groupMessageDraft: toText(raw.group_message_draft),
  classDistribution: raw.meta?.class_distribution ?? {},
  departmentScores: raw.meta?.dept_average_scores ?? {},
};

if (appData.periods.length === 0) {
  appData.periods = inferPeriods(appData.weeklyScores);
}
if (!appData.currentWeekId && appData.periods.length > 0) {
  appData.currentWeekId = appData.periods.at(-1)!.id;
  appData.currentWeekLabel = appData.periods.at(-1)!.label;
  appData.currentWeekRange = appData.periods.at(-1)!.range;
}
if (!appData.submittedCount && appData.periods.length > 0) {
  appData.submittedCount = appData.periods.at(-1)!.submittedCount;
}

function mapKimiInsights(rawInsightValue: RawRecord): KimiInsights {
  const rawInsights = rawInsightValue as RawRecord;
  return {
    meta: {
      provider: toText(rawInsights.meta?.provider),
      model: toText(rawInsights.meta?.model),
      generatedAt: toText(rawInsights.meta?.generatedAt),
      source: toText(rawInsights.meta?.source),
    },
    executiveSummary: toArray(rawInsights.executiveSummary).map(toText),
    collectiveFocus: toRecordArray(rawInsights.collectiveFocus).map((item) => ({
      title: toText(item.title),
      detail: toText(item.detail),
    })),
    companyMessageDraft: toText(rawInsights.companyMessageDraft),
    attentionQueue: toRecordArray(rawInsights.attentionQueue).map(mapInsightAttention),
    mustReadReports: toRecordArray(rawInsights.mustReadReports).map(mapMustRead),
    themes: toRecordArray(rawInsights.themes).map(mapThemeInsight),
    employeeInsights: toRecordArray(rawInsights.employeeInsights).map((item) => ({
      name: toText(item.name),
      coachSummary: toText(item.coachSummary),
      coachQuestions: toArray(item.coachQuestions).map(toText),
      taskCandidates: toRecordArray(item.taskCandidates).map((candidate, index) =>
        mapCandidate(candidate, toText(item.name), index),
      ),
    })),
    feishuTaskPlan: {
      tasklistName: toText(rawInsights.feishuTaskPlan?.tasklistName) || "周报闭环任务池",
      requiredScopes: toArray(rawInsights.feishuTaskPlan?.requiredScopes ?? [
        "task:task:write",
        "task:task:read",
        "task:tasklist:write",
        "task:tasklist:read",
      ]).map(toText),
      creationMode: toText(rawInsights.feishuTaskPlan?.creationMode) || "review_then_create",
    },
  };
}

export const kimiInsights: KimiInsights = mapKimiInsights(rawKimiInsights as RawRecord);

export const kimiInsightsByPeriod: Record<string, KimiInsights> = Object.fromEntries(
  Object.entries(rawKimiInsightsByPeriod as Record<string, RawRecord>).map(([periodId, insights]) => [
    periodId,
    mapKimiInsights(insights),
  ]),
);

if (appData.currentWeekId && !kimiInsightsByPeriod[appData.currentWeekId]) {
  kimiInsightsByPeriod[appData.currentWeekId] = kimiInsights;
}

const missingPeriodSource = "missing-period-snapshot";

function emptyKimiInsightsForPeriod(periodId?: string): KimiInsights {
  return {
    meta: {
      provider: "",
      model: "",
      generatedAt: "",
      source: periodId ? `${missingPeriodSource}:${periodId}` : missingPeriodSource,
    },
    executiveSummary: [],
    collectiveFocus: [],
    companyMessageDraft: "",
    attentionQueue: [],
    mustReadReports: [],
    themes: [],
    employeeInsights: [],
    feishuTaskPlan: kimiInsights.feishuTaskPlan,
  };
}

export function hasInsightsForPeriod(periodId?: string) {
  return Boolean(periodId && kimiInsightsByPeriod[periodId]);
}

function isMissingPeriodInsights(insights: KimiInsights) {
  return insights.meta.source.startsWith(missingPeriodSource);
}

export function insightsForPeriod(periodId?: string) {
  if (periodId && kimiInsightsByPeriod[periodId]) return kimiInsightsByPeriod[periodId];
  if (periodId && periodId !== appData.currentWeekId) return emptyKimiInsightsForPeriod(periodId);
  return kimiInsights;
}

export const scoring360 = rawScoring360 as Scoring360Data;

export const currentScoring360Cycle = scoring360.cycles[0];

export function scoring360ResultForEmployee(name: string): Scoring360Result | undefined {
  return scoring360.results.find((result) => result.name === name);
}

export function scoring360AssignmentsForEvaluator(name: string, cycleId = currentScoring360Cycle?.id) {
  return scoring360.assignments
    .filter((assignment) => assignment.cycleId === cycleId && assignment.evaluator === name)
    .map((assignment) => {
      const response = scoring360.responses.find((item) => item.assignmentId === assignment.id);
      return {
        ...assignment,
        submitted: Boolean(response),
        score: response?.score ?? null,
        submittedAt: response?.submittedAt ?? "",
      };
    });
}

export function scoring360VisibleResults(visibleNames: Set<string>) {
  if (visibleNames.size === 0) return scoring360.results;
  return scoring360.results.filter((result) => visibleNames.has(result.name));
}

export function attentionQueueForInsights(insights = kimiInsights) {
  if (isMissingPeriodInsights(insights)) return [];
  return insights.attentionQueue.length > 0 ? insights.attentionQueue : appData.bossTasks;
}

export const attentionQueue = attentionQueueForInsights(kimiInsights);

interface CoordinationSource {
  priority?: string;
  title?: string;
  description?: string;
  detail?: string;
  summary?: string;
  evidence?: string;
  nextStep?: string;
  theme?: string;
  department?: string;
  source?: string;
  owner?: string;
}

const managementBranches = [
  {
    id: "domestic",
    name: "国内事业部",
    lead: "国内业务负责人",
    description: "国内渠道、销售目标、客户转化、促销节奏和库存去化。",
    departments: ["国内事业部", "产品推广"],
  },
  {
    id: "overseas",
    name: "海外事业部",
    lead: "海外业务负责人",
    description: "海外客户、POP/达人渠道、海外交付、海外仓和跨境订单。",
    departments: ["海外事业部", "海外仓库"],
  },
  {
    id: "retail",
    name: "连锁商超事业部",
    lead: "商超业务负责人",
    description: "商超渠道、KA/定制客户、订单推进和交付协同。",
    departments: ["连锁商超事业部"],
  },
  {
    id: "middle-office",
    name: "中后台管理中心",
    lead: "中后台负责人",
    description: "支撑业务部门的产品企划、设计、供应链、采购、仓库、财务、人力行政和IT。",
    departments: ["产品企划部", "设计部", "供应链中心", "采购跟单", "国内仓库", "财务部", "人力行政部", "IT运维", "it运维"],
  },
];

const departmentAliases: Record<string, string> = {
  it运维: "IT运维",
  "供应链中心,采购跟单": "采购跟单",
};

function normalizeDepartmentName(department: string) {
  return departmentAliases[department] || department;
}

function branchForDepartment(department: string) {
  const normalized = normalizeDepartmentName(department);
  return managementBranches.find((branch) =>
    branch.departments.map(normalizeDepartmentName).includes(normalized),
  ) ?? managementBranches[3];
}

function knownDepartmentNames() {
  return uniqText([
    ...appData.employeeSummary.map((employee) => normalizeDepartmentName(employee.department)),
    ...managementBranches.flatMap((branch) => branch.departments.map(normalizeDepartmentName)),
  ]);
}

function departmentsMentionedInText(text: string) {
  return knownDepartmentNames().filter((department) => text.includes(department));
}

const coordinationRules: Array<{ type: CoordinationTag["type"]; label: string; patterns: RegExp[] }> = [
  {
    type: "cross_department",
    label: "跨部门协调",
    patterns: [/跨部门|多部门|协同|配合|对齐|部门墙|联动|牵头/, /设计部|供应链|产品企划|海外事业部|国内事业部|采购|财务|IT|人力/],
  },
  {
    type: "boss_decision",
    label: "老板决策",
    patterns: [/老板|管理者|拍板|决策|升级|牵头|授权|优先级|资源/],
  },
  {
    type: "external_dependency",
    label: "外部卡点",
    patterns: [/客户|供应商|版权方|环球|阿里鱼|三丽鸥|授权方|外部|官方|续签|合作方/],
  },
  {
    type: "process_gap",
    label: "机制/SOP",
    patterns: [/流程|机制|SOP|标准|模板|规范|看板|台账|制度|闭环|升级规则/],
  },
  {
    type: "support_needed",
    label: "需要支持",
    patterns: [/支持|卡点|阻塞|困难|无法|缺少|不足|资源|风险|反复|延误/],
  },
];

export function getCoordinationTags(item: CoordinationSource): CoordinationTag[] {
  const text = [
    item.priority,
    item.title,
    item.description,
    item.detail,
    item.summary,
    item.evidence,
    item.nextStep,
    item.theme,
    item.department,
    item.source,
    item.owner,
  ].filter(Boolean).join(" ");
  const explicitMultiDept = countDepartments(item.department || "") > 1 || /[\/、]/.test(item.department || "");
  return coordinationRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)) || (rule.type === "cross_department" && explicitMultiDept))
    .map((rule) => ({ type: rule.type, label: rule.label }));
}

export function coordinationSignalsForAttention(queue: AttentionTask[]): CoordinationSignal[] {
  return queue.map((task) => {
    const tags = getCoordinationTags(task);
    return {
      priority: task.priority,
      title: task.title,
      owner: task.owner,
      source: task.source,
      departments: splitDepartments(task.department),
      theme: task.theme,
      tags,
      decision: task.description || task.evidence,
      evidence: task.evidence,
    };
  })
  .filter((signal) =>
    signal.priority === "P0" ||
    signal.tags.some((tag) => tag.type === "cross_department" || tag.type === "boss_decision" || tag.type === "external_dependency"),
  )
  .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.tags.length - a.tags.length)
  .slice(0, 5);
}

export function coordinationSignalsForInsights(insights = kimiInsights) {
  return coordinationSignalsForAttention(attentionQueueForInsights(insights));
}

export const coordinationSignals: CoordinationSignal[] = coordinationSignalsForInsights(kimiInsights);

export function companyMessageDraftForInsights(insights = kimiInsights) {
  if (isMissingPeriodInsights(insights)) return "";
  return insights.companyMessageDraft || appData.groupMessageDraft;
}

export const companyMessageDraft = companyMessageDraftForInsights(kimiInsights);

export function mustReadReportsForInsights(insights = kimiInsights) {
  if (isMissingPeriodInsights(insights)) return [];
  return insights.mustReadReports.length > 0
    ? insights.mustReadReports
    : appData.employeeSummary
      .slice(0, 5)
      .map((employee) => {
        return {
          name: employee.name,
          department: employee.department,
          reason: employee.calibrationNote || employee.growthSummary,
          focus: "阅读完整周报，确认结果、问题和下周承诺是否形成闭环。",
          evidence: employee.growthSummary,
        };
      }) as MustReadReport[];
}

export const mustReadReports = mustReadReportsForInsights(kimiInsights);

export const employeesByName = new Map(appData.employeeSummary.map((employee) => [employee.name, employee]));

export const reportPeriods = appData.periods;

export const currentPeriod = reportPeriods.find((period) => period.id === appData.currentWeekId) ?? reportPeriods.at(-1);

export function weeklyForEmployee(name: string, periodId?: string) {
  return appData.weeklyScores
    .filter((week) => week.name === name)
    .filter((week) => {
      if (!periodId) return true;
      return week.weekId === periodId || inferPeriodId(week.week) === periodId;
    });
}

function chronologicalEmployeeWeeks(name: string) {
  return appData.weeklyScores
    .map((week, index) => ({ week, index }))
    .filter((item) => item.week.name === name)
    .sort((left, right) => {
      const leftDate = left.week.weekStart || left.week.submittedAt || "";
      const rightDate = right.week.weekStart || right.week.submittedAt || "";
      if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      return left.index - right.index;
    })
    .map((item) => item.week);
}

export const closureInsights: EmployeeClosureInsight[] = appData.employeeSummary.map((employee) =>
  buildEmployeeClosureInsight(employee.name, employee.department, chronologicalEmployeeWeeks(employee.name)),
);

export const organizationClosureRadar: OrganizationClosureRadar = buildOrganizationClosureRadar(closureInsights);

export function closureForEmployee(name: string) {
  return closureInsights.find((insight) => insight.name === name);
}

export function weeklyForPeriod(periodId: string) {
  return appData.weeklyScores.filter((week) => week.weekId === periodId || inferPeriodId(week.week) === periodId);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function departmentForEmployee(name: string) {
  return appData.employeeSummary.find((employee) => employee.name === name)?.department || "";
}

function periodLabelForId(periodId: string) {
  return reportPeriods.find((period) => period.id === periodId)?.label || periodId;
}

function selectedPeriodIndex(periodId?: string) {
  const index = reportPeriods.findIndex((period) => period.id === periodId);
  return index >= 0 ? index : reportPeriods.length - 1;
}

function recentPeriodIdsFor(periodId?: string, count = 4) {
  const index = selectedPeriodIndex(periodId);
  return reportPeriods.slice(Math.max(0, index - count + 1), index + 1).map((period) => period.id);
}

function includesDepartment(value: string, department: string) {
  return splitDepartments(value).includes(department);
}

function taskRelatesToDepartment(task: AttentionTask, department: string) {
  const sourceDepartment = departmentForEmployee(task.source);
  const ownerDepartment = departmentForEmployee(task.owner);
  const text = [task.department, task.title, task.description, task.evidence, task.theme, task.source, task.owner].join(" ");
  return (
    includesDepartment(task.department, department) ||
    sourceDepartment === department ||
    ownerDepartment === department ||
    text.includes(department)
  );
}

function taskComesFromOutsideDepartment(task: AttentionTask, department: string) {
  const sourceDepartment = departmentForEmployee(task.source);
  const ownerDepartment = departmentForEmployee(task.owner);
  return Boolean(
    (sourceDepartment && sourceDepartment !== department) ||
      (ownerDepartment && ownerDepartment !== department && !includesDepartment(task.department, department)),
  );
}

function buildDepartmentIssue(task: AttentionTask, department: string, periodId: string): DepartmentMeetingIssue {
  return {
    priority: task.priority,
    title: task.title.replace(/^【周报P\d】/, ""),
    detail: task.description || task.evidence,
    source: task.source,
    owner: task.owner,
    evidence: task.evidence,
    theme: task.theme,
    periodLabel: periodLabelForId(periodId),
    tags: getCoordinationTags(task),
    fromOutside: taskComesFromOutsideDepartment(task, department),
  };
}

function uniqueDepartmentIssues(issues: DepartmentMeetingIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.priority}-${issue.title}-${issue.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function departmentClosureSignals(department: string): DepartmentClosureSignal[] {
  const normalizedDepartment = normalizeDepartmentName(department);
  const insights = closureInsights
    .filter((insight) => normalizeDepartmentName(insight.department) === normalizedDepartment && insight.latestPair)
    .sort((a, b) => b.riskCount - a.riskCount || a.score - b.score);
  const risks = insights.filter((insight) => insight.latestPair?.status === "repeated_loop" || insight.latestPair?.status === "no_evidence");
  const samples = insights
    .filter((insight) => insight.latestPair?.status === "closed" || insight.mechanismCount > 0)
    .sort((a, b) => b.score - a.score);
  return [...risks.slice(0, 2), ...samples.slice(0, 2)]
    .slice(0, 4)
    .map((insight) => ({
      name: insight.name,
      persona: insight.persona,
      score: insight.score,
      status: insight.latestPair!.status,
      signal: insight.latestPair!.signal,
      nextStep: insight.latestPair!.nextStep,
    }));
}

export function departmentMeetingBriefsForPeriod(periodId?: string): DepartmentMeetingBrief[] {
  const index = selectedPeriodIndex(periodId);
  const selectedPeriod = reportPeriods[index];
  const previousPeriod = index > 0 ? reportPeriods[index - 1] : undefined;
  const recentPeriodIds = recentPeriodIdsFor(selectedPeriod?.id || periodId);
  const departments = [...new Set(appData.employeeSummary.map((employee) => employee.department).filter(Boolean))];
  const issuesByPeriod = recentPeriodIds.flatMap((id) =>
    attentionQueueForInsights(insightsForPeriod(id)).map((task) => ({ periodId: id, task })),
  );

  return departments.map((department) => {
    const members = appData.employeeSummary.filter((employee) => employee.department === department);
    const currentRows = selectedPeriod ? weeklyForPeriod(selectedPeriod.id).filter((week) => week.department === department) : [];
    const previousRows = previousPeriod ? weeklyForPeriod(previousPeriod.id).filter((week) => week.department === department) : [];
    const currentAverage = average(currentRows.map((week) => week.total));
    const previousAverage = average(previousRows.map((week) => week.total));
    const deptClosure = closureInsights.filter((insight) => insight.department === department && insight.pairs.length > 0);
    const closureScore = average(deptClosure.map((insight) => insight.score));
    const relatedIssues = uniqueDepartmentIssues(
      issuesByPeriod
        .filter(({ task }) => taskRelatesToDepartment(task, department))
        .map(({ task, periodId: issuePeriodId }) => buildDepartmentIssue(task, department, issuePeriodId))
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    );
    const currentIssues = relatedIssues.filter((issue) => issue.periodLabel === periodLabelForId(selectedPeriod?.id || ""));
    const priorityCounts = {
      P0: relatedIssues.filter((issue) => issue.priority === "P0").length,
      P1: relatedIssues.filter((issue) => issue.priority === "P1").length,
      P2: relatedIssues.filter((issue) => issue.priority === "P2").length,
    };
    const longTermTasks = relatedIssues
      .filter((issue) =>
        issue.priority !== "P0" ||
        issue.tags.some((tag) => tag.type === "process_gap" || tag.type === "support_needed"),
      )
      .sort((a, b) => {
        const aProcess = a.tags.some((tag) => tag.type === "process_gap") ? 0 : 1;
        const bProcess = b.tags.some((tag) => tag.type === "process_gap") ? 0 : 1;
        return aProcess - bProcess || priorityRank(a.priority) - priorityRank(b.priority);
      });

    return {
      department,
      memberCount: members.length,
      currentAverage,
      previousAverage,
      scoreDelta: Math.round((currentAverage - previousAverage) * 10) / 10,
      closureScore,
      priorityCounts,
      urgentIssues: (currentIssues.length > 0 ? currentIssues : relatedIssues).slice(0, 5),
      longTermTasks: longTermTasks.slice(0, 4),
      externalSignals: relatedIssues.filter((issue) => issue.fromOutside).slice(0, 4),
      closureSignals: departmentClosureSignals(department),
      recentPeriodLabels: recentPeriodIds.map(periodLabelForId),
    };
  }).sort((a, b) =>
    b.priorityCounts.P0 - a.priorityCounts.P0 ||
    b.priorityCounts.P1 - a.priorityCounts.P1 ||
    a.closureScore - b.closureScore ||
    b.memberCount - a.memberCount,
  );
}

const monthlyCategories: MonthlyMeetingCategory[] = ["经营问题", "业务问题", "产品问题", "流程问题", "制度问题", "文化问题"];

const monthlyMeetingFlow = [
  {
    time: "09:30-10:00",
    title: "开场与经营总览",
    goal: "先把6月整体经营、环境和团队状态摆到同一张桌面上。",
    output: "确认本次月会只讨论事实、问题、决策和闭环，不做泛泛情绪复盘。",
  },
  {
    time: "10:00-11:10",
    title: "全公司 P0/P1 议题",
    goal: "集中处理需要老板拍板、跨部门拆墙或资源重配的问题。",
    output: "每个 P0/P1 形成负责人、下一步动作、截止时间和升级条件。",
  },
  {
    time: "11:10-12:00",
    title: "经营与业务复盘",
    goal: "复盘收入、客户、渠道、库存、交付和现金链路里的核心阻塞。",
    output: "形成6月经营问题清单与7月防守/增长动作。",
  },
  {
    time: "13:30-14:40",
    title: "产品、流程与制度复盘",
    goal: "把送审、打样、供应商、SOP、绩效、权限和系统问题拆开讨论。",
    output: "输出长期建设任务，不把重复问题继续留在周报里空转。",
  },
  {
    time: "14:40-16:00",
    title: "分部门议题会",
    goal: "按部门看本月最急问题、外部输入、闭环力和长期建设方向。",
    output: "每个部门至少确认3个当月闭环事项和1个机制建设事项。",
  },
  {
    time: "16:00-17:00",
    title: "文化与 AI 协同能力复盘",
    goal: "识别清晰思考者、机制型成员、重复空转和协作孤岛。",
    output: "确认表扬样本、谈话名单、教练式介入对象和AI协同训练方向。",
  },
  {
    time: "17:00-17:30",
    title: "决议、任务和下月追踪",
    goal: "把会议共识落到飞书任务和下月成长OS追踪项。",
    output: "确认老板关注队列、部门任务池和下次月会必须回看的事实证据。",
  },
];

function monthKeyFromDate(value?: string) {
  if (!value || value.length < 7) return "";
  return value.slice(0, 7);
}

function previousMonthKey(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return monthKey;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodMonthKey(period: ReportPeriod) {
  return monthKeyFromDate(period.start) || monthKeyFromDate(period.end);
}

function currentMonthKey() {
  const period = currentPeriod ?? reportPeriods.at(-1);
  return period ? periodMonthKey(period) || monthKeyFromDate(appData.generatedOn) || "2026-06" : "2026-06";
}

function weekMonthKey(week: WeeklyScore) {
  return monthKeyFromDate(week.weekStart) || monthKeyFromDate(week.weekEnd) || monthKeyFromDate(week.submittedAt);
}

function uniqText(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function monthlyTextForTask(task: AttentionTask) {
  return [task.priority, task.theme, task.department, task.title, task.description, task.evidence, task.source, task.owner].join(" ");
}

function classifyMonthlyCategory(task: AttentionTask): MonthlyMeetingCategory {
  const text = monthlyTextForTask(task);
  const scores: Record<MonthlyMeetingCategory, number> = {
    经营问题: 0,
    业务问题: 0,
    产品问题: 0,
    流程问题: 0,
    制度问题: 0,
    文化问题: 0,
  };
  const addScore = (category: MonthlyMeetingCategory, pattern: RegExp, weight: number) => {
    if (pattern.test(text)) scores[category] += weight;
  };

  addScore("制度问题", /劳动合同|续签|招聘|入职|离职|岗位|薪酬|绩效|奖金|审批|制度|权限|考核|HR|人力|组织架构/, 5);
  addScore("产品问题", /产品|新品|IP|授权|送审|打样|模具|包装|设计|供应商|质量|详情页|样品|工艺|丝印|大货|D20|P6|Y8|小黄人|三丽鸥|环球/, 4);
  addScore("经营问题", /毛利|收入|销售额|GMV|现金|财务|库存|回款|对账|账期|发票|税务|预付款|经营|利润|费用|业绩|成本|损失/, 4);
  addScore("流程问题", /流程|机制|SOP|标准|模板|规范|看板|台账|闭环|节点|协同|跨部门|对齐|交接|系统|ERP|自动化|校验码|版本管控/, 3);
  addScore("业务问题", /客户|渠道|订单|海外|国内|销售|推广|达人|POP|交付|转化|报价|市场|流量|平台|商超|KA/, 3);
  addScore("文化问题", /态度|心态|抱怨|主动|协作孤岛|沟通|配合|学习|AI协同|责任心|复盘意识/, 2);

  const categoryPriority: MonthlyMeetingCategory[] = ["制度问题", "产品问题", "经营问题", "流程问题", "业务问题", "文化问题"];
  const ranked = categoryPriority
    .map((category) => ({ category, score: scores[category] }))
    .sort((a, b) => b.score - a.score || categoryPriority.indexOf(a.category) - categoryPriority.indexOf(b.category));
  return ranked[0].score > 0 ? ranked[0].category : "文化问题";
}

function isHrOrPolicyTask(task: AttentionTask) {
  return /劳动合同|续签|招聘|入职|离职|岗位|薪酬|绩效|奖金|审批|权限|人力|HR/.test(monthlyTextForTask(task));
}

function isFinanceTask(task: AttentionTask) {
  return /财务|回款|对账|账期|发票|税务|预付款|费用|现金|利润|毛利|银行账户|凭证/.test(monthlyTextForTask(task));
}

function isProductTask(task: AttentionTask) {
  return /产品|新品|IP|授权|送审|打样|模具|包装|设计|供应商|质量|详情页|样品|工艺|丝印|大货|D20|P6|Y8/.test(monthlyTextForTask(task));
}

function responsibleDepartmentsForTask(task: AttentionTask, category: MonthlyMeetingCategory) {
  const text = monthlyTextForTask(task);
  const sourceDepartment = normalizeDepartmentName(departmentForEmployee(task.source));
  const ownerDepartment = normalizeDepartmentName(departmentForEmployee(task.owner));
  const declaredDepartments = splitDepartments(task.department);
  const mentionedDepartments = departmentsMentionedInText(text);

  if (isHrOrPolicyTask(task)) {
    return uniqText(["人力行政部", sourceDepartment, ownerDepartment].filter(Boolean));
  }
  if (isFinanceTask(task) && /财务|对账|发票|税务|银行账户|凭证|回款/.test(text)) {
    return uniqText(["财务部", ownerDepartment, sourceDepartment].filter(Boolean));
  }
  if (isProductTask(task)) {
    const productSupportDepartments = ["产品企划部", "设计部", "采购跟单", "供应链中心", "国内仓库", "海外仓库"];
    const supportMatches = [...declaredDepartments, ...mentionedDepartments].filter((department) =>
      productSupportDepartments.includes(department),
    );
    return uniqText([sourceDepartment, ownerDepartment, ...supportMatches].filter(Boolean));
  }
  if (category === "业务问题" || category === "经营问题") {
    const businessMatches = [...declaredDepartments, sourceDepartment, ownerDepartment].filter((department) =>
      ["国内事业部", "海外事业部", "连锁商超事业部", "产品推广"].includes(department),
    );
    if (businessMatches.length > 0) return uniqText(businessMatches);
  }
  return uniqText([ownerDepartment, sourceDepartment, ...declaredDepartments].filter(Boolean));
}

function impactedDepartmentsForTask(task: AttentionTask, responsibleDepartments: string[]) {
  const text = monthlyTextForTask(task);
  if (isHrOrPolicyTask(task)) {
    return uniqText(responsibleDepartments.filter(Boolean));
  }
  return uniqText([
    ...responsibleDepartments,
    ...splitDepartments(task.department),
    normalizeDepartmentName(departmentForEmployee(task.source)),
    normalizeDepartmentName(departmentForEmployee(task.owner)),
    ...departmentsMentionedInText(text),
  ].filter(Boolean));
}

function decisionQuestionFor(category: MonthlyMeetingCategory, task: AttentionTask) {
  const subject = task.theme || task.title.replace(/^【周报P\d】/, "");
  const questions: Record<MonthlyMeetingCategory, string> = {
    经营问题: `${subject} 对收入、现金、库存或利润的真实影响是什么，7月由谁负责止血或增长？`,
    业务问题: `${subject} 的客户、渠道或交付链路卡在哪个节点，下一次可验证推进是什么？`,
    产品问题: `${subject} 是否影响上市、送审、品质或供应商稳定性，需要老板拍板还是部门内闭环？`,
    流程问题: `${subject} 是偶发问题还是机制缺口，是否要沉淀为SOP、看板或跨部门规则？`,
    制度问题: `${subject} 背后是权限、责任、激励还是岗位定义问题，需要怎样的制度调整？`,
    文化问题: `${subject} 反映的是态度、协同、主动性还是闭环意识问题，管理上要鼓励谁、校准谁？`,
  };
  return questions[category];
}

function suggestedActionFor(category: MonthlyMeetingCategory, task: AttentionTask) {
  const owner = task.owner || task.source || "待定负责人";
  if (category === "流程问题") return `由 ${owner} 输出可复用机制：节点、负责人、输入输出、异常升级规则。`;
  if (category === "制度问题") return `由 ${owner} 明确制度口径：适用范围、责任边界、奖惩或审批路径。`;
  if (category === "文化问题") return `由 ${owner} 先补一条可验证行动，避免只停留在情绪或判断。`;
  return `由 ${owner} 在会后形成飞书任务：下一步动作、验收指标、截止时间。`;
}

function buildMonthlyAgendaItem(task: AttentionTask, periodId: string, index: number): MonthlyMeetingAgendaItem {
  const category = classifyMonthlyCategory(task);
  const sourceDepartment = normalizeDepartmentName(departmentForEmployee(task.source));
  const responsibleDepartments = responsibleDepartmentsForTask(task, category);
  const impactedDepartments = impactedDepartmentsForTask(task, responsibleDepartments);
  const departments = uniqText([...responsibleDepartments, ...impactedDepartments]);
  const managementBranch = branchForDepartment(responsibleDepartments[0] || sourceDepartment || departments[0] || "").name;
  return {
    id: `${periodId}-${index}-${task.priority}-${task.source}-${task.title}`.replace(/\s+/g, "-"),
    priority: task.priority,
    category,
    title: task.title.replace(/^【周报P\d】/, ""),
    detail: task.description || task.evidence,
    source: task.source,
    sourceDepartment,
    owner: task.owner,
    departments,
    responsibleDepartments,
    impactedDepartments,
    managementBranch,
    periodId,
    periodLabel: periodLabelForId(periodId),
    evidence: task.evidence,
    tags: getCoordinationTags(task),
    decisionQuestion: decisionQuestionFor(category, task),
    suggestedAction: suggestedActionFor(category, task),
  };
}

function uniqueMonthlyAgenda(items: MonthlyMeetingAgendaItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.priority}-${item.category}-${item.title}-${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyPriorityCounts(): Record<Priority, number> {
  return { P0: 0, P1: 0, P2: 0 };
}

function emptyCategoryCounts(): Record<MonthlyMeetingCategory, number> {
  return {
    经营问题: 0,
    业务问题: 0,
    产品问题: 0,
    流程问题: 0,
    制度问题: 0,
    文化问题: 0,
  };
}

function monthLabel(monthKey: string) {
  const month = Number(monthKey.split("-")[1] || 0);
  return month ? `${month}月月度经营复盘` : "月度经营复盘";
}

function itemRelatesToDepartment(item: MonthlyMeetingAgendaItem, department: string) {
  const normalized = normalizeDepartmentName(department);
  return item.responsibleDepartments.includes(normalized);
}

function itemComesFromOutsideDepartment(item: MonthlyMeetingAgendaItem, department: string) {
  const normalized = normalizeDepartmentName(department);
  return !item.responsibleDepartments.includes(normalized) && item.impactedDepartments.includes(normalized);
}

function monthlyMeetingQuestions(department: string, issues: MonthlyMeetingAgendaItem[], closureSignals: DepartmentClosureSignal[], scoreDelta: number) {
  const questions: string[] = [];
  const p0 = issues.find((item) => item.priority === "P0");
  if (p0) questions.push(`${department} 本月最需要先回答：${p0.decisionQuestion}`);
  const processIssue = issues.find((item) => item.category === "流程问题" || item.tags.some((tag) => tag.type === "process_gap"));
  if (processIssue) questions.push(`哪些重复问题要从“个人努力”升级为“部门机制”？先从「${processIssue.title}」开始。`);
  const risk = closureSignals.find((signal) => signal.status === "repeated_loop" || signal.status === "no_evidence");
  if (risk) questions.push(`${risk.name} 的闭环信号偏弱，部门会上要确认是能力问题、资源问题还是目标定义不清。`);
  if (scoreDelta < 0) questions.push(`部门周报质量较上月下降 ${Math.abs(scoreDelta).toFixed(1)} 分，需要确认是业务压力上升，还是复盘质量松动。`);
  if (questions.length === 0) questions.push("本月没有明显 P0，但仍要确认部门是否有可沉淀的模板、SOP 或协作规则。");
  return questions.slice(0, 4);
}

function buildMonthlyDepartmentReview(
  department: string,
  monthKey: string,
  previousKey: string,
  agenda: MonthlyMeetingAgendaItem[],
): MonthlyDepartmentReview {
  const normalizedDepartment = normalizeDepartmentName(department);
  const parentBranch = branchForDepartment(normalizedDepartment).name;
  const members = appData.employeeSummary.filter((employee) => normalizeDepartmentName(employee.department) === normalizedDepartment);
  const currentRows = appData.weeklyScores.filter((week) => normalizeDepartmentName(week.department) === normalizedDepartment && weekMonthKey(week) === monthKey);
  const previousRows = appData.weeklyScores.filter((week) => normalizeDepartmentName(week.department) === normalizedDepartment && weekMonthKey(week) === previousKey);
  const relatedIssues = agenda
    .filter((item) => itemRelatesToDepartment(item, normalizedDepartment))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const externalSignals = agenda
    .filter((item) => itemComesFromOutsideDepartment(item, normalizedDepartment))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const priorityCounts = emptyPriorityCounts();
  const categoryCounts = emptyCategoryCounts();
  relatedIssues.forEach((item) => {
    priorityCounts[item.priority] += 1;
    categoryCounts[item.category] += 1;
  });
  const currentAverage = average(currentRows.map((week) => week.total));
  const previousAverage = average(previousRows.map((week) => week.total));
  const scoreDelta = Math.round((currentAverage - previousAverage) * 10) / 10;
  const deptClosure = closureInsights.filter((insight) => normalizeDepartmentName(insight.department) === normalizedDepartment && insight.pairs.length > 0);
  const closureScore = average(deptClosure.map((insight) => insight.score));
  const longTermTasks = relatedIssues
    .filter((item) =>
      item.priority !== "P0" ||
      item.category === "流程问题" ||
      item.category === "制度问题" ||
      item.category === "文化问题" ||
      item.tags.some((tag) => tag.type === "process_gap" || tag.type === "support_needed"),
    )
    .sort((a, b) => {
      const aProcess = a.category === "流程问题" || a.tags.some((tag) => tag.type === "process_gap") ? 0 : 1;
      const bProcess = b.category === "流程问题" || b.tags.some((tag) => tag.type === "process_gap") ? 0 : 1;
      return aProcess - bProcess || priorityRank(a.priority) - priorityRank(b.priority);
    });
  const closureSignals = departmentClosureSignals(department);

  return {
    department: normalizedDepartment,
    parentBranch,
    memberCount: members.length,
    currentAverage,
    previousAverage,
    scoreDelta,
    closureScore,
    priorityCounts,
    categoryCounts,
    urgentIssues: relatedIssues.slice(0, 5),
    longTermTasks: longTermTasks.slice(0, 4),
    externalSignals: externalSignals.slice(0, 4),
    closureSignals,
    meetingQuestions: monthlyMeetingQuestions(department, relatedIssues, closureSignals, scoreDelta),
  };
}

function buildMonthlyDepartmentGroups(reviews: MonthlyDepartmentReview[]): MonthlyDepartmentGroup[] {
  const reviewsByDepartment = new Map(reviews.map((review) => [review.department, review]));
  const used = new Set<string>();
  const groups = managementBranches.map((branch) => {
    const branchDepartments = uniqText(branch.departments.map(normalizeDepartmentName));
    const branchReviews = branchDepartments
      .map((department) => reviewsByDepartment.get(department))
      .filter(Boolean) as MonthlyDepartmentReview[];
    branchReviews.forEach((review) => used.add(review.department));
    const p0p1Count = branchReviews.reduce((sum, review) => sum + review.priorityCounts.P0 + review.priorityCounts.P1, 0);
    return {
      id: branch.id,
      name: branch.name,
      lead: branch.lead,
      description: branch.description,
      departments: branchDepartments,
      reviewCount: branchReviews.length,
      p0p1Count,
      reviews: branchReviews.sort((a, b) =>
        b.priorityCounts.P0 - a.priorityCounts.P0 ||
        b.priorityCounts.P1 - a.priorityCounts.P1 ||
        b.memberCount - a.memberCount,
      ),
    };
  });
  const ungrouped = reviews.filter((review) => !used.has(review.department));
  if (ungrouped.length > 0) {
    groups.push({
      id: "other",
      name: "其他支持单元",
      lead: "待确认负责人",
      description: "尚未纳入固定管理分支的临时或历史部门名称。",
      departments: ungrouped.map((review) => review.department),
      reviewCount: ungrouped.length,
      p0p1Count: ungrouped.reduce((sum, review) => sum + review.priorityCounts.P0 + review.priorityCounts.P1, 0),
      reviews: ungrouped,
    });
  }
  return groups.filter((group) => group.reviewCount > 0);
}

function monthlyFinanceBridgeFor(monthKey: string): MonthlyFinanceBridge {
  const previousKey = previousMonthKey(monthKey);
  return {
    title: "经营数据补完",
    status: `${monthKey} 财报通常要到月中才能完整；当前月会页先使用成长OS周报、任务、闭环与协同事实。${previousKey} 财报可作为滞后经营参照。`,
    availableFacts: [
      "周报与任务闭环：已覆盖部门问题、P0/P1、负责人、证据和跨周追踪。",
      "组织协同事实：已覆盖360协作评分、闭环力、活跃度和AI追问/评论信号。",
      "周经营线索：已能看到销售目标、库存、送审、交付、回款等员工周报暴露问题。",
    ],
    missingFacts: [
      "6月收入、毛利、费用、现金流、回款、库存水位和订单结构的正式财务口径。",
      "Nexus订单/客户/SKU/发货/回款链路里的事实表与异常清单。",
      "财报与周报问题之间的映射：哪些周报暴露问题真正影响了经营结果。",
    ],
    nexusRequest: [
      "请 Nexus 输出 6月经营事实包：销售额、毛利、费用、回款、库存、订单、客户、渠道、异常与证据链接。",
      "按国内/海外/商超/中后台支持链路拆分，并标记可追责部门与影响部门。",
      "把财报滞后数据作为月会二次校准，不覆盖周报事实，而是校验哪些问题真的造成经营影响。",
    ],
  };
}

export function monthlyMeetingBriefForMonth(monthKey = currentMonthKey()): MonthlyMeetingBrief {
  const previousKey = previousMonthKey(monthKey);
  const contextPeriodIds = reportPeriods
    .filter((period) => periodMonthKey(period) === monthKey || periodMonthKey(period) === previousKey)
    .map((period) => period.id);
  const targetPeriodIds = reportPeriods.filter((period) => periodMonthKey(period) === monthKey).map((period) => period.id);
  const targetRows = appData.weeklyScores.filter((week) => weekMonthKey(week) === monthKey);
  const agenda = uniqueMonthlyAgenda(
    contextPeriodIds.flatMap((periodId) =>
      attentionQueueForInsights(insightsForPeriod(periodId)).map((task, index) => buildMonthlyAgendaItem(task, periodId, index)),
    ),
  ).sort((a, b) => {
    const aTarget = targetPeriodIds.includes(a.periodId) ? 0 : 1;
    const bTarget = targetPeriodIds.includes(b.periodId) ? 0 : 1;
    return priorityRank(a.priority) - priorityRank(b.priority) || aTarget - bTarget || monthlyCategories.indexOf(a.category) - monthlyCategories.indexOf(b.category);
  });
  const priorityCounts = emptyPriorityCounts();
  const categoryCounts = emptyCategoryCounts();
  agenda.forEach((item) => {
    priorityCounts[item.priority] += 1;
    categoryCounts[item.category] += 1;
  });
  const departments = [...new Set(appData.employeeSummary.map((employee) => employee.department).filter(Boolean))];
  const departmentReviews = departments
    .map((department) => buildMonthlyDepartmentReview(department, monthKey, previousKey, agenda))
    .sort((a, b) =>
      b.priorityCounts.P0 - a.priorityCounts.P0 ||
      b.priorityCounts.P1 - a.priorityCounts.P1 ||
      a.closureScore - b.closureScore ||
      b.memberCount - a.memberCount,
    );
  const departmentGroups = buildMonthlyDepartmentGroups(departmentReviews);
  const summaryFromInsights = uniqText(
    targetPeriodIds.flatMap((periodId) => insightsForPeriod(periodId).executiveSummary.slice(0, 2)),
  );
  const topCategories = monthlyCategories
    .map((category) => ({ category, count: categoryCounts[category] }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((item) => `${item.category}出现 ${item.count} 个可讨论议题`);
  const executiveSummary = [
    `${monthLabel(monthKey)}覆盖 ${targetPeriodIds.length} 个周报周期、${targetRows.length} 条个人周报，跨月追踪窗口包含 ${previousKey} 与 ${monthKey}。`,
    ...topCategories,
    ...summaryFromInsights,
  ].slice(0, 7);

  return {
    monthLabel: monthLabel(monthKey),
    windowLabel: `${previousKey} 跨月追踪 + ${monthKey} 主复盘`,
    generatedOn: appData.generatedOn,
    totalReports: targetRows.length,
    submittedPeople: new Set(targetRows.map((week) => week.name)).size,
    activeDepartments: departments.length,
    priorityCounts,
    categoryCounts,
    executiveSummary,
    financeBridge: monthlyFinanceBridgeFor(monthKey),
    companyAgenda: agenda,
    departmentReviews,
    departmentGroups,
    factJumps: agenda.slice(0, 12),
    flow: monthlyMeetingFlow,
  };
}

export function tasksForEmployee(name: string) {
  return appData.employeeTasks.filter((task) => task.source === name || task.assignee === name);
}

export function feedbackForEmployee(name: string) {
  return appData.feedbackDrafts.find((feedback) => feedback.name === name);
}

export function insightForEmployee(name: string, periodId?: string) {
  return insightsForPeriod(periodId).employeeInsights.find((insight) => insight.name === name);
}

export function kimiTaskCandidatesForEmployee(name: string, periodId?: string) {
  return insightForEmployee(name, periodId)?.taskCandidates ?? [];
}

export function priorityRank(priority: string) {
  return priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
}

function splitDepartments(value: string) {
  return value
    .split(/[\/、,，]/)
    .map((item) => item.trim())
    .map(normalizeDepartmentName)
    .filter(Boolean);
}

function countDepartments(value: string) {
  return splitDepartments(value).length;
}
