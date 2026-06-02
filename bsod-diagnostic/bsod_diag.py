import subprocess
import json
from typing import Dict, Any, List


def _run(cmd: List[str]) -> Dict[str, Any]:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return {
            "code": proc.returncode,
            "stdout": (proc.stdout or "").strip(),
            "stderr": (proc.stderr or "").strip(),
        }
    except FileNotFoundError as e:
        # Tool (adb/fastboot) not installed or not on PATH
        return {"code": -1, "stdout": "", "stderr": str(e)}


def detect_adb() -> Dict[str, Any]:
    out = _run(["adb", "devices"])
    if out["code"] != 0:
        return {"ok": False, "error": out["stderr"] or out["stdout"], "devices": []}

    lines = [l.strip() for l in out["stdout"].splitlines()[1:] if l.strip()]
    devices: List[Dict[str, str]] = []
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            devices.append({"id": parts[0], "state": parts[1]})
    return {"ok": True, "devices": devices}


def detect_fastboot() -> Dict[str, Any]:
    out = _run(["fastboot", "devices"])
    if out["code"] != 0:
        return {"ok": False, "error": out["stderr"] or out["stdout"], "devices": []}

    devices: List[str] = []
    for line in out["stdout"].splitlines():
        line = line.strip()
        if not line or "devices" in line.lower():
            continue
        parts = line.split()
        if parts:
            devices.append(parts[0])
    return {"ok": True, "devices": devices}


def classify_bsod() -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "adb": None,
        "fastboot": None,
        "summary": "",
        "detail": "",
    }

    adb = detect_adb()
    fb = detect_fastboot()
    result["adb"] = adb
    result["fastboot"] = fb

    adb_devices = adb.get("devices") or []
    fb_devices = fb.get("devices") or []

    if adb.get("ok") and adb_devices:
        # Device visible to ADB: OS or recovery is at least partially alive
        first = adb_devices[0]
        dev_label = f"{first.get('id')} ({first.get('state')})"
        result["summary"] = (
            "Device is visible to ADB. Even if the screen is blue/black, "
            "the main board and system are responding."
        )
        result["detail"] = (
            f"Example device: {dev_label}. This usually indicates a software problem "
            "(system crash, boot loop) or a display/touch issue, not a dead main board."
        )
    elif fb.get("ok") and fb_devices:
        # Only fastboot: bootloader alive, Android not booting fully
        first = fb_devices[0]
        result["summary"] = (
            "Device is only visible in fastboot/bootloader mode. Android is not booting fully."
        )
        result["detail"] = (
            f"Example fastboot device: {first}. This often means a failed update, "
            "corrupt system/boot partition, or a secure boot / verification error."
        )
    elif not adb.get("ok") and isinstance(adb.get("error"), str) and adb["error"]:
        # adb tool itself failed
        result["summary"] = (
            "ADB tool is not available or failed to run. Cannot diagnose without platform tools."
        )
        result["detail"] = (
            "adb error: " + str(adb["error"])
        )
    elif not fb.get("ok") and isinstance(fb.get("error"), str) and fb["error"]:
        # fastboot tool failed but adb also sees nothing
        result["summary"] = (
            "No device detected via ADB, and fastboot tool failed."
        )
        result["detail"] = (
            "fastboot error: " + str(fb["error"])
        )
    else:
        # Neither adb nor fastboot sees anything
        result["summary"] = (
            "No device detected via ADB or fastboot. If the phone still vibrates, "
            "plays sounds, or shows a vendor logo, this points to deeper hardware issues "
            "(main board, power, USB port, or display path)."
        )
        result["detail"] = (
            "If the phone shows absolutely no signs of life and never appears as any USB device, "
            "treat it as a likely board-level or power failure rather than a simple software crash."
        )

    return result


def main() -> None:
    info = classify_bsod()
    print("=== Mobile BSOD Triage ===")
    print(info["summary"])
    if info.get("detail"):
        print("\n" + info["detail"])

    # Also print raw info as JSON for logging / further tools
    print("\n--- Raw data (JSON) ---")
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
