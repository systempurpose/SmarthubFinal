# Scoring / Mapping Rules (Explainable)

This document explains how SmartHub maps **USB-only + pre-boot signals** into the Part 1 categories:

- System Errors
- Application Conflicts
- Hardware Malfunction
- Overheating
- Insufficient Storage

## Important limitations

- USB-only cannot reliably read: Android logs, storage free space, installed apps, or temperature sensors.
- Because of that, **Application Conflicts**, **Overheating**, and **Insufficient Storage** should usually stay **low confidence** unless there are multiple independent hints (e.g., camera OCR + repeated boot behavior).

## Current high-signal mapping (what we can infer strongly)

### 1) ADB visible (device responds over ADB)

Signal
- `/connection-check` returns at least one ADB device.

Mapping
- Part 1 category: **Hardware Malfunction** (often display/connector/backlight path)
- Confidence: **medium** if ADB state is `device`, else **low**.

Reasoning
- If Android is online enough for ADB, the OS and main board are usually alive.
- A blue/blank screen while the device otherwise runs often points to a hardware/display path fault.

### 2) Fastboot-only (Android not booted)

Signal
- `fastboot devices` returns a device, but ADB is empty.

Mapping
- Part 1 category: **System Errors**
- Confidence: **medium**; **high** if USB is unstable/flapping (boot loop behavior).

Reasoning
- Boot chain/system corruption, failed update, or firmware problems commonly leave the device stuck in bootloader.

### 3) MTP/Portable visible (Windows sees phone storage)

Signal
- Windows `Portable/WPD` device is present (MTP), but ADB is empty.

Mapping
- Part 1 category: **Hardware Malfunction**
- Confidence: **medium**

Reasoning
- The phone is alive enough to expose MTP. If screen is blue/blank, display assembly/connector is a common root cause.

### 4) Transport-level “EDL / Preloader” modes

Signal
- Windows transport devices indicate Qualcomm EDL/9008 or MTK Preloader/BROM.

Mapping
- Part 1 category: **System Errors**
- Confidence: **high**

Reasoning
- Android is not booted and ADB/fastboot won’t work in these modes.
- These are consistent with severe firmware/boot chain failures; hardware/storage failure may also be involved.

### 5) Unstable USB or unhealthy device status

Signal
- `hostUsb.sample.anyChange = true` or transport device `status != OK`.

Mapping
- Part 1 category: **Hardware Malfunction**
- Confidence: **medium**

Reasoning
- Flapping enumeration is common with bad cable/port/hub or intermittent power/USB port damage.

### 6) Bsod tools helper evidence (Windows host-side)

Signal
- `UsbEvidenceHelper.exe` reports phone-like devices with ConfigMgr problem codes.
- `UsbEventLogHelper.exe` reports recent USB/PnP warnings or reset/enumeration failures.
- `UsbPnpSnapshot.exe` reports phone-like devices with problem codes.

Mapping
- If two or more helpers agree, prefer **host USB driver / enumeration issue** in the detailed explanation.
- In Part 1, keep confidence conservative and explain that the evidence points to a **PC-side USB problem**, not a confirmed phone-side BSOD cause.

Reasoning
- These helpers are strongest for ruling out false phone faults.
- They improve accuracy by separating:
	- real low-level phone modes (EDL / Preloader / boot failure)
	- from Windows driver/enumeration trouble on the technician PC.

## Low-signal mapping (keep conservative)

### Application Conflicts
Only elevate if you have extra evidence, e.g.
- Camera OCR suggests security warnings or crash screens, AND
- Connection pattern suggests Android boots partially (MTP present / intermittent), AND
- Technician history reports "after installing app".

Stronger evidence ladder (preferred order)
- **Safe Mode improves the issue** (technician-confirmed) → confidence can rise to **medium**.
- **ADB available + logs show app crash loops** (e.g., repeated app ANRs) → confidence can rise to **medium/high**.

USB-only notes
- USB-only cannot enumerate installed apps. Without Safe Mode confirmation or logs, keep confidence **low**.

### Overheating
Best evidence is camera OCR:
- Screen shows “overheating / temperature / too hot”.

### Insufficient Storage
USB-only cannot see free storage. Treat as hypothesis when:
- Boot failures follow updates, AND
- Device shows bootloader-only behavior, OR
- Recovery logs (technician-reported) mention `/data` mount failures.

## OS corruption vs “System Errors” (clarification)

In this tool, **System Errors** includes:
- OS/firmware corruption (failed OTA, broken /system, verified boot failures)
- Boot chain issues (bootloop to fastboot)
- Low-level modes (EDL/Preloader)

Evidence ladder
- EDL/Preloader detected → **high confidence** System Errors
- Fastboot-only (no ADB) → **medium confidence** System Errors
- Recovery shows mount/update errors (technician-confirmed) → can raise confidence

USB-only notes
- USB-only cannot read partitions or fsck results. Present as "likely" with reasons + next steps.

## Where this is implemented

- Backend response: `src/routes/noDebugRoutes.ts` (`/connection-check`)
- UI interpretation: `js/ui.js` (quick no-debug scoring)
