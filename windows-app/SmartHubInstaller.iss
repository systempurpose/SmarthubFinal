; SmartHub Diagnostics ALPHA Installer
; Inno Setup script to build SmartHub setup.exe
;
; Requirements on the build machine:
; - Inno Setup 6+ installed
; - SmartHub app published to bin\Release\net8.0-windows\win-x64\publish
; - "npm install" and "npm run build" run at repo root so dist/ and node_modules/ exist
; - supabase.local.json present at repo root with your Supabase + Online AI keys
; - UsbEvidenceHelper published to "Bsod tools\bin\UsbEvidenceHelper.exe" (optional at runtime, but required to bundle it)
; - Optional (recommended):
;   - UsbEventLogHelper.exe published to "Bsod tools\bin\UsbEventLogHelper.exe"
;   - UsbPnpSnapshot.exe published to "Bsod tools\bin\UsbPnpSnapshot.exe"
; - Optional (recommended for cloud history deployments):
;   - Supabase schema/templates available under website\database\supabase
; - Notes (USB-only BSOD triage reliability):
;   - Some PCs have broken Windows Portable Devices (WPD) COM support (e.g. 0x80004002 E_NOINTERFACE).
;   - SmartHub treats this as a HOST limitation: it will not emit a phone-state verdict and will guide the technician
;     to reinstall WPD drivers or test on another PC (manual “UI frozen” confirmation is the only override).
; - Repository layout matching this project (html, js, css, dist, node_modules, 3rdpartyApp, bsod-diagnostic, security-tools at repo root)

[Setup]
AppId={{4C9CB0F7-9B1E-4A90-9F0B-3C5E2F5F5E10}
AppName=SmartHub Diagnostics ALPHA
AppVersion=1.0
AppPublisher=SmartHubTeams
AppPublisherURL=https://smarthubteams.local/
AppSupportURL=https://smarthubteams.local/support
AppUpdatesURL=https://smarthubteams.local/updates
LicenseFile="LICENSE.txt"
DefaultDirName={pf}\SmartHubDiagnostics
DefaultGroupName=SmartHub Diagnostics ALPHA
DisableProgramGroupPage=yes
OutputDir=installer-output
OutputBaseFilename=SmartHubSetup
SetupIconFile=logo.ico
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
DisableDirPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; Main published Windows app (WPF shell)
Source: "bin\\Release\\net8.0-windows\\win-x64\\publish\\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

; App icon (used by shortcuts / taskbar)
Source: "logo.ico"; DestDir: "{app}"; Flags: ignoreversion

; Frontend static files (HTML/JS/CSS) used by the embedded WebView
Source: "..\\html\\*"; DestDir: "{app}\\html"; Flags: recursesubdirs createallsubdirs
Source: "..\\js\\*"; DestDir: "{app}\\js"; Flags: recursesubdirs createallsubdirs
Source: "..\\css\\*"; DestDir: "{app}\\css"; Flags: recursesubdirs createallsubdirs
; Local Bootstrap assets for offline use
; Source: "..\\bootstrap\\*"; DestDir: "{app}\\bootstrap"; Flags: recursesubdirs createallsubdirs
Source: "..\\ui.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\\ui.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\\ui.css"; DestDir: "{app}"; Flags: ignoreversion

; Node.js backend: compiled JS and dependencies
; NOTE: run "npm run build" at the repo root before building this
; installer so that dist/server.js includes all routes (including
; AI-assisted no-debug helpers).
;
; Offline install note:
; - The Windows host app can start the backend using a bundled Node runtime.
; - If you want the installer to work on PCs with NO Node installed, place a
;   portable Node.js runtime at: ..\3rdpartyApp\node\node.exe
;   (it will be included automatically via the 3rdpartyApp copy step below).
Source: "..\\dist\\*"; DestDir: "{app}\\backend\\dist"; Flags: recursesubdirs createallsubdirs
Source: "..\\package.json"; DestDir: "{app}\\backend"; Flags: ignoreversion
Source: "..\\node_modules\\*"; DestDir: "{app}\\backend\\node_modules"; Flags: recursesubdirs createallsubdirs

; Runtime cloud configuration (contains Supabase and Online AI credentials).
; IMPORTANT: keep this file private in your build environment and repository.
; It is copied to both app root and backend root so all loaders can resolve it.
Source: "..\\supabase.local.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\\supabase.local.json"; DestDir: "{app}\\backend"; Flags: ignoreversion
Source: "..\\supabase.local.json.example"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Python-based BSOD helper tools
Source: "..\\bsod-diagnostic\\*"; DestDir: "{app}\\bsod-diagnostic"; Flags: recursesubdirs createallsubdirs

; BSOD / no-debug documentation bundle (offline technician docs)
Source: "..\\bsodscanhelp\\*"; DestDir: "{app}\\bsodscanhelp"; Flags: recursesubdirs createallsubdirs
Source: "..\\bsodscanhelp.zip"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Internal progress / validation notes (optional)
Source: "..\\bsod_diagnostic_progress_2026-04-11.txt"; DestDir: "{app}\\docs"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\\session.txt"; DestDir: "{app}\\docs"; Flags: ignoreversion skipifsourcedoesntexist

; Supabase schema/templates (optional deployment/reference assets)
Source: "..\\website\\database\\supabase\\*"; DestDir: "{app}\\website\\database\\supabase"; Flags: recursesubdirs createallsubdirs skipifsourcedoesntexist

; Offline AI-assisted no-debug helper (local-only)
; Note: do NOT ship technician-local memory.sqlite or sample artifacts.
Source: "..\\AI support\\ai_diagnose.py"; DestDir: "{app}\\AI support"; Flags: ignoreversion
Source: "..\\AI support\\ai_adb_conclude.py"; DestDir: "{app}\\AI support"; Flags: ignoreversion
Source: "..\\AI support\\README.md"; DestDir: "{app}\\AI support"; Flags: ignoreversion

; Technician/dev validation helper for offline AI verdict/confidence alignment
; (Fetches /connection-check and runs ai_diagnose.py locally)
Source: "..\\tools\\validate_offline_ai.py"; DestDir: "{app}\\tools"; Flags: ignoreversion

; APK security scan tools (Python scripts)
Source: "..\\security-tools\\*"; DestDir: "{app}\\security-tools"; Flags: recursesubdirs createallsubdirs

; Third-party tool installers / archives (Android SDK, JDK, Python, etc.)
Source: "..\\3rdpartyApp\\*"; DestDir: "{app}\\3rdpartyApp"; Flags: recursesubdirs createallsubdirs

; Android USB/OEM driver installers (Windows)
; NOTE: ensure you have redistribution rights for each OEM package before shipping.
Source: "..\\OEMdrivers\\*"; DestDir: "{app}\\OEMdrivers"; Flags: recursesubdirs createallsubdirs

; Optional native USB evidence helper (Windows)
; If present, the backend will auto-run it from "{app}\Bsod tools\bin\UsbEvidenceHelper.exe".
Source: "..\\Bsod tools\\README.md"; DestDir: "{app}\\Bsod tools"; Flags: ignoreversion
Source: "..\\Bsod tools\\bin\\UsbEvidenceHelper.exe"; DestDir: "{app}\\Bsod tools\\bin"; Flags: ignoreversion

; Additional optional helpers (Windows)
; These are best-effort at runtime and are safe to omit from the installer build.
Source: "..\\Bsod tools\\bin\\UsbEventLogHelper.exe"; DestDir: "{app}\\Bsod tools\\bin"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\\Bsod tools\\bin\\UsbPnpSnapshot.exe"; DestDir: "{app}\\Bsod tools\\bin"; Flags: ignoreversion skipifsourcedoesntexist

[Code]
// Attempt to bootstrap a local Python environment under the SmartHub
// installation so camera-based checks can run without manual setup.
//
// Strategy:
// 1. If a python.exe already exists on the machine (3.10+ preferred),
//    create a virtual env at {app}\.venv and install bsod-diagnostic
//    requirements (opencv-python, numpy).
// 2. If no suitable Python is found but the bundled
//    3rdpartyApp\\python-3.11.9-amd64.exe is present, offer to install it
//    for the current user and then repeat step 1.
//
// The backend will automatically prefer {app}\.venv via appInstallRoot,
// and the SMART_HUB_PYTHON_EXE registry hint remains a generic "python"
// override that users can customize if needed.

var
	PythonSetupLog: string;
	PythonSetupOk: Boolean;
	PythonSetupTried: Boolean;
	DriverSetupLog: string;
	DriverSetupTried: Boolean;
	DriversPage: TOutputProgressWizardPage;
	DriversOk: Boolean;


function JsonEscape(const S: string): string;
var
	i: Integer;
	Ch: Char;
begin
	Result := '';
	for i := 1 to Length(S) do
	begin
		Ch := S[i];
		// Avoid case labels starting with "#" at the beginning of a line,
		// because the Inno Setup preprocessor can misinterpret them.
		case Ord(Ch) of
			92: Result := Result + '\\\\'; // \\ 
			34: Result := Result + '\\"';   // "
			13: Result := Result + '\\r';
			10: Result := Result + '\\n';
			9: Result := Result + '\\t';
		else
			Result := Result + Ch;
		end;
	end;
end;

procedure InitPythonSetupLog(const AppDir: string);
begin
	PythonSetupLog := AppDir + '\\python-setup.log';
end;

procedure LogLine(const S: string);
begin
	if PythonSetupLog <> '' then
		SaveStringToFile(PythonSetupLog, S + #13#10, True);
end;

procedure InitDriverSetupLog(const AppDir: string);
begin
	DriverSetupLog := AppDir + '\\driver-setup.log';
end;

procedure DriverLogLine(const S: string);
begin
	if DriverSetupLog <> '' then
		SaveStringToFile(DriverSetupLog, S + #13#10, True);
end;

function ExecDriverInstaller(const FilePath, Params, WorkDir: string; const ShowUI: Boolean; var ResultCode: Integer): Boolean;
var
	ShowFlag: Integer;
begin
	if ShowUI then
		ShowFlag := SW_SHOW
	else
		ShowFlag := SW_HIDE;

	DriverLogLine('> ' + FilePath + ' ' + Params);
	Result := Exec(FilePath, Params, WorkDir, ShowFlag, ewWaitUntilTerminated, ResultCode);
	DriverLogLine('  ExitCode=' + IntToStr(ResultCode) + ' Started=' + IntToStr(Ord(Result)));
end;

procedure RunDriverStep(const AppDir, DriverDir, Title, FileName, Params: string; const IsMsi, ShowUI: Boolean; const TotalSteps: Integer; var Step: Integer);
var
	Path: string;
	Cmd: string;
	ResultCode: Integer;
	Ok: Boolean;
begin
	Path := DriverDir + '\\' + FileName;

	if not FileExists(Path) then
	begin
		DriverLogLine('SKIP (missing): ' + Path);
		exit;
	end;

	if DriversPage <> nil then
		DriversPage.SetText('Installing Android USB drivers', Title);

	ResultCode := 0;
	if IsMsi then
	begin
		// MSI must be run via msiexec.
		Cmd := '/i "' + Path + '" /qn /norestart';
		Ok := ExecDriverInstaller(ExpandConstant('{sys}\\msiexec.exe'), Cmd, AppDir, False, ResultCode);
	end
	else
	begin
		// Most OEM installers are interactive. Keep UI visible so users can follow prompts.
		Ok := ExecDriverInstaller(Path, Params, AppDir, ShowUI, ResultCode);
	end;

	Step := Step + 1;
	if DriversPage <> nil then
		DriversPage.SetProgress(Step, TotalSteps);

	if (not Ok) or (ResultCode <> 0) then
		DriversOk := False;
end;

procedure InstallBundledAndroidDrivers(const AppDir: string);
var
	DriverDir: string;
	TotalSteps: Integer;
	Step: Integer;
	ShowUI: Boolean;

begin
	DriverSetupTried := True;
	DriversOk := True;
	DriverDir := AppDir + '\\OEMdrivers';
	InitDriverSetupLog(AppDir);
	DriverLogLine('=== SmartHub Android driver install ===');
	DriverLogLine('DriverDir=' + DriverDir);

	if not DirExists(DriverDir) then
	begin
		DriverLogLine('SKIP: OEMdrivers folder not found in install.');
		exit;
	end;

	// Count visible installer steps we intend to run (fixed list).
	TotalSteps := 7;
	Step := 0;
	ShowUI := True;

	if DriversPage <> nil then
	begin
		DriversPage.SetText('Installing Android USB drivers', 'Please wait. Some installers may show prompts.');
		DriversPage.SetProgress(0, TotalSteps);
		DriversPage.Show;
	end;

	// 1) Generic ADB driver (MSI) — silent
	RunDriverStep(AppDir, DriverDir, 'ADB driver (Universal ADB)', 'UniversalAdbDriverSetup.msi', '', True, ShowUI, TotalSteps, Step);

	// 2–6) OEM drivers (typically interactive)
	RunDriverStep(AppDir, DriverDir, 'Samsung USB driver', 'SAMSUNG_USB_Driver_for_Mobile_Phones_v1.9.0.0.exe', '', False, ShowUI, TotalSteps, Step);
	RunDriverStep(AppDir, DriverDir, 'Huawei USB driver', 'HUAWEIDriverTools_setup.exe', '', False, ShowUI, TotalSteps, Step);
	RunDriverStep(AppDir, DriverDir, 'LG USB driver', 'LG Mobile Driver v4.8.0.exe', '', False, ShowUI, TotalSteps, Step);
	RunDriverStep(AppDir, DriverDir, 'HTC USB driver', 'HTC Mobile Driver v4.17.0.001.exe', '', False, ShowUI, TotalSteps, Step);
	RunDriverStep(AppDir, DriverDir, 'MediaTek (MTK) driver', 'MTK Driver Setup.exe', '', False, ShowUI, TotalSteps, Step);

	// 7) Optional LG identifier tool
	RunDriverStep(AppDir, DriverDir, 'LG driver identifier (optional)', 'lgdriveridentifier_setup.exe', '', False, ShowUI, TotalSteps, Step);

	if DriversPage <> nil then
		DriversPage.Hide;
end;

function Q(const S: string): string;
begin
	Result := '"' + S + '"';
end;

function ExecCmdLog(const WorkDir, CmdLine: string; var ResultCode: Integer): Boolean;
var
	Wrapped: string;
begin
	// Run under cmd.exe so we can use output redirection.
	// Note: redirection only works when interpreted by cmd.
	Wrapped := '/C ' + CmdLine + ' >> ' + Q(PythonSetupLog) + ' 2>&1';
	LogLine('> ' + CmdLine);
	Result := Exec(ExpandConstant('{cmd}'), Wrapped, WorkDir, SW_HIDE, ewWaitUntilTerminated, ResultCode);
	LogLine('  ExitCode=' + IntToStr(ResultCode) + ' Started=' + IntToStr(Ord(Result)));
end;

function GetFirstExistingFile(const Candidates: TArrayOfString): string;
var
	i: Integer;
	PathItem: string;
begin
	Result := '';
	i := 0;
	while (Result = '') and (GetArrayLength(Candidates) > i) do
	begin
		PathItem := Candidates[i];
		if FileExists(PathItem) then
			Result := PathItem;
		i := i + 1;
	end;
end;

function FindSystemPython(): string;
var
	Candidate: string;
begin
	// Common per-user install locations for Python 3.x.
	// We first look under LocalAppData (where the bundled installer
	// typically places per-user Python), then fall back to AppData.
	Result := '';

	Candidate := ExpandConstant('{localappdata}\\Programs\\Python');
	if DirExists(Candidate) then
	begin
		if FileExists(Candidate + '\\Python311\\python.exe') then
			Result := Candidate + '\\Python311\\python.exe'
		else if FileExists(Candidate + '\\Python310\\python.exe') then
			Result := Candidate + '\\Python310\\python.exe'
		else if FileExists(Candidate + '\\Python312\\python.exe') then
			Result := Candidate + '\\Python312\\python.exe';
	end;

	if Result = '' then
	begin
		Candidate := ExpandConstant('{userappdata}\\Programs\\Python');
		if DirExists(Candidate) then
		begin
			if FileExists(Candidate + '\\Python311\\python.exe') then
				Result := Candidate + '\\Python311\\python.exe'
			else if FileExists(Candidate + '\\Python310\\python.exe') then
				Result := Candidate + '\\Python310\\python.exe'
			else if FileExists(Candidate + '\\Python312\\python.exe') then
				Result := Candidate + '\\Python312\\python.exe';
		end;
	end;
end;

function VerifyPythonDeps(const VenvPython, AppDir: string): Boolean;
var
	ResultCode: Integer;
	Cmd: string;
begin
	Result := False;
	if (VenvPython = '') or (not FileExists(VenvPython)) then
		exit;

	Cmd := Q(VenvPython) + ' -c "import cv2, numpy; print(''ok'')"';
	if ExecCmdLog(AppDir, Cmd, ResultCode) and (ResultCode = 0) then
		Result := True;
end;

function InstallPythonDepsIntoVenv(const VenvPython, AppDir: string): Boolean;
var
	ResultCode: Integer;
	WheelDir: string;
	Cmd: string;
begin
	Result := False;
	if (VenvPython = '') or (not FileExists(VenvPython)) then
		exit;

	WheelDir := AppDir + '\\3rdpartyApp\\python-wheels';
	if DirExists(WheelDir) then
	begin
		LogLine('Using offline wheels from: ' + WheelDir);
		Cmd := Q(VenvPython) + ' -m pip install --disable-pip-version-check --no-cache-dir --no-index --find-links ' + Q(WheelDir) + ' --only-binary=:all: opencv-python numpy';
	end
	else
	begin
		LogLine('Using online pip install (no wheel cache found).');
		Cmd := Q(VenvPython) + ' -m pip install --disable-pip-version-check --no-cache-dir opencv-python numpy';
	end;

	if (not ExecCmdLog(AppDir, Cmd, ResultCode)) or (ResultCode <> 0) then
		exit;

	Result := VerifyPythonDeps(VenvPython, AppDir);
end;

function CreateVenvAndInstallDeps(const PythonExe, AppDir: string): Boolean;
var
	ResultCode: Integer;
	Cmd: string;
	TmpVenvDir: string;
	TmpVenvPython: string;
begin
	Result := False;

	if PythonExe = '' then
		exit;

	TmpVenvDir := AppDir + '\\._venv_tmp';
	TmpVenvPython := TmpVenvDir + '\\Scripts\\python.exe';

	// Create venv under the app directory.
	Cmd := Q(PythonExe) + ' -m venv ' + Q(TmpVenvDir);
	if (not ExecCmdLog(AppDir, Cmd, ResultCode)) or (ResultCode <> 0) then
		exit;

	// Install required packages into the venv.
	if not InstallPythonDepsIntoVenv(TmpVenvPython, AppDir) then
	begin
		LogLine('Dependency installation failed; removing temporary venv.');
		DelTree(TmpVenvDir, True, True, True);
		exit;
	end;

	// Replace any existing .venv (a broken venv would be preferred by SmartHub).
	if DirExists(AppDir + '\\.venv') then
	begin
		LogLine('Removing existing .venv before finalizing.');
		DelTree(AppDir + '\\.venv', True, True, True);
	end;

	if RenameFile(TmpVenvDir, AppDir + '\\.venv') then
	begin
		LogLine('Created ' + (AppDir + '\\.venv') + ' successfully.');
		Result := True;
	end
	else
	begin
		LogLine('Failed to rename temporary venv to .venv.');
		DelTree(TmpVenvDir, True, True, True);
	end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
	AppDir: string;
	PythonExe: string;
	BundledInstaller: string;
	ResultCode: Integer;
	ExistingVenvPython: string;
begin
	if CurStep <> ssPostInstall then
		exit;

	AppDir := ExpandConstant('{app}');
	InitPythonSetupLog(AppDir);
	PythonSetupTried := True;
	PythonSetupOk := False;
	LogLine('=== SmartHub Python bootstrap ===');
	LogLine('AppDir=' + AppDir);

	// If a venv already exists from a previous install, verify it. If broken,
	// delete and rebuild (SmartHub always prefers {app}\.venv when present).
	ExistingVenvPython := AppDir + '\\.venv\\Scripts\\python.exe';
	if DirExists(AppDir + '\\.venv') and FileExists(ExistingVenvPython) then
	begin
		if VerifyPythonDeps(ExistingVenvPython, AppDir) then
		begin
			PythonSetupOk := True;
		end
		else
		begin
			LogLine('Existing .venv is missing deps; rebuilding.');
			DelTree(AppDir + '\\.venv', True, True, True);
		end;
	end;

	if not PythonSetupOk then
	begin
		// Try to find an existing system Python first.
		PythonExe := FindSystemPython();

		if (PythonExe <> '') and CreateVenvAndInstallDeps(PythonExe, AppDir) then
			PythonSetupOk := True
		else
		begin
			// If no suitable system Python was found, fall back to the bundled
			// offline installer, if present.
			BundledInstaller := AppDir + '\\3rdpartyApp\\python-3.11.9-amd64.exe';
			if FileExists(BundledInstaller) then
			begin
				if Exec(BundledInstaller, '/quiet InstallAllUsers=0 PrependPath=0 Include_test=0', '', SW_HIDE,
										ewWaitUntilTerminated, ResultCode) then
				begin
					LogLine('Bundled Python installer ExitCode=' + IntToStr(ResultCode));
					PythonExe := FindSystemPython();
					if CreateVenvAndInstallDeps(PythonExe, AppDir) then
						PythonSetupOk := True;
				end;
			end;
		end;
	end;

	// Driver installation (shows a loading/progress screen).
	// Installer remains local/offline; online AI and Supabase configuration are managed at runtime.
	InstallBundledAndroidDrivers(AppDir);
end;

procedure InitializeWizard();
begin
	DriversPage := CreateOutputProgressPage('Installing Android USB drivers', 'Please wait while driver installers run.');
end;

[Icons]
; Start Menu shortcut
Name: "{group}\\SmartHub Diagnostics ALPHA"; Filename: "{app}\\SmartHub.exe"; WorkingDir: "{app}"; IconFilename: "{app}\\logo.ico"
; Optional desktop shortcut
Name: "{commondesktop}\\SmartHub Diagnostics ALPHA"; Filename: "{app}\\SmartHub.exe"; WorkingDir: "{app}"; IconFilename: "{app}\\logo.ico"; Tasks: desktopicon

[Registry]
; Environment variables to let other tools find the install folder and helper scripts
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "SMARTHUB_HOME"; ValueData: "{app}"; Flags: preservestringtype uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "SMARTHUB_SECURITY_TOOLS"; ValueData: "{app}\\security-tools"; Flags: preservestringtype uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "SMARTHUB_BSOD_TOOLS"; ValueData: "{app}\\bsod-diagnostic"; Flags: preservestringtype uninsdeletevalue
; Technicians can optionally define SMART_HUB_PYTHON_EXE themselves to force a
; specific interpreter. By default, the backend will prefer the bundled
; {app}\.venv created during installation.

[UninstallDelete]
; Remove per-user app data created by the backend (history, configs, etc.)
Type: filesandordirs; Name: "{userappdata}\SmartHubDiagnostics"
Type: filesandordirs; Name: "{localappdata}\SmartHubDiagnostics"

[Run]
; Optionally launch the app after install. Run as the original
; (non-elevated) user so the diagnostics UI sees the normal
; desktop environment.
Filename: "{app}\\SmartHub.exe"; Description: "Launch SmartHub Diagnostics ALPHA"; Flags: postinstall skipifsilent runasoriginaluser
