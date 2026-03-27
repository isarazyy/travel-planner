import type { DayActivity, DayPlan } from '@/lib/types';

const CORRECTION_TAG = '【系统已校正交通】';

type LegRule = {
  /** 用于日志/扩展 */
  id: string;
  /** A/B 两端地名，双向都识别 */
  a: RegExp;
  b: RegExp;
  /** 可疑陆路关键词（可为空，表示仅靠短时长触发） */
  transitLike?: RegExp;
  /** 若已出现则不再改写（避免误伤合理方案） */
  railOrFlight: RegExp;
  /** 若写出的小时数 ≤ 该值，则触发 */
  maxSuspiciousHours: number;
  replacement: {
    activity: string;
    location: string;
    duration: string;
    noteLine: string;
  };
  /** 追加到 transport_detail / 推荐路线后的说明（去重追加） */
  globalNote: string;
};

/** 已知「跨省却被写成短途大巴」的高频错误；可继续扩展规则 */
const LEG_RULES: LegRule[] = [
  {
    id: 'jingdezhen-wuzhen',
    a: /景德镇/,
    b: /(乌镇|桐乡|嘉兴|嘉兴市|南浔)/,
    transitLike: /(大巴|长途汽车|客运班车|班车|巴士|汽车客运站|汽车站|前往|返程|转场)/,
    railOrFlight: /(高铁|动车|G\d|D\d|航班|飞机|火车\b)/,
    maxSuspiciousHours: 5,
    replacement: {
      activity: '跨省转场：景德镇乘高铁/动车至杭州东或上海虹桥等枢纽，再转高铁/汽车至桐乡/乌镇方向（含换乘）',
      location: '景德镇北站 / 杭州东或上海虹桥 / 桐乡或嘉兴（换乘）',
      duration: '约4–8小时（含候车与换乘，以12306与车站当日为准）',
      noteLine: `${CORRECTION_TAG} 景德镇与浙江乌镇/桐乡方向跨省，不宜写「短途大巴几小时直达」。已改为高铁/动车串联+地面接驳的更稳妥表述；请按当日车次购票。`,
    },
    globalNote:
      '【交通校正】景德镇至浙江乌镇/桐乡方向为跨省长线，不宜写短途大巴直达；更稳妥通常为高铁/动车经杭州东或上海虹桥等枢纽中转，再转汽车/网约车至景区，全程多为半天量级，请以12306与车站公告为准。',
  },
  {
    id: 'nanchang-wuzhen',
    a: /(南昌|南昌市)/,
    b: /(乌镇|桐乡|嘉兴|嘉兴市|南浔)/,
    transitLike: /(大巴|长途汽车|客运班车|班车|巴士|汽车客运站|汽车站|前往|返程|转场)/,
    railOrFlight: /(高铁|动车|G\d|D\d|航班|飞机)/,
    maxSuspiciousHours: 5,
    replacement: {
      activity: '跨省转场：南昌乘高铁/动车至杭州东或上海虹桥等枢纽，再转高铁/汽车至桐乡/乌镇方向（含换乘）',
      location: '南昌西站或南昌站 / 杭州东或上海虹桥 / 桐乡或嘉兴（换乘）',
      duration: '约3–7小时（含候车与换乘，以12306与车站当日为准）',
      noteLine: `${CORRECTION_TAG} 江西南昌至浙江乌镇/桐乡方向跨省，不宜写「短途大巴几小时直达」。已改为高铁/动车串联方案；请按当日车次购票。`,
    },
    globalNote:
      '【交通校正】南昌至浙江乌镇/桐乡方向为跨省长线，不宜写短途大巴直达；更稳妥通常为高铁/动车经杭州东或上海虹桥等枢纽中转，请以12306与车站公告为准。',
  },
];

function extractFirstHours(text: string): number | null {
  const m = text.match(/(?:约|大约|大致)?\s*(\d+(?:\.\d+)?)\s*小时/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function legMatches(text: string, rule: LegRule): boolean {
  const hasBothSides = rule.a.test(text) && rule.b.test(text);
  if (!hasBothSides) return false;
  if (rule.railOrFlight.test(text)) return false;
  const h = extractFirstHours(text);
  if (h != null) return h <= rule.maxSuspiciousHours;
  if (!rule.transitLike) return false;
  return rule.transitLike.test(text);
}

function pickRuleForText(text: string): LegRule | null {
  for (const rule of LEG_RULES) {
    if (legMatches(text, rule)) return rule;
  }
  return null;
}

function appendDedup(base: string, addition: string): string {
  const b = (base || '').trim();
  const a = (addition || '').trim();
  if (!a) return b;
  if (b.includes(a)) return b;
  if (!b) return a;
  return `${b}\n\n${a}`;
}

function fixActivity(act: DayActivity, rule: LegRule): DayActivity {
  const combined = `${act.activity} ${act.location} ${act.duration} ${act.notes || ''}`;
  if (!legMatches(combined, rule)) return act;
  const nextNotes = act.notes?.includes(CORRECTION_TAG)
    ? act.notes
    : appendDedup(act.notes || '', rule.replacement.noteLine);
  return {
    ...act,
    activity: rule.replacement.activity,
    location: rule.replacement.location,
    duration: rule.replacement.duration,
    notes: nextNotes,
  };
}

/**
 * 对「跨省却被写成短途大巴」类明显错误做服务端校正，避免用户看到离谱路线。
 */
export function sanitizeTransportPlan(input: {
  transport_detail: string;
  itinerary: DayPlan[];
}): { transport_detail: string; itinerary: DayPlan[] } {
  let transport_detail = input.transport_detail || '';

  const itinerary = input.itinerary.map((day) => {
    const activities = (day.activities || []).map((act) => {
      const combined = `${act.activity} ${act.location} ${act.duration} ${act.notes || ''}`;
      const rule = pickRuleForText(combined);
      if (!rule) return act;
      return fixActivity(act, rule);
    });
    return { ...day, activities };
  });

  const globalBlocks = new Set<string>();
  for (const rule of LEG_RULES) {
    if (legMatches(transport_detail, rule)) globalBlocks.add(rule.globalNote);
  }
  for (const block of globalBlocks) {
    transport_detail = appendDedup(transport_detail, block);
  }

  return { transport_detail, itinerary };
}
