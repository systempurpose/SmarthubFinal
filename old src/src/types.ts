export type StageSummary = { ok: boolean; label: string; details?: string };

export type BatteryStageDetails = {
  name?: string;
  level?: number;
  temperatureC?: number;
  health?: string;
  capacityMah?: number;
  cycleCount?: number;
  chargingEfficiency?: string;
  present?: boolean;
  voltageMv?: number;
  currentNowRaw?: number;
  status?: string;
  isCharging?: boolean;
  connectionSuspected?: boolean;
  powerLogSuspected?: boolean;
  powerLogScore?: number;
  powerLogHints?: string[];
};

export type DisplayStageDetails = {
  width?: number;
  height?: number;
  diagonalInches?: number;
  areaCm2?: number;
  issueReason?: string;
};

export type TouchStageDetails = {
  hasTouchDriverErrors?: boolean;
  hasInputAnomalies?: boolean;
  isChargingDuringLogs?: boolean;
};

export type SensorsStageDetails = {
  sensorCount?: number;
  hasAccelerometer?: boolean;
  hasGyroscope?: boolean;
  hasBarometer?: boolean;
  hasMagnetometer?: boolean;
  hasProximitySensor?: boolean;
};

export type CameraStageDetails = {
  descriptorCount?: number;
};

export type ConnectivityStageDetails = {
  hasWifi?: boolean;
  hasBluetooth?: boolean;
  hasNfc?: boolean;
  hasGps?: boolean;
  hasMobile?: boolean;
};

export type HardwareStageDetails = {
  hasFingerprint?: boolean;
  hasNfc?: boolean;
  hasAccelerometer?: boolean;
  hasGyroscope?: boolean;
  hasMicrophone?: boolean;
  hasSpeaker?: boolean;
  hasProximitySensor?: boolean;
};

export type SystemStageDetails = {
  hasStorageIssue?: boolean;
  hasCrashIssue?: boolean;
  memTotalKb?: number;
};

export type OsStageDetails = {
  hasFsError?: boolean;
  hasVerityIssue?: boolean;
  hasCoreServiceCrashes?: boolean;
  androidVersion?: string;
  buildFingerprint?: string;
  isCustomBuild?: boolean;
  verifiedBootState?: string;
  bootloaderLocked?: boolean;
  bootReason?: string;
  shutdownCategory?: string;
  shutdownSummary?: string;
  shutdownEvidence?: string[];
};

export type DiagDetails = {
  battery?: BatteryStageDetails;
  display?: DisplayStageDetails;
  touch?: TouchStageDetails;
  sensors?: SensorsStageDetails;
  camera?: CameraStageDetails;
  connectivity?: ConnectivityStageDetails;
  hardware?: HardwareStageDetails;
  system?: SystemStageDetails;
  os?: OsStageDetails;
};

export type SavedRun = {
  id: number;
  deviceId: string;
  deviceLabel?: string;
  timestamp: number;
  counts?: { high?: number; medium?: number; low?: number };
  diagStages?: Record<string, StageSummary>;
  diagDetails?: DiagDetails;
  textReport?: string;
  screenTestImage?: string;
};

export type HistoryMap = Record<string, SavedRun[]>;
