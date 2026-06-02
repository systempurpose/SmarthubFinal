import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appInstallRoot, dataRoot } from '../serverConfig';
import { resolvePythonCommand } from '../pythonResolver';

const execFileAsync = promisify(execFile);

async function resolveAiSupportScriptPath(scriptFile: string): Promise<string> {
  const candidates = [
    path.join(appInstallRoot, 'AI support', scriptFile),
    // If the backend was launched from a nested folder (e.g. {app}\backend)
    // and SMARTHUB_HOME wasn't set for some reason, look one level up.
    path.join(appInstallRoot, '..', 'AI support', scriptFile),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  const tried = candidates.map(p => path.normalize(p)).join(' | ');
  throw new Error(
    `Offline AI helper script is missing: ${scriptFile}. Tried: ${tried}. ` +
      `If you're running an installed build, reinstall/update SmartHub Diagnostics.`,
  );
}

const AI_OUTCOME_KEYS = [
  'not_bsod',
  'display_hardware',
  'software_firmware',
  'low_level_mode',
  'host_usb_driver',
  'power_mainboard',
] as const;
type AiOutcomeKey = (typeof AI_OUTCOME_KEYS)[number];

const AI_BSOD5_KEYS = [
  'corrupt_system_files',
  'faulty_os_updates',
  'incompatible_apps',
  'overheating',
  'hardware_failure',
  'not_bsod',
] as const;
type AiBsod5Key = (typeof AI_BSOD5_KEYS)[number];

const AI_COMMON5_KEYS = [
  'software_glitches',
  'insufficient_storage',
  'app_malfunctions',
  'connectivity_issues',
  'hardware_problems',
] as const;
type AiCommon5Key = (typeof AI_COMMON5_KEYS)[number];

function isAiOutcomeKey(value: unknown): value is AiOutcomeKey {
  return typeof value === 'string' && (AI_OUTCOME_KEYS as readonly string[]).includes(value);
}

function isAiExtendedOutcome(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return true;
  if ((AI_OUTCOME_KEYS as readonly string[]).includes(v)) return true;
  if (v.startsWith('bsod5:')) {
    const k = v.slice('bsod5:'.length) as AiBsod5Key;
    return (AI_BSOD5_KEYS as readonly string[]).includes(k);
  }
  if (v.startsWith('common5:')) {
    const k = v.slice('common5:'.length) as AiCommon5Key;
    return (AI_COMMON5_KEYS as readonly string[]).includes(k);
  }
  return false;
}

async function runAiDiagnoseScript(params: {
  connection: any;
  visual?: any;
  similarLimit: number;
  remember?: boolean;
  outcome?: string;
  note?: string;
  metricsLookback?: number;
}): Promise<any> {
  const python = await resolvePythonCommand();
  const scriptPath = await resolveAiSupportScriptPath('ai_diagnose.py');

  // Store AI memory in a per-user writable location. On installed builds,
  // the script directory may be under Program Files which is not writable.
  const memoryDbPath = path.join(dataRoot, 'AI', 'memory.sqlite');
  try {
    await fs.mkdir(path.dirname(memoryDbPath), { recursive: true });
  } catch {
    // best-effort
  }

  const tmpDir = path.join(os.tmpdir(), 'smarthub-ai');
  await fs.mkdir(tmpDir, { recursive: true });

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const connPath = path.join(tmpDir, `connection-${nonce}.json`);
  const visualPath = params.visual ? path.join(tmpDir, `visual-${nonce}.json`) : undefined;
  await fs.writeFile(connPath, JSON.stringify(params.connection), 'utf8');
  if (visualPath) {
    await fs.writeFile(visualPath, JSON.stringify(params.visual), 'utf8');
  }

  try {
    const args: string[] = [scriptPath, '--memory-db', memoryDbPath];

    if (typeof params.metricsLookback === 'number') {
      args.push('--metrics', String(Math.max(1, Math.floor(params.metricsLookback))));
    } else {
      args.push('--connection', connPath, '--similar-limit', String(Math.max(0, Math.floor(params.similarLimit))));
      if (visualPath) args.push('--visual', visualPath);

      if (params.remember) {
        args.push('--remember');
        if (typeof params.note === 'string' && params.note.trim()) {
          args.push('--note', params.note.trim().slice(0, 240));
        }
        if (typeof params.outcome === 'string' && params.outcome.trim()) {
          args.push('--outcome', params.outcome.trim().slice(0, 64));
        }
      }
    }

    const { stdout, stderr } = await execFileAsync(python.exe, [...python.baseArgs, ...args], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 180_000,
    } as any);

    const outText = typeof stdout === 'string' ? stdout : Buffer.from(stdout as any).toString('utf8');
    try {
      return JSON.parse(outText);
    } catch {
      const errText = typeof stderr === 'string' ? stderr : Buffer.from(stderr as any).toString('utf8');
      const snippet = outText.replace(/\s+/g, ' ').trim().slice(0, 280);
      const errSnippet = errText.replace(/\s+/g, ' ').trim().slice(0, 280);
      throw new Error(
        `AI helper returned invalid JSON. ` +
          `python=${python.label}. ` +
          `${errSnippet ? `stderr: ${errSnippet}. ` : ''}` +
          `${snippet ? `stdout: ${snippet}` : ''}`,
      );
    }
  } finally {
    try {
      await fs.rm(connPath, { force: true });
    } catch {
      // ignore
    }
    try {
      if (visualPath) await fs.rm(visualPath, { force: true });
    } catch {
      // ignore
    }
  }
}

async function runAiAdbConcludeScript(payload: any, opts?: { remember?: boolean; outcome?: string; resolution?: string; note?: string }): Promise<any> {
  const python = await resolvePythonCommand();
  const scriptPath = await resolveAiSupportScriptPath('ai_adb_conclude.py');
  const tmpDir = path.join(os.tmpdir(), 'smarthub-ai');
  await fs.mkdir(tmpDir, { recursive: true });

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = path.join(tmpDir, `adb-${nonce}.json`);
  await fs.writeFile(inputPath, JSON.stringify(payload || {}), 'utf8');

  try {
    const args: string[] = [scriptPath, '--input', inputPath];
    if (opts?.remember) {
      args.push('--remember');
      if (typeof opts.outcome === 'string' && opts.outcome.trim()) {
        args.push('--outcome', opts.outcome.trim().slice(0, 64));
      }
      if (typeof opts.resolution === 'string' && opts.resolution.trim()) {
        args.push('--resolution', opts.resolution.trim().slice(0, 240));
      }
      if (typeof opts.note === 'string' && opts.note.trim()) {
        args.push('--note', opts.note.trim().slice(0, 240));
      }
    }
    const { stdout } = await execFileAsync(python.exe, [...python.baseArgs, ...args], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 180_000,
    } as any);

    const outText = typeof stdout === 'string' ? stdout : Buffer.from(stdout as any).toString('utf8');
    try {
      return JSON.parse(outText);
    } catch {
      throw new Error('AI helper returned invalid JSON.');
    }
  } finally {
    try {
      await fs.rm(inputPath, { force: true });
    } catch {
      // ignore
    }
  }
}

function normalizeNoDebugAiReport(parsed: any): any {
  const report = parsed && typeof parsed === 'object' ? parsed : {};

  function firstText(items: any, fallback = ''): string {
    if (!Array.isArray(items)) return fallback;
    const first = items.find(Boolean);
    return first ? String(first).trim() : fallback;
  }

  const broadLabels: Record<string, string> = {
    not_bsod: 'No deep boot failure evidence (USB-only) (likely NOT a blue/blank boot-failure case)',
    display_hardware: 'Display / connector / panel hardware fault (OS may still be alive)',
    software_firmware: 'Software / firmware boot instability (system crash loop / corruption)',
    low_level_mode: 'Low-level recovery mode (EDL / MTK preloader / DFU)',
    host_usb_driver: 'Host-side USB driver / enumeration issue',
    power_mainboard: 'Power / mainboard / deep hardware failure',
  };

  const broadFromBsod5: Record<string, string> = {
    not_bsod: 'not_bsod',
    corrupt_system_files: 'software_firmware',
    faulty_os_updates: 'software_firmware',
    incompatible_apps: 'software_firmware',
    overheating: 'power_mainboard',
    hardware_failure: 'power_mainboard',
  };

  const broadFromCommon5: Record<string, string> = {
    software_glitches: 'software_firmware',
    insufficient_storage: 'software_firmware',
    app_malfunctions: 'software_firmware',
    connectivity_issues: 'host_usb_driver',
    hardware_problems: 'power_mainboard',
  };

  const top = report.top && typeof report.top === 'object' ? report.top : null;
  const ranked = Array.isArray(report.ranked) ? report.ranked.filter(Boolean) : [];
  const bsod5 = report.bsod5 && typeof report.bsod5 === 'object' ? report.bsod5 : null;
  const common5 = report.common5 && typeof report.common5 === 'object' ? report.common5 : null;
  const commonTop = common5 && common5.top && typeof common5.top === 'object' ? common5.top : null;
  const bsod5Label = typeof bsod5?.label === 'string' ? bsod5.label.trim() : '';
  const commonLabel = typeof commonTop?.label === 'string' ? commonTop.label.trim() : '';
  const broadLabel = typeof report.top?.label === 'string' ? report.top.label.trim() : '';

  const topKey = typeof top?.key === 'string' ? top.key.trim() : '';
  const topLooksUnknown = !topKey || topKey === 'unknown';

  if (topLooksUnknown) {
    let fallbackKey = '';

    if (ranked.length && ranked[0] && typeof ranked[0].key === 'string' && ranked[0].key.trim() && ranked[0].key !== 'unknown') {
      fallbackKey = String(ranked[0].key).trim();
    } else if (typeof bsod5?.key === 'string' && broadFromBsod5[bsod5.key]) {
      fallbackKey = broadFromBsod5[bsod5.key];
    } else if (typeof commonTop?.key === 'string' && broadFromCommon5[commonTop.key]) {
      fallbackKey = broadFromCommon5[commonTop.key];
    } else {
      fallbackKey = 'power_mainboard';
    }

    report.top = {
      key: fallbackKey,
      label: broadLabels[fallbackKey] || fallbackKey,
      confidence:
        typeof top?.confidence === 'number'
          ? top.confidence
          : typeof bsod5?.confidence === 'number'
            ? bsod5.confidence
            : typeof commonTop?.confidence === 'number'
              ? commonTop.confidence
              : 0,
    };
  }

  if ((!Array.isArray(report.ranked) || !report.ranked.length) && report.top && typeof report.top === 'object') {
    report.ranked = [report.top];
  }

  if ((!Array.isArray(report.actions) || !report.actions.length)) {
    const actions: string[] = [];
    const bsod5Key = typeof bsod5?.key === 'string' ? bsod5.key : '';
    const broadKey = typeof report.top?.key === 'string' ? report.top.key : '';

    if (bsod5Key === 'not_bsod') {
      actions.push('The USB-only evidence does not currently support a BSOD-style failure. Reconfirm the symptom and run standard diagnostics if the screen appears normal.');
    } else if (bsod5Key === 'faulty_os_updates' || bsod5Key === 'corrupt_system_files' || broadKey === 'software_firmware') {
      actions.push('If the phone only appears in fastboot or recovery, continue with authorised OEM firmware recovery steps.');
      actions.push('Check for failed update, boot-loop, or corruption signs before replacing hardware.');
    } else if (bsod5Key === 'hardware_failure' || broadKey === 'display_hardware' || broadKey === 'power_mainboard') {
      actions.push('Try a known-good USB cable and direct port first, then inspect the display assembly, connector, battery, and power path.');
      actions.push('If ADB is alive but the screen is not, prioritize display/backlight/connector checks.');
    } else {
      actions.push('Re-check the USB evidence and physical symptom, then continue with the most likely hardware or firmware path.');
    }

    report.actions = actions;
  }

  if ((!report.humanSummary || typeof report.humanSummary !== 'string' || !report.humanSummary.trim())) {
    if (typeof bsod5?.key === 'string' && bsod5.key === 'not_bsod') {
      report.humanSummary = commonLabel
        ? `This does not currently look like a BSOD-style failure. The closest general cause is ${commonLabel}.`
        : 'This does not currently look like a BSOD-style failure based on the available USB-only evidence.';
    } else if (bsod5Label) {
      report.humanSummary = `Most likely BSOD cause: ${bsod5Label}.`;
    } else if (broadLabel) {
      report.humanSummary = `Most likely diagnosis: ${broadLabel}.`;
    }
  }

  const specific = report.specific && typeof report.specific === 'object' ? report.specific : null;
  const specificLabel = typeof specific?.label === 'string' ? specific.label.trim() : '';
  const specificEvidence = Array.isArray(specific?.evidence) ? specific.evidence.filter(Boolean) : [];
  const bsod5Evidence = Array.isArray(bsod5?.evidence) ? bsod5.evidence.filter(Boolean) : [];
  const commonEvidence = Array.isArray(commonTop?.evidence) ? commonTop.evidence.filter(Boolean) : [];
  const topLabel = typeof report.top?.label === 'string' ? report.top.label.trim() : '';
  const primaryAction = Array.isArray(report.actions) && report.actions.length ? String(report.actions[0]).trim() : '';
  const bestWhy = firstText(specificEvidence) || firstText(bsod5Evidence) || firstText(commonEvidence) || '';

  if (!report.likelyCause || typeof report.likelyCause !== 'string' || !report.likelyCause.trim()) {
    if (typeof bsod5?.key === 'string' && bsod5.key === 'not_bsod') {
      report.likelyCause = commonLabel || 'Not a BSOD-style failure';
    } else {
      report.likelyCause = specificLabel || bsod5Label || topLabel || 'No single clear cause yet';
    }
  }

  if (!report.why || typeof report.why !== 'string' || !report.why.trim()) {
    if (bestWhy) {
      report.why = bestWhy;
    } else if (typeof bsod5?.key === 'string' && bsod5.key === 'not_bsod') {
      report.why = 'The USB-only evidence does not match a blue, blank, or boot-failure pattern.';
    } else if (typeof report.humanSummary === 'string' && report.humanSummary.trim()) {
      report.why = report.humanSummary.trim();
    } else {
      report.why = 'The current USB-only evidence is limited, so this answer is based on the strongest matching signals.';
    }
  }

  if (!report.nextStep || typeof report.nextStep !== 'string' || !report.nextStep.trim()) {
    report.nextStep = primaryAction || 'Re-check the USB evidence and follow the most likely hardware or firmware path.';
  }

  return report;
}

export function registerAiRoutes(app: Express): void {
  app.post('/ai-adb-conclude', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const diagStages = body?.diagStages;
      const diagDetails = body?.diagDetails;

      if (!diagStages || typeof diagStages !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing diagStages payload.' });
      }

      const parsed = await runAiAdbConcludeScript({
        deviceId: body?.deviceId,
        deviceLabel: body?.deviceLabel,
        timestamp: body?.timestamp,
        counts: body?.counts,
        diagStages,
        diagDetails: diagDetails && typeof diagDetails === 'object' ? diagDetails : {},
        userProblem: typeof body?.userProblem === 'string' ? body.userProblem : '',
      });

      if (!parsed || parsed.ok !== true) {
        const msg = parsed && parsed.error ? parsed.error : 'AI helper returned an error.';
        return res.status(500).json({ ok: false, error: msg });
      }

      return res.json({ ok: true, conclusion: parsed.conclusion || null });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('ai-adb-conclude failed:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'AI conclusion failed.' });
    }
  });

  // Optional: allow technicians to store confirmed outcomes/fixes into the
  // local offline memory DB used by ai_adb_conclude.py.
  app.post('/ai-adb-conclude-remember', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const diagStages = body?.diagStages;
      const diagDetails = body?.diagDetails;
      const outcome = typeof body?.outcome === 'string' ? body.outcome : '';
      const resolution = typeof body?.resolution === 'string' ? body.resolution : '';
      const note = typeof body?.note === 'string' ? body.note : '';

      if (!diagStages || typeof diagStages !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing diagStages payload.' });
      }
      if (!resolution.trim() && !outcome.trim() && !note.trim()) {
        return res.status(400).json({ ok: false, error: 'Provide at least one of: outcome, resolution, note.' });
      }

      const parsed = await runAiAdbConcludeScript(
        {
          deviceId: body?.deviceId,
          deviceLabel: body?.deviceLabel,
          timestamp: body?.timestamp,
          counts: body?.counts,
          diagStages,
          diagDetails: diagDetails && typeof diagDetails === 'object' ? diagDetails : {},
          userProblem: typeof body?.userProblem === 'string' ? body.userProblem : '',
        },
        {
          remember: true,
          outcome,
          resolution,
          note,
        },
      );

      if (!parsed || parsed.ok !== true) {
        const msg = parsed && parsed.error ? parsed.error : 'AI helper returned an error.';
        return res.status(500).json({ ok: false, error: msg });
      }

      return res.json({ ok: true, conclusion: parsed.conclusion || null });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('ai-adb-conclude-remember failed:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'AI remember failed.' });
    }
  });

  app.post('/ai-no-debug-suggest', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const connection = body?.connection;
      const visual = body?.visual;

      if (!connection || typeof connection !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing connection payload.' });
      }

      const parsed = await runAiDiagnoseScript({
        connection,
        visual: visual && typeof visual === 'object' ? visual : undefined,
        similarLimit: 5,
      });

      const normalized = normalizeNoDebugAiReport(parsed);

      const actions = Array.isArray(normalized?.actions) ? normalized.actions : [];
      return res.json({
        ok: true,
        actions,
        top: normalized?.top,
        ranked: normalized?.ranked,
        memory: normalized?.memory,
        specific: normalized?.specific,
        bsod5: normalized?.bsod5,
        common5: normalized?.common5,
        humanSummary: typeof normalized?.humanSummary === 'string' ? normalized.humanSummary : '',
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('ai-no-debug-suggest failed:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'AI suggestion failed.' });
    }
  });

  app.post('/ai-no-debug-remember', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const connection = body?.connection;
      const visual = body?.visual;
      const outcomeRaw = typeof body?.outcome === 'string' ? body.outcome.trim() : '';
      const note = body?.note;

      if (!connection || typeof connection !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing connection payload.' });
      }
      if (outcomeRaw && !isAiExtendedOutcome(outcomeRaw)) {
        return res.status(400).json({
          ok: false,
          error:
            `Outcome must be one of: ${AI_OUTCOME_KEYS.join(', ')}, ` +
            `or bsod5:<${AI_BSOD5_KEYS.join('|')}>, ` +
            `or common5:<${AI_COMMON5_KEYS.join('|')}>`,
        });
      }

      const parsed = await runAiDiagnoseScript({
        connection,
        visual: visual && typeof visual === 'object' ? visual : undefined,
        similarLimit: 5,
        remember: true,
        outcome: outcomeRaw,
        note: typeof note === 'string' ? note : '',
      });

      return res.json({ ok: true, memory: parsed?.memory, top: parsed?.top });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('ai-no-debug-remember failed:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'AI remember failed.' });
    }
  });

  app.get('/ai-no-debug-metrics', async (req: Request, res: Response) => {
    try {
      const lookbackRaw = (req.query as any)?.lookback;
      const lookback = Math.max(1, Math.min(50_000, Number.parseInt(String(lookbackRaw || '500'), 10) || 500));
      const parsed = await runAiDiagnoseScript({
        connection: {},
        similarLimit: 0,
        metricsLookback: lookback,
      });
      return res.json(parsed);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('ai-no-debug-metrics failed:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'AI metrics failed.' });
    }
  });
}
