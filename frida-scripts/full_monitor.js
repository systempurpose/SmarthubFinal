// frida-scripts/full_monitor.js
// Enhanced: anti‑detection + comprehensive API monitoring

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

    // ========== NETWORK MONITORING ==========
    // URL.openConnection
    const URL = Java.use('java.net.URL');
    URL.openConnection.overload().implementation = function () {
        const url = this.toString();
        Log.i(TAG, "[Network] URL.openConnection: " + url);
        send({ type: 'network', action: 'openConnection', url: url });
        return this.openConnection();
    };

    // HttpURLConnection.connect
    const HttpURLConnection = Java.use('java.net.HttpURLConnection');
    HttpURLConnection.connect.implementation = function () {
        const url = this.getURL().toString();
        Log.i(TAG, "[Network] HttpURLConnection.connect: " + url);
        send({ type: 'network', action: 'connect', url: url });
        return this.connect();
    };

    // WebSocket (if present)
    try {
        const WebSocket = Java.use('okhttp3.WebSocket');
        WebSocket.send.overload('java.lang.String').implementation = function (text) {
            Log.i(TAG, "[Network] WebSocket send: " + text);
            send({ type: 'network', action: 'websocket_send', data: text });
            return this.send(text);
        };
    } catch (e) {
        // okhttp3 not available, ignore
    }

    // ========== SMS MONITORING ==========
    const SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendTextMessage.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'android.app.PendingIntent', 'android.app.PendingIntent').implementation = function (dest, sc, text, sent, delivery) {
        Log.i(TAG, "[SMS] Dest: " + dest + " Text: " + text);
        send({ type: 'sms', destination: dest, body: text });
        return this.sendTextMessage(dest, sc, text, sent, delivery);
    };

    // ========== LOCATION MONITORING ==========
    const LocationManager = Java.use('android.location.LocationManager');
    LocationManager.getLastKnownLocation.implementation = function (provider) {
        const result = this.getLastKnownLocation(provider);
        const lat = result ? result.getLatitude() : null;
        const lng = result ? result.getLongitude() : null;
        Log.i(TAG, "[Location] Provider: " + provider + " Lat: " + lat + " Lng: " + lng);
        send({ type: 'location', provider: provider, lat: lat, lng: lng });
        return result;
    };

    // ========== CAMERA MONITORING ==========
    const Camera = Java.use('android.hardware.Camera');
    Camera.open.overload('int').implementation = function (cameraId) {
        Log.i(TAG, "[Camera] Opened camera ID: " + cameraId);
        send({ type: 'camera', action: 'open', id: cameraId });
        return this.open(cameraId);
    };

    // ========== MICROPHONE / AUDIO RECORDING ==========
    try {
        const MediaRecorder = Java.use('android.media.MediaRecorder');
        MediaRecorder.start.implementation = function () {
            Log.i(TAG, "[Microphone] Recording started");
            send({ type: 'microphone', action: 'start' });
            return this.start();
        };
        MediaRecorder.stop.implementation = function () {
            Log.i(TAG, "[Microphone] Recording stopped");
            send({ type: 'microphone', action: 'stop' });
            return this.stop();
        };
    } catch (e) {
        // MediaRecorder not available
    }

    // ========== FILE OPERATIONS ==========
    const FileInputStream = Java.use('java.io.FileInputStream');
    FileInputStream.$init.overload('java.io.File').implementation = function (file) {
        const path = file.getAbsolutePath();
        if (path.includes('/data/data/') || path.includes('/sdcard/')) {
            Log.i(TAG, "[FileRead] " + path);
            send({ type: 'file_read', path: path });
        }
        return this.$init(file);
    };

    const FileOutputStream = Java.use('java.io.FileOutputStream');
    FileOutputStream.$init.overload('java.io.File').implementation = function (file) {
        const path = file.getAbsolutePath();
        if (path.includes('/data/data/') || path.includes('/sdcard/')) {
            Log.i(TAG, "[FileWrite] " + path);
            send({ type: 'file_write', path: path });
        }
        return this.$init(file);
    };

    const FileDelete = Java.use('java.io.File');
    FileDelete.delete.implementation = function () {
        const path = this.getAbsolutePath();
        if (path.includes('/data/data/') || path.includes('/sdcard/')) {
            Log.i(TAG, "[FileDelete] " + path);
            send({ type: 'file_delete', path: path });
        }
        return this.delete();
    };

    // ========== DYNAMIC CODE LOADING ==========
    const DexClassLoader = Java.use('dalvik.system.DexClassLoader');
    DexClassLoader.$init.implementation = function (dexPath, optimizedDir, libraryPath, parent) {
        Log.i(TAG, "[DexLoader] Loading dex from: " + dexPath);
        send({ type: 'dex_load', path: dexPath });
        return this.$init(dexPath, optimizedDir, libraryPath, parent);
    };

    // ========== WEBVIEW (Potential phishing) ==========
    try {
        const WebView = Java.use('android.webkit.WebView');
        WebView.loadUrl.overload('java.lang.String').implementation = function (url) {
            Log.i(TAG, "[WebView] Loading URL: " + url);
            send({ type: 'webview', action: 'loadUrl', url: url });
            return this.loadUrl(url);
        };
    } catch (e) {
        // WebView not available
    }

    // ========== NOTIFICATION SPAM (Adware) ==========
    try {
        const NotificationManager = Java.use('android.app.NotificationManager');
        NotificationManager.notify.overload('java.lang.String', 'int', 'android.app.Notification').implementation = function (tag, id, notification) {
            const content = notification.extras ? notification.extras.getString('android.title') + ': ' + notification.extras.getString('android.text') : 'No content';
            Log.i(TAG, "[Notification] Tag: " + tag + " Id: " + id + " Content: " + content);
            send({ type: 'notification', tag: tag, id: id, content: content });
            return this.notify(tag, id, notification);
        };
    } catch (e) {
        // NotificationManager not available
    }

    // ========== BROADCAST RECEIVERS (Auto‑start) ==========
    const Context = Java.use('android.content.Context');
    Context.registerReceiver.overload('android.content.BroadcastReceiver', 'android.content.IntentFilter').implementation = function (receiver, filter) {
        const actions = filter.getActions(0);
        Log.i(TAG, "[Broadcast] Registered receiver for actions: " + actions);
        send({ type: 'broadcast', actions: actions });
        return this.registerReceiver(receiver, filter);
    };

    // ========== CRYPTO / ENCRYPTION (Possible ransomware) ==========
    try {
        const Cipher = Java.use('javax.crypto.Cipher');
        Cipher.init.overload('int', 'java.security.Key').implementation = function (opmode, key) {
            const algorithm = key.getAlgorithm();
            Log.i(TAG, "[Crypto] Cipher init with algorithm: " + algorithm + " opmode: " + opmode);
            send({ type: 'crypto', algorithm: algorithm, opmode: opmode });
            return this.init(opmode, key);
        };
    } catch (e) {
        // Cipher not available
    }

    // ========== STARTUP / BACKGROUND BEHAVIOR ==========
    // Detect if app tries to start a service on boot
    try {
        const Intent = Java.use('android.content.Intent');
        Intent.ACTION_BOOT_COMPLETED = function () {
            Log.i(TAG, "[Intent] BOOT_COMPLETED intent detected");
            send({ type: 'intent', action: 'BOOT_COMPLETED' });
            return this.ACTION_BOOT_COMPLETED;
        };
    } catch (e) {
        // Intent not available
    }

    Log.i(TAG, "API monitoring hooks installed (enhanced)");
});