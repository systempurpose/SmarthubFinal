import type { Express, Request, Response } from 'express';

import { adb } from '../adb';

function safeText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function parsePingSummary(output: string): {
  transmitted?: number;
  received?: number;
  lossPct?: number;
  minMs?: number;
  avgMs?: number;
  maxMs?: number;
} {
  const out = output || '';

  // Android ping summary usually includes:
  // "10 packets transmitted, 10 received, 0% packet loss, time 9014ms"
  const m1 = out.match(/(\d+)\s+packets\s+transmitted,\s+(\d+)\s+(?:packets\s+)?received,\s+(\d+)%\s+packet\s+loss/i);
  const transmitted = m1 ? Number(m1[1]) : undefined;
  const received = m1 ? Number(m1[2]) : undefined;
  const lossPct = m1 ? Number(m1[3]) : undefined;

  // "rtt min/avg/max/mdev = 7.123/8.456/9.789/0.123 ms" or "round-trip min/avg/max = ..."
  const m2 = out.match(/(?:rtt|round-trip)[^=]*=\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)\//i);
  const m3 = out.match(/(?:rtt|round-trip)[^=]*=\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)\s*ms/i);
  const mm = m2 || m3;

  const minMs = mm ? Number(mm[1]) : undefined;
  const avgMs = mm ? Number(mm[2]) : undefined;
  const maxMs = mm ? Number(mm[3]) : undefined;

  return {
    transmitted,
    received,
    lossPct,
    minMs,
    avgMs,
    maxMs,
  };
}

function parsePingTimes(output: string): number[] {
  const out = output || '';
  // Typical per-packet lines contain: time=12.3 ms
  const times: number[] = [];
  const re = /\btime=([0-9.]+)\s*ms\b/gi;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(out))) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) times.push(v);
  }
  return times;
}

function stdev(values: number[]): number | undefined {
  if (!values || values.length < 2) return undefined;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
  const sd = Math.sqrt(Math.max(0, variance));
  return Number.isFinite(sd) ? sd : undefined;
}

function parseDefaultRoute(ipRouteOut: string): { gateway?: string; iface?: string } {
  const out = ipRouteOut || '';
  // Example: "default via 192.168.1.1 dev wlan0"
  const m = out.match(/^default\s+via\s+([^\s]+)\s+dev\s+([^\s]+)/m);
  if (!m) return {};
  return { gateway: m[1], iface: m[2] };
}

function parseWifiBasicsFromCmdWifiStatus(cmdWifiOut: string): {
  ssid?: string;
  bssid?: string;
  rssiDbm?: number;
  linkSpeedMbps?: number;
  frequencyMHz?: number;
  ipAddress?: string;
} {
  const out = cmdWifiOut || '';

  // SSID can show as:
  // "SSID: <ssid>" or "SSID: \"MyWifi\"" or "SSID: <unknown ssid>"
  const ssidM = out.match(/\bSSID\s*:\s*(.+)$/im);
  let ssid = ssidM ? ssidM[1].trim() : undefined;
  if (ssid) ssid = ssid.replace(/^"|"$/g, '').trim();
  if (ssid && /unknown\s+ssid/i.test(ssid)) ssid = undefined;

  const bssidM = out.match(/\bBSSID\s*:\s*([0-9a-f:]{17})/im);
  const bssid = bssidM ? bssidM[1] : undefined;

  const rssiM = out.match(/\bRSSI\s*:\s*(-?\d+)\s*dBm/i) || out.match(/\brssi\s*:?\s*(-?\d+)\b/i);
  const rssiDbm = rssiM ? Number(rssiM[1]) : undefined;

  const linkM = out.match(/\bLink\s*speed\s*:\s*(\d+)\s*Mbps/i) || out.match(/\blinkSpeed\s*:?\s*(\d+)\b/i);
  const linkSpeedMbps = linkM ? Number(linkM[1]) : undefined;

  const freqM = out.match(/\bFrequency\s*:\s*(\d+)\s*MHz/i) || out.match(/\bfreq\s*:?\s*(\d+)\b/i);
  const frequencyMHz = freqM ? Number(freqM[1]) : undefined;

  const ipM = out.match(/\bIP\s+address\s*:\s*([^\s]+)\b/i) || out.match(/\bipAddress\s*:?\s*([^\s]+)\b/i);
  const ipAddress = ipM ? ipM[1] : undefined;

  return { ssid, bssid, rssiDbm, linkSpeedMbps, frequencyMHz, ipAddress };
}

function is24Ghz(freqMHz: number): boolean {
  return freqMHz >= 2400 && freqMHz <= 2500;
}

function is5Ghz(freqMHz: number): boolean {
  return freqMHz >= 4900 && freqMHz <= 5900;
}

function freqToChannel(freqMHz: number): number | undefined {
  if (!Number.isFinite(freqMHz) || freqMHz <= 0) return undefined;

  // 2.4 GHz: channels 1-14.
  if (freqMHz >= 2412 && freqMHz <= 2484) {
    if (freqMHz === 2484) return 14;
    const ch = Math.round((freqMHz - 2407) / 5);
    return ch >= 1 && ch <= 13 ? ch : undefined;
  }

  // 5 GHz: common formula for 5MHz spacing.
  if (freqMHz >= 5000 && freqMHz <= 5900) {
    const ch = Math.round((freqMHz - 5000) / 5);
    return ch >= 1 && ch <= 200 ? ch : undefined;
  }

  return undefined;
}

function parseWifiScanResultsFromDumpsysWifi(dump: string): Array<{ ssid?: string; bssid?: string; freqMHz?: number; rssiDbm?: number }> {
  const out: Array<{ ssid?: string; bssid?: string; freqMHz?: number; rssiDbm?: number }> = [];
  const text = dump || '';

  // Many Android versions print scan results with tokens including:
  // "SSID: <name>" "BSSID: aa:bb:.." "freq: 2412" "level: -55"
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const bssidM = l.match(/\bBSSID\s*[:=]\s*([0-9a-f:]{17})\b/i);
    const freqM = l.match(/\bfreq(?:uency)?\s*[:=]\s*(\d{3,5})\b/i);
    const levelM = l.match(/\b(?:level|rssi)\s*[:=]\s*(-?\d{2,3})\b/i);
    const ssidM = l.match(/\bSSID\s*[:=]\s*(.+?)\s*(?:\bBSSID\b|\bfreq\b|\blevel\b|$)/i);

    if (!bssidM && !freqM && !levelM && !ssidM) continue;

    const bssid = bssidM ? bssidM[1].toLowerCase() : undefined;
    const freqMHz = freqM ? Number(freqM[1]) : undefined;
    const rssiDbm = levelM ? Number(levelM[1]) : undefined;
    let ssid = ssidM ? ssidM[1].trim() : undefined;
    if (ssid) ssid = ssid.replace(/^"|"$/g, '').trim();
    if (ssid && /unknown\s+ssid/i.test(ssid)) ssid = undefined;

    out.push({ ssid, bssid, freqMHz: Number.isFinite(freqMHz as any) ? freqMHz : undefined, rssiDbm: Number.isFinite(rssiDbm as any) ? rssiDbm : undefined });
  }

  return out;
}

function summarizeChannelCongestion(scan: Array<{ freqMHz?: number }>): {
  band24: { total: number; top: Array<{ channel: number; count: number }> };
  band5: { total: number; top: Array<{ channel: number; count: number }> };
} {
  const counts24 = new Map<number, number>();
  const counts5 = new Map<number, number>();

  for (const s of scan) {
    const f = s.freqMHz;
    if (typeof f !== 'number' || !Number.isFinite(f)) continue;
    const ch = freqToChannel(f);
    if (typeof ch !== 'number') continue;
    if (is24Ghz(f)) counts24.set(ch, (counts24.get(ch) || 0) + 1);
    else if (is5Ghz(f)) counts5.set(ch, (counts5.get(ch) || 0) + 1);
  }

  const topN = (m: Map<number, number>, n = 5) => {
    return [...m.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  };

  const total24 = [...counts24.values()].reduce((a, b) => a + b, 0);
  const total5 = [...counts5.values()].reduce((a, b) => a + b, 0);

  return {
    band24: { total: total24, top: topN(counts24) },
    band5: { total: total5, top: topN(counts5) },
  };
}

function guessBestChannels(congestion: ReturnType<typeof summarizeChannelCongestion>): {
  suggest24?: number[];
  suggest5?: number[];
} {
  const suggestLeast = (top: Array<{ channel: number; count: number }>, preferred: number[]) => {
    if (!preferred.length) return undefined;
    const map = new Map(top.map(t => [t.channel, t.count] as const));
    const scored = preferred
      .map(ch => ({ ch, count: map.get(ch) ?? 0 }))
      .sort((a, b) => a.count - b.count);
    const best = scored.slice(0, 2).map(s => s.ch);
    return best.length ? best : undefined;
  };

  return {
    suggest24: suggestLeast(congestion.band24.top, [1, 6, 11]),
    // Conservative 5GHz set (common non-DFS channels; DFS varies by region/router).
    suggest5: suggestLeast(congestion.band5.top, [36, 40, 44, 48, 149, 153, 157, 161]),
  };
}

async function adbTryLines(deviceId: string, ...args: string[]): Promise<string[]> {
  const out = await adbTry(deviceId, ...args);
  if (!out) return [];
  return safeText(out)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

async function getWifiStatusBasics(deviceId: string): Promise<ReturnType<typeof parseWifiBasicsFromCmdWifiStatus>> {
  const cmdWifiStatus = await adbTry(deviceId, 'cmd', 'wifi', 'status');
  return parseWifiBasicsFromCmdWifiStatus(cmdWifiStatus || '');
}

async function listConfiguredWifiNetworks(deviceId: string): Promise<Array<{ networkId: string; ssid: string }>> {
  const lines = await adbTryLines(deviceId, 'cmd', 'wifi', 'list-networks');
  // Typical output formats vary. We attempt to match "NetworkId SSID"-style rows.
  const out: Array<{ networkId: string; ssid: string }> = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
    if (!m) continue;
    const networkId = m[1];
    let ssid = (m[2] || '').trim();
    ssid = ssid.replace(/^"|"$/g, '').trim();
    if (!ssid) continue;
    out.push({ networkId, ssid });
  }
  return out;
}

function parseConnectivityValidation(connectivityDump: string): {
  validated?: boolean;
  captivePortalHint?: boolean;
  notes?: string[];
} {
  const dump = connectivityDump || '';
  const notes: string[] = [];

  // Heuristics only: dumpsys formats vary across Android versions.
  const hasValidated = /\bVALIDATED\b/i.test(dump) || /\bvalidated\s*:\s*true\b/i.test(dump);
  const hasNotValidated = /\bNOT_VALIDATED\b/i.test(dump) || /\bvalidated\s*:\s*false\b/i.test(dump);

  const captivePortalHint = /\bCAPTIVE\b|captive\s*portal/i.test(dump);

  let validated: boolean | undefined;
  if (hasValidated && !hasNotValidated) validated = true;
  if (hasNotValidated && !hasValidated) validated = false;

  if (validated === true) notes.push('Network validation: VALIDATED');
  if (validated === false) notes.push('Network validation: NOT VALIDATED (possible captive portal / no internet)');
  if (captivePortalHint) notes.push('Captive portal hints detected');

  return { validated, captivePortalHint, notes: notes.length ? notes : undefined };
}

async function adbTry(deviceId: string, ...args: string[]): Promise<string | null> {
  try {
    const out = await adb('-s', deviceId, 'shell', ...args);
    return safeText(out);
  } catch {
    return null;
  }
}

async function adbPing(deviceId: string, target: string): Promise<{
  target: string;
  ok: boolean;
  summary?: ReturnType<typeof parsePingSummary>;
  timesMs?: number[];
  jitterMs?: number;
  error?: string;
}> {
  try {
    const out = await adb('-s', deviceId, 'shell', 'ping', '-c', '8', '-W', '2', target);
    const summary = parsePingSummary(out);
    const timesMs = parsePingTimes(out);
    const jitterMs = stdev(timesMs);
    const ok = summary.lossPct != null ? summary.lossPct <= 10 : /\b0%\s+packet\s+loss\b/i.test(out);
    return { target, ok, summary, timesMs, jitterMs };
  } catch (e: any) {
    return { target, ok: false, error: e?.message || 'ping failed' };
  }
}

async function adbFixStep(deviceId: string, label: string, cmd: string): Promise<{ label: string; ok: boolean; output?: string; error?: string }> {
  try {
    const out = await adb('-s', deviceId, 'shell', 'sh', '-c', cmd);
    const text = safeText(out);
    // Keep response small.
    const output = text.length > 4000 ? `${text.slice(0, 4000)}\n…(truncated)…` : text;
    return { label, ok: true, output };
  } catch (e: any) {
    return { label, ok: false, error: e?.message || 'command failed' };
  }
}

async function adbHttp204Probe(deviceId: string): Promise<
  | { ok: true; statusCode: number; via: 'curl' | 'wget'; url: string }
  | { ok: false; error: string }
  | { ok: false; unsupported: true }
> {
  const url = 'http://connectivitycheck.gstatic.com/generate_204';

  // curl: try to print only status code.
  const curlOut = await adbTry(deviceId, 'sh', '-c', `curl -s -o /dev/null -m 6 -w "%{http_code}" "${url}" 2>/dev/null`);
  if (curlOut != null) {
    const raw = safeText(curlOut).trim();
    const code = Number(raw);
    if (Number.isFinite(code) && code > 0) return { ok: true, statusCode: code, via: 'curl', url };
  }

  // wget (toybox/busybox variants): attempt to parse HTTP status from headers.
  const wgetOut = await adbTry(deviceId, 'sh', '-c', `wget -S -O /dev/null -T 6 "${url}" 2>&1 | head -n 5`);
  if (wgetOut != null) {
    const head = safeText(wgetOut);
    const m = head.match(/HTTP\/[0-9.]+\s+(\d{3})/i);
    const code = m ? Number(m[1]) : NaN;
    if (Number.isFinite(code) && code > 0) return { ok: true, statusCode: code, via: 'wget', url };
    return { ok: false, error: 'wget did not return a parseable HTTP status' };
  }

  return { ok: false, unsupported: true };
}

function classifyStability(args: {
  validated?: boolean;
  wifiBasics: ReturnType<typeof parseWifiBasicsFromCmdWifiStatus>;
  wifiConnected: boolean;
  pings: Array<{ target: string; ok: boolean; summary?: ReturnType<typeof parsePingSummary>; jitterMs?: number }>;
  http204?: { ok: boolean; statusCode?: number };
}): { stable: boolean; verdict: string; likelyCauses: string[] } {
  const likelyCauses: string[] = [];

  if (!args.wifiConnected) {
    return {
      stable: false,
      verdict: 'Not connected',
      likelyCauses: ['Wi‑Fi is not connected (no SSID / default route is not Wi‑Fi)'],
    };
  }

  const loss = (t: string) => args.pings.find(p => p.target === t)?.summary?.lossPct;
  const avg = (t: string) => args.pings.find(p => p.target === t)?.summary?.avgMs;

  const anyHighLoss = args.pings.some(p => (p.summary?.lossPct ?? 0) >= 20);
  const anyNoReply = args.pings.some(p => p.summary?.received === 0);
  const anyHighJitter = args.pings.some(p => (typeof p.jitterMs === 'number' ? p.jitterMs : 0) >= 30);

  const rssi = args.wifiBasics.rssiDbm;
  if (typeof rssi === 'number') {
    if (rssi <= -80) likelyCauses.push('Weak Wi‑Fi signal (low RSSI)');
    else if (rssi <= -70) likelyCauses.push('Moderate Wi‑Fi signal (may be unstable)');
  }

  if (args.validated === false) likelyCauses.push('No internet validation (captive portal or upstream outage)');
  if (args.http204 && args.http204.ok === true && typeof args.http204.statusCode === 'number' && args.http204.statusCode !== 204) {
    likelyCauses.push('HTTP captive-portal check did not return 204 (possible captive portal)');
  }
  if (anyHighLoss) likelyCauses.push('Packet loss detected (Wi‑Fi interference / poor link / router issue)');
  if (anyHighJitter) likelyCauses.push('High jitter detected (unstable latency; often interference/congestion)');
  if (anyNoReply) likelyCauses.push('No ping replies (routing/firewall issue, or no connectivity)');

  const internetLoss = loss('8.8.8.8');
  const internetAvg = avg('8.8.8.8');
  if (typeof internetAvg === 'number' && internetAvg >= 200) likelyCauses.push('High latency to internet (congestion or weak link)');
  if (typeof internetLoss === 'number' && internetLoss >= 10 && internetLoss < 20) likelyCauses.push('Some packet loss to internet (may cause unstable browsing/streaming)');

  const stable = !(
    args.validated === false ||
    anyHighLoss ||
    anyHighJitter ||
    anyNoReply ||
    (args.http204 && args.http204.ok === true && typeof args.http204.statusCode === 'number' && args.http204.statusCode !== 204)
  );
  const verdict = stable ? 'Stable' : 'Unstable';

  if (!likelyCauses.length && !stable) likelyCauses.push('Unstable connectivity detected');

  return { stable, verdict, likelyCauses };
}

export function registerWifiRoutes(app: Express) {
  app.get('/wifi/channels/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });

    const [wifiStatus, dumpWifi] = await Promise.all([
      adbTry(id, 'cmd', 'wifi', 'status'),
      adbTry(id, 'dumpsys', 'wifi'),
    ]);

    const basics = parseWifiBasicsFromCmdWifiStatus(wifiStatus || '');
    const scan = parseWifiScanResultsFromDumpsysWifi(dumpWifi || '');
    const congestion = summarizeChannelCongestion(scan);
    const best = guessBestChannels(congestion);

    const currentChannel = typeof basics.frequencyMHz === 'number' ? freqToChannel(basics.frequencyMHz) : undefined;
    const currentBand = typeof basics.frequencyMHz === 'number'
      ? is24Ghz(basics.frequencyMHz)
        ? '2.4GHz'
        : is5Ghz(basics.frequencyMHz)
          ? '5GHz'
          : 'Unknown'
      : undefined;

    return res.json({
      ok: true,
      deviceId: id,
      wifi: {
        ssid: basics.ssid,
        bssid: basics.bssid,
        rssiDbm: basics.rssiDbm,
        linkSpeedMbps: basics.linkSpeedMbps,
        frequencyMHz: basics.frequencyMHz,
        currentChannel,
        currentBand,
      },
      scan: {
        networksObserved: scan.length,
        congestion,
        suggestions: {
          best24: best.suggest24,
          best5: best.suggest5,
        },
      },
    });
  });

  app.get('/wifi/rogue-ap-check/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });

    const basics = await getWifiStatusBasics(id);
    const ssid = basics.ssid;

    const [ipRoute, neigh1, neigh2, dumpWifi] = await Promise.all([
      adbTry(id, 'ip', 'route', 'show'),
      adbTry(id, 'ip', 'neigh', 'show'),
      (async () => {
        // Small delay then re-check for MAC churn.
        await new Promise(r => setTimeout(r, 1100));
        return adbTry(id, 'ip', 'neigh', 'show');
      })(),
      adbTry(id, 'dumpsys', 'wifi'),
    ]);

    const route = parseDefaultRoute(ipRoute || '');
    const gateway = route.gateway;
    const reasons: string[] = [];

    const pickGatewayMac = (neighOut: string | null): string | undefined => {
      if (!gateway || !neighOut) return undefined;
      const m = safeText(neighOut).match(new RegExp(`\\b${gateway.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b.*?\\blladdr\\s+([0-9a-f:]{17})\\b`, 'i'));
      return m ? m[1].toLowerCase() : undefined;
    };

    const gwMac1 = pickGatewayMac(neigh1);
    const gwMac2 = pickGatewayMac(neigh2);
    if (!gateway) reasons.push('No default gateway detected (cannot assess ARP stability).');
    if (gateway && (!gwMac1 || !gwMac2)) reasons.push('Gateway MAC was not observed in neighbor table (inconclusive).');

    let suspicious = false;
    if (gwMac1 && gwMac2 && gwMac1 !== gwMac2) {
      suspicious = true;
      reasons.push('Gateway MAC address changed over time (possible ARP spoofing or network instability).');
    }

    // SSID/BSSID consistency: if multiple BSSIDs appear for current SSID, note it.
    const scan = parseWifiScanResultsFromDumpsysWifi(dumpWifi || '');
    const bssids = new Set<string>();
    const freqs: number[] = [];
    if (ssid) {
      for (const s of scan) {
        if (!s.ssid || s.ssid !== ssid) continue;
        if (s.bssid) bssids.add(s.bssid);
        if (typeof s.freqMHz === 'number') freqs.push(s.freqMHz);
      }
    }
    if (ssid && bssids.size >= 3) {
      reasons.push(`Multiple access points detected for SSID "${ssid}" (${bssids.size} BSSIDs). This is normal for mesh/enterprise Wi‑Fi, but can be suspicious if unexpected.`);
    }

    const verdict = suspicious ? 'Suspicious' : 'No strong rogue AP signal detected';
    const confidence = suspicious ? 'low' : 'low';

    return res.json({
      ok: true,
      deviceId: id,
      wifi: { ssid, bssid: basics.bssid, gateway },
      arp: { gatewayMacFirst: gwMac1, gatewayMacSecond: gwMac2 },
      verdict: { verdict, confidence },
      reasons: reasons.length ? reasons : undefined,
      note: 'This is a best-effort host-side check. It cannot prove or disprove ARP spoofing without deeper packet inspection.',
    });
  });

  app.get('/wifi/diagnose/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });

    // Primary probes
    const [cmdWifiStatus, ipRoute, connDump, dns1, dns2] = await Promise.all([
      adbTry(id, 'cmd', 'wifi', 'status'),
      adbTry(id, 'ip', 'route', 'show'),
      adbTry(id, 'dumpsys', 'connectivity'),
      adbTry(id, 'getprop', 'net.dns1'),
      adbTry(id, 'getprop', 'net.dns2'),
    ]);

    const wifiBasics = parseWifiBasicsFromCmdWifiStatus(cmdWifiStatus || '');
    const route = parseDefaultRoute(ipRoute || '');
    const validation = parseConnectivityValidation(connDump || '');

    const iface = (route.iface || '').toLowerCase();
    const looksLikeWifiIface = iface.startsWith('wlan') || iface.startsWith('wifi');
    const wifiConnected = !!(wifiBasics.ssid || (looksLikeWifiIface && route.gateway));

    // Pings: gateway (if present), then stable public IPs. Keep minimal.
    const pingTargets: string[] = [];
    if (route.gateway) pingTargets.push(route.gateway);
    pingTargets.push('1.1.1.1', '8.8.8.8');

    const pings = await Promise.all(pingTargets.map(t => adbPing(id, t)));

    // DNS check: hostname ping (uses DNS). Optional.
    const dnsPing = await adbPing(id, 'dns.google');

    // Captive portal / internet probe (best-effort).
    const http204 = await adbHttp204Probe(id);

    const stability = classifyStability({
      validated: validation.validated,
      wifiBasics,
      wifiConnected,
      pings: [...pings, dnsPing].map(p => ({ target: p.target, ok: p.ok, summary: p.summary, jitterMs: p.jitterMs })),
      http204: http204.ok ? { ok: true, statusCode: http204.statusCode } : { ok: false },
    });

    const suggestions: string[] = [];
    if (!wifiConnected) {
      suggestions.push('Connect to a Wi‑Fi network (ensure Wi‑Fi is ON), then retry.');
    }
    if (validation.validated === false) {
      suggestions.push('If you are on a public Wi‑Fi, open the sign‑in/captive portal page, then retry.');
    }
    if (http204.ok === true && http204.statusCode !== 204) {
      suggestions.push('Captive portal is likely. Open Wi‑Fi sign-in page, then retry.');
    }
    if (typeof wifiBasics.rssiDbm === 'number' && wifiBasics.rssiDbm <= -75) {
      suggestions.push('Move closer to the router or switch to 5GHz/6GHz if available.');
    }
    if (!stability.stable && wifiConnected) {
      suggestions.push('Try toggling Wi‑Fi OFF/ON (Fix action).');
      suggestions.push('Restart router/modem if multiple devices are affected.');
    }

    return res.json({
      ok: true,
      deviceId: id,
      wifi: {
        ...wifiBasics,
        gateway: route.gateway,
        iface: route.iface,
        dns: [dns1, dns2].map(s => safeText(s).trim()).filter(Boolean),
      },
      connectivity: {
        validated: validation.validated,
        captivePortalHint: validation.captivePortalHint,
        notes: validation.notes,
      },
      ping: {
        tests: [...pings, dnsPing].map(p => ({
          target: p.target,
          ok: p.ok,
          ...p.summary,
          jitterMs: p.jitterMs,
          error: p.error,
        })),
      },
      http204: http204.ok
        ? http204
        : ('unsupported' in http204 && http204.unsupported)
          ? { ok: false, unsupported: true }
          : { ok: false, error: (http204 as any).error || 'HTTP probe failed' },
      stability: {
        stable: stability.stable,
        verdict: stability.verdict,
        likelyCauses: stability.likelyCauses,
      },
      suggestions: suggestions.length ? suggestions : undefined,
    });
  });

  app.post('/wifi/fix/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    const action = safeText((req.body as any)?.action || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action' });

    if (
      action !== 'wifi_toggle' &&
      action !== 'dhcp_renew' &&
      action !== 'open_captive_portal' &&
      action !== 'forget_current' &&
      action !== 'prefer_band'
    ) {
      return res.status(400).json({ ok: false, error: 'Unsupported action' });
    }

    try {
      // Best-effort only (non-root). Many Android builds do not expose a direct "dhcp renew".
      // The most reliable workaround is to force reassociation + DHCP by bouncing Wi‑Fi.
      const steps: Array<{ label: string; ok: boolean; output?: string; error?: string }> = [];

      // Collect iface/gateway so we can provide context.
      const ipRoute = await adbTry(id, 'ip', 'route', 'show');
      const route = parseDefaultRoute(ipRoute || '');
      const iface = route.iface;

      if (action === 'open_captive_portal') {
        steps.push(await adbFixStep(id, 'Open captive portal login', 'am start -a android.intent.action.VIEW -d "http://connectivitycheck.gstatic.com/generate_204" 2>/dev/null || true'));
        return res.json({ ok: true, action, deviceId: id, steps });
      }

      if (action === 'forget_current') {
        const basics = await getWifiStatusBasics(id);
        const ssid = basics.ssid;
        if (!ssid) {
          return res.status(400).json({ ok: false, error: 'Wi‑Fi SSID is unknown. Connect to Wi‑Fi first, then retry.' });
        }

        const configured = await listConfiguredWifiNetworks(id);
        const match = configured.find(n => n.ssid === ssid);
        if (!match) {
          return res.status(400).json({ ok: false, error: `Network \"${ssid}\" not found in configured networks. You may need to forget it manually in Settings.` });
        }

        steps.push(await adbFixStep(id, `Forget network: ${ssid}`, `cmd wifi forget-network ${match.networkId} 2>/dev/null || cmd wifi forget ${match.networkId} 2>/dev/null || true`));
        steps.push({
          label: 'Note',
          ok: true,
          output: 'Network was forgotten. Reconnect on the phone (enter password if required), then re-run Wi‑Fi stability.',
        });
        return res.json({ ok: true, action, deviceId: id, ssid, steps });
      }

      if (action === 'prefer_band') {
        const band = safeText((req.body as any)?.band || '').trim();
        if (band !== '2.4' && band !== '5') {
          return res.status(400).json({ ok: false, error: 'Missing or invalid band. Use band=2.4 or band=5' });
        }

        const basics = await getWifiStatusBasics(id);
        const ssid = basics.ssid;
        if (!ssid) {
          return res.status(400).json({ ok: false, error: 'Wi‑Fi SSID is unknown. Connect to Wi‑Fi first, then retry.' });
        }

        const configured = await listConfiguredWifiNetworks(id);
        const match = configured.find(n => n.ssid === ssid);
        if (!match) {
          return res.status(400).json({ ok: false, error: `Network \"${ssid}\" not found in configured networks.` });
        }

        const dumpWifi = await adbTry(id, 'dumpsys', 'wifi');
        const scan = parseWifiScanResultsFromDumpsysWifi(dumpWifi || '');
        const candidates = scan.filter(s => s.ssid === ssid && s.bssid && typeof s.freqMHz === 'number');

        const pick = candidates
          .filter(c => (band === '2.4' ? is24Ghz(c.freqMHz!) : is5Ghz(c.freqMHz!)))
          .sort((a, b) => (b.rssiDbm ?? -999) - (a.rssiDbm ?? -999))[0];

        if (!pick || !pick.bssid) {
          return res.status(400).json({ ok: false, error: `No ${band}GHz access point was found for SSID \"${ssid}\" in scan results.` });
        }

        // Best-effort: some Android versions support specifying BSSID.
        steps.push(await adbFixStep(id, `Connect to preferred ${band}GHz BSSID`, `cmd wifi connect-network ${match.networkId} ${pick.bssid} 2>/dev/null || cmd wifi connect-network ${match.networkId} 2>/dev/null || true`));
        steps.push(await adbFixStep(id, 'Reconnect (post)', 'cmd wifi reconnect 2>/dev/null || true'));
        steps.push({ label: 'Note', ok: true, output: 'Band preference is best-effort. If it does not switch bands, try moving closer to the router or disabling the other band on the router temporarily.' });
        return res.json({ ok: true, action, deviceId: id, ssid, preferredBand: band, bssid: pick.bssid, freqMHz: pick.freqMHz, steps });
      }

      if (action === 'dhcp_renew') {
        // 1) Ask Wi‑Fi service to reconnect if supported.
        steps.push(await adbFixStep(id, 'cmd wifi reconnect (pre)', 'cmd wifi reconnect 2>/dev/null || true'));

        // 2) Bounce Wi‑Fi (forces DHCP renew and re-association in most cases).
        steps.push(await adbFixStep(id, 'Wi‑Fi OFF', 'svc wifi disable'));
        await new Promise(r => setTimeout(r, 1200));
        steps.push(await adbFixStep(id, 'Wi‑Fi ON', 'svc wifi enable'));
        await new Promise(r => setTimeout(r, 2200));

        // 3) Reconnect again for good measure.
        steps.push(await adbFixStep(id, 'cmd wifi reconnect (post)', 'cmd wifi reconnect 2>/dev/null || true'));

        // 4) Dump interface address/route info if available.
        if (iface) {
          steps.push(await adbFixStep(id, `ip addr show ${iface}`, `ip addr show dev ${iface} 2>/dev/null || true`));
        }
        steps.push(await adbFixStep(id, 'ip route show', 'ip route show 2>/dev/null || true'));
      } else {
        // Back-compat: simple toggle.
        steps.push(await adbFixStep(id, 'Wi‑Fi OFF', 'svc wifi disable'));
        await new Promise(r => setTimeout(r, 1200));
        steps.push(await adbFixStep(id, 'Wi‑Fi ON', 'svc wifi enable'));
        await new Promise(r => setTimeout(r, 2000));
      }

      return res.json({ ok: true, action, deviceId: id, route: { gateway: route.gateway, iface: route.iface }, steps });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'Fix failed' });
    }
  });
}
