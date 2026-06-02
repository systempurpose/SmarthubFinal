/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const PLAN_PATH = path.join(__dirname, '..', 'bsodscanhelp', 'diagbsodnewinvent.txt');

const HEADER = 'EVIDENCE MISSING KEYS (EXACT) — WHAT THEY MEAN / HOW TO SATISFY';

const PHASE4_DONE_HEADER = 'DONE (DATA-VALIDATED) WHEN';

const BLOCK_LINES = [
  '',
  HEADER,
  '- `camera_normal_stable`',
  '  - Run the camera-based check with stable framing + visible content so the tool can deterministically confirm “not BSOD-style” when applicable.',
  '- `repair_confirmed_screen_fixed`',
  '  - Technician action: known-good screen test fixed the issue (Advanced checkbox).',
  '- `works_on_other_pc_confirmed`',
  '  - Technician action: works on another known-good PC/cable (Advanced checkbox).',
  '  - Note: Phase 4 requires additional host-side support to actually VERIFY host-usb (e.g., `host_problem_code_present` and/or `usb_flapping_detected`).',
  '- `safe_mode_confirmed`',
  '  - Technician action: Safe Mode improves the issue (Advanced checkbox).',
  '  - Only eligible to VERIFY when the model agrees (software/firmware + incompatible-apps bucket).',
  '- `adb_online`',
  '  - Device-side support for Safe Mode verification: ensure ADB can see the device (USB debugging authorized) so the tool has an independent second signal.',
  '- `adb_log_evidence_present`',
  '  - Collect a minimal logcat slice (read-only) so the tool can corroborate app/boot-loop patterns.',
  '- `oem_flash_tool_corruption_confirmed`',
  '  - Technician action: OEM flash tool reported partition/verity/corruption failure (Advanced checkbox).',
  '  - Only eligible to VERIFY when the model agrees (software/firmware + corrupt-files or faulty-updates bucket).',
  '- `fastboot_visible`',
  '  - Independent mode support for OEM-flash verification: ensure the device is visible in fastboot mode.',
  '- `fastboot_getvar_collected`',
  '  - In fastboot mode, collect `fastboot getvar all` (read-only) so corruption/slot/update context can be included as corroborating evidence.',
  '- `host_problem_code_present`',
  '  - Host-side evidence: Windows Device Manager / PnP indicates a problem (ProblemCode like 10/43), used to support host-usb verification.',
  '- `usb_flapping_detected`',
  '  - Host-side evidence: repeated disconnect/reconnect during deep sampling, used to support host-usb verification.',
  '',
];

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function ensureBlock(text) {
  if (text.includes(HEADER)) return { text, changed: false };

  // Preferred insertion point: immediately after the OEM flash hardening bullet.
  const needle = '    - an independent mode signal exists (`fastboot_visible` and/or `fastboot_getvar_collected`).';
  const idx = text.indexOf(needle);
  const eol = detectEol(text);
  const block = BLOCK_LINES.join(eol);

  if (idx >= 0) {
    const insertAt = idx + needle.length;
    const updated = text.slice(0, insertAt) + block + text.slice(insertAt);
    return { text: updated, changed: true };
  }

  // Fallback: append at end.
  const updated = text.trimEnd() + block;
  return { text: updated, changed: true };
}

function ensurePhase4Done(text) {
  if (text.includes(PHASE4_DONE_HEADER)) return { text, changed: false };

  const needle = 'STATUS (IMPLEMENTED — code/UI/metrics)';
  const idx = text.indexOf(needle);
  const eol = detectEol(text);

  const block = [
    '',
    PHASE4_DONE_HEADER,
    '- The Offline metrics Phase 4 gate shows PASS.',
    '  - This gate uses a conservative 95% upper bound on false-VERIFIED rate.',
    '  - It flips automatically once enough VERIFIED-only labeled cases exist and the bound is below the target.',
    '',
  ].join(eol);

  if (idx >= 0) {
    // Insert after the status header block.
    const insertAt = idx + needle.length;
    const updated = text.slice(0, insertAt) + block + text.slice(insertAt);
    return { text: updated, changed: true };
  }

  const updated = text.trimEnd() + block;
  return { text: updated, changed: true };
}

function main() {
  let original;
  try {
    original = fs.readFileSync(PLAN_PATH, 'utf8');
  } catch (e) {
    console.error(`[ensure_diagbsod_plan] Plan file not found: ${PLAN_PATH}`);
    process.exitCode = 1;
    return;
  }

  let updated = original;
  let changed = false;

  // Ensure the evidence-missing key map exists.
  {
    const r = ensureBlock(updated);
    updated = r.text;
    changed = changed || r.changed;
  }

  // Ensure Phase 4 has a concrete data-validation done condition.
  {
    const r = ensurePhase4Done(updated);
    updated = r.text;
    changed = changed || r.changed;
  }

  if (!changed) {
    console.log('[ensure_diagbsod_plan] OK (no changes)');
    return;
  }

  fs.writeFileSync(PLAN_PATH, updated, 'utf8');
  console.log('[ensure_diagbsod_plan] Updated diagbsodnewinvent.txt');
}

main();
