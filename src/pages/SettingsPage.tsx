import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { appData } from "../lib/data";
import type { UserAccess } from "../lib/types";

interface ExternalLink {
  id: string;
  name: string;
  scope: string;
  expiresAt: string;
  status: string;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt?: string;
}

interface ImportResult {
  batch?: {
    id: string;
    sourceName: string;
    importMode: string;
    rowCount: number;
    validCount: number;
    inserted: number;
    updated: number;
    weekLabel: string;
  };
  sampleRecords?: Array<{
    employeeName: string;
    department: string;
    weekLabel: string;
    status: string;
  }>;
  warnings?: string[];
}

interface BossViewMember {
  openId: string;
  name: string;
  department: string;
}

interface ManagedEmployee {
  openId: string;
  name: string;
  department?: string;
  email?: string;
  active: boolean;
  source?: string;
  updatedAt?: string;
}

interface LarkReportSyncStatus {
  ok?: boolean;
  running?: boolean;
  phase?: string;
  message?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  rowCount?: number;
  importOutputPath?: string;
  period?: {
    id?: string;
    label?: string;
    range?: string;
    start?: string;
    end?: string;
    commitStart?: string;
    commitEnd?: string;
  };
}

interface WeeklyReminderOutboxItem {
  id: string;
  periodId: string;
  periodLabel?: string;
  kind: "friday_review" | "monday_update" | string;
  recipientName: string;
  department?: string;
  message: string;
  personalizationNote?: string;
  provider?: string;
  model?: string;
  status: string;
  updatedAt?: string;
}

interface WeeklyReminderStatus {
  outbox?: {
    enabled?: boolean;
    fridayPeriodId?: string;
    mondayPeriodId?: string;
    counts?: Array<{ periodId: string; status: string; count: number }>;
    items?: WeeklyReminderOutboxItem[];
  };
}

interface Scoring360ConfigAssignment {
  id: string;
  cycleId: string;
  evalueeName: string;
  evaluatorName: string;
  relationship?: string;
  response?: {
    score: number;
    submittedAt: string;
    locked: boolean;
  } | null;
}

interface Scoring360Config {
  cycle?: {
    id: string;
    label: string;
    mode: string;
    dueAt?: string;
    historicalWeight?: number;
    currentWeight?: number;
  } | null;
  employees?: Array<{
    name: string;
    department?: string;
    openId?: string;
  }>;
  assignments: Scoring360ConfigAssignment[];
  diagnosis?: {
    mode: string;
    liveAssignments: boolean;
    liveResponses: boolean;
    note: string;
  };
}

interface Scoring360ReminderStatus {
  mode?: "manual" | "scheduled";
  enabled?: boolean;
  schedule?: {
    dayOfMonth: number;
    daysOfMonth?: number[];
    hour: number;
    minute: number;
    dueHours: number;
    followupHours: number;
    identity: string;
  };
  cycle?: {
    id: string;
    label: string;
    dueAt?: string;
    progressPct?: number;
  } | null;
  pending?: Array<{
    evaluatorName: string;
    evaluatorOpenId?: string;
    department?: string;
    pendingCount: number;
    totalCount: number;
    pendingNames: string[];
    deliverable: boolean;
  }>;
  sends?: Array<{
    evaluatorName: string;
    pendingCount: number;
    kind: string;
    status: string;
    createdAt?: string;
  }>;
}

interface RosterAuditStatus {
  latestWeek?: {
    label: string;
    reportCount: number;
  } | null;
  counts?: {
    activeEmployees: number;
    latestReports: number;
    newInReports: number;
    missingLatestReport: number;
    missingOpenId: number;
  };
  newInReports?: Array<{ name: string; department?: string; openId?: string }>;
  missingLatestReport?: Array<{ name: string; department?: string; openId?: string }>;
  missingOpenId?: Array<{ name: string; department?: string; openId?: string }>;
  exemptNames?: string[];
  note?: string;
}

interface AccountActivityRow {
  openId?: string;
  name: string;
  department?: string;
  isReminderRecipient?: boolean;
  loginCount: number;
  sessionCount: number;
  heartbeatCount: number;
  pageVisitCount: number;
  commentCount: number;
  reactionCount: number;
  followupCount: number;
  activeSignals: number;
  interactionSignals: number;
  attentionScore: number;
  status: "no_record" | "active" | "engaged" | string;
  statusLabel: string;
  firstActiveAt?: string;
  lastActiveAt?: string;
}

interface AccountActivityStatus {
  window?: {
    mode: string;
    periodId?: string;
    periodLabel?: string;
    startAt?: string;
    firstSentAt?: string;
    lastSentAt?: string;
    sentCount?: number;
  };
  summary?: {
    recipients: number;
    active: number;
    noRecord: number;
    engaged: number;
    activeRate: number;
    engagedRate: number;
  };
  rows?: AccountActivityRow[];
}

interface SettingsPageProps {
  access?: UserAccess;
}

export function SettingsPage({ access }: SettingsPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [bossViewMembers, setBossViewMembers] = useState<BossViewMember[]>([]);
  const [bossViewState, setBossViewState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [managedEmployees, setManagedEmployees] = useState<ManagedEmployee[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeOpenId, setEmployeeOpenId] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeManageState, setEmployeeManageState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [employeeManageError, setEmployeeManageError] = useState("");
  const [externalName, setExternalName] = useState("外部顾问临时访问");
  const [ttlHours, setTtlHours] = useState("72");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [externalLinkState, setExternalLinkState] = useState<"idle" | "creating" | "error">("idle");
  const [importState, setImportState] = useState<"idle" | "dragging" | "uploading" | "done" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [syncStatus, setSyncStatus] = useState<LarkReportSyncStatus | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [syncError, setSyncError] = useState("");
  const [weeklyReminderStatus, setWeeklyReminderStatus] = useState<WeeklyReminderStatus | null>(null);
  const [scoring360Config, setScoring360Config] = useState<Scoring360Config | null>(null);
  const employeeOptions = useMemo(() => {
    const names = [
      ...appData.employeeSummary.map((employee) => employee.name),
      ...(scoring360Config?.employees || []).map((employee) => employee.name),
      ...(scoring360Config?.assignments || []).flatMap((assignment) => [assignment.evalueeName, assignment.evaluatorName]),
    ];
    return Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
  }, [scoring360Config]);
  const [scoring360State, setScoring360State] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scoring360Error, setScoring360Error] = useState("");
  const [scoring360Evaluee, setScoring360Evaluee] = useState(employeeOptions[0] || "");
  const [scoring360Evaluator, setScoring360Evaluator] = useState(employeeOptions[1] || employeeOptions[0] || "");
  const [scoring360ReminderStatus, setScoring360ReminderStatus] = useState<Scoring360ReminderStatus | null>(null);
  const [scoring360ReminderState, setScoring360ReminderState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [scoring360ReminderError, setScoring360ReminderError] = useState("");
  const [scoring360ReminderResult, setScoring360ReminderResult] = useState<{
    dryRun?: boolean;
    sent?: number;
    failed?: number;
    skipped?: number;
    dryRunCount?: number;
  } | null>(null);
  const [rosterAudit, setRosterAudit] = useState<RosterAuditStatus | null>(null);
  const [accountActivity, setAccountActivity] = useState<AccountActivityStatus | null>(null);
  const bossView = access ? Boolean(access.bossView) : true;
  const canManageScoring360 = access ? Boolean(access.bossView || access.canManageScoring360) : true;
  useEffect(() => {
    if (bossView) {
      loadExternalLinks();
      loadBossViewMembers();
      loadManagedEmployees();
      loadLarkReportSyncStatus();
      loadWeeklyReminderStatus();
      loadRosterAudit();
      loadAccountActivity();
    }
    if (canManageScoring360) {
      loadScoring360Config();
      loadScoring360ReminderStatus();
    }
  }, [bossView, canManageScoring360]);

  useEffect(() => {
    if (!scoring360Evaluee && employeeOptions[0]) {
      setScoring360Evaluee(employeeOptions[0]);
    }
    if (!scoring360Evaluator && (employeeOptions[1] || employeeOptions[0])) {
      setScoring360Evaluator(employeeOptions[1] || employeeOptions[0]);
    }
  }, [employeeOptions, scoring360Evaluee, scoring360Evaluator]);

  useEffect(() => {
    if (!syncStatus?.running) return;
    const timer = window.setInterval(() => {
      void loadLarkReportSyncStatus();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.running]);

  async function loadBossViewMembers() {
    try {
      const response = await fetch("/api/boss-view-members");
      if (!response.ok) return;
      const result = await response.json();
      setBossViewMembers(Array.isArray(result.members) ? result.members : []);
    } catch {
      // Static preview keeps this as a visual configuration mock.
    }
  }

  async function loadManagedEmployees() {
    try {
      const response = await fetch("/api/employees/manage");
      if (!response.ok) return;
      const result = await response.json();
      setManagedEmployees(Array.isArray(result.employees) ? result.employees : []);
    } catch {
      // Static preview keeps the personnel panel empty.
    }
  }

  async function saveManagedEmployee() {
    if (!employeeName.trim() || !employeeOpenId.trim()) return;
    setEmployeeManageState("saving");
    setEmployeeManageError("");
    try {
      const response = await fetch("/api/employees/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: employeeName,
          openId: employeeOpenId,
          department: employeeDepartment,
          email: employeeEmail,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "save_employee_failed");
      setEmployeeName("");
      setEmployeeOpenId("");
      setEmployeeDepartment("");
      setEmployeeEmail("");
      await loadManagedEmployees();
      await loadRosterAudit();
      await loadScoring360Config();
      setEmployeeManageState("saved");
    } catch (error) {
      setEmployeeManageError(error instanceof Error ? error.message : "保存人员失败");
      setEmployeeManageState("error");
    }
  }

  async function setManagedEmployeeActive(employee: ManagedEmployee, active: boolean) {
    if (!active && !window.confirm(`确认停用 ${employee.name}？历史周报和评分会保留，但该员工将退出活跃人员名单。`)) return;
    setEmployeeManageState("saving");
    setEmployeeManageError("");
    try {
      const response = await fetch("/api/employees/manage/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openId: employee.openId, name: employee.name, department: employee.department, email: employee.email, active }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "update_employee_status_failed");
      await loadManagedEmployees();
      await loadRosterAudit();
      await loadScoring360Config();
      setEmployeeManageState("saved");
    } catch (error) {
      setEmployeeManageError(error instanceof Error ? error.message : "更新人员状态失败");
      setEmployeeManageState("error");
    }
  }

  function toggleBossViewMember(member: BossViewMember) {
    setBossViewState("idle");
    setBossViewMembers((current) => {
      const exists = current.some((item) => item.openId === member.openId);
      if (exists) return current.filter((item) => item.openId !== member.openId);
      return [...current, member];
    });
  }

  async function saveBossViewMembers() {
    setBossViewState("saving");
    try {
      const response = await fetch("/api/boss-view-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: bossViewMembers }),
      });
      if (!response.ok) throw new Error("save_boss_view_failed");
      const result = await response.json();
      setBossViewMembers(Array.isArray(result.members) ? result.members : bossViewMembers);
      setBossViewState("saved");
    } catch {
      setBossViewState("error");
    }
  }

  async function loadExternalLinks() {
    try {
      const response = await fetch("/api/external-links");
      if (!response.ok) return;
      const result = await response.json();
      setExternalLinks(Array.isArray(result.links) ? result.links : []);
    } catch {
      // Settings remains usable even if the server is not available in static preview.
    }
  }

  async function createExternalLink() {
    setExternalLinkState("creating");
    try {
      const response = await fetch("/api/external-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: externalName, ttlHours: Number(ttlHours) }),
      });
      if (!response.ok) throw new Error("create_external_link_failed");
      const result = await response.json();
      setGeneratedUrl(result.link?.url || "");
      setExternalLinkState("idle");
      await loadExternalLinks();
    } catch {
      setExternalLinkState("error");
    }
  }

  async function loadLarkReportSyncStatus() {
    try {
      const response = await fetch("/api/lark-report-sync");
      if (!response.ok) return;
      const result = await response.json();
      const status = result.status || null;
      setSyncStatus(status);
      setSyncState(status?.running ? "running" : "idle");
    } catch {
      // Static preview keeps this as an explanatory panel.
    }
  }

  async function loadWeeklyReminderStatus() {
    try {
      const response = await fetch("/api/weekly-reminders");
      if (!response.ok) return;
      const result = await response.json();
      setWeeklyReminderStatus(result);
    } catch {
      // Static preview keeps this panel empty.
    }
  }

  async function loadScoring360Config() {
    try {
      const response = await fetch("/api/scoring360/config");
      if (!response.ok) return;
      const result = await response.json();
      setScoring360Config({
        cycle: result.cycle || null,
        employees: Array.isArray(result.employees) ? result.employees : [],
        assignments: Array.isArray(result.assignments) ? result.assignments : [],
        diagnosis: result.diagnosis,
      });
    } catch {
      // Static preview keeps the explanation visible without live configuration.
    }
  }

  async function loadScoring360ReminderStatus() {
    try {
      const response = await fetch("/api/scoring360/reminders");
      if (!response.ok) return;
      const result = await response.json();
      setScoring360ReminderStatus(result);
    } catch {
      // Static preview keeps this panel explanatory.
    }
  }

  async function loadRosterAudit() {
    try {
      const response = await fetch("/api/roster/audit");
      if (!response.ok) return;
      const result = await response.json();
      setRosterAudit(result);
    } catch {
      // Static preview keeps this panel explanatory.
    }
  }

  async function loadAccountActivity() {
    try {
      const response = await fetch("/api/account-activity");
      if (!response.ok) return;
      const result = await response.json();
      setAccountActivity(result);
    } catch {
      // Static preview keeps this panel explanatory.
    }
  }

  async function sendScoring360Reminder(kind: "launch" | "followup", dryRun = true) {
    if (!dryRun) {
      const deliverableCount = (scoring360ReminderStatus?.pending || []).filter((item) => item.deliverable).length;
      const missingCount = (scoring360ReminderStatus?.pending || []).filter((item) => !item.deliverable).length;
      const actionLabel = kind === "followup" ? "向未完成人员发送补提醒" : "发起本轮成长评分";
      const confirmed = window.confirm(
        `确认${actionLabel}？将向 ${deliverableCount} 位员工发送飞书通知${missingCount ? `，另有 ${missingCount} 人因缺少 open_id 无法通知` : ""}。`,
      );
      if (!confirmed) return;
    }
    setScoring360ReminderState("running");
    setScoring360ReminderError("");
    setScoring360ReminderResult(null);
    try {
      const response = await fetch("/api/scoring360/reminders/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cycleId: scoring360ReminderStatus?.cycle?.id, kind, dryRun }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "send_scoring360_reminder_failed");
      setScoring360ReminderResult(result);
      await loadScoring360ReminderStatus();
      setScoring360ReminderState("done");
    } catch (error) {
      setScoring360ReminderError(error instanceof Error ? error.message : "协同360提醒处理失败");
      setScoring360ReminderState("error");
    }
  }

  async function addScoring360Assignment() {
    if (!scoring360Evaluee || !scoring360Evaluator) return;
    setScoring360State("saving");
    setScoring360Error("");
    try {
      const response = await fetch("/api/scoring360/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cycleId: scoring360Config?.cycle?.id,
          evalueeName: scoring360Evaluee,
          evaluatorName: scoring360Evaluator,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "add_assignment_failed");
      await loadScoring360Config();
      setScoring360State("saved");
    } catch (error) {
      setScoring360Error(error instanceof Error ? error.message : "添加评分关系失败");
      setScoring360State("error");
    }
  }

  async function removeScoring360Assignment(assignmentId: string) {
    setScoring360State("saving");
    setScoring360Error("");
    try {
      const response = await fetch("/api/scoring360/assignments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "delete_assignment_failed");
      await loadScoring360Config();
      setScoring360State("saved");
    } catch (error) {
      setScoring360Error(error instanceof Error ? error.message : "删除评分关系失败");
      setScoring360State("error");
    }
  }

  async function startLarkReportSync() {
    setSyncState("starting");
    setSyncError("");
    try {
      const response = await fetch("/api/lark-report-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exempt: "" }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.alreadyRunning) {
          setSyncStatus(result.status || null);
          setSyncState("running");
          return;
        }
        throw new Error(result.error || "sync_start_failed");
      }
      setSyncStatus(result.status || null);
      setSyncState("running");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步启动失败");
      setSyncState("error");
    }
  }

  async function uploadWeeklyReport(file?: File) {
    if (!file) return;
    setImportState("uploading");
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importMode", "auto");
      const response = await fetch("/api/import/weekly-report", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "import_failed");
      setImportResult(result);
      setImportState("done");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败");
      setImportState("error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    void uploadWeeklyReport(file);
  }

  return (
    <section className="settings-grid">
      {bossView ? (
        <>
      <article className="panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">SSO</span>
            <h2>飞书登录与权限模型</h2>
          </div>
        </div>
        <div className="permission-list">
          <div><strong>员工</strong><span>查看自己的周报、成长报告和个人任务。</span></div>
          <div><strong>同部门成员</strong><span>查看部门内公开摘要、优秀范例和质量排行。</span></div>
          <div><strong>Leader</strong><span>查看自己、平级汇总和下属明细。</span></div>
          <div><strong>老板视角</strong><span>查看全公司组织雷达、P0/P1 队列、必读周报、外部链接和系统设置。</span></div>
        </div>
      </article>
      <article className="panel boss-access-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Boss View</span>
            <h2>老板视角授权名单</h2>
          </div>
          <span className="boss-access-count">已授权 {bossViewMembers.length} 人</span>
        </div>
        <p className="boss-access-copy">勾选后，该同事在成长 OS 内获得与老板等同的内容视角。当前不做更细的内容权限切分，适合管理岗和后备合伙人共用完整经营上下文。</p>
        <div className="boss-member-grid">
          {bossViewCandidates().map((member) => {
            const checked = bossViewMembers.some((item) => item.openId === member.openId);
            return (
              <label className={`boss-member-option ${checked ? "is-selected" : ""}`} key={member.openId}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBossViewMember(member)}
                />
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.department || "未填部门"}</small>
                </span>
              </label>
            );
          })}
        </div>
        <div className="boss-access-actions">
          <button className="primary-button" type="button" onClick={saveBossViewMembers} disabled={bossViewState === "saving"}>
            {bossViewState === "saving" ? "保存中" : "保存老板视角名单"}
          </button>
          {bossViewState === "saved" ? <span className="settings-success">已保存，刷新页面后角色会同步为老板视角。</span> : null}
          {bossViewState === "error" ? <span className="settings-error">保存失败，请确认当前账号有老板视角权限。</span> : null}
        </div>
      </article>
      <article className="panel employee-manage-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">People</span>
            <h2>人员增减与花名册</h2>
          </div>
          <span className="boss-access-count">在职 {managedEmployees.filter((employee) => employee.active).length} 人</span>
        </div>
        <p className="boss-access-copy">新增或更新人员后会进入系统花名册；停用人员不会删除历史周报、评分和审计记录。飞书 open_id 用于登录、身份匹配和接收评分通知。</p>
        <div className="employee-manage-form">
          <label><span>姓名 *</span><input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="员工姓名" /></label>
          <label><span>飞书 open_id *</span><input value={employeeOpenId} onChange={(event) => setEmployeeOpenId(event.target.value)} placeholder="ou_xxx" /></label>
          <label><span>部门</span><input value={employeeDepartment} onChange={(event) => setEmployeeDepartment(event.target.value)} placeholder="所属部门" /></label>
          <label><span>企业邮箱</span><input type="email" value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} placeholder="name@company.com" /></label>
          <button className="primary-button" type="button" onClick={saveManagedEmployee} disabled={employeeManageState === "saving" || !employeeName.trim() || !employeeOpenId.trim()}>
            {employeeManageState === "saving" ? "保存中…" : "新增或更新人员"}
          </button>
        </div>
        <div className="employee-manage-list">
          {managedEmployees.map((employee) => (
            <div className={employee.active ? "" : "is-inactive"} key={employee.openId || employee.name}>
              <span><strong>{employee.name}</strong><small>{employee.department || "未填部门"} · {employee.openId || "缺少 open_id"}</small></span>
              <span className={employee.active ? "employee-status-active" : "employee-status-inactive"}>{employee.active ? "在职" : "已停用"}</span>
              <button className="secondary-button" type="button" onClick={() => setManagedEmployeeActive(employee, !employee.active)} disabled={employeeManageState === "saving" || !employee.openId}>
                {employee.active ? "停用" : "恢复"}
              </button>
            </div>
          ))}
          {managedEmployees.length === 0 ? <p className="empty-state">暂无人员数据，请先同步周报或新增员工。</p> : null}
        </div>
        {employeeManageState === "saved" ? <p className="settings-success">人员名单已更新。</p> : null}
        {employeeManageError ? <p className="settings-error">人员维护失败：{employeeManageError}</p> : null}
      </article>
        </>
      ) : null}
      {canManageScoring360 ? (
        <>
      <article className="panel scoring360-config-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Collaboration 360</span>
            <h2>协同360评分关系配置</h2>
          </div>
          <span className="scoring360-live-badge">
            {scoring360Config?.diagnosis?.liveAssignments ? "活配置" : "静态兜底"}
          </span>
        </div>
        <div className="scoring360-config-copy">
          <strong>{scoring360Config?.cycle?.label || "当前评分周期"}</strong>
          <span>{scoring360Config?.diagnosis?.note || "当前页面用于维护谁给谁打分；老板视角或协同360管理员可见。"}</span>
        </div>
        <div className="scoring360-config-form">
          <datalist id="scoring360-employee-options">
            {employeeOptions.map((name) => <option value={name} key={name} />)}
          </datalist>
          <label>
            <span>被评分人</span>
            <input
              list="scoring360-employee-options"
              value={scoring360Evaluee}
              onChange={(event) => setScoring360Evaluee(event.target.value)}
              placeholder="输入或选择姓名"
            />
          </label>
          <label>
            <span>评分人</span>
            <input
              list="scoring360-employee-options"
              value={scoring360Evaluator}
              onChange={(event) => setScoring360Evaluator(event.target.value)}
              placeholder="输入或选择姓名"
            />
          </label>
          <button className="primary-button" type="button" onClick={addScoring360Assignment} disabled={scoring360State === "saving"}>
            添加评分关系
          </button>
        </div>
        <div className="scoring360-config-summary">
          <span>当前 {scoring360Config?.assignments.length || 0} 条评分关系</span>
          <button className="secondary-button" type="button" onClick={loadScoring360Config}>刷新</button>
        </div>
        <div className="scoring360-assignment-groups">
          {groupScoring360Assignments(scoring360Config?.assignments || []).slice(0, 30).map((group) => (
            <div className="scoring360-assignment-group" key={group.evalueeName}>
              <div>
                <strong>{group.evalueeName}</strong>
                <span>{group.assignments.length} 位评分人</span>
              </div>
              <div className="scoring360-evaluator-chips">
                {group.assignments.map((assignment) => (
                  <span className={assignment.response ? "has-response" : ""} key={assignment.id}>
                    {assignment.evaluatorName}
                    {assignment.response ? <small>{assignment.response.score}分</small> : null}
                    <button
                      type="button"
                      aria-label={`删除 ${assignment.evaluatorName} 对 ${assignment.evalueeName} 的评分关系`}
                      onClick={() => removeScoring360Assignment(assignment.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {scoring360State === "saved" ? <p className="settings-success">评分关系已更新，会立即影响“我要评分”的任务列表。</p> : null}
        {scoring360Error ? <p className="settings-error">协同360配置失败：{scoring360Error}</p> : null}
      </article>
      <article className="panel scoring360-reminder-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">360 Cycle</span>
            <h2>协同360评分任务提醒</h2>
          </div>
          <span className="scoring360-live-badge">
            {scoring360ReminderStatus?.mode === "scheduled" ? "定时模式" : "手动模式"}
          </span>
        </div>
        <div className="scoring360-config-copy">
          <strong>{scoring360ReminderStatus?.cycle?.label || "当前周期"}</strong>
          <span>
            管理员确认待评分名单后手动发起；员工会收到飞书通知并进入“我要评分”页面完成操作。发起后 24 小时完成，未完成人员可由管理员手动补提醒。
          </span>
        </div>
        <div className="scoring360-reminder-actions">
          <button className="primary-button" type="button" onClick={() => sendScoring360Reminder("launch", false)} disabled={scoring360ReminderState === "running" || !(scoring360ReminderStatus?.pending || []).some((item) => item.deliverable)}>
            {scoring360ReminderState === "running" ? "发送中…" : "发起评分并通知员工"}
          </button>
          <button className="secondary-button" type="button" onClick={() => sendScoring360Reminder("launch", true)} disabled={scoring360ReminderState === "running"}>
            预览通知
          </button>
          <button className="secondary-button" type="button" onClick={() => sendScoring360Reminder("followup", true)} disabled={scoring360ReminderState === "running"}>
            预览补提醒
          </button>
          <button className="secondary-button" type="button" onClick={loadScoring360ReminderStatus}>
            刷新
          </button>
        </div>
        <div className="scoring360-pending-list">
          {(scoring360ReminderStatus?.pending || []).slice(0, 12).map((item) => (
            <div className={item.deliverable ? "" : "is-warning"} key={item.evaluatorName}>
              <strong>{item.evaluatorName}</strong>
              <span>{item.pendingCount}/{item.totalCount} 未评 · {item.department || "未填部门"}</span>
              <small>{item.deliverable ? item.pendingNames.slice(0, 4).join("、") : "缺少 open_id，暂不能飞书提醒"}</small>
            </div>
          ))}
          {(scoring360ReminderStatus?.pending || []).length === 0 ? <p className="empty-state">当前周期暂无待评分对象。</p> : null}
        </div>
        <div className="scoring360-config-summary">
          <span>最近发送记录 {scoring360ReminderStatus?.sends?.length || 0} 条</span>
          <span>身份：{scoring360ReminderStatus?.schedule?.identity || "bot"}</span>
        </div>
        {scoring360ReminderState === "done" ? (
          <p className="settings-success">
            {scoring360ReminderResult?.dryRun
              ? `预览完成，共 ${scoring360ReminderResult.dryRunCount || 0} 条通知，不会真实发送。`
              : `评分已发起：成功通知 ${scoring360ReminderResult?.sent || 0} 人，失败 ${scoring360ReminderResult?.failed || 0} 人，已发送过而跳过 ${scoring360ReminderResult?.skipped || 0} 人。`}
          </p>
        ) : null}
        {scoring360ReminderError ? <p className="settings-error">360 提醒失败：{scoring360ReminderError}</p> : null}
      </article>
        </>
      ) : null}
      {bossView ? (
        <>
      <article className="panel roster-audit-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Roster Audit</span>
            <h2>花名册与提醒名单健康检查</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadRosterAudit}>刷新</button>
        </div>
        <div className="roster-audit-kpis">
          <div><strong>{rosterAudit?.counts?.latestReports ?? "-"}</strong><span>最近周报人数</span></div>
          <div><strong>{rosterAudit?.counts?.newInReports ?? "-"}</strong><span>周报新人</span></div>
          <div><strong>{rosterAudit?.counts?.missingLatestReport ?? "-"}</strong><span>活跃但缺周报</span></div>
          <div><strong>{rosterAudit?.counts?.missingOpenId ?? "-"}</strong><span>缺 open_id</span></div>
        </div>
        <div className="roster-audit-columns">
          <div>
            <strong>新增/待确认人员</strong>
            {(rosterAudit?.newInReports || []).slice(0, 8).map((item) => <span key={item.name}>{item.name} · {item.department || "未填部门"}</span>)}
            {(rosterAudit?.newInReports || []).length === 0 ? <span>暂无</span> : null}
          </div>
          <div>
            <strong>缺少最近周报</strong>
            {(rosterAudit?.missingLatestReport || []).slice(0, 8).map((item) => <span key={item.name}>{item.name} · {item.department || "未填部门"}</span>)}
            {(rosterAudit?.missingLatestReport || []).length === 0 ? <span>暂无</span> : null}
          </div>
        </div>
        <p className="settings-hint">{rosterAudit?.note || "后续每周一同步后会检查花名册变化，避免离职同事继续进提醒列表，也避免新入职人员漏进成长 OS。"}</p>
      </article>
      <article className="panel account-activity-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Account Activity</span>
            <h2>访问统计与成长关注度分析</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadAccountActivity}>刷新</button>
        </div>
        <div className="activity-window-copy">
          <strong>{accountActivity?.window?.periodLabel || "最近一次周一更新通知"}</strong>
          <span>
            统计窗口从 {formatDateTime(accountActivity?.window?.firstSentAt || accountActivity?.window?.startAt)} 开始。这里看的是账号活跃信号，后续绩效判断仍需结合真实工作产出。
          </span>
        </div>
        <div className="roster-audit-kpis">
          <div><strong>{accountActivity?.summary?.recipients ?? "-"}</strong><span>通知对象</span></div>
          <div><strong>{accountActivity?.summary?.activeRate ?? "-"}%</strong><span>有活跃记录</span></div>
          <div><strong>{accountActivity?.summary?.engaged ?? "-"}</strong><span>有互动贡献</span></div>
          <div><strong>{accountActivity?.summary?.noRecord ?? "-"}</strong><span>暂无活跃记录</span></div>
        </div>
        <div className="activity-analysis-copy">
          <strong>管理解释</strong>
          <span>没有访问记录不直接等于工作差，但如果长期无活跃、无互动、无追问，再叠加周报质量和实际产出偏弱，就应视为对复盘成长的形式化倾向。</span>
        </div>
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>同事</th>
                <th>状态</th>
                <th>登录/会话</th>
                <th>心跳/访问</th>
                <th>互动</th>
                <th>最近活跃</th>
              </tr>
            </thead>
            <tbody>
              {(accountActivity?.rows || [])
                .filter((row) => row.isReminderRecipient)
                .slice(0, 32)
                .map((row) => (
                  <tr className={row.status === "no_record" ? "is-silent" : row.status === "engaged" ? "is-engaged" : ""} key={row.openId || row.name}>
                    <td>
                      <strong>{row.name}</strong>
                      <span>{row.department || "未填部门"}</span>
                    </td>
                    <td><em>{row.statusLabel}</em></td>
                    <td>{row.loginCount}/{row.sessionCount}</td>
                    <td>{row.heartbeatCount}/{row.pageVisitCount}</td>
                    <td>{row.commentCount + row.reactionCount + row.followupCount}</td>
                    <td>{row.lastActiveAt ? formatDateTime(row.lastActiveAt) : "无记录"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="settings-hint">口径：登录=SSO成功次数；会话=已有登录态打开成长OS；心跳=页面可见时的持续活跃；访问=栏目切换或页面打开；互动=评论、点赞、追问。</p>
      </article>
      <article className="panel external-access-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">External Access</span>
            <h2>外部顾问临时访问链接</h2>
          </div>
        </div>
        <div className="external-access-copy">
          <strong>绕过 SSO，但不绕过过期控制</strong>
          <span>用于公司教练、外部顾问临时查看老板视角。链接按 token 访问，服务器只保存 hash，到期后自动失效。</span>
        </div>
        <div className="external-link-form">
          <label>
            <span>链接名称</span>
            <input value={externalName} onChange={(event) => setExternalName(event.target.value)} />
          </label>
          <label>
            <span>有效期</span>
            <select value={ttlHours} onChange={(event) => setTtlHours(event.target.value)}>
              <option value="24">24 小时</option>
              <option value="72">3 天</option>
              <option value="168">7 天</option>
              <option value="720">30 天</option>
            </select>
          </label>
          <button className="primary-button" type="button" onClick={createExternalLink} disabled={externalLinkState === "creating"}>
            {externalLinkState === "creating" ? "生成中" : "生成访问链接"}
          </button>
        </div>
        {generatedUrl ? (
          <div className="generated-link-box">
            <strong>新链接只在这里完整显示一次</strong>
            <code>{generatedUrl}</code>
          </div>
        ) : null}
        {externalLinkState === "error" ? <p className="settings-error">生成失败，请确认后端服务和登录状态。</p> : null}
        <div className="external-link-list">
          {externalLinks.length === 0 ? (
            <p>暂无外部访问链接。</p>
          ) : (
            externalLinks.slice(0, 6).map((link) => (
              <div className="external-link-row" key={link.id}>
                <div>
                  <strong>{link.name || "外部顾问访问"}</strong>
                  <span>{link.status === "active" ? "有效" : "已失效"} · 访问 {link.accessCount || 0} 次 · 到期 {formatDateTime(link.expiresAt)}</span>
                </div>
                <small>{link.lastAccessedAt ? `最近访问 ${formatDateTime(link.lastAccessedAt)}` : "尚未访问"}</small>
              </div>
            ))
          )}
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Data Ingest</span>
            <h2>数据入口</h2>
          </div>
        </div>
        <div className="pipeline-list">
          <div><span>1</span><strong>飞书汇报导出 Excel</strong><p>当前 MVP 入口，稳定可控。</p></div>
          <div><span>2</span><strong>Chrome 自动导出</strong><p>在汇报 API 不成熟时作为过渡自动化。</p></div>
          <div><span>3</span><strong>飞书汇报接口</strong><p>接口可用后直接同步，保留导入兜底。</p></div>
          <div><span>4</span><strong>飞书任务回写</strong><p>任务状态进入下周分析，形成跨周闭环。</p></div>
        </div>
      </article>
      <article className="panel lark-sync-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Lark Report Sync</span>
            <h2>飞书汇报自动同步</h2>
          </div>
          <span className={`sync-status-badge ${syncStatus?.running ? "is-running" : syncStatus?.ok === false ? "is-error" : ""}`}>
            {syncStatus?.running ? "同步中" : syncStatus?.ok === false ? "需处理" : "待命"}
          </span>
        </div>
        <div className="sync-flow-copy">
          <strong>一键完成：拉取汇报 → 合并历史 → Kimi 预处理 → 生成页面</strong>
          <span>远端服务器需要完成 lark-cli 的 report:task:readonly 授权。手动未同步时，可开启每周一早上兜底自动同步。</span>
        </div>
        <div className="sync-status-box">
          <div>
            <strong>{syncStatus?.message || "尚未运行飞书汇报同步"}</strong>
            <span>
              {syncStatus?.period?.label ? `${syncStatus.period.label} ${syncStatus.period.range || ""}` : "默认同步上一工作周"}
              {syncStatus?.rowCount ? ` · ${syncStatus.rowCount} 条` : ""}
            </span>
          </div>
          <small>{syncStatus?.updatedAt ? `更新于 ${formatDateTime(syncStatus.updatedAt)}` : "等待首次同步"}</small>
        </div>
        <div className="sync-actions">
          <button
            className="primary-button"
            type="button"
            onClick={startLarkReportSync}
            disabled={syncState === "starting" || syncState === "running" || Boolean(syncStatus?.running)}
          >
            {syncState === "starting" ? "启动中" : syncStatus?.running ? "同步运行中" : "立即同步飞书汇报"}
          </button>
          <button className="secondary-button" type="button" onClick={loadLarkReportSyncStatus}>
            刷新状态
          </button>
        </div>
        {syncError ? <p className="settings-error">同步启动失败：{syncError}</p> : null}
        {syncStatus?.ok === false ? <p className="settings-error">最近一次同步失败：{syncStatus.message}</p> : null}
      </article>
      <article className="panel reminder-outbox-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Message Outbox</span>
            <h2>成长提醒文案队列审阅</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadWeeklyReminderStatus}>刷新</button>
        </div>
        <div className="reminder-outbox-summary">
          <strong>周五提醒：{weeklyReminderStatus?.outbox?.fridayPeriodId || "未生成"}</strong>
          <span>周一更新通知：{weeklyReminderStatus?.outbox?.mondayPeriodId || "未生成"}</span>
        </div>
        <div className="reminder-outbox-list">
          {(weeklyReminderStatus?.outbox?.items || []).length === 0 ? (
            <p>暂无预生成文案。每次飞书汇报同步完成后，系统会自动生成周五提醒和周一更新通知 outbox。</p>
          ) : (
            (weeklyReminderStatus?.outbox?.items || []).map((item) => (
              <article className="reminder-outbox-row" key={item.id}>
                <div className="reminder-outbox-meta">
                  <strong>{item.recipientName}</strong>
                  <span>{item.department || "未填部门"} · {item.kind === "monday_update" ? "周一更新通知" : "周五周报提醒"} · {item.status}</span>
                  <small>{item.provider || "local"}{item.model ? ` / ${item.model}` : ""} · {formatDateTime(item.updatedAt)}</small>
                </div>
                <p>{item.message}</p>
                {item.personalizationNote ? <small className="reminder-outbox-note">个性化依据：{item.personalizationNote}</small> : null}
              </article>
            ))
          )}
        </div>
      </article>
      <article className="panel import-mode-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Late Submission</span>
            <h2>补交周报导入策略</h2>
          </div>
        </div>
        <div className="import-mode-list">
          <div className="is-primary">
            <strong>增量导入个人周报</strong>
            <span>适合单人补交场景：上传个人 Excel 或从飞书汇报详情抓取，系统按人员+周次 upsert，不重跑全员导入。</span>
          </div>
          <div>
            <strong>重导完整全员表</strong>
            <span>适合每周固定归档：整份 Excel 作为新的导入批次，已存在记录更新，缺失记录保持历史状态。</span>
          </div>
          <div>
            <strong>导入后局部重算</strong>
            <span>只重算该员工个人成长、所在部门主题、老板 P0/P1 队列增量影响，夜间再跑全量 Kimi 深分析。</span>
          </div>
        </div>
        <div
          className={`import-dropzone ${importState === "dragging" ? "is-dragging" : ""} ${importState === "done" ? "is-done" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setImportState("dragging");
          }}
          onDragLeave={() => setImportState(importResult ? "done" : "idle")}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            hidden
            onChange={(event) => {
              void uploadWeeklyReport(event.target.files?.[0]);
            }}
          />
          <strong>{importState === "uploading" ? "正在导入..." : "拖入或点击上传 Excel / CSV"}</strong>
          <span>真实入口：后端会保存原始文件，识别 full_export / single_employee，并按人员+周次 upsert 到数据库。</span>
        </div>
        {importResult?.batch ? (
          <div className="import-result-box">
            <strong>导入完成：{importResult.batch.sourceName}</strong>
            <span>
              {importResult.batch.importMode} · 有效 {importResult.batch.validCount}/{importResult.batch.rowCount} 条 · 新增 {importResult.batch.inserted} · 更新 {importResult.batch.updated} · 周期 {importResult.batch.weekLabel}
            </span>
            {importResult.sampleRecords?.length ? (
              <small>
                样例：{importResult.sampleRecords.map((record) => `${record.employeeName}（${record.department || "未填部门"}）`).join("、")}
              </small>
            ) : null}
          </div>
        ) : null}
        {importError ? <p className="settings-error">导入失败：{importError}</p> : null}
      </article>
      <article className="panel storage-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Storage</span>
            <h2>数据库与对象存储</h2>
          </div>
        </div>
        <div className="storage-list">
          <div><strong>当前 ECS 状态</strong><span>已只读检查：没有 Postgres/MySQL 服务与 5432/3306 监听，现有服务器主要是 Nginx + PM2 + Node。</span></div>
          <div><strong>SQL 必须要</strong><span>周报、评论、点赞、任务、贡献度排行、权限和幂等导入都需要结构化事务。</span></div>
          <div><strong>推荐 RDS PostgreSQL</strong><span>生产环境优先用阿里云 RDS 自动备份；预算敏感时再自建 Postgres，并把备份推到 OSS。</span></div>
          <div><strong>对象存储</strong><span>原始 Excel、导出 HTML、附件、分析报告快照放 OSS，不直接塞进数据库。</span></div>
          <div><strong>向量/全文检索</strong><span>后续用 pgvector 或独立向量库保存周报片段 embedding，供 AI 上下文召回。</span></div>
        </div>
      </article>
      <article className="panel storage-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Feishu Task</span>
            <h2>飞书任务创建权限</h2>
          </div>
        </div>
        <div className="storage-list">
          <div><strong>最小闭环权限</strong><span>task:task:write、task:task:read、task:tasklist:write、task:tasklist:read。</span></div>
          <div><strong>人员分配</strong><span>需要通讯录 open_id 映射；如果要按姓名分配，需读取联系人/组织架构权限。</span></div>
          <div><strong>创建策略</strong><span>AI 只生成候选任务，老板或员工勾选后再批量创建，避免把噪声写入飞书。</span></div>
          <div><strong>幂等保护</strong><span>每条任务使用 report_week + employee_open_id + task_id 作为幂等 key，重复导入不会重复建任务。</span></div>
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">Model Routing</span>
            <h2>大模型调用策略</h2>
          </div>
        </div>
        <div className="model-route-list">
          <div className="is-primary"><strong>Kimi K2.6</strong><span>主模型：周报长上下文分析、问题分拣、任务拆解、老板周总结。</span></div>
          <div><strong>Kimi K2.5</strong><span>低成本批处理：初筛、格式化、低风险改写、缓存命中复用。</span></div>
          <div><strong>Gemini</strong><span>可选备份：后续只在网络与合规稳定时用于交叉评审。</span></div>
        </div>
      </article>
      <article className="panel memory-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">AI Memory Pipeline</span>
            <h2>周报知识库与组织记忆</h2>
          </div>
        </div>
        <div className="memory-pipeline">
          <div>
            <strong>1. 原始周报入库</strong>
            <span>每周按人员、部门、周次、权限范围写入文档库，并切成可检索片段。</span>
          </div>
          <div>
            <strong>2. AI 分析事件化</strong>
            <span>评分、成长建议、风险识别、P0/P1 判断都保存为结构化事件。</span>
          </div>
          <div>
            <strong>3. 互动沉淀上下文</strong>
            <span>评论、点赞、全员公开、老板介入、任务状态都成为下一周分析依据。</span>
          </div>
          <div>
            <strong>4. 下周上下文包</strong>
            <span>分析前自动召回个人历史、部门共性问题、未闭环任务和关键决策。</span>
          </div>
        </div>
        <div className="context-pack-grid">
          <div><strong>个人上下文包</strong><span>近 9 周周报、评分趋势、教练问题、未闭环承诺。</span></div>
          <div><strong>团队上下文包</strong><span>同部门高频卡点、优秀样本、跨人协同线索。</span></div>
          <div><strong>公司上下文包</strong><span>P0/P1 风险、战略主题、老板评论、全员公告。</span></div>
          <div><strong>任务上下文包</strong><span>从周报生成的飞书任务、负责人、截止日、进展回传。</span></div>
        </div>
      </article>
        </>
      ) : null}
    </section>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bossViewCandidates(): BossViewMember[] {
  const priority = new Map<string, number>();
  return appData.employeeSummary
    .filter((employee) => employee.openId)
    .map((employee) => ({
      openId: employee.openId,
      name: employee.name,
      department: employee.department,
    }))
    .sort((left, right) => {
      const leftPriority = priority.get(left.name) || 99;
      const rightPriority = priority.get(right.name) || 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.name.localeCompare(right.name, "zh-CN");
    });
}

function groupScoring360Assignments(assignments: Scoring360ConfigAssignment[]) {
  const groups = new Map<string, Scoring360ConfigAssignment[]>();
  for (const assignment of assignments) {
    if (!groups.has(assignment.evalueeName)) groups.set(assignment.evalueeName, []);
    groups.get(assignment.evalueeName)!.push(assignment);
  }
  return Array.from(groups.entries()).map(([evalueeName, groupAssignments]) => ({
    evalueeName,
    assignments: groupAssignments,
  }));
}
