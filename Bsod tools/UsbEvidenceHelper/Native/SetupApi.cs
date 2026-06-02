using System;
using System.Runtime.InteropServices;

namespace UsbEvidenceHelper.Native;

internal static class SetupApi
{
    internal const uint DIGCF_DEFAULT = 0x00000001;
    internal const uint DIGCF_PRESENT = 0x00000002;
    internal const uint DIGCF_ALLCLASSES = 0x00000004;
    internal const uint DIGCF_PROFILE = 0x00000008;
    internal const uint DIGCF_DEVICEINTERFACE = 0x00000010;

    internal const uint SPDRP_DEVICEDESC = 0x00000000;
    internal const uint SPDRP_HARDWAREID = 0x00000001;
    internal const uint SPDRP_COMPATIBLEIDS = 0x00000002;
    internal const uint SPDRP_SERVICE = 0x00000004;
    internal const uint SPDRP_CLASS = 0x00000007;
    internal const uint SPDRP_CLASSGUID = 0x00000008;
    internal const uint SPDRP_DRIVER = 0x00000009;
    internal const uint SPDRP_MFG = 0x0000000B;
    internal const uint SPDRP_FRIENDLYNAME = 0x0000000C;
    internal const uint SPDRP_LOCATION_INFORMATION = 0x0000000D;

    [StructLayout(LayoutKind.Sequential)]
    internal struct SP_DEVINFO_DATA
    {
        public int cbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public IntPtr Reserved;
    }

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern IntPtr SetupDiGetClassDevsW(
        IntPtr ClassGuid,
        string? Enumerator,
        IntPtr hwndParent,
        uint Flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    internal static extern bool SetupDiEnumDeviceInfo(
        IntPtr DeviceInfoSet,
        uint MemberIndex,
        ref SP_DEVINFO_DATA DeviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    internal static extern bool SetupDiDestroyDeviceInfoList(IntPtr DeviceInfoSet);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern bool SetupDiGetDeviceRegistryPropertyW(
        IntPtr DeviceInfoSet,
        ref SP_DEVINFO_DATA DeviceInfoData,
        uint Property,
        out uint PropertyRegDataType,
        byte[] PropertyBuffer,
        uint PropertyBufferSize,
        out uint RequiredSize);
}
