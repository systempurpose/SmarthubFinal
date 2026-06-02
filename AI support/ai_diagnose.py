#!/usr/bin/env python3
"""AI-assisted no-debug diagnosis (offline).

This module intentionally avoids heavyweight ML dependencies so it can run
anywhere SmartHub runs. It is an interpretable scoring model:

- Extracts features from SmartHub JSON (connection-check + screen-visual-check)
- Produces ranked hypotheses with confidence and evidence

It is best-effort only: without USB debugging we do NOT have logs.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


HypothesisKey = str


SpecificCauseKey = str


@dataclass(frozen=True)
class Hypothesis:
    key: HypothesisKey
    label: str


HYPOTHESES: List[Hypothesis] = [
    Hypothesis("not_bsod", "No USB-only symptoms of BSoD (likely NOT a blue/blank boot-failure case)"),
    Hypothesis("display_hardware", "Display / connector / panel hardware fault (OS may still be alive)"),
    Hypothesis("software_firmware", "Software / firmware boot instability (system crash loop / corruption)"),
    Hypothesis("low_level_mode", "Low-level recovery mode (EDL / MTK preloader / DFU)"),
    Hypothesis("host_usb_driver", "Host-side USB driver / enumeration issue"),
    Hypothesis("power_mainboard", "Power / mainboard / deep hardware failure"),
]


_HYPOTHESIS_KEYS: List[HypothesisKey] = [h.key for h in HYPOTHESES]


def _normalize_outcome_label(outcome: str) -> HypothesisKey:
    """Normalize a technician-provided outcome label into a hypothesis key.

    This is intentionally conservative: for accuracy reporting we only map
    outcomes that look like our known hypothesis keys.
    """

    raw = str(outcome or "").strip()
    if not raw:
        return ""

    lowered = raw.lower()
    candidate = lowered.replace("-", "_").replace(" ", "_")
    if candidate in _HYPOTHESIS_KEYS:
        return candidate

    # Allow exact match on the human-readable hypothesis label.
    for h in HYPOTHESES:
        if lowered == str(h.label).strip().lower():
            return h.key

    return ""


def _parse_outcome_label(outcome: str) -> Tuple[str, str]:
    """Parse an outcome label into (kind, key).

    Backward-compatible: historically `outcome` stored a single label.
    Newer workflows may store multiple labels in a single string using
    separators like '|', ';', or newlines.

    Preferred multi-label format:
      - broad:<key>|bsod5:<key>|common5:<key>

    Kinds:
      - 'broad'   -> one of the main hypothesis keys (top.key)
      - 'bsod5'   -> one of the required BSOD-5 keys
      - 'common5' -> one of the common phone-problem keys
    """

    labels = _parse_outcome_labels(outcome)
    # Preserve prior behavior: return the first label present.
    for k in ("bsod5", "common5", "broad"):
        if k in labels and labels[k]:
            return (k, labels[k])
    return ("", "")


def _split_outcome_parts(outcome: str) -> List[str]:
    raw = str(outcome or "")
    if not raw.strip():
        return []
    # Common separators used when storing multiple labels.
    parts = re.split(r"[\|;\n\r]+", raw)
    out: List[str] = []
    for p in parts:
        s = str(p or "").strip()
        if s:
            out.append(s)
    return out


def _parse_outcome_labels(outcome: str) -> Dict[str, str]:
    """Parse 0..N labels from an outcome string.

    Returns a dict of kind->key. Unknown/invalid labels are ignored.
    This enables storing both broad + bsod5 labels for the same case.
    """

    parts = _split_outcome_parts(outcome)
    if not parts:
        return {}

    out: Dict[str, str] = {}
    for part in parts:
        lowered = str(part).strip().lower()

        # Explicit kind prefixes
        if lowered.startswith("bsod5:"):
            k = lowered[len("bsod5:") :].strip().replace("-", "_").replace(" ", "_")
            if k in set(_BSOD5_LABELS.keys()):
                out["bsod5"] = k
            continue

        if lowered.startswith("common5:"):
            k = lowered[len("common5:") :].strip().replace("-", "_").replace(" ", "_")
            if k in set(_COMMON5_LABELS.keys()):
                out["common5"] = k
            continue

        if lowered.startswith("broad:"):
            rest = part[len("broad:") :].strip()
            k = _normalize_outcome_label(rest)
            if k:
                out["broad"] = k
            continue

        # Default: treat as broad hypothesis key/label.
        k = _normalize_outcome_label(part)
        if k:
            out["broad"] = k

    return out


def _default_memory_db_path() -> Path:
    # Prefer a per-user writable location.
    # On Windows, installed builds typically live under Program Files,
    # which is not writable for non-admin users.
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~\\AppData\\Local")
        root = os.path.join(base, "SmartHubDiagnostics", "AI")
    else:
        root = os.path.join(os.path.expanduser("~"), ".local", "share", "smarthub", "ai")

    try:
        os.makedirs(root, exist_ok=True)
        return Path(root) / "memory.sqlite"
    except Exception:
        # Fall back to script directory if we cannot create the folder.
        return Path(__file__).resolve().parent / "memory.sqlite"


def _case_fingerprint(*, source: str, device_primary: str, tokens: List[str]) -> str:
    """Compute a stable fingerprint for de-duplicating identical cases.

    The goal is to prevent the memory DB from being dominated by repeated auto-saves
    of the same evidence pattern.
    """

    safe_source = str(source or "").strip().lower()
    safe_device = str(device_primary or "").strip().lower()
    norm_tokens = sorted({str(t).strip().lower() for t in (tokens or []) if str(t).strip()})
    payload = {
        "v": 1,
        "source": safe_source,
        "device": safe_device,
        "tokens": norm_tokens,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()  # 64 hex chars


def _safe_get(d: Dict[str, Any], path: List[str], default: Any = None) -> Any:
    cur: Any = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def _as_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _lower(s: Any) -> str:
    return str(s or "").lower()


def _softmax(scores: Dict[HypothesisKey, float]) -> Dict[HypothesisKey, float]:
    # Stable softmax
    mx = max(scores.values()) if scores else 0.0
    exps = {k: math.exp(v - mx) for k, v in scores.items()}
    denom = sum(exps.values()) or 1.0
    return {k: v / denom for k, v in exps.items()}


def _softmax_temp(scores: Dict[HypothesisKey, float], temperature: float) -> Dict[HypothesisKey, float]:
    """Softmax with temperature scaling.

    Higher temperature -> flatter probabilities (less overconfident).
    """
    t = float(temperature) if temperature and temperature > 0 else 1.0
    scaled = {k: (v / t) for k, v in scores.items()}
    return _softmax(scaled)


def _calibrate_top_probability(
    probs: Dict[HypothesisKey, float],
    *,
    top_key: HypothesisKey,
    max_top: float,
) -> Dict[HypothesisKey, float]:
    """Caps the top probability and re-normalizes others to preserve sum=1."""
    if not probs or top_key not in probs:
        return probs
    cap = float(max_top)
    if cap <= 0:
        return probs
    if cap >= 0.999:
        return probs

    top_p = float(probs.get(top_key, 0.0))
    if top_p <= cap:
        return probs

    remainder_old = max(1.0 - top_p, 0.0)
    remainder_new = max(1.0 - cap, 0.0)
    if remainder_old <= 1e-9:
        # Degenerate case: everything was on the top key.
        out = {k: 0.0 for k in probs}
        out[top_key] = cap
        # Spread the remainder uniformly.
        others = [k for k in probs.keys() if k != top_key]
        if others and remainder_new > 0:
            per = remainder_new / float(len(others))
            for k in others:
                out[k] = per
        return out

    scale = remainder_new / remainder_old
    out: Dict[HypothesisKey, float] = {}
    for k, v in probs.items():
        if k == top_key:
            out[k] = cap
        else:
            out[k] = float(v) * scale
    return out


def _tokenize(text: str) -> List[str]:
    out: List[str] = []
    cur: List[str] = []
    for ch in text.lower():
        if ch.isalnum() or ch in ("_", "-"):
            cur.append(ch)
        else:
            if cur:
                out.append("".join(cur))
                cur.clear()
    if cur:
        out.append("".join(cur))
    # Remove ultra-common noise tokens.
    stop = {"the", "a", "an", "and", "or", "to", "of", "is", "are", "in", "on", "from", "with"}
    return [t for t in out if t and t not in stop]


def _jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa = set(a)
    sb = set(b)
    if not sa and not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb) or 1
    return float(inter) / float(union)


def _token_weight(token: str) -> float:
    t = str(token or "")
    if t.startswith("bsod5:"):
        return 4.0
    if t.startswith("common5:"):
        return 3.2
    if t.startswith("spec:"):
        return 3.0
    if t.startswith("symptom:"):
        return 2.8
    if t.startswith("symhint:"):
        return 2.4
    if t.startswith("techmode:"):
        return 2.1
    if t.startswith("top:"):
        return 1.9
    if t.startswith("vid:") or t.startswith("pid:"):
        return 1.6
    if t.startswith("usb:") or t.startswith("mtp:"):
        return 1.3
    if t.startswith("vis:"):
        return 1.2
    if t.startswith("flag:"):
        return 1.0
    return 1.0


def _weighted_jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa = set([str(x) for x in a])
    sb = set([str(x) for x in b])
    if not sa and not sb:
        return 0.0
    inter = sa & sb
    union = sa | sb
    inter_w = sum(_token_weight(t) for t in inter)
    union_w = sum(_token_weight(t) for t in union) or 1.0
    return float(inter_w) / float(union_w)


def _tfidf_idf(docs: List[List[str]]) -> Dict[str, float]:
    """Compute IDF weights for token documents.

    Uses a smoothed IDF: log((N+1)/(df+1)) + 1
    """
    n = int(len(docs))
    if n <= 0:
        return {}
    df: Dict[str, int] = {}
    for toks in docs:
        for t in set([str(x) for x in toks]):
            if not t:
                continue
            df[t] = int(df.get(t, 0)) + 1
    out: Dict[str, float] = {}
    for t, dfi in df.items():
        out[t] = float(math.log((n + 1.0) / (float(dfi) + 1.0)) + 1.0)
    return out


def _tfidf_vector(tokens: List[str], idf: Dict[str, float]) -> Tuple[Dict[str, float], float]:
    counts: Dict[str, int] = {}
    for raw in tokens:
        t = str(raw)
        if not t:
            continue
        counts[t] = int(counts.get(t, 0)) + 1

    vec: Dict[str, float] = {}
    norm2 = 0.0
    for t, c in counts.items():
        # tf: sqrt(count) to prevent long reason lists dominating.
        tf = math.sqrt(float(c))
        w = float(idf.get(t, 1.0)) * float(_token_weight(t)) * tf
        if w <= 0.0:
            continue
        vec[t] = w
        norm2 += w * w
    return (vec, math.sqrt(norm2) if norm2 > 0 else 0.0)


def _tfidf_cosine(a_tokens: List[str], b_tokens: List[str], idf: Dict[str, float]) -> float:
    av, an = _tfidf_vector(a_tokens, idf)
    if an <= 1e-12:
        return 0.0
    bv, bn = _tfidf_vector(b_tokens, idf)
    if bn <= 1e-12:
        return 0.0
    # dot product over smaller dict
    if len(av) > len(bv):
        av, bv = bv, av
        an, bn = bn, an
    dot = 0.0
    for t, w in av.items():
        dot += w * float(bv.get(t, 0.0))
    return float(dot) / float((an * bn) or 1.0)


def _bucket_int(n: Any) -> str:
    try:
        v = int(n)
    except Exception:
        return ""
    if v <= 0:
        return "0"
    if v <= 2:
        return "1_2"
    if v <= 5:
        return "3_5"
    if v <= 10:
        return "6_10"
    return "11_plus"


def _bucket_float_0_1(x: Any) -> str:
    try:
        v = float(x)
    except Exception:
        return ""
    if v < 0.0:
        return ""
    if v < 0.55:
        return "lt_0_55"
    if v < 0.75:
        return "lt_0_75"
    if v < 0.9:
        return "lt_0_9"
    return "ge_0_9"


def _string_similarity(a: str, b: str) -> float:
    aa = str(a or "").strip().lower()
    bb = str(b or "").strip().lower()
    if not aa or not bb:
        return 0.0
    try:
        return float(difflib.SequenceMatcher(None, aa, bb).ratio())
    except Exception:
        return 0.0


def _extract_device_hints(connection: Dict[str, Any]) -> Dict[str, Any]:
    portable, transport = _phone_like_host_usb_lists(connection)

    portable_names = [str(p.get("name") or "") for p in portable if isinstance(p, dict) and p.get("name")]
    transport_names = [str(t.get("name") or "") for t in transport if isinstance(t, dict) and t.get("name")]
    vids = [str(t.get("vid") or "") for t in transport if isinstance(t, dict) and t.get("vid")]
    pids = [str(t.get("pid") or "") for t in transport if isinstance(t, dict) and t.get("pid")]

    primary = portable_names[0] if portable_names else (transport_names[0] if transport_names else "")
    return {
        "primary_name": primary,
        "portable_names": portable_names[:5],
        "transport_names": transport_names[:8],
        "vids": sorted({v.upper() for v in vids if v})[:8],
        "pids": sorted({p.upper() for p in pids if p})[:8],
    }


_NON_PHONE_USB_RE = re.compile(
    r"(microphone|headphone|headset|speaker|audio|usb audio|webcam|camera|video|hid|keyboard|mouse|gamepad|joystick|printer|scanner)",
    re.I,
)

_PHONE_LIKE_USB_RE = re.compile(
    r"(android|\bmtp\b|\bphone\b|adb|fastboot|bootloader|qdloader|9008|qhusb|edl|qualcomm|preloader|brom|mtk|mediatek|vcom|spreadtrum|\bspd\b|unisoc|download|odin|samsung|huawei|honor|xiaomi|redmi|oppo|vivo|oneplus|realme|motorola|lenovo|pixel|google|nokia|sony|lg|htc|tecno|infinix|itel)",
    re.I,
)


_ADB_TRANSPORT_RE = re.compile(
    r"(\badb\b|android\s+composite\s+adb|android\s+adb|interface\s+adb)",
    re.I,
)


def _is_adb_driver_transport(t: Any) -> bool:
    """Best-effort: detect a transport entry that represents the ADB interface.

    Windows may show a non-OK status for the ADB interface when the driver is missing,
    even while MTP is stable and the phone is healthy. That should not reduce the
    "stable MTP-only" Not-BSOD signal.
    """

    if not isinstance(t, dict):
        return False
    name = str(t.get("name") or "")
    cls = str(t.get("class") or t.get("className") or "")
    inst = str(t.get("instanceId") or "")
    manuf = str(t.get("manufacturer") or "")
    blob = f"{name} {cls} {manuf} {inst}".strip()
    if not blob:
        return False
    return bool(_ADB_TRANSPORT_RE.search(blob))


def _is_phone_like_portable_device(d: Any) -> bool:
    if not isinstance(d, dict):
        return False
    name = str(d.get("name") or "").strip()
    if not name:
        return False
    if _NON_PHONE_USB_RE.search(name):
        return False
    # Portable/WPD class itself is already a strong hint of a phone-like device.
    # Many devices expose generic names when locked / non-debuggable.
    cls = str(d.get("class") or d.get("className") or "").strip().lower()
    if cls in {"portable", "wpd"}:
        return True
    return bool(_PHONE_LIKE_USB_RE.search(name))


def _is_phone_like_transport_device(t: Any) -> bool:
    if not isinstance(t, dict):
        return False
    name = str(t.get("name") or "")
    status = str(t.get("status") or "")
    cls = str(t.get("class") or t.get("className") or "")
    manuf = str(t.get("manufacturer") or "")
    inst = str(t.get("instanceId") or "")
    vid = str(t.get("vid") or "")
    pid = str(t.get("pid") or "")
    combined = f"{name} {cls} {status} {manuf} {inst} {vid}:{pid}".strip()

    # Hard exclusions: common non-phone peripherals.
    if _NON_PHONE_USB_RE.search(combined):
        return False

    looks_phone_like = bool(_PHONE_LIKE_USB_RE.search(combined))

    # If Windows marks it as not OK, only treat as phone-related when it also looks phone-like.
    if status and status.upper() != "OK":
        return looks_phone_like

    return looks_phone_like


def _phone_like_host_usb_lists(connection: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (portable, transport) filtered to phone-like devices.

    This mirrors the UI's "Android phone only" policy to avoid false positives
    caused by unrelated USB peripherals on the host PC.
    """

    try:
        host_usb = connection.get("hostUsb") if isinstance(connection, dict) else None
        host_usb = host_usb if isinstance(host_usb, dict) else {}
        portable_raw = _as_list(host_usb.get("portableDevices"))
        transport_raw = _as_list(host_usb.get("transportDevices"))

        portable = [p for p in portable_raw if _is_phone_like_portable_device(p)]
        transport = [t for t in transport_raw if _is_phone_like_transport_device(t)]
        return portable, transport
    except Exception:
        return [], []


def _host_problem_code_summary(connection: Dict[str, Any]) -> Dict[str, Any]:
    """Summarize ConfigMgr problem codes from Windows PnP portable/transport lists.

    This complements helper-based evidence. It's still host-side evidence: it cannot
    prove phone-side BSOD root cause.
    """

    try:
        portable, transport = _phone_like_host_usb_lists(connection)
        driver_codes = {10, 22, 28, 31, 32, 37, 39, 43, 52}

        codes: set[int] = set()
        driver_problem_codes: set[int] = set()
        issue_count = 0

        for d in [*portable, *transport]:
            if not isinstance(d, dict):
                continue
            pc = d.get("problemCode")
            try:
                n = int(pc)
            except Exception:
                n = 0
            if n and n > 0:
                issue_count += 1
                codes.add(n)
                if n in driver_codes:
                    driver_problem_codes.add(n)

        return {
            "issue_count": int(issue_count),
            "problem_codes": sorted({int(x) for x in codes}),
            "driver_problem_codes": sorted({int(x) for x in driver_problem_codes}),
        }
    except Exception:
        return {"issue_count": 0, "problem_codes": [], "driver_problem_codes": []}


def _native_usb_driver_issue_summary(connection: Dict[str, Any]) -> Dict[str, Any]:
    """Summarize native USB evidence into a small, scoring-friendly shape.

    We treat common ConfigMgr problem codes as host driver/enumeration signals.
    This is intentionally conservative: it never *proves* phone BSOD.
    """

    try:
        host_usb = connection.get("hostUsb") if isinstance(connection, dict) else None
        host_usb = host_usb if isinstance(host_usb, dict) else {}
        native = host_usb.get("nativeUsbEvidence")
        if not isinstance(native, dict) or not bool(native.get("ok")):
            return {"phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}

        evidence = native.get("evidence")
        devices = _as_list((evidence or {}).get("devices")) if isinstance(evidence, dict) else []
        if not devices:
            return {"phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}

        non_phone = re.compile(
            r"(microphone|headphone|audio|speaker|headset|webcam|camera|video|hid|keyboard|mouse|gamepad|joystick|printer|scanner)",
            re.I,
        )
        phone = re.compile(
            r"(android|\bmtp\b|\bphone\b|adb|fastboot|bootloader|qdloader|9008|qhusb|edl|qualcomm|preloader|brom|mtk|mediatek|vcom|spreadtrum|spd|unisoc|download|odin|samsung|huawei|honor|xiaomi|redmi|oppo|vivo|oneplus|realme|motorola|pixel|google|nokia|sony|lg|htc|tecno|infinix|itel)",
            re.I,
        )
        driver_codes = {10, 22, 28, 31, 32, 37, 39, 43, 52}

        phone_like = []
        for d in devices:
            if not isinstance(d, dict):
                continue
            blob = " ".join(
                [
                    str(d.get("friendlyName") or ""),
                    str(d.get("deviceDesc") or ""),
                    str(d.get("manufacturer") or ""),
                    str(d.get("className") or ""),
                    " ".join([str(x or "") for x in _as_list(d.get("hardwareIds"))][:12]),
                    " ".join([str(x or "") for x in _as_list(d.get("compatibleIds"))][:12]),
                ]
            ).strip()
            if not blob:
                continue
            if non_phone.search(blob):
                continue
            if phone.search(blob):
                phone_like.append(d)

        problem_codes = []
        driver_problem_codes = []
        driver_issue_count = 0
        for d in phone_like:
            pc = d.get("problemCode")
            try:
                n = int(pc)
            except Exception:
                continue
            if n <= 0:
                continue
            problem_codes.append(n)
            if n in driver_codes:
                driver_issue_count += 1
                driver_problem_codes.append(n)

        return {
            "phone_like_count": int(len(phone_like)),
            "driver_issue_count": int(driver_issue_count),
            "driver_problem_codes": sorted({int(x) for x in driver_problem_codes}),
            "problem_codes": sorted({int(x) for x in problem_codes}),
        }
    except Exception:
        return {"phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}


def _eventlog_usb_issue_summary(connection: Dict[str, Any]) -> Dict[str, Any]:
    """Summarize recent Windows Event Log evidence (USB/PnP related).

    This is a host-side signal only; it should never be treated as proof of a phone-side BSOD.
    """

    try:
        host_usb = connection.get("hostUsb") if isinstance(connection, dict) else None
        host_usb = host_usb if isinstance(host_usb, dict) else {}
        ev = host_usb.get("usbEventLogEvidence")
        if not isinstance(ev, dict) or not bool(ev.get("ok")):
            return {"event_count": 0, "pnp_usb_issue_count": 0, "notable": []}

        evidence = ev.get("evidence")
        if not isinstance(evidence, dict):
            return {"event_count": 0, "pnp_usb_issue_count": 0, "notable": []}

        events = _as_list(evidence.get("events"))
        if not events:
            return {"event_count": 0, "pnp_usb_issue_count": 0, "notable": []}

        pnp_providers = {
            "microsoft-windows-kernel-pnp",
            "microsoft-windows-userpnp",
            "microsoft-windows-usb-usbport",
            "microsoft-windows-usb-ucx",
            "microsoft-windows-driverframeworks-usermode",
        }

        # Common host-side enumeration/driver/USB reset phrases
        kw = re.compile(
            r"(device not migrated|could not be started|driver(\\s+)?failed|\breset\b|\bdescriptor\b|\bport\b|\benumerat|unknown usb device|code\s*43|cm_prob|failed to load)",
            re.I,
        )

        issue = 0
        notable: List[str] = []
        for e in events:
            if not isinstance(e, dict):
                continue
            prov = str(e.get("provider") or "").strip().lower()
            try:
                eid = int(e.get("event_id")) if e.get("event_id") is not None else None
            except Exception:
                eid = None
            desc = str(e.get("description") or "").strip()

            if prov in pnp_providers:
                issue += 1
            elif desc and kw.search(desc):
                issue += 1

            if len(notable) < 4:
                if (prov in pnp_providers) or (desc and kw.search(desc)):
                    tag = f"{prov or 'event'}#{eid}" if eid is not None else (prov or "event")
                    sample = desc.replace("\r", " ").replace("\n", " ")
                    sample = re.sub(r"\s+", " ", sample).strip()
                    if len(sample) > 180:
                        sample = sample[:180] + "…"
                    notable.append(f"{tag}: {sample}" if sample else str(tag))

        return {
            "event_count": int(len(events)),
            "pnp_usb_issue_count": int(issue),
            "notable": notable,
        }
    except Exception:
        return {"event_count": 0, "pnp_usb_issue_count": 0, "notable": []}


def _pnp_snapshot_issue_summary(connection: Dict[str, Any]) -> Dict[str, Any]:
    """Summarize PnP snapshot helper output (host-side problem codes).

    The C++ helper does a broad snapshot; we only use it as a weak host-driver signal.
    """

    try:
        host_usb = connection.get("hostUsb") if isinstance(connection, dict) else None
        host_usb = host_usb if isinstance(host_usb, dict) else {}
        snap = host_usb.get("pnpSnapshotEvidence")
        if not isinstance(snap, dict) or not bool(snap.get("ok")):
            return {"device_count": 0, "phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}

        evidence = snap.get("evidence")
        if not isinstance(evidence, dict):
            return {"device_count": 0, "phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}

        devices = _as_list(evidence.get("devices"))
        if not devices:
            return {"device_count": 0, "phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}

        non_phone = re.compile(
            r"(microphone|headphone|audio|speaker|headset|webcam|camera|video|hid|keyboard|mouse|gamepad|joystick|printer|scanner)",
            re.I,
        )
        phone = re.compile(
            r"(android|\bmtp\b|\bphone\b|adb|fastboot|bootloader|qdloader|9008|qhusb|edl|qualcomm|preloader|brom|mtk|mediatek|vcom|spreadtrum|spd|unisoc|download|odin|samsung|huawei|honor|xiaomi|redmi|oppo|vivo|oneplus|realme|motorola|pixel|google|nokia|sony|lg|htc|tecno|infinix|itel)",
            re.I,
        )
        driver_codes = {10, 22, 28, 31, 32, 37, 39, 43, 52}

        phone_like = []
        for d in devices:
            if not isinstance(d, dict):
                continue
            blob = " ".join(
                [
                    str(d.get("friendlyName") or ""),
                    str(d.get("deviceDesc") or ""),
                    str(d.get("manufacturer") or ""),
                    str(d.get("instanceId") or ""),
                ]
            ).strip()
            if not blob:
                continue
            if non_phone.search(blob):
                continue
            if phone.search(blob):
                phone_like.append(d)

        driver_problem_codes: List[int] = []
        driver_issue_count = 0
        for d in phone_like:
            pc = d.get("problemCode")
            try:
                n = int(pc)
            except Exception:
                continue
            if n <= 0:
                continue
            if n in driver_codes:
                driver_issue_count += 1
                driver_problem_codes.append(n)

        return {
            "device_count": int(len(devices)),
            "phone_like_count": int(len(phone_like)),
            "driver_issue_count": int(driver_issue_count),
            "driver_problem_codes": sorted({int(x) for x in driver_problem_codes}),
        }
    except Exception:
        return {"device_count": 0, "phone_like_count": 0, "driver_issue_count": 0, "driver_problem_codes": []}


def _extract_feature_tokens(connection: Dict[str, Any], visual: Optional[Dict[str, Any]], report: Dict[str, Any]) -> List[str]:
    tokens: List[str] = []

    # Booleans
    inputs = report.get("inputs") if isinstance(report, dict) else None
    if isinstance(inputs, dict):
        for k, v in inputs.items():
            if isinstance(v, bool) and v:
                tokens.append(f"flag:{k}")
            if k == "visual_stability" and v is not None:
                try:
                    vs = float(v)
                    if vs >= 0.8:
                        tokens.append("visual:stable")
                except Exception:
                    pass

        # Bucketed numeric signals for better similarity (avoid exact values).
        try:
            usb_bucket = _bucket_float_0_1(inputs.get("usb_stability"))
            if usb_bucket:
                tokens.append(f"usb_stab:{usb_bucket}")
        except Exception:
            pass
        try:
            chg_bucket = _bucket_int(inputs.get("usb_change_count"))
            if chg_bucket:
                tokens.append(f"usb_chg:{chg_bucket}")
        except Exception:
            pass
        try:
            mtp_bucket = _bucket_int(inputs.get("mtp_count"))
            if mtp_bucket:
                tokens.append(f"mtp_cnt:{mtp_bucket}")
        except Exception:
            pass
        try:
            usb_bucket = _bucket_int(inputs.get("transport_count"))
            if usb_bucket:
                tokens.append(f"usb_cnt:{usb_bucket}")
        except Exception:
            pass
        try:
            bad_bucket = _bucket_int(inputs.get("portable_not_ok_count"))
            if bad_bucket and bad_bucket != "0":
                tokens.append(f"wpd_bad:{bad_bucket}")
        except Exception:
            pass

    # Server heuristic category/reasons
    bsod = connection.get("bsodAnalysis") or {}
    bsod_cat = str(bsod.get("category") or "")
    tokens.extend([f"bsod:{t}" for t in _tokenize(bsod_cat)])
    for r in _as_list(bsod.get("reasons")):
        tokens.extend([f"bsodr:{t}" for t in _tokenize(str(r))][:12])

    # Visual category
    if isinstance(visual, dict) and isinstance(visual.get("analysis"), dict):
        vcat = str(visual["analysis"].get("category") or "")
        tokens.extend([f"vis:{t}" for t in _tokenize(vcat)])

    # USB hints
    hints = _extract_device_hints(connection)
    for name in hints.get("portable_names", []):
        tokens.extend([f"mtp:{t}" for t in _tokenize(name)])
    for name in hints.get("transport_names", []):
        tokens.extend([f"usb:{t}" for t in _tokenize(name)])
    for v in hints.get("vids", []):
        tokens.append(f"vid:{v}")
    for p in hints.get("pids", []):
        tokens.append(f"pid:{p}")

    # Optional host-side helper evidence (bucketed)
    try:
        evs = _eventlog_usb_issue_summary(connection)
        ev_cnt = int(evs.get("event_count") or 0)
        issue_cnt = int(evs.get("pnp_usb_issue_count") or 0)
        if ev_cnt > 0:
            tokens.append(f"evlog:{_bucket_int(ev_cnt)}")
        if issue_cnt > 0:
            tokens.append(f"evusb:{_bucket_int(issue_cnt)}")
    except Exception:
        pass

    try:
        snap = _pnp_snapshot_issue_summary(connection)
        di = int(snap.get("driver_issue_count") or 0)
        plc = int(snap.get("phone_like_count") or 0)
        if plc > 0:
            tokens.append(f"pnpphone:{_bucket_int(plc)}")
        if di > 0:
            tokens.append(f"pnpdrv:{_bucket_int(di)}")
    except Exception:
        pass

    # Windows PnP ProblemCode summary (from hostUsb portable/transport lists)
    try:
        hs = _host_problem_code_summary(connection)
        dpc = hs.get("driver_problem_codes") if isinstance(hs.get("driver_problem_codes"), list) else []
        if dpc:
            tokens.append("flag:host_problem_code_present")
            # Stable, low-cardinality: only record the common driver-related codes.
            for code in [int(x) for x in dpc if isinstance(x, int) or str(x).isdigit()][:4]:
                tokens.append(f"host:pcode:{code}")
    except Exception:
        pass

    # Top hypothesis
    top = report.get("top") if isinstance(report, dict) else None
    if isinstance(top, dict) and isinstance(top.get("key"), str):
        tokens.append(f"top:{top['key']}")

    # Required 5-cause BSOD label (preferred for memory)
    bsod5 = report.get("bsod5") if isinstance(report, dict) else None
    if isinstance(bsod5, dict) and isinstance(bsod5.get("key"), str):
        tokens.append(f"bsod5:{bsod5['key']}")

    common5 = report.get("common5") if isinstance(report, dict) else None
    if isinstance(common5, dict) and isinstance(common5.get("top"), dict):
        ck = str(common5["top"].get("key") or "")
        if ck:
            tokens.append(f"common5:{ck}")

    # Specific (more technician-friendly) cause label
    spec = report.get("specific") if isinstance(report, dict) else None
    if isinstance(spec, dict) and isinstance(spec.get("key"), str):
        tokens.append(f"spec:{spec['key']}")

    # Technician-confirmed mode (if provided)
    user_tech = connection.get("userTech") if isinstance(connection, dict) else None
    if not isinstance(user_tech, dict):
        user_tech = connection.get("technician") if isinstance(connection, dict) else None
    if isinstance(user_tech, dict):
        mode = str(user_tech.get("confirmedMode") or "").strip().lower()
        if mode:
            tokens.extend([f"techmode:{t}" for t in _tokenize(mode)])

    # Fastboot deep evidence (best-effort, low-cardinality tokens only)
    try:
        sig = _extract_signals(connection)
        fb_vars = sig.get("fastboot_vars") if isinstance(sig.get("fastboot_vars"), dict) else {}
        if fb_vars:
            tokens.append("flag:fastboot_getvar_collected")
            snap = _lower(fb_vars.get("snapshot-update-status") or fb_vars.get("snapshot_state") or "")
            if snap and snap not in ("none", "ok", "success"):
                tokens.append(f"fb:snapshot:{snap[:24]}")

            slot = _lower(fb_vars.get("current-slot") or fb_vars.get("slot-suffix") or "")
            if slot:
                tokens.append(f"fb:slot:{slot}")

            unlocked = _lower(fb_vars.get("unlocked") or "")
            if unlocked in ("yes", "no", "true", "false", "1", "0"):
                tokens.append(f"fb:unlocked:{unlocked}")

        log_keys = sig.get("log_keys") if isinstance(sig.get("log_keys"), set) else set()
        if log_keys:
            tokens.append("flag:adb_log_evidence")
            for k in sorted([str(x) for x in log_keys if x])[:4]:
                tokens.append(f"adb:log:{k}")
    except Exception:
        pass

    # Optional user/technician symptom hint (structured)
    user_sym = connection.get("userSymptom") if isinstance(connection, dict) else None
    if isinstance(user_sym, dict):
        choice = str(user_sym.get("choice") or "").strip()
        if choice:
            tokens.append(f"symptom:{choice}")

        note = str(user_sym.get("text") or "").strip()
        if note:
            tokens.extend([f"sym:{t}" for t in _tokenize(note)][:12])

        details = user_sym.get("details")
        if isinstance(details, dict):
            for k in [
                "charging",
                "afterCharge",
                "recentUpdate",
                "recentApp",
                "safeModeImproves",
                "drop",
                "liquid",
                # Technician confirmation hooks (UI-driven). These are not device-read;
                # they are human-confirmed evidence used for later metrics.
                "screenTestFixed",
                "worksOtherPc",
            ]:
                if bool(details.get(k)):
                    tokens.append(f"symhint:{k}")

    return tokens


def _open_memory_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER NOT NULL,
          last_seen INTEGER,
          seen_count INTEGER,
          source TEXT NOT NULL,
          device_primary TEXT,
          fingerprint TEXT,
          device_hints_json TEXT NOT NULL,
          feature_tokens_json TEXT NOT NULL,
          report_json TEXT NOT NULL,
          note TEXT,
          outcome TEXT
        )
        """
    )

    # Lightweight schema migration for older DBs.
    try:
        cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
        if "last_seen" not in cols:
            conn.execute("ALTER TABLE cases ADD COLUMN last_seen INTEGER")
        if "seen_count" not in cols:
            conn.execute("ALTER TABLE cases ADD COLUMN seen_count INTEGER")
        if "fingerprint" not in cols:
            conn.execute("ALTER TABLE cases ADD COLUMN fingerprint TEXT")

        conn.execute("CREATE INDEX IF NOT EXISTS cases_fingerprint_idx ON cases(fingerprint)")
        conn.execute("CREATE INDEX IF NOT EXISTS cases_outcome_idx ON cases(outcome)")

        # Backfill basic defaults.
        conn.execute("UPDATE cases SET seen_count = 1 WHERE seen_count IS NULL OR seen_count < 1")
        conn.execute("UPDATE cases SET last_seen = created_at WHERE last_seen IS NULL OR last_seen < 1")

        # Backfill missing fingerprints (best-effort; DB is expected to be small).
        cols2 = {str(r[1]) for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
        if "fingerprint" in cols2:
            missing = conn.execute(
                "SELECT id, source, device_primary, feature_tokens_json FROM cases WHERE fingerprint IS NULL OR TRIM(fingerprint) = '' LIMIT 5000"
            ).fetchall()
            for (cid, source, device_primary, tokens_json) in missing:
                tokens: List[str] = []
                try:
                    parsed = json.loads(tokens_json)
                    tokens = parsed if isinstance(parsed, list) else []
                except Exception:
                    tokens = []
                fp = _case_fingerprint(source=str(source or ""), device_primary=str(device_primary or ""), tokens=tokens)
                conn.execute("UPDATE cases SET fingerprint = ? WHERE id = ?", (fp, int(cid)))
    except Exception:
        # Never fail diagnosis due to memory migration.
        pass

    conn.commit()
    return conn


def _memory_save_case(
    db_path: Path,
    *,
    source: str,
    connection: Dict[str, Any],
    visual: Optional[Dict[str, Any]],
    report: Dict[str, Any],
    note: str = "",
    outcome: str = "",
) -> int:
    hints = _extract_device_hints(connection)
    tokens = _extract_feature_tokens(connection, visual, report)
    created_at = int(time.time())
    device_primary = str(hints.get("primary_name") or "")
    fingerprint = _case_fingerprint(source=str(source or ""), device_primary=device_primary, tokens=tokens)
    with _open_memory_db(db_path) as conn:
        # Prefer de-dup by fingerprint. This prevents repeated auto-remembers
        # from bloating the DB and hiding labeling progress.
        try:
            row = conn.execute(
                "SELECT id, outcome, seen_count FROM cases WHERE fingerprint = ? ORDER BY id DESC LIMIT 1",
                (fingerprint,),
            ).fetchone()
            if row:
                cid, existing_outcome, existing_seen = row
                outc = str(outcome or "").strip()
                has_outcome = bool(outc)
                existing_has_outcome = bool(str(existing_outcome or "").strip())

                # Always bump counters.
                conn.execute(
                    "UPDATE cases SET last_seen = ?, seen_count = ? WHERE id = ?",
                    (int(created_at), int(max(1, int(existing_seen or 1))) + 1, int(cid)),
                )

                # Upgrade with label if present and previously unlabeled.
                if has_outcome and not existing_has_outcome:
                    conn.execute(
                        "UPDATE cases SET outcome = ?, note = ?, report_json = ? WHERE id = ?",
                        (
                            outc,
                            str(note or ""),
                            json.dumps(report, ensure_ascii=False),
                            int(cid),
                        ),
                    )
                elif str(note or "").strip():
                    # Keep the latest note/report if provided (best-effort).
                    conn.execute(
                        "UPDATE cases SET note = ?, report_json = ? WHERE id = ?",
                        (str(note or ""), json.dumps(report, ensure_ascii=False), int(cid)),
                    )

                conn.commit()
                return int(cid)
        except Exception:
            pass

        cur = conn.execute(
            """
            INSERT INTO cases (created_at, last_seen, seen_count, source, device_primary, fingerprint, device_hints_json, feature_tokens_json, report_json, note, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                created_at,
                1,
                source,
                device_primary,
                fingerprint,
                json.dumps(hints, ensure_ascii=False),
                json.dumps(tokens, ensure_ascii=False),
                json.dumps(report, ensure_ascii=False),
                note,
                outcome,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)


def _memory_list_cases(db_path: Path, limit: int = 20) -> List[Dict[str, Any]]:
    if not db_path.exists():
        return []
    with _open_memory_db(db_path) as conn:
        rows = conn.execute(
            "SELECT id, created_at, source, device_primary, note, outcome, report_json FROM cases ORDER BY id DESC LIMIT ?",
            (int(limit),),
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for (cid, created_at, source, device_primary, note, outcome, report_json) in rows:
        top_key = ""
        top_label = ""
        try:
            rep = json.loads(report_json)
            # Prefer the required 5-cause BSOD label if present.
            if isinstance(rep, dict) and isinstance(rep.get("bsod5"), dict):
                bk = str(rep["bsod5"].get("key") or "")
                bl = str(rep["bsod5"].get("label") or "")
                if bk or bl:
                    top_key = bk
                    top_label = bl
                # If this is explicitly Not BSOD, show the general common cause too (if available).
                if bk == "not_bsod" and isinstance(rep.get("common5"), dict) and isinstance(rep["common5"].get("top"), dict):
                    ck = str(rep["common5"]["top"].get("key") or "")
                    cl = str(rep["common5"]["top"].get("label") or "")
                    if ck or cl:
                        top_key = ck or top_key
                        top_label = f"Not BSOD — {cl or ck}".strip()
            if isinstance(rep, dict) and isinstance(rep.get("top"), dict):
                if not top_key and not top_label:
                    top_key = str(rep["top"].get("key") or "")
                    top_label = str(rep["top"].get("label") or "")
            # Prefer a human-friendly specific cause if present.
            if isinstance(rep, dict) and isinstance(rep.get("specific"), dict):
                sk = str(rep["specific"].get("key") or "")
                sl = str(rep["specific"].get("label") or "")
                if sk or sl:
                    if not (isinstance(rep, dict) and isinstance(rep.get("bsod5"), dict) and (str(rep["bsod5"].get("key") or "") or str(rep["bsod5"].get("label") or ""))):
                        top_key = sk or top_key
                        top_label = sl or top_label
        except Exception:
            pass
        out.append(
            {
                "id": int(cid),
                "created_at": int(created_at),
                "source": str(source),
                "device_primary": str(device_primary or ""),
                "top_key": top_key,
                "top_label": top_label,
                "note": str(note or ""),
                "outcome": str(outcome or ""),
            }
        )
    return out


def _memory_get_case(db_path: Path, case_id: int) -> Optional[Dict[str, Any]]:
    if not db_path.exists():
        return None
    with _open_memory_db(db_path) as conn:
        row = conn.execute(
            "SELECT id, created_at, last_seen, seen_count, source, device_primary, fingerprint, device_hints_json, feature_tokens_json, report_json, note, outcome FROM cases WHERE id = ?",
            (int(case_id),),
        ).fetchone()
    if not row:
        return None
    (
        cid,
        created_at,
        last_seen,
        seen_count,
        source,
        device_primary,
        fingerprint,
        hints_json,
        tokens_json,
        report_json,
        note,
        outcome,
    ) = row
    hints = {}
    tokens: List[str] = []
    report: Any = {}
    try:
        hints = json.loads(hints_json)
    except Exception:
        hints = {}
    try:
        tokens = json.loads(tokens_json)
    except Exception:
        tokens = []
    try:
        report = json.loads(report_json)
    except Exception:
        report = {}
    return {
        "id": int(cid),
        "created_at": int(created_at),
        "last_seen": int(last_seen or 0),
        "seen_count": int(seen_count or 1),
        "source": str(source),
        "device_primary": str(device_primary or ""),
        "fingerprint": str(fingerprint or ""),
        "device_hints": hints,
        "feature_tokens": tokens,
        "report": report,
        "note": str(note or ""),
        "outcome": str(outcome or ""),
    }


def _memory_stats(db_path: Path) -> Dict[str, Any]:
    """Return lightweight memory DB stats to encourage labeling.

    This is intentionally simple and fast; used only for UX nudges and visibility.
    """
    if not db_path.exists():
        return {
            "total": 0,
            "labeled": 0,
            "unlabeled": 0,
            "distinct_cases": 0,
            "repeat_saves": 0,
            "unlabeled_oldest_age_sec": None,
            "labeled_by_kind": {"broad": 0, "bsod5": 0, "common5": 0},
        }

    total = 0
    labeled = 0
    unlabeled = 0
    distinct_cases = 0
    repeat_saves = 0
    unlabeled_oldest_age_sec: Optional[int] = None
    by_kind: Dict[str, int] = {"broad": 0, "bsod5": 0, "common5": 0}

    try:
        with _open_memory_db(db_path) as conn:
            row = conn.execute("SELECT COUNT(*) FROM cases").fetchone()
            total = int(row[0] or 0) if row else 0

            # Distinct cases (fingerprint-based) and repeat saves (seen_count).
            try:
                cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
                if "fingerprint" in cols:
                    row = conn.execute(
                        "SELECT COUNT(DISTINCT fingerprint) FROM cases WHERE fingerprint IS NOT NULL AND TRIM(fingerprint) <> ''"
                    ).fetchone()
                    distinct_cases = int(row[0] or 0) if row else 0
                else:
                    distinct_cases = total

                if "seen_count" in cols:
                    row = conn.execute("SELECT SUM(COALESCE(seen_count, 1)) FROM cases").fetchone()
                    total_seen = int(row[0] or 0) if row else 0
                    repeat_saves = int(max(0, total_seen - int(total)))
            except Exception:
                distinct_cases = total
                repeat_saves = 0

            row = conn.execute("SELECT COUNT(*) FROM cases WHERE outcome IS NOT NULL AND TRIM(outcome) <> ''").fetchone()
            labeled = int(row[0] or 0) if row else 0
            row = conn.execute("SELECT COUNT(*) FROM cases WHERE outcome IS NULL OR TRIM(outcome) = ''").fetchone()
            unlabeled = int(row[0] or 0) if row else 0

            if unlabeled > 0:
                row = conn.execute("SELECT MIN(created_at) FROM cases WHERE outcome IS NULL OR TRIM(outcome) = ''").fetchone()
                oldest = int(row[0] or 0) if row and row[0] is not None else 0
                if oldest > 0:
                    unlabeled_oldest_age_sec = int(max(0, int(time.time()) - oldest))

            # Label kinds
            row = conn.execute("SELECT COUNT(*) FROM cases WHERE outcome IS NOT NULL AND TRIM(outcome) <> '' AND LOWER(TRIM(outcome)) LIKE 'bsod5:%'").fetchone()
            by_kind["bsod5"] = int(row[0] or 0) if row else 0
            row = conn.execute("SELECT COUNT(*) FROM cases WHERE outcome IS NOT NULL AND TRIM(outcome) <> '' AND LOWER(TRIM(outcome)) LIKE 'common5:%'").fetchone()
            by_kind["common5"] = int(row[0] or 0) if row else 0
            row = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE outcome IS NOT NULL AND TRIM(outcome) <> '' AND LOWER(TRIM(outcome)) NOT LIKE 'bsod5:%' AND LOWER(TRIM(outcome)) NOT LIKE 'common5:%'"
            ).fetchone()
            by_kind["broad"] = int(row[0] or 0) if row else 0
    except Exception:
        # Best-effort; never fail diagnosis.
        pass

    return {
        "total": int(max(0, total)),
        "labeled": int(max(0, labeled)),
        "unlabeled": int(max(0, unlabeled)),
        "distinct_cases": int(max(0, distinct_cases if distinct_cases else total)),
        "repeat_saves": int(max(0, repeat_saves)),
        "unlabeled_oldest_age_sec": unlabeled_oldest_age_sec,
        "labeled_by_kind": {k: int(max(0, v)) for k, v in by_kind.items()},
    }


def _memory_find_similar(
    db_path: Path,
    *,
    connection: Dict[str, Any],
    visual: Optional[Dict[str, Any]],
    report: Dict[str, Any],
    limit: int = 5,
    lookback: int = 200,
) -> List[Dict[str, Any]]:
    if not db_path.exists():
        return []

    query_tokens = _extract_feature_tokens(connection, visual, report)
    if not query_tokens:
        return []

    with _open_memory_db(db_path) as conn:
        rows = conn.execute(
            "SELECT id, created_at, device_primary, note, outcome, feature_tokens_json, report_json FROM cases ORDER BY id DESC LIMIT ?",
            (int(lookback),),
        ).fetchall()

    # Parse tokens once so we can compute TF-IDF IDF weights.
    parsed_rows: List[Tuple[int, int, str, str, str, List[str], str]] = []
    for (cid, created_at, device_primary, note, outcome, tokens_json, report_json) in rows:
        try:
            tokens = json.loads(tokens_json)
            if not isinstance(tokens, list):
                continue
            parsed_rows.append(
                (
                    int(cid),
                    int(created_at),
                    str(device_primary or ""),
                    str(note or ""),
                    str(outcome or ""),
                    [str(t) for t in tokens],
                    str(report_json or "{}"),
                )
            )
        except Exception:
            continue

    idf = _tfidf_idf([r[5] for r in parsed_rows])

    query_hints = _extract_device_hints(connection)
    query_primary = str(query_hints.get("primary_name") or "")
    scored: List[Tuple[float, Dict[str, Any]]] = []
    for (cid, created_at, device_primary, note, outcome, tokens, report_json) in parsed_rows:
        # Similarity: combine TF-IDF cosine (discriminative) with weighted Jaccard (robust).
        sim_cos = _tfidf_cosine([str(t) for t in query_tokens], tokens, idf)
        sim_j = _weighted_jaccard(query_tokens, tokens)
        base_sim = (0.62 * float(sim_cos)) + (0.38 * float(sim_j))

        # Small boost for same/similar device name (helps consistency across repeated repairs).
        dev_sim = _string_similarity(query_primary, str(device_primary or ""))
        sim = float(base_sim)
        if dev_sim >= 0.72:
            sim = min(1.0, sim + 0.06)
        elif dev_sim >= 0.55:
            sim = min(1.0, sim + 0.03)
        if sim <= 0.0:
            continue

        top_key = ""
        top_label = ""
        try:
            rep = json.loads(report_json)
            # Prefer the required 5-cause BSOD label if present.
            if isinstance(rep, dict) and isinstance(rep.get("bsod5"), dict):
                bk = str(rep["bsod5"].get("key") or "")
                bl = str(rep["bsod5"].get("label") or "")
                if bk or bl:
                    top_key = bk
                    top_label = bl
                # If this is explicitly Not BSOD, show the general common cause too (if available).
                if bk == "not_bsod" and isinstance(rep.get("common5"), dict) and isinstance(rep["common5"].get("top"), dict):
                    ck = str(rep["common5"]["top"].get("key") or "")
                    cl = str(rep["common5"]["top"].get("label") or "")
                    if ck or cl:
                        top_key = ck or top_key
                        top_label = f"Not BSOD — {cl or ck}".strip()
            if isinstance(rep, dict) and isinstance(rep.get("top"), dict):
                if not top_key and not top_label:
                    top_key = str(rep["top"].get("key") or "")
                    top_label = str(rep["top"].get("label") or "")
            # Prefer a human-friendly specific cause if present.
            if isinstance(rep, dict) and isinstance(rep.get("specific"), dict):
                sk = str(rep["specific"].get("key") or "")
                sl = str(rep["specific"].get("label") or "")
                if sk or sl:
                    if not (isinstance(rep, dict) and isinstance(rep.get("bsod5"), dict) and (str(rep["bsod5"].get("key") or "") or str(rep["bsod5"].get("label") or ""))):
                        top_key = sk or top_key
                        top_label = sl or top_label
        except Exception:
            pass

        scored.append(
            (
                sim,
                {
                    "id": int(cid),
                    "created_at": int(created_at),
                    "device_primary": str(device_primary or ""),
                    "similarity": round(float(sim), 4),
                    "top_key": top_key,
                    "top_label": top_label,
                    "note": str(note or ""),
                    "outcome": str(outcome or ""),
                },
            )
        )

    scored.sort(key=lambda x: x[0], reverse=True)
    out = [s[1] for s in scored[: int(limit)]]
    return out


def _memory_metrics(db_path: Path, *, lookback: int = 500) -> Dict[str, Any]:
    """Compute top-1 accuracy from remembered cases that have outcomes.

    A case is "usable" when:
    - outcome can be normalized to a known hypothesis key
    - report.top.key exists
    """

    if not db_path.exists():
        return {
            "ok": True,
            "memory_db": str(db_path),
            "lookback": int(lookback),
            "labeled": 0,
            "usable": 0,
            "correct": 0,
            "accuracy": None,
            "confusion": {},
            "unmapped_outcomes": [],
            "expected_outcome_keys": list(_HYPOTHESIS_KEYS),
            "metrics_by_kind": {
                "broad": {
                    "expected_keys": list(_HYPOTHESIS_KEYS),
                    "labeled": 0,
                    "usable": 0,
                    "correct": 0,
                    "accuracy": None,
                    "accuracy_percent": None,
                    "confusion": {},
                    "unmapped_outcomes": [],
                },
                "bsod5": {
                    "expected_keys": list(_BSOD5_LABELS.keys()),
                    "labeled": 0,
                    "usable": 0,
                    "correct": 0,
                    "accuracy": None,
                    "accuracy_percent": None,
                    "confusion": {},
                    "unmapped_outcomes": [],
                },
                "common5": {
                    "expected_keys": list(_COMMON5_LABELS.keys()),
                    "labeled": 0,
                    "usable": 0,
                    "correct": 0,
                    "accuracy": None,
                    "accuracy_percent": None,
                    "confusion": {},
                    "unmapped_outcomes": [],
                },
            },
        }

    lb = max(int(lookback), 1)
    with _open_memory_db(db_path) as conn:
        cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
        has_fp = "fingerprint" in cols
        if has_fp:
            rows = conn.execute(
                "SELECT id, created_at, fingerprint, outcome, report_json FROM cases ORDER BY id DESC LIMIT ?",
                (lb,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, created_at, outcome, report_json FROM cases ORDER BY id DESC LIMIT ?",
                (lb,),
            ).fetchall()

    # Build a fingerprint-deduped view for metrics (distinct cases).
    # Note: new saves already merge by fingerprint, but this also protects
    # against legacy DBs with duplicates.
    rows_distinct = rows
    distinct_available = False
    try:
        if rows and len(rows[0]) == 5:
            distinct_available = True
            by_fp: Dict[str, Any] = {}
            for r in rows:
                (cid, created_at, fp, outcome, report_json) = r
                f = str(fp or "").strip()
                if not f:
                    # Treat missing fingerprint as unique by id.
                    f = f"id:{int(cid)}"
                prev = by_fp.get(f)
                if prev is None or int(cid) > int(prev[0]):
                    by_fp[f] = r
            rows_distinct = list(by_fp.values())
            # Keep newest-first ordering for consistency.
            rows_distinct.sort(key=lambda rr: int(rr[0]), reverse=True)
    except Exception:
        rows_distinct = rows
        distinct_available = False

    def _is_verified_report(report_json: str) -> bool:
        try:
            rep = json.loads(report_json)
            if not isinstance(rep, dict):
                return False
            v = str(rep.get("verdict") or "").strip().lower()
            vb = rep.get("verifiedBy")
            return (v == "verified") or (isinstance(vb, list) and len(vb) > 0)
        except Exception:
            return False

    # VERIFIED frequency (how rare VERIFIED is) — computed across the lookback rows
    # regardless of whether the case is labeled.
    try:
        verified_in_lb = 0
        for row in rows:
            if not row:
                continue
            report_json = row[4] if len(row) == 5 else row[3]
            if _is_verified_report(str(report_json or "")):
                verified_in_lb += 1
        verified_rate = (float(verified_in_lb) / float(len(rows))) if rows else None
    except Exception:
        verified_in_lb = 0
        verified_rate = None

    try:
        verified_in_lb_distinct = 0
        for row in rows_distinct:
            if not row:
                continue
            report_json = row[4] if len(row) == 5 else row[3]
            if _is_verified_report(str(report_json or "")):
                verified_in_lb_distinct += 1
        verified_rate_distinct = (float(verified_in_lb_distinct) / float(len(rows_distinct))) if rows_distinct else None
    except Exception:
        verified_in_lb_distinct = 0
        verified_rate_distinct = None

    # VERIFIED-by breakdown (which verifier path is used, and how accurate it is on labeled cases).
    def _extract_verified_by_flags(report_json: str) -> List[str]:
        try:
            rep = json.loads(report_json)
            if not isinstance(rep, dict):
                return []
            vb = rep.get("verifiedBy")
            if not isinstance(vb, list):
                return []
            out: List[str] = []
            for x in vb:
                s = str(x or "").strip()
                if s and s not in out:
                    out.append(s)
            return out[:6]
        except Exception:
            return []

    def _parse_pred_key(rep: Any, kind: str) -> str:
        if not isinstance(rep, dict):
            return ""
        try:
            if kind == "broad":
                if isinstance(rep.get("top"), dict):
                    return str(rep["top"].get("key") or "")
            elif kind == "bsod5":
                if isinstance(rep.get("bsod5"), dict):
                    return str(rep["bsod5"].get("key") or "")
            elif kind == "common5":
                if isinstance(rep.get("common5"), dict) and isinstance(rep["common5"].get("top"), dict):
                    return str(rep["common5"]["top"].get("key") or "")
        except Exception:
            return ""
        return ""

    def _count_verified_labeling(rows_in: List[Any], kind: str, expected_keys: List[str]) -> Dict[str, int]:
        """Counts VERIFIED reports and how many are labeled for the requested kind.

        This helps technicians prioritize labeling so Phase 4 can become data-validated.
        """
        total_verified = 0
        labeled_for_kind = 0
        for row in rows_in:
            if not row:
                continue
            report_json = row[4] if len(row) == 5 else row[3]
            report_txt = str(report_json or "")
            if not _is_verified_report(report_txt):
                continue
            total_verified += 1

            outcome = row[3] if len(row) == 5 else row[2]
            outcome_raw = str(outcome or "").strip()
            if not outcome_raw:
                continue
            labels = _parse_outcome_labels(outcome_raw)
            okey = str(labels.get(kind) or "").strip()
            if okey and okey in expected_keys:
                labeled_for_kind += 1

        return {
            "verified_reports": int(total_verified),
            "verified_reports_labeled_kind": int(labeled_for_kind),
            "verified_reports_unlabeled_kind": int(max(0, total_verified - labeled_for_kind)),
        }

    def _verified_breakdown(rows_in: List[Any], kind: str, expected_keys: List[str]) -> List[Dict[str, Any]]:
        # Track by verifiedBy flag.
        counts: Dict[str, Dict[str, int]] = {}
        for row in rows_in:
            if not row:
                continue
            report_json = row[4] if len(row) == 5 else row[3]
            report_txt = str(report_json or "")
            if not _is_verified_report(report_txt):
                continue

            flags = _extract_verified_by_flags(report_txt)
            if not flags:
                flags = ["(unknown)"]

            # Labeled outcome for this kind
            outcome = row[3] if len(row) == 5 else row[2]
            outcome_raw = str(outcome or "").strip()
            labels = _parse_outcome_labels(outcome_raw)
            okey = str(labels.get(kind) or "").strip()
            labeled_for_kind = bool(outcome_raw and okey and okey in expected_keys)

            pred_key = ""
            usable = False
            correct = False
            try:
                rep = json.loads(report_txt)
                pred_key = _parse_pred_key(rep, kind)
                usable = labeled_for_kind and (pred_key in expected_keys)
                correct = usable and (pred_key == okey)
            except Exception:
                usable = False
                correct = False

            for f in flags:
                bucket = counts.setdefault(
                    f,
                    {
                        "verified_cases": 0,
                        "labeled": 0,
                        "usable": 0,
                        "correct": 0,
                    },
                )
                bucket["verified_cases"] += 1
                if labeled_for_kind:
                    bucket["labeled"] += 1
                if usable:
                    bucket["usable"] += 1
                    if correct:
                        bucket["correct"] += 1

        scored: List[Dict[str, Any]] = []
        for flag, b in counts.items():
            usable = int(b.get("usable") or 0)
            correct = int(b.get("correct") or 0)
            acc = (float(correct) / float(usable)) if usable > 0 else None
            scored.append(
                {
                    "flag": str(flag),
                    "verified_cases": int(b.get("verified_cases") or 0),
                    "labeled": int(b.get("labeled") or 0),
                    "usable": usable,
                    "correct": correct,
                    "accuracy": acc,
                    "accuracy_percent": (round(acc * 100.0, 2) if acc is not None else None),
                }
            )

        scored.sort(key=lambda r: int(r.get("verified_cases") or 0), reverse=True)
        return scored[:10]

    def compute_kind(rows_in: List[Any], kind: str, expected_keys: List[str], *, verified_only: bool = False) -> Dict[str, Any]:
        def wilson_upper_bound(k: int, n: int, z: float = 1.96) -> Optional[float]:
            """Approximate one-sided (upper) bound for a binomial rate using Wilson score.

            Returns a probability in [0,1] or None when n<=0.
            """
            try:
                nn = int(n)
                kk = int(k)
                if nn <= 0:
                    return None
                if kk < 0:
                    kk = 0
                if kk > nn:
                    kk = nn
                phat = float(kk) / float(nn)
                z2 = float(z) * float(z)
                denom = 1.0 + (z2 / float(nn))
                center = (phat + (z2 / (2.0 * float(nn)))) / denom
                rad = (float(z) / denom) * math.sqrt((phat * (1.0 - phat) / float(nn)) + (z2 / (4.0 * float(nn) * float(nn))))
                return max(0.0, min(1.0, center + rad))
            except Exception:
                return None

        confusion: Dict[str, Dict[str, int]] = {k: {p: 0 for p in expected_keys} for k in expected_keys}
        labeled = 0
        usable = 0
        correct = 0
        unmapped: Dict[str, int] = {}

        for row in rows_in:
            if not row:
                continue
            # row is either (id, created_at, outcome, report_json) OR
            # (id, created_at, fingerprint, outcome, report_json)
            if len(row) == 5:
                (_cid, _created_at, _fp, outcome, report_json) = row
            else:
                (_cid, _created_at, outcome, report_json) = row
            outcome_raw = str(outcome or "").strip()
            if not outcome_raw:
                continue
            labels = _parse_outcome_labels(outcome_raw)
            okey = str(labels.get(kind) or "").strip()
            if not okey:
                continue
            labeled += 1
            if not okey or okey not in expected_keys:
                unmapped[outcome_raw] = int(unmapped.get(outcome_raw, 0)) + 1
                continue

            pred_key = ""
            rep_verified = False
            try:
                rep = json.loads(report_json)

                # Evidence-grade: treat verdict=verified OR verifiedBy non-empty as VERIFIED.
                if isinstance(rep, dict):
                    v = str(rep.get("verdict") or "").strip().lower()
                    vb = rep.get("verifiedBy")
                    rep_verified = (v == "verified") or (isinstance(vb, list) and len(vb) > 0)

                if kind == "broad":
                    if isinstance(rep, dict) and isinstance(rep.get("top"), dict):
                        pred_key = str(rep["top"].get("key") or "")
                elif kind == "bsod5":
                    if isinstance(rep, dict) and isinstance(rep.get("bsod5"), dict):
                        pred_key = str(rep["bsod5"].get("key") or "")
                elif kind == "common5":
                    if (
                        isinstance(rep, dict)
                        and isinstance(rep.get("common5"), dict)
                        and isinstance(rep["common5"].get("top"), dict)
                    ):
                        pred_key = str(rep["common5"]["top"].get("key") or "")
            except Exception:
                pred_key = ""
                rep_verified = False

            if verified_only and (not rep_verified):
                continue

            if pred_key not in expected_keys:
                continue

            usable += 1
            confusion[okey][pred_key] = int(confusion[okey].get(pred_key, 0)) + 1
            if pred_key == okey:
                correct += 1

        accuracy = (float(correct) / float(usable)) if usable > 0 else None
        false_rate = (float(usable - correct) / float(usable)) if usable > 0 else None

        false_count = int(max(0, usable - correct))
        false_upper = wilson_upper_bound(false_count, int(usable), z=1.96) if (verified_only and usable > 0) else None

        # Extract most common confusions (actual != predicted), for quick tuning.
        confusions: List[Dict[str, Any]] = []
        try:
            for actual_key, row in confusion.items():
                for pred_key, cnt in row.items():
                    c = int(cnt)
                    if c <= 0:
                        continue
                    if str(actual_key) == str(pred_key):
                        continue
                    confusions.append(
                        {
                            "actual": str(actual_key),
                            "pred": str(pred_key),
                            "count": int(c),
                        }
                    )
            confusions.sort(key=lambda r: int(r.get("count") or 0), reverse=True)
        except Exception:
            confusions = []

        # Compact confusion
        confusion_compact: Dict[str, Dict[str, int]] = {}
        for actual_key, row in confusion.items():
            if sum(int(v) for v in row.values()) <= 0:
                continue
            confusion_compact[actual_key] = {pred_key: int(cnt) for pred_key, cnt in row.items() if int(cnt) > 0}

        unmapped_sorted = sorted(unmapped.items(), key=lambda kv: kv[1], reverse=True)
        unmapped_list = [{"label": k, "count": int(v)} for (k, v) in unmapped_sorted[:25]]

        return {
            "expected_keys": list(expected_keys),
            "labeled": int(labeled),
            "usable": int(usable),
            "correct": int(correct),
            "accuracy": accuracy,
            "accuracy_percent": (round(accuracy * 100.0, 2) if accuracy is not None else None),
            "false_verified_rate": (false_rate if verified_only else None),
            "false_verified_rate_percent": (round(false_rate * 100.0, 2) if (verified_only and false_rate is not None) else None),
            "false_verified_count": (int(false_count) if verified_only else None),
            "false_verified_rate_upper_95": (false_upper if verified_only else None),
            "false_verified_rate_upper_95_percent": (
                (round(false_upper * 100.0, 2) if false_upper is not None else None) if verified_only else None
            ),
            "confusion": confusion_compact,
            "top_confusions": confusions[:8],
            "unmapped_outcomes": unmapped_list,
        }

    broad_metrics = compute_kind(list(rows), "broad", list(_HYPOTHESIS_KEYS))
    bsod5_metrics = compute_kind(list(rows), "bsod5", list(_BSOD5_LABELS.keys()))
    common5_metrics = compute_kind(list(rows), "common5", list(_COMMON5_LABELS.keys()))

    broad_metrics_verified = compute_kind(list(rows), "broad", list(_HYPOTHESIS_KEYS), verified_only=True)
    bsod5_metrics_verified = compute_kind(list(rows), "bsod5", list(_BSOD5_LABELS.keys()), verified_only=True)
    common5_metrics_verified = compute_kind(list(rows), "common5", list(_COMMON5_LABELS.keys()), verified_only=True)

    broad_metrics_distinct = compute_kind(list(rows_distinct), "broad", list(_HYPOTHESIS_KEYS))
    bsod5_metrics_distinct = compute_kind(list(rows_distinct), "bsod5", list(_BSOD5_LABELS.keys()))
    common5_metrics_distinct = compute_kind(list(rows_distinct), "common5", list(_COMMON5_LABELS.keys()))

    broad_metrics_distinct_verified = compute_kind(list(rows_distinct), "broad", list(_HYPOTHESIS_KEYS), verified_only=True)
    bsod5_metrics_distinct_verified = compute_kind(list(rows_distinct), "bsod5", list(_BSOD5_LABELS.keys()), verified_only=True)
    common5_metrics_distinct_verified = compute_kind(list(rows_distinct), "common5", list(_COMMON5_LABELS.keys()), verified_only=True)

    # Phase 4 validation gate: PASS when verified-only false-VERIFIED is demonstrably low.
    # This is data-driven and flips automatically as labeled VERIFIED cases accumulate.
    def _phase4_gate(
        kind_metrics: Dict[str, Any],
        *,
        min_usable: int,
        target_upper_95_percent: float,
        verified_labeling_counts: Optional[Dict[str, int]] = None,
    ) -> Dict[str, Any]:
        usable = int(kind_metrics.get("usable") or 0)
        upper = kind_metrics.get("false_verified_rate_upper_95_percent")
        remaining = max(0, int(min_usable) - int(usable))
        return {
            "usable": usable,
            "min_usable": int(min_usable),
            "remaining_needed": int(remaining),
            "target_upper_95_percent": float(target_upper_95_percent),
            "upper_95_percent": (float(upper) if isinstance(upper, (int, float)) else None),
            "pass": bool(usable >= int(min_usable) and isinstance(upper, (int, float)) and float(upper) <= float(target_upper_95_percent)),
            "labeling": (verified_labeling_counts if isinstance(verified_labeling_counts, dict) else None),
        }

    phase4_min_usable = 30
    phase4_target_upper = 1.0

    broad_verified_labeling = _count_verified_labeling(list(rows), "broad", list(_HYPOTHESIS_KEYS))
    broad_distinct_verified_labeling = _count_verified_labeling(list(rows_distinct), "broad", list(_HYPOTHESIS_KEYS))

    phase4 = {
        "note": "PASS indicates enough verified-only labeled cases exist and the 95% upper bound on false-VERIFIED rate is below target.",
        "broad_verified_only": _phase4_gate(
            broad_metrics_verified,
            min_usable=phase4_min_usable,
            target_upper_95_percent=phase4_target_upper,
            verified_labeling_counts=broad_verified_labeling,
        ),
        "broad_distinct_verified_only": _phase4_gate(
            broad_metrics_distinct_verified,
            min_usable=phase4_min_usable,
            target_upper_95_percent=phase4_target_upper,
            verified_labeling_counts=broad_distinct_verified_labeling,
        ),
    }
    phase4["pass"] = bool(phase4["broad_verified_only"]["pass"] and phase4["broad_distinct_verified_only"]["pass"])

    def _overall_rating_from_kind(kind_metrics: Dict[str, Any], *, min_usable: int = 30) -> Dict[str, Any]:
        usable = int(kind_metrics.get("usable") or 0) if isinstance(kind_metrics, dict) else 0
        accp = kind_metrics.get("accuracy_percent") if isinstance(kind_metrics, dict) else None
        acc = kind_metrics.get("accuracy") if isinstance(kind_metrics, dict) else None

        if usable <= 0:
            status = "no_data"
        elif usable < int(min_usable):
            status = "insufficient_data"
        else:
            status = "ok"

        grade: Optional[str] = None
        if status == "ok" and isinstance(accp, (int, float)):
            ap = float(accp)
            if ap >= 95.0:
                grade = "excellent"
            elif ap >= 85.0:
                grade = "good"
            elif ap >= 70.0:
                grade = "fair"
            else:
                grade = "poor"

        remaining = max(0, int(min_usable) - int(usable))
        return {
            "status": status,
            "usable": int(usable),
            "min_usable_recommended": int(min_usable),
            "remaining_needed": int(remaining),
            "accuracy": (float(acc) if isinstance(acc, (int, float)) else None),
            "accuracy_percent": (float(accp) if isinstance(accp, (int, float)) else None),
            "grade": grade,
            "note": "Rating is only meaningful when usable >= min_usable_recommended.",
        }

    overall_rating = {
        "note": "Overall ratings are derived from labeled outcomes; they will report insufficient_data until enough labels exist.",
        "bsod5": _overall_rating_from_kind(bsod5_metrics, min_usable=30),
        "broad": _overall_rating_from_kind(broad_metrics, min_usable=30),
        "verified_precision_gate": {
            "status": ("pass" if bool(phase4.get("pass")) else "wait"),
            "pass": bool(phase4.get("pass")),
            "note": "PASS means VERIFIED-only precision has reached the Phase 4 data-validation gate.",
        },
    }

    return {
        "ok": True,
        "memory_db": str(db_path),
        "lookback": int(lb),
        "overall_rating": overall_rating,
        "phase4_validation": phase4,
        "distinct": {
            "available": bool(distinct_available),
            "raw_rows": int(len(rows) if rows else 0),
            "distinct_rows": int(len(rows_distinct) if rows_distinct else 0),
            "note": "Distinct metrics de-duplicate by case fingerprint when available.",
        },
        "verified_summary": {
            "in_lookback": int(len(rows) if rows else 0),
            "verified": int(verified_in_lb),
            "verified_rate": verified_rate,
            "verified_rate_percent": (round(verified_rate * 100.0, 2) if verified_rate is not None else None),
            "distinct_in_lookback": int(len(rows_distinct) if rows_distinct else 0),
            "distinct_verified": int(verified_in_lb_distinct),
            "distinct_verified_rate": verified_rate_distinct,
            "distinct_verified_rate_percent": (
                round(verified_rate_distinct * 100.0, 2) if verified_rate_distinct is not None else None
            ),
        },
        "verified_by_breakdown": {
            "broad": _verified_breakdown(list(rows), "broad", list(_HYPOTHESIS_KEYS)),
            "bsod5": _verified_breakdown(list(rows), "bsod5", list(_BSOD5_LABELS.keys())),
            "common5": _verified_breakdown(list(rows), "common5", list(_COMMON5_LABELS.keys())),
        },
        "verified_by_breakdown_distinct": {
            "broad": _verified_breakdown(list(rows_distinct), "broad", list(_HYPOTHESIS_KEYS)),
            "bsod5": _verified_breakdown(list(rows_distinct), "bsod5", list(_BSOD5_LABELS.keys())),
            "common5": _verified_breakdown(list(rows_distinct), "common5", list(_COMMON5_LABELS.keys())),
        },
        # Backward-compatible: top-level metrics reflect BROAD outcomes only.
        "labeled": int(broad_metrics.get("labeled") or 0),
        "usable": int(broad_metrics.get("usable") or 0),
        "correct": int(broad_metrics.get("correct") or 0),
        "accuracy": broad_metrics.get("accuracy"),
        "accuracy_percent": broad_metrics.get("accuracy_percent"),
        "confusion": broad_metrics.get("confusion") or {},
        "unmapped_outcomes": broad_metrics.get("unmapped_outcomes") or [],
        "expected_outcome_keys": list(_HYPOTHESIS_KEYS),
        "metrics_by_kind": {
            "broad": broad_metrics,
            "bsod5": bsod5_metrics,
            "common5": common5_metrics,
        },
        "metrics_by_kind_verified": {
            "broad": broad_metrics_verified,
            "bsod5": bsod5_metrics_verified,
            "common5": common5_metrics_verified,
        },
        "metrics_by_kind_distinct": {
            "broad": broad_metrics_distinct,
            "bsod5": bsod5_metrics_distinct,
            "common5": common5_metrics_distinct,
        },
        "metrics_by_kind_distinct_verified": {
            "broad": broad_metrics_distinct_verified,
            "bsod5": bsod5_metrics_distinct_verified,
            "common5": common5_metrics_distinct_verified,
        },
    }


def _memory_set_case_outcome(db_path: Path, case_id: int, outcome: str) -> bool:
    if not db_path.exists():
        return False
    outc = str(outcome or "").strip()
    if not outc:
        return False
    with _open_memory_db(db_path) as conn:
        cur = conn.execute(
            "UPDATE cases SET outcome = ? WHERE id = ?",
            (outc, int(case_id)),
        )
        conn.commit()
        return bool(int(cur.rowcount or 0) > 0)


def _merge_outcome_labels(existing: str, incoming: str) -> str:
    """Merge multi-label outcomes.

    - Preserves existing kinds unless incoming provides a replacement.
    - Canonical output order: broad|bsod5|common5 (when present).
    """

    ex = _parse_outcome_labels(str(existing or "").strip())
    inc = _parse_outcome_labels(str(incoming or "").strip())
    if not inc:
        return str(existing or "").strip()

    merged: Dict[str, str] = dict(ex)
    for k, v in inc.items():
        if v:
            merged[k] = v

    parts: List[str] = []
    if merged.get("broad"):
        parts.append(f"broad:{merged['broad']}")
    if merged.get("bsod5"):
        parts.append(f"bsod5:{merged['bsod5']}")
    if merged.get("common5"):
        parts.append(f"common5:{merged['common5']}")
    return "|".join(parts)


def _memory_merge_case_outcome(db_path: Path, case_id: int, outcome: str) -> bool:
    if not db_path.exists():
        return False
    outc = str(outcome or "").strip()
    if not outc:
        return False
    with _open_memory_db(db_path) as conn:
        row = conn.execute("SELECT outcome FROM cases WHERE id = ?", (int(case_id),)).fetchone()
        if not row:
            return False
        existing = str(row[0] or "")
        merged = _merge_outcome_labels(existing, outc)
        if not merged:
            return False
        cur = conn.execute(
            "UPDATE cases SET outcome = ? WHERE id = ?",
            (merged, int(case_id)),
        )
        conn.commit()
        return bool(int(cur.rowcount or 0) > 0)


def _memory_label_queue(db_path: Path, *, limit: int = 25) -> List[Dict[str, Any]]:
    """List cases that still need labels for broad and/or bsod5.

    Outcome can store multiple labels, e.g. `broad:software_firmware|bsod5:hardware_failure`.
    """

    if not db_path.exists():
        return []
    with _open_memory_db(db_path) as conn:
        rows = conn.execute(
            "SELECT id, created_at, device_primary, note, outcome, report_json FROM cases ORDER BY id DESC LIMIT ?",
            (int(max(1, limit)),),
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for (cid, created_at, device_primary, note, outcome, report_json) in rows:
        outcome_raw = str(outcome or "").strip()
        labels = _parse_outcome_labels(outcome_raw)
        has_broad = bool(str(labels.get("broad") or "").strip())
        has_bsod5 = bool(str(labels.get("bsod5") or "").strip())

        top_key = ""
        bsod5_key = ""
        verdict = ""
        verified_by: List[str] = []
        try:
            rep = json.loads(report_json)
            if isinstance(rep, dict):
                verdict = str(rep.get("verdict") or "").strip().lower()
                if isinstance(rep.get("verifiedBy"), list):
                    verified_by = [str(x or "").strip() for x in rep.get("verifiedBy") if str(x or "").strip()]
                if isinstance(rep.get("top"), dict):
                    top_key = str(rep["top"].get("key") or "")
                if isinstance(rep.get("bsod5"), dict):
                    bsod5_key = str(rep["bsod5"].get("key") or "")
        except Exception:
            pass

        # Automatic labeling suggestion (copy/paste). This does NOT write to the DB.
        suggested_parts: List[str] = []
        try:
            tk = str(top_key or "").strip()
            bk = str(bsod5_key or "").strip()
            if tk and tk in set(_HYPOTHESIS_KEYS):
                suggested_parts.append(f"broad:{tk}")
            if bk and bk in set(_BSOD5_LABELS.keys()):
                suggested_parts.append(f"bsod5:{bk}")
        except Exception:
            suggested_parts = []
        suggested_outcome = "|".join(suggested_parts) if suggested_parts else ""
        suggested_label_command = (
            f"py -V:3.15 \"AI support\\\\ai_diagnose.py\" --label-case {int(cid)} --merge --outcome \"{suggested_outcome}\" --pretty"
            if suggested_outcome
            else ""
        )

        needs_any = (not has_broad) or (not has_bsod5)
        if not needs_any:
            continue

        out.append(
            {
                "id": int(cid),
                "created_at": int(created_at),
                "device_primary": str(device_primary or ""),
                "verdict": verdict,
                "verifiedBy": verified_by[:6],
                "pred_broad": top_key,
                "pred_bsod5": bsod5_key,
                "suggested_outcome": suggested_outcome,
                "suggested_label_command": suggested_label_command,
                "outcome": outcome_raw,
                "needs": {"broad": bool(not has_broad), "bsod5": bool(not has_bsod5)},
                "note": str(note or ""),
            }
        )

    return out


def _detect_low_level(connection: Dict[str, Any]) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    _, transport = _phone_like_host_usb_lists(connection)
    if not transport:
        return False, reasons

    text = " ".join(
        [
            f"{_safe_get(d, ['name'], '')} {_safe_get(d, ['instanceId'], '')} {_safe_get(d, ['vid'], '')}:{_safe_get(d, ['pid'], '')}"
            for d in transport
        ]
    ).lower()

    vids = {str(_safe_get(d, ["vid"], "") or "").upper() for d in transport}
    pids = {str(_safe_get(d, ["pid"], "") or "").upper() for d in transport}

    has_qcom = "05C6" in vids or "qualcomm" in text
    has_mtk = "0E8D" in vids or "mediatek" in text or "mtk" in text
    has_apple = "05AC" in vids or "apple" in text

    looks_edl = "9008" in text or "qdloader" in text or "qhusb" in text or "edl" in text or "9008" in pids
    looks_mtk = "preloader" in text or "vcom" in text or "brom" in text
    looks_dfu = "dfu" in text or "recovery" in text or "iboot" in text

    # Samsung Download/Odin mode (best-effort). This is not *proof* of phone hardware failure;
    # it is a service mode where Android is typically not running.
    # Note: Windows may show Samsung Download as a CDC composite device (e.g.
    # "SAMSUNG Mobile USB CDC Composite Device") without including the word "download".
    looks_download = (
        ("download" in text)
        or ("odin" in text)
        or ("cdc composite" in text)
        or ("samsung mobile usb cdc composite device" in text)
    )
    has_samsung = ("04E8" in vids) or ("samsung" in text)

    if has_qcom and looks_edl:
        reasons.append("Transport USB devices look like Qualcomm EDL/9008")
        return True, reasons
    if has_mtk and looks_mtk:
        reasons.append("Transport USB devices look like MediaTek preloader/BROM")
        return True, reasons
    if has_apple and looks_dfu:
        reasons.append("Transport USB devices look like Apple DFU/Recovery")
        return True, reasons

    if has_samsung and looks_download:
        reasons.append("Transport USB devices look like Samsung Download/Odin mode")
        return True, reasons

    # IMPORTANT: Transport entries are commonly present for normal Android devices.
    # Do NOT treat transport presence alone as a low-level mode signal.
    return False, reasons


def _extract_signals(connection: Dict[str, Any]) -> Dict[str, Any]:
    """Extracts the richer evidence produced by /connection-check?deep=1.

    Expected shape (best-effort):
      connection.signals.adb.{bootCompleted,bootReason,verifiedBootState,vbmetaDeviceState,battery,dataPartitionUsePct,logEvidence}
      connection.signals.fastboot[].vars
    """
    signals = connection.get("signals") if isinstance(connection, dict) else None
    if not isinstance(signals, dict):
        return {
            "adb": {},
            "fastboot_vars": {},
            "log_keys": set(),
            "log_labels": [],
        }

    adb_sig = signals.get("adb") if isinstance(signals.get("adb"), dict) else {}

    # Fastboot vars are an array of { deviceId, vars }.
    fb_vars: Dict[str, str] = {}
    fb_list = signals.get("fastboot")
    if isinstance(fb_list, list) and fb_list:
        first = fb_list[0]
        if isinstance(first, dict) and isinstance(first.get("vars"), dict):
            fb_vars = {str(k): str(v) for k, v in first.get("vars", {}).items() if k}

    log_keys: set[str] = set()
    log_labels: List[str] = []
    log_ev = adb_sig.get("logEvidence") if isinstance(adb_sig.get("logEvidence"), dict) else None
    if log_ev and isinstance(log_ev.get("matched"), list):
        for m in log_ev.get("matched"):
            if not isinstance(m, dict):
                continue
            k = str(m.get("key") or "").strip()
            lab = str(m.get("label") or "").strip()
            if k:
                log_keys.add(k)
            if lab:
                log_labels.append(lab)

    return {
        "adb": adb_sig,
        "fastboot_vars": fb_vars,
        "log_keys": log_keys,
        "log_labels": log_labels[:6],
    }


def _softmax_4(scores: Dict[SpecificCauseKey, float]) -> Dict[SpecificCauseKey, float]:
    mx = max(scores.values()) if scores else 0.0
    exps = {k: math.exp(float(v) - mx) for (k, v) in scores.items()}
    denom = float(sum(exps.values()) or 1.0)
    return {k: (float(v) / denom) for (k, v) in exps.items()}


def _classify_specific_cause(
    connection: Dict[str, Any],
    visual: Optional[Dict[str, Any]],
    *,
    top_key: str,
    bsod_cat: str,
    bsod_conf: str,
    bsod_reasons: List[str],
    adb_sig: Dict[str, Any],
    log_keys: set[str],
) -> Dict[str, Any]:
    """Return a 4-way technician-friendly cause type.

    Keys (stable contract for UI):
      - battery_problem
      - os_corruption
      - apps_conflict
      - other
    """

    def add(scores: Dict[str, float], ev: Dict[str, List[str]], key: str, pts: float, why: str) -> None:
        scores[key] = float(scores.get(key, 0.0)) + float(pts)
        ev.setdefault(key, []).append(str(why))

    scores: Dict[str, float] = {
        "battery_problem": 0.0,
        "os_corruption": 0.0,
        "apps_conflict": 0.0,
        "other": 0.0,
    }
    ev: Dict[str, List[str]] = {k: [] for k in scores.keys()}

    text = (str(bsod_cat or "") + " " + " ".join([str(r or "") for r in (bsod_reasons or [])])).lower()
    conf = str(bsod_conf or "").strip().lower()

    # Confidence base from server heuristics (best-effort)
    conf_boost = 1.4 if conf == "high" else (1.0 if conf == "medium" else 0.7)

    # Server /connection-check part1 category mapping (if present)
    # Examples we see: "Overheating", "Insufficient Storage", "Application Conflicts", "Hardware Malfunction", "System Errors"
    cat_l = str(bsod_cat or "").strip().lower()
    if "application" in cat_l or "conflict" in cat_l:
        add(scores, ev, "apps_conflict", 2.4 * conf_boost, f"Server category suggests app conflict: {bsod_cat}")
    if "system" in cat_l or "error" in cat_l:
        add(scores, ev, "os_corruption", 2.2 * conf_boost, f"Server category suggests system/OS errors: {bsod_cat}")
    if "overheat" in cat_l or "thermal" in cat_l:
        add(scores, ev, "battery_problem", 2.2 * conf_boost, f"Server category suggests overheating: {bsod_cat}")
    if "storage" in cat_l:
        add(scores, ev, "os_corruption", 1.6 * conf_boost, f"Server category suggests storage pressure: {bsod_cat}")

    # Reason keywords
    if any(w in text for w in ["battery", "charging", "charger", "power delivery", "voltage", "brownout", "pmic", "overheat", "thermal", "temperature"]):
        add(scores, ev, "battery_problem", 1.8, "Reasons mention battery/power/thermal")
    if any(w in text for w in ["corrupt", "corruption", "system", "system files", "bootloop", "boot loop", "failed update", "update failed", "firmware", "mount", "filesystem"]):
        add(scores, ev, "os_corruption", 1.8, "Reasons mention OS corruption / boot instability")
    if any(w in text for w in ["safe mode", "third-party", "third party", "app", "application", "malware", "spyware", "trojan", "launcher", "system ui"]):
        add(scores, ev, "apps_conflict", 1.7, "Reasons mention apps / Safe Mode / third‑party interference")

    # ADB signal hints
    b = adb_sig.get("battery") if isinstance(adb_sig.get("battery"), dict) else {}
    level = b.get("level")
    temp_c = b.get("temperatureC")
    if isinstance(level, (int, float)):
        if float(level) <= 5.0:
            add(scores, ev, "battery_problem", 2.2, f"Battery level is very low ({int(level)}%)")
        elif float(level) <= 10.0:
            add(scores, ev, "battery_problem", 1.2, f"Battery level is low ({int(level)}%)")
    if isinstance(temp_c, (int, float)) and float(temp_c) >= 50.0:
        add(scores, ev, "battery_problem", 2.0, f"Battery temperature is high ({float(temp_c):.1f}°C)")

    boot_completed = adb_sig.get("bootCompleted")
    if boot_completed is False:
        add(scores, ev, "os_corruption", 1.2, "Android boot not complete (ADB signal)")

    # Log evidence mapping
    if "thermal" in log_keys:
        add(scores, ev, "battery_problem", 1.8, "ADB log evidence indicates thermal issues")
    if "failed-updates" in log_keys or "fs-corruption" in log_keys:
        add(scores, ev, "os_corruption", 2.2, "ADB log evidence indicates update/filesystem corruption")
    if "systemui" in log_keys:
        add(scores, ev, "apps_conflict", 2.6, "ADB log evidence indicates SystemUI crash / UI loop")
    if "anr" in log_keys:
        add(scores, ev, "apps_conflict", 2.2, "ADB log evidence indicates ANR (App Not Responding)")
    if "crash-loop" in log_keys or "watchdog" in log_keys:
        # Crash loops can be OS or app-level; bias toward apps only when text hints exist.
        if "safe mode" in text or "third" in text or "app" in text:
            add(scores, ev, "apps_conflict", 1.6, "ADB log evidence indicates crash loop/hang (with app interference hints)")
        else:
            add(scores, ev, "os_corruption", 1.4, "ADB log evidence indicates crash loop/hang")

    # Visual "not BSOD" strongly implies "other" bucket for this 4-way label.
    visual_analysis = (visual or {}).get("analysis") if isinstance(visual, dict) else None
    vcat = _lower(_safe_get(visual_analysis or {}, ["category"], ""))
    if vcat == "normal":
        add(scores, ev, "other", 2.8, "Camera indicates normal screen content")

    # Technician questionnaire hints (structured) - strong signals
    user_sym = connection.get("userSymptom") if isinstance(connection, dict) else None
    if isinstance(user_sym, dict):
        details = user_sym.get("details")
        if isinstance(details, dict):
            if bool(details.get("safeModeImproves")):
                add(scores, ev, "apps_conflict", 2.6, "Safe Mode improves the issue (strong app/third‑party signal)")
            if bool(details.get("recentApp")):
                add(scores, ev, "apps_conflict", 2.0, "Started after installing/updating an app")
            if bool(details.get("recentUpdate")):
                add(scores, ev, "os_corruption", 2.1, "Started after an OS update")
            if bool(details.get("charging")) or bool(details.get("afterCharge")):
                add(scores, ev, "battery_problem", 1.9, "Symptoms correlate with charging/power")
            if bool(details.get("drop")):
                add(scores, ev, "other", 1.5, "Recent drop/impact suggests hardware damage")
            if bool(details.get("liquid")):
                add(scores, ev, "other", 1.7, "Liquid/moisture exposure suggests hardware/corrosion")

    # If the broader hypothesis is clearly host-side USB driver, treat as "other".
    if str(top_key or "") == "host_usb_driver":
        add(scores, ev, "other", 1.8, "Broad diagnosis indicates host-side USB driver/enumeration")
    if str(top_key or "") in ("display_hardware", "low_level_mode", "power_mainboard", "not_bsod"):
        add(scores, ev, "other", 1.0, f"Broad diagnosis category: {top_key}")

    # Soft fallback so we always choose something.
    add(scores, ev, "other", 0.4, "Fallback")

    probs = _softmax_4(scores)
    chosen_key = max(probs.keys(), key=lambda k: float(probs.get(k, 0.0))) if probs else "other"
    chosen_p = float(probs.get(chosen_key, 0.0)) if probs else 0.0

    label_map = {
        "battery_problem": "Battery / power / overheating",
        "os_corruption": "OS corruption / failed update / boot instability",
        "apps_conflict": "Third‑party app conflict / malware / unstable apps",
        "other": "Other / hardware / USB driver / not a BSOD",
    }

    out: Dict[str, Any] = {
        "key": chosen_key,
        "label": label_map.get(chosen_key, chosen_key),
        "confidence": round(chosen_p, 4),
        "evidence": (ev.get(chosen_key) or [])[:5],
    }

    if chosen_key == "apps_conflict":
        out["app_suspects"] = [
            "Recently installed/updated apps",
            "Launchers, themes, UI overlay/screen filter apps",
            "Security/cleaner/optimizer apps",
            "VPN/proxy/firewall apps",
            "Root modules (Magisk/Xposed) if present",
        ]

    return out


_BSOD5_LABELS: Dict[str, str] = {
    "corrupt_system_files": "Corrupt system files",
    "faulty_os_updates": "Faulty OS updates",
    "incompatible_apps": "Incompatible apps",
    "overheating": "Overheating",
    "hardware_failure": "Hardware failure",
    "not_bsod": "Not BSOD",
}


_COMMON5_LABELS: Dict[str, str] = {
    "software_glitches": "Software glitches",
    "insufficient_storage": "Insufficient storage",
    "app_malfunctions": "App malfunctions",
    "connectivity_issues": "Connectivity issues",
    "hardware_problems": "Hardware problems",
}


def _classify_common_phone_causes(
    connection: Dict[str, Any],
    visual: Optional[Dict[str, Any]],
    *,
    top_key: str,
    bsod_cat: str,
    bsod_reasons: List[str],
    adb_sig: Dict[str, Any],
    log_keys: set[str],
) -> Dict[str, Any]:
    """Return a general 5-cause list for Android 'not working properly' cases.

    This is intentionally broad and technician-friendly; it works even when USB debugging is off.
    """

    def add(scores: Dict[str, float], ev: Dict[str, List[str]], key: str, pts: float, why: str) -> None:
        scores[key] = float(scores.get(key, 0.0)) + float(pts)
        ev.setdefault(key, []).append(str(why))

    scores: Dict[str, float] = {k: 0.0 for k in _COMMON5_LABELS.keys()}
    ev: Dict[str, List[str]] = {k: [] for k in _COMMON5_LABELS.keys()}

    text = (str(bsod_cat or "") + " " + " ".join([str(r or "") for r in (bsod_reasons or [])])).lower()

    # If the broader model/heuristics indicate a host-side USB driver/enumeration issue,
    # surface that as a connectivity issue in the Common-5 list. This avoids confusing
    # outputs like "Software glitches" when the evidence is primarily PC-side.
    if str(top_key or "") == "host_usb_driver":
        add(scores, ev, "connectivity_issues", 4.0, "Broad diagnosis indicates host USB driver/enumeration issue")
        add(scores, ev, "software_glitches", -0.6, "Host-side USB driver issues are not a phone software glitch")

    if any(
        w in text
        for w in (
            "host usb driver",
            "enumeration",
            "device manager",
            "wpd",
            "mtp enumeration",
            "portable",
            "problem code",
            "driver",
        )
    ):
        add(scores, ev, "connectivity_issues", 2.4, "Heuristics mention host USB/MTP driver or enumeration problems")

    # Kernel panic / low-level crash hint (from ADB signal or camera OCR) should not
    # be categorized as generic "app malfunctions".
    boot_reason_l = _lower(str(adb_sig.get("bootReason") or "")) if isinstance(adb_sig, dict) else ""
    has_kernel_panic_signal = ("kernel" in boot_reason_l) or ("panic" in boot_reason_l)
    visual_analysis = (visual or {}).get("analysis") if isinstance(visual, dict) else None
    ocr_text_l = _lower(_safe_get(visual_analysis or {}, ["ocr_text_sample"], ""))
    visual_kernel_panic_hint = bool(_safe_get(visual_analysis or {}, ["kernel_panic_hint"], False))
    if ("kernel panic" in ocr_text_l) or ("not syncing" in ocr_text_l) or ("panic:" in ocr_text_l):
        visual_kernel_panic_hint = True
    has_kernel_panic_signal = bool(has_kernel_panic_signal or visual_kernel_panic_hint)

    # User symptom free-text keywords (best-effort)
    user_sym = connection.get("userSymptom") if isinstance(connection, dict) else None
    hint = ""
    choice = ""
    if isinstance(user_sym, dict):
        choice = str(user_sym.get("choice") or "").strip().lower()
        hint = (str(user_sym.get("choice") or "") + " " + str(user_sym.get("text") or "")).lower()

    # Technician-confirmed mode can strongly indicate low-level/hardware buckets.
    user_tech = connection.get("userTech") if isinstance(connection, dict) else None
    if not isinstance(user_tech, dict):
        user_tech = connection.get("technician") if isinstance(connection, dict) else None
    if isinstance(user_tech, dict):
        mode = str(user_tech.get("confirmedMode") or "").strip().lower()
        if mode in ("edl", "download", "preloader", "mtk", "dfu"):
            add(scores, ev, "hardware_problems", 3.0, f"Technician confirmed low-level mode: {mode}")
        elif mode in ("fastboot", "recovery"):
            add(scores, ev, "hardware_problems", 1.4, f"Technician confirmed service mode: {mode}")

    # Storage signal
    use_pct = adb_sig.get("dataPartitionUsePct")
    if isinstance(use_pct, (int, float)):
        if float(use_pct) >= 95.0:
            add(scores, ev, "insufficient_storage", 3.2, f"Storage is nearly full ({int(use_pct)}% used)")
        elif float(use_pct) >= 90.0:
            add(scores, ev, "insufficient_storage", 2.0, f"Storage is very high ({int(use_pct)}% used)")
    if "storage" in str(bsod_cat or "").lower() or "low storage" in text or "insufficient storage" in text:
        add(scores, ev, "insufficient_storage", 2.2, "Heuristics mention low/insufficient storage")

    # App malfunctions vs general software glitches
    # NOTE: "freeze" / "unresponsive" without logs is ambiguous (could be OS, storage, thermal, or hardware).
    # Only treat as app-level when app-specific wording exists.
    app_words = ["app", "apps", "application", "force stop", "safe mode", "third party", "third-party"]
    freeze_words = ["freeze", "frozen", "unresponsive", "not responding", "stuck"]
    crash_words = ["crash", "crashing"]

    combined_sym = (hint + " " + text)
    has_app_specific = any(w in combined_sym for w in app_words)
    has_freeze_like = any(w in combined_sym for w in freeze_words)
    has_crash_like = any(w in combined_sym for w in crash_words)

    if has_app_specific or has_crash_like:
        add(scores, ev, "app_malfunctions", 2.4, "Symptoms mention app-specific problems (apps/crashes/Safe Mode/third-party)")
    elif has_freeze_like:
        add(scores, ev, "software_glitches", 1.6, "Symptoms mention freeze/unresponsive behavior (ambiguous without logs)")
    if "crash-loop" in log_keys or "watchdog" in log_keys:
        add(scores, ev, "software_glitches", 1.4, "Log evidence indicates crashes/hangs")

    if has_kernel_panic_signal:
        add(scores, ev, "hardware_problems", 3.2, "Kernel panic / low-level crash evidence present")
        add(scores, ev, "software_glitches", 1.4, "Kernel panic implies OS/driver instability")
        add(scores, ev, "app_malfunctions", -1.6, "Kernel panic is not typically an app-only malfunction")

    # Structured technician hints (more reliable than free-text)
    details = user_sym.get("details") if isinstance(user_sym, dict) else None
    if isinstance(details, dict):
        if bool(details.get("safeModeImproves")):
            add(scores, ev, "app_malfunctions", 3.0, "Safe Mode improves the symptom (points to third-party apps)")
        if bool(details.get("recentApp")):
            add(scores, ev, "app_malfunctions", 2.2, "Issue started after installing/updating an app")
        if bool(details.get("recentUpdate")):
            add(scores, ev, "software_glitches", 2.0, "Issue started after an OS update")
        if bool(details.get("charging")) or bool(details.get("afterCharge")):
            add(scores, ev, "hardware_problems", 1.6, "Symptom correlates with charging/power")
        if bool(details.get("drop")) or bool(details.get("liquid")):
            add(scores, ev, "hardware_problems", 3.0, "Drop/liquid exposure suggests physical damage")

    # Connectivity issues
    if any(w in (hint + " " + text) for w in ["wifi", "wi-fi", "network", "internet", "data", "mobile data", "lte", "5g", "4g", "hotspot", "bluetooth", "pair", "connection", "disconnect"]):
        add(scores, ev, "connectivity_issues", 2.6, "Symptoms mention Wi‑Fi/mobile data/Bluetooth/connectivity")

    # Hardware problems
    if str(top_key or "") in ("display_hardware", "low_level_mode", "power_mainboard"):
        add(scores, ev, "hardware_problems", 1.8, f"Broad diagnosis category: {top_key}")

    # Choice-based heuristics (structured symptom choice)
    if choice in ("no_power",):
        add(scores, ev, "hardware_problems", 3.0, "No power / no signs of life")
    if choice in ("lines_flicker",):
        add(scores, ev, "hardware_problems", 2.2, "Lines/flicker/artifacts suggest display hardware")
    if choice in ("boot_loop", "stuck_logo"):
        add(scores, ev, "software_glitches", 1.6, "Boot loop / stuck on logo often indicates OS/app/update instability")

    # Software glitches (catch-all) and outdated software hint
    if any(w in (hint + " " + text) for w in ["bug", "glitch", "lag", "slow", "outdated", "old android", "android 8", "android 9", "android 10"]):
        add(scores, ev, "software_glitches", 2.0, "Symptoms mention bugs/glitches/slow or outdated software")

    # Visual 'normal' reduces the likelihood of deep hardware, nudges toward software/app/connectivity buckets.
    vcat = _lower(_safe_get(visual_analysis or {}, ["category"], ""))
    if vcat == "normal":
        add(scores, ev, "software_glitches", 0.8, "Camera indicates normal/visible UI")
        if not has_kernel_panic_signal:
            add(scores, ev, "app_malfunctions", 0.6, "Normal UI suggests app-level problems are plausible")

    # Soft fallback
    add(scores, ev, "software_glitches", 0.8, "Fallback (common)")

    probs = _softmax(scores)
    ranked = sorted(
        (
            {
                "key": k,
                "label": _COMMON5_LABELS.get(k, k),
                "confidence": round(float(probs.get(k, 0.0)), 4),
                "score": round(float(scores.get(k, 0.0)), 3),
                "evidence": (ev.get(k) or [])[:4],
            }
            for k in scores.keys()
        ),
        key=lambda r: r["confidence"],
        reverse=True,
    )

    top = ranked[0] if ranked else {"key": "software_glitches", "label": _COMMON5_LABELS["software_glitches"], "confidence": 0.0}
    return {
        "top": top,
        "ranked": ranked,
    }


def _classify_bsod5_cause(
    connection: Dict[str, Any],
    visual: Optional[Dict[str, Any]],
    *,
    top_key: str,
    specific: Optional[Dict[str, Any]],
    bsod_cat: str,
    bsod_reasons: List[str],
    adb_sig: Dict[str, Any],
    log_keys: set[str],
) -> Dict[str, Any]:
    """Return the required 5-cause BSOD label (plus Not BSOD).

    Required causes:
      - corrupt_system_files
      - faulty_os_updates
      - incompatible_apps
      - overheating
      - hardware_failure

    If the model can't justify one of the 5 causes (or signals indicate a non-BSOD case),
    it returns `not_bsod`.
    """

    def add(scores: Dict[str, float], ev: Dict[str, List[str]], key: str, pts: float, why: str) -> None:
        scores[key] = float(scores.get(key, 0.0)) + float(pts)
        ev.setdefault(key, []).append(str(why))

    scores: Dict[str, float] = {
        "corrupt_system_files": 0.0,
        "faulty_os_updates": 0.0,
        "incompatible_apps": 0.0,
        "overheating": 0.0,
        "hardware_failure": 0.0,
        "not_bsod": 0.0,
    }
    ev: Dict[str, List[str]] = {k: [] for k in scores.keys()}

    text = (str(bsod_cat or "") + " " + " ".join([str(r or "") for r in (bsod_reasons or [])])).lower()

    # Visual crash hints (camera OCR) — used to prevent overconfident NOT-BSOD.
    visual_analysis = (visual or {}).get("analysis") if isinstance(visual, dict) else None
    ocr_text_l = _lower(_safe_get(visual_analysis or {}, ["ocr_text_sample"], ""))
    visual_kernel_panic_hint = bool(_safe_get(visual_analysis or {}, ["kernel_panic_hint"], False))
    if ("kernel panic" in ocr_text_l) or ("not syncing" in ocr_text_l) or ("panic:" in ocr_text_l):
        visual_kernel_panic_hint = True

    stable_mtp_only = False
    has_adb = False
    has_fastboot = False
    looks_samsung_download = False

    # Host USB signals (USB-only) — used to avoid false positives.
    try:
        host_usb = connection.get("hostUsb") if isinstance(connection, dict) else None
        host_usb = host_usb if isinstance(host_usb, dict) else {}
        portable, transport = _phone_like_host_usb_lists(connection)
        usb_sample = host_usb.get("sample") if isinstance(host_usb.get("sample"), dict) else {}
        usb_unstable = bool((usb_sample or {}).get("anyChange"))
        try:
            usb_change_count = int((usb_sample or {}).get("changeCount") or 0)
        except Exception:
            usb_change_count = 0
        try:
            usb_stability = float((usb_sample or {}).get("stability") or 1.0)
        except Exception:
            usb_stability = 1.0
        usb_flapping_severe = (usb_change_count >= 6) or (usb_stability > 0 and usb_stability < 0.55)

        adb_devices = _as_list(_safe_get(connection, ["adb", "devices"], []))
        fastboot_devices = _as_list(_safe_get(connection, ["fastboot", "devices"], []))

        has_adb = len(adb_devices) > 0
        has_fastboot = len(fastboot_devices) > 0
        has_mtp = len(portable) > 0

        # Samsung Download/Odin is a firmware repair state (Android not booting normally).
        # Ensure it does not get misclassified as generic hardware failure.
        try:
            transport_text = " ".join(
                [
                    f"{_safe_get(d, ['name'], '')} {_safe_get(d, ['instanceId'], '')} {_safe_get(d, ['vid'], '')}:{_safe_get(d, ['pid'], '')}"
                    for d in (transport or [])
                    if isinstance(d, dict)
                ]
            ).lower()
            looks_samsung_download = bool(
                ("samsung" in transport_text)
                and (
                    ("download" in transport_text)
                    or ("odin" in transport_text)
                    or ("cdc composite" in transport_text)
                    or ("samsung mobile usb cdc composite device" in transport_text)
                )
            )
        except Exception:
            looks_samsung_download = False

        not_ok_portable = [p for p in portable if isinstance(p, dict) and _lower(p.get("status")) not in ("ok", "")]
        not_ok_transport = [t for t in transport if isinstance(t, dict) and _lower(t.get("status")) not in ("ok", "")]

        # Windows commonly shows a non-OK status for the ADB interface when the driver
        # is missing, even while MTP is stable and the phone is healthy.
        not_ok_transport_non_adb = [t for t in not_ok_transport if not _is_adb_driver_transport(t)]

        stable_mtp_only = (
            has_mtp
            and (not has_adb)
            and (not has_fastboot)
            and (not usb_unstable)
            and (not usb_flapping_severe)
            and (len(not_ok_portable) == 0)
            and (len(not_ok_transport_non_adb) == 0)
        )

        if stable_mtp_only:
            # Stable MTP-only is one of the strongest USB-only indicators that the phone is
            # alive and not in a deep boot-chain failure state. Treat as high-confidence
            # NOT-BSOD unless there are stronger contradictory USB-only signals.
            if visual_kernel_panic_hint:
                add(scores, ev, "hardware_failure", 3.2, "Camera/OCR indicates kernel panic/crash text despite MTP visibility")
                add(scores, ev, "not_bsod", -4.0, "Kernel panic text is contradictory to a confident Not-BSOD conclusion")
            else:
                add(scores, ev, "not_bsod", 5.2, "Stable MTP/Portable visibility (USB-only sign of life; not a BSOD indicator)")
                add(scores, ev, "hardware_failure", -1.6, "Stable MTP reduces likelihood of deep hardware/boot failure")

        if looks_samsung_download and (not has_adb) and (not has_fastboot) and (not has_mtp):
            add(scores, ev, "faulty_os_updates", 6.0, "Transport indicates Samsung Download/Odin (firmware repair state)")
            add(scores, ev, "hardware_failure", -3.0, "Download/Odin indicates firmware repair state, not a generic hardware failure")

        adb_alive_display_path = (
            has_adb
            and (not has_fastboot)
            and (not usb_unstable)
        )

        if adb_alive_display_path:
            # ADB visibility is a strong sign that Android and the main board are still
            # alive. In no-debug BSOD triage, this usually means a display/backlight/
            # connector/touch path issue rather than a BSOD-style boot failure.
            add(scores, ev, "not_bsod", 6.4, "ADB is visible and the phone appears alive; this pattern is more consistent with a display-path fault than a BSOD-style failure")
            add(scores, ev, "hardware_failure", -1.6, "ADB visibility reduces the likelihood of a deep boot-chain or mainboard BSOD-style failure")

        native_sum = _native_usb_driver_issue_summary(connection)
        if int(native_sum.get("driver_issue_count") or 0) > 0 and (not has_adb) and (not has_fastboot):
            codes = native_sum.get("driver_problem_codes") or native_sum.get("problem_codes") or []
            add(scores, ev, "not_bsod", 2.4, f"Native USB helper reports phone-like devices with driver problem codes: {codes}")
            add(scores, ev, "hardware_failure", -0.8, "Host driver/enumeration problem codes are more consistent with PC-side issues than phone hardware BSOD")

        # Additional host-side helpers (best-effort): Event Log and broad PnP snapshot.
        evsum = _eventlog_usb_issue_summary(connection)
        try:
            ev_issues = int(evsum.get("pnp_usb_issue_count") or 0)
        except Exception:
            ev_issues = 0
        if ev_issues > 0:
            add(scores, ev, "not_bsod", 1.6, f"Windows Event Log has recent USB/PnP warnings/errors ({ev_issues} hits)")
            add(scores, ev, "hardware_failure", -0.5, "Host-side USB/PnP event log issues do not prove phone hardware failure")
            if stable_mtp_only:
                add(scores, ev, "not_bsod", 1.2, "Stable MTP + host USB/PnP issues => strongly suggests PC-side instability")

        pnps = _pnp_snapshot_issue_summary(connection)
        try:
            pnp_driver_issues = int(pnps.get("driver_issue_count") or 0)
        except Exception:
            pnp_driver_issues = 0
        if pnp_driver_issues > 0 and (not has_adb) and (not has_fastboot):
            codes = pnps.get("driver_problem_codes") or []
            add(scores, ev, "not_bsod", 1.4, f"PnP snapshot shows phone-like devices with driver problem codes: {codes}")
            add(scores, ev, "hardware_failure", -0.4, "PnP snapshot driver problem codes suggest host driver/enumeration issues")
    except Exception:
        pass

    # Strong "Not BSOD" signals
    vcat = _lower(_safe_get(visual_analysis or {}, ["category"], ""))
    content_visible_hint = bool(_safe_get(visual_analysis or {}, ["content_visible_hint"], False))
    systemui_dialog_hint = bool(_safe_get(visual_analysis or {}, ["systemui_dialog_hint"], False))
    anr_dialog_hint = bool(_safe_get(visual_analysis or {}, ["anr_dialog_hint"], False))
    dialog_hint = bool(systemui_dialog_hint or anr_dialog_hint)
    try:
        contrast_std = float(_safe_get(visual_analysis or {}, ["contrast_std"], 0.0) or 0.0)
    except Exception:
        contrast_std = 0.0
    stable = None
    if isinstance(visual_analysis, dict) and isinstance(visual_analysis.get("sample"), dict):
        try:
            stable = float((visual_analysis.get("sample") or {}).get("stability"))
        except Exception:
            stable = None

    if str(top_key or "") == "not_bsod":
        add(scores, ev, "not_bsod", 6.0, "Broad diagnosis indicates not a BSOD-style case")
    if str(top_key or "") == "display_hardware":
        add(scores, ev, "not_bsod", 2.8, "Broad diagnosis indicates a live-phone display hardware issue rather than a BSOD-style boot failure")
        add(scores, ev, "hardware_failure", 0.8, "Display hardware is still a hardware issue, but not necessarily a BSOD-style one")

    # Native Android dialogs visible on-screen are strong evidence of UI/app instability.
    if dialog_hint:
        add(scores, ev, "incompatible_apps", 3.2, "Camera/OCR indicates a native ANR/System UI crash dialog on screen")
        add(scores, ev, "display_hardware", -0.8, "ANR/System UI dialog indicates the display is rendering UI; less consistent with a dead display")
        add(scores, ev, "not_bsod", 1.4, "ANR/System UI dialog suggests the phone is alive (not a deep boot failure)")

    if vcat == "normal" and (not dialog_hint):
        stable_ok = (stable is None) or (stable >= 0.7)
        content_ok = content_visible_hint or (contrast_std >= 18.0)
        if stable_ok and content_ok:
            add(scores, ev, "not_bsod", 6.0, "Camera indicates normal/visible screen content")
    if str(top_key or "") == "host_usb_driver":
        add(scores, ev, "not_bsod", 3.0, "PC-side USB driver/enumeration issue (cannot confirm BSOD)")

    # Technician questionnaire (structured) if present
    user_sym = connection.get("userSymptom") if isinstance(connection, dict) else None
    if isinstance(user_sym, dict):
        details = user_sym.get("details")
        if isinstance(details, dict):
            if bool(details.get("safeModeImproves")):
                add(scores, ev, "incompatible_apps", 3.0, "Safe Mode improves the issue")
            if bool(details.get("recentApp")):
                add(scores, ev, "incompatible_apps", 2.2, "Started after installing/updating an app")
            if bool(details.get("recentUpdate")):
                add(scores, ev, "faulty_os_updates", 2.6, "Started after an OS update")
            if bool(details.get("charging")) or bool(details.get("afterCharge")):
                add(scores, ev, "overheating", 1.0, "Symptoms correlate with charging/power")
            if bool(details.get("drop")) or bool(details.get("liquid")):
                add(scores, ev, "hardware_failure", 2.6, "Drop/liquid exposure suggests hardware damage")

    # Technician confirmed mode
    user_tech = connection.get("userTech") if isinstance(connection, dict) else None
    if not isinstance(user_tech, dict):
        user_tech = connection.get("technician") if isinstance(connection, dict) else None
    if isinstance(user_tech, dict):
        mode = _lower(user_tech.get("confirmedMode"))
        if mode:
            if mode in ("edl", "mtk_preloader", "dfu") or ("9008" in mode) or ("preloader" in mode) or ("brom" in mode):
                add(scores, ev, "hardware_failure", 3.2, f"Technician confirmed low-level mode: {mode}")
            elif mode in ("download", "odin"):
                add(scores, ev, "faulty_os_updates", 2.0, "Download/Odin mode often indicates firmware/update repair state")
            elif mode in ("fastboot", "bootloader", "recovery"):
                add(scores, ev, "corrupt_system_files", 1.4, f"Technician confirmed {mode} (Android not booting normally)")
            elif mode in ("normal", "home"):
                add(scores, ev, "not_bsod", 2.0, "Technician confirmed normal Android/UI")

    # Log evidence mapping
    if "failed-updates" in log_keys:
        add(scores, ev, "faulty_os_updates", 3.0, "ADB log evidence indicates failed updates")
    if "fs-corruption" in log_keys:
        add(scores, ev, "corrupt_system_files", 3.2, "ADB log evidence indicates filesystem corruption/mount errors")
    if "thermal" in log_keys:
        add(scores, ev, "overheating", 2.6, "ADB log evidence indicates thermal issues")
    if "systemui" in log_keys:
        add(scores, ev, "incompatible_apps", 2.8, "ADB log evidence indicates SystemUI crash / UI loop")
    if "anr" in log_keys:
        add(scores, ev, "incompatible_apps", 2.2, "ADB log evidence indicates ANR (App Not Responding)")
    if "crash-loop" in log_keys or "watchdog" in log_keys:
        # Crash loops can be app or OS: bias by other hints.
        add(scores, ev, "corrupt_system_files", 1.1, "ADB log evidence indicates crash loop/hang")

    # Keyword hints from server heuristics
    if any(w in text for w in ["filesystem", "mount", "corrupt", "corruption", "system files", "dm-verity"]):
        add(scores, ev, "corrupt_system_files", 2.2, "Heuristic reasons mention corrupt system files/mount errors")
    if any(w in text for w in ["update", "upgrade", "ota", "patch"]):
        add(scores, ev, "faulty_os_updates", 2.0, "Heuristic reasons mention OS updates")
    if any(w in text for w in ["app", "application", "safe mode", "third party", "third-party", "malware"]):
        add(scores, ev, "incompatible_apps", 1.8, "Heuristic reasons mention apps/Safe Mode")
    if any(w in text for w in ["overheat", "overheating", "thermal", "temperature", "hot"]):
        add(scores, ev, "overheating", 2.2, "Heuristic reasons mention overheating/thermal")

    # ADB battery/thermal hints
    b = adb_sig.get("battery") if isinstance(adb_sig.get("battery"), dict) else {}
    temp_c = b.get("temperatureC")
    if isinstance(temp_c, (int, float)) and float(temp_c) >= 50.0:
        add(scores, ev, "overheating", 2.4, f"Battery temperature is high ({float(temp_c):.1f}°C)")

    # Broad diagnosis mapping: if it's clearly hardware-like, keep hardware_failure as a strong option.
    # Exception: Samsung Download/Odin is a firmware repair state; treat as OS/firmware.
    if str(top_key or "") in ("display_hardware", "low_level_mode", "power_mainboard"):
        if str(top_key or "") == "low_level_mode" and looks_samsung_download:
            add(scores, ev, "faulty_os_updates", 2.0, "Broad diagnosis is low-level mode, but transport indicates Samsung Download/Odin")
            add(scores, ev, "hardware_failure", -2.0, "Override broad low_level_mode→hardware_failure for Samsung Download/Odin")
        else:
            add(scores, ev, "hardware_failure", 2.0, f"Broad diagnosis category: {top_key}")

    # Specific 4-way mapping (best-effort)
    spec_key = str((specific or {}).get("key") or "") if isinstance(specific, dict) else ""
    if spec_key == "apps_conflict":
        add(scores, ev, "incompatible_apps", 2.2, "Specific cause indicates app conflict")
    elif spec_key == "os_corruption":
        add(scores, ev, "corrupt_system_files", 1.8, "Specific cause indicates OS corruption")
    elif spec_key == "battery_problem":
        add(scores, ev, "overheating", 1.6, "Specific cause indicates power/thermal issues")
    elif spec_key == "other":
        add(scores, ev, "hardware_failure", 0.9, "Specific cause indicates other/hardware")

    # Soft fallback: avoid forcing "hardware_failure" when evidence is weak.
    add(scores, ev, "hardware_failure", 0.25, "Fallback")
    add(scores, ev, "not_bsod", 0.15, "Fallback")

    probs = _softmax(scores)
    chosen_key = max(probs.keys(), key=lambda k: float(probs.get(k, 0.0))) if probs else "hardware_failure"
    chosen_p = float(probs.get(chosen_key, 0.0)) if probs else 0.0

    # Avoid showing 100%+ confidence on weak USB-only evidence.
    # If we only have stable MTP (no ADB/Fastboot) and no strong visual "normal" proof,
    # cap Not-BSOD confidence so the UI stays conservative.
    if (
        chosen_key == "not_bsod"
        and stable_mtp_only
        and (not has_adb)
        and (not has_fastboot)
        and (vcat != "normal")
    ):
        chosen_p = float(min(float(chosen_p), 0.92))

    ranked = sorted(
        (
            {
                "key": k,
                "label": _BSOD5_LABELS.get(k, k),
                "confidence": round(float(probs.get(k, 0.0)), 4),
                "score": round(float(scores.get(k, 0.0)), 3),
                "evidence": (ev.get(k) or [])[:5],
            }
            for k in scores.keys()
        ),
        key=lambda r: r["confidence"],
        reverse=True,
    )

    return {
        "key": chosen_key,
        "label": _BSOD5_LABELS.get(chosen_key, chosen_key),
        "confidence": round(chosen_p, 4),
        "evidence": (ev.get(chosen_key) or [])[:5],
        "ranked": ranked[:5],
    }


def diagnose(connection: Dict[str, Any], visual: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    adb_devices = _as_list(_safe_get(connection, ["adb", "devices"], []))
    fastboot_devices = _as_list(_safe_get(connection, ["fastboot", "devices"], []))

    host_usb = connection.get("hostUsb") or {}
    portable, transport = _phone_like_host_usb_lists(connection)

    usb_sample = host_usb.get("sample") or {}
    usb_unstable = bool(usb_sample.get("anyChange"))
    try:
        usb_change_count = int(usb_sample.get("changeCount") or 0)
    except Exception:
        usb_change_count = 0
    try:
        usb_stability = float(usb_sample.get("stability") or 1.0)
    except Exception:
        usb_stability = 1.0
    try:
        usb_sample_count = int(usb_sample.get("count") or 0)
    except Exception:
        usb_sample_count = 0
    try:
        portable_seen = int(usb_sample.get("portableSeenCount") or 0)
    except Exception:
        portable_seen = 0
    try:
        transport_seen = int(usb_sample.get("transportSeenCount") or 0)
    except Exception:
        transport_seen = 0

    if usb_sample_count <= 0:
        usb_sample_count = max(1, usb_change_count + 1)
    if portable_seen <= 0:
        portable_seen = 1 if len(portable) > 0 else 0
    if transport_seen <= 0:
        transport_seen = 1 if len(transport) > 0 else 0

    usb_flapping_severe = (usb_change_count >= 6) or (usb_stability > 0 and usb_stability < 0.55)

    bsod = connection.get("bsodAnalysis") or {}
    # Prefer part1 if present (richer categorization).
    part1 = bsod.get("part1") if isinstance(bsod.get("part1"), dict) else None
    active = part1 if isinstance(part1, dict) else bsod

    bsod_cat = str((active or {}).get("primaryReason") or (active or {}).get("category") or "")
    bsod_conf = str((active or {}).get("confidence") or bsod.get("confidence") or "")
    bsod_reasons = [str(r) for r in (_as_list((active or {}).get("reasons")))]

    sig = _extract_signals(connection)
    adb_sig = sig.get("adb") if isinstance(sig.get("adb"), dict) else {}
    fb_vars = sig.get("fastboot_vars") if isinstance(sig.get("fastboot_vars"), dict) else {}
    log_keys = sig.get("log_keys") if isinstance(sig.get("log_keys"), set) else set()

    # BSOD-like symptom flags (evidence of crash/boot instability) used to prevent
    # false "not BSOD" summaries when kernel panic / crash-loop / ANR are present.
    boot_reason_l = ""
    try:
        boot_reason_l = _lower((sig.get("adb") or {}).get("bootReason") or "")
    except Exception:
        boot_reason_l = ""
    has_kernel_panic_signal = ("kernel" in boot_reason_l) or ("panic" in boot_reason_l)
    has_crash_loop_signal = "crash-loop" in log_keys
    has_anr_signal = "anr" in log_keys
    has_systemui_loop_signal = "systemui" in log_keys

    visual_analysis = (visual or {}).get("analysis") if isinstance(visual, dict) else None
    visual_cat = _lower(_safe_get(visual_analysis or {}, ["category"], ""))
    visual_conf = _lower(_safe_get(visual_analysis or {}, ["confidence"], ""))
    visual_sample = visual_analysis.get("sample") if isinstance(visual_analysis, dict) else None
    stability = None
    if isinstance(visual_sample, dict):
        try:
            stability = float(visual_sample.get("stability"))
        except Exception:
            stability = None

    # Visual hints for "not BSOD": content visible is a stronger indicator than just "Normal".
    content_visible_hint = bool(_safe_get(visual_analysis or {}, ["content_visible_hint"], False))
    # Visual crash hints (camera OCR): allow kernel panic screens to override Not-BSOD.
    visual_kernel_panic_hint = bool(_safe_get(visual_analysis or {}, ["kernel_panic_hint"], False))
    ocr_text_l = _lower(_safe_get(visual_analysis or {}, ["ocr_text_sample"], ""))
    if ("kernel panic" in ocr_text_l) or ("not syncing" in ocr_text_l) or ("panic:" in ocr_text_l):
        visual_kernel_panic_hint = True
    has_kernel_panic_signal = bool(has_kernel_panic_signal or visual_kernel_panic_hint)
    try:
        contrast_std = float(_safe_get(visual_analysis or {}, ["contrast_std"], 0.0) or 0.0)
    except Exception:
        contrast_std = 0.0

    scores: Dict[HypothesisKey, float] = {h.key: 0.0 for h in HYPOTHESES}
    evidence: Dict[HypothesisKey, List[str]] = {h.key: [] for h in HYPOTHESES}

    def add(key: HypothesisKey, points: float, why: str) -> None:
        scores[key] += points
        evidence[key].append(why)

    has_adb = len(adb_devices) > 0
    has_fastboot = len(fastboot_devices) > 0
    has_mtp = len(portable) > 0
    has_transport = len(transport) > 0

    # Device-manager health signals (Windows Portable/WPD status is particularly useful).
    not_ok_portable = [p for p in portable if isinstance(p, dict) and _lower(p.get("status")) not in ("ok", "")]
    not_ok_transport = [t for t in transport if isinstance(t, dict) and _lower(t.get("status")) not in ("ok", "")]

    # Optional user/technician symptom hint (best-effort)
    user_sym = connection.get("userSymptom") if isinstance(connection, dict) else None
    if isinstance(user_sym, dict):
        choice = _lower(user_sym.get("choice"))
        note = _lower(user_sym.get("text"))
        hint = (choice + " " + note).strip()
        if hint:
            if "blue" in hint:
                add("display_hardware", 1.2, "User reports blue screen / blue tint")
            if "blank" in hint or "black" in hint or "no display" in hint:
                add("display_hardware", 0.8, "User reports blank/black display")
                add("power_mainboard", 0.4, "Blank display can also be backlight/power")
            if "lines" in hint or "flicker" in hint or "artifact" in hint:
                add("display_hardware", 1.1, "User reports lines/flicker/artifacts (panel/connector hint)")
            if "boot" in hint and ("loop" in hint or "restart" in hint or "reboot" in hint):
                add("software_firmware", 1.2, "User reports boot loop/restarts")
                add("power_mainboard", 0.4, "Boot loop can also be power/storage")
            if "stuck" in hint or "logo" in hint or "boot screen" in hint:
                add("software_firmware", 1.0, "User reports stuck on logo/boot screen")
            if "no power" in hint or "dead" in hint or "no sign" in hint:
                add("power_mainboard", 1.5, "User reports no power/signs of life")
            if "hot" in hint or "overheat" in hint or "thermal" in hint:
                add("power_mainboard", 0.4, "User reports overheating")
                add("display_hardware", 0.2, "Heat can affect display/backlight")

        details = user_sym.get("details")
        if isinstance(details, dict):
            if bool(details.get("safeModeImproves")):
                add("software_firmware", 2.2, "Safe Mode improves the issue (strong app/third‑party signal)")
            if bool(details.get("recentApp")):
                add("software_firmware", 1.4, "Started after installing/updating an app")
            if bool(details.get("recentUpdate")):
                add("software_firmware", 1.6, "Started after an OS update")
            if bool(details.get("charging")):
                add("display_hardware", 0.4, "Charging icon/vibration suggests the phone powers on")
            if bool(details.get("charging")) or bool(details.get("afterCharge")):
                add("power_mainboard", 1.1, "Symptoms correlate with charging/power")
            if bool(details.get("drop")):
                add("display_hardware", 0.7, "Recent drop/impact can damage display/connector")
                add("power_mainboard", 0.5, "Recent drop/impact can also damage board/battery")
            if bool(details.get("liquid")):
                add("power_mainboard", 0.8, "Liquid/moisture exposure can cause shorts/corrosion")
                add("display_hardware", 0.4, "Liquid exposure can also affect display/backlight")

            # Deterministic technician confirmations (strongest signals; used for VERIFIED verdict when consistent).
            if bool(details.get("screenTestFixed")):
                add("display_hardware", 6.0, "Known-good screen test fixed the issue (verified display hardware)")
                add("software_firmware", -0.6, "Screen test fix points away from OS/firmware as primary cause")
                add("power_mainboard", -0.4, "Screen test fix points away from deep power/mainboard failure")
            if bool(details.get("worksOtherPc")):
                add("host_usb_driver", 6.0, "Works on another known-good PC/cable (verified PC-side USB/driver issue)")
                add("power_mainboard", -0.7, "Works on another PC reduces likelihood of phone hardware failure")
                add("software_firmware", -0.4, "Works on another PC reduces likelihood of phone firmware fault")

    # Optional technician-confirmed mode (strong signal; best-effort)
    user_tech = connection.get("userTech") if isinstance(connection, dict) else None
    if not isinstance(user_tech, dict):
        user_tech = connection.get("technician") if isinstance(connection, dict) else None
    if isinstance(user_tech, dict):
        mode = _lower(user_tech.get("confirmedMode"))
        if mode:
            if "edl" in mode or "9008" in mode:
                add("low_level_mode", 5.0, "Technician confirmed Qualcomm EDL/9008 mode")
            elif "mtk" in mode or "preloader" in mode or "brom" in mode:
                add("low_level_mode", 5.0, "Technician confirmed MTK Preloader/BROM mode")
            elif "dfu" in mode:
                add("low_level_mode", 4.0, "Technician confirmed DFU mode")
            elif "download" in mode or "odin" in mode:
                # Samsung Download/Odin is a firmware repair state.
                # Treat it as software/firmware rather than generic low-level/hardware.
                add("software_firmware", 4.5, "Technician confirmed Download/Odin mode (firmware repair state)")
            elif "fastboot" in mode or "bootloader" in mode:
                add("software_firmware", 3.0, "Technician confirmed fastboot/bootloader mode")
            elif "recovery" in mode:
                add("software_firmware", 2.0, "Technician confirmed recovery mode")
            elif "normal" in mode or "home" in mode:
                add("not_bsod", 2.0, "Technician confirmed device boots to normal Android")

    # Strong signals first
    low_level, ll_reasons = _detect_low_level(connection)
    if not has_adb and not has_fastboot and not has_mtp and has_transport and low_level:
        # Special-case Samsung Download/Odin: firmware repair state, not a generic
        # low-level (EDL/MTK/DFU) hardware-like bucket.
        ll_text = "; ".join([str(r or "") for r in (ll_reasons or [])])
        if "download/odin" in ll_text.lower() or "samsung download" in ll_text.lower():
            add("software_firmware", 5.0, ll_text)
        else:
            add("low_level_mode", 5.0, ll_text)

    # If the host sees absolutely nothing (no transport, no portable/MTP, no ADB/fastboot),
    # USB-only diagnostics cannot confirm BSOD vs frozen OS vs USB disabled vs bad cable/port.
    if (not has_adb) and (not has_fastboot) and (not has_mtp) and (not has_transport):
        add(
            "power_mainboard",
            1.2,
            "No USB visibility from the host (no transport/MTP/ADB/fastboot). USB-only cannot confirm BSOD vs hard freeze vs USB disabled vs cable/port.",
        )
        add("host_usb_driver", 0.8, "No enumeration can also be caused by cable/port/hub or PC driver/stack issues")

    if has_fastboot and not has_adb:
        add("software_firmware", 3.0, "Fastboot present but ADB absent (Android not fully booted)")

        # Fastboot getvar hints about update/snapshot/slots (vendor-dependent).
        snapshot = _lower(fb_vars.get("snapshot-update-status") or fb_vars.get("snapshot_state") or "")
        if snapshot and snapshot not in ("none", "ok", "success"):
            add("software_firmware", 1.8, f"Fastboot vars indicate snapshot/update state: {snapshot}")

        # Slot/boot reason hints.
        slot = _lower(fb_vars.get("current-slot") or fb_vars.get("slot") or "")
        if slot:
            add("software_firmware", 0.2, f"Fastboot current slot: {slot}")

    # Stable MTP-only is a strong sign-of-life. Do not let a missing ADB driver
    # (often shown as a non-OK ADB interface transport entry on Windows) defeat it.
    not_ok_transport_non_adb = [t for t in not_ok_transport if not _is_adb_driver_transport(t)]
    stable_mtp_only = bool(
        has_mtp
        and (not has_adb)
        and (not has_fastboot)
        and (not usb_unstable)
        and (not not_ok_portable)
        and (not not_ok_transport_non_adb)
    )

    if has_mtp and not has_adb:
        # MTP visibility is a normal sign-of-life. ADB absence here is most often just
        # "USB debugging off / not trusted" and should not be treated as BSOD evidence.
        if stable_mtp_only:
            add(
                "not_bsod",
                6.2,
                "Stable MTP/Portable enumeration on Windows (host-side sign of life). Phone can still be frozen/locked; ADB may be disabled/not trusted",
            )
            add("display_hardware", -0.8, "Stable MTP without other failure signals reduces likelihood of a BSOD-style fault")
        else:
            add("software_firmware", 0.3, "MTP present but ADB absent (limited visibility)")

    if usb_unstable:
        if usb_flapping_severe:
            add(
                "power_mainboard",
                2.0,
                f"Severe USB flapping during sampling ({usb_change_count} changes, stability {usb_stability:.2f})",
            )
            add(
                "host_usb_driver",
                1.2,
                "Severe flapping can also be caused by cable/port/driver instability",
            )
        else:
            add("host_usb_driver", 2.0, "USB visibility changed during sampling (unstable cable/port/hub)")
            add("power_mainboard", 0.8, "Unstable USB can also happen with failing port/mainboard")

        # Intermittent enumeration detail
        if transport_seen > 0 and transport_seen < usb_sample_count:
            add("power_mainboard", 0.8, f"USB transport device appears/disappears ({transport_seen}/{usb_sample_count} samples)")
        if portable_seen > 0 and portable_seen < usb_sample_count:
            add("software_firmware", 0.7, f"MTP/Portable appears/disappears ({portable_seen}/{usb_sample_count} samples)")

    # Host driver hint: any portable status not OK
    not_ok_portable = [p for p in portable if _lower(p.get("status")) not in ("ok", "")]
    if not_ok_portable:
        add("host_usb_driver", 2.0, "Windows reports a portable/WPD device with non-OK status")

    # Native helper hint: Device Manager problem codes on phone-like devices
    native_sum = _native_usb_driver_issue_summary(connection)
    try:
        driver_issue_count = int(native_sum.get("driver_issue_count") or 0)
    except Exception:
        driver_issue_count = 0
    if driver_issue_count > 0:
        codes = native_sum.get("driver_problem_codes") or native_sum.get("problem_codes") or []
        add("host_usb_driver", 2.6, f"Native USB helper reports phone-like devices with problem codes: {codes}")
        add("power_mainboard", -0.4, "Native problem codes suggest host driver/enumeration issues before phone hardware")
        if has_mtp and (not usb_unstable):
            add("not_bsod", 0.8, "MTP visible + native driver problem codes => likely PC-side enumeration issue")

    # Additional host-side helpers (event log + broad PnP snapshot)
    evsum = _eventlog_usb_issue_summary(connection)
    try:
        ev_issues = int(evsum.get("pnp_usb_issue_count") or 0)
    except Exception:
        ev_issues = 0
    if ev_issues > 0:
        add("host_usb_driver", 1.6, f"Windows Event Log shows recent USB/PnP warnings/errors ({ev_issues} hits)")
        add("power_mainboard", -0.2, "Event Log USB/PnP issues are host-side signals (not proof of phone hardware BSOD)")
        if stable_mtp_only:
            add("not_bsod", 1.0, "Stable MTP + host USB/PnP event log issues => likely PC-side instability")

    pnps = _pnp_snapshot_issue_summary(connection)
    try:
        pnp_driver_issues = int(pnps.get("driver_issue_count") or 0)
    except Exception:
        pnp_driver_issues = 0
    if pnp_driver_issues > 0:
        codes = pnps.get("driver_problem_codes") or []
        add("host_usb_driver", 1.2, f"PnP snapshot shows phone-like devices with driver problem codes: {codes}")
        add("power_mainboard", -0.2, "PnP snapshot problem codes suggest host driver/enumeration issues")
        if stable_mtp_only:
            add("not_bsod", 0.6, "Stable MTP contradicts deep failure; host driver problem codes fit PC-side issues")

    # Visual cues
    if visual_kernel_panic_hint:
        add("software_firmware", 2.6, "Camera/OCR indicates kernel panic / low-level crash text")
        add("power_mainboard", 0.8, "Kernel panic/crash text can indicate low-level instability")
        add("not_bsod", -3.4, "Kernel panic text contradicts a confident Not-BSOD conclusion")

    if visual_cat:
        # New camera helper categories are typically: blue / dark / normal.
        if "blue" in visual_cat or "cyan" in visual_cat:
            # If content/edges are visible and the category is stable, a blue-tinted
            # wallpaper/lockscreen/theme is common and should not be treated as a BSOD.
            stable_ok = (stability is None) or (stability >= 0.7)
            conf_ok = visual_conf in ("medium", "high", "")
            content_ok = content_visible_hint or (contrast_std >= 18.0)
            if stable_ok and conf_ok and content_ok:
                add("not_bsod", 3.2, "Camera shows blue tint but UI/content appears visible and stable (likely wallpaper/theme, not BSOD)")
                add("display_hardware", -0.6, "Visible content contradicts a solid blue/blank screen fault")
            else:
                add("display_hardware", 2.0, "Camera sees strong blue/cyan screen")
        if "dark" in visual_cat or "off" in visual_cat or "black" in visual_cat:
            if stable_mtp_only:
                # When MTP is stable, a dark camera capture is often just screen sleep,
                # underexposed camera, or lock-screen off; keep this as weak evidence.
                add("display_hardware", 0.2, "Camera sees dark/off display but MTP is stable (weak signal)")
                add("not_bsod", 1.4, "Stable MTP contradicts deep failure; camera dark alone is not enough")
            else:
                add("display_hardware", 1.5, "Camera sees very dark/off display")
                add("power_mainboard", 0.7, "Very dark display can also be power/backlight/mainboard")

        if "normal" in visual_cat:
            # Only treat as strong evidence when content is visible and stable.
            stable_ok = (stability is None) or (stability >= 0.7)
            conf_ok = visual_conf in ("medium", "high", "")
            content_ok = content_visible_hint or (contrast_std >= 18.0)
            if stable_ok and conf_ok and content_ok:
                add("not_bsod", 5.0, "Camera indicates screen content is visible (normal UI)")
                add("display_hardware", -1.2, "Visible normal UI reduces likelihood of a blue/blank screen fault")
                add("software_firmware", -0.8, "Visible normal UI reduces likelihood of boot instability")

    # Blend in existing bsodAnalysis text (from server heuristics)
    bsod_text = (bsod_cat + " " + " ".join(bsod_reasons)).lower()
    if "low-level" in bsod_text or "edl" in bsod_text or "9008" in bsod_text or "preloader" in bsod_text or "brom" in bsod_text:
        add("low_level_mode", 3.0, "Server heuristics indicate low-level USB mode")
    if "driver" in bsod_text or "enumeration" in bsod_text or "unknown usb" in bsod_text:
        add("host_usb_driver", 2.0, "Server heuristics indicate host driver/enumeration issue")
    if "display" in bsod_text or "lcd" in bsod_text or "connector" in bsod_text or "panel" in bsod_text:
        add("display_hardware", 1.5, "Server heuristics indicate display/connector/panel issue")
    if "software" in bsod_text or "firmware" in bsod_text or "corrupt" in bsod_text or "bootloader" in bsod_text:
        add("software_firmware", 1.5, "Server heuristics indicate software/firmware instability")

    # Deep ADB-only evidence (read-only) when present.
    boot_completed = adb_sig.get("bootCompleted")
    if boot_completed is True:
        add("display_hardware", 0.8, "ADB signals indicate Android finished booting (screen issue more likely)" )
    if boot_completed is False and has_adb:
        add("software_firmware", 1.2, "ADB reachable but boot not complete (possible crash loop / boot hang)")

    boot_reason = _lower(adb_sig.get("bootReason"))
    if boot_reason:
        if "watchdog" in boot_reason or "hang" in boot_reason:
            add("software_firmware", 1.4, f"Boot reason suggests hang/watchdog: {boot_reason}")
        if "kernel" in boot_reason or "panic" in boot_reason:
            add("software_firmware", 1.4, f"Boot reason suggests kernel panic: {boot_reason}")
        if "thermal" in boot_reason:
            add("power_mainboard", 1.1, f"Boot reason suggests thermal shutdown: {boot_reason}")

    vbs = _lower(adb_sig.get("verifiedBootState"))
    if vbs in ("orange", "yellow"):
        add("software_firmware", 0.4, f"Verified boot state is {vbs} (non-stock / modified boot can destabilize)")

    vbmeta = _lower(adb_sig.get("vbmetaDeviceState"))
    if vbmeta in ("unlocked", "locked"):
        add("software_firmware", 0.1, f"vbmeta device state: {vbmeta}")

    # Battery & thermal hints
    b = adb_sig.get("battery") if isinstance(adb_sig.get("battery"), dict) else {}
    level = b.get("level")
    temp_c = b.get("temperatureC")
    if isinstance(level, (int, float)) and 0 <= float(level) <= 2:
        add("power_mainboard", 0.9, f"Battery level is critical ({int(level)}%)")
    if isinstance(temp_c, (int, float)) and float(temp_c) >= 50.0:
        add("power_mainboard", 1.2, f"Battery temperature is high ({float(temp_c):.1f}°C)")

    # Storage pressure can cause boot loops and update failures.
    use_pct = adb_sig.get("dataPartitionUsePct")
    if isinstance(use_pct, (int, float)) and float(use_pct) >= 95.0:
        add("software_firmware", 1.0, f"/data partition is nearly full ({int(use_pct)}% used)")

    # Log evidence (keyword-based) if present.
    if "failed-updates" in log_keys:
        add("software_firmware", 2.2, "ADB logcat evidence indicates failed updates")
    if "fs-corruption" in log_keys:
        add("software_firmware", 2.4, "ADB logcat evidence indicates filesystem corruption / mount errors")
    if "crash-loop" in log_keys:
        add("software_firmware", 2.0, "ADB logcat evidence indicates system crash loop")
    if "watchdog" in log_keys:
        add("software_firmware", 1.6, "ADB logcat evidence indicates watchdog/hang")
    if "systemui" in log_keys:
        add("software_firmware", 2.2, "ADB logcat evidence indicates SystemUI crash / UI loop")
        add("display_hardware", -0.4, "SystemUI crash-loop evidence points to software/UI conflicts, not display hardware")
    if "anr" in log_keys:
        add("software_firmware", 1.8, "ADB logcat evidence indicates ANR (App Not Responding)")
    if "thermal" in log_keys:
        add("power_mainboard", 1.4, "ADB logcat evidence indicates thermal issues")

    # Confidence shaping based on visual stability
    if stability is not None and stability >= 0.8:
        # More stable visual signal = slightly boost display-related hypothesis
        add("display_hardware", 0.4, f"Visual classification stability {stability:.2f}")
        if "normal" in visual_cat and (content_visible_hint or contrast_std >= 18.0):
            add("not_bsod", 0.6, f"Visual stability {stability:.2f}")

    # If we have absolutely nothing, lean to power/mainboard.
    if not (has_adb or has_fastboot or has_mtp or has_transport):
        add("power_mainboard", 2.5, "No ADB/fastboot/MTP/transport devices detected")

    # Confidence calibration: avoid overconfidence when evidence is weak.
    evidence_count = sum(len(v) for v in evidence.values())
    top2 = sorted(scores.values(), reverse=True)[:2]
    score_gap = (top2[0] - top2[1]) if len(top2) == 2 else (top2[0] if top2 else 0.0)
    total_strength = sum(abs(v) for v in scores.values())

    temperature = 1.35
    if evidence_count <= 3 or total_strength < 6.0:
        temperature = 1.85
    elif score_gap >= 3.5 and evidence_count >= 7:
        temperature = 1.1

    probs = _softmax_temp(scores, temperature)

    # Final calibration: cap extreme confidence unless multiple independent
    # modalities agree (USB/ADB/fastboot/visual/user symptom).
    visual_present = bool(visual_analysis)
    user_present = bool(isinstance(user_sym, dict) and ((user_sym.get("choice") or "") or (user_sym.get("text") or "")))
    host_present = bool(has_mtp or has_transport)
    modality_count = int(bool(host_present)) + int(bool(has_adb)) + int(bool(has_fastboot)) + int(bool(visual_present)) + int(bool(user_present))

    max_top = 0.88
    if modality_count <= 1:
        max_top = 0.72
    elif modality_count == 2:
        max_top = 0.82
    elif modality_count == 3:
        max_top = 0.88
    else:
        max_top = 0.93

    # Special case: stable MTP-only is a strong USB-only sign-of-life. When it is
    # present and the model's top hypothesis is Not BSOD, allow a higher cap so
    # the UI can reflect high confidence in this "not a BSOD" scenario.
    if stable_mtp_only:
        max_top = max(max_top, 0.95)

    bsod_conf_l = _lower(bsod_conf)
    if bsod_conf_l == "high":
        max_top = min(0.95, max_top + 0.04)
    elif bsod_conf_l == "low":
        max_top = max(0.65, max_top - 0.04)

    # Determine current top key before ranking.
    top_key = max(probs.keys(), key=lambda k: float(probs.get(k, 0.0))) if probs else ""
    if top_key:
        probs = _calibrate_top_probability(probs, top_key=top_key, max_top=max_top)

    ranked = sorted(
        (
            {
                "key": h.key,
                "label": h.label,
                "confidence": round(float(probs.get(h.key, 0.0)), 4),
                "score": round(float(scores.get(h.key, 0.0)), 3),
                "evidence": evidence.get(h.key, [])[:6],
            }
            for h in HYPOTHESES
        ),
        key=lambda r: r["confidence"],
        reverse=True,
    )

    top = ranked[0] if ranked else {
        "key": "power_mainboard",
        "label": "Power / mainboard / deep hardware failure",
        "confidence": 0.0,
    }

    report: Dict[str, Any] = {
        "ok": True,
        "top": top,
        "ranked": ranked[:3],
        "inputs": {
            "has_adb": has_adb,
            "has_fastboot": has_fastboot,
            "has_mtp": has_mtp,
            "has_transport": has_transport,
            "adb_count": int(len(adb_devices)),
            "fastboot_count": int(len(fastboot_devices)),
            "mtp_count": int(len(portable)),
            "transport_count": int(len(transport)),
            "portable_not_ok_count": int(len(not_ok_portable)),
            "transport_not_ok_count": int(len(not_ok_transport)),
            "usb_unstable": usb_unstable,
            "usb_change_count": usb_change_count,
            "usb_stability": round(float(usb_stability), 3),
            "usb_flapping_severe": bool(usb_flapping_severe),
            "usb_portable_seen": portable_seen,
            "usb_transport_seen": transport_seen,
            "usb_sample_count": int(usb_sample_count),
            "visual_present": bool(visual_analysis),
            "visual_stability": stability,
            "bsod_analysis_present": bool(bsod_cat or bsod_reasons),
            "user_symptom_present": bool(isinstance(user_sym, dict) and ((user_sym.get("choice") or "") or (user_sym.get("text") or ""))),
            "signals_present": bool(isinstance(connection.get("signals"), dict)),
            "adb_log_evidence_present": bool(len(log_keys) > 0),
            "modality_count": modality_count,
            "confidence_cap": max_top,
        },
    }

    # Extra human-friendly observed signals (used for explanations)
    try:
        obs: List[str] = []
        if has_adb:
            obs.append("ADB visible")
        else:
            obs.append("ADB not visible")
        if has_fastboot:
            obs.append("Fastboot visible")
        if has_mtp:
            obs.append("MTP/Portable visible")
            if not_ok_portable:
                obs.append("MTP/Portable has driver/wpd warning")
        else:
            obs.append("MTP/Portable not visible")
        if usb_unstable:
            obs.append("USB unstable")
        if usb_flapping_severe:
            obs.append("USB flapping severe")
        try:
            if usb_sample_count and usb_change_count is not None:
                obs.append(f"USB changes: {int(usb_change_count)}/{int(usb_sample_count)}")
        except Exception:
            pass

        # Intermittency details (when deep sampling provides seen counts).
        try:
            if usb_sample_count and isinstance(portable_seen, int) and 0 < portable_seen < int(usb_sample_count):
                obs.append(f"MTP intermittent ({portable_seen}/{int(usb_sample_count)})")
            if usb_sample_count and isinstance(transport_seen, int) and 0 < transport_seen < int(usb_sample_count):
                obs.append(f"Transport intermittent ({transport_seen}/{int(usb_sample_count)})")
        except Exception:
            pass
        if has_transport and not (has_adb or has_fastboot or has_mtp):
            obs.append("USB transport only")
        if isinstance(user_sym, dict) and str(user_sym.get("choice") or "").strip():
            obs.append(f"Symptom: {str(user_sym.get('choice') or '').strip()}")
        if isinstance(user_tech, dict) and str(user_tech.get("confirmedMode") or "").strip():
            obs.append(f"Mode: {str(user_tech.get('confirmedMode') or '').strip()}")
        if bsod_cat:
            obs.append(f"Heuristic: {bsod_cat}")
        report["observedSignals"] = obs[:10]
    except Exception:
        report["observedSignals"] = []

    # Technician-friendly 4-way cause (used by BSOD modal UI + memory)
    try:
        report["specific"] = _classify_specific_cause(
            connection,
            visual,
            top_key=str(top.get("key") or ""),
            bsod_cat=bsod_cat,
            bsod_conf=bsod_conf,
            bsod_reasons=bsod_reasons,
            adb_sig=adb_sig,
            log_keys=log_keys,
        )
    except Exception:
        report["specific"] = {
            "key": "other",
            "label": "Other / hardware / USB driver / not a BSOD",
            "confidence": 0.0,
            "evidence": [],
        }

    # Required 5-cause BSOD label (plus Not BSOD fallback)
    try:
        # Override guard: if strong BSOD-like symptoms exist, prevent returning
        # a BSOD5 key of "not_bsod" purely due to missing blue/blank screen cues.
        report["bsod5"] = _classify_bsod5_cause(
            connection,
            visual,
            top_key=str(top.get("key") or ""),
            specific=(report.get("specific") if isinstance(report, dict) else None),
            bsod_cat=bsod_cat,
            bsod_reasons=bsod_reasons,
            adb_sig=adb_sig,
            log_keys=log_keys,
        )

        try:
            bsod5k = str((report.get("bsod5") or {}).get("key") or "")
            # Low-level transport signatures should only override a Not-BSOD result when
            # they represent the *current* USB state (i.e., no MTP/ADB/fastboot) or when
            # a technician explicitly confirmed the low-level mode.
            tech_mode_l = ""
            try:
                tech_mode_l = _lower((user_tech or {}).get("confirmedMode")) if isinstance(user_tech, dict) else ""
            except Exception:
                tech_mode_l = ""
            tech_low_level_confirmed = bool(
                tech_mode_l
                and (
                    ("edl" in tech_mode_l)
                    or ("9008" in tech_mode_l)
                    or ("mtk" in tech_mode_l)
                    or ("preloader" in tech_mode_l)
                    or ("brom" in tech_mode_l)
                    or ("dfu" in tech_mode_l)
                    or ("download" in tech_mode_l)
                    or ("odin" in tech_mode_l)
                )
            )
            low_level_current_state = bool(low_level and (not has_adb) and (not has_fastboot) and (not has_mtp) and has_transport)
            has_ll_override = bool(tech_low_level_confirmed or low_level_current_state)
            has_bsod_like_symptoms = bool(
                has_kernel_panic_signal or has_crash_loop_signal or has_systemui_loop_signal or has_anr_signal
            )
            if bsod5k == "not_bsod" and (has_ll_override or has_bsod_like_symptoms):
                # Keep override keys within the BSOD5 contract.
                if has_bsod_like_symptoms:
                    if has_kernel_panic_signal:
                        override_key = "hardware_failure"
                        override_ev = ["Kernel panic/crash text detected (boot reason or camera OCR)"]
                    elif has_systemui_loop_signal or has_anr_signal:
                        override_key = "incompatible_apps"
                        override_ev = ["System UI crash/ANR evidence present (logs or camera OCR)"]
                    elif has_crash_loop_signal:
                        override_key = "corrupt_system_files"
                        override_ev = ["Crash-loop evidence present (logs)"]
                    else:
                        override_key = "corrupt_system_files"
                        override_ev = ["Boot/crash instability evidence present"]
                    override_label = _BSOD5_LABELS.get(override_key, override_key)
                else:
                    # Low-level USB modes indicate Android is not running normally.
                    # For the BSOD-5 contract, treat these as OS/firmware causes rather
                    # than generic hardware failure (especially for Download/Odin).
                    override_key = "faulty_os_updates"
                    override_label = _BSOD5_LABELS.get(override_key, "Faulty OS updates")
                    override_ev = [
                        "Low-level USB mode detected (Download/EDL/Preloader) suggests Android is not running; firmware repair state",
                    ]

                prev_bsod5 = report.get("bsod5") if isinstance(report, dict) else None
                prev_ranked = (prev_bsod5 or {}).get("ranked") if isinstance(prev_bsod5, dict) else None

                report["bsod5"] = {
                    "key": override_key,
                    "label": override_label,
                    "confidence": 0.0,
                    "evidence": override_ev,
                    "ranked": prev_ranked or [],
                    "overridden": True,
                    "overridden_from": "not_bsod",
                }

                # Align confidence with the overridden key (best-effort).
                try:
                    ranked_list = prev_ranked
                    override_conf = None
                    if isinstance(ranked_list, list):
                        for it in ranked_list:
                            if not isinstance(it, dict):
                                continue
                            if str(it.get("key") or "") == str(override_key):
                                c = it.get("confidence")
                                if isinstance(c, (int, float)):
                                    override_conf = float(c)
                                break
                    if override_conf is None:
                        prev_c = (prev_bsod5 or {}).get("confidence") if isinstance(prev_bsod5, dict) else None
                        override_conf = float(prev_c) if isinstance(prev_c, (int, float)) else 0.0
                    report["bsod5"]["confidence"] = float(override_conf)
                except Exception:
                    report["bsod5"]["confidence"] = 0.0
        except Exception:
            pass
    except Exception:
        report["bsod5"] = {
            "key": "hardware_failure",
            "label": _BSOD5_LABELS.get("hardware_failure", "Hardware failure"),
            "confidence": 0.0,
            "evidence": [],
            "ranked": [],
        }

    # General 5-cause "phone not working properly" causes (software/storage/apps/connectivity/hardware)
    try:
        report["common5"] = _classify_common_phone_causes(
            connection,
            visual,
            top_key=str(top.get("key") or ""),
            bsod_cat=bsod_cat,
            bsod_reasons=bsod_reasons,
            adb_sig=adb_sig,
            log_keys=log_keys,
        )
    except Exception:
        report["common5"] = {
            "top": {"key": "software_glitches", "label": _COMMON5_LABELS.get("software_glitches", "Software glitches"), "confidence": 0.0},
            "ranked": [],
        }

    # Human-friendly summary (short, practical, safe)
    try:
        bsod5_lab = str((report.get("bsod5") or {}).get("label") or "")
        bsod5_key = str((report.get("bsod5") or {}).get("key") or "")
        common_top = report.get("common5") if isinstance(report.get("common5"), dict) else {}
        common_top_lab = str(((common_top or {}).get("top") or {}).get("label") or "")
        parts: List[str] = []

        # If the dominant pattern is a host-side USB driver/enumeration issue, do not
        # present a "Most likely BSOD cause" claim. USB-only host signals can explain
        # the failure without implying phone hardware BSOD.
        try:
            evsum2 = _eventlog_usb_issue_summary(connection)
            pnps2 = _pnp_snapshot_issue_summary(connection)
            native2 = _native_usb_driver_issue_summary(connection)
            host_usb_issue_hits = int(evsum2.get("pnp_usb_issue_count") or 0)
            host_usb_drv_hits = int(native2.get("driver_issue_count") or 0) + int(pnps2.get("driver_issue_count") or 0)
        except Exception:
            host_usb_issue_hits = 0
            host_usb_drv_hits = 0

        host_usb_dominant = bool(
            str(top.get("key") or "") == "host_usb_driver"
            or host_usb_issue_hits > 0
            or host_usb_drv_hits > 0
            or bool(not_ok_portable)
            or ("host usb driver" in _lower(bsod_cat))
            or ("enumeration" in _lower(bsod_cat))
        )

        if host_usb_dominant:
            parts.append(
                "USB-only evidence points to a host-side USB/MTP driver or enumeration issue. "
                "This is not proof of a phone hardware BSOD."
            )
            if common_top_lab:
                parts.append(f"Most likely general category: {common_top_lab}.")
        else:
            if bsod5_key == "not_bsod":
                # Only say "not BSOD-style" when we truly have positive evidence of normal operation.
                # If crash/boot-instability signals exist, keep the language conservative.
                has_bsod_like_symptoms = bool(
                    has_kernel_panic_signal or has_crash_loop_signal or has_systemui_loop_signal or has_anr_signal
                )
                if has_bsod_like_symptoms or bool(low_level):
                    parts.append(
                        "Signals suggest a boot/crash instability pattern, but there is not enough evidence to claim a classic blue/blank-screen BSOD scenario."
                    )
                else:
                    parts.append("This does not look like a BSOD-style blue/blank boot failure based on the current signals.")
                if common_top_lab:
                    parts.append(f"Most likely general cause: {common_top_lab}.")
            else:
                if bsod5_lab:
                    parts.append(f"Most likely BSOD cause: {bsod5_lab}.")

        # Mention observed signals (quick chain-of-reasoning).
        try:
            obs = report.get("observedSignals") if isinstance(report, dict) else None
            if isinstance(obs, list) and obs:
                obs_txt = ", ".join([str(x) for x in obs[:6] if str(x).strip()])
                if obs_txt:
                    parts.append(f"Signals: {obs_txt}.")
        except Exception:
            pass

        # Mention technician-provided context when available.
        try:
            sym_choice = str((user_sym or {}).get("choice") or "").strip()
            if sym_choice:
                sym_lab = sym_choice.replace("_", " ").strip()
                parts.append(f"Reported symptom: {sym_lab}.")
        except Exception:
            pass
        try:
            mode = str((user_tech or {}).get("confirmedMode") or "").strip()
            if mode and mode.lower() not in ("normal", "unknown"):
                parts.append(f"Technician confirmed mode: {mode}.")
        except Exception:
            pass

        # Why-not: show the next-most-likely alternative (helps technicians trust the output).
        try:
            alt = None
            r5 = (report.get("bsod5") or {}).get("ranked") if isinstance(report.get("bsod5"), dict) else None
            if isinstance(r5, list):
                for it in r5:
                    if not isinstance(it, dict):
                        continue
                    k = str(it.get("key") or "")
                    if k and k != bsod5_key and k != "not_bsod":
                        alt = str(it.get("label") or k)
                        break
            if alt:
                parts.append(f"Next closest alternative: {alt}.")
        except Exception:
            pass
        report["humanSummary"] = " ".join([p for p in parts if p]).strip()
    except Exception:
        report["humanSummary"] = ""

    # Suggested fixes / next steps (offline, technician-friendly)
    actions: List[str] = []

    def add_action(text: str) -> None:
        text = str(text or "").strip()
        if not text:
            return
        actions.append(text)

    if usb_unstable:
        add_action("USB connection looks unstable: try a different cable, avoid hubs, try a rear USB port, and reseat the connector firmly.")
        if usb_flapping_severe:
            add_action("USB flapping is severe: after confirming cable/port, suspect boot-loop/power instability or a failing USB port/mainboard.")

    # Host-side (PC) driver/enumeration instability guidance.
    # This is intentionally optional and safe: these checks diagnose PC stability,
    # which can otherwise masquerade as phone connection issues.
    try:
        evsum2 = _eventlog_usb_issue_summary(connection)
        pnps2 = _pnp_snapshot_issue_summary(connection)
        native2 = _native_usb_driver_issue_summary(connection)
        host_usb_issue_hits = int(evsum2.get("pnp_usb_issue_count") or 0)
        host_usb_drv_hits = int(native2.get("driver_issue_count") or 0) + int(pnps2.get("driver_issue_count") or 0)
    except Exception:
        host_usb_issue_hits = 0
        host_usb_drv_hits = 0

    if (str(top.get("key") or "") == "host_usb_driver") or (host_usb_issue_hits > 0) or (host_usb_drv_hits > 0) or bool(not_ok_portable):
        add_action("PC-side USB driver/enumeration issues are suspected: reinstall/update the phone's OEM USB driver + ADB driver, avoid hubs, and try another USB port/cable.")
        add_action("Optional PC stability checks (if issues repeat across multiple devices/cables): run Windows Memory Diagnostic, check disk health (CHKDSK), repair system files (SFC), and verify cooling/power supply stability.")

    if top.get("key") == "not_bsod":
        # Prefer accurate explanation depending on which modality produced the signal.
        if "normal" in visual_cat and (content_visible_hint or contrast_std >= 18.0):
            add_action("Camera indicates visible/normal screen content. This is likely not a BSOD/blue/blank-screen case.")
        elif stable_mtp_only:
            if has_kernel_panic_signal:
                add_action("USB-only signals show MTP/Portable visibility (device is alive), but crash evidence (kernel panic/boot instability) is present. Treat this as a crash/boot-instability case rather than a normal Not-BSOD scenario.")
            else:
                add_action("USB-only signals show stable MTP/Portable enumeration on Windows. This often means the device is at least partially up, but it can still be frozen/locked; it is less consistent with a deep BSOD-style boot failure than fastboot/EDL.")
        else:
            add_action("Current signals do not strongly match a BSOD/blue/blank boot-failure pattern.")
        if not has_kernel_panic_signal and (not low_level):
            add_action("Reconfirm the customer symptom and run the standard diagnostics (battery, storage, apps, performance) instead of BSOD triage.")

    if has_mtp and not has_adb:
        add_action("Windows enumerates MTP/Portable but ADB is missing: enable Developer options + USB debugging, then accept the RSA trust prompt on the phone (if the UI is responsive).")
        add_action("On Windows: ensure an ADB/USB driver is installed for this model (check Device Manager for 'Android Device' / 'ADB Interface').")

    if not has_mtp and not has_adb and has_transport:
        add_action("Windows sees USB transport but no MTP/ADB: likely driver/enumeration state. Try reinstalling the phone's USB driver, and reboot the PC and phone.")

    if not has_transport and not has_mtp and not has_adb and not has_fastboot:
        add_action("No USB signals detected: confirm the phone powers on, try another port/cable, and check the charging indicator. If still nothing, suspect port/battery/mainboard.")

    if has_fastboot and not has_adb:
        add_action("Phone is in bootloader/fastboot: reboot to system (power + volume combo) and retry. If it returns to fastboot, suspect firmware/boot issues.")

    if "failed-updates" in log_keys:
        add_action("ADB log evidence suggests update/install failures: ask if the issue started after an update; try freeing storage, then use official recovery/update paths.")
    if "fs-corruption" in log_keys:
        add_action("ADB log evidence suggests mount/filesystem errors: consider recovery mode checks, and prioritize data backup before any repair attempts.")
    if "crash-loop" in log_keys or "watchdog" in log_keys:
        add_action("ADB log evidence suggests a system crash loop/hang: try Safe Mode, and review recent apps/updates; if persistent, consider authorized firmware repair.")
    if "thermal" in log_keys:
        add_action("ADB log evidence suggests overheating: stop charging/use, let device cool, inspect for short/liquid damage; thermal issues can mimic BSOD/blank screen.")

    # Add targeted actions based on the 4-way specific cause.
    spec = report.get("specific") if isinstance(report, dict) else None
    spec_key = str(spec.get("key") or "") if isinstance(spec, dict) else ""
    if spec_key == "battery_problem":
        add_action("Battery/power suspected: test with known-good charger and cable, inspect/clean the charging port, and verify stable charging current.")
        add_action("If the phone overheats or shuts down under load: let it cool, remove case, and inspect for liquid/short; thermal faults can trigger boot loops.")
    elif spec_key == "os_corruption":
        add_action("OS corruption suspected: try Recovery mode (wipe cache) and check for update/mount errors; confirm free storage if reachable.")
        add_action("If persistent: back up data if possible, then use authorized OEM firmware repair/flash procedures (with customer consent and data-risk warning).")
    elif spec_key == "apps_conflict":
        add_action("App conflict suspected: try Safe Mode; if Safe Mode is stable, uninstall recently installed/updated third‑party apps first.")
        add_action("If the issue started after a specific app/update: clear that app's cache/data (when possible) and remove overlays/launchers/optimizers.")
    else:
        # Keep other actions as-is.
        pass

    # Host driver/enumeration warnings
    not_ok_portable = [p for p in portable if isinstance(p, dict) and _lower(p.get("status")) not in ("ok", "")]
    if not_ok_portable:
        add_action("Windows reports the portable/MTP device with a problem status: open Device Manager, uninstall the device/driver, then reconnect and install the correct OEM/MTP driver.")

    # Low-level mode guidance (safe boundary: no bypass/flashing)
    if top.get("key") == "low_level_mode":
        add_action("Device may be in a low-level recovery mode (EDL/Preloader/DFU). Use authorized OEM service procedures/tools for that model and ownership context.")
        add_action("Try a forced reboot key combo for the device to exit recovery mode, then reconnect.")

    # Camera-based warning fixes
    v = visual_analysis if isinstance(visual_analysis, dict) else {}
    crack = bool(v.get("screen_crack_hint") or v.get("crack_hint"))
    banding = bool(v.get("banding_hint"))
    edge_shadow = bool(v.get("edge_shadow_hint"))
    if crack:
        add_action("Camera indicates crack/line artifacts: inspect glass/panel and replace the display assembly if confirmed.")
    if banding:
        add_action("Camera indicates banding/dead rows: likely panel or display driver path. Test with a known-good screen and inspect the display connector pins/filters.")
    if edge_shadow:
        add_action("Camera indicates uneven backlight/edge shadow: check backlight rail/LEDs and consider screen replacement; inspect for liquid/pressure damage.")

    # If camera checks were not present at all, recommend enabling them.
    if visual is None:
        add_action("Optional: enable camera-based checks by installing opencv-python + numpy for the Python used by SmartHub.")

    # De-dup while preserving order
    seen_action = set()
    deduped: List[str] = []
    for a in actions:
        if a in seen_action:
            continue
        seen_action.add(a)
        deduped.append(a)

    # Evidence-grade output (Phase 3): stable contract for UI + learning loop.
    try:
        ev_used: List[str] = []
        ev_missing: List[str] = []

        def add_used(flag: str) -> None:
            flag = str(flag or "").strip()
            if flag and flag not in ev_used:
                ev_used.append(flag)

        def add_missing(flag: str) -> None:
            flag = str(flag or "").strip()
            if flag and flag not in ev_missing:
                ev_missing.append(flag)

        # Deterministic verification signals
        camera_verified_not_bsod = False
        if "normal" in visual_cat:
            stable_ok = (stability is None) or (stability >= 0.7)
            conf_ok = visual_conf in ("medium", "high", "")
            content_ok = content_visible_hint or (contrast_std >= 18.0)
            camera_verified_not_bsod = bool(stable_ok and conf_ok and content_ok)

        details = None
        try:
            details = (user_sym.get("details") if isinstance(user_sym, dict) else None)
        except Exception:
            details = None
        screen_test_fixed = bool(details.get("screenTestFixed")) if isinstance(details, dict) else False
        works_other_pc = bool(details.get("worksOtherPc")) if isinstance(details, dict) else False
        safe_mode_improves = bool(details.get("safeModeImproves")) if isinstance(details, dict) else False
        oem_flash_failure = bool(details.get("oemFlashFailure")) if isinstance(details, dict) else False

        if camera_verified_not_bsod:
            add_used("camera_normal_stable")
        if safe_mode_improves:
            add_used("safe_mode_confirmed")
        if oem_flash_failure:
            add_used("oem_flash_tool_corruption_confirmed")
        if screen_test_fixed:
            add_used("repair_confirmed_screen_fixed")
        if works_other_pc:
            add_used("works_on_other_pc_confirmed")

        if has_adb:
            add_used("adb_online")
        if len(log_keys) > 0:
            add_used("adb_log_evidence_present")
        if has_fastboot:
            add_used("fastboot_visible")
        if isinstance(fb_vars, dict) and len(fb_vars) > 0:
            add_used("fastboot_getvar_collected")
        if stable_mtp_only:
            add_used("mtp_stable")
        if usb_unstable or usb_flapping_severe:
            add_used("usb_flapping_detected")

        # Host-side evidence (best-effort)
        host_problem_code_present = bool(driver_issue_count > 0 or ev_issues > 0 or pnp_driver_issues > 0 or bool(not_ok_portable))
        if host_problem_code_present:
            add_used("host_problem_code_present")

        # Compute verdict + verifiedBy only when deterministic and consistent with top cause.
        top_key_now = str((report.get("top") or {}).get("key") or "") if isinstance(report, dict) else ""
        bsod5_key_now = str(((report.get("bsod5") or {}) if isinstance(report.get("bsod5"), dict) else {}).get("key") or "")
        verified_by: List[str] = []
        if camera_verified_not_bsod and (top_key_now == "not_bsod" or bsod5_key_now == "not_bsod"):
            verified_by.append("camera_normal_stable")

        # Safe Mode confirmation can deterministically verify the "incompatible apps" path
        # when the rest of the model agrees.
        # Phase 4 hardening: require a second independent signal (ADB presence) so we
        # do not over-verify app-cause without any device-side visibility.
        safe_mode_supporting = bool(has_adb or len(log_keys) > 0)
        if safe_mode_improves and safe_mode_supporting and top_key_now == "software_firmware" and bsod5_key_now == "incompatible_apps" and (not camera_verified_not_bsod):
            verified_by.append("safe_mode_confirmed")

        # OEM flash tool corruption/verity/partition failure is strong technician evidence.
        # Keep it conservative: only use it to verify the firmware/corruption path.
        # Phase 4 hardening: require at least one independent mode signal (fastboot visibility
        # and/or getvar capture) to avoid verifying on a stale/incorrect technician checkbox.
        oem_flash_supporting = bool(has_fastboot or (isinstance(fb_vars, dict) and len(fb_vars) > 0))
        if oem_flash_failure and oem_flash_supporting and top_key_now == "software_firmware" and bsod5_key_now in ("corrupt_system_files", "faulty_os_updates") and (not camera_verified_not_bsod):
            verified_by.append("oem_flash_tool_corruption_confirmed")

        # Tighten VERIFIED: avoid contradictions (e.g., camera-normal-stable) and
        # require at least one supporting local signal for host-side verification.
        if screen_test_fixed and top_key_now == "display_hardware" and (not camera_verified_not_bsod):
            verified_by.append("repair_confirmed_screen_fixed")

        host_supporting = bool(host_problem_code_present or usb_unstable or usb_flapping_severe)
        if works_other_pc and top_key_now == "host_usb_driver" and host_supporting and (not camera_verified_not_bsod):
            verified_by.append("works_on_other_pc_confirmed")

        verdict = "verified" if len(verified_by) > 0 else "possible"

        verdict_conf = None
        try:
            if isinstance(report.get("bsod5"), dict) and isinstance(report["bsod5"].get("confidence"), (int, float)):
                verdict_conf = float(report["bsod5"].get("confidence"))
            elif isinstance(report.get("top"), dict) and isinstance(report["top"].get("confidence"), (int, float)):
                verdict_conf = float(report["top"].get("confidence"))
        except Exception:
            verdict_conf = None

        # What would upgrade possible -> verified (keep this short and deterministic-first)
        if verdict != "verified":
            if not camera_verified_not_bsod:
                add_missing("camera_normal_stable")
            if top_key_now == "display_hardware" and not screen_test_fixed:
                add_missing("repair_confirmed_screen_fixed")
            if top_key_now == "host_usb_driver" and not works_other_pc:
                add_missing("works_on_other_pc_confirmed")
            if top_key_now == "software_firmware" and bsod5_key_now == "incompatible_apps" and not safe_mode_improves:
                add_missing("safe_mode_confirmed")
            if top_key_now == "software_firmware" and bsod5_key_now == "incompatible_apps" and safe_mode_improves and not safe_mode_supporting:
                add_missing("adb_online")
            if top_key_now == "software_firmware" and bsod5_key_now in ("corrupt_system_files", "faulty_os_updates") and not oem_flash_failure:
                add_missing("oem_flash_tool_corruption_confirmed")
            if top_key_now == "software_firmware" and bsod5_key_now in ("corrupt_system_files", "faulty_os_updates") and oem_flash_failure and not oem_flash_supporting:
                add_missing("fastboot_visible")
            # Evidence-strengthening (not always deterministic)
            if top_key_now == "software_firmware" and not (len(log_keys) > 0):
                add_missing("adb_log_evidence_present")
            if top_key_now == "software_firmware" and has_fastboot and not (isinstance(fb_vars, dict) and len(fb_vars) > 0):
                add_missing("fastboot_getvar_collected")
            if top_key_now == "host_usb_driver" and not host_problem_code_present:
                add_missing("host_problem_code_present")

        report["verdict"] = verdict
        report["verdictConfidence"] = verdict_conf
        report["verifiedBy"] = verified_by if verdict == "verified" else []
        report["evidenceUsed"] = ev_used[:10]
        report["evidenceMissing"] = ev_missing[:10]
    except Exception:
        report["verdict"] = "possible"
        report["verdictConfidence"] = None
        report["verifiedBy"] = []
        report["evidenceUsed"] = []
        report["evidenceMissing"] = []

    report["actions"] = deduped

    return report


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Failed to read JSON: {path}: {exc}")


def _http_get_json(url: str, timeout_s: int = 180) -> Dict[str, Any]:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        raise SystemExit(f"HTTP {exc.code} calling {url}. {body}".strip())
    except urllib.error.URLError as exc:
        raise SystemExit(f"Failed to reach {url}. Is the SmartHub companion service running? Details: {exc}")
    except Exception as exc:
        raise SystemExit(f"Failed to fetch/parse JSON from {url}: {exc}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="AI-assisted no-debug diagnosis (offline)")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Fetch data from the local SmartHub service (localhost:3333) instead of reading JSON files",
    )
    parser.add_argument("--connection", required=False, help="Path to connection-check JSON")
    parser.add_argument("--visual", required=False, help="Path to screen-visual-check JSON")
    parser.add_argument("--base-url", default="http://localhost:3333", help="Base URL for --live mode")
    parser.add_argument("--usb-samples", type=int, default=30, help="USB deep sampling count (live mode)")
    parser.add_argument("--usb-delay-ms", type=int, default=1500, help="USB deep sampling delay (live mode)")
    parser.add_argument("--cam-samples", type=int, default=30, help="Camera sampling count (live mode)")
    parser.add_argument("--cam-delay-ms", type=int, default=500, help="Camera sampling delay (live mode)")
    parser.add_argument("--memory-db", default=str(_default_memory_db_path()), help="Path to local memory DB (SQLite)")
    parser.add_argument("--remember", action="store_true", help="Save this diagnosis to local offline memory")
    parser.add_argument("--note", default="", help="Optional note saved with the case (memory)")
    parser.add_argument("--outcome", default="", help="Optional technician outcome label (memory)")
    parser.add_argument(
        "--metrics",
        nargs="?",
        const=500,
        type=int,
        metavar="N",
        help="Compute top-1 accuracy metrics from the last N remembered cases (requires --outcome labels).",
    )
    parser.add_argument("--list-memory", type=int, metavar="N", help="List the last N remembered cases and exit")
    parser.add_argument("--show-case", type=int, metavar="ID", help="Show a remembered case by ID and exit")
    parser.add_argument(
        "--label-queue",
        type=int,
        metavar="N",
        help="List the last N cases that are missing broad and/or bsod5 labels (memory DB).",
    )
    parser.add_argument(
        "--label-case",
        type=int,
        metavar="ID",
        help="Set/replace the outcome label for an existing case ID (requires --outcome).",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="When used with --label-case, merges the provided label(s) into existing outcome instead of replacing it.",
    )
    parser.add_argument("--similar-limit", type=int, default=5, help="How many similar cases to include")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args(argv)

    memory_db = Path(str(args.memory_db))

    if args.metrics is not None:
        rep = _memory_metrics(memory_db, lookback=int(args.metrics))
        print(json.dumps(rep, indent=2, ensure_ascii=False))
        return 0

    if args.list_memory is not None:
        items = _memory_list_cases(memory_db, limit=int(args.list_memory))
        print(json.dumps({"ok": True, "memory_db": str(memory_db), "cases": items}, indent=2, ensure_ascii=False))
        return 0

    if args.show_case is not None:
        case = _memory_get_case(memory_db, int(args.show_case))
        if not case:
            raise SystemExit(f"No such case id: {args.show_case}")
        print(json.dumps({"ok": True, "memory_db": str(memory_db), "case": case}, indent=2, ensure_ascii=False))
        return 0

    if args.label_queue is not None:
        items = _memory_label_queue(memory_db, limit=int(args.label_queue))
        print(
            json.dumps(
                {
                    "ok": True,
                    "memory_db": str(memory_db),
                    "note": "Queue lists cases missing broad and/or bsod5 labels. Each item includes suggested_outcome and suggested_label_command (copy/paste) as a starting point; technician must confirm/correct before saving.",
                    "queue": items,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    if args.label_case is not None:
        outc = str(args.outcome or "").strip()
        if not outc:
            raise SystemExit("--label-case requires --outcome. Example: --label-case 123 --outcome 'broad:software_firmware|bsod5:hardware_failure'")
        if bool(args.merge):
            ok = _memory_merge_case_outcome(memory_db, int(args.label_case), outc)
        else:
            ok = _memory_set_case_outcome(memory_db, int(args.label_case), outc)
        if not ok:
            raise SystemExit(f"Failed to label case id: {args.label_case} (not found?)")
        stored = None
        try:
            c = _memory_get_case(memory_db, int(args.label_case))
            if isinstance(c, dict):
                stored = str(c.get("outcome") or "").strip()
        except Exception:
            stored = None
        print(
            json.dumps(
                {
                    "ok": True,
                    "memory_db": str(memory_db),
                    "case_id": int(args.label_case),
                    "merge": bool(args.merge),
                    "requested_outcome": outc,
                    "stored_outcome": stored,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    if args.live:
        base = str(args.base_url).rstrip("/")
        conn_url = f"{base}/connection-check?deep=1&samples={int(args.usb_samples)}&delayMs={int(args.usb_delay_ms)}"
        visual_url = f"{base}/screen-visual-check?samples={int(args.cam_samples)}&delayMs={int(args.cam_delay_ms)}"
        connection = _http_get_json(conn_url)
        visual: Optional[Dict[str, Any]]
        try:
            visual = _http_get_json(visual_url)
        except SystemExit:
            # Visual check is optional; if it fails, we still return a connection-only diagnosis.
            visual = None
    else:
        if not args.connection:
            raise SystemExit('Provide --connection <file.json> or use --live')
        connection = _load_json(Path(args.connection))
        visual = _load_json(Path(args.visual)) if args.visual else None

    report = diagnose(connection, visual)

    # Attach similar past cases (if any) and optionally persist this case.
    memory_info: Dict[str, Any] = {"db": str(memory_db)}
    try:
        similar = _memory_find_similar(
            memory_db,
            connection=connection,
            visual=visual,
            report=report,
            limit=int(args.similar_limit),
        )
        if similar:
            memory_info["similar"] = similar
    except Exception:
        # Memory is best-effort; do not break diagnosis.
        pass

    # Always include lightweight memory stats (helps technicians see progress).
    try:
        memory_info["stats"] = _memory_stats(memory_db)
    except Exception:
        pass

    if args.remember:
        try:
            source = "live" if args.live else "file"
            case_id = _memory_save_case(
                memory_db,
                source=source,
                connection=connection,
                visual=visual,
                report=report,
                note=str(args.note or ""),
                outcome=str(args.outcome or ""),
            )
            memory_info["saved"] = True
            memory_info["case_id"] = int(case_id)
        except Exception as exc:
            memory_info["saved"] = False
            memory_info["error"] = str(exc)

    report["memory"] = memory_info

    # Optional confidence calibration (best-effort): when there are enough locally
    # labeled cases, cap confidences based on measured top-1 accuracy so the UI
    # is less overconfident in real-world deployments.
    try:
        m = _memory_metrics(memory_db, lookback=5000)
        by = m.get("metrics_by_kind") if isinstance(m, dict) else None

        def wilson_lower_bound(correct: int, n: int, z: float = 1.96) -> float:
            # Wilson score interval lower bound for binomial proportion.
            if n <= 0:
                return 0.0
            phat = float(correct) / float(n)
            denom = 1.0 + (z * z) / float(n)
            centre = phat + (z * z) / (2.0 * float(n))
            rad = z * math.sqrt((phat * (1.0 - phat) + (z * z) / (4.0 * float(n))) / float(n))
            return float(max(0.0, (centre - rad) / denom))

        REQUIRED_USABLE = 40

        def cap_from_kind(kind: Any) -> Tuple[Optional[float], Dict[str, Any]]:
            if not isinstance(kind, dict):
                return (None, {"usable": 0, "required_usable": REQUIRED_USABLE, "needed_usable": REQUIRED_USABLE})
            usable = kind.get("usable")
            correct = kind.get("correct")
            if not isinstance(usable, int):
                usable = 0
            if not isinstance(correct, int):
                correct = 0

            status = {
                "usable": int(usable),
                "required_usable": int(REQUIRED_USABLE),
                "needed_usable": int(max(0, int(REQUIRED_USABLE) - int(usable))),
            }

            if usable < REQUIRED_USABLE:
                return (None, status)

            # Conservative cap based on the *lower bound* of measured accuracy.
            lb = wilson_lower_bound(int(correct), int(usable), z=1.96)
            # Allow some slack above the conservative lower bound, but never extreme.
            cap = float(max(0.6, min(0.97, 0.12 + 0.88 * float(lb))))
            return (cap, status)

        broad_cap, broad_status = cap_from_kind((by or {}).get("broad") if isinstance(by, dict) else None)
        bsod5_cap, bsod5_status = cap_from_kind((by or {}).get("bsod5") if isinstance(by, dict) else None)
        common5_cap, common5_status = cap_from_kind((by or {}).get("common5") if isinstance(by, dict) else None)

        report["calibration"] = {
            "broad_cap": broad_cap,
            "bsod5_cap": bsod5_cap,
            "common5_cap": common5_cap,
            "status": {
                "broad": broad_status,
                "bsod5": bsod5_status,
                "common5": common5_status,
            },
            "note": "Caps apply only when enough labeled local cases exist (>=40 usable).",
        }

        # Apply caps to the fields the UI commonly renders.
        if broad_cap is not None and isinstance(report.get("top"), dict) and isinstance(report["top"].get("confidence"), (int, float)):
            report["top"]["confidence_calibrated"] = round(float(min(float(report["top"]["confidence"]), float(broad_cap))), 4)
        if bsod5_cap is not None and isinstance(report.get("bsod5"), dict) and isinstance(report["bsod5"].get("confidence"), (int, float)):
            report["bsod5"]["confidence_calibrated"] = round(float(min(float(report["bsod5"]["confidence"]), float(bsod5_cap))), 4)
        if common5_cap is not None and isinstance(report.get("common5"), dict) and isinstance(report["common5"].get("top"), dict):
            topc = report["common5"]["top"].get("confidence")
            if isinstance(topc, (int, float)):
                report["common5"]["top"]["confidence_calibrated"] = round(float(min(float(topc), float(common5_cap))), 4)

        # Keep verdictConfidence aligned with calibrated BSOD-5 confidence (if present).
        try:
            vb5 = report.get("bsod5") if isinstance(report.get("bsod5"), dict) else None
            if isinstance(vb5, dict) and isinstance(vb5.get("confidence_calibrated"), (int, float)):
                report["verdictConfidence"] = float(vb5.get("confidence_calibrated"))
        except Exception:
            pass
    except Exception:
        # Calibration is best-effort; do not break diagnosis.
        pass

    # Windows consoles and some parent processes may default to legacy encodings
    # (e.g. cp1252). The report may contain Unicode punctuation (e.g. U+2011).
    # Ensure printing never crashes (causing HTTP 500 in the UI).
    try:
        import sys

        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    if args.pretty:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
