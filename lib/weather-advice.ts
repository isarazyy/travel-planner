import type { WeatherDayPayload } from '@/lib/weather';

export function getDressAndUmbrellaAdvice(days: WeatherDayPayload[]): string {
  if (!days.length) return '';
  const minTemp = Math.min(...days.map((d) => d.tempMin));
  const maxTemp = Math.max(...days.map((d) => d.tempMax));
  const maxPrecip = Math.max(...days.map((d) => d.precipProb));

  let dress = '建议短袖+轻薄外套，早晚注意增减。';
  if (maxTemp <= 10) dress = '建议厚外套/薄羽绒，注意保暖。';
  else if (maxTemp <= 18) dress = '建议长袖+外套。';
  else if (maxTemp >= 30) dress = '建议速干短袖、注意防晒补水。';

  const umbrella =
    maxPrecip >= 60
      ? '建议随身带伞或轻便雨衣。'
      : maxPrecip >= 35
        ? '建议备折叠伞。'
        : '一般可不带伞，出门前看临近预报。';

  return `体感约 ${minTemp}~${maxTemp}℃，${dress}${umbrella}`;
}
