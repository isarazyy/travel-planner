'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import StepBasic from '@/components/StepForm/StepBasic';
import StepTravelStyle from '@/components/StepForm/StepTravelStyle';
import StepBudgetAccom from '@/components/StepForm/StepBudgetAccom';
import PlanResultDirect from '@/components/PlanResultDirect';
import RegisterPrompt from '@/components/RegisterPrompt';
import MountainRunForm from '@/components/MountainRunForm';
import type { TripFormData } from '@/lib/types';
import { compareIso } from '@/lib/date-utils';
import { parseSSEResponse } from '@/lib/parse-sse';
import { saveGenerateResultLocally } from '@/lib/local-storage-trips';

const STEPS = [
  { key: 'basic', label: '基本信息', icon: '📍' },
  { key: 'style', label: '出行方式', icon: '🚗' },
  { key: 'budget', label: '预算与补充', icon: '💰' },
];

const initialData: TripFormData = {
  departure: '',
  destinations: [],
  destinationMode: 'specific',
  destinationThemes: [],
  openModeDetails: [],
  destinationHint: '',
  dateMode: 'fixed',
  generationMode: 'fast',
  startDate: '',
  endDate: '',
  peopleCount: 1,
  preferences: {
    companion: 'solo',
    childAge: '',
    pace: 'balanced',
    interests: [],
    accommodation: 'mixed',
    accommodationStyles: [],
    foodPrefs: [],
    dietaryNotes: '',
    budgetLevel: 'economy',
    budgetRange: [200, 400],
    transportModes: ['train'],
    motoBikeType: '',
    motoDailyKm: 220,
    motoAllowNightRide: 'no',
    wakeUpTime: 'normal',
    mustVisit: '',
    mustAvoid: '',
    specialNeeds: '',
  },
};

const quickDefaults: Partial<TripFormData> & { preferences: TripFormData['preferences'] } = {
  generationMode: 'fast' as const,
  peopleCount: 2,
  preferences: {
    companion: 'couple',
    pace: 'balanced',
    interests: ['food', 'culture'],
    accommodation: 'comfort_hotel',
    accommodationStyles: [],
    foodPrefs: ['local_must'],
    dietaryNotes: '',
    budgetLevel: 'comfort',
    budgetRange: [400, 800],
    transportModes: ['train'],
    motoBikeType: '',
    motoDailyKm: 220,
    motoAllowNightRide: 'no',
    wakeUpTime: 'normal',
    mustVisit: '',
    mustAvoid: '',
    specialNeeds: '',
  },
};

function PlanContent() {
  const searchParams = useSearchParams();
  const startQuick = searchParams.get('quick') === '1';
  const startMountain = searchParams.get('mountain') === '1';

  const [topTab, setTopTab] = useState<'travel' | 'mountain'>(startMountain ? 'mountain' : 'travel');
  const [mode, setMode] = useState<'quick' | 'detail'>(startQuick ? 'quick' : 'detail');
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Quick mode fields
  const [quickDeparture, setQuickDeparture] = useState('');
  const [quickDestination, setQuickDestination] = useState('');
  const [quickDays, setQuickDays] = useState('3');
  const [quickNoIdea, setQuickNoIdea] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    setLoading(true);
    localStorage.setItem('gen_job_id', jobId);
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed > 180_000) {
        stopPolling();
        localStorage.removeItem('gen_job_id');
        setError('生成超时，请重试');
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`/api/job/status?id=${jobId}`);
        const j = await r.json();
        if (j.status === 'done' && j.result) {
          stopPolling();
          localStorage.removeItem('gen_job_id');
          setResult(j.result);
          setLoading(false);
        } else if (j.status === 'error') {
          stopPolling();
          localStorage.removeItem('gen_job_id');
          setError(j.errorMessage || '生成失败');
          setLoading(false);
        }
      } catch { /* network hiccup, retry next interval */ }
    }, 3000);
  }, [stopPolling]);

  // On mount: resume polling if there's an unfinished job
  useEffect(() => {
    const savedJobId = localStorage.getItem('gen_job_id');
    if (savedJobId) startPolling(savedJobId);
    return stopPolling;
  }, [startPolling, stopPolling]);

  const canProceed = () => {
    if (step === 0) {
      if (!data.departure) return false;
      if (data.destinationMode === 'specific' && (!data.destinations || data.destinations.length === 0)) return false;
      if (data.destinationMode === 'theme' && (!data.destinationThemes?.length && !data.destinationHint?.trim())) return false;
      if (data.dateMode === 'fixed') {
        if (!data.startDate || !data.endDate) return false;
        return compareIso(data.endDate, data.startDate) >= 0;
      }
      if (data.dateMode === 'flexible_end') return !!data.startDate;
      return true;
    }
    if (step === 1) {
      return (data.preferences?.transportModes?.length ?? 0) > 0;
    }
    return true;
  };

  async function doGenerate(payload: TripFormData) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type') || '';

      // Async mode: server returned jobId immediately
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.async && json.jobId) {
          startPolling(json.jobId);
          return;
        }
        if (json.error) {
          if (json.error.includes('免费试用已用完')) { setShowRegisterPrompt(true); }
          else { setError(json.error); }
          setLoading(false);
          return;
        }
      }

      // SSE mode (guest flow): parse stream as before
      const json = await parseSSEResponse(res);
      if (json.saveLocal && !json.savedTripId) {
        try {
          const localId = saveGenerateResultLocally(json);
          json.savedTripId = localId;
          json.savedLocal = true;
        } catch { /* localStorage full */ }
      }
      setResult(json);
      setLoading(false);
    } catch (err: any) {
      if (err.message?.includes('免费试用已用完')) {
        setShowRegisterPrompt(true);
      } else {
        setError(err.message || '生成失败，请重试');
      }
      setLoading(false);
    }
  }

  async function handleGenerate(modeOverride?: 'fast' | 'standard') {
    const payload = modeOverride ? { ...data, generationMode: modeOverride } : data;
    await doGenerate(payload as TripFormData);
  }

  async function handleQuickGenerate() {
    if (!quickDeparture.trim()) {
      setError('请填写出发地');
      return;
    }
    const payload: TripFormData = {
      ...initialData,
      departure: quickDeparture.trim(),
      destinations: quickNoIdea ? [] : quickDestination.trim() ? quickDestination.trim().split(/[,，、\s]+/).filter(Boolean) : [],
      destinationMode: quickNoIdea ? 'open' : 'specific',
      openModeDetails: quickNoIdea ? ['nearby'] : [],
      dateMode: 'flexible_all',
      dateHint: `${quickDays}天`,
      generationMode: 'fast',
      peopleCount: quickDefaults.peopleCount!,
      preferences: { ...quickDefaults.preferences },
    };

    if (!quickNoIdea && payload.destinations.length === 0) {
      setError('请填写目的地，或勾选"帮我选"');
      return;
    }

    setData(payload);
    await doGenerate(payload);
  }

  function handleReset() {
    setResult(null);
    setStep(0);
    setData(initialData);
    setQuickDeparture('');
    setQuickDestination('');
    setQuickDays('3');
    setQuickNoIdea(false);
  }

  function handleBackToForm() {
    setResult(null);
  }

  async function handleRefreshFast() {
    const payload = { ...data, generationMode: 'fast' as const, regenerate: true };
    await doGenerate(payload as TripFormData);
  }

  async function handleUpgradeStandard() {
    await handleGenerate('standard');
  }

  // Result view (travel mode only — mountain run handles its own result)
  if (result && topTab === 'travel') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToForm}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              ← 返回上一步
            </button>
            <h1 className="text-xl font-bold text-gray-900">你的旅行方案</h1>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-red-600 border border-gray-200 rounded-xl hover:border-red-200 hover:bg-red-50 transition"
          >
            清空并重新规划
          </button>
        </div>

        <PlanResultDirect
          key={`${result.plans?.length}-${result.plans?.[0]?.planName}`}
          trip={result.trip}
          plans={result.plans}
          recommendations={result.recommendations}
          hotelWebSearchUsed={!!result.hotelWebSearchUsed}
          onRegenerate={handleRefreshFast}
          regenerating={loading}
        />
      </div>
    );
  }

  const stepComponents = [
    <StepBasic key="basic" data={data} onChange={setData} />,
    <StepTravelStyle key="style" data={data} onChange={setData} />,
    <StepBudgetAccom key="budget" data={data} onChange={setData} />,
  ];

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <RegisterPrompt open={showRegisterPrompt} onClose={() => setShowRegisterPrompt(false)} />

      {/* Top-level Tab: 旅行规划 | 跑山路线 */}
      <div className="mb-6 flex items-center justify-center">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTopTab('travel')}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${
              topTab === 'travel'
                ? 'bg-gray-900 text-white shadow'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            🗺️ 旅行规划
          </button>
          <button
            type="button"
            onClick={() => setTopTab('mountain')}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${
              topTab === 'mountain'
                ? 'bg-amber-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            🏍️ 跑山路线
          </button>
        </div>
      </div>

      {/* Mountain run tab */}
      {topTab === 'mountain' && <MountainRunForm />}

      {/* Travel tab */}
      {topTab === 'travel' && (
        <>
          {/* Mode switcher */}
          <div className="mb-6 flex items-center justify-center">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  mode === 'quick' ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ⚡ 快速生成
              </button>
              <button
                type="button"
                onClick={() => setMode('detail')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  mode === 'detail' ? 'bg-orange-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🎯 详细定制
              </button>
            </div>
          </div>

          {/* Quick mode */}
          {mode === 'quick' && (
            <div className="rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50 to-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-1">快速生成旅行方案</h2>
              <p className="text-sm text-gray-500 mb-5">只需 3 步，AI 帮你搞定一切</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">出发地</label>
                  <input
                    type="text"
                    value={quickDeparture}
                    onChange={(e) => setQuickDeparture(e.target.value)}
                    placeholder="如：北京、上海、成都"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目的地</label>
                  <input
                    type="text"
                    value={quickDestination}
                    onChange={(e) => { setQuickDestination(e.target.value); if (quickNoIdea) setQuickNoIdea(false); }}
                    disabled={quickNoIdea}
                    placeholder={quickNoIdea ? 'AI 帮你推荐' : '如：西安、成都，多个用逗号分隔'}
                    className={`w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                      quickNoIdea ? 'bg-gray-50 text-gray-400' : ''
                    }`}
                  />
                  <label className="mt-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quickNoIdea}
                      onChange={(e) => { setQuickNoIdea(e.target.checked); if (e.target.checked) setQuickDestination(''); }}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-600">没想好去哪，帮我推荐</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">大概几天</label>
                  <div className="flex gap-2">
                    {['1', '2', '3', '5', '7', '10'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setQuickDays(d)}
                        className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                          quickDays === d
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {d}天
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <button
                onClick={handleQuickGenerate}
                disabled={loading}
                className="mt-6 w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    AI 极速生成中...
                  </>
                ) : (
                  '⚡ 立即生成'
                )}
              </button>

              <p className="mt-3 text-center text-xs text-gray-400">
                默认 2人出行 · 舒适预算 · 高铁优先 · 适中节奏
              </p>
            </div>
          )}

          {/* Detail mode */}
          {mode === 'detail' && (
            <>
              {/* Progress bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">
                    步骤 {step + 1} / {STEPS.length}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {STEPS[step].icon} {STEPS[step].label}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.key}
                      onClick={() => { if (i < step) { setStep(i); window.scrollTo({ top: 0 }); } }}
                      className={`text-xs transition ${
                        i <= step ? 'text-orange-500 cursor-pointer' : 'text-gray-300 cursor-default'
                      }`}
                      disabled={i > step}
                    >
                      {s.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step content */}
              <div className="min-h-[400px]">
                {stepComponents[step]}
              </div>

              {/* Background generation notice */}
              {loading && localStorage.getItem('gen_job_id') && (
                <div className="mt-4 bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <span className="flex-1">方案正在后台生成，你可以随意浏览其他页面，生成完成后会自动显示结果</span>
                  <button
                    type="button"
                    onClick={() => {
                      stopPolling();
                      localStorage.removeItem('gen_job_id');
                      setLoading(false);
                      setError('');
                    }}
                    className="shrink-0 ml-2 px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                  >
                    取消生成
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => { setStep(s => s - 1); window.scrollTo({ top: 0 }); }}
                  disabled={step === 0}
                  className="px-6 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  ← 上一步
                </button>

                {isLastStep ? (
                  <button
                    onClick={() => handleGenerate()}
                    disabled={loading || !canProceed()}
                    className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        AI 生成中...
                      </>
                    ) : (
                      '生成方案'
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => { setStep(s => s + 1); window.scrollTo({ top: 0 }); }}
                    disabled={!canProceed()}
                    className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一步 →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-20 text-center text-gray-400">加载中...</div>}>
      <PlanContent />
    </Suspense>
  );
}
