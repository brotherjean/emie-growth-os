export const defaultScoring360ConfigManagers = [
  { openId: "mock_manager", name: "Demo Manager" },
  { openId: "", name: "刘海娇" },
];

export function parseScoring360LaunchDays(value, legacyDay = 15) {
  const source = String(value || "").trim();
  if (!source) return [1, 15];
  const days = source
    .split(/[,\n;]/)
    .map((item) => Number(String(item).trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
  if (days.length === 0 && Number.isInteger(Number(legacyDay))) {
    days.push(Number(legacyDay));
  }
  return Array.from(new Set(days)).sort((left, right) => left - right);
}

export function scoring360CycleForLaunchDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("invalid_scoring360_launch_date");
  }
  const localDate = shanghaiDateParts(date);
  const round = localDate.day >= 15 ? 2 : 1;
  const period = previousMonthPeriod(localDate);
  return {
    id: `${period.year}-${String(period.month).padStart(2, "0")}-round${round}-360`,
    label: `${period.year}年${period.month}月协同360评分 · 第${round}轮`,
    mode: "monthly_round",
    round,
    startDate: `${period.year}-${String(period.month).padStart(2, "0")}-01`,
    endDate: `${period.year}-${String(period.month).padStart(2, "0")}-${String(period.daysInMonth).padStart(2, "0")}`,
    monthKey: `${period.year}-${String(period.month).padStart(2, "0")}`,
  };
}

export function isScoring360ConfigManager(user, managers = defaultScoring360ConfigManagers) {
  const openId = String(user?.openId || user?.open_id || "").trim();
  const name = String(user?.name || user?.姓名 || "").trim();
  return managers.some((manager) => {
    const managerOpenId = String(manager?.openId || manager?.open_id || "").trim();
    const managerName = String(manager?.name || manager?.姓名 || "").trim();
    return Boolean(
      (openId && managerOpenId && openId === managerOpenId) ||
        (name && managerName && (name === managerName || name.includes(managerName) || managerName.includes(name))),
    );
  });
}

export function normalizeScoring360Managers(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  return list
    .map((item) => {
      if (typeof item === "string") return { openId: item.trim(), name: "" };
      return {
        openId: String(item?.openId || item?.open_id || "").trim(),
        name: String(item?.name || item?.姓名 || "").trim(),
      };
    })
    .filter((item) => {
      const key = item.openId || item.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function shanghaiDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function previousMonthPeriod(date) {
  const year = date.month === 1 ? date.year - 1 : date.year;
  const month = date.month === 1 ? 12 : date.month - 1;
  return {
    year,
    month,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}
