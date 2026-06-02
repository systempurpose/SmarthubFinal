import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type FastbootVars = {
  ok: boolean;
  error?: string;
  unlocked?: boolean;
  sampleLines?: string[];
};

function parseUnlocked(lines: string[]): boolean | undefined {
  // Common outputs (varies by OEM/fastboot):
  // - unlocked: yes
  // - (bootloader) unlocked: yes
  // - (bootloader) Device unlocked: true
  // - device unlocked: true
  for (const raw of lines) {
    const line = String(raw || '').trim();
    const lower = line.toLowerCase();
    if (!lower) continue;

    if (lower.includes('unlocked')) {
      if (/(unlocked\s*:\s*yes)|(device unlocked\s*:\s*true)|(unlocked\s*:\s*true)/i.test(line)) return true;
      if (/(unlocked\s*:\s*no)|(device unlocked\s*:\s*false)|(unlocked\s*:\s*false)/i.test(line)) return false;
    }
  }
  return undefined;
}

export async function getFastbootVars(deviceId: string, timeoutMs: number): Promise<FastbootVars> {
  const id = String(deviceId || '').trim();
  if (!id) return { ok: false, error: 'No fastboot device id provided' };

  try {
    const { stdout, stderr } = await execFileAsync('fastboot', ['-s', id, 'getvar', 'all'], {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });

    const text = [String(stdout || ''), String(stderr || '')].filter(Boolean).join('\n');
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const unlocked = parseUnlocked(lines);
    return {
      ok: true,
      unlocked,
      sampleLines: lines.slice(0, 40),
    };
  } catch (e: any) {
    const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
    const msg = String(e?.message || stderr || 'fastboot getvar failed');
    return { ok: false, error: msg.split(/\r?\n/)[0] };
  }
}
