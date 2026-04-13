'use client';

import { CostBreakdown as CostType } from '@/lib/types';

const COST_ITEMS = [
  { key: 'transport', label: '交通', color: 'bg-blue-400' },
  { key: 'accommodation', label: '住宿', color: 'bg-purple-400' },
  { key: 'food', label: '餐饮', color: 'bg-orange-400' },
  { key: 'attractions', label: '景点', color: 'bg-green-400' },
  { key: 'other', label: '其他', color: 'bg-gray-400' },
];

function formatCost(val: number | string | undefined): string {
  if (val == null) return '¥0';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+-\d+$/.test(trimmed)) return `¥${trimmed}`;
    if (/^\d+$/.test(trimmed)) return `¥${Number(trimmed).toLocaleString()}`;
    return trimmed.startsWith('¥') ? trimmed : `¥${trimmed}`;
  }
  return `¥${val.toLocaleString()}`;
}

function midpoint(val: number | string | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const m = val.match(/^(\d+)-(\d+)$/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export default function CostBreakdown({ cost, peopleCount }: { cost: CostType; peopleCount: number }) {
  const totalDisplay = formatCost(cost.total);
  const totalMid = midpoint(cost.total);
  const perPerson = peopleCount > 1
    ? (typeof cost.total === 'string' && /^\d+-\d+$/.test(cost.total.trim())
      ? (() => {
          const [lo, hi] = cost.total.trim().split('-').map(Number);
          return `¥${Math.round(lo / peopleCount)}-${Math.round(hi / peopleCount)}`;
        })()
      : `¥${Math.round(totalMid / peopleCount).toLocaleString()}`)
    : null;

  const mids = COST_ITEMS.map(item => midpoint((cost as any)[item.key]));
  const midTotal = mids.reduce((s, v) => s + v, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">💰 费用预估</h3>

      <div className="text-center mb-5">
        <p className="text-3xl font-bold text-orange-600">{totalDisplay}</p>
        <p className="text-sm text-gray-400 mt-1">
          总计{perPerson ? ` · 人均 ${perPerson}` : ''}
        </p>
      </div>

      {/* Bar chart */}
      <div className="flex h-4 rounded-full overflow-hidden mb-4">
        {COST_ITEMS.map((item, i) => {
          const pct = midTotal > 0 ? (mids[i] / midTotal) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div key={item.key} className={`${item.color}`} style={{ width: `${pct}%` }} title={`${item.label}: ${formatCost((cost as any)[item.key])}`} />
          );
        })}
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {COST_ITEMS.map(item => (
          <div key={item.key} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="text-gray-600">{item.label}</span>
            </div>
            <span className="font-medium text-gray-900">{formatCost((cost as any)[item.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
