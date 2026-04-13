import {
  TripFormData,
  COMPANION_OPTIONS,
  PACE_OPTIONS,
  ACCOM_OPTIONS,
  ACCOM_STYLE_OPTIONS,
  BUDGET_LEVEL_OPTIONS,
  TRANSPORT_OPTIONS,
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

/** 按用户「旅行节奏」约束每日 activities 条数下限（产品核心：拒绝「一天只有一两个点」的敷衍排程） */
function resolvePaceDailyDensity(
  paceKey: string,
  longTrip: boolean,
): { min: number; max: number; coverage: string } {
  const lt = longTrip;
  switch (paceKey) {
    case 'intensive':
      return {
        min: lt ? 3 : 4,
        max: 6,
        coverage:
          '须有明显「上午 + 下午 + 晚间」三段安排（晚间可为夜市、夜景、演出、清吧小酌等）；转场日可略减 1 条但仍须写清交通与到达后安排。',
      };
    case 'balanced':
      return {
        min: 3,
        max: 5,
        coverage:
          '每天至少覆盖上午与下午；多数日期晚间应有 1 项轻量安排（散步、夜市、本地演出等），避免下午后空白。',
      };
    case 'relaxed':
      return {
        min: 3,
        max: 4,
        coverage:
          '节奏舒缓但**禁止**「全天仅 1～2 条」：仍须每天 ≥3 条，可缩短单条时长、增加咖啡/公园留白。',
      };
    case 'half':
      return {
        min: 2,
        max: 4,
        coverage:
          '「半天玩半天休」：游玩时段须 ≥2 条具体安排，另一半天写「午休/酒店泳池/自由逛街」等，不得用一条「自由活动」糊弄整天。',
      };
    default:
      return {
        min: 3,
        max: 5,
        coverage: '每天不少于 3 条可执行活动，覆盖上下午。',
      };
  }
}

export function buildMultiPlanPrompt(
  data: TripFormData,
  opts?: { hotelWebContext?: string; weatherContext?: string; transportFoodContext?: string; realDataContext?: string }
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
    const hint = data.dateHint?.trim();
    dateSection = hint
      ? `- 出行日期不确定，用户的时间偏好：${hint}（请结合偏好推荐最佳旅游季节和合适的天数）`
      : `- 出行日期完全不确定（请推荐最佳旅游季节和合适的天数）`;
  }

  const companion = findLabel(COMPANION_OPTIONS, p.companion);
  const childInfo = p.companion === 'family' && p.childAge ? `（孩子年龄段：${p.childAge}）` : '';
  const pace = PACE_OPTIONS.find(o => o.value === p.pace);
  const paceDesc = pace ? `${pace.label} - ${pace.desc}` : p.pace;
  const interestLine = '- 兴趣偏好：无特定偏好，请综合推荐当地最值得体验的内容';
  const accom = findLabel(ACCOM_OPTIONS, p.accommodation);
  const accomStyles = p.accommodationStyles?.filter(s => s && s !== 'no_preference') ?? [];
  const accomStyleDesc = accomStyles.length > 0
    ? accomStyles.map(s => ACCOM_STYLE_OPTIONS.find(o => o.value === s)).filter(Boolean).map(o => `${o!.label}（${o!.desc}）`).join('、')
    : '';
  const foodLine = '- 餐饮偏好：不限，综合推荐当地特色美食';
  const dietaryNote = p.specialNeeds && /(素食|清真|过敏|忌口|不吃|halal|vegan|vegetarian)/i.test(p.specialNeeds)
    ? `\n- 饮食相关注意：见下方特殊需求` : '';
  const budget = BUDGET_LEVEL_OPTIONS.find(o => o.value === p.budgetLevel);
  const budgetDesc = budget ? `${budget.label}（${budget.desc}）` : p.budgetLevel;
  const transports = findLabels(TRANSPORT_OPTIONS, p.transportModes);
  const hasMotorcycle = p.transportModes?.includes('motorcycle');
  const isMountainRun = p.motoRideType === 'mountain_run';
  const mountainRunVehicle = p.mountainRunVehicle || (hasMotorcycle ? 'motorcycle' : 'car');
  const motoBikeType = p.motoBikeType?.trim();
  const motoDailyKm = p.motoDailyKm || 220;
  const motoAllowNightRide = p.motoAllowNightRide === 'yes' ? '可接受短时夜骑' : '不接受夜骑';
  const mustVisit = p.mustVisit ? `\n- 必去的地方：${p.mustVisit}` : '';
  const mustAvoid = p.mustAvoid ? `\n- 不想去的地方/不想参加的活动：${p.mustAvoid}` : '';
  const specialNeeds = p.specialNeeds ? `\n- 特殊需求：${p.specialNeeds}` : '';

  const mustAvoidHardRules = p.mustAvoid?.trim()
    ? `

【用户否决项 — 必须遵守（不可打折扣）】
- 用户已声明：${p.mustAvoid.trim()}
- 若表述含「不去任何博物馆」「不要博物馆」「拒绝博物馆」等：**禁止**在 itinerary、attractions、transportDetail、tips、foodSpots 中安排或推荐「博物馆、博物院、纪念馆、美术馆、艺术馆、陈列馆」及「常设/临时展览、室内看展」等同类活动；不得以「看展」「特展」「文化展览」「艺术空间」等表述绕过。
- 对用户否决项中的其他类型（如商业化古镇、爬山、某类食物等），同样禁止用同义替换或换皮推荐。
`
    : '';

  const isFast = data.generationMode === 'fast';
  const paceKey = p.pace || 'balanced';
  const density = resolvePaceDailyDensity(paceKey, fixedDayCount != null && fixedDayCount > 10);

  const planCountText = '请生成 1 个高质量、可直接执行的方案。用户可通过 AI 对话进一步调整细节，无需提供多套方案。';

  const longTrip = fixedDayCount != null && fixedDayCount > 10;

  const productCoreBlock = `

【产品核心 — 每日推荐必须「饱满」】
- 本产品与「只列 1～2 个景点」的极简行程工具不同：你必须输出**像真实旅行攻略一样可分时段执行的一天**，这是差异化所在。
- 用户选择的节奏为「${paceDesc}」。在此前提下，itinerary 中**每个自然日**的 activities 数量须满足：**至少 ${density.min} 条、建议 ${density.max} 条以内**（为控制篇幅，单条描述可简短，但**条数不能缩水**）。
- 时段覆盖要求：${density.coverage}
- **抵达/首末日**：若涉及机场/高铁到达，须额外写出「入住后傍晚」或「返程前上午」至少 1 项可执行安排，不得让整天停在「抵达机场」一条上结束。
- **纯转场日**：可略少 1 条，但仍须写清交通段 + 到达后 1～2 项轻量活动（安顿、简餐、周边散步）。
- attractions / foodSpots 作为「亮点清单」须与 itinerary 相互呼应，不得出现 itinerary 很空但 attractions 堆砌的脱节。

【用餐安排 — 硬性要求，每天必须有】
- **每天的 itinerary 必须包含午餐和晚餐各一条活动**，这是旅行中不可缺少的环节。
- 午餐时间：11:30-13:30 之间安排，**绝对不能把午餐排到 15:00 以后**。
- 晚餐时间：17:30-19:30 之间安排。
- 用餐活动要推荐当地特色餐厅/小吃，带 foodRecommendation（店名、评分、招牌菜、推荐理由）。
- 如果当天有长途驾车/乘车，在途中合适的城镇安排用餐，不能跳过。
- 即使是轻松休闲日，也必须写出午餐和晚餐的安排，哪怕只是"酒店附近觅食"也要有一条。`;

  const outputLimitText = `篇幅与上限（在满足上文「每日条数下限」前提下）：单条 activity 的 notes 尽量不超过 40 字；attractions 总数建议不超过 ${isFast ? 14 : 22} 条；accommodations ${isFast ? '3～5' : '4～7'} 条；foodSpots ${isFast ? '4～8' : '6～12'} 条。`;

  const hasSelfDrive = p.transportModes?.includes('self_drive');
  const selfDriveGuide = hasSelfDrive
    ? `\n自驾游模式额外要求（非常重要 — 自驾的核心体验是"在路上"）：

【路线规划】
- transportDetail 必须写清楚：全程预估总里程和总驾车时长；每日驾车路段（A→B，约X公里，约X小时）；推荐走的高速/国道名称（如G2京沪高速、318国道等）；高速费预估
- itinerary 里每天如果有驾车路段，activities 须含一条"当日驾车转场"条目（如"自驾前往XX"），duration 写驾车耗时
- **自驾转场活动必须带 transportInfo**，且 **distance 字段不可省略**：
  · fromStation: 出发城市
  · toStation: 目的城市
  · distance: "约X公里"（必填！用户需要知道开多远）
  · duration: "约X小时"
  · priceNote: "油费及过路费预估X元"
  · 错误示例（缺少distance）：{"fromStation":"北京","toStation":"青岛","duration":"约5小时","priceNote":"油费600元"} ← 不合格
  · 正确示例：{"fromStation":"北京","toStation":"青岛","distance":"约630公里","duration":"约5小时","priceNote":"油费及过路费预估600元"} ← 合格

【沿途体验 — 自驾游最重要的部分】
- 自驾的精髓在于沿途风光，而不仅仅是赶到目的地。每段超过2小时的驾车路段，**必须**在 notes 里写明：
  · 沿途有哪些值得短停观赏的风景（如：某段高速穿越山谷视野开阔、某处有观景台可以停车拍照、经过某湖/某桥/某隧道群很壮观等）
  · 推荐1-2个可以下高速短暂游玩的地方（如途经某古镇可下高速逛30分钟、某服务区有特色小吃等）
  · 路况特点提醒（山路弯道多注意减速、某段限速较低等）

【自驾日用餐 — 最高优先级硬约束，违反即方案不合格】
- **自驾日的 activities 必须按这个顺序安排：出发驾车 → 途中午餐(12:00左右) → 继续驾车/抵达 → 下午活动 → 晚餐(18:00左右)**
- **午餐时间必须在 11:30-13:30 之间**，绝对不能排到14:00以后。标记为"午餐"却排在15:00以后 = 方案不合格。
- **午餐地点必须在驾车沿途城镇**，不能到目的地才吃。正确做法：把长途驾车拆成两段，中间插入午餐。
- 示例：北京9:00出发自驾去青岛（约5小时630公里），正确安排：
  · 09:00 自驾出发（北京→淄博方向，约3小时）
  · 12:00 **午餐：淄博**（推荐淄博烧烤/博山菜，带 foodRecommendation）
  · 13:00 继续自驾（淄博→青岛，约2小时）
  · 15:00 抵达青岛，入住酒店
  · 18:00 晚餐
- 午餐活动必须带 foodRecommendation（店名、评分、招牌菜、推荐理由）
- 每驾车2小时建议在 notes 里提醒休息，长途日（>4h）**必须安排至少1次服务区/观景台停车休息**，写进 activities

【驾车时长控制】
- 单日驾车不超过4-5小时（长途不超过6小时）
- 两地超500km须安排中间住宿
- 自驾游不是赶路，要给沿途停靠、拍照、休息留足时间

【费用与安全】
- costBreakdown 的 transport 费用包含油费和过路费预估
- tips 须含：自驾安全提醒、加油建议（偏远地区提前加满油）、停车注意、疲劳驾驶警告`
    : '';

  // isMountainRun always exits via the early return above, so this is only for motorcycle touring
  const motorcycleGuide = !hasMotorcycle ? '' : `
摩托车摩旅模式额外要求（非常重要）：
- 重点放在"骑行路线攻略"而不是单纯景点罗列
- 骑行设定：车型/排量=${motoBikeType || '未提供'}；每日可接受里程约=${motoDailyKm}km；夜骑偏好=${motoAllowNightRide}
- **禁摩路段规避（极其重要）**：
  · 摩托车**严禁上高速公路**（中国法规规定排量250cc以下不得上高速，即使250cc以上也有诸多限制）
  · 路线规划必须走**国道、省道、县道**，不能规划走高速
  · 部分城市市区有禁摩令（如广州、深圳、东莞核心区、北京四环内等），路线须绕开禁摩区域或标注"此段需绕行/推车通过"
  · transportDetail 里如涉及禁摩城市，必须注明禁摩范围和建议绕行路线
- **加油规划（重要）**：
  · 根据车型排量估算油耗和续航里程（如150cc约2.5L/100km，250cc约3.5L/100km，500cc约5L/100km）
  · 每天的 itinerary notes 里标注沿途加油站位置，特别是偏远地区（如西藏、新疆、青海）提醒提前加满
  · 如果某段路程超过150km无加油站，必须在前一个加油点提醒加满
- transportDetail 要写清楚每日骑行路线名称（如G318国道、G214滇藏线等）、里程区间、建议骑行时长
- itinerary 的 notes 里包含：路况特点、弯道/海拔变化、补给加油点、休息点、观景打卡点
- 如果某天里程超过 ${motoDailyKm}km，请主动拆分路线或建议中途住宿
- **住宿推荐须考虑摩托车停放**：优先推荐有停车场/院子的客栈民宿，避免推荐市区高层酒店
- tips 必须包含：装备建议（全盔/护具/骑行服/雨衣/手套/骑行靴）、天气和风况提醒、高原反应提醒（如涉及高海拔）、夜骑风险、链条保养、每日骑行前车辆检查要点
- 风格参考小红书/抖音热门摩旅攻略：强调"路线体验感"和"可执行性"`;

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
    const openDetails = data.openModeDetails || [];
    const openDetailMap: Record<string, string> = {
      nearby: '周边短途游',
      fly_short: '飞一趟/坐高铁去一个目的地，3-5天小长假',
      long_route: '跨省长线多城联游',
      nature_first: '自然风景为主',
      city_first: '城市体验为主',
    };
    const tags = openDetails.map((k) => openDetailMap[k] || '').filter(Boolean);
    const tagLine = tags.length ? tags.join('；') : '未特别限定';

    const modeRules: string[] = [];

    if (openDetails.includes('nearby')) {
      modeRules.push(`【周边游 — 用户选了"就近周边转转"】
- 用户想在出发地附近玩，**严禁推荐单程超过3小时高铁/自驾的目的地**。
- 推荐范围：出发地**同省或相邻省份**，车程/高铁1-3小时内。
- 举例：北京 → 古北水镇、延庆、保定、张家口、承德、天津、秦皇岛；上海 → 苏州、杭州、乌镇、千岛湖；成都 → 都江堰、峨眉山、乐山、雅安；广州 → 佛山、清远、珠海、开平。
- **绝对不能**推荐跨大半个中国的路线（如北京→南昌、上海→云南）。
- 推荐2-4个**相邻的**周边目的地串联，彼此车程不超过2小时。天数多时深度玩周边，不要跑远。`);
    }

    if (openDetails.includes('fly_short')) {
      modeRules.push(`【飞一趟 — 用户选了"飞一趟3-5天"】
- 用户愿意坐飞机或长途高铁去**一个**目的地城市/区域，做3-5天的深度游。
- 推荐**1个核心目的地**（可含周边小众景点），不要安排3个以上城市的赶场式行程。
- 适合的推荐：有独特体验、美食或风景的热门旅行城市（如长沙、重庆、西安、厦门、大理、桂林等）。
- 行程节奏要适中：到达日和离开日各安排半天活动，中间几天深入体验。
- 不要推荐出发地周边1-2小时就能到的地方（那是"周边转转"的范围）。`);
    }

    if (openDetails.includes('long_route')) {
      modeRules.push(`【长线游 — 用户选了"跨省长线玩透一点"】
- 用户想要一次走多个城市/省份的深度路线，不怕路途远。
- 推荐一条**有地理逻辑的串联路线**（如丝绸之路、云贵环线、江南水乡联游等），3-6个目的地。
- 路线必须地理上连贯，不能东跳西跳（如上海→西安→厦门→成都这种随机排列）。
- 每个城市至少安排1-2天深度体验，不要走马观花每个城市只待半天。
- transportDetail 要写清楚城市间的交通衔接方式和大致耗时。`);
    }

    if (openDetails.includes('nature_first')) {
      modeRules.push(`【自然风景优先 — 用户选了"自然风景为主"】
- 行程**以山水、湖泊、草原、海岸、森林、峡谷等自然风光为核心**。
- 优先安排户外徒步、观景、日出日落、漂流、骑行等自然体验活动。
- **减少**纯城市商圈逛街、博物馆、商业步行街等室内/城市活动的占比（交通中转除外）。
- 住宿可推荐景区民宿、山间酒店、湖景房等贴近自然的选择。
- 举例：张家界、九寨沟、稻城亚丁、青海湖、漓江、武功山、呼伦贝尔、千岛湖等。`);
    }

    if (openDetails.includes('city_first')) {
      modeRules.push(`【城市体验优先 — 用户选了"城市体验为主"】
- 行程**以城市生活体验为核心**：美食探店、夜市/夜景、文艺街区、展览演出、咖啡厅酒吧、本地市井烟火。
- 优先安排高评分餐厅、网红打卡地、有特色的街区漫步、夜间活动。
- **减少**纯自然风光和需要长时间徒步的户外活动占比。
- 住宿推荐市中心交通方便、靠近美食街区的酒店。
- 举例：长沙（美食夜市）、成都（火锅+太古里）、重庆（魔幻夜景）、西安（回民街+大唐不夜城）、广州（早茶+西关）等。`);
    }

    const modeRuleBlock = modeRules.length > 0 ? '\n\n' + modeRules.join('\n\n') : '';
    destinationLine = `- 用户暂无具体目的地，由你根据出发地推荐；大致方向：${tagLine}。补充要求：${data.destinationHint || '无'}。请综合这些偏好推荐目的地并给出可执行路线。${modeRuleBlock}`;
  }

  // Trip duration constraint for destination recommendations
  const tripDays = fixedDayCount ?? null;
  let durationConstraint = '';
  if (tripDays !== null) {
    if (tripDays <= 1) {
      durationConstraint = `\n\n【短途行程硬性约束 — 仅1天】\n- 总行程只有1天（当天往返），**严禁推荐需要跨省或单程超过2小时交通的目的地**。\n- 必须在出发地城市内部或周边1-2小时车程内安排所有活动。\n- 例如：北京出发1天 → 只能安排北京市区/周边（如故宫、长城、颐和园、古北水镇等），**绝对不能去南昌、上海等外省城市**。\n- 即使用户选了"我完全没想法"，也必须只推荐出发地本市或近郊目的地。`;
    } else if (tripDays <= 2) {
      durationConstraint = `\n\n【短途行程约束 — 仅2天】\n- 总行程只有2天（含1晚），目的地必须在出发地2-3小时高铁/自驾范围内。\n- 不要推荐需要飞行或超过3小时火车才能到达的远距离城市。\n- 优先推荐出发地周边省份的热门短途目的地。`;
    } else if (tripDays <= 3) {
      durationConstraint = `\n\n【行程时间约束 — 3天】\n- 总行程3天，目的地应在出发地3-4小时交通圈内，避免推荐需要大半天赶路的远距离城市。\n- 可以跨省但不宜跨多个省份。`;
    }
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
      ? ` 用户行程较长（${fixedDayCount}天）：可压缩每条文字，但**每天 activities 条数仍须满足上文与节奏「${paceDesc}」对应的下限**；itinerary **必须恰好 ${fixedDayCount} 天**；禁止用「自由活动一整天」一条代替真实安排。`
      : '';

  const hotelWebBlock = opts?.hotelWebContext?.trim()
    ? `\n\n【联网检索 — 住宿相关公开信息摘要】\n以下内容来自网页检索，可能含游记、攻略、OTA 或评价聚合，**非实时房价与房态**。请批判性写入各方案 accommodations：名称尽量为真实可查的酒店/民宿；pros / cons 写可核对维度（位置、卫生、噪音、服务、交通、早餐等）；**禁止编造**具体星级评分或「官方认证」类不实表述。\n\n${opts.hotelWebContext.trim()}\n`
    : '';

  const accomStyleGuide = accomStyleDesc
    ? `\n用户已选择住宿风格偏好「${accomStyleDesc}」，请**重点推荐**符合该风格的住宿（如精品民宿、设计酒店、景观房、特色体验住宿等），而不是默认推荐如家、汉庭等连锁快捷酒店。若某目的地确实缺少对应风格选择，可保留1-2家品质连锁作为备选，但须在 webNote 中说明。`
    : '';
  const hotelAccommodationRules = opts?.hotelWebContext?.trim()
    ? `住宿：每个方案至少 **3 条** accommodations（可按城市/商圈拆分）。每项 name 必须是**具体可查的店名**（含品牌+城市/商圈/分店信息之一，如「全季南昌八一广场店」「陶溪川某某民宿」），**禁止**仅用「XX市内民宿」「经济型酒店」「景区旁住宿」等无店名占位。每项须含 pros（至少2条）、cons（至少1条）、webNote（写「据上文联网检索摘要归纳，仅供参考」并简述依据）；优劣势须能从检索摘要合理推出；不要输出 URL。${accomStyleGuide}`
    : `住宿：每个方案至少 **3 条** accommodations。每项 name 必须是**具体可查的完整店名**（连锁品牌须写到分店/商圈层级，如「亚朵」「全季」「桔子」等+城市区域），**禁止**单独使用「民宿」「酒店」「住市区」等无名称表述。每项须含 pros（≥2）、cons（≥1）、webNote（常识推断、建议用户在 OTA 核实房价房态）；不要输出 URL。${accomStyleGuide}`;

  const weatherBlock = opts?.weatherContext?.trim()
    ? `\n\n【目的地天气预报参考（Open-Meteo，与用户所见页面一致；预报有误差，出行前请再查）】\n${opts.weatherContext.trim()}\n- 撰写 recommendedSeason、各方案 tips 与行程 notes 时，须与上述气温区间、晴雨与降水概率**整体一致**，不要编造矛盾的天气描述。\n`
    : '';
  const transportFoodBlock = opts?.transportFoodContext?.trim()
    ? `\n\n【联网检索 — 交通与餐饮补充信息】\n以下内容来自预检索，可结合你自己的联网搜索能力获取更详细信息：\n\n${opts.transportFoodContext.trim()}\n`
    : '';

  const realDataBlock = opts?.realDataContext?.trim()
    ? `\n\n【高德地图真实数据 — 必须优先使用】
以下餐厅、酒店、景点、交通信息来自高德地图 API 实时查询，数据真实可靠。
**你必须优先从以下数据中选取**来填写 itinerary、foodSpots、accommodations、attractions 等字段。
- 餐厅：直接使用提供的店名、评分、人均价格
- 酒店：直接使用提供的酒店名、价格
- 景点：直接使用提供的景点名、类型
- 交通：直接使用提供的路线方案（站名、耗时、费用）
- **禁止编造**不在以下列表中的店名、车次、站名
- 如果下方数据不够覆盖所有天数的安排，可以适当补充，但须注明"此处为AI推荐，建议出行前核实"

${opts.realDataContext.trim()}
`
    : '';

  // ===== Mountain Run: completely different prompt =====
  if (isMountainRun) {
    const mrDays = fixedDayCount ?? 1;
    const mrIsMultiDay = mrDays > 1;
    const mrDateLine = data.startDate
      ? `- 日期：${data.startDate}${data.endDate ? ` 至 ${data.endDate}` : ''}，共${mrDays}天`
      : `- 天数：${mrDays}天`;
    const mrDestLine = data.destinations?.length
      ? `- 用户指定方向：${data.destinations.join('、')}（在这个方向找山路）`
      : '- 方向：由你推荐出发城市附近最经典的跑山路线';
    const mrAccomNote = mrIsMultiDay
      ? `多天跑山：每天跑不同的山路，晚上回镇上/县城住。住宿推荐山脚小镇的客栈或酒店（干净、方便停车即可），不需要豪华。accommodations 写${mrDays - 1}晚住宿。`
      : '单日跑山：当天往返不需住宿，accommodations 为空数组。';
    const mrItineraryNote = mrIsMultiDay
      ? `每天安排一条不同的山路，天天都是"出发→跑山路→打卡→吃饭→回住处"的节奏。${mrDays}天可以跑${mrDays}条不同的山路，或同一座山不同方向。itinerary 恰好 ${mrDays} 天。`
      : 'itinerary 只有1天。';

    const isMoto = mountainRunVehicle === 'motorcycle';
    const isCar = mountainRunVehicle === 'car';
    const isBike = mountainRunVehicle === 'bicycle';

    const vehicleLabel = isMoto ? '摩托车' : isCar ? '汽车' : '自行车';
    const vehicleAction = isMoto ? '骑行' : isCar ? '驾驶' : '骑行';
    const vehicleModelLabel = motoBikeType || '未提供';

    const vehicleCoreDesc = isMoto
      ? '跑山的核心是**骑摩托车走山路弯道**，享受压弯和骑行本身的乐趣。'
      : isCar
        ? '跑山的核心是**开车走山路弯道**，享受过弯、降挡补油和驾驶本身的乐趣。适合性能车、运动车、改装车爱好者。'
        : '跑山的核心是**骑自行车爬山路**，享受爬坡挑战、下坡冲刺和骑行本身的乐趣。';

    const vehicleDayDesc = isMoto
      ? `1. 早上从住处出发，骑上山路
2. 在弯道密集的路段尽情骑行，遇到好风景停下来拍照
3. 到山顶/垭口/观景台短暂停留打卡
4. 找山上或山脚的农家乐/饭店吃饭（这是跑山的重要环节！）
5. 下午原路返回或走另一条山路回去`
      : isCar
        ? `1. 早上从住处出发，加满油上山路
2. 在弯道密集的路段享受过弯、降挡补油，注意对向来车
3. 到山顶/垭口/观景台停车拍照打卡
4. 找山上或山脚的饭店吃饭（跑山必备环节！）
5. 下午原路返回或绕另一条山路回去`
        : `1. 早上从住处出发，检查车况补给饮水
2. 开始爬坡，享受持续爬升带来的挑战
3. 到山顶/垭口/制高点打卡拍照、休整补给
4. 找山上或山脚的饭店吃饭补充体力
5. 下午下山或走另一条路回去`;

    const distanceNote = isMoto
      ? '每天单程50-150公里为宜，当天骑行总里程不超过300公里'
      : isCar
        ? '每天单程50-200公里为宜，当天驾驶总里程不超过400公里'
        : '每天总骑行30-100公里为宜（视爬升量而定），累计爬升500-2000米';

    const routeCriteria = isMoto
      ? '弯道密集、铺装良好、风景好、有海拔起伏的山路/盘山公路/国道省道'
      : isCar
        ? '弯道密集且路面宽（至少双车道）、铺装良好、风景好、有海拔起伏的盘山公路。注意避免路窄无法会车的路段'
        : '坡度适中（5-12%为佳）、铺装良好、车流量小、风景好、有持续爬升的山路/盘山公路';

    const searchKeyword = isMoto
      ? `${data.departure} 摩托车跑山路线推荐`
      : isCar
        ? `${data.departure} 汽车跑山自驾山路推荐`
        : `${data.departure} 公路车爬坡骑行路线推荐`;

    const refRoutes = isMoto
      ? `  北京：妙峰山/红井路十八盘/百花山/仓米古道/琉辛路/灵山盘山路
  杭州：漕雅线/天荒坪/大鱼线；重庆：歌乐山/南山
  广东：从化溪头村线/南昆山；成都：龙泉山/蒲虹路`
      : isCar
        ? `  北京：红井路十八盘/百花山/妙峰山/幽州大峡谷
  杭州：天荒坪/大鱼线/莫干山；重庆：歌乐山/南山/武隆仙女山
  广东：南昆山/丹霞山；成都：龙泉山/蒲虹路/巴朗山`
        : `  北京：妙峰山/门头沟潭王路/百花山/红井路
  杭州：天荒坪/大鱼线/灵隐-梅家坞-龙井爬坡；重庆：歌乐山/照母山
  广东：从化吕田/南昆山；成都：龙泉山/蒲虹路`;

    const notesGuide = isMoto
      ? '弯道类型（C弯/发卡弯/盲弯等）、路面状况、海拔变化等骑行相关信息'
      : isCar
        ? '弯道类型（C弯/发卡弯/U弯等）、路面宽度、海拔变化、会车难度、停车观景点'
        : '坡度/爬升量、路面状况、补给点（小卖部/水源）、下坡注意事项';

    const tipsGuide = isMoto
      ? '弯道安全（入弯减速/不越线/盲弯鸣笛）和装备提醒（全盔/护具/手套/骑行靴）'
      : isCar
        ? '弯道安全（入弯减速/不越线/盲弯鸣笛/注意对向来车）和车辆检查提醒（刹车/轮胎/油液）'
        : '骑行安全（下坡控速/弯道靠右/佩戴头盔）和补给提醒（水/能量胶/备胎工具）';

    const vehicleCheckNote = isMoto
      ? '检查胎压刹车链条，加满油出发'
      : isCar
        ? '检查胎压刹车油液，加满油出发'
        : '检查胎压变速刹车，带足饮水和补给出发';

    const returnTripGuide = `
【返程规划 — 非常重要，不能遗漏！】
跑山行程必须包含返程！用户需要回到出发地。请在 activities 最后安排返程：
- 返程方式A（推荐给一日游）：走高速/快速路直接回城，注明"跑了一天山路比较累，建议走高速返回，约X小时"
- 返程方式B：原路返回，再跑一遍山路弯道
- 返程方式C：走另一条不同的山路/国道回去
你需要**选择一种最合理的返程方式**，并在 activities 里写出返程活动（location 填返程途经的镇/收费站/出发城市），确保最后一条 activity 的 location 回到出发城市或其市区。
transportDetail 也必须写清返程走法和预计到家时间。`;

    return `请为我推荐**${vehicleLabel}跑山路线**。

【跑山模式 — 核心理解（非常重要）】
跑山 ≠ 旅行 ≠ 普通旅游。${vehicleCoreDesc}

跑山的完整一天是这样的（包含返程！）：
${vehicleDayDesc}
6. 返程回城（走高速快速回家，或原路/另一条路慢慢骑/开回去）
7. 傍晚回到出发城市

**跑山不需要火车/飞机/高铁信息。不需要逛景点逛街购物。不需要详细游览攻略。**
核心输出：**山路路线（去程+返程）、弯道描述、沿途风景打卡点、吃饭的地方。**

基本信息：
- 出发城市：${data.departure}
- ${isBike ? '车型' : '车型/排量'}：${vehicleModelLabel}
${mrDateLine}
${mrDestLine}
${p.mustVisit ? `- 想去的方向：${p.mustVisit}` : ''}
${p.mustAvoid ? `- 不想去的：${p.mustAvoid}` : ''}

【选线标准】
- ${distanceNote}
- 优先选：${routeCriteria}
- 知名跑山路线参考（仅供灵感，你必须根据出发城市自行推荐，不要总是推荐同一条路）：
${refRoutes}
- 不在以上列表的城市，请联网搜索"${searchKeyword}"
${returnTripGuide}

【${mrIsMultiDay ? '多天' : '单日'}跑山规则】
${mrItineraryNote}
${mrAccomNote}

【多样性要求 — 必须遵守】
- **每次生成都必须推荐不同的路线**，不要重复上次的路线
- 从出发城市附近多条可选山路中**随机选一条**推荐，不要总是推荐最知名的那条
- 如果出发城市附近有5条以上可选山路，请随机挑选，给用户新鲜感

【地理准确性 — 严禁胡编】
- 只推荐你确认存在的真实山路，弯道描述必须对应该路线的实际情况
- **不同山路的特征不能混淆**：例如红井路的发卡弯只出现在红井路上，不能写在仓米古道的描述里
- 不确定的路线信息请联网搜索验证，不要编造弯道数量、海拔数据
- 沿途餐馆推荐必须在该路线沿线，不能把其他路线附近的餐馆张冠李戴

请严格按以下JSON格式返回（不要任何额外文字）：

{
  "recommendedRoute": "推荐路线总览，包含去程和返程",
  "recommendedDays": ${mrDays},
  "recommendedSeason": "当前季节跑山提醒（气温、路面、起雾等）",
  "nearbySuggestions": "同城市其他可跑的山路推荐（2-3条备选线路名+特点，与本次推荐的不同）",
  "plans": [
    {
      "planName": "XX跑山${mrDays > 1 ? mrDays + '日' : '一日'}${vehicleAction}",
      "planDescription": "一句话概括（含总里程和预计时长）",
      "transportDetail": "去程：完整路线走法、里程、${vehicleAction}时间、重点弯道路段${isBike ? '、爬升量、补给点' : '、加油站'}。返程：走哪条路回去、里程、预计到家时间。",
      "itinerary": [
        {
          "day": 1,
          "date": "${data.startDate || 'Day 1'}",
          "theme": "XX山路跑山",
          "activities": [
            {"time": "08:00", "activity": "出发准备", "location": "${data.departure}", "duration": "30分钟", "cost": 0, "notes": "${vehicleCheckNote}"},
            {"time": "...", "activity": "${vehicleAction}上山（去程山路段）", "location": "途经的具体村镇名", "duration": "...", "cost": 0, "notes": "该路段实际弯道特征..."},
            {"time": "...", "activity": "山顶/垭口打卡", "location": "具体景区或山顶地名", "duration": "...", "cost": 0, "notes": "..."},
            {"time": "...", "activity": "午餐", "location": "沿途具体村镇", "duration": "1小时", "cost": 80, "foodRecommendation": {"shopName": "真实店名", "rating": 4.5, "specialty": "招牌菜", "reason": "推荐理由"}},
            {"time": "...", "activity": "返程", "location": "返程途经的村镇或高速入口", "duration": "...", "cost": 0, "notes": "返程走法：走XX高速/原路返回/走XX路返回，预计X点到家"},
            {"time": "...", "activity": "到家", "location": "${data.departure}", "duration": "-", "cost": 0, "notes": "全天结束，总${vehicleAction}里程约XXkm"}
          ]
        }
      ],
      "attractions": [
        {"name": "路线亮点/打卡点", "description": "为什么值得停", "category": "观景点", "duration": "10-30分钟", "cost": 0}
      ],
      "accommodations": [${mrIsMultiDay ? '{"name": "山脚镇上客栈/酒店", "type": "客栈", "pricePerNight": 200, "area": "XX镇", "highlights": "停车方便", "pros": ["位置方便"], "cons": ["设施一般"], "webNote": "建议出行前核实"}' : ''}],
      "foodSpots": [
        {"name": "真实饭店名", "type": "农家乐", "avgCost": 50, "specialty": "推荐菜", "area": "该路线沿线具体位置"}
      ],
      "costBreakdown": {"transport": 50, "accommodation": 0, "food": 100, "attractions": 0, "other": 0, "total": 150},
      "tips": ["弯道安全提醒", "山区天气提醒", "${isBike ? '补给和体力分配' : '车况检查'}"]
    }
  ]
}

注意：
1. **跑山行程的核心是${vehicleAction}本身**，activities 围绕"出发→${vehicleAction}上山→打卡→吃饭→返程→到家"展开
2. **activities 必须包含返程和到家**，最后一条 activity 的 location 必须是出发城市（${data.departure}），让用户知道几点能到家
3. foodSpots 至少 4 家该路线沿途的农家乐/饭店，写真实可查的店名和招牌菜
4. attractions 改为"路线亮点"：弯道名段、观景台、垭口、打卡点，至少 4 个
5. transportDetail 写清去程和返程的完整走法、里程${isBike ? '、爬升量、补给点' : '、加油站'}
6. tips 必须包含${tipsGuide}
7. **绝对不要出现火车、飞机、高铁、12306等信息**
8. 所有费用是${data.peopleCount}人的总费用（人民币元）
9. 每条 activity 的 notes 写${notesGuide}
10. **location 字段极其重要**：必须填**具体可在地图上搜到的地名**（村镇名、景区名、山峰名），**绝对不能**填路线名、路段编号、"XX路→XX路"。路线走法写在 notes 和 transportDetail 里。
11. **弯道/路况描述必须对应该条路线的真实情况**，不同路线的特征不能混用`;
  }

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

【联网搜索能力 — 充分利用（极其重要）】
- 你已开启联网搜索，请**主动搜索**以下来源获取真实数据：
  1. **小红书 / 马蜂窝 / 携程攻略**：搜索目的地热门景点、打卡地、真实游客体验，让推荐更贴合实际。
  2. **酒店预订平台**：搜索真实酒店名称、价格区间、用户评价，填入 accommodations 和 stayInfo。

【餐饮推荐 — 简化原则】
- 餐饮只推荐到「菜系 + 区域」层面（如"春熙路附近川菜""回民街小吃"），**不要编造具体店名**。
- 只有当你从高德POI数据或联网搜索中获得了**确认存在的真实店名**时，才可以写具体店名。
- foodRecommendation 可以简写：shopName 填"当地XX菜推荐"或真实店名，rating 可省略，specialty 写菜系特色即可。
- foodSpots 同理：每项 name 填"XX区域·XX菜系"或真实可查店名，不要凭空编造。

【铁路信息 — 站名准确，车次留空】
- 你**无法**可靠查询 12306 车次数据，**严禁编造**车次号（如 G1234）、精确发车/到达时刻、精确票价。
- transportInfo 中：**trainNo 留空或省略**；**departTime / arriveTime 留空或省略**；**duration** 写大致区间（如"约1～2小时"）；**priceNote** 写"请在12306查询"。
- **fromStation / toStation** 必须填写**真实存在的常见客运站名**。例如北京往张家口走京张高铁，发站为清河站或北京北站，不要写北京西站。
- transportDetail 须提醒用户在 12306 查询具体车次与票价。

【行程字段 — 禁止残缺】
- itinerary 里每条 activities 的 **time、activity、location、duration** 必须是**非空的中文字符串**（可含数字与符号）；**禁止**输出 undefined、null、英文 undefined、空字符串或 JSON 非法占位。
- 若活动是「跨城交通段」，请补充 transportInfo：fromStation、toStation（真实站名）、duration（大致区间）、priceNote（写"请在12306查询"）。**不要填 trainNo、departTime、arriveTime**，因为你无法可靠获取这些数据。
- 若活动是「入住酒店」，请补充 stayInfo（hotelName, pricePerNight，注意是每晚价格）。
- 若活动是「餐饮」类，请补充 foodRecommendation（shopName/rating/specialty/reason），优先高评分口碑店。
- notes 可省略；若写则同样须为正常中文短句。若已有天气参考，请优先在 notes 加一句当日「穿衣/雨具」建议（如“早晚加外套、建议带折叠伞”）。
- tips 数组**至少 2 条**有用中文贴士（天气、预约、交通、安全、饮食等），不得留空数组。

基本信息：
- 出发地：${data.departure}
${destinationLine}
${dateSection}
${fixedDateBlock}${durationConstraint}
- 出行人数：${data.peopleCount}人
- 同行人：${companion}${childInfo}
- 偏好的出行方式：${transports}

偏好设置：
- 旅行节奏：${paceDesc}
${interestLine}
- 住宿档次：${accom}${accomStyleDesc ? `\n- 住宿风格偏好：${accomStyleDesc}（请据此优先推荐符合风格的住宿，而非普通连锁快捷酒店）` : ''}
${foodLine}${dietaryNote}
- 预算水平：${budgetDesc}（人均每天）${mustVisit}${mustAvoid}${specialNeeds}
${mustAvoidHardRules}
${realDataBlock}${hotelWebBlock}${weatherBlock}${transportFoodBlock}
${planCountText}
${productCoreBlock}

【输出精简要求 — 严格遵守，否则 JSON 会被截断导致方案不完整！】
- tips 控制在 3 条
- location、notes 简洁（10-20字）
- accommodations 每项只写 name、pricePerNight、area、pros（1条）、cons（1条）
- food_spots 每项只写 name、cuisine、priceRange、rating
${fixedDayCount && fixedDayCount > 10 ? `- **长行程（${fixedDayCount}天）**：每天 activities 严格 **2-3 条**（上午+下午+可选晚间），描述从简。**宁可每天少一条活动，也绝对不能漏掉任何一天！全部 ${fixedDayCount} 天必须写完。**` : fixedDayCount && fixedDayCount > 5 ? `- **中等行程（${fixedDayCount}天）**：每天 activities 控制在 **3-4 条**，描述从简。` : `- 每天 activities 3-5 条`}

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
            {"time": "上午出发", "activity": "乘高铁前往南昌", "location": "北京西站→南昌西站", "duration": "约4～5小时", "cost": 0, "notes": "建议提前在12306查询车次并购票", "transportInfo": {"fromStation": "北京西站", "toStation": "南昌西站", "duration": "约4～5小时", "priceNote": "请在12306查询具体车次与票价"}},
            {"time": "09:00", "activity": "自驾前往青岛", "location": "北京→青岛", "duration": "约5小时", "cost": 0, "notes": "途经G2京沪高速转G22青兰高速，沿途可在淄博服务区休息", "transportInfo": {"fromStation": "北京", "toStation": "青岛", "distance": "约630公里", "duration": "约5小时", "priceNote": "油费及过路费预估600元"}},
            {"time": "16:00", "activity": "入住酒店并休整", "location": "八一广场", "duration": "约1小时", "cost": 0, "stayInfo": {"hotelName": "全季南昌八一广场店", "pricePerNight": 360}},
            {"time": "19:00", "activity": "晚餐探店", "location": "万寿宫历史文化街区", "duration": "约1.5小时", "cost": 120, "foodRecommendation": {"shopName": "邓氏瓦罐汤（万寿宫店）", "rating": 4.7, "specialty": "招牌瓦罐汤/南昌拌粉", "reason": "大众点评高分老店，本地人常去，汤底浓郁"}}
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
        "transport": "800-1200",
        "accommodation": "600-1000",
        "food": "400-600",
        "attractions": "100-300",
        "other": "0-200",
        "total": "2000-3000"
      },
      "tips": ["实用贴士1", "实用贴士2"]
    }
  ]
}

注意：
${notePlanDaysLine}
2. 所有费用是${data.peopleCount}人的总费用（人民币元），**用范围表示**（如"800-1200"），不要给精确到个位的数字。自驾/骑行的 transport 须包含油费和过路费预估范围。
3. 费用要合理，符合${budgetDesc}的预算水平
4. 只生成 1 个方案，plans 数组恰好 1 个元素。用户的出行方式为「${transports}」，方案中的交通方式**必须与此一致**，不得擅自换成其他交通方式
5. 若给了具体目的地：方案必须**全部涵盖**这些地点，但**游览与交通顺序完全由你优化**，不得机械按用户输入顺序串联；若没给具体目的地，你需要先推荐目的地再排路线
${noteRecommendedDaysLine}
7. 每天的第一个活动时间根据旅行节奏合理安排（轻松节奏可晚些出发，紧凑节奏早些出发）
8. ${fixedDayCount != null ? 'itinerary 每项的 date 为真实公历日期；theme 仍写当天主题' : 'date 字段用 "Day 1", "Day 2" 这样的格式'}
9. 顶层必须包含 nearbySuggestions 字符串字段。${fixedDayCount != null ? '固定日期下须按上文详写顺路/半日周边玩法。' : '日期未固定时可填空字符串，或简要写出若采用某路线时的顺路可玩点。'}
10. ${hotelAccommodationRules}
11. ${outputLimitText}${selfDriveGuide}${motorcycleGuide}
12. attractions 清单须饱满：固定日期时至少 **${fixedDayCount != null ? Math.min(Math.max(fixedDayCount * 2, 10), 36) : 10}** 个「景点/体验/街区/观景点」条目，并与 itinerary 中实际游玩内容对应；非固定日期至少 10 个。
13. 若用户填写了「不想去的地方」：attractions 与 itinerary 均不得出现与用户否决项冲突的内容（例如用户拒绝博物馆时，不得出现博物馆/美术馆/室内展览类推荐）。
14. 严格遵守上文「地理与交通」「行程字段」；若输出被截断导致字段缺失，应优先保证**每日 activities 条数与时段覆盖**、四项字符串完整、tips 至少 2 条${noteLongTripBlock}`;
}

export function buildPlanEditPrompt(args: {
  trip: {
    departure: string;
    destinations: string[];
    people_count: number;
    date_mode?: string;
    start_date?: string;
    end_date?: string;
    preferences?: { mustAvoid?: string; mustVisit?: string; specialNeeds?: string };
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

  const mustAvoid = trip.preferences?.mustAvoid?.trim();
  const mustAvoidEditBlock = mustAvoid
    ? `
【用户长期否决项（生成阶段已声明，仍须遵守）】
- ${mustAvoid}
- 若含「不去任何博物馆」等：禁止在 itinerary/attractions/tips 中出现博物馆、博物院、纪念馆、美术馆、艺术馆、室内展览/看展类安排；不得以换表述绕过。
`
    : '';

  return `你是一位专业、友善的旅行规划助手。用户正在和你讨论一份已生成的旅行方案。你既可以帮他调整方案，也可以单纯聊天、回答问题、给建议。

**核心原则：区分"聊天"和"指令"。用户聊天时陪他聊，用户下指令时立刻执行。**

什么时候【只回复，不改方案】（planModified 设为 false，updatedPlan 设为 null）：
- 用户在纯粹提问，不涉及修改（如"庐山值得去吗""高铁大概多少钱""这个季节冷不冷"）
- 用户在表达感受但没有明确要改什么（如"感觉行程有点赶""好像挺累的"）→ 你可以追问"要不要帮你调整一下节奏？哪天想轻松点？"
- 用户在犹豫、对比、没拿定主意（如"A和B你觉得哪个好""我在想要不要去那里"）
- 此时 assistantMessage 要像朋友一样自然回复，可以给建议、追问细节

什么时候【修改方案】（planModified 设为 true，updatedPlan 返回完整修改后的方案）：
- 用户要求增加/减少/替换/调整内容（如"多推荐几个酒店""换成夜景""加个景点""去掉博物馆""住宿多给几个选择"）
- 用户指定了具体的修改方向（如"第一天住宿多推荐几个""预算降到5000""第2天轻松一点"）
- 用户确认了你之前的建议（如"好的就按你说的改""行就这样吧""可以"）
- 用户表达了否定/拒绝某部分行程（如"第三天不要了""把这个景点去掉"）→ 这是指令，立刻执行删除/替换！
- **特殊情况——删除整个城市**：当用户说"XX不去了""不想去XX了"要删除的是**整个城市/目的地**时，先确认再改（因为有两种处理方式）：
  - 回复类似："好的，不去XX了。你想怎么处理：\n1. 直接少玩一天（总天数从N天变N-1天）\n2. 天数不变，把XX的时间分给其他城市\n你选哪个？"
  - 此时 planModified 设为 false，等用户回复后再执行修改
  - 如果用户明确说了处理方式（如"不去日照了 少一天"或"日照去掉 时间分给青岛"），就不需要再问，直接执行
- 用户用了这些**动作词**中的任何一个 → 当作指令，直接执行修改：
  "多推荐""换成""改成""加上""去掉""删掉""不要""不去""不想去""不想住""取消""拿掉""砍掉""缩短""延长""提前""推迟""便宜点""贵一点""升级""降级"
- **注意："多推荐几个"="帮我推荐更多"，是明确指令，必须立刻修改方案，不要反问！**

拿不准时的判断方法：用户的话里有没有"动作词"（见上面列表）？
- 有动作词 → 当指令执行，改方案，**不要追问"你想换成什么"**
- 没有动作词，只是表达感受或提问 → 先聊

【用户说得模糊怎么办？】
- 用户说"不想在XX玩""换成其他地方""改一下"但没说具体换什么 → **你自己决定替换成什么！** 根据出发地、行程天数、用户偏好，推荐合理的替代方案，直接执行修改。**绝对不要反问"你想换成哪里"，用户是来让你帮忙做决定的，不是来被追问的。**

【"不想在XX玩"＝彻底移除整个行政区，不留一天！】
- 当用户说"不想在XX玩""XX不去了""把XX去掉"时，意思是**完全不要在该城市整个行政区范围内有任何观光活动**。
- "不想在XX玩"中的 XX 指的是**整个行政区划**，包括该城市的所有区县、郊区、卫星城、以及位于这些区域内的所有景点。
- **北京市的行政区划包括**：东城、西城、朝阳、海淀、丰台、石景山、通州、顺义、房山、大兴、昌平、怀柔、平谷、密云、延庆、门头沟。"不想在北京玩"＝以上所有区域及其中的景点全部不去！
- **以下热门景点全部属于北京市，说"不想在北京玩"时必须全部移除**：古北水镇（密云区）、八达岭长城（延庆区）、慕田峪长城（怀柔区）、十三陵（昌平区）、奥林匹克森林公园（朝阳区）、颐和园（海淀区）、故宫（东城区）、天坛（东城区）、北海公园（西城区）、香山（海淀区）、雁栖湖（怀柔区）、龙庆峡（延庆区）、金海湖（平谷区）等。
- 你必须把 itinerary 中所有在该行政区范围内的天全部替换为**该行政区之外**的其他城市。**一天都不能留！包括用 _keep:true 保留的天也要检查，如果原来那天是在被移除的城市，就不能 _keep，必须替换！**
- 仅允许保留出发日的"从XX出发前往…"和返程日的"返回XX"两个交通动作（且该天不能有任何在该城市的景点/游览/休闲活动）。
- 替代城市必须在**该城市行政区之外**。例如"不想在北京玩"→ 可推荐天津、廊坊、保定、承德、张家口、秦皇岛、唐山、燕郊（河北三河市）等。昌平、密云、延庆、怀柔等属于北京市，**绝对不可以推荐**。古北水镇属于密云区（北京），也不可以。
- 长行程替代城市要足够多且有深度（如天津3-4天、承德3天、秦皇岛2-3天、保定2天等），不要出现连续多天"返程准备"这种空洞安排。
- 替换后重新规划交通衔接，确保行程地理顺序合理。

【防矛盾规则】：如果你在 assistantMessage 里说"帮你去掉了""已经换了""调整好了"等已完成的措辞，planModified **必须**为 true 且 updatedPlan 包含修改后的方案。绝对不允许嘴上说改了但 planModified 为 false。

修改方案时的要求：
1. **增量输出**：itinerary 数组中，**未修改的天只写 { "day": N, "_keep": true }**，只有真正改动过的天才写完整内容。这非常重要，可以大幅减少输出量！例如14天方案只改了第1、7、14天，itinerary 应该是：[{ "day": 1, ...完整内容 }, { "day": 2, "_keep": true }, ..., { "day": 7, ...完整内容 }, ..., { "day": 14, ...完整内容 }]
   - **例外1**：如果用户要求**重新排列城市顺序/调整每城天数分配**，则**所有天都必须输出完整内容**（不能用 _keep），因为每天对应的城市都变了
   - **例外2（删除目的地）**：当用户确认了删除某个城市后的处理方式（减天 or 保持天数重新分配），执行修改时：
     - 减天：总天数相应减少，剩余城市天数可微调，**所有天都必须输出完整内容，禁止 _keep**
     - 保持天数：把被删城市的天数重新分配给其他城市（增加游览深度或加入周边），**所有天都必须输出完整内容，禁止 _keep**
     - 两种情况下 transportDetail 都必须同步更新为新路线
2. 只改和用户指令相关的内容，未提及部分保持不变
3. 修改后给出简要变更说明（changeSummary）
4. assistantMessage 用自然口语回复，像朋友一样说话，不要机械化（如"好嘞，帮你换了几家有格调的民宿，你看看喜不喜欢～"）
5. 若用户提到「换顺序」「先去哪里」「路线不合理」或指定了城市游览顺序和天数分配：
   - 如果用户**明确指定了顺序和每城天数**（如"先去A呆1天再去B呆2天最后去C"），必须**严格按用户指定的顺序和天数执行**，不要自作主张"优化"
   - 如果用户只是说"路线不合理""帮我调一下顺序"但没指定具体顺序，你再根据地理逻辑优化
   - 重排顺序时**所有天都必须输出完整内容，禁止用 _keep:true**，因为每天对应的城市和活动都变了
   - 同步调整 transportDetail 与城市间交通衔接
6. 若用户提到「周边」「顺路多玩」：在总天数与返程日不变前提下，可把半日周边安排写进 itinerary 的 notes 或替换当日较轻的活动
7. 若涉及住宿调整：每项保留 pros、cons、webNote；联网场景下 webNote 须体现「据检索摘要归纳」
8. 地理与交通须符合常识（如江西景德镇至浙江乌镇应写高铁经杭州/上海等枢纽中转及合理耗时，禁止「大巴2–3小时直达」）；itinerary 每条 activities 的 time、activity、location、duration 须为非空中文字符串，禁止 undefined/null 字面；tips 至少 2 条中文
9. 若当前方案「每天 activities 过少、下午或晚间空白」：在总天数与返程日不变前提下，按**上午+下午+晚间**补齐可执行安排（除非用户明确要求极简）
10. 若用户要求"更直观价格"：住宿名称后可直接带价格（如「全季XX店（约¥320/晚）」）；若有天气信息，相关天的 notes 增加一句穿衣/雨具建议
11. 若当前活动已有 transportInfo/stayInfo/foodRecommendation 等结构化字段，除非用户明确要求删除，否则应保留并按新需求更新
12. 修改后须清除与用户否决项冲突的内容（例如用户拒绝博物馆却仍出现「某某博物馆」时应删除并替换为合规活动）
13. 铁路段：transportInfo 只填真实站名、大致耗时、"请在12306查询"；**不要填 trainNo/departTime/arriveTime**。
14. **costBreakdown 用范围表示**（如 "transport": "800-1200", "total": "2000-3000"），不要精确到个位。任何涉及预算调整、住宿升级/降级、增减活动等改动，都必须同步更新 costBreakdown 中各项范围和 total。
${mustAvoidEditBlock}
行程背景：
- 出发地：${trip.departure}
- 用户想去的地方（集合，顺序以方案为准）：${trip.destinations.length ? trip.destinations.join('、') : '由当前方案中的目的地决定'}
- 人数：${trip.people_count}人${lockedDates}
- 推荐路线：${recommendations?.route || '无'}
- ${daysLabel}：${recommendations?.days ?? '无'}
- ${seasonLabel}：${recommendations?.season || '无'}
- 周边备选参考：${recommendations?.nearbySuggestions || '无'}

当前方案（JSON，紧凑格式）：
${JSON.stringify(currentPlan)}

近期对话：
${historyText || '无'}

用户这次说的话：
${userInstruction}

请严格返回以下 JSON（不要任何额外文字）：

如果你认为这次**不需要修改方案**（只是聊天/回答问题/讨论想法），返回：
{
  "planModified": false,
  "assistantMessage": "你的自然语言回复（像朋友聊天一样，可以提问、建议、讨论）",
  "changeSummary": null,
  "updatedPlan": null
}

如果你认为这次**需要修改方案**，返回：
{
  "planModified": true,
  "assistantMessage": "简短说明你做了什么调整（自然口语风格）",
  "changeSummary": "一句话总结本次修改",
  "updatedPlan": {
    "planName": "方案名",
    "planDescription": "方案描述",
    "transportDetail": "交通方案",
    "itinerary": [],
    "attractions": [],
    "accommodations": [],
    "foodSpots": [],
    "costBreakdown": {
      "transport": "800-1200",
      "accommodation": "600-1000",
      "food": "400-600",
      "attractions": "100-300",
      "other": "0-200",
      "total": "2000-3000"
    },
    "tips": []
  }
}`;
}
