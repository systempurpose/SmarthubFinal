# UI Copy (Technician-facing, safe)

This is suggested wording for the no-debug / BSOD triage UI.

## Always-visible disclaimer

- "This check uses **USB-only** signals and (optional) camera hints. Without USB debugging, we cannot read logs or verify storage/app state. Results include a confidence level and recommended next steps."

## Section: Connection status

- **ADB**
  - "Visible to ADB" / "Not detected" / "Error running adb"

- **Fastboot**
  - "Visible in bootloader (fastboot)" / "Not detected" / "Error running fastboot"

- **MTP / Portable** (Windows)
  - "Detected as portable/MTP" / "Not detected" / "Driver/enumeration error"

## Section: Most likely reasons (Part 1)

Use exactly these labels:
- System Errors
- Application Conflicts
- Hardware Malfunction
- Overheating
- Insufficient Storage

### Confidence labels
- High: "Multiple independent signals agree."
- Medium: "One strong signal + supporting hints."
- Low: "Not enough evidence. Follow next steps to confirm."

## Next steps (examples)

- If nothing detected: "Try a known-good data cable and a direct USB port. Avoid hubs."
- If fastboot-only: "Device is not booting Android. Try recovery mode; consider firmware repair (authorized tools)."
- If MTP-only: "Phone is alive but not debuggable. If screen is blank, test with a known-good display assembly."
- If EDL/Preloader: "Device is in low-level mode; ADB/fastboot won’t work. Use authorized OEM service recovery workflows."

## Extra checks (technician-confirmed)

- OS / firmware corruption checks
  - "If the phone only shows up in fastboot/bootloader and never boots Android, suspect OS/firmware corruption. Try Recovery mode and note any mount/update errors."

- 3rd-party app conflict checks
  - "If the phone can boot into Safe Mode and the problem improves, suspect a 3rd-party app conflict. Uninstall or disable the last installed app and retest."

## Forbidden claims

Never claim:
- "We can enable USB debugging remotely"
- "We can bypass lockscreen/encryption"
- "We can extract data without consent"
