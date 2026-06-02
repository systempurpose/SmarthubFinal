# Security Tools

This folder contains standalone helper tools for deeper security checks on Android apps beyond the quick permission scan in the Node backend.

Current components:

- `apk_security_scan.py` – Python CLI that inspects a single APK using `aapt` and simple heuristics to classify risk based on permissions and components.

You can call these tools directly from the command line or integrate them with the Node companion service via `child_process.spawn`.
