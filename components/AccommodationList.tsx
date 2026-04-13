'use client';

import { buildMeituanHotelUrl, buildCtripHotelUrl, buildAmapNavUrl } from '@/lib/amap-uri';

export default function AccommodationList({
  items,
  webSearchUsed,
  city,
}: {
  items: any[];
  webSearchUsed?: boolean;
  city?: string;
}) {
  if (!items?.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-2">🏨 住宿推荐</h3>
      {webSearchUsed ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
          以下为 AI 综合推荐，房价仅供参考，预订前请在携程/美团等平台核实。
        </p>
      ) : (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
          以下为 AI 根据常识整理的参考，仅供参考。
        </p>
      )}
      <div className="space-y-5">
        {items.map((a: any, i: number) => {
          const pros = Array.isArray(a.pros) ? a.pros : [];
          const cons = Array.isArray(a.cons) ? a.cons : [];
          const areaOrCity = a.area || city || '';

          return (
            <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {a.name}
                  {a.pricePerNight > 0 ? `（¥${a.pricePerNight}/晚）` : ''}
                </span>
                <span className="text-xs font-medium text-orange-600 shrink-0">
                  {a.pricePerNight > 0 ? `参考 ¥${a.pricePerNight}/晚` : '参考价未标注'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {a.type}
                {a.area ? ` · ${a.area}` : ''}
              </p>

              <p className="text-xs text-gray-400 mt-2">
                查看：
                <a href={buildMeituanHotelUrl(a.name, areaOrCity)} target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:underline">美团</a>
                {' / '}
                <a href={buildCtripHotelUrl(a.name, areaOrCity)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">携程</a>
                {' / '}
                <a href={buildAmapNavUrl(a.name, areaOrCity)} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">导航</a>
              </p>

              {a.highlights ? <p className="text-xs text-gray-600 mt-2 leading-relaxed">{a.highlights}</p> : null}
              {a.webNote ? (
                <p className="text-xs text-gray-400 mt-2 italic leading-relaxed">说明：{a.webNote}</p>
              ) : null}

              {(pros.length > 0 || cons.length > 0) && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pros.length > 0 && (
                    <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                      <p className="text-xs font-medium text-green-800 mb-1.5">优势</p>
                      <ul className="text-xs text-green-900 space-y-1 list-disc pl-4">
                        {pros.map((t: string, j: number) => (
                          <li key={j}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {cons.length > 0 && (
                    <div className="rounded-lg bg-orange-50/80 border border-orange-100 px-3 py-2">
                      <p className="text-xs font-medium text-orange-900 mb-1.5">劣势 / 注意</p>
                      <ul className="text-xs text-orange-950/90 space-y-1 list-disc pl-4">
                        {cons.map((t: string, j: number) => (
                          <li key={j}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
