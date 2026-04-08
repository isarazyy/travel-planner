/** 从高德 formatted_address 提取省级/直辖市提示，用于后续地理编码限定区域 */

export function extractRegionHintFromFormatted(formatted: string | null | undefined): string | undefined {
  if (!formatted) return undefined;
  const s = formatted.trim();
  const m =
    s.match(/^(.{2,8}省)/) ||
    s.match(/^(.{2,12}自治区)/) ||
    s.match(/^(.{2,12}自治州)/) ||
    s.match(/^(北京市|天津市|上海市|重庆市)/);
  return m?.[1];
}

/** 缩短地名单独检索时易被误配到同名乡镇，补全常用行政区划关键词 */
export function enrichPlaceQueryForGeocode(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  if (/[省市县区旗盟]/.test(t)) return t;

  const exact: Record<string, string> = {
    婺源: '婺源县',
    景德镇: '景德镇市',
    庐山: '庐山市',
    黄山: '黄山市',
    宏村: '宏村黄山市',
  };
  if (exact[t]) return exact[t];

  if (t.length <= 3 && !/[省市县区旗盟]/.test(t)) {
    return `${t}市`;
  }
  return t;
}
