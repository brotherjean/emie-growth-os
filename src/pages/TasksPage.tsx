import { useEffect, useMemo, useState } from "react";
import { PriorityBadge } from "../components/PriorityBadge";
import { appData, attentionQueueForInsights, insightsForPeriod, priorityRank } from "../lib/data";
import { truncate } from "../lib/format";

interface TasksPageProps {
  selectedPeriodId: string;
  taskCreated: boolean;
  onCreateTasks: () => void;
}

interface FeishuTaskRow {
  guid: string;
  candidateId?: string;
  summary: string;
  assigneeOpenId?: string;
  dueDate?: string;
  url?: string;
  status: "created" | "updated" | "commented" | "completed" | "deleted" | string;
  createdAt?: string;
  updatedAt?: string;
}

export function TasksPage({ selectedPeriodId, taskCreated, onCreateTasks }: TasksPageProps) {
  const [feishuTasks, setFeishuTasks] = useState<FeishuTaskRow[]>([]);
  const [taskLedgerState, setTaskLedgerState] = useState<"loading" | "ready" | "error">("loading");
  const periodInsights = insightsForPeriod(selectedPeriodId);
  const periodAttentionQueue = attentionQueueForInsights(periodInsights);

  useEffect(() => {
    let ignore = false;
    async function loadTasks() {
      setTaskLedgerState("loading");
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("load_tasks_failed");
        const result = await response.json();
        if (!ignore) {
          setFeishuTasks(Array.isArray(result.tasks) ? result.tasks : []);
          setTaskLedgerState("ready");
        }
      } catch {
        if (!ignore) setTaskLedgerState("error");
      }
    }
    loadTasks();
    const timer = window.setInterval(loadTasks, 30000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [taskCreated]);

  const kimiEmployeeTasks = periodInsights.employeeInsights.flatMap((insight) => insight.taskCandidates);
  const employeeTaskRows = kimiEmployeeTasks.length > 0
    ? kimiEmployeeTasks.map((task) => ({
        priority: task.priority,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        theme: task.contextNeed || "AI 拆解任务",
        person: task.source || task.owner,
        lane: "同事闭环",
        evidence: task.evidence,
      }))
    : appData.employeeTasks.map((task) => ({
        priority: task.priority,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        theme: task.theme,
        person: task.source,
        lane: "同事闭环",
        evidence: task.evidence,
      }));
  const allTasks = [
    ...periodAttentionQueue.map((task) => ({ ...task, lane: "老板关注", person: task.source })),
    ...employeeTaskRows,
  ].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const createText = taskCreated ? `已确认 ${feishuTasks.length} 个飞书任务` : "批量创建已确认任务";
  const taskStats = useMemo(() => {
    const completed = feishuTasks.filter((task) => task.status === "completed").length;
    const active = feishuTasks.filter((task) => !["completed", "deleted"].includes(task.status)).length;
    const commented = feishuTasks.filter((task) => task.status === "commented").length;
    return { active, completed, commented };
  }, [feishuTasks]);

  return (
    <div className="page-stack">
      <section className="panel full-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Action System</span>
            <h2>周报问题到飞书任务</h2>
          </div>
          <button className={`primary-button ${taskCreated ? "is-confirmed" : ""}`} type="button" onClick={onCreateTasks}>
            {createText}
          </button>
        </div>
        <div className="task-board">
          {["老板关注", "同事闭环"].map((lane) => (
            <div className="task-column" key={lane}>
              <h3>{lane}</h3>
              {allTasks.filter((task) => task.lane === lane).slice(0, 16).map((task) => (
                <div className="task-card" key={`${lane}-${task.title}`}>
                  <div className="task-card-top">
                    <PriorityBadge priority={task.priority} />
                    <span>{task.person}</span>
                  </div>
                  <strong>{task.title}</strong>
                  <p>{truncate(task.description, 120)}</p>
                  <small>{task.dueDate || "待定截止日"} · {task.theme}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="panel full-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Task Ledger</span>
            <h2>已创建飞书任务闭环台账</h2>
          </div>
          <span className="task-ledger-state">
            {taskLedgerState === "loading" ? "同步中" : taskLedgerState === "error" ? "同步失败" : `进行中 ${taskStats.active} · 已完成 ${taskStats.completed}`}
          </span>
        </div>
        <div className="task-ledger-hint">
          <span>这里会收拢从个人周报页创建出来的真实飞书任务。任务创建是第一次闭环；只有飞书任务完成、评论推进和状态回传后，问题才算真正闭环结束。</span>
          <strong>当前查看周期：{selectedPeriodId}</strong>
          {taskStats.commented ? <strong>{taskStats.commented} 个任务最近有评论事件</strong> : null}
        </div>
        <div className="task-ledger-list">
          {feishuTasks.length === 0 ? (
            <div className="task-ledger-empty">还没有读取到已创建任务。创建成功后，这里会显示飞书任务 GUID、状态和链接。</div>
          ) : (
            feishuTasks.map((task) => (
              <div className="task-ledger-row" key={task.guid}>
                <div>
                  <span className={`task-status status-${task.status}`}>{statusLabel(task.status)}</span>
                  <strong>{task.summary}</strong>
                  <p>{task.assigneeOpenId ? `负责人 open_id：${task.assigneeOpenId}` : "负责人待解析"} · {task.updatedAt || task.createdAt || "等待回传"}</p>
                </div>
                {task.url ? (
                  <a href={task.url} target="_blank" rel="noreferrer">打开飞书任务</a>
                ) : (
                  <span className="task-guid">{task.guid}</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: FeishuTaskRow["status"]) {
  if (status === "completed") return "已完成";
  if (status === "commented") return "有评论";
  if (status === "updated") return "有进展";
  if (status === "deleted") return "已删除";
  return "已创建";
}
