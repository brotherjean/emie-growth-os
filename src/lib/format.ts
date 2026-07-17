export function cnNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function percent(value: number, digits = 0) {
  return `${cnNumber(value, digits)}%`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function truncate(text: string, max = 96) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
