import type { Priority } from "../lib/types";

interface PriorityBadgeProps {
  priority: Priority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return <span className={`priority priority-${priority.toLowerCase()}`}>{priority}</span>;
}
