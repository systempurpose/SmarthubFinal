#!/usr/bin/env python3
import sys
import json
from androguard.core.apk import APK

# Dangerous permissions list (same as in heuristics.ts)
DANGEROUS_PERMS = [
    'android.permission.READ_SMS', 'android.permission.SEND_SMS', 'android.permission.RECEIVE_SMS',
    'android.permission.READ_CALL_LOG', 'android.permission.WRITE_CALL_LOG', 'android.permission.CALL_PHONE',
    'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.CAMERA', 'android.permission.RECORD_AUDIO',
    'android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS',
    'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.BIND_ACCESSIBILITY_SERVICE',
    'android.permission.DEVICE_ADMIN', 'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.INSTALL_PACKAGES', 'android.permission.PACKAGE_USAGE_STATS',
    'android.permission.WRITE_SETTINGS', 'android.permission.WRITE_SECURE_SETTINGS',
    'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.MANAGE_EXTERNAL_STORAGE'
]

def analyze_apk(apk_path):
    try:
        a = APK(apk_path)
        permissions = a.get_permissions()
        dangerous_perms = [p for p in permissions if p in DANGEROUS_PERMS]
        risk_score = len(dangerous_perms) * 10  # simple scoring

        # Check for suspicious components
        suspicious = []
        if a.get_main_activity():
            suspicious.append("Has main activity (normal)")
        if len(a.get_activities()) > 20:
            suspicious.append("Unusually many activities")
        if len(a.get_services()) > 10:
            suspicious.append("Unusually many services")
        if a.get_receivers():
            suspicious.append("Contains broadcast receivers")

        result = {
            "package": a.get_package(),
            "version_name": a.get_androidversion_name(),
            "version_code": a.get_androidversion_code(),
            "main_activity": a.get_main_activity(),
            "permissions": permissions,
            "dangerous_permissions": dangerous_perms,
            "risk_score": min(risk_score, 100),
            "suspicious_indicators": suspicious,
            "num_activities": len(a.get_activities()),
            "num_services": len(a.get_services())
        }
        return result
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python apk_analyzer.py <apk_path>"}))
        sys.exit(1)
    apk_path = sys.argv[1]
    result = analyze_apk(apk_path)
    print(json.dumps(result, indent=2))