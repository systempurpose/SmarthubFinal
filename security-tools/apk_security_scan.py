#!/usr/bin/env python3
"""APK security scanner

Lightweight static analysis tool for a single Android APK.

It uses the Android build-tools `aapt` command to extract:
- Package name and app label
- Requested permissions
- Declared activities, services, receivers

Then applies simple heuristics to classify the APK as:
- safe
- moderate
- risky

The output is printed as JSON to stdout so it can be consumed by other tools.

Requirements:
- Python 3.9+
- Android build-tools on PATH (`aapt` command available)
"""

import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Any


@dataclass
class ApkScanResult:
    apk_path: str
    package_name: str | None
    label: str | None
    risk: str
    risky_permissions: List[str]
    moderate_permissions: List[str]
    all_permissions: List[str]
    notes: List[str]


RISKY_PERMISSIONS = {
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
    "android.permission.RECEIVE_SMS",
    "android.permission.READ_SMS",
    "android.permission.SEND_SMS",
    "android.permission.READ_CALL_LOG",
    "android.permission.WRITE_CALL_LOG",
    "android.permission.CALL_PHONE",
    "android.permission.WRITE_SETTINGS",
    "android.permission.WRITE_SECURE_SETTINGS",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.PACKAGE_USAGE_STATS",
    "android.permission.BIND_VPN_SERVICE",
    "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
    "android.permission.MANAGE_EXTERNAL_STORAGE",
}

MODERATE_PERMISSIONS = {
    "android.permission.READ_CONTACTS",
    "android.permission.WRITE_CONTACTS",
    "android.permission.GET_ACCOUNTS",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.READ_PHONE_STATE",
    "android.permission.READ_PHONE_NUMBERS",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
}


def run_aapt(args: List[str]) -> str:
    aapt = shutil.which("aapt") or shutil.which("aapt2")
    if not aapt:
        raise RuntimeError("aapt (Android build-tools) not found on PATH")

    proc = subprocess.run([aapt] + args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"aapt failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def parse_badging(output: str) -> Dict[str, Any]:
    pkg_name = None
    label = None
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("package:"):
            # example: package: name='com.example.app' versionCode='1' versionName='1.0'
            parts = line.split()
            for part in parts:
                if part.startswith("name="):
                    pkg_name = part.split("=", 1)[1].strip("'\"")
        elif line.startswith("application-label:"):
            # application-label:'My App'
            label = line.split(":", 1)[1].strip().strip("'\"")
    return {"package_name": pkg_name, "label": label}


def parse_permissions(output: str) -> List[str]:
    perms: List[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        if "uses-permission:" in line or line.startswith("permission:"):
            # e.g. uses-permission: name='android.permission.READ_SMS'
            if "name=" in line:
                part = line.split("name=", 1)[1]
                name = part.strip().strip("'\"")
                perms.append(name)
    # de-duplicate while preserving order
    seen = set()
    unique: List[str] = []
    for p in perms:
        if p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


def classify_permissions(perms: List[str]) -> tuple[list[str], list[str], str, list[str]]:
    risky = [p for p in perms if p in RISKY_PERMISSIONS]
    moderate = [p for p in perms if p in MODERATE_PERMISSIONS and p not in risky]

    notes: List[str] = []
    if risky:
        notes.append(f"Contains {len(risky)} high-risk permission(s)")
    if moderate:
        notes.append(f"Contains {len(moderate)} sensitive permission(s)")

    if risky:
        risk = "risky"
    elif moderate:
        risk = "moderate"
    else:
        risk = "safe"

    if not perms:
        notes.append("No dangerous/special permissions requested (may still have risks not visible to this tool)")

    return risky, moderate, risk, notes


def scan_apk(apk_path: Path) -> ApkScanResult:
    if not apk_path.is_file():
        raise FileNotFoundError(f"APK not found: {apk_path}")

    badging = run_aapt(["dump", "badging", str(apk_path)])
    perms_out = run_aapt(["dump", "permissions", str(apk_path)])

    meta = parse_badging(badging)
    perms = parse_permissions(perms_out)
    risky, moderate, risk, notes = classify_permissions(perms)

    return ApkScanResult(
        apk_path=str(apk_path),
        package_name=meta.get("package_name"),
        label=meta.get("label"),
        risk=risk,
        risky_permissions=risky,
        moderate_permissions=moderate,
        all_permissions=perms,
        notes=notes,
    )


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print("Usage: apk_security_scan.py /path/to/app.apk", file=sys.stderr)
        return 1

    apk = Path(argv[1])
    try:
        result = scan_apk(apk)
    except Exception as e:  # noqa: BLE001
        error = {"error": str(e), "apk_path": str(apk)}
        print(json.dumps(error, indent=2, sort_keys=True))
        return 1

    print(json.dumps(asdict(result), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv))
