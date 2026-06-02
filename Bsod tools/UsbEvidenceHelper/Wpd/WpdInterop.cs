using System;
using System.Runtime.InteropServices;
using System.Text;

namespace UsbEvidenceHelper.Wpd;

internal static class WpdConstants
{
    public const string WPD_DEVICE_OBJECT_ID = "DEVICE";
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;
}

[ComImport]
[Guid("A1567595-4C2F-4574-A6FA-ECEF917B9A40")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPortableDeviceManager
{
    void GetDevices(
        [Out, MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr, SizeParamIndex = 1)]
        string[]? pPnPDeviceIDs,
        ref uint pcPnPDeviceIDs);

    void RefreshDeviceList();

    void GetDeviceFriendlyName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPnPDeviceID,
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pDeviceFriendlyName,
        ref uint pcchDeviceFriendlyName);

    void GetDeviceDescription(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPnPDeviceID,
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pDeviceDescription,
        ref uint pcchDeviceDescription);

    void GetDeviceManufacturer(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPnPDeviceID,
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pDeviceManufacturer,
        ref uint pcchDeviceManufacturer);

    // Not needed for our probe.
}

[ComImport]
[Guid("24DBD89D-413E-43E0-BD5B-197F3C56C886")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPortableDevice
{
    void Open(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPnPDeviceID,
        [MarshalAs(UnmanagedType.Interface)] IPortableDeviceValues? pClientInfo);

    void SendCommand(
        uint dwFlags,
        [MarshalAs(UnmanagedType.Interface)] IPortableDeviceValues pParameters,
        [MarshalAs(UnmanagedType.Interface)] out IPortableDeviceValues ppResults);

    void Content([MarshalAs(UnmanagedType.Interface)] out IPortableDeviceContent ppContent);

    void Capabilities([MarshalAs(UnmanagedType.Interface)] out IPortableDeviceCapabilities ppCapabilities);

    void Cancel();

    void Close();

    // Not needed.
}

[ComImport]
[Guid("6A96ED84-7C73-4480-9938-BF5AF477D426")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPortableDeviceContent
{
    void EnumObjects(
        uint dwFlags,
        [MarshalAs(UnmanagedType.LPWStr)] string pszParentObjectID,
        [MarshalAs(UnmanagedType.Interface)] IPortableDeviceValues? pFilter,
        [MarshalAs(UnmanagedType.Interface)] out IEnumPortableDeviceObjectIDs ppEnum);

    // Not needed.
}

[ComImport]
[Guid("10ECE955-CF41-4728-BFA0-41EEDF1BBF19")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IEnumPortableDeviceObjectIDs
{
    void Next(
        uint cObjects,
        [MarshalAs(UnmanagedType.LPWStr)] out string pObjIDs,
        ref uint pcFetched);

    void Skip(uint cObjects);
    void Reset();
    void Clone([MarshalAs(UnmanagedType.Interface)] out IEnumPortableDeviceObjectIDs ppEnum);
    void Cancel();
}

[ComImport]
[Guid("6848F6F2-3155-4F86-B6F5-263EEEAB3143")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPortableDeviceValues
{
    // We only need the ability to create an empty instance for Open().
    // The interface is much larger; keep it minimal to avoid signature drift.
}

[ComImport]
[Guid("2C8C6DBF-E3DC-4061-BECC-8542E810D126")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPortableDeviceCapabilities
{
    // Not needed for this probe.
}

internal static class WpdFactory
{
    // CLSIDs resolved from HKCR\CLSID on this machine.
    private static readonly Guid ClsidPortableDeviceManager = new("0AF10CEC-2ECD-4B92-9581-34F6AE0637F3");
    private static readonly Guid ClsidPortableDevice = new("728A21C5-3D9E-48D7-9810-864848F0F404");
    private static readonly Guid ClsidPortableDeviceValues = new("0C15D503-D017-47CE-9016-7B3F978721CC");

    public static IPortableDeviceManager CreatePortableDeviceManager()
    {
        var t = Type.GetTypeFromCLSID(ClsidPortableDeviceManager, throwOnError: true);
        return (IPortableDeviceManager)Activator.CreateInstance(t!)!;
    }

    public static IPortableDevice CreatePortableDevice()
    {
        var t = Type.GetTypeFromCLSID(ClsidPortableDevice, throwOnError: true);
        return (IPortableDevice)Activator.CreateInstance(t!)!;
    }

    public static IPortableDeviceValues CreatePortableDeviceValues()
    {
        var t = Type.GetTypeFromCLSID(ClsidPortableDeviceValues, throwOnError: true);
        return (IPortableDeviceValues)Activator.CreateInstance(t!)!;
    }
}

internal static class WpdUtils
{
    public static string? TryGetDeviceFriendlyName(IPortableDeviceManager mgr, string deviceId)
        => TryGetString(mgr.GetDeviceFriendlyName, deviceId);

    public static string? TryGetDeviceManufacturer(IPortableDeviceManager mgr, string deviceId)
        => TryGetString(mgr.GetDeviceManufacturer, deviceId);

    public static string? TryGetDeviceDescription(IPortableDeviceManager mgr, string deviceId)
        => TryGetString(mgr.GetDeviceDescription, deviceId);

    private delegate void GetStringFn(string id, StringBuilder sb, ref uint len);

    private static string? TryGetString(GetStringFn fn, string id)
    {
        try
        {
            uint len = 0;
            try
            {
                // Many WPD APIs expect a 2-pass: first call returns required length
                // (often by throwing an "insufficient buffer" COMException).
                fn(id, new StringBuilder(0), ref len);
            }
            catch
            {
                // ignore; len may be populated
            }

            if (len == 0) return null;
            if (len > 32 * 1024) return null;

            var sb = new StringBuilder((int)len);
            fn(id, sb, ref len);
            var s = sb.ToString().TrimEnd('\0').Trim();
            return string.IsNullOrWhiteSpace(s) ? null : s;
        }
        catch
        {
            return null;
        }
    }
}
