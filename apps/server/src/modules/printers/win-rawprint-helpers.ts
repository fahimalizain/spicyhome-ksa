import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Resolve the path to win_rawprint.exe.
 *
 * 1. WIN_RAWPRINT_PATH env var
 * 2. win_rawprint.exe next to current working directory
 * 3. win_rawprint.exe in bin/ subdirectory of cwd
 * 4. win_rawprint.exe in prebuilt/ subdirectory of cwd
 * 5. win_rawprint.exe next to process.execPath (for NSSM/standalone)
 *
 * Returns the full path if found, or null.
 */
export function resolveWinRawprintPath(): string | null {
  // 1. Explicit env var
  const envPath = process.env.WIN_RAWPRINT_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2-4. Relative to cwd
  const cwd = process.cwd();
  const candidatesRelative = [
    'win_rawprint.exe',
    path.join('bin', 'win_rawprint.exe'),
    path.join('prebuilt', 'win_rawprint.exe'),
  ];
  for (const rel of candidatesRelative) {
    const full = path.join(cwd, rel);
    if (fs.existsSync(full)) return full;
  }

  // 5. Next to execPath
  const execDir = path.dirname(process.execPath);
  for (const rel of candidatesRelative) {
    const full = path.join(execDir, rel);
    if (fs.existsSync(full)) return full;
  }

  return null;
}

/**
 * Check if we're on a Windows platform.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}
