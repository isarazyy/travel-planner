export interface TripPreferences {
  companion: string;
  childAge?: string;
  pace: string;
  interests: string[];
  accommodation: string;
  accommodationStyles?: string[];
  foodPrefs: string[];
  dietaryNotes?: string;
  budgetLevel: string;
  budgetRange?: [number, number];
  transportModes: string[];
  motoBikeType?: string;
  motoDailyKm?: number;
  motoAllowNightRide?: 'yes' | 'no';
  /** 摩托车骑行类型：touring=摩旅（多日长途）, mountain_run=跑山 */
  motoRideType?: 'touring' | 'mountain_run';
  /** 跑山车辆类型 */
  mountainRunVehicle?: 'motorcycle' | 'car' | 'bicycle';
  wakeUpTime: string;
  mustVisit?: string;
  mustAvoid?: string;
  specialNeeds?: string;
}

export type DateMode = 'fixed' | 'flexible_end' | 'flexible_all';
export type GenerationMode = 'standard' | 'fast';
export type DestinationMode = 'specific' | 'theme' | 'open';

export interface TripFormData {
  departure: string;
  destinations: string[];
  destinationMode: DestinationMode;
  destinationThemes: string[];
  /** 仅在 destinationMode === 'open' 时使用的二级偏好标签，可多选 */
  openModeDetails?: string[];
  destinationHint: string;
  dateMode: DateMode;
  generationMode: GenerationMode;
  startDate: string;
  endDate: string;
  dateHint?: string;
  peopleCount: number;
  preferences: TripPreferences;
  regenerate?: boolean;
}

export interface DayActivity {
  time: string;
  activity: string;
  location: string;
  duration: string;
  cost: number;
  notes?: string;
  /** 可选：跨城交通细节 */
  transportInfo?: {
    fromStation?: string;
    toStation?: string;
    trainNo?: string;
    departTime?: string;
    arriveTime?: string;
    duration?: string;
    distance?: string;
    priceNote?: string;
  };
  /** 可选：住宿细节（每晚） */
  stayInfo?: {
    hotelName?: string;
    pricePerNight?: number;
  };
  /** 可选：餐饮推荐细节 */
  foodRecommendation?: {
    shopName?: string;
    rating?: number;
    specialty?: string;
    reason?: string;
  };
  /** 可选：高德真实地点数据回填（图片/评分/营业时间/坐标等） */
  placeInfo?: PlaceInfo;
}

/** 高德回填的真实地点信息 */
export interface PlaceInfo {
  /** 实景图片地址 */
  photo?: string;
  /** 评分（高德 biz_ext.rating） */
  rating?: number;
  /** 营业时间文本 */
  openTime?: string;
  /** 人均/门票参考价（元） */
  cost?: number;
  /** 详细地址 */
  address?: string;
  /** 联系电话 */
  tel?: string;
  /** 经纬度 "lng,lat"，用于导航 */
  location?: string;
}

export interface DayPlan {
  day: number;
  /** 展示用，如「3月7日（周五）」 */
  date: string;
  /** 与天气预报匹配的公历 YYYY-MM-DD（固定日期行程由服务端写入） */
  dateIso?: string;
  theme: string;
  activities: DayActivity[];
}

export interface Attraction {
  name: string;
  description: string;
  category: string;
  duration: string;
  cost: number;
  /** 一句话亮点：最值得体验/最出片的点 */
  highlight?: string;
  /** 适合人群，如 亲子/情侣/摄影/带老人 */
  suitableFor?: string;
  /** 建议游玩时段，如 上午人少/傍晚看日落 */
  bestTime?: string;
  rating?: number;
  /** 高德回填：实景图片 */
  image?: string;
  /** 高德回填：营业时间 */
  openTime?: string;
  /** 高德回填：详细地址 */
  address?: string;
  /** 高德回填：经纬度 "lng,lat" */
  location?: string;
}

export interface Accommodation {
  name: string;
  type: string;
  pricePerNight: number;
  area: string;
  highlights: string;
  /** 优势（可结合联网摘要或常识，用户需在平台核实） */
  pros?: string[];
  /** 劣势 / 避雷点 */
  cons?: string[];
  /** 信息来源与核实提醒 */
  webNote?: string;
  /** 可选，兼容旧数据；界面不再展示外链 */
  searchKeyword?: string;
}

export interface FoodSpot {
  name: string;
  type: string;
  avgCost: number;
  specialty: string;
  area: string;
}

export interface CostBreakdown {
  transport: number | string;
  accommodation: number | string;
  food: number | string;
  attractions: number | string;
  other: number | string;
  total: number | string;
}

export interface TripPlan {
  planName: string;
  planDescription: string;
  transportDetail: string;
  itinerary: DayPlan[];
  attractions: Attraction[];
  accommodations: Accommodation[];
  foodSpots: FoodSpot[];
  costBreakdown: CostBreakdown;
  estimatedTotal: number;
  tips: string[];
}

export interface Trip {
  id: string;
  user_id: string;
  departure: string;
  /** 数据库单列 summary，与 destinations 数组可能并存 */
  destination?: string;
  destinations: string[];
  date_mode: DateMode;
  start_date: string;
  end_date: string;
  people_count: number;
  preferences: TripPreferences;
  created_at: string;
  trip_plans?: TripPlanRecord[];
}

export interface TripPlanRecord {
  id: string;
  trip_id: string;
  mode: string;
  itinerary: DayPlan[];
  attractions: Attraction[];
  accommodations: Accommodation[];
  food_spots: FoodSpot[];
  cost_breakdown: CostBreakdown;
  estimated_total: number;
  transport_detail: string;
  tips: string[];
  created_at: string;
}

export const COMPANION_OPTIONS = [
  { value: 'solo', label: '独自旅行', icon: '🧳' },
  { value: 'couple', label: '情侣出行', icon: '💑' },
  { value: 'family', label: '家庭亲子', icon: '👨‍👩‍👧' },
  { value: 'friends', label: '朋友结伴', icon: '👫' },
  { value: 'elderly', label: '带老人出行', icon: '👴' },
];

export const CHILD_AGE_OPTIONS = [
  { value: '0-3', label: '0-3岁（婴幼儿）' },
  { value: '3-6', label: '3-6岁（学龄前）' },
  { value: '6-12', label: '6-12岁（小学）' },
  { value: '12-18', label: '12-18岁（青少年）' },
];

export const PACE_OPTIONS = [
  { value: 'intensive', label: '紧凑充实', desc: '每天4-5个景点，不浪费一分钟', icon: '⚡' },
  { value: 'balanced', label: '适中平衡', desc: '每天2-3个景点，有节奏有休息', icon: '⚖️' },
  { value: 'relaxed', label: '随心漫游', desc: '每天1-2个景点，大量留白时间', icon: '🌿' },
  { value: 'half', label: '半天玩半天休', desc: '上午游玩，下午自由安排', icon: '☀️' },
];

export const INTEREST_OPTIONS = [
  { value: 'nature', label: '自然风光', icon: '🏔️' },
  { value: 'history', label: '历史人文', icon: '🏛️' },
  { value: 'food', label: '美食探店', icon: '🍜' },
  { value: 'photo', label: '拍照打卡', icon: '📸' },
  { value: 'outdoor', label: '户外运动', icon: '🚴' },
  { value: 'artsy', label: '文艺小众', icon: '☕' },
  { value: 'nightlife', label: '夜生活', icon: '🌃' },
  { value: 'kids', label: '亲子乐园', icon: '🎠' },
  { value: 'shopping', label: '购物扫货', icon: '🛍️' },
  { value: 'local', label: '当地体验', icon: '🎭' },
];

export const ACCOM_OPTIONS = [
  { value: 'hostel', label: '青旅/床位', desc: '最省钱的选择' },
  { value: 'budget_hotel', label: '经济酒店', desc: '干净整洁就行' },
  { value: 'comfort_hotel', label: '舒适酒店', desc: '四星左右' },
  { value: 'luxury', label: '高端酒店/度假村', desc: '五星级、度假村' },
  { value: 'boutique_bnb', label: '精品民宿', desc: '独栋、管家服务、有设计感' },
  { value: 'unique_stay', label: '特色住宿', desc: '树屋、洞穴、帐篷、星空房' },
  { value: 'mixed', label: '混搭都行', desc: '看情况安排' },
];

export const ACCOM_STYLE_OPTIONS = [
  { value: 'designer', label: '设计感/网红', desc: '装修有格调、拍照好看', icon: '🎨' },
  { value: 'scenic_view', label: '景观房', desc: '山景/湖景/海景/江景', icon: '🏔️' },
  { value: 'hot_spring', label: '温泉/泡池', desc: '放松为主', icon: '♨️' },
  { value: 'cultural', label: '文化主题', desc: '古宅改造、茶室禅意', icon: '🏯' },
  { value: 'pet_friendly', label: '可带宠物', desc: '允许携带毛孩子', icon: '🐾' },
  { value: 'no_preference', label: '不挑', desc: '干净方便就行', icon: '✅' },
];

export const FOOD_PREF_OPTIONS = [
  { value: 'local_must', label: '本地特色必吃' },
  { value: 'street', label: '街边小吃为主' },
  { value: 'restaurant', label: '正经餐厅为主' },
  { value: 'mixed_food', label: '偶尔吃好的，平时随便' },
];

export const BUDGET_LEVEL_OPTIONS = [
  { value: 'backpacker', label: '穷游', desc: '人均 <200元/天', range: [0, 200] as [number, number] },
  { value: 'economy', label: '经济', desc: '人均 200-400元/天', range: [200, 400] as [number, number] },
  { value: 'comfort', label: '舒适', desc: '人均 400-800元/天', range: [400, 800] as [number, number] },
  { value: 'luxury', label: '不差钱', desc: '人均 800+元/天', range: [800, 2000] as [number, number] },
];

export const TRANSPORT_OPTIONS = [
  { value: 'budget', label: '穷游（公共交通）', icon: '🚌' },
  { value: 'self_drive', label: '自驾游', icon: '🚗' },
  { value: 'train', label: '高铁/火车', icon: '🚄' },
  { value: 'flight', label: '飞机', icon: '✈️' },
  { value: 'motorcycle', label: '摩托车骑行', icon: '🏍️' },
];

export const WAKE_OPTIONS = [
  { value: 'early', label: '早鸟 (8:00出发)', icon: '🌅' },
  { value: 'normal', label: '正常 (10:00出发)', icon: '☀️' },
  { value: 'late', label: '晚起 (11:00后出发)', icon: '😴' },
];

/** 人群一键预设：点一下自动填好同行人/节奏/兴趣/预算/住宿等偏好 */
export interface TripPreset {
  id: string;
  label: string;
  icon: string;
  desc: string;
  peopleCount?: number;
  prefs: Partial<TripPreferences>;
}

export const TRIP_PRESETS: TripPreset[] = [
  {
    id: 'family_kids',
    label: '带娃遛娃',
    icon: '👨‍👩‍👧',
    desc: '节奏轻松 · 亲子友好',
    peopleCount: 3,
    prefs: {
      companion: 'family',
      pace: 'relaxed',
      interests: ['kids', 'nature', 'food'],
      wakeUpTime: 'normal',
      accommodation: 'comfort_hotel',
      budgetLevel: 'comfort',
      budgetRange: [400, 800],
      foodPrefs: ['local_must', 'restaurant'],
    },
  },
  {
    id: 'couple',
    label: '情侣浪漫',
    icon: '💑',
    desc: '出片 · 美食 · 微醺',
    peopleCount: 2,
    prefs: {
      companion: 'couple',
      pace: 'balanced',
      interests: ['photo', 'food', 'artsy', 'nightlife'],
      wakeUpTime: 'late',
      accommodation: 'boutique_bnb',
      accommodationStyles: ['designer', 'scenic_view'],
      budgetLevel: 'comfort',
      budgetRange: [400, 800],
      foodPrefs: ['local_must'],
    },
  },
  {
    id: 'elderly',
    label: '带爸妈/老人',
    icon: '👴',
    desc: '慢节奏 · 少折腾',
    peopleCount: 2,
    prefs: {
      companion: 'elderly',
      pace: 'relaxed',
      interests: ['nature', 'history', 'local'],
      wakeUpTime: 'normal',
      accommodation: 'comfort_hotel',
      budgetLevel: 'comfort',
      budgetRange: [400, 800],
      foodPrefs: ['local_must', 'restaurant'],
    },
  },
  {
    id: 'friends',
    label: '朋友嗨玩',
    icon: '👫',
    desc: '玩得满 · 有夜生活',
    peopleCount: 4,
    prefs: {
      companion: 'friends',
      pace: 'intensive',
      interests: ['food', 'nightlife', 'photo', 'outdoor'],
      wakeUpTime: 'normal',
      accommodation: 'comfort_hotel',
      budgetLevel: 'economy',
      budgetRange: [200, 400],
      foodPrefs: ['local_must', 'street'],
    },
  },
  {
    id: 'backpacker',
    label: '穷游党',
    icon: '🎒',
    desc: '省钱 · 多走多看',
    peopleCount: 1,
    prefs: {
      companion: 'solo',
      pace: 'intensive',
      interests: ['nature', 'local', 'food', 'photo'],
      wakeUpTime: 'early',
      accommodation: 'hostel',
      budgetLevel: 'backpacker',
      budgetRange: [0, 200],
      foodPrefs: ['street', 'local_must'],
    },
  },
  {
    id: 'solo_chill',
    label: '一个人放空',
    icon: '🧳',
    desc: '随心 · 文艺 · 不赶',
    peopleCount: 1,
    prefs: {
      companion: 'solo',
      pace: 'relaxed',
      interests: ['artsy', 'photo', 'food', 'local'],
      wakeUpTime: 'late',
      accommodation: 'boutique_bnb',
      budgetLevel: 'economy',
      budgetRange: [200, 400],
      foodPrefs: ['local_must'],
    },
  },
];

export const DATE_MODE_OPTIONS = [
  { value: 'fixed' as DateMode, label: '确定往返日期', desc: '严格按你的起止日期排程，并推荐顺路周边与时段提示', icon: '📅' },
  { value: 'flexible_end' as DateMode, label: '返回日期不确定', desc: '知道出发日，帮我推荐玩几天', icon: '📆' },
  { value: 'flexible_all' as DateMode, label: '完全不确定', desc: '帮我推荐最佳时间和天数', icon: '✨' },
];

export const MODE_LABELS: Record<string, string> = {
  budget: '穷游方案',
  self_drive: '自驾方案',
  train: '高铁方案',
  flight: '飞机方案',
  motorcycle: '摩托骑行方案',
};

export const MODE_ICONS: Record<string, string> = {
  budget: '🚌',
  self_drive: '🚗',
  train: '🚄',
  flight: '✈️',
  motorcycle: '🏍️',
};

export function modeDisplayLabel(mode: string): string {
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  const m = /^plan_(\d+)$/.exec(mode);
  if (m) return `方案 ${Number(m[1]) + 1}`;
  return mode;
}

export function modeIcon(mode: string): string {
  return MODE_ICONS[mode] || '📋';
}

export const DESTINATION_MODE_OPTIONS = [
  { value: 'specific' as DestinationMode, label: '我有目的地', icon: '📍' },
  { value: 'open' as DestinationMode, label: '帮我推荐', icon: '✨' },
];

export const DESTINATION_THEME_OPTIONS = [
  { value: 'seaside', label: '海边', icon: '🌊' },
  { value: 'grassland', label: '草原', icon: '🌾' },
  { value: 'mountain', label: '爬山', icon: '⛰️' },
  { value: 'lake', label: '湖景', icon: '🏞️' },
  { value: 'ancient_town', label: '古镇', icon: '🏯' },
  { value: 'city_walk', label: '城市漫游', icon: '🏙️' },
  { value: 'hot_spring', label: '温泉疗愈', icon: '♨️' },
  { value: 'food_hunt', label: '美食为主', icon: '🍜' },
];
