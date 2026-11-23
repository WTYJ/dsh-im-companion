import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import {
  beijingDateParts,
  computeNextProactiveTimestamp,
  computePreReplyPauseMs,
  computeTailPauseMs,
  computeTypingDelayMs,
  isInQuietHours,
  normalizeConfig,
  resolveLiveConfig,
} from './config.mjs';
import { draftTargetFromConversation } from './route.mjs';
import { createKeepAwakeManager } from './keep-awake.mjs';
import { scanImportantDates } from './lunar.mjs';

export const name = 'dsh-im-companion';
export const inject = ['webServer'];
export const SETTINGS_ROUTE = '/dsh-im-companion/settings';

const PKG_META = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
    return Object.freeze({
      name: pkg.name || name,
      version: pkg.version || '',
      license: pkg.license || 'MIT',
      homepage: pkg.homepage || 'https://github.com/WTYJ/dsh-im-companion',
    });
  } catch {
    return Object.freeze({
      name,
      version: '',
      license: 'MIT',
      homepage: 'https://github.com/WTYJ/dsh-im-companion',
    });
  }
})();

const STICKER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function sessionIdOf(session) {
  const id = session?.id ?? session?.sessionId ?? session?.header?.id;
  return typeof id === 'string' && id ? id : null;
}

function workspaceOf(agent) {
  const candidates = [
    agent?.workspace,
    agent?.cwd,
    agent?.session?.workspace,
    agent?.session?.cwd,
    agent?.session?.header?.cwd,
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

function snapshotEventsOf(agent) {
  const events = typeof agent?.session?.snapshotEvents === 'function'
    ? agent.session.snapshotEvents()
    : agent?.session?.events;
  return Array.isArray(events) ? events : [];
}

function currentTurnOf(agent) {
  const events = snapshotEventsOf(agent);
  let turn = 0;
  for (const event of events) {
    if (event?.type === 'turn/start' && Number.isInteger(event.data?.turn)) {
      turn = event.data.turn;
    }
  }
  return turn;
}

export function classifyCurrentTurn(agent) {
  const events = snapshotEventsOf(agent);
  if (events.length === 0) return 'user';
  let lastTurnStartIdx = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.type === 'turn/start') {
      lastTurnStartIdx = i;
      break;
    }
  }
  const slice = lastTurnStartIdx >= 0 ? events.slice(lastTurnStartIdx + 1) : events;
  let sawScheduleOrNotice = false;
  let sawRealUser = false;
  for (const ev of slice) {
    if (ev?.type !== 'user/message') continue;
    const src = ev.data?.source;
    if (src?.kind === 'schedule' || src?.form === 'notice') {
      sawScheduleOrNotice = true;
    } else if (src?.kind === 'user' || src === undefined) {
      sawRealUser = true;
    }
  }
  if (sawRealUser) return 'user';
  if (sawScheduleOrNotice) return 'proactive';
  return 'user';
}

function stateFilePathFrom(baseConfig) {
  if (!baseConfig?.configFile) return null;
  return join(dirname(baseConfig.configFile), 'proactive-state.json');
}

export function createProactiveStateTracker({ stateFile = null, nowFn = Date.now } = {}) {
  let state = {
    unrepliedCount: 0,
    lastProactiveAt: null,
    lastUserReplyAt: null,
    lastCountedTurnKey: null,
  };

  if (stateFile) {
    try {
      const loaded = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (loaded && typeof loaded === 'object') {
        state = {
          unrepliedCount: Number.isInteger(loaded.unrepliedCount) && loaded.unrepliedCount >= 0 ? loaded.unrepliedCount : 0,
          lastProactiveAt: Number.isFinite(loaded.lastProactiveAt) ? loaded.lastProactiveAt : null,
          lastUserReplyAt: Number.isFinite(loaded.lastUserReplyAt) ? loaded.lastUserReplyAt : null,
          lastCountedTurnKey: typeof loaded.lastCountedTurnKey === 'string' ? loaded.lastCountedTurnKey : null,
        };
      }
    } catch {
      // start fresh
    }
  }

  const persist = () => {
    if (!stateFile) return;
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // ignore write errors
    }
  };

  return {
    getState() {
      return { ...state };
    },
    reset() {
      state = {
        unrepliedCount: 0,
        lastProactiveAt: null,
        lastUserReplyAt: nowFn(),
        lastCountedTurnKey: null,
      };
      persist();
      return { ...state };
    },
    onUserTurn() {
      if (state.unrepliedCount !== 0) {
        state.unrepliedCount = 0;
        state.lastUserReplyAt = nowFn();
        persist();
      } else {
        state.lastUserReplyAt = nowFn();
      }
    },
    checkOrCommitProactive(turnKey, guardConfig, { commit = false } = {}) {
      if (!guardConfig?.enabled) {
        return { allowed: true, reason: null, state: { ...state } };
      }
      const now = nowFn();
      const alreadyCountedThisTurn = turnKey && state.lastCountedTurnKey === turnKey;

      if (!alreadyCountedThisTurn) {
        if (isInQuietHours(now, guardConfig)) {
          return {
            allowed: false,
            reason: `quiet hours active (${guardConfig.quietStart ?? '02:30'}~${guardConfig.quietEnd ?? '11:30'})`,
            state: { ...state },
          };
        }
        if (state.unrepliedCount >= guardConfig.maxUnreplied) {
          return {
            allowed: false,
            reason: `unreplied limit reached (${state.unrepliedCount}/${guardConfig.maxUnreplied})`,
            state: { ...state },
          };
        }
        const cooldownMs = guardConfig.cooldownMinutes * 60_000;
        if (state.lastProactiveAt !== null && now - state.lastProactiveAt < cooldownMs) {
          const remainMin = Math.ceil((cooldownMs - (now - state.lastProactiveAt)) / 60_000);
          return {
            allowed: false,
            reason: `proactive cooldown active (${remainMin} min remaining)`,
            state: { ...state },
          };
        }
        if (commit) {
          state.unrepliedCount += 1;
          state.lastProactiveAt = now;
          state.lastCountedTurnKey = turnKey || null;
          persist();
        }
      }
      return { allowed: true, reason: null, state: { ...state } };
    },
  };
}

/**
 * Apply or release OS-level read-only file protection on `AGENTS.md` and `关于他.md`.
 */
export function applyFileGuard(fileGuardConfig, extraWorkspaceDir = null) {
  if (!fileGuardConfig) return { lockedCount: 0, unlockedCount: 0 };
  const dirs = new Set([
    ...(Array.isArray(fileGuardConfig.workspaceDirs) ? fileGuardConfig.workspaceDirs : []),
    join(homedir(), '.dsh', 'im'),
    ...(extraWorkspaceDir ? [extraWorkspaceDir] : []),
  ]);
  const files = Array.isArray(fileGuardConfig.protectedFiles)
    ? fileGuardConfig.protectedFiles
    : ['AGENTS.md', '关于他.md'];

  const mode = fileGuardConfig.enabled ? 0o444 : 0o666;
  let count = 0;
  for (const dir of dirs) {
    if (!dir) continue;
    for (const fileName of files) {
      if (!fileName) continue;
      const targetPath = join(dir, fileName);
      try {
        if (existsSync(targetPath) && statSync(targetPath).isFile()) {
          chmodSync(targetPath, mode);
          count += 1;
        }
      } catch {
        // ignore permission errors on non-owned paths
      }
    }
  }
  return fileGuardConfig.enabled
    ? { lockedCount: count, unlockedCount: 0 }
    : { lockedCount: 0, unlockedCount: count };
}

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function scanStickers(workspaceDir, dirName = '表情') {
  if (!workspaceDir) return [];
  const dirPath = join(workspaceDir, dirName);
  try {
    if (!statSync(dirPath).isDirectory()) return [];
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('_')) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!STICKER_EXTENSIONS.has(ext)) continue;
      items.push({
        name: entry.name.slice(0, -ext.length),
        fileName: entry.name,
        relativePath: `${dirName}/${entry.name}`,
      });
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  } catch {
    return [];
  }
}

function channelAllowed(channel, channels) {
  if (!Array.isArray(channels) || channels.length === 0) return true;
  return channels.includes(String(channel ?? '').toLowerCase());
}

export async function resolveDeliveryRoute(dshIm, sessionId, cfg, { isSuperseded = false } = {}) {
  const described = sessionId ? await dshIm.describeConversation(sessionId) : null;
  if (described?.botId) {
    const draftTarget = draftTargetFromConversation(described);
    if (draftTarget) {
      return {
        botId: described.botId,
        channel: described.channel,
        targetOrDraft: draftTarget,
        usedFallback: false,
      };
    }
  }

  if (isSuperseded && cfg?.sessionSwitchGuard?.enabled && cfg?.sessionSwitchGuard?.blockFallbackDelivery) {
    return null;
  }

  if (!cfg?.fallbackTarget?.enabled) return null;
  if (typeof dshIm?.listBots !== 'function' || typeof dshIm?.listTargets !== 'function') return null;

  try {
    const botsPayload = await dshIm.listBots();
    const bots = Array.isArray(botsPayload?.bots)
      ? botsPayload.bots
      : Array.isArray(botsPayload)
        ? botsPayload
        : [];
    const prefChannel = cfg.fallbackTarget.preferredChannel || 'qq';
    const prefTargetId = cfg.fallbackTarget.preferredTargetId || '';

    const orderedBots = [...bots].sort((a, b) => {
      const aMatch = a?.channel === prefChannel ? 0 : 1;
      const bMatch = b?.channel === prefChannel ? 0 : 1;
      return aMatch - bMatch;
    });

    for (const bot of orderedBots) {
      const botId = bot?.botId ?? bot?.id;
      if (!botId) continue;
      const targets = await dshIm.listTargets(botId);
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const chosen = prefTargetId
        ? targets.find((t) => t?.targetId === prefTargetId) ?? targets[0]
        : targets[0];
      if (chosen?.targetId) {
        return {
          botId,
          channel: bot?.channel ?? prefChannel,
          targetOrDraft: chosen.targetId,
          usedFallback: true,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(payload);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > 64 * 1024) {
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(buf);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.trim() ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    request.on('error', reject);
  });
}

export function saveLiveConfig(baseConfig, patch = {}) {
  const current = resolveLiveConfig(baseConfig);
  const next = normalizeConfig({
    ...current,
    ...patch,
    multiBubble: { ...current.multiBubble, ...(patch?.multiBubble ?? {}) },
    typingDelay: { ...current.typingDelay, ...(patch?.typingDelay ?? {}) },
    sticker: { ...current.sticker, ...(patch?.sticker ?? {}) },
    proactiveGuard: { ...current.proactiveGuard, ...(patch?.proactiveGuard ?? {}) },
    fallbackTarget: { ...current.fallbackTarget, ...(patch?.fallbackTarget ?? {}) },
    fileGuard: { ...current.fileGuard, ...(patch?.fileGuard ?? {}) },
    keepAwake: { ...current.keepAwake, ...(patch?.keepAwake ?? {}) },
    importantDates: { ...current.importantDates, ...(patch?.importantDates ?? {}) },
    sessionSwitchGuard: { ...current.sessionSwitchGuard, ...(patch?.sessionSwitchGuard ?? {}) },
    configFile: baseConfig.configFile,
  });
  if (baseConfig.configFile) {
    mkdirSync(dirname(baseConfig.configFile), { recursive: true });
    const persisted = {
      enabled: next.enabled,
      multiBubble: next.multiBubble,
      typingDelay: next.typingDelay,
      sticker: next.sticker,
      proactiveGuard: next.proactiveGuard,
      fallbackTarget: next.fallbackTarget,
      fileGuard: next.fileGuard,
      keepAwake: next.keepAwake,
      importantDates: next.importantDates,
      sessionSwitchGuard: next.sessionSwitchGuard,
    };
    writeFileSync(baseConfig.configFile, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  }
  applyFileGuard(next.fileGuard);
  return next;
}

function mountSettingsHttp(webCtx, getBaseConfig, setRuntimeConfig, proactiveTracker, keepAwakeManager, supersededTracker, logger) {
  if (typeof webCtx?.webServer?.register !== 'function') return;
  const registerRoute = () => webCtx.webServer.register({
    kind: 'exact',
    path: SETTINGS_ROUTE,
    handler: async (request, response) => {
      try {
        if (request.method === 'GET') {
          const cfg = resolveLiveConfig(getBaseConfig());
          sendJson(response, 200, {
            ok: true,
            meta: PKG_META,
            settings: cfg,
            proactiveState: proactiveTracker.getState(),
            keepAwakeStatus: keepAwakeManager.getStatus(),
            sessionSwitchState: supersededTracker.getState(),
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          if (body?.action === 'resetProactiveState') {
            const resetState = proactiveTracker.reset();
            sendJson(response, 200, {
              ok: true,
              settings: resolveLiveConfig(getBaseConfig()),
              proactiveState: resetState,
              keepAwakeStatus: keepAwakeManager.getStatus(),
              sessionSwitchState: supersededTracker.getState(),
            });
            return;
          }
          const updated = saveLiveConfig(getBaseConfig(), body);
          setRuntimeConfig(updated);
          const kaStatus = keepAwakeManager.apply(updated.enabled ? updated.keepAwake : { enabled: false });
          sendJson(response, 200, {
            ok: true,
            settings: updated,
            proactiveState: proactiveTracker.getState(),
            keepAwakeStatus: kaStatus,
            sessionSwitchState: supersededTracker.getState(),
          });
          return;
        }
        sendJson(response, 405, { ok: false, error: 'method-not-allowed' });
      } catch (err) {
        logger?.warn?.(`[${name}] settings HTTP error:`, err);
        sendJson(response, 400, { ok: false, error: String(err?.message ?? err) });
      }
    },
  });
  if (typeof webCtx.effect === 'function') {
    webCtx.effect(registerRoute, `${name}: settings route`);
  } else {
    registerRoute();
  }
}

/**
 * Observe global `session/event` stream so single-bubble proactive turns
 * (where `im_send_bubbles` was not called) and user replies are 100% tracked.
 */
export function installSessionEventObserver(eventCtx, proactiveTracker, getConfig) {
  if (typeof eventCtx?.on !== 'function') return null;
  const turnStates = new Map();

  return eventCtx.on('session/event', (session, event) => {
    const sessionId = sessionIdOf(session);
    if (!sessionId || !event?.type) return;

    if (event.type === 'turn/start') {
      const turn = Number.isInteger(event.data?.turn) ? event.data.turn : 0;
      turnStates.set(sessionId, {
        turn,
        turnKey: `${sessionId}\u0000${turn}`,
        sawUser: false,
        sawProactive: false,
      });
      return;
    }

    if (event.type === 'user/message') {
      let st = turnStates.get(sessionId);
      if (!st) {
        st = { turn: 0, turnKey: `${sessionId}\u00000`, sawUser: false, sawProactive: false };
        turnStates.set(sessionId, st);
      }
      const src = event.data?.source;
      if (src?.kind === 'schedule' || src?.form === 'notice') {
        st.sawProactive = true;
      } else if (src?.kind === 'user' || src === undefined) {
        st.sawUser = true;
        proactiveTracker.onUserTurn();
      }
      return;
    }

    if (event.type === 'turn/end') {
      const st = turnStates.get(sessionId);
      if (st && st.sawProactive && !st.sawUser) {
        const cfg = getConfig();
        if (cfg.enabled && cfg.proactiveGuard?.enabled) {
          proactiveTracker.checkOrCommitProactive(st.turnKey, cfg.proactiveGuard, { commit: true });
        }
      }
      turnStates.delete(sessionId);
    }
  }, { global: true });
}

/**
 * Add a natural pre-reply pause on IM-bound user turns via DSH's `agent/pre-step`
 * middleware so single-bubble replies do not fire instantaneously.
 * Strictly skips non-IM (desktop) sessions, scheduled proactive turns, and tool follow-ups.
 */
export function installPreReplyPauseMiddleware(eventCtx, dshIm, getConfig, { sleepFn = sleep, random = Math.random } = {}) {
  if (typeof eventCtx?.on !== 'function' || typeof dshIm?.describeConversationSync !== 'function') {
    return null;
  }
  const seenBatchKeys = new Set();

  return eventCtx.on('agent/pre-step', async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : payload;
    if (decision?.kind !== 'enter') return decision;

    const cfg = getConfig();
    if (!cfg?.enabled || !cfg?.typingDelay?.enabled || !cfg?.typingDelay?.preReplyPauseEnabled) {
      return decision;
    }

    const agent = payload?.agent;
    const sessionId = sessionIdOf(agent?.session);
    if (!sessionId) return decision;

    let described = null;
    try {
      described = dshIm.describeConversationSync(sessionId);
    } catch {
      return decision;
    }
    if (!described?.botId) return decision;

    const messages = Array.isArray(decision.messages) ? decision.messages : [];
    const userMsgs = messages.filter((m) => m?.source?.kind === 'user' || m?.source === undefined);
    if (userMsgs.length === 0) return decision;

    const batchId = userMsgs.map((m) => m?.id ?? '').filter(Boolean).join(',') || `turn:${currentTurnOf(agent)}`;
    const key = `${sessionId}\u0000${batchId}`;
    if (seenBatchKeys.has(key)) return decision;
    seenBatchKeys.add(key);
    if (seenBatchKeys.size > 200) {
      const oldest = seenBatchKeys.values().next().value;
      if (oldest !== undefined) seenBatchKeys.delete(oldest);
    }

    const pauseMs = computePreReplyPauseMs(cfg.typingDelay, random);
    if (pauseMs > 0) {
      try {
        await sleepFn(pauseMs, payload?.signal ?? agent?.signal);
      } catch {
        // Ignore abort errors cleanly so DSH handles cancellation normally
      }
    }
    return decision;
  }, { global: true });
}

function supersededStateFilePathFrom(baseConfig) {
  if (!baseConfig?.configFile) return null;
  return join(dirname(baseConfig.configFile), 'superseded-sessions.json');
}

function defaultScheduleStoragePath() {
  const dshHome = process.env.DSH_HOME?.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh');
  return join(dshHome, 'storages', 'schedule.json');
}

export function readActiveSchedulesForSession(sessionId, scheduleFilePath = defaultScheduleStoragePath()) {
  if (!sessionId || !scheduleFilePath || !existsSync(scheduleFilePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(scheduleFilePath, 'utf8'));
    const tasks = raw?.tables?.tasks;
    if (!tasks || typeof tasks !== 'object') return [];
    const results = [];
    for (const entry of Object.values(tasks)) {
      if (entry?.status !== 'active') continue;
      if (entry?.target?.sessionId !== sessionId) continue;
      results.push({
        id: entry?.record?.id ?? '',
        title: String(entry?.record?.title ?? '').trim() || '未命名提醒',
        scheduledAt: entry?.record?.scheduledAt ?? null,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function createSupersededSessionTracker({
  stateFile = null,
  scheduleFilePath = defaultScheduleStoragePath(),
  nowFn = Date.now,
} = {}) {
  let state = {
    superseded: {},
    pendingHandoff: {},
  };

  if (stateFile) {
    try {
      const loaded = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (loaded && typeof loaded === 'object') {
        state = {
          superseded: loaded.superseded && typeof loaded.superseded === 'object' ? { ...loaded.superseded } : {},
          pendingHandoff: loaded.pendingHandoff && typeof loaded.pendingHandoff === 'object' ? { ...loaded.pendingHandoff } : {},
        };
      }
    } catch {
      // start fresh
    }
  }

  const persist = () => {
    if (!stateFile) return;
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // ignore write errors
    }
  };

  const chatKeyOf = (payload) => {
    const botId = String(payload?.botId ?? '').trim();
    const conv = String(payload?.conversationKey ?? '').trim();
    return botId && conv ? `${botId}\u0000${conv}` : null;
  };

  return {
    getState() {
      return {
        supersededCount: Object.keys(state.superseded).length,
      };
    },
    isSuperseded(sessionId) {
      return Boolean(sessionId && Object.prototype.hasOwnProperty.call(state.superseded, sessionId));
    },
    markUnbound(payload) {
      const sid = String(payload?.sessionId ?? '').trim();
      if (!sid) return;
      state.superseded[sid] = {
        unboundAt: nowFn(),
        channel: payload?.channel ?? null,
        botId: payload?.botId ?? null,
        conversationKey: payload?.conversationKey ?? null,
      };
      // Bound map size to 200 most recent unbound sessions
      const keys = Object.keys(state.superseded);
      if (keys.length > 200) {
        const sorted = keys.sort((a, b) => (state.superseded[a]?.unboundAt ?? 0) - (state.superseded[b]?.unboundAt ?? 0));
        for (const k of sorted.slice(0, keys.length - 200)) {
          delete state.superseded[k];
        }
      }
      const cKey = chatKeyOf(payload);
      if (cKey) {
        const pending = readActiveSchedulesForSession(sid, scheduleFilePath);
        if (pending.length > 0) {
          state.pendingHandoff[cKey] = {
            fromSessionId: sid,
            recordedAt: nowFn(),
            tasks: pending.slice(0, 10),
          };
        }
      }
      persist();
    },
    markBound(payload) {
      const sid = String(payload?.sessionId ?? '').trim();
      if (!sid) return;
      if (Object.prototype.hasOwnProperty.call(state.superseded, sid)) {
        delete state.superseded[sid];
        persist();
      }
    },
    consumeHandoffNotices(botId, conversationKey) {
      const cKey = botId && conversationKey ? `${botId}\u0000${conversationKey}` : null;
      if (!cKey || !state.pendingHandoff[cKey]) return [];
      const entry = state.pendingHandoff[cKey];
      delete state.pendingHandoff[cKey];
      persist();
      return Array.isArray(entry?.tasks) ? entry.tasks : [];
    },
  };
}

export function installSessionBindingGuard(eventCtx, supersededTracker, getConfig, logger) {
  if (typeof eventCtx?.on !== 'function') return null;

  const offUnbind = eventCtx.on('dsh-im/session-unbind', (payload) => {
    const cfg = getConfig();
    if (!cfg?.enabled || !cfg?.sessionSwitchGuard?.enabled) return;
    supersededTracker.markUnbound(payload);
    logger?.info?.(`[${name}] marked unbound session as superseded: ${payload?.sessionId ?? 'unknown'}`);
  }, { global: true });

  const offBind = eventCtx.on('dsh-im/session-pre-bind', (payload) => {
    const cfg = getConfig();
    if (!cfg?.enabled || !cfg?.sessionSwitchGuard?.enabled) return;
    supersededTracker.markBound(payload);
  }, { global: true });

  return () => {
    offUnbind?.();
    offBind?.();
  };
}

export function createCompanionPlugin({
  sleepFn = sleep,
  random = Math.random,
  nowFn = Date.now,
  keepAwakeFactory = createKeepAwakeManager,
  scheduleFilePath = defaultScheduleStoragePath(),
} = {}) {
  return Object.freeze({
    name,
    inject,
    apply(ctx, rawConfig = {}) {
      let baseConfig = normalizeConfig(rawConfig);
      const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console);
      const turnBubbleCounts = new Map();
      const turnSentTexts = new Map();
      const proactiveTracker = createProactiveStateTracker({
        stateFile: stateFilePathFrom(baseConfig),
        nowFn,
      });
      const supersededTracker = createSupersededSessionTracker({
        stateFile: supersededStateFilePathFrom(baseConfig),
        scheduleFilePath,
        nowFn,
      });
      const keepAwakeManager = keepAwakeFactory({ logger });

      const getConfig = () => resolveLiveConfig(baseConfig);
      const setRuntimeConfig = (updated) => { baseConfig = updated; };
      const getTurnKey = (sessionId, agent) => `${sessionId}\u0000${currentTurnOf(agent)}`;

      // Apply file guard & keep-awake at startup
      const initialCfg = getConfig();
      applyFileGuard(initialCfg.fileGuard);
      keepAwakeManager.apply(initialCfg.enabled ? initialCfg.keepAwake : { enabled: false });

      if (typeof ctx?.effect === 'function') {
        ctx.effect(() => () => keepAwakeManager.stop(), `${name}: keep-awake cleanup`);
      }

      // 1. Mount HTTP settings endpoint immediately on root `webServer`
      mountSettingsHttp(ctx, () => baseConfig, setRuntimeConfig, proactiveTracker, keepAwakeManager, supersededTracker, logger);

      // 2. Mount global `session/event` & `dsh-im/session-unbind` observers
      if (typeof ctx?.on === 'function') {
        installSessionEventObserver(ctx, proactiveTracker, getConfig);
        const disposeBindingGuard = installSessionBindingGuard(ctx, supersededTracker, getConfig, logger);
        if (disposeBindingGuard && typeof ctx?.effect === 'function') {
          ctx.effect(() => disposeBindingGuard, `${name}: session binding guard`);
        }
      }

      // 3. Mount Agent tools & systemPrompt when `dshIm`, `tools`, `systemPrompt` are ready
      const installAgentCapabilities = (toolCtx) => {
        const dshIm = toolCtx?.dshIm ?? ctx?.dshIm;
        const tools = toolCtx?.tools ?? ctx?.tools;
        const systemPrompt = toolCtx?.systemPrompt ?? ctx?.systemPrompt;
        if (!dshIm || typeof tools?.register !== 'function' || typeof systemPrompt?.context !== 'function') {
          return;
        }

        if (typeof toolCtx?.on === 'function' && typeof ctx?.on !== 'function') {
          installSessionEventObserver(toolCtx, proactiveTracker, getConfig);
        }

        const sendBubblesTool = Object.freeze({
          name: 'im_send_bubbles',
          description:
            'Send 1 to 3 leading short chat bubbles to the current IM conversation with optional humanized typing delay. '
            + 'Use this only when a reply naturally splits into multiple short messages; always leave the final sentence for your normal assistant reply so nothing is duplicated.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              messages: {
                type: 'array',
                description: 'Ordered short text bubbles to send BEFORE your final reply.',
                minItems: 1,
                maxItems: 4,
                items: {
                  type: 'string',
                  minLength: 1,
                },
              },
            },
            required: ['messages'],
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sentCount: { type: 'number' },
                sentMessages: {
                  type: 'array',
                  items: { type: 'string' },
                },
                skipped: { type: 'boolean' },
                reason: { type: 'string' },
              },
              required: ['sentCount', 'skipped'],
            },
            render: (_args, value) => [{
              type: 'text',
              text: value.skipped
                ? `Skipped sending bubbles (${value.reason ?? 'disabled'}). Send your full reply normally.`
                : `Already delivered ${value.sentCount} leading bubble(s) to IM: ${JSON.stringify(value.sentMessages ?? [])}. Now output ONLY your final remaining sentence—DO NOT repeat any of the delivered sentences above.`,
            }],
          },
          async execute(args, exec) {
            const cfg = getConfig();
            if (!cfg.enabled || !cfg.multiBubble.enabled) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: 'multiBubble switch is disabled' };
            }

            const sessionId = sessionIdOf(exec?.agent?.session);
            const isSuperseded = supersededTracker.isSuperseded(sessionId);
            if (isSuperseded && cfg.sessionSwitchGuard?.enabled && cfg.sessionSwitchGuard?.blockFallbackDelivery) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: 'session superseded by a newer IM session' };
            }

            const turnKind = classifyCurrentTurn(exec?.agent);
            const turnKey = getTurnKey(sessionId ?? 'no-session', exec?.agent);

            if (turnKind === 'user') {
              proactiveTracker.onUserTurn();
            } else {
              const check = proactiveTracker.checkOrCommitProactive(turnKey, cfg.proactiveGuard, { commit: true });
              if (!check.allowed) {
                return { sentCount: 0, sentMessages: [], skipped: true, reason: check.reason };
              }
            }

            const routeInfo = await resolveDeliveryRoute(dshIm, sessionId, cfg, { isSuperseded });
            if (!routeInfo) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: 'current session is not bound to an IM chat and no fallback target found' };
            }

            if (!channelAllowed(routeInfo.channel, cfg.multiBubble.channels)) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: `channel ${routeInfo.channel} is not enabled` };
            }

            const alreadySent = turnBubbleCounts.get(turnKey) ?? 0;
            const remaining = Math.max(0, cfg.multiBubble.maxBubblesPerTurn - alreadySent);
            if (remaining <= 0) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: 'per-turn bubble limit reached' };
            }

            let seenSet = turnSentTexts.get(turnKey);
            if (!seenSet) {
              seenSet = new Set();
              turnSentTexts.set(turnKey, seenSet);
            }

            const rawList = Array.isArray(args?.messages) ? args.messages : [];
            const deduped = [];
            for (const item of rawList) {
              const text = [...String(item ?? '').trim()].slice(0, cfg.multiBubble.maxTextLength).join('');
              if (!text || seenSet.has(text)) continue;
              seenSet.add(text);
              deduped.push(text);
              if (deduped.length >= remaining) break;
            }

            if (deduped.length === 0) {
              return { sentCount: 0, sentMessages: [], skipped: true, reason: 'no non-duplicate messages to send' };
            }

            let sentCount = 0;
            const sentMessages = [];
            for (let i = 0; i < deduped.length; i += 1) {
              const text = deduped[i];
              const delayMs = computeTypingDelayMs(text, cfg.typingDelay, random);
              await sleepFn(delayMs, exec?.signal);
              const result = await dshIm.send(routeInfo.botId, routeInfo.targetOrDraft, text, {
                signal: exec?.signal,
                format: 'plain',
              });
              if (result?.sent !== true) {
                throw new Error(`dshIm.send did not confirm delivery for bubble #${i + 1}`);
              }
              sentCount += 1;
              sentMessages.push(text);
              turnBubbleCounts.set(turnKey, alreadySent + sentCount);
            }

            const tailPauseMs = computeTailPauseMs(cfg.typingDelay, random);
            if (tailPauseMs > 0) {
              await sleepFn(tailPauseMs, exec?.signal);
            }

            if (turnBubbleCounts.size > 200) {
              const firstKey = turnBubbleCounts.keys().next().value;
              if (firstKey !== undefined) {
                turnBubbleCounts.delete(firstKey);
                turnSentTexts.delete(firstKey);
              }
            }

            return { sentCount, sentMessages, skipped: false };
          },
        });

        const listStickersTool = Object.freeze({
          name: 'im_list_stickers',
          description: 'List available sticker/meme image files in the workspace sticker folder so you can pick one to send via dsh_im_return_file.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                dirName: { type: 'string' },
                stickers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      relativePath: { type: 'string' },
                    },
                    required: ['name', 'relativePath'],
                  },
                },
              },
              required: ['enabled', 'dirName', 'stickers'],
            },
            render: (_args, value) => [{
              type: 'text',
              text: !value.enabled
                ? 'Sticker feature is currently disabled.'
                : value.stickers.length === 0
                  ? `No sticker images found in "${value.dirName}/". Do not mention stickers to the user.`
                  : `Available stickers in "${value.dirName}/": ${value.stickers.map((s) => `${s.name} (${s.relativePath})`).join(', ')}. Send at most one via dsh_im_return_file.`,
            }],
          },
          async execute(_args, exec) {
            const cfg = getConfig();
            if (!cfg.enabled || !cfg.sticker.enabled) {
              return { enabled: false, dirName: cfg.sticker.dirName, stickers: [] };
            }
            const ws = workspaceOf(exec?.agent);
            const stickers = scanStickers(ws, cfg.sticker.dirName).map(({ name: sName, relativePath }) => ({
              name: sName,
              relativePath,
            }));
            return { enabled: true, dirName: cfg.sticker.dirName, stickers };
          },
        });

        const listImportantDatesTool = Object.freeze({
          name: 'im_list_important_dates',
          description: 'Read workspace important dates (supports both solar and Chinese lunar calendar conversion) and return exact upcoming Gregorian dates and countdowns.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                fileFound: { type: 'boolean' },
                fileName: { type: 'string' },
                todayIso: { type: 'string' },
                todayLunarLabel: { type: 'string' },
                upcoming: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      calendar: { type: 'string' },
                      dateRaw: { type: 'string' },
                      nextDateIso: { type: 'string' },
                      daysUntil: { type: 'number' },
                      inAlertWindow: { type: 'boolean' },
                      remark: { type: 'string' },
                    },
                    required: ['name', 'calendar', 'dateRaw', 'nextDateIso', 'daysUntil', 'inAlertWindow', 'remark'],
                  },
                },
              },
              required: ['enabled', 'fileFound', 'fileName', 'todayIso', 'todayLunarLabel', 'upcoming'],
            },
            render: (_args, value) => [{
              type: 'text',
              text: !value.enabled
                ? 'Important dates feature is currently disabled.'
                : !value.fileFound
                  ? `今天北京时间 ${value.todayIso}（农历${value.todayLunarLabel}）；工作区未找到「${value.fileName}」。`
                  : value.upcoming.length === 0
                    ? `今天北京时间 ${value.todayIso}（农历${value.todayLunarLabel}）；近期没有临近的重要日子。`
                    : `今天北京时间 ${value.todayIso}（农历${value.todayLunarLabel}）；临近重要日子：\n${value.upcoming.map((d) => `- ${d.name}：${d.nextDateIso}（${d.calendar === 'lunar' ? `农历${d.dateRaw}` : `公历${d.dateRaw}`}，${d.daysUntil === 0 ? '就是今天' : d.daysUntil === 1 ? '就在明天' : `还有 ${d.daysUntil} 天`}）${d.remark ? ` — ${d.remark}` : ''}`).join('\n')}`,
            }],
          },
          async execute(_args, exec) {
            const cfg = getConfig();
            if (!cfg.enabled || !cfg.importantDates.enabled) {
              return {
                enabled: false,
                fileFound: false,
                fileName: cfg.importantDates.fileName,
                todayIso: '',
                todayLunarLabel: '',
                upcoming: [],
              };
            }
            const ws = workspaceOf(exec?.agent);
            const result = scanImportantDates(ws, cfg.importantDates, nowFn());
            return {
              enabled: true,
              fileFound: result.fileFound,
              fileName: result.fileName,
              todayIso: result.todayIso,
              todayLunarLabel: result.todayLunarLabel,
              upcoming: result.upcoming.map((d) => ({
                name: d.name,
                calendar: d.calendar,
                dateRaw: d.dateRaw,
                nextDateIso: d.nextDateIso,
                daysUntil: d.daysUntil,
                inAlertWindow: d.inAlertWindow,
                remark: [d.calendarNote, d.remark].filter(Boolean).join('；'),
              })),
            };
          },
        });

        tools.register(sendBubblesTool);
        tools.register(listStickersTool);
        tools.register(listImportantDatesTool);

        // Mount IM-only pre-reply pause middleware for single-bubble replies
        const preReplyCtx = typeof toolCtx?.on === 'function' ? toolCtx : ctx;
        if (typeof preReplyCtx?.on === 'function') {
          const disposePreReply = installPreReplyPauseMiddleware(preReplyCtx, dshIm, getConfig, {
            sleepFn,
            random,
          });
          if (disposePreReply && typeof preReplyCtx?.effect === 'function') {
            preReplyCtx.effect(() => disposePreReply, `${name}: pre-reply pause`);
          }
        }

        systemPrompt.context({
          name: 'dsh-im-companion:guidance',
          order: 118,
          text: (assembly) => {
            const cfg = getConfig();
            if (!cfg.enabled) return '';
            const ws = workspaceOf(assembly?.agent);
            applyFileGuard(cfg.fileGuard, ws);

            const sessionId = sessionIdOf(assembly?.agent?.session);
            const described = sessionId && typeof dshIm.describeConversationSync === 'function'
              ? dshIm.describeConversationSync(sessionId)
              : null;

            // If this session was superseded by /new or session switch, instruct it to stop and cancel its remaining schedules
            if (!described?.botId && cfg.sessionSwitchGuard?.enabled && supersededTracker.isSuperseded(sessionId)) {
              return '【旧会话已淘汰防分身】当前会话已被新的 IM 会话替代解绑。请勿再向 IM 发送消息，也不要再创建新的定时提醒；请立即使用定时任务管理工具取消本会话名下所有剩余待触发的定时任务。';
            }

            if (!described?.botId && !cfg.fallbackTarget.enabled) return '';

            const turnKind = classifyCurrentTurn(assembly?.agent);
            const turnKey = getTurnKey(sessionId ?? 'no-session', assembly?.agent);

            if (turnKind === 'user') {
              proactiveTracker.onUserTurn();
            }

            const lines = [];

            if (described?.botId && cfg.sessionSwitchGuard?.enabled && cfg.sessionSwitchGuard?.handoffPendingNotice) {
              const handoffTasks = supersededTracker.consumeHandoffNotices(described.botId, described.conversationKey);
              if (handoffTasks.length > 0) {
                const descList = handoffTasks
                  .map((t) => `「${t.title}」${t.scheduledAt ? `（${t.scheduledAt}）` : ''}`)
                  .join('、');
                lines.push(
                  `【新会话提醒交接】刚才被切换掉的旧会话中曾有未触发的定时提醒：${descList}。如果其中有主人明确约定的重要事项提醒，可按需在本新会话重新定一下；普通闲聊主动提醒无需照搬。`,
                );
              }
            }

            if (cfg.fileGuard.enabled) {
              lines.push(
                `核心文件只读锁已开启：${cfg.fileGuard.protectedFiles.join('、')} 已被系统锁定为只读，严禁修改，所有新记忆请写入 记忆.md 或 日记/。`,
              );
            }

            if (cfg.proactiveGuard.enabled) {
              if (turnKind === 'proactive') {
                const check = proactiveTracker.checkOrCommitProactive(turnKey, cfg.proactiveGuard, { commit: true });
                if (!check.allowed) {
                  lines.push(
                    `【主动消息熔断已触发（${check.reason}）】主人尚未回复、处于冷却期或正在睡眠免打扰时段，本轮请不要再定新的主动提醒。`,
                  );
                }
              }
              const st = proactiveTracker.getState();
              const cooldownH = (cfg.proactiveGuard.cooldownMinutes / 60).toFixed(1).replace(/\.0$/, '');
              const suggestedNextTs = computeNextProactiveTimestamp(nowFn(), cfg.proactiveGuard, random);
              const suggestedTimeStr = beijingDateParts(suggestedNextTs).formatted;
              if (st.unrepliedCount >= cfg.proactiveGuard.maxUnreplied) {
                lines.push(
                  `IM 主动消息管控：你已连续主动找主人 ${st.unrepliedCount}/${cfg.proactiveGuard.maxUnreplied} 次未获回复，请暂停定新的主动聊天提醒，等主人回复后再继续。`,
                );
              } else {
                const quietNote = cfg.proactiveGuard.quietHoursEnabled
                  ? `（已自动避开 ${cfg.proactiveGuard.quietStart}～${cfg.proactiveGuard.quietEnd} 睡眠免打扰时段）`
                  : '';
                lines.push(
                  `IM 主动消息管控：当前未回复主动次数 ${st.unrepliedCount}/${cfg.proactiveGuard.maxUnreplied}（上限 ${cfg.proactiveGuard.maxUnreplied} 次，主人一回复即归零）；每隔约 ${cooldownH} 小时可主动找他一次，若要定下一次主动提醒，建议选在北京时间 ${suggestedTimeStr} 左右${quietNote}。`,
                );
              }
            }

            const activeChannel = described?.channel ?? cfg.fallbackTarget.preferredChannel;
            if (cfg.multiBubble.enabled && channelAllowed(activeChannel, cfg.multiBubble.channels)) {
              lines.push(
                `IM 分气泡发送已开启：如果日常闲聊自然适合分成 2～${cfg.multiBubble.maxBubblesPerTurn + 1} 条短气泡连发，可以先调用 im_send_bubbles 发送前面 1～${cfg.multiBubble.maxBubblesPerTurn} 句，再把最后一句作为本次正常回复输出（严禁重复 im_send_bubbles 已经发过的句子）。一句话就能说完、或回复长篇正事/代码时直接正常回复即可，不用强行拆条。`,
              );
            }

            if (cfg.sticker.enabled) {
              const stickers = scanStickers(ws, cfg.sticker.dirName);
              if (stickers.length > 0) {
                lines.push(
                  `IM 表情包已开启：情绪到位时偶尔可调用 im_list_stickers 查看「${cfg.sticker.dirName}/」里的图，选一张最贴合语境的通过 dsh_im_return_file 发送；每次最多发一张，发完照常说话，不要连着甩图。`,
                );
              }
            }

            if (cfg.importantDates.enabled) {
              const idResult = scanImportantDates(ws, cfg.importantDates, nowFn());
              if (idResult.fileFound) {
                if (idResult.alertItems.length > 0) {
                  const summary = idResult.alertItems
                    .map((d) => {
                      const cal = d.calendar === 'lunar' ? `农历${d.dateRaw}` : `公历${d.dateRaw}`;
                      const when = d.daysUntil === 0 ? '就是今天！' : d.daysUntil === 1 ? '就在明天！' : `还有 ${d.daysUntil} 天（${d.nextDateIso}）`;
                      const note = [d.calendarNote, d.remark].filter(Boolean).join('；');
                      return `${d.name}（${cal} → ${when}${note ? `，${note}` : ''}）`;
                    })
                    .join('；');
                  lines.push(
                    `重要日子提醒（今天北京时间 ${idResult.todayIso}，农历${idResult.todayLunarLabel}，来源「${idResult.fileName}」）：${summary}。请在合适时机用自然亲近的口吻温柔提醒，避免同一条每轮反复刷屏；也可随时调用 im_list_important_dates 查未来 ${cfg.importantDates.windowDays} 天精确换算结果。`,
                  );
                } else {
                  lines.push(
                    `重要日子与农历助手已开启（今天北京时间 ${idResult.todayIso}，农历${idResult.todayLunarLabel}，来源「${idResult.fileName}」）：未来几天暂无进入提醒窗口的日子，需要精确换算农历或查近期生日/纪念日时请调用 im_list_important_dates，不要自己心算农历。`,
                  );
                }
              }
            }

            return lines.join('\n');
          },
        });
      };

      if (typeof ctx?.inject === 'function') {
        ctx.inject(['dshIm', 'tools', 'systemPrompt'], installAgentCapabilities);
      } else {
        installAgentCapabilities(ctx);
      }

      logger?.info?.(`[${name}] host ready: ${SETTINGS_ROUTE}`);
    },
  });
}

const defaultPlugin = createCompanionPlugin();
export const apply = defaultPlugin.apply;
export default defaultPlugin;
