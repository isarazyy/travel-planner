'use client';

import PlanResultDirect from '@/components/PlanResultDirect';

export default function SharePlanView({ data }: { data: any }) {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 text-center">
        <p className="text-sm text-gray-400">来自旅行助手的分享方案</p>
      </div>
      <PlanResultDirect
        trip={data.trip}
        plans={data.plans}
        recommendations={data.recommendations}
        hotelWebSearchUsed={data.hotelWebSearchUsed}
      />
    </main>
  );
}
