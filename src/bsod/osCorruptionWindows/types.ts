export type OsCorruptionSignalId =
  | 'adb_unexplained_reboot'
  | 'adb_kernel_panic_pstore'
  | 'adb_recovery_last_log'
  | 'adb_logcat_panic_keywords'
  | 'adb_dmesg_panic_keywords'
  | 'bootloop_suspected'
  | 'fastboot_unlocked';

export type OsCorruptionSeverity = 'info' | 'warning' | 'critical';

export type OsCorruptionSignal = {
  id: OsCorruptionSignalId;
  title: string;
  points: number;
  severity: OsCorruptionSeverity;
  evidence?: string[];
};

export type OsCorruptionConfidence = 'low' | 'medium' | 'high';

export type BsodOsCorruptionWindowsUsbReport = {
  ok: boolean;
  skipped?: boolean;
  error?: string;

  startedAt: string;
  durationMs: number;

  adbDeviceId?: string;
  fastbootDeviceId?: string;

  score0to100?: number;
  confidence?: OsCorruptionConfidence;
  summary?: string;

  signals?: OsCorruptionSignal[];

  raw?: {
    uptimeSec?: number;
    previousUptimeSec?: number;
    suspiciousReboot?: boolean;
    rebootEventsLast5Min?: number;
    bootloopSuspected?: boolean;

    kernelPanicFound?: boolean;
    recoveryCrashReasonFound?: boolean;
    logcatKeywordFound?: boolean;
    dmesgKeywordFound?: boolean;

    bootloaderUnlocked?: boolean;
    fastbootVarsSample?: string[];
  };
};
