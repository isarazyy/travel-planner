'use client';

import { useState } from 'react';
import StepBasic from '@/components/StepForm/StepBasic';
import StepCompanion from '@/components/StepForm/StepCompanion';
import StepPace from '@/components/StepForm/StepPace';
import StepInterests from '@/components/StepForm/StepInterests';
import StepAccom from '@/components/StepForm/StepAccom';
import StepFood from '@/components/StepForm/StepFood';
import StepBudget from '@/components/StepForm/StepBudget';
import StepTransport from '@/components/StepForm/StepTransport';
import StepExtra from '@/components/StepForm/StepExtra';
import PlanResultDirect from '@/components/PlanResultDirect';
import type { TripFormData } from '@/lib/types';
import { parseSSEResponse } from '@/lib/parse-sse';

const STEPS = [
  { key: 'basic', label: '基本信息', icon: '📍' },
  { key: 'companion', label: '同行人', icon: '👥' },
  { key: 'pace', label: '旅行节奏', icon: '⏱️' },
  { key: 'interests', label: '兴趣偏好', icon: '❤️' },
  { key: 'accom', label: '住宿', icon: '🏨' },
  { key: 'food', label: '餐饮', icon: '🍽️' },
  { key: 'budget', label: '预算', icon: '💰' },
  { key: 'transport', label: '出行方式', icon: '🚗' },
  { key: 'extra', label: '其他', icon: '✨' },
];

const initialData: TripFormData = {
  departure: '',
  destinations: [],
  destinationMode: 'specific',
  destinationThemes: [],
  destinationHint: '',
  dateMode: 'fixed',
  generationMode: 'standard',
  startDate: '',
  endDate: '',
  peopleCount: 1,
  preferences: {
    companion: 'solo',
    childAge: '',
    pace: 'balanced',
    interests: [],
    accommodation: 'mixed',
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

export default function PlanPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const canProceed = () => {
    if (step === 0) {
      if (!data.departure) return false;
      if (data.destinationMode === 'specific' && (!data.destinations || data.destinations.length === 0)) return false;
      if (data.destinationMode === 'theme' && (!data.destinationThemes?.length && !data.destinationHint?.trim())) return false;
      if (data.dateMode === 'fixed') return !!(data.startDate && data.endDate);
      if (data.dateMode === 'flexible_end') return !!data.startDate;
      return true;
    }
    if (step === 7) {
      return data.preferences.transportModes.length > 0;
    }
    return true;
  };

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await parseSSEResponse(res);
      setResult(json);
    } catch (err: any) {
      setError(err.message || '生成失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setStep(0);
    setData(initialData);
  }

  if (result) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">你的旅行方案</h1>
          <button
            onClick={handleReset}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl transition"
          >
            重新规划
          </button>
        </div>
        <PlanResultDirect
          trip={result.trip}
          plans={result.plans}
          recommendations={result.recommendations}
          hotelWebSearchUsed={!!result.hotelWebSearchUsed}
        />
      </div>
    );
  }

  const stepComponents = [
    <StepBasic key="basic" data={data} onChange={setData} />,
    <StepCompanion key="companion" data={data} onChange={setData} />,
    <StepPace key="pace" data={data} onChange={setData} />,
    <StepInterests key="interests" data={data} onChange={setData} />,
    <StepAccom key="accom" data={data} onChange={setData} />,
    <StepFood key="food" data={data} onChange={setData} />,
    <StepBudget key="budget" data={data} onChange={setData} />,
    <StepTransport key="transport" data={data} onChange={setData} />,
    <StepExtra key="extra" data={data} onChange={setData} />,
  ];

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
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
              onClick={() => i < step && setStep(i)}
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

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
        <button
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="px-6 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          ← 上一步
        </button>

        {isLastStep ? (
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-gray-200 p-1 bg-white">
              <button
                type="button"
                onClick={() => setData((d) => ({ ...d, generationMode: 'standard' }))}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  data.generationMode === 'standard'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                标准模式
              </button>
              <button
                type="button"
                onClick={() => setData((d) => ({ ...d, generationMode: 'fast' }))}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  data.generationMode === 'fast'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                极速模式
              </button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading || !canProceed()}
              className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {data.generationMode === 'fast' ? '极速生成中...' : 'AI 生成中...'}
                </>
              ) : (
                data.generationMode === 'fast' ? '⚡ 极速生成' : '🚀 生成旅行方案'
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一步 →
          </button>
        )}
      </div>
    </div>
  );
}
