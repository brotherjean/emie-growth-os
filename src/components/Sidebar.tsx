import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  LineChart,
  Settings,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { NavItem, PageKey } from "../lib/types";

const navItems: NavItem[] = [
  { key: "dashboard", label: "老板驾驶舱", icon: Gauge },
  { key: "monthly", label: "月度会议", icon: CalendarClock },
  { key: "scores", label: "成长评分", icon: Trophy },
  { key: "tasks", label: "任务闭环", icon: ClipboardCheck },
  { key: "growth", label: "个人成长", icon: Sparkles },
  { key: "trends", label: "组织趋势", icon: LineChart },
  { key: "settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  activePage: PageKey;
  onChangePage: (page: PageKey) => void;
  canViewBossDashboard: boolean;
  canViewSettings: boolean;
}

export function Sidebar({ activePage, onChangePage, canViewBossDashboard, canViewSettings }: SidebarProps) {
  const visibleNavItems = navItems.filter((item) => {
    if (item.key === "dashboard") return canViewBossDashboard;
    if (item.key === "monthly") return canViewBossDashboard;
    if (item.key === "tasks") return canViewBossDashboard;
    if (item.key === "settings") return canViewSettings;
    return true;
  });
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <BarChart3 size={20} />
        </div>
        <div>
          <strong>成长周报 OS</strong>
          <span>Weekly Growth</span>
        </div>
      </div>

      <nav className="side-nav" aria-label="主导航">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={`nav-item ${activePage === item.key ? "is-active" : ""}`}
              type="button"
              onClick={() => onChangePage(item.key)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-status">
        <span>飞书 SSO</span>
        <strong>已连接</strong>
      </div>
    </aside>
  );
}
