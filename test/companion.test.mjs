import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyFileGuard,
  createCompanionPlugin,
  createProactiveStateTracker,
  installPreReplyPauseMiddleware,
  installSessionEventObserver,
  resolveDeliveryRoute,
  saveLiveConfig,
  scanStickers,
} from '../index.mjs';
import {
  beijingDateParts,
  computeNextProactiveTimestamp,
  computePreReplyPauseMs,
  computeTailPauseMs,
  computeTypingDelayMs,
  isInQuietHours,
  normalizeConfig,
} from '../config.mjs';
import { draftTargetFromConversation } from '../route.mjs';
import { buildKeepAwakeCommand, createKeepAwakeManager } from '../keep-awake.mjs';
import { parseImportantDatesMarkdown, resolveNextLunarOccurrence, scanImportantDates } from '../lunar.mjs';

function makeMockCtx({ described = null } = {}) {
  const tools = new Map();
  const prompts = [];
  const sent = [];

  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {} }),
    dshIm: {
      async describeConversation(sessionId) {
        return sessionId === 'sess-1' ? described : null;
      },
      describeConversationSync(sessionId) {
        return sessionId === 'sess-1' ? described : null;
      },
      async send(botId, target, text, options) {
        sent.push({ botId, target, text, options });
        return { sent: true };
      },
    },
    tools: {
      register(def) {
        tools.set(def.name, def);
      },
    },
    systemPrompt: {
      context(entry) {
        prompts.push(entry);
      },
    },
  };

  return { ctx, tools, prompts, sent };
}

test('draftTargetFromConversation maps QQ c2c and group keys', () => {
  assert.deepEqual(
    draftTargetFromConversation({ channel: 'qq', conversationKey: 'c2c:OPENID_123' }),
    { kind: 'user', route: { userOpenId: 'OPENID_123' } },
  );
  assert.deepEqual(
    draftTargetFromConversation({ channel: 'qq', conversationKey: 'group:GRP_456' }),
    { kind: 'group', route: { groupOpenId: 'GRP_456' } },
  );
});

test('computeTypingDelayMs respects switch and bounds', () => {
  const cfg = normalizeConfig({
    typingDelay: { enabled: true, baseDelayMs: 400, msPerChar: 50, minDelayMs: 500, maxDelayMs: 1500, jitterRatio: 0 },
  });
  assert.equal(computeTypingDelayMs('你好', cfg.typingDelay, () => 0.5), 500);
  assert.equal(computeTypingDelayMs('一二三四五六七八九十', cfg.typingDelay, () => 0.5), 900);

  const offCfg = normalizeConfig({ typingDelay: { enabled: false, rateLimitFloorMs: 200 } });
  assert.equal(computeTypingDelayMs('一二三四五六七八九十', offCfg.typingDelay), 200);
});

test('im_send_bubbles sends leading bubbles, deduplicates repeats, and respects per-turn cap', async () => {
  const sleeps = [];
  const plugin = createCompanionPlugin({
    sleepFn: async (ms) => { sleeps.push(ms); },
    random: () => 0.5,
  });
  const { ctx, tools, sent, prompts } = makeMockCtx({
    described: { channel: 'qq', botId: 'bot_qq_1', conversationKey: 'c2c:U001' },
  });

  plugin.apply(ctx, {
    enabled: true,
    configFile: false,
    fileGuard: { enabled: false, workspaceDirs: [] },
    multiBubble: { enabled: true, maxBubblesPerTurn: 2, channels: ['qq'] },
    typingDelay: { enabled: true, baseDelayMs: 400, msPerChar: 50, minDelayMs: 500, maxDelayMs: 1500, jitterRatio: 0 },
  });

  const bubbleTool = tools.get('im_send_bubbles');
  const res = await bubbleTool.execute(
    { messages: ['第一句', '第一句', '第二句', '第三句会被截断'] },
    { agent: { session: { id: 'sess-1', events: [{ type: 'turn/start', data: { turn: 1 } }] } } },
  );

  assert.equal(res.skipped, false);
  assert.equal(res.sentCount, 2);
  assert.deepEqual(res.sentMessages, ['第一句', '第二句']);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].text, '第一句');
  assert.equal(sent[1].text, '第二句');
  // Full delay for bubble #1 (no 0.5x cut) + full delay for bubble #2 + tail pause before final reply
  assert.deepEqual(sleeps, [550, 550, 500]);

  // Calling again in same turn hits cap
  const res2 = await bubbleTool.execute(
    { messages: ['超额'] },
    { agent: { session: { id: 'sess-1', events: [{ type: 'turn/start', data: { turn: 1 } }] } } },
  );
  assert.equal(res2.skipped, true);

  // Guidance prompt is injected for IM session
  const guidance = prompts[0].text({ agent: { session: { id: 'sess-1' } } });
  assert.match(guidance, /im_send_bubbles/);
});

test('feature switches disable multiBubble and hot-reload configFile works', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-im-comp-'));
  try {
    const cfgPath = join(dir, 'settings.json');
    writeFileSync(cfgPath, JSON.stringify({ multiBubble: { enabled: false }, fileGuard: { enabled: false, workspaceDirs: [] } }), 'utf8');

    const plugin = createCompanionPlugin({ sleepFn: async () => {} });
    const { ctx, tools, prompts } = makeMockCtx({
      described: { channel: 'qq', botId: 'bot_qq_1', conversationKey: 'c2c:U001' },
    });
    plugin.apply(ctx, { enabled: true, configFile: cfgPath, fileGuard: { enabled: false, workspaceDirs: [] } });

    const bubbleTool = tools.get('im_send_bubbles');
    const res = await bubbleTool.execute(
      { messages: ['不会发'] },
      { agent: { session: { id: 'sess-1' } } },
    );
    assert.equal(res.skipped, true);
    assert.doesNotMatch(prompts[0].text({ agent: { session: { id: 'sess-1' } } }), /im_send_bubbles/);

    // Hot-toggle back on without restarting plugin
    writeFileSync(cfgPath, JSON.stringify({ multiBubble: { enabled: true }, fileGuard: { enabled: false, workspaceDirs: [] } }), 'utf8');
    const resOn = await bubbleTool.execute(
      { messages: ['热开启成功'] },
      { agent: { session: { id: 'sess-1' } } },
    );
    assert.equal(resOn.skipped, false);
    assert.equal(resOn.sentCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanStickers ignores underscore files and non-images', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-im-stk-'));
  try {
    mkdirSync(join(dir, '表情'));
    writeFileSync(join(dir, '表情', '_说明.txt'), 'note');
    writeFileSync(join(dir, '表情', '气鼓鼓.png'), 'fake');
    writeFileSync(join(dir, '表情', '比心.gif'), 'fake');
    writeFileSync(join(dir, '表情', 'readme.md'), 'md');

    const items = scanStickers(dir, '表情');
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((x) => x.name), ['比心', '气鼓鼓']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveLiveConfig toggles individual switches independently and persists to disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-im-save-'));
  try {
    const cfgPath = join(dir, 'companion-settings.json');
    const base = normalizeConfig({ configFile: cfgPath, fileGuard: { enabled: false, workspaceDirs: [] } });

    const after1 = saveLiveConfig(base, { typingDelay: { enabled: false } });
    assert.equal(after1.multiBubble.enabled, true);
    assert.equal(after1.typingDelay.enabled, false);
    assert.equal(after1.sticker.enabled, true);

    const after2 = saveLiveConfig(base, { multiBubble: { enabled: false } });
    assert.equal(after2.multiBubble.enabled, false);
    assert.equal(after2.typingDelay.enabled, false);
    assert.equal(after2.sticker.enabled, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('proactiveGuard enforces 3h cooldown, max 3 unreplied limit, and resets on user reply', () => {
  // Choose a daytime Beijing timestamp: 2026-11-22 13:00:00+08:00 (05:00 UTC)
  let now = Date.parse('2026-11-22T05:00:00Z');
  const tracker = createProactiveStateTracker({ nowFn: () => now });
  const guard = {
    enabled: true,
    maxUnreplied: 3,
    cooldownMinutes: 180,
    quietHoursEnabled: true,
    quietStart: '02:30',
    quietEnd: '11:30',
  };

  // 1st proactive outreach at 13:00 allowed
  const r1 = tracker.checkOrCommitProactive('turn-1', guard, { commit: true });
  assert.equal(r1.allowed, true);
  assert.equal(tracker.getState().unrepliedCount, 1);

  // 30 minutes later: blocked by 3h cooldown
  now += 30 * 60_000;
  const rEarly = tracker.checkOrCommitProactive('turn-2', guard, { commit: true });
  assert.equal(rEarly.allowed, false);
  assert.match(rEarly.reason, /cooldown active/);

  // 16:01 (3h later): 2nd proactive outreach allowed
  now += 151 * 60_000;
  const r2 = tracker.checkOrCommitProactive('turn-2', guard, { commit: true });
  assert.equal(r2.allowed, true);
  assert.equal(tracker.getState().unrepliedCount, 2);

  // 19:02 (3h later): 3rd proactive outreach allowed
  now += 181 * 60_000;
  const r3 = tracker.checkOrCommitProactive('turn-3', guard, { commit: true });
  assert.equal(r3.allowed, true);
  assert.equal(tracker.getState().unrepliedCount, 3);

  // 22:03 (3h later): 4th blocked because unrepliedCount === 3
  now += 181 * 60_000;
  const r4 = tracker.checkOrCommitProactive('turn-4', guard, { commit: true });
  assert.equal(r4.allowed, false);
  assert.match(r4.reason, /unreplied limit reached/);

  // User replies -> unrepliedCount resets to 0
  tracker.onUserTurn();
  assert.equal(tracker.getState().unrepliedCount, 0);
  const rAfterReply = tracker.checkOrCommitProactive('turn-5', guard, { commit: true });
  assert.equal(rAfterReply.allowed, true);
  assert.equal(tracker.getState().unrepliedCount, 1);
});

test('quietHours blocks sleeping hours and postpones +3h suggestion past 11:30', () => {
  const guard = {
    enabled: true,
    maxUnreplied: 3,
    cooldownMinutes: 180,
    jitterMinutes: 0,
    quietHoursEnabled: true,
    quietStart: '02:30',
    quietEnd: '11:30',
  };

  // 2026-11-22 04:00+08:00 is inside quiet hours (02:30~11:30)
  const sleepTs = Date.parse('2026-11-21T20:00:00Z');
  assert.equal(isInQuietHours(sleepTs, guard), true);

  const tracker = createProactiveStateTracker({ nowFn: () => sleepTs });
  const blocked = tracker.checkOrCommitProactive('sleep-turn', guard, { commit: true });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /quiet hours active/);

  // Chatting at 01:00+08:00: +3h would be 04:00 (inside quiet hours), so it must postpone past 11:30!
  const lateChatTs = Date.parse('2026-11-21T17:00:00Z'); // 01:00 Beijing
  const nextTs = computeNextProactiveTimestamp(lateChatTs, guard, () => 0);
  const parts = beijingDateParts(nextTs);
  assert.equal(isInQuietHours(nextTs, guard), false);
  assert.ok(parts.minuteOfDay >= 11 * 60 + 30, `Expected >= 11:30, got ${parts.formatted}`);
});

test('installSessionEventObserver counts single-bubble proactive turns and resets on user reply', () => {
  const now = Date.parse('2026-11-22T06:00:00Z'); // 14:00 Beijing
  const tracker = createProactiveStateTracker({ nowFn: () => now });
  let handler = null;
  const eventCtx = {
    on(eventName, fn) {
      if (eventName === 'session/event') handler = fn;
    },
  };
  const cfg = normalizeConfig({ proactiveGuard: { enabled: true, maxUnreplied: 3, cooldownMinutes: 180 } });
  installSessionEventObserver(eventCtx, tracker, () => cfg);

  const session = { id: 'sess-99' };
  // Proactive turn starts and ends without calling im_send_bubbles
  handler(session, { type: 'turn/start', data: { turn: 7 } });
  handler(session, { type: 'user/message', data: { source: { kind: 'schedule' } } });
  handler(session, { type: 'turn/end', data: { turn: 7 } });
  assert.equal(tracker.getState().unrepliedCount, 1);

  // User replies in next turn -> count resets to 0
  handler(session, { type: 'turn/start', data: { turn: 8 } });
  handler(session, { type: 'user/message', data: { source: { kind: 'user' } } });
  assert.equal(tracker.getState().unrepliedCount, 0);
});

test('applyFileGuard toggles read-only mode on protected files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-im-fg-'));
  try {
    const f1 = join(dir, 'AGENTS.md');
    writeFileSync(f1, '# agents', 'utf8');

    const locked = applyFileGuard({ enabled: true, workspaceDirs: [dir], protectedFiles: ['AGENTS.md'] });
    assert.ok(locked.lockedCount >= 1);

    // Unlock before cleanup
    const unlocked = applyFileGuard({ enabled: false, workspaceDirs: [dir], protectedFiles: ['AGENTS.md'] });
    assert.ok(unlocked.unlockedCount >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveDeliveryRoute falls back to saved QQ target when session is unbound', async () => {
  const mockDshIm = {
    async describeConversation() { return null; },
    async listBots() {
      return {
        bots: [
          { botId: 'bot_feishu_1', channel: 'feishu' },
          { botId: 'bot_qq_99', channel: 'qq' },
        ],
      };
    },
    async listTargets(botId) {
      if (botId === 'bot_qq_99') return [{ targetId: 'daily-qq' }];
      return [{ targetId: 'other' }];
    },
  };
  const cfg = normalizeConfig({ fallbackTarget: { enabled: true, preferredChannel: 'qq' } });
  const route = await resolveDeliveryRoute(mockDshIm, 'cold-session', cfg);
  assert.deepEqual(route, {
    botId: 'bot_qq_99',
    channel: 'qq',
    targetOrDraft: 'daily-qq',
    usedFallback: true,
  });
});

test('buildKeepAwakeCommand generates native macOS and Windows commands', () => {
  const mac = buildKeepAwakeCommand({ platform: 'darwin', pid: 4321, preventDisplaySleep: false });
  assert.equal(mac.command, '/usr/bin/caffeinate');
  assert.deepEqual(mac.args, ['-i', '-s', '-w', '4321']);

  const macDisplay = buildKeepAwakeCommand({ platform: 'darwin', pid: 4321, preventDisplaySleep: true });
  assert.deepEqual(macDisplay.args, ['-i', '-s', '-d', '-w', '4321']);

  const win = buildKeepAwakeCommand({ platform: 'win32', pid: 100, preventDisplaySleep: false });
  assert.equal(win.command, 'powershell.exe');
  assert.ok(win.args.some((a) => a.includes('SetThreadExecutionState')));
});

test('createKeepAwakeManager starts, is idempotent, restarts on mode change, and stops cleanly', () => {
  const spawned = [];
  let nextPid = 5000;
  const fakeSpawn = (cmd, args) => {
    const proc = {
      pid: nextPid++,
      cmd,
      args,
      killed: false,
      unrefCalled: false,
      on() {},
      unref() { this.unrefCalled = true; },
      kill() { this.killed = true; },
    };
    spawned.push(proc);
    return proc;
  };

  const mgr = createKeepAwakeManager({ platform: 'darwin', pid: 999, spawnFn: fakeSpawn });
  assert.equal(mgr.getStatus().active, false);

  // Enable system keep-awake
  const s1 = mgr.apply({ enabled: true, preventDisplaySleep: false });
  assert.equal(s1.active, true);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].unrefCalled, true);

  // Applying identical config does not spawn duplicate process
  mgr.apply({ enabled: true, preventDisplaySleep: false });
  assert.equal(spawned.length, 1);

  // Toggling preventDisplaySleep kills old process and spawns new one with -d
  mgr.apply({ enabled: true, preventDisplaySleep: true });
  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].killed, true);
  assert.ok(spawned[1].args.includes('-d'));

  // Disabling stops process cleanly
  const sOff = mgr.apply({ enabled: false });
  assert.equal(sOff.active, false);
  assert.equal(spawned[1].killed, true);
});

test('importantDates accurately resolves lunar dates, 腊月小建 fallback, tool output, and prompt injection', async () => {
  // 2025 lunar year 腊月 has 29 days -> 2026-02-16
  const eve2025 = resolveNextLunarOccurrence({ month: 12, day: 30, isLeap: false }, '2026-02-10');
  assert.equal(eve2025.dateIso, '2026-02-16');
  assert.match(eve2025.note, /小建/);

  const dir = mkdtempSync(join(tmpdir(), 'dsh-im-dates-'));
  try {
    writeFileSync(
      join(dir, '重要日子.md'),
      [
        '| 名称 | 历法 | 日期 | 提前提醒（天） | 备注 |',
        '| --- | --- | --- | --- | --- |',
        '| （示例）妈妈生日 | 农历 | 五月初八 | 7,3,1,0 | 示例行 |',
        '| 姐姐生日 | 农历 | 十月十八 | 7,3,1,0 | 记得买礼物 |',
        '| 主人的生日 | 公历 | 10-02 | 7,3,1,0 | 来自档案 |',
      ].join('\n'),
      'utf8',
    );

    const parsed = parseImportantDatesMarkdown(readFileSync(join(dir, '重要日子.md'), 'utf8'));
    assert.equal(parsed.length, 2);

    // 2026-11-23 is 农历十月十五 -> 十月十八 is 2026-11-26 (3 days later)
    const nowTs = Date.parse('2026-11-23T15:00:00+08:00');
    const scanned = scanImportantDates(dir, { fileName: '重要日子.md', windowDays: 30 }, nowTs);
    assert.equal(scanned.fileFound, true);
    assert.equal(scanned.todayIso, '2026-11-23');
    assert.equal(scanned.todayLunarLabel, '十月十五');
    assert.equal(scanned.upcoming.length, 1);
    assert.equal(scanned.upcoming[0].name, '姐姐生日');
    assert.equal(scanned.upcoming[0].nextDateIso, '2026-11-26');
    assert.equal(scanned.alertItems.length, 1);

    // Verify plugin tool + systemPrompt.context integration
    const toolsMap = new Map();
    const prompts = [];
    const plugin = createCompanionPlugin({ nowFn: () => nowTs });
    plugin.apply(
      {
        dshIm: {
          describeConversationSync: () => ({ botId: 'bot1', channel: 'qq', conversationKey: 'c2c:123' }),
        },
        tools: { register: (t) => toolsMap.set(t.name, t) },
        systemPrompt: { context: (c) => prompts.push(c) },
      },
      { configFile: false, keepAwake: { enabled: false }, importantDates: { enabled: true } },
    );

    const tool = toolsMap.get('im_list_important_dates');
    assert.ok(tool);
    const out = await tool.execute({}, { agent: { workspace: dir } });
    assert.equal(out.enabled, true);
    assert.equal(out.upcoming.length, 1);
    assert.equal(out.upcoming[0].nextDateIso, '2026-11-26');

    const guidance = prompts[0].text({ agent: { workspace: dir, session: { id: 's1', events: [] } } });
    assert.match(guidance, /重要日子提醒/);
    assert.match(guidance, /姐姐生日/);
    assert.match(guidance, /2026-11-26/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tailPause and preReplyPause switches work and pre-step middleware only delays IM user turns', async () => {
  const cfg = normalizeConfig({
    typingDelay: {
      enabled: true,
      baseDelayMs: 900,
      minDelayMs: 1200,
      maxDelayMs: 5500,
      jitterRatio: 0,
      tailPauseEnabled: true,
      preReplyPauseEnabled: true,
      preReplyMinMs: 1200,
      preReplyMaxMs: 2400,
    },
  });
  assert.equal(computeTailPauseMs(cfg.typingDelay, () => 0.5), 1200);
  assert.equal(computePreReplyPauseMs(cfg.typingDelay, () => 0.5), 1800);
  assert.equal(computeTailPauseMs({ ...cfg.typingDelay, tailPauseEnabled: false }), 0);
  assert.equal(computePreReplyPauseMs({ ...cfg.typingDelay, preReplyPauseEnabled: false }), 0);

  let registeredHandler = null;
  const eventCtx = {
    on(eventName, fn) {
      if (eventName === 'agent/pre-step') registeredHandler = fn;
      return () => { registeredHandler = null; };
    },
  };
  const dshIm = {
    describeConversationSync(sid) {
      return sid === 'im-sess' ? { botId: 'bot1', channel: 'qq', conversationKey: 'c2c:U1' } : null;
    },
  };

  let liveCfg = cfg;
  const sleeps = [];
  installPreReplyPauseMiddleware(eventCtx, dshIm, () => liveCfg, {
    sleepFn: async (ms) => { sleeps.push(ms); },
    random: () => 0.5,
  });
  assert.ok(registeredHandler);

  // 1. Desktop (non-IM) session: skipped (0 sleep)
  await registeredHandler(
    { agent: { session: { id: 'desktop-sess' } } },
    async () => ({ kind: 'enter', messages: [{ id: 'm1', source: { kind: 'user' } }] }),
  );
  assert.equal(sleeps.length, 0);

  // 2. Scheduled proactive turn on IM session: skipped
  await registeredHandler(
    { agent: { session: { id: 'im-sess' } } },
    async () => ({ kind: 'enter', messages: [{ id: 'm2', source: { kind: 'schedule' } }] }),
  );
  assert.equal(sleeps.length, 0);

  // 3. Real user message on IM session: pauses once
  await registeredHandler(
    { agent: { session: { id: 'im-sess' } } },
    async () => ({ kind: 'enter', messages: [{ id: 'm3', source: { kind: 'user' } }] }),
  );
  assert.deepEqual(sleeps, [1800]);

  // 4. Duplicate pre-step for same message batch: deduplicated (no double sleep)
  await registeredHandler(
    { agent: { session: { id: 'im-sess' } } },
    async () => ({ kind: 'enter', messages: [{ id: 'm3', source: { kind: 'user' } }] }),
  );
  assert.deepEqual(sleeps, [1800]);

  // 5. Disabling preReplyPauseEnabled switch stops pausing immediately
  liveCfg = normalizeConfig({ typingDelay: { preReplyPauseEnabled: false } });
  await registeredHandler(
    { agent: { session: { id: 'im-sess' } } },
    async () => ({ kind: 'enter', messages: [{ id: 'm4', source: { kind: 'user' } }] }),
  );
  assert.deepEqual(sleeps, [1800]);
});
