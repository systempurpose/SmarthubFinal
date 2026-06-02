import fs from 'node:fs/promises';
import { dataRoot, historyPath } from './serverConfig';
import type { HistoryMap } from './types';

export async function loadHistoryFromDisk(): Promise<HistoryMap> {
  try {
    const raw = await fs.readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as HistoryMap;
  } catch {
    // ignore missing/invalid file
  }
  return {};
}

export async function saveHistoryToDisk(map: HistoryMap): Promise<void> {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(historyPath, JSON.stringify(map, null, 2), 'utf8');
}
