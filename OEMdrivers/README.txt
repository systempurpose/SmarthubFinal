OEMdrivers folder — contents and usage (Windows)

This folder contains Windows driver installers for Android phone connectivity.
These are installer packages (.exe/.msi) and archives (.zip), not raw driver INF bundles.

Contents currently included:
- UniversalAdbDriverSetup.msi (generic ADB driver installer)
- SAMSUNG_USB_Driver_for_Mobile_Phones_v1.9.0.0.exe
- HUAWEIDriverTools_setup.exe
- LG Mobile Driver v4.8.0.exe
- lgdriveridentifier_setup.exe
- HTC Mobile Driver v4.17.0.001.exe
- MTK Driver Setup.exe
- ZIP copies of some of the above (HTC/LG/MTK)

What this means for SmartHub app integration:
- Driver install requires Administrator privileges (UAC prompt).
- Because these are vendor installers, SmartHub cannot reliably “silent install” them without vendor-supported /S arguments.
- Safest workflow:
  1) Detect driver/ADB issues.
  2) Show the matching driver option.
  3) On click, open/run the installer with user confirmation (Run as admin).
  4) After install, prompt the user to unplug/replug the phone and re-check ADB.

Notes
- Ensure you have redistribution rights for each OEM installer before shipping them inside your product.
- Prefer signed/official packages; unsigned drivers may fail on modern Windows.
