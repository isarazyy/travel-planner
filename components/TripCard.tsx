'use client';

import Link from 'next/link';
import { Trip, MODE_ICONS } from '@/lib/types';

export default function TripCard({ trip, onDelete }: { trip: Trip; onDelete: (id: string) => void }) {
  const plans = trip.trip_plans || [];
  const minCost = plans.length > 0 ? Math.min(...plans.map(p => p.estimated_total || 0)) : 0;
  const maxCost = plans.length > 0 ? Math.max(...plans.map(p => p.estimated_total || 0)) : 0;

  const days = Math.max(1, Math.ceil(
    (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
  ) + 1);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-orange-100 transition group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">
            {trip.departure} → {(trip.destinations || []).join(' / ')}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {trip.start_date} ~ {trip.end_date} · {days}天 · {trip.people_count}人
          </p>
        </div>
        <button
          onClick={(e) => { e.preventDefault(); onDelete(trip.id); }}
          className="text-gray-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
          title="删除"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Mode badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {plans.map(p => (
          <span key={p.mode} className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-md">
            {MODE_ICONS[p.mode]} ¥{(p.estimated_total || 0).toLocaleString()}
          </span>
        ))}
      </div>

      {/* Cost range */}
      {plans.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">
            预算范围：¥{minCost.toLocaleString()} ~ ¥{maxCost.toLocaleString()}
          </span>
          <Link
            href={`/plan/${trip.id}`}
            className="text-sm text-orange-500 hover:text-orange-600 font-medium"
          >
            查看详情 →
          </Link>
        </div>
      )}

      <p className="text-xs text-gray-300 mt-3">
        创建于 {new Date(trip.created_at).toLocaleDateString('zh-CN')}
      </p>
    </div>
  );
}
