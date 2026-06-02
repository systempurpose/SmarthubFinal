#define NOMINMAX
#include <windows.h>
#include <cfgmgr32.h>
#include <setupapi.h>
#include <devpkey.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "cfgmgr32.lib")

static std::string utf8_from_wide(const std::wstring& ws) {
    if (ws.empty()) return std::string();
    int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), (int)ws.size(), nullptr, 0, nullptr, nullptr);
    if (len <= 0) return std::string();
    std::string out;
    out.resize((size_t)len);
    WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), (int)ws.size(), out.data(), len, nullptr, nullptr);
    return out;
}

static std::string json_escape(const std::string& s) {
    std::string o;
    o.reserve(s.size() + 16);
    for (char c : s) {
        switch (c) {
        case '\\': o += "\\\\"; break;
        case '"': o += "\\\""; break;
        case '\n': o += "\\n"; break;
        case '\r': o += "\\r"; break;
        case '\t': o += "\\t"; break;
        default:
            if ((unsigned char)c < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04x", (unsigned int)(unsigned char)c);
                o += buf;
            }
            else {
                o += c;
            }
        }
    }
    return o;
}

static std::wstring get_device_registry_property_w(HDEVINFO hDevInfo, SP_DEVINFO_DATA& devInfoData, DWORD prop) {
    DWORD dataType = 0;
    DWORD needed = 0;
    SetupDiGetDeviceRegistryPropertyW(hDevInfo, &devInfoData, prop, &dataType, nullptr, 0, &needed);
    if (needed == 0) return L"";
    std::vector<BYTE> buf;
    buf.resize((size_t)needed + 2);
    if (!SetupDiGetDeviceRegistryPropertyW(hDevInfo, &devInfoData, prop, &dataType, buf.data(), (DWORD)buf.size(), &needed)) {
        return L"";
    }
    // Most of these are REG_SZ
    return std::wstring((wchar_t*)buf.data());
}

static std::wstring get_device_instance_id_w(HDEVINFO hDevInfo, SP_DEVINFO_DATA& devInfoData) {
    WCHAR id[4096] = { 0 };
    if (SetupDiGetDeviceInstanceIdW(hDevInfo, &devInfoData, id, (DWORD)(sizeof(id) / sizeof(id[0])), nullptr)) {
        return std::wstring(id);
    }
    return L"";
}

static uint32_t parse_arg_u32(int argc, wchar_t** argv, const wchar_t* name, uint32_t def) {
    for (int i = 1; i < argc; i++) {
        if (_wcsicmp(argv[i], name) == 0 && (i + 1) < argc) {
            wchar_t* end = nullptr;
            unsigned long v = wcstoul(argv[i + 1], &end, 10);
            if (end && *end == 0) return (uint32_t)v;
        }
    }
    return def;
}

struct Device {
    std::string instanceId;
    std::string friendlyName;
    std::string deviceDesc;
    std::string manufacturer;
    uint32_t problemCode = 0;
    uint32_t status = 0;
};

int wmain(int argc, wchar_t** argv) {
    uint32_t maxDevices = parse_arg_u32(argc, argv, L"--max", 250);

    HDEVINFO hDevInfo = SetupDiGetClassDevsW(nullptr, nullptr, nullptr, DIGCF_PRESENT | DIGCF_ALLCLASSES);
    if (hDevInfo == INVALID_HANDLE_VALUE) {
        std::printf("{\"ok\":false,\"error\":\"SetupDiGetClassDevs failed\"}");
        return 2;
    }

    std::vector<Device> devices;
    devices.reserve(512);

    for (DWORD i = 0; ; i++) {
        SP_DEVINFO_DATA devInfoData{};
        devInfoData.cbSize = sizeof(devInfoData);
        if (!SetupDiEnumDeviceInfo(hDevInfo, i, &devInfoData)) {
            break;
        }

        Device d;
        d.instanceId = utf8_from_wide(get_device_instance_id_w(hDevInfo, devInfoData));
        d.friendlyName = utf8_from_wide(get_device_registry_property_w(hDevInfo, devInfoData, SPDRP_FRIENDLYNAME));
        d.deviceDesc = utf8_from_wide(get_device_registry_property_w(hDevInfo, devInfoData, SPDRP_DEVICEDESC));
        d.manufacturer = utf8_from_wide(get_device_registry_property_w(hDevInfo, devInfoData, SPDRP_MFG));

        ULONG status = 0;
        ULONG problem = 0;
        if (CM_Get_DevNode_Status(&status, &problem, devInfoData.DevInst, 0) == CR_SUCCESS) {
            d.status = (uint32_t)status;
            d.problemCode = (uint32_t)problem;
        }

        devices.push_back(std::move(d));
        if (devices.size() >= maxDevices) {
            break;
        }
    }

    SetupDiDestroyDeviceInfoList(hDevInfo);

    // Output JSON
    std::printf("{\"ok\":true,\"max\":%u,\"deviceCount\":%zu,\"devices\":[", maxDevices, devices.size());
    for (size_t i = 0; i < devices.size(); i++) {
        const auto& d = devices[i];
        if (i) std::printf(",");
        std::printf(
            "{\"instanceId\":\"%s\",\"friendlyName\":\"%s\",\"deviceDesc\":\"%s\",\"manufacturer\":\"%s\",\"problemCode\":%u}",
            json_escape(d.instanceId).c_str(),
            json_escape(d.friendlyName).c_str(),
            json_escape(d.deviceDesc).c_str(),
            json_escape(d.manufacturer).c_str(),
            d.problemCode
        );
    }
    std::printf("]}");

    return 0;
}
