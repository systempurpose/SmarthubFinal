/*
  Generates simple PDF diagram drawings (no external deps).
  Output folder: pdf/diagrams/

  This intentionally draws simplified boxes/arrows/text suitable for exporting
  to a documentation PDF. It reflects the current SmartHub storage:
  - SQLite for offline AI memory (cases, adb_cases)
  - JSON files for history/config
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
  // PDF likes short decimals
  return Number(n).toFixed(2).replace(/\.00$/, '');
}

function contentStream(ops) {
  return ops.join('\n') + '\n';
}

function drawRect(x, y, w, h, stroke = true, fill = false) {
  const op = `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`;
  if (stroke && fill) return [op, 'B'];
  if (fill) return [op, 'f'];
  if (stroke) return [op, 'S'];
  return [op];
}

function drawDataStoreShape(rect) {
  // Simple DFD datastore symbol: a box with an extra parallel vertical line.
  const ops = [];
  ops.push(...drawRect(rect.x, rect.y, rect.w, rect.h));
  ops.push(...drawLine(rect.x + 12, rect.y, rect.x + 12, rect.y + rect.h));
  return ops;
}

function drawLine(x1, y1, x2, y2) {
  return [`${fmt(x1)} ${fmt(y1)} m`, `${fmt(x2)} ${fmt(y2)} l`, 'S'];
}

function drawCircle(cx, cy, r) {
  // Approximate circle with 4 cubic Beziers.
  // kappa = 4/3 * tan(pi/8)
  const k = 0.5522847498307936;
  const ox = r * k;
  const oy = r * k;
  const ops = [];
  ops.push(`${fmt(cx + r)} ${fmt(cy)} m`);
  ops.push(
    `${fmt(cx + r)} ${fmt(cy + oy)} ${fmt(cx + ox)} ${fmt(cy + r)} ${fmt(cx)} ${fmt(cy + r)} c`
  );
  ops.push(
    `${fmt(cx - ox)} ${fmt(cy + r)} ${fmt(cx - r)} ${fmt(cy + oy)} ${fmt(cx - r)} ${fmt(cy)} c`
  );
  ops.push(
    `${fmt(cx - r)} ${fmt(cy - oy)} ${fmt(cx - ox)} ${fmt(cy - r)} ${fmt(cx)} ${fmt(cy - r)} c`
  );
  ops.push(
    `${fmt(cx + ox)} ${fmt(cy - r)} ${fmt(cx + r)} ${fmt(cy - oy)} ${fmt(cx + r)} ${fmt(cy)} c`
  );
  ops.push('S');
  return ops;
}

function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function rectEdgePoint(rect, toward) {
  // Intersection of center->toward ray with rectangle boundary.
  const c = rectCenter(rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const eps = 1e-6;
  const adx = Math.abs(dx) || eps;
  const ady = Math.abs(dy) || eps;
  const sx = (rect.w / 2) / adx;
  const sy = (rect.h / 2) / ady;
  const t = Math.min(sx, sy);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function drawCrowFootSymbol(edgePt, dir, kind) {
  // dir: unit vector from this entity toward the other entity
  // kind: 'one' | 'zeroOne' | 'oneMany' | 'zeroMany'
  const ops = [];
  const px = -dir.y;
  const py = dir.x;

  const circleR = 4;
  const barHalf = 7;

  // Keep symbols clearly outside the entity box.
  const baseCircle = { x: edgePt.x + dir.x * 12, y: edgePt.y + dir.y * 12 };
  const baseBar = { x: edgePt.x + dir.x * 22, y: edgePt.y + dir.y * 22 };
  const baseFoot = { x: edgePt.x + dir.x * 28, y: edgePt.y + dir.y * 28 };

  const drawBar = (p) => {
    ops.push(...drawLine(p.x + px * barHalf, p.y + py * barHalf, p.x - px * barHalf, p.y - py * barHalf));
  };

  const drawDoubleBar = (p) => {
    // Two parallel bars (common crow's foot rendering for “exactly one”).
    const off = 3.5;
    ops.push(...drawLine(
      p.x + px * (barHalf) + dir.x * off,
      p.y + py * (barHalf) + dir.y * off,
      p.x - px * (barHalf) + dir.x * off,
      p.y - py * (barHalf) + dir.y * off,
    ));
    ops.push(...drawLine(
      p.x + px * (barHalf) - dir.x * off,
      p.y + py * (barHalf) - dir.y * off,
      p.x - px * (barHalf) - dir.x * off,
      p.y - py * (barHalf) - dir.y * off,
    ));
  };

  const drawCrowFoot = (p) => {
    // Vertex at p, prongs extend back toward entity.
    const back = 12;
    const spread = 8;
    const s1 = { x: p.x - dir.x * back + px * spread, y: p.y - dir.y * back + py * spread };
    const s2 = { x: p.x - dir.x * back, y: p.y - dir.y * back };
    const s3 = { x: p.x - dir.x * back - px * spread, y: p.y - dir.y * back - py * spread };
    ops.push(...drawLine(p.x, p.y, s1.x, s1.y));
    ops.push(...drawLine(p.x, p.y, s2.x, s2.y));
    ops.push(...drawLine(p.x, p.y, s3.x, s3.y));
  };

  if (kind === 'one') {
    drawDoubleBar(baseBar);
  } else if (kind === 'zeroOne') {
    ops.push(...drawCircle(baseCircle.x, baseCircle.y, circleR));
    drawDoubleBar(baseBar);
  } else if (kind === 'oneMany') {
    // Mandatory many: |< (bar + crowfoot)
    drawDoubleBar(baseBar);
    drawCrowFoot(baseFoot);
  } else if (kind === 'zeroMany') {
    // Optional many: o< (circle + crowfoot)
    ops.push(...drawCircle(baseCircle.x, baseCircle.y, circleR));
    drawCrowFoot(baseFoot);
  }

  return ops;
}

function drawPolyline(points) {
  const pts = (Array.isArray(points) ? points : []).filter(Boolean);
  if (pts.length < 2) return [];
  const ops = [];
  ops.push(`${fmt(pts[0].x)} ${fmt(pts[0].y)} m`);
  for (let i = 1; i < pts.length; i++) {
    ops.push(`${fmt(pts[i].x)} ${fmt(pts[i].y)} l`);
  }
  ops.push('S');
  return ops;
}

function unitVec(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}

function movePoint(p, dir, dist) {
  return { x: p.x + dir.x * dist, y: p.y + dir.y * dist };
}

function drawCrowFootRelationshipElbow({
  aRect,
  bRect,
  aEdgeToward,
  bEdgeToward,
  path,
  aKind,
  bKind,
  lineGap = 18,
}) {
  // path: array of points starting at A edge point and ending at B edge point.
  const pts = (Array.isArray(path) ? path : []).filter(Boolean);
  if (pts.length < 2) return [];

  const dirA = unitVec(pts[0], pts[1]);
  const dirB = unitVec(pts[pts.length - 1], pts[pts.length - 2]);

  const segLenA = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const segLenB = Math.hypot(
    pts[pts.length - 2].x - pts[pts.length - 1].x,
    pts[pts.length - 2].y - pts[pts.length - 1].y,
  );
  // Keep a small remainder so the elbow points stay in order.
  const gapA = Math.max(0, Math.min(lineGap, Math.max(0, segLenA - 2)));
  const gapB = Math.max(0, Math.min(lineGap, Math.max(0, segLenB - 2)));

  // Draw both the line and the crow's-foot symbols outside the entity border.
  const startAdj = movePoint(pts[0], dirA, gapA);
  const endAdj = movePoint(pts[pts.length - 1], dirB, gapB);
  const routed = [startAdj, ...pts.slice(1, -1), endAdj];

  const ops = [];
  ops.push(...drawPolyline(routed));
  ops.push(...drawCrowFootSymbol(startAdj, dirA, aKind));
  ops.push(...drawCrowFootSymbol(endAdj, dirB, bKind));
  return ops;
}

function drawCrowFootRelationship(a, b, aKind, bKind) {
  // a/b: {x,y,w,h}
  // kind: 'one' | 'zeroOne' | 'oneMany' | 'zeroMany'
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const dirAB = { x: dx / len, y: dy / len };
  const dirBA = { x: -dirAB.x, y: -dirAB.y };

  const ea = rectEdgePoint(a, cb);
  const eb = rectEdgePoint(b, ca);

  const ops = [];
  ops.push(...drawLine(ea.x, ea.y, eb.x, eb.y));
  ops.push(...drawCrowFootSymbol(ea, dirAB, aKind));
  ops.push(...drawCrowFootSymbol(eb, dirBA, bKind));
  return ops;
}

function drawArrowBetweenRects(fromRect, toRect) {
  const fromC = rectCenter(fromRect);
  const toC = rectCenter(toRect);
  const start = rectEdgePoint(fromRect, toC);
  const end = rectEdgePoint(toRect, fromC);
  return drawArrow(start.x, start.y, end.x, end.y);
}

function drawArrowWithLabel(x1, y1, x2, y2, label, { size = 8.5, dx = 0, dy = 0 } = {}) {
  const ops = [];
  ops.push(...drawArrow(x1, y1, x2, y2));
  if (label) {
    const mx = (x1 + x2) / 2 + dx;
    const my = (y1 + y2) / 2 + dy;
    ops.push(...drawText(mx, my, String(label), size));
  }
  return ops;
}

function drawArrowBetweenRectsLabeled(fromRect, toRect, label, opts = {}) {
  const fromC = rectCenter(fromRect);
  const toC = rectCenter(toRect);
  const start = rectEdgePoint(fromRect, toC);
  const end = rectEdgePoint(toRect, fromC);
  return drawArrowWithLabel(start.x, start.y, end.x, end.y, label, opts);
}

function drawLabelInRect(rect, text, { size = 10, maxChars = 28, topPad = 14, leading = 12 } = {}) {
  const lines = wrapText(text, maxChars);
  const yTop = rect.y + rect.h - topPad;
  return drawParagraph(rect.x + 10, yTop, lines, { size, leading, maxChars });
}

function drawArrow(x1, y1, x2, y2) {
  // Simple arrow: line + 2 short head lines.
  const ops = [];
  ops.push(...drawLine(x1, y1, x2, y2));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = 10;
  const hx = x2 - ux * head;
  const hy = y2 - uy * head;
  // perpendicular
  const px = -uy;
  const py = ux;
  ops.push(...drawLine(x2, y2, hx + px * 4, hy + py * 4));
  ops.push(...drawLine(x2, y2, hx - px * 4, hy - py * 4));
  return ops;
}

function drawArrowPolyline(points) {
  const pts = (Array.isArray(points) ? points : []).filter(Boolean);
  if (pts.length < 2) return [];
  const ops = [];
  for (let i = 0; i < pts.length - 1; i++) {
    ops.push(...drawLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }

  // Arrow head based on last segment direction.
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = 10;
  const hx = b.x - ux * head;
  const hy = b.y - uy * head;
  const px = -uy;
  const py = ux;
  ops.push(...drawLine(b.x, b.y, hx + px * 4, hy + py * 4));
  ops.push(...drawLine(b.x, b.y, hx - px * 4, hy - py * 4));
  return ops;
}

function drawElbowArrowBetweenRectsLabeled(
  fromRect,
  toRect,
  label,
  {
    viaX,
    labelAt = 'h1',
    size = 8.8,
    labelDx = 0,
    labelDy = 0,
    startDy = 0,
    endDy = 0,
    pad = 2,
  } = {},
) {
  const fromC = rectCenter(fromRect);
  const toC = rectCenter(toRect);
  const fromRight = toC.x >= fromC.x;

  const start = fromRight
    ? { x: fromRect.x + fromRect.w + pad, y: fromC.y + startDy }
    : { x: fromRect.x - pad, y: fromC.y + startDy };

  const end = fromRight
    ? { x: toRect.x - pad, y: toC.y + endDy }
    : { x: toRect.x + toRect.w + pad, y: toC.y + endDy };

  const trunkX = Number.isFinite(viaX) ? viaX : (start.x + end.x) / 2;
  const pts = [
    start,
    { x: trunkX, y: start.y },
    { x: trunkX, y: end.y },
    end,
  ];

  const ops = [];
  ops.push(...drawArrowPolyline(pts));

  if (label) {
    let lx = 0;
    let ly = 0;
    if (labelAt === 'h1') {
      lx = (start.x + trunkX) / 2;
      ly = start.y;
    } else if (labelAt === 'h2') {
      lx = (end.x + trunkX) / 2;
      ly = end.y;
    } else {
      lx = trunkX;
      ly = (start.y + end.y) / 2;
    }
    ops.push(...drawText(lx + labelDx, ly + labelDy, String(label), size));
  }

  return ops;
}

function setStrokeGray(g) {
  return [`${fmt(g)} G`];
}

function setLineWidth(w) {
  return [`${fmt(w)} w`];
}

function drawText(x, y, text, size = 11) {
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

function drawParagraph(x, yTop, text, { size = 9, leading = 11, maxChars = 110 } = {}) {
  const ops = [];
  const lines = Array.isArray(text) ? text : wrapText(text, maxChars);
  let y = yTop;
  for (const ln of lines) {
    ops.push(...drawText(x, y, ln, size));
    y -= leading;
  }
  return ops;
}

function drawExplanationBox({ x, y, w, h, title, bodyLines, size = 9 }) {
  const ops = [];
  ops.push(...drawRect(x, y, w, h));
  ops.push(...drawText(x + 10, y + h - 18, title, 10));
  const startY = y + h - 34;
  const allLines = [];
  for (const line of (bodyLines || [])) {
    if (typeof line === 'string' && line.trim()) {
      allLines.push(...wrapText(line, 118));
    }
  }
  ops.push(...drawParagraph(x + 10, startY, allLines, { size, leading: 11, maxChars: 118 }));
  return ops;
}

// Shared geometry for table-style ERD entities.
const ERD_TABLE_HEADER_H = 34;
const ERD_TABLE_KEY_COL_W = 52;
const ERD_TABLE_ROW_H = 18;

function erdRowCenterY(rect, rowIndex) {
  // rowIndex: 0-based row inside the table body (below header)
  const bodyTop = rect.y + rect.h - ERD_TABLE_HEADER_H;
  return bodyTop - rowIndex * ERD_TABLE_ROW_H - ERD_TABLE_ROW_H / 2;
}

function drawTableEntity({ rect, title, rows }) {
  // rows: [{ key: 'PK'|'FK'|'', name: string }]
  const ops = [];
  const headerH = ERD_TABLE_HEADER_H;
  const keyColW = ERD_TABLE_KEY_COL_W;
  const rowH = ERD_TABLE_ROW_H;

  ops.push(...drawRect(rect.x, rect.y, rect.w, rect.h));
  // Header separator
  ops.push(...drawLine(rect.x, rect.y + rect.h - headerH, rect.x + rect.w, rect.y + rect.h - headerH));
  // Key column divider (below header)
  ops.push(...drawLine(
    rect.x + keyColW,
    rect.y,
    rect.x + keyColW,
    rect.y + rect.h - headerH,
  ));

  // Title centered-ish
  const titleX = rect.x + rect.w / 2 - Math.min(String(title || '').length * 2.2, rect.w / 2 - 10);
  ops.push(...drawText(titleX, rect.y + rect.h - 22, String(title || ''), 12));

  const bodyTop = rect.y + rect.h - headerH;
  const safeRows = Array.isArray(rows) ? rows : [];

  for (let i = 0; i < safeRows.length; i++) {
    const yTop = bodyTop - i * rowH;
    const yBottom = yTop - rowH;
    if (yBottom < rect.y) break;
    // Row separator
    ops.push(...drawLine(rect.x, yBottom, rect.x + rect.w, yBottom));

    const r = safeRows[i] || {};
    const key = (r.key || '').toString().trim();
    const name = (r.name || '').toString();

    if (key) ops.push(...drawText(rect.x + 10, yBottom + 6, key, 10));
    // Field text, wrapped if needed
    const nameRect = { x: rect.x + keyColW, y: yBottom, w: rect.w - keyColW, h: rowH };
    ops.push(...drawLabelInRect(nameRect, name, { size: 9, maxChars: 34, topPad: 11, leading: 10 }));
  }

  return ops;
}

function buildPdf({ pages, title }) {
  // pages: [{ width, height, contentOps: string[] }]
  // Minimal PDF with one shared font.

  const objects = [];
  const addObj = (str) => {
    objects.push(str);
    return objects.length; // 1-based id
  };

  const fontObjId = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  );

  const contentObjIds = [];
  const pageObjIds = [];

  for (const p of pages) {
    const stream = contentStream(p.contentOps);
    const contentId = addObj(
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`
    );
    contentObjIds.push(contentId);

    const pageId = addObj(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${fmt(p.width)} ${fmt(p.height)}] ` +
      `/Resources << /Font << /F1 ${fontObjId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R /Rotate 0 >>`
    );
    pageObjIds.push(pageId);
  }

  const pagesObjId = addObj(
    `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`
  );

  // Patch each page's Parent reference (we used 0 0 R placeholder)
  for (let i = 0; i < pageObjIds.length; i++) {
    const idx = pageObjIds[i] - 1;
    objects[idx] = objects[idx].replace('/Parent 0 0 R', `/Parent ${pagesObjId} 0 R`);
  }

  const catalogObjId = addObj(
    `<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`
  );

  const infoObjId = addObj(
    `<< /Title (${pdfEscapeText(title || 'SmartHub Diagrams')}) >>`
  );

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

function pageUseCase() {
  const W = 842; // A4 landscape
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  // Title
  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — Use Case Diagram (Simplified)', 14));

  // Layout constants
  const system = { x: 220, y: 120, w: 420, h: 420 };
  const actorTech = { x: 40, y: 450, w: 160, h: 80 };
  const extX = 670;
  const extW = 160;
  const extH = 42;

  // System boundary (use cases must be inside)
  ops.push(...drawRect(system.x, system.y, system.w, system.h));
  ops.push(...drawText(system.x + 10, system.y + system.h - 18, 'System: SmartHub Diagnostics (Desktop UI + Node/Express Backend)', 10));

  // Primary actor (Technician)
  ops.push(...drawRect(actorTech.x, actorTech.y, actorTech.w, actorTech.h));
  ops.push(...drawText(actorTech.x + 12, actorTech.y + 50, 'Actor:', 10));
  ops.push(...drawText(actorTech.x + 12, actorTech.y + 30, 'Technician', 12));

  // Use cases (inside boundary)
  const ucX = system.x + 30;
  const ucW = system.w - 60;
  const ucH = 44;
  const u = [
    { key: 'discover', label: 'Discover Connected Devices', y: system.y + 320 },
    { key: 'full', label: 'Run Full Diagnostics (ADB)', y: system.y + 255 },
    { key: 'bsod', label: 'Diagnose BSOD (USB-only)', y: system.y + 190 },
    { key: 'sec', label: 'Security Scan (ADB)', y: system.y + 125 },
    { key: 'install', label: 'Install Mobile App', y: system.y + 60 },
    { key: 'export', label: 'View / Export Results', y: system.y + 15 },
  ];
  const ucByKey = {};
  for (const item of u) {
    const r = { x: ucX, y: item.y, w: ucW, h: ucH };
    ucByKey[item.key] = r;
    ops.push(...drawRect(r.x, r.y, r.w, r.h));
    ops.push(...drawText(r.x + 12, r.y + 16, item.label, 11));
  }

  // Associations: Technician -> main use cases (reduced clutter)
  const techAnchor = { x: actorTech.x + actorTech.w, y: actorTech.y + actorTech.h / 2 };
  const techTargets = ['discover', 'full', 'bsod', 'sec', 'install'];
  for (let i = 0; i < techTargets.length; i++) {
    const r = ucByKey[techTargets[i]];
    const target = { x: r.x, y: r.y + r.h / 2 };
    // Offset the starting Y slightly so lines don't overlap perfectly.
    const start = { x: techAnchor.x, y: techAnchor.y + (i - 2) * 10 };
    ops.push(...drawArrow(start.x, start.y, target.x, target.y));
  }

  // External actors (outside boundary on the right)
  const ext = [
    { key: 'phone', label: 'Android Phone', y: 465 },
    { key: 'win', label: 'Windows Host OS (USB/PnP/MTP)', y: 405 },
    { key: 'tools', label: 'ADB / Fastboot Tools', y: 345 },
    { key: 'webcam', label: 'Camera Checker', y: 285 },
    { key: 'ai', label: 'Offline AI Helper (Python)', y: 225 },
  ];
  const extByKey = {};
  for (const e of ext) {
    const r = { x: extX, y: e.y, w: extW, h: extH };
    extByKey[e.key] = r;
    ops.push(...drawRect(r.x, r.y, r.w, r.h));
    ops.push(...drawLabelInRect(r, e.label, { size: 8.8, maxChars: 22, topPad: 14, leading: 11 }));
  }

  // Associations: external actors -> relevant use cases (minimal, readable)
  const link = (extKey, ucKey) => {
    const a = extByKey[extKey];
    const b = ucByKey[ucKey];
    if (!a || !b) return;
    const from = { x: a.x, y: a.y + a.h / 2 };
    const to = { x: b.x + b.w, y: b.y + b.h / 2 };
    // Arrow from external actor into the system/use case
    ops.push(...drawArrow(from.x, from.y, to.x, to.y));
  };

  link('phone', 'full');
  link('win', 'discover');
  link('tools', 'full');
  link('webcam', 'bsod');
  link('ai', 'bsod');

  // Notes
  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 80,
    title: 'How to read (flow)',
    bodyLines: [
      'Technician starts a use case inside the SmartHub system boundary.',
      'Boxes on the right are external systems used by SmartHub (phone, Windows USB/PnP, ADB/Fastboot tools, camera checker, and offline AI helper).',
      'Arrows show interactions: Technician -> SmartHub use cases; SmartHub -> external systems when needed.',
      'USB-only BSOD flow works without USB debugging (skipAdb/usbOnly); camera + offline AI are optional helpers.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdLevel0() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD Level 0 (Context)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  // Central process
  const p0 = { x: 300, y: 250, w: 260, h: 90 };
  ops.push(...drawRect(p0.x, p0.y, p0.w, p0.h));
  ops.push(...drawText(315, 305, 'P0 SmartHub Diagnostics', 12));
  ops.push(...drawText(315, 285, '(UI + Node/Express Backend)', 10));

  const e1 = { x: 60, y: 420, w: 210, h: 55 };
  const e2 = { x: 60, y: 330, w: 210, h: 55 };
  const e3 = { x: 60, y: 240, w: 210, h: 55 };
  const e4 = { x: 60, y: 150, w: 210, h: 55 };
  const e5 = { x: 650, y: 420, w: 210, h: 55 };
  const e6 = { x: 650, y: 300, w: 210, h: 55 };
  const e7 = { x: 650, y: 180, w: 210, h: 55 };

  ops.push(...drawRect(e1.x, e1.y, e1.w, e1.h));
  ops.push(...drawLabelInRect(e1, 'E1 Technician', { size: 10, maxChars: 26 }));

  ops.push(...drawRect(e2.x, e2.y, e2.w, e2.h));
  ops.push(...drawLabelInRect(e2, 'E2 Android Phone', { size: 10, maxChars: 26 }));

  ops.push(...drawRect(e3.x, e3.y, e3.w, e3.h));
  ops.push(...drawLabelInRect(e3, 'E3 Windows Host OS (USB/PnP/MTP)', { size: 9.6, maxChars: 24 }));

  ops.push(...drawRect(e4.x, e4.y, e4.w, e4.h));
  ops.push(...drawLabelInRect(e4, 'E4 ADB / Fastboot Tools', { size: 9.6, maxChars: 24 }));

  ops.push(...drawRect(e5.x, e5.y, e5.w, e5.h));
  ops.push(...drawLabelInRect(e5, 'E5 Camera Checker', { size: 10, maxChars: 26 }));

  ops.push(...drawRect(e6.x, e6.y, e6.w, e6.h));
  ops.push(...drawLabelInRect(e6, 'E6 Offline AI Helper', { size: 9.6, maxChars: 24 }));

  ops.push(...drawDataStoreShape(e7));
  ops.push(...drawLabelInRect(e7, 'D1 Storage (JSON + SQLite)', { size: 9.2, maxChars: 22 }));

  // Arrows (connect to box edges to avoid crossing labels)
  // Technician
  ops.push(...drawArrowBetweenRectsLabeled(e1, p0, 'request / start', { dx: -10, dy: 10 }));
  ops.push(...drawArrowBetweenRectsLabeled(p0, e1, 'results / report', { dx: -10, dy: -12 }));
  // Phone + tools
  ops.push(...drawArrowBetweenRectsLabeled(e2, p0, 'device signals', { dx: -10, dy: 10 }));
  ops.push(...drawArrowBetweenRectsLabeled(e4, p0, 'adb/fastboot output', { dx: -16, dy: -12 }));
  // Host OS
  ops.push(...drawArrowBetweenRectsLabeled(e3, p0, 'USB/PnP evidence', { dx: -10, dy: 10 }));
  // Camera Checker
  ops.push(...drawArrowBetweenRectsLabeled(p0, e5, 'capture request', { dx: 0, dy: 10 }));
  // AI
  ops.push(...drawArrowBetweenRectsLabeled(p0, e6, 'suggest request', { dx: 0, dy: 10 }));
  ops.push(...drawArrowBetweenRectsLabeled(e6, p0, 'AI conclusion', { dx: 0, dy: -12 }));
  // Storage
  ops.push(...drawArrowBetweenRectsLabeled(p0, e7, 'write results', { dx: 0, dy: 10 }));
  ops.push(...drawArrowBetweenRectsLabeled(e7, p0, 'read history/config', { dx: 0, dy: -12 }));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 90,
    title: 'State / Define / Justify',
    bodyLines: [
      'State (In this level): SmartHub is represented as one process (P0) with only external entities and top-level flows.',
      'Define (According to): Gane and Sarson define a context diagram as the whole system shown as one process with external interfaces (Gane & Sarson, 1979).',
      'Justify (Moreover): This level gives a clear system scope before internal decomposition, which improves stakeholder understanding.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdLevel1() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD Level 1 (Major Processes)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  const procRects = {};
  const procH = 46;

  // Processes column
  const procs = [
    { k: 'P1', t: 'Connection Check', y: 500 },
    { k: 'P2', t: 'Full Diagnostics (ADB)', y: 430 },
    { k: 'P3', t: 'BSOD Diagnose (USB-only)', y: 360 },
    { k: 'P4', t: 'Camera Visual Check', y: 290 },
    { k: 'P5', t: 'Security Scan (ADB)', y: 220 },
    { k: 'P6', t: 'Offline AI Suggest', y: 150 },
  ];
  for (const p of procs) {
    const r = { x: 60, y: p.y, w: 280, h: procH };
    procRects[p.k] = r;
    ops.push(...drawRect(r.x, r.y, r.w, r.h));
    ops.push(...drawLabelInRect(r, `${p.k} ${p.t}`, { size: 10.2, maxChars: 30, topPad: 16, leading: 12 }));
  }

  // Data stores column
  const storeRects = {};
  const stores = [
    { k: 'D1', t: 'history.json', y: 465 },
    { k: 'D4', t: 'memory.sqlite (cases)', y: 305 },
    { k: 'D5', t: 'adb_ai_memory.sqlite (adb_cases)', y: 225 },
  ];
  for (const d of stores) {
    const r = { x: 560, y: d.y, w: 255, h: 45 };
    storeRects[d.k] = r;
    ops.push(...drawDataStoreShape(r));
    ops.push(...drawLabelInRect(r, `${d.k} ${d.t}`, { size: 9.4, maxChars: 30, topPad: 14, leading: 11 }));
  }

  // Key flows (routed with elbow connectors to avoid overlap)
  // Use multiple trunk lanes + small vertical offsets so arrows don't stack.
  const trunk1 = 404;
  const trunk2 = 420;
  const trunk3 = 436;
  const trunk4 = 452;
  const trunk5 = 468;
  const trunk6 = 484;
  const trunk7 = 500;

  // P1 Connection Check
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P1, storeRects.D1, 'save check result', { viaX: trunk2, startDy: 10, endDy: 8, labelAt: 'h1', labelDy: 12 }));

  // P2 Full Diagnostics
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P2, storeRects.D1, 'save run', { viaX: trunk3, startDy: 12, endDy: -10, labelAt: 'h1', labelDy: 12 }));

  // P3 BSOD Diagnose (USB-only)
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P3, storeRects.D1, 'save BSOD report', { viaX: trunk4, startDy: 10, endDy: -2, labelAt: 'h1', labelDy: 12 }));
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P3, storeRects.D4, 'write offline AI case', { viaX: trunk2, startDy: 0, endDy: 10, labelAt: 'h1', labelDy: 12 }));

  // P4 Camera Visual Check
  // (no persistent screenshot store shown here)

  // P5 Security Scan
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P5, storeRects.D1, 'save security report', { viaX: trunk1, startDy: 0, endDy: 12, labelAt: 'h1', labelDy: -12 }));

  // P6 Offline AI Suggest
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P6, storeRects.D4, 'write offline AI case', { viaX: trunk3, startDy: 10, endDy: 0, labelAt: 'h1', labelDy: 12 }));
  ops.push(...drawElbowArrowBetweenRectsLabeled(storeRects.D4, procRects.P6, 'read similar cases', { viaX: trunk6, startDy: -10, endDy: 0, labelAt: 'h1', labelDy: -12 }));
  ops.push(...drawElbowArrowBetweenRectsLabeled(procRects.P6, storeRects.D5, 'write ADB AI case', { viaX: trunk2, startDy: -10, endDy: 10, labelAt: 'h1', labelDy: 12 }));
  ops.push(...drawElbowArrowBetweenRectsLabeled(storeRects.D5, procRects.P6, 'read ADB memory', { viaX: trunk5, startDy: 10, endDy: -10, labelAt: 'h1', labelDy: -12 }));


  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 90,
    title: 'State / Define / Justify',
    bodyLines: [
      'State (In this level): P0 is decomposed into major SmartHub processes (P1-P6) and connected to persistent stores.',
      'Define (According to): In Gane and Sarson leveling, the parent process is decomposed while preserving balanced input/output flows (Gane & Sarson, 1979).',
      'Justify (Moreover): This level is needed to separate core functions such as connection check, ADB diagnostics, USB-only BSOD flow, and offline AI support.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdLevel2() {
  // Level 2 decomposition for P3: BSOD Diagnose (USB-only)
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD Level 2 (P3 BSOD Diagnose — USB-only)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  // External entities
  const tech = { x: 40, y: 445, w: 220, h: 55 };
  const win = { x: 40, y: 360, w: 220, h: 65 };
  const cam = { x: 40, y: 285, w: 220, h: 55 };
  const ai = { x: 40, y: 210, w: 220, h: 55 };

  ops.push(...drawRect(tech.x, tech.y, tech.w, tech.h));
  ops.push(...drawLabelInRect(tech, 'E1 Technician', { size: 10, maxChars: 24 }));

  ops.push(...drawRect(win.x, win.y, win.w, win.h));
  ops.push(...drawLabelInRect(win, 'E3 Windows Host OS (USB/PnP/MTP evidence)', { size: 9.4, maxChars: 26 }));

  ops.push(...drawRect(cam.x, cam.y, cam.w, cam.h));
  ops.push(...drawLabelInRect(cam, 'E5 Camera Checker', { size: 10, maxChars: 24 }));

  ops.push(...drawRect(ai.x, ai.y, ai.w, ai.h));
  ops.push(...drawLabelInRect(ai, 'E6 Offline AI Helper (Python)', { size: 9.4, maxChars: 26 }));

  // Sub-processes of P3
  const p31 = { x: 310, y: 470, w: 280, h: 45 };
  const p32 = { x: 310, y: 405, w: 280, h: 45 };
  const p33 = { x: 310, y: 340, w: 280, h: 45 };
  const p34 = { x: 310, y: 275, w: 280, h: 45 };
  const p35 = { x: 310, y: 210, w: 280, h: 45 };

  const procList = [
    { r: p31, t: 'P3.1 Detect USB-connected device' },
    { r: p32, t: 'P3.2 Collect USB/BSOD evidence (logs)' },
    { r: p33, t: 'P3.3 Camera visual check (screen/photo)' },
    { r: p34, t: 'P3.4 Generate offline AI suggestion' },
    { r: p35, t: 'P3.5 Build + save diagnostic result' },
  ];
  for (const p of procList) {
    ops.push(...drawRect(p.r.x, p.r.y, p.r.w, p.r.h));
    ops.push(...drawLabelInRect(p.r, p.t, { size: 9.6, maxChars: 34, topPad: 16, leading: 12 }));
  }

  // Data stores
  const dHistory = { x: 640, y: 470, w: 180, h: 45 };
  const dSqlite = { x: 640, y: 340, w: 180, h: 45 };
  const dUsbFiles = { x: 640, y: 275, w: 180, h: 45 };

  ops.push(...drawDataStoreShape(dHistory));
  ops.push(...drawLabelInRect(dHistory, 'D1 history.json', { size: 9.6, maxChars: 22 }));

  ops.push(...drawDataStoreShape(dSqlite));
  ops.push(...drawLabelInRect(dSqlite, 'D4 memory.sqlite (cases)', { size: 9.2, maxChars: 22 }));

  ops.push(...drawDataStoreShape(dUsbFiles));
  ops.push(...drawLabelInRect(dUsbFiles, 'D7 usb-evidence files', { size: 9.2, maxChars: 22 }));

  // Flows (simplified)
  // Technician triggers
  ops.push(...drawArrowWithLabel(tech.x + tech.w, tech.y + 28, p31.x, p31.y + 22, 'start USB-only BSOD', { dx: -20, dy: 10, size: 9 }));

  // Windows evidence -> detect + collect
  ops.push(...drawArrowWithLabel(win.x + win.w, win.y + 40, p31.x, p31.y + 10, 'USB enumerate', { dx: -10, dy: 10, size: 9 }));
  ops.push(...drawArrowWithLabel(win.x + win.w, win.y + 35, p32.x, p32.y + 22, 'PnP/MTP + logs', { dx: -10, dy: -12, size: 9 }));

  // Camera checker -> camera check
  ops.push(...drawArrowWithLabel(cam.x + cam.w, cam.y + 28, p33.x, p33.y + 22, 'camera frames', { dx: -10, dy: 10, size: 9 }));

  // AI helper exchange
  ops.push(...drawArrowWithLabel(ai.x + ai.w, ai.y + 28, p34.x, p34.y + 22, 'similar cases', { dx: -10, dy: 10, size: 9 }));
  ops.push(...drawArrowWithLabel(p34.x, p34.y + 22, ai.x + ai.w, ai.y + 20, 'suggest request', { dx: -10, dy: -12, size: 9 }));

  // Process chaining
  ops.push(...drawArrowWithLabel(p31.x + p31.w / 2, p31.y, p32.x + p32.w / 2, p32.y + p32.h, 'device found', { dx: 10, dy: 8, size: 8.5 }));
  ops.push(...drawArrowWithLabel(p32.x + p32.w / 2, p32.y, p33.x + p33.w / 2, p33.y + p33.h, 'evidence collected', { dx: 10, dy: 8, size: 8.5 }));
  ops.push(...drawArrowWithLabel(p33.x + p33.w / 2, p33.y, p34.x + p34.w / 2, p34.y + p34.h, 'visual hints', { dx: 10, dy: 8, size: 8.5 }));
  ops.push(...drawArrowWithLabel(p34.x + p34.w / 2, p34.y, p35.x + p35.w / 2, p35.y + p35.h, 'AI suggestion', { dx: 10, dy: 8, size: 8.5 }));

  // Data store writes
  ops.push(...drawArrowWithLabel(p32.x + p32.w, p32.y + 22, dUsbFiles.x, dUsbFiles.y + 22, 'save USB evidence', { dx: 0, dy: -12, size: 9 }));
  ops.push(...drawArrowWithLabel(p34.x + p34.w, p34.y + 22, dSqlite.x, dSqlite.y + 22, 'save AI memory', { dx: 0, dy: 10, size: 9 }));
  ops.push(...drawArrowWithLabel(p35.x + p35.w, p35.y + 22, dHistory.x, dHistory.y + 22, 'save run summary', { dx: 0, dy: -12, size: 9 }));

  // Output back to technician
  ops.push(...drawArrowWithLabel(p35.x, p35.y + 10, tech.x + tech.w, tech.y + 10, 'result summary', { dx: -30, dy: 10, size: 9 }));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 95,
    title: 'State / Define / Justify',
    bodyLines: [
      'State (In this level): P3 is decomposed into P3.1-P3.5 for detailed USB-only BSOD diagnosis flow.',
      'Define (According to): Gane and Sarson Level 2 expands one Level 1 process into lower-level sub-processes while preserving parent-level data balance (Gane & Sarson, 1979).',
      'Justify (Moreover): This decomposition is required because USB evidence handling, optional camera/AI support, and final reporting are distinct transformations.',
    ],
  }));
  return { width: W, height: H, contentOps: ops };
}

function pageErd() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, "SmartHub Diagnostics — ERD (Crow's Foot Notation)", 14));
  ops.push(...drawText(40, 545, 'Storage: JSON/files (runs, screenshots, USB evidence) + SQLite (offline AI memory).', 10));

  // Layout: 3 entities on top row, 3 on bottom row.
  // Keep everything above the explanation box (y=20..130).
  const technician = { x: 40, y: 355, w: 240, h: 170 };
  const run = { x: 310, y: 355, w: 260, h: 170 };
  const screenshot = { x: 600, y: 355, w: 240, h: 170 };

  const bsodReport = { x: 40, y: 140, w: 240, h: 195 };
  const offlineAiCase = { x: 310, y: 140, w: 260, h: 195 };
  const adbAiCase = { x: 600, y: 140, w: 240, h: 195 };

  ops.push(...drawTableEntity({
    rect: technician,
    title: 'Technician',
    rows: [
      { key: 'PK', name: 'technician_id INT' },
      { key: '', name: 'username VARCHAR(50) UNIQUE' },
      { key: '', name: 'password_hash VARCHAR(255)' },
      { key: '', name: 'name VARCHAR(80)' },
      { key: '', name: 'Stored: SQLite (recommended)' },
    ],
  }));

  ops.push(...drawTableEntity({
    rect: run,
    title: 'DiagnosticRun',
    rows: [
      { key: 'PK', name: 'run_id VARCHAR(40)' },
      { key: 'FK', name: 'technician_id INT (logical)' },
      { key: '', name: 'created_at INT (epoch ms)' },
      { key: '', name: 'mode VARCHAR(16)' },
      { key: '', name: 'device_primary VARCHAR(120)' },
      { key: '', name: 'device_info VARCHAR(4000) (JSON)' },
      { key: '', name: 'result_summary VARCHAR(1500)' },
      { key: '', name: 'Stored: history.json' },
    ],
  }));

  ops.push(...drawTableEntity({
    rect: screenshot,
    title: 'Screenshot',
    rows: [
      { key: 'PK', name: 'screenshot_id VARCHAR(40)' },
      { key: 'FK', name: 'run_id VARCHAR(40) (logical)' },
      { key: '', name: 'file_path VARCHAR(260)' },
      { key: '', name: 'taken_at INT (epoch ms)' },
      { key: '', name: 'Stored: screenshots/*.png' },
    ],
  }));

  // BSOD / USB-only diagnostics (saved in run JSON, plus host evidence files)
  ops.push(...drawTableEntity({
    rect: bsodReport,
    title: 'BsodUsbOnlyReport',
    rows: [
      { key: 'PK', name: 'report_id VARCHAR(40)' },
      { key: 'FK', name: 'run_id VARCHAR(40) (logical)' },
      { key: '', name: 'bsod_category VARCHAR(40)' },
      { key: '', name: 'confidence VARCHAR(10)' },
      { key: '', name: 'primary_reason VARCHAR(800)' },
      { key: '', name: 'usb_signals_json VARCHAR(4000) (JSON)' },
      { key: '', name: 'host_evidence VARCHAR(2000) (paths)' },
      { key: '', name: 'Stored: history.json + usb-evidence/*' },
    ],
  }));

  // Offline AI memory (SQLite)
  ops.push(...drawTableEntity({
    rect: offlineAiCase,
    title: 'Offline AI: cases',
    rows: [
      { key: 'PK', name: 'id INTEGER' },
      { key: '', name: 'created_at INTEGER' },
      { key: '', name: 'last_seen INTEGER' },
      { key: '', name: 'seen_count INTEGER' },
      { key: '', name: 'source VARCHAR(32)' },
      { key: '', name: 'device_primary VARCHAR(120)' },
      { key: '', name: 'fingerprint VARCHAR(128)' },
      { key: '', name: 'device_hints_json VARCHAR(4000)' },
      { key: '', name: 'feature_tokens_json VARCHAR(4000)' },
      { key: '', name: 'report_json VARCHAR(8000)' },
      { key: '', name: 'note VARCHAR(1000)' },
      { key: '', name: 'outcome VARCHAR(120)' },
    ],
  }));

  // ADB AI memory (SQLite)
  ops.push(...drawTableEntity({
    rect: adbAiCase,
    title: 'ADB AI: adb_cases',
    rows: [
      { key: 'PK', name: 'id INTEGER' },
      { key: '', name: 'created_at INTEGER' },
      { key: '', name: 'feature_hash VARCHAR(128)' },
      { key: '', name: 'features_json VARCHAR(8000)' },
      { key: '', name: 'label VARCHAR(120)' },
      { key: '', name: 'confidence REAL' },
      { key: '', name: 'failing_json VARCHAR(4000)' },
      { key: '', name: 'actions_json VARCHAR(4000)' },
      { key: '', name: 'outcome VARCHAR(120)' },
      { key: '', name: 'resolution VARCHAR(1200)' },
      { key: '', name: 'note VARCHAR(1000)' },
    ],
  }));

  const clampElbowY = (aY, bY, offset = 0) => {
    const mid = (aY + bY) / 2;
    return Math.max(Math.min(aY, bY) + 10, Math.min(Math.max(aY, bY) - 10, mid + offset));
  };

  // Relationships (Crow's Foot symbols + orthogonal routing)
  // Technician || —— o< DiagnosticRun
  {
    const aEdge = { x: technician.x + technician.w, y: erdRowCenterY(technician, 0) };
    const bEdge = { x: run.x, y: erdRowCenterY(run, 1) };
    const midX = (aEdge.x + bEdge.x) / 2;
    ops.push(...drawCrowFootRelationshipElbow({
      aRect: technician,
      bRect: run,
      aKind: 'one',
      bKind: 'zeroMany',
      path: [aEdge, { x: midX, y: aEdge.y }, { x: midX, y: bEdge.y }, bEdge],
      lineGap: 18,
    }));
  }

  // DiagnosticRun || —— o< Screenshot
  {
    const aEdge = { x: run.x + run.w, y: erdRowCenterY(run, 0) };
    const bEdge = { x: screenshot.x, y: erdRowCenterY(screenshot, 1) };
    const midX = (aEdge.x + bEdge.x) / 2;
    ops.push(...drawCrowFootRelationshipElbow({
      aRect: run,
      bRect: screenshot,
      aKind: 'one',
      bKind: 'zeroMany',
      path: [aEdge, { x: midX, y: aEdge.y }, { x: midX, y: bEdge.y }, bEdge],
      lineGap: 18,
    }));
  }

  // DiagnosticRun || —— o| BsodUsbOnlyReport
  {
    const aEdge = { x: run.x + run.w * 0.25, y: run.y };
    const bEdge = { x: bsodReport.x + bsodReport.w / 2, y: bsodReport.y + bsodReport.h };
    const yElbow = clampElbowY(aEdge.y, bEdge.y, 6);
    ops.push(...drawCrowFootRelationshipElbow({
      aRect: run,
      bRect: bsodReport,
      aKind: 'one',
      bKind: 'zeroOne',
      path: [aEdge, { x: aEdge.x, y: yElbow }, { x: bEdge.x, y: yElbow }, bEdge],
      lineGap: 18,
    }));
  }

  // DiagnosticRun || —— o| Offline AI Case
  {
    const aEdge = { x: run.x + run.w * 0.5, y: run.y };
    const bEdge = { x: offlineAiCase.x + offlineAiCase.w / 2, y: offlineAiCase.y + offlineAiCase.h };
    const yElbow = clampElbowY(aEdge.y, bEdge.y, 0);
    ops.push(...drawCrowFootRelationshipElbow({
      aRect: run,
      bRect: offlineAiCase,
      aKind: 'one',
      bKind: 'zeroOne',
      path: [aEdge, { x: aEdge.x, y: yElbow }, { x: bEdge.x, y: yElbow }, bEdge],
      lineGap: 18,
    }));
  }

  // DiagnosticRun || —— o| ADB AI Case
  {
    const aEdge = { x: run.x + run.w * 0.75, y: run.y };
    const bEdge = { x: adbAiCase.x + adbAiCase.w / 2, y: adbAiCase.y + adbAiCase.h };
    const yElbow = clampElbowY(aEdge.y, bEdge.y, -6);
    ops.push(...drawCrowFootRelationshipElbow({
      aRect: run,
      bRect: adbAiCase,
      aKind: 'one',
      bKind: 'zeroOne',
      path: [aEdge, { x: aEdge.x, y: yElbow }, { x: bEdge.x, y: yElbow }, bEdge],
      lineGap: 18,
    }));
  }

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 110,
    title: 'How to read (relationships)',
    bodyLines: [
      'This ERD uses Crow\'s Foot notation to show relationships between entities used by SmartHub diagnostics.',
      'Symbols: o = optional (0), | = one (1), crowfoot = many (*). Example: Technician |——o< DiagnosticRun means one technician can have zero or many runs.',
      'Data type/length notes: SQLite does not enforce VARCHAR lengths; lengths here are recommended for documentation.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdTextLevel0() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD (Text Only) — Level 0 (Context)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  const body = [
    'State (In this level): SmartHub is one process (P0) with external entities and top-level data flows.',
    'Define (According to): Context DFD shows the entire system as one process and only external interfaces (Gane & Sarson, 1979).',
    'Justify (Moreover): This gives a clear and bounded overview before decomposition.',
    '',
    'Process:',
    'P0 SmartHub Diagnostics (UI + Node/Express Backend)',
    '',
    'External Entities:',
    '- E1 Technician',
    '- E2 Android Phone',
    '- E3 Windows Host OS (USB/PnP/MTP evidence)',
    '- E4 ADB / Fastboot Tools',
    '- E5 Camera Checker (optional visual check)',
    '- E6 Offline AI Helper (Python)',
    '',
    'Data Store:',
    '- D1 Storage (JSON + SQLite)',
    '',
    'Main Data Flows:',
    '- E1 -> P0: request / start',
    '- P0 -> E1: results / report',
    '- E2 -> P0: device signals',
    '- E3 -> P0: USB/PnP evidence',
    '- E4 -> P0: adb/fastboot output',
    '- P0 -> E5: capture request (optional)',
    '- P0 -> E6: suggest request; E6 -> P0: AI conclusion (optional)',
    '- P0 -> D1: write results; D1 -> P0: read history/config',
  ];

  ops.push(...drawParagraph(40, 530, body, { size: 10, leading: 14, maxChars: 120 }));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 90,
    title: 'How to read (flow)',
    bodyLines: [
      'Level 0 shows SmartHub as one process and lists external interfaces in Gane and Sarson style.',
      'This page is text-only; the diagram PDF shows the same elements graphically.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdTextLevel1() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD (Text Only) — Level 1 (Major Processes)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  const body = [
    'State (In this level): P0 is decomposed into major processes and linked stores.',
    'Define (According to): Level 1 decomposition must keep parent-level flow balance (Gane & Sarson, 1979).',
    'Justify (Moreover): SmartHub needs this level to separate and clarify major diagnostic functions.',
    '',
    'Processes (decomposition of P0):',
    '- P1 Connection Check',
    '- P2 Full Diagnostics (ADB)',
    '- P3 BSOD Diagnose (USB-only)',
    '- P4 Camera Visual Check',
    '- P5 Security Scan (ADB)',
    '- P6 Offline AI Suggest',
    '',
    'Data Stores:',
    '- D1 history.json (run summaries / history)',
    '- D4 memory.sqlite (cases) — offline AI memory',
    '- D5 adb_ai_memory.sqlite (adb_cases) — ADB AI memory',
    '',
    'Key Data Flows:',
    '- P1 -> D1: save check result',
    '- P2 -> D1: save run',
    '- P3 -> D1: save BSOD report',
    '- P3 -> D4: write offline AI case (optional helper)',
    '- P5 -> D1: save security report',
    '- P6 <-> D4: read similar cases / write offline AI case',
    '- P6 <-> D5: read ADB memory / write ADB AI case',
  ];

  ops.push(...drawParagraph(40, 530, body, { size: 10, leading: 14, maxChars: 120 }));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 90,
    title: 'How to read (flow)',
    bodyLines: [
      'Level 1 breaks P0 into major processes and shows which stores they read/write.',
      'Only primary stores are listed here; the graphical DFD shows the same relationships as arrows.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageDfdTextLevel2() {
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — DFD (Text Only) — Level 2 (P3 BSOD Diagnose — USB-only)', 14));
  ops.push(...drawText(40, 548, 'Method: Gane and Sarson DFD notation', 10));

  const body = [
    'State (In this level): P3 is decomposed into sub-processes P3.1-P3.5.',
    'Define (According to): Level 2 expands one selected Level 1 process for detailed transformation flow (Gane & Sarson, 1979).',
    'Justify (Moreover): This level is needed to make the USB-only BSOD decision path auditable and clear.',
    '',
    'Decomposed Process:',
    'P3 BSOD Diagnose (USB-only) decomposes into:',
    '- P3.1 Detect USB-connected device',
    '- P3.2 Collect USB/BSOD evidence (logs)',
    '- P3.3 Camera visual check (optional)',
    '- P3.4 Generate offline AI suggestion (optional)',
    '- P3.5 Build + save diagnostic result',
    '',
    'External Entities used by P3:',
    '- E1 Technician',
    '- E3 Windows Host OS (USB/PnP/MTP evidence)',
    '- E5 Camera Checker (optional)',
    '- E6 Offline AI Helper (Python, optional)',
    '',
    'Data Stores used by P3:',
    '- D1 history.json (save run summary)',
    '- D4 memory.sqlite (cases) — save offline AI memory',
    '- D7 usb-evidence files (save host logs/evidence)',
    '',
    'Key Data Flows:',
    '- E1 -> P3.1: start USB-only BSOD',
    '- E3 -> P3.1/P3.2: USB enumerate + logs',
    '- E5 -> P3.3: camera frames (optional)',
    '- P3.2 -> D7: save USB evidence',
    '- P3.4 -> D4: save AI memory (optional)',
    '- P3.5 -> D1: save run summary',
    '- P3.5 -> E1: result summary',
  ];

  ops.push(...drawParagraph(40, 530, body, { size: 10, leading: 14, maxChars: 120 }));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 90,
    title: 'How to read (flow)',
    bodyLines: [
      'Level 2 decomposes one Level 1 process (P3) into its sub-steps and shows the main stores used by those steps.',
      'USB-only means this path can work even when ADB debugging is not available.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function pageNetworkDiagram() {
  // Simple “like the sample” diagram: actors <-> app <-> loopback <-> server <-> database.
  // SmartHub is local-only, so the “cloud” here is Localhost (127.0.0.1), not Internet.
  const W = 842;
  const H = 595;
  const ops = [];

  ops.push(...setLineWidth(1.2));
  ops.push(...setStrokeGray(0));

  ops.push(...drawText(40, 565, 'SmartHub Diagnostics — Network Diagram (Simplified)', 14));
  ops.push(...drawText(40, 545, 'No Internet required. UI and server communicate via localhost (loopback).', 10));

  // Nodes
  const actors = { x: 40, y: 320, w: 185, h: 80 };
  const app = { x: 275, y: 305, w: 230, h: 100 };
  const loopback = { x: 330, y: 465, w: 140, h: 60 };
  const server = { x: 545, y: 320, w: 175, h: 80 };
  const db = { x: 745, y: 328, w: 85, h: 64 };
  const phone = { x: 275, y: 195, w: 230, h: 70 };

  ops.push(...drawRect(actors.x, actors.y, actors.w, actors.h));
  ops.push(...drawLabelInRect(actors, 'Technician / Shop Staff', { size: 11, maxChars: 22, topPad: 18, leading: 12 }));

  ops.push(...drawRect(app.x, app.y, app.w, app.h));
  ops.push(...drawLabelInRect(
    app,
    'SmartHub Desktop App\n(WPF + WebView2)',
    { size: 11, maxChars: 28, topPad: 22, leading: 13 },
  ));

  ops.push(...drawRect(loopback.x, loopback.y, loopback.w, loopback.h));
  ops.push(...drawLabelInRect(loopback, 'Localhost\n127.0.0.1', { size: 11, maxChars: 16, topPad: 18, leading: 12 }));

  ops.push(...drawRect(server.x, server.y, server.w, server.h));
  ops.push(...drawLabelInRect(
    server,
    'Local Server\n(Node/Express)\n:3333',
    { size: 10.6, maxChars: 18, topPad: 16, leading: 11.8 },
  ));

  ops.push(...drawDataStoreShape(db));
  ops.push(...drawLabelInRect(db, 'SQLite\n+ JSON', { size: 9.6, maxChars: 10, topPad: 14, leading: 11 }));

  ops.push(...drawRect(phone.x, phone.y, phone.w, phone.h));
  ops.push(...drawLabelInRect(phone, 'Android Phone\n(USB connection)', { size: 11, maxChars: 22, topPad: 18, leading: 12 }));

  // Links (draw as paired arrows to mimic a double-headed arrow)
  const yA = actors.y + actors.h / 2;
  const yApp = app.y + app.h / 2;

  // Actors <-> App
  ops.push(...drawArrow(actors.x + actors.w, yA + 10, app.x, yApp + 10));
  ops.push(...drawArrow(app.x, yApp - 10, actors.x + actors.w, yA - 10));

  // Loopback <-> App (vertical)
  ops.push(...drawArrow(loopback.x + loopback.w / 2 - 12, loopback.y, app.x + app.w / 2 - 12, app.y + app.h));
  ops.push(...drawArrow(app.x + app.w / 2 + 12, app.y + app.h, loopback.x + loopback.w / 2 + 12, loopback.y));

  // Loopback <-> Server (diagonal like the sample)
  ops.push(...drawArrow(loopback.x + loopback.w, loopback.y + loopback.h / 2 + 10, server.x, server.y + server.h + 10));
  ops.push(...drawArrow(server.x, server.y + server.h - 10, loopback.x + loopback.w, loopback.y + loopback.h / 2 - 10));

  // Server <-> Database
  ops.push(...drawArrow(server.x + server.w, server.y + server.h / 2 + 10, db.x, db.y + db.h / 2 + 10));
  ops.push(...drawArrow(db.x, db.y + db.h / 2 - 10, server.x + server.w, server.y + server.h / 2 - 10));

  // App <-> Phone (USB)
  ops.push(...drawArrow(app.x + app.w / 2 - 14, app.y, phone.x + phone.w / 2 - 14, phone.y + phone.h));
  ops.push(...drawArrow(phone.x + phone.w / 2 + 14, phone.y + phone.h, app.x + app.w / 2 + 14, app.y));
  ops.push(...drawText(app.x + app.w / 2 - 14, 275, 'USB', 10));

  ops.push(...drawExplanationBox({
    x: 40,
    y: 20,
    w: 802,
    h: 105,
    title: 'Notes',
    bodyLines: [
      'The “Localhost” cloud represents loopback communication inside the same Windows machine.',
      'The local server provides the API used by the UI. Data is stored locally using JSON files and SQLite databases.',
      'The Android phone is connected via USB for diagnostics (ADB when enabled) and for USB-only evidence collection.',
    ],
  }));

  return { width: W, height: H, contentOps: ops };
}

function main() {
  const outDir = path.resolve(__dirname, '..', 'pdf', 'diagrams');
  fs.mkdirSync(outDir, { recursive: true });

  const pdfUseCase = buildPdf({ pages: [pageUseCase()], title: 'SmartHub Use Case Diagram' });
  const pdfDfd0 = buildPdf({ pages: [pageDfdLevel0()], title: 'SmartHub DFD Level 0' });
  const pdfDfd1 = buildPdf({ pages: [pageDfdLevel1()], title: 'SmartHub DFD Level 1' });
  const pdfDfd2 = buildPdf({ pages: [pageDfdLevel2()], title: 'SmartHub DFD Level 2 (P3)' });
  const pdfErd = buildPdf({ pages: [pageErd()], title: 'SmartHub ERD' });
  const pdfNetwork = buildPdf({ pages: [pageNetworkDiagram()], title: 'SmartHub Network Diagram' });
  const pdfDfdTextOnly = buildPdf({
    pages: [pageDfdTextLevel0(), pageDfdTextLevel1(), pageDfdTextLevel2()],
    title: 'SmartHub DFD Text Only (Level 0-2)',
  });

  fs.writeFileSync(path.join(outDir, 'use-case-diagram.pdf'), pdfUseCase);
  fs.writeFileSync(path.join(outDir, 'dfd-level0.pdf'), pdfDfd0);
  fs.writeFileSync(path.join(outDir, 'dfd-level1.pdf'), pdfDfd1);
  fs.writeFileSync(path.join(outDir, 'dfd-level2.pdf'), pdfDfd2);
  fs.writeFileSync(path.join(outDir, 'erd.pdf'), pdfErd);
  fs.writeFileSync(path.join(outDir, 'network-diagram.pdf'), pdfNetwork);
  fs.writeFileSync(path.join(outDir, 'dfd-text-only.pdf'), pdfDfdTextOnly);

  // Combined (4 pages)
  const pdfAll = buildPdf({
    pages: [pageUseCase(), pageDfdLevel0(), pageDfdLevel1(), pageDfdLevel2(), pageErd()],
    title: 'SmartHub Diagrams (All)',
  });
  fs.writeFileSync(path.join(outDir, 'all-diagrams.pdf'), pdfAll);

  // eslint-disable-next-line no-console
  console.log('Generated PDFs in:', outDir);
  console.log('- use-case-diagram.pdf');
  console.log('- dfd-level0.pdf');
  console.log('- dfd-level1.pdf');
  console.log('- dfd-level2.pdf');
  console.log('- erd.pdf');
  console.log('- network-diagram.pdf');
  console.log('- dfd-text-only.pdf');
  console.log('- all-diagrams.pdf');
}

main();
