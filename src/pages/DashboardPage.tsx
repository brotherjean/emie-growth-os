import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  ListChecks,
  Network,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PriorityBadge } from "../components/PriorityBadge";
import { HorizontalBars } from "../components/SimpleCharts";
import {
  appData,
  currentScoring360Cycle,
  attentionQueueForInsights,
  companyMessageDraftForInsights,
  coordinationSignalsForInsights,
  departmentMeetingBriefsForPeriod,
  getCoordinationTags,
  hasInsightsForPeriod,
  insightsForPeriod,
  mustReadReportsForInsights,
  organizationClosureRadar,
  priorityRank,
  reportPeriods,
  scoring360,
  weeklyForPeriod,
} from "../lib/data";
import { cnNumber, truncate } from "../lib/format";
import type { Scoring360Result } from "../lib/types";

interface DashboardPageProps {
  selectedPeriodId: string;
  onOpenEmployee: (name: string) => void;
  externalView?: boolean;
}

type DashboardWorkspaceTab = "decisions" | "organization" | "departments";

function collaborationSignal(result: Scoring360Result) {
  const average = result.averageScore ?? 0;
  if (average >= 95) return "强协同样本";
  if (average >= 90) return "稳定贡献者";
  if (average >= 85) return "协同良好";
  if (average >= 80) return "需要观察";
  return "孤岛风险";
}

export function DashboardPage({ selectedPeriodId, onOpenEmployee, externalView = false }: DashboardPageProps) {
  const selectedPeriod = reportPeriods.find((period) => period.id === selectedPeriodId) ?? reportPeriods.at(-1);
  const periodInsights = insightsForPeriod(selectedPeriod?.id || selectedPeriodId);
  const hasPeriodInsights = hasInsightsForPeriod(selectedPeriod?.id || selectedPeriodId);
  const periodAttentionQueue = attentionQueueForInsights(periodInsights);
  const periodCoordinationSignals = coordinationSignalsForInsights(periodInsights);
  const periodCompanyMessageDraft = companyMessageDraftForInsights(periodInsights);
  const periodMustReadReports = mustReadReportsForInsights(periodInsights);
  const departmentBriefs = useMemo(
    () => departmentMeetingBriefsForPeriod(selectedPeriod?.id || selectedPeriodId),
    [selectedPeriod?.id, selectedPeriodId],
  );
  const [companyMessageText, setCompanyMessageText] = useState(periodCompanyMessageDraft);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendNote, setSendNote] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<DashboardWorkspaceTab>("decisions");
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [showAllMustRead, setShowAllMustRead] = useState(false);
  const selectedWeeklyRows = selectedPeriod ? weeklyForPeriod(selectedPeriod.id) : [];
  const submittedCount = selectedPeriod?.submittedCount || appData.submittedCount || selectedWeeklyRows.length;
  const exemptCount = selectedPeriod?.exemptPeople?.length || appData.exemptCount;
  const peopleCount = Math.max(appData.peopleCount, submittedCount + exemptCount);
  const p0Count = periodAttentionQueue.filter((task) => task.priority === "P0").length;
  const coordinationCount = periodCoordinationSignals.filter((signal) => signal.priority === "P0").length;
  const praiseCount = selectedWeeklyRows.filter((week) => week.level === "A" || week.level === "A-").length;
  const mustRead = periodMustReadReports;
  const departmentBars = Object.entries(
    selectedWeeklyRows.reduce<Record<string, { total: number; count: number }>>((groups, week) => {
      const key = week.department || "未归类";
      const current = groups[key] || { total: 0, count: 0 };
      groups[key] = { total: current.total + week.total, count: current.count + 1 };
      return groups;
    }, {}),
  )
    .map(([label, group]) => ({ label, value: Math.round((group.total / Math.max(1, group.count)) * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const collaborationResults = scoring360.results.filter((result) => result.averageScore !== null);
  const collaborationLeaders = [...collaborationResults]
    .sort((a, b) => Number(b.averageScore || 0) - Number(a.averageScore || 0))
    .slice(0, 5);
  const collaborationRisks = [...collaborationResults]
    .sort((a, b) => Number(a.averageScore || 0) - Number(b.averageScore || 0))
    .slice(0, 5);
  const collaborationAverage = collaborationResults.length
    ? collaborationResults.reduce((sum, result) => sum + Number(result.averageScore || 0), 0) / collaborationResults.length
    : 0;
  const executiveSummary = periodInsights.executiveSummary.length > 0
    ? periodInsights.executiveSummary
    : !hasPeriodInsights && selectedPeriod
      ? [
          `${selectedPeriod.label} 暂无独立 AI 分析快照。本页先展示该周期的提交统计与原始周报记录，不再混用最新周分析内容。`,
        ]
    : [
        "海外授权卡点仍是收入风险。土耳其/亚马逊授权跨周出现，已经影响客户转化节奏，需要老板直接推动外部期限。",
        "送审流程正在成为产品上市瓶颈。返工、丝印五官、过审节点不确定反复出现，应该升级成可视化看板与 SOP。",
        "AI 增效已经进入推广期。设计、IT、人力多部门都在推进，下一步要量化为节省工时、减少返工和提升交付速度。",
        "客户开发需要从动作量转向转化漏斗。海外客户开发动作不少，但回复、意向、报价、成交的漏斗还不清楚。",
      ];
  const collectiveFocus = periodInsights.collectiveFocus.length > 0
    ? periodInsights.collectiveFocus
    : !hasPeriodInsights && selectedPeriod
      ? [
          {
            title: "历史快照缺失",
            detail: "该周期只保留了结构化周报与统计数据，未保留可切换的 Kimi 总览/任务/必读周报快照。",
          },
        ]
    : [
        { title: "授权节点", detail: "所有外部授权必须有负责人、截止日和下一次升级时间。" },
        { title: "送审返工", detail: "把返工原因沉淀成 SOP，不再依赖单人经验。" },
        { title: "AI 工具落地", detail: "从“用了工具”升级到“节省了多少时间、减少了多少返工”。" },
        { title: "客户开发", detail: "下周按客户漏斗汇报，不只汇报动作量。" },
      ];
  const activeDepartmentBrief =
    departmentBriefs.find((brief) => brief.department === selectedDepartment) ?? departmentBriefs[0];

  useEffect(() => {
    setCompanyMessageText(periodCompanyMessageDraft);
    setSendStatus("idle");
    setSendNote("");
  }, [selectedPeriodId, periodCompanyMessageDraft]);

  useEffect(() => {
    if (departmentBriefs.length === 0) return;
    if (!departmentBriefs.some((brief) => brief.department === selectedDepartment)) {
      setSelectedDepartment(departmentBriefs[0].department);
    }
  }, [departmentBriefs, selectedDepartment]);

  async function sendCompanyMessage() {
    if (externalView) return;
    const message = companyMessageText.trim();
    if (!message || sendStatus === "sending") return;
    setSendStatus("sending");
    setSendNote("正在通过飞书 CLI 发送到 EMIE 亿觅互相夸夸全员群...");
    try {
      const response = await fetch("/api/company-message/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodId: selectedPeriod?.id || selectedPeriodId,
          periodLabel: selectedPeriod?.label || "",
          originalDraft: periodCompanyMessageDraft,
          message,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.detail || result.error || "send_failed");
      setSendStatus("sent");
      setSendNote(`已发送到 ${result.chatName || "公司大群"}，消息 ID：${result.messageId || "已记录"}`);
    } catch (error) {
      setSendStatus("error");
      setSendNote(`发送失败：${error instanceof Error ? error.message : "请检查服务器飞书 CLI 用户授权"}`);
    }
  }

  const heroLine = executiveSummary[0] || "本周公司整体运转平稳，暂无需要老板立即介入的风险。";

  return (
    <div className="v2-page v2-page-wide v3-workbench-page">
      <section className="v2-dash-hero v3-dashboard-band">
        <div className="v2-dash-hero-head">
          <div>
            <p className="v2-dash-hero-title">{selectedPeriod?.label || appData.currentWeekLabel} · 公司本周雷达</p>
            <h2 className="v2-dash-hero-line">{heroLine}</h2>
          </div>
        </div>
        <div className="v2-dash-stats">
          <div className="v2-dash-stat">
            <span className="v2-dash-stat-num">
              {submittedCount}/{peopleCount}
            </span>
            <span className="v2-dash-stat-label">周报提交{exemptCount ? ` · ${exemptCount} 人豁免` : " · 全员准时"}</span>
          </div>
          <div className="v2-dash-stat">
            <span className={`v2-dash-stat-num ${p0Count > 0 ? "is-alert" : ""}`}>{p0Count}</span>
            <span className="v2-dash-stat-label">P0 必须介入</span>
          </div>
          <div className="v2-dash-stat">
            <span className={`v2-dash-stat-num ${coordinationCount > 0 ? "is-alert" : ""}`}>{coordinationCount}</span>
            <span className="v2-dash-stat-label">跨部门协调</span>
          </div>
          <div className="v2-dash-stat">
            <span className="v2-dash-stat-num is-good">{praiseCount}</span>
            <span className="v2-dash-stat-label">正向样本 · 适合公开表扬</span>
          </div>
        </div>
      </section>

      <nav className="v3-workspace-tabs" aria-label="老板驾驶舱工作区">
        {([
          ["decisions", "本周决策", AlertTriangle],
          ["organization", "组织状态", CheckCircle2],
          ["departments", "部门会议", Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            className={activeWorkspaceTab === key ? "is-active" : ""}
            type="button"
            key={key}
            onClick={() => setActiveWorkspaceTab(key)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="v2-dash-layout">
        <div className="v2-dash-main">
          {activeWorkspaceTab === "decisions" ? <section className="v2-card v3-workspace-panel">
            <div className="v2-card-head">
              <div>
                <span className="v2-eyebrow">
                  <AlertTriangle size={13} />
                  决策区
                </span>
                <h3 className="v2-card-title">需要你拍板的事</h3>
                <p className="v2-card-sub">员工单人推不动、需要拆墙、拍板或调资源的事项，按优先级排列。</p>
              </div>
              {periodAttentionQueue.length > 4 ? (
                <button className="v2-btn v2-btn-ghost" type="button" onClick={() => setShowAllDecisions((value) => !value)}>
                  {showAllDecisions ? "收起" : `查看全部 ${periodAttentionQueue.length} 项`}
                </button>
              ) : null}
            </div>
            {periodAttentionQueue.length === 0 && periodCoordinationSignals.length === 0 ? (
              <p className="v2-empty-hint">本周没有需要你介入的事项，组织在自己闭环。</p>
            ) : null}
            {periodAttentionQueue
              .slice()
              .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
              .slice(0, showAllDecisions ? undefined : 4)
              .map((task) => {
                const tags = getCoordinationTags(task);
                return (
                  <div className="v2-decide-row" key={task.title}>
                    <div className="v2-decide-main">
                      <div className="v2-decide-title">
                        <PriorityBadge priority={task.priority} />
                        {task.title.replace(/^【周报P\d】/, "")}
                      </div>
                      <p>{truncate(task.evidence, 96)}</p>
                      <div className="v2-decide-meta">
                        <span>来源：{task.source}</span>
                        {tags.slice(0, 2).map((tag) => (
                          <span className={`coordination-tag tag-${tag.type}`} key={`${task.title}-${tag.type}`}>
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            {periodCoordinationSignals.length > 0 ? (
              <>
                <p className="v2-card-sub v2-section-gap">跨部门协调台 · 靠单人努力难以推动的事项</p>
                {periodCoordinationSignals.slice(0, 3).map((signal) => (
                  <div className="v2-decide-row" key={`${signal.priority}-${signal.title}`}>
                    <div className="v2-decide-main">
                      <div className="v2-decide-title">
                        <PriorityBadge priority={signal.priority} />
                        {signal.title.replace(/^【周报P\d】/, "")}
                      </div>
                      <p>{truncate(signal.decision, 96)}</p>
                      <div className="v2-decide-meta">
                        <span>牵头：{signal.owner || "待定"}</span>
                        <span>{signal.departments.length > 0 ? signal.departments.join(" / ") : signal.theme}</span>
                        {signal.tags.slice(0, 3).map((tag) => (
                          <span className={`coordination-tag tag-${tag.type}`} key={`${signal.title}-${tag.type}`}>
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </section> : null}

          {activeWorkspaceTab === "organization" ? <section className="v2-card v3-workspace-panel">
            <div className="v2-card-head">
              <div>
                <span className="v2-eyebrow">
                  <FileText size={13} />
                  AI 简报
                </span>
                <h3 className="v2-card-title">公司本周整体情况</h3>
              </div>
            </div>
            {executiveSummary.slice(0, 5).map((item, index) => {
              const [lead, ...rest] = item.split(/[。:：]/);
              return (
                <div className="v2-brief-item" key={item}>
                  <span className="v2-brief-index">{index + 1}</span>
                  <p>
                    <strong>{lead}。</strong>
                    {rest.join("。")}
                  </p>
                </div>
              );
            })}
            <div className="health-chips">
              {departmentBars.slice(0, 4).map((department) => (
                <span className={`chip ${department.value >= 80 ? "is-good" : "is-watch"}`} key={department.label}>
                  {department.label} {department.value}
                </span>
              ))}
            </div>
            {collectiveFocus.length > 0 ? (
              <>
                <p className="v2-card-sub v2-section-gap">需要集体关注的细节</p>
                {collectiveFocus.slice(0, 4).map((item) => (
                  <div className="v2-brief-item" key={`${item.title}-${item.detail}`}>
                    <span className="v2-brief-index">
                      <ListChecks size={13} />
                    </span>
                    <p>
                      <strong>{item.title}。</strong>
                      {item.detail}
                    </p>
                  </div>
                ))}
              </>
            ) : null}
          </section> : null}

          {activeWorkspaceTab === "departments" && activeDepartmentBrief ? (
            <section className="v2-card v3-workspace-panel">
              <div className="v2-card-head">
                <div>
                  <span className="v2-eyebrow">
                    <Users size={13} />
                    部门会议雷达
                  </span>
                  <h3 className="v2-card-title">带着议题去开部门会</h3>
                  <p className="v2-card-sub">
                    分析窗口：{activeDepartmentBrief.recentPeriodLabels.join("、")}。先定议题，再把反复出现的问题沉淀为长期机制。
                  </p>
                </div>
                <select
                  className="v2-select"
                  value={activeDepartmentBrief.department}
                  onChange={(event) => setSelectedDepartment(event.target.value)}
                  aria-label="选择部门会议视角"
                >
                  {departmentBriefs.map((brief) => (
                    <option key={brief.department} value={brief.department}>
                      {brief.department}
                    </option>
                  ))}
                </select>
              </div>
              <div className="v2-metric-row">
                <div className="v2-profile-block">
                  <span>部门成员</span>
                  <div className="v2-profile-360">
                    <strong>{activeDepartmentBrief.memberCount}</strong>
                    <span>人</span>
                  </div>
                </div>
                <div className="v2-profile-block">
                  <span>本周均分</span>
                  <div className="v2-profile-360">
                    <strong>{activeDepartmentBrief.currentAverage || "-"}</strong>
                    <span className={activeDepartmentBrief.scoreDelta >= 0 ? "is-up" : "is-down"}>
                      {activeDepartmentBrief.scoreDelta >= 0 ? "+" : ""}
                      {activeDepartmentBrief.scoreDelta || 0}
                    </span>
                  </div>
                </div>
                <div className="v2-profile-block">
                  <span>闭环力</span>
                  <div className="v2-profile-360">
                    <strong>{activeDepartmentBrief.closureScore || "-"}</strong>
                  </div>
                </div>
                <div className="v2-profile-block">
                  <span>P0 / P1 / P2</span>
                  <div className="v2-profile-360">
                    <strong>
                      {activeDepartmentBrief.priorityCounts.P0}/{activeDepartmentBrief.priorityCounts.P1}/{activeDepartmentBrief.priorityCounts.P2}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="v2-grid-2 v2-section-gap">
                <div>
                  <p className="v2-card-sub">本周会议议题</p>
                  {activeDepartmentBrief.urgentIssues.length > 0 ? (
                    activeDepartmentBrief.urgentIssues.slice(0, 3).map((issue) => (
                      <div className="v2-decide-row" key={`${issue.priority}-${issue.title}-${issue.source}`}>
                        <div className="v2-decide-main">
                          <div className="v2-decide-title">
                            <PriorityBadge priority={issue.priority} />
                            {issue.title}
                          </div>
                          <p>{truncate(issue.detail, 96)}</p>
                          <div className="v2-decide-meta">
                            <span>{issue.periodLabel}</span>
                            <span>牵头：{issue.owner || "待定"}</span>
                            {issue.fromOutside ? <span>外部输入</span> : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="v2-empty-hint">本周期暂无需要会议优先处理的议题。</p>
                  )}
                </div>
                <div>
                  <p className="v2-card-sub">重要但不紧急</p>
                  {activeDepartmentBrief.longTermTasks.length > 0 ? (
                    activeDepartmentBrief.longTermTasks.slice(0, 2).map((issue) => (
                      <div className="v2-decide-row" key={`${issue.title}-${issue.theme}`}>
                        <div className="v2-decide-main">
                          <div className="v2-decide-title">
                            <PriorityBadge priority={issue.priority} />
                            {issue.theme || issue.title}
                          </div>
                          <p>{truncate(issue.detail, 88)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="v2-empty-hint">暂无明显长期机制建设项。</p>
                  )}
                  <p className="v2-card-sub v2-section-gap">跨周闭环观察</p>
                  {activeDepartmentBrief.closureSignals.length > 0 ? (
                    activeDepartmentBrief.closureSignals.slice(0, 3).map((signal) => (
                      <button className="v2-person-row" type="button" key={`${signal.name}-${signal.status}`} onClick={() => onOpenEmployee(signal.name)}>
                        <span>
                          <span className="v2-person-name">{signal.name}</span>
                          <span className="v2-person-sub">
                            {signal.persona} · {signal.status}
                          </span>
                        </span>
                        <em>{signal.score}</em>
                      </button>
                    ))
                  ) : (
                    <p className="v2-empty-hint">暂无足够跨周闭环样本。</p>
                  )}
                </div>
              </div>
              {activeDepartmentBrief.externalSignals.length > 0 ? (
                <p className="v2-card-sub v2-section-gap">
                  其他部门输入：
                  {activeDepartmentBrief.externalSignals.slice(0, 3).map((issue) => `${issue.source}：${truncate(issue.title, 30)}`).join("；")}
                </p>
              ) : null}
            </section>
          ) : null}

          {activeWorkspaceTab === "organization" ? <div className="v2-grid-2">
            <section className="v2-card">
              <div className="v2-card-head">
                <div>
                  <span className="v2-eyebrow">
                    <CheckCircle2 size={13} />
                    组织闭环雷达
                  </span>
                  <h3 className="v2-card-title">谁在真正闭环</h3>
                  <p className="v2-card-sub">不看谁写得热闹，看上周承诺是否被本周证据回应。</p>
                </div>
                <span className="v2-closure-num is-small">{organizationClosureRadar.averageScore}</span>
              </div>
              <p className="v2-card-sub">闭环标杆</p>
              {organizationClosureRadar.leaders.slice(0, 3).map((insight) => (
                <button className="v2-person-row" type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                  <span>
                    <span className="v2-person-name">{insight.name}</span>
                    <span className="v2-person-sub">
                      {insight.persona} · 已闭环 {insight.closedCount}
                    </span>
                  </span>
                  <em>{insight.score}</em>
                </button>
              ))}
              <p className="v2-card-sub v2-section-gap">重复空转风险</p>
              {organizationClosureRadar.risks.length > 0 ? (
                organizationClosureRadar.risks.slice(0, 3).map((insight) => (
                  <button className="v2-person-row is-risk" type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                    <span>
                      <span className="v2-person-name">{insight.name}</span>
                      <span className="v2-person-sub">
                        {insight.persona} · 风险 {insight.riskCount}
                      </span>
                    </span>
                    <em>{insight.score}</em>
                  </button>
                ))
              ) : (
                <p className="v2-empty-hint">暂无重复空转风险。</p>
              )}
            </section>

            <section className="v2-card">
              <div className="v2-card-head">
                <div>
                  <span className="v2-eyebrow">
                    <Network size={13} />
                    协同评分雷达
                  </span>
                  <h3 className="v2-card-title">同事眼中的贡献者</h3>
                  <p className="v2-card-sub">
                    {currentScoring360Cycle?.label || "协同360评分"} · {currentScoring360Cycle?.totalResponses || 0}/{currentScoring360Cycle?.totalAssignments || 0} 已完成
                  </p>
                </div>
                <span className="v2-closure-num is-small">{collaborationAverage.toFixed(1)}</span>
              </div>
              <p className="v2-card-sub">高协作贡献者</p>
              {collaborationLeaders.slice(0, 3).map((result) => (
                <button className="v2-person-row" type="button" key={result.name} onClick={() => onOpenEmployee(result.name)}>
                  <span>
                    <span className="v2-person-name">{result.name}</span>
                    <span className="v2-person-sub">
                      {collaborationSignal(result)} · {result.submitted}/{result.expected} 票
                    </span>
                  </span>
                  <em>{result.averageScore}</em>
                </button>
              ))}
              <p className="v2-card-sub v2-section-gap">协作孤岛风险</p>
              {collaborationRisks.slice(0, 2).map((result) => (
                <button className="v2-person-row is-risk" type="button" key={result.name} onClick={() => onOpenEmployee(result.name)}>
                  <span>
                    <span className="v2-person-name">{result.name}</span>
                    <span className="v2-person-sub">{collaborationSignal(result)} · 建议谈话校准</span>
                  </span>
                  <em>{result.averageScore}</em>
                </button>
              ))}
              <p className="v2-card-sub v2-section-gap">低分提示老板核查：岗位是否被看见、协作是否断点、能力是否错配。</p>
            </section>
          </div> : null}
        </div>

        <div className="v2-dash-side">
          <section className="v2-card">
            <div className="v2-card-head">
              <div>
                <span className="v2-eyebrow">
                  <Eye size={13} />
                  必读周报
                </span>
                <h3 className="v2-card-title">这几份值得完整读</h3>
              </div>
            </div>
            {mustRead.length === 0 ? <p className="v2-empty-hint">本周暂无必读周报。</p> : null}
            {mustRead.slice(0, showAllMustRead ? undefined : 4).map((report, index) => (
              <button className="v2-mustread-card" key={report.name} type="button" onClick={() => onOpenEmployee(report.name)}>
                <span className="v2-mustread-rank">{index + 1}</span>
                <span>
                  <strong>{report.name}</strong>
                  <p>{report.reason || report.focus || report.evidence}</p>
                  <span className="v2-mustread-tags">
                    <span>{report.department}</span>
                    {appData.employeeSummary.find((employee) => employee.name === report.name)?.level ? (
                      <span>{appData.employeeSummary.find((employee) => employee.name === report.name)!.level} 级</span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
            {mustRead.length > 4 ? (
              <button className="v2-btn v2-btn-ghost v3-view-all" type="button" onClick={() => setShowAllMustRead((value) => !value)}>
                {showAllMustRead ? "收起" : `查看全部 ${mustRead.length} 份`}
              </button>
            ) : null}
          </section>

          {activeWorkspaceTab === "decisions" ? <section className="v2-card">
            <div className="v2-card-head">
              <div>
                <span className="v2-eyebrow">
                  <Send size={13} />
                  公司大群总结
                </span>
                <h3 className="v2-card-title">本周想对大家说的话</h3>
                <p className="v2-card-sub">发送后会保存老板最终版，用于下一周学习你的表达风格。</p>
              </div>
            </div>
            <textarea
              className="v2-message-editor"
              value={companyMessageText}
              readOnly={externalView}
              onChange={(event) => {
                setCompanyMessageText(event.target.value);
                if (sendStatus !== "sending") {
                  setSendStatus("idle");
                  setSendNote("");
                }
              }}
              aria-label="编辑公司大群总结"
            />
            <div className="v2-focus-actions">
              <button
                className="v2-btn v2-btn-primary"
                type="button"
                onClick={sendCompanyMessage}
                disabled={externalView || sendStatus === "sending" || companyMessageText.trim().length === 0}
              >
                <Send size={15} />
                <span>{externalView ? "只读视图" : sendStatus === "sending" ? "发送中..." : "一键发飞书群消息"}</span>
              </button>
            </div>
            {sendNote ? <p className={`v2-card-sub v2-section-gap message-send-status is-${sendStatus}`}>{sendNote}</p> : null}
          </section> : null}

          {activeWorkspaceTab === "organization" ? <section className="v2-card">
            <div className="v2-card-head">
              <div>
                <span className="v2-eyebrow">
                  <Users size={13} />
                  部门周报质量
                </span>
                <h3 className="v2-card-title">{cnNumber(appData.peopleCount)} 人的质量分布</h3>
              </div>
            </div>
            <HorizontalBars data={departmentBars} />
          </section> : null}
        </div>
      </div>
    </div>
  );
}
