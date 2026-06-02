using System;
using System.Runtime.InteropServices;

namespace UsbEvidenceHelper.Native;

internal static class CfgMgr32
{
    internal const int CR_SUCCESS = 0x00000000;

    [DllImport("cfgmgr32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int CM_Get_Device_IDW(uint dnDevInst, char[] Buffer, int BufferLen, int ulFlags);

    [DllImport("cfgmgr32.dll", SetLastError = true)]
    internal static extern int CM_Get_DevNode_Status(out uint pulStatus, out uint pulProblemNumber, uint dnDevInst, int ulFlags);

    [DllImport("cfgmgr32.dll", SetLastError = true)]
    internal static extern int CM_Get_Parent(out uint pdnDevInst, uint dnDevInst, int ulFlags);
}
