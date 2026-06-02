export function safeDeviceKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function isSafeLocalFilename(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.length > 128) return false;

  // Block path traversal and separators for both Windows and POSIX.
  if (trimmed.includes('..')) return false;
  if (trimmed.includes('/') || trimmed.includes('\\')) return false;

  // Conservative allow-list.
  return /^[a-zA-Z0-9_.-]+$/.test(trimmed);
}

export function parseGetpropOutput(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return out;

  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;

    // Standard Android `getprop` format: [key]: [value]
    const bracket = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]$/);
    if (bracket) {
      const k = bracket[1].trim();
      const v = bracket[2].trim();
      if (k) out[k] = v;
      continue;
    }

    // Some environments/tools emit key=value
    const eq = line.match(/^([a-zA-Z0-9._-]+)=(.*)$/);
    if (eq) {
      const k = eq[1].trim();
      const v = (eq[2] ?? '').trim();
      if (k) out[k] = v;
      continue;
    }
  }

  return out;
}
