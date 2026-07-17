import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  ListChecks,
  MessageSquareText,
  Network,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PriorityBadge } from "../components/PriorityBadge";
import { ScoreBadge } from "../components/ScoreBadge";
import { HorizontalBars, Sparkline } from "../components/SimpleCharts";
import { StatCard } from "../components/StatCard";
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
}

function collaborationSignal(result: Scoring360Result) {
  const average = result.averageScore ?? 0;
  if (average >= 95) return "强协同样本";
  if (average >= 90) return "稳定贡献者";
  if (average >= 85) return "协同良好";
  if (average >= 80) return "需要观察";
  return "孤岛风险";
}

export function DashboardPage({ selectedPeriodId, onOpenEmployee }: DashboardPageProps) {
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
  const selectedWeeklyRows = selectedPeriod ? weeklyForPeriod(selectedPeriod.id) : [];
  const submittedCount = selectedPeriod?.submittedCount || appData.submittedCount || selectedWeeklyRows.length;
  const exemptCount = selectedPeriod?.exemptPeople?.length || appData.exemptCount;
  const peopleCount = Math.max(appData.peopleCount, submittedCount + exemptCount);
  const p0Count = periodAttentionQueue.filter((task) => task.priority === "P0").length;
  const coordinationCount = periodCoordinationSignals.filter((signal) => signal.priority === "P0").length;
  const praiseCount = appData.employeeSummary.filter((employee) => employee.level === "A" || employee.level === "A-").length;
  const mustRead = periodMustReadReports.slice(0, 6);
  const departmentBars = Object.entries(appData.departmentScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
  const trendEmployeeName = appData.employeeSummary[0]?.name;
  const trendValues = appData.weeklyScores
    .filter((week) => week.name === trendEmployeeName)
    .map((week) => week.total);
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

  return (
    <div className="page-stack">
      <section className="kpi-grid">
        <StatCard
          label="提交状态"
          value={`${submittedCount}/${peopleCount}`}
          note={exemptCount ? `${exemptCount} 人产假/豁免，全员准时` : "本周期提交已同步"}
          tone="blue"
          icon={<Users size={18} />}
        />
        <StatCard label="P0 必须介入" value={p0Count} note="授权与送审是本周关键" tone="red" icon={<AlertTriangle size={18} />} />
        <StatCard label="跨部门协调" value={coordinationCount} note="优先进入老板协调台" tone="amber" icon={<Network size={18} />} />
        <StatCard label="正向样本" value={praiseCount} note="适合在大群公开表扬" tone="teal" icon={<MessageSquareText size={18} />} />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-column dashboard-column-wide">
          <article className="panel briefing-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">AI Briefing</span>
                <h2>本周公司整体情况</h2>
              </div>
              <Sparkline values={trendValues} />
            </div>
            <div className="briefing-list">
              {executiveSummary.slice(0, 6).map((item) => {
                const [lead, ...rest] = item.split(/[。:：]/);
                return (
                  <p key={item}>
                    <strong>{lead}。</strong>
                    {rest.join("。")}
                  </p>
                );
              })}
            </div>
            <div className="health-chips">
              <span className="chip is-good">设计部 82.9</span>
              <span className="chip is-good">采购跟单 82.9</span>
              <span className="chip is-watch">产品企划 67.1</span>
              <span className="chip is-watch">国内事业部 71.7</span>
            </div>
          </article>

          <article className="panel collective-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Team Focus</span>
                <h2>需要集体关注的细节</h2>
              </div>
              <ListChecks size={18} />
            </div>
            <div className="focus-list">
              {collectiveFocus.slice(0, 6).map((item) => (
                <div key={`${item.title}-${item.detail}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </article>

          {activeDepartmentBrief ? (
            <article className="panel department-meeting-panel">
              <div className="panel-heading compact">
                <div>
                  <span className="section-label">Department Meeting</span>
                  <h2>部门会议雷达</h2>
                </div>
                <select
                  className="department-meeting-select"
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
              <div className="department-meeting-metrics">
                <div>
                  <span>部门成员</span>
                  <strong>{activeDepartmentBrief.memberCount}</strong>
                </div>
                <div>
                  <span>本周均分</span>
                  <strong>{activeDepartmentBrief.currentAverage || "-"}</strong>
                  <small className={activeDepartmentBrief.scoreDelta >= 0 ? "is-up" : "is-down"}>
                    {activeDepartmentBrief.scoreDelta >= 0 ? "+" : ""}
                    {activeDepartmentBrief.scoreDelta || 0}
                  </small>
                </div>
                <div>
                  <span>闭环力</span>
                  <strong>{activeDepartmentBrief.closureScore || "-"}</strong>
                </div>
                <div>
                  <span>P0/P1/P2</span>
                  <strong>
                    {activeDepartmentBrief.priorityCounts.P0}/{activeDepartmentBrief.priorityCounts.P1}/
                    {activeDepartmentBrief.priorityCounts.P2}
                  </strong>
                </div>
              </div>
              <div className="department-meeting-layout">
                <div className="department-agenda-block">
                  <h3>本周会议议题</h3>
                  <div className="department-agenda-list">
                    {activeDepartmentBrief.urgentIssues.length > 0 ? (
                      activeDepartmentBrief.urgentIssues.slice(0, 4).map((issue) => (
                        <div className="department-agenda-row" key={`${issue.priority}-${issue.title}-${issue.source}`}>
                          <div className="department-agenda-title">
                            <PriorityBadge priority={issue.priority} />
                            <strong>{issue.title}</strong>
                          </div>
                          <p>{truncate(issue.detail, 112)}</p>
                          <div className="department-agenda-meta">
                            <span>{issue.periodLabel}</span>
                            <span>来源：{issue.source || "周报"}</span>
                            <span>牵头：{issue.owner || "待定"}</span>
                            {issue.fromOutside ? <span className="is-external">外部输入</span> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="department-agenda-empty">这个部门本周期暂未出现需要会议优先处理的 P0/P1/P2 议题。</p>
                    )}
                  </div>
                </div>
                <div className="department-agenda-block">
                  <h3>重要但不紧急</h3>
                  <div className="department-agenda-list">
                    {activeDepartmentBrief.longTermTasks.length > 0 ? (
                      activeDepartmentBrief.longTermTasks.slice(0, 3).map((issue) => (
                        <div className="department-agenda-row is-long-term" key={`${issue.title}-${issue.theme}`}>
                          <div className="department-agenda-title">
                            <PriorityBadge priority={issue.priority} />
                            <strong>{issue.theme || issue.title}</strong>
                          </div>
                          <p>{truncate(issue.detail, 96)}</p>
                          <div className="coordination-mini-tags">
                            {issue.tags.slice(0, 3).map((tag) => (
                              <span className={`coordination-tag tag-${tag.type}`} key={`${issue.title}-${tag.type}`}>
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="department-agenda-empty">暂无明显长期机制建设项，可在会议中补充人为判断。</p>
                    )}
                  </div>
                  <h3>跨周闭环观察</h3>
                  <div className="department-closure-list">
                    {activeDepartmentBrief.closureSignals.length > 0 ? (
                      activeDepartmentBrief.closureSignals.map((signal) => (
                        <button
                          className="department-closure-row"
                          type="button"
                          key={`${signal.name}-${signal.status}`}
                          onClick={() => onOpenEmployee(signal.name)}
                        >
                          <span>
                            <strong>{signal.name}</strong>
                            <small>{signal.persona} · {signal.status}</small>
                          </span>
                          <em>{signal.score}</em>
                          <p>{truncate(signal.nextStep || signal.signal, 60)}</p>
                        </button>
                      ))
                    ) : (
                      <p className="department-agenda-empty">暂无足够跨周闭环样本。</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="department-external-signals">
                <strong>其他部门输入</strong>
                {activeDepartmentBrief.externalSignals.length > 0 ? (
                  activeDepartmentBrief.externalSignals.slice(0, 3).map((issue) => (
                    <span key={`${issue.source}-${issue.title}`}>{issue.source}：{truncate(issue.title, 34)}</span>
                  ))
                ) : (
                  <span>暂无明显外部输入</span>
                )}
              </div>
              <p className="department-meeting-note">
                分析窗口：{activeDepartmentBrief.recentPeriodLabels.join("、")}。这里用于每周部门会先定议题，再把反复出现的问题沉淀为长期机制任务。
              </p>
            </article>
          ) : null}

          <article className="panel coordination-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Coordination Desk</span>
                <h2>跨部门协调台</h2>
              </div>
              <Network size={18} />
            </div>
            <div className="coordination-list">
              {periodCoordinationSignals.slice(0, 4).map((signal) => (
                <div className="coordination-row" key={`${signal.priority}-${signal.title}`}>
                  <div className="coordination-title">
                    <PriorityBadge priority={signal.priority} />
                    <strong>{signal.title.replace(/^【周报P\d】/, "")}</strong>
                  </div>
                  <p>{truncate(signal.decision, 96)}</p>
                  <div className="coordination-meta">
                    <span>牵头：{signal.owner || "待定"}</span>
                    <span>{signal.departments.length > 0 ? signal.departments.join(" / ") : signal.theme}</span>
                  </div>
                  <div className="coordination-tags">
                    {signal.tags.slice(0, 4).map((tag) => (
                      <span className={`coordination-tag tag-${tag.type}`} key={`${signal.title}-${tag.type}`}>{tag.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="coordination-note">这里收纳员工靠单人努力难以推动的事项，老板只看需要拆墙、拍板或调资源的部分。</p>
          </article>

          <article className="panel closure-radar-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Closure Radar</span>
                <h2>组织闭环雷达</h2>
              </div>
              <strong>{organizationClosureRadar.averageScore}</strong>
            </div>
            <div className="closure-radar-grid">
              <div className="closure-radar-section">
                <h3><CheckCircle2 size={15} />真正完成闭环的人</h3>
                {organizationClosureRadar.leaders.slice(0, 4).map((insight) => (
                  <button className="closure-person-row" type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                    <span>
                      <strong>{insight.name}</strong>
                      <small>{insight.persona} · 已闭环 {insight.closedCount}</small>
                    </span>
                    <em>{insight.score}</em>
                  </button>
                ))}
              </div>
              <div className="closure-radar-section">
                <h3><AlertTriangle size={15} />重复空转风险</h3>
                {organizationClosureRadar.risks.slice(0, 4).map((insight) => (
                  <button className="closure-person-row is-risk" type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                    <span>
                      <strong>{insight.name}</strong>
                      <small>{insight.persona} · 风险 {insight.riskCount}</small>
                    </span>
                    <em>{insight.score}</em>
                  </button>
                ))}
              </div>
            </div>
            <div className="closure-signal-block">
              <div>
                <h3>机制沉淀样本</h3>
                {organizationClosureRadar.mechanismSamples.slice(0, 3).map((insight) => (
                  <button type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                    {insight.name}：{truncate(insight.latestPair?.nextStep || insight.summary, 42)}
                  </button>
                ))}
              </div>
              <div>
                <h3><Brain size={15} />AI 协同清晰思考者</h3>
                {organizationClosureRadar.clearThinkers.slice(0, 3).map((insight) => (
                  <button type="button" key={insight.name} onClick={() => onOpenEmployee(insight.name)}>
                    {insight.name}：AI/机制信号 {insight.aiThinkingScore}
                  </button>
                ))}
              </div>
            </div>
            <p className="closure-radar-note">
              闭环力不是看谁写得热闹，而是看上周承诺是否在本周被证据回应；机制型和清晰思考者，是未来能与 AI 共建组织上下文的人。
            </p>
          </article>

          <article className="panel collaboration-radar-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Collaboration Radar</span>
                <h2>协同评分雷达</h2>
              </div>
              <strong>{collaborationAverage.toFixed(1)}</strong>
            </div>
            <div className="collaboration-radar-meta">
              <span>{currentScoring360Cycle?.label || "协同360评分"}</span>
              <span>{currentScoring360Cycle?.totalResponses || 0}/{currentScoring360Cycle?.totalAssignments || 0} 已完成</span>
            </div>
            <div className="collaboration-radar-grid">
              <div>
                <h3>高协作贡献者</h3>
                {collaborationLeaders.map((result, index) => (
                  <button className="collaboration-person-row" type="button" key={result.name} onClick={() => onOpenEmployee(result.name)}>
                    <b>{index + 1}</b>
                    <span>
                      <strong>{result.name}</strong>
                      <small>{collaborationSignal(result)} · {result.submitted}/{result.expected} 票</small>
                    </span>
                    <em>{result.averageScore}</em>
                  </button>
                ))}
              </div>
              <div>
                <h3>协作孤岛风险</h3>
                {collaborationRisks.map((result, index) => (
                  <button className="collaboration-person-row is-risk" type="button" key={result.name} onClick={() => onOpenEmployee(result.name)}>
                    <b>{index + 1}</b>
                    <span>
                      <strong>{result.name}</strong>
                      <small>{collaborationSignal(result)} · 建议谈话校准</small>
                    </span>
                    <em>{result.averageScore}</em>
                  </button>
                ))}
              </div>
            </div>
            <p className="collaboration-radar-note">
              低分不直接等于“不重要”，它提示老板核查：岗位是否被看见、协作是否断点、能力是否错配，或确实存在业务价值不足。
            </p>
          </article>
        </div>

        <div className="dashboard-column dashboard-column-mid">
          <article className="panel attention-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">CEO Queue</span>
                <h2>管理注意力队列</h2>
              </div>
              <button className="text-button" type="button">
                <ClipboardList size={16} />
                <span>审核全部</span>
              </button>
            </div>
            <div className="attention-list">
              {periodAttentionQueue
                .slice()
                .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
                .slice(0, 6)
                .map((task) => {
                  const tags = getCoordinationTags(task);
                  return (
                    <div className="attention-row" key={task.title}>
                      <PriorityBadge priority={task.priority} />
                      <div>
                        <strong>{task.title.replace(/^【周报P\d】/, "")}</strong>
                        <p>{truncate(task.evidence, 78)}</p>
                        {tags.length > 0 ? (
                          <div className="coordination-mini-tags">
                            {tags.slice(0, 2).map((tag) => (
                              <span className={`coordination-tag tag-${tag.type}`} key={`${task.title}-${tag.type}`}>{tag.label}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span>{task.source}</span>
                    </div>
                  );
                })}
            </div>
          </article>

          <article className="panel summary-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Company Message</span>
                <h2>公司大群总结草稿</h2>
              </div>
              <FileText size={18} />
            </div>
            <textarea
              className="message-editor"
              value={companyMessageText}
              onChange={(event) => {
                setCompanyMessageText(event.target.value);
                if (sendStatus !== "sending") {
                  setSendStatus("idle");
                  setSendNote("");
                }
              }}
              aria-label="编辑公司大群总结"
            />
            <div className="message-actions">
              <button
                className="primary-button"
                type="button"
                onClick={sendCompanyMessage}
                disabled={sendStatus === "sending" || companyMessageText.trim().length === 0}
              >
                <Send size={16} />
                <span>{sendStatus === "sending" ? "发送中..." : "一键发飞书群消息"}</span>
              </button>
              <span className={`message-send-status is-${sendStatus}`}>{sendNote || "发送后会保存老板最终版，用于下一周学习你的表达风格。"}</span>
            </div>
          </article>
        </div>

        <div className="dashboard-column dashboard-column-narrow">
          <article className="panel must-read-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Must Read</span>
                <h2>必须完整阅读的周报</h2>
              </div>
              <Eye size={18} />
            </div>
            <div className="must-read-list">
              {mustRead.map((report, index) => (
                <button className="must-read-card" key={report.name} type="button" onClick={() => onOpenEmployee(report.name)}>
                  <div className="rank">{index + 1}</div>
                  <div>
                    <strong>{report.name}</strong>
                    <p>{report.reason || report.focus || report.evidence}</p>
                    <div className="tag-row">
                      <span>{report.department}</span>
                      {appData.employeeSummary.find((employee) => employee.name === report.name)?.level ? (
                        <ScoreBadge level={appData.employeeSummary.find((employee) => employee.name === report.name)!.level} />
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className="panel department-panel">
            <div className="panel-heading compact">
              <div>
                <span className="section-label">Department</span>
                <h2>部门周报质量</h2>
              </div>
              <strong>{cnNumber(appData.peopleCount)} 人</strong>
            </div>
            <HorizontalBars data={departmentBars} />
          </article>
        </div>
      </section>
    </div>
  );
}
