import type { Express, Request, Response } from 'express';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appInstallRoot, onlineAiConfigPath } from '../serverConfig';

type OnlineAiConfig = {
  url?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
};

type OnlineAiDiskConfig = {
  url?: string;
  apiKey?: string;
  model?: string;
};

type OnlineAiLocalFileConfig = {
  url?: string;
  apiKey?: string;
  model?: string;
};

type OnlineAiConfigSource = 'env' | 'supabase-local' | 'config-file' | 'none';

type WebEvidenceCitation = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  query: string;
};

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

function loadOnlineAiConfigFromLocalFile(): OnlineAiLocalFileConfig {
  const roots = new Set<string>();
  const envHome = envString('SMARTHUB_HOME', 'SMART_HUB_HOME');
  if (envHome) roots.add(envHome);
  roots.add(appInstallRoot);

  const cwd = process.cwd();
  roots.add(cwd);
  roots.add(path.resolve(cwd, '..'));

  for (const root of roots) {
    const configPath = path.join(root, 'supabase.local.json');
    try {
      if (!fsSync.existsSync(configPath)) continue;

      const raw = fsSync.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

      const json = parsed as Record<string, unknown>;
      const url = readObjectString(
        json,
        'SMARTHUB_AI_API_URL',
        'SMART_HUB_AI_API_URL',
        'SMARTHUB_ONLINE_AI_URL',
        'SMART_HUB_ONLINE_AI_URL',
        'onlineAiUrl',
      );
      const apiKey = readObjectString(
        json,
        'SMARTHUB_AI_API_KEY',
        'SMART_HUB_AI_API_KEY',
        'SMARTHUB_ONLINE_AI_KEY',
        'SMART_HUB_ONLINE_AI_KEY',
        'onlineAiKey',
      );
      const model = readObjectString(
        json,
        'SMARTHUB_AI_MODEL',
        'SMART_HUB_AI_MODEL',
        'SMARTHUB_ONLINE_AI_MODEL',
        'SMART_HUB_ONLINE_AI_MODEL',
        'onlineAiModel',
      );

      if (url || apiKey || model) {
        return { url, apiKey, model };
      }
    } catch {
      // ignore malformed local file and continue.
    }
  }

  return {};
}

async function loadOnlineAiDiskConfig(): Promise<OnlineAiDiskConfig> {
  try {
    const raw = await fs.readFile(onlineAiConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const cfg = parsed as OnlineAiDiskConfig;
    return {
      url: typeof cfg.url === 'string' && cfg.url.trim() ? cfg.url.trim() : undefined,
      apiKey: typeof cfg.apiKey === 'string' && cfg.apiKey.trim() ? cfg.apiKey.trim() : undefined,
      model: typeof cfg.model === 'string' && cfg.model.trim() ? cfg.model.trim() : undefined,
    };
  } catch {
    return {};
  }
}

async function saveOnlineAiDiskConfig(next: OnlineAiDiskConfig): Promise<void> {
  const safe: OnlineAiDiskConfig = {
    url: typeof next.url === 'string' && next.url.trim() ? next.url.trim() : undefined,
    apiKey: typeof next.apiKey === 'string' && next.apiKey.trim() ? next.apiKey.trim() : undefined,
    model: typeof next.model === 'string' && next.model.trim() ? next.model.trim() : undefined,
  };
  await fs.writeFile(onlineAiConfigPath, JSON.stringify(safe, null, 2), 'utf8');
}

function getOnlineAiConfig(): { config: OnlineAiConfig; source: 'env' | 'supabase-local' | 'none' } {
  const localCfg = loadOnlineAiConfigFromLocalFile();

  const envUrl = envString(
    'SMART_HUB_ONLINE_AI_URL',
    'SMARTHUB_ONLINE_AI_URL',
    'SMART_HUB_AI_API_URL',
    'SMARTHUB_AI_API_URL',
  );
  const envApiKey = envString(
    'SMART_HUB_ONLINE_AI_KEY',
    'SMARTHUB_ONLINE_AI_KEY',
    'SMART_HUB_AI_API_KEY',
    'SMARTHUB_AI_API_KEY',
  );
  const envModel = envString(
    'SMART_HUB_ONLINE_AI_MODEL',
    'SMARTHUB_ONLINE_AI_MODEL',
    'SMART_HUB_AI_MODEL',
    'SMARTHUB_AI_MODEL',
  );

  const url = envUrl || localCfg.url;
  const apiKey = envApiKey || localCfg.apiKey;
  const model = envModel || localCfg.model;

  const timeoutRaw = envString(
    'SMART_HUB_ONLINE_AI_TIMEOUT_MS',
    'SMARTHUB_ONLINE_AI_TIMEOUT_MS',
    'SMART_HUB_AI_TIMEOUT_MS',
    'SMARTHUB_AI_TIMEOUT_MS',
  );
  const timeoutMs = timeoutRaw ? Math.max(1500, Math.min(60_000, Number(timeoutRaw))) : 12_000;

  let source: 'env' | 'supabase-local' | 'none' = 'none';
  if (envUrl || envApiKey || envModel || timeoutRaw) {
    source = 'env';
  } else if (localCfg.url || localCfg.apiKey || localCfg.model) {
    source = 'supabase-local';
  }

  return {
    config: {
      url,
      apiKey,
      model,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 12_000,
    },
    source,
  };
}

async function getMergedOnlineAiConfig(): Promise<{ config: OnlineAiConfig; source: OnlineAiConfigSource }> {
  const resolved = getOnlineAiConfig();
  if (resolved.config.url && resolved.config.apiKey && resolved.source !== 'none') {
    return { config: resolved.config, source: resolved.source };
  }

  const disk = await loadOnlineAiDiskConfig();
  const merged: OnlineAiConfig = {
    url: resolved.config.url || disk.url,
    apiKey: resolved.config.apiKey || disk.apiKey,
    model: resolved.config.model || disk.model,
    timeoutMs: resolved.config.timeoutMs,
  };

  let source: OnlineAiConfigSource = 'none';
  if (merged.url && merged.apiKey) {
    source = resolved.source === 'none' ? 'config-file' : resolved.source;
  }

  return { config: merged, source };
}

function isInternetLikelyRequiredError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

function normalizeText(value: string, maxLen = 180): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function extractErrorCodes(value: string): string[] {
  const text = String(value || '');
  const out = new Set<string>();
  const matches = text.match(/0x[0-9a-f]{6,10}|\bE_[A-Z0-9_]{2,}\b/gi) || [];
  for (const m of matches) {
    const v = normalizeText(m, 40);
    if (v) out.add(v);
    if (out.size >= 6) break;
  }
  return Array.from(out);
}

function uniqueText(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeText(raw, 180);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function collectFeatureSignals(input: any): {
  issueTerms: string[];
  modelTerms: string[];
  codeTerms: string[];
} {
  const issueTerms: string[] = [];
  const modelTerms: string[] = [];
  const codeSet = new Set<string>();
  const seen = new Set<unknown>();

  const interestingIssue = /error|fail|issue|reason|cause|symptom|status|state|diag|analysis|message|log|watchdog|surfaceflinger|gpu|boot|adb|fastboot|usb|mtp|display|touch|battery|power|freeze|crash|black|screen/i;
  const interestingModel = /model|device|brand|manufacturer|product|hardware|board|chip|soc/i;

  const walk = (value: any, keyHint: string, depth: number): void => {
    if (depth > 6 || value === null || value === undefined) return;

    if (typeof value === 'string') {
      const text = normalizeText(value, 220);
      if (!text) return;

      if (interestingModel.test(keyHint)) {
        modelTerms.push(text);
      }
      if (interestingIssue.test(keyHint) || interestingIssue.test(text)) {
        issueTerms.push(text);
      }

      for (const code of extractErrorCodes(text)) {
        codeSet.add(code);
      }
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      if (interestingIssue.test(keyHint)) {
        issueTerms.push(`${normalizeText(keyHint, 80)}:${String(value)}`);
      }
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && i < 24; i += 1) {
        walk(value[i], `${keyHint}[${i}]`, depth + 1);
      }
      return;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    for (let i = 0; i < entries.length && i < 48; i += 1) {
      const [k, v] = entries[i];
      const nextHint = keyHint ? `${keyHint}.${k}` : k;
      walk(v, nextHint, depth + 1);
    }
  };

  walk(input, '', 0);

  return {
    issueTerms: uniqueText(issueTerms, 14),
    modelTerms: uniqueText(modelTerms, 6),
    codeTerms: uniqueText(Array.from(codeSet), 4),
  };
}

function buildWebSearchQueries(kind: string | undefined, features: any): string[] {
  const kindText = normalizeText(String(kind || 'android phone diagnostic').replace(/[_-]+/g, ' '), 80);
  const signals = collectFeatureSignals(features);
  const topIssue = signals.issueTerms[0] || 'phone connected via usb but adb unavailable';
  const secondIssue = signals.issueTerms[1] || '';
  const topModel = signals.modelTerms[0] || '';

  const queries: string[] = [];
  queries.push(`android ${kindText} likely cause ${topIssue}`);

  if (topModel || secondIssue) {
    queries.push(`android ${topModel} ${secondIssue || topIssue} troubleshooting`);
  }

  for (const code of signals.codeTerms) {
    queries.push(`android ${code} diagnostic fix`);
  }

  if (!queries.length) {
    queries.push('android phone diagnostics common failure causes');
  }

  return uniqueText(queries.map((q) => normalizeText(q, 220)), 3);
}

function hostFromUrl(urlText: string): string {
  try {
    return new URL(urlText).hostname.replace(/^www\./i, '') || 'web';
  } catch {
    return 'web';
  }
}

function pushCitation(
  out: WebEvidenceCitation[],
  seenUrls: Set<string>,
  params: {
    query: string;
    title?: string;
    url?: string;
    snippet?: string;
  },
): void {
  const urlText = normalizeText(String(params.url || ''), 500);
  if (!/^https?:\/\//i.test(urlText)) return;

  const dedupeKey = urlText.toLowerCase();
  if (seenUrls.has(dedupeKey)) return;
  seenUrls.add(dedupeKey);

  out.push({
    title: normalizeText(params.title || params.query || 'Web source', 140),
    url: urlText,
    snippet: normalizeText(params.snippet || '', 220),
    source: hostFromUrl(urlText),
    query: normalizeText(params.query || '', 180),
  });
}

function collectDuckTopics(
  topics: any[],
  query: string,
  out: WebEvidenceCitation[],
  seenUrls: Set<string>,
): void {
  if (!Array.isArray(topics)) return;

  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') continue;

    if (Array.isArray((topic as any).Topics)) {
      collectDuckTopics((topic as any).Topics, query, out, seenUrls);
      continue;
    }

    pushCitation(out, seenUrls, {
      query,
      title: typeof (topic as any).Text === 'string' ? (topic as any).Text : query,
      url: typeof (topic as any).FirstURL === 'string' ? (topic as any).FirstURL : '',
      snippet: typeof (topic as any).Text === 'string' ? (topic as any).Text : '',
    });

    if (out.length >= 10) return;
  }
}

async function fetchDuckDuckGoEvidence(query: string, timeoutMs: number): Promise<WebEvidenceCitation[]> {
  const controller = new AbortController();
  const ms = Math.max(1200, Math.min(3500, timeoutMs));
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`DuckDuckGo search API error (${resp.status})`);
    }

    const payload = await resp.json();
    const out: WebEvidenceCitation[] = [];
    const seenUrls = new Set<string>();

    pushCitation(out, seenUrls, {
      query,
      title: typeof payload?.Heading === 'string' ? payload.Heading : query,
      url: typeof payload?.AbstractURL === 'string' ? payload.AbstractURL : '',
      snippet: typeof payload?.AbstractText === 'string' ? payload.AbstractText : '',
    });

    if (Array.isArray(payload?.Results)) {
      for (const row of payload.Results) {
        if (!row || typeof row !== 'object') continue;
        pushCitation(out, seenUrls, {
          query,
          title: typeof (row as any).Text === 'string' ? (row as any).Text : query,
          url: typeof (row as any).FirstURL === 'string' ? (row as any).FirstURL : '',
          snippet: typeof (row as any).Text === 'string' ? (row as any).Text : '',
        });
        if (out.length >= 10) break;
      }
    }

    if (out.length < 10 && Array.isArray(payload?.RelatedTopics)) {
      collectDuckTopics(payload.RelatedTopics, query, out, seenUrls);
    }

    return out.slice(0, 10);
  } finally {
    clearTimeout(timer);
  }
}

async function lookupWebEvidence(kind: string | undefined, features: any, timeoutMs: number): Promise<{
  queries: string[];
  citations: WebEvidenceCitation[];
  provider: string;
}> {
  const queries = buildWebSearchQueries(kind, features);
  const searchTimeout = Math.max(1200, Math.min(3200, Math.floor(timeoutMs * 0.25)));

  const settled = await Promise.all(
    queries.map(async (query) => {
      try {
        return await fetchDuckDuckGoEvidence(query, searchTimeout);
      } catch {
        return [] as WebEvidenceCitation[];
      }
    }),
  );

  const merged: WebEvidenceCitation[] = [];
  const seenUrls = new Set<string>();
  for (const list of settled) {
    for (const item of list) {
      pushCitation(merged, seenUrls, item);
      if (merged.length >= 8) break;
    }
    if (merged.length >= 8) break;
  }

  return {
    queries,
    citations: merged,
    provider: 'duckduckgo-instant-answer',
  };
}

function appendCitationFooter(text: string, citations: WebEvidenceCitation[]): string {
  const body = normalizeText(String(text || ''), 12000);
  if (!citations.length) return body;

  const lines = citations.slice(0, 5).map((item, idx) => {
    return `[S${idx + 1}] ${normalizeText(item.title, 120)} - ${item.url}`;
  });

  return `${body}\n\nWeb references:\n${lines.join('\n')}`;
}

function buildPromptFromFeatures(features: any, citations: WebEvidenceCitation[]): string {
  const safe = features && typeof features === 'object' ? features : {};
  let json = '';
  try {
    json = JSON.stringify(safe);
  } catch {
    json = '{}';
  }
  if (json.length > 20_000) json = `${json.slice(0, 20_000)}...`;

  let evidenceJson = '[]';
  try {
    evidenceJson = JSON.stringify(
      citations.slice(0, 8).map((item, idx) => ({
        id: `S${idx + 1}`,
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: item.source,
      })),
    );
  } catch {
    evidenceJson = '[]';
  }
  if (evidenceJson.length > 14_000) evidenceJson = `${evidenceJson.slice(0, 14_000)}...`;

  return (
    'You are an assistant for phone repair technicians. '
    + 'Given the diagnostic feature summary JSON and optional web evidence JSON, produce:\n'
    + '1) One-line likely cause\n'
    + '2) 3-6 concrete next steps\n'
    + '3) If evidence suggests power cut / loose battery connector, say it clearly\n'
    + '4) If WEB_EVIDENCE_JSON contains sources, cite 1-3 relevant source ids inline like [S1]. Do not fabricate sources.\n\n'
    + `FEATURES_JSON=${json}\n`
    + `WEB_EVIDENCE_JSON=${evidenceJson}`
  );
}

async function callOnlineAiApi(params: {
  config: OnlineAiConfig;
  kind?: string;
  features: any;
  webEvidence?: WebEvidenceCitation[];
}): Promise<{ text: string }>
{
  const { config, kind, features, webEvidence } = params;
  if (!config.url) {
    throw new Error('Online AI is not configured: missing SMART_HUB_AI_API_URL (or SMART_HUB_ONLINE_AI_URL)');
  }
  if (!config.apiKey) {
    throw new Error('Online AI is not configured: missing SMART_HUB_AI_API_KEY (or SMART_HUB_ONLINE_AI_KEY)');
  }

  const prompt = buildPromptFromFeatures({ kind, ...features }, webEvidence || []);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const resp = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'Be concise, factual, and technician-friendly.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    const rawText = await resp.text();
    if (!resp.ok) {
      const trimmed = rawText.trim();
      throw new Error(`Online AI API error (${resp.status}): ${trimmed ? trimmed.slice(0, 400) : 'no body'}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { text: rawText.trim() };
    }

    const content = parsed?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' && content.trim() ? content.trim() : JSON.stringify(parsed).slice(0, 4000);
    return { text };
  } finally {
    clearTimeout(t);
  }
}

export function registerOnlineAiRoutes(app: Express): void {
  app.get('/online-ai/status', (_req: Request, res: Response) => {
    (async () => {
      const merged = await getMergedOnlineAiConfig();
      const cfg = merged.config;
      res.json({
        ok: true,
        enabled: !!(cfg.url && cfg.apiKey),
        configured: !!(cfg.url && cfg.apiKey),
        requiresInternet: true,
        model: cfg.model || null,
        source: merged.source,
      });
    })().catch((e: any) => {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to load Online AI config' });
    });
  });

  // Configuration “container” endpoint for installed apps.
  // This stores settings in %APPDATA%\SmartHubDiagnostics\online-ai-config.json.
  // The API key is NEVER returned by GET.
  app.get('/online-ai/config', async (_req: Request, res: Response) => {
    const merged = await getMergedOnlineAiConfig();
    const disk = await loadOnlineAiDiskConfig();
    res.json({
      ok: true,
      requiresInternet: true,
      source: merged.source,
      url: merged.config.url || null,
      model: merged.config.model || null,
      hasKey: !!merged.config.apiKey,
      diskPath: onlineAiConfigPath,
      diskConfigured: !!(disk.url && disk.apiKey),
    });
  });

  app.post('/online-ai/config', async (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object') ? (req.body as any) : {};
    const url = typeof body.url === 'string' ? body.url.trim() : undefined;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined;
    const model = typeof body.model === 'string' ? body.model.trim() : undefined;
    const clearKey = body.clearKey === true;

    const current = await loadOnlineAiDiskConfig();
    const next: OnlineAiDiskConfig = {
      url: url !== undefined ? (url || undefined) : current.url,
      apiKey: clearKey ? undefined : (apiKey !== undefined ? (apiKey || undefined) : current.apiKey),
      model: model !== undefined ? (model || undefined) : current.model,
    };

    await saveOnlineAiDiskConfig(next);
    res.json({ ok: true, saved: true, diskPath: onlineAiConfigPath, hasKey: !!next.apiKey });
  });

  app.post('/ai-online-suggest', async (req: Request, res: Response) => {
    const merged = await getMergedOnlineAiConfig();
    const cfg = merged.config;
    if (!cfg.url || !cfg.apiKey) {
      res.status(400).json({
        ok: false,
        error: 'Online AI is not configured. Set SMART_HUB_AI_API_URL and SMART_HUB_AI_API_KEY.',
        requiresInternet: true,
      });
      return;
    }

    const kind = typeof (req.body as any)?.kind === 'string' ? String((req.body as any).kind) : undefined;
    const features = (req.body as any)?.features;

    try {
      const webEvidence = await lookupWebEvidence(kind, features, cfg.timeoutMs);
      const out = await callOnlineAiApi({
        config: cfg,
        kind,
        features,
        webEvidence: webEvidence.citations,
      });
      const text = appendCitationFooter(out.text, webEvidence.citations);

      res.json({
        ok: true,
        requiresInternet: true,
        text,
        citations: webEvidence.citations,
        webSearch: {
          provider: webEvidence.provider,
          queries: webEvidence.queries,
          hitCount: webEvidence.citations.length,
        },
      });
    } catch (e: any) {
      const likelyNet = isInternetLikelyRequiredError(e);
      res.status(likelyNet ? 503 : 500).json({
        ok: false,
        error: e?.message || 'Online AI call failed',
        requiresInternet: true,
        internetRequired: likelyNet || undefined,
      });
    }
  });
}
