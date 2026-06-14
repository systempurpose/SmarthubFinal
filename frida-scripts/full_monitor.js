// frida-scripts/full_monitor.js
// Combined script: anti‑detection + API monitoring

Java.perform(function () {
    const Log = Java.use('android.util.Log');
    const TAG = "SmartHubFrida";

    // ========== ANTI‑DETECTION HOOKS ==========
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

    // ========== API MONITORING HOOKS ==========
    // Hook SMS sending
    var SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendTextMessage.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'android.app.PendingIntent', 'android.app.PendingIntent').implementation = function(dest, sc, text, sent, delivery) {
        Log.i(TAG, "[SMS] Dest: " + dest + " Text: " + text);
        send({type: 'sms', destination: dest, body: text});
        return this.sendTextMessage(dest, sc, text, sent, delivery);
    };
    
    // Hook location access
    var LocationManager = Java.use('android.location.LocationManager');
    LocationManager.getLastKnownLocation.implementation = function(provider) {
        var result = this.getLastKnownLocation(provider);
        Log.i(TAG, "[Location] Provider: " + provider + " Lat: " + (result ? result.getLatitude() : "null"));
        send({type: 'location', provider: provider, lat: result ? result.getLatitude() : null, lng: result ? result.getLongitude() : null});
        return result;
    };
    
    // Hook camera
    var Camera = Java.use('android.hardware.Camera');
    Camera.open.overload('int').implementation = function(cameraId) {
        Log.i(TAG, "[Camera] Opened camera ID: " + cameraId);
        send({type: 'camera', action: 'open', id: cameraId});
        return this.open(cameraId);
    };
    
    // Hook file read/write
    var FileInputStream = Java.use('java.io.FileInputStream');
    FileInputStream.$init.overload('java.io.File').implementation = function(file) {
        var path = file.getAbsolutePath();
        if (path.includes('/data/data/') || path.includes('/sdcard/')) {
            Log.i(TAG, "[FileRead] " + path);
            send({type: 'file_read', path: path});
        }
        return this.$init(file);
    };
    
    // Hook DexClassLoader (dynamic code loading)
    var DexClassLoader = Java.use('dalvik.system.DexClassLoader');
    DexClassLoader.$init.implementation = function(dexPath, optimizedDir, libraryPath, parent) {
        Log.i(TAG, "[DexLoader] Loading dex from: " + dexPath);
        send({type: 'dex_load', path: dexPath});
        return this.$init(dexPath, optimizedDir, libraryPath, parent);
    };
    
    Log.i(TAG, "API monitoring hooks installed");
});