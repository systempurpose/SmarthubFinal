/*
  Generate a dedicated Gane-Sarson DFD Level 1 PDF for SmartHub Diagnostics.
  Output: pdf/diagrams/dfd-level1-gane-sarson.pdf

  No external dependencies are required.
*/

const fs = require('node:fs');
const path = require('node:path');

function pdfEscapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function fmt(n) {
  return Number(n).toFixed(2).replace(/\.00$/, '');
}

function contentStream(ops) {
  return ops.join('\n') + '\n';
}

function drawRect(x, y, w, h) {
  return [`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`, 'S'];
}

function drawLine(x1, y1, x2, y2) {
  return [`${fmt(x1)} ${fmt(y1)} m`, `${fmt(x2)} ${fmt(y2)} l`, 'S'];
}

function drawArrow(x1, y1, x2, y2) {
  const ops = [];
  ops.push(...drawLine(x1, y1, x2, y2));

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const head = 9;
  const hx = x2 - ux * head;
  const hy = y2 - uy * head;
  const px = -uy;
  const py = ux;

  ops.push(...drawLine(x2, y2, hx + px * 3.5, hy + py * 3.5));
  ops.push(...drawLine(x2, y2, hx - px * 3.5, hy - py * 3.5));
  return ops;
}

function drawText(x, y, text, size = 10) {
  const t = pdfEscapeText(text);
  return [
    'BT',
    `/F1 ${fmt(size)} Tf`,
    `${fmt(x)} ${fmt(y)} Td`,
    `(${t}) Tj`,
    'ET',
  ];
}

function wrapText(text, maxChars) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!w) continue;
    if (!line) {
      line = w;
      continue;
    }
    if ((line.length + 1 + w.length) <= maxChars) {
      line += ` ${w}`;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawParagraph(x, yTop, text, { size = 9, leading = 11, maxChars = 80 } = {}) {
  const ops = [];
  const lines = Array.isArray(text) ? text : wrapText(text, maxChars);
  let y = yTop;
  for (const ln of lines) {
    ops.push(...drawText(x, y, ln, size));
    y -= leading;
  }
  return ops;
}

function drawCenteredText(rect, text, y, size = 10) {
  const safe = String(text || '');
  // Approximate width for Helvetica; enough for visual centering in this simple generator.
  const approxWidth = safe.length * size * 0.28;
  const x = rect.x + (rect.w / 2) - (approxWidth / 2);
  return drawText(x, y, safe, size);
}

function drawExternalEntity(rect, label) {
  const ops = [];
  ops.push(...drawRect(rect.x, rect.y, rect.w, rect.h));
  const lines = wrapText(label, 20);
  const startY = rect.y + rect.h - 20;
  for (let i = 0; i < lines.length; i++) {
    ops.push(...drawCenteredText(rect, lines[i], startY - (i * 12), 10));
  }
  return ops;
}

function drawDataStore(rect, label) {
  const ops = [];
  ops.push(...drawRect(rect.x, rect.y, rect.w, rect.h));
  // Gane-Sarson style visual cue for datastore: inner vertical line near left edge.
  ops.push(...drawLine(rect.x + 10, rect.y, rect.x + 10, rect.y + rect.h));
  const lines = wrapText(label, 18);
  const startY = rect.y + rect.h - 16;
  for (let i = 0; i < lines.length; i++) {
    ops.push(...drawText(rect.x + 16, startY - (i * 11), lines[i], 8.8));
  }
  return ops;
}

function drawGaneSarsonProcess(rect, processNo, titleLines) {
  const ops = [];
  const headerH = 18;

  ops.push(...drawRect(rect.x, rect.y, rect.w, rect.h));
  ops.push(...drawLine(rect.x, rect.y + rect.h - headerH, rect.x + rect.w, rect.y + rect.h - headerH));

  // Process number in the header strip.
  ops.push(...drawText(rect.x + 8, rect.y + rect.h - 13, processNo, 9.5));

  const lines = Array.isArray(titleLines) ? titleLines : [String(titleLines || '')];
  let y = rect.y + rect.h - headerH - 18;
  for (const ln of lines) {
    ops.push(...drawCenteredText(rect, ln, y, 9.5));
    y -= 12;
  }

  return ops;
}

function drawArrowWithLabel(x1, y1, x2, y2, label, { dx = 0, dy = 0, size = 8.5 } = {}) {
  const ops = [];
  ops.push(...drawArrow(x1, y1, x2, y2));
  if (label) {
    const mx = (x1 + x2) / 2 + dx;
    const my = (y1 + y2) / 2 + dy;
    ops.push(...drawText(mx, my, String(label), size));
  }
  return ops;
}

function setLineWidth(w) {
  return [`${fmt(w)} w`];
}

function setStrokeGray(g) {
  return [`${fmt(g)} G`];
}

function buildPdf({ pages, title }) {
  const objects = [];
  const addObj = (str) => {
    objects.push(str);
    return objects.length;
  };

  const fontObjId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageObjIds = [];

  for (const p of pages) {
    const stream = contentStream(p.contentOps);
    const contentId = addObj(
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`
    );

    const pageId = addObj(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${fmt(p.width)} ${fmt(p.height)}] ` +
      `/Resources << /Font << /F1 ${fontObjId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );

    pageObjIds.push(pageId);
  }

  const pagesObjId = addObj(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`
  );

  for (const pageId of pageObjIds) {
    const idx = pageId - 1;
    objects[idx] = objects[idx].replace('/Parent 0 0 R', `/Parent ${pagesObjId} 0 R`);
  }

  const catalogObjId = addObj(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);
  const infoObjId = addObj(`<< /Title (${pdfEscapeText(title || 'SmartHub DFD Level 1')}) >>`);

  let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  const offsets = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i++) {
    const off = String(offsets[i]).padStart(10, '0');
    pdf += `${off} 00000 n \n`;
  }

  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R /Info ${infoObjId} 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  return pdf;
}

function pageSmartHubDfdLevel1GaneSarson() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(30, 568, 'SmartHub Diagnostics - DFD Level 1 (Gane-Sarson)', 14));
  ops.push(...drawText(30, 552, 'Decomposition of Process 0: SmartHub Diagnostic App', 10));

  const tech = { x: 28, y: 256, w: 150, h: 78 };

  const p1 = { x: 220, y: 440, w: 220, h: 85 };
  const p2 = { x: 220, y: 320, w: 220, h: 85 };
  const p3 = { x: 220, y: 200, w: 220, h: 85 };
  const p4 = { x: 500, y: 320, w: 220, h: 85 };
  const p5 = { x: 500, y: 200, w: 220, h: 85 };

  const d1 = { x: 708, y: 470, w: 120, h: 38 };
  const d2 = { x: 708, y: 380, w: 120, h: 38 };
  const d3 = { x: 708, y: 290, w: 120, h: 38 };
  const d4 = { x: 708, y: 200, w: 120, h: 38 };

  ops.push(...drawExternalEntity(tech, 'Technician'));

  ops.push(...drawGaneSarsonProcess(p1, '1.0', ['Login and', 'Session Start']));
  ops.push(...drawGaneSarsonProcess(p2, '2.0', ['Choose Method and', 'Check Connection']));
  ops.push(...drawGaneSarsonProcess(p3, '3.0', ['Run Device', 'Diagnostics']));
  ops.push(...drawGaneSarsonProcess(p4, '4.0', ['Generate AI', 'Conclusion']));
  ops.push(...drawGaneSarsonProcess(p5, '5.0', ['Save and Present', 'Final Result']));

  ops.push(...drawDataStore(d1, 'D1 Technician Account DB'));
  ops.push(...drawDataStore(d2, 'D2 Diagnostic History DB'));
  ops.push(...drawDataStore(d3, 'D3 Offline AI Memory'));
  ops.push(...drawDataStore(d4, 'D4 Evidence Files'));

  // External entity <-> core decomposition
  ops.push(...drawArrowWithLabel(tech.x + tech.w, tech.y + 62, p1.x, p1.y + 62, 'start app + login credentials', { dx: -8, dy: 10 }));
  ops.push(...drawArrowWithLabel(p1.x, p1.y + 52, tech.x + tech.w, tech.y + 46, 'login status / profile loaded', { dx: -12, dy: -10 }));

  ops.push(...drawArrowWithLabel(tech.x + tech.w, tech.y + 26, p2.x, p2.y + 44, 'choose method + phone availability', { dx: -14, dy: 9 }));

  // Process to process decomposition flow
  ops.push(...drawArrowWithLabel(p1.x + (p1.w / 2), p1.y, p2.x + (p2.w / 2), p2.y + p2.h, 'validated session', { dx: 6, dy: 8 }));
  ops.push(...drawArrowWithLabel(p2.x + (p2.w / 2), p2.y, p3.x + (p3.w / 2), p3.y + p3.h, 'connection context', { dx: 6, dy: 8 }));
  ops.push(...drawArrowWithLabel(p3.x + p3.w, p3.y + 46, p4.x, p4.y + 46, 'diagnostic features', { dx: 0, dy: 8 }));
  ops.push(...drawArrowWithLabel(p4.x + (p4.w / 2), p4.y, p5.x + (p5.w / 2), p5.y + p5.h, 'AI conclusion + actions', { dx: 8, dy: 8 }));

  // Final outputs to technician (balanced with level 0 outputs)
  ops.push(...drawArrowWithLabel(p5.x, p5.y + 34, tech.x + tech.w, tech.y + 10, 'diagnostic result + AI conclusion', { dx: -34, dy: -8 }));
  ops.push(...drawArrowWithLabel(tech.x + tech.w, tech.y + 8, p5.x, p5.y + 16, 'repair outcome confirmation', { dx: -35, dy: -8 }));

  // Process <-> datastore flows
  ops.push(...drawArrowWithLabel(p1.x + p1.w, p1.y + 63, d1.x, d1.y + 24, 'account verification request', { dx: 0, dy: 8, size: 8 }));
  ops.push(...drawArrowWithLabel(d1.x, d1.y + 16, p1.x + p1.w, p1.y + 42, 'user profile record', { dx: -10, dy: -10, size: 8 }));

  ops.push(...drawArrowWithLabel(p5.x + p5.w, p5.y + 66, d2.x, d2.y + 22, 'save run summary', { dx: 0, dy: 8, size: 8 }));
  ops.push(...drawArrowWithLabel(d2.x, d2.y + 12, p5.x + p5.w, p5.y + 48, 'past history for reference', { dx: -12, dy: -10, size: 8 }));

  ops.push(...drawArrowWithLabel(p4.x + p4.w, p4.y + 54, d3.x, d3.y + 20, 'remember new case', { dx: 0, dy: 8, size: 8 }));
  ops.push(...drawArrowWithLabel(d3.x, d3.y + 12, p4.x + p4.w, p4.y + 36, 'similar cases + calibration', { dx: -12, dy: -10, size: 8 }));

  ops.push(...drawArrowWithLabel(p3.x + p3.w, p3.y + 24, d4.x, d4.y + 22, 'write logs/screenshots', { dx: 0, dy: 8, size: 8 }));
  ops.push(...drawArrowWithLabel(d4.x, d4.y + 12, p3.x + p3.w, p3.y + 10, 'read previous evidence', { dx: -12, dy: -10, size: 8 }));

  // Notes box
  const note = { x: 24, y: 18, w: 804, h: 112 };
  ops.push(...drawRect(note.x, note.y, note.w, note.h));
  ops.push(...drawText(note.x + 10, note.y + note.h - 18, 'Level 1 interpretation (Gane-Sarson)', 10));
  ops.push(...drawParagraph(note.x + 10, note.y + note.h - 34, [
    'This Level 1 diagram decomposes Process 0 (SmartHub Diagnostic App) into five major internal processes.',
    'External interaction remains centered on Technician input/output, while internal stores keep accounts, history, AI memory, and evidence files.',
    'Main user-visible outputs remain: Diagnostic Result and AI Conclusion.',
  ], { size: 8.7, leading: 11, maxChars: 140 }));

  return { width: W, height: H, contentOps: ops };
}

function main() {
  const outDir = path.resolve(__dirname, '..', 'pdf', 'diagrams');
  fs.mkdirSync(outDir, { recursive: true });

  const pdf = buildPdf({
    pages: [pageSmartHubDfdLevel1GaneSarson()],
    title: 'SmartHub DFD Level 1 - Gane-Sarson',
  });

  const outPath = path.join(outDir, 'dfd-level1-gane-sarson.pdf');
  fs.writeFileSync(outPath, pdf);

  // eslint-disable-next-line no-console
  console.log('Generated:', outPath);
}

main();
