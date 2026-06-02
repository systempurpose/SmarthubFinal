import type { Express, Request, Response } from 'express';
import {
  adb,
  connectivityInfo,
  basicSnapshot,
  logcatErrors,
} from '../adb';
import { analyzeBattery, analyzeLogs, analyzeMemoryHealth, analyzeOsPatchLevel, analyzeStorage, type Finding } from '../heuristics';
import { beginMobileDiagnostic, endMobileDiagnostic } from '../serverContext';

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
  app.get('/deep-scan/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing device id.' });
    }

    const rawParam = typeof req.query.raw === 'string' ? req.query.raw : Array.isArray(req.query.raw) ? req.query.raw[0] : '';
    const includeRaw = ['1', 'true', 'yes', 'on'].includes(String(rawParam || '').trim().toLowerCase());

    try {
      await beginMobileDiagnostic(id);

      const snap = await basicSnapshot(id);
      const propsDump = snap.propsDump;
      const batteryDump = snap.batteryDump;
      const storageDump = snap.storageDump;
      const memInfoDump = snap.memInfoDump;
      const logsDump = await logcatErrors(id);

      // Optional raw dumps for advanced troubleshooting.
      // `dumpsys connectivity` and `dumpsys diskstats` can be extremely large, so we only
      // include them when requested via `?raw=1`.
      let connDump = '';
      let diskstats = '';
      if (includeRaw) {
        try {
          connDump = await connectivityInfo(id);
        } catch {
          connDump = '';
        }

        try {
          diskstats = await adb('-s', id, 'shell', 'dumpsys', 'diskstats');
        } catch {
          diskstats = '';
        }
      }

      const findings = normalizeFindings([
        ...analyzeBattery(batteryDump),
        ...analyzeStorage(storageDump),
        ...analyzeMemoryHealth(memInfoDump),
        ...analyzeOsPatchLevel(propsDump),
        ...analyzeLogs(logsDump),
      ]);

      const suspectedCauses = summarizeCauses(findings);

      const summaryParts: string[] = [];
      const high = findings.filter(f => (f.severity || '').toLowerCase() === 'high').length;
      const med = findings.filter(f => (f.severity || '').toLowerCase() === 'medium').length;
      if (high || med) {
        summaryParts.push(`${high} high, ${med} medium`);
      } else {
        summaryParts.push('no major issues detected');
      }

      // Lightweight health categories for UI.
      const health = {
        hardware: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
        software: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
        os: 'unknown' as 'good' | 'ok' | 'bad' | 'unknown',
      };

      // Decide OS health from patch + crash hints.
      const patchFinding = findings.find(f => f.id === 'os-security-patch');
      if (patchFinding?.severity === 'high') health.os = 'bad';
      else if (patchFinding?.severity === 'medium') health.os = 'ok';
      else if (patchFinding) health.os = 'good';

      // Software health from storage/memory/logs.
      const swBad = findings.some(f => f.id === 'memory-low' || f.id.startsWith('storage-pressure-') && f.severity === 'high' || f.id === 'crash-anr');
      const swOk = findings.some(f => f.id === 'memory-tight' || f.id.startsWith('storage-pressure-') && f.severity === 'medium');
      if (swBad) health.software = 'bad';
      else if (swOk) health.software = 'ok';
      else health.software = 'good';

      // Hardware health: use battery temperature as a proxy if available.
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
        summary: `Deep scan complete (${summaryParts.join(', ')}).`,
        health,
        suspectedCauses,
        findings,
      };

      if (includeRaw) {
        response.raw = {
          props: propsDump,
          battery: batteryDump,
          storage: storageDump,
          meminfo: memInfoDump,
          logs: logsDump,
          connectivity: connDump,
          diskstats,
        };
      }

      return res.json(response);
    } catch (e: any) {
      const msg = e?.message || 'Deep scan failed.';
      return res.status(500).json({ ok: false, error: msg });
    } finally {
      await endMobileDiagnostic(id).catch(() => undefined);
    }
  });
}
