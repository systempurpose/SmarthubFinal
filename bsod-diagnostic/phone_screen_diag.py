"""Phone screen visual diagnostic (no USB debugging required).

This helper is used by the SmartHub companion service endpoints:
- GET /screen-visual-check
- GET /screen-camera-snapshot

It captures one or more frames from the host PC webcam and returns a small
JSON payload describing what the phone screen *appears* to show.

Requirements:
- Python 3.8+
- opencv-python
- numpy

Notes:
- For JSON modes we print ONLY JSON to stdout.
- If dependencies are missing we still return JSON {ok:false,...} in JSON modes
  so the UI can display a precise reason.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import asdict, dataclass
from typing import List, Optional, Sequence, Tuple


def _wants_json_mode(argv: Sequence[str]) -> bool:
    return "--json-once" in argv or "--json-samples" in argv


JSON_MODE = _wants_json_mode(sys.argv[1:])

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception as exc:  # pragma: no cover
    if JSON_MODE:
        exe = getattr(sys, "executable", "python")
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing Python dependencies: opencv-python and numpy are required for camera-based checks.",
                    "details": str(exc),
                    "install": f"{exe} -m pip install opencv-python numpy",
                    "note": "If pip cannot find a compatible opencv-python wheel for your Python version, install Python 3.10–3.13 and point SMART_HUB_PYTHON_EXE to that python.exe.",
                }
            )
        )
        sys.exit(0)

    print("[ERROR] This tool requires 'opencv-python' and 'numpy'.")
    print("Install them with: pip install opencv-python numpy")
    print(f"Details: {exc}")
    sys.exit(1)

try:
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover
    pytesseract = None  # type: ignore


@dataclass
class ScreenAnalysis:
    category: str
    confidence: str
    reasons: Tuple[str, ...]
    avg_bgr: Tuple[float, float, float]
    avg_brightness: float
    overheat_hint: bool = False
    malware_hint: bool = False
    systemui_dialog_hint: bool = False
    anr_dialog_hint: bool = False
    kernel_panic_hint: bool = False
    ocr_available: bool = False
    ocr_text_sample: str = ""
    screen_crack_hint: bool = False
    banding_hint: bool = False
    edge_shadow_hint: bool = False
    uniformity_score: float = 0.0
    contrast_std: float = 0.0
    content_visible_hint: bool = False


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _confidence_from_strength(strength: float) -> str:
    if strength >= 0.85:
        return "high"
    if strength >= 0.65:
        return "medium"
    return "low"


def analyse_frame(frame) -> ScreenAnalysis:
    if frame is None or getattr(frame, "size", 0) == 0:
        return ScreenAnalysis(
            category="Unknown",
            confidence="low",
            reasons=("No image data captured from camera.",),
            avg_bgr=(0.0, 0.0, 0.0),
            avg_brightness=0.0,
        )

    # Downscale to reduce noise and cost.
    small = cv2.resize(frame, (320, 240), interpolation=cv2.INTER_AREA)

    avg_b = float(np.mean(small[:, :, 0]))
    avg_g = float(np.mean(small[:, :, 1]))
    avg_r = float(np.mean(small[:, :, 2]))
    avg_brightness = float((avg_b + avg_g + avg_r) / 3.0)

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray_mean = float(np.mean(gray))
    gray_std = float(np.std(gray))

    # Heuristic: when contrast is high enough, the camera is likely seeing UI/content
    # (text/icons/edges), not a solid-color boot-failure screen.
    content_by_contrast = gray_std >= 18.0

    reasons: List[str] = []

    # Basic categories.
    # Treat very dim captures as dark/black, but keep confidence conservative:
    # underexposed webcam frames are common in shop lighting.
    if gray_mean < 35.0:
        category = "Dark"
        strength = _clamp(0.78 - (gray_mean / 80.0), 0.25, 0.78)
        reasons.append("Overall brightness is very low; the capture appears dark/black.")
        reasons.append("Note: webcam underexposure/poor lighting can also look like a dark screen. Ensure good lighting and re-run if unsure.")
    else:
        # Blue/cyan dominance heuristic.
        # We require both absolute and relative dominance to avoid misclassifying neutral gray.
        rel_dom = 0.0
        if (avg_g + avg_r) > 1e-3:
            rel_dom = avg_b / ((avg_g + avg_r) / 2.0)

        blue_candidate = avg_b > 90.0 and rel_dom >= 1.25 and (avg_b - max(avg_g, avg_r)) > 25.0

        # Avoid false positives: a blue wallpaper/lockscreen/theme can be strongly blue
        # while still clearly showing content. Only label as "Blue" when the frame looks
        # relatively flat/solid (low contrast).
        if blue_candidate and (not content_by_contrast):
            category = "Blue"
            strength = _clamp((rel_dom - 1.1) / 0.6, 0.0, 1.0)
            reasons.append("Blue/cyan channel dominates and contrast is low, consistent with a solid blue-screen style fault.")
        elif blue_candidate and content_by_contrast:
            category = "Normal"
            content_visible_hint = True
            strength = 0.72
            reasons.append("Blue tint detected, but contrast suggests normal UI/content is visible (not treated as a BSOD blue screen).")
        else:
            category = "Normal"
            # Normal isn't a strong claim; keep confidence conservative.
            # We only treat it as *content visible* when there is enough contrast
            # (UI/text edges), otherwise it might be a flat/solid image.
            content_visible_hint = gray_std >= 18.0
            strength = 0.72 if content_visible_hint else 0.6
            reasons.append("Brightness/color balance look consistent with content being visible.")
            if not content_visible_hint:
                reasons.append("However, image contrast is low; this could still be a flat/solid screen.")

    confidence = _confidence_from_strength(strength)

    # Optional OCR for text-based hints.
    overheat_hint = False
    malware_hint = False
    systemui_dialog_hint = False
    anr_dialog_hint = False
    kernel_panic_hint = False
    ocr_text_sample = ""
    ocr_found_text = False
    ocr_available = pytesseract is not None
    # Try OCR when either brightness is reasonable OR contrast is high.
    # This helps detect white-on-black crash screens (e.g. kernel panic).
    if pytesseract is not None and (gray_mean > 28.0 or gray_std > 22.0):
        try:
            ocr_target = cv2.resize(gray, (640, 480), interpolation=cv2.INTER_CUBIC)
            _thr, binary = cv2.threshold(ocr_target, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            txt = pytesseract.image_to_string(binary)
            txt = (txt or "").strip()
            if txt:
                ocr_text_sample = txt[:240]
                ocr_found_text = True
                lower = txt.lower().replace("\u2019", "'").replace("\u2018", "'")
                if ("kernel panic" in lower) or ("not syncing" in lower) or ("panic:" in lower):
                    kernel_panic_hint = True
                    reasons.append("OCR suggests kernel panic / low-level crash text on screen.")
                if any(k in lower for k in ("overheat", "overheating", "temperature", "too hot")):
                    overheat_hint = True
                    reasons.append("OCR found overheating/temperature wording on screen.")
                if any(k in lower for k in ("malware", "virus", "harmful", "unsafe", "security")):
                    malware_hint = True
                    reasons.append("OCR found security/malware wording on screen.")

                # Native Android dialogs that are common during UI instability.
                # Examples: "System UI isn't responding", "System UI keeps stopping",
                # and generic "<App> isn't responding" (ANR) with "Wait" / "Close app".
                has_not_responding = ("isn't responding" in lower) or ("is not responding" in lower)
                has_keeps_stopping = ("keeps stopping" in lower) or ("has stopped" in lower)
                has_wait_close = ("wait" in lower and ("close app" in lower or "close" in lower))
                has_systemui = ("system ui" in lower) or ("systemui" in lower) or ("com.android.systemui" in lower)

                if has_systemui and (has_not_responding or has_keeps_stopping):
                    systemui_dialog_hint = True
                    reasons.append("OCR suggests a native System UI crash/ANR dialog is on screen.")

                if (not systemui_dialog_hint) and has_not_responding and has_wait_close:
                    anr_dialog_hint = True
                    reasons.append("OCR suggests a native ANR (App Not Responding) dialog is on screen.")
        except Exception:
            # OCR is best-effort only.
            pass

    if (not ocr_available) and gray_mean > 45.0 and category in ("Normal", "Blue"):
        # Don't mark as an error; just explain why dialog detection might be missing.
        reasons.append("OCR is unavailable (install pytesseract + Tesseract) so System UI/ANR dialog detection may be limited.")

    # Visual hardware hints: cracks/lines, banding, edge shadows.
    screen_crack_hint = False
    banding_hint = False
    edge_shadow_hint = False
    uniformity_score = 0.0

    try:
        # Avoid false positives when the image is too dark/flat to support edge-based detection.
        if gray_mean < 45.0 or gray_std < 10.0:
            raise RuntimeError("Frame too dim/low-contrast for crack/banding detection")

        edges = cv2.Canny(gray, 80, 160)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180.0, threshold=80, minLineLength=60, maxLineGap=10)
        long_lines = 0
        if lines is not None:
            for ln in lines:
                x1, y1, x2, y2 = ln[0]
                length = float(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5)
                if length >= 80.0:
                    long_lines += 1
        if long_lines >= 3:
            screen_crack_hint = True
            reasons.append("Detected multiple long, high-contrast line segments (crack/line artifact hint).")

        # Left/middle/right brightness variation.
        h, w = gray.shape
        t1 = w // 3
        t2 = (2 * w) // 3
        left_mean = float(np.mean(gray[:, :t1]))
        mid_mean = float(np.mean(gray[:, t1:t2]))
        right_mean = float(np.mean(gray[:, t2:]))
        col_means = np.array([left_mean, mid_mean, right_mean], dtype=float)
        uniformity_score = float(col_means.std() / (gray_mean + 1e-3))
        if uniformity_score > 0.35:
            edge_shadow_hint = True
            reasons.append("Brightness is very uneven across the screen (edge shadow / backlight hint).")

        # Horizontal banding / dead rows: row mean variation.
        row_means = np.mean(gray, axis=1)
        row_var = float(np.std(row_means) / (gray_mean + 1e-3))
        if row_var > 0.28:
            banding_hint = True
            reasons.append("Strong row-to-row brightness variation detected (banding/dead-row hint).")
    except Exception:
        pass

    return ScreenAnalysis(
        category=category,
        confidence=confidence,
        reasons=tuple(reasons),
        avg_bgr=(avg_b, avg_g, avg_r),
        avg_brightness=float(gray_mean),
        overheat_hint=overheat_hint,
        malware_hint=malware_hint,
        systemui_dialog_hint=systemui_dialog_hint,
        anr_dialog_hint=anr_dialog_hint,
        kernel_panic_hint=kernel_panic_hint,
        ocr_available=ocr_available,
        ocr_text_sample=ocr_text_sample,
        screen_crack_hint=screen_crack_hint,
        banding_hint=banding_hint,
        edge_shadow_hint=edge_shadow_hint,
        uniformity_score=uniformity_score,
        contrast_std=gray_std,
        content_visible_hint=bool(ocr_found_text or (gray_std >= 18.0 and gray_mean >= 45.0)),
    )


def _open_camera(index: int = 0):
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        cap.release()
        return None
    return cap


def _capture_frame(cap, warmup_reads: int = 8):
    for _ in range(max(0, warmup_reads)):
        cap.read()
    ok, frame = cap.read()
    if not ok:
        return None
    return frame


def run_json_once(snapshot_path: Optional[str] = None) -> None:
    cap = _open_camera(0)
    if cap is None:
        print(json.dumps({"ok": False, "error": "Could not open webcam."}))
        return
    try:
        frame = _capture_frame(cap)
        if frame is None:
            print(json.dumps({"ok": False, "error": "Could not read frame from webcam."}))
            return
        analysis = analyse_frame(frame)
        if snapshot_path:
            try:
                cv2.imwrite(snapshot_path, frame)
            except Exception:
                pass
        payload = {"ok": True, "analysis": asdict(analysis)}
        payload["analysis"]["reasons"] = list(analysis.reasons)
        print(json.dumps(payload))
    finally:
        cap.release()


def run_json_samples(sample_count: int, sample_delay_ms: int, snapshot_path: Optional[str] = None) -> None:
    sample_count = max(1, int(sample_count))
    sample_delay_ms = max(0, int(sample_delay_ms))

    cap = _open_camera(0)
    if cap is None:
        print(json.dumps({"ok": False, "error": "Could not open webcam."}))
        return

    analyses: List[ScreenAnalysis] = []
    last_frame = None

    try:
        for _ in range(8):
            cap.read()

        for i in range(sample_count):
            ok, frame = cap.read()
            if ok and frame is not None:
                last_frame = frame
                analyses.append(analyse_frame(frame))
            if i < sample_count - 1 and sample_delay_ms > 0:
                time.sleep(sample_delay_ms / 1000.0)

        if not analyses:
            print(json.dumps({"ok": False, "error": "Could not read frames from webcam."}))
            return

        # Aggregate by most frequent category.
        counts = {}
        for a in analyses:
            counts[a.category] = counts.get(a.category, 0) + 1
        category = max(counts.items(), key=lambda kv: kv[1])[0]
        top_count = int(counts.get(category, 1))
        stability = float(top_count) / float(len(analyses))

        # Merge reasons from dominant category analyses.
        merged_reasons: List[str] = []
        seen = set()
        for a in analyses:
            if a.category != category:
                continue
            for r in a.reasons:
                if r in seen:
                    continue
                merged_reasons.append(r)
                seen.add(r)

        avg_b = sum(a.avg_bgr[0] for a in analyses) / len(analyses)
        avg_g = sum(a.avg_bgr[1] for a in analyses) / len(analyses)
        avg_r = sum(a.avg_bgr[2] for a in analyses) / len(analyses)
        avg_brightness = sum(a.avg_brightness for a in analyses) / len(analyses)
        uniformity_score = sum(float(a.uniformity_score) for a in analyses) / len(analyses)
        contrast_std = sum(float(a.contrast_std) for a in analyses) / len(analyses)
        content_visible_hint = any(bool(a.content_visible_hint) for a in analyses)

        overheat_hint = any(a.overheat_hint for a in analyses)
        malware_hint = any(a.malware_hint for a in analyses)
        systemui_dialog_hint = any(bool(getattr(a, "systemui_dialog_hint", False)) for a in analyses)
        anr_dialog_hint = any(bool(getattr(a, "anr_dialog_hint", False)) for a in analyses)
        ocr_available = any(bool(getattr(a, "ocr_available", False)) for a in analyses)
        screen_crack_hint = any(a.screen_crack_hint for a in analyses)
        banding_hint = any(a.banding_hint for a in analyses)
        edge_shadow_hint = any(a.edge_shadow_hint for a in analyses)

        # Keep one representative OCR sample if present.
        ocr_text_sample = ""
        try:
            samples = [a.ocr_text_sample for a in analyses if isinstance(a.ocr_text_sample, str) and a.ocr_text_sample.strip()]
            if samples:
                ocr_text_sample = max(samples, key=lambda s: len(s))[:240]
        except Exception:
            ocr_text_sample = ""

        # Confidence based primarily on stability.
        if stability >= 0.8:
            confidence = "high"
        elif stability >= 0.6:
            confidence = "medium"
        else:
            confidence = "low"

        # Best-effort snapshot.
        if snapshot_path and last_frame is not None:
            try:
                cv2.imwrite(snapshot_path, last_frame)
            except Exception:
                pass

        payload = {
            "ok": True,
            "analysis": {
                "category": category,
                "confidence": confidence,
                "reasons": merged_reasons,
                "avg_bgr": [avg_b, avg_g, avg_r],
                "avg_brightness": avg_brightness,
                "overheat_hint": overheat_hint,
                "malware_hint": malware_hint,
                "systemui_dialog_hint": systemui_dialog_hint,
                "anr_dialog_hint": anr_dialog_hint,
                "ocr_available": ocr_available,
                "screen_crack_hint": screen_crack_hint,
                "banding_hint": banding_hint,
                "edge_shadow_hint": edge_shadow_hint,
                "uniformity_score": uniformity_score,
                "contrast_std": contrast_std,
                "content_visible_hint": content_visible_hint,
                "ocr_text_sample": ocr_text_sample,
                "sample": {"count": len(analyses), "delay_ms": sample_delay_ms, "stability": stability},
            },
        }
        print(json.dumps(payload))
    finally:
        cap.release()


def _parse_arg_value(args: List[str], name: str) -> Optional[str]:
    for i, a in enumerate(args):
        if a == name and i + 1 < len(args):
            return args[i + 1]
    return None


def main(argv: List[str]) -> int:
    # JSON modes for the companion service.
    if "--json-once" in argv:
        snapshot_path = _parse_arg_value(argv, "--snapshot-path")
        run_json_once(snapshot_path=snapshot_path)
        return 0

    if "--json-samples" in argv:
        raw_n = _parse_arg_value(argv, "--json-samples")
        raw_delay = _parse_arg_value(argv, "--sample-delay-ms")
        snapshot_path = _parse_arg_value(argv, "--snapshot-path")
        try:
            n = int(raw_n or "6")
        except Exception:
            n = 6
        try:
            delay_ms = int(raw_delay or "500")
        except Exception:
            delay_ms = 500
        run_json_samples(sample_count=n, sample_delay_ms=delay_ms, snapshot_path=snapshot_path)
        return 0

    # Interactive mode (best-effort; not used by the UI).
    cap = _open_camera(0)
    if cap is None:
        print("[ERROR] Could not open webcam.")
        return 2
    try:
        print("Press SPACE to capture one frame, ESC to exit.")
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            cv2.imshow("phone_screen_diag", frame)
            key = int(cv2.waitKey(1) & 0xFF)
            if key == 27:  # ESC
                break
            if key == 32:  # SPACE
                analysis = analyse_frame(frame)
                print(json.dumps({"ok": True, "analysis": asdict(analysis)}, indent=2))
    finally:
        cap.release()
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
