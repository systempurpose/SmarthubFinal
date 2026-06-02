"""Offline AI validation helper.

Purpose:
- Run the offline AI (`AI support/ai_diagnose.py`) on a captured connection JSON (and optional visual JSON)
  or on a built-in synthetic MTP-only case.
- Print a compact summary so technicians can confirm that the *verdict* (BSOD-5) and the displayed
  confidence are aligned.

This script is intentionally standalone (no external deps).

Examples:
  D:/SmartHubv5/.venv/Scripts/python.exe tools/validate_offline_ai.py --synthetic
  D:/SmartHubv5/.venv/Scripts/python.exe tools/validate_offline_ai.py --connection _last_connection_check.json
"""

from __future__ import annotations

import argparse
import json
import runpy
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        # Accept both BOM and non-BOM JSON.
        text = path.read_text(encoding="utf-8-sig")
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except Exception as e:
        raise SystemExit(f"Failed to read JSON: {path}: {e}")


def _synthetic_connection() -> Dict[str, Any]:
    # Stable MTP-visible, but Windows shows an ADB interface driver issue (common when ADB driver isn't installed).
    return {
        "hostUsb": {
            "portableDevices": [{"name": "Pixel 7", "status": "OK"}],
            "transportDevices": [
                {"name": "Android Composite ADB Interface", "status": "ERROR"},
                {"name": "MTP USB Device", "status": "OK"},
            ],
            "sample": {"anyChange": False, "changeCount": 0, "stability": 1.0, "count": 10},
        },
        "adb": {"devices": []},
        "fastboot": {"devices": []},
    }


def _get_conf(obj: Any) -> Optional[float]:
    if not isinstance(obj, dict):
        return None
    v = obj.get("confidence_calibrated")
    if isinstance(v, (int, float)):
        return float(v)
    v = obj.get("confidence")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--connection", type=str, default="", help="Path to captured connection JSON")
    ap.add_argument("--visual", type=str, default="", help="Path to captured visual JSON")
    ap.add_argument("--from-url", type=str, default="", help="Fetch connection JSON from URL (e.g. http://localhost:3333/connection-check?deep=1)")
    ap.add_argument("--save", type=str, default="_last_connection_check.json", help="When using --from-url, save payload to this path")
    ap.add_argument("--synthetic", action="store_true", help="Run the built-in synthetic MTP-only case")
    ap.add_argument("--json", action="store_true", help="Output a small JSON summary")
    args = ap.parse_args()

    workspace = Path(__file__).resolve().parents[1]
    ai_path = workspace / "AI support" / "ai_diagnose.py"
    if not ai_path.exists():
        raise SystemExit(f"Missing AI script: {ai_path}")

    if args.synthetic:
        connection = _synthetic_connection()
    elif args.from_url:
        try:
            with urllib.request.urlopen(args.from_url, timeout=180) as resp:
                raw = resp.read()
            text = raw.decode("utf-8-sig", errors="replace")
            obj = json.loads(text)
            connection = obj if isinstance(obj, dict) else {}
        except Exception as e:
            raise SystemExit(f"Failed to fetch JSON from {args.from_url}: {e}")

        try:
            save_path = Path(args.save)
            if not save_path.is_absolute():
                save_path = (workspace / save_path).resolve()
            save_path.write_text(json.dumps(connection, indent=2), encoding="utf-8")
        except Exception:
            # Save is best-effort.
            pass
    elif args.connection:
        connection = _load_json((workspace / args.connection).resolve() if not Path(args.connection).is_absolute() else Path(args.connection))
    else:
        connection = _synthetic_connection()

    visual: Optional[Dict[str, Any]] = None
    if args.visual:
        vpath = (workspace / args.visual).resolve() if not Path(args.visual).is_absolute() else Path(args.visual)
        visual = _load_json(vpath)

    ns = runpy.run_path(str(ai_path))
    diagnose = ns.get("diagnose")
    if not callable(diagnose):
        raise SystemExit("ai_diagnose.py did not export a diagnose(connection, visual) function")

    report = diagnose(connection, visual)
    top = report.get("top") if isinstance(report, dict) else None
    bsod5 = report.get("bsod5") if isinstance(report, dict) else None

    top_key = str((top or {}).get("key") or "")
    bsod5_key = str((bsod5 or {}).get("key") or "")
    top_conf = _get_conf(top)
    bsod5_conf = _get_conf(bsod5)

    verdict_key = bsod5_key or top_key
    verdict_conf = bsod5_conf if bsod5_conf is not None else top_conf

    out = {
        "top": {"key": top_key, "confidence": top_conf},
        "bsod5": {"key": bsod5_key, "confidence": bsod5_conf},
        "verdict": {
            "key": verdict_key,
            "status": "BSoD detected" if (verdict_key and verdict_key != "not_bsod") else "No Symptoms of BSoD",
            "confidence": verdict_conf,
        },
    }

    if args.json:
        print(json.dumps(out, indent=2))
        return 0

    def pct(x: Optional[float]) -> str:
        return "" if x is None else f"{round(x * 100):d}%"

    print(f"top:   {top_key or 'unknown'} {pct(top_conf)}")
    print(f"bsod5: {bsod5_key or 'unknown'} {pct(bsod5_conf)}")
    print(f"verdict: {out['verdict']['status']} ({verdict_key or 'unknown'}) {pct(verdict_conf)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
