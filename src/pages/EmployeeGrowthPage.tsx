import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  CheckSquare2,
  Crosshair,
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

  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const latestWeekTotal = chronologicalWeeks.at(-1)?.total ?? employee.averageScore;
  const previousWeekTotal = chronologicalWeeks.length > 1 ? chronologicalWeeks[chronologicalWeeks.length - 2].total : undefined;
  const weekDelta = previousWeekTotal === undefined ? employee.trend : Math.round((latestWeekTotal - previousWeekTotal) * 10) / 10;
  const topCandidate = taskCandidates.find((candidate) => candidate.priority === "P0") ?? taskCandidates[0];
  const topCandidateDisplay = topCandidate ? editedCandidate(topCandidate) : null;
  const closurePairs = closureInsight?.pairs?.slice(-8) ?? [];
  const heroSummary = employee.growthSummary || "持续记录、持续校准，让每一周都有被证据回应的进步。";
  const coachQuestions = ((employeeInsight?.coachQuestions?.length)
    ? employeeInsight.coachQuestions
    : [
        selectedWeek?.problemSummary || "本周期问题暴露不足，建议补充真实卡点。",
        selectedWeek?.nextPlanSummary || "本周期暂无下周计划摘要。",
        "历史周报用于回看成长轨迹；当周任务候选只在最新周期生成。",
      ]
  ).slice(0, 3);

  return (
    <div className="v2-page">
      <section className="v2-hero">
        {employeeOptions.length > 1 ? (
          <div className="v2-hero-bar">
            <select
              className="v2-hero-select"
              value={employee.name}
              onChange={(event) => onSelectEmployee(event.target.value)}
              aria-label="切换查看成员"
            >
              {employeeOptions.map((item) => (
                <option value={item.name} key={item.name}>
                  {item.name} · {item.department}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="v2-hero-top">
          <div>
            <p className="v2-hero-greeting">
              {greeting}，{employee.name} · {employee.department}
            </p>
            <h2 className="v2-hero-summary">{heroSummary}</h2>
            <div className="v2-hero-chips">
              <span className="v2-hero-chip">成长等级 {employee.level}</span>
              <span className="v2-hero-chip">{employee.reportCount} 周成长记录</span>
              <span className="v2-hero-chip">迟交 {employee.lateCount} 次</span>
              {closureInsight ? <span className="v2-hero-chip">{closureInsight.persona}</span> : null}
            </div>
          </div>
          <div className="v2-hero-score">
            <span className="v2-hero-score-num">{latestWeekTotal}</span>
            <span className="v2-hero-score-label">本周周报评分</span>
            <span className={`v2-hero-score-delta ${weekDelta < 0 ? "is-down" : ""}`}>
              <TrendingUp size={13} />
              {weekDelta >= 0 ? "+" : ""}
              {weekDelta} vs 上周
            </span>
          </div>
        </div>
        {growthTrendWeeks.length > 1 ? (
          <div className="v2-hero-spark">
            <div className="v2-hero-spark-label">
              <span>近 {growthTrendWeeks.length} 周走势</span>
              <span>均分 {employee.averageScore}</span>
            </div>
            <Sparkline
              values={growthTrendWeeks.map((week) => week.total)}
              labels={growthTrendWeeks.map((week) => formatWeekPeriod(week.week))}
            />
          </div>
        ) : null}
      </section>

      {topCandidateDisplay ? (
        <section className="v2-focus">
          <span className="v2-focus-flag">
            <Crosshair size={14} />
            本周焦点 · 最重要的一件事
          </span>
          <h3 className="v2-focus-title">{topCandidateDisplay.title}</h3>
          <p className="v2-focus-desc">{topCandidateDisplay.description}</p>
          <div className="v2-focus-steps">
            <div className="v2-focus-step">
              <span className="v2-focus-step-label">
                <Target size={13} />
                第一步怎么做
              </span>
              <p>{topCandidateDisplay.firstStep || "把目标缩小到 3 天内能完成的一件事，并在飞书任务里写清验收物。"}</p>
            </div>
            <div className="v2-focus-step">
              <span className="v2-focus-step-label">
                <CheckCircle2 size={13} />
                验收口径
              </span>
              <p>{topCandidateDisplay.metric}</p>
            </div>
            <div className="v2-focus-step">
              <span className="v2-focus-step-label">
                <Lightbulb size={13} />
                需要谁支持
              </span>
              <p>{topCandidateDisplay.supportNeeded || `先找 ${topCandidateDisplay.owner} 对齐口径；24 小时内无法推进，就升级给直属 Leader。`}</p>
            </div>
          </div>
          <div className="v2-focus-actions">
            <button className="v2-btn v2-btn-ghost" type="button" onClick={() => askAi(topCandidateDisplay)}>
              <Sparkles size={15} />
              <span>{aiAdviceCandidateId === topCandidateDisplay.id ? "收起 AI 执行方案" : "让 AI 帮我拆执行方案"}</span>
            </button>
            <span className="v2-task-note">AI 从本周周报拆解 · 建议闭环 {topCandidateDisplay.dueDate || "下周五"}</span>
          </div>
          {aiAdviceCandidateId === topCandidateDisplay.id ? renderAiAdvicePanel(topCandidateDisplay) : null}
        </section>
      ) : (
        <section className="v2-focus">
          <span className="v2-focus-flag">
            <Crosshair size={14} />
            本周焦点 · 最值得想清楚的一个问题
          </span>
          <h3 className="v2-focus-title">{coachQuestions[0]}</h3>
          <p className="v2-focus-desc">来自 AI 教练的追问。不用现在回答——把它写进下周的计划里，用行动和证据回应。</p>
        </section>
      )}

      <div className="v2-grid-2">
        <section className="v2-card">
          <div className="v2-card-head">
            <div>
              <span className="v2-eyebrow">
                <Repeat2 size={13} />
                承诺与证据
              </span>
              <h3 className="v2-card-title">上周说的，这周做到了吗</h3>
            </div>
          </div>
          {closureInsight && latestClosure ? (
            <>
              <div className="v2-closure-score">
                <span className="v2-closure-num">{closureInsight.score}</span>
                <div className="v2-closure-meta">
                  <span
                    className={`v2-pill ${
                      closureStatusTone(latestClosure.status) === "is-good"
                        ? "v2-pill-green"
                        : closureStatusTone(latestClosure.status) === "is-watch"
                          ? "v2-pill-amber"
                          : "v2-pill-risk"
                    }`}
                  >
                    {closureStatusLabel[latestClosure.status]}
                  </span>
                  <span>
                    {closureInsight.persona} · 跨周闭环力
                  </span>
                  {closurePairs.length > 0 ? (
                    <span className="v2-streak">
                      {closurePairs.map((pair) => (
                        <i
                          key={pair.id}
                          className={`v2-streak-dot ${pair.status === "closed" ? "is-on" : ""}`}
                          title={`${pair.currentWeek} ${closureStatusLabel[pair.status]}`}
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="v2-compare">
                <div className="v2-compare-item">
                  <span>上周承诺</span>
                  <p>{latestClosure.previousPlan || "上周计划不够明确。"}</p>
                </div>
                <div className="v2-compare-arrow">
                  <ArrowRight size={16} />
                </div>
                <div className="v2-compare-item">
                  <span>本周证据</span>
                  <p>{latestClosure.currentEvidence ? truncate(latestClosure.currentEvidence, 180) : "本周缺少回应证据。"}</p>
                </div>
              </div>
              <div className="v2-closure-judge">
                <strong>{latestClosure.signal}</strong>
                <p>{latestClosure.nextStep}</p>
              </div>
              <div className="v2-closure-stats">
                <span className="v2-pill v2-pill-green">闭环 {closureInsight.closedCount}</span>
                <span className="v2-pill v2-pill-neutral">风险 {closureInsight.riskCount}</span>
                <span className="v2-pill v2-pill-neutral">机制 {closureInsight.mechanismCount}</span>
                <span className="v2-pill v2-pill-neutral">
                  <Brain size={12} />
                  AI 协同 {closureInsight.aiThinkingScore}
                </span>
              </div>
            </>
          ) : (
            <p className="v2-empty-hint">至少需要连续两周周报，才能判断上周计划是否被本周结果回应。</p>
          )}
        </section>

        <section className="v2-card">
          <div className="v2-card-head">
            <div>
              <span className="v2-eyebrow">
                <TrendingUp size={13} />
                成长画像
              </span>
              <h3 className="v2-card-title">能力与意识的形状</h3>
            </div>
          </div>
          <div className="v2-profile-grid">
            <div className="v2-profile-radar">
              <RadarChart axes={radarFor(employee)} />
            </div>
            <div className="v2-profile-side">
              <div className="v2-profile-block">
                <span>同事眼中的你 · 协同 360</span>
                {collaboration360 ? (
                  <>
                    <div className="v2-profile-360">
                      <strong>{collaboration360.averageScore ?? "-"}</strong>
                      <span>
                        {collaboration360.level} · {collaboration360.submitted}/{collaboration360.expected} 人已评
                      </span>
                    </div>
                    <p className="v2-profile-note">
                      评分区间 {collaboration360.minScore ?? "-"} ~ {collaboration360.maxScore ?? "-"}，完成率 {collaboration360.completionRate}%。
                    </p>
                  </>
                ) : (
                  <p className="v2-profile-note">当前周期暂无协同评分记录。</p>
                )}
              </div>
              <div className="v2-profile-block">
                <span>本周期状态</span>
                <p className="v2-profile-note">
                  {employee.reportCount} 周记录 · 准时 {employee.onTimeCount} 次 · 均分 {employee.averageScore}（{employee.level}）。
                  {employee.calibrationNote || "保持稳定节奏，下一周继续用证据说话。"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="v2-card">
        <div className="v2-card-head">
          <div>
            <span className="v2-eyebrow">
              <MessageCircleQuestion size={13} />
              AI 教练
            </span>
            <h3 className="v2-card-title">{isCurrentPeriod ? "本周点评与追问" : "历史周期回顾"}</h3>
          </div>
        </div>
        <p className="v2-coach-summary">
          {employeeInsight?.coachSummary ||
            (isCurrentPeriod
              ? feedback?.body || employee.growthSummary
              : selectedWeek
                ? `${selectedWeek.week}：${selectedWeek.resultSummary}`
                : "该周期暂无可见周报记录。")}
        </p>
        {!isCurrentPeriod && selectedWeek?.reflectionSummary ? (
          <p className="v2-coach-summary is-secondary">{selectedWeek.reflectionSummary}</p>
        ) : null}
        <div className="v2-coach-questions">
          {coachQuestions.map((question, index) => (
            <div className="v2-coach-question" key={question}>
              <span className="v2-coach-question-tag">{index === 0 ? "教练提问" : index === 1 ? "自我对照" : "支持请求"}</span>
              <p>{question}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-head">
          <div>
            <span className="v2-eyebrow">
              <BookOpen size={13} />
              本周周报
            </span>
            <h3 className="v2-card-title">{selectedWeek ? `${selectedWeek.week} 的完整记录` : "本周期完整周报"}</h3>
          </div>
          <div className="v2-social-row is-compact">
            <button className={`v2-social-btn ${social.liked ? "is-active" : ""}`} type="button" onClick={toggleLike}>
              <ThumbsUp size={14} />
              <span>{social.likes} 个赞</span>
            </button>
            <button
              className={`v2-social-btn ${social.published ? "is-active" : ""}`}
              type="button"
              onClick={() => patchSocial({ published: !social.published })}
            >
              {social.published ? <Globe2 size={14} /> : <LockKeyhole size={14} />}
              <span>{social.published ? "全员可见" : "仅权限内可见"}</span>
            </button>
          </div>
        </div>
        {selectedWeek ? (
          <div className="v2-report-grid">
            <div className="v2-report-block">
              <strong>本周成果</strong>
              <p>{selectedWeek.resultSummary || "本周期暂无成果正文。"}</p>
            </div>
            <div className="v2-report-block">
              <strong>问题与挑战</strong>
              <p>{selectedWeek.problemSummary || "本周期暂无问题正文。"}</p>
            </div>
            <div className="v2-report-block">
              <strong>下周计划</strong>
              <p>{selectedWeek.nextPlanSummary || "本周期暂无计划正文。"}</p>
            </div>
            {selectedWeek.reflectionSummary ? (
              <div className="v2-report-block">
                <strong>思考与复盘</strong>
                <p>{selectedWeek.reflectionSummary}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="v2-empty-hint">该周期暂无可见周报原文。</p>
        )}
        <div className="v2-comment-list">
          {social.comments.map((comment) => (
            <p className="v2-comment-item" key={comment}>
              {comment}
            </p>
          ))}
        </div>
        <div className="v2-comment-box">
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="写一条评论：可以是老板回应、同事建议，或把亮点标记给下周 AI 分析。"
          />
          <button className="v2-btn v2-btn-primary" type="button" onClick={submitComment}>
            <MessageSquarePlus size={15} />
            <span>提交评论</span>
          </button>
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-head">
          <div>
            <span className="v2-eyebrow">
              <Target size={13} />
              行动清单
            </span>
            <h3 className="v2-card-title">AI 从周报拆出的任务候选</h3>
            <p className="v2-card-sub">
              {isCurrentPeriod
                ? `预处理已从 ${sourceClueCount} 条周报线索拆出 ${taskCandidates.length} 个候选；勾选、修改后一键创建飞书任务。`
                : `${selectedPeriod?.label || "历史周期"}回看：展示当期 AI 候选，不直接创建飞书任务。`}
            </p>
          </div>
          <button className="v2-btn v2-btn-ghost" type="button" onClick={() => askAi()} disabled={taskCandidates.length === 0}>
            <Sparkles size={15} />
            <span>{aiAdviceCandidate ? "收起 AI 方案" : "展开 AI 方案"}</span>
          </button>
        </div>
        <div className="v2-task-summary">
          <div className="v2-task-summary-text">
            <span>{isCurrentPeriod ? "确认无误后，只把勾选的候选创建到飞书。" : "历史周期仅用于回看当时的 AI 判断。"}</span>
            <strong>
              已选 {selectedCandidates.length} 个 · 已创建 {createdCount} 个{validatedCount ? ` · 已校验 ${validatedCount} 个` : ""}
            </strong>
          </div>
        </div>
        {taskCandidates.length === 0 ? (
          <p className="v2-empty-hint">本周期暂无可拆解的任务候选；写好下周计划后，AI 会自动给出建议动作。</p>
        ) : null}
        {taskCandidates.map((candidate) => {
          const checked = candidateSelection[candidate.id] ?? candidate.defaultSelected;
          const created = createdCandidateIds[candidate.id];
          const validated = validatedCandidateIds[candidate.id] && !created;
          const displayCandidate = editedCandidate(candidate);
          return (
            <div className={`v2-task-row ${checked ? "is-selected" : ""}`} key={candidate.id}>
              <button
                className="v2-task-check"
                type="button"
                aria-label={checked ? "取消选择任务" : "选择任务"}
                onClick={() => toggleCandidate(candidate.id, candidate.defaultSelected)}
              >
                {checked ? <CheckSquare2 size={19} /> : <Square size={19} />}
              </button>
              <div className="v2-task-main">
                <div className="v2-task-title-line">
                  <PriorityBadge priority={displayCandidate.priority} />
                  <input
                    aria-label="编辑任务标题"
                    className="v2-task-title-input"
                    value={displayCandidate.title}
                    onChange={(event) => updateCandidateEdit(candidate, "title", event.target.value)}
                  />
                  <span className={`v2-task-status ${created ? "is-created" : validated ? "is-validated" : "is-pending"}`}>
                    {created ? <CheckCircle2 size={13} /> : null}
                    {created ? "已创建" : validated ? "已校验" : "待创建"}
                  </span>
                </div>
                <textarea
                  aria-label="编辑任务正文"
                  className="v2-task-desc-input"
                  value={displayCandidate.description}
                  onChange={(event) => updateCandidateEdit(candidate, "description", event.target.value)}
                />
                <span className="v2-task-note">
                  {isCurrentPeriod ? "标题和正文会按当前编辑内容创建飞书任务。" : "历史周期仅用于回看，不直接创建飞书任务。"}
                </span>
                <div className="v2-task-meta">
                  <span>负责人：{displayCandidate.owner}</span>
                  <label className="v2-task-date">
                    <span>建议闭环</span>
                    <input
                      aria-label="编辑建议闭环日期"
                      value={displayCandidate.dueDate}
                      onChange={(event) => updateCandidateEdit(candidate, "dueDate", event.target.value)}
                      placeholder="留空则不设截止"
                    />
                  </label>
                  <button
                    className={`v2-task-link-btn ${aiAdviceCandidateId === candidate.id ? "is-active" : ""}`}
                    type="button"
                    onClick={() => askAi(displayCandidate)}
                  >
                    <Sparkles size={13} />
                    <span>{aiAdviceCandidateId === candidate.id ? "收起方案" : "AI 方案"}</span>
                  </button>
                </div>
                <div className="v2-task-detail">
                  <label>
                    <span>衡量指标</span>
                    <textarea
                      aria-label="编辑衡量指标"
                      value={displayCandidate.metric}
                      onChange={(event) => updateCandidateEdit(candidate, "metric", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>证据</span>
                    <textarea
                      aria-label="编辑周报证据"
                      value={displayCandidate.evidence}
                      onChange={(event) => updateCandidateEdit(candidate, "evidence", event.target.value)}
                    />
                  </label>
                </div>
                {aiAdviceCandidateId === candidate.id ? renderAiAdvicePanel(displayCandidate) : null}
              </div>
            </div>
          );
        })}
        <div className="v2-task-create-bar">
          <p>
            {taskCreateState === "error"
              ? taskCreateMessage || "任务接口暂未成功，请确认后端服务和飞书权限配置。"
              : taskCreateState === "done"
                ? taskCreateMessage || "已提交到后端；当前登录人会作为创建者和关注者写入请求。"
                : isCurrentPeriod
                  ? "标题、正文、衡量指标、证据按当前编辑内容写入；建议闭环日期手动改过才会写入截止时间。"
                  : "历史周期用于回看当期 AI 判断，不直接创建飞书任务。"}
          </p>
          <button
            className="v2-btn v2-btn-primary"
            type="button"
            onClick={createSelectedTasks}
            disabled={!isCurrentPeriod || selectedCandidates.length === 0 || taskCreateState === "creating"}
          >
            <Send size={15} />
            <span>{taskCreateState === "creating" ? "正在提交" : "创建选中飞书任务"}</span>
          </button>
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-head">
          <div>
            <span className="v2-eyebrow">
              <BookOpen size={13} />
              成长时间线
            </span>
            <h3 className="v2-card-title">过去几周的足迹</h3>
          </div>
        </div>
        <div className="v2-timeline">
          {weeks.map((week) => {
            const id = weekCardId(week);
            const expanded = Boolean(expandedWeekIds[id]);
            const problemText = week.problemSummary || "本周问题暴露不足，建议补充真实卡点。";
            const hasMore =
              week.resultSummary.length > COLLAPSED_RESULT_LENGTH ||
              problemText.length > COLLAPSED_PROBLEM_LENGTH ||
              Boolean(week.nextPlanSummary);

            return (
              <div className="v2-timeline-item" key={id}>
                <div className="v2-timeline-head">
                  <strong>{week.week}</strong>
                  <span className="v2-pill v2-pill-neutral">{week.status}</span>
                  <span className="v2-pill v2-pill-green">{week.total} 分</span>
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
                  <button className="v2-timeline-toggle" type="button" onClick={() => toggleWeekCard(id)}>
                    {expanded ? "收起" : "展开全文"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
