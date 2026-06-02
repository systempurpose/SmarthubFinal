# Blue / Blank Screen (USB-only) Plan

This folder contains implementation notes for diagnosing blue/blank/no-display phones **without relying on USB debugging**.

For a system-wide map (where code lives and how the pieces talk to each other), start here:

- `docs/README.md`
- `docs/ARCHITECTURE.md`

## Source Plan

- The detailed plan is captured in `planforBSoD.txt` at the repo root.
- This folder is where we’ll keep the *implementation artifacts* for turning that plan into product code.

## Intended Deliverables

- `schemas/connection-check-v2.json` — response shape for richer USB enumeration + stability sampling.
- `scoring.md` — explainable scoring rules used to produce bsodAnalysis v2.
- `test-matrix.md` — device matrix + expected classifications (used for tuning).
- `ui-copy.md` — technician-facing wording for the UI (no claims of bypassing Android security).

## Design Constraints (must not violate)

- No bypassing lockscreen, encryption, or platform security.
- No enabling Developer Options / USB debugging remotely.
- USB-only triage must be honest about confidence and limitations.

## Next Engineering Steps

1. Backend: enrich `/connection-check` with Windows USB VID/PID + error state and add stability sampling.
2. Backend: implement `bsodAnalysis v2` scoring and reasons.
3. Frontend: add a dedicated entry point button that opens the plan and routes to the existing no-debug triage.
4. Validation: run the test matrix and adjust scoring to reduce false “high confidence” outputs.
