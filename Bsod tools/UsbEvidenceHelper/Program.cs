using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using UsbEvidenceHelper.Native;

namespace UsbEvidenceHelper;

internal sealed record UsbDeviceEvidence(
    string InstanceId,
    string? FriendlyName,
    string? DeviceDesc,
    string? Manufacturer,
    string? ClassName,
    string? ClassGuid,
    string? LocationInfo,
    uint? ProblemCode,
    IReadOnlyList<string> HardwareIds,
    IReadOnlyList<string> CompatibleIds,
    IReadOnlyList<string> ParentChain,
    string? Vid,
    string? Pid
);

internal sealed record UsbEvidenceResponse(
    bool Ok,
    string? Error,
    string Tool,
    string Host,
    DateTimeOffset Timestamp,
    IReadOnlyList<UsbDeviceEvidence> Devices
);

internal sealed record WpdMtpDevice(
    string DeviceId,
    string? FriendlyName,
    string? Manufacturer,
    string? Description,
    string? Vid,
    string? Pid
);

internal sealed record WpdMtpProbeResponse(
    bool Ok,
    string? Error,
    int? ErrorHResult,
    string? ErrorHResultHex,
    bool? TimedOut,
    string Tool,
    string Host,
    DateTimeOffset Timestamp,
    int DurationMs,
    IReadOnlyList<WpdMtpDevice> Devices,
    string? DeviceId,
    string? DeviceName,
    IReadOnlyList<string> SampleItems,
    bool? DeepOk,
    IReadOnlyList<string>? DeepSampleItems,
    int? DeepDurationMs,
    int? DeepEnumeratedCount,
    string? DeepError,
    int? DeepErrorHResult,
    string? DeepErrorHResultHex
);

internal static class Program
{
    private static bool HasArg(string[] args, string name)
        => args.Any(a => string.Equals(a, name, StringComparison.OrdinalIgnoreCase));

    private static string? GetArgValue(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
            {
                return args[i + 1];
            }
        }
        return null;
    }

    private static string? TryGetVid(string instanceId)
    {
        var idx = instanceId.IndexOf("VID_", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return null;
        if (idx + 8 > instanceId.Length) return null;
        return instanceId.Substring(idx + 4, 4).ToUpperInvariant();
    }

    private static string? TryGetPid(string instanceId)
    {
        var idx = instanceId.IndexOf("PID_", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return null;
        if (idx + 8 > instanceId.Length) return null;
        return instanceId.Substring(idx + 4, 4).ToUpperInvariant();
    }

    private static string? TryParseVidFromPnpId(string deviceId)
        => TryGetVid(deviceId);

    private static string? TryParsePidFromPnpId(string deviceId)
        => TryGetPid(deviceId);

    private static string? GetStringProperty(IntPtr set, ref SetupApi.SP_DEVINFO_DATA dev, uint prop)
    {
        var buf = new byte[8 * 1024];
        if (!SetupApi.SetupDiGetDeviceRegistryPropertyW(set, ref dev, prop, out _, buf, (uint)buf.Length, out var required))
        {
            // Property may not exist.
            return null;
        }

        // Values are typically REG_SZ (UTF-16, null-terminated)
        var s = Encoding.Unicode.GetString(buf, 0, (int)Math.Min(required, (uint)buf.Length));
        s = s.TrimEnd('\0').Trim();
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }

    private static List<string> GetMultiSzProperty(IntPtr set, ref SetupApi.SP_DEVINFO_DATA dev, uint prop)
    {
        var buf = new byte[16 * 1024];
        if (!SetupApi.SetupDiGetDeviceRegistryPropertyW(set, ref dev, prop, out _, buf, (uint)buf.Length, out var required))
        {
            return new List<string>();
        }

        var s = Encoding.Unicode.GetString(buf, 0, (int)Math.Min(required, (uint)buf.Length));
        // MULTI_SZ is NUL-separated strings ending with double NUL
        var parts = s.Split('\0', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return parts;
    }

    private static string? TryGetInstanceId(uint devInst)
    {
        var buf = new char[4096];
        var cr = CfgMgr32.CM_Get_Device_IDW(devInst, buf, buf.Length, 0);
        if (cr != CfgMgr32.CR_SUCCESS) return null;
        var s = new string(buf);
        s = s.TrimEnd('\0').Trim();
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }

    private static (uint? problem, List<string> parents) GetProblemAndParents(uint devInst)
    {
        uint status;
        uint problem;
        var cr = CfgMgr32.CM_Get_DevNode_Status(out status, out problem, devInst, 0);
        uint? prob = cr == CfgMgr32.CR_SUCCESS ? problem : null;

        var chain = new List<string>();
        var current = devInst;
        for (var i = 0; i < 6; i++)
        {
            if (CfgMgr32.CM_Get_Parent(out var parent, current, 0) != CfgMgr32.CR_SUCCESS) break;
            var pid = TryGetInstanceId(parent);
            if (!string.IsNullOrWhiteSpace(pid)) chain.Add(pid!);
            current = parent;
        }

        return (prob, chain);
    }

    public static int Main(string[] args)
    {
        try
        {
            // Mode: WPD MTP ping (lightweight heartbeat-friendly probe).
            // Usage:
            //   UsbEvidenceHelper.exe mtp-ping --nameContains "Galaxy"
            // Emits JSON (same shape as mtp-probe): { ok, durationMs, deviceName, sampleItems, devices, deepOk=null, ... }
            if (args.Length > 0 && string.Equals(args[0], "mtp-ping", StringComparison.OrdinalIgnoreCase))
            {
                var started = Environment.TickCount64;
                var nameContains = GetArgValue(args, "--nameContains");

                var mtpDevices = new List<WpdMtpDevice>();
                string? selectedId = null;
                string? selectedName = null;
                var sample = new List<string>();

                try
                {
                    var mgr = Wpd.WpdFactory.CreatePortableDeviceManager();
                    mgr.RefreshDeviceList();

                    uint count = 0;
                    mgr.GetDevices(null, ref count);
                    var ids = count > 0 ? new string[count] : Array.Empty<string>();
                    if (count > 0)
                    {
                        mgr.GetDevices(ids, ref count);
                    }

                    foreach (var id in ids.Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        var friendly = Wpd.WpdUtils.TryGetDeviceFriendlyName(mgr, id);
                        var mfg = Wpd.WpdUtils.TryGetDeviceManufacturer(mgr, id);
                        var desc = Wpd.WpdUtils.TryGetDeviceDescription(mgr, id);

                        mtpDevices.Add(new WpdMtpDevice(
                            DeviceId: id,
                            FriendlyName: friendly,
                            Manufacturer: mfg,
                            Description: desc,
                            Vid: TryParseVidFromPnpId(id),
                            Pid: TryParsePidFromPnpId(id)
                        ));
                    }

                    var needle = string.IsNullOrWhiteSpace(nameContains) ? null : nameContains.Trim();
                    var chosen = mtpDevices.FirstOrDefault(d =>
                        needle != null
                        && !string.IsNullOrWhiteSpace(d.FriendlyName)
                        && d.FriendlyName!.Contains(needle, StringComparison.OrdinalIgnoreCase));
                    chosen ??= mtpDevices.FirstOrDefault();

                    selectedId = chosen?.DeviceId;
                    selectedName = chosen?.FriendlyName ?? chosen?.Description;

                    if (!string.IsNullOrWhiteSpace(selectedId))
                    {
                        var device = Wpd.WpdFactory.CreatePortableDevice();
                        Wpd.IPortableDeviceValues? clientInfo = null;
                        try { clientInfo = Wpd.WpdFactory.CreatePortableDeviceValues(); } catch { clientInfo = null; }
                        device.Open(selectedId!, clientInfo);
                        try
                        {
                            device.Content(out var content);
                            content.EnumObjects(0, Wpd.WpdConstants.WPD_DEVICE_OBJECT_ID, null, out var enumIds);
                            for (var i = 0; i < 10; i++)
                            {
                                uint fetched = 0;
                                string objId;
                                try { enumIds.Next(1, out objId, ref fetched); }
                                catch { break; }
                                if (fetched == 0 || string.IsNullOrWhiteSpace(objId)) break;
                                sample.Add(objId);
                            }
                        }
                        finally
                        {
                            try { device.Close(); } catch { }
                        }
                    }

                    var duration = (int)Math.Max(0, Environment.TickCount64 - started);
                    var mtpResponse = new WpdMtpProbeResponse(
                        Ok: true,
                        Error: null,
                        ErrorHResult: null,
                        ErrorHResultHex: null,
                        TimedOut: null,
                        Tool: "UsbEvidenceHelper",
                        Host: Environment.MachineName,
                        Timestamp: DateTimeOffset.UtcNow,
                        DurationMs: duration,
                        Devices: mtpDevices,
                        DeviceId: selectedId,
                        DeviceName: selectedName,
                        SampleItems: sample,
                        DeepOk: null,
                        DeepSampleItems: null,
                        DeepDurationMs: null,
                        DeepEnumeratedCount: null,
                        DeepError: null,
                        DeepErrorHResult: null,
                        DeepErrorHResultHex: null
                    );

                    var mtpJson = JsonSerializer.Serialize(mtpResponse, new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });

                    Console.Out.WriteLine(mtpJson);
                    return 0;
                }
                catch (Exception ex)
                {
                    var duration = (int)Math.Max(0, Environment.TickCount64 - started);
                    int? hr = null;
                    string? hrHex = null;
                    try
                    {
                        hr = ex.HResult;
                        hrHex = $"0x{unchecked((uint)ex.HResult):X8}";
                    }
                    catch
                    {
                        // ignore
                    }

                    var mtpResponse = new WpdMtpProbeResponse(
                        Ok: false,
                        Error: ex.Message,
                        ErrorHResult: hr,
                        ErrorHResultHex: hrHex,
                        TimedOut: null,
                        Tool: "UsbEvidenceHelper",
                        Host: Environment.MachineName,
                        Timestamp: DateTimeOffset.UtcNow,
                        DurationMs: duration,
                        Devices: mtpDevices,
                        DeviceId: selectedId,
                        DeviceName: selectedName,
                        SampleItems: Array.Empty<string>(),
                        DeepOk: null,
                        DeepSampleItems: null,
                        DeepDurationMs: null,
                        DeepEnumeratedCount: null,
                        DeepError: null,
                        DeepErrorHResult: null,
                        DeepErrorHResultHex: null
                    );

                    var mtpJson = JsonSerializer.Serialize(mtpResponse, new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });
                    Console.Out.WriteLine(mtpJson);
                    return 0;
                }
            }

            // Mode: WPD MTP probe (real responsiveness check using Windows Portable Devices API).
            // Usage:
            //   UsbEvidenceHelper.exe mtp-probe --nameContains "Galaxy" 
            // Emits JSON: { ok, durationMs, deviceName, sampleItems, deepOk, deepError, ... }
            if (args.Length > 0 && string.Equals(args[0], "mtp-probe", StringComparison.OrdinalIgnoreCase))
            {
                var started = Environment.TickCount64;
                var nameContains = GetArgValue(args, "--nameContains");

                var mtpDevices = new List<WpdMtpDevice>();
                string? selectedId = null;
                string? selectedName = null;

                try
                {
                    var mgr = Wpd.WpdFactory.CreatePortableDeviceManager();
                    mgr.RefreshDeviceList();

                    uint count = 0;
                    mgr.GetDevices(null, ref count);
                    var ids = count > 0 ? new string[count] : Array.Empty<string>();
                    if (count > 0)
                    {
                        mgr.GetDevices(ids, ref count);
                    }

                    foreach (var id in ids.Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        var friendly = Wpd.WpdUtils.TryGetDeviceFriendlyName(mgr, id);
                        var mfg = Wpd.WpdUtils.TryGetDeviceManufacturer(mgr, id);
                        var desc = Wpd.WpdUtils.TryGetDeviceDescription(mgr, id);

                        mtpDevices.Add(new WpdMtpDevice(
                            DeviceId: id,
                            FriendlyName: friendly,
                            Manufacturer: mfg,
                            Description: desc,
                            Vid: TryParseVidFromPnpId(id),
                            Pid: TryParsePidFromPnpId(id)
                        ));
                    }

                    // Pick the best match by nameContains, else first device.
                    var needle = string.IsNullOrWhiteSpace(nameContains) ? null : nameContains.Trim();
                    var chosen = mtpDevices.FirstOrDefault(d =>
                        needle != null
                        && !string.IsNullOrWhiteSpace(d.FriendlyName)
                        && d.FriendlyName!.Contains(needle, StringComparison.OrdinalIgnoreCase));
                    chosen ??= mtpDevices.FirstOrDefault();

                    selectedId = chosen?.DeviceId;
                    selectedName = chosen?.FriendlyName ?? chosen?.Description;

                    var sample = new List<string>();
                    var deepSample = new List<string>();
                    bool? deepOk = null;
                    string? deepErr = null;
                    int? deepErrHresult = null;
                    string? deepErrHresultHex = null;
                    int? deepDurationMs = null;
                    int? deepEnumeratedCount = null;

                    if (!string.IsNullOrWhiteSpace(selectedId))
                    {
                        var device = Wpd.WpdFactory.CreatePortableDevice();
                        Wpd.IPortableDeviceValues? clientInfo = null;
                        try { clientInfo = Wpd.WpdFactory.CreatePortableDeviceValues(); } catch { clientInfo = null; }
                        // Best-effort: some devices accept empty clientInfo.
                        device.Open(selectedId!, clientInfo);

                        try
                        {
                            device.Content(out var content);
                            content.EnumObjects(0, Wpd.WpdConstants.WPD_DEVICE_OBJECT_ID, null, out var enumIds);

                            // Non-trivial MTP probe: enumerate many object handles from the device root,
                            // then attempt deeper enumeration (children + grandchildren). This forces the
                            // media transfer service to do real work and is more likely to hang when the
                            // UI/MediaProvider is frozen.
                            //
                            // IMPORTANT: We intentionally keep the probe read-only.
                            // The caller (Node) enforces a 5-8s timeout at the process level.

                            var rootIds = new List<string>();
                            for (var i = 0; i < 200; i++)
                            {
                                uint fetched = 0;
                                string objId;
                                try { enumIds.Next(1, out objId, ref fetched); }
                                catch { break; }

                                if (fetched == 0 || string.IsNullOrWhiteSpace(objId)) break;
                                rootIds.Add(objId);
                                if (sample.Count < 15) sample.Add(objId);
                            }

                            // Deep: a heavier, non-trivial traversal resembling "GetObjectHandles" on "\\".
                            // We do a breadth-first enumeration starting from the DEVICE root.
                            // The caller (Node) enforces a 5–8s timeout at the process level.
                            var deepStarted = Environment.TickCount64;
                            var deepBudgetMs = 6_500; // stay under the typical 8s process timeout
                            var maxDepth = 4;
                            var maxEnumerated = 800;
                            var enumerated = 0;

                            var q = new Queue<(string id, int depth)>();
                            q.Enqueue((Wpd.WpdConstants.WPD_DEVICE_OBJECT_ID, 0));

                            while (q.Count > 0)
                            {
                                if ((Environment.TickCount64 - deepStarted) >= deepBudgetMs) break;
                                if (enumerated >= maxEnumerated) break;

                                var (parentId, depth) = q.Dequeue();
                                if (depth >= maxDepth) continue;

                                try
                                {
                                    content.EnumObjects(0, parentId, null, out var enumChild);
                                    for (var c = 0; c < 200; c++)
                                    {
                                        if ((Environment.TickCount64 - deepStarted) >= deepBudgetMs) break;
                                        if (enumerated >= maxEnumerated) break;

                                        uint fetchedC = 0;
                                        string childId;
                                        try { enumChild.Next(1, out childId, ref fetchedC); }
                                        catch { break; }

                                        if (fetchedC == 0 || string.IsNullOrWhiteSpace(childId)) break;
                                        enumerated++;
                                        if (deepSample.Count < 80) deepSample.Add(childId);

                                        q.Enqueue((childId, depth + 1));
                                    }
                                }
                                catch (Exception dex)
                                {
                                    deepOk = false;
                                    deepErr = "Cannot enumerate deep MTP objects (locked/unresponsive?)";
                                    try
                                    {
                                        deepErrHresult = dex.HResult;
                                        deepErrHresultHex = $"0x{unchecked((uint)dex.HResult):X8}";
                                    }
                                    catch
                                    {
                                        // ignore
                                    }
                                    break;
                                }
                            }

                            deepDurationMs = (int)Math.Max(0, Environment.TickCount64 - deepStarted);
                            deepEnumeratedCount = enumerated;

                            if (deepOk is null)
                            {
                                deepOk = true;
                            }
                        }
                        finally
                        {
                            try { device.Close(); } catch { }
                        }

                    }

                    var duration = (int)Math.Max(0, Environment.TickCount64 - started);
                    var mtpResponse = new WpdMtpProbeResponse(
                        Ok: true,
                        Error: null,
                        ErrorHResult: null,
                        ErrorHResultHex: null,
                        TimedOut: null,
                        Tool: "UsbEvidenceHelper",
                        Host: Environment.MachineName,
                        Timestamp: DateTimeOffset.UtcNow,
                        DurationMs: duration,
                        Devices: mtpDevices,
                        DeviceId: selectedId,
                        DeviceName: selectedName,
                        SampleItems: sample,
                        DeepOk: deepOk,
                        DeepSampleItems: deepSample,
                        DeepDurationMs: deepDurationMs,
                        DeepEnumeratedCount: deepEnumeratedCount,
                        DeepError: deepErr,
                        DeepErrorHResult: deepErrHresult,
                        DeepErrorHResultHex: deepErrHresultHex
                    );

                    var mtpJson = JsonSerializer.Serialize(mtpResponse, new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });

                    Console.Out.WriteLine(mtpJson);
                    return 0;
                }
                catch (Exception ex)
                {
                    var duration = (int)Math.Max(0, Environment.TickCount64 - started);
                    int? hr = null;
                    string? hrHex = null;
                    try
                    {
                        hr = ex.HResult;
                        hrHex = $"0x{unchecked((uint)ex.HResult):X8}";
                    }
                    catch
                    {
                        // ignore
                    }
                    var mtpResponse = new WpdMtpProbeResponse(
                        Ok: false,
                        Error: ex.Message,
                        ErrorHResult: hr,
                        ErrorHResultHex: hrHex,
                        TimedOut: null,
                        Tool: "UsbEvidenceHelper",
                        Host: Environment.MachineName,
                        Timestamp: DateTimeOffset.UtcNow,
                        DurationMs: duration,
                        Devices: mtpDevices,
                        DeviceId: selectedId,
                        DeviceName: selectedName,
                        SampleItems: Array.Empty<string>(),
                        DeepOk: null,
                        DeepSampleItems: null,
                        DeepDurationMs: null,
                        DeepEnumeratedCount: null,
                        DeepError: null,
                        DeepErrorHResult: null,
                        DeepErrorHResultHex: null
                    );
                    var mtpJson = JsonSerializer.Serialize(mtpResponse, new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });
                    Console.Out.WriteLine(mtpJson);
                    return 0;
                }
            }

            var devices = new List<UsbDeviceEvidence>();

            var set = SetupApi.SetupDiGetClassDevsW(IntPtr.Zero, null, IntPtr.Zero, SetupApi.DIGCF_PRESENT | SetupApi.DIGCF_ALLCLASSES);
            if (set == IntPtr.Zero || set == new IntPtr(-1))
            {
                throw new InvalidOperationException("SetupDiGetClassDevsW failed.");
            }

            try
            {
                var index = 0u;
                while (true)
                {
                    var dev = new SetupApi.SP_DEVINFO_DATA { cbSize = Marshal.SizeOf<SetupApi.SP_DEVINFO_DATA>() };
                    if (!SetupApi.SetupDiEnumDeviceInfo(set, index, ref dev))
                    {
                        break;
                    }

                    index++;

                    var instanceId = TryGetInstanceId(dev.DevInst);
                    if (string.IsNullOrWhiteSpace(instanceId))
                    {
                        continue;
                    }

                    // Keep scope narrow: USB VID/PID devices only.
                    if (!instanceId.StartsWith("USB\\VID_", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var friendly = GetStringProperty(set, ref dev, SetupApi.SPDRP_FRIENDLYNAME);
                    var desc = GetStringProperty(set, ref dev, SetupApi.SPDRP_DEVICEDESC);
                    var mfg = GetStringProperty(set, ref dev, SetupApi.SPDRP_MFG);
                    var cls = GetStringProperty(set, ref dev, SetupApi.SPDRP_CLASS);
                    var clsGuid = GetStringProperty(set, ref dev, SetupApi.SPDRP_CLASSGUID);
                    var loc = GetStringProperty(set, ref dev, SetupApi.SPDRP_LOCATION_INFORMATION);

                    var hw = GetMultiSzProperty(set, ref dev, SetupApi.SPDRP_HARDWAREID);
                    var compat = GetMultiSzProperty(set, ref dev, SetupApi.SPDRP_COMPATIBLEIDS);

                    var (problem, parents) = GetProblemAndParents(dev.DevInst);

                    devices.Add(new UsbDeviceEvidence(
                        InstanceId: instanceId,
                        FriendlyName: friendly,
                        DeviceDesc: desc,
                        Manufacturer: mfg,
                        ClassName: cls,
                        ClassGuid: clsGuid,
                        LocationInfo: loc,
                        ProblemCode: problem,
                        HardwareIds: hw,
                        CompatibleIds: compat,
                        ParentChain: parents,
                        Vid: TryGetVid(instanceId),
                        Pid: TryGetPid(instanceId)
                    ));
                }
            }
            finally
            {
                SetupApi.SetupDiDestroyDeviceInfoList(set);
            }

            var response = new UsbEvidenceResponse(
                Ok: true,
                Error: null,
                Tool: "UsbEvidenceHelper",
                Host: Environment.MachineName,
                Timestamp: DateTimeOffset.UtcNow,
                Devices: devices
            );

            var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
            {
                WriteIndented = false,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            Console.Out.WriteLine(json);
            return 0;
        }
        catch (Exception ex)
        {
            var response = new UsbEvidenceResponse(
                Ok: false,
                Error: ex.Message,
                Tool: "UsbEvidenceHelper",
                Host: Environment.MachineName,
                Timestamp: DateTimeOffset.UtcNow,
                Devices: Array.Empty<UsbDeviceEvidence>()
            );

            var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
            {
                WriteIndented = false,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            Console.Out.WriteLine(json);
            return 2;
        }
    }
}
