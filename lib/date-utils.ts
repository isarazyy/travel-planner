/** 行程日期工具（与用户「出发～返回」含首尾两天一致） */

export function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** 含首尾：start、end 均为 YYYY-MM-DD */
export function enumerateTripDatesInclusive(startIso: string, endIso: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return [];
  let a = startIso;
  let b = endIso;
  if (compareIso(b, a) < 0) [a, b] = [b, a];
  const out: string[] = [];
  let cur = a;
  while (compareIso(cur, b) <= 0) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

export function formatCnDateWithWeekday(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00+08:00`);
  if (!Number.isFinite(d.getTime())) return iso;
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日（周${w}）`;
}
