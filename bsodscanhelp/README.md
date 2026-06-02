# SmartHub BSOD Scan Help (USB-only)

This folder is a **single place** for the "Blue / Blank Screen" (no-ADB) diagnostic plan, response schema, scoring rules, and technician UI copy.

## What’s in here

- `bsdscanhelp.txt` — practical help text + implementation plan.
- `planforBSoD.txt` — original longer plan draft.
- `schemas/connection-check-v2.json` — documented response shape for `/connection-check`.
- `scoring.md` — explainable rules for mapping signals to Part 1 categories.
- `test-matrix.md` — scenarios you can validate on real devices.
- `ui-copy.md` — wording for the technician UI (no security-bypass claims).

## How to use it (in the SmartHub app)

1. Connect the phone to the PC with a **known-good data cable**.
2. In SmartHub UI, open the **Diagnose BSOD (USB-only)** (or **Diagnose without debugging**) flow.
3. Let it run (the deeper check samples USB state over time).
4. Read:
   - ADB visibility
   - Fastboot visibility
   - MTP/Portable visibility (Windows)
   - “Most likely reasons (Part 1)” + confidence

### What “Part 1” means
The tool classifies into these shop-facing buckets:
- System Errors
- Application Conflicts
- Hardware Malfunction
- Overheating
- Insufficient Storage

USB-only cannot always prove the last 3 with high confidence; the UI should show conservative confidence and clear next steps.

## How to check OS corruption ("System Errors")

### What you can do with USB-only (no ADB)

You cannot read Android logs or file system state, so treat this as a **pattern-based** check:

- If **Fastboot is visible but ADB is not**
  - Likely: boot chain / firmware / failed OTA update / system partition issues.
  - Next: enter **Recovery mode** and look for mount/update errors.

- If Windows shows **EDL / QDLoader 9008** or **MTK Preloader/BROM/VCOM**
  - Likely: severe firmware/boot chain failure.
  - Next: use **authorized OEM service recovery workflows**.

- If USB is **unstable/flapping** during sampling
  - Do NOT conclude corruption immediately; fix cable/port/hub first.

### If ADB is available (debugging already enabled)

You can gather stronger evidence without bypassing security:

- Confirm the device is actually online: `adb devices -l` (state should be `device`)
- Check boot/verified-boot signals (availability varies by OEM):
  - `adb shell getprop ro.boot.verifiedbootstate`
  - `adb shell getprop ro.boot.vbmeta.device_state`
- Look for repeated system crashes in logs:
  - `adb logcat -d | more`
- If the device can reach recovery and ADB works there:
  - Capture recovery messages shown on-screen (technician notes).

SmartHub should still present this as **System Errors (OS/firmware)** with explainable reasons, not a guarantee.

## How to check 3rd-party apps ("Application Conflicts")

### What you can do with USB-only (no ADB)

USB-only cannot read installed apps. The best checks are **technician-confirmed**:

- Ask: "Did the problem start right after installing/updating an app?"
- Try **Safe Mode** (OEM-specific):
  - If Safe Mode boots and the issue improves, that is strong evidence for **Application Conflicts**.

In SmartHub’s **Diagnose BSOD (USB-only)** modal, tick:
- "Safe Mode boots and the issue improves" to allow **Application Conflicts** to reach **medium** confidence.
- If the device is stuck in fastboot/recovery/EDL, app conflicts are less likely than OS/firmware issues.

### If ADB is available (debugging already enabled)

- List third-party packages:
  - `adb shell pm list packages -3`
- Identify recent updates (best-effort):
  - `adb shell dumpsys package | more` (look for recently updated packages)
- Disable or uninstall a suspected package (requires user consent):
  - `adb shell pm uninstall --user 0 <package.name>`
  - or `adb shell pm disable-user --user 0 <package.name>`
- Reboot and retest.

SmartHub should keep **Application Conflicts** confidence conservative unless Safe Mode and/or logs support it.

## How to run the backend (dev)

From the repo root:
- `npm run dev`

If you run the compiled build:
- `npm run build`
- `node dist/server.js`

### If the backend fails to start with EADDRINUSE
That means **port 3333 is already in use** (another SmartHub backend instance is still running).
Stop the old instance, or close the SmartHub desktop app, then retry.

## Useful endpoints (for debugging)

- `GET http://localhost:3333/connection-check?deep=1&samples=30&delayMs=1500`
  - Returns ADB/Fastboot/MTP/USB-transport info plus `bsodAnalysis`.
  - The Part 1 classification is in `bsodAnalysis.part1`.

- `GET http://localhost:3333/screen-visual-check?samples=30&delayMs=500`
  - Optional camera-based analysis (no ADB required).

## Implementation pointers (where the code lives)

- Backend triage: `src/routes/noDebugRoutes.ts` (active `/connection-check` route used by the app)
- UI rendering: `js/ui.js` (`openNoDebugModal()` + `openQuickNoDebugModal()`)
- Optional camera helper: `bsod-diagnostic/phone_screen_diag.py`

## Standalone tools (optional, for dev sanity checks)

From the repo root:

- CLI quick triage (ADB/Fastboot visibility):
  - `python bsod-diagnostic/bsod_diag.py`
  - Notes: requires `adb` and `fastboot` available on `PATH`.

- Tiny GUI wrapper (same logic, Tkinter):
  - `python bsod-diagnostic/bsod_gui.py`

- Camera helper in JSON mode (used by `/screen-visual-check`):
  - `python bsod-diagnostic/phone_screen_diag.py --json-once`
  - Dependencies: `pip install opencv-python numpy`
