'use client';

import { CostBreakdown as CostType } from '@/lib/types';

const COST_ITEMS = [
  { key: 'transport', label: '交通', color: 'bg-blue-400' },
  { key: 'accommodation', label: '住宿', color: 'bg-purple-400' },
  { key: 'food', label: '餐饮', color: 'bg-orange-400' },
  { key: 'attractions', label: '景点', color: 'bg-green-400' },
  { key: 'other', label: '其他', color: 'bg-gray-400' },
];

export default function CostBreakdown({ cost, peopleCount }: { cost: CostType; peopleCount: number }) {
  const total = cost.total || 0;
  const perPerson = peopleCount > 0 ? Math.round(total / peopleCount) : total;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">💰 费用明细</h3>

      <div className="text-center mb-5">
        <p className="text-3xl font-bold text-orange-600">¥{total.toLocaleString()}</p>
        <p className="text-sm text-gray-400 mt-1">总计 · 人均 ¥{perPerson.toLocaleString()}</p>
      </div>

      {/* Bar chart */}
      <div className="flex h-4 rounded-full overflow-hidden mb-4">
        {COST_ITEMS.map(item => {
          const val = (cost as any)[item.key] || 0;
          const pct = total > 0 ? (val / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div key={item.key} className={`${item.color}`} style={{ width: `${pct}%` }} title={`${item.label}: ¥${val}`} />
          );
        })}
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {COST_ITEMS.map(item => {
          const val = (cost as any)[item.key] || 0;
          return (
            <div key={item.key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                <span className="text-gray-600">{item.label}</span>
              </div>
              <span className="font-medium text-gray-900">¥{val.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
