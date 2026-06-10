'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseOrderedStopsFromRouteText } from '@/lib/trip-route-points';
import { toPng } from 'html-to-image';
import DayTimeline from './DayTimeline';
import CostBreakdown from './CostBreakdown';
import AccommodationList from './AccommodationList';
import type { TripWeatherPayload } from '@/lib/weather';
import type { TripPreferences } from '@/lib/types';
import { normalizeTips, sanitizePlanString } from '@/lib/normalize-plan';
import { getDressAndUmbrellaAdvice } from '@/lib/weather-advice';
import { parseSSEResponse } from '@/lib/parse-sse';
import { createClient as createSupabaseClient } from '@/lib/supabase-browser';
import RegisterPrompt from './RegisterPrompt';
import { buildDianpingUrl, buildAmapNavUrl, buildCtripTicketUrl, buildMeituanTicketUrl } from '@/lib/amap-uri';

const TripRouteMap = dynamic(() => import('./TripRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 h-48 flex items-center justify-center text-sm text-gray-500">
      地图加载中…
    </div>
  ),
});

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
  estimated_total: number | string;
  tips: string[];
}

interface TripData {
  departure: string;
  destinations: string[];
  /** 云端 trips.destination 或旧数据摘要 */
  destination?: string | null;
  date_mode: string;
  start_date: string;
  end_date: string;
  people_count: number;
  /** 生成结果里会带上，供对话改方案时继续遵守 mustAvoid 等 */
  preferences?: TripPreferences;
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

/** 是否需要展示「未接12306」说明（含历史方案里可能已编造车次） */
function planMentionsRail(plan: { transport_detail?: string; itinerary?: unknown[] }): boolean {
  const td = plan.transport_detail;
  if (typeof td === 'string' && /(高铁|动车|火车|铁路|城际|12306|车次)/.test(td)) return true;
  for (const d of plan.itinerary || []) {
    const acts = (d as { activities?: unknown[] })?.activities;
    if (!Array.isArray(acts)) continue;
    for (const a of acts) {
      const ti = (a as { transportInfo?: Record<string, unknown> })?.transportInfo;
      if (ti && typeof ti === 'object' && Object.keys(ti).length > 0) return true;
    }
  }
  return false;
}

export default function PlanResultDirect({
  trip,
  plans,
  recommendations,
  hotelWebSearchUsed,
  onRegenerate,
  regenerating,
}: {
  trip: TripData;
  plans: PlanData[];
  recommendations?: Recommendations;
  hotelWebSearchUsed?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [localPlans, setLocalPlans] = useState<PlanData[]>(plans);
  const [activeIdx, setActiveIdx] = useState(0);
  const [versionCounts, setVersionCounts] = useState<number[]>(plans.map(() => 1));
  const [lastChangeSummary, setLastChangeSummary] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: '想改方案直接说就行，比如“换个酒店”“去掉第3天”～不确定的也可以先聊聊。' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatNotice, setChatNotice] = useState('');
  const [chatExpanded, setChatExpanded] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [editing, setEditing] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);

  const todayIso = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  function mutateItinerary(fn: (itin: any[]) => any[]) {
    setLocalPlans((prev) =>
      prev.map((p, i) => (i === activeIdx ? { ...p, itinerary: fn([...(p.itinerary || [])]) } : p)),
    );
  }
  function deleteActivity(dayIdx: number, actIdx: number) {
    mutateItinerary((itin) =>
      itin.map((d, di) =>
        di === dayIdx ? { ...d, activities: (d.activities || []).filter((_: any, ai: number) => ai !== actIdx) } : d,
      ),
    );
  }
  function moveActivity(dayIdx: number, actIdx: number, dir: -1 | 1) {
    mutateItinerary((itin) =>
      itin.map((d, di) => {
        if (di !== dayIdx) return d;
        const acts = [...(d.activities || [])];
        const j = actIdx + dir;
        if (j < 0 || j >= acts.length) return d;
        [acts[actIdx], acts[j]] = [acts[j], acts[actIdx]];
        return { ...d, activities: acts };
      }),
    );
  }
  function deleteDay(dayIdx: number) {
    mutateItinerary((itin) => itin.filter((_, di) => di !== dayIdx).map((d, idx) => ({ ...d, day: idx + 1 })));
  }
  function moveDay(dayIdx: number, dir: -1 | 1) {
    mutateItinerary((itin) => {
      const next = [...itin];
      const j = dayIdx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[dayIdx], next[j]] = [next[j], next[dayIdx]];
      return next.map((d, idx) => ({ ...d, day: idx + 1 }));
    });
  }

  useEffect(() => {
    const sb = createSupabaseClient();
    if (!sb) { setIsLoggedIn(false); return; }
    sb.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
  }, []);
  const activePlan = localPlans[activeIdx];
  const todayIdx = (activePlan?.itinerary || []).findIndex((d: any) => d?.dateIso && d.dateIso === todayIso);
  const activePlanRef = useRef(activePlan);
  activePlanRef.current = activePlan;
  const displayTips = activePlan ? normalizeTips(activePlan.tips) : [];
  const isFixedDates = trip.date_mode === 'fixed' && !!(trip.start_date && trip.end_date);

  const effectiveDestinations = useMemo(() => {
    const fallback = trip.destinations || [];
    const td = activePlan?.transport_detail;
    if (!td) return fallback;
    const stops = parseOrderedStopsFromRouteText(td);
    const dep = (trip.departure || '').replace(/\s+/g, '').toLowerCase();
    const filtered = stops.filter((s) => {
      const sk = s.replace(/\s+/g, '').toLowerCase();
      return sk !== dep && !sk.includes(dep) && !dep.includes(sk);
    });
    if (filtered.length === 0) return fallback;
    const norm = (x: string) => x.replace(/[市省区县]+$/g, '').replace(/\s+/g, '').toLowerCase();
    const origKeys = fallback.map(norm);
    const hasOverlap = filtered.some((f) => {
      const fk = norm(f);
      return origKeys.some((ok) => fk.includes(ok) || ok.includes(fk));
    });
    return hasOverlap ? filtered : fallback;
  }, [activePlan?.transport_detail, trip.departure, trip.destinations]);

  useEffect(() => {
    if (!chatExpanded) return;
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, chatLoading, chatExpanded]);

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

    const fmtCost = (v: any) => v == null ? '¥0' : typeof v === 'string' ? (/^\d/.test(v) ? `¥${v}` : v) : `¥${v.toLocaleString()}`;
    lines.push(`## 费用预估`);
    lines.push(`- 交通: ${fmtCost(activePlan.cost_breakdown?.transport)}`);
    lines.push(`- 住宿: ${fmtCost(activePlan.cost_breakdown?.accommodation)}`);
    lines.push(`- 餐饮: ${fmtCost(activePlan.cost_breakdown?.food)}`);
    lines.push(`- 景点: ${fmtCost(activePlan.cost_breakdown?.attractions)}`);
    lines.push(`- 其他: ${fmtCost(activePlan.cost_breakdown?.other)}`);
    lines.push(`- 总计: ${fmtCost(activePlan.cost_breakdown?.total ?? activePlan.estimated_total)}`);
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

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    setShareMsg('');
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip, plans: localPlans, recommendations, hotelWebSearchUsed }),
      });
      const json = await res.json();
      if (!res.ok || !json.id) {
        setShareMsg('分享失败，请重试');
        return;
      }
      const url = `${window.location.origin}/share/${json.id}`;
      await navigator.clipboard.writeText(url);
      setShareMsg('链接已复制');
      setTimeout(() => setShareMsg(''), 3000);
    } catch {
      setShareMsg('分享失败');
    } finally {
      setSharing(false);
    }
  }

  async function handleChatSubmit() {
    const message = chatInput.trim();
    if (!message || !activePlanRef.current) return;
    setChatError('');
    setChatNotice('');
    setChatLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setChatInput('');

    try {
      const currentPlan = activePlanRef.current;
      const payload = {
        trip,
        recommendations,
        activePlan: currentPlan,
        message,
        history: messages.slice(-16),
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
      const modified = !!(json.planModified && json.updatedPlan);
      setMessages((prev) => [...prev, { role: 'assistant', content: json.assistantMessage || '好的～' }]);
      if (modified) {
        const up = json.updatedPlan;
        setLastChangeSummary(json.changeSummary || '已更新当前方案');
        setLocalPlans((prev) => prev.map((p, i) => (i === activeIdx ? up : p)));
        setVersionCounts((prev) => prev.map((v, i) => (i === activeIdx ? v + 1 : v)));
      }
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
    <div className={activePlan ? (chatExpanded ? 'pb-[min(42vh,22rem)] sm:pb-96' : 'pb-28') : undefined}>
      <div className="flex flex-col items-end gap-2 mb-4">
        {exportError && (
          <div className="w-full max-w-xl text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {exportError}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="px-3 py-2 rounded-lg border border-orange-200 bg-orange-50 text-sm font-medium text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
          >
            {regenerating ? '生成中…' : '🔄 重新生成'}
          </button>
        )}
        {todayIdx >= 0 && (
          <button
            onClick={() => setTodayOnly((v) => !v)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
              todayOnly
                ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {todayOnly ? '📋 看全程' : '📍 今日导览'}
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
            editing
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {editing ? '✅ 完成编辑' : '✏️ 改行程'}
        </button>
        <button
          onClick={() => { if (isLoggedIn === false) { setShowRegisterPrompt(true); return; } handleExportDoc(); }}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
        >
          导出文档
        </button>
        <button
          onClick={() => { if (isLoggedIn === false) { setShowRegisterPrompt(true); return; } handleExportPdf(); }}
          disabled={exportingPdf}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exportingPdf ? '准备PDF...' : '导出PDF'}
        </button>
        <button
          onClick={() => { if (isLoggedIn === false) { setShowRegisterPrompt(true); return; } handleExportImage(); }}
          disabled={exportingImage}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-black disabled:opacity-50"
        >
          {exportingImage ? '导出中...' : '导出图片'}
        </button>
        <button
          onClick={handleShare}
          disabled={sharing}
          className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
        >
          {sharing ? '生成链接…' : shareMsg || '🔗 分享'}
        </button>
        </div>
      </div>

      {activePlan && (
        <TripRouteMap
          trip={{
            departure: trip.departure,
            destinations: effectiveDestinations,
            destination: trip.destination,
          }}
          recommendedRoute={activePlan.transport_detail || recommendations?.route}
          itinerary={activePlan.itinerary || []}
          transportModes={trip.preferences?.transportModes}
          isMountainRun={trip.preferences?.motoRideType === 'mountain_run'}
        />
      )}

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
            想去的地方：<span className="text-gray-700">{trip.destinations.join('、')}</span>
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

      {/* Recommendations card */}
      {recommendations &&
        (recommendations.days != null || recommendations.season || recommendations.nearbySuggestions) && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-100 p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-orange-800 mb-1">🤖 AI 其他建议</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recommendations.days != null && (
              <div>
                <p className="text-xs text-orange-500 font-medium mb-1">
                  行程天数
                </p>
                <p className="text-sm text-gray-800">{recommendations.days} 天</p>
              </div>
            )}
            {recommendations.season && (
              <div className={recommendations.nearbySuggestions ? '' : 'sm:col-span-2'}>
                <p className="text-xs text-orange-500 font-medium mb-1">
                  出行提示
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

      {/* Plan tabs — only show when multiple plans exist */}
      {localPlans.length > 1 && (
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
                {plan.estimated_total || ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Plan description removed — was showing AI-generated filler text */}

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
            {activePlan.transport_detail && (() => {
              const modes = trip.preferences?.transportModes || [];
              const isMoto = modes.includes('motorcycle');
              const isDrive = modes.includes('self_drive');
              const icon = isMoto ? '🏍️' : isDrive ? '🚗' : '🚀';
              const label = isMoto ? '骑行路线：' : isDrive ? '自驾路线：' : '交通方案：';
              const colors = isMoto
                ? 'bg-amber-50 text-amber-800 border border-amber-100'
                : isDrive
                  ? 'bg-orange-50 text-orange-800 border border-orange-100'
                  : 'bg-blue-50 text-blue-800';
              return (
                <div className={`rounded-xl p-4 text-sm ${colors}`}>
                  {icon}{' '}<strong>{label}</strong>{activePlan.transport_detail}
                </div>
              );
            })()}


            {editing && !todayOnly && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
                编辑模式：可删除/上下移动每条活动或整天。改完点右上角「完成编辑」。
              </div>
            )}
            {todayOnly && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
                📍 今日导览：只显示今天（{todayIso}）的安排。点右上角「看全程」回到完整行程。
              </div>
            )}

            {(activePlan.itinerary || []).map((day: any, i: number) => {
              if (todayOnly && i !== todayIdx) return null;
              return (
                <DayTimeline
                  key={i}
                  day={day}
                  tripWeather={recommendations?.weather ?? null}
                  transportModes={trip.preferences?.transportModes}
                  editing={editing && !todayOnly}
                  isFirstDay={i === 0}
                  isLastDay={i === (activePlan.itinerary || []).length - 1}
                  onDeleteActivity={(actIdx) => deleteActivity(i, actIdx)}
                  onMoveActivity={(actIdx, dir) => moveActivity(i, actIdx, dir)}
                  onDeleteDay={() => deleteDay(i)}
                  onMoveDay={(dir) => moveDay(i, dir)}
                />
              );
            })}

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
            <CostBreakdown cost={activePlan.cost_breakdown} peopleCount={trip.people_count} />

            {(activePlan.attractions?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🏷️ 推荐景点</h3>
                <div className="space-y-3">
                  {(activePlan.attractions || []).map((a: any, i: number) => (
                    <div key={i} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <div className="flex gap-3">
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt={a.name}
                            loading="lazy"
                            className="w-20 h-20 flex-shrink-0 object-cover rounded-lg border border-gray-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900">{a.name}</span>
                            {a.cost > 0 && <span className="text-xs text-orange-500 flex-shrink-0">¥{a.cost}</span>}
                          </div>
                          {a.rating ? (
                            <span className="inline-block text-xs text-amber-600 font-medium mt-0.5">⭐ {Number(a.rating).toFixed(1)}分</span>
                          ) : null}
                          {a.description ? (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>
                          ) : null}
                          {a.highlight ? (
                            <p className="text-xs text-orange-600 mt-1 leading-snug">✨ {a.highlight}</p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                            {a.suitableFor ? (
                              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">👥 {a.suitableFor}</span>
                            ) : null}
                            {a.bestTime ? (
                              <span className="text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">⏰ {a.bestTime}</span>
                            ) : null}
                          </div>
                          {a.openTime ? (
                            <p className="text-xs text-gray-400 mt-0.5">🕐 {a.openTime}</p>
                          ) : null}
                          <p className="text-xs text-gray-400 mt-1">
                            {a.category}{a.duration ? ` · ${a.duration}` : ''}
                            {' · '}
                            <a href={buildAmapNavUrl(a.name)} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">导航</a>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <a
                              href={buildCtripTicketUrl(a.name, trip.destinations?.[0])}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition"
                            >
                              🎫 携程门票
                            </a>
                            <a
                              href={buildMeituanTicketUrl(a.name, trip.destinations?.[0])}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] text-yellow-700 bg-yellow-50 hover:bg-yellow-100 px-2 py-0.5 rounded-md transition"
                            >
                              美团门票
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(activePlan.accommodations?.length ?? 0) > 0 && (
              <AccommodationList items={activePlan.accommodations} webSearchUsed={hotelWebSearchUsed} city={trip.destinations?.[0] || trip.departure} />
            )}

            {(activePlan.food_spots?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">🍽️ 美食推荐</h3>
                <div className="space-y-3">
                  {(activePlan.food_spots || []).map((f: any, i: number) => (
                    <div key={i} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{f.name}</span>
                        <span className="text-xs text-orange-500">{f.avgCost ? `人均¥${f.avgCost}` : ''}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{f.type}{f.area ? ` · ${f.area}` : ''}</p>
                      {f.specialty && <p className="text-xs text-gray-500 mt-0.5">推荐：{f.specialty}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        <a href={buildDianpingUrl(f.name, f.area)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">大众点评</a>
                        {' · '}
                        <a href={buildAmapNavUrl(f.name, f.area)} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">导航</a>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </div>

      {activePlan && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none"
          aria-label="与 AI 调整方案"
        >
          <div className="pointer-events-auto max-w-5xl mx-auto px-3 sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="rounded-t-2xl border border-gray-200/90 border-b-0 bg-white/95 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.08)] overflow-hidden">
              <button
                type="button"
                onClick={() => setChatExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-orange-50/80 to-white text-left hover:bg-orange-50/50 transition"
              >
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-base" aria-hidden>
                    💬
                  </span>
                  与 AI 调整方案
                </span>
                <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                  {chatExpanded ? '收起对话 ↓' : '展开对话 ↑'}
                </span>
              </button>

              {chatExpanded && (
                <div
                  ref={chatScrollRef}
                  className="max-h-[min(36vh,280px)] overflow-y-auto px-3 py-3 space-y-2.5 bg-[#f5f5f7]"
                >
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[min(88%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          m.role === 'user'
                            ? 'bg-orange-500 text-white rounded-br-md shadow-sm'
                            : 'bg-white text-gray-800 border border-gray-200/90 rounded-bl-md shadow-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs text-gray-500 bg-white border border-gray-200/90 shadow-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block size-1.5 rounded-full bg-orange-400 animate-pulse" />
                          AI 正在思考…
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(chatError || chatNotice) && (
                <div className="px-3 pt-2 space-y-1 bg-[#f5f5f7]">
                  {chatError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                      {chatError}
                    </p>
                  )}
                  {chatNotice && (
                    <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                      {chatNotice}
                    </p>
                  )}
                </div>
              )}

              {isLoggedIn === false ? (
                <div
                  className="flex items-center justify-center gap-2 p-3 bg-white border-t border-gray-100 cursor-pointer hover:bg-orange-50/50 transition"
                  onClick={() => setShowRegisterPrompt(true)}
                >
                  <span className="text-sm text-gray-400">注册登录后即可使用 AI 对话修改方案</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500 text-white font-medium">去注册</span>
                </div>
              ) : (
              <div className="flex items-end gap-2 p-3 bg-white border-t border-gray-100">
                <input
                  type="text"
                  value={chatInput}
                  maxLength={500}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                  placeholder="说说想怎么改方案…"
                  className="flex-1 min-h-[44px] rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-500/15"
                />
                <button
                  type="button"
                  onClick={handleChatSubmit}
                  disabled={chatLoading || !chatInput.trim()}
                  className="shrink-0 min-h-[44px] min-w-[4.5rem] px-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-45 disabled:cursor-not-allowed transition"
                >
                  {chatLoading ? '…' : '发送'}
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      )}
      <RegisterPrompt open={showRegisterPrompt} onClose={() => setShowRegisterPrompt(false)} />
    </div>
  );
}
