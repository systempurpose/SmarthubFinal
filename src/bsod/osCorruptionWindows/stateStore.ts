import fs from 'node:fs';
import path from 'node:path';

type DeviceUptimeState = {
  lastUptimeSec?: number;
  lastSeenMs?: number;
  rebootEventsMs?: number[];
};

type StoreShape = {
  version: 1;
  devices: Record<string, DeviceUptimeState>;
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function storePath(): string {
  // Local cache under the SmartHub working directory.
  return path.join(process.cwd(), '.smarthub-cache', 'bsod-os-corruption', 'uptime.json');
}

function normalizeKey(id: string): string {
  return String(id || '').trim().toLowerCase();
}

export function loadUptimeState(deviceId: string): DeviceUptimeState {
  const key = normalizeKey(deviceId);
  if (!key) return {};

  const p = storePath();
  try {
    if (!fs.existsSync(p)) return {};
    const raw = safeJsonParse<StoreShape>(fs.readFileSync(p, 'utf8'));
    if (!raw || raw.version !== 1 || !raw.devices || typeof raw.devices !== 'object') return {};
    const st = raw.devices[key];
    return st && typeof st === 'object' ? st : {};
  } catch {
    return {};
  }
}

export function saveUptimeState(deviceId: string, next: DeviceUptimeState): void {
  const key = normalizeKey(deviceId);
  if (!key) return;

  const p = storePath();
  const dir = path.dirname(p);
  ensureDir(dir);

  let store: StoreShape = { version: 1, devices: {} };
  try {
    if (fs.existsSync(p)) {
      const raw = safeJsonParse<StoreShape>(fs.readFileSync(p, 'utf8'));
      if (raw && raw.version === 1 && raw.devices && typeof raw.devices === 'object') {
        store = raw;
      }
    }
  } catch {
    // ignore
  }

  store.devices[key] = {
    lastUptimeSec: typeof next.lastUptimeSec === 'number' ? next.lastUptimeSec : undefined,
    lastSeenMs: typeof next.lastSeenMs === 'number' ? next.lastSeenMs : undefined,
    rebootEventsMs: Array.isArray(next.rebootEventsMs) ? next.rebootEventsMs.slice(-30) : undefined,
  };

  const tmp = `${p}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch {
    try {
      fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
}

export function recordRebootEvent(deviceId: string, atMs: number): { previousUptimeSec?: number; rebootEventsLast5Min: number } {
  const now = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : Date.now();
  const st = loadUptimeState(deviceId);
  const events = Array.isArray(st.rebootEventsMs) ? st.rebootEventsMs.slice() : [];
  events.push(now);

  const windowMs = 5 * 60 * 1000;
  const filtered = events.filter(t => typeof t === 'number' && Number.isFinite(t) && t >= now - windowMs);

  saveUptimeState(deviceId, { ...st, rebootEventsMs: filtered });

  return { previousUptimeSec: st.lastUptimeSec, rebootEventsLast5Min: filtered.length };
}
