import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ActiveAppInfo {
  appName: string;
  windowTitle: string;
}

export class ActiveAppService {
  async getActiveApp(): Promise<ActiveAppInfo | undefined> {
    try {
      if (process.platform === 'win32') {
        return this.getWindowsActiveApp();
      }

      if (process.platform === 'darwin') {
        return this.getMacActiveApp();
      }
    } catch (error) {
      console.warn('Active app detection failed:', error);
    }

    return undefined;
  }

  private async getWindowsActiveApp(): Promise<ActiveAppInfo | undefined> {
    const script = `
      Add-Type @"
      using System;
      using System.Text;
      using System.Runtime.InteropServices;
      public class ForegroundWindow {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
      }
"@
      $handle = [ForegroundWindow]::GetForegroundWindow()
      $builder = New-Object System.Text.StringBuilder 512
      [void][ForegroundWindow]::GetWindowText($handle, $builder, $builder.Capacity)
      [uint32]$processId = 0
      [void][ForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      [PSCustomObject]@{ appName = $process.ProcessName; windowTitle = $builder.ToString() } | ConvertTo-Json -Compress
    `;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      timeout: 2_000,
      windowsHide: true
    });

    return parseActiveApp(stdout);
  }

  private async getMacActiveApp(): Promise<ActiveAppInfo | undefined> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
      end tell
      return appName
    `;
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 2_000 });
    const appName = stdout.trim();
    return appName ? { appName, windowTitle: '' } : undefined;
  }
}

function parseActiveApp(raw: string): ActiveAppInfo | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as Partial<ActiveAppInfo>;
  if (!parsed.appName) {
    return undefined;
  }

  return {
    appName: parsed.appName,
    windowTitle: parsed.windowTitle ?? ''
  };
}
