// frida-scripts/anti_detection.js
// Bypass common anti-debugging and anti-Frida techniques

Java.perform(function () {
    const Log = Java.use('android.util.Log');
    const TAG = "SmartHubFrida";

    // Hook Debug.isDebuggerConnected()
    const Debug = Java.use('android.os.Debug');
    Debug.isDebuggerConnected.implementation = function () {
        Log.i(TAG, "Anti-debug check intercepted: returning false");
        return false;
    };

    // Hook System.getProperty() for common debug properties
    const System = Java.use('java.lang.System');
    const originalGetProperty = System.getProperty;
    System.getProperty.overload('java.lang.String').implementation = function (key) {
        if (key === "java.library.path") {
            Log.i(TAG, "Blocked library path query");
            return "";
        }
        if (key === "ro.debuggable") {
            return "0";
        }
        return originalGetProperty.call(this, key);
    };

    // Hook PackageManager to hide Frida packages
    const PackageManager = Java.use('android.content.pm.PackageManager');
    PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function (packageName, flags) {
        if (packageName === "re.frida.server" || packageName.includes("frida")) {
            Log.i(TAG, "Blocked Frida package query");
            throw Java.use('android.content.pm.PackageManager$NameNotFoundException')();
        }
        return this.getPackageInfo(packageName, flags);
    };

    // Hook to prevent killing the process (common evasion)
    const ActivityManager = Java.use('android.app.ActivityManager');
    ActivityManager.killBackgroundProcesses.implementation = function (packageName) {
        Log.i(TAG, "Blocked killBackgroundProcesses for: " + packageName);
        return;
    };

    // Hook for RootBeer / root detection libraries
    const File = Java.use('java.io.File');
    File.exists.implementation = function () {
        const path = this.getAbsolutePath();
        if (path.includes("frida") || path.includes("re.frida")) {
            return false;
        }
        return this.exists();
    };

    Log.i(TAG, "Anti‑detection hooks installed");
});