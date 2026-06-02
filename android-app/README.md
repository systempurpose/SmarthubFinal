# SmartHub Mobile Diagnostics App

This is a minimal Android companion app that collects on‑device metrics and writes them to a JSON file so the **desktop SmartHub tool** can read them over ADB.

- No cloud calls, no analytics.
- Reads system information only through public Android APIs.
- Shows a clear summary (battery, storage, memory, sensors, OS/build info) on the phone screen.
- Automatically saves a `smarthub_diagnostics.json` report under the app's external files directory so the desktop backend can load it via `/on-device-report/:id` or `/collect/:id`.

## What it checks (on device)

- **Battery** – level, voltage and instantaneous current (when available).
- **Memory (RAM)** – total and available RAM, low-memory flag.
- **Storage** – internal `/data` total/used/free.
- **OS / Build** – Android version, manufacturer/model, build fingerprint.
- **Sensors** – presence of accelerometer, gyroscope, proximity and light sensors.
- **Power stability (best-effort)** – tracks recent USB power connect/disconnect flapping and battery voltage/current samples while the desktop diagnostic is running. This can help flag loose USB cable/port symptoms and other power instability hints.

Because it uses standard Android APIs, it does *not* require root and does not read private app data or full system logs. The authoritative, combined report is shown on the desktop UI; the phone screen is a local preview.

### JSON output notes

The `smarthub_diagnostics.json` report may include an extra section:

- `powerStability`
	- `usb.togglesLast2Min` and `suspected.looseUsbCableOrPort` can indicate frequent USB power toggling.
	- `battery.voltageDropEvents` and `suspected.powerPathInstabilityPossible` are heuristic-only hints.

## How to build and install (from VS Code / command line)

You do **not** need Android Studio, but you do need:

- Java 17+ (JDK)
- Android SDK + platform‑tools (`adb` on PATH)
- Gradle (system‑wide) or the Gradle wrapper if you generate it

Steps:

1. In VS Code, open a terminal in the `android-app` folder.
2. Build a debug APK:
	- If you have Gradle installed globally: `gradle assembleDebug`
	- (Optional) Or first run `gradle wrapper` once, then use `./gradlew assembleDebug` on future builds.
3. After a successful build, confirm this file exists:
	- `android-app/app/build/outputs/apk/debug/app-debug.apk`
4. Make sure a phone is connected with USB debugging enabled and trusted (`adb devices` shows it as `device`).
5. In the SmartHub desktop UI, click **Install mobile app**. The backend will automatically use the debug APK at the path above and install it via `adb install -r`.

You can still install/debug directly with Android Studio if you prefer, but the Install mobile app button is designed to work from the command‑line build output only.
