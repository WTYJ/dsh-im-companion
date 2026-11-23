# dsh-im-companion

**`@xmanrui/dsh-im` 独立伴生增强插件** —— 在不修改 `@xmanrui/dsh-im` 任何原文件的前提下，基于其公开的 `ctx.dshIm`、`ctx.tools`、`ctx.systemPrompt` 与 `ctx.slots` 契约，为 QQ / 微信 / 飞书 / Telegram 等 IM 聊天机器人提供更接近真人的聊天节奏与安全管控。

原插件可以随时正常升级，不会冲掉本插件的任何配置与功能。

---

## 核心特性（全功能带独立可视化开关）

安装后可在 DSH 左下角 **「设置 → IM 增强开关」**（或插件列表页的 **「独立开关设置」** 按钮）中独立开启、关闭和调参，**所有开关修改后实时生效，无需重启 DSH**：

1. **分气泡连发 & 防复读去重（Multi-Bubble）**
   - 注册 `im_send_bubbles` 工具，让模型在想说多句短话时，先依次发出 1～3 个独立前导气泡，再把最后一句作为正常回复输出，告别“所有话塞在一个气泡里换行”的 AI 感。
   - 自动从当前会话提取投递路由，**无需手动填写 `botId` 或 `targetId`**。
   - 内置单轮气泡上限（默认 `3` 条前导 + `1` 条最终回复 = `4` 条，契合 QQ 私聊单条消息被动回复安全窗口）与同轮重复句子自动去重。
2. **拟人打字延迟（Typing Delay）**
   - 发送每个前导气泡前，按文字长度自动计算 `0.6s ～ 2.2s` 的自然打字停顿（带 `±15%` 随机抖动），既模拟真人敲字，也避免连续快发触发 QQ 频控。
3. **主动消息熔断 & 3h 间隔 & 睡眠免打扰顺延（Proactive Guard）**
   - 全局监听 `session/event`，精准区分「用户发消息」与「`schedule` 定时主动唤醒」（即便单气泡普通回复未调用分气泡工具也能 100% 计入）。
   - **未回复熔断**：当连续主动发消息达上限（默认 `3` 次）且用户未回复时，自动触发熔断暂停主动打扰；**用户一旦在 IM 回复任意消息，计数自动清零恢复**。
   - **间隔冷却与睡眠顺延**：默认每 `180 分钟（3 小时）` 可主动一次，并在系统提示词中自动帮模型算好建议的下次北京时间；若算出的时间落入睡眠免打扰时段（默认 `02:30 ～ 11:30`），**自动顺延至起床后（`11:40 ～ 12:05`）**，并在代码层拦截睡眠时段内的误触发。
4. **核心文件只读保护锁（File Guard）**
   - 开启后自动在系统文件层将机器人工作区下的核心人设/档案文件（默认 `AGENTS.md`、`关于他.md`）设为只读（`0o444`），防止模型手滑篡改核心设定，引导其将动态记忆写入 `记忆.md` 或 `日记/`。
   - 需要修改人设时，在面板中关闭该开关即可立即解锁（`0o666`）。
5. **冷会话投递目标自动兜底（Fallback Target）**
   - 当后台定时任务或冷会话无法通过 `sessionId` 获取当前绑定路由时，自动通过 `dshIm.listBots()` + `dshIm.listTargets()` 回退到已保存的默认投递目标发送。
6. **表情包助手（Sticker Helper）**
   - 自动扫描工作区 `表情/` 文件夹（忽略 `_` 开头文件），注册 `im_list_stickers` 配合官方 `dsh_im_return_file` 发送梗图；目录为空或不存在时自动静默，不污染提示词。
7. **防系统自动休眠保活（Keep Awake）**
   - 零依赖调用系统原生保活机制（macOS 使用 `/usr/bin/caffeinate -i -s -w <pid>`，Windows 使用 `SetThreadExecutionState`，Linux 使用 `systemd-inhibit`），防止电脑挂机时自动休眠导致机器人断网离线。
   - 默认允许显示器熄灭以省电（也可按需开启防熄屏）；开关关闭或 DSH 退出时自动释放，绝不残留僵尸进程。

---

## 安装方式

### 方式一：通过 GitHub 安装
在 DSH 插件页点击 **「+ 添加插件」**，填入：
```text
github:WTYJ/dsh-im-companion
```
或在命令行运行：
```bash
dsh plugin add github:WTYJ/dsh-im-companion
```

### 方式二：本地目录安装 / 开发
在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dependencies` 与 `dsh.profile.bundles` 中加入 `dsh-im-companion`，或使用：
```bash
dsh plugin add file:/path/to/dsh-im-companion
```

---

## 运行测试

```bash
npm test
```

## License

[MIT](./LICENSE)
