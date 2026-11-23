/**
 * dsh-im-companion — Client (browser) UI panel with grouped independent switches.
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
.dic-wrap{box-sizing:border-box;max-width:740px;padding:20px 24px 32px;color:var(--dsw-alias-label-primary,#0f1115);font-size:13px;line-height:1.5}
.dic-header{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
.dic-title{margin:0;font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}
.dic-sub{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-header-right{display:flex;align-items:center;gap:10px;flex:none}
.dic-badge{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;background:rgba(16,185,129,.14);color:#10b981;white-space:nowrap}
.dic-group{margin-bottom:20px}
.dic-group-disabled{opacity:.55}
.dic-group-title{margin:0 0 8px 2px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-card{box-sizing:border-box;padding:15px 18px;margin-bottom:10px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,#f8fafc);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.09))}
.dic-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dic-card-title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}
.dic-card-desc{margin:3px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-switch{position:relative;display:inline-flex;align-items:center;width:40px;height:22px;padding:2px;border-radius:999px;border:0;cursor:pointer;transition:background .18s ease;background:rgba(120,120,128,.32);flex:none}
.dic-switch[data-checked="true"]{background:#3b82f6}
.dic-switch:disabled{opacity:.5;cursor:default}
.dic-knob{width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s ease;transform:translateX(0)}
.dic-switch[data-checked="true"] .dic-knob{transform:translateX(18px)}
.dic-section{margin-top:12px;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.09));display:flex;flex-direction:column;gap:10px}
.dic-params{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px}
.dic-subrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.07))}
.dic-subrow-title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#0f1115)}
.dic-subrow-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:2px}
.dic-field{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dic-input{width:82px;height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#0f1115);font-size:12px;box-sizing:border-box}
.dic-input-text{width:150px}
.dic-input-time{width:68px;text-align:center}
.dic-open-btn{height:28px;padding:0 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:var(--dsw-alias-label-primary,#0f1115);font-size:12px;cursor:pointer;white-space:nowrap}
.dic-open-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dic-open-btn:disabled{opacity:.5;cursor:default}
.dic-stat-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:6px;background:rgba(59,130,246,.12);color:#3b82f6;font-size:12px;font-weight:500}
.dic-about-grid{display:grid;gap:7px;font-size:12px}
body[data-ds-dark-theme] .dic-wrap{color:var(--dsw-alias-label-primary,#f3f4f6)}
body[data-ds-dark-theme] .dic-header{border-bottom-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
body[data-ds-dark-theme] .dic-title,body[data-ds-dark-theme] .dic-card-title,body[data-ds-dark-theme] .dic-subrow-title{color:var(--dsw-alias-label-primary,#f3f4f6)}
body[data-ds-dark-theme] .dic-sub,body[data-ds-dark-theme] .dic-card-desc,body[data-ds-dark-theme] .dic-group-title,body[data-ds-dark-theme] .dic-subrow-desc,body[data-ds-dark-theme] .dic-field{color:var(--dsw-alias-label-secondary,#9ca3af)}
body[data-ds-dark-theme] .dic-card{background:var(--dsw-alias-bg-layer-2,#262629);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
body[data-ds-dark-theme] .dic-section{border-top-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
body[data-ds-dark-theme] .dic-subrow{background:var(--dsw-alias-bg-layer-1,#1c1c1e);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.08))}
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

    function CommitInput({ value, onCommit, type = 'text', className = 'dic-input', disabled, ...rest }) {
      const [draft, setDraft] = React.useState(String(value ?? ''));

      React.useEffect(() => {
        setDraft(String(value ?? ''));
      }, [value]);

      const commit = () => {
        if (String(value ?? '') === draft) return;
        onCommit(draft);
      };

      return h('input', {
        ...rest,
        type,
        className,
        disabled: Boolean(disabled),
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        },
      });
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
              setStatus('实时生效');
            } else {
              setStatus('读取配置失败');
            }
          })
          .catch(() => {
            if (!cancelled) setStatus('无法连接插件后台');
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
              setStatus('已保存');
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
              setStatus('计数已清零');
            }
          })
          .catch(() => { setSaving(false); });
      };

      if (!settings) {
        return h('div', { className: 'dic-wrap' }, h('p', null, status));
      }

      const masterOn = Boolean(settings.enabled);
      const locked = saving || !masterOn;
      const mb = settings.multiBubble || {};
      const td = settings.typingDelay || {};
      const st = settings.sticker || {};
      const pg = settings.proactiveGuard || {};
      const ft = settings.fallbackTarget || {};
      const fg = settings.fileGuard || {};
      const ka = settings.keepAwake || {};
      const idates = settings.importantDates || {};

      const toNum = (raw, fallback) => {
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
      };

      return h(
        'div',
        { className: 'dic-wrap' },

        // 顶部标题与总开关
        h(
          'div',
          { className: 'dic-header' },
          h(
            'div',
            null,
            h('h2', { className: 'dic-title' }, 'IM 伴生增强'),
            h('p', { className: 'dic-sub' }, '所有功能均可按需独立开关，修改后立即生效，无需重启'),
          ),
          h(
            'div',
            { className: 'dic-header-right' },
            h('span', { className: 'dic-badge' }, status),
            h(Switch, {
              checked: masterOn,
              disabled: saving,
              label: '插件总开关',
              onChange: (val) => updatePatch({ enabled: val }),
            }),
          ),
        ),

        // 分组一：聊天节奏与表达
        h(
          'section',
          { className: masterOn ? 'dic-group' : 'dic-group dic-group-disabled' },
          h('h4', { className: 'dic-group-title' }, '聊天节奏与表达'),

          // 分气泡连发
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '分气泡连发与防复读'),
                h('p', { className: 'dic-card-desc' }, '机器人想说多句短话时拆分为独立聊天气泡依次发出，自动过滤同轮重复句子'),
              ),
              h(Switch, {
                checked: Boolean(mb.enabled),
                disabled: locked,
                label: '分气泡连发开关',
                onChange: (val) => updatePatch({ multiBubble: { enabled: val } }),
              }),
            ),
            mb.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '单轮最多前导气泡（条）',
                      h(CommitInput, {
                        type: 'number',
                        min: 1,
                        max: 4,
                        disabled: locked,
                        value: mb.maxBubblesPerTurn ?? 3,
                        onCommit: (v) => updatePatch({ multiBubble: { maxBubblesPerTurn: toNum(v, 3) } }),
                      }),
                    ),
                  ),
                )
              : null,
          ),

          // 拟人打字延迟
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '拟人打字延迟'),
                h('p', { className: 'dic-card-desc' }, '发送消息前按字数与节奏自然停顿，模拟真人手机敲字并规避连发频控'),
              ),
              h(Switch, {
                checked: Boolean(td.enabled),
                disabled: locked,
                label: '拟人打字延迟开关',
                onChange: (val) => updatePatch({ typingDelay: { enabled: val } }),
              }),
            ),
            td.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '每字耗时（毫秒）',
                      h(CommitInput, {
                        type: 'number',
                        min: 10,
                        max: 600,
                        step: 10,
                        disabled: locked,
                        value: td.msPerChar ?? 180,
                        onCommit: (v) => updatePatch({ typingDelay: { msPerChar: toNum(v, 180) } }),
                      }),
                    ),
                    h(
                      'label',
                      { className: 'dic-field' },
                      '最短延迟（毫秒）',
                      h(CommitInput, {
                        type: 'number',
                        min: 100,
                        max: 8000,
                        step: 100,
                        disabled: locked,
                        value: td.minDelayMs ?? 1200,
                        onCommit: (v) => updatePatch({ typingDelay: { minDelayMs: toNum(v, 1200) } }),
                      }),
                    ),
                    h(
                      'label',
                      { className: 'dic-field' },
                      '最长延迟（毫秒）',
                      h(CommitInput, {
                        type: 'number',
                        min: 300,
                        max: 15000,
                        step: 100,
                        disabled: locked,
                        value: td.maxDelayMs ?? 5500,
                        onCommit: (v) => updatePatch({ typingDelay: { maxDelayMs: toNum(v, 5500) } }),
                      }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'dic-subrow' },
                    h(
                      'div',
                      null,
                      h('div', { className: 'dic-subrow-title' }, '收尾气泡前自然停顿'),
                      h('div', { className: 'dic-subrow-desc' }, '多气泡发完后补一段停顿，避免最后一句紧贴着上一句秒弹'),
                    ),
                    h(Switch, {
                      checked: td.tailPauseEnabled !== false,
                      disabled: locked,
                      label: '收尾气泡前停顿开关',
                      onChange: (val) => updatePatch({ typingDelay: { tailPauseEnabled: val } }),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'dic-subrow', style: { flexDirection: 'column', alignItems: 'stretch' } },
                    h(
                      'div',
                      { className: 'dic-row' },
                      h(
                        'div',
                        null,
                        h('div', { className: 'dic-subrow-title' }, '单句回复首步停顿'),
                        h('div', { className: 'dic-subrow-desc' }, '仅对聊天通道生效（不影响桌面端对话），减少单句消息秒回的机器感'),
                      ),
                      h(Switch, {
                        checked: td.preReplyPauseEnabled !== false,
                        disabled: locked,
                        label: '单句回复首步停顿开关',
                        onChange: (val) => updatePatch({ typingDelay: { preReplyPauseEnabled: val } }),
                      }),
                    ),
                    td.preReplyPauseEnabled !== false
                      ? h(
                          'div',
                          { className: 'dic-params', style: { marginTop: '4px' } },
                          h(
                            'label',
                            { className: 'dic-field' },
                            '首步最短（毫秒）',
                            h(CommitInput, {
                              type: 'number',
                              min: 0,
                              max: 10000,
                              step: 100,
                              disabled: locked,
                              value: td.preReplyMinMs ?? 1200,
                              onCommit: (v) => updatePatch({ typingDelay: { preReplyMinMs: toNum(v, 1200) } }),
                            }),
                          ),
                          h(
                            'label',
                            { className: 'dic-field' },
                            '首步最长（毫秒）',
                            h(CommitInput, {
                              type: 'number',
                              min: 0,
                              max: 15000,
                              step: 100,
                              disabled: locked,
                              value: td.preReplyMaxMs ?? 2400,
                              onCommit: (v) => updatePatch({ typingDelay: { preReplyMaxMs: toNum(v, 2400) } }),
                            }),
                          ),
                        )
                      : null,
                  ),
                )
              : null,
          ),

          // 表情包助手
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '表情包助手'),
                h('p', { className: 'dic-card-desc' }, '聊天情绪到位时从工作区表情目录挑选一张图片发送，目录为空时自动静默'),
              ),
              h(Switch, {
                checked: Boolean(st.enabled),
                disabled: locked,
                label: '表情包助手开关',
                onChange: (val) => updatePatch({ sticker: { enabled: val } }),
              }),
            ),
            st.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '表情目录名称',
                      h(CommitInput, {
                        type: 'text',
                        className: 'dic-input dic-input-text',
                        disabled: locked,
                        value: st.dirName ?? '表情',
                        onCommit: (v) => updatePatch({ sticker: { dirName: v.trim() || '表情' } }),
                      }),
                    ),
                  ),
                )
              : null,
          ),
        ),

        // 分组二：陪伴节奏与提醒
        h(
          'section',
          { className: masterOn ? 'dic-group' : 'dic-group dic-group-disabled' },
          h('h4', { className: 'dic-group-title' }, '陪伴节奏与提醒'),

          // 主动消息管控与睡眠免打扰
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '主动消息管控与睡眠免打扰'),
                h('p', { className: 'dic-card-desc' }, '按设定间隔主动问候，落入睡眠时段自动顺延；连续未回复达到上限即暂停，你一回复自动归零'),
              ),
              h(Switch, {
                checked: Boolean(pg.enabled),
                disabled: locked,
                label: '主动消息管控开关',
                onChange: (val) => updatePatch({ proactiveGuard: { enabled: val } }),
              }),
            ),
            pg.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-row' },
                    h(
                      'span',
                      { className: 'dic-stat-pill' },
                      `当前连续未回复：${proactiveState.unrepliedCount ?? 0} / ${pg.maxUnreplied ?? 3} 次`,
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dic-open-btn',
                        disabled: locked,
                        onClick: resetProactiveCounter,
                      },
                      '清零计数',
                    ),
                  ),
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '未回复熔断上限（次）',
                      h(CommitInput, {
                        type: 'number',
                        min: 1,
                        max: 10,
                        disabled: locked,
                        value: pg.maxUnreplied ?? 3,
                        onCommit: (v) => updatePatch({ proactiveGuard: { maxUnreplied: toNum(v, 3) } }),
                      }),
                    ),
                    h(
                      'label',
                      { className: 'dic-field' },
                      '主动冷却间隔（分钟）',
                      h(CommitInput, {
                        type: 'number',
                        min: 15,
                        max: 1440,
                        step: 15,
                        disabled: locked,
                        value: pg.cooldownMinutes ?? 180,
                        onCommit: (v) => updatePatch({ proactiveGuard: { cooldownMinutes: toNum(v, 180) } }),
                      }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'dic-subrow' },
                    h(
                      'div',
                      { className: 'dic-params' },
                      h('span', { className: 'dic-subrow-title' }, '睡眠免打扰时段（北京时间）'),
                      h(CommitInput, {
                        type: 'text',
                        className: 'dic-input dic-input-time',
                        disabled: locked || !(pg.quietHoursEnabled ?? true),
                        value: pg.quietStart ?? '02:30',
                        onCommit: (v) => updatePatch({ proactiveGuard: { quietStart: v.trim() } }),
                      }),
                      h('span', { className: 'dic-field' }, '至'),
                      h(CommitInput, {
                        type: 'text',
                        className: 'dic-input dic-input-time',
                        disabled: locked || !(pg.quietHoursEnabled ?? true),
                        value: pg.quietEnd ?? '11:30',
                        onCommit: (v) => updatePatch({ proactiveGuard: { quietEnd: v.trim() } }),
                      }),
                    ),
                    h(Switch, {
                      checked: Boolean(pg.quietHoursEnabled ?? true),
                      disabled: locked,
                      label: '睡眠免打扰开关',
                      onChange: (val) => updatePatch({ proactiveGuard: { quietHoursEnabled: val } }),
                    }),
                  ),
                )
              : null,
          ),

          // 重要日子与农历提醒
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '重要日子与农历提醒'),
                h('p', { className: 'dic-card-desc' }, '解析工作区重要日子清单，精确换算公历与农历日期（支持闰月与腊月小建回落），避免模型心算出错'),
              ),
              h(Switch, {
                checked: Boolean(idates.enabled),
                disabled: locked,
                label: '重要日子与农历提醒开关',
                onChange: (val) => updatePatch({ importantDates: { enabled: val } }),
              }),
            ),
            idates.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '清单文件名',
                      h(CommitInput, {
                        type: 'text',
                        className: 'dic-input dic-input-text',
                        disabled: locked,
                        value: idates.fileName ?? '重要日子.md',
                        onCommit: (v) => updatePatch({ importantDates: { fileName: v.trim() || '重要日子.md' } }),
                      }),
                    ),
                    h(
                      'label',
                      { className: 'dic-field' },
                      '提前查询窗口（天）',
                      h(CommitInput, {
                        type: 'number',
                        min: 1,
                        max: 120,
                        disabled: locked,
                        value: idates.windowDays ?? 30,
                        onCommit: (v) => updatePatch({ importantDates: { windowDays: toNum(v, 30) } }),
                      }),
                    ),
                  ),
                )
              : null,
          ),
        ),

        // 分组三：安全与稳定运行
        h(
          'section',
          { className: masterOn ? 'dic-group' : 'dic-group dic-group-disabled' },
          h('h4', { className: 'dic-group-title' }, '安全与稳定运行'),

          // 核心文件只读保护
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '核心文件只读保护'),
                h('p', { className: 'dic-card-desc' }, '在系统文件层将核心人设与档案文件设为只读，防止机器人误改；需要自行编辑时关闭此开关即可解锁'),
              ),
              h(Switch, {
                checked: Boolean(fg.enabled ?? true),
                disabled: locked,
                label: '核心文件只读保护开关',
                onChange: (val) => updatePatch({ fileGuard: { enabled: val } }),
              }),
            ),
          ),

          // 冷会话投递目标兜底
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '冷会话投递目标兜底'),
                h('p', { className: 'dic-card-desc' }, '后台定时任务或冷会话拿不到当前聊天绑定时，自动回退到已保存的默认投递目标发送'),
              ),
              h(Switch, {
                checked: Boolean(ft.enabled),
                disabled: locked,
                label: '冷会话投递目标兜底开关',
                onChange: (val) => updatePatch({ fallbackTarget: { enabled: val } }),
              }),
            ),
            ft.enabled
              ? h(
                  'div',
                  { className: 'dic-section' },
                  h(
                    'div',
                    { className: 'dic-params' },
                    h(
                      'label',
                      { className: 'dic-field' },
                      '优先投递目标编号（留空自动匹配）',
                      h(CommitInput, {
                        type: 'text',
                        placeholder: '留空自动选择',
                        className: 'dic-input dic-input-text',
                        disabled: locked,
                        value: ft.preferredTargetId ?? '',
                        onCommit: (v) => updatePatch({ fallbackTarget: { preferredTargetId: v.trim() } }),
                      }),
                    ),
                  ),
                )
              : null,
          ),

          // 防系统休眠保活
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '防系统休眠保活'),
                h('p', { className: 'dic-card-desc' }, '调用系统原生保活机制防止空闲休眠断网，默认允许熄屏省电，退出应用后自动释放'),
              ),
              h(Switch, {
                checked: Boolean(ka.enabled),
                disabled: locked,
                label: '防系统休眠保活开关',
                onChange: (val) => updatePatch({ keepAwake: { enabled: val } }),
              }),
            ),
            h(
              'div',
              { className: 'dic-section' },
              h(
                'div',
                { className: 'dic-row' },
                h(
                  'span',
                  { className: 'dic-stat-pill' },
                  keepAwakeStatus?.active
                    ? `保活运行中 · ${keepAwakeStatus.method || keepAwakeStatus.platform}${keepAwakeStatus.pid ? `（进程 ${keepAwakeStatus.pid}）` : ''}`
                    : (keepAwakeStatus?.error ? `启动失败：${keepAwakeStatus.error}` : '当前未开启保活'),
                ),
              ),
              ka.enabled
                ? h(
                    'div',
                    { className: 'dic-subrow' },
                    h(
                      'div',
                      null,
                      h('div', { className: 'dic-subrow-title' }, '同时阻止屏幕熄灭'),
                      h('div', { className: 'dic-subrow-desc' }, '默认关闭以节省电量，仅阻止整机睡眠断网'),
                    ),
                    h(Switch, {
                      checked: Boolean(ka.preventDisplaySleep),
                      disabled: locked,
                      label: '阻止屏幕熄灭开关',
                      onChange: (val) => updatePatch({ keepAwake: { preventDisplaySleep: val } }),
                    }),
                  )
                : null,
            ),
          ),
        ),

        // 关于
        h(
          'section',
          { className: 'dic-group' },
          h('h4', { className: 'dic-group-title' }, '关于'),
          h(
            'div',
            { className: 'dic-card' },
            h(
              'div',
              { className: 'dic-row' },
              h(
                'div',
                null,
                h('h3', { className: 'dic-card-title' }, '关于本插件'),
                h('p', { className: 'dic-card-desc' }, '面向消息通道的独立零侵入伴生增强插件，零外部依赖，全部开关实时生效'),
              ),
              meta.version ? h('span', { className: 'dic-badge' }, `v${meta.version}`) : null,
            ),
            h(
              'div',
              { className: 'dic-section dic-about-grid' },
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
