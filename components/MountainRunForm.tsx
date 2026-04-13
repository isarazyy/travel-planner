'use client';

import { useState } from 'react';
import type { TripFormData } from '@/lib/types';
import { parseSSEResponse } from '@/lib/parse-sse';
import { saveGenerateResultLocally } from '@/lib/local-storage-trips';
import PlanResultDirect from '@/components/PlanResultDirect';
import RegisterPrompt from '@/components/RegisterPrompt';
import CityPicker from '@/components/CityPicker';

type VehicleType = 'motorcycle' | 'car' | 'bicycle';

const VEHICLES: { value: VehicleType; icon: string; label: string; desc: string }[] = [
  { value: 'motorcycle', icon: '🏍️', label: '摩托车', desc: '压弯跑山' },
  { value: 'car', icon: '🚗', label: '汽车', desc: '驾驶乐趣' },
  { value: 'bicycle', icon: '🚴', label: '自行车', desc: '爬坡刷山' },
];

const VEHICLE_PLACEHOLDERS: Record<VehicleType, { vehicleInput: string; generateLabel: string; genIcon: string }> = {
  motorcycle: { vehicleInput: '如：春风450SR、KTM 390、250 ADV', generateLabel: '生成跑山路线', genIcon: '🏍️' },
  car: { vehicleInput: '如：思域 Type-R、GR86、高尔夫 GTI', generateLabel: '生成跑山路线', genIcon: '🚗' },
  bicycle: { vehicleInput: '如：公路车、山地车、碳纤维', generateLabel: '生成骑行路线', genIcon: '🚴' },
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function MountainRunForm() {
  const [vehicle, setVehicle] = useState<VehicleType>('motorcycle');
  const [departure, setDeparture] = useState('');
  const [date, setDate] = useState(today());
  const [days, setDays] = useState('1');
  const [vehicleModel, setVehicleModel] = useState('');
  const [direction, setDirection] = useState('');
  const [foodHint, setFoodHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);

  const ph = VEHICLE_PLACEHOLDERS[vehicle];

  const transportModeForVehicle = (v: VehicleType): string => {
    if (v === 'car') return 'self_drive';
    if (v === 'bicycle') return 'bicycle';
    return 'motorcycle';
  };

  async function handleGenerate() {
    if (!departure.trim()) {
      setError('请填写出发城市');
      return;
    }

    setLoading(true);
    setError('');

    const numDays = parseInt(days) || 1;
    const startDate = date || today();
    const endDate = numDays > 1
      ? (() => {
          const d = new Date(startDate);
          d.setDate(d.getDate() + numDays - 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : startDate;

    const payload: TripFormData = {
      departure: departure.trim(),
      destinations: direction.trim() ? [direction.trim()] : [],
      destinationMode: direction.trim() ? 'specific' : 'open',
      destinationThemes: [],
      openModeDetails: direction.trim() ? [] : ['nearby'],
      destinationHint: '',
      dateMode: 'fixed',
      generationMode: 'fast',
      startDate,
      endDate,
      peopleCount: 1,
      preferences: {
        companion: 'solo',
        pace: 'balanced',
        interests: [],
        accommodation: numDays > 1 ? 'budget_hotel' : 'mixed',
        accommodationStyles: [],
        foodPrefs: foodHint.trim() ? ['local_must'] : [],
        dietaryNotes: foodHint.trim() || '',
        budgetLevel: 'economy',
        budgetRange: [100, 300],
        transportModes: [transportModeForVehicle(vehicle)],
        motoRideType: 'mountain_run',
        mountainRunVehicle: vehicle,
        motoBikeType: vehicleModel.trim(),
        motoDailyKm: vehicle === 'bicycle' ? 80 : 200,
        motoAllowNightRide: 'no',
        wakeUpTime: 'normal',
        mustVisit: '',
        mustAvoid: '',
        specialNeeds: '',
      },
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300000);
      let res: Response;
      try {
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const json = await parseSSEResponse(res);
      if (json.saveLocal && !json.savedTripId) {
        try {
          const localId = saveGenerateResultLocally(json);
          json.savedTripId = localId;
          json.savedLocal = true;
        } catch {}
      }
      setResult(json);
    } catch (err: any) {
      if (err.message?.includes('免费试用已用完')) {
        setShowRegisterPrompt(true);
      } else {
        setError(err.message || '生成失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              ← 返回修改
            </button>
            <h1 className="text-xl font-bold text-gray-900">你的跑山路线</h1>
          </div>
          <button
            onClick={() => { setResult(null); setDeparture(''); setDirection(''); }}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-red-600 border border-gray-200 rounded-xl hover:border-red-200 hover:bg-red-50 transition"
          >
            重新规划
          </button>
        </div>

        <div className="mb-6 flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition disabled:opacity-50"
          >
            {loading ? '生成中…' : '换一条路线'}
          </button>
        </div>

        <PlanResultDirect
          key={`mr-${result.plans?.[0]?.planName}`}
          trip={result.trip}
          plans={result.plans}
          recommendations={result.recommendations}
          hotelWebSearchUsed={false}
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <RegisterPrompt open={showRegisterPrompt} onClose={() => setShowRegisterPrompt(false)} />

      <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-6 shadow-sm">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">跑山路线规划</h2>
          <p className="text-sm text-gray-500 mt-1">选好座驾，AI 帮你找附近最好的山路</p>
        </div>

        <div className="space-y-4">
          {/* Vehicle type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择座驾</label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => { setVehicle(v.value); setVehicleModel(''); }}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition ${
                    vehicle === v.value
                      ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500/20'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{v.icon}</span>
                  <span className="text-sm font-medium text-gray-900">{v.label}</span>
                  <span className="text-[11px] text-gray-500">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Departure city */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">出发城市 <span className="text-red-400">*</span></label>
            <CityPicker
              inline
              value={departure}
              onChange={setDeparture}
              onSelect={setDeparture}
              placeholder="输入或选择出发城市"
              className="w-full rounded-xl border border-gray-200 pl-4 pr-9 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">出发日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">几天</label>
            <div className="flex gap-2">
              {['1', '2', '3'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                    days === d
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {d === '1' ? '1天（当天往返）' : `${d}天`}
                </button>
              ))}
            </div>
          </div>

          {/* Vehicle model (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {vehicle === 'bicycle' ? '车型' : '车型/排量'} <span className="text-gray-400 text-xs font-normal">选填</span>
            </label>
            <input
              type="text"
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder={ph.vehicleInput}
              maxLength={30}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Direction hint (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              想往哪个方向跑？ <span className="text-gray-400 text-xs font-normal">选填</span>
            </label>
            <CityPicker
              inline
              value={direction}
              onChange={setDirection}
              onSelect={setDirection}
              placeholder="如：延庆方向、门头沟、不填则AI推荐"
              className="w-full rounded-xl border border-gray-200 pl-4 pr-9 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Food hint (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              想吃什么？ <span className="text-gray-400 text-xs font-normal">选填</span>
            </label>
            <input
              type="text"
              value={foodHint}
              onChange={(e) => setFoodHint(e.target.value)}
              placeholder="如：农家菜、烧烤、面条、不填也行"
              maxLength={30}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !departure.trim()}
          className="mt-6 w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              AI 规划跑山路线中...
            </>
          ) : (
            `${ph.genIcon} ${ph.generateLabel}`
          )}
        </button>

        <p className="mt-3 text-center text-xs text-gray-400">
          {vehicle === 'bicycle'
            ? 'AI 推荐附近爬坡最爽的山路 · 含补给点和饭店推荐'
            : 'AI 推荐附近弯道最好的山路 · 含沿途饭店推荐'}
        </p>
      </div>
    </div>
  );
}
