/**
 * dsh-im-companion — Client (browser) UI panel with independent feature switches.
 *
 * Mounts:
 * 1. `settings.section` (order: 22, right below "IM机器人"): "IM 增强开关"
 * 2. `main` panel + `plugins.detail.actions` button: "独立开关设置" in Plugins page
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-companion',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;

    const React = require('react');
    const h = React.createElement;

    const SETTINGS_ROUTE = '/dsh-im-companion/settings';
    const PANEL_ID = 'dsh-im-companion-panel';
    const PACKAGE_NAME = 'dsh-im-companion';

    const CSS = `
.dic-wrap{box-sizing:border-box;max-width:720px;padding:20px 24px;color:var(--dsw-alias-label-primary,#0f1115);font-size:13px;line-height:1.5}
.dic-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.dic-title{margin:0;font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}
.dic-sub{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-badge{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;background:rgba(16,185,129,.14);color:#10b981}
.dic-card{box-sizing:border-box;padding:16px 18px;margin-bottom:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,#f8fafc);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.09))}
.dic-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dic-card-title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}
.dic-card-desc{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-switch{position:relative;display:inline-flex;align-items:center;width:40px;height:22px;padding:2px;border-radius:999px;border:0;cursor:pointer;transition:background .18s ease;background:rgba(120,120,128,.32);flex:none}
.dic-switch[data-checked="true"]{background:#3b82f6}
.dic-switch:disabled{opacity:.5;cursor:default}
.dic-knob{width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s ease;transform:translateX(0)}
.dic-switch[data-checked="true"] .dic-knob{transform:translateX(18px)}
.dic-params{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.09))}
.dic-field{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-input{width:76px;height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#0f1115);font-size:12px}
.dic-input-text{width:130px}
.dic-open-btn{height:28px;padding:0 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:var(--dsw-alias-label-primary,#0f1115);font-size:12px;cursor:pointer}
.dic-open-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dic-stat-pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:6px;background:rgba(59,130,246,.12);color:#3b82f6;font-size:12px;font-weight:500}
body[data-ds-dark-theme] .dic-wrap{color:var(--dsw-alias-label-primary,#f3f4f6)}
body[data-ds-dark-theme] .dic-title,body[data-ds-dark-theme] .dic-card-title{color:var(--dsw-alias-label-primary,#f3f4f6)}
body[data-ds-dark-theme] .dic-sub,body[data-ds-dark-theme] .dic-card-desc,body[data-ds-dark-theme] .dic-field{color:var(--dsw-alias-label-secondary,#9ca3af)}
body[data-ds-dark-theme] .dic-card{background:var(--dsw-alias-bg-layer-2,#262629);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
body[data-ds-dark-theme] .dic-params{border-top-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
body[data-ds-dark-theme] .dic-input{background:var(--dsw-alias-bg-layer-1,#1c1c1e);color:var(--dsw-alias-label-primary,#f3f4f6);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.16))}
body[data-ds-dark-theme] .dic-open-btn{color:var(--dsw-alias-label-primary,#f3f4f6);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.16))}
`;

    function Switch({ checked, disabled, onChange, label }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': Boolean(checked),
          'aria-label': label,
          'data-checked': Boolean(checked) ? 'true' : 'false',
          className: 'dic-switch',
          disabled: Boolean(disabled),
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dic-knob' }),
      );
    }

    function CompanionSettingsPanel() {
      const [meta, setMeta] = React.useState({
        name: PACKAGE_NAME,
        version: '',
        license: 'MIT',
        homepage: 'https://github.com/WTYJ/dsh-im-companion',
      });
      const [settings, setSettings] = React.useState(null);
      const [proactiveState, setProactiveState] = React.useState({ unrepliedCount: 0 });
      const [keepAwakeStatus, setKeepAwakeStatus] = React.useState(null);
      const [status, setStatus] = React.useState('加载中…');
      const [saving, setSaving] = React.useState(false);

      React.useEffect(() => {
        let cancelled = false;
        fetch(SETTINGS_ROUTE, { method: 'GET', credentials: 'same-origin' })
          .then((r) => r.json())
          .then((data) => {
            if (cancelled) return;
            if (data?.ok && data.settings) {
              if (data.meta) setMeta(data.meta);
              setSettings(data.settings);
              if (data.proactiveState) setProactiveState(data.proactiveState);
              if (data.keepAwakeStatus) setKeepAwakeStatus(data.keepAwakeStatus);
              setStatus('全部开关实时生效，无需重启');
            } else {
              setStatus('读取配置失败');
            }
          })
          .catch(() => {
            if (!cancelled) setStatus('无法连接插件后台服务');
          });
        return () => { cancelled = true; };
      }, []);

      const updatePatch = (patch) => {
        if (!settings) return;
        const optimistic = {
          ...settings,
          ...patch,
          multiBubble: { ...settings.multiBubble, ...(patch.multiBubble || {}) },
          typingDelay: { ...settings.typingDelay, ...(patch.typingDelay || {}) },
          sticker: { ...settings.sticker, ...(patch.sticker || {}) },
          proactiveGuard: { ...settings.proactiveGuard, ...(patch.proactiveGuard || {}) },
          fallbackTarget: { ...settings.fallbackTarget, ...(patch.fallbackTarget || {}) },
          fileGuard: { ...settings.fileGuard, ...(patch.fileGuard || {}) },
          keepAwake: { ...settings.keepAwake, ...(patch.keepAwake || {}) },
          importantDates: { ...settings.importantDates, ...(patch.importantDates || {}) },
        };
        setSettings(optimistic);
        setSaving(true);
        setStatus('保存中…');
        fetch(SETTINGS_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
          .then((r) => r.json())
          .then((data) => {
            setSaving(false);
            if (data?.ok && data.settings) {
              setSettings(data.settings);
              if (data.proactiveState) setProactiveState(data.proactiveState);
              if (data.keepAwakeStatus) setKeepAwakeStatus(data.keepAwakeStatus);
              setStatus('✓ 已保存并实时生效');
            } else {
              setStatus('保存失败');
            }
          })
          .catch(() => {
            setSaving(false);
            setStatus('保存请求失败');
          });
      };

      const resetProactiveCounter = () => {
        setSaving(true);
        fetch(SETTINGS_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resetProactiveState' }),
        })
          .then((r) => r.json())
          .then((data) => {
            setSaving(false);
            if (data?.ok && data.proactiveState) {
              setProactiveState(data.proactiveState);
              setStatus('✓ 未回复计数已清零');
            }
          })
          .catch(() => { setSaving(false); });
      };

      if (!settings) {
        return h('div', { className: 'dic-wrap' }, h('p', null, status));
      }

      const mb = settings.multiBubble || {};
      const td = settings.typingDelay || {};
      const st = settings.sticker || {};
      const pg = settings.proactiveGuard || {};
      const ft = settings.fallbackTarget || {};
      const fg = settings.fileGuard || {};
      const ka = settings.keepAwake || {};
      const idates = settings.importantDates || {};

      return h(
        'div',
        { className: 'dic-wrap' },
        h(
          'div',
          { className: 'dic-header' },
          h(
            'div',
            null,
            h('h2', { className: 'dic-title' }, 'IM 增强独立开关（小鱼伴侣）'),
            h('p', { className: 'dic-sub' }, '每个功能均可独立开启或关闭，修改后立即生效'),
          ),
          h('span', { className: 'dic-badge' }, status),
        ),

        // 独立开关 1：分气泡连发 + 防复读去重
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '1. 分气泡连发 & 防复读去重（Multi-Bubble）'),
              h('p', { className: 'dic-card-desc' }, '开启后，小鱼想说多句话时会拆成多个独立聊天气泡依次发出，并自动过滤同一轮重复气泡'),
            ),
            h(Switch, {
              checked: Boolean(mb.enabled),
              disabled: saving,
              label: '分气泡连发开关',
              onChange: (val) => updatePatch({ multiBubble: { enabled: val } }),
            }),
          ),
          mb.enabled
            ? h(
                'div',
                { className: 'dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '单轮最多前导气泡数（1～4）：',
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 4,
                    className: 'dic-input',
                    value: mb.maxBubblesPerTurn ?? 3,
                    onChange: (e) => updatePatch({ multiBubble: { maxBubblesPerTurn: Number(e.target.value) || 3 } }),
                  }),
                ),
              )
            : null,
        ),

        // 独立开关 2：拟人打字延迟
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '2. 拟人打字延迟（Typing Delay）'),
              h('p', { className: 'dic-card-desc' }, '开启后，发送每个气泡前按字数自动等待 0.6～2.2 秒模拟真人敲字，同时规避 QQ 连发限流'),
            ),
            h(Switch, {
              checked: Boolean(td.enabled),
              disabled: saving,
              label: '拟人打字延迟开关',
              onChange: (val) => updatePatch({ typingDelay: { enabled: val } }),
            }),
          ),
          td.enabled
            ? h(
                'div',
                { className: 'dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '最短延迟 (ms)：',
                  h('input', {
                    type: 'number',
                    min: 100,
                    max: 5000,
                    step: 100,
                    className: 'dic-input',
                    value: td.minDelayMs ?? 600,
                    onChange: (e) => updatePatch({ typingDelay: { minDelayMs: Number(e.target.value) || 600 } }),
                  }),
                ),
                h(
                  'label',
                  { className: 'dic-field' },
                  '最长延迟 (ms)：',
                  h('input', {
                    type: 'number',
                    min: 300,
                    max: 10000,
                    step: 100,
                    className: 'dic-input',
                    value: td.maxDelayMs ?? 2200,
                    onChange: (e) => updatePatch({ typingDelay: { maxDelayMs: Number(e.target.value) || 2200 } }),
                  }),
                ),
                h(
                  'label',
                  { className: 'dic-field' },
                  '每字耗时 (ms)：',
                  h('input', {
                    type: 'number',
                    min: 10,
                    max: 300,
                    step: 5,
                    className: 'dic-input',
                    value: td.msPerChar ?? 65,
                    onChange: (e) => updatePatch({ typingDelay: { msPerChar: Number(e.target.value) || 65 } }),
                  }),
                ),
              )
            : null,
        ),

        // 独立开关 3：主动消息熔断与 3h 冷却 + 睡眠免打扰顺延
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '3. 主动消息熔断 & 3h 间隔 & 睡眠免打扰顺延（Proactive Guard）'),
              h('p', { className: 'dic-card-desc' }, '每隔 3h 可主动找你一次（落入睡眠时段自动顺延到起床后）；连续未回满 3 次即熔断，你一回复自动归零'),
            ),
            h(Switch, {
              checked: Boolean(pg.enabled),
              disabled: saving,
              label: '主动消息熔断开关',
              onChange: (val) => updatePatch({ proactiveGuard: { enabled: val } }),
            }),
          ),
          pg.enabled
            ? h(
                'div',
                { className: 'dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '未回复最多主动次数：',
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 10,
                    className: 'dic-input',
                    value: pg.maxUnreplied ?? 3,
                    onChange: (e) => updatePatch({ proactiveGuard: { maxUnreplied: Number(e.target.value) || 3 } }),
                  }),
                ),
                h(
                  'label',
                  { className: 'dic-field' },
                  '主动间隔 (分钟，180=3h)：',
                  h('input', {
                    type: 'number',
                    min: 15,
                    max: 1440,
                    step: 15,
                    className: 'dic-input',
                    value: pg.cooldownMinutes ?? 180,
                    onChange: (e) => updatePatch({ proactiveGuard: { cooldownMinutes: Number(e.target.value) || 180 } }),
                  }),
                ),
                h(
                  'label',
                  { className: 'dic-field' },
                  '睡眠免打扰：',
                  h(Switch, {
                    checked: Boolean(pg.quietHoursEnabled ?? true),
                    disabled: saving,
                    label: '睡眠免打扰子开关',
                    onChange: (val) => updatePatch({ proactiveGuard: { quietHoursEnabled: val } }),
                  }),
                  h('input', {
                    type: 'text',
                    className: 'dic-input',
                    value: pg.quietStart ?? '02:30',
                    onChange: (e) => updatePatch({ proactiveGuard: { quietStart: e.target.value } }),
                  }),
                  '～',
                  h('input', {
                    type: 'text',
                    className: 'dic-input',
                    value: pg.quietEnd ?? '11:30',
                    onChange: (e) => updatePatch({ proactiveGuard: { quietEnd: e.target.value } }),
                  }),
                ),
                h(
                  'span',
                  { className: 'dic-stat-pill' },
                  `当前未回复主动次数：${proactiveState.unrepliedCount ?? 0} / ${pg.maxUnreplied ?? 3}`,
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dic-open-btn',
                    disabled: saving,
                    onClick: resetProactiveCounter,
                  },
                  '手动清零计数',
                ),
              )
            : null,
        ),

        // 独立开关 4：核心文件只读锁（保护 AGENTS.md 和 关于他.md）
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '4. 核心文件只读保护锁（File Guard）'),
              h('p', { className: 'dic-card-desc' }, '开启后在系统层将 AGENTS.md 与 关于他.md 设为只读，禁止小鱼误改；你想修改时关闭此开关即可解锁'),
            ),
            h(Switch, {
              checked: Boolean(fg.enabled ?? true),
              disabled: saving,
              label: '核心文件只读保护锁开关',
              onChange: (val) => updatePatch({ fileGuard: { enabled: val } }),
            }),
          ),
        ),

        // 独立开关 5：冷会话默认投递目标自动兜底
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '5. 冷会话投递目标自动兜底（Fallback Target）'),
              h('p', { className: 'dic-card-desc' }, '开启后，当后台定时任务或冷会话拿不到当前聊天绑定时，自动回退到已保存的 QQ 投递目标发送'),
            ),
            h(Switch, {
              checked: Boolean(ft.enabled),
              disabled: saving,
              label: '投递目标自动兜底开关',
              onChange: (val) => updatePatch({ fallbackTarget: { enabled: val } }),
            }),
          ),
          ft.enabled
            ? h(
                'div',
                { className: 'dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '指定优先 Target ID（留空自动选第一个）：',
                  h('input', {
                    type: 'text',
                    placeholder: '留空自动匹配',
                    className: 'dic-input dic-input-text',
                    value: ft.preferredTargetId ?? '',
                    onChange: (e) => updatePatch({ fallbackTarget: { preferredTargetId: e.target.value } }),
                  }),
                ),
              )
            : null,
        ),

        // 独立开关 6：表情包助手
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '6. 表情包助手（Sticker Helper）'),
              h('p', { className: 'dic-card-desc' }, '开启后，小鱼可在情绪到位时从工作区表情文件夹里挑一张梗图发出（目录为空时自动静默）'),
            ),
            h(Switch, {
              checked: Boolean(st.enabled),
              disabled: saving,
              label: '表情包助手开关',
              onChange: (val) => updatePatch({ sticker: { enabled: val } }),
            }),
          ),
          st.enabled
            ? h(
                'div',
                { className: 'dic-field dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '表情文件夹名称：',
                  h('input', {
                    type: 'text',
                    className: 'dic-input dic-input-text',
                    value: st.dirName ?? '表情',
                    onChange: (e) => updatePatch({ sticker: { dirName: e.target.value || '表情' } }),
                  }),
                ),
              )
            : null,
        ),

        // 独立开关 7：防系统自动休眠保活（macOS caffeinate / Windows / Linux）
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '7. 防系统自动休眠保活（Keep Awake）'),
              h('p', { className: 'dic-card-desc' }, '阻止电脑空闲自动休眠断网（macOS 原生 caffeinate -i -s -w，Windows 原生电源保活），默认允许熄屏省电，DSH 退出自动释放'),
            ),
            h(Switch, {
              checked: Boolean(ka.enabled),
              disabled: saving,
              label: '防自动休眠开关',
              onChange: (val) => updatePatch({ keepAwake: { enabled: val } }),
            }),
          ),
          h(
            'div',
            { className: 'dic-params' },
            h(
              'span',
              { className: 'dic-stat-pill' },
              keepAwakeStatus?.active
                ? `保活运行中 · ${keepAwakeStatus.method || keepAwakeStatus.platform}${keepAwakeStatus.pid ? ` (PID ${keepAwakeStatus.pid})` : ''}`
                : (keepAwakeStatus?.error ? `启动失败：${keepAwakeStatus.error}` : '当前未开启保活'),
            ),
            ka.enabled
              ? h(
                  'label',
                  { className: 'dic-field' },
                  '同时阻止屏幕熄灭（默认关闭更省电）：',
                  h(Switch, {
                    checked: Boolean(ka.preventDisplaySleep),
                    disabled: saving,
                    label: '阻止屏幕熄灭开关',
                    onChange: (val) => updatePatch({ keepAwake: { preventDisplaySleep: val } }),
                  }),
                )
              : null,
          ),
        ),

        // 独立开关 8：重要日子与农历提醒
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, '8. 重要日子与农历提醒（Important Dates & Lunar）'),
              h('p', { className: 'dic-card-desc' }, '自动解析工作区重要日子清单，精确换算公历与农历日期（支持闰月与腊月小建回落），避免大模型心算农历出错'),
            ),
            h(Switch, {
              checked: Boolean(idates.enabled),
              disabled: saving,
              label: '重要日子与农历提醒开关',
              onChange: (val) => updatePatch({ importantDates: { enabled: val } }),
            }),
          ),
          idates.enabled
            ? h(
                'div',
                { className: 'dic-params' },
                h(
                  'label',
                  { className: 'dic-field' },
                  '清单文件名：',
                  h('input', {
                    type: 'text',
                    className: 'dic-input dic-input-text',
                    value: idates.fileName ?? '重要日子.md',
                    onChange: (e) => updatePatch({ importantDates: { fileName: e.target.value || '重要日子.md' } }),
                  }),
                ),
                h(
                  'label',
                  { className: 'dic-field' },
                  '查询窗口（天）：',
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 120,
                    className: 'dic-input',
                    value: idates.windowDays ?? 30,
                    onChange: (e) => updatePatch({ importantDates: { windowDays: Number(e.target.value) || 30 } }),
                  }),
                ),
              )
            : null,
        ),

        // 关于
        h(
          'div',
          { className: 'dic-card' },
          h(
            'div',
            { className: 'dic-row' },
            h(
              'div',
              null,
              h('h3', { className: 'dic-card-title' }, 'ℹ️ 关于'),
              h('p', { className: 'dic-card-desc' }, 'DSH (@xmanrui/dsh-im) 独立零侵入伴生增强插件：零外部 npm 运行时依赖，全部开关实时热生效。'),
            ),
            meta.version ? h('span', { className: 'dic-badge' }, `v${meta.version}`) : null,
          ),
          h(
            'div',
            { className: 'dic-params', style: { display: 'grid', gap: '6px', width: '100%' } },
            h(
              'div',
              { className: 'dic-row' },
              h('span', { className: 'dic-field' }, '插件包名'),
              h('code', null, meta.name || PACKAGE_NAME),
            ),
            h(
              'div',
              { className: 'dic-row' },
              h('span', { className: 'dic-field' }, '当前版本'),
              h('span', null, meta.version ? `v${meta.version}` : '未知'),
            ),
            h(
              'div',
              { className: 'dic-row' },
              h('span', { className: 'dic-field' }, '开源协议'),
              h('span', null, meta.license || 'MIT'),
            ),
            h(
              'div',
              { className: 'dic-row' },
              h('span', { className: 'dic-field' }, '项目仓库'),
              h(
                'a',
                {
                  href: meta.homepage || 'https://github.com/WTYJ/dsh-im-companion',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: { color: '#3b82f6', textDecoration: 'none' },
                },
                'github.com/WTYJ/dsh-im-companion',
              ),
            ),
          ),
        ),
      );
    }

    function OpenCompanionButton({ subject, onOpen }) {
      if (subject?.kind !== 'bundle' && subject?.kind !== 'row') return null;
      if (subject.pkg?.name !== PACKAGE_NAME) return null;
      if (subject.kind === 'row' && subject.row?.moduleName !== PACKAGE_NAME) return null;
      return h(
        'button',
        {
          type: 'button',
          className: 'dic-open-btn',
          onClick: onOpen,
        },
        '独立开关设置',
      );
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin', PACKAGE_NAME);
        style.textContent = CSS;
        document.head.append(style);
        return () => style.remove();
      }, `${PACKAGE_NAME}: stylesheet`);

      // 1. Register inside Settings -> "IM 增强开关"
      if (ctx?.slots?.inject) {
        ctx.effect(
          () =>
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: 'dsh-im-companion-settings',
                  order: 22,
                  label: () => 'IM 增强开关',
                },
                CompanionSettingsPanel,
              ),
            ),
          `${PACKAGE_NAME}: settings.section`,
        );
      }

      // 2. Also register a dedicated page & "独立开关设置" button on the Plugins card
      if (typeof ctx?.inject === 'function') {
        ctx.inject(['layout'], (pageCtx) => {
          pageCtx.slots.inject('main', () => {
            const unregMain = pageCtx.slots.register(
              {
                name: 'main',
                key: PANEL_ID,
              },
              CompanionSettingsPanel,
            );
            const stopAction = pageCtx.slots.inject('plugins.detail.actions', () =>
              pageCtx.slots.register(
                {
                  name: 'plugins.detail.actions',
                  id: 'dsh-im-companion-open',
                  order: 20,
                  inject: () => ({
                    onOpen: () => pageCtx.layout.selectPanel(PANEL_ID),
                  }),
                },
                OpenCompanionButton,
              ),
            );
            return () => {
              stopAction();
              unregMain();
            };
          });
        });
      }
    }

    exports.name = 'dsh-im-companion-client';
    exports.inject = ['slots', 'locale'];
    exports.apply = apply;
    return module.exports;
  },
});
