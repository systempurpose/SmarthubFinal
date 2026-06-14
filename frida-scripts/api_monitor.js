// frida-scripts/api_monitor.js
// Hook dangerous Android APIs
Java.perform(function () {
    var Log = Java.use('android.util.Log');
    var TAG = "SmartHubFrida";
    
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
    
    // Hook file read/write (example)
    var FileInputStream = Java.use('java.io.FileInputStream');
    FileInputStream.$init.overload('java.io.File').implementation = function(file) {
        var path = file.getAbsolutePath();
        if (path.includes('/data/data/') || path.includes('/sdcard/')) {
            Log.i(TAG, "[FileRead] " + path);
            send({type: 'file_read', path: path});
        }
        return this.$init(file);
    };
    
    // Hook DexClassLoader (dynamic code loading, common in malware)
    var DexClassLoader = Java.use('dalvik.system.DexClassLoader');
    DexClassLoader.$init.implementation = function(dexPath, optimizedDir, libraryPath, parent) {
        Log.i(TAG, "[DexLoader] Loading dex from: " + dexPath);
        send({type: 'dex_load', path: dexPath});
        return this.$init(dexPath, optimizedDir, libraryPath, parent);
    };
});