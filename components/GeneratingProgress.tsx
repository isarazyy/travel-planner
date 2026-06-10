'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 生成等待页的分阶段进度。
 * 阶段顺序与后端真实流程一致：收集真实数据 → AI 规划 → 回填实景/交通 → 完成。
 * 进度按各阶段的典型耗时推进，最多停在 ~95%，由父组件在真正完成时卸载本组件。
 */

interface Phase {
  icon: string;
  label: string;
  /** 该阶段的典型耗时（毫秒） */
  ms: number;
}

const TIPS = [
  '正在为你筛选高分景点，并配上真实实景图',
  '行程里的餐厅会避开连锁快餐，优先本地特色',
  '交通段会用真实车次/票价区间，机票直达携程去哪儿',
  '每天的天气和穿衣建议都会标在对应日期',
  '生成完可以直接和 AI 对话改方案，比如"第二天太赶了"',
];

function buildPhases(mode?: string): Phase[] {
  const fast = mode === 'fast';
  return [
    { icon: '🗺️', label: '收集目的地真实数据（高德景点 · 天气 · 住宿）', ms: fast ? 4000 : 6000 },
    { icon: '✨', label: 'AI 正在规划你的专属行程', ms: fast ? 12000 : 32000 },
    { icon: '📸', label: '补充实景图片与真实交通信息', ms: fast ? 4000 : 9000 },
    { icon: '🎁', label: '整理方案，马上就好', ms: 4000 },
  ];
}

export default function GeneratingProgress({
  mode,
  note,
  onCancel,
}: {
  mode?: string;
  note?: string;
  onCancel?: () => void;
}) {
  const phases = useRef(buildPhases(mode)).current;
  const totalMs = useRef(phases.reduce((s, p) => s + p.ms, 0)).current;
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    const tip = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 4000);
    return () => {
      clearInterval(t);
      clearInterval(tip);
    };
  }, []);

  // 当前进行到哪个阶段
  let acc = 0;
  let activeIdx = phases.length - 1;
  for (let i = 0; i < phases.length; i++) {
    if (elapsed < acc + phases[i].ms) {
      activeIdx = i;
      break;
    }
    acc += phases[i].ms;
  }

  // 进度百分比：随时间逼近但不超过 95%，避免“满了却还没好”的尴尬
  const pct = Math.min(95, Math.round((elapsed / totalMs) * 95));
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50 to-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <svg className="animate-spin h-5 w-5 text-orange-500 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <h2 className="text-lg font-bold text-gray-900">AI 正在为你定制行程</h2>
        <span className="ml-auto text-xs text-gray-400">{seconds}s</span>
      </div>

      <div className="h-2 bg-orange-100 rounded-full overflow-hidden mt-3 mb-5">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-3">
        {phases.map((p, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <li key={i} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {done ? '✓' : p.icon}
              </span>
              <span
                className={`text-sm transition ${
                  done ? 'text-gray-400 line-through decoration-gray-300' : active ? 'text-gray-900 font-medium' : 'text-gray-400'
                }`}
              >
                {p.label}
              </span>
              {active ? (
                <span className="ml-auto flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 rounded-xl bg-white/70 border border-orange-100 px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-orange-500 font-medium">小提示 · </span>
          {TIPS[tipIdx]}
        </p>
      </div>

      {note ? <p className="mt-3 text-xs text-blue-600 leading-relaxed">{note}</p> : null}

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full py-2 text-xs font-medium text-gray-400 hover:text-red-600 transition"
        >
          取消生成
        </button>
      ) : null}
    </div>
  );
}
