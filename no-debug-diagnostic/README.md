# No-USB-Debugging Diagnostics

This folder documents and groups the pieces used to diagnose phones **without USB debugging enabled**, especially for broken / blue / blank screens.

Start here for the system map and main flows:

- `docs/README.md`
- `docs/ARCHITECTURE.md`

## Server endpoints

- `GET /connection-check`
  - Runs host-side ADB and fastboot checks.
  - Queries Windows for MTP / Portable devices via PowerShell.
  - Optional: `GET /connection-check?deep=1`
    - Re-samples Windows portable/WPD device visibility multiple times to detect flaky enumeration (disconnect/reconnect during the check).
    - Returns `hostUsb.sample { count, delayMs, anyChange }`.
    - Optional tuning (accuracy vs speed):
      - `GET /connection-check?deep=1&samples=30&delayMs=1500`
      - Higher values take longer but catch unstable USB.
  - Produces `summary` and `bsodAnalysis { category, confidence, reasons[] }` used to classify likely causes:
    - Display / connector / panel vs.
    - Software / firmware vs.
    - Power / mainboard / unknown.
    - Also detects host-side driver/enumeration issues when Windows sees a portable/WPD device but its status is not OK.
- `GET /screen-visual-check`
  - Uses `bsod-diagnostic/phone_screen_diag.py` with the PC webcam.
  - Requires a working Python 3.8+ and the packages in `bsod-diagnostic/requirements.txt` (opencv-python, numpy).
    - Install (example): `python -m pip install -r bsod-diagnostic/requirements.txt`
    - If multiple Pythons exist on the PC (or the default `python` is a stub), set `SMART_HUB_PYTHON_EXE` to a full path like `C:\Path\To\python.exe`.
  - Analyses a live camera frame of the phone display for:
    - Cracks / strong line artifacts
    - Banding / dead rows
    - Edge shadow / uneven backlight
  - Returns JSON `{ ok, analysis }` consumed by the quick no-debug UI.
  - Optional tuning (more accurate = more frames):
    - `GET /screen-visual-check?samples=30&delayMs=500`
- `POST /launch-bsod-gui`
  - Launches the optional Windows BSOD helper GUI from `bsod-diagnostic/bsod_gui.py`.

## Frontend entry points

These live in `js/ui.js` and are wired from `html/ui.html`:

- `openNoDebugModal()`
  - Full "Screen / Boot / No-debug" view driven by `/connection-check`.
- `openQuickNoDebugModal()`
  - Lightweight host-only triage that calls **both** `/connection-check` and `/screen-visual-check`.
  - It is intentionally **not instant**: the default configuration runs deep USB sampling + multiple camera frames for accuracy, which can take ~30–90 seconds depending on the PC.

## Python helpers (visual screen analysis)

Located in the existing [`bsod-diagnostic`](../bsod-diagnostic) folder:

- `phone_screen_diag.py`
  - Implements the `--json-once` camera-based screen analysis used by `/screen-visual-check`.
- `bsod_gui.py`
  - Optional standalone desktop GUI for more advanced BSOD / boot diagnostics.

## Design notes

- These diagnostics are designed to work **without** USB debugging, prioritising cases where the screen is broken, blue, or blank.
- Classification is based on a combination of:
  - What the PC can see (ADB / fastboot / MTP), and
  - What the camera sees on the phone display.
- Accuracy is preferred over speed: checks may take a bit longer, but the UI now reflects real data instead of artificial loading timers.

## Scope / safety boundary

- SmartHub's "no-debug" diagnostics are **detection + classification** only.
- The tool may identify low-level USB modes (e.g. Qualcomm EDL/9008, MediaTek preloader/BROM, Apple DFU/Recovery) by reading what Windows enumerates.
- SmartHub **does not** perform raw flashing, exploit-based access, boot ROM protocol handshakes, or any bypass of device security.
  - If a device is in a low-level recovery mode, recovery should be done with authorised OEM procedures/tools appropriate for that model and ownership context.

## Response shape (useful fields)

`/connection-check` returns these best-effort fields:

- `adb.devices[]`: from `adb devices -l`
- `fastboot.devices[]`: from `fastboot devices`
- `hostUsb.portableDevices[]` (Windows only):
  - `name` (FriendlyName)
  - `status` (OK / Error / Unknown)
  - `class` (e.g. Portable / WPD)
  - `instanceId` (helps identify the device in Device Manager)
  - `problemCode` (when available)
- `hostUsb.transportDevices[]` (Windows only):
  - A filtered list of present USB devices that can reveal low-level modes (EDL/9008, MTK preloader/BROM) or USB driver/enumeration errors even when MTP is empty.
  - Same fields as above, plus best-effort `vid`/`pid` parsed from `instanceId`.
  - Non-exhaustive vendor hints (best-effort):
    - Qualcomm often enumerates with `vid=05C6` (EDL/9008 often appears as `pid=9008`)
    - MediaTek often enumerates with `vid=0E8D`
    - Apple often enumerates with `vid=05AC`
    - Samsung often enumerates with `vid=04E8`
- `hostUsb.sample` (only when `deep=1`): indicates whether the portable device set changed across samples
