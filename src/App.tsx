import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { Sidebar } from "./components/Sidebar";
import { appData } from "./lib/data";
import type { PageKey } from "./lib/types";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeeGrowthPage } from "./pages/EmployeeGrowthPage";
import { MonthlyMeetingPage } from "./pages/MonthlyMeetingPage";
import { ScoresPage } from "./pages/ScoresPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { TrendsPage } from "./pages/TrendsPage";
import type { UserAccess } from "./lib/types";

const fallbackAccess: UserAccess = {
  role: "member",
  bossView: false,
  externalView: false,
  canViewBossDashboard: false,
  canViewSettings: false,
  canManageScoring360: false,
  currentEmployee: null,
  visibilityMode: "self_only",
  visibleEmployees: [],
  visibleOpenIds: [],
  visibleNames: [],
  visibleDepartments: [],
};

export function App() {
  const [activePage, setActivePage] = useState<PageKey>("growth");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedPeriodId, setSelectedPeriodId] = useState(appData.currentWeekId || appData.periods.at(-1)?.id || "");
  const [taskCreated, setTaskCreated] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);
  const [access, setAccess] = useState<UserAccess | null>(null);
  const currentAccess = access ?? fallbackAccess;
  const externalView = currentAccess.externalView;
  const canOpenPage = (page: PageKey) => {
    if (page === "dashboard") return currentAccess.canViewBossDashboard;
    if (page === "monthly") return currentAccess.canViewBossDashboard;
    if (page === "tasks") return currentAccess.canViewBossDashboard;
    if (page === "settings") return currentAccess.canViewSettings;
    return true;
  };

  useEffect(() => {
    async function loadMe() {
      try {
        const response = await fetch("/api/me");
        if (response.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
          return;
        }
        if (!response.ok) throw new Error("load_me_failed");
        const result = await response.json();
        const nextAccess = normalizeAccess(result.access, result.user);
        setAccess(nextAccess);
        setActivePage((page) => {
          if (page === "growth" && nextAccess.canViewBossDashboard) return "dashboard";
          if (page === "dashboard" && !nextAccess.canViewBossDashboard) return "growth";
          if (page === "monthly" && !nextAccess.canViewBossDashboard) return "growth";
          if (page === "tasks" && !nextAccess.canViewBossDashboard) return "growth";
          if (page === "settings" && !nextAccess.canViewSettings) return "growth";
          return page;
        });
        setSelectedEmployee((name) => {
          if (nextAccess.visibleEmployees.some((employee) => employee.name === name)) return name;
          return nextAccess.currentEmployee?.name || nextAccess.visibleEmployees[0]?.name || "";
        });
      } catch {
        setAccess(fallbackAccess);
      }
    }
    loadMe();
  }, []);

  useEffect(() => {
    fetch("/api/usage/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: activePage }),
      keepalive: true,
    }).catch(() => {
      // Static preview can run without the backend.
    });
  }, [activePage]);

  useEffect(() => {
    if (!access || externalView) return;
    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/usage/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: activePage, visible: true }),
        keepalive: true,
      }).catch(() => {
        // Static preview can run without the backend.
      });
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 3 * 60 * 1000);
    document.addEventListener("visibilitychange", sendHeartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sendHeartbeat);
    };
  }, [access, activePage, externalView]);

  const page = useMemo(() => {
    if (activePage === "dashboard" && currentAccess.canViewBossDashboard) {
      return (
        <DashboardPage
          selectedPeriodId={selectedPeriodId}
          externalView={externalView}
          onOpenEmployee={(name) => {
            setSelectedEmployee(name);
            setActivePage("growth");
          }}
        />
      );
    }

    if (activePage === "scores") {
      return <ScoresPage visibleEmployees={currentAccess.visibleEmployees} access={currentAccess} />;
    }

    if (activePage === "monthly" && currentAccess.canViewBossDashboard) {
      return (
        <MonthlyMeetingPage
          onOpenEmployee={(name) => {
            setSelectedEmployee(name);
            setActivePage("growth");
          }}
        />
      );
    }

    if (activePage === "tasks" && currentAccess.canViewBossDashboard) {
      return <TasksPage selectedPeriodId={selectedPeriodId} taskCreated={taskCreated} onCreateTasks={() => setTaskCreated(true)} />;
    }

    if (activePage === "growth") {
      return <EmployeeGrowthPage selectedPeriodId={selectedPeriodId} selectedEmployee={selectedEmployee} onSelectEmployee={setSelectedEmployee} externalView={externalView} visibleEmployees={currentAccess.visibleEmployees} />;
    }

    if (activePage === "trends") {
      return <TrendsPage selectedPeriodId={selectedPeriodId} />;
    }

    if (activePage === "settings" && currentAccess.canViewSettings) {
      return <SettingsPage access={currentAccess} />;
    }

    return <EmployeeGrowthPage selectedPeriodId={selectedPeriodId} selectedEmployee={selectedEmployee} onSelectEmployee={setSelectedEmployee} externalView={externalView} visibleEmployees={currentAccess.visibleEmployees} />;
  }, [activePage, selectedEmployee, selectedPeriodId, summaryReady, taskCreated, currentAccess, externalView]);

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onChangePage={(page) => {
          if (canOpenPage(page)) setActivePage(page);
        }}
        canViewBossDashboard={currentAccess.canViewBossDashboard}
        canViewSettings={currentAccess.canViewSettings}
        userName={currentAccess.currentEmployee?.name || ""}
        userDepartment={currentAccess.currentEmployee?.department || ""}
      />
      <main className="main-shell">
        <AppHeader
          activePage={activePage}
          externalView={externalView}
          canViewBossDashboard={currentAccess.canViewBossDashboard}
          summaryReady={summaryReady}
          taskCreated={taskCreated}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={setSelectedPeriodId}
          onCreateTasks={() => {
            setTaskCreated(true);
            setActivePage("tasks");
          }}
          onGenerateSummary={() => {
            setSummaryReady(true);
            setActivePage("dashboard");
          }}
          onOpenNotificationTarget={(employeeName) => {
            setSelectedEmployee(employeeName);
            setActivePage("growth");
          }}
        />
        <div className="content-shell">{page}</div>
      </main>
    </div>
  );
}

function normalizeAccess(value: unknown, user: any): UserAccess {
  const record = value && typeof value === "object" ? value as Partial<UserAccess> : {};
  const visibleEmployees = Array.isArray(record.visibleEmployees) ? record.visibleEmployees : [];
  return {
    role: String(record.role || user?.role || "member"),
    bossView: Boolean(record.bossView || user?.bossView),
    externalView: Boolean(record.externalView || user?.role === "external_boss_view"),
    canViewBossDashboard: Boolean(record.canViewBossDashboard || record.bossView || user?.bossView || user?.role === "external_boss_view"),
    canManageScoring360: Boolean(record.canManageScoring360 || record.bossView || user?.bossView),
    canViewSettings: Boolean(record.canViewSettings || record.canManageScoring360 || record.bossView || user?.bossView),
    currentEmployee: record.currentEmployee || null,
    visibilityMode: String(record.visibilityMode || "self_department_and_reports"),
    visibleEmployees,
    visibleOpenIds: Array.isArray(record.visibleOpenIds) ? record.visibleOpenIds : visibleEmployees.map((employee) => employee.openId).filter(Boolean),
    visibleNames: Array.isArray(record.visibleNames) ? record.visibleNames : visibleEmployees.map((employee) => employee.name).filter(Boolean),
    visibleDepartments: Array.isArray(record.visibleDepartments) ? record.visibleDepartments : Array.from(new Set(visibleEmployees.map((employee) => employee.department).filter(Boolean))),
  };
}
