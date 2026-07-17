import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Send, SlidersHorizontal, Trophy, UsersRound } from "lucide-react";
import { ScoreBadge } from "../components/ScoreBadge";
import {
  appData,
  currentScoring360Cycle,
  scoring360,
  scoring360AssignmentsForEvaluator,
  scoring360VisibleResults,
} from "../lib/data";
import type { Scoring360Result, UserAccess, VisibleEmployee } from "../lib/types";

interface ScoresPageProps {
  visibleEmployees?: VisibleEmployee[];
  access?: UserAccess;
}

type ScoreTab = "weekly" | "collaboration" | "my360";

interface Scoring360Task {
  id: string;
  cycleId: string;
  evaluee: string;
  evaluator: string;
  score: number | null;
  comment?: string;
  submitted: boolean;
  submittedAt?: string;
  locked?: boolean;
}

function scoreLevel(score: number | null) {
  if (score === null) return "未评分";
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  return "C";
}

function formatScore(score: number | null) {
  return score === null ? "-" : score.toFixed(1).replace(/\.0$/, "");
}

function isLocked(submittedAt?: string) {
  if (!submittedAt) return false;
  const time = new Date(submittedAt.replace(" ", "T")).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > 4 * 60 * 60 * 1000;
}

export function ScoresPage({ visibleEmployees = [], access }: ScoresPageProps) {
  const viewerName = access?.currentEmployee?.name || visibleEmployees[0]?.name || "";
  const canSwitchEvaluator = Boolean(access?.bossView || access?.canManageScoring360);
  const [activeTab, setActiveTab] = useState<ScoreTab>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "my360" || tab === "collaboration" || tab === "weekly" ? tab : "weekly";
  });
  const [selectedEvaluator, setSelectedEvaluator] = useState(() => {
    if (viewerName) return viewerName;
    const withTasks = scoring360.employees.find((name) => scoring360AssignmentsForEvaluator(name).length > 0);
    return withTasks || scoring360.employees[0] || "";
  });
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [apiCycle, setApiCycle] = useState<typeof currentScoring360Cycle | null>(null);
  const [apiResults, setApiResults] = useState<Scoring360Result[] | null>(null);
  const [apiTasks, setApiTasks] = useState<Scoring360Task[] | null>(null);
  const [tasksReloadKey, setTasksReloadKey] = useState(0);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const visibleNames = useMemo(() => new Set(visibleEmployees.map((employee) => employee.name).filter(Boolean)), [visibleEmployees]);
  const currentCycle = apiCycle || currentScoring360Cycle;
  const weeklyEmployees = visibleNames.size > 0
    ? appData.employeeSummary.filter((employee) => visibleNames.has(employee.name))
    : appData.employeeSummary;
  const staticResults = scoring360VisibleResults(visibleNames);
  const collaborationResults = (apiResults || staticResults).filter((result) => visibleNames.size === 0 || visibleNames.has(result.name));
  const activeEvaluator = canSwitchEvaluator ? selectedEvaluator : viewerName;
  const myAssignments = apiTasks || scoring360AssignmentsForEvaluator(activeEvaluator);
  const top360 = collaborationResults.slice(0, 5);
  const evaluatorOptions = canSwitchEvaluator ? Array.from(new Set([
    ...scoring360.employees,
    ...appData.employeeSummary.map((employee) => employee.name),
    ...collaborationResults.map((result) => result.name),
  ])).filter(Boolean) : [viewerName].filter(Boolean);
  const weeklyAverage = weeklyEmployees.length
    ? weeklyEmployees.reduce((sum, employee) => sum + employee.averageScore, 0) / weeklyEmployees.length
    : 0;
  const collaborationAverage = collaborationResults.filter((item) => item.averageScore !== null)
    .reduce((sum, item) => sum + Number(item.averageScore), 0) / Math.max(1, collaborationResults.filter((item) => item.averageScore !== null).length);
  const compositeAverage = weeklyEmployees.length
    ? weeklyEmployees.reduce((sum, employee) => {
        const collaboration = collaborationResults.find((item) => item.name === employee.name);
        const collaborationScore = collaboration?.rollingScore ?? collaboration?.averageScore ?? employee.averageScore;
        return sum + employee.averageScore * 0.6 + collaborationScore * 0.4;
      }, 0) / weeklyEmployees.length
    : 0;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/scoring360")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setApiCycle(payload.cycle || null);
        setApiResults(Array.isArray(payload.results) ? payload.results : null);
      })
      .catch(() => {
        if (!cancelled) {
          setApiCycle(null);
          setApiResults(null);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeEvaluator) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (canSwitchEvaluator) params.set("evaluator", activeEvaluator);
    if (currentCycle?.id) params.set("cycleId", currentCycle.id);
    fetch(`/api/scoring360/my-tasks?${params.toString()}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setApiTasks(Array.isArray(payload.tasks) ? payload.tasks : null);
      })
      .catch(() => {
        if (!cancelled) setApiTasks(null);
      });
    return () => { cancelled = true; };
  }, [activeEvaluator, canSwitchEvaluator, currentCycle?.id, tasksReloadKey]);

  function taskScore(assignmentId: string, fallback: number | null) {
    return draftScores[assignmentId] ?? fallback ?? 90;
  }

  async function submitScores() {
    const scores = myAssignments
      .filter((assignment) => draftScores[assignment.id] !== undefined && !isLocked(assignment.submittedAt))
      .map((assignment) => ({ assignmentId: assignment.id, score: draftScores[assignment.id] }));
    if (scores.length === 0) return;
    setSubmitState("saving");
    try {
      const response = await fetch("/api/scoring360/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cycleId: currentCycle?.id, scores }),
      });
      if (!response.ok) throw new Error("save_failed");
      setSubmitState("saved");
      setApiTasks(null);
      setTasksReloadKey((value) => value + 1);
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <div className="page-stack">
      <section className="score-overview-grid">
        <article className="panel score-kpi-card">
          <span className="section-label">Weekly Quality</span>
          <strong>{formatScore(weeklyAverage)}</strong>
          <p>周报质量均分 · {weeklyEmployees.length} 人可见</p>
        </article>
        <article className="panel score-kpi-card">
          <span className="section-label">Collaboration 360</span>
          <strong>{formatScore(collaborationAverage)}</strong>
          <p>{currentCycle?.label || "协同评分"} · {currentCycle?.progressPct ?? 0}% 完成</p>
        </article>
        <article className="panel score-kpi-card">
          <span className="section-label">Growth Composite</span>
          <strong>{formatScore(compositeAverage)}</strong>
          <p>暂按周报 60% + 协同 40% 形成成长参考</p>
        </article>
      </section>

      <section className="panel full-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Growth Score</span>
            <h2>成长评分中心</h2>
          </div>
          <div className="score-tabs" role="tablist" aria-label="成长评分视图">
            <button className={activeTab === "weekly" ? "is-active" : ""} type="button" onClick={() => setActiveTab("weekly")}>
              <Trophy size={15} />周报质量
            </button>
            <button className={activeTab === "collaboration" ? "is-active" : ""} type="button" onClick={() => setActiveTab("collaboration")}>
              <UsersRound size={15} />协同360结果
            </button>
            <button className={activeTab === "my360" ? "is-active" : ""} type="button" onClick={() => setActiveTab("my360")}>
              <ClipboardList size={15} />我要评分
            </button>
          </div>
        </div>

        {activeTab === "weekly" ? (
          <WeeklyQualityTable employees={weeklyEmployees} />
        ) : null}

        {activeTab === "collaboration" ? (
          <Collaboration360Table results={collaborationResults} top360={top360} />
        ) : null}

        {activeTab === "my360" ? (
          <div className="scoring-workbench">
            <div className="scoring-toolbar">
              <div>
                <span className="section-label">Scoring Tasks</span>
                <h3>{currentCycle?.label || "协同360评分"}</h3>
              </div>
              {canSwitchEvaluator ? (
                <select value={selectedEvaluator} onChange={(event) => setSelectedEvaluator(event.target.value)}>
                  {evaluatorOptions.map((name) => (
                    <option value={name} key={name}>{name}</option>
                  ))}
                </select>
              ) : (
                <div className="score-identity-pill">我的评分任务：{activeEvaluator || "当前账号"}</div>
              )}
            </div>
            <div className="scoring360-task-brief">
              <div>
                <span>评分意义</span>
                <strong>看见协作贡献，也发现协作孤岛</strong>
                <p>协同 360 不是人情分，而是帮助团队把“谁在推动别人成功、谁需要被支持”变得可见。</p>
              </div>
              <div>
                <span>完成窗口</span>
                <strong>启动后 24 小时内完成</strong>
                <p>48 小时仍未完成会收到一次飞书提醒；后续可改为两周一评。</p>
              </div>
              <div>
                <span>滚动计算</span>
                <strong>历史 {Math.round((currentCycle?.historicalWeight ?? 0.3) * 100)}% + 当期 {Math.round((currentCycle?.currentWeight ?? 0.7) * 100)}%</strong>
                <p>页面同时展示上期分、当期均分和滚动协同分，避免一次评分决定长期判断。</p>
              </div>
            </div>
            <div className="scoring-task-list">
              {myAssignments.length === 0 ? (
                <p className="empty-state">当前人员暂无评分任务。</p>
              ) : myAssignments.map((assignment) => (
                <article className="scoring-task-row" key={assignment.id}>
                  <div>
                    <strong>{assignment.evaluee}</strong>
                    <span>{assignment.submitted ? `已提交 ${assignment.score} 分` : "待评分"}{isLocked(assignment.submittedAt) ? " · 已锁定" : ""}</span>
                  </div>
                  <label>
                    <SlidersHorizontal size={15} />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={taskScore(assignment.id, assignment.score)}
                      disabled={isLocked(assignment.submittedAt)}
                      onChange={(event) => setDraftScores((current) => ({ ...current, [assignment.id]: Number(event.target.value) }))}
                    />
                    <b>{taskScore(assignment.id, assignment.score)}</b>
                  </label>
                </article>
              ))}
            </div>
            <div className="score-submit-bar">
              <p>
                评分提交后 4 小时内可修改；后续周维度会从这里延展，不再需要 HRBP 单独维护一个孤立系统。
              </p>
              <button className="primary-button" type="button" onClick={submitScores} disabled={submitState === "saving"}>
                {submitState === "saved" ? <CheckCircle2 size={16} /> : <Send size={16} />}
                <span>{submitState === "saving" ? "提交中" : submitState === "saved" ? "已提交" : "提交评分"}</span>
              </button>
            </div>
            {submitState === "error" ? <p className="form-error">提交失败，请确认已通过飞书 SSO 登录且当前账号有评分任务。</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WeeklyQualityTable({ employees }: { employees: typeof appData.employeeSummary }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>排名</th>
            <th>姓名</th>
            <th>部门</th>
            <th>均分</th>
            <th>等级</th>
            <th>趋势</th>
            <th>迟交</th>
            <th>弱问题周数</th>
            <th>成长判断</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee, index) => (
            <tr key={employee.name}>
              <td>{index + 1}</td>
              <td>{employee.name}</td>
              <td>{employee.department}</td>
              <td>{employee.averageScore}</td>
              <td><ScoreBadge level={employee.level} /></td>
              <td>{employee.trend > 0 ? `+${employee.trend}` : employee.trend}</td>
              <td>{employee.lateCount}</td>
              <td>{employee.weakProblemWeeks}</td>
              <td>{employee.growthSummary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Collaboration360Table({ results, top360 }: { results: Scoring360Result[]; top360: Scoring360Result[] }) {
  return (
    <div className="scoring360-layout">
      <aside className="scoring360-top">
        <span className="section-label">Top 5</span>
        <h3>协同认可样本</h3>
        {top360.map((item, index) => (
          <div className="scoring360-top-row" key={item.name}>
            <b>{index + 1}</b>
            <span>{item.name}</span>
            <strong>{formatScore(item.rollingScore ?? item.averageScore)}</strong>
          </div>
        ))}
      </aside>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>姓名</th>
              <th>应评</th>
              <th>已评</th>
              <th>完成率</th>
              <th>上期分</th>
              <th>当期均分</th>
              <th>滚动协同分</th>
              <th>等级</th>
              <th>最低/最高</th>
              <th>评价人</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={result.name}>
                <td>{index + 1}</td>
                <td>{result.name}</td>
                <td>{result.expected}</td>
                <td>{result.submitted}</td>
                <td>{result.completionRate}%</td>
                <td>{formatScore(result.previousScore ?? null)}</td>
                <td>{formatScore(result.averageScore)}</td>
                <td><strong>{formatScore(result.rollingScore ?? result.averageScore)}</strong></td>
                <td>{scoreLevel(result.rollingScore ?? result.averageScore)}</td>
                <td>{formatScore(result.minScore)} / {formatScore(result.maxScore)}</td>
                <td>{result.evaluators.slice(0, 8).join("、")}{result.evaluators.length > 8 ? "..." : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
