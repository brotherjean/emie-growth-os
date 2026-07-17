import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ChevronDown, MessageSquare, MousePointerClick, Quote, Sparkles, Trophy } from "lucide-react";
import { HorizontalBars } from "../components/SimpleCharts";
import { appData, getCoordinationTags, insightsForPeriod } from "../lib/data";
import type { ThemeInsight } from "../lib/types";

const fallbackThemeInsights: ThemeInsight[] = [
  {
    label: "跨部门评审",
    value: 7,
    severity: "P1",
    summary: "评审输入不完整会造成重复沟通和返工。",
    detail: "匿名演示数据表明，产品和运营需要在评审前共同确认数据、假设、目标和待决策问题。",
    quotes: [
      {
        author: "林清",
        department: "产品部",
        week: "1月第二周",
        text: "匿名示例原文：跨部门评审的输入信息仍不完整。",
      },
    ],
    nextStep: "建立评审前置清单，并用一次真实评审验证是否减少返工。",
  },
  {
    label: "复购运营",
    value: 6,
    severity: "P1",
    summary: "触达动作已有数据，但低活跃用户的真实原因仍需补足。",
    detail: "匿名演示数据只用于展示主题分拣、原文引用和后续任务之间的关系。",
    quotes: [
      {
        author: "周远",
        department: "运营部",
        week: "1月第二周",
        text: "匿名示例原文：低活跃用户的反馈样本仍然不足。",
      },
    ],
    nextStep: "完成五位用户访谈，并依据反馈更新分层触达策略。",
  },
  {
    label: "机制沉淀",
    value: 5,
    severity: "P2",
    summary: "已经验证的个人方法还需要转成团队可复用机制。",
    detail: "AI 不只判断任务是否完成，也关注是否形成模板、检查表和新的组织上下文。",
    quotes: [
      {
        author: "匿名同事",
        department: "跨部门",
        week: "1月第二周",
        text: "匿名示例原文：下一步要把个人方法变成团队机制。",
      },
    ],
    nextStep: "记录方法的输入、步骤、验收条件和首次执行反馈。",
  },
];

interface ContributionActivity {
  openId?: string;
  name?: string;
  visits?: number;
  comments?: number;
  likes?: number;
  followups?: number;
  lastActiveAt?: string;
}

interface ContributorRow {
  name: string;
  department: string;
  qualityScore: number;
  visits: number;
  comments: number;
  likes: number;
  followups: number;
  score: number;
  strongestSignal: string;
  lastActiveAt?: string;
}

const contributionWeights = [
  { label: "周报质量", value: 40, description: "结果、问题、复盘、计划和准时性" },
  { label: "访问成长OS", value: 20, description: "主动回来查看组织与个人成长数据" },
  { label: "评论点赞互动", value: 20, description: "给同事提供建议、认可优秀周报" },
  { label: "AI追问", value: 20, description: "把问题继续拆到可执行方案" },
];

interface TrendsPageProps {
  selectedPeriodId: string;
}

export function TrendsPage({ selectedPeriodId }: TrendsPageProps) {
  const periodInsights = insightsForPeriod(selectedPeriodId);
  const themes = periodInsights.themes.length > 0 ? periodInsights.themes : fallbackThemeInsights;
  const [openTheme, setOpenTheme] = useState(themes[0]?.label ?? "");
  const [activity, setActivity] = useState<ContributionActivity[]>([]);
  const [showAllContributors, setShowAllContributors] = useState(false);
  const departmentData = Object.entries(appData.departmentScores)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const contributors = useMemo(() => buildContributorRows(activity), [activity]);
  const topContributors = contributors.slice(0, 10);
  const displayedContributors = showAllContributors ? contributors : topContributors;
  const topScore = topContributors[0]?.score || 1;
  const activePeopleCount = contributors.filter((row) => row.visits + row.comments + row.likes + row.followups > 0).length;
  const lowEngagementCount = contributors.filter((row) => row.visits < 3 && row.comments + row.likes + row.followups < 2).length;

  useEffect(() => {
    fetch("/api/contribution-activity")
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (Array.isArray(result?.activity)) setActivity(result.activity);
      })
      .catch(() => {
        // The static prototype keeps a deterministic baseline when the backend is not available.
      });
  }, []);

  return (
    <section className="trend-grid">
      <article className="panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Department</span>
            <h2>部门周报质量均分</h2>
          </div>
        </div>
        <HorizontalBars data={departmentData} />
      </article>
      <article className="panel theme-insight-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Theme Triage</span>
            <h2>跨周问题分拣</h2>
          </div>
        </div>
        <div className="theme-list">
          {themes.map((theme) => {
            const expanded = openTheme === theme.label;
            const tags = getCoordinationTags({
              title: theme.label,
              summary: theme.summary,
              detail: theme.detail,
              nextStep: theme.nextStep,
              department: theme.quotes.map((quote) => quote.department).join("/"),
            });
            return (
              <div className={`theme-item ${expanded ? "is-open" : ""}`} key={theme.label}>
                <button className="theme-trigger" type="button" onClick={() => setOpenTheme(expanded ? "" : theme.label)}>
                  <span className={`severity severity-${theme.severity.toLowerCase()}`}>{theme.severity}</span>
                  <span>{theme.label}</span>
                  <div className="theme-meter">
                    <i style={{ width: `${theme.value * 10}%` }} />
                  </div>
                  <strong>{theme.value.toFixed(1)}</strong>
                  <ChevronDown size={16} />
                </button>
                {expanded ? (
                  <div className="theme-detail">
                    {tags.length > 0 ? (
                      <div className="theme-coordination-tags">
                        {tags.slice(0, 4).map((tag) => (
                          <span className={`coordination-tag tag-${tag.type}`} key={`${theme.label}-${tag.type}`}>{tag.label}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="theme-summary">
                      <AlertCircle size={17} />
                      <div>
                        <strong>{theme.summary}</strong>
                        <p>{theme.detail}</p>
                      </div>
                    </div>
                    <div className="quote-stack">
                      {theme.quotes.map((quote) => (
                        <figure key={`${theme.label}-${quote.author}-${quote.text}`}>
                          <Quote size={16} />
                          <blockquote>{quote.text}</blockquote>
                          <figcaption>
                            {quote.author} · {quote.department} · {quote.week}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    <div className="theme-next-step">
                      <strong>AI 建议下一步</strong>
                      <span>{theme.nextStep}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </article>
      <article className="panel contribution-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Growth Contributors</span>
            <h2>组织成长贡献者 Top10</h2>
          </div>
        </div>
        <div className="contribution-overview">
          <div>
            <Trophy size={18} />
            <strong>{topContributors[0]?.name || "待生成"}</strong>
            <span>当前贡献分最高</span>
          </div>
          <div>
            <Activity size={18} />
            <strong>{activePeopleCount}/{appData.peopleCount}</strong>
            <span>本轮有成长行为</span>
          </div>
          <div>
            <AlertCircle size={18} />
            <strong>{lowEngagementCount}</strong>
            <span>低参与，不默认展开点名</span>
          </div>
        </div>
        <div className="contribution-weight-grid">
          {contributionWeights.map((item) => (
            <div key={item.label}>
              <strong>{item.value}%</strong>
              <span>{item.label}</span>
              <small>{item.description}</small>
            </div>
          ))}
        </div>
        <div className="contributor-list">
          {displayedContributors.map((row, index) => (
            <div className="contributor-row" key={row.name}>
              <div className="contributor-rank">{index + 1}</div>
              <div className="contributor-main">
                <div className="contributor-title">
                  <strong>{row.name}</strong>
                  <span>{row.department}</span>
                  <small>{row.strongestSignal}</small>
                </div>
                <div className="contributor-meter">
                  <i style={{ width: `${Math.max(8, (row.score / topScore) * 100)}%` }} />
                </div>
                <div className="contributor-metrics">
                  <span><Trophy size={13} />周报 {row.qualityScore.toFixed(1)}</span>
                  <span><MousePointerClick size={13} />访问 {row.visits}</span>
                  <span><MessageSquare size={13} />互动 {row.comments + row.likes}</span>
                  <span><Sparkles size={13} />追问 {row.followups}</span>
                </div>
              </div>
              <strong className="contributor-score">{row.score.toFixed(1)}</strong>
            </div>
          ))}
        </div>
        <div className="contribution-footer">
          <p className="contribution-note">
            默认展示上一周期Top10，老板视角可展开完整排序。
          </p>
          <button className="secondary-button" type="button" onClick={() => setShowAllContributors((current) => !current)}>
            {showAllContributors ? "收起为 Top10" : `老板视角：展开完整排序（${contributors.length}人）`}
          </button>
        </div>
      </article>
    </section>
  );
}

function buildContributorRows(activity: ContributionActivity[]): ContributorRow[] {
  const byOpenId = new Map(activity.filter((item) => item.openId).map((item) => [item.openId, item]));
  const byName = new Map(activity.filter((item) => item.name).map((item) => [item.name, item]));
  const rows = appData.employeeSummary.map((employee) => {
    const real = byOpenId.get(employee.openId) || byName.get(employee.name);
    return {
      name: employee.name,
      department: employee.department,
      qualityScore: employee.averageScore,
      visits: Number(real?.visits || 0),
      comments: Number(real?.comments || 0),
      likes: Number(real?.likes || 0),
      followups: Number(real?.followups || 0),
      score: 0,
      strongestSignal: "",
      lastActiveAt: real?.lastActiveAt,
    };
  });
  const maxVisits = Math.max(1, ...rows.map((row) => row.visits));
  const maxInteraction = Math.max(1, ...rows.map((row) => row.comments * 2 + row.likes));
  const maxFollowups = Math.max(1, ...rows.map((row) => row.followups));

  return rows
    .map((row) => {
      const visitScore = (row.visits / maxVisits) * 100;
      const interactionScore = ((row.comments * 2 + row.likes) / maxInteraction) * 100;
      const followupScore = (row.followups / maxFollowups) * 100;
      const score = row.qualityScore * 0.4 + visitScore * 0.2 + interactionScore * 0.2 + followupScore * 0.2;
      return {
        ...row,
        score,
        strongestSignal: getStrongestSignal(row, visitScore, interactionScore, followupScore),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function getStrongestSignal(row: ContributorRow, visitScore: number, interactionScore: number, followupScore: number) {
  const signals = [
    { label: "周报质量稳定", value: row.qualityScore },
    { label: "主动访问成长OS", value: visitScore },
    { label: "愿意参与同事互动", value: interactionScore },
    { label: "会继续向 AI 追问", value: followupScore },
  ].sort((a, b) => b.value - a.value);
  return signals[0]?.label || "持续参与成长系统";
}
