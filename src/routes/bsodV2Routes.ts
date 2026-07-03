// src/routes/bsodV2Routes.ts
import { Router, Request, Response } from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const router = Router();

// ============ CONSTANTS (existing) ============

const HEALTH_ENUM: Record<number, string> = {
    1: 'UNKNOWN',
    2: 'GOOD',
    3: 'OVERHEAT',
    4: 'DEAD',
    5: 'OVER_VOLTAGE',
    6: 'UNSPECIFIED_FAILURE',
    7: 'COLD'
};

const BOOT_REASON_MAP: Record<string, { severity: string; points: number }> = {
    'kernel_panic': { severity: 'critical', points: 30 },
    'watchdog': { severity: 'critical', points: 30 },
    'wdog_bark': { severity: 'critical', points: 30 },
    'tz_error': { severity: 'critical', points: 30 },
    'shutdown_thermal': { severity: 'high', points: 20 },
    'reboot,thermal': { severity: 'high', points: 20 },
    'userrequested': { severity: 'low', points: 0 },
    'reboot,cold': { severity: 'low', points: 0 },
    'power_on': { severity: 'low', points: 0 }
};

const DMESG_PATTERNS = [
    { regex: /watchdog.*(reset|reboot|bark|bite)/i, category: 'watchdog', severity: 'critical', points: 25 },
    { regex: /thermal.*(shutdown|throttl)/i, category: 'thermal', severity: 'high', points: 15 },
    { regex: /(under.?volt|brownout)/i, category: 'undervoltage', severity: 'high', points: 20 },
    // filesystem pattern is now handled exclusively by detectStorageErrors
];

const CATEGORY_TITLES: Record<string, string> = {
    watchdog: 'Watchdog Reset',
    thermal: 'Thermal Event',
    undervoltage: 'Undervoltage Detected'
};

const CRITICAL_PROCESSES = ['system_server', 'com.android.systemui', 'com.android.phone'];

// ============ TYPES ============

interface DetectorResult {
    title: string;
    detected: boolean;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    points?: number;
    evidence?: string;
    confidence?: 'high' | 'medium' | 'low';
    category?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
}

interface Signal {
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    points: number;
    evidence?: string;
    confidence?: string;
}

// Physical checklist input
interface PhysicalCheckInput {
    ledOn: boolean | null;
    vibratesOnHold: boolean | null;
    backlightGlow: boolean | null;
    boardWarm: boolean | null;
    batterySwollen: boolean | null;
}

// BSOD category
type BsodCategory =
    | 'firmware_corruption'
    | 'os_corruption_confirmed'
    | 'os_software_failure'
    | 'hardware_power_failure'
    | 'display_hardware_fault'
    | 'overheating_suspected'
    | 'battery_safety_issue'
    | 'inconclusive';

interface BsodClassification {
    category: BsodCategory;
    label: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
    signals: Signal[];
}

// ============ HELPERS (existing) ============

function validateDeviceId(deviceId: string): boolean {
    return /^[\w.\-:]+$/.test(deviceId);
}

async function runAdb(deviceId: string, command: string, timeoutMs = 15000): Promise<string> {
    if (!validateDeviceId(deviceId)) {
        throw new Error('Invalid device ID');
    }
    const { stdout, stderr } = await execFileAsync(
        'adb',
        ['-s', deviceId, 'shell', command],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
    );
    if (stderr && !stderr.includes('WARNING')) {
        throw new Error(stderr);
    }
    return stdout || '';
}

async function runAdbWithTimeout(deviceId: string, command: string, timeoutMs = 3000): Promise<string> {
    return runAdb(deviceId, command, timeoutMs);
}

function parseDmesgOutput(output: string): Array<{ category: string; severity: string; points: number; matchedLine: string }> {
    const results: Array<{ category: string; severity: string; points: number; matchedLine: string }> = [];
    const lines = output.split('\n');
    for (const pattern of DMESG_PATTERNS) {
        for (const line of lines) {
            if (pattern.regex.test(line)) {
                results.push({
                    category: pattern.category,
                    severity: pattern.severity,
                    points: pattern.points,
                    matchedLine: line.trim()
                });
                break;
            }
        }
    }
    return results;
}

function parseDropbox(raw: string): Array<{ tag: string; process: string; time: string }> {
    const blocks = raw.split(/^-{5,}.*-{5,}$/m);
    const results: Array<{ tag: string; process: string; time: string }> = [];
    for (const block of blocks) {
        const tag = block.match(/Tag: (\S+)/)?.[1] || '';
        const process = block.match(/Process: (\S+)/)?.[1] || '';
        const time = block.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/m)?.[0] || '';
        if (tag) results.push({ tag, process, time });
    }
    return results;
}

function classifyBootReason(raw: string): { matched: string; severity: string; points: number } {
    const normalized = raw.toLowerCase().trim();
    for (const [key, val] of Object.entries(BOOT_REASON_MAP)) {
        if (normalized.includes(key)) return { matched: key, ...val };
    }
    return { matched: 'unknown', severity: 'low', points: 5 };
}

function getDmesgPath(): string[] {
    return [
        '/proc/last_kmsg',
        '/sys/fs/pstore/console-ramoops-0',
        '/sys/fs/pstore/dmesg-ramoops-0'
    ];
}

// ============ DETECTORS (existing) ============
// ... (keep all existing detectors up to detectBootLoop as they are) ...

// For brevity I'm skipping the full copy of all existing detectors here.
// In your actual file, keep the entire existing code for:
// detectKernelPanic, detectWatchdogThermal, detectDropboxCrashes,
// detectRebootReason, detectANRTraces, detectBatteryHealth,
// detectStorageErrors, detectLogcatCrash, detectBootLoop.

// Those are unchanged from the previous version.

// ============ NEW: HARDWARE-ONLY DETECTORS ============

async function detectBootloaderState(): Promise<DetectorResult[]> {
    const signals: DetectorResult[] = [];
    try {
        const { stdout } = await execAsync('fastboot getvar unlocked 2>/dev/null || echo "unavailable"', { timeout: 4000 });
        const unlocked = stdout.includes('yes');
        const locked = stdout.includes('no');
        if (unlocked || locked) {
            signals.push({
                title: 'Bootloader Lock State',
                detected: true,
                severity: 'low',
                points: 5,
                evidence: `Bootloader ${unlocked ? 'unlocked' : 'locked'}`,
                confidence: 'high'
            });
        }
    } catch (_) {}
    try {
        const { stdout } = await execAsync('fastboot getvar current-slot 2>/dev/null || echo "unavailable"', { timeout: 4000 });
        if (stdout.includes('a') || stdout.includes('b')) {
            signals.push({
                title: 'Bootloader Slot',
                detected: true,
                severity: 'low',
                points: 2,
                evidence: `Current slot: ${stdout.trim()}`,
                confidence: 'high'
            });
        }
    } catch (_) {}
    return signals;
}

async function detectSlotFlipLoop(): Promise<DetectorResult> {
    try {
        // We need to sample fastboot current-slot over time
        const samples: string[] = [];
        for (let i = 0; i < 4; i++) {
            const { stdout } = await execAsync('fastboot getvar current-slot 2>/dev/null || echo "unavailable"', { timeout: 3000 });
            samples.push(stdout.trim());
            if (i < 3) await new Promise(r => setTimeout(r, 2000));
        }
        const uniqueSlots = new Set(samples.filter(s => s === 'a' || s === 'b'));
        if (uniqueSlots.size > 1) {
            return {
                title: 'Slot-Flip Boot Loop',
                detected: true,
                severity: 'critical',
                points: 35,
                evidence: `Bootloader switched slots: ${samples.join(' → ')}`,
                confidence: 'high'
            };
        }
        return { title: 'Slot-Flip Boot Loop', detected: false };
    } catch (_) {
        return { title: 'Slot-Flip Boot Loop', detected: false, skipped: true, reason: 'fastboot unavailable' };
    }
}

async function detectUsbChipMode(): Promise<DetectorResult> {
    // On Windows, check PnP; on Linux/Mac, check lsusb or fallback.
    let mode = '';
    try {
        if (process.platform === 'win32') {
            const psCmd = `Get-PnpDevice | Where-Object { $_.Status -ne "Unknown" } | Select-Object -ExpandProperty FriendlyName`;
            const { stdout } = await execAsync(`powershell -Command "${psCmd.replace(/"/g, '\\"')}"`, { timeout: 5000 });
            const usbNames = stdout.split('\n').map(s => s.trim()).filter(s => s);
            if (usbNames.some(n => /QDLoader|9008/.test(n))) mode = 'EDL (Qualcomm 9008)';
            else if (usbNames.some(n => /Preloader|MediaTek.*DA/.test(n))) mode = 'Preloader (MediaTek)';
        } else {
            // Linux: check lsusb for Qualcomm/MediaTek VID/PID
            const { stdout } = await execAsync('lsusb', { timeout: 3000 });
            if (/05c6|Qualcomm/.test(stdout)) mode = 'EDL (Qualcomm 9008)';
            else if (/0e8d|MediaTek/.test(stdout)) mode = 'Preloader (MediaTek)';
        }
    } catch (_) {}
    if (mode) {
        return {
            title: 'Chip Boot Mode',
            detected: true,
            severity: 'critical',
            points: 40,
            evidence: mode,
            confidence: 'high'
        };
    }
    return { title: 'Chip Boot Mode', detected: false };
}

async function detectRecoveryMode(): Promise<DetectorResult> {
    try {
        const { stdout } = await execAsync('adb devices', { timeout: 4000 });
        if (/\brecovery\b/.test(stdout)) {
            return {
                title: 'Recovery Mode Reachable',
                detected: true,
                severity: 'medium',
                points: 10,
                evidence: 'Device responds in recovery mode — boot partition intact, system partition is the likely fault point',
                confidence: 'high'
            };
        }
        if (/\bsideload\b/.test(stdout)) {
            return {
                title: 'Sideload Mode Reachable',
                detected: true,
                severity: 'medium',
                points: 10,
                evidence: 'Device is in ADB sideload mode — recovery is active and awaiting an OTA/update package',
                confidence: 'high'
            };
        }
        return { title: 'Recovery Mode Reachable', detected: false };
    } catch (_) {
        return { title: 'Recovery Mode Reachable', detected: false, skipped: true, reason: 'adb devices failed' };
    }
}

function scorePhysicalChecklist(input: PhysicalCheckInput): DetectorResult[] {
    const results: DetectorResult[] = [];
    if (input.batterySwollen === true) {
        results.push({
            title: 'Battery Swelling',
            detected: true,
            severity: 'critical',
            points: 50,
            evidence: 'Battery shows visible swelling — safety hazard',
            confidence: 'high'
        });
    }
    if (input.ledOn === false) {
        results.push({
            title: 'No Charging LED',
            detected: true,
            severity: 'medium',
            points: 15,
            evidence: 'No charging LED when plugged in',
            confidence: 'medium'
        });
    }
    if (input.vibratesOnHold === false) {
        results.push({
            title: 'No Vibration Response',
            detected: true,
            severity: 'medium',
            points: 15,
            evidence: 'No vibration when holding power button',
            confidence: 'medium'
        });
    }
    if (input.backlightGlow === true) {
        results.push({
            title: 'Backlight Alive, Display Dead',
            detected: true,
            severity: 'high',
            points: 20,
            evidence: 'Backlight glows in dark room but no image',
            confidence: 'medium'
        });
    }
    if (input.boardWarm === true) {
        results.push({
            title: 'Abnormal Board Warmth',
            detected: true,
            severity: 'medium',
            points: 10,
            evidence: 'Board is warm to the touch while idle',
            confidence: 'low'
        });
    }
    return results;
}

// ============ BSOD CLASSIFIER ============

function toSignal(r: DetectorResult): Signal {
    return {
        title: r.title,
        severity: r.severity!,
        points: r.points || 0,
        ...(r.evidence ? { evidence: r.evidence } : {}),
        ...(r.confidence ? { confidence: r.confidence } : {})
    };
}

function classifyBsod(allSignals: DetectorResult[], input: PhysicalCheckInput): BsodClassification {
    const find = (title: string) => allSignals.find(s => s.title === title && s.detected);

    const battery = find('Battery Swelling');
    if (battery) {
        return {
            category: 'battery_safety_issue',
            label: 'Battery Safety Issue',
            explanation: 'Visible battery swelling detected. This is a safety hazard, not a software fault — handle before further diagnosis.',
            confidence: 'high',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    const chipMode = find('Chip Boot Mode');
    if (chipMode && (chipMode.evidence?.includes('EDL') || chipMode.evidence?.includes('Preloader'))) {
        return {
            category: 'firmware_corruption',
            label: 'Firmware/Bootloader Corruption',
            explanation: 'Device dropped to chip-level download mode. The bootloader itself failed to load — deeper than a typical OS crash. Requires brand-specific flash tool (QFIL/SP Flash Tool) with matching firmware.',
            confidence: 'high',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    const slotFlip = find('Slot-Flip Boot Loop');
    if (slotFlip) {
        return {
            category: 'os_corruption_confirmed',
            label: 'OS Corruption (Confirmed)',
            explanation: 'Bootloader auto-switched A/B slots after repeated boot failures — this is Android\'s own mechanism confirming the OS partition is corrupted, not just a one-off crash.',
            confidence: 'high',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    // Check if we have any fastboot or recovery signal
    const fastbootSignal = find('Bootloader Lock State') || find('Bootloader Slot');
    const recoverySignal = find('Recovery Mode Reachable') || find('Sideload Mode Reachable');
    if (fastbootSignal || recoverySignal) {
        return {
            category: 'os_software_failure',
            label: 'Software/OS-Level Failure',
            explanation: 'Bootloader/recovery is reachable and stable (no slot-flip loop), meaning the failure is confined to the OS or system partition. This is consistent with either a corrupted system update or a misbehaving app blocking boot — the two cannot be distinguished without ADB access to the booted OS.',
            confidence: 'medium',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    const displayFault = find('Backlight Alive, Display Dead');
    if (displayFault) {
        return {
            category: 'display_hardware_fault',
            label: 'Display Hardware Fault',
            explanation: 'Board shows power signs (LED/backlight) but produces no image — likely panel, flex cable, or display driver, not a full system failure.',
            confidence: 'medium',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    const noLed = find('No Charging LED');
    const noVibe = find('No Vibration Response');
    if (noLed || noVibe) {
        return {
            category: 'hardware_power_failure',
            label: 'Hardware/Power Failure',
            explanation: 'No charging LED or vibration response — consistent with PMIC failure, blown charging IC, or a dead board. Bench multimeter testing recommended.',
            confidence: 'medium',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    const warm = find('Abnormal Board Warmth');
    if (warm) {
        return {
            category: 'overheating_suspected',
            label: 'Overheating Suspected',
            explanation: 'Board is warm even while unbooted/idle — consistent with a short circuit or thermal event, though not directly measured (no ADB access to confirm via temperature sensor logs).',
            confidence: 'low',
            signals: allSignals.filter(s => s.detected).map(toSignal)
        };
    }

    return {
        category: 'inconclusive',
        label: 'Inconclusive',
        explanation: 'No definitive bootloader or physical signal found. Complete the physical checklist, or attempt ADB reconnection if the screen is visible.',
        confidence: 'low',
        signals: []
    };
}

// ============ NEW ENDPOINT: HARDWARE-ONLY DIAGNOSE ============

router.post('/diagnose-hardware', async (req: Request, res: Response) => {
    const physicalInput: Partial<PhysicalCheckInput> = req.body?.physicalChecklist || {};
    const input: PhysicalCheckInput = {
        ledOn: physicalInput.ledOn ?? null,
        vibratesOnHold: physicalInput.vibratesOnHold ?? null,
        backlightGlow: physicalInput.backlightGlow ?? null,
        boardWarm: physicalInput.boardWarm ?? null,
        batterySwollen: physicalInput.batterySwollen ?? null
    };

    try {
        // Run hardware-only detectors in parallel
        const [bootloaderSignals, slotFlip, chipMode, recoveryMode] = await Promise.all([
            detectBootloaderState(),
            detectSlotFlipLoop(),
            detectUsbChipMode(),
            detectRecoveryMode()
        ]);
        const physicalSignals = scorePhysicalChecklist(input);
        const allResults = [...bootloaderSignals, slotFlip, chipMode, recoveryMode, ...physicalSignals];

        // Filter out undetected or skipped
        const detected = allResults.filter(r => r.detected === true && !r.skipped);
        const skipped = allResults.filter(r => r.skipped === true);

        const classification = classifyBsod(allResults, input);

        // Compute total score from detected signals
        const totalScore = Math.min(detected.reduce((sum, s) => sum + (s.points || 0), 0), 100);

        res.json({
            diagnosis: {
                category: classification.category,
                cause: classification.label,
                explanation: classification.explanation,
                confidence: classification.confidence,
                score: totalScore,
                signals: classification.signals,
                tier: 'hardware-only',
                ...(skipped.length > 0 ? { skippedChecks: skipped.length } : {}),
                note: 'This classification requires no ADB and no booted OS. "Software/OS-Level Failure" cannot be split further into app-caused vs OS-caused without ADB access to a booted device.'
            }
        });
    } catch (error) {
        console.error('[BSOD-Hardware] Error:', error);
        res.status(500).json({
            error: (error as Error).message,
            diagnosis: {
                category: 'inconclusive',
                cause: 'Diagnostic scan failed',
                explanation: 'An error occurred while running hardware diagnostics.',
                confidence: 'low',
                score: 0,
                signals: []
            }
        });
    }
});

// ============ EXISTING ENDPOINTS ============
// (keep your existing /diagnose and /device-state routes unchanged)

// ... (the rest of your file with all existing routes and exports) ...
export default router;