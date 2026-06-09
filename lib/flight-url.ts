/**
 * Flight search deep links (Ctrip / Qunar).
 * We can't query real-time flight data without API keys, so we link to search
 * results pages with departure/arrival cities and date pre-filled.
 */

/** IATA city codes for common Chinese cities (used by Ctrip). */
const CITY_CODES: Record<string, string> = {
  北京: 'BJS', 上海: 'SHA', 广州: 'CAN', 深圳: 'SZX', 成都: 'CTU', 重庆: 'CKG',
  杭州: 'HGH', 西安: 'SIA', 南京: 'NKG', 武汉: 'WUH', 长沙: 'CSX', 青岛: 'TAO',
  厦门: 'XMN', 昆明: 'KMG', 三亚: 'SYX', 海口: 'HAK', 大连: 'DLC', 沈阳: 'SHE',
  哈尔滨: 'HRB', 长春: 'CGQ', 天津: 'TSN', 济南: 'TNA', 郑州: 'CGO', 合肥: 'HFE',
  南昌: 'KHN', 福州: 'FOC', 贵阳: 'KWE', 南宁: 'NNG', 太原: 'TYN', 银川: 'INC',
  乌鲁木齐: 'URC', 拉萨: 'LXA', 兰州: 'LHW', 西宁: 'XNN', 呼和浩特: 'HET',
  香港: 'HKG', 澳门: 'MFM', 台北: 'TPE', 高雄: 'KHH',
  丽江: 'LJG', 大理: 'DLU', 桂林: 'KWL', 张家界: 'DYG', 九寨沟: 'JZH',
  敦煌: 'DNH', 喀什: 'KHG', 吐鲁番: 'TLQ', 伊宁: 'YIN', 库尔勒: 'KRL',
  珠海: 'ZUH', 烟台: 'YNT', 威海: 'WEH', 宁波: 'NGB', 温州: 'WNZ',
  无锡: 'WUX', 徐州: 'XUZ', 常州: 'CZX', 南通: 'NTG', 盐城: 'YNZ', 扬州: 'YTY',
  连云港: 'LYG', 淮安: 'HIA', 丹东: 'DDG', 锦州: 'JNZ', 延吉: 'YNJ',
  佳木斯: 'JMU', 牡丹江: 'MDG', 黑河: 'HEK', 齐齐哈尔: 'NDG',
  鄂尔多斯: 'DSN', 包头: 'BAV', 赤峰: 'CIF', 通辽: 'TGO', 海拉尔: 'HLD',
  义乌: 'YIW', 舟山: 'HSN', 衢州: 'JUZ', 黄山: 'TXN', 阜阳: 'FUG',
  洛阳: 'LYA', 南阳: 'NNY', 信阳: 'XAI', 宜昌: 'YIH', 襄阳: 'XFN',
  恩施: 'ENH', 常德: 'CGD', 怀化: 'HJJ', 张家口: 'ZQZ', 石家庄: 'SJW',
  邯郸: 'HDG', 秦皇岛: 'SHP', 承德: 'CDE', 运城: 'YCU', 晋城: 'JCE',
  吉林: 'JIL', 通化: 'TNH', 丽水: 'LIS',
  湛江: 'ZHA', 汕头: 'SWA', 揭阳: 'SWA', 梅州: 'MXZ',
  北海: 'BHY', 柳州: 'LZH', 百色: 'AEB', 贺州: 'HZH',
  泸州: 'LZO', 绵阳: 'MIG', 宜宾: 'YBP', 南充: 'NAO', 西昌: 'XIC',
  康定: 'KGT', 稻城亚丁: 'DCY', 稻城: 'DCY', 亚丁: 'DCY',
  遵义: 'ZYI', 安顺: 'AVA', 荔波: 'LLB', 铜仁: 'TEN',
  丽江古城: 'LJG', 腾冲: 'TCZ', 芒市: 'LUM', 德宏: 'LUM', 香格里拉: 'DIG',
  日喀则: 'RKZ', 林芝: 'LZY', 阿里: 'NGQ',
  嘉峪关: 'JGN', 张掖: 'YZY', 金昌: 'JIC', 天水: 'THQ',
  格尔木: 'GOQ', 玉树: 'YUS',
  固原: 'GYU', 中卫: 'ZHY',
  那拉提: 'NLT', 阿勒泰: 'AAT', 博乐: 'BPL', 和田: 'HTN', 阿克苏: 'AKU',
  克拉玛依: 'KRY', 伊春: 'LDS',
  鸡西: 'JXA', 漠河: 'OHE',
  银杏: 'JUH', 井冈山: 'JGS', 景德镇: 'JDZ', 赣州: 'KOW',
  龙岩: 'LCX', 武夷山: 'WUS',
  阿尔山: 'YIE', 二连浩特: 'ERL',
  大同: 'DAT', 长治: 'CIH', 吕梁: 'LLV',
  宜春: 'YIC', 九江: 'JIU',
  日照: 'RIZ', 临沂: 'LYI',
  迪庆: 'DIG', 普洱: 'SYM', 西双版纳: 'JHG', 版纳: 'JHG',
};

/** Map of common airport names (without city prefix) to city names. */
const AIRPORT_TO_CITY: Record<string, string> = {
  首都: '北京', 大兴: '北京',
  虹桥: '上海', 浦东: '上海',
  白云: '广州',
  宝安: '深圳',
  双流: '成都', 天府: '成都',
  江北: '重庆',
  萧山: '杭州',
  咸阳: '西安',
  禄口: '南京',
  天河: '武汉',
  长水: '昆明',
  凤凰: '三亚',
  周水子: '大连',
  桃仙: '沈阳',
  黄花: '长沙',
  流亭: '青岛', 胶东: '青岛',
  高崎: '厦门',
  滨海: '天津',
  遥墙: '济南',
  新郑: '郑州',
  新桥: '合肥',
  长乐: '福州',
  龙洞堡: '贵阳',
  吴圩: '南宁',
  河东: '海口',
  武宿: '太原',
  河套: '呼和浩特',
  地窝堡: '乌鲁木齐',
  贡嘎: '拉萨',
  中川: '兰州',
  曹家堡: '西宁',
};

function normalizeCityForCode(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/\s+/g, '');
  const airportMatch = s.match(/^(.+?)(国际机场|飞机场|机场)$/);
  if (airportMatch) {
    const prefix = airportMatch[1];
    if (AIRPORT_TO_CITY[prefix]) return AIRPORT_TO_CITY[prefix];
    s = prefix;
  }
  s = s.replace(/[省市区县]$/, '');
  return s;
}

export function findCityCode(city: string): string | undefined {
  if (!city) return undefined;
  const cleaned = normalizeCityForCode(city);
  if (CITY_CODES[cleaned]) return CITY_CODES[cleaned];
  for (const name of Object.keys(CITY_CODES)) {
    if (cleaned.includes(name) || name.includes(cleaned)) {
      return CITY_CODES[name];
    }
  }
  return undefined;
}

/** Extract a clean city name for display/search (strip airport suffix, 市/省). */
export function extractCityName(raw: string): string {
  if (!raw) return '';
  let s = raw.trim().replace(/\s+/g, '');
  const airportMatch = s.match(/^(.+?)(国际机场|飞机场|机场)$/);
  if (airportMatch) {
    const prefix = airportMatch[1];
    if (AIRPORT_TO_CITY[prefix]) return AIRPORT_TO_CITY[prefix];
    for (const city of Object.values(AIRPORT_TO_CITY)) {
      if (prefix.startsWith(city)) return city;
    }
    for (const city of Object.keys(CITY_CODES)) {
      if (prefix.startsWith(city)) return city;
    }
    s = prefix;
  }
  s = s.replace(/[省市区县]$/, '');
  return s;
}

/**
 * Build a Ctrip flight search URL.
 * Uses mobile domestic search if both cities have IATA codes, otherwise falls
 * back to the Ctrip flights homepage.
 */
export function buildCtripFlightUrl(from: string, to: string, date?: string): string {
  const fromCode = findCityCode(from);
  const toCode = findCityCode(to);
  if (fromCode && toCode) {
    const params = new URLSearchParams();
    params.set('dcity', fromCode.toLowerCase());
    params.set('acity', toCode.toLowerCase());
    if (date) params.set('date', date);
    params.set('flighttype', 'OW');
    return `https://m.ctrip.com/webapp/flight/swift/domestic?${params.toString()}`;
  }
  return 'https://flights.ctrip.com/';
}

/**
 * Build a Qunar flight search URL. Qunar supports Chinese city names directly.
 */
export function buildQunarFlightUrl(from: string, to: string, date?: string): string {
  const fromName = extractCityName(from);
  const toName = extractCityName(to);
  if (!fromName || !toName) {
    return 'https://flight.qunar.com/';
  }
  const params = new URLSearchParams();
  params.set('dep', fromName);
  params.set('arr', toName);
  if (date) params.set('date', date);
  return `https://m.flight.qunar.com/touch/schedule.html?${params.toString()}`;
}
