from __future__ import annotations

import datetime as _dt
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas


def _box(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    body: list[str] | None = None,
    *,
    title_font_size: int = 11,
    body_font_size: int = 9,
) -> None:
    c.setStrokeColor(colors.HexColor("#2f3a4a"))
    c.setLineWidth(1)
    c.setFillColor(colors.whitesmoke)
    c.roundRect(x, y, w, h, 6, stroke=1, fill=1)

    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", title_font_size)
    title_lines = simpleSplit(title, "Helvetica-Bold", title_font_size, max(1, w - 16))
    title_y = y + h - 16
    for i, line in enumerate(title_lines[:2]):
        c.drawString(x + 8, title_y - i * (title_font_size + 1), line)

    if body:
        c.setFont("Helvetica", body_font_size)
        # Leave extra space when title wraps
        ty = y + h - (34 + (len(title_lines[:2]) - 1) * (title_font_size + 1))
        line_h = body_font_size + 3
        for raw in body:
            wrapped = simpleSplit(raw, "Helvetica", body_font_size, max(1, w - 20))
            for line in wrapped:
                if ty < y + 10:
                    return
                c.drawString(x + 10, ty, line)
                ty -= line_h


def _arrow(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float, label: str | None = None) -> None:
    c.setStrokeColor(colors.HexColor("#334155"))
    c.setLineWidth(1)
    c.line(x1, y1, x2, y2)

    # Arrow head
    import math

    angle = math.atan2(y2 - y1, x2 - x1)
    head_len = 8
    head_ang = 0.35
    x3 = x2 - head_len * math.cos(angle - head_ang)
    y3 = y2 - head_len * math.sin(angle - head_ang)
    x4 = x2 - head_len * math.cos(angle + head_ang)
    y4 = y2 - head_len * math.sin(angle + head_ang)
    c.line(x2, y2, x3, y3)
    c.line(x2, y2, x4, y4)

    if label:
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica", 8)
        lx = (x1 + x2) / 2
        ly = (y1 + y2) / 2
        c.drawString(lx + 4, ly + 4, label)


def _connector(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float) -> None:
    c.setStrokeColor(colors.HexColor("#1d4ed8"))
    c.setLineWidth(1.2)
    c.line(x1, y1, x2, y2)


def _ellipse_node(
    c: canvas.Canvas,
    cx: float,
    cy: float,
    w: float,
    h: float,
    text: str,
    *,
    stroke: colors.Color,
    fill: colors.Color = colors.white,
    font_size: float = 10,
    bold: bool = False,
    max_lines: int = 3,
) -> None:
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2

    c.setStrokeColor(stroke)
    c.setLineWidth(2 if bold else 1.4)
    c.setFillColor(fill)
    c.ellipse(x1, y1, x2, y2, stroke=1, fill=1)

    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFont(font, font_size)
    c.setFillColor(colors.HexColor("#0f172a"))
    lines = simpleSplit(text, font, font_size, max(1, w - 14))[:max_lines]
    line_h = font_size + 2
    total = len(lines) * line_h
    ty = cy + total / 2 - line_h + 1
    for line in lines:
        tw = c.stringWidth(line, font, font_size)
        c.drawString(cx - tw / 2, ty, line)
        ty -= line_h


def _cloud_node(
    c: canvas.Canvas,
    cx: float,
    cy: float,
    w: float,
    h: float,
    text: str,
) -> None:
    # Cloud-like shape by overlapping circles (simple, reliable).
    fill = colors.HexColor("#ffffff")
    stroke = colors.HexColor("#15803d")
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(2)

    r = min(w, h) / 6.8
    # Circle centers relative to cloud center
    offsets = [
        (-w * 0.28, h * 0.05),
        (-w * 0.16, h * 0.16),
        (0, h * 0.20),
        (w * 0.16, h * 0.16),
        (w * 0.28, h * 0.05),
        (w * 0.20, -h * 0.10),
        (0, -h * 0.16),
        (-w * 0.20, -h * 0.10),
    ]
    for ox, oy in offsets:
        c.circle(cx + ox, cy + oy, r, stroke=1, fill=1)

    # Central text
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 14)
    lines = simpleSplit(text, "Helvetica-Bold", 14, max(1, w - 20))[:3]
    line_h = 16
    total = len(lines) * line_h
    ty = cy + total / 2 - line_h + 2
    for line in lines:
        tw = c.stringWidth(line, "Helvetica-Bold", 14)
        c.drawString(cx - tw / 2, ty, line)
        ty -= line_h


def _legend(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    c.setStrokeColor(colors.HexColor("#64748b"))
    c.setLineWidth(1)
    c.setFillColor(colors.HexColor("#ffffff"))
    c.roundRect(x, y, w, h, 6, stroke=1, fill=1)

    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 8, y + h - 14, "Shapes Legend")

    # Rows
    row_h = 12
    start_y = y + h - 28
    icon_x = x + 10
    text_x = x + 46

    c.setFont("Helvetica", 8)

    # 1) Container boundary
    ry = start_y
    c.setStrokeColor(colors.HexColor("#1f2937"))
    c.setFillColor(colors.HexColor("#f8fafc"))
    c.roundRect(icon_x, ry - 2, 28, 10, 3, stroke=1, fill=1)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.drawString(text_x, ry, "System boundary / container")

    # 2) Component box
    ry -= row_h
    c.setStrokeColor(colors.HexColor("#2f3a4a"))
    c.setFillColor(colors.whitesmoke)
    c.roundRect(icon_x, ry - 2, 28, 10, 3, stroke=1, fill=1)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.drawString(text_x, ry, "Component / module")

    # 3) Arrow
    ry -= row_h
    _arrow(c, icon_x, ry + 3, icon_x + 28, ry + 3, None)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.drawString(text_x, ry, "Data/control flow")

    # 4) Callout (host limitation)
    ry -= row_h
    c.setStrokeColor(colors.HexColor("#b45309"))
    c.setFillColor(colors.HexColor("#fffbeb"))
    c.roundRect(icon_x, ry - 2, 28, 10, 3, stroke=1, fill=1)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.drawString(text_x, ry, "Important note / limitation")


def build_pdf(out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    page_w, page_h = landscape(A4)
    c = canvas.Canvas(str(out_path), pagesize=(page_w, page_h))

    # Header
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(16 * mm, page_h - 16 * mm, "SmartHub Diagnostics – Conceptual Mapping")

    c.setFont("Helvetica", 9)
    stamp = _dt.date.today().isoformat()
    c.setFillColor(colors.HexColor("#334155"))
    c.drawString(16 * mm, page_h - 22 * mm, f"Generated: {stamp}  |  Scope: USB-only BSOD triage + offline helpers")

    # Page 1: Mind-map style conceptual mapping (cloud + ovals)
    # Use radial placement + boundary fitting + simple collision avoidance.
    import math

    margin = 12 * mm
    # Slight left shift gives the right side more room (PDF viewers often show a right gutter).
    cx = (page_w / 2) - 10
    cy = (page_h / 2) - 10 * mm

    # Smaller center to give more room to nodes.
    _cloud_node(c, cx, cy, 102 * mm, 36 * mm, "SmartHub Diagnostics\n(USB-only BSOD Triage)")

    green = colors.HexColor("#15803d")
    blue = colors.HexColor("#1d4ed8")
    light_green = colors.HexColor("#f0fdf4")
    light_blue = colors.HexColor("#eff6ff")

    def polar(radius: float, angle_deg: float) -> tuple[float, float]:
        a = math.radians(angle_deg)
        return (cx + radius * math.cos(a), cy + radius * math.sin(a))

    def fits(node_cx: float, node_cy: float, w: float, h: float) -> bool:
        return (
            (node_cx - w / 2) >= margin
            and (node_cx + w / 2) <= (page_w - margin)
            and (node_cy - h / 2) >= (18 * mm)
            and (node_cy + h / 2) <= (page_h - 28 * mm)
        )

    placed: list[tuple[float, float, float, float]] = []  # (x1,y1,x2,y2)

    def overlaps_any(node_cx: float, node_cy: float, w: float, h: float, pad: float = 3.0) -> bool:
        x1 = node_cx - w / 2 - pad
        y1 = node_cy - h / 2 - pad
        x2 = node_cx + w / 2 + pad
        y2 = node_cy + h / 2 + pad
        for ox1, oy1, ox2, oy2 in placed:
            if not (x2 < ox1 or x1 > ox2 or y2 < oy1 or y1 > oy2):
                return True
        return False

    def remember(node_cx: float, node_cy: float, w: float, h: float) -> None:
        placed.append((node_cx - w / 2, node_cy - h / 2, node_cx + w / 2, node_cy + h / 2))

    def place_at(angle_deg: float, radius: float, w: float, h: float) -> tuple[float, float]:
        # Spiral search: expand radius and nudge angle until it fits and doesn't overlap.
        # Deterministic and robust against dense clusters (top-right + bottom).
        angle_steps = [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36]
        radius_steps = [0, 10, 20, 32, 44, 58, 72, 88]
        for dr in radius_steps:
            for a_off in angle_steps:
                px, py = polar(radius + dr, angle_deg + a_off)
                if not fits(px, py, w, h):
                    continue
                if overlaps_any(px, py, w, h):
                    continue
                return (px, py)

        # If still not found, allow overlap padding to be tighter.
        for dr in radius_steps:
            for a_off in angle_steps:
                px, py = polar(radius + dr, angle_deg + a_off)
                if not fits(px, py, w, h):
                    continue
                if overlaps_any(px, py, w, h, pad=1.5):
                    continue
                return (px, py)

        # Final fallback: clamp.
        px, py = polar(radius + 40, angle_deg)
        px = min(max(px, margin + w / 2), page_w - margin - w / 2)
        py = min(max(py, 18 * mm + h / 2), page_h - 28 * mm - h / 2)
        return (px, py)

    # Primary nodes: angle controls where they sit around the center.
    # (Angles chosen to match the sample: left/top/right/bottom distribution.)
    primary = [
        {"key": "ui", "title": "UI Layer", "angle": 145},
        {"key": "win", "title": "Windows Evidence", "angle": 210},
        {"key": "store", "title": "Storage", "angle": 238},
        {"key": "rules", "title": "Truthfulness Rules", "angle": 275},
        {"key": "helpers", "title": "Offline Helpers", "angle": 328},
        {"key": "phone", "title": "Android Phone", "angle": 18},
        {"key": "api", "title": "Backend API", "angle": 62},
    ]

    # Base radius computed from page size
    # Make nodes smaller to prevent overlap.
    base_r = min(page_w, page_h) * 0.39
    primary_w = 52 * mm
    primary_h = 14 * mm
    sub_w = 44 * mm
    sub_h = 11.5 * mm

    prim_pos: dict[str, tuple[float, float]] = {}
    for p in primary:
        px, py = place_at(p["angle"], base_r, primary_w, primary_h)
        prim_pos[p["key"]] = (px, py)
        _connector(c, cx, cy, px, py)
        _ellipse_node(
            c,
            px,
            py,
            primary_w,
            primary_h,
            p["title"],
            stroke=green,
            fill=light_green,
            font_size=8.6,
            bold=True,
            max_lines=2,
        )
        remember(px, py, primary_w, primary_h)

    sub_items: dict[str, list[str]] = {
        "ui": [
            "SmartHub.exe (WPF/WebView2)",
            "Web UI (HTML/JS/CSS)",
        ],
        "api": [
            "Express (:3333)",
            "/connection-check",
            "Loopback 127.0.0.1",
        ],
        "win": [
            "PnP/CIM sampling",
            "Shell MTP probe",
            "WPD helper (optional)",
        ],
        "phone": [
            "USB cable",
            "MTP / ADB / Fastboot",
            "Screen: normal/dark",
        ],
        "helpers": [
            "Camera/OCR check",
            "Offline AI (local-only)",
            "Supporting only",
        ],
        "store": [
            "history.json",
            "memory.sqlite",
            "logs/screenshots",
        ],
        "rules": [
            "No USB enum → INCONCLUSIVE",
            "COM/WPD error → host-only",
            "Probe unavailable → ignore camera",
            "Manual “UI frozen” only",
        ],
    }

    # Fan subnodes outward around the same angle with small angular offsets.
    for p in primary:
        key = p["key"]
        items = sub_items.get(key)
        if not items:
            continue
        anchor_x, anchor_y = prim_pos[key]

        # Sub radius: slightly further out than primary.
        # Keep subnodes further out to reduce collisions near the center.
        sub_r = base_r + (98 if key != "rules" else 118)
        angle = float(p["angle"])
        n = len(items)
        spread = 28 if n >= 3 else 18

        for i, t in enumerate(items):
            if n == 1:
                a = angle
            else:
                # Center the fan on the primary angle.
                frac = (i / (n - 1)) - 0.5
                a = angle + frac * spread

            # Slight radial staggering prevents siblings from collapsing into each other.
            px, py = place_at(a, sub_r + i * 8, sub_w, sub_h)
            _connector(c, anchor_x, anchor_y, px, py)
            _ellipse_node(
                c,
                px,
                py,
                sub_w,
                sub_h,
                t,
                stroke=blue,
                fill=light_blue,
                font_size=7.0,
                max_lines=3,
            )
            remember(px, py, sub_w, sub_h)

    c.showPage()

    # Page 2: Short narrative mapping
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(16 * mm, page_h - 16 * mm, "Conceptual Mapping (Narrative)")

    c.setFont("Helvetica", 10)
    c.setFillColor(colors.black)
    lines = [
        "1) Technician opens SmartHub (WPF/WebView2). The embedded Web UI runs locally.",
        "2) Web UI calls the local Node backend (127.0.0.1:3333), mainly /connection-check for USB-only triage.",
        "3) Backend collects Windows evidence (PnP/CIM USB sampling, optional WPD helper, Shell-based MTP probe fallback).",
        "4) Optional camera/OCR and offline AI are best-effort supporting tools; they must not override truthfulness rules.",
        "5) Safety rule: if the PC cannot enumerate the phone over USB, the result is INCONCLUSIVE.",
        "6) Host limitation rule: if WPD/COM is broken (E_NOINTERFACE), the app outputs host-inconclusive guidance and",
        "   does not infer the phone’s state. Webcam hints are ignored; only manual “UI frozen” confirmation can record freeze.",
    ]

    y = page_h - 30 * mm
    for line in lines:
        c.drawString(18 * mm, y, line)
        y -= 7 * mm

    y -= 4 * mm
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, "Shape meanings")
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.black)
    shape_lines = [
        "• Cloud (center) = the main concept/system being mapped.",
        "• Large ovals = major components/actors (primary branches).",
        "• Small ovals = subcomponents, signals, or rules (supporting details).",
        "• Lines = conceptual relationships / information flow (not strict sequencing).",
    ]
    for line in shape_lines:
        c.drawString(18 * mm, y, line)
        y -= 6.5 * mm

    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(colors.HexColor("#334155"))
    c.drawString(
        18 * mm,
        20 * mm,
        "This PDF is generated from the current repository structure and rules; regenerate after major flow changes.",
    )

    # Page 3: Connection relations (text mode)
    c.showPage()

    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(16 * mm, page_h - 16 * mm, "Connection Relations (Text Mode)")

    c.setFont("Helvetica", 10)
    c.setFillColor(colors.black)
    c.drawString(
        16 * mm,
        page_h - 24 * mm,
        "These lines summarize how parts connect (A → B means A calls/uses/sends data to B).",
    )

    def draw_wrapped_bullet(x: float, y: float, text: str, *, font: str = "Helvetica", size: int = 10, max_w: float = 175 * mm) -> float:
        c.setFont(font, size)
        lines = simpleSplit(text, font, size, max_w)
        line_h = size + 3
        for i, line in enumerate(lines):
            prefix = "- " if i == 0 else "  "
            c.drawString(x, y, f"{prefix}{line}")
            y -= line_h
        return y

    y = page_h - 34 * mm
    x = 18 * mm

    sections: list[tuple[str, list[str]]] = [
        (
            "UI ↔ Backend",
            [
                "SmartHub.exe (WPF + WebView2) → Web UI (HTML/JS/CSS): hosts/embeds the UI.",
                "Web UI → Node Backend (Express :3333): loopback HTTP requests (127.0.0.1).",
                "Node Backend → Web UI: JSON response used to render diagnostic status/result.",
            ],
        ),
        (
            "USB Evidence",
            [
                "Node Backend → Windows Host OS: PowerShell/CIM/PnP enumeration + USB stability sampling.",
                "Node Backend → Shell MTP probe: best-effort check for MTP accessibility without WPD COM dependency.",
                "Node Backend → UsbEvidenceHelper (WPD/COM, optional): deeper MTP/WPD probing when available.",
                "Windows Host OS ↔ Android Phone: USB cable enumeration (MTP/ADB/Fastboot interfaces when present).",
            ],
        ),
        (
            "Offline Helpers",
            [
                "Node Backend → Camera/OCR helper: optional visual hints (screen dialog / darkness) when supported.",
                "Node Backend → Offline AI helper: optional local-only suggestion based on collected signals.",
            ],
        ),
        (
            "Storage",
            [
                "Node Backend → Local artifacts: writes logs, run history, and (optional) screenshots/AI cases.",
                "Web UI → Local storage/history view: reads prior runs for technician review (implementation-specific).",
            ],
        ),
        (
            "Truthfulness Gates (Always Apply)",
            [
                "No Windows USB enumeration → output INCONCLUSIVE (do not claim phone BSOD/freeze).",
                "Host COM/WPD error → host-inconclusive (do not infer phone state; ignore camera hints).",
                "Manual “UI frozen” checkbox → only way to record freeze when probing is unavailable.",
            ],
        ),
    ]

    for title, items in sections:
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor("#0f172a"))
        c.drawString(x, y, title)
        y -= 6 * mm

        c.setFillColor(colors.black)
        for item in items:
            y = draw_wrapped_bullet(x, y, item, size=10, max_w=190 * mm)
            if y < 28 * mm:
                # If we ever overflow, start a new page.
                c.showPage()
                c.setFillColor(colors.HexColor("#0f172a"))
                c.setFont("Helvetica-Bold", 16)
                c.drawString(16 * mm, page_h - 16 * mm, "Connection Relations (Text Mode) — Continued")
                y = page_h - 26 * mm
                x = 18 * mm
        y -= 4 * mm

    c.save()


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    out = repo_root / "pdf" / "SmartHub_Conceptual_Mapping.pdf"
    build_pdf(out)
    print(str(out))


if __name__ == "__main__":
    main()
