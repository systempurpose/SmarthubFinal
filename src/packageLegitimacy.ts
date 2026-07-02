import { isLikelyLegitPackageIdentity } from './heuristics';

export type PackageLegitimacyVerdict = 'trusted' | 'uncertain' | 'suspicious';

export interface PackageLegitimacyEvidence {
  query: string;
  title: string;
  url: string;
  snippet: string;
}

export interface PackageLegitimacyResult {
  packageName: string;
  installer: string | null;
  verdict: PackageLegitimacyVerdict;
  confidence: number;
  reason: string;
  evidence: PackageLegitimacyEvidence[];
  queries: string[];
  mode: 'trusted-identity' | 'local-web-evidence' | 'offline-fallback';
}

const cache = new Map<string, Promise<PackageLegitimacyResult>>();

function normalizePackageName(value: string): string {
  return String(value || '').trim();
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function pushEvidence(items: PackageLegitimacyEvidence[], seen: Set<string>, item: PackageLegitimacyEvidence): void {
  const url = normalizeText(item.url);
  const title = normalizeText(item.title);
  const snippet = normalizeText(item.snippet);
  if (!url && !title && !snippet) return;
  const key = `${url}::${title}::${snippet}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ query: item.query, title, url, snippet });
}

function buildQueries(pkg: string, installer: string | null): string[] {
  const queries = [
    `${pkg} Google Play`,
    `${pkg} official app`,
    `${pkg} developer`,
  ];

  if (installer) {
    queries.unshift(`${pkg} ${installer}`);
  }

  return queries;
}

async function fetchDuckDuckGoEvidence(query: string, timeoutMs: number): Promise<PackageLegitimacyEvidence[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1200, Math.min(3500, timeoutMs)));

  try {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`DuckDuckGo search error (${resp.status})`);
    }

    const payload = await resp.json();
    const out: PackageLegitimacyEvidence[] = [];
    const seen = new Set<string>();

    pushEvidence(out, seen, {
      query,
      title: normalizeText(payload?.Heading) || query,
      url: normalizeText(payload?.AbstractURL),
      snippet: normalizeText(payload?.AbstractText),
    });

    if (Array.isArray(payload?.Results)) {
      for (const row of payload.Results) {
        if (!row || typeof row !== 'object') continue;
        pushEvidence(out, seen, {
          query,
          title: normalizeText((row as any).Text) || query,
          url: normalizeText((row as any).FirstURL),
          snippet: normalizeText((row as any).Text),
        });
      }
    }

    if (Array.isArray(payload?.RelatedTopics)) {
      for (const topic of payload.RelatedTopics) {
        if (!topic || typeof topic !== 'object') continue;
        if (out.length >= 8) break;
        const title = normalizeText((topic as any).Text) || query;
        const url = normalizeText((topic as any).FirstURL);
        pushEvidence(out, seen, {
          query,
          title,
          url,
          snippet: title,
        });
      }
    }

    return out.slice(0, 8);
  } finally {
    clearTimeout(timer);
  }
}

function scoreEvidence(pkg: string, evidence: PackageLegitimacyEvidence[]): { verdict: PackageLegitimacyVerdict; confidence: number; reason: string } {
  const lowerPkg = pkg.toLowerCase();
  let trustedScore = 0;
  let suspiciousScore = 0;
  const reasons: string[] = [];

  for (const item of evidence) {
    const blob = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
    if (!blob) continue;

    if (blob.includes('play.google.com') && blob.includes(lowerPkg)) {
      trustedScore += 50;
      reasons.push('Google Play result found');
    }
    if (blob.includes('official') || blob.includes('developer') || blob.includes('support')) {
      trustedScore += 10;
    }
    if (blob.includes('github.com') || blob.includes('f-droid.org')) {
      trustedScore += 10;
    }
    if (/\b(malware|trojan|spyware|adware|virus|fake app|crack|mod apk|unofficial clone|keygen)\b/i.test(blob)) {
      suspiciousScore += 25;
      reasons.push('Search evidence included malware-related terms');
    }
    if (/\b(apk download|apkpure|mod apk|hack|cracked)\b/i.test(blob)) {
      suspiciousScore += 10;
    }
  }

  if (trustedScore >= 50 && suspiciousScore <= 10) {
    return {
      verdict: 'trusted',
      confidence: Math.min(100, trustedScore),
      reason: reasons[0] || 'Search evidence points to an official or trusted source.',
    };
  }

  if (suspiciousScore >= 25 && trustedScore < 20) {
    return {
      verdict: 'suspicious',
      confidence: Math.min(100, suspiciousScore),
      reason: reasons[0] || 'Search evidence did not support a trusted identity.',
    };
  }

  return {
    verdict: 'uncertain',
    confidence: Math.max(trustedScore, suspiciousScore),
    reason: reasons[0] || 'Could not confirm a trusted package identity from search evidence.',
  };
}

export async function assessPackageLegitimacy(
  packageName: string,
  installer: string | null = null,
  timeoutMs = 6000,
): Promise<PackageLegitimacyResult> {
  const pkg = normalizePackageName(packageName);
  const key = `${pkg}::${installer || ''}`;

  const existing = cache.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<PackageLegitimacyResult> => {
    if (!pkg) {
      return {
        packageName: pkg,
        installer,
        verdict: 'uncertain',
        confidence: 0,
        reason: 'Missing package name.',
        evidence: [],
        queries: [],
        mode: 'offline-fallback',
      };
    }

    if (isLikelyLegitPackageIdentity(pkg, installer)) {
      return {
        packageName: pkg,
        installer,
        verdict: 'trusted',
        confidence: 100,
        reason: 'Trusted package prefix, trusted exact package, or legitimate installer matched.',
        evidence: [],
        queries: [],
        mode: 'trusted-identity',
      };
    }

    const queries = buildQueries(pkg, installer);
    try {
      const settled = await Promise.all(
        queries.map(async (query) => {
          try {
            return await fetchDuckDuckGoEvidence(query, timeoutMs);
          } catch {
            return [] as PackageLegitimacyEvidence[];
          }
        }),
      );

      const evidence: PackageLegitimacyEvidence[] = [];
      const seen = new Set<string>();
      for (const list of settled) {
        for (const item of list) {
          pushEvidence(evidence, seen, item);
        }
      }

      const scored = scoreEvidence(pkg, evidence);
      return {
        packageName: pkg,
        installer,
        verdict: scored.verdict,
        confidence: scored.confidence,
        reason: scored.reason,
        evidence,
        queries,
        mode: 'local-web-evidence',
      };
    } catch {
      return {
        packageName: pkg,
        installer,
        verdict: 'uncertain',
        confidence: 0,
        reason: 'Web evidence lookup failed or timed out.',
        evidence: [],
        queries,
        mode: 'offline-fallback',
      };
    }
  })();

  cache.set(key, promise);
  return await promise;
}
