import type { Express, NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { dataRoot } from '../serverContext';

type LocalAuthSession = {
  token: string;
  userId: string;
  email: string;
  displayName: string;
  issuedAt: number;
  expiresAt: number;
  lastOnlineLoginAt: number;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const localAuthSessionPath = path.join(dataRoot, 'auth-local-session.json');
const defaultOfflineDays = 30;
const maxOfflineDays = 180;

let cachedSupabaseClient: ReturnType<typeof createClient> | null = null;
let cachedSupabaseKey = '';

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
  emailRedirectUrl: string;
  passwordResetRedirectUrl: string;
  passwordChangedRedirectUrl: string;
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

      const emailRedirectUrl = readObjectString(
        json,
        'SMARTHUB_SUPABASE_EMAIL_REDIRECT_URL',
        'SMART_HUB_SUPABASE_EMAIL_REDIRECT_URL',
        'NEXT_PUBLIC_SUPABASE_EMAIL_REDIRECT_URL',
        'SUPABASE_EMAIL_REDIRECT_URL',
        'emailRedirectTo',
        'emailRedirectUrl',
        'siteUrl',
        'SITE_URL',
      );

      const passwordResetRedirectUrl = readObjectString(
        json,
        'SMARTHUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
        'SMART_HUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
        'NEXT_PUBLIC_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
        'SUPABASE_PASSWORD_RESET_REDIRECT_URL',
        'passwordResetRedirectTo',
        'passwordResetRedirectUrl',
      );

      const passwordChangedRedirectUrl = readObjectString(
        json,
        'SMARTHUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
        'SMART_HUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
        'NEXT_PUBLIC_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
        'SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
        'passwordChangedRedirectTo',
        'passwordChangedRedirectUrl',
      );

      if (url || anonKey || emailRedirectUrl || passwordResetRedirectUrl || passwordChangedRedirectUrl) {
        return { url, anonKey, emailRedirectUrl, passwordResetRedirectUrl, passwordChangedRedirectUrl };
      }
    } catch {
      // ignore malformed local file and continue.
    }
  }

  return {
    url: '',
    anonKey: '',
    emailRedirectUrl: '',
    passwordResetRedirectUrl: '',
    passwordChangedRedirectUrl: '',
  };
}

function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  emailRedirectUrl: string;
  passwordResetRedirectUrl: string;
  passwordChangedRedirectUrl: string;
  configured: boolean;
} {
  const envUrl = envString(
    'SMARTHUB_SUPABASE_URL',
    'SMART_HUB_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
  );
  const envAnonKey = envString(
    'SMARTHUB_SUPABASE_ANON_KEY',
    'SMART_HUB_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  );
  const envEmailRedirectUrl = envString(
    'SMARTHUB_SUPABASE_EMAIL_REDIRECT_URL',
    'SMART_HUB_SUPABASE_EMAIL_REDIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_EMAIL_REDIRECT_URL',
    'SUPABASE_EMAIL_REDIRECT_URL',
  );
  const envPasswordResetRedirectUrl = envString(
    'SMARTHUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
    'SMART_HUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
    'SUPABASE_PASSWORD_RESET_REDIRECT_URL',
  );
  const envPasswordChangedRedirectUrl = envString(
    'SMARTHUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
    'SMART_HUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
    'SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
  );

  const fileCfg = loadSupabaseConfigFromLocalFile();
  const url = envUrl || fileCfg.url;
  const anonKey = envAnonKey || fileCfg.anonKey;
  const emailRedirectUrl = envEmailRedirectUrl || fileCfg.emailRedirectUrl;
  const passwordResetRedirectUrl = envPasswordResetRedirectUrl || fileCfg.passwordResetRedirectUrl;
  const passwordChangedRedirectUrl = envPasswordChangedRedirectUrl || fileCfg.passwordChangedRedirectUrl;

  return {
    url,
    anonKey,
    emailRedirectUrl,
    passwordResetRedirectUrl,
    passwordChangedRedirectUrl,
    configured: !!(url && anonKey),
  };
}

function getOfflineDays(): number {
  const raw = envString('SMARTHUB_AUTH_OFFLINE_DAYS', 'SMART_HUB_AUTH_OFFLINE_DAYS');
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultOfflineDays;
  return Math.min(parsed, maxOfflineDays);
}

function getSupabaseClient(): ReturnType<typeof createClient> | null {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) return null;

  const cacheKey = `${cfg.url}::${cfg.anonKey}`;
  if (!cachedSupabaseClient || cachedSupabaseKey !== cacheKey) {
    cachedSupabaseClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedSupabaseKey = cacheKey;
  }

  return cachedSupabaseClient;
}

function readBearerToken(req: Request): string {
  const value = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match && match[1] ? match[1].trim() : '';
}

function toPublicUser(session: LocalAuthSession): { id: string; email: string; displayName: string } {
  return {
    id: session.userId,
    email: session.email,
    displayName: session.displayName,
  };
}

function pickDisplayName(user: SupabaseAuthUser, fallbackEmail: string): string {
  const userMeta =
    user.user_metadata && typeof user.user_metadata === 'object'
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  const fromMeta =
    (typeof userMeta.full_name === 'string' && userMeta.full_name.trim()) ||
    (typeof userMeta.name === 'string' && userMeta.name.trim());

  const fromEmail = typeof user.email === 'string' ? user.email.trim() : '';
  return fromMeta || fromEmail || fallbackEmail;
}

function createLocalSessionForUser(user: SupabaseAuthUser, fallbackEmail: string): LocalAuthSession {
  const now = Date.now();
  const offlineDays = getOfflineDays();
  const ttlMs = offlineDays * 24 * 60 * 60 * 1000;
  const email = (typeof user.email === 'string' ? user.email.trim() : '') || fallbackEmail;

  return {
    token: `shlocal_${crypto.randomBytes(24).toString('hex')}`,
    userId: user.id,
    email,
    displayName: pickDisplayName(user, email),
    issuedAt: now,
    expiresAt: now + ttlMs,
    lastOnlineLoginAt: now,
  };
}

function isMissingTableError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('could not find the table')
    || (m.includes('relation') && m.includes('does not exist'))
    || m.includes('schema cache')
  );
}

function isMissingColumnError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return m.includes('column') && m.includes('does not exist');
}

type AppUserSyncResult = {
  ok: boolean;
  table?: string;
  error?: string;
};

async function syncAppUserProfile(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  user: SupabaseAuthUser,
  fallbackDisplayName: string,
): Promise<AppUserSyncResult> {
  const ownerUserId = String(user.id || '').trim();
  if (!ownerUserId) {
    return { ok: false, error: 'Missing auth user id.' };
  }

  const email = typeof user.email === 'string' ? user.email.trim() : '';
  const displayName = pickDisplayName(user, fallbackDisplayName || email || ownerUserId);
  const now = new Date().toISOString();

  const tableCandidates = ['app_user', 'app_users'];
  const rowCandidates: Array<Record<string, unknown>> = [
    {
      owner_user_id: ownerUserId,
      user_id: ownerUserId,
      email,
      display_name: displayName,
      created_at: now,
    },
    {
      owner_user_id: ownerUserId,
      user_id: ownerUserId,
      email,
      display_name: displayName,
    },
    {
      owner_user_id: ownerUserId,
      email,
      display_name: displayName,
    },
    {
      owner_user_id: ownerUserId,
      user_id: ownerUserId,
    },
    {
      owner_user_id: ownerUserId,
    },
  ];

  let lastError = '';
  for (const table of tableCandidates) {
    for (const row of rowCandidates) {
      const { error } = await (supabase
        .from(table as any) as any)
        .upsert(row as any, { onConflict: 'owner_user_id', ignoreDuplicates: true });

      if (!error) {
        return { ok: true, table };
      }

      const msg = String(error.message || 'Unknown Supabase error');
      lastError = msg;

      if (isMissingTableError(msg)) {
        break;
      }

      if (isMissingColumnError(msg)) {
        continue;
      }

      return { ok: false, error: `${table}: ${msg}` };
    }
  }

  return {
    ok: false,
    error: lastError || "Could not find table 'public.app_user' or 'public.app_users' in schema cache.",
  };
}

async function loadLocalAuthSession(): Promise<LocalAuthSession | null> {
  try {
    const raw = await fs.readFile(localAuthSessionPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalAuthSession>;

    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.token !== 'string' || !parsed.token.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (typeof parsed.email !== 'string' || !parsed.email.trim()) return null;

    const issuedAt = Number(parsed.issuedAt);
    const expiresAt = Number(parsed.expiresAt);
    const lastOnlineLoginAt = Number(parsed.lastOnlineLoginAt);

    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(lastOnlineLoginAt)) {
      return null;
    }

    return {
      token: parsed.token.trim(),
      userId: parsed.userId.trim(),
      email: parsed.email.trim(),
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '',
      issuedAt,
      expiresAt,
      lastOnlineLoginAt,
    };
  } catch {
    return null;
  }
}

async function saveLocalAuthSession(session: LocalAuthSession): Promise<void> {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(localAuthSessionPath, JSON.stringify(session, null, 2), 'utf8');
}

async function clearLocalAuthSession(): Promise<void> {
  try {
    await fs.unlink(localAuthSessionPath);
  } catch {
    // ignore
  }
}

async function verifyLocalToken(token: string): Promise<{ ok: true; session: LocalAuthSession } | { ok: false; expired: boolean }> {
  const session = await loadLocalAuthSession();
  if (!session) return { ok: false, expired: false };
  if (session.token !== token) return { ok: false, expired: false };

  if (session.expiresAt <= Date.now()) {
    await clearLocalAuthSession();
    return { ok: false, expired: true };
  }

  return { ok: true, session };
}

export function registerAuthRoutes(app: Express): void {
  app.get('/auth/config', (_req: Request, res: Response) => {
    const cfg = getSupabaseConfig();
    const offlineDays = getOfflineDays();
    res.json({
      ok: true,
      configured: cfg.configured,
      emailRedirectConfigured: !!cfg.emailRedirectUrl,
      emailRedirectUrl: cfg.emailRedirectUrl || null,
      passwordResetRedirectConfigured: !!cfg.passwordResetRedirectUrl,
      passwordResetRedirectUrl: cfg.passwordResetRedirectUrl || null,
      passwordChangedRedirectConfigured: !!cfg.passwordChangedRedirectUrl,
      passwordChangedRedirectUrl: cfg.passwordChangedRedirectUrl || null,
      offlineDays,
      configPathHint: 'supabase.local.json',
      requiredEnv: {
        url: 'SMARTHUB_SUPABASE_URL',
        anonKey: 'SMARTHUB_SUPABASE_ANON_KEY',
        emailRedirectUrl: 'SMARTHUB_SUPABASE_EMAIL_REDIRECT_URL',
        passwordResetRedirectUrl: 'SMARTHUB_SUPABASE_PASSWORD_RESET_REDIRECT_URL',
        passwordChangedRedirectUrl: 'SMARTHUB_SUPABASE_PASSWORD_CHANGED_REDIRECT_URL',
      },
    });
  });

  app.post('/auth/register', async (req: Request, res: Response) => {
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const passwordConfirm =
      typeof req.body?.passwordConfirm === 'string' ? req.body.passwordConfirm : '';

    if (!displayName || displayName.length < 2) {
      res.status(400).json({ ok: false, error: 'Display name must be at least 2 characters.' });
      return;
    }

    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'Email and password are required.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' });
      return;
    }

    if (password !== passwordConfirm) {
      res.status(400).json({ ok: false, error: 'Password confirmation does not match.' });
      return;
    }

    const supabase = getSupabaseClient();
    const supabaseCfg = getSupabaseConfig();
    if (!supabase) {
      res.status(500).json({
        ok: false,
        error:
          'Supabase auth is not configured on backend. Set SMARTHUB_SUPABASE_URL and SMARTHUB_SUPABASE_ANON_KEY.',
      });
      return;
    }

    try {
      const signUpOptions: {
        data: {
          full_name: string;
          name: string;
        };
        emailRedirectTo?: string;
      } = {
        data: {
          full_name: displayName,
          name: displayName,
        },
      };

      if (supabaseCfg.emailRedirectUrl) {
        signUpOptions.emailRedirectTo = supabaseCfg.emailRedirectUrl;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: signUpOptions,
      });

      if (signUpError) {
        const msg = signUpError.message || 'Registration failed.';

        // Some SMTP/provider failures still create the auth user but fail to send
        // the confirmation email. Try immediate sign-in before failing register.
        if (/confirmation email|error sending confirmation email|smtp/i.test(msg)) {
          const { data: retryLoginData, error: retryLoginError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (!retryLoginError && retryLoginData?.user) {
            const session = createLocalSessionForUser(retryLoginData.user as SupabaseAuthUser, email);
            const offlineDays = getOfflineDays();

            await saveLocalAuthSession(session);

            const profileSync = await syncAppUserProfile(
              supabase,
              retryLoginData.user as SupabaseAuthUser,
              displayName || email,
            );
            if (!profileSync.ok) {
              // eslint-disable-next-line no-console
              console.warn('[auth/register] app_user profile sync failed after SMTP register fallback:', profileSync.error);
            }

            res.status(201).json({
              ok: true,
              registered: true,
              localSessionToken: session.token,
              user: toPublicUser(session),
              offlineValidUntil: session.expiresAt,
              offlineDays,
              message: 'Account created and signed in. Email confirmation delivery failed; you can continue and verify later.',
              warning: msg,
            });
            return;
          }
        }

        if (/database error saving new user/i.test(msg)) {
          res.status(500).json({
            ok: false,
            error:
              'Supabase failed while saving the new auth user. This is usually caused by a broken auth trigger/profile insert function. Verify the trigger writes to public.app_user with compatible column types and ON CONFLICT handling.',
            details: msg,
          });
          return;
        }

        const status = /already\s+registered/i.test(msg) ? 409 : 400;
        res.status(status).json({ ok: false, error: msg });
        return;
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError || !loginData?.user) {
        res.status(201).json({
          ok: true,
          registered: true,
          requiresEmailVerification: true,
          message:
            'Account created. Check your email for verification if required, then sign in from this app.',
        });
        return;
      }

      const session = createLocalSessionForUser(loginData.user as SupabaseAuthUser, email);
      const offlineDays = getOfflineDays();

      await saveLocalAuthSession(session);

      const profileSync = await syncAppUserProfile(
        supabase,
        loginData.user as SupabaseAuthUser,
        displayName || email,
      );
      if (!profileSync.ok) {
        // eslint-disable-next-line no-console
        console.warn('[auth/register] app_user profile sync failed:', profileSync.error);
      }

      res.status(201).json({
        ok: true,
        registered: true,
        localSessionToken: session.token,
        user: toPublicUser(session),
        offlineValidUntil: session.expiresAt,
        offlineDays,
        message: 'Account created and signed in successfully.',
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Registration failed.' });
    }
  });

  app.post('/auth/login', async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'Email and password are required.' });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({
        ok: false,
        error:
          'Supabase auth is not configured on backend. Set SMARTHUB_SUPABASE_URL and SMARTHUB_SUPABASE_ANON_KEY.',
      });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data || !data.user) {
        res.status(401).json({ ok: false, error: error?.message || 'Invalid email or password.' });
        return;
      }

      const offlineDays = getOfflineDays();
      const session = createLocalSessionForUser(data.user as SupabaseAuthUser, email);

      await saveLocalAuthSession(session);

      const profileSync = await syncAppUserProfile(
        supabase,
        data.user as SupabaseAuthUser,
        email,
      );
      if (!profileSync.ok) {
        // eslint-disable-next-line no-console
        console.warn('[auth/login] app_user profile sync failed:', profileSync.error);
      }

      res.json({
        ok: true,
        localSessionToken: session.token,
        user: toPublicUser(session),
        offlineValidUntil: session.expiresAt,
        offlineDays,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Login failed.' });
    }
  });

  app.post('/auth/forgot-password', async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

    if (!email) {
      res.status(400).json({ ok: false, error: 'Email is required.' });
      return;
    }

    const supabase = getSupabaseClient();
    const supabaseCfg = getSupabaseConfig();
    if (!supabase) {
      res.status(500).json({
        ok: false,
        error:
          'Supabase auth is not configured on backend. Set SMARTHUB_SUPABASE_URL and SMARTHUB_SUPABASE_ANON_KEY.',
      });
      return;
    }

    try {
      const options: { redirectTo?: string } = {};
      const rawResetRedirect = String(
        supabaseCfg.passwordResetRedirectUrl || supabaseCfg.emailRedirectUrl || '',
      ).trim();
      if (rawResetRedirect) {
        try {
          const resetUrl = new URL(rawResetRedirect);
          if (supabaseCfg.url) {
            resetUrl.searchParams.set('supabase_url', supabaseCfg.url);
          }
          if (supabaseCfg.anonKey) {
            resetUrl.searchParams.set('supabase_anon_key', supabaseCfg.anonKey);
          }
          if (supabaseCfg.passwordChangedRedirectUrl) {
            resetUrl.searchParams.set(
              'password_changed_redirect',
              supabaseCfg.passwordChangedRedirectUrl,
            );
          }
          options.redirectTo = resetUrl.toString();
        } catch {
          options.redirectTo = rawResetRedirect;
        }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, options);
      if (error) {
        res.status(400).json({ ok: false, error: error.message || 'Failed to send password reset email.' });
        return;
      }

      res.json({
        ok: true,
        message: 'If this email is registered, a password reset link has been sent.',
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Failed to send password reset email.' });
    }
  });

  app.get('/auth/session/status', async (req: Request, res: Response) => {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, authenticated: false, error: 'Missing authorization token.' });
      return;
    }

    const check = await verifyLocalToken(token);
    if (!check.ok) {
      res.status(401).json({
        ok: false,
        authenticated: false,
        error: check.expired
          ? 'Saved offline session expired. Please sign in online again.'
          : 'Invalid local session token. Please sign in again.',
      });
      return;
    }

    res.json({
      ok: true,
      authenticated: true,
      user: toPublicUser(check.session),
      offlineValidUntil: check.session.expiresAt,
      lastOnlineLoginAt: check.session.lastOnlineLoginAt,
    });
  });

  app.post('/auth/logout', async (_req: Request, res: Response) => {
    await clearLocalAuthSession();
    res.json({ ok: true });
  });
}

export function createAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const method = String(req.method || '').toUpperCase();
    if (method === 'OPTIONS') {
      next();
      return;
    }

    const p = req.path || '';
    // Public endpoints (local-only server): allow these without a local session token.
    // Keep the allowlist small and limited to endpoints needed for basic device discovery
    // and USB-only diagnostics.
    if (
      p === '/health' ||
      p === '/shutdown' ||
      p.startsWith('/auth/') ||
      p === '/device' ||
      p === '/connection-check' ||
      p.startsWith('/adb/') ||
      p.startsWith('/wifi/') ||
      p.startsWith('/app-behavior/') ||
      p.startsWith('/android-connectivity/')
    ) {
      next();
      return;
    }

    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: 'Authentication required. Please log in first.' });
      return;
    }

    void (async () => {
      const check = await verifyLocalToken(token);
      if (!check.ok) {
        res.status(401).json({
          ok: false,
          error: check.expired
            ? 'Offline session expired. Please sign in online again.'
            : 'Invalid session token. Please sign in again.',
        });
        return;
      }

      (req as any).authUser = {
        id: check.session.userId,
        email: check.session.email,
        displayName: check.session.displayName,
      };

      next();
    })().catch((e: any) => {
      // eslint-disable-next-line no-console
      console.error('Auth middleware failed:', e);
      res.status(500).json({ ok: false, error: 'Failed to validate local session.' });
    });
  };
}
