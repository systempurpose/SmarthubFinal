# UsbEventLogHelperRust

Optional helper that summarizes recent Windows USB/PnP-related warnings/errors from the Windows Event Log.

- Output: JSON on stdout
- Intended use: SmartHub `/connection-check` can run this tool (best-effort) and attach the result as extra host-side evidence.

## Build

Requires Rust toolchain on Windows.

```powershell
cd "Bsod tools\UsbEventLogHelperRust"
cargo build --release
```

The built binary will be at:

- `target/release/usb_eventlog_helper.exe`

## Run

```powershell
.	arget\release\usb_eventlog_helper.exe --minutes 60 --max 120
```
