'use client';

import { useState } from 'react';
import { Trip, MODE_LABELS, MODE_ICONS } from '@/lib/types';
import DayTimeline from './DayTimeline';
import CostBreakdown from './CostBreakdown';
import AccommodationList from './AccommodationList';

export default function PlanResult({ trip }: { trip: Trip }) {
  const plans = trip.trip_plans || [];
  const [activeMode, setActiveMode] = useState(plans[0]?.mode || 'budget');
  const activePlan = plans.find(p => p.mode === activeMode);

  if (plans.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-4">😔</p>
        <p>暂无生成的方案</p>
      </div>
    );
  }

  return (
    <div>
      {/* Trip header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
          <span>{trip.start_date}</span>
          <span>→</span>
          <span>{trip.end_date}</span>
          <span>·</span>
          <span>{trip.people_count}人</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {trip.departure} → {(trip.destinations || []).join(' / ')}
        </h1>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {plans.map(plan => (
          <button
            key={plan.mode}
            onClick={() => setActiveMode(plan.mode)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeMode === plan.mode
                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                : 'bg-white text-gray-600 border border-gray-100 hover:border-orange-200'
            }`}
          >
            <span>{MODE_ICONS[plan.mode] || '🚀'}</span>
            <span>{MODE_LABELS[plan.mode] || plan.mode}</span>
            <span className={`text-xs ${activeMode === plan.mode ? 'text-orange-100' : 'text-gray-400'}`}>
              ¥{(plan.estimated_total || 0).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {activePlan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Itinerary */}
          <div className="lg:col-span-2 space-y-4">
            {/* Transport info */}
            {activePlan.transport_detail && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                🚀 <strong>交通方案：</strong>{activePlan.transport_detail}
              </div>
            )}

            {/* Day by day */}
            {activePlan.itinerary.map((day, i) => (
              <DayTimeline key={i} day={day} />
            ))}

            {/* Tips */}
            {activePlan.tips && activePlan.tips.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-5">
                <h3 className="font-semibold text-amber-800 mb-3">💡 实用贴士</h3>
                <ul className="space-y-2">
                  {activePlan.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            <CostBreakdown cost={activePlan.cost_breakdown} peopleCount={trip.people_count} />

            {/* Attractions */}
            {activePlan.attractions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🏷️ 推荐景点</h3>
                <div className="space-y-3">
                  {activePlan.attractions.map((a, i) => (
                    <div key={i} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{a.name}</span>
                        {a.cost > 0 && <span className="text-xs text-orange-500">¥{a.cost}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{a.description}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-400">
                        <span>{a.category}</span>
                        <span>{a.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accommodations */}
            {activePlan.accommodations.length > 0 && (
              <AccommodationList items={activePlan.accommodations as any[]} webSearchUsed={false} />
            )}

            {/* Food spots */}
            {activePlan.food_spots.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🍽️ 美食推荐</h3>
                <div className="space-y-3">
                  {activePlan.food_spots.map((f, i) => (
                    <div key={i} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{f.name}</span>
                        <span className="text-xs text-orange-500">人均¥{f.avgCost}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{f.type} · {f.area}</p>
                      <p className="text-xs text-gray-500 mt-0.5">推荐：{f.specialty}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
