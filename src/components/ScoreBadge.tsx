import type { EmployeeLevel } from "../lib/types";

interface ScoreBadgeProps {
  level: EmployeeLevel;
}

export function ScoreBadge({ level }: ScoreBadgeProps) {
  const normalized = level.replace("+", "plus").replace("-", "minus").toLowerCase();
  return <span className={`score-badge score-${normalized}`}>{level}</span>;
}
