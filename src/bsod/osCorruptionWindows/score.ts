import type { BsodOsCorruptionWindowsUsbReport, OsCorruptionSignal } from './types';

export function scoreOsCorruptionSignals(signals: OsCorruptionSignal[]): { score0to100: number; confidence: 'low' | 'medium' | 'high' } {
  const score0to100 = Math.max(0, Math.min(100, Math.round(signals.reduce((sum, s) => sum + (typeof s.points === 'number' ? s.points : 0), 0))));

  const confidence: 'low' | 'medium' | 'high' =
    score0to100 >= 60
      ? 'high'
      : score0to100 >= 40
        ? 'medium'
        : 'low';

  return { score0to100, confidence };
}

export function summarizeReport(r: BsodOsCorruptionWindowsUsbReport): string {
  if (r.skipped) return r.summary || 'Skipped OS corruption checks.';
  if (!r.ok) return r.error || 'OS corruption checks failed.';

  const score = typeof r.score0to100 === 'number' ? r.score0to100 : 0;
  if (score >= 60) return `High confidence OS corruption / crash evidence (score=${score}).`;
  if (score >= 40) return `Likely OS instability (software issue likely) (score=${score}).`;
  return `No strong signs of OS corruption (score=${score}).`;
}
