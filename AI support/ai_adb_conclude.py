#!/usr/bin/env python3
"""Offline AI-style conclusion for ADB diagnostics.

This is intentionally local-only and heuristic-based (not a cloud LLM).
Input: JSON file containing counts/diagStages/diagDetails.
Output: JSON to stdout.

Usage:
  python "AI support/ai_adb_conclude.py" --input input.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
from typing import Any, Dict, List, Tuple


def _get(d: Dict[str, Any], *path: str) -> Any:
    cur: Any = d
    for p in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur


def _as_bool(v: Any) -> bool | None:
    if v is True:
        return True
    if v is False:
        return False
    return None


def _as_number(v: Any) -> float | None:
    try:
        if v is None:
            return None
        n = float(v)
        if n != n:  # NaN
            return None
        return n
    except Exception:
        return None


def _scale_confidence_adb(raw: float | None) -> float:
    """Map internal heuristic confidence into an ADB UX range of 0.80–1.00.

    This project treats ADB-based conclusions as higher-evidence than USB-only
    or text-only paths, so the UI is forced into 80–100% while still preserving
    relative strength.
    """

    if raw is None:
        return 0.80

    try:
        r = float(raw)
    except Exception:
        return 0.80

    # Current heuristics generally produce ~0.56–0.90.
    # Remap 0.50..0.90 => 0.80..1.00 (clamped).
    norm = (r - 0.50) / 0.40
    if norm < 0.0:
        norm = 0.0
    if norm > 1.0:
        norm = 1.0
    scaled = 0.80 + 0.20 * norm
    if scaled < 0.80:
        scaled = 0.80
    if scaled > 1.00:
        scaled = 1.00
    return float(round(scaled, 4))


def _default_memory_db_path() -> str:
    # Use a per-user writable location (Program Files is not writable).
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
        root = os.path.join(base, "SmartHubDiagnostics", "AI")
    else:
        root = os.path.join(os.path.expanduser("~"), ".local", "share", "smarthub", "ai")
    try:
        os.makedirs(root, exist_ok=True)
    except Exception:
        # Fall back to script directory if we cannot create the folder.
        root = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(root, "adb_ai_memory.sqlite")


def _open_db(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS adb_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            feature_hash TEXT NOT NULL,
            features_json TEXT NOT NULL,
            label TEXT,
            confidence REAL,
            failing_json TEXT,
            actions_json TEXT,
            outcome TEXT,
            resolution TEXT,
            note TEXT
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_adb_cases_hash ON adb_cases(feature_hash)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_adb_cases_time ON adb_cases(created_at)")
    return con


def _feature_tokens(payload: Dict[str, Any]) -> List[str]:
    user_problem = str(payload.get("userProblem") or "").strip().lower()
    diag_stages = payload.get("diagStages") if isinstance(payload.get("diagStages"), dict) else {}
    diag_details = payload.get("diagDetails") if isinstance(payload.get("diagDetails"), dict) else {}

    failing: List[str] = []
    for k, v in diag_stages.items():
        if not isinstance(v, dict):
            continue
        if v.get("ok") is False:
            failing.append(str(k))

    tokens: List[str] = []
    for st in sorted(set(failing)):
        tokens.append(f"fail:{st}")

    # Battery
    b = diag_details.get("battery") if isinstance(diag_details.get("battery"), dict) else {}
    temp_c = _as_number(b.get("temperatureC"))
    if temp_c is not None:
        if temp_c >= 47:
            tokens.append("bat:very_hot")
        elif temp_c >= 45:
            tokens.append("bat:hot")
    health = str(b.get("health") or "").strip().lower()
    if health and health not in ("good", "unknown"):
        tokens.append(f"bat:health:{health}")
    cycle = _as_number(b.get("cycleCount"))
    if cycle is not None:
        if cycle >= 900:
            tokens.append("bat:cycles:very_high")
        elif cycle >= 700:
            tokens.append("bat:cycles:high")

    # Touch
    t = diag_details.get("touch") if isinstance(diag_details.get("touch"), dict) else {}
    if _as_bool(t.get("hasTouchDriverErrors")) is True:
        tokens.append("touch:driver_errors")
    if _as_bool(t.get("hasInputAnomalies")) is True:
        tokens.append("touch:anomalies")
    if _as_bool(t.get("isChargingDuringLogs")) is True:
        tokens.append("touch:charging")

    # System
    s = diag_details.get("system") if isinstance(diag_details.get("system"), dict) else {}
    if _as_bool(s.get("hasStorageIssue")) is True:
        tokens.append("sys:storage_full")
    if _as_bool(s.get("hasCrashIssue")) is True:
        tokens.append("sys:crash_anr")

    # OS
    o = diag_details.get("os") if isinstance(diag_details.get("os"), dict) else {}
    if _as_bool(o.get("hasFsError")) is True:
        tokens.append("os:fs_error")
    if _as_bool(o.get("hasVerityIssue")) is True:
        tokens.append("os:verity")
    if _as_bool(o.get("hasCoreServiceCrashes")) is True:
        tokens.append("os:core_crash")
    if _as_bool(o.get("isCustomBuild")) is True:
        tokens.append("os:custom_build")

    # Connectivity / sensors / camera
    c = diag_details.get("connectivity") if isinstance(diag_details.get("connectivity"), dict) else {}
    if isinstance(c.get("hasWifi"), bool) and c.get("hasWifi") is False:
        tokens.append("conn:no_wifi")
    if isinstance(c.get("hasMobile"), bool) and c.get("hasMobile") is False:
        tokens.append("conn:no_mobile")
    if isinstance(c.get("hasBluetooth"), bool) and c.get("hasBluetooth") is False:
        tokens.append("conn:no_bt")
    if isinstance(c.get("hasGps"), bool) and c.get("hasGps") is False:
        tokens.append("conn:no_gps")
    if isinstance(c.get("hasNfc"), bool) and c.get("hasNfc") is False:
        tokens.append("conn:no_nfc")

    sens = diag_details.get("sensors") if isinstance(diag_details.get("sensors"), dict) else {}
    scount = _as_number(sens.get("sensorCount"))
    if scount is not None and scount <= 0:
        tokens.append("sens:none")

    cam = diag_details.get("camera") if isinstance(diag_details.get("camera"), dict) else {}
    ccount = _as_number(cam.get("descriptorCount"))
    if ccount is not None and ccount <= 0:
        tokens.append("cam:none")

    # Security
    sec = diag_details.get("security") if isinstance(diag_details.get("security"), dict) else {}
    suspicious_total = _as_number(sec.get("suspiciousTotal"))
    if suspicious_total is None:
        try:
            suspicious_total = float(sec.get("suspiciousHigh") or 0) + float(sec.get("suspiciousMedium") or 0) + float(sec.get("suspiciousLow") or 0)
        except Exception:
            suspicious_total = None
    if suspicious_total is not None and suspicious_total > 0:
        if suspicious_total >= 3:
            tokens.append("sec:suspicious:many")
        else:
            tokens.append("sec:suspicious:some")

    # Severity counts (coarse)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    high = int(counts.get("high") or 0)
    medium = int(counts.get("medium") or 0)
    if high >= 2:
        tokens.append("sev:high:many")
    elif high == 1:
        tokens.append("sev:high:one")
    if medium >= 3:
        tokens.append("sev:med:many")
    elif medium >= 1:
        tokens.append("sev:med:some")

    # Symptom hints from technician/user text.
    if user_problem:
        t = user_problem
        if ("blue" in t and "screen" in t) or "bsod" in t:
            tokens.append("symptom:blue_screen")
        if ("blank" in t and "screen" in t) or ("black" in t and "screen" in t):
            tokens.append("symptom:blank_screen")
        if "bootloop" in t or ("stuck" in t and "logo" in t) or ("restart" in t and "loop" in t):
            tokens.append("symptom:bootloop")
        if "overheat" in t or "overheating" in t or ("hot" in t and "phone" in t):
            tokens.append("symptom:overheat")
        if "not charging" in t or "won't charge" in t or "wont charge" in t:
            tokens.append("symptom:not_charging")
        if "battery drain" in t or "drains" in t or "fast drain" in t:
            tokens.append("symptom:battery_drain")
        if "touch" in t and ("ghost" in t or "jump" in t or "random" in t):
            tokens.append("symptom:ghost_touch")

    return sorted(set(tokens))


def _hash_features(tokens: List[str]) -> str:
    txt = "\n".join(tokens).encode("utf-8")
    return hashlib.sha256(txt).hexdigest()


def _reported_problem_focus(user_problem: str) -> Dict[str, bool]:
    text = str(user_problem or "").strip().lower()
    if not text:
        return {}

    return {
        "performance": any(
            term in text
            for term in [
                "low performance",
                "slow",
                "lag",
                "laggy",
                "stutter",
                "freeze",
                "freezing",
                "hang",
                "hanging",
                "unresponsive",
                "sluggish",
                "loading",
                "load",
                "opening",
                "open",
                "too long",
                "takes too long",
                "app not opening",
                "app won\'t open",
                "app wont open",
                "stuck opening",
                "overheating and slow",
            ]
        ),
        "display": any(term in text for term in ["display", "screen", "black screen", "blank screen", "blue screen", "bsod"]),
        "battery": any(
            term in text
            for term in [
                "battery",
                "drain",
                "not charging",
                "charge",
                "charging",
                "overheat",
                "overheating",
                "hot",
                "power off",
                "poweroff",
                "shut down",
                "shutdown",
                "turns off",
                "turn off",
                "switches off",
                "auto power",
                "automatic power",
                "random power",
                "random shutdown",
                "sudden shutdown",
            ]
        ),
        "security": any(term in text for term in ["virus", "malware", "spyware", "hack", "hacked", "suspicious app", "popup", "ads"]),
        "boot": any(
            term in text
            for term in [
                "bootloop",
                "boot loop",
                "stuck on logo",
                "restart loop",
                "won't boot",
                "wont boot",
                "random restart",
                "restarts",
                "keeps restarting",
                "reboot",
            ]
        ),
        "app_loading": any(
            term in text
            for term in [
                "loading",
                "load",
                "opening",
                "open",
                "too long",
                "app not opening",
                "app won\'t open",
                "app wont open",
                "stuck opening",
            ]
        ),
        "touch": any(term in text for term in ["touch", "ghost touch", "digitizer"]),
        "connectivity": any(term in text for term in ["wifi", "wi-fi", "bluetooth", "network", "internet", "signal", "data"]),
        "camera": any(term in text for term in ["camera", "mic", "microphone"]),
    }


def _human_join(items: List[str]) -> str:
    vals = [str(item or "").strip() for item in items if str(item or "").strip()]
    if not vals:
        return ""
    if len(vals) == 1:
        return vals[0]
    if len(vals) == 2:
        return f"{vals[0]} and {vals[1]}"
    return f"{', '.join(vals[:-1])}, and {vals[-1]}"


def _push_cause(causes: List[Dict[str, Any]], title: str, why: str, score: float) -> None:
    clean_title = str(title or "").strip()
    clean_why = str(why or "").strip()
    if not clean_title or not clean_why:
        return
    causes.append({"title": clean_title, "why": clean_why, "score": float(score)})


def _pick_likely_cause(payload: Dict[str, Any], focus: Dict[str, bool], failing: List[str]) -> Dict[str, str]:
    diag_details = payload.get("diagDetails") if isinstance(payload.get("diagDetails"), dict) else {}
    causes: List[Dict[str, Any]] = []

    battery = diag_details.get("battery") if isinstance(diag_details.get("battery"), dict) else {}
    system = diag_details.get("system") if isinstance(diag_details.get("system"), dict) else {}
    os_info = diag_details.get("os") if isinstance(diag_details.get("os"), dict) else {}
    security = diag_details.get("security") if isinstance(diag_details.get("security"), dict) else {}
    touch = diag_details.get("touch") if isinstance(diag_details.get("touch"), dict) else {}

    temp_c = _as_number(battery.get("temperatureC"))
    cycle_count = _as_number(battery.get("cycleCount"))
    health = str(battery.get("health") or "").strip().lower()
    connection_suspected = _as_bool(battery.get("connectionSuspected")) is True
    power_log_suspected = _as_bool(battery.get("powerLogSuspected")) is True
    power_log_score = _as_number(battery.get("powerLogScore")) or 0.0
    boot_reason = str(os_info.get("bootReason") or "").strip().lower()
    shutdown_category = str(os_info.get("shutdownCategory") or "").strip().lower()
    shutdown_summary = str(os_info.get("shutdownSummary") or "").strip()
    suspicious_total = _as_number(security.get("suspiciousTotal"))
    if suspicious_total is None:
        try:
            suspicious_total = float(security.get("suspiciousHigh") or 0) + float(security.get("suspiciousMedium") or 0) + float(security.get("suspiciousLow") or 0)
        except Exception:
            suspicious_total = 0.0

    if focus.get("performance"):
        if _as_bool(system.get("hasStorageIssue")) is True:
            _push_cause(causes, "Low storage is the likely cause", "The scan found storage pressure, which commonly makes Android phones slow, laggy, or unstable.", 3.2)
        if _as_bool(system.get("hasCrashIssue")) is True:
            _push_cause(causes, "App or system crashes are likely causing the slowdown", "Crash or ANR evidence usually matches freezing, stutter, or poor performance.", 3.0)
        if _as_bool(os_info.get("hasCoreServiceCrashes")) is True:
            _push_cause(causes, "Core Android services look unstable", "System service crashes can slow the whole phone and cause repeated hangs.", 3.0)
        if temp_c is not None and temp_c >= 45:
            _push_cause(causes, "Heat may be throttling the phone", "The battery temperature is high enough to reduce performance during use or charging.", 2.8)
        if suspicious_total and suspicious_total > 0:
            _push_cause(causes, "Suspicious apps may be dragging performance down", "Background apps with risky behavior can consume resources and make the phone feel slow.", 2.4)
        if health and health not in ("good", "unknown"):
            _push_cause(causes, "Battery wear may be contributing", "Poor battery health can cause instability and weak performance under load.", 2.1)
        if cycle_count is not None and cycle_count >= 800:
            _push_cause(causes, "A worn battery may be part of the slowdown", "A very high cycle count often means reduced power stability.", 1.8)

    if focus.get("display") and "display" in failing:
        _push_cause(causes, "Display hardware is the likely cause", "The display checks failed, which fits a screen complaint better than an OS failure.", 3.3)

    # Higher-specificity shutdown/reboot evidence when available.
    if shutdown_category in ("thermal",):
        _push_cause(
            causes,
            "Thermal protection shutdown is the likely cause",
            "The device exposed thermal shutdown/reboot hints. Overheating protection can power off or reboot a phone even when other checks look normal.",
            3.8,
        )
    if shutdown_category in ("kernel-panic",):
        _push_cause(
            causes,
            "Kernel panic / firmware crash is the likely cause",
            "The device exposed kernel-level crash hints (kernel panic). This is a low-level OS/firmware failure and can look like random shutdown or reboot.",
            3.7,
        )
    if shutdown_category in ("watchdog",):
        if focus.get("app_loading"):
            _push_cause(
                causes,
                "System or app startup is delayed",
                "The complaint is about something taking too long to load or open. That fits a startup/performance problem better than a reboot watchdog unless the device is actually restarting.",
                3.5,
            )
        else:
            _push_cause(
                causes,
                "System watchdog / hang reboot is the likely cause",
                "The device exposed watchdog/hang reboot hints. This can cause sudden restarts that feel like random shutdowns.",
                3.6,
            )
    if shutdown_category in ("undervoltage", "power-cut", "low-battery"):
        _push_cause(
            causes,
            "Battery undervoltage / power cut is the likely cause",
            "The device exposed shutdown hints consistent with undervoltage/power loss. This commonly matches ‘turns off when unplugged’ even when battery health shows ‘Good’.",
            3.7,
        )

    # Power-off / shutdown complaints sometimes come from an intermittent battery connector
    # or power path even when temperature/health look 'Good'.
    if focus.get("battery") and connection_suspected:
        _push_cause(
            causes,
            "Intermittent battery/power connection is the likely cause",
            "The diagnostic saw unstable battery/power readings between samples, which can match random shutdowns or sudden power loss.",
            3.4,
        )

    if focus.get("battery") and power_log_suspected:
        _push_cause(
            causes,
            "Power path instability is a likely cause",
            "Power/battery-related warnings were observed in logs, which can match random power-off, undervoltage events, or charging/power-path instability.",
            3.2 + (0.2 if power_log_score >= 8 else 0.0),
        )

    if focus.get("battery") and boot_reason:
        if any(term in boot_reason for term in ["battery", "uvlo", "undervoltage", "power", "pmic", "thermal", "shutdown"]):
            _push_cause(
                causes,
                "Power path / battery condition is a likely cause",
                "The device reported a boot/shutdown reason consistent with power loss (battery/undervoltage/thermal/power path).",
                2.9,
            )

    # If shutdownSummary is present but category isn't strong enough to trigger above,
    # still surface it as a supporting hint for battery/boot complaints.
    if (focus.get("battery") or focus.get("boot")) and shutdown_summary and shutdown_category not in ("thermal", "kernel-panic", "watchdog", "undervoltage", "power-cut", "low-battery"):
        _push_cause(
            causes,
            "Shutdown/reboot reason hints were found",
            f"The diagnostic extracted a shutdown/reboot hint: {shutdown_summary}",
            2.6,
        )
    if focus.get("battery") and (temp_c is not None and temp_c >= 45 or health and health not in ("good", "unknown") or cycle_count is not None and cycle_count >= 800):
        _push_cause(causes, "Battery or charging health is the likely cause", "Temperature, battery wear, or charging-related evidence matches the reported power complaint.", 3.1)
    if focus.get("security") and suspicious_total and suspicious_total > 0:
        _push_cause(causes, "Suspicious apps are the likely cause", "The scan found apps that deserve review and they match the reported security concern.", 3.1)
    if focus.get("touch") and (_as_bool(touch.get("hasTouchDriverErrors")) is True or _as_bool(touch.get("hasInputAnomalies")) is True or "touch" in failing):
        _push_cause(causes, "Touch or digitizer hardware is the likely cause", "Touch-driver errors or input anomalies fit the reported touch problem.", 3.0)
    if focus.get("connectivity") and "connectivity" in failing:
        _push_cause(causes, "Connectivity hardware or radio path is the likely cause", "The connectivity checks failed in the same area as the reported network issue.", 3.0)
    if focus.get("camera") and "camera" in failing:
        _push_cause(causes, "Camera service or module is the likely cause", "The camera checks failed and directly match the reported camera problem.", 3.0)
    if focus.get("boot"):
        if _as_bool(os_info.get("hasFsError")) is True:
            _push_cause(causes, "Filesystem corruption is the likely cause", "Filesystem errors commonly explain boot instability or repeated crashes.", 3.2)
        if _as_bool(os_info.get("hasVerityIssue")) is True:
            _push_cause(causes, "System integrity problems are the likely cause", "Integrity warnings fit boot problems on modified or damaged software.", 2.9)
        if _as_bool(os_info.get("hasCoreServiceCrashes")) is True:
            _push_cause(causes, "Core Android services are crashing", "System service crashes can block normal boot or keep the phone unstable.", 2.8)

    if not causes:
        if "display" in failing:
            _push_cause(causes, "Display hardware may be at fault", "The display category failed and is the clearest hardware-related finding in this scan.", 2.0)
        elif "system" in failing:
            _push_cause(causes, "System instability may be the main cause", "The system category failed, which points to performance or software instability.", 2.0)
        elif "os" in failing:
            _push_cause(causes, "OS health may be the main cause", "The OS/filesystem checks found issues that can affect stability.", 2.0)
        elif "security" in failing:
            _push_cause(causes, "Suspicious apps may be the main cause", "The security scan found apps or permissions that deserve review.", 2.0)

    if not causes:
        return {
            "title": "No single clear cause yet",
            "why": "The scan found weak or mixed evidence, so the safest answer is to re-test while reproducing the exact problem.",
        }

    causes.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    best = causes[0]
    return {
        "title": str(best.get("title") or "No single clear cause yet"),
        "why": str(best.get("why") or "The current scan does not isolate one strong cause."),
    }


def _jaccard(a: List[str], b: List[str]) -> float:
    sa = set(a)
    sb = set(b)
    if not sa and not sb:
        return 0.0
    return float(len(sa & sb)) / float(len(sa | sb) or 1)


def _load_similar_cases(con: sqlite3.Connection, tokens: List[str], limit: int = 25) -> List[Dict[str, Any]]:
    # Compare against a bounded recent window to keep it fast.
    rows = con.execute(
        "SELECT created_at, features_json, outcome, resolution, note FROM adb_cases ORDER BY created_at DESC LIMIT ?",
        (int(limit),),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for created_at, features_json, outcome, resolution, note in rows:
        try:
            other = json.loads(features_json) if features_json else []
        except Exception:
            other = []
        if not isinstance(other, list):
            other = []
        score = _jaccard(tokens, [str(x) for x in other])
        if score <= 0:
            continue
        out.append(
            {
                "created_at": int(created_at),
                "score": float(score),
                "outcome": str(outcome or "").strip(),
                "resolution": str(resolution or "").strip(),
                "note": str(note or "").strip(),
            }
        )
    out.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return out[:5]


def _append_case(
    con: sqlite3.Connection,
    *,
    tokens: List[str],
    label: str,
    confidence: float,
    failing: List[str],
    actions: List[str],
    outcome: str = "",
    resolution: str = "",
    note: str = "",
) -> None:
    now = int(time.time())
    fh = _hash_features(tokens)

    # De-dupe: if the same feature hash was stored recently, skip.
    try:
        row = con.execute(
            "SELECT created_at FROM adb_cases WHERE feature_hash = ? ORDER BY created_at DESC LIMIT 1",
            (fh,),
        ).fetchone()
        if row and int(row[0] or 0) >= now - 6 * 60 * 60:
            return
    except Exception:
        pass

    con.execute(
        """
        INSERT INTO adb_cases (created_at, feature_hash, features_json, label, confidence, failing_json, actions_json, outcome, resolution, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now,
            fh,
            json.dumps(tokens, ensure_ascii=False),
            str(label or ""),
            float(confidence or 0.0),
            json.dumps(sorted(set([str(x) for x in failing])), ensure_ascii=False),
            json.dumps([str(x) for x in actions], ensure_ascii=False),
            str(outcome or "")[:64],
            str(resolution or "")[:240],
            str(note or "")[:240],
        ),
    )
    con.commit()

    # Cap growth: keep only the most recent 1000 rows.
    try:
        con.execute(
            "DELETE FROM adb_cases WHERE id NOT IN (SELECT id FROM adb_cases ORDER BY created_at DESC LIMIT 1000)"
        )
        con.commit()
    except Exception:
        pass


def _knowledge_actions(payload: Dict[str, Any]) -> Tuple[str, float, str, List[str]]:
    """Returns (label, confidence, summary, actions) based on a richer offline knowledge base."""
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    high = int(counts.get("high") or 0)
    medium = int(counts.get("medium") or 0)

    diag_stages = payload.get("diagStages") if isinstance(payload.get("diagStages"), dict) else {}
    diag_details = payload.get("diagDetails") if isinstance(payload.get("diagDetails"), dict) else {}

    failing: List[str] = []
    for k, v in diag_stages.items():
        if isinstance(v, dict) and v.get("ok") is False:
            failing.append(str(k))

    actions: List[str] = []
    primary: List[str] = []
    user_problem_raw = str(payload.get("userProblem") or "").strip()
    user_problem = user_problem_raw.lower()
    focus = _reported_problem_focus(user_problem_raw)

    symptom_match_score = 0.0
    symptom_mismatch_notes: List[str] = []
    symptom_match_notes: List[str] = []

    # Symptom-based hints (these guide actions, not hard diagnoses).
    if user_problem:
        if ("blue" in user_problem and "screen" in user_problem) or "bsod" in user_problem or ("blank" in user_problem and "screen" in user_problem) or ("black" in user_problem and "screen" in user_problem):
            primary.append("Screen blank/blue symptom")
            symptom_match_score += 1.5
            actions.extend(
                [
                    "If the device still vibrates/sounds but the display is blank/blue: suspect display/backlight/connector path first.",
                    "Reseat display/touch flex connectors and inspect for corrosion/bent pins.",
                ]
            )
        if "bootloop" in user_problem or ("stuck" in user_problem and "logo" in user_problem):
            primary.append("Boot loop symptom")
            symptom_match_score += 1.2
            actions.extend(
                [
                    "If stuck on logo/boot loop: try recovery mode and check for update/mount errors.",
                    "If recent update/flashing occurred: consider OS repair/reflash using authorized OEM tools.",
                ]
            )
        if "not charging" in user_problem or "won't charge" in user_problem or "wont charge" in user_problem:
            primary.append("Charging problem")
            symptom_match_score += 1.0
            actions.extend(
                [
                    "Try a known-good OEM charger and cable; test another power source/port.",
                    "Inspect USB port for debris/loose connector; check for liquid damage.",
                ]
            )
        if "overheat" in user_problem or "overheating" in user_problem:
            primary.append("Overheating symptom")
            symptom_match_score += 1.0
            actions.append("Overheating reported: stop charging/usage and let device cool; check for background apps and battery swelling.")
        if focus.get("performance"):
            primary.append("Performance / lag symptom")
            actions.extend(
                [
                    "For low performance: reboot the phone, close heavy background apps, and re-test while reproducing the slowdown.",
                    "Check storage free space, crash history, thermal state, and suspicious apps because they commonly cause lag/stutter.",
                ]
            )

    # Battery
    b = diag_details.get("battery") if isinstance(diag_details.get("battery"), dict) else {}
    temp_c = _as_number(b.get("temperatureC"))
    health = str(b.get("health") or "")
    cycle_count = _as_number(b.get("cycleCount"))
    connection_suspected = _as_bool(b.get("connectionSuspected")) is True
    power_log_suspected = _as_bool(b.get("powerLogSuspected")) is True
    power_log_score = _as_number(b.get("powerLogScore")) or 0.0
    if connection_suspected:
        primary.append("Battery/power connection anomaly")
        if focus.get("battery"):
            symptom_match_score += 1.2
            symptom_match_notes.append("unstable battery/power readings can match random shutdowns")
        actions.extend(
            [
                "If the phone powers off suddenly: inspect/clean/reseat the battery connector and power flex if serviceable.",
                "Check for battery swelling or liquid/corrosion near the battery/power connector area.",
                "If available, test with a known-good battery and verify charging stability with an OEM charger/cable.",
            ]
        )

    if power_log_suspected:
        primary.append("Power/battery warnings in logs")
        if focus.get("battery"):
            symptom_match_score += 0.9 + (0.3 if power_log_score >= 8 else 0.0)
            symptom_match_notes.append("power/battery warnings can match random power loss")
        actions.extend(
            [
                "Power/battery warnings were seen in logs. Prioritize power path checks (battery connector, charging port, PMIC area) before blaming apps.",
                "If shutdown happens under load: test with a known-good battery and observe voltage stability if tools are available.",
            ]
        )
    if temp_c is not None and temp_c >= 47:
        primary.append("Battery overheating")
        if focus.get("battery") or focus.get("performance"):
            symptom_match_score += 1.0
            symptom_match_notes.append("battery temperature can explain overheating or low performance")
        actions.extend(
            [
                "Stop charging and let the device cool to room temperature, then re-test.",
                "Inspect for battery swelling, liquid damage, or hot spots near the battery connector.",
                "Try a known-good OEM charger/cable; poor power quality can cause heat and instability.",
            ]
        )
    elif temp_c is not None and temp_c >= 45:
        if focus.get("battery") or focus.get("performance"):
            symptom_match_score += 0.5
        actions.append("Battery temperature is high. Let the phone cool; check charger/cable and re-test.")
    if health and health.lower() not in ("good", "unknown"):
        primary.append("Battery wear")
        if focus.get("battery") or focus.get("performance"):
            symptom_match_score += 0.4
        actions.append("Battery health is not Good. Consider battery service/replacement.")
    if cycle_count is not None and cycle_count >= 800:
        if focus.get("battery") or focus.get("performance"):
            symptom_match_score += 0.3
        actions.append("Battery cycle count is high. Expect reduced capacity; consider battery replacement.")

    # Display
    if "display" in failing:
        primary.append("Display pipeline / panel")
        if focus.get("display"):
            symptom_match_score += 1.4
            symptom_match_notes.append("display failures match the reported screen symptom")
        elif focus.get("performance"):
            symptom_mismatch_notes.append("display failure was detected, but it does not strongly explain low performance by itself")
        actions.extend(
            [
                "If ADB is visible but the screen is blank/blue: suspect display/backlight/connector path rather than OS.",
                "Reseat the display and touch flex connectors; inspect for bent pins/corrosion.",
                "Test with a known-good display assembly when available.",
            ]
        )

    # Touch
    t = diag_details.get("touch") if isinstance(diag_details.get("touch"), dict) else {}
    has_touch_driver = _as_bool(t.get("hasTouchDriverErrors")) is True
    has_anom = _as_bool(t.get("hasInputAnomalies")) is True
    if "touch" in failing or has_touch_driver or has_anom:
        primary.append("Touch / digitizer")
        if focus.get("touch"):
            symptom_match_score += 1.0
        if _as_bool(t.get("isChargingDuringLogs")) is True:
            actions.append("Ghost touch can worsen while charging. Try a different charger/cable and avoid cheap adapters.")
        if has_touch_driver:
            actions.append("Touch driver errors seen. Check digitizer connection; consider screen assembly replacement.")
        if has_anom:
            actions.append("Input anomalies seen. Remove case/screen protector; test in safe mode; if persists, suspect digitizer.")

    # Sensors
    if "sensors" in failing:
        primary.append("Sensors")
        actions.extend(
            [
                "If sensors are missing/unresponsive: reboot and re-test; check if the device is stuck in a restricted mode.",
                "Run OEM hardware test/diagnostic menu if available.",
                "If only one sensor class fails (e.g., proximity), suspect that specific module/connector.",
            ]
        )

    # Camera
    if "camera" in failing:
        primary.append("Camera service")
        if focus.get("camera"):
            symptom_match_score += 1.0
        actions.extend(
            [
                "Close camera-using apps and re-test; ensure permissions are granted.",
                "If camera service shows no devices: suspect camera module/connector or firmware mismatch.",
            ]
        )

    # Connectivity
    if "connectivity" in failing:
        primary.append("Connectivity")
        if focus.get("connectivity"):
            symptom_match_score += 1.0
        actions.extend(
            [
                "Toggle Airplane mode and re-test Wi‑Fi/Bluetooth.",
                "Reset network settings (if user allows) and re-test.",
                "If Wi‑Fi/Bluetooth both fail, suspect shared RF module/antenna path or board-level issue.",
            ]
        )

    # Hardware features
    if "hardware" in failing:
        primary.append("Hardware feature reporting")
        actions.append("Feature list is missing/unusual. If OS is unstable, consider OS repair/reflash before hardware replacement.")

    # System
    s = diag_details.get("system") if isinstance(diag_details.get("system"), dict) else {}
    if _as_bool(s.get("hasStorageIssue")) is True:
        primary.append("Low storage")
        if focus.get("performance") or focus.get("boot"):
            symptom_match_score += 1.1
            symptom_match_notes.append("low storage can directly cause lag, stalls, and app failures")
        actions.extend(
            [
                "Free at least 2–5 GB of internal storage and reboot.",
                "Clear large caches (messaging/media/social apps) and re-test for stability.",
            ]
        )
    if _as_bool(s.get("hasCrashIssue")) is True:
        primary.append("App/OS crashes")
        if focus.get("performance") or focus.get("boot"):
            symptom_match_score += 1.0
            symptom_match_notes.append("crash or ANR evidence matches low performance or instability")
        actions.extend(
            [
                "Boot into Safe Mode and check if the issue persists (helps isolate third-party apps).",
                "Check for recent OS updates; if crash loop persists, back up and consider factory reset.",
            ]
        )

    # OS integrity
    o = diag_details.get("os") if isinstance(diag_details.get("os"), dict) else {}
    shutdown_category = str(o.get("shutdownCategory") or "").strip().lower()
    shutdown_summary = str(o.get("shutdownSummary") or "").strip()

    if shutdown_category and shutdown_category != "unknown":
        primary.append("Shutdown/reboot reason hints")
        if focus.get("battery") or focus.get("boot"):
            symptom_match_score += 1.0
            if shutdown_summary:
                symptom_match_notes.append(f"shutdown hint: {shutdown_summary}")

        if shutdown_category == "thermal":
            actions.extend(
                [
                    "Thermal shutdown hints were found. Check for overheating under real use (gaming/video/camera) and inspect for battery swelling or blocked vents/case heat traps.",
                    "If the device shuts down while charging: test with a known-good OEM charger/cable and avoid fast-charge until stable.",
                ]
            )
        elif shutdown_category in ("kernel-panic", "watchdog", "system-crash"):
            actions.extend(
                [
                    "System-level crash/hang hints were found. Re-test while reproducing the issue, then check if it happens in Safe Mode (helps isolate third‑party apps).",
                    "If persists on stock apps: back up data and consider OS repair/reflash using authorized OEM tools.",
                ]
            )
        elif shutdown_category in ("undervoltage", "low-battery", "power-cut"):
            actions.extend(
                [
                    "Power-loss/undervoltage hints were found. If shutdown happens when unplugged: test with a known-good battery and observe voltage stability under load if tools are available.",
                    "Inspect/clean/reseat battery connector and charging port flex; if not serviceable, escalate to board-level power/PMIC inspection.",
                ]
            )
    if _as_bool(o.get("hasFsError")) is True:
        primary.append("Filesystem corruption")
        if focus.get("boot") or focus.get("performance"):
            symptom_match_score += 0.8
        actions.append("Filesystem errors detected. Back up data immediately; consider OS repair or reflash via OEM tools.")
    if _as_bool(o.get("hasVerityIssue")) is True:
        primary.append("Integrity / modified system")
        if focus.get("boot"):
            symptom_match_score += 0.6
        actions.append("Integrity warnings detected. Restore stock firmware/boot image if the device is modified.")
    if _as_bool(o.get("hasCoreServiceCrashes")) is True:
        primary.append("Core services crash")
        if focus.get("performance") or focus.get("boot"):
            symptom_match_score += 1.0
        actions.append("Core Android services crashed. If reproducible, consider OS repair/reflash or hardware RAM/storage checks.")

    # Security
    sec = diag_details.get("security") if isinstance(diag_details.get("security"), dict) else {}
    suspicious_total = _as_number(sec.get("suspiciousTotal"))
    if suspicious_total is None:
        try:
            suspicious_total = float(sec.get("suspiciousHigh") or 0) + float(sec.get("suspiciousMedium") or 0) + float(sec.get("suspiciousLow") or 0)
        except Exception:
            suspicious_total = None
    if suspicious_total is not None and suspicious_total > 0:
        primary.append("Security risk")
        if focus.get("security"):
            symptom_match_score += 1.2
            symptom_match_notes.append("security findings match the reported malware/security concern")
        elif focus.get("performance"):
            symptom_match_score += 0.6
            symptom_match_notes.append("suspicious apps can contribute to background lag or low performance")
        actions.extend(
            [
                "Review suspicious apps (prioritize High/Medium), uninstall unknown apps, and re-scan.",
                "If device is used for sensitive accounts, advise password changes after cleanup.",
            ]
        )

    # Label + confidence
    total_issues = high + medium
    if total_issues <= 0 and not failing:
        label = "No issues detected"
        confidence = 0.72
        summary = "All diagnostic categories reported PASS. If symptoms persist, re-run while reproducing the issue."
    elif high > 0:
        label = "Likely cause found"
        confidence = 0.66 + min(0.24, 0.10 * high)
        summary = "The scan found a strong problem area that should be checked first."
    else:
        label = "Possible cause found"
        confidence = 0.56 + min(0.24, 0.05 * medium)
        summary = "The scan found some likely problem areas, but the evidence is moderate rather than final."

    # ADB UX requirement: confidence must display as 80–100%.
    confidence = _scale_confidence_adb(confidence)

    likely_cause = _pick_likely_cause(payload, focus, failing)
    cause_title = str(likely_cause.get("title") or "").strip()
    cause_why = str(likely_cause.get("why") or "").strip()

    if user_problem_raw and cause_title and cause_title != "No single clear cause yet":
        summary = f"Reported problem: {user_problem_raw}. {cause_title}. {cause_why}"
    elif cause_title and cause_title != "No single clear cause yet":
        summary = f"{cause_title}. {cause_why}"

    if primary:
        summary += f" Main signals: {_human_join(sorted(set(primary)))}."
    if failing:
        summary += f" Failed areas: {_human_join(sorted(set(failing)))}."

    if user_problem_raw and not (cause_title and cause_title != "No single clear cause yet"):
        summary = f"Reported problem: {user_problem_raw}. " + summary

    if user_problem_raw:
        if symptom_match_score >= 1.5:
            if symptom_match_notes:
                summary += f" Why it fits: {'; '.join(sorted(set(symptom_match_notes)))}."
            else:
                summary += " The scan findings fit the reported complaint reasonably well."
        elif symptom_match_score > 0:
            summary += " The scan findings only partly match the complaint, so some failed categories may be secondary rather than the main cause."
            if symptom_match_notes:
                summary += f" Closest matches: {'; '.join(sorted(set(symptom_match_notes)))}."
            if symptom_mismatch_notes:
                summary += f" Less relevant findings: {'; '.join(sorted(set(symptom_mismatch_notes)))}."
        else:
            summary += " The current scan does not clearly explain the complaint yet. Re-test while reproducing the exact symptom and focus on the matching checks first."
            if symptom_mismatch_notes:
                summary += f" Less relevant findings: {'; '.join(sorted(set(symptom_mismatch_notes)))}."

    # Prioritize actions that best fit the reported problem.
    prioritized_actions: List[str] = []
    if focus.get("performance"):
        perf_actions = [
            "For slow loading/opening: reboot the phone, close heavy background apps, and re-test the exact app that loads too slowly.",
            "Free storage, check for crash/ANR evidence, and monitor heat because they commonly cause lag and long app-open times.",
            "If suspicious apps are present, treat them as a possible performance cause before replacing hardware.",
        ]
        prioritized_actions.extend(perf_actions)

    if focus.get("display"):
        prioritized_actions.append("Because the complaint is screen-related, prioritize display/backlight/connector checks over unrelated PASS/FAIL categories.")

    if focus.get("battery"):
        prioritized_actions.append("Because the complaint is battery/charging related, prioritize temperature, battery health, charging path, and power-delivery checks.")

    if focus.get("security"):
        prioritized_actions.append("Because the complaint is security-related, prioritize suspicious apps, permissions, and account protection steps first.")

    # De-duplicate while preserving order
    seen = set()
    deduped: List[str] = []
    for a in prioritized_actions + actions:
        s = str(a or "").strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        deduped.append(s)

    return label, float(confidence), summary, deduped[:8]


def build_conclusion(payload: Dict[str, Any]) -> Dict[str, Any]:
    label, confidence, summary, actions = _knowledge_actions(payload)

    reported = str(payload.get("userProblem") or "").strip()
    focus = _reported_problem_focus(reported)
    diag_stages = payload.get("diagStages") if isinstance(payload.get("diagStages"), dict) else {}
    diag_details = payload.get("diagDetails") if isinstance(payload.get("diagDetails"), dict) else {}
    failing = [str(k) for k, v in diag_stages.items() if isinstance(v, dict) and v.get("ok") is False]
    likely_cause = _pick_likely_cause(payload, focus, failing)
    cause_title = str(likely_cause.get("title") or "").strip()
    cause_why = str(likely_cause.get("why") or "").strip()

    def _scan_looks_clean() -> bool:
        # Be strict: only call it clean when there are no failing stages and the
        # main Android health buckets do not show suspicious activity.
        if failing:
            return False

        security = diag_details.get("security") if isinstance(diag_details.get("security"), dict) else {}
        suspicious_total = _as_number(security.get("suspiciousTotal"))
        if suspicious_total is None:
            try:
                suspicious_total = float(security.get("suspiciousHigh") or 0) + float(security.get("suspiciousMedium") or 0) + float(security.get("suspiciousLow") or 0)
            except Exception:
                suspicious_total = None
        if suspicious_total is not None and suspicious_total > 0:
            return False

        # If the scan did not collect any useful stage data, stay conservative.
        stage_values = [v for v in diag_stages.values() if isinstance(v, dict)]
        if not stage_values:
            return False

        return True

    reason_parts: List[str] = []
    clean_scan = _scan_looks_clean()

    if clean_scan:
        cause_title = "No problems detected"
        cause_why = "The current scan did not find failing diagnostic stages, suspicious apps, or other clear problem signals."
        label = "No problems detected"
        confidence = min(0.98, max(float(confidence), 0.90))
        summary = "No problems detected in the current scan."
        actions = ["Re-run the scan only if the phone starts acting up again."]
        reason_parts.append(cause_why)
    elif cause_title and cause_title != "No single clear cause yet":
        reason_parts.append(cause_title)
    if cause_why and not clean_scan:
        reason_parts.append(cause_why)
    if reported and not reason_parts:
        reason_parts.append(f"The scan does not yet show one clear cause for the reported problem: {reported}.")
    reason = " ".join(reason_parts).strip() or summary

    if clean_scan:
        label = "No problems detected"
    elif cause_title and cause_title != "No single clear cause yet":
        label = cause_title

    next_step = actions[0] if actions else "Re-run the scan while reproducing the exact problem so the failing category matches the real symptom."

    tokens = _feature_tokens(payload)
    memory: Dict[str, Any] = {"enabled": False}
    try:
        db_path = str(payload.get("memoryDb") or "")
        if not db_path:
            db_path = _default_memory_db_path()
        con = _open_db(db_path)
        memory["enabled"] = True
        memory["dbPath"] = db_path
        similar = _load_similar_cases(con, tokens)
        if similar:
            best = similar[0]
            memory["similarCount"] = len(similar)
            memory["bestScore"] = round(float(best.get("score") or 0.0), 3)
            # Prefer a remembered resolution if available.
            resolutions = [s.get("resolution") for s in similar if s.get("resolution")]
            if resolutions:
                actions.insert(0, f"From similar past cases: {resolutions[0]}")
                # Small bump when we have a close match.
                if float(best.get("score") or 0.0) >= 0.7:
                    confidence = min(0.92, confidence + 0.06)
            outcomes = [s.get("outcome") for s in similar if s.get("outcome")]
            if outcomes:
                memory["topOutcomes"] = outcomes[:3]
            # Mention similarity in summary (brief).
            summary += f" Similar past case match: {int(round(float(best.get('score') or 0.0) * 100))}% ."

        # Auto-record each run (local-only) unless explicitly disabled.
        if payload.get("autoRemember") is not False and payload.get("remember") is not True:
            failing = [t.split(":", 1)[1] for t in tokens if t.startswith("fail:")]
            auto_note = ""
            if reported:
                auto_note = f"Reported problem: {reported}"[:240]
            _append_case(
                con,
                tokens=tokens,
                label=label,
                confidence=float(confidence),
                failing=failing,
                actions=actions,
                note=auto_note,
            )
            memory["autoRemembered"] = True

        # Remember confirmed outcomes/fixes on demand.
        if payload.get("remember") is True:
            outcome = str(payload.get("outcome") or "").strip()
            resolution = str(payload.get("resolution") or "").strip()
            note = str(payload.get("note") or "").strip()
            failing = [t.split(":", 1)[1] for t in tokens if t.startswith("fail:")]
            _append_case(
                con,
                tokens=tokens,
                label=label,
                confidence=float(confidence),
                failing=failing,
                actions=actions,
                outcome=outcome,
                resolution=resolution,
                note=note,
            )
            memory["remembered"] = True
    except Exception as e:
        memory["enabled"] = False
        memory["error"] = str(e)

    return {
        "label": label,
        "confidence": round(float(confidence), 3),
        "summary": summary,
        "reason": reason,
        "likelyCause": cause_title,
        "why": cause_why,
        "nextStep": next_step,
        "howToFix": actions,
        "actions": actions,
        "memory": memory,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Path to input JSON")
    ap.add_argument("--remember", action="store_true", help="Store this case into local memory (requires outcome/resolution)")
    ap.add_argument("--outcome", default="", help="Confirmed outcome label (optional)")
    ap.add_argument("--resolution", default="", help="Confirmed resolution / fix applied (optional)")
    ap.add_argument("--note", default="", help="Optional technician note")
    ap.add_argument("--memory-db", default="", help="Override path to SQLite memory DB")
    args = ap.parse_args()

    try:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": f"Failed to read input JSON: {e}"}))
        return 2

    try:
        base = payload if isinstance(payload, dict) else {}
        if args.remember:
            base = dict(base)
            base["remember"] = True
            base["outcome"] = str(args.outcome or "")
            base["resolution"] = str(args.resolution or "")
            base["note"] = str(args.note or "")
        if args.memory_db:
            base = dict(base)
            base["memoryDb"] = str(args.memory_db)
        conclusion = build_conclusion(base)
        sys.stdout.write(json.dumps({"ok": True, "conclusion": conclusion}))
        return 0
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": f"Failed to build conclusion: {e}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
