import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  note: string;
  tone?: "blue" | "teal" | "amber" | "red";
  icon?: ReactNode;
}

export function StatCard({ label, value, note, tone = "blue", icon }: StatCardProps) {
  return (
    <section className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </section>
  );
}
