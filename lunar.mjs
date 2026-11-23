import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHINA_TZ = 'Asia/Shanghai';

const LUNAR_FMT = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: CHINA_TZ,
});

const MONTH_NAME_TO_NUM = new Map([
  ['正月', 1], ['一月', 1], ['1月', 1],
  ['二月', 2], ['2月', 2],
  ['三月', 3], ['3月', 3],
  ['四月', 4], ['4月', 4],
  ['五月', 5], ['5月', 5],
  ['六月', 6], ['6月', 6],
  ['七月', 7], ['7月', 7],
  ['八月', 8], ['8月', 8],
  ['九月', 9], ['9月', 9],
  ['十月', 10], ['10月', 10],
  ['冬月', 11], ['十一月', 11], ['11月', 11],
  ['腊月', 12], ['十二月', 12], ['12月', 12],
]);

const MONTH_NUM_TO_LABEL = [
  '', '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];

const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function toBeijingDateParts(ts = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHINA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(new Date(ts)).split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function formatIsoDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function diffDaysIso(fromIso, toIso) {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function getChineseLunarParts(isoDate) {
  const dt = new Date(`${isoDate}T12:00:00+08:00`);
  const parts = LUNAR_FMT.formatToParts(dt);
  let relatedYear = 0;
  let monthRaw = '';
  let day = 0;
  for (const p of parts) {
    if (p.type === 'relatedYear') relatedYear = Number(p.value);
    else if (p.type === 'month') monthRaw = p.value;
    else if (p.type === 'day') day = Number(p.value);
  }
  const isLeap = monthRaw.startsWith('闰');
  const cleanMonth = isLeap ? monthRaw.slice(1) : monthRaw;
  const month = MONTH_NAME_TO_NUM.get(cleanMonth) || Number.parseInt(cleanMonth, 10) || 0;
  return { relatedYear, month, day, isLeap, monthRaw };
}

export function formatLunarDay(day) {
  const n = Number(day);
  if (n <= 10) return `初${['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n]}`;
  if (n < 20) return `十${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][n - 10]}`;
  if (n === 20) return '二十';
  if (n < 30) return `廿${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][n - 20]}`;
  if (n === 30) return '三十';
  return String(n);
}

export function formatLunarLabel({ month, day, isLeap }) {
  const mLabel = MONTH_NUM_TO_LABEL[month] || `${month}月`;
  return `${isLeap ? '闰' : ''}${mLabel}${formatLunarDay(day)}`;
}

function parseChineseDay(text) {
  const s = String(text || '').trim().replace(/日|号$/g, '');
  if (/^\d{1,2}$/.test(s)) return Number(s);
  if (s === '初十') return 10;
  if (s === '二十' || s === '廿') return 20;
  if (s === '三十' || s === '卅') return 30;
  if (s.startsWith('初') && s.length === 2 && CN_DIGIT[s[1]] !== undefined) return CN_DIGIT[s[1]];
  if (s.startsWith('十') && s.length === 2 && CN_DIGIT[s[1]] !== undefined) return 10 + CN_DIGIT[s[1]];
  if ((s.startsWith('廿') || s.startsWith('二十')) && CN_DIGIT[s[s.length - 1]] !== undefined) {
    return 20 + CN_DIGIT[s[s.length - 1]];
  }
  return null;
}

export function parseLunarDateSpec(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const numMatch = text.match(/^(闰)?(\d{1,2})[-/.](\d{1,2})$/);
  if (numMatch) {
    const isLeap = Boolean(numMatch[1]);
    const month = Number(numMatch[2]);
    const day = Number(numMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 30) {
      return { month, day, isLeap };
    }
    return null;
  }

  const cnMatch = text.match(/^(闰)?(正月|冬月|腊月|十一月|十二月|[一二三四五六七八九十\d]{1,2}月)(.+)$/);
  if (!cnMatch) return null;
  const isLeap = Boolean(cnMatch[1]);
  const month = MONTH_NAME_TO_NUM.get(cnMatch[2]);
  const day = parseChineseDay(cnMatch[3]);
  if (!month || !day || day < 1 || day > 30) return null;
  return { month, day, isLeap };
}

export function resolveNextLunarOccurrence(spec, todayIso) {
  let fallbackNormalMatch = null;

  for (let offset = 0; offset <= 400; offset += 1) {
    const candidateIso = addDaysIso(todayIso, offset);
    const cur = getChineseLunarParts(candidateIso);

    if (cur.month === spec.month && cur.isLeap === spec.isLeap) {
      if (cur.day === spec.day) {
        return { dateIso: candidateIso, daysUntil: offset, note: '' };
      }
      if (spec.day === 30 && cur.day === 29) {
        const next = getChineseLunarParts(addDaysIso(candidateIso, 1));
        if (!(next.month === cur.month && next.isLeap === cur.isLeap && next.day === 30)) {
          return {
            dateIso: candidateIso,
            daysUntil: offset,
            note: '今年该月小建（29天），按廿九/除夕提醒',
          };
        }
      }
    }

    if (spec.isLeap && !fallbackNormalMatch && cur.month === spec.month && !cur.isLeap) {
      if (cur.day === spec.day) {
        fallbackNormalMatch = {
          dateIso: candidateIso,
          daysUntil: offset,
          note: `未来一年无闰${MONTH_NUM_TO_LABEL[spec.month]}，按${formatLunarLabel({ ...spec, isLeap: false })}计`,
        };
      } else if (spec.day === 30 && cur.day === 29) {
        const next = getChineseLunarParts(addDaysIso(candidateIso, 1));
        if (!(next.month === cur.month && !next.isLeap && next.day === 30)) {
          fallbackNormalMatch = {
            dateIso: candidateIso,
            daysUntil: offset,
            note: `未来一年无闰${MONTH_NUM_TO_LABEL[spec.month]}且小建，按廿九计`,
          };
        }
      }
    }
  }

  return fallbackNormalMatch;
}

export function resolveNextSolarOccurrence(raw, todayIso) {
  const text = String(raw || '').trim();
  const fullMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (fullMatch) {
    const iso = formatIsoDate({
      year: Number(fullMatch[1]),
      month: Number(fullMatch[2]),
      day: Number(fullMatch[3]),
    });
    const daysUntil = diffDaysIso(todayIso, iso);
    if (daysUntil < 0) return null;
    return { dateIso: iso, daysUntil, note: '', recurring: false };
  }

  const mdMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (!mdMatch) return null;
  const month = Number(mdMatch[1]);
  const day = Number(mdMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const todayYear = Number(todayIso.slice(0, 4));
  for (let y = todayYear; y <= todayYear + 4; y += 1) {
    const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const effDay = month === 2 && day === 29 && !isLeapYear ? 28 : day;
    const dt = new Date(Date.UTC(y, month - 1, effDay));
    if (dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== effDay) continue;
    const iso = formatIsoDate({ year: y, month, day: effDay });
    const daysUntil = diffDaysIso(todayIso, iso);
    if (daysUntil >= 0) {
      return {
        dateIso: iso,
        daysUntil,
        note: month === 2 && day === 29 && !isLeapYear ? '平年按 02-28 提醒' : '',
        recurring: true,
      };
    }
  }
  return null;
}

function parseLeadDays(raw) {
  const nums = String(raw || '')
    .split(/[,，、\s/]+/)
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);
  return nums.length ? [...new Set(nums)].sort((a, b) => b - a) : [7, 3, 1, 0];
}

export function parseImportantDatesMarkdown(markdown) {
  const entries = [];
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    const [name, calendarRaw, dateRaw, leadRaw = '', remark = ''] = cells;
    if (!name || name === '名称' || /^[-:\s]+$/.test(name)) continue;
    if (/^[（(]?示例[）)]?/.test(name) || /示例行/.test(remark)) continue;

    const calendar = /农|阴|lunar/i.test(calendarRaw) ? 'lunar' : 'solar';
    entries.push({
      name,
      calendar,
      dateRaw,
      leadDays: parseLeadDays(leadRaw),
      remark,
    });
  }
  return entries;
}

export function computeUpcomingImportantDates(entries, todayIso, windowDays = 30) {
  const resolved = [];
  for (const entry of entries) {
    let next = null;
    if (entry.calendar === 'lunar') {
      const spec = parseLunarDateSpec(entry.dateRaw);
      if (!spec) continue;
      next = resolveNextLunarOccurrence(spec, todayIso);
    } else {
      next = resolveNextSolarOccurrence(entry.dateRaw, todayIso);
    }
    if (!next) continue;
    if (next.daysUntil <= windowDays) {
      const maxLead = Math.max(...entry.leadDays, 0);
      resolved.push({
        ...entry,
        nextDateIso: next.dateIso,
        daysUntil: next.daysUntil,
        calendarNote: next.note || '',
        inAlertWindow: next.daysUntil <= maxLead,
        exactAlertDay: entry.leadDays.includes(next.daysUntil),
      });
    }
  }
  resolved.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, 'zh-CN'));
  return resolved;
}

export function scanImportantDates(workspaceDir, cfg = {}, nowTs = Date.now()) {
  const todayIso = formatIsoDate(toBeijingDateParts(nowTs));
  const todayLunarLabel = formatLunarLabel(getChineseLunarParts(todayIso));
  const fileName = cfg?.fileName || '重要日子.md';
  const windowDays = cfg?.windowDays ?? 30;

  if (!workspaceDir) {
    return { fileFound: false, fileName, todayIso, todayLunarLabel, upcoming: [], alertItems: [] };
  }
  const filePath = join(workspaceDir, fileName);
  if (!existsSync(filePath)) {
    return { fileFound: false, fileName, todayIso, todayLunarLabel, upcoming: [], alertItems: [] };
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    const entries = parseImportantDatesMarkdown(content);
    const upcoming = computeUpcomingImportantDates(entries, todayIso, windowDays);
    const alertItems = upcoming.filter((item) => item.inAlertWindow);
    return { fileFound: true, fileName, todayIso, todayLunarLabel, upcoming, alertItems };
  } catch {
    return { fileFound: false, fileName, todayIso, todayLunarLabel, upcoming: [], alertItems: [] };
  }
}
