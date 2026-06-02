export type TransportDeviceLike = {
  name?: string;
  instanceId?: string;
  vid?: string;
  pid?: string;
  status?: string;
};

export type TransportProfileMode = 'low-level' | 'bootloader' | 'normal' | 'unknown';

export type TransportProfileSummary = {
  key: string;
  label: string;
  vendor: string;
  mode: TransportProfileMode;
  confidence: 'low' | 'medium' | 'high';
  score: number;
  hasBadStatus: boolean;
  reasons: string[];
};

type TransportProfileRule = {
  key: string;
  label: string;
  vendor: string;
  mode: TransportProfileMode;
  confidence: 'low' | 'medium' | 'high';
  vid?: string[];
  pid?: string[];
  text: RegExp[];
  requireTextHit?: boolean;
};

const TRANSPORT_PROFILE_RULES: TransportProfileRule[] = [
  {
    key: 'qcom-edl',
    label: 'Qualcomm EDL / 9008',
    vendor: 'Qualcomm',
    mode: 'low-level',
    confidence: 'high',
    vid: ['05C6'],
    pid: ['9008'],
    text: [/qdloader/i, /qhusb/i, /\bedl\b/i, /\b9008\b/i, /qualcomm/i],
  },
  {
    key: 'mtk-preloader',
    label: 'MediaTek Preloader / BROM',
    vendor: 'MediaTek',
    mode: 'low-level',
    confidence: 'high',
    vid: ['0E8D'],
    text: [/preloader/i, /\bbrom\b/i, /\bvcom\b/i, /mediatek/i, /\bmtk\b/i],
  },
  {
    key: 'android-adb',
    label: 'Android ADB Interface',
    vendor: 'Android',
    mode: 'normal',
    confidence: 'medium',
    text: [/\badb\b/i, /android/i],
  },
  {
    key: 'samsung-download',
    label: 'Samsung Download Mode',
    vendor: 'Samsung',
    mode: 'low-level',
    confidence: 'medium',
    vid: ['04E8'],
    // IMPORTANT: Samsung VID (04E8) alone is NOT enough to infer Download/Odin.
    // Many normal Android devices (including ADB interfaces) use Samsung VID.
    requireTextHit: true,
    text: [/download/i, /odin/i, /loke/i],
  },
  {
    key: 'apple-dfu',
    label: 'Apple DFU / Recovery',
    vendor: 'Apple',
    mode: 'low-level',
    confidence: 'high',
    vid: ['05AC'],
    text: [/\bdfu\b/i, /recovery/i, /iboot/i, /apple/i],
  },
  {
    key: 'android-fastboot',
    label: 'Android Fastboot / Bootloader',
    vendor: 'Android',
    mode: 'bootloader',
    confidence: 'medium',
    text: [/fastboot/i, /bootloader/i],
  },
  {
    key: 'android-mtp',
    label: 'Android MTP / Portable Mode',
    vendor: 'Android',
    mode: 'normal',
    confidence: 'medium',
    text: [/\bmtp\b/i, /portable/i, /android/i, /\bphone\b/i],
  },
];

export function summarizeTransportProfile(devices: TransportDeviceLike[]): TransportProfileSummary {
  const list = Array.isArray(devices) ? devices.filter(Boolean) : [];
  const text = list
    .map(d => `${d?.name || ''} ${d?.instanceId || ''} ${d?.vid || ''}:${d?.pid || ''}`)
    .join(' ')
    .trim();
  const upperText = text.toUpperCase();
  const vids = new Set(list.map(d => String(d?.vid || '').trim().toUpperCase()).filter(Boolean));
  const pids = new Set(list.map(d => String(d?.pid || '').trim().toUpperCase()).filter(Boolean));
  const hasBadStatus = list.some(d => String(d?.status || '').trim().toLowerCase() && String(d?.status || '').trim().toLowerCase() !== 'ok');

  let bestRule: TransportProfileRule | null = null;
  let bestScore = 0;
  let bestReasons: string[] = [];

  for (const rule of TRANSPORT_PROFILE_RULES) {
    let score = 0;
    const reasons: string[] = [];

    if (Array.isArray(rule.vid)) {
      const hit = rule.vid.filter(v => vids.has(v.toUpperCase()));
      if (hit.length) {
        score += 3;
        reasons.push(`VID match: ${hit.join(', ')}`);
      }
    }

    if (Array.isArray(rule.pid)) {
      const hit = rule.pid.filter(p => pids.has(p.toUpperCase()));
      if (hit.length) {
        score += 3;
        reasons.push(`PID match: ${hit.join(', ')}`);
      }
    }

    const textHits = rule.text.filter(re => re.test(text));
    if (textHits.length) {
      score += textHits.length;
      reasons.push(`${textHits.length} transport-name match${textHits.length > 1 ? 'es' : ''}`);
    }

    if (rule.requireTextHit && textHits.length === 0) {
      // For some vendors (notably Samsung), VID-only matches are too ambiguous.
      // Require at least one strong textual signature (e.g. "download", "odin").
      score = 0;
      reasons.length = 0;
    }

    if (score > bestScore) {
      bestRule = rule;
      bestScore = score;
      bestReasons = reasons;
    }
  }

  if (bestRule && bestScore > 0) {
    return {
      key: bestRule.key,
      label: bestRule.label,
      vendor: bestRule.vendor,
      mode: bestRule.mode,
      confidence: bestRule.confidence,
      score: bestScore,
      hasBadStatus,
      reasons: bestReasons,
    };
  }

  if (/UNKNOWN USB DEVICE|DEVICE DESCRIPTOR REQUEST FAILED|CM_PROB|PROBLEM/i.test(upperText)) {
    return {
      key: 'generic-usb-failure',
      label: 'Generic USB transport failure',
      vendor: 'Unknown',
      mode: 'unknown',
      confidence: 'medium',
      score: 1,
      hasBadStatus: true,
      reasons: ['Transport text suggests generic USB enumeration failure'],
    };
  }

  return {
    key: 'generic-transport',
    label: 'Generic USB transport device',
    vendor: 'Unknown',
    mode: 'unknown',
    confidence: list.length > 0 ? 'low' : 'low',
    score: list.length > 0 ? 1 : 0,
    hasBadStatus,
    reasons: list.length > 0 ? ['USB transport device is present but does not match a stronger vendor profile yet'] : [],
  };
}