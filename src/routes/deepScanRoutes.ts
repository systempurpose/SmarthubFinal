import type { Express, Request, Response } from 'express';
import {
  adb,
  connectivityInfo,
  basicSnapshot,
  logcatErrors,
  listApps,
  packagePermissions,
  getInstallerMap,
  pull as adbPull,
} from '../adb';
import {
  analyzeBattery,
  analyzeLogs,
  analyzeMemoryHealth,
  analyzeOsPatchLevel,
  analyzeStorage,
  type Finding,
  detectSuspiciousApps,
  isLikelyLegitPackageIdentity,
  scoreAppRisk,
} from '../heuristics';
import { assessPackageLegitimacy } from '../packageLegitimacy';
import { beginMobileDiagnostic, endMobileDiagnostic } from '../serverContext';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// ---- Helpers for deep scan (copied from server.ts or elsewhere) ----
async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function pullApk(deviceId: string, packageName: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const safePkg = packageName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const localApk = path.join(tmpDir, `smarthub-scan-${safePkg}-${Date.now()}.apk`);
  const pmPath = await adb('-s', deviceId, 'shell', 'pm', 'path', packageName);
  const match = pmPath.match(/package:(.+)/);
  if (!match) throw new Error(`Could not find APK path for ${packageName}`);
  const remotePath = match[1].trim();
  await adbPull(deviceId, remotePath, localApk);
  return localApk;
}

async function scanWithYara(apkPath: string): Promise<{ rule: string; matches: string[] }[]> {
  const yaraExe = path.join(process.cwd(), 'tools', 'yara64.exe');
  const rulesDir = path.join(process.cwd(), 'yara-rules');
  try {
    await fs.access(yaraExe);
    await fs.access(rulesDir);
  } catch {
    console.warn('YARA executable or rules directory not found, skipping YARA scan');
    return [];
  }
  try {
    const { stdout } = await execAsync(`"${yaraExe}" -r "${rulesDir}" "${apkPath}"`);
    const lines = stdout.split('\n').filter(l => l.trim());
    const results: { rule: string; matches: string[] }[] = [];
    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (match) {
        results.push({ rule: match[1], matches: match[2].split(',') });
      }
    }
    return results;
  } catch (err: any) {
    if (err.message.includes('exit code 1')) return [];
    console.warn('YARA scan error:', err.message);
    return [];
  }
}

async function calculateEntropy(filePath: string): Promise<number> {
  const buffer = await fs.readFile(filePath);
  const byteCounts = new Array(256).fill(0);
  for (const byte of buffer) byteCounts[byte]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (byteCounts[i] === 0) continue;
    const p = byteCounts[i] / buffer.length;
    entropy -= p * Math.log2(p);
  }
  return entropy / 8; // normalized 0..1
}

const vtCache = new Map<string, any>();
async function checkVirusTotal(hash: string): Promise<any> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { error: 'VIRUSTOTAL_API_KEY not set' };
  if (vtCache.has(hash)) return vtCache.get(hash);
  try {
    const resp = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
      headers: { 'x-apikey': apiKey },
    });
    let result;
    if (resp.ok) {
      const data = await resp.json();
      const stats = data.data?.attributes?.last_analysis_stats || {};
      result = {
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        undetected: stats.undetected || 0,
        total: Object.keys(data.data?.attributes?.last_analysis_results || {}).length,
        link: `https://www.virustotal.com/gui/file/${hash}`,
      };
    } else if (resp.status === 404) {
      result = { notFound: true, message: 'Not found in VirusTotal database' };
    } else {
      result = { error: `VirusTotal API error: ${resp.status}` };
    }
    vtCache.set(hash, result);
    return result;
  } catch (e: any) {
    return { error: e.message || 'VirusTotal query failed' };
  }
}

// ---- Helper functions for runtime behavior ----
async function runFridaOnPackage(deviceId: string, packageName: string, timeoutMs = 300000): Promise<any[]> {
  try {
    const response = await fetch(`http://127.0.0.1:3333/api/frida/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        packageName,
        timeoutMs,
        stealth: true,
        scriptName: 'full_monitor.js',
      }),
    });
    const data = await response.json();
    return data.events || [];
  } catch (err) {
    console.warn('Frida scan failed:', err);
    return [];
  }
}

async function checkOverlays(deviceId: string): Promise<any[]> {
  try {
    const response = await fetch(`http://127.0.0.1:3333/api/overlay-monitor/events?deviceId=${deviceId}`);
    const data = await response.json();
    return data.events || [];
  } catch (err) {
    console.warn('Overlay fetch failed:', err);
    return [];
  }
}

async function runStrace(deviceId: string, packageName: string, durationMs = 5000): Promise<string> {
  try {
    const pid = await adb('-s', deviceId, 'shell', `pidof ${packageName}`);
    if (!pid.trim()) return '';
    const pidNum = pid.trim().split(' ')[0];
    await adb('-s', deviceId, 'shell', `timeout ${Math.ceil(durationMs/1000)} strace -p ${pidNum} -o /sdcard/strace.log &`);
    await new Promise(r => setTimeout(r, durationMs + 1000));
    const output = await adb('-s', deviceId, 'shell', 'cat /sdcard/strace.log');
    await adb('-s', deviceId, 'shell', 'rm /sdcard/strace.log');
    return output;
  } catch (err) {
    return '';
  }
}

function normalizeFindings(findings: Finding[]): Finding[] {
  // De-dup by id while preserving order.
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const id = (f && typeof f.id === 'string' && f.id.trim()) ? f.id.trim() : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f);
  }
  return out;
}

function summarizeCauses(findings: Finding[]): string[] {
  const causes: string[] = [];

  const hasStorageHigh = findings.some(f => f.id.startsWith('storage-pressure-') && (f.severity === 'high' || f.severity === 'medium'));
  const hasMemoryHigh = findings.some(f => f.id === 'memory-low' || f.id === 'memory-tight');
  const hasCrash = findings.some(f => f.id === 'crash-anr');

  if (hasStorageHigh) {
    causes.push('Low free storage can cause lag, app crashes, and update/install failures.');
  }
  if (hasMemoryHigh) {
    causes.push('Memory pressure can cause apps to be killed or become unresponsive during diagnostics.');
  }
  if (hasCrash) {
    causes.push('System/app crashes or ANRs were seen in logs; this may point to unstable apps or OS issues.');
  }

  return causes;
}

export function registerDeepScanRoutes(app: Express): void {
  // ---- Existing hardware-only route (unchanged) ----
  app.get('/deep-scan/:id', async (req: Request, res: Response) => {
    // ... original code ...
  });

  // ---- NEW: Full deep scan including app security ----
  app.get('/deep-scan/:id/full', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing device id.' });
    }

    const rawParam = typeof req.query.raw === 'string' ? req.query.raw : Array.isArray(req.query.raw) ? req.query.raw[0] : '';
    const includeRaw = ['1', 'true', 'yes', 'on'].includes(String(rawParam || '').trim().toLowerCase());

    try {
      await beginMobileDiagnostic(id);

      // ---- 1. Hardware basics ----
      const snap = await basicSnapshot(id);
      const propsDump = snap.propsDump;
      const batteryDump = snap.batteryDump;
      const storageDump = snap.storageDump;
      const memInfoDump = snap.memInfoDump;
      const logsDump = await logcatErrors(id);

      const findings = normalizeFindings([
        ...analyzeBattery(batteryDump),
        ...analyzeStorage(storageDump),
        ...analyzeMemoryHealth(memInfoDump),
        ...analyzeOsPatchLevel(propsDump),
        ...analyzeLogs(logsDump),
      ]);

      // ---- 2. App security scanning ----
      const allApps = await listApps(id);
      const permsByPkg: Record<string, string[]> = {};
      for (const app of allApps) {
        if (!app.packageName) continue;
        try {
          permsByPkg[app.packageName] = await packagePermissions(id, app.packageName);
        } catch {
          permsByPkg[app.packageName] = [];
        }
      }
      const installerMap = await getInstallerMap(id);

      // Detect suspicious apps – the result is an array of objects with specific fields.
      // We'll map them to a unified structure.
      const suspiciousAppsRaw = detectSuspiciousApps(allApps, permsByPkg, installerMap);

      // Filter out the diagnostics app and enrich with risk scores.
      const filteredSuspiciousAppsRaw = suspiciousAppsRaw.filter(app => app.packageName !== 'com.smarthub.diagnostics');
      const legitimacyChecks = await Promise.all(
        filteredSuspiciousAppsRaw.map(app => assessPackageLegitimacy(app.packageName, app.installer ?? installerMap?.[app.packageName] ?? null))
      );

      const suspiciousApps = filteredSuspiciousAppsRaw
        .map((app: any, index: number) => {
          const perms = permsByPkg[app.packageName] || [];
          // Keep the riskScore and threatLevel that detectSuspiciousApps already set.
          // Only add the full permission list for the UI.
          return {
            ...app,
            _perms: perms, // optional, for additional permission data
            packageLegitimacy: legitimacyChecks[index],
            // DO NOT override riskScore or threatLevel here.
          };
        })
        .filter((app: any) => app.packageLegitimacy?.verdict !== 'trusted');

      const suspiciousAppsByRisk = [...suspiciousApps].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

      // ---- 3. Deep APK analysis for apps with riskScore >= 35 ----
      const deepResults: any[] = [];
      const appsToDeepScan = suspiciousAppsByRisk.filter(app => (app.riskScore || 0) >= 35).slice(0, 3);
      for (const app of appsToDeepScan) {
        try {
          const apkPath = await pullApk(id, app.packageName);
          const hash = await computeSha256(apkPath);
          const entropy = await calculateEntropy(apkPath);
          const yara = await scanWithYara(apkPath);
          const vt = await checkVirusTotal(hash);

          deepResults.push({
            packageName: app.packageName,
            displayName: app.displayName,
            hash,
            entropy,
            yaraMatches: yara,
            virusTotal: vt,
          });

          await fs.unlink(apkPath).catch(() => {});
        } catch (err) {
          deepResults.push({
            packageName: app.packageName,
            error: String(err),
          });
        }
      }

      // ---- 4. Runtime behavior (Frida, Overlay, Strace) ----
      // ---- 4. Runtime behavior (Frida, Overlay, Strace) ----
const highRiskApps = suspiciousAppsByRisk.filter(app => (app.riskScore || 0) >= 60).slice(0, 2);
const fridaResults: any[] = [];
// ... etc ...
      for (const app of highRiskApps) {
        try {
          const events = await runFridaOnPackage(id, app.packageName, 120000);
          fridaResults.push({
            packageName: app.packageName,
            displayName: app.displayName,
            events,
          });
        } catch (err) {
          fridaResults.push({
            packageName: app.packageName,
            error: String(err),
          });
        }
      }

      const overlayEvents = await checkOverlays(id);

      const straceResults: any[] = [];
      const topRisk = suspiciousAppsByRisk.filter(app => (app.riskScore || 0) >= 70).slice(0, 3);
      for (const app of topRisk) {
        try {
          const output = await runStrace(id, app.packageName, 5000);
          straceResults.push({
            packageName: app.packageName,
            output: output || 'No strace output (maybe app not running)',
          });
        } catch (err) {
          straceResults.push({
            packageName: app.packageName,
            error: String(err),
          });
        }
      }

      // ---- 5. Build health summary ----
      const summaryParts: string[] = [];
      const high = findings.filter(f => (f.severity || '').toLowerCase() === 'high').length;
      const med = findings.filter(f => (f.severity || '').toLowerCase() === 'medium').length;
      summaryParts.push(high || med ? `${high} high, ${med} medium` : 'no major issues detected');

      const health = {
        hardware: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
        software: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
        os: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
      };
      const patchFinding = findings.find(f => f.id === 'os-security-patch');
      if (patchFinding?.severity === 'high') health.os = 'bad';
      else if (patchFinding?.severity === 'medium') health.os = 'ok';
      else if (patchFinding) health.os = 'good';

      const swBad = findings.some(f => f.id === 'memory-low' || f.id.startsWith('storage-pressure-') && f.severity === 'high' || f.id === 'crash-anr');
      const swOk = findings.some(f => f.id === 'memory-tight' || f.id.startsWith('storage-pressure-') && f.severity === 'medium');
      if (swBad) health.software = 'bad';
      else if (swOk) health.software = 'ok';
      else health.software = 'good';

      const tempMatch = batteryDump.match(/temperature:\s*(\d+)/i)?.[1];
      if (tempMatch) {
        const c = Number(tempMatch) / 10;
        if (c >= 45) health.hardware = 'bad';
        else if (c >= 40) health.hardware = 'ok';
        else health.hardware = 'good';
      }

      const response: any = {
        ok: true,
        deviceId: id,
        summary: `Full deep scan complete (${summaryParts.join(', ')}).`,
        health,
        suspectedCauses: summarizeCauses(findings),
        findings,
        appSecurity: {
          totalApps: allApps.length,
          suspiciousApps: suspiciousApps.map((app: any) => ({
            packageName: app.packageName,
            displayName: app.displayName,
            riskScore: app.riskScore,
            threatLevel: app.threatLevel,
            reason: app.reason,
            installer: app.installer,
            isSideloaded: app.isSideloaded,
            packageTrust: isLikelyLegitPackageIdentity(app.packageName, app.installer) ? 'trusted' : 'unknown',
            dangerousPermissions: app._perms?.filter((p: string) => p.includes('DANGEROUS')) || [],
            threatTypes: app.threatTypes || [],
            malwareCapabilities: (app.threatTypes || []).map((t: any) => t.description),
          })),
          deepAnalysis: deepResults,
          runtimeBehavior: {
            frida: fridaResults,
            overlayEvents,
            strace: straceResults,
          },
          limits: {
            deepAnalysisApps: appsToDeepScan.length,
            fridaApps: highRiskApps.length,
            straceApps: topRisk.length,
          },
        },
      };

      if (includeRaw) {
        response.raw = {
          props: propsDump,
          battery: batteryDump,
          storage: storageDump,
          meminfo: memInfoDump,
          logs: logsDump,
        };
      }

      return res.json(response);
    } catch (e: any) {
      const msg = e?.message || 'Full deep scan failed.';
      return res.status(500).json({ ok: false, error: msg });
    } finally {
      await endMobileDiagnostic(id).catch(() => undefined);
    }
  });
}