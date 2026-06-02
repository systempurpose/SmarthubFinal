import tkinter as tk
from tkinter import ttk, messagebox
import json

from bsod_diag import classify_bsod


def run_diagnostic(output_summary: tk.Text, output_json: tk.Text) -> None:
  output_summary.configure(state="normal")
  output_json.configure(state="normal")
  output_summary.delete("1.0", tk.END)
  output_json.delete("1.0", tk.END)

  try:
    info = classify_bsod()
  except Exception as exc:  # noqa: BLE001
    messagebox.showerror("Error", f"Failed to run diagnostic: {exc}")
    return

  summary = info.get("summary") or "No summary available."
  detail = info.get("detail") or ""

  output_summary.insert(tk.END, summary + "\n")
  if detail:
    output_summary.insert(tk.END, "\n" + detail)

  output_json.insert(tk.END, json.dumps(info, indent=2))

  output_summary.configure(state="disabled")
  output_json.configure(state="disabled")


def main() -> None:
  root = tk.Tk()
  root.title("Mobile BSOD Triage")
  root.geometry("760x520")

  root.columnconfigure(0, weight=1)
  root.rowconfigure(1, weight=1)

  header = ttk.Frame(root, padding=(10, 8))
  header.grid(row=0, column=0, sticky="ew")
  header.columnconfigure(1, weight=1)

  title_label = ttk.Label(header, text="Mobile BSOD Triage", font=("Segoe UI", 14, "bold"))
  title_label.grid(row=0, column=0, sticky="w")

  subtitle_label = ttk.Label(
    header,
    text=(
      "Quickly check whether a blue/black screen device is visible to ADB or fastboot "
      "to guide repair decisions."
    ),
    wraplength=540,
  )
  subtitle_label.grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 0))

  run_btn = ttk.Button(header, text="Run Diagnostic", width=18)
  run_btn.grid(row=0, column=1, rowspan=2, sticky="e")

  body = ttk.Frame(root, padding=(10, 0, 10, 10))
  body.grid(row=1, column=0, sticky="nsew")
  body.rowconfigure(0, weight=1)
  body.columnconfigure(0, weight=1)

  paned = ttk.Panedwindow(body, orient=tk.VERTICAL)
  paned.grid(row=0, column=0, sticky="nsew")

  summary_frame = ttk.Labelframe(paned, text="Summary", padding=6)
  json_frame = ttk.Labelframe(paned, text="Raw JSON details", padding=6)

  paned.add(summary_frame, weight=3)
  paned.add(json_frame, weight=2)

  summary_text = tk.Text(summary_frame, wrap="word", height=8)
  summary_text.pack(fill="both", expand=True)
  summary_text.configure(state="disabled")

  json_text = tk.Text(json_frame, wrap="none", height=6, font=("Consolas", 9))
  json_text.pack(fill="both", expand=True)
  json_text.configure(state="disabled")

  run_btn.configure(command=lambda: run_diagnostic(summary_text, json_text))

  root.mainloop()


if __name__ == "__main__":
  main()
