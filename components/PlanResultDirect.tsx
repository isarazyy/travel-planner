'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import DayTimeline from './DayTimeline';
import CostBreakdown from './CostBreakdown';
import AccommodationList from './AccommodationList';
import type { TripWeatherPayload } from '@/lib/weather';
import { normalizeTips, sanitizePlanString } from '@/lib/normalize-plan';
import { getDressAndUmbrellaAdvice } from '@/lib/weather-advice';
import { parseSSEResponse } from '@/lib/parse-sse';

/** Tailwind v4 使用 oklch 等颜色，html2canvas 易得到空白图；html-to-image 兼容性更好。 */
function safeFilename(name: string, ext: string) {
  const base = (name || 'travel-plan').replace(/[/\\?%*:|"<> \n\r\t]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').trim() || 'travel-plan';
  return `${base}.${ext}`;
}

/** PNG 导出：2x 在部分环境下会导致 foreignObject 内文字叠字，固定 1x 优先保证可读 */
function exportPixelRatio(): number {
  return 1;
}

function triggerDataUrlDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

interface PlanData {
  planName: string;
  planDescription: string;
  transport_detail: string;
  itinerary: any[];
  attractions: any[];
  accommodations: any[];
  food_spots: any[];
  cost_breakdown: any;
  estimated_total: number;
  tips: string[];
}

interface TripData {
  departure: string;
  destinations: string[];
  date_mode: string;
  start_date: string;
  end_date: string;
  people_count: number;
}

interface Recommendations {
  route: string;
  days: number | null;
  season: string | null;
  nearbySuggestions?: string | null;
  weather?: TripWeatherPayload | null;
}

function isTimeoutLike(msg: string): boolean {
  return /(超时|timeout|Abort|ETIMEDOUT|aborted)/i.test(msg);
}

export default function PlanResultDirect({
  trip,
  plans,
  recommendations,
  hotelWebSearchUsed,
}: {
  trip: TripData;
  plans: PlanData[];
  recommendations?: Recommendations;
  hotelWebSearchUsed?: boolean;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [localPlans, setLocalPlans] = useState<PlanData[]>(plans);
  const [activeIdx, setActiveIdx] = useState(0);
  const [versionCounts, setVersionCounts] = useState<number[]>(plans.map(() => 1));
  const [lastChangeSummary, setLastChangeSummary] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: '你可以继续告诉我想怎么改，比如“第2天轻松一点”“预算降到5000以内”“把博物馆换成夜景”。' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatNotice, setChatNotice] = useState('');
  const [exportingImage, setExportingImage] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');
  const activePlan = localPlans[activeIdx];
  const displayTips = activePlan ? normalizeTips(activePlan.tips) : [];
  const isFixedDates = trip.date_mode === 'fixed' && !!(trip.start_date && trip.end_date);

  async function requestPlanChat(payload: Record<string, unknown>, timeoutMs = 300000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('/api/plan-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return await parseSSEResponse(res);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('请求超时：AI 修改耗时过长，请稍后重试');
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportDoc() {
    if (!activePlan) return;
    const lines: string[] = [];
    lines.push(`# ${activePlan.planName}`);
    lines.push('');
    lines.push(`- 出发地: ${trip.departure}`);
    if (trip.destinations?.length) {
      lines.push(`- 想去的地方（清单）: ${trip.destinations.join('、')}`);
    }
    lines.push(`- 人数: ${trip.people_count}`);
    if (recommendations?.route) lines.push(`- 智能规划顺序（推荐）: ${recommendations.route}`);
    if (recommendations?.days != null) {
      lines.push(`- ${isFixedDates ? '行程天数（您的日期）' : '推荐天数'}: ${recommendations.days}`);
    }
    if (recommendations?.season) {
      lines.push(`- ${isFixedDates ? '选定时段出行提示' : '最佳季节/时段'}: ${recommendations.season}`);
    }
    if (recommendations?.nearbySuggestions) {
      lines.push(`- 周边/顺路可玩: ${recommendations.nearbySuggestions}`);
    }
    if (recommendations?.weather?.locations?.length) {
      lines.push('');
      lines.push(`## 天气预报（Open-Meteo）`);
      if (recommendations.weather.note) lines.push(recommendations.weather.note);
      for (const loc of recommendations.weather.locations) {
        lines.push(`### ${loc.displayName}`);
        for (const d of loc.days) {
          lines.push(`- ${d.date} ${d.condition} ${d.tempMin}~${d.tempMax}℃ 降水概率${d.precipProb}%`);
        }
      }
    }
    lines.push('');
    lines.push(`## 方案说明`);
    lines.push(activePlan.planDescription || '无');
    lines.push('');
    lines.push(`## 交通`);
    lines.push(activePlan.transport_detail || '无');
    lines.push('');
    lines.push(`## 每日行程`);
    for (const d of activePlan.itinerary || []) {
      lines.push(`### Day ${d.day} - ${d.theme || ''}`);
      if (recommendations?.weather?.locations?.length) {
        const dayIdx = Math.max(0, (d.day || 1) - 1);
        const dayWeather = recommendations.weather.locations
          .map((loc) => (d.dateIso ? loc.days.find((x) => x.date === d.dateIso) : undefined) || loc.days[dayIdx])
          .filter((x): x is NonNullable<typeof x> => !!x);
        const bits = recommendations.weather.locations
          .map((loc) => {
            const w = (d.dateIso ? loc.days.find((x) => x.date === d.dateIso) : undefined) || loc.days[dayIdx];
            if (!w) return null;
            return `${loc.displayName || loc.query} ${w.condition} ${w.tempMin}~${w.tempMax}℃`;
          })
          .filter((x): x is string => !!x);
        if (bits.length) lines.push(`- 天气参考：${bits.join('；')}`);
        const advice = getDressAndUmbrellaAdvice(dayWeather);
        if (advice) lines.push(`- 穿衣与雨具：${advice}`);
      }
      for (const a of d.activities || []) {
        lines.push(
          `- ${sanitizePlanString(a.time, '—')} ${sanitizePlanString(a.activity, '活动待补充')} (${sanitizePlanString(a.location, '地点待补充')}) ${sanitizePlanString(a.duration, '时长待定')}${a.cost ? ` ¥${a.cost}` : ''}`,
        );
      }
      lines.push('');
    }
    if (activePlan.accommodations?.length) {
      lines.push(`## 住宿`);
      for (const a of activePlan.accommodations) {
        lines.push(`### ${a.name || '住宿'}${a.pricePerNight > 0 ? `（约¥${a.pricePerNight}/晚）` : ''}`);
        lines.push(`${a.type || ''} · ${a.area || ''} · 参考¥${a.pricePerNight ?? 0}/晚`);
        if (a.highlights) lines.push(a.highlights);
        if (Array.isArray(a.pros) && a.pros.length) {
          lines.push('优势：');
          for (const t of a.pros) lines.push(`- ${t}`);
        }
        if (Array.isArray(a.cons) && a.cons.length) {
          lines.push('劣势/注意：');
          for (const t of a.cons) lines.push(`- ${t}`);
        }
        if (a.webNote) lines.push(`说明：${a.webNote}`);
        lines.push('');
      }
    }

    lines.push(`## 费用`);
    lines.push(`- 交通: ¥${activePlan.cost_breakdown?.transport ?? 0}`);
    lines.push(`- 住宿: ¥${activePlan.cost_breakdown?.accommodation ?? 0}`);
    lines.push(`- 餐饮: ¥${activePlan.cost_breakdown?.food ?? 0}`);
    lines.push(`- 景点: ¥${activePlan.cost_breakdown?.attractions ?? 0}`);
    lines.push(`- 其他: ¥${activePlan.cost_breakdown?.other ?? 0}`);
    lines.push(`- 总计: ¥${activePlan.cost_breakdown?.total ?? activePlan.estimated_total ?? 0}`);
    lines.push('');
    lines.push(`## 贴士`);
    for (const t of normalizeTips(activePlan.tips)) lines.push(`- ${t}`);
    downloadTextFile(`${activePlan.planName || 'travel-plan'}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  }

  async function handleExportImage() {
    if (!exportRef.current) return;
    setExportError('');
    setExportingImage(true);
    try {
      const el = exportRef.current;
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready.catch(() => {});
      }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: exportPixelRatio(),
        backgroundColor: '#f9fafb',
      });
      triggerDataUrlDownload(dataUrl, safeFilename(activePlan?.planName || 'travel-plan', 'png'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(`导出图片失败：${msg}`);
    } finally {
      setExportingImage(false);
    }
  }

  async function handleExportPdf() {
    if (!exportRef.current || !activePlan) return;
    setExportError('');
    setExportingPdf(true);
    try {
      const el = exportRef.current;
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready.catch(() => {});
      }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const imageData = await toPng(el, {
        cacheBust: true,
        pixelRatio: exportPixelRatio(),
        backgroundColor: '#ffffff',
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('无法打开打印窗口，请检查浏览器弹窗拦截设置');
      }

      const blob = await (await fetch(imageData)).blob();
      const blobUrl = URL.createObjectURL(blob);
      const title = activePlan.planName || 'travel-plan';
      const safeTitle = escapeHtml(title);

      printWindow.document.open();
      printWindow.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>` +
          `<style>@page { size: A4; margin: 10mm; } body { margin: 0; font-family: Arial, "PingFang SC", sans-serif; } .wrap { display: flex; justify-content: center; } img { width: 100%; max-width: 794px; height: auto; }</style></head>` +
          `<body><div class="wrap"><img src="${blobUrl}" alt="${safeTitle}" /></div></body></html>`
      );
      printWindow.document.close();
      printWindow.focus();

      const revoke = () => URL.revokeObjectURL(blobUrl);
      printWindow.addEventListener('afterprint', revoke);
      setTimeout(() => {
        printWindow.print();
        setTimeout(revoke, 60_000);
      }, 300);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(`导出 PDF 失败：${msg}`);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleChatSubmit() {
    const message = chatInput.trim();
    if (!message || !activePlan) return;
    setChatError('');
    setChatNotice('');
    setChatLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setChatInput('');

    try {
      const payload = {
        trip,
        recommendations,
        activePlan,
        message,
        history: messages,
      };
      let json: any;
      try {
        json = await requestPlanChat(payload);
      } catch (firstErr: unknown) {
        const firstMsg = String((firstErr as Error)?.message || firstErr || '');
        if (!isTimeoutLike(firstMsg)) throw firstErr;
        // 前端再兜底重试一次，减少用户手动重点“发送”
        json = await requestPlanChat(payload, 190000);
      }
      if (json?.fallbackUsed) {
        setChatNotice('本次修改请求较慢，系统已自动重试并成功完成。');
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: json.assistantMessage || '已完成调整。' }]);
      setLastChangeSummary(json.changeSummary || '已更新当前方案');
      setLocalPlans((prev) => prev.map((p, i) => (i === activeIdx ? json.updatedPlan : p)));
      setVersionCounts((prev) => prev.map((v, i) => (i === activeIdx ? v + 1 : v)));
    } catch (err: any) {
      setChatError(err.message || '修改失败，请重试');
      setMessages((prev) => [...prev, { role: 'assistant', content: '这次修改失败了，你可以重试一次。' }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (localPlans.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-4">😔</p>
        <p>暂无生成的方案</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-end gap-2 mb-4">
        {exportError && (
          <div className="w-full max-w-xl text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {exportError}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={handleExportDoc}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
        >
          导出文档
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exportingPdf}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exportingPdf ? '准备PDF...' : '导出PDF'}
        </button>
        <button
          onClick={handleExportImage}
          disabled={exportingImage}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-black disabled:opacity-50"
        >
          {exportingImage ? '导出中...' : '导出图片'}
        </button>
        </div>
      </div>
      <div ref={exportRef} className="export-capture-root">
      {/* Trip header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
          {trip.start_date && <span>{trip.start_date}</span>}
          {trip.start_date && trip.end_date && <span>→ {trip.end_date}</span>}
          <span>·</span>
          <span>{trip.people_count}人</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{trip.departure} 出发</h1>
        {trip.destinations && trip.destinations.length > 0 ? (
          <p className="text-sm text-gray-500 mt-2">
            想去的地方（清单，非顺序）：<span className="text-gray-700">{trip.destinations.join('、')}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500 mt-2">目的地由 AI 根据你的偏好推荐</p>
        )}
        {recommendations?.route && (
          <p className="text-base font-semibold text-gray-900 mt-3 leading-relaxed">
            <span className="text-orange-600">智能规划顺序：</span>
            {recommendations.route}
          </p>
        )}
      </div>

      {/* Weather (Open-Meteo) */}
      {recommendations?.weather && recommendations.weather.locations.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50/80 p-5 mb-6">
          <h3 className="font-semibold text-sky-900 mb-2">🌤 目的地天气预报</h3>
          {recommendations.weather.note && (
            <p className="text-xs text-sky-800/90 mb-3 leading-relaxed">{recommendations.weather.note}</p>
          )}
          <div className="space-y-4">
            {recommendations.weather.locations.map((loc, li) => (
              <div key={`${loc.displayName}-${li}`} className="rounded-lg bg-white/70 border border-sky-100/80 p-3">
                <p className="text-sm font-medium text-gray-900 mb-2">{loc.displayName}</p>
                <div className="space-y-1.5 text-xs text-gray-700">
                  {loc.days.map((d) => (
                    <div
                      key={d.date}
                      className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-sky-50/80 pb-1.5 last:border-0 last:pb-0"
                    >
                      <span className="text-gray-600 w-[5.5rem] shrink-0 tabular-nums text-[13px] leading-normal">
                        {d.date}
                      </span>
                      <span className="font-medium text-sky-900">{d.condition}</span>
                      <span>
                        {d.tempMin}～{d.tempMax}℃
                      </span>
                      <span className="text-gray-500">降水概率 {d.precipProb}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-sky-700/70 mt-3">数据来源 Open-Meteo · 预报仅供参考，出行前请再查实时天气</p>
        </div>
      )}

      {/* Recommendations card */}
      {recommendations &&
        (recommendations.days != null || recommendations.season || recommendations.nearbySuggestions) && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-100 p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-orange-800 mb-1">🤖 AI 其他建议</h3>
          {isFixedDates && (
            <p className="text-xs text-orange-700/90">你已选定出发与返程日期，以下为该时段内的实用提示与顺路玩法，不会建议改期。</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recommendations.days != null && (
              <div>
                <p className="text-xs text-orange-500 font-medium mb-1">
                  {isFixedDates ? '行程天数（与您的日期一致）' : '推荐天数'}
                </p>
                <p className="text-sm text-gray-800">{recommendations.days} 天</p>
              </div>
            )}
            {recommendations.season && (
              <div className={recommendations.nearbySuggestions ? '' : 'sm:col-span-2'}>
                <p className="text-xs text-orange-500 font-medium mb-1">
                  {isFixedDates ? '选定时段出行提示' : '最佳季节 / 时段'}
                </p>
                <p className="text-sm text-gray-800 leading-relaxed">{recommendations.season}</p>
              </div>
            )}
          </div>
          {recommendations.nearbySuggestions ? (
            <div className="pt-1 border-t border-orange-100/80">
              <p className="text-xs text-orange-500 font-medium mb-1.5">周边 / 顺路还可玩</p>
              <p className="text-sm text-gray-800 leading-relaxed">{recommendations.nearbySuggestions}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Plan tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {localPlans.map((plan, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIdx(idx)}
            className={`flex flex-col items-start px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeIdx === idx
                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                : 'bg-white text-gray-600 border border-gray-100 hover:border-orange-200'
            }`}
          >
            <span>{plan.planName}</span>
            <span className={`text-xs mt-0.5 ${activeIdx === idx ? 'text-orange-100' : 'text-gray-400'}`}>
              ¥{(plan.estimated_total || 0).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {/* Plan description */}
      {activePlan?.planDescription && (
        <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6 text-sm text-gray-600">
          {activePlan.planDescription}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">当前版本</span>
          <span className="font-medium text-gray-800">V{versionCounts[activeIdx] || 1}</span>
        </div>
        {lastChangeSummary && (
          <p className="text-sm text-orange-700 mt-2">最近修改: {lastChangeSummary}</p>
        )}
      </div>

      {activePlan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Itinerary */}
          <div className="lg:col-span-2 space-y-4">
            {activePlan.transport_detail && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                🚀 <strong>交通方案：</strong>{activePlan.transport_detail}
              </div>
            )}

            {activePlan.itinerary.map((day: any, i: number) => (
              <DayTimeline key={i} day={day} tripWeather={recommendations?.weather ?? null} />
            ))}

            {displayTips.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-5">
                <h3 className="font-semibold text-amber-800 mb-3">💡 实用贴士</h3>
                <ul className="space-y-2">
                  {displayTips.map((tip: string, i: number) => (
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
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">继续和 AI 调整方案</h3>
              <div className="space-y-2 max-h-52 overflow-y-auto mb-3 pr-1">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-3 py-2 ${
                      m.role === 'user'
                        ? 'bg-orange-50 text-orange-800'
                        : 'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
              {chatError && <p className="text-xs text-red-600 mb-2">{chatError}</p>}
              {chatNotice && <p className="text-xs text-emerald-700 mb-2">{chatNotice}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                  placeholder="例如：第2天太赶了，改成慢一点"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chatLoading ? '修改中' : '发送'}
                </button>
              </div>
            </div>

            <CostBreakdown cost={activePlan.cost_breakdown} peopleCount={trip.people_count} />

            {activePlan.attractions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🏷️ 推荐景点</h3>
                <div className="space-y-3">
                  {activePlan.attractions.map((a: any, i: number) => (
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

            {activePlan.accommodations.length > 0 && (
              <AccommodationList items={activePlan.accommodations} webSearchUsed={hotelWebSearchUsed} />
            )}

            {activePlan.food_spots.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🍽️ 美食推荐</h3>
                <div className="space-y-3">
                  {activePlan.food_spots.map((f: any, i: number) => (
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
    </div>
  );
}
