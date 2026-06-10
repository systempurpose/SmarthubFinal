using System;
using System.Diagnostics;
using System.Security.Principal;
using System.Windows;

namespace WindowsShell
{
    public partial class App : Application
    {
        private void OnStartup(object sender, StartupEventArgs e)
        {
		try
		{
			// In development (launched from VS/CLI), don't auto-elevate to
			// keep the workflow simple.
			var isDev = Debugger.IsAttached;
			if (isDev)
			{
				return;
			}

			if (IsRunningAsAdministrator())
			{
				return;
			}

			// Relaunch this executable with elevation.
			var exePath = Process.GetCurrentProcess().MainModule?.FileName;
			if (string.IsNullOrEmpty(exePath))
			{
				return;
			}

			var startInfo = new ProcessStartInfo
			{
				FileName = exePath,
				UseShellExecute = true,
				Verb = "runas",
				// Preserve working directory so relative paths still work.
				WorkingDirectory = Environment.CurrentDirectory,
			};

			try
			{
				Process.Start(startInfo);
			}
			catch
			{
				// User may have cancelled the UAC prompt.
			}

			// Shut down the non-elevated instance; elevated one (if created)
			// continues running.
			Shutdown();
		}
		catch
		{
			// If elevation fails for any reason, continue running as-is so
			// diagnostics remain usable.
		}
	}

	private static bool IsRunningAsAdministrator()
	{
		using var identity = WindowsIdentity.GetCurrent();
		var principal = new WindowsPrincipal(identity);
		return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }
}
}
