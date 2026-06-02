// SmartHub minimal i18n helper (English / Tagalog)
// Loaded before other UI scripts so they can translate dynamic text.

(function () {
  const STORAGE_KEY = 'smarthub.ui.lang';

  const DICT = {
    en: {
      'app.title': 'Mobile Diagnostics',
      'app.subtitle': 'Run local device checks, capture screenshots, and scan installed apps for risk.',
      'btn.refresh': '↻ Refresh devices',
      'btn.readOnly.title': 'Blocks installs and live device tests',
      'btn.installApp': 'Install mobile app',
      'btn.devGuide': 'How to enable Developer options',
      'toolbar.note':
        'Connected devices are discovered via ADB on this machine. If ADB is not available, the app may still show USB/MTP-only detection (limited mode).',
      'legend.safe': 'Safe',
      'legend.moderate': 'Moderate',
      'legend.risky': 'Risky',
      'label.language': 'Language',
      'label.theme': 'Theme',
      'label.selectedDevice': 'Selected device',
      'option.allDevices': 'All devices',

      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'btn.startDiagnostic': 'Start Diagnostic Now',
      'btn.bsodOnly': 'Diagnose for BSOD only',
      'btn.bsodOnly.title': 'USB-only BSOD/blank-screen helper (no USB debugging required)',
      'footer.privacyLabel': 'Privacy:',
      'footer.privacyText': 'All analysis runs locally against the device connected to this computer. No data is sent to a remote server.',
      'footer.backend': 'Backend: http://127.0.0.1:3333 · ADB must be installed and on PATH.',
      'advice.title': 'Actionable Advice',
      'modal.messageTitle': 'Message',
      'label.readOnly': 'Read-only',
      'state.on': 'On',
      'state.off': 'Off',
      'btn.readOnly.title.forced': 'Read-only mode is enforced by the backend.',
      'btn.readOnly.title.normal': 'Blocks installs and live device tests',

      // Dynamic banners / devices
      'devices.scanning.title': 'Scanning for devices',
      'devices.scanning.body': 'Querying ADB via the local companion service...',
      'devices.none.title': 'No devices detected',
      'devices.none.guidance':
        'Ensure your phone is connected. If you see it in Windows File Explorer but not here, click “↻ Refresh devices”. For full diagnostics, enable USB debugging so <code>adb devices</code> shows it.',
      'devices.noAdb.title': 'No ADB devices detected',
      'devices.noAdb.guidance':
        'Your PC can see the phone over USB/MTP, but it is not visible to ADB yet. This usually means USB debugging is turned off or the RSA trust prompt was never accepted. Use the <strong>Screen not showing?</strong> helper and enable Developer options &amp; USB debugging on the phone, then reconnect and accept the trust prompt.',
      'devices.mtp.adbNotDetected': 'ADB not detected',
      'devices.mtp.detectedTitle': 'Detected via PC (USB / MTP only)',
      'devices.mtp.note':
        'These devices are visible to Windows, but not yet to ADB. Turn on Developer options &amp; USB debugging on the phone so full diagnostics can run.',
      'devices.selectedMissing.title': 'Selected device not detected',
      'devices.selectedMissing.body':
        'The selected device (<code>{id}</code>) is not currently visible to ADB. Choose a different device from the dropdown or reconnect the phone, then refresh.',
      'devices.option.notDetected': '{id} (not detected)',

      // SmartHub AI support UI
      'ai.offline.title': 'SmartHub AI support conclusion',
      'ai.state.working': 'Working…',
      'ai.state.unavailable': 'Unavailable',
      'ai.state.noDevice': 'No device detected',
      'ai.offline.summarizing': 'Summarizing the scan results…',
      'ai.offline.analyzing': 'Analyzing evidence and searching SmartHub AI support memory…',
      'ai.offline.noSignals': 'No Android phone signals were detected from this PC (ADB/Fastboot/MTP).',
      'ai.offline.recoveryChecklist': 'Recovery checklist:',
      'ai.offline.recheck': 'Re-check',
      'ai.offline.nextSteps.none': 'No suggested next steps were returned.',
      'ai.label.likelyCause': 'Likely cause:',
      'ai.label.why': 'Why:',
      'ai.label.doFirst': 'Do this first:',
      'ai.label.summary': 'Summary:',
      'ai.label.nextSteps': 'Next steps:',
      'ai.label.nextActions': 'Next actions',
      'ai.label.signalFallback': 'Signal-based estimate (fallback)',

      'ai.verdict.possible': 'Possible cause (estimate) — needs verification',
      'ai.verdict.verified': 'Verified cause',
      'ai.verifiedBy': 'Verified by:',

      'ai.evidence.usedLabel': 'Evidence used:',
      'ai.evidence.missingLabel': 'Evidence missing:',
      'ai.evidence.camera_normal_stable': 'Camera: normal screen content (stable)',
      'ai.evidence.adb_online': 'ADB: device online',
      'ai.evidence.adb_log_evidence_present': 'ADB: log evidence present',
      'ai.evidence.fastboot_visible': 'Fastboot: device visible',
      'ai.evidence.fastboot_getvar_collected': 'Fastboot: getvar collected',
      'ai.evidence.host_problem_code_present': 'Windows: device problem code present',
      'ai.evidence.usb_flapping_detected': 'USB: repeated disconnect/reconnect',
      'ai.evidence.mtp_stable': 'MTP: stable connection',
      'ai.evidence.safe_mode_confirmed': 'Tech: Safe Mode improves issue',
      'ai.evidence.oem_flash_tool_corruption_confirmed': 'Tech: OEM flash tool reported corruption/verity',
      'ai.evidence.repair_confirmed_screen_fixed': 'Tech: known-good screen test fixed it',
      'ai.evidence.works_on_other_pc_confirmed': 'Tech: works on other PC/cable',

      'ai.techConfirm.title': 'Technician confirmations (optional)',
      'ai.techConfirm.screenTestFixed': 'Known-good screen test fixed it (display fault confirmed)',
      'ai.techConfirm.worksOtherPc': 'Works on another known-good PC/cable (host USB issue confirmed)',
        'ai.techConfirm.safeModeImproves': 'Safe Mode improves the issue (apps / third-party confirmed)',
      'ai.techConfirm.oemFlashFailure': 'OEM flash tool reported partition / verity / corruption failure (firmware confirmed)',
      'ai.techConfirm.uiFrozen': 'Tech observed: phone UI is frozen/unresponsive (possible ANR/System UI hang)',
      'ai.techConfirm.save': 'Save confirmations',
      'ai.techConfirm.saving': 'Saving confirmations…',
      'ai.techConfirm.saved': 'Confirmations saved to SmartHub AI support memory.',
      'ai.techConfirm.unavailable': 'No case available to attach confirmations yet.',
      'ai.techConfirm.failed': 'Could not save confirmations.',

      'ai.labelCase.title': 'Label this case (improves accuracy)',
      'ai.labelCase.select': 'Select outcome…',
      'ai.labelCase.save': 'Save label',
      'ai.labelCase.saving': 'Saving label…',
      'ai.labelCase.saved': 'Saved label to SmartHub AI support memory.',
      'ai.labelCase.alreadySaved': 'This label is already saved for this case.',
      'ai.labelCase.unavailable': 'No case available to label yet.',
      'ai.labelCase.failed': 'Label save failed.',

      'ai.bsod.status.detected': 'BSOD-style boot failure suspected',
      'ai.bsod.status.none': 'Not confirmed as a BSOD-style boot failure (USB-only)',
      'ai.bsod.status.inconclusive': 'Inconclusive (no USB visibility / USB-only)',
      'ai.bsod.possibleCause': 'Possible cause:',
      'ai.bsod.required5': 'BSOD cause (required 5)',
      'ai.bsod.possibleLine': 'Possible BSOD causes: Hardware · OS corruption · Apps · Overheating',

      'ai.group.hardware': 'Hardware',
      'ai.group.osCorruptFiles': 'OS corruption (system files)',
      'ai.group.osUpdates': 'OS corruption / faulty updates',
      'ai.group.apps': 'Apps / incompatibility',
      'ai.group.overheating': 'Overheating',
      'ai.group.other': 'Other',

      'ai.bsod5.corrupt_system_files': 'Corrupt system files',
      'ai.bsod5.faulty_os_updates': 'Faulty OS updates',
      'ai.bsod5.incompatible_apps': 'Incompatible apps',
      'ai.bsod5.overheating': 'Overheating',
      'ai.bsod5.hardware_failure': 'Hardware failure',
      'ai.bsod5.not_bsod': 'Not BSOD',

      'ai.common5.software_glitches': 'Software glitches',
      'ai.common5.insufficient_storage': 'Insufficient storage',
      'ai.common5.app_malfunctions': 'App malfunctions',
      'ai.common5.connectivity_issues': 'Connectivity issues',
      'ai.common5.hardware_problems': 'Hardware problems',

      'ai.metrics.phase4Gate.pass': 'Phase 4 gate: PASS',
      'ai.metrics.phase4Gate.wait': 'Phase 4 gate: WAIT (need more verified labels)',
      'ai.metrics.phase4Gate.detail': '({usable}/{min}, target ≤{target}%, upper {upper}%)',
      'ai.metrics.phase4Gate.remaining': 'need {n} more',
      'ai.metrics.falseVerifiedUpper95': 'false-verified ≤{p}% (95%)',

      'ai.cause.software_firmware': 'OS / firmware corruption or boot crash loop',
      'ai.cause.display_hardware': 'Display hardware / connector / panel fault',
      'ai.cause.low_level_mode': 'Device is in low-level recovery mode (EDL / Preloader / DFU)',
      'ai.cause.host_usb_driver': 'PC-side USB driver / enumeration issue',
      'ai.cause.power_mainboard': 'Power / mainboard / deep hardware failure',
      'ai.cause.not_bsod': 'Not a BSOD-style case (screen content appears normal)',
    },
    tl: {
      'app.title': 'Diagnostiko ng Mobile',
      'app.subtitle':
        'Magpatakbo ng lokal na pagsusuri ng device, kumuha ng screenshot, at i-scan ang mga naka-install na app para sa panganib.',
      'btn.refresh': '↻ I-refresh ang mga device',
      'btn.readOnly.title': 'Hinaharang ang pag-install at mga live na device test',
      'btn.installApp': 'I-install ang mobile app',
      'btn.devGuide': 'Paano i-enable ang Developer options',
      'toolbar.note':
        'Ang mga nakakonektang device ay natutuklasan sa pamamagitan ng ADB sa computer na ito. Kapag walang ADB, maaari pa ring makita ang USB/MTP-only detection (limitadong mode).',
      'legend.safe': 'Ligtas',
      'legend.moderate': 'Katamtaman',
      'legend.risky': 'Mapanganib',
      'label.language': 'Wika',
      'label.theme': 'Tema',
      'label.selectedDevice': 'Napiling device',
      'option.allDevices': 'Lahat ng device',

      'theme.light': 'Maliwanag',
      'theme.dark': 'Madilim',
      'btn.startDiagnostic': 'Simulan ang Diagnostic Ngayon',
      'btn.bsodOnly': 'Diagnose para sa BSOD lang',
      'btn.bsodOnly.title': 'USB-only BSOD/blank-screen helper (hindi kailangan ang USB debugging)',
      'footer.privacyLabel': 'Pagkapribado:',
      'footer.privacyText':
        'Lahat ng pagsusuri ay tumatakbo nang lokal sa device na nakakonekta sa computer na ito. Walang datos na ipinapadala sa remote server.',
      'footer.backend': 'Backend: http://127.0.0.1:3333 · Dapat naka-install ang ADB at nasa PATH.',
      'advice.title': 'Kapaki-pakinabang na Payo',
      'modal.messageTitle': 'Mensahe',
      'label.readOnly': 'Read-only',
      'state.on': 'Naka-on',
      'state.off': 'Naka-off',
      'btn.readOnly.title.forced': 'Ipinapatupad ng backend ang Read-only mode.',
      'btn.readOnly.title.normal': 'Hinaharang ang pag-install at mga live na device test',

      // Dynamic banners / devices
      'devices.scanning.title': 'Naghahanap ng mga device',
      'devices.scanning.body': 'Kinukuha ang ADB list mula sa lokal na companion service...',
      'devices.none.title': 'Walang nakitang device',
      'devices.none.guidance':
        'Tiyaking nakakonekta ang iyong phone. Kung nakikita ito sa Windows File Explorer pero hindi dito, i-click ang “↻ I-refresh ang mga device”. Para sa full diagnostics, i-enable ang USB debugging para lumabas sa <code>adb devices</code>.',
      'devices.noAdb.title': 'Walang ADB device na nakita',
      'devices.noAdb.guidance':
        'Nakikita ng PC ang phone sa USB/MTP, pero hindi pa ito nakikita ng ADB. Karaniwan itong ibig sabihin ay naka-off ang USB debugging o hindi pa na-accept ang RSA trust prompt. Gamitin ang <strong>Screen not showing?</strong> helper at i-enable ang Developer options at USB debugging sa phone, pagkatapos ay i-reconnect at i-accept ang trust prompt.',
      'devices.mtp.adbNotDetected': 'Walang ADB',
      'devices.mtp.detectedTitle': 'Nakita ng PC (USB / MTP lang)',
      'devices.mtp.note':
        'Nakikita ng Windows ang mga device na ito, pero hindi pa ng ADB. I-on ang Developer options at USB debugging para gumana ang full diagnostics.',
      'devices.selectedMissing.title': 'Hindi nakita ang napiling device',
      'devices.selectedMissing.body':
        'Ang napiling device (<code>{id}</code>) ay hindi kasalukuyang nakikita ng ADB. Pumili ng ibang device sa dropdown o i-reconnect ang phone, pagkatapos ay i-refresh.',
      'devices.option.notDetected': '{id} (hindi nakita)',

      // SmartHub AI support UI
      'ai.offline.title': 'Konklusyon ng SmartHub AI support',
      'ai.state.working': 'Gumagana…',
      'ai.state.unavailable': 'Hindi available',
      'ai.state.noDevice': 'Walang nakitang device',
      'ai.offline.summarizing': 'Binubuod ang resulta ng scan…',
      'ai.offline.analyzing': 'Sinusuri ang ebidensya at hinahanap ang SmartHub AI support memory…',
      'ai.offline.noSignals': 'Walang nakitang signal ng Android phone mula sa PC na ito (ADB/Fastboot/MTP).',
      'ai.offline.recoveryChecklist': 'Checklist sa pag-ayos:',
      'ai.offline.recheck': 'I-check ulit',
      'ai.offline.nextSteps.none': 'Walang naibalik na susunod na hakbang.',
      'ai.label.likelyCause': 'Pinaka-malamang na sanhi:',
      'ai.label.why': 'Bakit:',
      'ai.label.doFirst': 'Unahin ito:',
      'ai.label.summary': 'Buod:',
      'ai.label.nextSteps': 'Susunod na hakbang:',
      'ai.label.nextActions': 'Susunod na aksyon',
      'ai.label.signalFallback': 'Taya batay sa signal (fallback)',

      'ai.verdict.possible': 'Posibleng sanhi (taya) — kailangan ng beripikasyon',
      'ai.verdict.verified': 'Beripikadong sanhi',
      'ai.verifiedBy': 'Naberipika gamit ang:',

      'ai.evidence.usedLabel': 'Ebidensyang ginamit:',
      'ai.evidence.missingLabel': 'Kulang na ebidensya:',
      'ai.evidence.camera_normal_stable': 'Camera: normal na screen content (stable)',
      'ai.evidence.adb_online': 'ADB: online ang device',
      'ai.evidence.adb_log_evidence_present': 'ADB: may ebidensya sa log',
      'ai.evidence.fastboot_visible': 'Fastboot: nakikita ang device',
      'ai.evidence.fastboot_getvar_collected': 'Fastboot: nakolekta ang getvar',
      'ai.evidence.host_problem_code_present': 'Windows: may problem code ang device',
      'ai.evidence.usb_flapping_detected': 'USB: paulit-ulit na disconnect/reconnect',
      'ai.evidence.mtp_stable': 'MTP: stable na koneksyon',
      'ai.evidence.safe_mode_confirmed': 'Tech: gumanda sa Safe Mode',
      'ai.evidence.oem_flash_tool_corruption_confirmed': 'Tech: nag-report ang OEM flash tool ng corruption/verity',
      'ai.evidence.repair_confirmed_screen_fixed': 'Tech: naayos ng screen test',
      'ai.evidence.works_on_other_pc_confirmed': 'Tech: gumagana sa ibang PC/cable',

      'ai.techConfirm.title': 'Kumpirmasyon ng technician (opsyonal)',
      'ai.techConfirm.screenTestFixed': 'Naayos ng known-good screen test (kumpirmadong display fault)',
      'ai.techConfirm.worksOtherPc': 'Gumagana sa ibang known-good PC/cable (kumpirmadong host USB issue)',
        'ai.techConfirm.safeModeImproves': 'Gumanda sa Safe Mode (kumpirmadong apps / third-party)',
      'ai.techConfirm.oemFlashFailure': 'Nag-report ang OEM flash tool ng partition / verity / corruption failure (kumpirmadong firmware)',
      'ai.techConfirm.uiFrozen': 'Kumpirmado ng tech: naka-freeze / hindi tumutugon ang UI (posibleng ANR/System UI hang)',
      'ai.techConfirm.save': 'I-save ang kumpirmasyon',
      'ai.techConfirm.saving': 'Sine-save ang kumpirmasyon…',
      'ai.techConfirm.saved': 'Na-save ang kumpirmasyon sa SmartHub AI support memory.',
      'ai.techConfirm.unavailable': 'Wala pang case na puwedeng lagyan ng kumpirmasyon.',
      'ai.techConfirm.failed': 'Hindi ma-save ang kumpirmasyon.',

      'ai.labelCase.title': 'I-label ang kasong ito (para tumaas ang accuracy)',
      'ai.labelCase.select': 'Pumili ng kinalabasan…',
      'ai.labelCase.save': 'I-save ang label',
      'ai.labelCase.saving': 'Sine-save ang label…',
      'ai.labelCase.saved': 'Na-save ang label sa SmartHub AI support memory.',
      'ai.labelCase.alreadySaved': 'Na-save na ang label na ito para sa kasong ito.',
      'ai.labelCase.unavailable': 'Wala pang case na puwedeng i-label.',
      'ai.labelCase.failed': 'Hindi na-save ang label.',

      'ai.bsod.status.detected': 'May BSoD',
      'ai.bsod.status.none': 'Walang sintomas ng BSoD',
      'ai.bsod.possibleCause': 'Posibleng sanhi:',
      'ai.bsod.required5': 'Sanhi ng BSOD (required 5)',
      'ai.bsod.possibleLine': 'Posibleng sanhi ng BSOD: Hardware · OS corruption · Apps · Overheating',

      'ai.group.hardware': 'Hardware',
      'ai.group.osCorruptFiles': 'OS corruption (system files)',
      'ai.group.osUpdates': 'OS corruption / sira na updates',
      'ai.group.apps': 'Apps / hindi tugma',
      'ai.group.overheating': 'Overheating',
      'ai.group.other': 'Iba pa',

      'ai.bsod5.corrupt_system_files': 'Sirang system files',
      'ai.bsod5.faulty_os_updates': 'Sirang OS updates',
      'ai.bsod5.incompatible_apps': 'Hindi tugmang apps',
      'ai.bsod5.overheating': 'Overheating',
      'ai.bsod5.hardware_failure': 'Sira sa hardware',
      'ai.bsod5.not_bsod': 'Hindi BSOD',

      'ai.common5.software_glitches': 'Software glitches',
      'ai.common5.insufficient_storage': 'Kulang ang storage',
      'ai.common5.app_malfunctions': 'Problema sa apps',
      'ai.common5.connectivity_issues': 'Problema sa koneksyon',
      'ai.common5.hardware_problems': 'Problema sa hardware',

      'ai.metrics.phase4Gate.pass': 'Phase 4 gate: PASS',
      'ai.metrics.phase4Gate.wait': 'Phase 4 gate: WAIT (kailangan ng mas maraming verified labels)',
      'ai.metrics.phase4Gate.detail': '({usable}/{min}, target ≤{target}%, upper {upper}%)',
      'ai.metrics.phase4Gate.remaining': 'kailangan pa ng {n}',
      'ai.metrics.falseVerifiedUpper95': 'false-verified ≤{p}% (95%)',

      'ai.cause.software_firmware': 'OS / firmware corruption o boot crash loop',
      'ai.cause.display_hardware': 'Sira sa display/connector/panel',
      'ai.cause.low_level_mode': 'Nasa low-level recovery mode (EDL / Preloader / DFU)',
      'ai.cause.host_usb_driver': 'Problema sa USB driver / enumeration ng PC',
      'ai.cause.power_mainboard': 'Problema sa power / mainboard / malalim na hardware failure',
      'ai.cause.not_bsod': 'Hindi BSOD-style (mukhang normal ang screen content)',
    },
  };

  function getCurrentLang() {
    try {
      const v = String(localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
      if (v === 'tl' || v === 'en') return v;
    } catch {
      // ignore
    }
    return 'en';
  }

  function format(template, params) {
    let out = String(template || '');
    const p = params && typeof params === 'object' ? params : {};
    Object.keys(p).forEach((k) => {
      out = out.split('{' + k + '}').join(String(p[k]));
    });
    return out;
  }

  function t(key, params) {
    const lang = getCurrentLang();
    const fromLang = (DICT[lang] && DICT[lang][key]) || null;
    const fromEn = (DICT.en && DICT.en[key]) || null;
    return format(fromLang || fromEn || key, params);
  }

  function applyTranslations() {
    const lang = getCurrentLang();
    try {
      document.documentElement.setAttribute('lang', lang);
    } catch {
      // ignore
    }

    const nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      try {
        el.textContent = t(key);
      } catch {
        // ignore
      }
    });

    const titleNodes = document.querySelectorAll('[data-i18n-title]');
    titleNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      try {
        el.setAttribute('title', t(key));
      } catch {
        // ignore
      }
    });
  }

  function setCurrentLang(lang) {
    const v = lang === 'tl' ? 'tl' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // ignore
    }
    applyTranslations();
  }

  try {
    window.SmartHubI18n = {
      t,
      getCurrentLang,
      setCurrentLang,
      applyTranslations,
      storageKey: STORAGE_KEY,
    };
  } catch {
    // ignore
  }
})();
