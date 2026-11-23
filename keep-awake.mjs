import { spawn } from 'node:child_process';

/**
 * Build the OS-native keep-awake command without any external dependencies.
 * - macOS:   `/usr/bin/caffeinate -i -s [-d] -w <pid>` (auto-exits if host dies)
 * - Windows: PowerShell loop holding `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED [| ES_DISPLAY_REQUIRED])`
 * - Linux:   `systemd-inhibit --what=idle:sleep --mode=block sleep infinity`
 */
export function buildKeepAwakeCommand({
  platform = process.platform,
  pid = process.pid,
  preventDisplaySleep = false,
} = {}) {
  if (platform === 'darwin') {
    const args = ['-i', '-s'];
    if (preventDisplaySleep) args.push('-d');
    args.push('-w', String(pid));
    return { command: '/usr/bin/caffeinate', args, label: 'macOS caffeinate' };
  }

  if (platform === 'win32') {
    // ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001) [| ES_DISPLAY_REQUIRED (0x00000002)]
    const flags = preventDisplaySleep ? '2147483651' : '2147483649';
    const script = [
      'Add-Type -Namespace DshCompanion -Name Power -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);\';',
      `[DshCompanion.Power]::SetThreadExecutionState([uint32]${flags}) | Out-Null;`,
      'while ($true) { Start-Sleep -Seconds 60 }',
    ].join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      label: 'Windows SetThreadExecutionState',
    };
  }

  if (platform === 'linux') {
    const what = preventDisplaySleep ? 'idle:sleep:handle-lid-switch' : 'idle:sleep';
    return {
      command: 'systemd-inhibit',
      args: [`--what=${what}`, '--who=dsh-im-companion', '--why=Keep IM bot online', '--mode=block', 'sleep', 'infinity'],
      label: 'Linux systemd-inhibit',
    };
  }

  return null;
}

export function createKeepAwakeManager({
  platform = process.platform,
  pid = process.pid,
  spawnFn = spawn,
  logger = console,
} = {}) {
  let child = null;
  let activeKey = null;
  let lastError = null;
  let label = null;

  const stop = () => {
    const current = child;
    child = null;
    activeKey = null;
    if (current) {
      try {
        current.kill();
      } catch {
        // already exited
      }
    }
  };

  const apply = (keepAwakeConfig = {}) => {
    const enabled = Boolean(keepAwakeConfig?.enabled);
    const preventDisplaySleep = Boolean(keepAwakeConfig?.preventDisplaySleep);

    if (!enabled) {
      stop();
      lastError = null;
      return getStatus();
    }

    const desiredKey = `${platform}:${preventDisplaySleep ? 'display' : 'system'}`;
    if (child && activeKey === desiredKey) {
      return getStatus();
    }

    stop();
    lastError = null;

    const spec = buildKeepAwakeCommand({ platform, pid, preventDisplaySleep });
    if (!spec) {
      lastError = `Unsupported platform: ${platform}`;
      return getStatus();
    }

    label = spec.label;
    try {
      const proc = spawnFn(spec.command, spec.args, {
        stdio: 'ignore',
        windowsHide: true,
      });
      child = proc;
      activeKey = desiredKey;

      proc?.on?.('error', (err) => {
        if (child === proc) {
          child = null;
          activeKey = null;
        }
        lastError = String(err?.message ?? err);
        logger?.warn?.(`[dsh-im-companion] keep-awake process error: ${lastError}`);
      });

      proc?.on?.('exit', () => {
        if (child === proc) {
          child = null;
          activeKey = null;
        }
      });

      proc?.unref?.();
    } catch (err) {
      child = null;
      activeKey = null;
      lastError = String(err?.message ?? err);
      logger?.warn?.(`[dsh-im-companion] failed to start keep-awake: ${lastError}`);
    }

    return getStatus();
  };

  const getStatus = () => ({
    supported: ['darwin', 'win32', 'linux'].includes(platform),
    active: child !== null,
    platform,
    method: label ?? buildKeepAwakeCommand({ platform, pid })?.label ?? null,
    pid: child?.pid ?? null,
    error: lastError,
  });

  return {
    apply,
    stop,
    getStatus,
  };
}
