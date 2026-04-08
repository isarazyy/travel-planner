'use client';

export default function StepExtra({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  function patchPreferences(updates: Record<string, string | undefined>) {
    onChange({
      ...data,
      preferences: { ...data.preferences, ...updates },
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
          补充信息
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          选填，越具体 AI 越懂你；没有可以直接生成
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label
          htmlFor="must-visit"
          className="mb-2 block text-sm font-medium text-gray-800"
        >
          必去地点
        </label>
        <input
          id="must-visit"
          type="text"
          value={data.preferences?.mustVisit ?? ''}
          onChange={(e) => patchPreferences({ mustVisit: e.target.value })}
          maxLength={200}
          placeholder="如：武侯祠、宽窄巷子"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label
          htmlFor="must-avoid"
          className="mb-2 block text-sm font-medium text-gray-800"
        >
          希望避开
        </label>
        <input
          id="must-avoid"
          type="text"
          value={data.preferences?.mustAvoid ?? ''}
          onChange={(e) => patchPreferences({ mustAvoid: e.target.value })}
          maxLength={200}
          placeholder="如：不想去太商业化的地方"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label
          htmlFor="special-needs"
          className="mb-2 block text-sm font-medium text-gray-800"
        >
          特殊需求
        </label>
        <textarea
          id="special-needs"
          rows={3}
          value={data.preferences?.specialNeeds ?? ''}
          onChange={(e) =>
            patchPreferences({ specialNeeds: e.target.value })
          }
          maxLength={500}
          placeholder="如：轮椅无障碍、带宠物、需要婴儿设施等"
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
    </div>
  );
}
