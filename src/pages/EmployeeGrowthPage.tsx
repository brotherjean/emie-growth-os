import { useState } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  CheckSquare2,
  Database,
  Globe2,
  Lightbulb,
  LockKeyhole,
  MessageCircleQuestion,
  MessageSquarePlus,
  Repeat2,
  Send,
  Sparkles,
  Square,
  Target,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import { PriorityBadge } from "../components/PriorityBadge";
import { RadarChart, Sparkline } from "../components/SimpleCharts";
import {
  appData,
  closureForEmployee,
  feedbackForEmployee,
  insightForEmployee,
  kimiTaskCandidatesForEmployee,
  reportPeriods,
  scoring360ResultForEmployee,
  tasksForEmployee,
  weeklyForEmployee,
} from "../lib/data";
import { truncate } from "../lib/format";
import type { ClosureStatus, EmployeeSummary, EmployeeTask, VisibleEmployee, WeeklyScore } from "../lib/types";

interface EmployeeGrowthPageProps {
  selectedPeriodId: string;
  selectedEmployee: string;
  onSelectEmployee: (name: string) => void;
  externalView?: boolean;
  visibleEmployees?: VisibleEmployee[];
}

function radarFor(employee: EmployeeSummary) {
  return [
    { label: "结果", value: employee.averageScore + 4 },
    { label: "问题意识", value: 100 - employee.weakProblemWeeks * 8 },
    { label: "复盘", value: employee.averageScore },
    { label: "协作", value: employee.level === "A" ? 88 : 74 },
    { label: "心性", value: employee.lateCount === 0 ? 84 : 72 },
    { label: "计划", value: employee.averageScore - 2 },
  ];
}

const closureStatusLabel: Record<ClosureStatus, string> = {
  closed: "已闭环",
  partial: "部分闭环",
  explained_delay: "延期有解释",
  no_evidence: "无证据",
  repeated_loop: "重复空转",
};

function closureStatusTone(status?: ClosureStatus) {
  if (status === "closed") return "is-good";
  if (status === "partial" || status === "explained_delay") return "is-watch";
  return "is-risk";
}

interface TaskCandidate {
  id: string;
  priority: EmployeeTask["priority"];
  source: string;
  department: string;
  title: string;
  description: string;
  owner: string;
  ownerOpenId?: string;
  dueDate: string;
  metric: string;
  evidence: string;
  aiIntent?: string;
  firstStep?: string;
  supportNeeded?: string;
  contextNeed?: string;
  defaultSelected: boolean;
}

interface AiChatMessage {
  id?: string;
  role: "user" | "assistant";
  body: string;
  authorName?: string;
  createdAt?: string;
  provider?: string;
  model?: string;
}

interface CandidateEdit {
  title: string;
  description: string;
  dueDate: string;
  dueDateTouched?: boolean;
  metric: string;
  evidence: string;
}

const COLLAPSED_RESULT_LENGTH = 300;
const COLLAPSED_PROBLEM_LENGTH = 220;

function weekCardId(week: WeeklyScore) {
  return `${week.name}-${week.week}`;
}

function normalizeAiMessages(value: unknown): AiChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<AiChatMessage[]>((messages, item) => {
      if (!item || typeof item !== "object") return messages;
      const record = item as Record<string, unknown>;
      const role = record.role === "user" ? "user" : "assistant";
      const body = String(record.body || "").trim();
      if (!body) return messages;
      messages.push({
        id: String(record.id || ""),
        role,
        body,
        authorName: String(record.authorName || ""),
        createdAt: String(record.createdAt || ""),
        provider: String(record.provider || ""),
        model: String(record.model || ""),
      });
      return messages;
    }, []);
}

function aiFollowupErrorMessage(errorCode: string) {
  if (errorCode === "external_share_readonly") {
    return "当前是外部顾问只读视图，不能提交追问。请退出只读视图并用飞书 SSO 登录后再试。你的输入已恢复到输入框。";
  }
  if (errorCode === "unauthorized") {
    return "当前登录状态已失效，请重新登录后再发送。你的输入已恢复到输入框。";
  }
  if (errorCode === "kimi_not_configured") {
    return "服务器还没有配置 Kimi API Key，暂时不能实时追问。你的输入已恢复到输入框。";
  }
  return "Kimi 实时追问暂时没有返回成功。你的输入已恢复到输入框，可以稍后重试，或先把这个问题写进任务评论里作为需要补充的上下文。";
}

function formatWeekPeriod(value: string) {
  const text = String(value || "").trim();
  if (!text) return "周报";
  const monthMatch = text.match(/(\d{1,2})月/);
  const weekMatch = text.match(/第([一二三四五六七八九十\d]+)周/);
  if (monthMatch && weekMatch) {
    const month = monthMatch[1].padStart(2, "0");
    const week = chineseWeekNumber(weekMatch[1]);
    return `${month}W${week}`;
  }
  return text.split(/\s+/)[0] || text;
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

function splitTaskIntoCandidates(task: EmployeeTask, index: number): TaskCandidate[] {
  const owner = task.assignee || task.source;
  const dueDate = task.dueDate || "下周五";
  const evidence = truncate(task.evidence || task.description, 96);

  return [
    {
      id: `${task.source}-${index}-clarify`,
      priority: task.priority,
      source: task.source,
      department: task.department,
      title: `明确「${task.theme}」现状与影响范围`,
      description: "把当前状态、影响对象、卡住的具体环节写成 3 条事实，避免把整段周报直接变成任务。",
      owner,
      ownerOpenId: task.assigneeOpenId,
      dueDate,
      metric: "形成一页现状说明，至少包含 1 个数据或具体案例。",
      evidence,
      aiIntent: "把模糊卡点变成可讨论、可验证、可升级的事实清单。",
      firstStep: "今天先写出 3 条事实：发生了什么、影响谁、卡在哪个环节。",
      supportNeeded: `请 ${owner} 先确认事实口径，必要时升级给直属 Leader。`,
      contextNeed: "个人近几周相关周报、同部门类似卡点、公司已有 SOP。",
      defaultSelected: task.priority !== "P2",
    },
    {
      id: `${task.source}-${index}-next-action`,
      priority: task.priority,
      source: task.source,
      department: task.department,
      title: "拆出下周第一个可验证动作",
      description: "从周报里的想法中提炼一个能在 3 个工作日内完成的动作，并指定协作者或支持人。",
      owner,
      ownerOpenId: task.assigneeOpenId,
      dueDate,
      metric: "动作完成后能回传截图、链接、会议结论或飞书任务状态。",
      evidence,
      aiIntent: "让意图从“我要推进”变成“我先完成一个可以被验证的小动作”。",
      firstStep: "把目标缩小到 3 天内能完成的一件事，并在飞书任务里写清验收物。",
      supportNeeded: "找直接协作者确认输入和验收方式。",
      contextNeed: "任务对应周报原文、上周未闭环承诺、相关客户/项目背景。",
      defaultSelected: true,
    },
    {
      id: `${task.source}-${index}-measure`,
      priority: task.priority === "P0" ? "P1" : task.priority,
      source: task.source,
      department: task.department,
      title: "补齐衡量指标与复盘口径",
      description: "把“做了”升级成“做到什么程度”，明确验收指标、完成口径和下周复盘问题。",
      owner,
      ownerOpenId: task.assigneeOpenId,
      dueDate: "下次周报前",
      metric: "下周周报能直接回答：完成了吗、结果如何、还卡在哪里。",
      evidence,
      aiIntent: "把任务从过程汇报升级为结果闭环。",
      firstStep: "先写一个可量化或可截图验收的指标。",
      supportNeeded: "请 Leader 帮忙判断指标是否足够贴近业务结果。",
      contextNeed: "历史评分趋势、同类优秀周报样本、部门共性问题。",
      defaultSelected: task.priority === "P0" || index === 0,
    },
  ];
}

function mapKimiCandidate(candidate: ReturnType<typeof kimiTaskCandidatesForEmployee>[number], index: number): TaskCandidate {
  return {
    ...candidate,
    id: candidate.id || `${candidate.source}-${index}`,
    defaultSelected: candidate.priority !== "P2" || index < 2,
  };
}

export function EmployeeGrowthPage({ selectedPeriodId, selectedEmployee, onSelectEmployee, externalView = false, visibleEmployees = [] }: EmployeeGrowthPageProps) {
  const [commentDraft, setCommentDraft] = useState("");
  const [socialState, setSocialState] = useState<
    Record<string, { liked: boolean; published: boolean; likes: number; comments: string[] }>
  >({});
  const [candidateSelection, setCandidateSelection] = useState<Record<string, boolean>>({});
  const [candidateEdits, setCandidateEdits] = useState<Record<string, CandidateEdit>>({});
  const [createdCandidateIds, setCreatedCandidateIds] = useState<Record<string, boolean>>({});
  const [validatedCandidateIds, setValidatedCandidateIds] = useState<Record<string, boolean>>({});
  const [aiAdviceCandidateId, setAiAdviceCandidateId] = useState<string | null>(null);
  const [aiChatDrafts, setAiChatDrafts] = useState<Record<string, string>>({});
  const [aiChatThreads, setAiChatThreads] = useState<Record<string, AiChatMessage[]>>({});
  const [aiChatLoadingIds, setAiChatLoadingIds] = useState<Record<string, boolean>>({});
  const [expandedWeekIds, setExpandedWeekIds] = useState<Record<string, boolean>>({});
  const [taskCreateState, setTaskCreateState] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [taskCreateMessage, setTaskCreateMessage] = useState("");
  const visibleNames = new Set(visibleEmployees.map((item) => item.name).filter(Boolean));
  const employeeOptions = visibleNames.size > 0
    ? appData.employeeSummary.filter((item) => visibleNames.has(item.name))
    : appData.employeeSummary;
  const employee = employeeOptions.find((item) => item.name === selectedEmployee) ?? employeeOptions[0] ?? appData.employeeSummary[0];
  const closureInsight = closureForEmployee(employee.name);
  const latestClosure = closureInsight?.latestPair;
  const collaboration360 = scoring360ResultForEmployee(employee.name);
  const selectedPeriod = reportPeriods.find((period) => period.id === selectedPeriodId) ?? reportPeriods.at(-1);
  const isCurrentPeriod = selectedPeriodId === appData.currentWeekId || selectedPeriod?.id === appData.currentWeekId;
  const chronologicalWeeks = weeklyForEmployee(employee.name).filter((week) => /^\d+月第/.test(week.week));
  const selectedWeek = selectedPeriod ? weeklyForEmployee(employee.name, selectedPeriod.id)[0] : chronologicalWeeks.at(-1);
  const growthTrendWeeks = chronologicalWeeks.slice(-8);
  const weeks = [...chronologicalWeeks].reverse();
  const tasks = tasksForEmployee(employee.name).slice(0, 5);
  const insightPeriodId = selectedPeriod?.id || selectedPeriodId;
  const employeeInsight = insightForEmployee(employee.name, insightPeriodId);
  const kimiCandidates = kimiTaskCandidatesForEmployee(employee.name, insightPeriodId).map(mapKimiCandidate);
  const taskCandidates = (kimiCandidates.length > 0 ? kimiCandidates : isCurrentPeriod ? tasks.flatMap(splitTaskIntoCandidates) : []).slice(0, 9);
  const sourceClueCount = kimiCandidates.length > 0
    ? new Set(kimiCandidates.map((candidate) => candidate.evidence || candidate.title)).size
    : tasks.length;
  const selectedCandidates = taskCandidates
    .filter((candidate) => candidateSelection[candidate.id] ?? candidate.defaultSelected)
    .map((candidate) => editedCandidate(candidate));
  const createdCount = taskCandidates.filter((candidate) => createdCandidateIds[candidate.id]).length;
  const validatedCount = taskCandidates.filter((candidate) => validatedCandidateIds[candidate.id] && !createdCandidateIds[candidate.id]).length;
  const aiAdviceCandidate = taskCandidates.find((candidate) => candidate.id === aiAdviceCandidateId);
  const feedback = feedbackForEmployee(employee.name);
  const defaultSocial = {
    liked: false,
    published: false,
    likes: employee.level === "A" ? 18 : employee.level === "A-" ? 12 : 6,
    comments: [
      `直属负责人：这周的关键是把卡点说清楚，下一步请把需要管理者介入的节点写成明确截止日。`,
      `同部门同事：这个客户转化复盘很有参考价值，建议沉淀成一页案例。`,
    ],
  };
  const social = socialState[employee.name] ?? defaultSocial;

  function patchSocial(next: Partial<typeof defaultSocial>) {
    setSocialState((current) => ({
      ...current,
      [employee.name]: {
        ...(current[employee.name] ?? defaultSocial),
        ...next,
      },
    }));
  }

  function toggleWeekCard(id: string) {
    setExpandedWeekIds((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function submitComment() {
    const text = commentDraft.trim();
    if (!text) return;
    patchSocial({ comments: [...social.comments, `我：${text}`] });
    setCommentDraft("");
    void fetch("/api/social/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "weekly_report",
        targetId: `weekly:${employee.openId || employee.name}`,
        employeeName: employee.name,
        employeeOpenId: employee.openId,
        body: text,
      }),
    }).catch(() => {
      // Local UI comment is still useful if persistence is temporarily unavailable.
    });
  }

  function toggleLike() {
    const nextLiked = !social.liked;
    patchSocial({ liked: nextLiked, likes: social.likes + (social.liked ? -1 : 1) });
    if (!nextLiked) return;
    void fetch("/api/social/reaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "weekly_report",
        targetId: `weekly:${employee.openId || employee.name}`,
        employeeName: employee.name,
        employeeOpenId: employee.openId,
        reactionType: "like",
      }),
    }).catch(() => {
      // The visual like state is optimistic; notification sync can retry later.
    });
  }

  function toggleCandidate(id: string, fallback: boolean) {
    setCandidateSelection((current) => ({
      ...current,
      [id]: !(current[id] ?? fallback),
    }));
  }

  function editedCandidate(candidate: TaskCandidate): TaskCandidate {
    const edit = candidateEdits[candidate.id];
    if (!edit) return candidate;
    return {
      ...candidate,
      title: edit.title.trim() || candidate.title,
      description: edit.description.trim() || candidate.description,
      dueDate: edit.dueDate.trim(),
      metric: edit.metric.trim() || candidate.metric,
      evidence: edit.evidence.trim() || candidate.evidence,
    };
  }

  function updateCandidateEdit(candidate: TaskCandidate, field: Exclude<keyof CandidateEdit, "dueDateTouched">, value: string) {
    setCandidateEdits((current) => {
      const existing = current[candidate.id] || {
        title: candidate.title,
        description: candidate.description,
        dueDate: candidate.dueDate,
        metric: candidate.metric,
        evidence: candidate.evidence,
      };
      return {
        ...current,
        [candidate.id]: {
          ...existing,
          [field]: value,
          dueDateTouched: field === "dueDate" ? true : existing.dueDateTouched,
        },
      };
    });
  }

  async function createSelectedTasks() {
    if (!isCurrentPeriod) {
      setTaskCreateState("error");
      setTaskCreateMessage("历史周期只做回看，不直接创建飞书任务；请切回当前周期后创建最新任务。");
      return;
    }
    if (selectedCandidates.length === 0 || taskCreateState === "creating") return;
    setTaskCreateState("creating");
    try {
      const response = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidates: selectedCandidates.map((candidate) => ({
            id: candidate.id,
            priority: candidate.priority,
            title: candidate.title,
            description: candidate.description,
            ownerOpenId: candidate.ownerOpenId,
            dueDate: candidate.dueDate,
            useDueDate: Boolean(candidateEdits[candidate.id]?.dueDateTouched && candidate.dueDate.trim()),
            metric: candidate.metric,
            evidence: candidate.evidence,
            firstStep: candidate.firstStep,
            contextNeed: candidate.contextNeed,
          })),
        }),
      });
      if (!response.ok) throw new Error("create_tasks_failed");
      const result = await response.json();
      const dryRun = result?.taskCreateEnabled === false || result?.results?.some((item: { dryRun?: boolean }) => item.dryRun);
      if (dryRun) {
        setValidatedCandidateIds((current) => {
          const next = { ...current };
          selectedCandidates.forEach((candidate) => {
            next[candidate.id] = true;
          });
          return next;
        });
      } else {
        setCreatedCandidateIds((current) => {
          const next = { ...current };
          selectedCandidates.forEach((candidate) => {
            next[candidate.id] = true;
          });
          return next;
        });
      }
      setTaskCreateState("done");
      setTaskCreateMessage(
        dryRun
          ? `已完成 ${selectedCandidates.length} 个任务创建校验；真实创建开关未开启，当前登录人会作为关注者和创建人写入请求。`
          : `已创建 ${selectedCandidates.length} 个飞书任务；当前登录人已作为创建者拥有编辑权，并自动加入关注者。`,
      );
    } catch {
      setTaskCreateState("error");
      setTaskCreateMessage("任务接口暂未成功，请确认后端服务、飞书权限和登录状态。");
    }
  }

  function askAi(candidate?: TaskCandidate) {
    const nextCandidate = candidate ?? selectedCandidates[0] ?? taskCandidates[0];
    if (!nextCandidate) return;
    setAiAdviceCandidateId((current) => {
      if (current === nextCandidate.id) return null;
      void loadAiFollowups(nextCandidate.id);
      return nextCandidate.id;
    });
  }

  async function loadAiFollowups(candidateId: string) {
    try {
      const response = await fetch(`/api/ai/followups?candidateId=${encodeURIComponent(candidateId)}`);
      if (!response.ok) return;
      const result = await response.json();
      const messages = normalizeAiMessages(result.messages);
      if (messages.length === 0) return;
      setAiChatThreads((current) => ({ ...current, [candidateId]: messages }));
    } catch {
      // Persisted follow-up history is helpful, but the panel can still work without it.
    }
  }

  async function submitAiFollowup(candidate: TaskCandidate) {
    const text = (aiChatDrafts[candidate.id] || "").trim();
    if (!text || aiChatLoadingIds[candidate.id]) return;
    if (externalView) {
      setAiChatThreads((current) => ({
        ...current,
        [candidate.id]: [
          ...(current[candidate.id] || []),
          {
            role: "assistant",
            body: "当前是外部顾问只读视图，不能提交追问。请退出只读视图并用飞书 SSO 登录后再试。",
          },
        ],
      }));
      return;
    }
    const existingMessages = aiChatThreads[candidate.id] || [];
    const nextMessages: AiChatMessage[] = [...existingMessages, { role: "user", body: text }];
    setAiChatThreads((current) => ({ ...current, [candidate.id]: nextMessages }));
    setAiChatDrafts((current) => ({ ...current, [candidate.id]: "" }));
    setAiChatLoadingIds((current) => ({ ...current, [candidate.id]: true }));
    try {
      const response = await fetch("/api/ai/followup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeName: employee.name,
          employeeOpenId: employee.openId,
          candidate,
          question: text,
          messages: nextMessages,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "kimi_followup_failed");
      const answer = String(result.answer || "").trim();
      if (!answer) throw new Error("empty_kimi_answer");
      const persistedMessages = normalizeAiMessages(result.messages);
      setAiChatThreads((current) => ({
        ...current,
        [candidate.id]:
          persistedMessages.length > 0
            ? [...existingMessages, ...persistedMessages]
            : [...(current[candidate.id] || nextMessages), { role: "assistant", body: answer, authorName: "Kimi" }],
      }));
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "kimi_followup_failed";
      setAiChatDrafts((current) => ({ ...current, [candidate.id]: text }));
      setAiChatThreads((current) => ({
        ...current,
        [candidate.id]: [
          ...(current[candidate.id] || nextMessages),
          {
            role: "assistant",
            body: aiFollowupErrorMessage(errorCode),
          },
        ],
      }));
    } finally {
      setAiChatLoadingIds((current) => ({ ...current, [candidate.id]: false }));
    }
  }

  function renderAiAdvicePanel(candidate: TaskCandidate) {
    const messages = aiChatThreads[candidate.id] || [
      {
        role: "assistant" as const,
        body: `我已经带入了当前任务、周报证据和上下文。你可以继续追问执行步骤、支持对象、验收指标或风险拆解。`,
      },
    ];
    const draft = aiChatDrafts[candidate.id] || "";
    const loading = Boolean(aiChatLoadingIds[candidate.id]);
    return (
      <div className="ai-solution-panel is-inline">
        <div className="ai-solution-heading">
          <div>
            <span className="section-label">Kimi K2.6 Context Pack</span>
            <h3>{candidate.title}</h3>
          </div>
          <span>Kimi 方案草稿</span>
        </div>
        <div className="context-source-row">
          <span><Target size={14} />当前任务候选</span>
          <span><BookOpen size={14} />个人近 9 周周报</span>
          <span><Database size={14} />公司知识库</span>
        </div>
        <div className="ai-plan-grid">
          <div>
            <strong><Lightbulb size={15} /> AI 先帮你定意图</strong>
            <p>
              {candidate.aiIntent ||
                `这个任务不是“继续研究一下”，而是要把「${candidate.title}」变成一个可验证闭环：先讲清现状，再确认原因，最后用一个小动作拿到证据。`}
            </p>
          </div>
          <div>
            <strong>第一步怎么做</strong>
            <p>{candidate.firstStep || "今天先整理 3 条事实：发生了什么、影响谁、目前卡在哪。把事实发给相关协作者确认，不追求一次解决，先让问题从模糊变清晰。"}</p>
          </div>
          <div>
            <strong>需要谁支持</strong>
            <p>{candidate.supportNeeded || `负责人先找 ${candidate.owner} 对齐口径；如果 24 小时内无法判断下一步，就把阻塞点升级给直属 Leader 或老板。`}</p>
          </div>
          <div>
            <strong>验收口径</strong>
            <p>{candidate.metric}</p>
          </div>
        </div>
        <div className="ai-task-copy">
          <strong>可复制到飞书任务描述</strong>
          <p>
            目标：{candidate.description}
            {"\n"}背景证据：{candidate.evidence}
            {"\n"}本周动作：{candidate.firstStep || "整理现状、确认原因、输出一个可验证结果。"}
            {"\n"}上下文：{candidate.contextNeed || "个人周报历史、公司知识库、未闭环任务。"}
          </p>
        </div>
        <div className="ai-followup-panel">
          <div className="ai-followup-heading">
            <strong>继续追问</strong>
            <span>当前任务上下文</span>
          </div>
          <div className="ai-chat-thread">
            {messages.map((message, index) => (
              <div className={`ai-chat-message is-${message.role}`} key={`${candidate.id}-${message.role}-${index}`}>
                <span title={message.authorName || (message.role === "assistant" ? "AI" : "我")}>
                  {message.role === "assistant" ? "AI" : (message.authorName || "我").slice(0, 1)}
                </span>
                <div className="ai-chat-message-body">
                  <small>{message.role === "assistant" ? `${message.authorName || "Kimi"} 的建议` : `${message.authorName || "我"} 的追问`}</small>
                  <p>{message.body}</p>
                </div>
              </div>
            ))}
            {loading ? (
              <div className="ai-chat-message is-assistant is-loading">
                <span>AI</span>
                <p>Kimi 正在读取当前任务、周报证据和追问上下文...</p>
              </div>
            ) : null}
          </div>
          <form
            className="ai-chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitAiFollowup(candidate);
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setAiChatDrafts((current) => ({ ...current, [candidate.id]: event.target.value }))}
              placeholder={externalView ? "外部顾问只读视图不能追问，退出只读后可继续提问。" : "继续问：第一步怎么做？需要谁支持？验收指标怎么定？"}
              disabled={externalView}
            />
            <button type="submit" disabled={!draft.trim() || loading || externalView}>
              <Send size={15} />
              <span>{externalView ? "只读" : loading ? "思考中" : "发送"}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="employee-toolbar">
        <div>
          <span className="section-label">Personal Growth</span>
          <h2>{employee.name} · {employee.department}</h2>
        </div>
        <select value={employee.name} onChange={(event) => onSelectEmployee(event.target.value)}>
          {employeeOptions.map((item) => (
            <option value={item.name} key={item.name}>
              {item.name} · {item.department}
            </option>
          ))}
        </select>
      </section>

      <section className="personal-grid">
        <article className="panel profile-score">
          <div className="profile-avatar">{employee.name.slice(0, 1)}</div>
          <div>
            <span>周报成长评分</span>
            <strong>{employee.averageScore}</strong>
            <p>{employee.level} · {employee.reportCount} 周记录 · 迟交 {employee.lateCount}</p>
          </div>
          <Sparkline
            values={growthTrendWeeks.map((week) => week.total)}
            labels={growthTrendWeeks.map((week) => formatWeekPeriod(week.week))}
            showPoints
          />
        </article>

        <article className="panel radar-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Growth Radar</span>
              <h2>能力与意识成长</h2>
            </div>
            <TrendingUp size={18} />
          </div>
          <RadarChart axes={radarFor(employee)} />
        </article>

        <article className="panel collaboration360-card">
          <div>
            <span className="section-label">Collaboration 360</span>
            <h2>协同评分</h2>
          </div>
          {collaboration360 ? (
            <>
              <strong>{collaboration360.averageScore ?? "-"}</strong>
              <p>
                {collaboration360.level} · {collaboration360.submitted}/{collaboration360.expected} 已评 · 完成率 {collaboration360.completionRate}%
              </p>
              <div className="collaboration360-range">
                <span>最低 {collaboration360.minScore ?? "-"}</span>
                <span>最高 {collaboration360.maxScore ?? "-"}</span>
              </div>
            </>
          ) : (
            <p>当前周期暂无协同评分记录。</p>
          )}
        </article>

        <article className="panel closure-card">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Week Over Week</span>
              <h2>上周承诺闭环卡</h2>
            </div>
            <Repeat2 size={18} />
          </div>
          {closureInsight && latestClosure ? (
            <>
              <div className="closure-score-row">
                <strong>{closureInsight.score}</strong>
                <span className={`closure-status ${closureStatusTone(latestClosure.status)}`}>
                  {closureStatusLabel[latestClosure.status]}
                </span>
                <em>{closureInsight.persona}</em>
              </div>
              <div className="closure-evidence-grid">
                <div>
                  <span>上周承诺</span>
                  <p>{latestClosure.previousPlan || "上周计划不够明确。"}</p>
                </div>
                <div>
                  <span>本周证据</span>
                  <p>{latestClosure.currentEvidence ? truncate(latestClosure.currentEvidence, 180) : "本周缺少回应证据。"}</p>
                </div>
              </div>
              <div className="closure-judgement">
                <strong>{latestClosure.signal}</strong>
                <p>{latestClosure.nextStep}</p>
              </div>
              <div className="closure-mini-stats">
                <span>闭环 {closureInsight.closedCount}</span>
                <span>风险 {closureInsight.riskCount}</span>
                <span>机制 {closureInsight.mechanismCount}</span>
                <span><Brain size={13} /> AI协同 {closureInsight.aiThinkingScore}</span>
              </div>
            </>
          ) : (
            <p className="closure-empty">至少需要连续两周周报，才能判断上周计划是否被本周结果回应。</p>
          )}
        </article>

        <article className="panel ai-feedback-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">{isCurrentPeriod ? "AI Coach" : "History Review"}</span>
              <h2>{isCurrentPeriod ? "周报 AI 点评" : "历史周期周报摘要"}</h2>
            </div>
            <MessageCircleQuestion size={18} />
          </div>
          <p className="coach-body">
            {employeeInsight?.coachSummary || (isCurrentPeriod
              ? feedback?.body || employee.growthSummary
              : selectedWeek
                ? `${selectedWeek.week}：${selectedWeek.resultSummary}`
                : "该周期暂无可见周报记录。")}
          </p>
          {!isCurrentPeriod && selectedWeek?.reflectionSummary ? (
            <p className="coach-body is-secondary">{selectedWeek.reflectionSummary}</p>
          ) : null}
          <div className="coach-questions">
            {((employeeInsight?.coachQuestions?.length)
              ? employeeInsight.coachQuestions
              : [
                  selectedWeek?.problemSummary || "本周期问题暴露不足，建议补充真实卡点。",
                  selectedWeek?.nextPlanSummary || "本周期暂无下周计划摘要。",
                  "历史周报用于回看成长轨迹；当周任务候选只在最新周期生成。",
                ]
            ).slice(0, 3).map((question, index) => (
              <div key={question}>
                <strong>{index === 0 ? "教练式提问" : index === 1 ? "自我对照" : "支持请求"}</strong>
                <span>{question}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel interaction-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Current Report</span>
              <h2>本周期完整周报</h2>
            </div>
            {social.published ? <Globe2 size={18} /> : <LockKeyhole size={18} />}
          </div>
          {selectedWeek ? (
            <div className="current-report-body">
              <div>
                <strong>本周成果</strong>
                <p>{selectedWeek.resultSummary || "本周期暂无成果正文。"}</p>
              </div>
              <div>
                <strong>问题与挑战</strong>
                <p>{selectedWeek.problemSummary || "本周期暂无问题正文。"}</p>
              </div>
              <div>
                <strong>下周计划</strong>
                <p>{selectedWeek.nextPlanSummary || "本周期暂无计划正文。"}</p>
              </div>
              {selectedWeek.reflectionSummary ? (
                <div>
                  <strong>思考与复盘</strong>
                  <p>{selectedWeek.reflectionSummary}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="current-report-empty">该周期暂无可见周报原文。</p>
          )}
          <div className="panel-heading compact interaction-subheading">
            <div>
              <span className="section-label">Interaction</span>
              <h2>互动与可见性</h2>
            </div>
          </div>
          <div className="social-actions">
            <button
              className={`social-button ${social.liked ? "is-active" : ""}`}
              type="button"
              onClick={toggleLike}
            >
              <ThumbsUp size={16} />
              <span>{social.likes} 个赞</span>
            </button>
            <button
              className={`social-button ${social.published ? "is-active" : ""}`}
              type="button"
              onClick={() => patchSocial({ published: !social.published })}
            >
              {social.published ? <Globe2 size={16} /> : <LockKeyhole size={16} />}
              <span>{social.published ? "已全员可见" : "仅权限内可见"}</span>
            </button>
          </div>
          <div className="comment-list">
            {social.comments.map((comment) => (
              <p key={comment}>{comment}</p>
            ))}
          </div>
          <div className="comment-box">
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="写一条评论：可以是老板回应、同事建议，或把亮点标记给下周 AI 分析。"
            />
            <button className="primary-button" type="button" onClick={submitComment}>
              <MessageSquarePlus size={16} />
              <span>提交评论</span>
            </button>
          </div>
        </article>

        <article className="panel timeline-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Timeline</span>
              <h2>过去几周周报记录</h2>
            </div>
          </div>
          <div className="week-timeline">
            {weeks.map((week) => {
              const id = weekCardId(week);
              const expanded = Boolean(expandedWeekIds[id]);
              const problemText = week.problemSummary || "本周问题暴露不足，建议补充真实卡点。";
              const hasMore =
                week.resultSummary.length > COLLAPSED_RESULT_LENGTH ||
                problemText.length > COLLAPSED_PROBLEM_LENGTH ||
                Boolean(week.nextPlanSummary);

              return (
                <div className={`week-card ${expanded ? "is-expanded" : ""}`} key={id}>
                  <div>
                    <strong>{week.week}</strong>
                    <span>{week.status}</span>
                  </div>
                  <p>{expanded ? week.resultSummary : truncate(week.resultSummary, COLLAPSED_RESULT_LENGTH)}</p>
                  <small>{expanded ? problemText : truncate(problemText, COLLAPSED_PROBLEM_LENGTH)}</small>
                  {expanded && week.nextPlanSummary ? (
                    <small className="week-plan">
                      <b>下周计划：</b>
                      {week.nextPlanSummary}
                    </small>
                  ) : null}
                  {hasMore ? (
                    <button className="week-expand-button" type="button" onClick={() => toggleWeekCard(id)}>
                      {expanded ? "收起" : "展开全文"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel personal-task-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Task Loop</span>
              <h2>AI 拆解的任务候选</h2>
            </div>
            <Target size={18} />
          </div>
          <div className="task-candidate-summary">
            <div>
              <span>{isCurrentPeriod ? `预处理已从 ${sourceClueCount} 条周报线索拆出 ${taskCandidates.length} 个候选任务` : `${selectedPeriod?.label || "历史周期"}历史回看：展示当期 AI 任务候选，不直接创建飞书任务`}</span>
              <strong>已选 {selectedCandidates.length} 个 · 已创建 {createdCount} 个{validatedCount ? ` · 已校验 ${validatedCount} 个` : ""}</strong>
            </div>
            <button className="ask-ai-button" type="button" onClick={() => askAi()} disabled={taskCandidates.length === 0}>
              <Sparkles size={16} />
              <span>{aiAdviceCandidate ? "收起 AI 方案" : "展开 AI 执行方案"}</span>
            </button>
          </div>
          <div className="task-candidate-list">
            {taskCandidates.map((candidate) => {
              const checked = candidateSelection[candidate.id] ?? candidate.defaultSelected;
              const created = createdCandidateIds[candidate.id];
              const validated = validatedCandidateIds[candidate.id] && !created;
              const displayCandidate = editedCandidate(candidate);
              return (
                <div className={`task-candidate-row ${checked ? "is-selected" : ""}`} key={candidate.id}>
                  <button
                    className="check-button"
                    type="button"
                    aria-label={checked ? "取消选择任务" : "选择任务"}
                    onClick={() => toggleCandidate(candidate.id, candidate.defaultSelected)}
                  >
                    {checked ? <CheckSquare2 size={18} /> : <Square size={18} />}
                  </button>
                  <div className="task-candidate-main">
                    <div className="task-candidate-title">
                      <PriorityBadge priority={displayCandidate.priority} />
                      <input
                        aria-label="编辑任务标题"
                        className="candidate-title-input"
                        value={displayCandidate.title}
                        onChange={(event) => updateCandidateEdit(candidate, "title", event.target.value)}
                      />
                      <span className={created ? "created" : validated ? "validated" : "pending"}>
                        {created ? <CheckCircle2 size={14} /> : null}
                        {created ? "已创建" : validated ? "已校验" : "待创建"}
                      </span>
                    </div>
                    <textarea
                      aria-label="编辑任务正文"
                      className="candidate-description-input"
                      value={displayCandidate.description}
                      onChange={(event) => updateCandidateEdit(candidate, "description", event.target.value)}
                    />
                    <span className="candidate-edit-note">{isCurrentPeriod ? "标题和正文会按当前编辑内容创建飞书任务。" : "历史周期仅用于回看当时 AI 拆解，不直接创建飞书任务。"}</span>
                    <div className="candidate-meta">
                      <span>负责人：{displayCandidate.owner}</span>
                      <label className="candidate-date-field">
                        <span>建议闭环</span>
                        <input
                          aria-label="编辑建议闭环日期"
                          value={displayCandidate.dueDate}
                          onChange={(event) => updateCandidateEdit(candidate, "dueDate", event.target.value)}
                          placeholder="留空则不设截止"
                        />
                      </label>
                      <button className={aiAdviceCandidateId === candidate.id ? "is-active" : ""} type="button" onClick={() => askAi(displayCandidate)}>
                        <Sparkles size={13} />
                        <span>{aiAdviceCandidateId === candidate.id ? "收起方案" : "展开方案"}</span>
                      </button>
                    </div>
                    <label className="candidate-detail-editor">
                      <span>衡量指标</span>
                      <textarea
                        aria-label="编辑衡量指标"
                        value={displayCandidate.metric}
                        onChange={(event) => updateCandidateEdit(candidate, "metric", event.target.value)}
                      />
                    </label>
                    <label className="candidate-detail-editor">
                      <span>证据</span>
                      <textarea
                        aria-label="编辑周报证据"
                        value={displayCandidate.evidence}
                        onChange={(event) => updateCandidateEdit(candidate, "evidence", event.target.value)}
                      />
                    </label>
                    {aiAdviceCandidateId === candidate.id ? renderAiAdvicePanel(displayCandidate) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="task-create-bar">
            <p>
              {taskCreateState === "error"
                ? taskCreateMessage || "任务接口暂未成功，请确认后端服务和飞书权限配置。"
                : taskCreateState === "done"
                  ? taskCreateMessage || "已提交到后端；当前登录人会作为创建者和关注者写入请求。"
                : isCurrentPeriod
                  ? "只把勾选的候选任务创建到飞书；标题、正文、衡量指标、证据会按当前编辑内容写入，建议闭环日期需手动改过才写入截止时间。"
                  : "历史周期用于回看当期 AI 判断，不直接创建飞书任务。"}
            </p>
            <button className="primary-button" type="button" onClick={createSelectedTasks} disabled={!isCurrentPeriod || selectedCandidates.length === 0 || taskCreateState === "creating"}>
              <Send size={16} />
              <span>{taskCreateState === "creating" ? "正在提交" : "创建选中飞书任务"}</span>
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
