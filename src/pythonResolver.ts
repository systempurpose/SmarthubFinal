import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appInstallRoot } from './serverConfig';

const execFileAsync = promisify(execFile);

export type PythonCommand = {
  exe: string;
  baseArgs: string[];
  label: string;
};

const defaultPythonExe: string = (() => {
  const venvDir = path.join(appInstallRoot, '.venv');
  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');

  // Prefer the bundled virtual environment if it exists.
  if (fsSync.existsSync(venvPython)) {
    return venvPython;
  }

  // Otherwise fall back to an explicit override or system Python.
  const fromEnv = process.env.SMART_HUB_PYTHON_EXE?.trim();
  if (fromEnv) return fromEnv;

  return process.platform === 'win32' ? 'python' : 'python3';
})();

let cachedPythonCommand: PythonCommand | null = null;

function isLikelyBrokenWindowsPythonPath(candidate: string): boolean {
  const p = (candidate || '').trim();
  if (!p) return true;
  const norm = path.normalize(p).toLowerCase();
  if (norm === 'c:\\windows\\system32\\python' || norm === 'c:\\windows\\system32\\python.exe') return true;
  if (norm.includes('\\windowsapps\\python')) return true;
  return false;
}

async function probePythonVersion(cmd: PythonCommand): Promise<{ major: number; minor: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      cmd.exe,
      [...cmd.baseArgs, '-c', 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'],
      {
        maxBuffer: 64 * 1024,
        timeout: 5000,
      } as any,
    );
    const text = String(stdout || '').trim();
    const m = text.match(/(\d+)\.(\d+)/);
    if (!m) return null;
    const major = Number.parseInt(m[1], 10);
    const minor = Number.parseInt(m[2], 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
    return { major, minor };
  } catch {
    return null;
  }
}

export async function resolvePythonCommand(): Promise<PythonCommand> {
  if (cachedPythonCommand) return cachedPythonCommand;

  const candidates: PythonCommand[] = [];
  const venvDir = path.join(appInstallRoot, '.venv');
  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');
  const hasVenv = fsSync.existsSync(venvPython);
  if (hasVenv) {
    // When the bundled venv exists, always prefer it and ignore
    // SMART_HUB_PYTHON_EXE / PYTHON_EXE to avoid picking a global
    // Python without the required dependencies.
    candidates.push({ exe: venvPython, baseArgs: [], label: venvPython });
  } else {
    const env = process.env.SMART_HUB_PYTHON_EXE?.trim();
    if (env) {
      candidates.push({ exe: env, baseArgs: [], label: env });
    }

    const legacyEnv = process.env.PYTHON_EXE?.trim();
    if (legacyEnv) {
      candidates.push({ exe: legacyEnv, baseArgs: [], label: legacyEnv });
    }
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', ['python'], {
        maxBuffer: 256 * 1024,
        timeout: 5000,
      } as any);
      const lines = String(stdout || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        candidates.push({ exe: line, baseArgs: [], label: line });
      }
    } catch {
      // ignore
    }

    candidates.push({ exe: 'py', baseArgs: ['-3'], label: 'py -3' });
  }

  candidates.push({ exe: defaultPythonExe, baseArgs: [], label: defaultPythonExe });
  if (process.platform !== 'win32') {
    candidates.push({ exe: 'python', baseArgs: [], label: 'python' });
  }

  const seen = new Set<string>();
  const unique: PythonCommand[] = [];
  for (const c of candidates) {
    const key = `${c.exe}::${c.baseArgs.join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const viable: Array<{ cmd: PythonCommand; ver: { major: number; minor: number } }> = [];
  for (const c of unique) {
    if (process.platform === 'win32' && isLikelyBrokenWindowsPythonPath(c.exe)) continue;
    const ver = await probePythonVersion(c);
    if (!ver) continue;
    if (ver.major > 3 || (ver.major === 3 && ver.minor >= 8)) {
      viable.push({ cmd: c, ver });
    }
  }

  if (viable.length) {
    const preferred = viable.filter(v => v.ver.major === 3 && v.ver.minor <= 13);
    const pool = preferred.length ? preferred : viable;
    let best = pool[0];
    for (const item of pool) {
      if (item.ver.major > best.ver.major) best = item;
      else if (item.ver.major === best.ver.major && item.ver.minor > best.ver.minor) best = item;
    }
    cachedPythonCommand = best.cmd;
    return cachedPythonCommand;
  }

  cachedPythonCommand = { exe: defaultPythonExe, baseArgs: [], label: defaultPythonExe };
  return cachedPythonCommand;
}
