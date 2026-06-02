/*
  Generates a simple text-only PDF for Chapter 2 extra content.
  Output: pdf/chap2extra.pdf

  No external dependencies; minimal PDF writer similar to tools/generate_diagram_pdfs.js.
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

function pdfEscapeTextNoBackslash(s) {
  // Use when you intentionally include PDF escape sequences like \225.
  return String(s)
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

function drawText(x, y, text, { size = 11, font = 'F1', rawPdf = false } = {}) {
  const t = rawPdf ? pdfEscapeTextNoBackslash(text) : pdfEscapeText(text);
  return [
    'BT',
    `/${font} ${fmt(size)} Tf`,
    `${fmt(x)} ${fmt(y)} Td`,
    `(${t}) Tj`,
    'ET',
  ];
}

function estimateTextWidth(text, size) {
  // Rough width estimation for Helvetica-ish fonts.
  // Good enough to position mixed-font segments on the same line.
  return String(text || '').length * size * 0.52;
}

function setStrokeGray(g) {
  return [`${fmt(g)} G`];
}

function setLineWidth(w) {
  return [`${fmt(w)} w`];
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

function buildPdf({ pages, title }) {
  // pages: [{ width, height, contentOps: string[] }]
  const objects = [];
  const addObj = (str) => {
    objects.push(str);
    return objects.length; // 1-based
  };

  const fontRegularObjId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldObjId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageObjIds = [];
  for (const p of pages) {
    const stream = contentStream(p.contentOps);
    const contentId = addObj(
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`,
    );

    const pageId = addObj(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${fmt(p.width)} ${fmt(p.height)}] ` +
      `/Resources << /Font << /F1 ${fontRegularObjId} 0 R /F2 ${fontBoldObjId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R /Rotate 0 >>`,
    );
    pageObjIds.push(pageId);
  }

  const pagesObjId = addObj(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`,
  );

  for (const pageId of pageObjIds) {
    const idx = pageId - 1;
    objects[idx] = objects[idx].replace('/Parent 0 0 R', `/Parent ${pagesObjId} 0 R`);
  }

  const catalogObjId = addObj(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);
  const infoObjId = addObj(`<< /Title (${pdfEscapeText(title || 'chap2extra')}) >>`);

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

  // infoObjId is unused directly but keeps object numbering stable.
  void infoObjId;

  return pdf;
}

function makeChap2ExtraPages() {
  // A4 portrait
  const W = 595;
  const H = 842;

  const marginL = 56;
  const marginR = 56;
  const marginTop = 64;
  const marginBottom = 70;

  // Heuristic for wrapping in monospace-ish char count; Helvetica varies, but this is fine for a simple PDF.
  const usableW = W - marginL - marginR;
  const maxChars = Math.max(60, Math.min(95, Math.floor(usableW / 5.2)));

  const leading = 14;

  const pages = [];
  let ops = [];
  let y = H - marginTop;

  const newPage = () => {
    if (ops.length) pages.push({ width: W, height: H, contentOps: ops });
    ops = [];
    ops.push(...setLineWidth(1));
    ops.push(...setStrokeGray(0));
    y = H - marginTop;
  };

  const ensureSpace = (linesNeeded) => {
    const need = linesNeeded * leading;
    if ((y - need) < marginBottom) newPage();
  };

  const addHeading = (text, size = 13) => {
    ensureSpace(2);
    ops.push(...drawText(marginL, y, text, { size, font: 'F2' }));
    y -= leading * 1.2;
  };

  const addSubheading = (text) => {
    ensureSpace(2);
    ops.push(...drawText(marginL, y, text, { size: 12, font: 'F2' }));
    y -= leading * 1.1;
  };

  const addParagraph = (text) => {
    const lines = wrapText(text, maxChars);
    ensureSpace(lines.length + 1);
    for (const ln of lines) {
      ops.push(...drawText(marginL, y, ln, { size: 11, font: 'F1' }));
      y -= leading;
    }
    y -= leading * 0.7;
  };

  const addBulletList = (items) => {
    for (const item of (items || [])) {
      const s = String(item || '').trim();
      const colonIdx = s.indexOf(':');

      // Render a PDF-safe bullet. In WinAnsi, bullet is octal 225.
      // This avoids cases where Unicode bullet turns into a cent-sign-like glyph.
      const bulletPrefix = '\\225 ';

      if (colonIdx > 0) {
        const label = s.slice(0, colonIdx + 1).trim();
        const desc = s.slice(colonIdx + 1).trim();

        const firstLineAvail = Math.max(10, (maxChars - 4) - (label.length + 1));
        const descLines = wrapText(desc, firstLineAvail);
        const firstDesc = descLines[0] || '';
        const restDesc = descLines.slice(1).join(' ').trim();
        const restLines = restDesc ? wrapText(restDesc, maxChars - 4) : [];

        ensureSpace(1 + restLines.length + 1);

        // First line: bullet (regular) + label (bold) + description (regular)
        const baseX = marginL;
        const baseY = y;

        ops.push(...drawText(baseX, baseY, bulletPrefix, { size: 11, font: 'F1', rawPdf: true }));

        const xAfterBullet = baseX + estimateTextWidth('• ', 11);
        ops.push(...drawText(xAfterBullet, baseY, `${label} `, { size: 11, font: 'F2' }));

        const xAfterLabel = xAfterBullet + estimateTextWidth(`${label} `, 11);
        if (firstDesc) {
          ops.push(...drawText(xAfterLabel, baseY, firstDesc, { size: 11, font: 'F1' }));
        }

        y -= leading;

        // Continuation lines (indented), regular font.
        for (const ln of restLines) {
          ops.push(...drawText(marginL + 16, y, ln, { size: 11, font: 'F1' }));
          y -= leading;
        }
      } else {
        // Fallback: render as a normal bullet paragraph.
        const lines = wrapText(s, maxChars - 4);
        ensureSpace(lines.length + 1);
        ops.push(...drawText(marginL, y, `${bulletPrefix}${lines[0]}`, { size: 11, font: 'F1', rawPdf: true }));
        y -= leading;
        for (const ln of lines.slice(1)) {
          ops.push(...drawText(marginL + 16, y, ln, { size: 11, font: 'F1' }));
          y -= leading;
        }
      }
    }
    y -= leading * 0.7;
  };

  newPage();

  addHeading('CHAPTER 2 EXTRA', 15);
  addParagraph('This document provides additional Chapter 2 content using the same structure as the provided template, but rewritten to fit the SmartHub v5 system (an Android diagnostics workstation for repair shops).');

  addSubheading('Synthesis');
  addParagraph(
    'The review of related literature and studies suggests that day-to-day phone troubleshooting in small repair shops still depends heavily on manual checks, technician “gut feel,” and trial-and-error. When the steps are not standardized and evidence is not recorded, the same problem can be re-tested multiple times, service time becomes unpredictable, and it is harder to explain the diagnosis clearly to customers. '
    + 'Diagnostic platforms and workstation tools help reduce these issues by turning troubleshooting into a repeatable workflow: capture evidence in a consistent way, run checks in an ordered sequence, and summarize results in a format that can be reviewed and shared. '
    + 'In practice, systems like this work best when requirements are clearly defined, the interface is simple enough for busy technicians, and the backend is stable and easy to maintain. Iterative development (such as Scrum) also matters because Android devices change quickly across brands and OS versions, so the tool needs to improve based on real shop feedback. '
    + 'Local constraints—limited connectivity, privacy expectations, and cases where USB debugging is unavailable—shape the design as well. Offline storage and USB-only evidence collection make the system usable in common “no-debug” situations. '
    + 'Finally, usability testing and technician feedback provide a practical way to validate whether the system is helpful, reliable, and acceptable in real repair workflows. Overall, these findings support SmartHub v5 as an offline-first diagnostics workstation that helps technicians assess Android devices, generate evidence-based reports, and deliver more consistent service.'
  );

  addParagraph(
    'From a practical shop perspective, what matters most is not just finding the “right answer,” but finding it in a way that is repeatable, explainable, and safe. Customers often ask why a phone is failing, whether their data is at risk, and what steps were taken before recommending a repair or replacement. A diagnostic system that can capture connection logs, device identifiers, and a clear summary of observations helps build trust and reduces misunderstandings. '
    + 'At the same time, diagnostic tools must respect constraints that technicians face every day: locked devices, disabled debugging, different driver states on Windows, and the need to work quickly. SmartHub v5 is positioned as a tool that supports these realities by offering both deeper ADB-based checks (when allowed) and careful USB-only evidence collection when the device cannot be fully accessed.'
  );

  addParagraph(
    'Another common theme in the literature is that “good tooling” is not only about features, but also about usability and maintainability. A system that is hard to operate, too slow, or inconsistent in outputs will eventually be ignored, even if it is technically capable. For SmartHub v5, this means designing the UI so the next step is always obvious, the results are easy to interpret, and the overall workflow matches how technicians naturally think (identify the device, confirm stability, collect evidence, and produce a report).'
  );

  addSubheading('2.3 Technical Background');
  addParagraph(
    'Advancements in mobile computing and device management tools have changed how Android diagnostics can be done. A modern diagnostic workstation can combine evidence from several sources—device identification, connection stability, USB/driver signals, and (when allowed) ADB command outputs—to build a clearer picture of a phone’s condition. In many traditional repair workflows, technicians still depend on experience and repetitive manual testing, which is often time-consuming and hard to document. A dedicated diagnostic platform addresses this gap by providing guided checks, repeatable procedures, and consolidated results.'
  );

  addParagraph(
    'In Android diagnostics, the availability of evidence depends on permissions and device state. When USB debugging is enabled and the device is authorized, ADB can provide useful system information (for example, device properties, logs, and package/system signals). However, many real cases—especially in customer-facing repair settings—do not allow ADB access: the phone may be locked, the screen may be broken, the user may not have enabled developer options, or the device may be unstable and repeatedly disconnect. '
    + 'Because of this, a practical workstation tool must also support “no-debug” evidence pathways. Windows itself provides signals through USB enumeration and PnP events. While these signals are not as detailed as ADB, they can still be valuable for basic triage, identifying the connection pattern, and documenting what the technician observed.'
  );

  addParagraph(
    'SmartHub v5 takes this mixed-evidence reality seriously. Instead of relying on one single diagnostic technique, it supports multiple modes and then consolidates results into a single report. This helps technicians avoid switching between many separate tools and reduces the risk of missing key details during the troubleshooting process.'
  );
  addParagraph(
    'SmartHub v5 is designed as a local diagnostic workstation that supports both ADB-based diagnostics (when USB debugging is available) and USB-only/no-debug triage for devices with blue/blank/broken screens or restricted access. Through the system, technicians can run checks, capture evidence, and export results in a consistent format. By combining local tools with offline storage, SmartHub v5 aims to improve diagnostic speed, clarity of findings, and consistency of reporting in a repair-shop environment.'
  );

  addSubheading('Technicality of the Project');
  addParagraph(
    'SmartHub v5 is built around a technician-centered workflow. The application runs on a Windows workstation and provides a desktop UI that guides the technician through connection checks, diagnostic selection, evidence capture, and results generation. The architecture is intentionally local-only to reduce privacy risks and to keep the tool usable even when Internet access is unavailable.'
  );

  addParagraph(
    'At a high level, SmartHub v5 can be viewed as three cooperating parts on the same workstation: (1) a desktop shell that hosts the UI, (2) a local service that runs the diagnostic logic and coordinates tool execution, and (3) local storage where outputs, history, and optional AI memory are saved. Keeping these parts separate improves maintainability: the UI can focus on guiding the user, while the backend can focus on executing checks safely and returning structured results.'
  );
  addParagraph(
    'The diagnostic workflow starts by identifying connected devices and checking connection stability. From there, the technician chooses the most appropriate path based on the phone’s state and permissions: an ADB-based mode for deeper evidence collection, or a USB-only/no-debug mode that focuses on host-side USB/PnP signals and other safe, observable indicators. For devices with display issues, an optional camera-based visual check can help confirm on-screen behavior without requiring the device to be unlocked. The system then consolidates the evidence into a structured report that the technician can review and explain to the customer.'
  );

  addParagraph(
    'In ADB mode, the system can run a curated set of commands and checks intended for diagnostics and evidence collection, then summarize what was found. In USB-only mode, the system focuses on what can be observed without bypassing security: connection patterns, device appearance to the host, and other host-side evidence. The key principle is safety and transparency—SmartHub v5 is designed to document what it can legitimately observe and to avoid steps that would require unauthorized access.'
  );
  addParagraph(
    'To support consistency over time, SmartHub v5 can store diagnostic history and an optional offline AI “memory” of previous cases. This allows the system to suggest likely causes or next steps based on similar evidence patterns seen before. All stored data stays on the workstation (JSON files and SQLite databases), which supports offline use and simplifies deployment in small repair shops.'
  );

  addParagraph(
    'In addition to helping technicians during a single session, stored history supports learning and quality control. Over time, the shop can review recurring issues (for example, connection failures tied to specific cables, ports, or device families) and improve their standard process. Even when the offline AI component is not used, a consistent history of runs makes it easier to compare “before and after” behaviors and to keep a record of what was done for each case.'
  );

  addSubheading('Details of the Technology to be Used');
  addParagraph(
    'SmartHub v5 uses a desktop-and-local-service architecture. The goal is to keep all processing on the technician workstation while still separating the user interface from the diagnostic logic. The Windows desktop shell hosts a local web-based UI, and a local backend service coordinates diagnostics, evidence collection, and storage.'
  );

  addParagraph(
    'This design is practical for repair shops because it reduces deployment complexity: there is no separate cloud server to maintain, and the system remains usable even in limited-connectivity environments. It also improves privacy by keeping diagnostic evidence and customer-related device details on the local machine by default.'
  );

  addBulletList([
    'WPF + WebView2: Hosts the SmartHub desktop app and renders the local HTML/CSS/JS UI reliably on Windows. This provides a familiar desktop application experience while allowing fast UI iteration.',
    'HTML/CSS/JavaScript: Implements the UI, guided diagnostic flows, and interactive display of results. The interface is designed to be readable and easy to follow during real repair work.',
    'Node.js + Express + TypeScript: Runs the local backend service and REST endpoints (e.g., http://localhost:3333) used by the UI to trigger checks and retrieve outputs. TypeScript improves maintainability by keeping data formats consistent across the app.',
    'Android platform-tools (ADB/Fastboot): Provides command-line tools for collecting device information and evidence when USB debugging is enabled, plus limited supported operations in other modes. These tools are widely used and well-documented in Android servicing.',
    'Python 3 (optional helpers): Enables offline-only utilities such as camera-based screen checking and offline AI suggestion logic for specific no-debug cases. Python is practical for quick experimentation on image and text evidence processing.',
    'SQLite + JSON (local storage): Stores diagnostic history, configuration, run outputs, and offline AI memory (e.g., memory.sqlite and adb_ai_memory.sqlite) without requiring a cloud database. Local storage supports offline operation and reduces privacy exposure.',
  ]);

  addParagraph(
    'The local storage strategy is intentionally simple: JSON works well for structured run summaries and exports, while SQLite is useful when the system needs indexing, searching, or “memory” behavior over many cases. This combination allows SmartHub v5 to remain lightweight while still supporting growth in the amount of stored diagnostic history.'
  );

  addParagraph(
    'In terms of development methodology, SmartHub v5 follows the Scrum framework. Work is organized into sprints with planning, implementation, review, and retrospective cycles. This approach is practical for diagnostics because device behavior varies across brands and OS versions, and technician feedback can be turned into improvements to usability and reporting without long delays.'
  );

  addParagraph(
    'In each sprint, the team can focus on a small set of improvements—such as refining connection checks, improving the clarity of a report section, or adding safer evidence capture for no-debug scenarios. Sprint reviews provide a checkpoint for validating that new behavior is correct and understandable, while retrospectives help identify what slowed the team down (for example, unclear requirements, missing test devices, or confusing UI steps) so that the next sprint can run more smoothly.'
  );

  // Push last page
  if (ops.length) pages.push({ width: W, height: H, contentOps: ops });
  return pages;
}

function main() {
  const outDir = path.resolve(__dirname, '..', 'pdf');
  fs.mkdirSync(outDir, { recursive: true });

  const pages = makeChap2ExtraPages();
  const pdf = buildPdf({ pages, title: 'chap2extra' });
  const outPath = path.join(outDir, 'chap2extra.pdf');
  fs.writeFileSync(outPath, pdf);

  // eslint-disable-next-line no-console
  console.log('Wrote:', outPath);
}

main();
