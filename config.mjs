import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = dirname(fileURLToPath(import.meta.url));

function defaultConfigFilePath() {
  const localFile = join(PLUGIN_ROOT, 'companion-settings.json');
  if (existsSync(localFile)) return localFile;
  const dshHome = process.env.DSH_HOME?.trim()
    ? resolve(process.env.DSH_HOME.trim())
    : join(homedir(), '.dsh');
  return join(dshHome, 'integrations', 'dsh-im-companion', 'companion-settings.json');
}

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  configFile: null,
  multiBubble: Object.freeze({
    enabled: true,
    maxBubblesPerTurn: 3,
    maxTextLength: 500,
    channels: null, // null = all supported channels
  }),
  typingDelay: Object.freeze({
    enabled: true,
    baseDelayMs: 450,
    msPerChar: 65,
    minDelayMs: 600,
    maxDelayMs: 2200,
    jitterRatio: 0.15,
    rateLimitFloorMs: 250,
  }),
  sticker: Object.freeze({
    enabled: true,
    dirName: '表情',
  }),
  proactiveGuard: Object.freeze({
    enabled: true,
    maxUnreplied: 3,
    cooldownMinutes: 180, // 3 hours
    jitterMinutes: 15,
    quietHoursEnabled: true,
    quietStart: '02:30',
    quietEnd: '11:30',
  }),
  fallbackTarget: Object.freeze({
    enabled: true,
    preferredChannel: 'qq',
    preferredTargetId: '',
  }),
  fileGuard: Object.freeze({
    enabled: true,
    workspaceDirs: [],
    protectedFiles: ['AGENTS.md', '关于他.md'],
  }),
  keepAwake: Object.freeze({
    enabled: false,
    preventDisplaySleep: false,
  }),
  importantDates: Object.freeze({
    enabled: true,
    fileName: '重要日子.md',
    windowDays: 30,
  }),
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function numOr(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function timeStrOr(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
}

function mergeSection(base, override) {
  if (!isRecord(override)) return { ...base };
  return { ...base, ...override };
}

export function normalizeConfig(raw = {}) {
  const src = isRecord(raw) ? raw : {};
  const mb = mergeSection(DEFAULT_CONFIG.multiBubble, src.multiBubble);
  const td = mergeSection(DEFAULT_CONFIG.typingDelay, src.typingDelay);
  const st = mergeSection(DEFAULT_CONFIG.sticker, src.sticker);
  const pg = mergeSection(DEFAULT_CONFIG.proactiveGuard, src.proactiveGuard);
  const ft = mergeSection(DEFAULT_CONFIG.fallbackTarget, src.fallbackTarget);
  const fg = mergeSection(DEFAULT_CONFIG.fileGuard, src.fileGuard);
  const ka = mergeSection(DEFAULT_CONFIG.keepAwake, src.keepAwake);
  const idates = mergeSection(DEFAULT_CONFIG.importantDates, src.importantDates);

  const channels = Array.isArray(mb.channels)
    ? mb.channels.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
    : null;

  const minDelayMs = numOr(td.minDelayMs, DEFAULT_CONFIG.typingDelay.minDelayMs, { min: 0, max: 30_000 });
  const maxDelayMs = numOr(td.maxDelayMs, DEFAULT_CONFIG.typingDelay.maxDelayMs, { min: minDelayMs, max: 60_000 });

  const workspaceDirs = Array.isArray(fg.workspaceDirs)
    ? fg.workspaceDirs.map((d) => String(d ?? '').trim()).filter(Boolean)
    : [...DEFAULT_CONFIG.fileGuard.workspaceDirs];
  const protectedFiles = Array.isArray(fg.protectedFiles)
    ? fg.protectedFiles.map((f) => String(f ?? '').trim()).filter(Boolean)
    : [...DEFAULT_CONFIG.fileGuard.protectedFiles];

  const resolvedConfigFile = src.configFile === false
    ? null
    : (typeof src.configFile === 'string' && src.configFile.trim()
      ? src.configFile.trim()
      : defaultConfigFilePath());

  return {
    enabled: boolOr(src.enabled, DEFAULT_CONFIG.enabled),
    configFile: resolvedConfigFile,
    multiBubble: {
      enabled: boolOr(mb.enabled, DEFAULT_CONFIG.multiBubble.enabled),
      maxBubblesPerTurn: Math.floor(numOr(mb.maxBubblesPerTurn, DEFAULT_CONFIG.multiBubble.maxBubblesPerTurn, { min: 1, max: 10 })),
      maxTextLength: Math.floor(numOr(mb.maxTextLength, DEFAULT_CONFIG.multiBubble.maxTextLength, { min: 20, max: 4000 })),
      channels,
    },
    typingDelay: {
      enabled: boolOr(td.enabled, DEFAULT_CONFIG.typingDelay.enabled),
      baseDelayMs: numOr(td.baseDelayMs, DEFAULT_CONFIG.typingDelay.baseDelayMs, { min: 0, max: 15_000 }),
      msPerChar: numOr(td.msPerChar, DEFAULT_CONFIG.typingDelay.msPerChar, { min: 0, max: 1000 }),
      minDelayMs,
      maxDelayMs,
      jitterRatio: numOr(td.jitterRatio, DEFAULT_CONFIG.typingDelay.jitterRatio, { min: 0, max: 0.5 }),
      rateLimitFloorMs: numOr(td.rateLimitFloorMs, DEFAULT_CONFIG.typingDelay.rateLimitFloorMs, { min: 0, max: 5000 }),
    },
    sticker: {
      enabled: boolOr(st.enabled, DEFAULT_CONFIG.sticker.enabled),
      dirName: typeof st.dirName === 'string' && st.dirName.trim() ? st.dirName.trim() : DEFAULT_CONFIG.sticker.dirName,
    },
    proactiveGuard: {
      enabled: boolOr(pg.enabled, DEFAULT_CONFIG.proactiveGuard.enabled),
      maxUnreplied: Math.floor(numOr(pg.maxUnreplied, DEFAULT_CONFIG.proactiveGuard.maxUnreplied, { min: 1, max: 20 })),
      cooldownMinutes: Math.floor(numOr(pg.cooldownMinutes, DEFAULT_CONFIG.proactiveGuard.cooldownMinutes, { min: 5, max: 1440 })),
      jitterMinutes: Math.floor(numOr(pg.jitterMinutes, DEFAULT_CONFIG.proactiveGuard.jitterMinutes, { min: 0, max: 120 })),
      quietHoursEnabled: boolOr(pg.quietHoursEnabled, DEFAULT_CONFIG.proactiveGuard.quietHoursEnabled),
      quietStart: timeStrOr(pg.quietStart, DEFAULT_CONFIG.proactiveGuard.quietStart),
      quietEnd: timeStrOr(pg.quietEnd, DEFAULT_CONFIG.proactiveGuard.quietEnd),
    },
    fallbackTarget: {
      enabled: boolOr(ft.enabled, DEFAULT_CONFIG.fallbackTarget.enabled),
      preferredChannel: typeof ft.preferredChannel === 'string' && ft.preferredChannel.trim()
        ? ft.preferredChannel.trim().toLowerCase()
        : DEFAULT_CONFIG.fallbackTarget.preferredChannel,
      preferredTargetId: typeof ft.preferredTargetId === 'string' ? ft.preferredTargetId.trim() : '',
    },
    fileGuard: {
      enabled: boolOr(fg.enabled, DEFAULT_CONFIG.fileGuard.enabled),
      workspaceDirs,
      protectedFiles,
    },
    keepAwake: {
      enabled: boolOr(ka.enabled, DEFAULT_CONFIG.keepAwake.enabled),
      preventDisplaySleep: boolOr(ka.preventDisplaySleep, DEFAULT_CONFIG.keepAwake.preventDisplaySleep),
    },
    importantDates: {
      enabled: boolOr(idates.enabled, DEFAULT_CONFIG.importantDates.enabled),
      fileName: typeof idates.fileName === 'string' && idates.fileName.trim()
        ? idates.fileName.trim()
        : DEFAULT_CONFIG.importantDates.fileName,
      windowDays: Math.floor(numOr(idates.windowDays, DEFAULT_CONFIG.importantDates.windowDays, { min: 1, max: 120 })),
    },
  };
}

export function resolveLiveConfig(baseConfig) {
  if (!baseConfig?.configFile) return baseConfig;
  try {
    const raw = JSON.parse(readFileSync(baseConfig.configFile, 'utf8'));
    if (!isRecord(raw)) return baseConfig;
    return normalizeConfig({
      ...baseConfig,
      ...raw,
      multiBubble: mergeSection(baseConfig.multiBubble, raw.multiBubble),
      typingDelay: mergeSection(baseConfig.typingDelay, raw.typingDelay),
      sticker: mergeSection(baseConfig.sticker, raw.sticker),
      proactiveGuard: mergeSection(baseConfig.proactiveGuard, raw.proactiveGuard),
      fallbackTarget: mergeSection(baseConfig.fallbackTarget, raw.fallbackTarget),
      fileGuard: mergeSection(baseConfig.fileGuard, raw.fileGuard),
      keepAwake: mergeSection(baseConfig.keepAwake, raw.keepAwake),
      importantDates: mergeSection(baseConfig.importantDates, raw.importantDates),
      configFile: baseConfig.configFile,
    });
  } catch {
    return baseConfig;
  }
}

export function computeTypingDelayMs(text, typingConfig, random = Math.random) {
  if (!typingConfig?.enabled) {
    return typingConfig?.rateLimitFloorMs ?? 0;
  }
  const len = [...String(text ?? '')].length;
  const raw = typingConfig.baseDelayMs + len * typingConfig.msPerChar;
  const clamped = Math.min(typingConfig.maxDelayMs, Math.max(typingConfig.minDelayMs, raw));
  const ratio = typingConfig.jitterRatio ?? 0;
  if (ratio <= 0) return Math.round(clamped);
  const factor = 1 + (random() * 2 - 1) * ratio;
  return Math.max(0, Math.round(clamped * factor));
}

export function parseHhMmToMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function beijingDateParts(ts) {
  const d = new Date(ts);
  const utc8 = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60_000);
  const hours = utc8.getHours();
  const minutes = utc8.getMinutes();
  return {
    utc8,
    hours,
    minutes,
    minuteOfDay: hours * 60 + minutes,
    formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

export function isInQuietHours(ts, guardConfig) {
  if (!guardConfig?.quietHoursEnabled) return false;
  const startMin = parseHhMmToMinutes(guardConfig.quietStart ?? '02:30');
  const endMin = parseHhMmToMinutes(guardConfig.quietEnd ?? '11:30');
  if (startMin === null || endMin === null || startMin === endMin) return false;
  const { minuteOfDay } = beijingDateParts(ts);
  if (startMin < endMin) {
    return minuteOfDay >= startMin && minuteOfDay < endMin;
  }
  return minuteOfDay >= startMin || minuteOfDay < endMin;
}

export function computeNextProactiveTimestamp(nowTs, guardConfig, random = Math.random) {
  const cooldownMin = guardConfig?.cooldownMinutes ?? 180;
  const jitterSpan = guardConfig?.jitterMinutes ?? 15;
  const jitterOffsetMin = Math.round((random() * 2 - 1) * jitterSpan);
  let targetTs = nowTs + Math.max(5, cooldownMin + jitterOffsetMin) * 60_000;

  if (!isInQuietHours(targetTs, guardConfig)) {
    return targetTs;
  }

  const endMin = parseHhMmToMinutes(guardConfig.quietEnd ?? '11:30') ?? (11 * 60 + 30);
  const { minuteOfDay } = beijingDateParts(targetTs);
  let deltaMinutes = endMin - minuteOfDay;
  if (deltaMinutes <= 0) {
    deltaMinutes += 24 * 60;
  }
  const wakeUpBufferMin = 10 + Math.round(random() * 25);
  targetTs += (deltaMinutes + wakeUpBufferMin) * 60_000;
  return targetTs;
}
