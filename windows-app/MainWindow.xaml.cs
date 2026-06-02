using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using System.Windows;

namespace WindowsShell;

public partial class MainWindow : Window
{
    private Process? _backendProcess;
    private string? _root;
    private bool _isDevMode;
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMilliseconds(1500)
    };

    public MainWindow()
    {
        InitializeComponent();
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        Loaded += OnLoaded;
        Closed += OnClosed;
    }

    private void OnMinimizeClick(object? sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void OnMaximizeClick(object? sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }

    private void OnCloseClick(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void OnLoaded(object? sender, RoutedEventArgs e)
    {
        try
        {
            // Try to detect a development checkout first (repo root with
            // package.json); otherwise fall back to the installed directory.
            var repoRoot = FindRepoRoot();
            _isDevMode = repoRoot is not null;
            _root = repoRoot ?? AppContext.BaseDirectory;

            if (!await EnsureBackendRunningAsync(showUiError: true, forceReset: true))
            {
                return;
            }

            // Prefer html/ui.html, but fall back to a legacy ui.html at root.
            var htmlPath = Path.Combine(_root, "html", "ui.html");
            var legacyPath = Path.Combine(_root, "ui.html");
            string uiPath;
            if (File.Exists(htmlPath))
            {
                uiPath = htmlPath;
            }
            else if (File.Exists(legacyPath))
            {
                uiPath = legacyPath;
            }
            else
            {
                MessageBox.Show(
                    "Could not find ui.html in either 'html/ui.html' or the application folder.",
                    "SmartHub Diagnostics ALPHA",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return;
            }

            // Initialize WebView2 with a small retry loop to work around
            // transient "resource in use" (0x800700AA) errors seen on some
            // systems immediately after installation.
            await InitializeWebViewAsync(uiPath);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to start SmartHub backend or UI: {ex.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private async Task<bool> EnsureBackendRunningAsync(bool showUiError, bool forceReset)
    {
        if (_root is null)
        {
            return false;
        }

        try
        {
            if (forceReset)
            {
                await StopExistingBackendAsync();
            }

            if (_backendProcess is { HasExited: false })
            {
                if (await IsBackendHealthyAsync())
                {
                    // For non-reset calls, reuse the existing process.
                    return true;
                }
            }

            try
            {
                if (_backendProcess is not null)
                {
                    _backendProcess.Dispose();
                }
            }
            catch
            {
                // ignore
            }

            _backendProcess = null;

            var started = StartBackendIfNeeded(out var logPath, out var startError);
            if (!started)
            {
                if (showUiError)
                {
                    Dispatcher.Invoke(() =>
                    {
                        try
                        {
                            MessageBox.Show(
                                this,
                                startError ?? "Failed to start SmartHub backend service.",
                                "SmartHub Diagnostics ALPHA",
                                MessageBoxButton.OK,
                                MessageBoxImage.Error);
                        }
                        catch
                        {
                            // ignore
                        }
                    });
                }
                return false;
            }

            var ready = await WaitForBackendReadyAsync(_backendProcess, logPath);
            if (!ready && showUiError)
            {
                var extra = string.IsNullOrWhiteSpace(logPath)
                    ? string.Empty
                    : $"\n\nLog: {logPath}";
                Dispatcher.Invoke(() =>
                {
                    try
                    {
                        MessageBox.Show(
                            this,
                            "Backend did not become reachable on http://127.0.0.1:3333.\n" +
                            "Close other SmartHub instances (port 3333), then reopen SmartHub." +
                            extra,
                            "SmartHub Diagnostics ALPHA",
                            MessageBoxButton.OK,
                            MessageBoxImage.Warning);
                    }
                    catch
                    {
                        // ignore
                    }
                });
            }

            return ready;
        }
        catch
        {
            return false;
        }
    }

    private async Task InitializeWebViewAsync(string uiPath)
    {
        const uint ResourceInUse = 0x800700AA;

        // Base folder under which lightweight, per-attempt WebView2 profiles
        // are created. Using unique profiles avoids "resource in use" issues
        // caused by a locked or corrupted user data folder.
        var baseRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SmartHubDiagnostics",
            "WebView2");
        Directory.CreateDirectory(baseRoot);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            // Use a unique profile per attempt to sidestep any existing lock.
            var profileRoot = Path.Combine(baseRoot, $"profile_{attempt}");
            Directory.CreateDirectory(profileRoot);

            try
            {
                var env = await CoreWebView2Environment.CreateAsync(userDataFolder: profileRoot);
                await WebView.EnsureCoreWebView2Async(env);
                WebView.CoreWebView2.WebMessageReceived += CoreWebView2OnWebMessageReceived;
                WebView.NavigationCompleted += (_, __) =>
                {
                    try
                    {
                        WebView.Focus();
                    }
                    catch
                    {
                        // ignore
                    }
                };
                WebView.Source = new Uri(uiPath);
                try
                {
                    WebView.Focus();
                }
                catch
                {
                    // ignore
                }
                return;
            }
            catch (COMException ex) when ((uint)ex.HResult == ResourceInUse && attempt < 2)
            {
                // Give the WebView2 runtime a brief moment to settle, then
                // retry with a fresh profile folder.
                await Task.Delay(750);
            }
        }

        // Final attempt without swallowing exceptions so the outer handler
        // can surface a clear error dialog.
        var finalProfile = Path.Combine(baseRoot, "profile_final");
        Directory.CreateDirectory(finalProfile);
        var finalEnv = await CoreWebView2Environment.CreateAsync(userDataFolder: finalProfile);
        await WebView.EnsureCoreWebView2Async(finalEnv);
        WebView.CoreWebView2.WebMessageReceived += CoreWebView2OnWebMessageReceived;
        WebView.NavigationCompleted += (_, __) =>
        {
            try
            {
                WebView.Focus();
            }
            catch
            {
                // ignore
            }
        };
        WebView.Source = new Uri(uiPath);
        try
        {
            WebView.Focus();
        }
        catch
        {
            // ignore
        }
    }

    private void CoreWebView2OnWebMessageReceived(
        object? sender,
        Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.WebMessageAsJson;
            if (string.IsNullOrWhiteSpace(json))
            {
                return;
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeProp))
            {
                return;
            }

            var type = typeProp.GetString();
            if (string.Equals(type, "ensureBackend", StringComparison.Ordinal))
            {
                // Best-effort attempt to (re)start the backend service if the
                // web content reports that localhost:3333 is unreachable.
                _ = EnsureBackendRunningAsync(showUiError: false);
                return;
            }

            if (!string.Equals(type, "diagnosticCompleted", StringComparison.Ordinal))
            {
                return;
            }

            bool hasAttention = false;
            if (root.TryGetProperty("diagStages", out var stagesProp) &&
                stagesProp.ValueKind == JsonValueKind.Object)
            {
                foreach (var stage in stagesProp.EnumerateObject())
                {
                    var value = stage.Value;
                    if (value.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    if (value.TryGetProperty("ok", out var okProp) &&
                        okProp.ValueKind == JsonValueKind.False)
                    {
                        hasAttention = true;
                        break;
                    }
                }
            }

            var title = hasAttention
                ? "Diagnostic completed - attention needed"
                : "Diagnostic completed";

            var message = hasAttention
                ? "One or more checks require attention. Open the diagnostic summary for reasons and suggested fixes."
                : "All diagnostic checks reported OK.";

            Dispatcher.Invoke(() =>
            {
                try
                {
                    Activate();
                    MessageBox.Show(
                        this,
                        message,
                        title,
                        MessageBoxButton.OK,
                        hasAttention ? MessageBoxImage.Warning : MessageBoxImage.Information);
                }
                catch
                {
                    // ignore UI notification failures
                }
            });
        }
        catch
        {
            // Swallow malformed messages; host notification is best-effort only.
        }
    }

    private Task<bool> EnsureBackendRunningAsync(bool showUiError)
        => EnsureBackendRunningAsync(showUiError, forceReset: false);

    private sealed class BackendProcessInfo
    {
        public int pid { get; set; }
        public long startedAt { get; set; }
    }

    private static string? TryGetBackendInfoPath()
    {
        try
        {
            var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (!string.IsNullOrWhiteSpace(roaming))
            {
                var p = Path.Combine(roaming, "SmartHubDiagnostics", "backend-process.json");
                if (File.Exists(p)) return p;
            }
        }
        catch
        {
            // ignore
        }

        try
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrWhiteSpace(local))
            {
                var p = Path.Combine(local, "SmartHubDiagnostics", "backend-process.json");
                if (File.Exists(p)) return p;
            }
        }
        catch
        {
            // ignore
        }

        return null;
    }

    private async Task StopExistingBackendAsync()
    {
        // 1) Ask any currently running backend on 3333 to shut down.
        try
        {
            using var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            await Http.PostAsync("http://127.0.0.1:3333/shutdown", content);
        }
        catch
        {
            // ignore
        }

        // 2) Kill the process we started (current instance).
        try
        {
            if (_backendProcess is { HasExited: false })
            {
                _backendProcess.Kill(true);
            }
        }
        catch
        {
            // ignore
        }

        try
        {
            if (_backendProcess is not null)
            {
                _backendProcess.Dispose();
            }
        }
        catch
        {
            // ignore
        }

        _backendProcess = null;

        // 3) If a stale backend-process.json exists (crash/old instance),
        // attempt to kill that PID if it still matches the recorded start time.
        var infoPath = TryGetBackendInfoPath();
        if (string.IsNullOrWhiteSpace(infoPath))
        {
            return;
        }

        BackendProcessInfo? info = null;
        try
        {
            var raw = await File.ReadAllTextAsync(infoPath);
            info = JsonSerializer.Deserialize<BackendProcessInfo>(raw);
        }
        catch
        {
            info = null;
        }

        if (info is null || info.pid <= 0 || info.startedAt <= 0)
        {
            try { File.Delete(infoPath); } catch { }
            return;
        }

        try
        {
            var p = Process.GetProcessById(info.pid);
            var startedUtc = p.StartTime.ToUniversalTime();
            var startedMs = new DateTimeOffset(startedUtc).ToUnixTimeMilliseconds();
            var delta = Math.Abs(startedMs - info.startedAt);
            // Guard against PID reuse: only kill if start time matches reasonably closely.
            if (delta <= 60_000)
            {
                try
                {
                    p.Kill(true);
                }
                catch
                {
                    // ignore
                }
            }
        }
        catch
        {
            // ignore (process not running or access denied)
        }

        try { File.Delete(infoPath); } catch { }
    }

    private async Task<bool> IsBackendHealthyAsync()
    {
        try
        {
            using var res = await Http.GetAsync("http://127.0.0.1:3333/health");
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> WaitForBackendReadyAsync(Process? proc, string? logPath)
    {
        // Wait up to ~10 seconds for the backend to bind and respond.
        for (var i = 0; i < 40; i++)
        {
            if (proc is null)
            {
                return false;
            }

            try
            {
                if (proc.HasExited)
                {
                    return false;
                }
            }
            catch
            {
                // ignore
            }

            if (await IsBackendHealthyAsync())
            {
                return true;
            }

            await Task.Delay(250);
        }

        return false;
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        try
        {
            // Best-effort: signal the Android diagnostics app to stop and
            // then force-stop it so it doesn't keep running once the
            // desktop companion is closed.
            TryStopMobileDiagnosticsApp();

            try
            {
                // Best-effort reset/stop on close. Run on a background thread to
                // avoid deadlocking the UI thread during shutdown.
                Task.Run(async () => await StopExistingBackendAsync()).Wait(TimeSpan.FromSeconds(2));
            }
            catch
            {
                // ignore
            }
        }
        catch
        {
            // ignore
        }
    }

    private void TryStopMobileDiagnosticsApp()
    {
        try
        {
            var adbPath = FindBundledAdb() ?? "adb";

            // Broadcast a DIAGNOSTICS_STOP intent so the mobile app can
            // perform any graceful shutdown work it wants.
            var stopBroadcast = new ProcessStartInfo
            {
                FileName = adbPath,
                Arguments = "shell am broadcast -a com.smarthub.DIAGNOSTICS_STOP",
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            Process.Start(stopBroadcast)?.Dispose();

            // Also issue a force-stop so the diagnostics app doesn't
            // continue running in the background once the desktop app is
            // closed. Both commands are best-effort and will simply fail
            // quietly if no device is connected.
            var forceStop = new ProcessStartInfo
            {
                FileName = adbPath,
                Arguments = "shell am force-stop com.smarthub.diagnostics",
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            Process.Start(forceStop)?.Dispose();
        }
        catch
        {
            // ignore any ADB failures on shutdown
        }
    }

    private string? FindBundledAdb()
    {
        try
        {
            var baseRoot = _root ?? AppContext.BaseDirectory;
            var exeName = Environment.OSVersion.Platform == PlatformID.Win32NT ? "adb.exe" : "adb";
            var candidate = Path.Combine(baseRoot, "3rdpartyApp", "platform-tools", exeName);
            return File.Exists(candidate) ? candidate : null;
        }
        catch
        {
            return null;
        }
    }

    private bool StartBackendIfNeeded(out string? logPath, out string? error)
    {
        logPath = null;
        error = null;

        if (_root is null)
        {
            error = "SmartHub root path was not initialized.";
            return false;
        }

        ProcessStartInfo startInfo;

        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SmartHubDiagnostics",
            "logs");

        try
        {
            Directory.CreateDirectory(logDir);
            logPath = Path.Combine(logDir, $"backend-{DateTime.UtcNow:yyyyMMdd-HHmmss}.log");
            File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] Starting backend...{Environment.NewLine}");
        }
        catch
        {
            logPath = null;
        }

        if (_isDevMode)
        {
            // Development: run the TypeScript backend via npm in the repo root.
            startInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/C npm run dev",
                WorkingDirectory = _root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            // In development mode, prefer the repo-local Python virtual
            // environment for helper tools like the camera-based screen
            // analysis so that OpenCV/NumPy are available without any
            // extra configuration.
            var devVenvPython = Path.Combine(_root, ".venv", "Scripts", "python.exe");
            var configuredPythonDev = Environment.GetEnvironmentVariable("SMART_HUB_PYTHON_EXE");
            string pythonToUseDev;
            if (File.Exists(devVenvPython))
            {
                pythonToUseDev = devVenvPython;
            }
            else if (!string.IsNullOrWhiteSpace(configuredPythonDev))
            {
                pythonToUseDev = configuredPythonDev;
            }
            else
            {
                pythonToUseDev = "python";
            }

            startInfo.EnvironmentVariables["SMART_HUB_PYTHON_EXE"] = pythonToUseDev;
        }
        else
        {
            // Installed: run the compiled Node.js backend from the packaged
            // backend folder.
            var backendRoot = Path.Combine(_root, "backend");
            var serverJs = Path.Combine(backendRoot, "dist", "server.js");
            if (!File.Exists(serverJs))
            {
                error =
                    "SmartHub backend files were not found under the installation folder.\n" +
                    "Please reinstall SmartHub Diagnostics ALPHA.";
                return false;
            }

            var nodeExe = FindNodeExe(_root);
            if (string.IsNullOrWhiteSpace(nodeExe))
            {
                error =
                    "Could not find Node.js (node.exe) to start the local backend.\n\n" +
                    "Fix options:\n" +
                    "- Install Node.js LTS on this PC, OR\n" +
                    "- Bundle node.exe under the SmartHub install folder (recommended for offline deployments).";
                return false;
            }

            startInfo = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "dist/server.js",
                WorkingDirectory = backendRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            // Ensure the backend can locate the installation root even before
            // the registry-based SMARTHUB_HOME environment variable is picked
            // up.
            startInfo.EnvironmentVariables["SMARTHUB_HOME"] = _root;

            // Hint the backend which Python executable to use for helper
            // tools like the camera-based screen analysis.
            var bundledVenvPython = Path.Combine(_root, ".venv", "Scripts", "python.exe");
            var configuredPython = Environment.GetEnvironmentVariable("SMART_HUB_PYTHON_EXE");
            string pythonToUse;
            if (File.Exists(bundledVenvPython))
            {
                pythonToUse = bundledVenvPython;
            }
            else if (!string.IsNullOrWhiteSpace(configuredPython))
            {
                pythonToUse = configuredPython;
            }
            else
            {
                pythonToUse = "python";
            }

            startInfo.EnvironmentVariables["SMART_HUB_PYTHON_EXE"] = pythonToUse;
        }

        var runtimeConfig = LoadRuntimeConfig(_root);
        if (!string.IsNullOrWhiteSpace(runtimeConfig.SupabaseUrl))
        {
            startInfo.EnvironmentVariables["SMARTHUB_SUPABASE_URL"] = runtimeConfig.SupabaseUrl;
            startInfo.EnvironmentVariables["NEXT_PUBLIC_SUPABASE_URL"] = runtimeConfig.SupabaseUrl;
        }

        if (!string.IsNullOrWhiteSpace(runtimeConfig.SupabaseAnonKey))
        {
            startInfo.EnvironmentVariables["SMARTHUB_SUPABASE_ANON_KEY"] = runtimeConfig.SupabaseAnonKey;
            startInfo.EnvironmentVariables["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = runtimeConfig.SupabaseAnonKey;
        }

        // Provide Online AI values directly to the backend process in installed
        // mode so BSOD diagnostics still work even if local file discovery order
        // changes across environments.
        if (!string.IsNullOrWhiteSpace(runtimeConfig.AiApiUrl))
        {
            startInfo.EnvironmentVariables["SMARTHUB_AI_API_URL"] = runtimeConfig.AiApiUrl;
            startInfo.EnvironmentVariables["SMART_HUB_AI_API_URL"] = runtimeConfig.AiApiUrl;
            startInfo.EnvironmentVariables["SMARTHUB_ONLINE_AI_URL"] = runtimeConfig.AiApiUrl;
            startInfo.EnvironmentVariables["SMART_HUB_ONLINE_AI_URL"] = runtimeConfig.AiApiUrl;
        }

        if (!string.IsNullOrWhiteSpace(runtimeConfig.AiApiKey))
        {
            startInfo.EnvironmentVariables["SMARTHUB_AI_API_KEY"] = runtimeConfig.AiApiKey;
            startInfo.EnvironmentVariables["SMART_HUB_AI_API_KEY"] = runtimeConfig.AiApiKey;
            startInfo.EnvironmentVariables["SMARTHUB_ONLINE_AI_KEY"] = runtimeConfig.AiApiKey;
            startInfo.EnvironmentVariables["SMART_HUB_ONLINE_AI_KEY"] = runtimeConfig.AiApiKey;
        }

        if (!string.IsNullOrWhiteSpace(runtimeConfig.AiModel))
        {
            startInfo.EnvironmentVariables["SMARTHUB_AI_MODEL"] = runtimeConfig.AiModel;
            startInfo.EnvironmentVariables["SMART_HUB_AI_MODEL"] = runtimeConfig.AiModel;
            startInfo.EnvironmentVariables["SMARTHUB_ONLINE_AI_MODEL"] = runtimeConfig.AiModel;
            startInfo.EnvironmentVariables["SMART_HUB_ONLINE_AI_MODEL"] = runtimeConfig.AiModel;
        }

        try
        {
            var proc = new Process
            {
                StartInfo = startInfo,
                EnableRaisingEvents = true
            };

            var logFilePath = logPath;

            object gate = new();
            Action<string> writeLine = line =>
            {
                if (string.IsNullOrWhiteSpace(line)) return;
                if (string.IsNullOrWhiteSpace(logFilePath)) return;
                try
                {
                    lock (gate)
                    {
                        File.AppendAllText(logFilePath, line + Environment.NewLine);
                    }
                }
                catch
                {
                    // ignore log failures
                }
            };

            proc.OutputDataReceived += (_, ev) =>
            {
                if (!string.IsNullOrWhiteSpace(ev.Data))
                {
                    writeLine(ev.Data);
                }
            };

            proc.ErrorDataReceived += (_, ev) =>
            {
                if (!string.IsNullOrWhiteSpace(ev.Data))
                {
                    writeLine("[stderr] " + ev.Data);
                }
            };

            if (!proc.Start())
            {
                error = "Failed to start backend process.";
                return false;
            }

            try
            {
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
            }
            catch
            {
                // ignore
            }

            _backendProcess = proc;
            return true;
        }
        catch (Exception ex)
        {
            error = "Failed to start backend process: " + ex.Message;
            return false;
        }
    }

    private sealed class RuntimeConfig
    {
        public string? SupabaseUrl { get; set; }
        public string? SupabaseAnonKey { get; set; }
        public string? AiApiUrl { get; set; }
        public string? AiApiKey { get; set; }
        public string? AiModel { get; set; }
    }

    private static RuntimeConfig LoadRuntimeConfig(string root)
    {
        try
        {
            var configPath = Path.Combine(root, "supabase.local.json");
            if (!File.Exists(configPath))
            {
                return new RuntimeConfig();
            }

            using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new RuntimeConfig();
            }

            var json = doc.RootElement;

            var supabaseUrl = ReadJsonString(
                json,
                "SMARTHUB_SUPABASE_URL",
                "SMART_HUB_SUPABASE_URL",
                "NEXT_PUBLIC_SUPABASE_URL",
                "url",
                "supabaseUrl");

            var supabaseAnonKey = ReadJsonString(
                json,
                "SMARTHUB_SUPABASE_ANON_KEY",
                "SMART_HUB_SUPABASE_ANON_KEY",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                "anonKey",
                "supabaseAnonKey");

            var aiApiUrl = ReadJsonString(
                json,
                "SMARTHUB_AI_API_URL",
                "SMART_HUB_AI_API_URL",
                "SMARTHUB_ONLINE_AI_URL",
                "SMART_HUB_ONLINE_AI_URL",
                "onlineAiUrl",
                "aiApiUrl");

            var aiApiKey = ReadJsonString(
                json,
                "SMARTHUB_AI_API_KEY",
                "SMART_HUB_AI_API_KEY",
                "SMARTHUB_ONLINE_AI_KEY",
                "SMART_HUB_ONLINE_AI_KEY",
                "onlineAiKey",
                "aiApiKey");

            var aiModel = ReadJsonString(
                json,
                "SMARTHUB_AI_MODEL",
                "SMART_HUB_AI_MODEL",
                "SMARTHUB_ONLINE_AI_MODEL",
                "SMART_HUB_ONLINE_AI_MODEL",
                "onlineAiModel",
                "aiModel");

            return new RuntimeConfig
            {
                SupabaseUrl = string.IsNullOrWhiteSpace(supabaseUrl) ? null : supabaseUrl.Trim(),
                SupabaseAnonKey = string.IsNullOrWhiteSpace(supabaseAnonKey) ? null : supabaseAnonKey.Trim(),
                AiApiUrl = string.IsNullOrWhiteSpace(aiApiUrl) ? null : aiApiUrl.Trim(),
                AiApiKey = string.IsNullOrWhiteSpace(aiApiKey) ? null : aiApiKey.Trim(),
                AiModel = string.IsNullOrWhiteSpace(aiModel) ? null : aiModel.Trim(),
            };
        }
        catch
        {
            return new RuntimeConfig();
        }
    }

    private static string? ReadJsonString(JsonElement json, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (json.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }
        }

        return null;
    }

    private static string? FindNodeExe(string root)
    {
        // Prefer a bundled node.exe (offline deployments).
        var bundledCandidates = new[]
        {
            Path.Combine(root, "3rdpartyApp", "node", "node.exe"),
            Path.Combine(root, "3rdpartyApp", "node.exe"),
            Path.Combine(root, "backend", "node.exe"),
        };

        foreach (var p in bundledCandidates)
        {
            try
            {
                if (File.Exists(p)) return p;
            }
            catch
            {
                // ignore
            }
        }

        // Common system install locations.
        var pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var pfx86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var lad = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        var systemCandidates = new[]
        {
            Path.Combine(pf, "nodejs", "node.exe"),
            Path.Combine(pfx86, "nodejs", "node.exe"),
            Path.Combine(lad, "Programs", "nodejs", "node.exe"),
        };

        foreach (var p in systemCandidates)
        {
            try
            {
                if (File.Exists(p)) return p;
            }
            catch
            {
                // ignore
            }
        }

        // Fall back to PATH resolution.
        return "node";
    }

    private static string? FindRepoRoot()
    {
        // Walk up from the executable directory until we find a folder
        // that contains package.json (the Node backend root).
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 10 && !string.IsNullOrEmpty(dir); i++)
        {
            var candidate = Path.Combine(dir, "package.json");
            if (File.Exists(candidate))
            {
                return dir;
            }

            var parent = Directory.GetParent(dir);
            if (parent == null)
            {
                break;
            }

            dir = parent.FullName;
        }

        return null;
    }
}
