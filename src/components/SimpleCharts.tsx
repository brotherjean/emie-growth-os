import { clamp, cnNumber } from "../lib/format";

interface BarDatum {
  label: string;
  value: number;
}

export function HorizontalBars({ data }: { data: BarDatum[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bar-list">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className="bar-track">
            <i style={{ width: `${clamp((item.value / max) * 100, 3, 100)}%` }} />
          </div>
          <strong>{cnNumber(item.value, 1)}</strong>
        </div>
      ))}
    </div>
  );
}

interface SparklineProps {
  values: number[];
  labels?: string[];
  showPoints?: boolean;
}

export function Sparkline({ values, labels = [], showPoints = false }: SparklineProps) {
  const width = 260;
  const height = showPoints ? 104 : 54;
  const sidePadding = showPoints ? 24 : 0;
  const chartTop = showPoints ? 20 : 5;
  const chartBottom = showPoints ? 76 : height - 5;
  const chartHeight = chartBottom - chartTop;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - sidePadding * 2) / Math.max(1, values.length - 1);
  const nodes = values.map((value, index) => {
    const x = sidePadding + index * step;
    const y = chartBottom - ((value - min) / span) * chartHeight;
    return {
      x,
      y,
      value,
      label: labels[index] || `第${index + 1}周`,
    };
  });
  const points = nodes.map((node) => `${node.x},${node.y}`).join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="周报质量趋势">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {showPoints
        ? nodes.map((node, index) => (
            <g key={`${node.label}-${index}`}>
              <circle cx={node.x} cy={node.y} r="4.2" fill="#ffffff" stroke="currentColor" strokeWidth="2.4" />
              <text className="sparkline-value" x={node.x} y={Math.max(10, node.y - 8)} textAnchor="middle">
                {cnNumber(node.value, 1)}
              </text>
              <text className="sparkline-label" x={node.x} y={height - 10} textAnchor="middle">
                {node.label}
              </text>
            </g>
          ))
        : null}
    </svg>
  );
}

interface RadarProps {
  axes: { label: string; value: number }[];
}

export function RadarChart({ axes }: RadarProps) {
  const size = 220;
  const center = size / 2;
  const radius = 82;
  const points = axes.map((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const scaled = radius * clamp(axis.value, 0, 100) / 100;
    return {
      label: axis.label,
      x: center + Math.cos(angle) * scaled,
      y: center + Math.sin(angle) * scaled,
      lx: center + Math.cos(angle) * (radius + 24),
      ly: center + Math.sin(angle) * (radius + 24),
      gx: center + Math.cos(angle) * radius,
      gy: center + Math.sin(angle) * radius,
    };
  });
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  const grid = [0.33, 0.66, 1].map((scale) =>
    axes
      .map((_, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
      })
      .join(" "),
  );

  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="个人成长雷达">
      {grid.map((shape) => (
        <polygon key={shape} points={shape} fill="none" stroke="#d8dee8" strokeWidth="1" />
      ))}
      {points.map((point) => (
        <line key={`${point.label}-axis`} x1={center} y1={center} x2={point.gx} y2={point.gy} stroke="#e5e7eb" />
      ))}
      <polygon points={polygon} fill="rgba(37, 99, 235, 0.18)" stroke="#2563eb" strokeWidth="3" />
      {points.map((point) => (
        <text key={point.label} x={point.lx} y={point.ly} textAnchor="middle" dominantBaseline="middle">
          {point.label}
        </text>
      ))}
    </svg>
  );
}
