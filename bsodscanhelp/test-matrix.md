# Test Matrix (No-Debug / BSOD USB-only)

Use this to validate the no-ADB BSOD triage on real devices.

## Legend

- **ADB**: `adb devices -l`
- **FB**: `fastboot devices`
- **MTP**: Windows Portable/WPD devices detected
- **Transport**: Windows USB transport devices (VID/PID + status)
- **Unstable**: `hostUsb.sample.anyChange = true`

## Scenarios

### 1) Normal consumer phone (USB debugging OFF, screen OK)
- ADB: none
- FB: none
- MTP: yes
- Expected Part 1: Hardware Malfunction (low/medium) OR ambiguous
- Note: This is a limitation of USB-only; the UI must not claim a definite fault.

### 2) Screen is black/blue but phone is running (notifications/vibration)
- ADB: yes (`device`) if debugging was enabled earlier
- FB: no
- MTP: maybe
- Expected Part 1: Hardware Malfunction (medium)

### 3) Bootloader-only device (cannot boot Android)
- ADB: none
- FB: yes
- MTP: no
- Expected Part 1: System Errors (medium)

### 4) Boot loop (connect/disconnect repeatedly)
- ADB: usually none
- FB: maybe intermittent
- MTP: usually none
- Unstable: yes
- Expected Part 1: System Errors or Hardware Malfunction (medium/high depending on mode)

### 5) Qualcomm EDL / 9008
- Transport: QDLoader / 9008 visible
- ADB: none
- FB: none
- MTP: none
- Expected Part 1: System Errors (high)

### 6) MTK Preloader / BROM
- Transport: Preloader/BROM/VCOM visible
- ADB: none
- FB: none
- MTP: none
- Expected Part 1: System Errors (high)

### 7) Bad cable / USB hub causing enumeration errors
- Transport: status not OK OR “Unknown USB Device”
- Unstable: yes
- Expected Part 1: Hardware Malfunction (medium), but UI should recommend fixing cable/port first.

### 8) OS corruption after OTA update (boots to fastboot / recovery)
- ADB: none
- FB: yes (often stable)
- MTP: no
- Expected Part 1: System Errors (medium)
- Technician confirmation: recovery shows "failed to mount /system" or update verification failures.

### 9) 3rd-party app conflict (Safe Mode improves)
- ADB: optional (only if debugging was already enabled)
- FB: no
- MTP: yes (often)
- Expected Part 1: Application Conflicts (low by USB-only; medium if Safe Mode confirmed)
- Technician confirmation: device boots in Safe Mode and the issue is reduced; uninstall/disable the last installed app and retest.

## Validation notes

- Always try a second known-good cable/port before concluding software.
- Record the tool output plus the actual confirmed repair cause.
