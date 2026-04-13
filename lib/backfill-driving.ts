import { getDrivingRoutesFromNames } from './amap-driving';

interface TransportInfo {
  fromStation?: string;
  toStation?: string;
  distance?: string;
  duration?: string;
  priceNote?: string;
  [key: string]: unknown;
}

interface Activity {
  time?: string;
  activity?: string;
  location?: string;
  duration?: string;
  cost?: number;
  notes?: string;
  transportInfo?: TransportInfo;
  foodRecommendation?: Record<string, unknown>;
  [key: string]: unknown;
}

const FUEL_COST_PER_KM = 0.6;

function parseHours(duration: string | undefined): number {
  if (!duration) return 0;
  const hMatch = duration.match(/(\d+)\s*小时/);
  const mMatch = duration.match(/(\d+)\s*分/);
  return (hMatch ? parseInt(hMatch[1]) : 0) + (mMatch ? parseInt(mMatch[1]) / 60 : 0);
}

function parseTime(time: string | undefined): number | null {
  const m = time?.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isDriveActivity(act: Activity): boolean {
  const text = `${act.activity || ''} ${act.notes || ''}`;
  return /自驾|驾车|开车|高速|出发前往/.test(text);
}

function hasLunch(activities: Activity[]): boolean {
  return activities.some((act) => {
    const text = `${act.activity || ''}`;
    const isFood = /午餐|午饭|中餐/.test(text);
    if (!isFood) return false;
    const t = parseTime(act.time);
    if (t === null) return true;
    return t >= 11 * 60 && t <= 14 * 60;
  });
}

function ensureLunchOnDrivingDays(plans: any[]) {
  for (const plan of plans) {
    const itinerary = plan?.itinerary;
    if (!Array.isArray(itinerary)) continue;

    for (const day of itinerary) {
      const activities: Activity[] = day?.activities;
      if (!Array.isArray(activities)) continue;
      if (hasLunch(activities)) continue;

      const driveIdx = activities.findIndex(
        (act) => isDriveActivity(act) && parseHours(act.duration) >= 2,
      );
      if (driveIdx === -1) continue;

      const driveAct = activities[driveIdx];
      const from = driveAct.transportInfo?.fromStation || '';
      const to = driveAct.transportInfo?.toStation || '';
      const driveStart = parseTime(driveAct.time);
      const driveHours = parseHours(driveAct.duration);

      let lunchMins: number;
      if (driveStart !== null) {
        const halfwayMins = driveStart + Math.floor(Math.min(3, driveHours / 2) * 60);
        lunchMins = Math.max(11 * 60 + 30, Math.min(13 * 60 + 30, halfwayMins));
      } else {
        lunchMins = 12 * 60;
      }

      const lunchAct: Activity = {
        time: formatTime(lunchMins),
        activity: '途中午餐',
        location: `${from}至${to}沿途城镇`,
        duration: '约1小时',
        cost: 80,
        notes: '在途经城镇找一家当地特色餐厅用餐，休息后继续出发',
        foodRecommendation: {
          shopName: '沿途当地餐厅',
          rating: 4.5,
          specialty: '当地特色菜',
          reason: '长途驾车中途休息用餐',
        },
      };

      activities.splice(driveIdx + 1, 0, lunchAct);

      for (let i = driveIdx + 2; i < activities.length; i++) {
        const actTime = parseTime(activities[i].time);
        if (actTime !== null && actTime <= lunchMins + 60) {
          activities[i].time = formatTime(lunchMins + 60 + (i - driveIdx - 2) * 90);
        }
      }
    }
  }
}

export async function backfillDrivingData(result: Record<string, unknown>) {
  const plans = (result as any)?.plans;
  if (!Array.isArray(plans)) return;

  const cache = new Map<string, { distance: string; duration: string; priceNote: string }>();

  for (const plan of plans) {
    const itinerary = plan?.itinerary;
    if (!Array.isArray(itinerary)) continue;

    for (const day of itinerary) {
      const activities: Activity[] = day?.activities;
      if (!Array.isArray(activities)) continue;

      for (const act of activities) {
        const actText = `${act.activity || ''} ${act.notes || ''}`;
        const locText = act.location || '';
        const isDrive = /自驾|驾车|开车|前往/.test(actText);

        if (!act.transportInfo && isDrive) {
          const m = locText.match(/(.+?)\s*[→➜➡\-至到]\s*(.+)/);
          if (m) {
            act.transportInfo = { fromStation: m[1].trim(), toStation: m[2].trim() };
          }
        }

        const ti = act.transportInfo;
        if (!ti?.fromStation || !ti?.toStation) continue;
        if (ti.fromStation === ti.toStation) continue;

        if (!isDrive && !ti.distance) continue;

        const key = `${ti.fromStation}→${ti.toStation}`;
        let data = cache.get(key);

        if (!data) {
          try {
            const results = await getDrivingRoutesFromNames(
              [ti.fromStation, ti.toStation],
              [0],
            );
            const route = results[0]?.routes[0];
            if (route && route.distance > 0) {
              const km = Math.round(route.distance / 1000);
              const hours = Math.floor(route.duration / 3600);
              const mins = Math.floor((route.duration % 3600) / 60);
              const timeStr =
                hours > 0
                  ? `约${hours}小时${mins > 0 ? `${mins}分` : ''}`
                  : `约${mins}分钟`;
              const fuelCost = Math.round(km * FUEL_COST_PER_KM);
              const totalCost = route.tolls + fuelCost;
              const priceNote =
                route.tolls > 0
                  ? `油费约${fuelCost}元 + 过路费${Math.round(route.tolls)}元，合计约${Math.round(totalCost)}元`
                  : `油费预估${fuelCost}元`;

              data = { distance: `约${km}公里`, duration: timeStr, priceNote };
              cache.set(key, data);
            }
          } catch (e) {
            console.error('[backfill-driving] error for', key, e);
          }
        }

        if (data) {
          ti.distance = data.distance;
          ti.duration = data.duration;
          ti.priceNote = data.priceNote;
          act.duration = data.duration;
        }
      }
    }
  }

  ensureLunchOnDrivingDays(plans);
}
