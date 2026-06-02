# Bsod tools

This folder contains optional host-side tools that enhance the **USB-only** Android “BSoD” diagnosis accuracy on Windows.

## Tools

### UsbEvidenceHelper (C# / .NET)

- Purpose: Collect deeper Windows USB/PnP evidence than PowerShell `Get-PnpDevice` alone (instance IDs, hardware IDs, compatible IDs, problem codes, driver key, location info, and basic parent chain).
- Output: JSON on stdout.
- Integration: The Node backend will **auto-use** the helper if the EXE exists at:
  - `Bsod tools/bin/UsbEvidenceHelper.exe`
  - When used, the output is merged into the `/connection-check` response under `hostUsb.nativeUsbEvidence`.

## Build (Windows)

- Requires: .NET SDK (recommended .NET 8)
- Build/publish a single EXE:

```powershell
cd "Bsod tools"
.\build-usb-helper.ps1
```

This writes `Bsod tools/bin/UsbEvidenceHelper.exe`.

### UsbEventLogHelper (Rust)

- Purpose: Summarize recent Windows Event Log USB/PnP warnings/errors (host-side instability signals).
- Output: JSON on stdout.
- Integration: The Node backend can auto-use the helper if the EXE exists at:
  - `Bsod tools/bin/UsbEventLogHelper.exe`

Build:

```powershell
cd "Bsod tools\UsbEventLogHelperRust"
.\build.ps1
```

Copy the resulting `target\release\usb_eventlog_helper.exe` to `Bsod tools/bin/UsbEventLogHelper.exe`.

### UsbPnpSnapshot (C++)

- Purpose: Snapshot present Windows PnP devices with ConfigMgr problem codes (host-side driver/enumeration signals).
- Output: JSON on stdout.
- Integration: The Node backend can auto-use the helper if the EXE exists at:
  - `Bsod tools/bin/UsbPnpSnapshot.exe`

Build:

See `Bsod tools/UsbPnpSnapshotCpp/README.md`.
