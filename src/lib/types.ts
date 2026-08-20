import type { LucideIcon } from "lucide-react";

export type PageKey = "dashboard" | "monthly" | "scores" | "tasks" | "growth" | "trends" | "settings";

export type Priority = "P0" | "P1" | "P2";

export type EmployeeLevel = "A" | "A-" | "B+" | "B" | "C";

export interface NavItem {
  key: PageKey;
  label: string;
  icon: LucideIcon;
}

export interface EmployeeSummary {
  name: string;
  department: string;
  openId: string;
  email: string;
  reportCount: number;
  onTimeCount: number;
  lateCount: number;
  averageScore: number;
  level: EmployeeLevel;
  autoLevel: EmployeeLevel;
  trend: number;
  weakProblemWeeks: number;
  calibrationNote: string;
  growthSummary: string;
}

export interface VisibleEmployee {
  openId: string;
  name: string;
  department: string;
  email?: string;
}

export interface UserAccess {
  role: "boss" | "external_boss_view" | "member" | string;
  bossView: boolean;
  externalView: boolean;
  canViewBossDashboard: boolean;
  canViewSettings: boolean;
  canManageScoring360: boolean;
  canManagePersonnel: boolean;
  currentEmployee?: VisibleEmployee | null;
  visibilityMode: "all_company" | "self_department_and_reports" | "self_only" | string;
  visibleEmployees: VisibleEmployee[];
  visibleOpenIds: string[];
  visibleNames: string[];
  visibleDepartments: string[];
}

export interface WeeklyScore {
  name: string;
  department: string;
  weekId?: string;
  week: string;
  weekStart?: string;
  weekEnd?: string;
  submittedAt?: string;
  sourceReportId?: string;
  status: string;
  total: number;
  level: EmployeeLevel;
  resultScore: number;
  problemScore: number;
  reflectionScore: number;
  planScore: number;
  punctualityScore: number;
  numberCount: number;
  textLength: number;
  resultSummary: string;
  problemSummary: string;
  nextPlanSummary: string;
  reflectionSummary?: string;
  files?: string;
  commentCount?: number;
  likeCount?: number;
  readCount?: number;
  unreadCount?: number;
}

export interface ReportPeriod {
  id: string;
  label: string;
  range: string;
  start?: string;
  end?: string;
  submittedCount: number;
  exemptPeople: string[];
  status?: string;
}

export interface AttentionTask {
  priority: Priority;
  source: string;
  department: string;
  theme: string;
  status?: string;
  title: string;
  description: string;
  owner: string;
  ownerOpenId: string;
  dueDate: string;
  evidence: string;
}

export type CoordinationTagType =
  | "cross_department"
  | "boss_decision"
  | "external_dependency"
  | "process_gap"
  | "support_needed";

export interface CoordinationTag {
  type: CoordinationTagType;
  label: string;
}

export interface CoordinationSignal {
  priority: Priority;
  title: string;
  owner: string;
  source: string;
  departments: string[];
  theme: string;
  tags: CoordinationTag[];
  decision: string;
  evidence: string;
}

export type ClosureStatus = "closed" | "partial" | "explained_delay" | "no_evidence" | "repeated_loop";

export type ClosurePersona = "机制型成员" | "闭环型成员" | "执行型成员" | "漂浮型成员" | "抱怨型成员";

export interface ClosurePair {
  id: string;
  previousWeek: string;
  currentWeek: string;
  previousPlan: string;
  currentEvidence: string;
  status: ClosureStatus;
  score: number;
  signal: string;
  nextStep: string;
  mechanismSignal: boolean;
  aiThinkingSignal: boolean;
}

export interface EmployeeClosureInsight {
  name: string;
  department: string;
  score: number;
  persona: ClosurePersona;
  closedCount: number;
  partialCount: number;
  riskCount: number;
  repeatedCount: number;
  mechanismCount: number;
  aiThinkingScore: number;
  latestPair?: ClosurePair;
  pairs: ClosurePair[];
  summary: string;
}

export interface OrganizationClosureRadar {
  averageScore: number;
  leaders: EmployeeClosureInsight[];
  risks: EmployeeClosureInsight[];
  mechanismSamples: EmployeeClosureInsight[];
  repeatedIssues: EmployeeClosureInsight[];
  clearThinkers: EmployeeClosureInsight[];
}

export interface DepartmentMeetingIssue {
  priority: Priority;
  title: string;
  detail: string;
  source: string;
  owner: string;
  evidence: string;
  theme: string;
  periodLabel: string;
  tags: CoordinationTag[];
  fromOutside: boolean;
}

export interface DepartmentClosureSignal {
  name: string;
  persona: ClosurePersona;
  score: number;
  status: ClosureStatus;
  signal: string;
  nextStep: string;
}

export interface DepartmentMeetingBrief {
  department: string;
  memberCount: number;
  currentAverage: number;
  previousAverage: number;
  scoreDelta: number;
  closureScore: number;
  priorityCounts: Record<Priority, number>;
  urgentIssues: DepartmentMeetingIssue[];
  longTermTasks: DepartmentMeetingIssue[];
  externalSignals: DepartmentMeetingIssue[];
  closureSignals: DepartmentClosureSignal[];
  recentPeriodLabels: string[];
}

export type MonthlyMeetingCategory = "经营问题" | "业务问题" | "产品问题" | "流程问题" | "制度问题" | "文化问题";

export interface MonthlyMeetingAgendaItem {
  id: string;
  priority: Priority;
  category: MonthlyMeetingCategory;
  title: string;
  detail: string;
  source: string;
  sourceDepartment: string;
  owner: string;
  departments: string[];
  responsibleDepartments: string[];
  impactedDepartments: string[];
  managementBranch: string;
  periodId: string;
  periodLabel: string;
  evidence: string;
  tags: CoordinationTag[];
  decisionQuestion: string;
  suggestedAction: string;
}

export interface MonthlyDepartmentReview {
  department: string;
  parentBranch: string;
  memberCount: number;
  currentAverage: number;
  previousAverage: number;
  scoreDelta: number;
  closureScore: number;
  priorityCounts: Record<Priority, number>;
  categoryCounts: Record<MonthlyMeetingCategory, number>;
  urgentIssues: MonthlyMeetingAgendaItem[];
  longTermTasks: MonthlyMeetingAgendaItem[];
  externalSignals: MonthlyMeetingAgendaItem[];
  closureSignals: DepartmentClosureSignal[];
  meetingQuestions: string[];
}

export interface MonthlyDepartmentGroup {
  id: string;
  name: string;
  lead: string;
  description: string;
  departments: string[];
  reviewCount: number;
  p0p1Count: number;
  reviews: MonthlyDepartmentReview[];
}

export interface MonthlyFinanceBridge {
  title: string;
  status: string;
  availableFacts: string[];
  missingFacts: string[];
  nexusRequest: string[];
}

export interface MonthlyMeetingFlowItem {
  time: string;
  title: string;
  goal: string;
  output: string;
}

export interface MonthlyMeetingPeriodOption {
  monthKey: string;
  label: string;
  meetingDate: string;
  status: "archived" | "scheduled" | "draft";
}

export interface MonthlyMeetingComparison {
  previousMonthKey: string;
  previousMonthLabel: string;
  reportDelta: number;
  scoreDelta: number;
  priorityDelta: Record<Priority, number>;
  improvements: string[];
  recurringIssues: string[];
  newRisks: string[];
}

export interface MonthlyMeetingBrief {
  monthKey: string;
  monthLabel: string;
  meetingDate: string;
  archiveStatus: "archived" | "scheduled" | "draft";
  windowLabel: string;
  generatedOn: string;
  model: string;
  totalReports: number;
  submittedPeople: number;
  activeDepartments: number;
  averageScore: number;
  priorityCounts: Record<Priority, number>;
  categoryCounts: Record<MonthlyMeetingCategory, number>;
  comparison: MonthlyMeetingComparison;
  executiveSummary: string[];
  financeBridge: MonthlyFinanceBridge;
  companyAgenda: MonthlyMeetingAgendaItem[];
  departmentReviews: MonthlyDepartmentReview[];
  departmentGroups: MonthlyDepartmentGroup[];
  factJumps: MonthlyMeetingAgendaItem[];
  flow: MonthlyMeetingFlowItem[];
}

export interface EmployeeTask {
  priority: Priority;
  source: string;
  department: string;
  assigneeOpenId: string;
  theme: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: string;
  evidence: string;
}

export interface FeedbackDraft {
  name: string;
  department: string;
  openId: string;
  delivery: string;
  body: string;
}

export interface AppData {
  generatedOn: string;
  currentWeekId: string;
  currentWeekLabel: string;
  currentWeekRange: string;
  submittedCount: number;
  exemptCount: number;
  exemptPeople: string[];
  periods: ReportPeriod[];
  peopleCount: number;
  weeklyRecordCount: number;
  companyChatName: string;
  companyChatId: string;
  employeeSummary: EmployeeSummary[];
  weeklyScores: WeeklyScore[];
  bossTasks: AttentionTask[];
  employeeTasks: EmployeeTask[];
  feedbackDrafts: FeedbackDraft[];
  groupMessageDraft: string;
  classDistribution: Record<string, number>;
  departmentScores: Record<string, number>;
}

export interface ThemeQuote {
  author: string;
  department: string;
  week: string;
  text: string;
}

export interface ThemeInsight {
  label: string;
  value: number;
  severity: Priority;
  summary: string;
  detail: string;
  quotes: ThemeQuote[];
  nextStep: string;
}

export interface MustReadReport {
  name: string;
  department: string;
  reason: string;
  focus: string;
  evidence: string;
}

export interface CollectiveFocus {
  title: string;
  detail: string;
}

export interface KimiTaskCandidate {
  id: string;
  priority: Priority;
  source: string;
  department: string;
  owner: string;
  ownerOpenId?: string;
  title: string;
  description: string;
  dueDate: string;
  metric: string;
  evidence: string;
  aiIntent: string;
  firstStep: string;
  supportNeeded: string;
  contextNeed: string;
}

export interface EmployeeInsight {
  name: string;
  coachSummary: string;
  coachQuestions: string[];
  taskCandidates: KimiTaskCandidate[];
}

export interface FeishuTaskPlan {
  tasklistName: string;
  requiredScopes: string[];
  creationMode: string;
}

export interface KimiInsights {
  meta: {
    provider: string;
    model: string;
    generatedAt: string;
    source: string;
  };
  executiveSummary: string[];
  collectiveFocus: CollectiveFocus[];
  companyMessageDraft: string;
  attentionQueue: AttentionTask[];
  mustReadReports: MustReadReport[];
  themes: ThemeInsight[];
  employeeInsights: EmployeeInsight[];
  feishuTaskPlan: FeishuTaskPlan;
}

export type ScoringCycleMode = "weekly" | "monthly" | string;

export interface Scoring360Cycle {
  id: string;
  label: string;
  mode: ScoringCycleMode;
  startDate: string;
  endDate: string;
  launchAt?: string;
  dueAt?: string;
  followupAfterAt?: string;
  historicalWeight?: number;
  currentWeight?: number;
  status: string;
  totalEmployees: number;
  totalEvaluees: number;
  totalAssignments: number;
  totalResponses: number;
  progressPct: number;
  averageScore: number;
}

export interface Scoring360Assignment {
  id: string;
  cycleId: string;
  evaluee: string;
  evaluator: string;
}

export interface Scoring360Response {
  id: string;
  assignmentId: string;
  cycleId: string;
  evaluee: string;
  evaluator: string;
  score: number;
  submittedAt: string;
}

export interface Scoring360Result {
  name: string;
  expected: number;
  submitted: number;
  completionRate: number;
  averageScore: number | null;
  previousScore?: number | null;
  rollingScore?: number | null;
  historicalWeight?: number;
  currentWeight?: number;
  level: string;
  minScore: number | null;
  maxScore: number | null;
  evaluators: string[];
}

export interface Scoring360Data {
  meta: {
    importedAt: string;
    source?: Record<string, string>;
  };
  cycles: Scoring360Cycle[];
  employees: string[];
  assignments: Scoring360Assignment[];
  responses: Scoring360Response[];
  results: Scoring360Result[];
}
