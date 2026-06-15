export type Severity = 'low' | 'medium' | 'high';
export type ThreatType = 
  | 'banking_trojan' 
  | 'spyware' 
  | 'rat' 
  | 'adware' 
  | 'ransomware' 
  | 'click_fraud' 
  | 'cryptominer'
  | 'generic_risk';

export interface ThreatInfo {
  type: ThreatType;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  details: string;
  evidence?: unknown;
};

export type RiskLevel = 'safe' | 'moderate' | 'risky';
const DANGEROUS_PERMISSIONS_LIST = [
  'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION',
  'CAMERA', 'RECORD_AUDIO', 'READ_SMS', 'SEND_SMS',
  'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
  'READ_PHONE_STATE', 'SYSTEM_ALERT_WINDOW'
];

export function analyzeBattery(batteryDump: string): Finding[] {
  const findings: Finding[] = [];
  const level = batteryDump.match(/level:\s*(\d+)/i)?.[1];
  const temp = batteryDump.match(/temperature:\s*(\d+)/i)?.[1];
  if (level) {
    const pct = Number(level);
    const isNumber = Number.isFinite(pct);
    const severity: Severity = isNumber && pct <= 10 ? 'high' : isNumber && pct <= 20 ? 'medium' : 'low';
    findings.push({
      id: 'battery-level',
      title: `Battery level ${level}%`,
      severity,
      details:
        severity === 'high'
          ? 'Battery is very low. Low power mode and unexpected shutdowns can affect diagnostics.'
          : severity === 'medium'
            ? 'Battery is low. Consider charging before long diagnostics.'
            : 'Snapshot of current level.',
    });
  }
  if (temp) {
    const c = Number(temp) / 10;
    const severity: Severity = c >= 45 ? 'high' : c >= 40 ? 'medium' : 'low';
    findings.push({
      id: 'battery-temp',
      title: `Battery temp ${c}°C`,
      severity,
      details:
        severity === 'high'
          ? 'Battery temperature is very high. Thermal throttling or shutdown risk is elevated.'
          : severity === 'medium'
            ? 'Battery temperature is elevated. Performance may be reduced due to thermal throttling.'
            : 'Battery temperature looks normal.',
      evidence: { c },
    });
  }
  return findings;
}

function parseBatteryBool(dump: string, key: string): boolean | undefined {
  const m = dump.match(new RegExp(`${key}:\\s*(true|false)`, 'i'));
  if (!m?.[1]) return undefined;
  const v = m[1].toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

function parseBatteryInt(dump: string, key: string): number | undefined {
  const m = dump.match(new RegExp(`${key}:\\s*(-?\\d+)`, 'i'));
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function parseBatteryStatusToken(dump: string): string | undefined {
  const m = dump.match(/status:\s*([^\r\n]+)/i);
  const raw = m?.[1]?.trim();
  if (!raw) return undefined;
  const token = raw.split(/\s+/)[0];
  return token || undefined;
}

function isChargingFromDump(dump: string): boolean | undefined {
  if (/AC powered:\s*true/i.test(dump) || /USB powered:\s*true/i.test(dump) || /Wireless powered:\s*true/i.test(dump)) {
    return true;
  }
  const status = parseBatteryStatusToken(dump);
  // Android BatteryManager: 2=CHARGING, 5=FULL
  if (status === '2' || status === '5') return true;
  if (status === '3') return false; // DISCHARGING
  return undefined;
}

export function analyzeBatteryConnection(batteryDump: string, batteryDump2: string): Finding[] {
  const findings: Finding[] = [];
  if (!batteryDump || !batteryDump2) return findings;

  const p1 = parseBatteryBool(batteryDump, 'present');
  const p2 = parseBatteryBool(batteryDump2, 'present');
  const v1 = parseBatteryInt(batteryDump, 'voltage');
  const v2 = parseBatteryInt(batteryDump2, 'voltage');
  const l1 = parseBatteryInt(batteryDump, 'level');
  const l2 = parseBatteryInt(batteryDump2, 'level');
  const t1Raw = parseBatteryInt(batteryDump, 'temperature');
  const t2Raw = parseBatteryInt(batteryDump2, 'temperature');
  const s1 = parseBatteryStatusToken(batteryDump);
  const s2 = parseBatteryStatusToken(batteryDump2);
  const c1 = isChargingFromDump(batteryDump);
  const c2 = isChargingFromDump(batteryDump2);

  const evidence: Record<string, any> = { present1: p1, present2: p2, voltage1: v1, voltage2: v2, level1: l1, level2: l2, status1: s1, status2: s2, charging1: c1, charging2: c2 };
  const reasons: string[] = [];

  if (typeof p1 === 'boolean' && typeof p2 === 'boolean' && p1 !== p2) {
    reasons.push('Battery "present" flipped between samples (possible sensor/connector intermittency).');
  }
  if (typeof v1 === 'number' && typeof v2 === 'number') {
    const deltaMv = Math.abs(v1 - v2);
    if (deltaMv >= 800) reasons.push('Battery voltage changed unusually fast between samples.');
    if (v1 <= 0 || v2 <= 0) reasons.push('Battery voltage reported as 0 or negative.');
  }
  if (typeof l1 === 'number' && typeof l2 === 'number' && Math.abs(l1 - l2) >= 10) {
    reasons.push('Battery level jumped unusually fast between samples.');
  }
  if (typeof t1Raw === 'number' && typeof t2Raw === 'number') {
    const t1 = t1Raw / 10;
    const t2 = t2Raw / 10;
    if (Math.abs(t1 - t2) >= 5) reasons.push('Battery temperature jumped unusually fast between samples.');
  }
  if (typeof c1 === 'boolean' && typeof c2 === 'boolean' && c1 !== c2) {
    reasons.push('Charging state flipped between samples (possible port/connector/power path instability).');
  }

  if (reasons.length) {
    findings.push({
      id: 'battery-connection',
      title: 'Battery/power readings look unstable',
      severity: 'high',
      details: `${reasons.join(' ')} If the phone randomly powers off, this can fit a loose battery connector, failing power path, or sensor instability.`,
      evidence,
    });
  }

  return findings;
}

export function analyzeBatteryConnectionSeries(batteryDumps: string[]): Finding[] {
  const findings: Finding[] = [];
  const dumps = Array.isArray(batteryDumps) ? batteryDumps.filter(d => typeof d === 'string' && d.trim()) : [];
  if (dumps.length < 2) return findings;

  const presents: Array<boolean | undefined> = [];
  const voltages: Array<number | undefined> = [];
  const levels: Array<number | undefined> = [];
  const tempsC: Array<number | undefined> = [];
  const charging: Array<boolean | undefined> = [];
  const statuses: Array<string | undefined> = [];

  for (const d of dumps) {
    presents.push(parseBatteryBool(d, 'present'));
    voltages.push(parseBatteryInt(d, 'voltage'));
    levels.push(parseBatteryInt(d, 'level'));
    const tRaw = parseBatteryInt(d, 'temperature');
    tempsC.push(typeof tRaw === 'number' ? tRaw / 10 : undefined);
    charging.push(isChargingFromDump(d));
    statuses.push(parseBatteryStatusToken(d));
  }

  const reasons: string[] = [];

  const countFlips = <T>(arr: Array<T | undefined>): number => {
    let flips = 0;
    let prevSet = false;
    let prev: T | undefined;
    for (const v of arr) {
      if (typeof v === 'undefined') continue;
      if (!prevSet) {
        prev = v;
        prevSet = true;
        continue;
      }
      if (v !== prev) flips += 1;
      prev = v;
    }
    return flips;
  };

  const presentFlips = countFlips(presents);
  if (presentFlips >= 1) {
    reasons.push('Battery "present" changed between samples (possible connector/sensor intermittency).');
  }

  const chargingFlips = countFlips(charging);
  if (chargingFlips >= 1) {
    reasons.push('Charging state changed between samples (possible port/connector/power-path instability).');
  }

  const numericDeltas = (arr: Array<number | undefined>): number[] => {
    const deltas: number[] = [];
    let prev: number | undefined;
    for (const v of arr) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (typeof prev === 'number' && Number.isFinite(prev)) {
        deltas.push(Math.abs(v - prev));
      }
      prev = v;
    }
    return deltas;
  };

  const voltageDeltas = numericDeltas(voltages);
  const maxVoltageDelta = voltageDeltas.length ? Math.max(...voltageDeltas) : 0;
  const hasZeroOrNegativeVoltage = voltages.some(v => typeof v === 'number' && Number.isFinite(v) && v <= 0);
  if (hasZeroOrNegativeVoltage) {
    reasons.push('Battery voltage was reported as 0 or negative.');
  }
  if (maxVoltageDelta >= 800) {
    reasons.push('Battery voltage changed unusually fast across samples.');
  }

  const levelDeltas = numericDeltas(levels);
  const maxLevelDelta = levelDeltas.length ? Math.max(...levelDeltas) : 0;
  if (maxLevelDelta >= 10) {
    reasons.push('Battery level jumped unusually fast across samples.');
  }

  const tempDeltas = numericDeltas(tempsC);
  const maxTempDelta = tempDeltas.length ? Math.max(...tempDeltas) : 0;
  if (maxTempDelta >= 5) {
    reasons.push('Battery temperature jumped unusually fast across samples.');
  }

  // Strict trigger: require multiple anomalies, or one very strong anomaly.
  const strong = presentFlips >= 1 || hasZeroOrNegativeVoltage;
  const mediumCount = reasons.length;
  const shouldFlag = strong || mediumCount >= 2;
  if (!shouldFlag) return findings;

  const vNums = voltages.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const lNums = levels.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const tNums = tempsC.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const evidence = {
    samples: dumps.length,
    presentFlips,
    chargingFlips,
    voltageMv: vNums.length ? { min: Math.min(...vNums), max: Math.max(...vNums), maxDelta: maxVoltageDelta } : undefined,
    level: lNums.length ? { min: Math.min(...lNums), max: Math.max(...lNums), maxDelta: maxLevelDelta } : undefined,
    tempC: tNums.length ? { min: Math.min(...tNums), max: Math.max(...tNums), maxDelta: maxTempDelta } : undefined,
    statusTokens: statuses.filter(Boolean),
  };

  const severity: Severity = strong || maxVoltageDelta >= 1200 ? 'high' : 'medium';
  findings.push({
    id: 'battery-connection',
    title: 'Battery/power readings look unstable',
    severity,
    details: `${reasons.join(' ')} If the phone shuts down when unplugged, this often fits a loose battery connector, failing battery, or unstable power path/PMIC.`,
    evidence,
  });

  return findings;
}

export function analyzeStorage(df: string): Finding[] {
  const findings: Finding[] = [];

  // df -h format is typically:
  // Filesystem Size Used Avail Use% Mounted on
  // We only care about user-writable partitions. Read-only system/apex mounts
  // commonly show 100% and are not actionable.
  const interestingMounts = new Set([
    '/data',
    '/cache',
    '/sdcard',
    '/storage/emulated',
    '/storage/emulated/0',
    '/mnt/sdcard',
    '/data/media',
  ]);

  const lines = df
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.toLowerCase().startsWith('filesystem')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    const useToken = parts[4];
    const mount = parts.slice(5).join(' ');
    if (!useToken || !mount) continue;

    // Only flag partitions the technician can actually act on.
    const matchInteresting = Array.from(interestingMounts).some(m => mount === m || mount.startsWith(`${m}/`));
    if (!matchInteresting) continue;

    const pct = Number(useToken.replace('%', ''));
    if (Number.isNaN(pct)) continue;

    if (pct >= 95) {
      findings.push({
        id: `storage-pressure-${mount.replace(/\W+/g, '-').replace(/^-+|-+$/g, '')}`,
        title: `Storage critically full (${pct}%)`,
        severity: 'high',
        details: `Partition ${mount} is nearly full. This can cause slowdowns, app crashes, and update/install failures.`,
        evidence: { mount, percent: pct, line },
      });
    } else if (pct >= 85) {
      findings.push({
        id: `storage-pressure-${mount.replace(/\W+/g, '-').replace(/^-+|-+$/g, '')}`,
        title: `Storage usage high (${pct}%)`,
        severity: 'medium',
        details: `Partition ${mount} is getting full. Consider freeing space before deeper testing.`,
        evidence: { mount, percent: pct, line },
      });
    }
  }

  return findings;
}

export function analyzeOsPatchLevel(propsDump: string): Finding[] {
  const findings: Finding[] = [];
  const patch = propsDump.match(/\[ro\.build\.version\.security_patch\]: \[(.+?)\]/)?.[1]?.trim();
  if (!patch) return findings;

  // patch is typically YYYY-MM-DD
  const m = patch.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    findings.push({
      id: 'os-security-patch',
      title: `Security patch level: ${patch}`,
      severity: 'low',
      details: 'Snapshot of OS security patch level.',
    });
    return findings;
  }

  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const ageDays = Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));

  let severity: Severity = 'low';
  let details = 'OS security patch level is reasonably recent.';
  if (ageDays > 365 * 2) {
    severity = 'high';
    details = 'OS security patch level is very old. This increases security risk and may indicate the phone is not receiving updates.';
  } else if (ageDays > 365) {
    severity = 'medium';
    details = 'OS security patch level is over 1 year old. This may indicate missed updates.';
  }

  findings.push({
    id: 'os-security-patch',
    title: `Security patch level: ${patch}`,
    severity,
    details,
    evidence: { patch, ageDays },
  });

  return findings;
}

export function analyzeMemoryHealth(procMeminfo: string): Finding[] {
  const findings: Finding[] = [];
  const totalKb = Number(procMeminfo.match(/^MemTotal:\s*(\d+)\s*kB/im)?.[1]);
  const availKb = Number(procMeminfo.match(/^MemAvailable:\s*(\d+)\s*kB/im)?.[1]);
  if (!Number.isFinite(totalKb) || !Number.isFinite(availKb) || totalKb <= 0) return findings;

  const availPct = (availKb / totalKb) * 100;
  if (availPct < 10) {
    findings.push({
      id: 'memory-low',
      title: 'Very low memory available',
      severity: 'high',
      details: `Only ${availPct.toFixed(1)}% RAM available. This can cause app crashes, UI lag, and background kills.`,
      evidence: { totalKb, availKb, availPct },
    });
  } else if (availPct < 20) {
    findings.push({
      id: 'memory-tight',
      title: 'Memory pressure detected',
      severity: 'medium',
      details: `Only ${availPct.toFixed(1)}% RAM available. Background apps may be killed during diagnostics.`,
      evidence: { totalKb, availKb, availPct },
    });
  } else {
    findings.push({
      id: 'memory-ok',
      title: 'Memory available looks OK',
      severity: 'low',
      details: `Available RAM: ${availPct.toFixed(1)}%.`,
      evidence: { totalKb, availKb, availPct },
    });
  }

  return findings;
}

export function analyzeLogs(logcat: string): Finding[] {
  const findings: Finding[] = [];
  if (/FATAL EXCEPTION|ANR in|java\.lang\.OutOfMemoryError/i.test(logcat)) {
    findings.push({
      id: 'crash-anr',
      title: 'Recent crash/ANR detected',
      severity: 'high',
      details: 'Logcat shows fatal errors.',
    });
  }

  // Display pipeline faults should require both display context and explicit
  // failure wording. This avoids false positives from unrelated watchdog logs.
  const lines = String(logcat || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const isDisplayContext = (line: string): boolean =>
    /(surfaceflinger|hwcomposer|\bhwc\b|openglrenderer|gralloc|composer|\bdisplay\b|\bgpu\b|\begl\b|vsync)/i.test(line);
  const isDisplayProblem = (line: string): boolean =>
    /(error|failed|fail|fatal|crash|hang|timeout|watchdog|not responding|deadlock|reset|abort)/i.test(line);
  const isStrongDisplayProblem = (line: string): boolean =>
    /(surfaceflinger.*(fatal|crash|not responding|watchdog|timeout)|hwcomposer.*(fatal|crash|not responding|watchdog|timeout)|\bgpu\b.*(hang|fault|watchdog|reset|timeout)|\begl\b.*(error|fail|crash)|gralloc.*(error|fail|crash))/i.test(line);

  const displayProblemLines = lines.filter(line => isDisplayContext(line) && isDisplayProblem(line));
  const strongDisplayLines = displayProblemLines.filter(isStrongDisplayProblem);
  const sampledDisplayEvidence = uniqueSample(
    [...strongDisplayLines, ...displayProblemLines],
    4,
  );
  const hasDisplayIssue = strongDisplayLines.length >= 1 || displayProblemLines.length >= 2;

  if (hasDisplayIssue) {
    const sev: Severity = strongDisplayLines.length >= 2 || displayProblemLines.length >= 4 ? 'high' : 'medium';
    const evidenceText = sampledDisplayEvidence.length
      ? ` Sample: ${sampledDisplayEvidence.join(' | ')}`
      : '';
    findings.push({
      id: 'display-pipeline',
      title: 'Display pipeline errors present',
      severity: sev,
      details: `Display pipeline error patterns were detected in logs.${evidenceText}`,
      evidence: {
        totalMatches: displayProblemLines.length,
        strongMatches: strongDisplayLines.length,
        sample: sampledDisplayEvidence,
      },
    });
  }
  return findings;
}

function uniqueSample(lines: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

export function analyzeUsbInstability(input: {
  logs?: string;
  warnLogs?: string;
  kernelLogs?: string;
}): Finding[] {
  const findings: Finding[] = [];
  const combined = [input.logs, input.warnLogs, input.kernelLogs].filter(Boolean).join('\n');
  if (!combined) return findings;

  const lines = combined.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Keep patterns strict to reduce false positives.
  const strong: RegExp[] = [
    /\bdevice offline\b/i,
    /\badbd\b.*\b(offline|disconnect|reset|failed|connection\s*reset|closed)\b/i,
    /\bUSB\b.*\b(disconnect(?:ed)?|reconnect(?:ed)?|reset|re-?enumerat)/i,
    /\bUSB_STATE\b.*\b(false|0)\b/i,
  ];

  const medium: RegExp[] = [
    /(Usb(DeviceManager|PortManager|HostManager|DebuggingManager)|UsbHandler).*\b(disconnect|reconnect|reset|enumerat|error|fail)/i,
    /\b(usb|adbd)\b.*\b(protocol\s*fault|not\s*responding)\b/i,
  ];

  let score = 0;
  let strongHits = 0;
  const hitLines: string[] = [];

  for (const line of lines) {
    let hit = false;
    for (const rx of strong) {
      if (rx.test(line)) {
        score += 3;
        strongHits += 1;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const rx of medium) {
        if (rx.test(line)) {
          score += 2;
          hit = true;
          break;
        }
      }
    }
    if (hit) hitLines.push(line);
  }

  const uniqueHits = uniqueSample(hitLines, 12);

  // Require repeated evidence to avoid single noisy lines.
  const hasRepeatedEvidence = uniqueHits.length >= 3;
  const triggers = (hasRepeatedEvidence && strongHits >= 1) || score >= 8;
  if (!triggers) return findings;

  const severity: Severity = score >= 12 || strongHits >= 2 ? 'high' : 'medium';
  findings.push({
    id: 'usb-instability',
    title: 'USB/ADB connection instability detected',
    severity,
    details:
      severity === 'high'
        ? 'Logs suggest repeated USB/ADB disconnects/resets. This can be caused by a loose cable/port, bad USB drivers, or unstable phone power/USB controller.'
        : 'Logs suggest some USB/ADB instability. If diagnostics randomly fail or the phone disconnects, check cable/port/USB drivers.',
    evidence: { score, strongHits, sample: uniqueHits },
  });

  return findings;
}

type ThermalStatusName =
  | 'NONE'
  | 'LIGHT'
  | 'MODERATE'
  | 'SEVERE'
  | 'CRITICAL'
  | 'EMERGENCY'
  | 'SHUTDOWN'
  | 'UNKNOWN';

function thermalStatusName(code: number): ThermalStatusName {
  switch (code) {
    case 0:
      return 'NONE';
    case 1:
      return 'LIGHT';
    case 2:
      return 'MODERATE';
    case 3:
      return 'SEVERE';
    case 4:
      return 'CRITICAL';
    case 5:
      return 'EMERGENCY';
    case 6:
      return 'SHUTDOWN';
    default:
      return 'UNKNOWN';
  }
}

export function analyzeThermalThrottling(thermalDump: string, logs?: string, warnLogs?: string): Finding[] {
  const findings: Finding[] = [];
  if (!thermalDump) return findings;

  const combinedLogs = [logs, warnLogs].filter(Boolean).join('\n');

  // Android 10+ commonly prints "Thermal Status: <n>" in dumpsys thermalservice.
  const statusMatch = thermalDump.match(/Thermal\s+Status:\s*(\d+)/i);
  const statusCode = statusMatch?.[1] ? Number(statusMatch[1]) : undefined;
  const statusName = typeof statusCode === 'number' && Number.isFinite(statusCode)
    ? thermalStatusName(statusCode)
    : undefined;

  const throttlingLines = sampleLines(`${thermalDump}\n${combinedLogs}`, /throttl|overheat|skin\s*temp|thermal\s*mitigation|temperature\s*too\s*high/i, 8);

  const statusSevereEnough = typeof statusCode === 'number' && Number.isFinite(statusCode) && statusCode >= 2;
  const throttlingEvidence = throttlingLines.length >= 3;

  if (!statusSevereEnough && !throttlingEvidence) return findings;

  let severity: Severity = 'medium';
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    if (statusCode >= 4) severity = 'high';
    else if (statusCode >= 3) severity = 'medium';
    else severity = 'medium';
  }

  const titleSuffix = statusName ? ` (${statusName})` : '';
  findings.push({
    id: 'thermal-throttling',
    title: `Thermal throttling/overheat evidence${titleSuffix}`,
    severity,
    details:
      severity === 'high'
        ? 'Thermal status looks critical. This can cause severe lag or automatic shutdowns. Let the device cool and check for blocked vents/case/charging heat.'
        : 'Thermal throttling evidence found. Performance may drop and instability can increase when the device is hot.',
    evidence: {
      thermalStatus: typeof statusCode === 'number' && Number.isFinite(statusCode) ? { code: statusCode, name: statusName } : undefined,
      sample: throttlingLines.length ? throttlingLines : undefined,
    },
  });

  return findings;
}

export function analyzeRadioModemStability(input: {
  logs?: string;
  warnLogs?: string;
  crashLogs?: string;
  kernelLogs?: string;
}): Finding[] {
  const findings: Finding[] = [];
  const combined = [input.logs, input.warnLogs, input.crashLogs, input.kernelLogs].filter(Boolean).join('\n');
  if (!combined) return findings;

  const lines = combined.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const strong: RegExp[] = [
    /\b(subsystem_restart|subsystem restart|SSR)\b.*\b(modem|mpss|riva|cdsp|adsp)\b/i,
    /\bmodem\b.*\b(crash|watchdog|fatal|reset|restarted)\b/i,
    /\b(baseband|qcril|ril-daemon)\b.*\b(died|crash|restarting)\b/i,
  ];

  const medium: RegExp[] = [
    /\b(telephony|ims|imsservice|com\.android\.phone)\b.*\b(crash|died|not responding|ANR)\b/i,
    /\b(radio|RIL)\b.*\b(error|fail|reset)\b/i,
  ];

  let score = 0;
  let strongHits = 0;
  const hitLines: string[] = [];

  for (const line of lines) {
    let hit = false;
    for (const rx of strong) {
      if (rx.test(line)) {
        score += 3;
        strongHits += 1;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const rx of medium) {
        if (rx.test(line)) {
          score += 2;
          hit = true;
          break;
        }
      }
    }
    if (hit) hitLines.push(line);
  }

  const uniqueHits = uniqueSample(hitLines, 12);
  const triggers = uniqueHits.length >= 3 || strongHits >= 2 || score >= 10;
  if (!triggers) return findings;

  const severity: Severity = score >= 12 || strongHits >= 2 ? 'high' : 'medium';
  findings.push({
    id: 'radio-modem-instability',
    title: 'Radio/modem instability evidence detected',
    severity,
    details:
      severity === 'high'
        ? 'Logs suggest modem/baseband crashes or subsystem restarts. Symptoms can include no signal, SIM drops, mobile data failing, or random reboots.'
        : 'Logs suggest some radio/telephony instability. If signal/data is unreliable, consider updating firmware, checking SIM, or testing in safe mode.',
    evidence: { score, strongHits, sample: uniqueHits },
  });

  return findings;
}

export type ShutdownCauseCategory =
  | 'thermal'
  | 'watchdog'
  | 'kernel-panic'
  | 'system-crash'
  | 'undervoltage'
  | 'low-battery'
  | 'power-cut'
  | 'user-reboot'
  | 'unknown';

export type ShutdownInference = {
  category: ShutdownCauseCategory;
  summary?: string;
  evidence?: string[];
};

function sampleLines(text: string, rx: RegExp, limit: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (rx.test(line)) {
      const trimmed = line.trim();
      if (trimmed) out.push(trimmed);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function inferShutdownCause(input: {
  bootReason?: string;
  logs?: string;
  warnLogs?: string;
  crashLogs?: string;
  kernelLogs?: string;
  powerDump?: string;
  thermalDump?: string;
  batteryDump?: string;
}): ShutdownInference {
  const bootReasonRaw = String(input.bootReason || '').trim();
  const bootReason = bootReasonRaw.toLowerCase();
  const combined = [input.logs, input.warnLogs, input.crashLogs, input.kernelLogs, input.powerDump, input.thermalDump]
    .filter(Boolean)
    .join('\n');
  const combinedLower = combined.toLowerCase();

  const evidence: string[] = [];
  if (bootReasonRaw) evidence.push(`bootReason=${bootReasonRaw}`);

  // Strongest signals first.
  if (
    /thermal/.test(bootReason) ||
    /thermal\s*shutdown|overheat\s*shutdown|shutdown\s*due\s*to\s*temperature/i.test(combined)
  ) {
    evidence.push(...sampleLines(combined, /thermal\s*shutdown|overheat\s*shutdown|shutdown\s*due\s*to\s*temperature|thermal/i, 4));
    return { category: 'thermal', summary: 'Thermal protection shutdown/reboot hints were found.', evidence: evidence.slice(0, 8) };
  }

  if (/kernel\s*panic|panic|fatal\s*exception\s*in\s*kernel/.test(bootReason) || /kernel\s*panic|panic\s*cpu|not\s*syncing/i.test(combinedLower)) {
    evidence.push(...sampleLines(combined, /kernel\s*panic|not\s*syncing|panic\s*cpu/i, 4));
    return { category: 'kernel-panic', summary: 'Kernel panic / low-level firmware crash hints were found.', evidence: evidence.slice(0, 8) };
  }

  if (/watchdog|wdog|hang/.test(bootReason) || /watchdog|wdog|system_server\s+watchdog|hang\s+detected/i.test(combinedLower)) {
    evidence.push(...sampleLines(combined, /watchdog|wdog|system_server\s+watchdog|hang\s+detected/i, 4));
    return { category: 'watchdog', summary: 'Watchdog/hang reboot hints were found.', evidence: evidence.slice(0, 8) };
  }

  if (/uvlo|undervoltage|under-voltage|brownout/.test(bootReason) || /\b(uvlo|undervoltage|under-voltage|brownout)\b/i.test(combined)) {
    evidence.push(...sampleLines(combined, /\b(uvlo|undervoltage|under-voltage|brownout)\b/i, 4));
    return { category: 'undervoltage', summary: 'Undervoltage/UVLO hints were found (battery sag or power-path issue).', evidence: evidence.slice(0, 8) };
  }

  if (/low\s*battery|battery\s*shutdown|shutdown\s*battery/.test(bootReason) || /low\s+battery|battery\s+shutdown/i.test(combinedLower)) {
    evidence.push(...sampleLines(combined, /low\s+battery|battery\s+shutdown/i, 4));
    return { category: 'low-battery', summary: 'Low-battery shutdown hints were found.', evidence: evidence.slice(0, 8) };
  }

  // Less explicit: power cut / PMIC / VBAT / VSYS without a clear UVLO keyword.
  if (/pmic|pmu|vbat|vbatt|vsys|power\s*loss|sudden\s*shutdown/.test(bootReason) || /\b(pmic|pmu|vbat|vbatt|vsys|power\s*loss)\b/i.test(combined)) {
    evidence.push(...sampleLines(combined, /\b(pmic|pmu|vbat|vbatt|vsys|power\s*loss|sudden\s*shutdown|unexpected\s*shutdown)\b/i, 4));
    return { category: 'power-cut', summary: 'Power-loss / PMIC/battery-rail hints were found.', evidence: evidence.slice(0, 8) };
  }

  if (/reboot\s*requested|reboot,\s*user|power\s*key|long\s*press/.test(bootReason) || /reboot\s*requested|power\s*key|long\s*press/i.test(combinedLower)) {
    evidence.push(...sampleLines(combined, /reboot\s*requested|power\s*key|long\s*press/i, 4));
    return { category: 'user-reboot', summary: 'User-initiated reboot/power-key hints were found.', evidence: evidence.slice(0, 8) };
  }

  // If logs show repeated core crashes, this can present as “random restarts”.
  if (/system_server\s+crash|zygote\s+crash|fatal\s+exception.*system_server|watchdog/.test(combinedLower)) {
    evidence.push(...sampleLines(combined, /system_server\s+crash|zygote\s+crash|FATAL\s+EXCEPTION.*system_server/i, 4));
    return { category: 'system-crash', summary: 'System crash-loop hints were found (may cause restarts).', evidence: evidence.slice(0, 8) };
  }

  // No strong signal.
  return { category: 'unknown', summary: bootReasonRaw ? 'Boot reason was present but not specific enough to classify.' : 'No reliable shutdown/reboot reason was accessible via ADB.' };
}

export interface AppWithPerms {
  packageName?: string;
  path?: string;
  raw?: string;
}
const RISKY_PERMISSIONS = [
  'BIND_ACCESSIBILITY_SERVICE',
  'RECEIVE_SMS',
  'READ_SMS',
  'SEND_SMS',
  'READ_CALL_LOG',
  'WRITE_CALL_LOG',
  'CALL_PHONE',
  'WRITE_SETTINGS',
  'WRITE_SECURE_SETTINGS',
  'SYSTEM_ALERT_WINDOW',
  'DEVICE_ADMIN',
  'REQUEST_INSTALL_PACKAGES',
  'PACKAGE_USAGE_STATS',
  'BIND_VPN_SERVICE',
  'BIND_NOTIFICATION_LISTENER_SERVICE',
  'MANAGE_EXTERNAL_STORAGE',
];

const MODERATE_PERMISSIONS = [
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'GET_ACCOUNTS',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'RECORD_AUDIO',
  'CAMERA',
  'READ_PHONE_STATE',
  'READ_PHONE_NUMBERS',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
];

export interface AppRiskDetails {
  risk: RiskLevel;
  riskyPermissions: string[];
  moderatePermissions: string[];
}

export function assessAppRisk(perms: string[]): AppRiskDetails {
  const upper = perms.map(p => p.toUpperCase());

  const riskyPermissions = perms.filter(p =>
    RISKY_PERMISSIONS.some(r => p.toUpperCase().includes(r)),
  );
  const moderatePermissions = perms.filter(p =>
    MODERATE_PERMISSIONS.some(m => p.toUpperCase().includes(m)),
  );

  let risk: RiskLevel = 'safe';
  if (riskyPermissions.length) {
    risk = 'risky';
  } else if (moderatePermissions.length) {
    risk = 'moderate';
  }

  return { risk, riskyPermissions, moderatePermissions };
}

export function classifyAppRisk(perms: string[]): RiskLevel {
  return assessAppRisk(perms).risk;
}

export interface AppRiskScore {
  score: number; // 0 (lowest) to 100 (highest risk)
  level: RiskLevel;
}

export function scoreAppRisk(perms: string[], path?: string): AppRiskScore {
  const { risk, riskyPermissions, moderatePermissions } = assessAppRisk(perms);

  let score = 0;
  const riskyCount = riskyPermissions.length;
  const moderateCount = moderatePermissions.length;

  if (risk === 'risky') {
    // Base 60 + up to 30 extra for multiple risky permissions
    score = 60 + Math.min(30, riskyCount * 8);
  } else if (risk === 'moderate') {
    // Base 30 + up to 20 extra for multiple moderate permissions
    score = 30 + Math.min(20, moderateCount * 3);
  } else {
    // Safe apps with some permissions get a small base (5)
    score = perms.length > 0 ? 5 : 0;
  }

  // Penalize apps installed in user data (not system) – they are more likely to be suspicious
  if (path && /^\/(data|mnt\/asec)/.test(path)) {
    score += 10;
  } else if (path && /^\/(system|product|system_ext)/.test(path)) {
    score -= 5;
  }

  // New: Penalize obfuscated package names (e.g., com.a.b.cd, random strings)
  // This is a heuristic; can be refined.
  // We'll apply this penalty only if the app is not from a legit store.
  // For now, we add a small extra to score if the package name looks suspicious.
  // (We'll handle the package name check outside this function for simplicity.)

  score = Math.min(100, Math.max(0, score));
  let level: RiskLevel;
  if (score <= 29) level = 'safe';
  else if (score <= 69) level = 'moderate';
  else level = 'risky';

  return { score, level };
}

export function isObfuscatedPackageName(pkg: string): boolean {
  // Too many dots (e.g., > 4) or segments like "a", "b", "c"
  const parts = pkg.split('.');
  if (parts.length > 5) return true;
  // Many parts that are single letters or very short
  const shortParts = parts.filter(p => p.length <= 2).length;
  if (shortParts >= 3) return true;
  // Contains random-looking hex or base64 patterns
  if (/[0-9a-f]{8,}/i.test(pkg)) return true;
  // Contains keywords like "clean", "boost", "root", "hack" (already in suspicious patterns, but we add a penalty)
  return false;
}

// Known suspicious package patterns and adware signatures
const SUSPICIOUS_PACKAGE_PATTERNS = [
  // Common adware/malware patterns
  /\.ad(s|vert|mob|overlay)/i,
  /\.push(notification|ads|msg)/i,
  /\.banner/i,
  /\.popup/i,
  /\.installer$/i,
  /\.downloader$/i,
  /\.fake[a-z]+/i,
  /\.virus/i,
  /\.trojan/i,
  /\.malware/i,
  /\.spy/i,
  // Known adware package substrings
  /airpush/i,
  /applovin/i,
  /admob(?!.*google)/i, // AdMob not from Google
  /startapp/i,
  /leadbolt/i,
  /appbrain/i,
  /mobfox/i,
  /inmobi/i,
  /tapjoy/i,
  // Suspicious generic names
  /systemupdate/i,
  /systemservice(?!.*android)/i,
  /cleaner(?!.*system)/i,
  /booster(?!.*system)/i,
  /optimizer/i,
  /battery[._-]?saver/i,
  /ram[._-]?cleaner/i,
  /junk[._-]?(cleaner|remover)/i,
  /phone[._-]?cleaner/i,
  /super[._-]?clean/i,
  /fast[._-]?clean/i,
  /turbo[._-]?clean/i,
  /wifi[._-]?(hack|crack|free)/i,
  /root[._-]?(checker|tool|master)/i,
  /mod[._-]?apk/i,
  /crack(ed)?$/i,
  /hack(ed)?$/i,
  /cheat/i,
  /keygen/i,
  // Add to SUSPICIOUS_PACKAGE_PATTERNS in heuristics.ts
/.*root.*/i,                // apps that mention root
/.*su\b/i,                  // apps that call "su"
/.*magisk/i,                // Magisk Manager or related tools
/.*xposed/i,                // Xposed Framework modules
/.*hijack/i,
/.*spoof/i,
/.*inject/i,
/.*hook/i,
/.*exploit/i,
/.*bypass/i,
/.*unlock/i,
/.*frida/i,                 // Frida instrumentation (often used for runtime manipulation)
/.*burp/i,                  // Burp certificate installation (man‑in‑the‑middle)
/.*ssl\s*pinning\s*bypass/i,
/.*runtime\s*modification/i,
];

// Known legitimate package prefixes to exclude from suspicious detection
export const TRUSTED_PREFIXES = [
  'com.google.',
  'com.android.',
  'com.samsung.',
  'com.sec.android.',
  'com.huawei.',
  'com.xiaomi.',
  'com.oppo.',
  'com.vivo.',
  'com.oneplus.',
  'com.coloros.',
  'com.heytap.',
  'com.oplus.',
  'com.realme.',
  'com.miui.',
  'com.qualcomm.',
  'com.mediatek.',
  'com.lenovo.',
  'com.motorola.',
  'com.sony.',
  'com.lge.',
  'com.asus.',
  'com.nokia.',
  'com.hmdglobal.',
  'com.transsion.',
  'com.tecno.',
  'com.infinix.',
  'com.microsoft.',
  'com.facebook.',
  'com.whatsapp',
  'com.instagram.',
  'com.twitter.',
  'com.spotify.',
  'com.netflix.',
  'com.amazon.',
  'org.mozilla.',
  'com.brave.',
  'com.opera.',
];

export const TRUSTED_EXACT_PACKAGES = [
  'com.wssyncmldm',
  'com.ws.dm',
  'com.ws.dmclient',
  'com.redbend.client',
  'com.redbend.vdmc',
  'com.redbend.wappush',
];

function isHighRiskByPermissions(upperPerms: string[]): boolean {
  return (
    upperPerms.some(p => p.includes('SYSTEM_ALERT_WINDOW')) ||
    upperPerms.some(p => p.includes('BIND_ACCESSIBILITY_SERVICE')) ||
    upperPerms.some(p => p.includes('DEVICE_ADMIN')) ||
    upperPerms.some(p => p.includes('READ_SMS') || p.includes('SEND_SMS') || p.includes('READ_CALL_LOG') || p.includes('WRITE_CALL_LOG'))
  );
}
export function classifyThreatTypes(packageName: string, permissions: string[]): ThreatInfo[] {
  const threats: ThreatInfo[] = [];
  // Normalise permissions: strip 'android.permission.' prefix
  const permsShort = permissions.map(p => p.replace(/^android\.permission\./, ''));

  // Banking trojan indicators
  const bankingKeywords = ['bank', 'pay', 'cash', 'wallet', 'credit', 'debit', 'finance', 'vbv', 'otp', 'secure'];
  const hasSmsPerm = permsShort.includes('READ_SMS') || permsShort.includes('SEND_SMS');
  const hasInternet = permsShort.includes('INTERNET');
  if (hasSmsPerm && hasInternet && bankingKeywords.some(kw => packageName.toLowerCase().includes(kw))) {
    threats.push({
      type: 'banking_trojan',
      description: 'May steal banking credentials, intercept OTPs, and drain financial accounts.',
      severity: 'critical'
    });
  }

  // Spyware indicators
  const spyPerms = ['RECORD_AUDIO', 'CAMERA', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'READ_CALL_LOG'];
  const spyCount = spyPerms.filter(p => permsShort.includes(p)).length;
  if (spyCount >= 3) {
    threats.push({
      type: 'spyware',
      description: 'Can secretly record audio/video, track location, and steal personal data.',
      severity: 'critical'
    });
  }

  // RAT (Remote Access Trojan) indicators
  const ratPerms = ['SYSTEM_ALERT_WINDOW', 'BIND_ACCESSIBILITY_SERVICE', 'REQUEST_INSTALL_PACKAGES'];
  const ratCount = ratPerms.filter(p => permsShort.includes(p)).length;
  if (ratCount >= 2) {
    threats.push({
      type: 'rat',
      description: 'Can take full remote control of your device, view screen, and perform actions without consent.',
      severity: 'critical'
    });
  }

  // Adware / click fraud indicators
  const adwareKeywords = ['ad', 'push', 'notification', 'click', 'reward', 'offer', 'ads', 'advert'];
  const hasOverlay = permsShort.includes('SYSTEM_ALERT_WINDOW');
  if (adwareKeywords.some(kw => packageName.toLowerCase().includes(kw)) || hasOverlay) {
    threats.push({
      type: 'adware',
      description: 'Shows intrusive ads, may simulate clicks to generate fraudulent revenue, drains battery and data.',
      severity: 'medium'
    });
  }

  // Cryptominer indicators
  const minerKeywords = ['miner', 'crypto', 'bitcoin', 'eth', 'monero', 'mine'];
  if (minerKeywords.some(kw => packageName.toLowerCase().includes(kw))) {
    threats.push({
      type: 'cryptominer',
      description: 'Uses your CPU to mine cryptocurrency, causing overheating, battery drain, and potential hardware damage.',
      severity: 'high'
    });
  }

  // Ransomware indicators
  const ransomKeywords = ['ransom', 'lock', 'encrypt', 'decrypt', 'unlock'];
  if (ransomKeywords.some(kw => packageName.toLowerCase().includes(kw))) {
    threats.push({
      type: 'ransomware',
      description: 'May lock your device or encrypt files and demand payment.',
      severity: 'critical'
    });
  }

  if (threats.length === 0) {
    threats.push({
      type: 'generic_risk',
      description: 'Suspicious behavior detected (unknown source, unusual permissions, or pattern).',
      severity: 'medium'
    });
  }

  return threats;
}

function isFromLegitStore(pkg: string, installerMap?: Record<string, string | null>): boolean {
  if (!installerMap) return false;
  if (!(pkg in installerMap)) return false;
  const installer = installerMap[pkg];
  if (!installer) return false;
  return LEGITIMATE_INSTALLERS.includes(installer);
}

// Known problematic apps (modified/fake versions)
const KNOWN_FAKE_APPS: Record<string, string> = {
  'com.facebook.katana.mod': 'Modified Facebook (Unofficial)',
  'com.facebook.lite.mod': 'Modified Facebook Lite (Unofficial)',
  'com.whatsapp.w4b': 'WhatsApp Unofficial Mod',
  'com.whatsapp.plus': 'WhatsApp Plus (Unofficial)',
  'com.gb.whatsapp': 'GB WhatsApp (Unofficial)',
  'com.ogwhatsapp': 'OG WhatsApp (Unofficial)',
  'com.instagram.android.mod': 'Modified Instagram (Unofficial)',
  'com.snapchat.android.mod': 'Modified Snapchat (Unofficial)',
  'com.spotify.music.mod': 'Modified Spotify (Unofficial)',
  'com.netflix.mediaclient.mod': 'Modified Netflix (Unofficial)',
  'com.pubg.imobile.mod': 'Modified PUBG (May contain cheats/malware)',
  'com.tencent.ig.mod': 'Modified PUBG Mobile (Unofficial)',
};

export interface SuspiciousApp {
  packageName: string;
  displayName: string;
  reason: string;
  threatLevel: 'high' | 'medium' | 'low';
  suggestedAction: string;
  threatTypes?: ThreatInfo[]; // optional, for backwards compatibility
}

// Known Play Store / legitimate installer package names
export const LEGITIMATE_INSTALLERS = [
  'com.android.vending',         // Google Play Store
  'com.google.android.packageinstaller',
  'com.samsung.android.scloud',  // Samsung Cloud restore
  'com.sec.android.app.samsungapps', // Samsung Galaxy Store
  'com.huawei.appmarket',        // Huawei AppGallery
  'com.xiaomi.market',           // Xiaomi GetApps
  'com.oppo.market',             // OPPO App Market
  'com.heytap.market',           // OPPO/Realme HeyTap Market
  'com.bbk.appstore',            // Vivo App Store
  'com.amazon.venezia',          // Amazon Appstore
];

export function detectSuspiciousApps(
  apps: AppWithPerms[],
  permsByPkg: Record<string, string[]>,
  installerMap?: Record<string, string | null>,
): SuspiciousApp[] {
  const suspicious: SuspiciousApp[] = [];

  function displayNameFromPackage(pkg: string): string {
    let name = pkg.split('.').pop() || pkg;
    return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function isSystemApp(app: AppWithPerms): boolean {
    if (!app.path) return false;
    const lower = app.path.toLowerCase();
    return lower.startsWith('/system/') || lower.startsWith('/vendor/') ||
           lower.startsWith('/product/') || lower.startsWith('/odm/') ||
           lower.startsWith('/system_ext/');
  }

  const TRUSTED_SIDELOADED = new Set([
    'cyou.joiplay.joiplay',
    'cyou.joiplay.runtime.rpgmaker',
    'cyou.joiplay.runtime.renpy.v8d4d1',
    'org.fdroid.fdroid',
    'com.termux',
  ]);

  const SYSTEM_PACKAGE_PREFIXES = [
    'android.', 'com.android.', 'com.google.android.', 'com.unisoc.', 'com.sprd.',
    'com.mediatek.', 'com.qualcomm.', 'com.samsung.', 'com.huawei.', 'com.xiaomi.',
    'com.oplus.', 'com.vivo.', 'com.oneplus.', 'com.lge.', 'com.sony.', 'com.nokia.',
    'com.sec.android.', 'com.cyanogenmod.', 'com.lineageos.', 'com.spreadtrum.',
    'com.sprd.engineermode', 'com.sprd.validationtools', 'com.sprd.logmanager',
    'com.unisoc.silent.reboot', 'android.overlay.', 'com.silent.reboot'
  ];

  for (const app of apps) {
    const pkg = app.packageName;
    if (!pkg) continue;

    if (isSystemApp(app)) continue;
    if (SYSTEM_PACKAGE_PREFIXES.some(prefix => pkg.startsWith(prefix))) continue;
    if (TRUSTED_PREFIXES.some(prefix => pkg.startsWith(prefix))) continue;
    if (TRUSTED_EXACT_PACKAGES.includes(pkg)) continue;
    if (TRUSTED_SIDELOADED.has(pkg)) continue;

    const perms = permsByPkg[pkg] || [];
    const upper = perms.map(p => p.toUpperCase());

    let installer: string | null = null;
    let fromLegitStore = false;
    if (installerMap && pkg in installerMap) {
      installer = installerMap[pkg];
      fromLegitStore = installer !== null && LEGITIMATE_INSTALLERS.includes(installer);
    }
    const isSideloaded = !fromLegitStore;

    // ----- SIDELOADED APPS – flag for review even if permissions are missing -----
    if (isSideloaded) {
      const reason = `Sideloaded app — not installed from an official store. Installer: ${installer || 'Unknown'}. Review if necessary.`;
      // Give it at least medium threat so it appears in the list
      const threatLevel: 'high' | 'medium' | 'low' = 'medium';
      suspicious.push({
        packageName: pkg,
        displayName: displayNameFromPackage(pkg),
        reason,
        threatLevel,
        suggestedAction: `Review ${displayNameFromPackage(pkg)}. If you didn't install it manually, uninstall.`,
        threatTypes: classifyThreatTypes(pkg, perms)
      });
      continue;
    }

    // ----- CAMERA + INTERNET (spyware) -----
    const hasCamera = upper.some(p => p.includes('CAMERA'));
    const hasInternet = upper.some(p => p.includes('INTERNET'));
    if (hasCamera && hasInternet) {
      const reason = "App requests both camera and internet permissions – commonly used by spyware to capture and exfiltrate images/video.";
      suspicious.push({
        packageName: pkg,
        displayName: displayNameFromPackage(pkg),
        reason,
        threatLevel: "high",
        suggestedAction: `Uninstall ${displayNameFromPackage(pkg)} immediately.`,
        threatTypes: classifyThreatTypes(pkg, perms)
      });
      continue;
    }

    // ----- Other heuristics (risk score >= 30, many permissions, dangerous permissions, obfuscated name) -----
    const risk = scoreAppRisk(perms);
    let riskScore = risk.score;
    if (isObfuscatedPackageName(pkg) && !fromLegitStore) {
      riskScore = Math.min(100, riskScore + 15);
    }
    const highRiskScore = riskScore >= 30;

    const dangerousPermsList = [
      'READ_SMS', 'SEND_SMS', 'RECEIVE_SMS', 'READ_CALL_LOG', 'WRITE_CALL_LOG', 'CALL_PHONE',
      'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'RECORD_AUDIO',
      'SYSTEM_ALERT_WINDOW', 'BIND_ACCESSIBILITY_SERVICE', 'DEVICE_ADMIN',
      'REQUEST_INSTALL_PACKAGES', 'INSTALL_PACKAGES', 'PACKAGE_USAGE_STATS',
      'WRITE_SETTINGS', 'WRITE_SECURE_SETTINGS', 'MANAGE_EXTERNAL_STORAGE',
      'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'
    ];
    const hasDangerous = dangerousPermsList.some(d => upper.includes(d));
    const totalPerms = perms.length;
    const manyPerms = totalPerms > 15;

    if (highRiskScore || manyPerms || hasDangerous) {
      let reason = '';
      let threatLevel: 'high' | 'medium' | 'low' = 'medium';

      if (isObfuscatedPackageName(pkg) && !fromLegitStore) {
        reason += `Obfuscated package name (often used by malware). `;
      }
      if (highRiskScore) {
        reason += `Risk score ${riskScore}/100. `;
        threatLevel = riskScore >= 70 ? 'high' : 'medium';
      }
      if (manyPerms) {
        reason += `Asks for unusually many permissions (${totalPerms}). `;
        threatLevel = 'medium';
      }
      if (hasDangerous && !highRiskScore && !manyPerms) {
        const dangerousFound = dangerousPermsList.filter(d => upper.includes(d));
        reason += `Requests dangerous permissions: ${dangerousFound.join(', ')}. `;
        threatLevel = 'high';
      }

      suspicious.push({
        packageName: pkg,
        displayName: displayNameFromPackage(pkg),
        reason: reason.trim(),
        threatLevel,
        suggestedAction: threatLevel === 'high'
          ? `Uninstall ${displayNameFromPackage(pkg)} immediately.`
          : `Review ${displayNameFromPackage(pkg)}.`,
        threatTypes: classifyThreatTypes(pkg, perms)
      });
    }
  }
  return suspicious;
}

export function detectPackerIndicators(packageName: string, apkPath?: string): { isPacked: boolean; reason: string } {
    if (!apkPath) return { isPacked: false, reason: '' };
    try {
        // Quick check for known packer libraries in APK (using `aapt` or `unzip -l`)
        const { execSync } = require('child_process');
        const output = execSync(`unzip -l "${apkPath}" | grep -i "lib.*\\.so"`, { encoding: 'utf8', timeout: 5000 });
        const libs = output.split('\n');
        const packerLibs = ['libupx', 'libthemida', 'libmpress', 'libvmprotect', 'libenigma', 'libobsidium'];
        for (const lib of libs) {
            const lower = lib.toLowerCase();
            for (const p of packerLibs) {
                if (lower.includes(p)) {
                    return { isPacked: true, reason: `Contains known packer library: ${p}` };
                }
            }
        }
        // Also check for high entropy in certain sections (quick approximation)
        // For simplicity, we skip full entropy; can add later.
    } catch (e) {}
    return { isPacked: false, reason: '' };
}
// src/heuristics.ts
// Add to src/heuristics.ts
export function hasDangerousPermissions(perms: string[]): boolean {
    const dangerousList = [
        'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION',
        'CAMERA', 'RECORD_AUDIO', 'READ_SMS', 'SEND_SMS',
        'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
        'READ_PHONE_STATE', 'SYSTEM_ALERT_WINDOW'
    ];
    return perms.some(p => dangerousList.includes(p));
}


export function analyzeApps(apps: AppWithPerms[], permsByPkg: Record<string, string[]>): Finding[] {
  const findings: Finding[] = [];
  for (const app of apps) {
    const pkg = app.packageName;
    if (!pkg) continue;
    const perms = permsByPkg[pkg] || [];
    const risk = classifyAppRisk(perms);

    if (risk === 'risky') {
      const risky = perms.filter(p => RISKY_PERMISSIONS.some(r => p.toUpperCase().includes(r)));
      findings.push({
        id: `risky-${pkg}`,
        title: `App requests risky permissions: ${pkg}`,
        severity: 'high',
        details: risky.join(', '),
      });
    } else if (risk === 'moderate') {
      const moderate = perms.filter(p => MODERATE_PERMISSIONS.some(m => p.toUpperCase().includes(m)));
      findings.push({
        id: `moderate-${pkg}`,
        title: `App requests sensitive permissions: ${pkg}`,
        severity: 'medium',
        details: moderate.join(', '),
      });
    }
  }
  
  return findings;
}