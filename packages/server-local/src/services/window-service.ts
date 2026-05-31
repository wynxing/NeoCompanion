import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WindowSnapshot } from "@neo-companion/shared";

const execFileAsync = promisify(execFile);
const distractingPatterns = [/youtube/i, /bilibili/i, /douyin/i, /tiktok/i, /steam/i, /netflix/i, /shopping/i, /taobao/i];
const focusedPatterns = [/code/i, /cursor/i, /webstorm/i, /idea/i, /notepad/i, /word/i, /obsidian/i, /typora/i, /terminal/i, /powershell/i];

let lastKey = "";
let lastChangedAt = Date.now();

export async function getActiveWindowSnapshot(): Promise<WindowSnapshot> {
  const now = Date.now();
  const active = await readWindowsForegroundWindow();
  const key = `${active.processName}:${active.title}`;

  if (key !== lastKey) {
    lastKey = key;
    lastChangedAt = now;
  }

  const dwellSeconds = Math.floor((now - lastChangedAt) / 1000);
  return {
    ...active,
    capturedAt: new Date(now).toISOString(),
    dwellSeconds,
    classification: classifyWindow(active.processName, active.title, dwellSeconds)
  };
}

export function classifyWindow(processName: string, title: string, dwellSeconds: number): WindowSnapshot["classification"] {
  const haystack = `${processName} ${title}`;
  if (distractingPatterns.some((pattern) => pattern.test(haystack)) && dwellSeconds >= 30) {
    return "distracted";
  }
  if (focusedPatterns.some((pattern) => pattern.test(haystack)) && dwellSeconds >= 8 * 60) {
    return "stuck";
  }
  return "focused";
}

async function readWindowsForegroundWindow() {
  if (process.platform !== "win32") {
    return { title: "Unsupported platform", processName: process.platform };
  }

  const script = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$handle = [Win32]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 512
[void][Win32]::GetWindowText($handle, $builder, $builder.Capacity)
$processId = 0
[void][Win32]::GetWindowThreadProcessId($handle, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
[pscustomobject]@{
  title = $builder.ToString()
  processName = if ($process) { $process.ProcessName } else { "unknown" }
} | ConvertTo-Json -Compress
`;

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], { timeout: 5000 });
  const parsed = JSON.parse(stdout.trim()) as { title?: string; processName?: string };
  return {
    title: parsed.title || "Untitled",
    processName: parsed.processName || "unknown"
  };
}
