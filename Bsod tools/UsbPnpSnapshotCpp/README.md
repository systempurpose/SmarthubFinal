# UsbPnpSnapshotCpp

Optional C++ helper to snapshot the current Windows PnP device list (present devices) with ConfigMgr problem codes.

- Output: JSON on stdout
- Intended use: SmartHub `/connection-check` can optionally run this tool (best-effort) and attach the result as additional host-side evidence.

## Build (Developer Command Prompt)

From a Visual Studio Developer Command Prompt:

```bat
cd "Bsod tools\UsbPnpSnapshotCpp"
cl /std:c++17 /EHsc UsbPnpSnapshot.cpp /link setupapi.lib cfgmgr32.lib /out:UsbPnpSnapshot.exe
```

## Run

```powershell
.\UsbPnpSnapshot.exe --max 250
```
