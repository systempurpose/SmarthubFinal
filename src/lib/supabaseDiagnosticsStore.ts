import fsSync from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type DiagnosticsCloudConfig = {
  url: string;
  apiKey: string;
  table: string;
  keySource: 'service_role' | 'anon' | 'none';
  configured: boolean;
};

type CloudRunRow = {
  payload: unknown;
  run_id: number | string | null;
  run_timestamp: number | string | null;
  created_at?: string | null;
};

type SaveRunParams = {
  ownerUserId: string;
  diagnosticType: string;
  deviceId: string;
  runId: number;
  runTimestamp: number;
  payload: unknown;
};

type FetchRunsParams = {
  ownerUserId: string;
  diagnosticType: string;
  deviceId: string;
  limit?: number;
};

type SaveRunResult = {
  ok: boolean;
  skipped: boolean;
  error?: string;
};

type FetchRunsResult<T> = {
  ok: boolean;
  runs: T[];
  error?: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = '';

function tableCandidates(primary: string): string[] {
  const p = String(primary || '').trim();
  const out = new Set<string>();
  if (p) out.add(p);
  out.add('diagnostic_runs');
  out.add('runs');
  return Array.from(out);
}

function isMissingTableError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('could not find the table')
    || m.includes('relation') && m.includes('does not exist')
    || m.includes('schema cache')
  );
}

function isMissingColumnError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return m.includes('column') && m.includes('does not exist');
}

function isDeviceForeignKeyError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    (m.includes('foreign key constraint') && m.includes('device_id'))
    || m.includes('diagnostic_runs_device_id_fkey')
    || m.includes('runs_device_id_fkey')
  );
}

function isOwnerForeignKeyError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    (m.includes('foreign key constraint') && m.includes('owner_user_id'))
    || m.includes('diagnostic_runs_owner_user_id_fkey')
    || m.includes('runs_owner_user_id_fkey')
  );
}

function isRunForeignKeyError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    (m.includes('foreign key constraint') && m.includes('run_id'))
    || m.includes('diagnostic_runs_run_id_fkey')
  );
}

function inferDeviceLabel(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fallback;
  }

  const src = payload as Record<string, unknown>;
  const direct = src.deviceLabel;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  const nested = src.device;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const obj = nested as Record<string, unknown>;
    const label = obj.label;
    if (typeof label === 'string' && label.trim()) {
      return label.trim();
    }
  }

  return fallback;
}

async function ensureDeviceReference(
  client: SupabaseClient,
  deviceId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(deviceId || '').trim();
  if (!id) {
    return { ok: false, error: 'Missing device id for foreign-key reference.' };
  }

  const now = new Date().toISOString();
  const label = inferDeviceLabel(payload, id);
  const row = {
    device_id: id,
    device_label: label,
    first_seen_at: now,
    last_seen_at: now,
  };

  const candidates = ['devices', 'device'];
  let last = '';
  for (const table of candidates) {
    const full = await client
      .from(table)
      .upsert(row, { onConflict: 'device_id', ignoreDuplicates: true });
    if (!full.error) {
      return { ok: true };
    }

    const msg = String(full.error.message || '');
    last = msg || last;

    if (isMissingTableError(msg)) {
      continue;
    }

    const permissionDenied = msg.toLowerCase().includes('permission denied')
      || msg.toLowerCase().includes('row-level security')
      || msg.toLowerCase().includes('not allowed');
    if (permissionDenied) {
      return {
        ok: false,
        error: `${msg} (grant insert/select on public.${table} and add RLS insert/select policies for anon/authenticated, or use service-role key on backend)`,
      };
    }

    const missingColumns = msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist');
    if (!missingColumns) {
      return { ok: false, error: msg || `Failed to upsert ${table} row.` };
    }

    const minimal = await client
      .from(table)
      .upsert({ device_id: id }, { onConflict: 'device_id', ignoreDuplicates: true });
    if (!minimal.error) {
      return { ok: true };
    }

    last = String(minimal.error.message || last || `Failed to upsert ${table} row.`);
    if (!isMissingTableError(last)) {
      return { ok: false, error: last };
    }
  }

  return { ok: false, error: last || "Could not find table 'public.devices' or 'public.device' in schema cache" };
}

async function ensureOwnerReference(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(ownerUserId || '').trim();
  if (!id) {
    return { ok: false, error: 'Missing owner user id for foreign-key reference.' };
  }

  const now = new Date().toISOString();
  const candidates = ['app_users', 'app_user'];
  let last = '';

  for (const table of candidates) {
    const full = await client
      .from(table)
      .upsert({ owner_user_id: id, created_at: now }, { onConflict: 'owner_user_id', ignoreDuplicates: true });
    if (!full.error) {
      return { ok: true };
    }

    const msg = String(full.error.message || '');
    last = msg || last;
    if (isMissingTableError(msg)) {
      continue;
    }

    const missingColumns = msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist');
    if (missingColumns) {
      const minimal = await client
        .from(table)
        .upsert({ owner_user_id: id }, { onConflict: 'owner_user_id', ignoreDuplicates: true });
      if (!minimal.error) {
        return { ok: true };
      }
      last = String(minimal.error.message || last);
      if (isMissingTableError(last)) {
        continue;
      }
    }

    return { ok: false, error: msg || `Failed to upsert ${table} row.` };
  }

  return { ok: false, error: last || "Could not find table 'public.app_users' or 'public.app_user' in schema cache" };
}

async function ensureRunReference(
  client: SupabaseClient,
  params: {
    runId: number | null;
    ownerUserId: string;
    deviceId: string | null;
    diagnosticType: string;
    runTimestamp: number;
    payload: unknown;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (params.runId == null) {
    return { ok: false, error: 'Missing run id for foreign-key reference.' };
  }

  const now = new Date().toISOString();
  const runIdNum = Number(params.runId);
  const runIdText = String(params.runId);

  const rowCandidates: Array<Record<string, unknown>> = [
    {
      run_id: runIdNum,
      owner_user_id: params.ownerUserId,
      device_id: params.deviceId,
      diagnostic_type: params.diagnosticType,
      run_timestamp: params.runTimestamp,
      payload: toJsonSafe(params.payload),
      created_at: now,
    },
    {
      run_id: runIdText,
      owner_user_id: params.ownerUserId,
      device_id: params.deviceId,
      diagnostic_type: params.diagnosticType,
      run_timestamp: params.runTimestamp,
      payload: toJsonSafe(params.payload),
      created_at: now,
    },
    {
      run_id: runIdNum,
      owner_user_id: params.ownerUserId,
      device_id: params.deviceId,
    },
    {
      run_id: runIdText,
      owner_user_id: params.ownerUserId,
      device_id: params.deviceId,
    },
    {
      run_id: runIdNum,
    },
    {
      run_id: runIdText,
    },
  ];

  let last = '';
  for (const row of rowCandidates) {
    const { error } = await (client.from('runs' as any) as any)
      .upsert(row as any, { onConflict: 'run_id', ignoreDuplicates: true });

    if (!error) {
      return { ok: true };
    }

    const msg = String(error.message || '');
    last = msg || last;

    if (isMissingTableError(msg)) {
      return { ok: false, error: "Could not find table 'public.runs' in schema cache" };
    }

    if (isMissingColumnError(msg)) {
      continue;
    }

    // Permission issues or FK issues should be reported immediately.
    return { ok: false, error: msg || 'Failed to upsert runs row.' };
  }

  return { ok: false, error: last || 'Failed to upsert runs row.' };
}

function envString(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function readObjectString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function loadSupabaseConfigFromLocalFile(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  table: string;
} {
  const roots = new Set<string>();
  const envHome = envString('SMARTHUB_HOME', 'SMART_HUB_HOME');
  if (envHome) roots.add(envHome);

  const cwd = process.cwd();
  roots.add(cwd);
  roots.add(path.resolve(cwd, '..'));

  for (const root of roots) {
    const configPath = path.join(root, 'supabase.local.json');
    try {
      if (!fsSync.existsSync(configPath)) {
        continue;
      }

      const raw = fsSync.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }

      const json = parsed as Record<string, unknown>;
      const url = readObjectString(
        json,
        'SMARTHUB_SUPABASE_URL',
        'SMART_HUB_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_URL',
        'url',
        'supabaseUrl',
      );

      const anonKey = readObjectString(
        json,
        'SMARTHUB_SUPABASE_ANON_KEY',
        'SMART_HUB_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_ANON_KEY',
        'anonKey',
        'supabaseAnonKey',
      );

      const serviceRoleKey = readObjectString(
        json,
        'SMARTHUB_SUPABASE_SERVICE_ROLE_KEY',
        'SMART_HUB_SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'serviceRoleKey',
      );

      const table = readObjectString(
        json,
        'SMARTHUB_SUPABASE_DIAGNOSTIC_TABLE',
        'SMART_HUB_SUPABASE_DIAGNOSTIC_TABLE',
        'SUPABASE_DIAGNOSTIC_TABLE',
        'diagnosticTable',
      );

      if (url || anonKey || serviceRoleKey || table) {
        return {
          url,
          anonKey,
          serviceRoleKey,
          table,
        };
      }
    } catch {
      // ignore malformed local file
    }
  }

  return {
    url: '',
    anonKey: '',
    serviceRoleKey: '',
    table: '',
  };
}

function getDiagnosticsCloudConfig(): DiagnosticsCloudConfig {
  const fileCfg = loadSupabaseConfigFromLocalFile();

  const url =
    envString(
      'SMARTHUB_SUPABASE_URL',
      'SMART_HUB_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_URL',
    ) || fileCfg.url;

  const anonKey =
    envString(
      'SMARTHUB_SUPABASE_ANON_KEY',
      'SMART_HUB_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ) || fileCfg.anonKey;

  const serviceRoleKey =
    envString(
      'SMARTHUB_SUPABASE_SERVICE_ROLE_KEY',
      'SMART_HUB_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ) || fileCfg.serviceRoleKey;

  const table =
    envString(
      'SMARTHUB_SUPABASE_DIAGNOSTIC_TABLE',
      'SMART_HUB_SUPABASE_DIAGNOSTIC_TABLE',
      'SUPABASE_DIAGNOSTIC_TABLE',
    ) || fileCfg.table || 'diagnostic_runs';

  const apiKey = serviceRoleKey || anonKey;
  const keySource: DiagnosticsCloudConfig['keySource'] = serviceRoleKey
    ? 'service_role'
    : anonKey
      ? 'anon'
      : 'none';

  return {
    url,
    apiKey,
    table,
    keySource,
    configured: !!(url && apiKey),
  };
}

function getDiagnosticsCloudClient(): { client: SupabaseClient | null; config: DiagnosticsCloudConfig } {
  const config = getDiagnosticsCloudConfig();
  if (!config.configured) {
    return { client: null, config };
  }

  const cacheKey = `${config.url}::${config.apiKey}`;
  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = createClient(config.url, config.apiKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedClientKey = cacheKey;
  }

  return { client: cachedClient, config };
}

function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return 0;

    const asNumber = Number(v);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }

    const parsedDate = Date.parse(v);
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }

  return 0;
}

function historyPayloadQuality(payload: unknown): number {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 0;
  }

  const src = payload as Record<string, unknown>;
  let score = 0;

  if (src.counts && typeof src.counts === 'object') score += 1;
  if (src.diagStages && typeof src.diagStages === 'object') score += 1;
  if (src.diagDetails && typeof src.diagDetails === 'object') score += 1;
  if (src.textReport) score += 1;

  const details = src.diagDetails && typeof src.diagDetails === 'object' && !Array.isArray(src.diagDetails)
    ? (src.diagDetails as Record<string, unknown>)
    : null;
  const security = details && details.security && typeof details.security === 'object' && !Array.isArray(details.security)
    ? (details.security as Record<string, unknown>)
    : null;

  if (security) {
    score += 1;
    if (typeof security.appsScanned === 'number') score += 1;
    if (typeof security.suspiciousTotal === 'number') score += 1;
    if (Array.isArray(security.suspiciousApps) && security.suspiciousApps.length) score += 3;
    if (Array.isArray(security.appsByRisk) || typeof security.appsByRisk === 'object') score += 1;
  }

  return score;
}

function isRetryableSupabaseError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('timeout')
    || m.includes('timed out')
    || m.includes('network')
    || m.includes('fetch failed')
    || m.includes('connection')
    || m.includes('econnreset')
    || m.includes('enotfound')
    || m.includes('socket')
    || m.includes('temporarily unavailable')
    || m.includes('too many requests')
    || m.includes('rate limit')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function saveDiagnosticRunToCloud(params: SaveRunParams): Promise<SaveRunResult> {
  const ownerUserId = String(params.ownerUserId || '').trim();
  if (!ownerUserId) {
    return { ok: false, skipped: true, error: 'Missing owner user id.' };
  }

  const { client, config } = getDiagnosticsCloudClient();
  if (!client) {
    return { ok: false, skipped: true, error: 'Supabase cloud diagnostics store is not configured.' };
  }

  const row = {
    owner_user_id: ownerUserId,
    diagnostic_type: String(params.diagnosticType || 'history').trim() || 'history',
    device_id: String(params.deviceId || '').trim() || null,
    run_id: Number.isFinite(params.runId) ? Number(params.runId) : null,
    run_timestamp: Number.isFinite(params.runTimestamp) ? Number(params.runTimestamp) : Date.now(),
    payload: toJsonSafe(params.payload),
  };

  let lastError = '';
  const tables = tableCandidates(config.table);

  for (const table of tables) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await client.from(table).insert(row);
      if (!error) {
        return { ok: true, skipped: false };
      }

      lastError = String(error.message || 'Unknown Supabase error');
      const missingTable = isMissingTableError(lastError);
      if (missingTable) {
        // Try the next candidate table immediately.
        break;
      }

      if (isDeviceForeignKeyError(lastError) && row.device_id) {
        const ensured = await ensureDeviceReference(client, String(row.device_id), params.payload);
        if (!ensured.ok) {
          // If the inferred reference table is not available/exposed (or blocked),
          // do not hard-stop here; try other candidate run tables.
          lastError = `${lastError}. Device reference upsert failed: ${ensured.error || 'Unknown error'}`;
          break;
        }

        const retryAfterEnsure = await client.from(table).insert(row);
        if (!retryAfterEnsure.error) {
          return { ok: true, skipped: false };
        }

        lastError = String(retryAfterEnsure.error.message || lastError || 'Unknown Supabase error');
      }

      if (isOwnerForeignKeyError(lastError)) {
        const ensuredOwner = await ensureOwnerReference(client, ownerUserId);
        if (!ensuredOwner.ok) {
          lastError = `${lastError}. Owner reference upsert failed: ${ensuredOwner.error || 'Unknown error'}`;
          break;
        }

        const retryAfterOwner = await client.from(table).insert(row);
        if (!retryAfterOwner.error) {
          return { ok: true, skipped: false };
        }

        lastError = String(retryAfterOwner.error.message || lastError || 'Unknown Supabase error');
      }

      if (isRunForeignKeyError(lastError)) {
        const ensuredOwner = await ensureOwnerReference(client, ownerUserId);
        if (!ensuredOwner.ok) {
          lastError = `${lastError}. Owner reference upsert failed: ${ensuredOwner.error || 'Unknown error'}`;
          break;
        }

        if (row.device_id) {
          const ensuredDevice = await ensureDeviceReference(client, String(row.device_id), params.payload);
          if (!ensuredDevice.ok) {
            lastError = `${lastError}. Device reference upsert failed: ${ensuredDevice.error || 'Unknown error'}`;
            break;
          }
        }

        const ensuredRun = await ensureRunReference(client, {
          runId: row.run_id,
          ownerUserId,
          deviceId: row.device_id ? String(row.device_id) : null,
          diagnosticType: String(row.diagnostic_type || 'history'),
          runTimestamp: Number(row.run_timestamp || Date.now()),
          payload: params.payload,
        });
        if (!ensuredRun.ok) {
          lastError = `${lastError}. Run reference upsert failed: ${ensuredRun.error || 'Unknown error'}`;
          break;
        }

        const retryAfterRun = await client.from(table).insert(row);
        if (!retryAfterRun.error) {
          return { ok: true, skipped: false };
        }

        lastError = String(retryAfterRun.error.message || lastError || 'Unknown Supabase error');
      }

      const retryable = isRetryableSupabaseError(lastError);
      if (!retryable || attempt === 3) {
        return {
          ok: false,
          skipped: false,
          error: `Supabase save failed (table=${table}, keySource=${config.keySource}): ${lastError}`,
        };
      }

      await sleep(attempt * 250);
    }
  }

  return {
    ok: false,
    skipped: false,
    error: `Supabase save failed (table=${config.table}, keySource=${config.keySource}): ${lastError || 'Unknown error'}`,
  };
}

export async function fetchDiagnosticRunsFromCloud<T = any>(
  params: FetchRunsParams,
): Promise<FetchRunsResult<T>> {
  const ownerUserId = String(params.ownerUserId || '').trim();
  if (!ownerUserId) {
    return { ok: false, runs: [], error: 'Missing owner user id.' };
  }

  const { client, config } = getDiagnosticsCloudClient();
  if (!client) {
    return { ok: false, runs: [], error: 'Supabase cloud diagnostics store is not configured.' };
  }

  const limit = Number.isFinite(params.limit as number) ? Math.max(1, Math.min(800, Number(params.limit))) : 400;
  const deviceId = String(params.deviceId || '').trim();
  const diagnosticType = String(params.diagnosticType || 'history').trim() || 'history';

  let lastError = '';
  const tables = tableCandidates(config.table);

  for (const table of tables) {
    const runQuery = async (withCreatedAt: boolean) => {
      let q = client
        .from(table)
        .select(withCreatedAt
          ? 'payload, run_id, run_timestamp, created_at'
          : 'payload, run_id, run_timestamp')
        .eq('owner_user_id', ownerUserId)
        .eq('diagnostic_type', diagnosticType)
        .order('run_timestamp', { ascending: false });

      if (deviceId) {
        q = q.eq('device_id', deviceId);
      }

      if (withCreatedAt) {
        q = q.order('created_at', { ascending: false });
      }

      q = q.limit(limit);
      return await q;
    };

    let data: unknown = null;
    let error: any = null;

    ({ data, error } = await runQuery(true));
    if (error) {
      lastError = String(error.message || 'Unknown Supabase error');
      if (isMissingTableError(lastError)) {
        continue;
      }

      if (isMissingColumnError(lastError)) {
        ({ data, error } = await runQuery(false));
        if (error) {
          lastError = String(error.message || lastError || 'Unknown Supabase error');
        }
      }
    }

    if (error) {
      return {
        ok: false,
        runs: [],
        error: `Supabase fetch failed (table=${table}, keySource=${config.keySource}): ${lastError}`,
      };
    }

    const rows = Array.isArray(data) ? (data as CloudRunRow[]) : [];
    const byRunId = new Map<string, { payload: T; ts: number; createdAt: number; quality: number; order: number }>();

    rows.forEach((row, order) => {
      const payloadParsed = parseJsonIfString(row?.payload);
      const payloadObj = payloadParsed && typeof payloadParsed === 'object' && !Array.isArray(payloadParsed)
        ? (payloadParsed as Record<string, unknown>)
        : null;

      const ts = toEpochMs(row?.run_timestamp)
        || toEpochMs(payloadObj?.timestamp)
        || Date.now();
      const createdAt = toEpochMs(row?.created_at) || 0;

      const id = row?.run_id ?? payloadObj?.id ?? ts;
      const key = String(id);

      const candidate = payloadObj
        ? ({
          ...payloadObj,
          id,
          timestamp: ts,
        } as T)
        : ({ id, timestamp: ts } as T);

      const next = {
        payload: candidate,
        ts,
        createdAt,
        quality: historyPayloadQuality(candidate),
        order,
      };

      const current = byRunId.get(key);
      if (!current) {
        byRunId.set(key, next);
        return;
      }

      const nextScore = [next.createdAt, next.ts, next.quality, next.order];
      const currentScore = [current.createdAt, current.ts, current.quality, current.order];
      const shouldReplace =
        nextScore[0] > currentScore[0]
        || (nextScore[0] === currentScore[0] && nextScore[1] > currentScore[1])
        || (nextScore[0] === currentScore[0] && nextScore[1] === currentScore[1] && nextScore[2] > currentScore[2])
        || (nextScore[0] === currentScore[0] && nextScore[1] === currentScore[1] && nextScore[2] === currentScore[2] && nextScore[3] > currentScore[3]);

      if (shouldReplace) {
        byRunId.set(key, next);
      }
    });

    const runs = Array.from(byRunId.values())
      .sort((a, b) => b.ts - a.ts)
      .map(entry => entry.payload);

    return { ok: true, runs };
  }

  return {
    ok: false,
    runs: [],
    error: `Supabase fetch failed (table=${config.table}, keySource=${config.keySource}): ${lastError || 'No compatible table found in schema cache.'}`,
  };
}
