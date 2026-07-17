import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  ClipboardList,
  FileSearch,
  ListChecks,
  Network,
  Presentation,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PriorityBadge } from "../components/PriorityBadge";
import { monthlyMeetingBriefForMonth } from "../lib/data";
import { truncate } from "../lib/format";
import type { MonthlyDepartmentReview, MonthlyMeetingAgendaItem, MonthlyMeetingCategory } from "../lib/types";

interface MonthlyMeetingPageProps {
  onOpenEmployee: (name: string) => void;
}

const categoryOrder: MonthlyMeetingCategory[] = ["经营问题", "业务问题", "产品问题", "流程问题", "制度问题", "文化问题"];

function categoryTone(category: MonthlyMeetingCategory) {
  const map: Record<MonthlyMeetingCategory, string> = {
    经营问题: "is-red",
    业务问题: "is-blue",
    产品问题: "is-indigo",
    流程问题: "is-amber",
    制度问题: "is-purple",
    文化问题: "is-teal",
  };
  return map[category];
}

function meetingIssueKey(issue: MonthlyMeetingAgendaItem) {
  return `${issue.periodId}-${issue.priority}-${issue.category}-${issue.title}-${issue.source}`;
}

function DepartmentReviewCard({ review, onOpenEmployee }: { review: MonthlyDepartmentReview; onOpenEmployee: (name: string) => void }) {
  return (
    <article className="monthly-department-card">
      <div className="monthly-department-title">
        <div>
          <span className="section-label">Department Review</span>
          <h3>{review.department}</h3>
          <p className="monthly-branch-note">{review.parentBranch}</p>
        </div>
        <strong>{review.currentAverage || "-"}</strong>
      </div>
      <div className="monthly-department-stats">
        <span>{review.memberCount} 人</span>
        <span>闭环力 {review.closureScore || "-"}</span>
        <span className={review.scoreDelta >= 0 ? "is-up" : "is-down"}>
          较上月 {review.scoreDelta >= 0 ? "+" : ""}
          {review.scoreDelta || 0}
        </span>
        <span>
          P0/P1/P2 {review.priorityCounts.P0}/{review.priorityCounts.P1}/{review.priorityCounts.P2}
        </span>
      </div>
      <div className="monthly-department-columns">
        <div>
          <h4>本部门会议先问</h4>
          <ul>
            {review.meetingQuestions.slice(0, 3).map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>长期建设项</h4>
          {review.longTermTasks.length > 0 ? (
            review.longTermTasks.slice(0, 2).map((issue) => (
              <button className="monthly-mini-issue" type="button" key={meetingIssueKey(issue)} onClick={() => onOpenEmployee(issue.source)}>
                <PriorityBadge priority={issue.priority} />
                <span>{truncate(issue.title, 42)}<small>责任：{issue.responsibleDepartments.join(" / ") || review.department}</small></span>
              </button>
            ))
          ) : (
            <p className="monthly-empty">暂无明显机制建设项。</p>
          )}
        </div>
      </div>
      <div className="monthly-source-strip">
        {review.externalSignals.length > 0 ? (
          review.externalSignals.slice(0, 3).map((issue) => (
            <button type="button" key={`${meetingIssueKey(issue)}-external`} onClick={() => onOpenEmployee(issue.source)}>
              外部输入：{issue.source} · {truncate(issue.title, 28)}
            </button>
          ))
        ) : (
          <span>暂无其他部门明显输入</span>
        )}
      </div>
    </article>
  );
}

export function MonthlyMeetingPage({ onOpenEmployee }: MonthlyMeetingPageProps) {
  const brief = useMemo(() => monthlyMeetingBriefForMonth("2026-06"), []);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const defaultDepartment = brief.departmentGroups[0]?.reviews[0]?.department || brief.departmentReviews[0]?.department || "";
  const [selectedDepartment, setSelectedDepartment] = useState(defaultDepartment);
  const selectedReview = brief.departmentReviews.find((review) => review.department === selectedDepartment) ?? brief.departmentReviews[0];
  const agendaByCategory = categoryOrder.map((category) => ({
    category,
    items: brief.companyAgenda.filter((item) => item.category === category),
  }));
  const toggleCategory = (category: MonthlyMeetingCategory) => {
    setExpandedCategories((current) => ({ ...current, [category]: !current[category] }));
  };
  const toggleBranch = (branchId: string) => {
    setExpandedBranches((current) => ({ ...current, [branchId]: !current[branchId] }));
  };

  return (
    <div className="monthly-meeting-page">
      <section className="monthly-hero panel">
        <div>
          <span className="section-label">Monthly Operating Review</span>
          <h2>{brief.monthLabel}</h2>
          <p>{brief.windowLabel}。用于下周二全天投屏会议：先统一事实，再分部门拆问题，最后生成任务和下月追踪。</p>
        </div>
        <div className="monthly-hero-grid">
          <div>
            <span>周报事实</span>
            <strong>{brief.totalReports}</strong>
            <small>{brief.submittedPeople} 人 · {brief.activeDepartments} 个部门</small>
          </div>
          <div>
            <span>P0/P1/P2</span>
            <strong>
              {brief.priorityCounts.P0}/{brief.priorityCounts.P1}/{brief.priorityCounts.P2}
            </strong>
            <small>按5-6月跨周问题聚合</small>
          </div>
          <div>
            <span>生成时间</span>
            <strong>{brief.generatedOn || "-"}</strong>
            <small>基于成长OS本地快照</small>
          </div>
        </div>
      </section>

      <section className="monthly-grid">
        <article className="panel monthly-flow-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Meeting Flow</span>
              <h2>全天会议流程</h2>
            </div>
            <Presentation size={18} />
          </div>
          <div className="monthly-flow-list">
            {brief.flow.map((item) => (
              <div className="monthly-flow-row" key={`${item.time}-${item.title}`}>
                <time>{item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.goal}</p>
                  <small>{item.output}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel monthly-finance-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Finance Bridge</span>
              <h2>{brief.financeBridge.title}</h2>
            </div>
            <Network size={18} />
          </div>
          <p className="monthly-finance-status">{brief.financeBridge.status}</p>
          <div className="monthly-finance-columns">
            <div>
              <h3>当前已有</h3>
              {brief.financeBridge.availableFacts.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div>
              <h3>需要 Nexus / 财报补齐</h3>
              {brief.financeBridge.missingFacts.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
          <div className="monthly-nexus-request">
            <strong>Nexus 经营事实包请求</strong>
            {brief.financeBridge.nexusRequest.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
      </section>

      <section className="monthly-grid">
        <article className="panel monthly-summary-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">AI Briefing</span>
              <h2>月度问题总览</h2>
            </div>
            <ClipboardList size={18} />
          </div>
          <div className="monthly-summary-list">
            {brief.executiveSummary.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
          <div className="monthly-category-grid">
            {categoryOrder.map((category) => (
              <span className={`monthly-category-chip ${categoryTone(category)}`} key={category}>
                {category} · {brief.categoryCounts[category]}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="panel monthly-agenda-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Company Agenda</span>
            <h2>全体会议议题池</h2>
          </div>
          <ListChecks size={18} />
        </div>
        <div className="monthly-agenda-grid">
          {agendaByCategory.map(({ category, items }) => {
            const expanded = Boolean(expandedCategories[category]);
            const visibleItems = expanded ? items : items.slice(0, 4);
            return (
              <div className="monthly-category-block" key={category}>
                <h3>
                  <span className={`monthly-category-dot ${categoryTone(category)}`} />
                  {category}
                  <small>{items.length}</small>
                </h3>
                {items.length > 0 ? (
                  <>
                    {visibleItems.map((item) => (
                      <button className="monthly-agenda-card" type="button" key={meetingIssueKey(item)} onClick={() => onOpenEmployee(item.source)}>
                        <span className="monthly-agenda-head">
                          <PriorityBadge priority={item.priority} />
                          <strong>{item.title}</strong>
                        </span>
                        <p>{truncate(item.detail, 128)}</p>
                        <em>{item.decisionQuestion}</em>
                        <span className="monthly-agenda-meta">
                          {item.periodLabel} · 来源：{item.source || "周报"} · 牵头：{item.owner || "待定"}
                        </span>
                        <span className="monthly-agenda-meta">
                          责任：{item.responsibleDepartments.join(" / ") || "待定"} · 影响：{item.impactedDepartments.join(" / ") || "待定"}
                        </span>
                      </button>
                    ))}
                    {items.length > visibleItems.length ? (
                      <button className="monthly-expand-button" type="button" onClick={() => toggleCategory(category)}>
                        展开全部 {items.length} 个议题
                        <ChevronDown size={14} />
                      </button>
                    ) : items.length > 4 ? (
                      <button className="monthly-expand-button" type="button" onClick={() => toggleCategory(category)}>
                        收起到重点议题
                        <ChevronUp size={14} />
                      </button>
                    ) : null}
                    <p className="monthly-visible-count">已显示 {visibleItems.length} / {items.length}</p>
                  </>
                ) : (
                  <p className="monthly-empty">本月暂未识别到该类核心议题。</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="monthly-grid monthly-department-section">
        <article className="panel monthly-department-picker">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Department Lens</span>
              <h2>分部门复盘议题</h2>
            </div>
            <Building2 size={18} />
          </div>
          <div className="monthly-department-tabs">
            {brief.departmentGroups.map((group) => {
              const isExpanded = expandedBranches[group.id] ?? group.id === brief.departmentGroups[0]?.id;
              return (
                <div className="monthly-branch-group" key={group.id}>
                  <button className="monthly-branch-toggle" type="button" onClick={() => toggleBranch(group.id)}>
                    <span>
                      {group.name}
                      <small>{group.lead}</small>
                    </span>
                    <strong>{group.p0p1Count}</strong>
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {isExpanded ? (
                    <div className="monthly-branch-children">
                      {group.reviews.map((review) => (
                        <button
                          className={review.department === selectedDepartment ? "is-active" : ""}
                          type="button"
                          key={review.department}
                          onClick={() => setSelectedDepartment(review.department)}
                        >
                          <span>{review.department}</span>
                          <strong>{review.priorityCounts.P0 + review.priorityCounts.P1}</strong>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        {selectedReview ? <DepartmentReviewCard review={selectedReview} onOpenEmployee={onOpenEmployee} /> : null}
      </section>

      <section className="monthly-grid">
        <article className="panel monthly-facts-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Evidence Jump</span>
              <h2>事实依据跳转</h2>
            </div>
            <FileSearch size={18} />
          </div>
          <div className="monthly-fact-list">
            {brief.factJumps.map((item) => (
              <button type="button" key={`${meetingIssueKey(item)}-fact`} onClick={() => onOpenEmployee(item.source)}>
                <span>
                  <PriorityBadge priority={item.priority} />
                  <strong>{item.source || "周报"}</strong>
                  <small>{item.periodLabel} · {item.category}</small>
                </span>
                <p>{truncate(item.evidence || item.detail, 92)}</p>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </article>

        <article className="panel monthly-decision-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Decision Template</span>
              <h2>月会决议模板</h2>
            </div>
            <CheckSquare size={18} />
          </div>
          <div className="monthly-decision-list">
            <div>
              <strong>1. 本月必须解决的 P0</strong>
              <p>每个 P0 写清：负责人、事实证据、今天会议决策、下次检查日期。</p>
            </div>
            <div>
              <strong>2. 部门长期建设任务</strong>
              <p>每个部门至少确认一个 SOP、模板、看板或训练动作，避免重复问题继续空转。</p>
            </div>
            <div>
              <strong>3. 文化与 AI 协同信号</strong>
              <p>表扬清晰思考者和机制型成员；对重复抱怨、无闭环、协作孤岛安排教练式谈话。</p>
            </div>
            <div>
              <strong>4. 下月成长 OS 回看点</strong>
              <p>所有决议进入飞书任务或成长 OS 追踪，下次月会必须从证据回看是否真的闭环。</p>
            </div>
          </div>
          <p className="monthly-note">
            当前版本先只服务老板视角。后续如果接入更多 MCP/飞书事实源，可以把销售、库存、审批、会议纪要和任务状态并入同一张月度事实图。
          </p>
        </article>
      </section>
    </div>
  );
}
