import {
  TripFormData,
  COMPANION_OPTIONS,
  PACE_OPTIONS,
  INTEREST_OPTIONS,
  ACCOM_OPTIONS,
  FOOD_PREF_OPTIONS,
  BUDGET_LEVEL_OPTIONS,
  TRANSPORT_OPTIONS,
  WAKE_OPTIONS,
} from './types';

function findLabel(options: { value: string; label: string }[], value: string): string {
  return options.find(o => o.value === value)?.label || value;
}

function findLabels(options: { value: string; label: string }[], values: string[]): string {
  if (!values || values.length === 0) return '';
  return values.map(v => findLabel(options, v)).join('、');
}

/** 含首尾两天：与表单「固定日期」逻辑一致 */
export function calendarTripDays(startDate: string, endDate: string): number {
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 1;
  return Math.max(1, Math.ceil((e - s) / 86400000) + 1);
}

export function buildMultiPlanPrompt(
  data: TripFormData,
  opts?: { hotelWebContext?: string; weatherContext?: string }
): string {
  const p = data.preferences;
  const destinations = data.destinations.join('、');

  // Date section
  let dateSection: string;
  let fixedDayCount: number | null = null;
  if (data.dateMode === 'fixed') {
    fixedDayCount = calendarTripDays(data.startDate, data.endDate);
    dateSection = `- 出发日期：${data.startDate}，返回日期：${data.endDate}，共${fixedDayCount}天（用户已锁定，不可建议改期或换别的出行窗口）`;
  } else if (data.dateMode === 'flexible_end') {
    dateSection = `- 出发日期：${data.startDate}，返回日期不确定（请根据目的地数量和旅行节奏推荐合适的天数）`;
  } else {
    dateSection = `- 出行日期完全不确定（请推荐最佳旅游季节和合适的天数）`;
  }

  const companion = findLabel(COMPANION_OPTIONS, p.companion);
  const childInfo = p.companion === 'family' && p.childAge ? `（孩子年龄段：${p.childAge}）` : '';
  const pace = PACE_OPTIONS.find(o => o.value === p.pace);
  const paceDesc = pace ? `${pace.label} - ${pace.desc}` : p.pace;
  const interests = findLabels(INTEREST_OPTIONS, p.interests);
  const interestLine = interests ? `- 兴趣偏好：${interests}` : '- 兴趣偏好：无特定偏好，请综合推荐当地最值得体验的内容';
  const accom = findLabel(ACCOM_OPTIONS, p.accommodation);
  const foodPrefs = findLabels(FOOD_PREF_OPTIONS, p.foodPrefs);
  const foodLine = foodPrefs ? `- 餐饮偏好：${foodPrefs}` : '- 餐饮偏好：不限';
  const dietaryNote = p.dietaryNotes ? `\n- 饮食忌口/特殊需求：${p.dietaryNotes}` : '';
  const budget = BUDGET_LEVEL_OPTIONS.find(o => o.value === p.budgetLevel);
  const budgetDesc = budget ? `${budget.label}（${budget.desc}）` : p.budgetLevel;
  const transports = findLabels(TRANSPORT_OPTIONS, p.transportModes);
  const hasMotorcycle = p.transportModes?.includes('motorcycle');
  const motoBikeType = p.motoBikeType?.trim();
  const motoDailyKm = p.motoDailyKm || 220;
  const motoAllowNightRide = p.motoAllowNightRide === 'yes' ? '可接受短时夜骑' : '不接受夜骑';
  const wakeUp = findLabel(WAKE_OPTIONS, p.wakeUpTime);
  const mustVisit = p.mustVisit ? `\n- 必去的地方：${p.mustVisit}` : '';
  const mustAvoid = p.mustAvoid ? `\n- 不想去的地方：${p.mustAvoid}` : '';
  const specialNeeds = p.specialNeeds ? `\n- 特殊需求：${p.specialNeeds}` : '';

  const isFast = data.generationMode === 'fast';
  const planCountText = isFast ? '请生成 1 个高质量、可直接执行的方案，优先速度和实用性。' : '请生成 2 个有区分度的旅行方案（例如紧凑版和休闲版），让我可以对比选择。每个方案要有明确的差异化定位。';
  const longTrip = fixedDayCount != null && fixedDayCount > 10;
  const outputLimitText = isFast
    ? `控制输出长度：itinerary 每天活动不超过${longTrip ? 1 : 2}个（长途可多写 notes 概括），attractions不超过4个，accommodations不超过${longTrip ? 5 : 3}个，foodSpots不超过4个。`
    : `控制输出长度：itinerary 每天活动不超过${longTrip ? 2 : 3}个，attractions不超过6个，accommodations不超过${longTrip ? 6 : 4}个，foodSpots不超过6个。`;
  const motorcycleGuide = hasMotorcycle
    ? `\n摩托车模式额外要求（非常重要）：\n- 重点放在“骑行路线攻略”而不是单纯景点罗列\n- 骑行设定：车型/排量=${motoBikeType || '未提供'}；每日可接受里程约=${motoDailyKm}km；夜骑偏好=${motoAllowNightRide}\n- transportDetail 要写清楚每日骑行路线、里程区间、建议骑行时长\n- itinerary 的 notes 里尽量包含：路况特点、弯道/海拔变化、补给加油点、休息点、观景打卡点\n- 如果某天里程超过 ${motoDailyKm}km，请主动拆分路线或建议中途住宿\n- tips 必须包含：装备建议（头盔/护具/雨具）、天气和风况提醒、夜骑风险、安全注意事项\n- 风格可参考小红书/抖音热门摩旅攻略：强调“路线体验感”和“可执行性”`
    : '';

  let destinationLine = '';
  if (data.destinationMode === 'specific') {
    destinationLine = `- 用户想去的地方（集合）：${destinations}
  **重要：以上是「必去地点清单」，用户输入的先后顺序没有任何含义，不代表游玩顺序或交通顺序。**
  你要扮演专业路线规划助手：根据地理方位、减少折返、用户选的交通方式（${transports}）、节奏（${paceDesc}）、天数与季节合理性，自主决定**先去哪里、后去哪里、如何衔接**，并在行程中严格执行该顺序。`;
  } else if (data.destinationMode === 'theme') {
    const themeMap: Record<string, string> = {
      seaside: '海边',
      grassland: '草原',
      mountain: '爬山',
      lake: '湖景',
      ancient_town: '古镇',
      city_walk: '城市漫游',
      hot_spring: '温泉疗愈',
      food_hunt: '美食为主',
    };
    const themes = (data.destinationThemes || []).map((t) => themeMap[t] || t).join('、');
    destinationLine = `- 目的地偏好：${themes || '未指定'}；补充要求：${data.destinationHint || '无'}。请先从出发地周边和近期热门中推荐2-4个合适目的地，再规划路线。`;
  } else {
    destinationLine = `- 用户暂无目的地；补充要求：${data.destinationHint || '无'}。请根据出发地推荐近期热门、适合短途出游的目的地，再给出可执行路线。`;
  }

  const fixedDateBlock =
    fixedDayCount != null
      ? `

【固定出发/返程 — 硬性规则】
- 行程必须严格落在 ${data.startDate} 至 ${data.endDate}，共 **${fixedDayCount} 个日历日**。禁止向用户建议「改到别的月份/黄金周/淡季再去」等替换其日期的说法；所有内容都视为用户已经买好票、请按该窗口执行。
- recommendedDays 必须填 **${fixedDayCount}**（与用户日期一致，不要推荐更短/更长的「更佳天数」）。
- recommendedSeason 禁止写「最佳季节是X月、不建议当前时段」等否定用户日期的话；必须写成 **「选定时段出行提示」**：只说明在这几天内可能遇到的天气、气温与穿衣、雨季/台风/降雪、人流、道路或景区封闭、节假日加价等**实用提醒**，2～6句话即可。
- 每个方案的 itinerary 数组必须 **恰好 ${fixedDayCount} 个元素**，day 从 1 连续到 ${fixedDayCount}；多方案只能在节奏、强度、花费档次、玩法侧重上区分，**天数必须与用户完全一致**。
- itinerary 里每天的 "date" 字段请写 **对应公历日期**（从 ${data.startDate} 起逐日递增到 ${data.endDate}），可与星期合写，例如 "6月12日（周四）"。
- nearbySuggestions：**必填**。在不增加总天数、不改变返程日的前提下，用一段话推荐 **主行程沿线或当日可往返的周边玩法**（邻近小镇、山湖、村落、半日景点等），说明相对位置/大致车程；若某天已很紧凑可说明「以核心行程为主、周边仅作备选」。`
      : '';

  const jsonRecommendedDaysExample = fixedDayCount ?? 5;
  const jsonDateFieldExample = fixedDayCount != null ? '6月12日（周四）' : 'Day 1';
  const jsonSeasonExample =
    fixedDayCount != null
      ? '选定时段提示：用户出行周内气温约20–28℃、偶有阵雨，建议带薄外套与雨具；节假日古镇人流大建议提前预约。勿建议改到其他月份。'
      : '最佳旅游季节说明，如：3-5月或9-11月，气候宜人';
  const jsonNearbyExample =
    fixedDayCount != null
      ? '主行程在昆明时，若D2下午较空可考虑地铁可达的官渡古镇半日；去大理途中顺路可停留楚雄彝人古镇约2小时；若某天强度大则以核心景点为主、周边仅作备选。'
      : '可根据行程顺带推荐周边，无则写无';

  const notePlanDaysLine =
    fixedDayCount != null
      ? `1. 【固定日期】每个方案的 itinerary 必须恰好 ${fixedDayCount} 天（${data.startDate}～${data.endDate}），各方案仅在其他维度有区分`
      : '1. 每个方案的行程天数可以不同（比如一个3天紧凑版，一个5天休闲版）';

  const noteRecommendedDaysLine =
    fixedDayCount != null
      ? `6. recommendedDays 必须等于 ${fixedDayCount}（与用户锁定日期一致）`
      : '6. recommendedDays 是你推荐的最佳天数';

  const noteLongTripBlock =
    fixedDayCount != null && fixedDayCount > 7
      ? `\n13. 用户行程较长（${fixedDayCount}天）：为控制篇幅，每天可只列 1–2 个活动，但 itinerary **必须恰好 ${fixedDayCount} 天**，不得少天、不得用「第3–5天合并」等偷懒写法。`
      : '';

  const hotelWebBlock = opts?.hotelWebContext?.trim()
    ? `\n\n【联网检索 — 住宿相关公开信息摘要】\n以下内容来自网页检索，可能含游记、攻略、OTA 或评价聚合，**非实时房价与房态**。请批判性写入各方案 accommodations：名称尽量为真实可查的酒店/民宿；pros / cons 写可核对维度（位置、卫生、噪音、服务、交通、早餐等）；**禁止编造**具体星级评分或「官方认证」类不实表述。\n\n${opts.hotelWebContext.trim()}\n`
    : '';

  const hotelAccommodationRules = opts?.hotelWebContext?.trim()
    ? '住宿：每个方案至少 **3 条** accommodations（可按城市/商圈拆分）。每项 name 必须是**具体可查的店名**（含品牌+城市/商圈/分店信息之一，如「全季南昌八一广场店」「陶溪川某某民宿」），**禁止**仅用「XX市内民宿」「经济型酒店」「景区旁住宿」等无店名占位。每项须含 pros（至少2条）、cons（至少1条）、webNote（写「据上文联网检索摘要归纳，仅供参考」并简述依据）；优劣势须能从检索摘要合理推出；不要输出 URL。'
    : '住宿：每个方案至少 **3 条** accommodations。每项 name 必须是**具体可查的完整店名**（连锁品牌须写到分店/商圈层级，如「亚朵」「全季」「桔子」等+城市区域），**禁止**单独使用「民宿」「酒店」「住市区」等无名称表述。每项须含 pros（≥2）、cons（≥1）、webNote（常识推断、建议用户在 OTA 核实房价房态）；不要输出 URL。';

  const weatherBlock = opts?.weatherContext?.trim()
    ? `\n\n【目的地天气预报参考（Open-Meteo，与用户所见页面一致；预报有误差，出行前请再查）】\n${opts.weatherContext.trim()}\n- 撰写 recommendedSeason、各方案 tips 与行程 notes 时，须与上述气温区间、晴雨与降水概率**整体一致**，不要编造矛盾的天气描述。\n`
    : '';

  return `请为我制定一份旅行规划。

【智能路线规划 — 核心要求】
- 若用户给了多个具体地点：你必须输出**你优化后的**游览与移动顺序，禁止默认按用户输入列表从左到右安排行程。
- recommendedRoute 字段必须写清推荐顺序（可用箭头连接），并**简短说明为何这样排**（例如：减少回头路、枢纽城市进出、海拔适应、顺路衔接等），写在同一段文字里即可。
- transportDetail 必须体现城市/区域之间的**实际移动顺序**及建议交通方式，与 itinerary 每天的地理位置变化一致。
- itinerary 按天展开时，地点出现顺序必须与上述优化路线一致，不要出现「昨天在西边、今天又折返到东边再回西边」这类明显不合理折返（除非用户有特殊要求）。

【地理与交通 — 必须遵守】
- 你掌握中国行政区划常识：**景德镇在江西，乌镇（浙江嘉兴）与江西不相邻**，二者之间不能用「大巴约2–3小时顺路直达」这类表述；跨省长距离应写**高铁/动车经南昌、杭州、上海等枢纽**及**大致合理时长**（可写区间），不得编造过短陆路时间。
- 任意相邻两天的住宿城市若跨省变化，transportDetail 与当日活动须交代**如何转场**（铁路车次类型、大致耗时），与地图逻辑一致。
- 若用户输入的地名疑似笔误（如「坞镇」与「乌镇」），在 recommendedRoute 或 planDescription 中**澄清你采用的正确地名**，并按真实地理位置排程。

【行程字段 — 禁止残缺】
- itinerary 里每条 activities 的 **time、activity、location、duration** 必须是**非空的中文字符串**（可含数字与符号）；**禁止**输出 undefined、null、英文 undefined、空字符串或 JSON 非法占位。
- notes 可省略；若写则同样须为正常中文短句。若已有天气参考，请优先在 notes 加一句当日「穿衣/雨具」建议（如“早晚加外套、建议带折叠伞”）。
- tips 数组**至少 2 条**有用中文贴士（天气、预约、交通、安全、饮食等），不得留空数组。

基本信息：
- 出发地：${data.departure}
${destinationLine}
${dateSection}
${fixedDateBlock}
- 出行人数：${data.peopleCount}人
- 同行人：${companion}${childInfo}
- 偏好的出行方式：${transports}

偏好设置：
- 旅行节奏：${paceDesc}
${interestLine}
- 住宿偏好：${accom}
${foodLine}${dietaryNote}
- 预算水平：${budgetDesc}（人均每天）
- 每天出发时间：${wakeUp}${mustVisit}${mustAvoid}${specialNeeds}
${hotelWebBlock}${weatherBlock}
${planCountText}

请严格按以下JSON格式返回（不要任何额外文字）：

{
  "recommendedRoute": "你优化后的游览顺序+简短理由，如：成都 → 乐山 → 峨眉山 → 成都（先游乐山再上山，减少成都往返折返）",
  "recommendedDays": ${jsonRecommendedDaysExample},
  "recommendedSeason": "${jsonSeasonExample}",
  "nearbySuggestions": "${jsonNearbyExample}",
  "plans": [
    {
      "planName": "方案名称（如：5天经济慢游版）",
      "planDescription": "一句话说明这个方案的特点和适合人群",
      "transportDetail": "具体交通方案说明",
      "itinerary": [
        {
          "day": 1,
          "date": "${jsonDateFieldExample}",
          "theme": "当天主题",
          "activities": [
            {
              "time": "10:00",
              "activity": "活动名称",
              "location": "地点",
              "duration": "约2小时",
              "cost": 0,
              "notes": "备注"
            }
          ]
        }
      ],
      "attractions": [
        {
          "name": "景点名",
          "description": "一句话描述",
          "category": "类别",
          "duration": "建议游览时长",
          "cost": 0
        }
      ],
      "accommodations": [
        {
          "name": "真实可查的酒店或民宿全称",
          "type": "经济型/舒适型/民宿等",
          "pricePerNight": 200,
          "area": "商圈或地标",
          "highlights": "一句话亮点",
          "pros": ["位置/交通优势", "服务或设施优点"],
          "cons": ["可能的噪音/卫生/价格等注意点"],
          "webNote": "据联网检索摘要归纳，仅供参考（简述依据）"
        }
      ],
      "foodSpots": [
        {
          "name": "餐厅/小吃名",
          "type": "类型",
          "avgCost": 50,
          "specialty": "推荐菜品",
          "area": "区域"
        }
      ],
      "costBreakdown": {
        "transport": 0,
        "accommodation": 0,
        "food": 0,
        "attractions": 0,
        "other": 0,
        "total": 0
      },
      "tips": ["实用贴士1", "实用贴士2"]
    }
  ]
}

注意：
${notePlanDaysLine}
2. 所有费用是${data.peopleCount}人的总费用（人民币元）
3. 费用要合理，符合${budgetDesc}的预算水平
4. 方案之间要有明显区别（${fixedDayCount != null ? '节奏、交通方式、费用档次、玩法侧重等；天数必须相同' : '天数、节奏、交通方式、费用档次等'}）
5. 若给了具体目的地：每个方案必须**全部涵盖**这些地点，但**游览与交通顺序完全由你优化**，不得机械按用户输入顺序串联；若没给具体目的地，你需要先推荐目的地再排路线
${noteRecommendedDaysLine}
7. 每天的第一个活动时间根据"${wakeUp}"来安排
8. ${fixedDayCount != null ? 'itinerary 每项的 date 为真实公历日期；theme 仍写当天主题' : 'date 字段用 "Day 1", "Day 2" 这样的格式'}
9. 顶层必须包含 nearbySuggestions 字符串字段。${fixedDayCount != null ? '固定日期下须按上文详写顺路/半日周边玩法。' : '日期未固定时可填空字符串，或简要写出若采用某路线时的顺路可玩点。'}
10. ${hotelAccommodationRules}
11. ${outputLimitText}${motorcycleGuide}
12. attractions 不能过少：固定日期时至少给出 min(${fixedDayCount ?? 6}, 10) 个「可玩的景点/体验去处」；非固定日期至少 6 个，避免只写交通与入住。
13. 严格遵守上文「地理与交通」「行程字段」；若输出被截断导致字段缺失，应优先保证每日 activities 四项字符串完整、tips 至少 2 条${noteLongTripBlock}`;
}

export function buildPlanEditPrompt(args: {
  trip: {
    departure: string;
    destinations: string[];
    people_count: number;
    date_mode?: string;
    start_date?: string;
    end_date?: string;
  };
  recommendations?: {
    route?: string;
    days?: number | null;
    season?: string | null;
    nearbySuggestions?: string | null;
  };
  currentPlan: any;
  userInstruction: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const { trip, recommendations, currentPlan, userInstruction, history } = args;
  const historyText = history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  const lockedDates =
    trip.date_mode === 'fixed' && trip.start_date && trip.end_date
      ? `\n- **固定出行日期**：${trip.start_date} 至 ${trip.end_date}，共 ${calendarTripDays(trip.start_date, trip.end_date)} 天。不得建议用户改期、换窗口或减少/增加总天数；itinerary 条目数必须与上述天数一致。可在某天插入「半日周边」但不可超出该日期范围。`
      : '';

  const daysLabel = trip.date_mode === 'fixed' ? '行程天数（与用户日期一致）' : '推荐天数';
  const seasonLabel = trip.date_mode === 'fixed' ? '选定时段出行提示（勿建议改期）' : '推荐季节/时段';

  return `你是旅行规划编辑助手。你的任务是基于“当前方案”按用户新要求进行局部修改。

要求：
1. 尽量局部改动，只改和用户指令相关的内容，未提及部分保持不变
2. 保持输出结构稳定，字段完整
3. 修改后给出简要变更说明（changeSummary）
4. 如果用户要求模糊，做合理假设并在assistantMessage中说明
5. 若用户提到「换顺序」「先去哪里」「路线不合理」等：你应重新优化游览/交通顺序（不是按用户随口列举顺序），并同步调整 transportDetail 与 itinerary 地理逻辑
6. 若用户提到「周边」「顺路多玩」：在总天数与返程日不变前提下，可把半日周边安排写进 itinerary 的 notes 或替换当日较轻的活动
7. 若涉及住宿调整：每项保留 pros、cons、webNote；联网场景下 webNote 须体现「据检索摘要归纳」
8. 地理与交通须符合常识（如江西景德镇至浙江乌镇应写高铁经杭州/上海等枢纽中转及合理耗时，禁止「大巴2–3小时直达」）；itinerary 每条 activities 的 time、activity、location、duration 须为非空中文字符串，禁止 undefined/null 字面；tips 至少 2 条中文
9. 若用户要求“更直观价格”：住宿名称后可直接带价格（如「全季XX店（约¥320/晚）」）；若有天气信息，相关天的 notes 增加一句穿衣/雨具建议

行程背景：
- 出发地：${trip.departure}
- 用户想去的地方（集合，顺序以方案为准）：${trip.destinations.length ? trip.destinations.join('、') : '由当前方案中的目的地决定'}
- 人数：${trip.people_count}人${lockedDates}
- 推荐路线：${recommendations?.route || '无'}
- ${daysLabel}：${recommendations?.days ?? '无'}
- ${seasonLabel}：${recommendations?.season || '无'}
- 周边备选参考：${recommendations?.nearbySuggestions || '无'}

当前方案（JSON）：
${JSON.stringify(currentPlan, null, 2)}

近期对话：
${historyText || '无'}

用户这次的新要求：
${userInstruction}

请严格返回以下 JSON（不要任何额外文字）：
{
  "assistantMessage": "给用户的简短回复，说明你已做了什么调整",
  "changeSummary": "用一句话总结本次修改（如：将第2天改为轻松节奏并把预算降低约15%）",
  "updatedPlan": {
    "planName": "方案名",
    "planDescription": "方案描述",
    "transportDetail": "交通方案",
    "itinerary": [],
    "attractions": [],
    "accommodations": [],
    "foodSpots": [],
    "costBreakdown": {
      "transport": 0,
      "accommodation": 0,
      "food": 0,
      "attractions": 0,
      "other": 0,
      "total": 0
    },
    "tips": []
  }
}`;
}
