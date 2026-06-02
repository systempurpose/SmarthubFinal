// NOTE: The old "no-debug" diagnostic modals were merged into the
// BSOD (USB-only) diagnose flow.

function i18nApi() {
  try {
    if (window.SmartHubI18n) return window.SmartHubI18n;
  } catch {
    // ignore
  }
  return {
    t: key => key,
    getCurrentLang: () => 'en',
    setCurrentLang: () => {},
    applyTranslations: () => {},
  };
}

// Backwards-compatibility shim: any old callers should land in the
// merged BSOD diagnose experience.
async function openQuickNoDebugModal() {
  return openBsodDiagnoseModal();
}

/*
  Deprecated implementation (previous no-debug quick modal).
  Kept temporarily to avoid losing work during refactor.
  Safe to delete once the BSOD flow is confirmed.

  function pushUpdate(iconEl, detailEl, iconChar, statusClass, text, detailHtml) {
    if (!iconEl || !detailEl) return;
    iconEl.textContent = iconChar;
    iconEl.className = `quick-check-icon ${statusClass}`;
    if (detailHtml) {
      detailEl.innerHTML = detailHtml;
    } else {
      detailEl.textContent = text;
    }
  }

  if (!data) {
    pushUpdate(
      mtpIcon,
      mtpDetail,
      '⚠',
      'warn',
      'Host-level status is unknown. Check USB cable, port and that the phone powers on.',
    );
    pushUpdate(
      adbIcon,
      adbDetail,
      '⚠',
      'warn',
      'Cannot confirm ADB visibility. USB debugging may be off or platform tools missing.',
    );
    pushUpdate(
      fbIcon,
      fbDetail,
      '⚠',
      'warn',
      'Cannot confirm fastboot visibility from this PC.',
    );
    pushUpdate(
      causeIcon,
      causeDetail,
      '⚠',
      'warn',
      'Quick triage unavailable. Use the full "Screen / Boot / No-debug" diagnostic for more detail.',
    );
    pushUpdate(
      cameraIcon,
      cameraDetail,
      '⚠',
      'warn',
      'Camera-based checks unavailable because the host connection check did not complete.',
    );
  } else {
    const hostUsb = data.hostUsb || {};
    const portable = Array.isArray(hostUsb.portableDevices) ? hostUsb.portableDevices : [];
    const transport = Array.isArray(hostUsb.transportDevices) ? hostUsb.transportDevices : [];
    const hostUsbSample = hostUsb.sample || {};
    const usbAnyChange = !!hostUsbSample.anyChange;
    const portableNotOk = portable.filter(p => {
      const s = (p && p.status ? String(p.status) : '').toLowerCase();
      return s && s !== 'ok';
    });
    const transportNotOk = transport.filter(p => {
      const s = (p && p.status ? String(p.status) : '').toLowerCase();
      return s && s !== 'ok';
    });
    const adbInfo = data.adb || {};
    const adbList = Array.isArray(adbInfo.devices) ? adbInfo.devices : [];
    const fastboot = data.fastboot || {};
    const fbList = Array.isArray(fastboot.devices) ? fastboot.devices : [];
    const bsod = data.bsodAnalysis || {};
    const bsodPart1 = (bsod && bsod.part1 && typeof bsod.part1 === 'object') ? bsod.part1 : null;

    if (portable.length > 0) {
      const names = portable
        .map(p => p && p.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

      const unstableNote = usbAnyChange
        ? ' Note: USB enumeration changed during the check. This can indicate a flaky cable/port/hub or intermittent connection.'
        : '';

      if (portableNotOk.length > 0) {
        pushUpdate(
          mtpIcon,
          mtpDetail,
          '⚠',
          'warn',
          names
            ? `Detected but not healthy in Windows (e.g. ${names}).${unstableNote}`
            : `Detected but not healthy in Windows.${unstableNote}`,
        );
      } else {
        pushUpdate(
          mtpIcon,
          mtpDetail,
          usbAnyChange ? '⚠' : '✓',
          usbAnyChange ? 'warn' : 'ok',
          names
            ? `Detected via PC as portable/MTP device (e.g. ${names}).${unstableNote}`
            : `Detected at least one portable/MTP device from this phone.${unstableNote}`,
        );
      }
    } else if (hostUsb.error) {
      pushUpdate(mtpIcon, mtpDetail, '⚠', 'warn', hostUsb.error);
    } else if (transport.length > 0) {
      const names = transport
        .map(p => p && p.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const base = names
        ? `USB device detected by Windows (e.g. ${names}), but no MTP/Portable storage was found.`
        : 'USB device detected by Windows, but no MTP/Portable storage was found.';
      const unstable = usbAnyChange
        ? ' USB visibility changed during the check (cable/port/hub may be unstable).'
        : '';
      const driver = transportNotOk.length > 0
        ? ' Some entries are not OK in Windows (driver/enumeration issue possible).'
        : '';
      pushUpdate(
        mtpIcon,
        mtpDetail,
        '⚠',
        'warn',
        base + driver + unstable,
      );
    } else {
      pushUpdate(
        mtpIcon,
        mtpDetail,
        '⚠',
        'warn',
        'PC does not currently see a phone as a portable/MTP device.',
      );
    }

    if (adbList.length > 0) {
      pushUpdate(
        adbIcon,
        adbDetail,
        '✓',
        'ok',
        'Phone is visible to ADB. USB debugging and trust prompt are already enabled.',
      );
    } else if (adbInfo.error) {
      pushUpdate(adbIcon, adbDetail, '⚠', 'warn', adbInfo.error);
    } else {
      pushUpdate(
        adbIcon,
        adbDetail,
        '⚠',
        'warn',
        'Phone is not visible to ADB. USB debugging is likely OFF or the RSA trust prompt was not accepted.',
      );
    }

    if (fbList.length > 0) {
      pushUpdate(
        fbIcon,
        fbDetail,
        '⚠',
        'warn',
        'Phone is only visible in fastboot/bootloader mode. It is not running normal Android for full diagnostics.',
      );
    } else if (fastboot.error) {
      pushUpdate(fbIcon, fbDetail, '⚠', 'warn', fastboot.error);
    } else {
      pushUpdate(
        fbIcon,
        fbDetail,
        '✓',
        'ok',
        'No fastboot-only device detected. Phone is either off, in Android, or not connected.',
      );
    }

    const legacyCategory = bsod.category || '';
    const legacyReasons = Array.isArray(bsod.reasons) ? bsod.reasons : [];
    const causeCategory = (bsodPart1 && bsodPart1.category) ? bsodPart1.category : (legacyCategory || 'Quick triage available');
    const reasons = (bsodPart1 && Array.isArray(bsodPart1.reasons)) ? bsodPart1.reasons : legacyReasons;

    // Include both Part 1 and legacy wording so keyword-based scoring stays robust.
    const bsodTextRaw = `${causeCategory} ${reasons.join(' ')} ${legacyCategory} ${legacyReasons.join(' ')}`;
    const bsodText = bsodTextRaw.toLowerCase();
    const visualCategory = visual && visual.category ? String(visual.category).toLowerCase() : '';
    const visualOverheatHint = !!(visual && (visual.overheat_hint || visual.overheatHint));
    const visualMalwareHint = !!(visual && (visual.malware_hint || visual.malwareHint));
    const visualCrackHint = !!(visual && (visual.screen_crack_hint || visual.crack_hint || visual.screenCrackHint));
    const visualBandingHint = !!(visual && (visual.banding_hint || visual.bandingHint));
    const visualEdgeShadowHint = !!(visual && (visual.edge_shadow_hint || visual.edgeShadowHint));

    function classifyStatus(key) {
      // Use a simple scoring model so that a single weak hint does not
      // immediately mark a cause as "likely". Multiple, independent
      // signals (connection pattern + visual analysis + text hints)
      // must line up before we upgrade a cause to likely.

      const hasAdb = adbList.length > 0;
      const hasFastboot = fbList.length > 0;
      const hasMtp = portable.length > 0;
      const bsodConfidence = ((bsodPart1 && bsodPart1.confidence) ? bsodPart1.confidence : bsod.confidence || '')
        .toString()
        .toLowerCase();
      const visualConfidence = (visual && visual.confidence
        ? String(visual.confidence).toLowerCase()
        : '');

      let score = 0;

      const add = (base, strong = false) => {
        score += strong ? base * 2 : base;
      };

      if (key === 'system') {
        const hasSystemWords =
          bsodText.includes('system error') ||
          bsodText.includes('system errors') ||
          bsodText.includes('firmware') ||
          bsodText.includes('system files') ||
          bsodText.includes('update') ||
          bsodText.includes('os') ||
          bsodText.includes('boot') ||
          bsodText.includes('bootloader') ||
          bsodText.includes('fastboot') ||
          bsodText.includes('recovery');

        if (hasSystemWords) {
          add(1, bsodConfidence === 'high' || bsodConfidence === 'medium');
        }

        if (hasFastboot && !hasAdb) {
          add(1, true);
        }

        if (visualCategory.includes('strong blue') || visualCategory.includes('cyan')) {
          add(1, visualConfidence === 'high');
        }
      } else if (key === 'apps') {
        const hasAppWords =
          bsodText.includes('application conflict') ||
          bsodText.includes('application conflicts') ||
          bsodText.includes('app conflict') ||
          bsodText.includes('apps conflict') ||
          bsodText.includes('third-party') ||
          bsodText.includes('safe mode') ||
          bsodText.includes('launcher') ||
          bsodText.includes('system ui') ||
          bsodText.includes('crash') ||
          bsodText.includes('malware') ||
          bsodText.includes('virus') ||
          bsodText.includes('suspicious apps') ||
          bsodText.includes('risky apps');

        if (hasAppWords) {
          add(1, bsodConfidence === 'high' || bsodConfidence === 'medium');
        }

        if (visualMalwareHint) {
          add(1, visualConfidence === 'high' || visualConfidence === 'medium');
        }
      } else if (key === 'hardware') {
        const hasHardwareWords =
          bsodText.includes('hardware malfunction') ||
          bsodText.includes('display') ||
          bsodText.includes('lcd') ||
          bsodText.includes('connector') ||
          bsodText.includes('panel') ||
          bsodText.includes('mainboard') ||
          bsodText.includes('board') ||
          bsodText.includes('power') ||
          bsodText.includes('battery') ||
          bsodText.includes('pmic') ||
          bsodText.includes('rail');

        if (hasHardwareWords) {
          add(1, bsodConfidence === 'high' || bsodConfidence === 'medium');
        }

        if (
          hasAdb &&
          !hasFastboot &&
          (visualCategory.includes('display appears off') ||
            visualCategory.includes('mostly dark with blue tint') ||
            visualCategory.includes('strong blue / cyan display'))
        ) {
          add(1, true);
        }

        if (visualCrackHint || visualBandingHint || visualEdgeShadowHint) {
          add(1, visualConfidence === 'high' || visualConfidence === 'medium');
        }
      } else if (key === 'overheat') {
        if (
          bsodText.includes('overheat') ||
          bsodText.includes('thermal') ||
          bsodText.includes('temperature')
        ) {
          add(1, bsodConfidence === 'high' || bsodConfidence === 'medium');
        }
        if (visualOverheatHint) {
          add(1, visualConfidence === 'high' || visualConfidence === 'medium');
        }
      } else if (key === 'storage') {
        const hasStorageWords =
          bsodText.includes('insufficient storage') ||
          bsodText.includes('low storage') ||
          bsodText.includes('no space') ||
          bsodText.includes('storage full') ||
          bsodText.includes('storage') ||
          bsodText.includes('ufs') ||
          bsodText.includes('emmc') ||
          bsodText.includes('filesystem') ||
          bsodText.includes('corrupt') ||
          bsodText.includes('wear');

        if (hasStorageWords) {
          add(1, bsodConfidence === 'high' || bsodConfidence === 'medium');
        }

        // Boot failures without MTP often correlate with storage issues.
        if (hasFastboot && !hasMtp && !hasAdb) {
          add(1, true);
        }
      }

      // Two or more independent signals (score >= 2) are required
      // before we promote a cause to "likely". This reduces noisy
      // positives when only a single weak hint is present.
      return score >= 2 ? 'likely' : 'unlikely';
    }

    const rootCauses = [
      {
        key: 'system',
        label: 'System Errors',
        desc: 'System/firmware/boot chain problems likely behind the blue/blank screen.',
      },
      {
        key: 'apps',
        label: 'Application Conflicts',
        desc: 'Installed apps or conflicts likely causing crashes, freezes or boot loops.',
      },
      {
        key: 'hardware',
        label: 'Hardware Malfunction',
        desc: 'Display, connector, power rail or mainboard fault likely behind the symptom.',
      },
      {
        key: 'overheat',
        label: 'Overheating',
        desc: 'High temperature or thermal protection likely affecting stability.',
      },
      {
        key: 'storage',
        label: 'Insufficient Storage',
        desc: 'Low storage or failing storage (eMMC/UFS) may be causing boot failures.',
      },
    ];

    const rootItems = rootCauses.map(cause => {
      const status = classifyStatus(cause.key);
      const icon = status === 'likely' ? '✓' : '⚠';
      return { cause, status, icon };
    });

    const strongItems = rootItems.filter(item => item.status === 'likely');

    let rootListHtml = '';
    if (strongItems.length > 0) {
      rootListHtml +=
        '<div class="root-cause-tech-heading">Most likely reasons (Part 1) based on host checks:</div>';
      rootListHtml +=
        '<ul class="root-cause-list">' +
        strongItems
          .map(item => {
            const cause = item.cause;
            const statusLabel =
              'High confidence based on host checks.';
            return `
              <li>
                <span class="root-cause-icon">✓</span>
                <span class="root-cause-text"><strong>${cause.label}:</strong> ${cause.desc} <span class="root-cause-tag">${statusLabel}</span></span>
              </li>`;
          })
          .join('') +
        '</ul>';
    } else {
      rootListHtml +=
        '<div class="root-cause-tech-heading">No single cause reached high confidence from no-debug checks.</div>' +
        '<div class="root-cause-note">Use the guided technician checklist below and, if possible, run full USB-debugging diagnostics for a more certain answer.</div>';
    }

    const technicianChecklistHtml = `
      <div class="root-cause-tech-heading">For repair technician – guided checks for screen problems:</div>
      <ul class="root-cause-list">
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Display assembly and glass:</strong> Swap in a known-good screen and compare image for lines, burn marks or liquid traces.</span>
        </li>
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Flex cables / connectors:</strong> Disconnect battery, re-seat display/touch flex cables and inspect pins for corrosion or poor contact.</span>
        </li>
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Backlight and drivers:</strong> Measure backlight supply rails and check for shorted LED lines or hot driver ICs.</span>
        </li>
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Mainboard around display socket:</strong> Inspect under magnification for cracked filters, lifted pads or previous rework.</span>
        </li>
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Touch / digitizer path:</strong> If image is present but touch is dead, test with a known-good screen and trace through ESD/EMI filters.</span>
        </li>
        <li>
          <span class="root-cause-icon">□</span>
          <span class="root-cause-text"><strong>Power and ground rails:</strong> Check battery voltage and key display rails for drop, short-to-ground or flex-related intermittents.</span>
        </li>
      </ul>`;

    pushUpdate(
      causeIcon,
      causeDetail,
      '✓',
      'ok',
      'See most likely causes below.',
      rootListHtml,
    );

    if (techChecklistEl) {
      const escapeHtml = str => String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c]));

      let aiHtml = '';
      if (Array.isArray(aiActions) && aiActions.length) {
        const items = aiActions
          .slice(0, 8)
          .map(a => `<li><span class="root-cause-icon">⚠</span><span class="root-cause-text">${escapeHtml(a)}</span></li>`)
          .join('');
        aiHtml = `<div class="root-cause-tech-heading">AI suggested fixes (based on warnings above):</div><ul class="root-cause-list">${items}</ul>`;
      }

      techChecklistEl.innerHTML = aiHtml + technicianChecklistHtml;
    }

    if (visual) {
      const cameraChecksHtml = `
        <ul class="root-cause-list">
          <li>
            <span class="root-cause-icon">${visualCrackHint ? '⚠' : '✓'}</span>
            <span class="root-cause-text"><strong>Cracks / strong line artifacts:</strong> ${visualCrackHint ? 'Camera view shows multiple long, high-contrast lines consistent with cracks or panel line faults.' : 'No strong crack-like line pattern detected from the current camera view.'}</span>
          </li>
          <li>
            <span class="root-cause-icon">${visualBandingHint ? '⚠' : '✓'}</span>
            <span class="root-cause-text"><strong>Horizontal banding / dead rows:</strong> ${visualBandingHint ? 'Detected strong horizontal banding or rows with different brightness, suggesting panel or driver faults.' : 'No strong banding pattern detected from the current camera view.'}</span>
          </li>
          <li>
            <span class="root-cause-icon">${visualEdgeShadowHint ? '⚠' : '✓'}</span>
            <span class="root-cause-text"><strong>Uneven backlight / edge shadow:</strong> ${visualEdgeShadowHint ? 'Brightness appears very uneven across the screen, which can indicate partial backlight failure or edge shadow.' : 'Backlight appears roughly even from the current camera view.'}</span>
          </li>
        </ul>`;

      pushUpdate(
        cameraIcon,
        cameraDetail,
        '✓',
        'ok',
        'Camera-based checks completed.',
        cameraChecksHtml,
      );
    } else {
      const baseMsg =
        'Camera-based checks unavailable. Ensure Python 3.8+, OpenCV, NumPy and a webcam are installed on this PC.';
      const msg = visualError ? `${baseMsg} Details: ${visualError}` : baseMsg;
      pushUpdate(
        cameraIcon,
        cameraDetail,
        '⚠',
        'warn',
        msg,
      );
    }
  }

  // Update summary immediately based on real backend analysis instead of
  // faking a long staged loading sequence.
  if (data && typeof data.summary === 'string' && data.summary.trim()) {
    summaryEl.textContent = data.summary;
  } else if (!data) {
    // keep the earlier generic text
  } else {
    summaryEl.textContent = 'Quick checks completed.';
  }
}

*/

let bsodDiagnoseIsRunning = false;
let bsodDiagnoseRunSeq = 0;
let bsodCameraIsRunning = false;

async function openBsodDiagnoseModal() {
  const modal = document.getElementById('bsod-diagnose-modal');
  const summaryTextEl = document.getElementById('bsod-diagnose-summary-text');
  const loadingEl = document.getElementById('bsod-diagnose-loading');
  const presenceBadgeEl = document.getElementById('bsod-presence-badge');
  const screenBadgeEl = document.getElementById('bsod-screen-badge');
  const saveStatusEl = document.getElementById('bsod-diagnose-save-status');
  const usbDetectedStatusEl = document.getElementById('bsod-usb-detected-status');
  const usbDetectedDetailEl = document.getElementById('bsod-usb-detected-detail');
  const adbStatusEl = document.getElementById('bsod-adb-status');
  const adbDetailEl = document.getElementById('bsod-adb-detail');
  const fbStatusEl = document.getElementById('bsod-fastboot-status');
  const fbDetailEl = document.getElementById('bsod-fastboot-detail');
  const mtpStatusEl = document.getElementById('bsod-mtp-status');
  const mtpDetailEl = document.getElementById('bsod-mtp-detail');
  const usbStatusEl = document.getElementById('bsod-usb-status');
  const usbDetailEl = document.getElementById('bsod-usb-detail');
  const hostEvidenceStatusEl = document.getElementById('bsod-host-evidence-status');
  const hostEvidenceDetailEl = document.getElementById('bsod-host-evidence-detail');
  const part1StatusEl = document.getElementById('bsod-part1-status');
  const part1DetailEl = document.getElementById('bsod-part1-detail');
  const topReasonsEl = document.getElementById('bsod-top-reasons');
  const aiConclusionEl = document.getElementById('bsod-ai-conclusion');
  let lastAiRememberPayload = null;
  let lastAiSuggestForUi = null;
  let lastAutoRememberSig = '';
  let lastAutoRememberCaseId = null;
  let autoRememberInFlightSig = '';
  let labelRememberInFlight = false;
  let lastLabeledSeq = -1;
  let lastLabeledOutcome = '';
  const techConfirm = {
    screenTestFixed: false,
    worksOtherPc: false,
    safeModeImproves: false,
    oemFlashFailure: false,
    uiFrozen: false,
  };
  let techConfirmSaveInFlight = false;
  const cameraStatusEl = document.getElementById('bsod-camera-status');
  const cameraDetailEl = document.getElementById('bsod-camera-detail');
  const cameraRunBtn = document.getElementById('bsod-camera-run-btn');
  const nextStepsEl = document.getElementById('bsod-next-steps');

  // Cache the most recent connection-check payload so a manual webcam run can
  // refresh the Offline AI panel without re-running the full USB sampling.
  let lastEnrichedForAi = null;
  let lastSignalSnapshotForAi = null;
  let lastDeviceDetectedForAi = false;
  let lastCameraResForUi = null;
  const REQUIRE_ONLINE_AI_FOR_BSOD = false;
  let lastOnlineAiAudit = {
    required: REQUIRE_ONLINE_AI_FOR_BSOD,
    used: false,
    text: '',
    error: '',
    citations: [],
    webSearch: null,
  };
  const DEFAULT_BSOD_HISTORY_KEY = 'bsod-usb-only';
  const BSOD_HISTORY_KEYS_STORAGE = 'smarthub.bsod.history.deviceKeys';

  if (!modal || !summaryTextEl || !adbStatusEl || !adbDetailEl || !fbStatusEl || !fbDetailEl || !nextStepsEl) return;

  function setBsodSaveStatus(kind, text) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = text || '';
    let cls = 'bsod-save-status';
    if (kind === 'ok') cls += ' ok';
    else if (kind === 'error') cls += ' error';
    else if (kind === 'running') cls += ' running';
    saveStatusEl.className = cls;
  }

  function rememberBsodHistoryKey(deviceKey) {
    const key = String(deviceKey || '').trim();
    if (!key) return;
    try {
      const raw = localStorage.getItem(BSOD_HISTORY_KEYS_STORAGE);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [];
      if (!list.includes(key)) {
        list.unshift(key);
      }
      localStorage.setItem(BSOD_HISTORY_KEYS_STORAGE, JSON.stringify(list.slice(0, 30)));
    } catch {
      // ignore local storage write errors
    }

    try {
      if (window && typeof window.rememberBsodHistoryKey === 'function') {
        window.rememberBsodHistoryKey(key);
      }
    } catch {
      // ignore bridge call errors
    }
  }

  function setSummaryBadge(el, kind, text) {
    if (!el) return;
    el.textContent = String(text || '').toUpperCase();
    let cls = 'summary-badge ';
    if (kind === 'safe') cls += 'summary-badge-safe';
    else if (kind === 'danger') cls += 'summary-badge-danger';
    else cls += 'summary-badge-warn';
    el.className = cls;
  }

  function updateTwoLineBadges(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const phoneVisible = !!o.phoneVisible;
    const usbPresent = !!o.usbPresent;
    const phoneLikely = !!o.phoneLikely;
    const presenceHint = (o.presenceHint && String(o.presenceHint).trim()) ? String(o.presenceHint).trim() : '';
    const cameraRes = o.cameraRes || null;
    const techUiFrozen = !!o.techUiFrozen;
    const hostUnsupported = !!o.hostUnsupported;

    // Phone present?
    if (phoneVisible) {
      setSummaryBadge(presenceBadgeEl, 'safe', 'Yes (USB)');
    } else if (phoneLikely) {
      setSummaryBadge(presenceBadgeEl, 'warn', 'Likely (USB)');
    } else if (usbPresent) {
      setSummaryBadge(presenceBadgeEl, 'warn', presenceHint || 'Maybe (generic USB)');
    } else if (cameraRes && cameraRes.looksNotBsod) {
      setSummaryBadge(presenceBadgeEl, 'warn', 'Likely (webcam)');
    } else if (cameraRes && cameraRes.visual && cameraRes.visualCategory && String(cameraRes.visualCategory).toLowerCase() !== 'dark') {
      setSummaryBadge(presenceBadgeEl, 'warn', 'Maybe (webcam)');
    } else {
      setSummaryBadge(presenceBadgeEl, 'warn', 'Unknown');
    }

    // BSOD-style screen?
    if (techUiFrozen) {
      setSummaryBadge(screenBadgeEl, 'danger', 'Suspected (freeze)');
    } else if (!hostUnsupported && cameraRes && cameraRes.dialogHint) {
      setSummaryBadge(screenBadgeEl, 'danger', 'Suspected (dialog)');
    } else if (!hostUnsupported && cameraRes && cameraRes.suggestsBsodStyle) {
      setSummaryBadge(screenBadgeEl, 'danger', 'Suspected');
    } else if (cameraRes && cameraRes.looksNotBsod) {
      setSummaryBadge(screenBadgeEl, 'safe', 'Not seen');
    } else if (cameraRes && cameraRes.visualCategory && String(cameraRes.visualCategory).toLowerCase() === 'dark') {
      setSummaryBadge(screenBadgeEl, 'warn', 'Unknown (dark)');
    } else {
      setSummaryBadge(screenBadgeEl, 'warn', 'Unknown');
    }
  }

  function setLoading(isLoading) {
    if (!loadingEl) return;
    loadingEl.style.display = isLoading ? 'flex' : 'none';
  }

  function setStatus(el, kind, text) {
    if (!el) return;
    el.textContent = text;
    let cls = 'no-debug-status';
    if (kind === 'running') cls += ' running';
    if (kind === 'ok') cls += ' ok';
    if (kind === 'warn') cls += ' warn';
    if (kind === 'error') cls += ' error';
    el.className = cls;
  }

  function buildConnectionWithTechConfirm(baseConn) {
    const c = Object.assign({}, baseConn || {});
    const userSymptom = (c.userSymptom && typeof c.userSymptom === 'object') ? Object.assign({}, c.userSymptom) : {};
    const details = (userSymptom.details && typeof userSymptom.details === 'object') ? Object.assign({}, userSymptom.details) : {};
    if (techConfirm.screenTestFixed) details.screenTestFixed = true;
    if (techConfirm.worksOtherPc) details.worksOtherPc = true;
    if (techConfirm.safeModeImproves) details.safeModeImproves = true;
    if (techConfirm.oemFlashFailure) details.oemFlashFailure = true;
    if (techConfirm.uiFrozen) details.uiFrozen = true;
    userSymptom.details = details;
    c.userSymptom = userSymptom;
    return c;
  }

  function renderHostEvidenceCard(hostUsb) {
    if (!hostEvidenceStatusEl || !hostEvidenceDetailEl) return;

    const hostVerdict = hostUsb && hostUsb.hostVerdict && typeof hostUsb.hostVerdict === 'object'
      ? hostUsb.hostVerdict
      : null;
    const transportProfile = hostUsb && hostUsb.transportProfile && typeof hostUsb.transportProfile === 'object'
      ? hostUsb.transportProfile
      : null;
    const sample = hostUsb && hostUsb.sample && typeof hostUsb.sample === 'object'
      ? hostUsb.sample
      : null;
    const native = hostUsb && hostUsb.nativeUsbEvidence && typeof hostUsb.nativeUsbEvidence === 'object'
      ? hostUsb.nativeUsbEvidence
      : null;
    const eventLog = hostUsb && hostUsb.usbEventLogEvidence && typeof hostUsb.usbEventLogEvidence === 'object'
      ? hostUsb.usbEventLogEvidence
      : null;
    const pnpSnap = hostUsb && hostUsb.pnpSnapshotEvidence && typeof hostUsb.pnpSnapshotEvidence === 'object'
      ? hostUsb.pnpSnapshotEvidence
      : null;
    const mtpProbe = hostUsb && hostUsb.mtpProbeEvidence && typeof hostUsb.mtpProbeEvidence === 'object'
      ? hostUsb.mtpProbeEvidence
      : null;

    const lines = [];
    let healthyHelpers = 0;
    let issueSignals = 0;

    const portableList = hostUsb && Array.isArray(hostUsb.portableDevices) ? hostUsb.portableDevices : [];
    const transportList = hostUsb && Array.isArray(hostUsb.transportDevices) ? hostUsb.transportDevices : [];
    const toStatus = (s) => String(s || '').trim().toUpperCase();
    const toPcode = (v) => {
      try {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    };

    if (hostVerdict && hostVerdict.label) {
      lines.push(`Host verdict: ${String(hostVerdict.label)}${hostVerdict.confidence ? ` (${String(hostVerdict.confidence)} confidence)` : ''}.`);
      if (Array.isArray(hostVerdict.reasons) && hostVerdict.reasons.length) {
        lines.push(...hostVerdict.reasons.slice(0, 3).map(reason => String(reason || '').trim()).filter(Boolean));
      }
    }

    if (transportProfile && transportProfile.label) {
      const parts = [`Transport profile: ${String(transportProfile.label)}`];
      if (transportProfile.vendor) parts.push(`vendor ${String(transportProfile.vendor)}`);
      if (transportProfile.mode) parts.push(`mode ${String(transportProfile.mode)}`);
      lines.push(parts.join(' · ') + '.');
    }

    // Direct Windows PnP signal summary (from PowerShell sampling), independent of helpers.
    if (portableList.length || transportList.length) {
      const portableBad = portableList.filter(d => {
        const st = toStatus(d && d.status);
        const pc = toPcode(d && d.problemCode);
        return (st && st !== 'OK') || (pc != null && pc > 0);
      });
      const transportBad = transportList.filter(d => {
        const st = toStatus(d && d.status);
        const pc = toPcode(d && d.problemCode);
        return (st && st !== 'OK') || (pc != null && pc > 0);
      });

      const codes = [];
      [...portableBad, ...transportBad].forEach(d => {
        const pc = toPcode(d && d.problemCode);
        if (pc != null && pc > 0) codes.push(pc);
      });
      const uniqCodes = Array.from(new Set(codes)).sort((a, b) => a - b).slice(0, 8);

      if (portableBad.length || transportBad.length || uniqCodes.length) issueSignals += 1;

      lines.push(
        `Windows PnP: portable=${portableList.length}${portableBad.length ? ` (issues ${portableBad.length})` : ''} · transport=${transportList.length}${transportBad.length ? ` (issues ${transportBad.length})` : ''}${uniqCodes.length ? ` · ProblemCode: ${uniqCodes.join(', ')}` : ''}.`,
      );

      const examples = [...portableBad, ...transportBad]
        .slice(0, 2)
        .map(d => {
          const name = (d && d.name) ? String(d.name) : '';
          const st = (d && d.status) ? String(d.status) : '';
          const pc = toPcode(d && d.problemCode);
          const prov = (d && d.driverProvider) ? String(d.driverProvider) : '';
          const loc = (d && d.locationInfo) ? String(d.locationInfo) : '';
          const parts = [];
          if (name) parts.push(name);
          if (st) parts.push(`status=${st}`);
          if (pc != null && pc > 0) parts.push(`code=${pc}`);
          if (prov) parts.push(`driver=${prov}`);
          if (loc) parts.push(`loc=${loc}`);
          return parts.join(' · ');
        })
        .filter(Boolean);
      if (examples.length) lines.push(`Example(s): ${examples.join(' | ')}`);
    }

    if (sample && Array.isArray(sample.timeline) && sample.timeline.length) {
      const changed = sample.timeline.filter(item => item && item.changed).length;
      const hops = sample.timeline
        .slice(0, 4)
        .map(item => {
          const transportNames = Array.isArray(item.transportNames) ? item.transportNames.join(', ') : '';
          const portableNames = Array.isArray(item.portableNames) ? item.portableNames.join(', ') : '';
          const names = [transportNames, portableNames].filter(Boolean).join(' / ');
          return `#${item.index}: t=${Number(item.transportCount) || 0}, p=${Number(item.portableCount) || 0}${names ? ` (${names})` : ''}`;
        });
      lines.push(`USB timeline: ${sample.timeline.length} sample(s), ${changed} change${changed === 1 ? '' : 's'}${hops.length ? ` · ${hops.join(' | ')}` : ''}.`);
    }

    if (native) {
      if (native.ok && native.evidence && Array.isArray(native.evidence.devices)) {
        healthyHelpers += 1;
        const phoneLike = native.evidence.devices.filter(d => d && typeof d === 'object' && /(android|mtp|phone|adb|fastboot|qdloader|9008|preloader|mtk|qualcomm|itel|tecno|infinix|samsung|xiaomi|oppo|vivo|motorola|pixel)/i.test(`${d.friendlyName || ''} ${d.deviceDesc || ''} ${d.manufacturer || ''}`));
        const bad = phoneLike.filter(d => Number(d.problemCode) > 0);
        if (bad.length) issueSignals += 1;
        lines.push(`UsbEvidenceHelper: ${phoneLike.length} phone-like device(s)${bad.length ? ` · ${bad.length} with problem code` : ' · no problem code'}.`);
      } else if (native.ok) {
        healthyHelpers += 1;
        lines.push('UsbEvidenceHelper: completed, but no detailed device list was returned.');
      } else {
        lines.push(`UsbEvidenceHelper: failed${native.error ? ` (${String(native.error)})` : ''}.`);
      }
    }

    if (eventLog) {
      if (eventLog.ok && eventLog.evidence) {
        healthyHelpers += 1;
        const events = Array.isArray(eventLog.evidence.events) ? eventLog.evidence.events : [];
        const notable = events.filter(ev => ev && /(kernel-pnp|userpnp|usb|driverframeworks)/i.test(String(ev.provider || ''))).slice(0, 2);
        if (notable.length) issueSignals += 1;
        lines.push(`UsbEventLogHelper: ${events.length} recent host event(s)${notable.length ? ' · USB/PnP warnings present' : ''}.`);
        notable.forEach(ev => {
          const provider = String(ev.provider || 'event');
          const eventId = ev.event_id != null ? `#${ev.event_id}` : '';
          const desc = String(ev.description || '').replace(/\s+/g, ' ').trim();
          if (desc) lines.push(`${provider}${eventId}: ${desc.slice(0, 140)}${desc.length > 140 ? '…' : ''}`);
        });
      } else {
        lines.push(`UsbEventLogHelper: failed${eventLog && eventLog.error ? ` (${String(eventLog.error)})` : ''}.`);
      }
    }

    if (pnpSnap) {
      if (pnpSnap.ok && pnpSnap.evidence && Array.isArray(pnpSnap.evidence.devices)) {
        healthyHelpers += 1;
        const phoneLike = pnpSnap.evidence.devices.filter(d => d && /(android|mtp|phone|adb|fastboot|qdloader|9008|preloader|mtk|qualcomm|itel|tecno|infinix|samsung|xiaomi|oppo|vivo|motorola|pixel)/i.test(`${d.friendlyName || ''} ${d.deviceDesc || ''} ${d.manufacturer || ''} ${d.instanceId || ''}`));
        const bad = phoneLike.filter(d => Number(d.problemCode) > 0);
        if (bad.length) issueSignals += 1;
        lines.push(`UsbPnpSnapshot: ${phoneLike.length} phone-like PnP device(s)${bad.length ? ` · ${bad.length} with ConfigMgr problem code` : ''}.`);
      } else if (pnpSnap.ok) {
        healthyHelpers += 1;
        lines.push('UsbPnpSnapshot: completed, but no device list was returned.');
      } else {
        lines.push(`UsbPnpSnapshot: failed${pnpSnap && pnpSnap.error ? ` (${String(pnpSnap.error)})` : ''}.`);
      }
    }

    if (mtpProbe && String(mtpProbe.tool || '') !== 'none') {
      const durMs = (typeof mtpProbe.durationMs === 'number')
        ? mtpProbe.durationMs
        : ((typeof mtpProbe.elapsedMs === 'number') ? mtpProbe.elapsedMs : null);
      const dur = (typeof durMs === 'number') ? ` (${Math.round(durMs)}ms)` : '';
      const dev = (mtpProbe.deviceName && String(mtpProbe.deviceName).trim()) ? ` · ${String(mtpProbe.deviceName).trim()}` : '';

      const hostUnsupported = !!(mtpProbe && mtpProbe.hostUnsupported);

      const deviceCount = (typeof mtpProbe.deviceCount === 'number') ? mtpProbe.deviceCount : null;
      const foundDevice = (typeof deviceCount === 'number')
        ? (deviceCount > 0)
        : !!(mtpProbe.deviceName && String(mtpProbe.deviceName).trim());

      const portableIsPresent = Array.isArray(portableList) && portableList.length > 0;
      const probeReturnedZeroWhilePortablePresent = portableIsPresent && (typeof deviceCount === 'number') && deviceCount === 0 && mtpProbe.ok === true && !hostUnsupported;

      if (hostUnsupported) {
        issueSignals += 1;
        const err = (mtpProbe.error && String(mtpProbe.error).trim()) ? ` – ${String(mtpProbe.error).trim()}` : '';
        lines.push(`MTP probe: Inconclusive – MTP probe failed due to COM error. Please reinstall Windows Portable Devices drivers or test on another PC${dur}${dev}${err}.`);
      } else if (probeReturnedZeroWhilePortablePresent) {
        issueSignals += 1;
        lines.push(`MTP probe: ⚠ unresponsive (returned 0 devices while Windows enumerated MTP)${dur}${dev}.`);
      } else if (mtpProbe.ok) {
        const items = Array.isArray(mtpProbe.sampleItems)
          ? mtpProbe.sampleItems.map(x => String(x || '')).filter(Boolean).slice(0, 3)
          : [];

        if (String(mtpProbe.tool || '') === 'shell') {
          healthyHelpers += 1;
          lines.push(`MTP probe: ✓ responsive (Shell)${dur}${items.length ? ` · sample: ${items.join(', ')}` : ''}.`);
        } else if (foundDevice) {
          healthyHelpers += 1;
          const isSlow = (typeof durMs === 'number') && durMs > 3000;
          if (isSlow) issueSignals += 1;
          const deepOkKnown = (typeof mtpProbe.deepOk === 'boolean');
          const deepOk = deepOkKnown ? mtpProbe.deepOk : false;
          const deepItems = Array.isArray(mtpProbe.deepSampleItems)
            ? mtpProbe.deepSampleItems.map(x => String(x || '')).filter(Boolean).slice(0, 3)
            : [];
          const deepErr = (mtpProbe.deepError && String(mtpProbe.deepError).trim()) ? ` · deep: ${String(mtpProbe.deepError).trim()}` : '';
          const deepPart = deepOk
            ? (deepItems.length ? ` · deep sample: ${deepItems.join(', ')}` : ' · deep: ok')
            : (deepOkKnown ? (deepErr || ' · deep: failed') : ' · deep: unavailable');
          const deepStats = (typeof mtpProbe.deepDurationMs === 'number' || typeof mtpProbe.deepEnumeratedCount === 'number')
            ? ` · deep: ${typeof mtpProbe.deepDurationMs === 'number' ? `${Math.round(mtpProbe.deepDurationMs)}ms` : '?ms'} / ${typeof mtpProbe.deepEnumeratedCount === 'number' ? `${mtpProbe.deepEnumeratedCount} obj` : '? obj'}`
            : '';
          const foundPart = (typeof deviceCount === 'number') ? ` · devices=${deviceCount}` : '';
          lines.push(`MTP probe: ✓ detected${dur}${dev}${foundPart}${isSlow ? ' · ⚠ slow' : ''}${items.length ? ` · sample: ${items.join(', ')}` : ''}${deepPart}${deepStats}.`);
        } else {
          issueSignals += 1;
          const foundPart = (typeof deviceCount === 'number') ? ` · devices=${deviceCount}` : '';
          lines.push(`MTP probe: ⚠ ran, but no MTP device was found${dur}${foundPart}.`);
        }
      } else {
        issueSignals += 1;
        const to = mtpProbe.timedOut ? ' (timeout)' : '';
        const err = (mtpProbe.error && String(mtpProbe.error).trim()) ? ` – ${String(mtpProbe.error).trim()}` : '';
        lines.push(`MTP probe: ⚠ not responsive${to}${dur}${dev}${err}.`);
      }
    }

    if (!native && !eventLog && !pnpSnap && !mtpProbe) {
      setStatus(hostEvidenceStatusEl, 'warn', '⚠ No helper evidence');
      hostEvidenceDetailEl.textContent = 'Bsod tools helpers are not available on this PC. The diagnosis is using only ADB/fastboot/MTP/USB sampling.';
      return;
    }

    if (hostVerdict && hostVerdict.confidence === 'high') {
      setStatus(hostEvidenceStatusEl, 'warn', `⚠ ${String(hostVerdict.label)}`);
    } else if (issueSignals > 0) {
      setStatus(hostEvidenceStatusEl, 'warn', `⚠ Helper evidence (${issueSignals} issue signal${issueSignals > 1 ? 's' : ''})`);
    } else if (healthyHelpers > 0) {
      setStatus(hostEvidenceStatusEl, 'ok', `✓ Helper evidence (${healthyHelpers} helper${healthyHelpers > 1 ? 's' : ''})`);
    } else {
      setStatus(hostEvidenceStatusEl, 'warn', '⚠ Helper evidence unavailable');
    }

    hostEvidenceDetailEl.textContent = lines.join(' ');
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  const noDebugGridEl = modal ? modal.querySelector('.no-debug-grid') : null;
  const sanityEl = document.getElementById('bsod-sanity');
  const primaryReasonsEl = document.getElementById('bsod-primary-reasons');

  function setNoDeviceUiMode(enabled) {
    const hide = !!enabled;
    if (topReasonsEl) topReasonsEl.style.display = hide ? 'none' : '';
    if (nextStepsEl) nextStepsEl.style.display = hide ? 'none' : '';
    if (noDebugGridEl) noDebugGridEl.style.display = hide ? 'none' : '';
    if (sanityEl) sanityEl.style.display = hide ? 'none' : '';
    if (primaryReasonsEl) primaryReasonsEl.style.display = hide ? 'none' : '';
  }

  function renderNextSteps(items) {
    const safeItems = (Array.isArray(items) ? items : []).filter(Boolean);
    nextStepsEl.innerHTML = `
      <div class="ui-fade-in">
        <div style="font-weight: 650;">Next steps</div>
        <ul style="margin: 6px 0 0; padding-left: 18px;">
          ${safeItems.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
        <div class="root-cause-note">Confidence guide: High = multiple independent signals agree. Medium = one strong signal + hints. Low = not enough evidence yet.</div>
      </div>
    `;
  }

  function renderTopReasons(active, signals) {
    if (!topReasonsEl) return;
    const cat = active && (active.primaryReason || active.category) ? String(active.primaryReason || active.category) : '';
    const conf = active && active.confidence ? String(active.confidence) : 'low';
    const rawReasons = (active && Array.isArray(active.reasons)) ? active.reasons.filter(Boolean) : [];

    function normalizeBsodReason(reason) {
      const r = String(reason || '').trim();
      const lower = r.toLowerCase();

      if (!lower) return '';

      // Software
      if (/(failed|interrupted|corrupt(ed)?).*update|update.*(failed|interrupted|corrupt)/i.test(r)) {
        return 'Failed updates';
      }
      if (/safe mode|third.?party|app.*(crash|conflict|malicious)|malware|spyware|trojan|untrusted app/i.test(r)) {
        return 'Third‑party app interference';
      }
      if (/corrupt|corruption|system data|bootloop|system process|kernel panic/i.test(lower)) {
        return 'Corrupted system data';
      }

      // Hardware
      if (/motherboard|logic board|pmic|power ic|short circuit|board-?level/i.test(lower)) {
        return 'Motherboard / power IC failure';
      }
      if (/battery|power delivery|brownout|voltage drop|charger|charging instability/i.test(lower)) {
        return 'Battery / power delivery problems';
      }
      if (/display|screen|lcd|oled|flex|connector|backlight/i.test(lower)) {
        return 'Loose / damaged display connections';
      }

      // Environmental / usage
      if (/overheat|overheating|temperature|thermal/i.test(lower)) {
        return 'Overheating';
      }
      if (/liquid|water|moisture|corrosion|oxidation/i.test(lower)) {
        return 'Liquid / moisture damage';
      }
      if (/drop|impact|shock|bent|physical damage/i.test(lower)) {
        return 'Drop / impact stress';
      }

      return r;
    }

    const reasons = rawReasons.map(normalizeBsodReason).filter(Boolean);
    const shortReasons = reasons.slice(0, 3);

    const observed = [];
    if (signals) {
      if (signals.hasAdb) observed.push('ADB visible');
      if (signals.hasFastboot) observed.push('Fastboot visible');
      if (signals.hasMtp) observed.push('MTP visible');
      if (signals.anyChange) observed.push('USB unstable during sampling');
      if (signals.looksEdl) observed.push('Low-level mode hint (EDL/QDLoader/9008)');
      if (signals.looksMtk) observed.push('Low-level mode hint (MTK Preloader/BROM/VCOM)');
      if (signals.looksDownload) observed.push('Low-level mode hint (Samsung Download/Odin)');

      try {
        const ev = signals.logEvidence;
        const matched = (ev && Array.isArray(ev.matched)) ? ev.matched : [];
        const labels = matched
          .map(m => (m && m.label) ? String(m.label) : '')
          .filter(Boolean)
          .slice(0, 2);
        if (labels.length) observed.push(`ADB log: ${labels.join(', ')}`);
      } catch {
        // ignore
      }
    }

    let evidenceDetailsHtml = '';
    try {
      const ev = signals && signals.logEvidence ? signals.logEvidence : null;
      const matched = (ev && Array.isArray(ev.matched)) ? ev.matched : [];
      if (matched.length) {
        const blocks = matched
          .slice(0, 6)
          .map(m => {
            const label = (m && m.label) ? String(m.label) : ((m && m.key) ? String(m.key) : 'ADB log');
            const count = (m && typeof m.count === 'number') ? m.count : null;
            const header = count != null ? `${label} (${count})` : label;
            const samples = (m && Array.isArray(m.samples)) ? m.samples.filter(Boolean).slice(0, 3) : [];
            const pre = samples.length
              ? `<pre class="mono" style="white-space: pre-wrap; margin: 6px 0 0;">${escapeHtml(samples.join('\n'))}</pre>`
              : `<div class="root-cause-note" style="margin-top: 6px;">No sample lines captured (but a match was detected).</div>`;
            return `<div style="margin-top: 10px;">
              <div style="font-weight: 650;">${escapeHtml(header)}</div>
              ${pre}
            </div>`;
          })
          .join('');
        evidenceDetailsHtml = `
          <details class="root-cause-note" style="margin-top: 10px;">
            <summary style="cursor: pointer;">ADB log evidence (samples)</summary>
            <div style="margin-top: 8px;">${blocks}</div>
          </details>
        `;
      }
    } catch {
      evidenceDetailsHtml = '';
    }

    // Intentionally keep this section minimal to reduce cognitive load.

    topReasonsEl.innerHTML = `
      <div class="ui-fade-in">
        <div style="font-weight: 650;">Why (key signals)</div>
        <div style="margin-top: 4px; color: var(--text-muted);">${cat ? `${escapeHtml(cat)} · Confidence: ${escapeHtml(conf)}` : 'Waiting for analysis…'}</div>

        ${shortReasons.length
          ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${shortReasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
          : `<div style="margin-top: 6px; color: var(--text-muted);">No short reasons yet.</div>`
        }

        ${observed.length
          ? `<div class="root-cause-note" style="margin-top: 8px;">Signals: ${escapeHtml(observed.join(' · '))}</div>`
          : ''
        }

        ${evidenceDetailsHtml}
      </div>
    `;
  }

  function inferBsodPart1FromSignals(s) {
    const hasAnyUsbSignal = !!(s && (s.hasAnyUsbSignal || s.hasAdb || s.hasFastboot || s.hasMtp || s.looksEdl || s.looksMtk || s.looksDownload || s.anyChange));

    if (!hasAnyUsbSignal) {
      return {
        primaryReason: 'Inconclusive (no USB visibility)',
        confidence: 'low',
        reasons: [
          'No USB visibility from this PC (no transport/MTP/ADB/fastboot).',
          'USB-only cannot confirm BSOD vs hard freeze vs USB disabled vs bad cable/port in this state.',
        ],
      };
    }

    const hasAdb = !!(s && s.hasAdb);
    const hasFastboot = !!(s && s.hasFastboot);
    const hasMtp = !!(s && s.hasMtp);
    const anyChange = !!(s && s.anyChange);
    const looksEdl = !!(s && s.looksEdl);
    const looksMtk = !!(s && s.looksMtk);
    const looksDownload = !!(s && s.looksDownload);
    const genericUsbOnly = !!(s && s.genericUsbOnly);
    const cameraLooksNotBsod = !!(s && s.cameraLooksNotBsod);
    const cameraDialogHint = !!(s && s.cameraDialogHint);
    const cameraUiCrashDetected = !!(s && s.cameraUiCrashDetected);
    const cameraSuggestsBsodStyle = !!(s && s.cameraSuggestsBsodStyle);
    const cameraIsDark = !!(s && s.cameraIsDark);
    const cameraDarkStable = !!(s && s.cameraDarkStable);
    const techUiFrozen = !!(s && s.techUiFrozen);

    const mtpProbeTimedOut = !!(s && s.mtpProbeTimedOut);
    const mtpProbeStillEnumerated = (s && typeof s.mtpProbeStillEnumerated === 'boolean') ? s.mtpProbeStillEnumerated : true;
    const mtpProbeUnresponsive = !!(s && s.mtpProbeUnresponsive);
    const mtpProbeZeroDevices = !!(s && s.mtpProbeZeroDevices);
    const hostUnsupported = !!(s && s.hostUnsupported);

    const stableMtpWithoutAdb = !!(hasMtp && !hasAdb && !hasFastboot && !looksEdl && !looksMtk && !looksDownload && !anyChange);
    const mtpWithoutAdb = !!(hasMtp && !hasAdb && !hasFastboot && !looksEdl && !looksMtk && !looksDownload);
    // UI-freeze evidence (high weight):
    // - Technician confirms the UI is frozen/unresponsive
    // - Webcam detects ANR/System UI crash text (cameraUiCrashDetected)
    //
    // Rule update (requested): when we have device-side UI-crash evidence AND MTP is present but unresponsive,
    // classify as software UI freeze even if USB sampling shows instability.
    // We still require some "MTP unresponsive" indicator (deep timeout / heartbeat / 0-device mismatch)
    // to avoid camera-only false positives.
    const mtpUnresponsiveHint = !!(
      mtpProbeStillEnumerated
      && (mtpProbeTimedOut || mtpProbeUnresponsive || mtpProbeZeroDevices)
    );
    const mtpUiFreezeByWebcam = mtpWithoutAdb
      && !cameraLooksNotBsod
      && (cameraUiCrashDetected || cameraDialogHint)
      && mtpUnresponsiveHint;
    const mtpUiFreezeByTech = mtpWithoutAdb && !cameraLooksNotBsod && techUiFrozen;
    const mtpUiFreezeSuspected = mtpUiFreezeByTech || mtpUiFreezeByWebcam;

    if (genericUsbOnly && !hasAdb && !hasFastboot && !hasMtp && !looksEdl && !looksMtk && !looksDownload) {
      return {
        primaryReason: 'Inconclusive (generic USB device only)',
        confidence: 'low',
        reasons: [
          'Windows enumerated a generic USB transport device, but it was not identified as phone-like (no MTP/ADB/fastboot).',
          'This can be the phone (generic composite driver) or another USB device; re-test by unplugging other USB devices and re-plugging the phone.',
        ],
      };
    }

    if (looksDownload) {
      return {
        primaryReason: 'OS / firmware corruption (Samsung Download/Odin mode)',
        confidence: 'high',
        reasons: [
          'Device enumerates as a Samsung Download/Odin (CDC composite) transport; Android OS is not booting normally.',
          'This is a firmware repair / boot-chain recovery state (authorized flash tools required).',
        ],
      };
    }

    if (looksEdl || looksMtk) {
      return {
        primaryReason: 'OS / firmware corruption (low-level mode)',
        confidence: 'high',
        reasons: [
          'Device enumerates as EDL/Preloader-like USB transport; Android OS is not booting normally.',
          'This often indicates firmware/boot chain failure or a deep recovery state.',
        ],
      };
    }

    if (hasFastboot && !hasAdb) {
      return {
        primaryReason: 'OS / firmware corruption (bootloader-only)',
        confidence: 'medium',
        reasons: [
          'Fastboot/bootloader is visible but Android (ADB) is not.',
          'This often indicates boot crash loop, corrupted system, or stuck boot mode.',
        ],
      };
    }

    if (hasAdb) {
      return {
        primaryReason: 'Display hardware / connector fault (OS alive)',
        confidence: 'medium',
        reasons: [
          'ADB visibility suggests the OS is running and USB communication is healthy.',
          'For BSOD-like complaints while ADB is online, the display/backlight/connector path is a common root cause.',
        ],
      };
    }

    if (hasMtp && !hasAdb) {
      if (mtpUiFreezeSuspected) {
        return {
          primaryReason: 'BSOD (UI freeze) — likely 3rd-party app (MTP visible)',
          confidence: (mtpUiFreezeByTech || mtpUiFreezeByWebcam) ? 'high' : 'low',
          reasons: [
            'MTP suggests the phone is partially booted/alive, but it appears unresponsive (no ADB/fastboot).',
            mtpUiFreezeByTech
              ? 'Technician confirmed the screen/UI is frozen and unresponsive.'
              : (mtpUiFreezeByWebcam
                ? (hostUnsupported
                  ? 'Webcam detected an ANR/System UI crash dialog (OCR). Note: MTP probe failed due to COM/WPD on this PC, so host-side verification is limited.'
                  : 'Webcam detected an ANR/System UI crash dialog hint; this strongly fits a UI freeze often triggered by a 3rd-party app or heavy system load.')
                : undefined
              ),
            (anyChange && mtpUiFreezeByWebcam)
              ? 'Note: USB sampling showed some instability, but the on-screen ANR/System UI dialog is stronger device-side evidence than host USB noise.'
              : undefined,
          ],
        };
      }

      if (stableMtpWithoutAdb && cameraIsDark && cameraDarkStable && !cameraLooksNotBsod && !cameraDialogHint && !cameraUiCrashDetected && !techUiFrozen) {
        return {
          primaryReason: 'Device is connected (MTP). Screen state unclear from webcam',
          confidence: 'low',
          reasons: [
            'MTP is visible and USB transport appears stable, but webcam frames are dark/unclear.',
            'Dark webcam frames alone do not confirm a BSOD/UI-freeze condition.',
            'This pattern is usually a screen-off/angle/lighting issue unless additional freeze evidence appears.',
          ],
        };
      }

      if (mtpWithoutAdb && hostUnsupported && !techUiFrozen) {
        return {
          primaryReason: 'Inconclusive — host COM interface error (MTP probe unavailable)',
          confidence: 'low',
          reasons: [
            'MTP probe failed due to a host COM interface error. Cannot assess the phone\'s state.',
            'Please reinstall Windows Portable Devices drivers or test on another PC.',
            'If you can visually see the phone is normal, ignore this result.',
            'Automatic freeze detection is limited on this host until the COM/WPD issue is fixed.',
          ],
        };
      }

      // Requested behavior: do NOT jump to hardware when MTP is present but unresponsive.
      // If we have an MTP-unresponsive hint but no UI-crash text and no tech confirmation,
      // keep it explicitly inconclusive and ask for confirmation.
      if (mtpWithoutAdb && mtpUnresponsiveHint && !cameraUiCrashDetected && !techUiFrozen) {
        return {
          primaryReason: 'Inconclusive — MTP present but intermittently unresponsive',
          confidence: 'medium',
          reasons: [
            'Windows enumerates MTP/portable storage, but MTP commands are not responsive.',
            'This can be a temporary host/device communication issue, not necessarily a BSOD/UI-freeze.',
            'Re-test with another cable/port/PC and rely on stronger evidence before classifying BSOD.',
          ],
        };
      }
      return {
        primaryReason: 'Device is connected (MTP). ADB not enabled/authorized',
        confidence: 'low',
        reasons: [
          'MTP suggests the phone is at least partially booted, but ADB is not available.',
          'This often means USB debugging is disabled or the PC is not trusted yet; this is not a BSOD signal by itself.',
        ],
      };
    }

    if (anyChange) {
      return {
        primaryReason: 'Host USB driver / cable instability',
        confidence: 'medium',
        reasons: [
          'USB state changed during sampling; this often points to cable/port/hub/driver or power instability.',
          'Stabilize the USB link before concluding a phone hardware fault.',
        ],
      };
    }

    return {
      primaryReason: 'Power / mainboard or deep hardware failure',
      confidence: 'low',
      reasons: [
        'No ADB/Fastboot/MTP signals were observed beyond basic USB detection.',
        'This pattern can occur with power/mainboard faults, dead battery/power IC, or severe boot failure.',
      ],
    };
  }

  function inferSignalDiagnosis(s) {
    const techUiFrozenAdbAlive = (() => {
      try {
        if (typeof window === 'undefined') return false;
        const el = document.getElementById('bsod-tech-ui-frozen-adb-alive');
        return !!(el && el.checked);
      } catch {
        return false;
      }
    })();

    const part1 = inferBsodPart1FromSignals(s);
    const stableMtpWithoutAdb = !!(s && s.hasMtp && !s.hasAdb && !s.hasFastboot && !s.looksEdl && !s.looksMtk && !s.looksDownload && !s.anyChange);
    const mtpWithoutAdb = !!(s && s.hasMtp && !s.hasAdb && !s.hasFastboot && !s.looksEdl && !s.looksMtk && !s.looksDownload);
    const hasAnyUsbSignal = !!(s && (s.hasAnyUsbSignal || s.hasAdb || s.hasFastboot || s.hasMtp || s.looksEdl || s.looksMtk || s.looksDownload || s.anyChange));
    const genericUsbOnly = !!(s && s.genericUsbOnly);
    const cameraLooksNotBsod = !!(s && s.cameraLooksNotBsod);
    const cameraDialogHint = !!(s && s.cameraDialogHint);
    const cameraUiCrashDetected = !!(s && s.cameraUiCrashDetected);
    const cameraSuggestsBsodStyle = !!(s && s.cameraSuggestsBsodStyle);
    const cameraIsDark = !!(s && s.cameraIsDark);
    const techUiFrozen = !!(s && s.techUiFrozen);
    const cameraDarkStable = !!(s && s.cameraDarkStable);
    const mtpProbeTimedOut = !!(s && s.mtpProbeTimedOut);
    const mtpProbeStillEnumerated = (s && typeof s.mtpProbeStillEnumerated === 'boolean') ? s.mtpProbeStillEnumerated : true;
    const mtpProbeUnresponsive = !!(s && s.mtpProbeUnresponsive);
    const mtpProbeZeroDevices = !!(s && s.mtpProbeZeroDevices);
    const mtpProbeLimited = !!(s && s.mtpProbeLimited);
    const mtpProbeHardFail = !!(s && s.mtpProbeHardFail);
    const mtpProbeNotFound = !!(s && s.mtpProbeNotFound);
    const hostUnsupported = !!(s && s.hostUnsupported);

    const looksDownload = !!(s && s.looksDownload);
    // New rule:
    // If MTP present AND (deep MTP command times out OR webcam detects System UI crash/ANR dialog)
    // AND USB transport stable -> classify as BSOD (UI freeze likely 3rd-party app).
    //
    // We require "still enumerated" for timeout-based freezes to avoid confusing disconnects with hangs.
    const mtpUiFreezeByTimeout = stableMtpWithoutAdb && mtpProbeTimedOut && mtpProbeStillEnumerated;
    const mtpUiFreezeByProbeFailure = stableMtpWithoutAdb && mtpProbeHardFail && mtpProbeStillEnumerated;
    // Webcam dialog text (ANR/System UI crash) is supporting evidence only.
    // Require at least one of:
    // - deep MTP timeout / confirmed unresponsiveness (mtpProbeTimedOut/mtpProbeUnresponsive)
    // - technician confirmation
    // Camera dialog hints are reliability-gated in runCameraCheck.
    const mtpUiFreezeByWebcam = mtpWithoutAdb
      && !cameraLooksNotBsod
      && (cameraUiCrashDetected || cameraDialogHint)
      && (techUiFrozen || mtpProbeTimedOut || mtpProbeUnresponsive || mtpProbeZeroDevices);
    const mtpUiFreezeByBlackScreen = stableMtpWithoutAdb
      && !cameraLooksNotBsod
      && cameraIsDark
      && cameraDarkStable
      && (techUiFrozen || mtpProbeHardFail || mtpProbeTimedOut);
    const mtpUiFreezeByTech = stableMtpWithoutAdb && techUiFrozen;

    // Stable MTP + no ADB/Fastboot + no USB state changes, but deep MTP commands
    // are unresponsive / return zero devices.
    // Treat as a UI-freeze style case even without webcam/tech confirmation.
    const mtpUiFreezeByStableUnresponsive = !!(
      stableMtpWithoutAdb
      && (mtpProbeUnresponsive || mtpProbeZeroDevices)
    );

    // ADB can remain alive during a UI freeze on some devices.
    // Detect BSOD-style UI freeze when ADB is visible but MTP becomes unresponsive,
    // using either tech confirmation or stable dark webcam frames.
    const mtpUiFreezeByAdbAlive = !!(
      s
      && s.hasAdb
      && s.hasMtp
      && !s.hasFastboot
      && !s.looksEdl
      && !s.looksMtk
      && !s.looksDownload
      && mtpProbeStillEnumerated
      && (mtpProbeUnresponsive || mtpProbeZeroDevices || mtpProbeTimedOut)
      && (techUiFrozenAdbAlive || techUiFrozen || (!cameraLooksNotBsod && cameraIsDark && cameraDarkStable))
    );
    const mtpDarkOnlyHint = !!(
      stableMtpWithoutAdb
      && cameraIsDark
      && cameraDarkStable
      && !cameraLooksNotBsod
      && !cameraDialogHint
      && !cameraUiCrashDetected
      && !techUiFrozen
      && !hostUnsupported
      && !mtpProbeTimedOut
      && !mtpProbeUnresponsive
      && !mtpProbeZeroDevices
    );

    const mtpUnresponsiveNeedsConfirm = !!(
      mtpWithoutAdb
      && mtpProbeStillEnumerated
      && (mtpProbeUnresponsive || mtpProbeZeroDevices)
      && !hostUnsupported
      && !techUiFrozen
      && !mtpUiFreezeByTimeout
      && !mtpUiFreezeByProbeFailure
      && !mtpUiFreezeByWebcam
    );

    const mtpUiFreeze = mtpUiFreezeByTech
      || mtpUiFreezeByTimeout
      || mtpUiFreezeByProbeFailure
      || mtpUiFreezeByWebcam
      || mtpUiFreezeByBlackScreen
      || mtpUiFreezeByStableUnresponsive;

    const mtpUiFreeze2 = mtpUiFreeze || mtpUiFreezeByAdbAlive;

    // Dark-only camera evidence should not force BSOD classification.
    const mtpDarkNeedsConfirm = false;

    const mtpUiFreezeHigh = !!(
      mtpUiFreezeByTech
      || (mtpWithoutAdb
        && !cameraLooksNotBsod
        && cameraUiCrashDetected
        && (mtpProbeTimedOut || mtpProbeUnresponsive || mtpProbeZeroDevices)
      )
      || (mtpWithoutAdb
        && !cameraLooksNotBsod
        && cameraIsDark
        && cameraUiCrashDetected
        && (mtpProbeTimedOut || mtpProbeUnresponsive || mtpProbeZeroDevices)
      )
    );

    const unstablePhoneResetLoop = !!(
      s
      && s.anyChange
      && !s.hasAdb
      && !s.hasFastboot
      && !s.hasMtp
      && !s.genericUsbOnly
      && s.hasAnyUsbSignal
    );

    function mapBsod5KeyToLabel(key) {
      const k = String(key || '');
      if (k === 'corrupt_system_files') return 'Corrupt system files';
      if (k === 'faulty_os_updates') return 'Faulty OS updates';
      if (k === 'incompatible_apps') return 'Incompatible apps';
      if (k === 'overheating') return 'Overheating';
      if (k === 'hardware_failure') return 'Hardware failure';
      if (k === 'not_bsod') return 'Not BSOD';
      return k || 'Unknown';
    }

    // Explicit “required 5” mapping for fallback mode (no offline AI helper).
    // Product rule: do not present an "Inconclusive" BSOD verdict to the end user
    // in this BSOD-only view. Formerly-inconclusive USB-only patterns are mapped to:
    // - `incompatible_apps` (BSOD-style UI freeze suspected), or
    // - `not_bsod` (Not confirmed as a BSOD-style boot failure from USB-only signals).
    let bsod5Key = 'not_bsod';

    if (!hasAnyUsbSignal) {
      bsod5Key = 'not_bsod';
    } else
    if (genericUsbOnly) {
      bsod5Key = 'not_bsod';
    } else
    if (s && s.cameraLooksNotBsod) {
      bsod5Key = 'not_bsod';
    } else if (looksDownload) {
      // Samsung Download/Odin mode: firmware repair state (Android not booted).
      bsod5Key = 'faulty_os_updates';
    } else if (mtpUiFreeze2) {
      // Treat "MTP alive but unresponsive" as a UI-freeze style case.
      // Map to the BSOD-5 bucket that best matches "3rd party app freeze/ANR".
      bsod5Key = 'incompatible_apps';
    } else if (mtpUnresponsiveNeedsConfirm) {
      // MTP is enumerated but deep MTP commands are unresponsive/return 0 devices
      // while still enumerated, with no ADB. Treat as a BSOD-style UI freeze suspected.
      bsod5Key = 'incompatible_apps';
    } else if (hostUnsupported && mtpWithoutAdb && !techUiFrozen) {
      // COM/WPD host limitation: cannot confirm BSOD. Treat as not confirmed.
      bsod5Key = 'not_bsod';
    } else if (s && (s.looksEdl || s.looksMtk)) {
      // Low-level modes are below Android; this can be firmware/corruption OR hardware/storage.
      // We classify as Hardware failure for the required-5 bucket, with reasons explaining ambiguity.
      bsod5Key = 'hardware_failure';
    } else if (s && (s.hasFastboot && !s.hasAdb)) {
      bsod5Key = 'faulty_os_updates';
    } else if (s && s.hasAdb && !s.hasFastboot && !s.looksEdl && !s.looksMtk) {
      // If ADB is online, Android is alive enough to talk to the PC.
      // A black/dark screen in this state is usually a display/backlight/
      // connector issue, not a BSOD-style boot failure.
      bsod5Key = 'not_bsod';
    } else if (s && s.hasAdb) {
      bsod5Key = 'hardware_failure';
    } else if (s && s.anyChange) {
      bsod5Key = 'hardware_failure';
    } else if (s && s.hasMtp && !s.hasAdb) {
      // MTP without ADB is usually just "USB debugging off / not trusted".
      // Only treat as failure when USB is unstable or other strong signals exist.
      bsod5Key = stableMtpWithoutAdb ? 'not_bsod' : 'hardware_failure';
    } else {
      bsod5Key = 'hardware_failure';
    }

    if (mtpUiFreezeByStableUnresponsive) {
      bsod5Key = 'incompatible_apps';
    }

    if (mtpUiFreezeByAdbAlive) {
      bsod5Key = 'incompatible_apps';
    }

    // IMPORTANT: "not_bsod" does not mean "no problem".
    // It means we do not see evidence of a deep boot-chain failure from USB-only signals.
    // When ADB is online, the OS is alive; a black/blue screen is often display-path related.
    const statusText = (() => {
      if (looksDownload) return 'OS corruption / firmware mode (Samsung Download/Odin)';
      if (mtpUiFreezeByAdbAlive) return 'BSOD – UI freeze detected (ADB alive)';
      if (mtpUiFreeze2) return 'BSOD – UI freeze detected';
      if (mtpUnresponsiveNeedsConfirm) return 'BSOD – UI freeze suspected (MTP unresponsive)';
      if (bsod5Key !== 'not_bsod') return 'BSoD detected';
      if (s && s.hasAdb) return 'No deep boot failure evidence (OS alive)';
      if (stableMtpWithoutAdb) return 'No deep boot failure evidence (MTP alive)';
      return 'No deep boot failure evidence (USB-only)';
    })();

    const pr = part1 && part1.primaryReason ? String(part1.primaryReason) : '';
    let group = '';
    if (/display|power|mainboard|hardware/i.test(pr)) group = 'Hardware';
    else if (/os\s*\/\s*firmware|bootloader|low-level|corrupt/i.test(pr)) group = 'OS corruption / firmware';
    else if (/host usb|driver|cable|enumeration/i.test(pr)) group = 'Other (Host USB)';
    else group = 'Other';

    const suggestedFixes = [];
    if (looksDownload) {
      suggestedFixes.push('Device is in Samsung Download/Odin mode (CDC composite) — Android is not booting.');
      suggestedFixes.push('Use authorized Samsung firmware repair tools/workflows to flash stock firmware (data risk applies).');
      suggestedFixes.push('To exit Download mode, try a long Power press (model-dependent) and then re-test normal boot.');
    } else if (mtpUnresponsiveNeedsConfirm) {
      suggestedFixes.push('Windows enumerates MTP/portable storage, but MTP commands are unresponsive.');
      suggestedFixes.push('Treat this as a BSOD-style UI freeze suspected (often caused by a 3rd-party app hang) until proven otherwise.');
      suggestedFixes.push('Try another cable/port/PC, then re-test. If stable and repeatable, boot Safe Mode (if supported) and uninstall recently added apps.');
      suggestedFixes.push('If ADB becomes available, capture logcat and look for repeated app/system crashes.');
      suggestedFixes.push('Remove/disable recently installed apps when possible; factory reset is a last resort after backup.');
    } else if (hostUnsupported && mtpWithoutAdb) {
      suggestedFixes.push('MTP probe failed (host COM/WPD error). This PC cannot auto-detect freeze reliably.');
      suggestedFixes.push('Reinstall Windows Portable Devices drivers or test on another PC, then re-test.');
    } else if (genericUsbOnly) {
      suggestedFixes.push('A generic USB transport device is present, but it was not identified as phone-like (no MTP/ADB/fastboot).');
      suggestedFixes.push('Try another data-capable cable/port; some charge-only cables will never enumerate data.');
      suggestedFixes.push('Test on another PC to confirm phone enumeration.');
    } else if (!hasAnyUsbSignal) {
      suggestedFixes.push('No USB signal was detected from this PC. This can be caused by a bad cable/port, the phone disabling USB, or a hard freeze.');
      suggestedFixes.push('Force reboot the phone (hold Power for ~10–20 seconds; some models: Power+Vol Down).');
      suggestedFixes.push('Retry with a known-good data cable + direct USB port (avoid hubs).');
      suggestedFixes.push('If possible, test on another PC to separate phone-side vs PC-side USB problems.');
    } else if (bsod5Key === 'faulty_os_updates' || bsod5Key === 'corrupt_system_files') {
      suggestedFixes.push('Force reboot the phone (hold Power for ~10–20 seconds).');
      suggestedFixes.push('Try a known-good data cable + direct USB port (avoid hubs).');
      suggestedFixes.push('If it only appears in bootloader/fastboot, use authorised OEM recovery/repair steps; consider factory reset if data recovery is not required.');
      suggestedFixes.push('If the issue persists, reflash/update using official tools (authorised service procedure).');
    } else if (bsod5Key === 'overheating') {
      suggestedFixes.push('Stop charging, remove any case, and let the phone cool down before re-testing.');
      suggestedFixes.push('If overheating returns quickly, suspect battery/power IC or thermal path; refer for board-level inspection.');
    } else if (bsod5Key === 'incompatible_apps') {
      if (mtpUiFreeze2) {
        suggestedFixes.push('Pattern: MTP is visible but the UI appears unresponsive. Treat as a UI freeze (ANR/System UI hang) until proven otherwise.');
        suggestedFixes.push('Likely cause: a 3rd-party app freeze/ANR or a heavy system load condition.');
        suggestedFixes.push('If you can, force reboot the phone (hold Power ~10–20 seconds), then boot normally and uninstall recently installed apps.');
        suggestedFixes.push('If the issue repeats, boot Safe Mode (if supported) to confirm a 3rd-party app cause.');
      }
      suggestedFixes.push('If ADB becomes available, capture logcat and look for repeated app/system crashes.');
      suggestedFixes.push('Remove/disable recently installed apps when possible; factory reset is a last resort after backup.');
    } else if (bsod5Key === 'hardware_failure') {
      suggestedFixes.push('Try a known-good data cable + direct USB port (avoid hubs).');
      suggestedFixes.push('If Windows shows a Device Manager error, note the device name/status/problem code (driver vs hardware clue).');
      suggestedFixes.push('If ADB is online but the complaint persists, inspect/replace the display assembly and re-seat connectors.');
      suggestedFixes.push('If no phone signals are detected, treat as power/mainboard/USB-port fault and refer for professional repair.');
    }

    // Common low-risk physical isolations (do not depend on user answers).
    suggestedFixes.push('If present, remove SD card (and SIM if needed) to rule out accessory-related boot issues, then re-test.');
    suggestedFixes.push('If the model has a removable battery, re-seat it; otherwise force reboot.');

    // If ADB is online, add the most relevant non-destructive guidance for the
    // common "screen black but phone alive" pattern even when we classify as not_bsod.
    try {
      if (bsod5Key === 'not_bsod' && mtpDarkOnlyHint) {
        suggestedFixes.push('MTP is stable and responsive. Dark webcam frames alone do not indicate BSOD; adjust camera/lighting and continue normal diagnostics.');
      }
      if (s && s.hasAdb) {
        suggestedFixes.push('ADB is visible: Android OS is running. If the screen is black/blue, prioritize display/backlight/connector path checks.');
        suggestedFixes.push('If possible, test non-screen signs of life (vibrate, flashlight, sound) to confirm the board is alive.');
      }
    } catch {
      // best-effort
    }

    return {
      note: 'Derived from USB-only signals (fallback / cross-check).',
      bsodStatusText: statusText,
      possibleCauseGroup: group,
      bsod5Key,
      bsod5Label: bsod5Key === 'inconclusive' ? 'Inconclusive' : mapBsod5KeyToLabel(bsod5Key),
      actions: suggestedFixes,
      crossCheckTitle: pr,
      crossCheckConfidence: (mtpUiFreezeHigh ? 'high' : ((mtpUnresponsiveNeedsConfirm || mtpDarkNeedsConfirm) ? 'medium' : ((mtpUiFreezeByWebcam || mtpUiFreezeByBlackScreen || mtpUiFreezeByProbeFailure || mtpUiFreezeByStableUnresponsive || mtpUiFreezeByAdbAlive) ? 'medium' : (part1 && part1.confidence ? String(part1.confidence) : 'low')))),
      hostUnsupported: hostUnsupported,
      patternKey: looksDownload
        ? 'samsung_download'
        : (mtpUiFreeze2
          ? 'mtp_ui_freeze'
          : (unstablePhoneResetLoop ? 'usb_unstable_phone' : '')),
    };
  }

  function renderAiConclusion(state, payload) {
    if (!aiConclusionEl) return;

    const i18n = (() => {
      try {
        return window.SmartHubI18n || { t: k => k, getCurrentLang: () => 'en' };
      } catch {
        return { t: k => k, getCurrentLang: () => 'en' };
      }
    })();

    function tMaybe(key, fallback) {
      const out = i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
      return out === key ? fallback : out;
    }

    function readSmartHubOnlineAiStatus() {
      try {
        const s = window.__smartHubOnlineAiStatus;
        if (s && typeof s === 'object' && typeof s.state === 'string') {
          return { online: s.state === 'on' || !!s.online };
        }
      } catch {
        // ignore
      }
      return { online: false };
    }

    function renderSmartHubAiTitle() {
      const status = readSmartHubOnlineAiStatus();
      let statusText;
      let statusClass;
      if (typeof REQUIRE_ONLINE_AI_FOR_BSOD !== 'undefined' && REQUIRE_ONLINE_AI_FOR_BSOD === false) {
        statusText = 'Built-in';
        statusClass = 'ai-online-chip-off';
      } else {
        statusText = status.online ? 'Online' : 'Offline';
        statusClass = status.online ? 'ai-online-chip-on' : 'ai-online-chip-off';
      }
      return `<strong class="ai-title-wrap"><span class="ai-title-text">${escapeHtml(i18n.t('ai.offline.title'))}</span><span class="ai-online-chip ${statusClass}"><span class="ai-online-chip-dot"></span>${escapeHtml(statusText)}</span></strong>`;
    }

    function renderBsodHighlightRow(opts) {
      const statusText = opts && opts.statusText ? String(opts.statusText) : '';
      const causeGroup = opts && opts.causeGroup ? String(opts.causeGroup) : '';
      const bsod5Label = opts && opts.bsod5Label ? String(opts.bsod5Label) : '';
      const isInconclusive = !!(opts && opts.isInconclusive);

      const isDetected = opts && typeof opts.isDetected === 'boolean'
        ? opts.isDetected
        : statusText === 'BSoD detected';
      const isNot = opts && typeof opts.isNot === 'boolean'
        ? opts.isNot
        : statusText === 'No Symptoms of BSoD';
      const iconClass = isDetected ? 'bad' : (isNot ? 'ok' : 'warn');
      const iconChar = isDetected ? '!' : (isNot ? '✓' : '⚠');

      const rightParts = [];
      if (isDetected && causeGroup) rightParts.push(`${escapeHtml(i18n.t('ai.bsod.possibleCause'))} ${escapeHtml(causeGroup)}`);
      if ((isDetected || isInconclusive) && bsod5Label) rightParts.push(`${escapeHtml(i18n.t('ai.bsod.required5'))}: ${escapeHtml(bsod5Label)}`);

      const right = rightParts.length
        ? `<div class="quick-check-detail" style="margin-top: 2px;">${rightParts.join(' · ')}</div>`
        : '';

      const title = statusText ? escapeHtml(statusText) : escapeHtml('BSoD status: Unknown');

      return `
        <div class="quick-check-item" style="margin-top: 8px;">
          <span class="quick-check-icon ${iconClass}">${escapeHtml(iconChar)}</span>
          <div class="quick-check-content">
            <div class="quick-check-label">${title}</div>
            ${right}
          </div>
        </div>
      `;
    }

    function mapCause(key, labelText) {
      const k = String(key || '').trim();
      if (!k) return labelText ? String(labelText) : 'Unknown';
      if (k === 'software_firmware') return tMaybe('ai.cause.software_firmware', 'OS / firmware corruption or boot crash loop');
      if (k === 'display_hardware') return tMaybe('ai.cause.display_hardware', 'Display hardware / connector / panel fault');
      if (k === 'low_level_mode') return tMaybe('ai.cause.low_level_mode', 'Device is in low-level recovery mode (EDL / Preloader / DFU)');
      if (k === 'host_usb_driver') return tMaybe('ai.cause.host_usb_driver', 'PC-side USB driver / enumeration issue');
      if (k === 'power_mainboard') return tMaybe('ai.cause.power_mainboard', 'Power / mainboard / deep hardware failure');
      if (k === 'not_bsod') return tMaybe('ai.cause.not_bsod', 'Not a BSOD-style case (screen content appears normal)');
      return labelText ? String(labelText) : k;
    }

    function mapBsod5KeyToLabel(key) {
      const k = String(key || '').trim();
      if (!k) return 'Unknown';
      const fallback = (() => {
        if (k === 'inconclusive') return 'Inconclusive';
        if (k === 'corrupt_system_files') return 'Corrupt system files';
        if (k === 'faulty_os_updates') return 'Faulty OS updates';
        if (k === 'incompatible_apps') return 'Incompatible apps';
        if (k === 'overheating') return 'Overheating';
        if (k === 'hardware_failure') return 'Hardware failure';
        if (k === 'not_bsod') return 'Not BSOD';
        return k;
      })();
      return tMaybe(`ai.bsod5.${k}`, fallback);
    }

    function renderSimilarCases(similar) {
      const items = Array.isArray(similar) ? similar.filter(Boolean).slice(0, 5) : [];
      if (!items.length) return '';
      return `
        <div style="margin-top: 10px;">
          <div class="root-cause-note">Similar past cases (SmartHub AI support memory):</div>
          <ul style="margin: 6px 0 0; padding-left: 18px;">
            ${items
              .map(it => {
                const device = it && it.device_primary ? String(it.device_primary) : 'Device';
                const topLabel = it && it.top_label ? String(it.top_label) : '';
                const sim = it && typeof it.similarity === 'number' ? it.similarity : null;
                const simTxt = sim != null ? ` (similarity ${(sim * 100).toFixed(0)}%)` : '';
                const text = topLabel ? `${device}: ${topLabel}${simTxt}` : `${device}${simTxt}`;
                return `<li>${escapeHtml(text)}</li>`;
              })
              .join('')}
          </ul>
        </div>
      `;
    }

    function renderOnlineAiSummary(onlinePayload) {
      const online = onlinePayload && typeof onlinePayload === 'object' ? onlinePayload : null;
      if (!online) return '';

      const text = online && typeof online.text === 'string' ? online.text.trim() : '';
      const error = online && typeof online.error === 'string' ? online.error.trim() : '';
      const required = !!(online && online.required === true);
      const hasUsedFlag = !!(online && Object.prototype.hasOwnProperty.call(online, 'used'));
      const used = hasUsedFlag ? !!online.used : !!text;

      const citationItemsRaw = online && Array.isArray(online.citations) ? online.citations : [];
      const citationItems = citationItemsRaw
        .map((it) => {
          if (!it || typeof it !== 'object') return null;
          const title = typeof it.title === 'string' ? it.title.trim() : '';
          const url = typeof it.url === 'string' ? it.url.trim() : '';
          const snippet = typeof it.snippet === 'string' ? it.snippet.trim() : '';
          const source = typeof it.source === 'string' ? it.source.trim() : '';
          const query = typeof it.query === 'string' ? it.query.trim() : '';
          return { title, url, snippet, source, query };
        })
        .filter(Boolean)
        .filter((it) => it && /^https?:\/\//i.test(String(it.url || '')))
        .slice(0, 5);

      const webSearch = online && online.webSearch && typeof online.webSearch === 'object'
        ? online.webSearch
        : null;
      const webProvider = webSearch && typeof webSearch.provider === 'string' ? webSearch.provider.trim() : '';
      const webHitCount = webSearch && Number.isFinite(Number(webSearch.hitCount)) ? Number(webSearch.hitCount) : null;
      const webQueries = webSearch && Array.isArray(webSearch.queries)
        ? webSearch
          .queries
          .map((q) => String(q || '').trim())
          .filter(Boolean)
          .slice(0, 3)
        : [];

      const statusLine = used
        ? 'AI used: Online'
        : 'AI used: Built-in (local)';
      const errTrimmed = error.length > 320 ? `${error.slice(0, 320)}...` : error;
      const textNoFooter = text.replace(/\n\s*web references\s*:\s*[\s\S]*$/i, '').trim();
      const trimmed = textNoFooter.length > 3200 ? `${textNoFooter.slice(0, 3200)}...` : textNoFooter;
      const detailsLine = used
        ? (trimmed || 'AI returned an empty summary.')
        : (errTrimmed || 'Built-in AI provided the diagnostic summary.');

      const evidenceHtml = (used && citationItems.length)
        ? `
          <div class="no-debug-label" style="margin-top: 10px;">Web evidence citations</div>
          ${(webProvider || webHitCount != null)
            ? `<div class="ai-result-meta" style="margin-top: 4px;">${escapeHtml([webProvider ? `provider: ${webProvider}` : '', webHitCount != null ? `hits: ${webHitCount}` : ''].filter(Boolean).join(' · '))}</div>`
            : ''
          }
          ${webQueries.length
            ? `<div class="ai-result-meta" style="margin-top: 4px;">queries: ${escapeHtml(webQueries.join(' | '))}</div>`
            : ''
          }
          <ul style="margin: 6px 0 0; padding-left: 18px;">
            ${citationItems
              .map((it, idx) => {
                const title = it.title || it.source || `Source ${idx + 1}`;
                const meta = [it.source || '', it.query ? `query: ${it.query}` : ''].filter(Boolean).join(' · ');
                const snippet = it.snippet
                  ? `<div class="root-cause-note" style="margin-top: 2px;">${escapeHtml(it.snippet)}</div>`
                  : '';
                return `<li><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${meta ? ` <span class="root-cause-note">(${escapeHtml(meta)})</span>` : ''}${snippet}</li>`;
              })
              .join('')}
          </ul>
        `
        : '';

      return `
        <div class="no-debug-label" style="margin-top: 10px;">Built-in AI support summary</div>
        <div class="ai-result-meta" style="margin-top: 4px;">${escapeHtml(statusLine)}</div>
        <div class="ai-result-meta" style="margin-top: 4px; white-space: pre-wrap;">${escapeHtml(detailsLine)}</div>
        ${evidenceHtml}
      `;
    }

    if (state === 'no-device') {
      aiConclusionEl.innerHTML = `
        <div class="ai-result-box ui-fade-in">
          <div class="ai-result-title">
            ${renderSmartHubAiTitle()}
            <span class="ai-result-meta" style="margin-top: 0;">${escapeHtml(i18n.t('ai.state.noDevice'))}</span>
          </div>
          <div class="ai-result-meta">${escapeHtml(i18n.t('ai.offline.noSignals'))}</div>
          <div class="ai-result-meta" style="margin-top: 8px;">${escapeHtml(i18n.t('ai.offline.recoveryChecklist'))}</div>
          <ul style="margin: 6px 0 0; padding-left: 18px;">
            <li>Try another USB cable/port (avoid hubs).</li>
            <li>Unlock the phone and replug.</li>
            <li>Select “File transfer (MTP)” if prompted.</li>
            <li>Verify Windows USB drivers (Device Manager).</li>
            <li>Replug, then press ${escapeHtml(i18n.t('ai.offline.recheck'))}.</li>
          </ul>
        </div>
      `;
      return;
    }

    if (state === 'loading') {
      aiConclusionEl.innerHTML = `
        <div class="ai-result-box ui-fade-in">
          <div class="ai-result-title">
            ${renderSmartHubAiTitle()}
            <span class="ai-result-meta" style="margin-top: 0;">${escapeHtml(i18n.t('ai.state.working'))}</span>
          </div>
          <div class="ai-result-meta">${escapeHtml(i18n.t('ai.offline.analyzing'))}</div>
        </div>
      `;
      return;
    }

    if (state === 'error') {
      const msg = payload && payload.error ? String(payload.error) : 'AI helper unavailable.';
      const lower = msg.toLowerCase();
      const scriptMissing =
        lower.includes('helper script is missing') ||
        lower.includes('ai_adb_conclude.py') ||
        lower.includes('ai_diagnose.py');
      const pythonMissing =
        lower.includes('python') ||
        lower.includes('spawn') ||
        lower.includes('enoent') ||
        lower.includes('opencv') ||
        lower.includes('numpy');
      const enableHint = scriptMissing
        ? 'To enable: update/reinstall SmartHub Diagnostics (missing AI support scripts in the install folder).'
        : pythonMissing
          ? 'To enable: install Python 3 on this PC and see AI support/README.md.'
          : '';
      function renderFallback(fallback) {
        const fb = fallback && typeof fallback === 'object' ? fallback : null;
        if (!fb) return '';

        const bsod5Key = fb.bsod5Key ? String(fb.bsod5Key) : '';
        const isDetected = !!(bsod5Key && bsod5Key !== 'not_bsod');
        const isNot = !isDetected;
        const statusText = isDetected ? i18n.t('ai.bsod.status.detected') : i18n.t('ai.bsod.status.none');
        const causeGroup = fb.possibleCauseGroup ? String(fb.possibleCauseGroup) : '';
        const bsod5Label = mapBsod5KeyToLabel(bsod5Key);
        const actions = Array.isArray(fb.actions) ? fb.actions.filter(Boolean).slice(0, 6) : [];
        const note = fb.note ? String(fb.note) : '';

        return `
          <div class="no-debug-label" style="margin-top: 10px;">${escapeHtml(i18n.t('ai.label.signalFallback'))}</div>
          ${note ? `<div class="ai-result-meta" style="margin-top: 4px;">${escapeHtml(note)}</div>` : ''}
          ${renderBsodHighlightRow({ statusText, causeGroup, bsod5Label, isDetected, isNot })}
          ${actions.length
            ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${actions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
            : ''
          }
        `;
      }

      aiConclusionEl.innerHTML = `
        <div class="ai-result-box ui-fade-in">
          <div class="ai-result-title">
            ${renderSmartHubAiTitle()}
            <span class="ai-result-meta" style="margin-top: 0;">${escapeHtml(i18n.t('ai.state.unavailable'))}</span>
          </div>
          <div class="ai-result-meta">${escapeHtml(msg)}</div>
          ${renderOnlineAiSummary(payload && (payload.__onlineAi || payload.online))}
          ${enableHint
            ? `<div class="ai-result-meta" style="margin-top: 6px;">${escapeHtml(enableHint)}</div>`
            : ''
          }
          ${renderFallback(payload && payload.fallback)}

          <div class="no-debug-label" style="margin-top: 10px;">SmartHub AI support memory</div>
          <div id="bsod-ai-memory-save" class="ai-result-meta" style="margin-top: 2px;">Saving this case to SmartHub AI support memory…</div>
        </div>
      `;

      // Keep manual labeling available even when AI helper fails.
      (async () => {
        const selectEl = document.getElementById('bsod-ai-label-select');
        const btnEl = document.getElementById('bsod-ai-label-save-btn');
        const statusEl = document.getElementById('bsod-ai-label-status');
        if (!selectEl || !btnEl || !statusEl) return;

        const updateBtn = () => {
          const hasSelection = !!String(selectEl.value || '').trim();
          btnEl.disabled = labelRememberInFlight || !hasSelection;
        };

        updateBtn();
        selectEl.addEventListener('change', updateBtn);

        btnEl.addEventListener('click', async () => {
          const key = String(selectEl.value || '').trim();
          if (!key) return;

          if (!lastAiRememberPayload || !lastAiRememberPayload.connection) {
            statusEl.textContent = i18n.t('ai.labelCase.unavailable');
            return;
          }

          const outcome = `bsod5:${key}`;
          if (lastLabeledSeq === bsodDiagnoseRunSeq && lastLabeledOutcome === outcome) {
            statusEl.textContent = i18n.t('ai.labelCase.alreadySaved');
            return;
          }

          labelRememberInFlight = true;
          statusEl.textContent = i18n.t('ai.labelCase.saving');
          updateBtn();

          try {
            const res = await fetch('http://127.0.0.1:3333/ai-no-debug-remember', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                connection: buildConnectionWithTechConfirm(lastAiRememberPayload.connection),
                visual: lastAiRememberPayload.visual,
                outcome,
                note: `Labeled from BSOD diagnose UI (${outcome})`,
              }),
            });

            if (!res.ok) {
              statusEl.textContent = `${i18n.t('ai.labelCase.failed')} (HTTP ${res.status}).`;
              return;
            }

            const json = await res.json().catch(() => null);
            if (json && json.ok) {
              lastLabeledSeq = bsodDiagnoseRunSeq;
              lastLabeledOutcome = outcome;
              statusEl.textContent = i18n.t('ai.labelCase.saved');
            } else {
              statusEl.textContent = json && json.error ? String(json.error) : i18n.t('ai.labelCase.failed');
            }
          } catch {
            statusEl.textContent = i18n.t('ai.labelCase.failed');
          } finally {
            labelRememberInFlight = false;
            updateBtn();
          }
        });
      })();

      return;
    }

    const top = payload && payload.top && typeof payload.top === 'object' ? payload.top : null;
    const topKey = top && top.key ? String(top.key) : '';
    const label = top && top.label ? String(top.label) : '';
    const cause = mapCause(topKey, label);
    const conf = top && typeof top.confidence_calibrated === 'number'
      ? top.confidence_calibrated
      : (top && typeof top.confidence === 'number' ? top.confidence : null);
    const actions = (payload && Array.isArray(payload.actions)) ? payload.actions.filter(Boolean).slice(0, 6) : [];
    const mem = payload && payload.memory && typeof payload.memory === 'object' ? payload.memory : null;
    const similar = mem && Array.isArray(mem.similar) ? mem.similar : [];
    const memStats = mem && mem.stats && typeof mem.stats === 'object' ? mem.stats : null;
    const memTotal = memStats && typeof memStats.total === 'number' ? memStats.total : null;
    const memLabeled = memStats && typeof memStats.labeled === 'number' ? memStats.labeled : null;
    const memUnlabeled = memStats && typeof memStats.unlabeled === 'number' ? memStats.unlabeled : null;
    const memDistinct = memStats && typeof memStats.distinct_cases === 'number' ? memStats.distinct_cases : null;
    const memRepeats = memStats && typeof memStats.repeat_saves === 'number' ? memStats.repeat_saves : null;
    const memOldestUnlabeledAgeSec = memStats && typeof memStats.unlabeled_oldest_age_sec === 'number'
      ? memStats.unlabeled_oldest_age_sec
      : null;

    function fmtAgeShort(seconds) {
      const s = typeof seconds === 'number' ? Math.max(0, Math.floor(seconds)) : 0;
      if (!s) return '';
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return `${d}d`;
      if (h > 0) return `${h}h`;
      if (m > 0) return `${m}m`;
      return `${s}s`;
    }

    const specific = payload && payload.specific && typeof payload.specific === 'object' ? payload.specific : null;
    const specificKey = specific && specific.key ? String(specific.key) : '';
    const specificLabel = specific && specific.label ? String(specific.label) : '';
    const specificConf = specific && typeof specific.confidence === 'number' ? specific.confidence : null;
    const specificEvidence = (specific && Array.isArray(specific.evidence)) ? specific.evidence.filter(Boolean).slice(0, 4) : [];
    const appSuspects = (specific && Array.isArray(specific.app_suspects)) ? specific.app_suspects.filter(Boolean).slice(0, 6) : [];

    const bsod5 = payload && payload.bsod5 && typeof payload.bsod5 === 'object' ? payload.bsod5 : null;
    const normKey = (v) => String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

    let bsod5Key = bsod5 && bsod5.key ? normKey(bsod5.key) : '';
    let bsod5Label = bsod5 && bsod5.label ? String(bsod5.label) : '';
    let bsod5Conf = bsod5 && typeof bsod5.confidence_calibrated === 'number'
      ? bsod5.confidence_calibrated
      : (bsod5 && typeof bsod5.confidence === 'number' ? bsod5.confidence : null);
    let bsod5Evidence = (bsod5 && Array.isArray(bsod5.evidence)) ? bsod5.evidence.filter(Boolean).slice(0, 4) : [];
    let bsod5Ranked = (bsod5 && Array.isArray(bsod5.ranked)) ? bsod5.ranked.filter(Boolean) : [];

    // Signal cross-check (USB-only). Used as a safety guardrail.
    const signalFallback = payload && payload.__signalFallback && typeof payload.__signalFallback === 'object'
      ? payload.__signalFallback
      : null;

    const bsod5AllowedKeys = new Set([
      'corrupt_system_files',
      'faulty_os_updates',
      'incompatible_apps',
      'overheating',
      'hardware_failure',
    ]);
    bsod5Ranked = bsod5Ranked
      .map(it => (it && typeof it === 'object' ? Object.assign({}, it, { key: normKey(it.key) }) : it))
      .filter(it => it && bsod5AllowedKeys.has(String(it.key || '')))
      .slice(0, 5);

    if (!bsod5Key && !bsod5Label) {
      // Backward-compatible fallback: map existing fields into the required 5 causes.
      const mapKeyToLabel = {
        corrupt_system_files: 'Corrupt system files',
        faulty_os_updates: 'Faulty OS updates',
        incompatible_apps: 'Incompatible apps',
        overheating: 'Overheating',
        hardware_failure: 'Hardware failure',
        not_bsod: 'Not BSOD',
      };

      if (topKey === 'not_bsod' || topKey === 'host_usb_driver') {
        bsod5Key = 'not_bsod';
      } else if (specificKey === 'apps_conflict') {
        bsod5Key = 'incompatible_apps';
      } else if (specificKey === 'os_corruption') {
        bsod5Key = 'corrupt_system_files';
      } else if (specificKey === 'battery_problem') {
        bsod5Key = 'overheating';
      } else if (topKey === 'software_firmware') {
        bsod5Key = 'faulty_os_updates';
      } else if (topKey === 'display_hardware' || topKey === 'low_level_mode' || topKey === 'power_mainboard') {
        bsod5Key = 'hardware_failure';
      } else {
        bsod5Key = 'not_bsod';
      }

      bsod5Label = mapKeyToLabel[bsod5Key] || bsod5Key;
      bsod5Conf = null;
      bsod5Evidence = [];
      bsod5Ranked = [];
    }

    // Guardrail (applied after BSOD-5 is resolved, including fallback mapping):
    // avoid declaring "BSoD detected" on low-confidence AI when the signal
    // cross-check indicates "No Symptoms of BSoD" (common for MTP-only phones
    // with USB debugging disabled / missing ADB driver).
    try {
      const sigStatusRaw = signalFallback && typeof signalFallback.bsodStatusText === 'string'
        ? String(signalFallback.bsodStatusText)
        : '';
      const sigStatus = sigStatusRaw.trim().toLowerCase();
      const sigBsod5Key = signalFallback && typeof signalFallback.bsod5Key === 'string'
        ? normKey(signalFallback.bsod5Key)
        : '';

      // Per product requirement: only show BSOD when verdict confidence is high.
      const verdictConfForGuard = (typeof bsod5Conf === 'number') ? bsod5Conf : ((typeof conf === 'number') ? conf : null);
      const aiLow = (typeof verdictConfForGuard === 'number') ? (verdictConfForGuard < 0.8) : true;
      const signalSaysNotBsod = sigBsod5Key === 'not_bsod' || sigStatus.includes('no symptoms');
      if (aiLow && signalSaysNotBsod && bsod5Key && bsod5Key !== 'not_bsod') {
        bsod5Key = 'not_bsod';
        bsod5Label = 'Not BSOD';
        bsod5Conf = null;
        bsod5Evidence = [];
        bsod5Ranked = [];
      }
    } catch {
      // ignore
    }

    const humanSummary = payload && typeof payload.humanSummary === 'string' ? payload.humanSummary.trim() : '';
    const likelyCause = payload && typeof payload.likelyCause === 'string' ? payload.likelyCause.trim() : '';
    const whyText = payload && typeof payload.why === 'string' ? payload.why.trim() : '';
    const nextStep = payload && typeof payload.nextStep === 'string' ? payload.nextStep.trim() : '';
    const common5 = payload && payload.common5 && typeof payload.common5 === 'object' ? payload.common5 : null;
    const commonTop = common5 && common5.top && typeof common5.top === 'object' ? common5.top : null;
    const commonTopKey = commonTop && commonTop.key ? String(commonTop.key) : '';
    const commonTopLabel = commonTop && commonTop.label ? String(commonTop.label) : '';
    const commonTopConf = commonTop && typeof commonTop.confidence_calibrated === 'number'
      ? commonTop.confidence_calibrated
      : (commonTop && typeof commonTop.confidence === 'number' ? commonTop.confidence : null);
    let commonRanked = (common5 && Array.isArray(common5.ranked)) ? common5.ranked.filter(Boolean) : [];

    const commonAllowedKeys = new Set([
      'software_glitches',
      'insufficient_storage',
      'app_malfunctions',
      'connectivity_issues',
      'hardware_problems',
    ]);
    commonRanked = commonRanked.filter(it => it && commonAllowedKeys.has(String(it.key || ''))).slice(0, 5);

    const calibration = payload && payload.calibration && typeof payload.calibration === 'object' ? payload.calibration : null;
    const calibrationStatus = calibration && calibration.status && typeof calibration.status === 'object' ? calibration.status : null;
    const broadCap = calibration && typeof calibration.broad_cap === 'number' ? calibration.broad_cap : null;
    const bsod5Cap = calibration && typeof calibration.bsod5_cap === 'number' ? calibration.bsod5_cap : null;
    const common5Cap = calibration && typeof calibration.common5_cap === 'number' ? calibration.common5_cap : null;

    function getNeeded(statusObj) {
      if (!statusObj || typeof statusObj !== 'object') return null;
      if (typeof statusObj.needed_usable === 'number') return statusObj.needed_usable;
      return null;
    }

    const broadNeed = getNeeded(calibrationStatus && calibrationStatus.broad);
    const bsod5Need = getNeeded(calibrationStatus && calibrationStatus.bsod5);
    const common5Need = getNeeded(calibrationStatus && calibrationStatus.common5);

    let calibrationText = '';
    const anyCap = broadCap != null || bsod5Cap != null || common5Cap != null;
    const anyNeed = broadNeed != null || bsod5Need != null || common5Need != null;
    if (anyCap) {
      const parts = [];
      if (broadCap != null) parts.push(`Broad cap ${Math.round(broadCap * 100)}%`);
      if (bsod5Cap != null) parts.push(`BSOD-5 cap ${Math.round(bsod5Cap * 100)}%`);
      if (common5Cap != null) parts.push(`Common-5 cap ${Math.round(common5Cap * 100)}%`);
      calibrationText = parts.length ? `Calibration: active (${parts.join(' · ')})` : 'Calibration: active.';
    } else if (anyNeed) {
      const parts = [];
      if (typeof broadNeed === 'number') parts.push(`Broad needs ${broadNeed}`);
      if (typeof bsod5Need === 'number') parts.push(`BSOD-5 needs ${bsod5Need}`);
      if (typeof common5Need === 'number') parts.push(`Common-5 needs ${common5Need}`);
      calibrationText = parts.length ? `Calibration: needs more labeled cases (${parts.join(' · ')})` : '';
    }

    const needsLabels = !anyCap && (typeof broadNeed === 'number' || typeof bsod5Need === 'number' || typeof common5Need === 'number');

    function mapCommonLabel(k, labelText) {
      const kk = String(k || '');
      if (kk === 'software_glitches') return tMaybe('ai.common5.software_glitches', 'Software glitches');
      if (kk === 'insufficient_storage') return tMaybe('ai.common5.insufficient_storage', 'Insufficient storage');
      if (kk === 'app_malfunctions') return tMaybe('ai.common5.app_malfunctions', 'App malfunctions');
      if (kk === 'connectivity_issues') return tMaybe('ai.common5.connectivity_issues', 'Connectivity issues');
      if (kk === 'hardware_problems') return tMaybe('ai.common5.hardware_problems', 'Hardware problems');
      return labelText ? String(labelText) : kk;
    }

    const signalUsbCannotConfirm = (() => {
      try {
        const k = signalFallback && typeof signalFallback.bsod5Key === 'string' ? normKey(signalFallback.bsod5Key) : '';
        const st = signalFallback && typeof signalFallback.bsodStatusText === 'string' ? String(signalFallback.bsodStatusText).toLowerCase() : '';
        return k === 'inconclusive' || st.includes('inconclusive') || st.includes('no usb visibility');
      } catch {
        return false;
      }
    })();

    const sigHostUnsupportedGlobal = (() => {
      try {
        return !!(signalFallback && signalFallback.hostUnsupported);
      } catch {
        return false;
      }
    })();

    const autoVerdict = (() => {
      try {
        return payload && payload.__autoTest && typeof payload.__autoTest.verdict === 'string'
          ? String(payload.__autoTest.verdict).trim().toUpperCase()
          : '';
      } catch {
        return '';
      }
    })();

    // Compatibility: remap any legacy "inconclusive" outputs to "not_bsod"
    // (BSOD-only view should show only detected vs not detected).
    if (normKey(bsod5Key) === 'inconclusive') {
      bsod5Key = 'not_bsod';
      bsod5Label = mapBsod5KeyToLabel('not_bsod');
      bsod5Conf = null;
      bsod5Evidence = [];
      bsod5Ranked = [];
    }

    // Guardrail: if backend auto-test says PHONE_VISIBLE (not freeze), prefer
    // non-BSOD presentation unless there is strong signal-level freeze evidence.
    let forcePhoneVisibleNonBsod = false;
    try {
      const freezeConfidence = signalFallback && typeof signalFallback.crossCheckConfidence === 'string'
        ? String(signalFallback.crossCheckConfidence).toLowerCase()
        : '';
      const signalSaysFreeze = !!(
        signalFallback
        && String(signalFallback.patternKey || '') === 'mtp_ui_freeze'
        && (freezeConfidence === 'high' || freezeConfidence === 'medium')
      );

      if (autoVerdict === 'PHONE_VISIBLE' && !signalSaysFreeze && !sigHostUnsupportedGlobal) {
        forcePhoneVisibleNonBsod = true;
        bsod5Key = 'not_bsod';
        bsod5Label = mapBsod5KeyToLabel(bsod5Key);
        bsod5Conf = null;
        bsod5Evidence = [];
        bsod5Ranked = [];
      }
    } catch {
      // ignore
    }

    // UI-freeze override: when MTP is alive but the device is unresponsive and
    // webcam hints suggest ANR/System UI dialog or dark/unclear (non-normal),
    // present this as a BSOD-style UI freeze and map to "Incompatible apps".
    try {
      const sigPattern = signalFallback && typeof signalFallback.patternKey === 'string'
        ? String(signalFallback.patternKey)
        : '';
      const sigBsod5Key = signalFallback && typeof signalFallback.bsod5Key === 'string'
        ? normKey(signalFallback.bsod5Key)
        : '';
      const sigTitle = signalFallback && typeof signalFallback.crossCheckTitle === 'string'
        ? String(signalFallback.crossCheckTitle)
        : '';
      const signalSaysUiFreeze = (
        sigPattern === 'mtp_ui_freeze'
        || sigBsod5Key === 'incompatible_apps'
        || /^bsod\s*\(ui\s*freeze\)/i.test(sigTitle)
      );

      if (signalSaysUiFreeze && !forcePhoneVisibleNonBsod) {
        bsod5Key = 'incompatible_apps';
        bsod5Label = mapBsod5KeyToLabel('incompatible_apps');
        bsod5Conf = null;
        bsod5Evidence = [];
        bsod5Ranked = [];
      }
    } catch {
      // ignore
    }

    // Samsung Download/Odin override: if the signal cross-check indicates the
    // phone is in firmware download mode, map to OS/firmware causes rather than
    // hardware failure (even when the backend omitted bsod5 and top.key falls back).
    try {
      const sigPattern = signalFallback && typeof signalFallback.patternKey === 'string'
        ? String(signalFallback.patternKey)
        : '';
      const sigTitle = signalFallback && typeof signalFallback.crossCheckTitle === 'string'
        ? String(signalFallback.crossCheckTitle)
        : '';
      const sigBsod5Key = signalFallback && typeof signalFallback.bsod5Key === 'string'
        ? normKey(signalFallback.bsod5Key)
        : '';

      // Some older/alternate render paths may not attach __signalFallback.
      // Use backend signal flags as an additional guard.
      const payloadLooksDownload = !!(
        payload
        && payload.signals
        && typeof payload.signals === 'object'
        && payload.signals.looksDownload
      );

      const signalSaysSamsungDownload = (
        sigPattern === 'samsung_download'
        || /samsung\s+download|odin|cdc\s+composite/i.test(sigTitle)
        || payloadLooksDownload
      );

      if (signalSaysSamsungDownload && !forcePhoneVisibleNonBsod) {
        bsod5Key = 'faulty_os_updates';
        bsod5Label = mapBsod5KeyToLabel('faulty_os_updates');
        bsod5Conf = null;
        bsod5Evidence = [];
        bsod5Ranked = [];
      }
    } catch {
      // ignore
    }

    const isBsodDetected = !!(bsod5Key && bsod5Key !== 'not_bsod' && bsod5Key !== 'inconclusive');

    const bsodStatusText = isBsodDetected
      ? i18n.t('ai.bsod.status.detected')
      : i18n.t('ai.bsod.status.none');

    // Evidence-grade verdict (preferred): use payload-provided verdict fields when available.
    const verdictRaw = payload && typeof payload.verdict === 'string' ? String(payload.verdict).trim().toLowerCase() : '';
    let verifiedBy = [];
    if (payload && Array.isArray(payload.verifiedBy)) {
      verifiedBy = payload.verifiedBy
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 6);
    } else {
      // Backward-compatible fallback: camera-only verification.
      const cameraVerifiedNotBsod = !!(payload && payload.__cameraLooksNotBsod);
      if (cameraVerifiedNotBsod) verifiedBy = ['camera_normal_stable'];
    }
    const verdictIsVerified = (verdictRaw === 'verified') || (verifiedBy.length > 0);
    const verdictText = verdictIsVerified ? i18n.t('ai.verdict.verified') : i18n.t('ai.verdict.possible');

    // Use a single "verdict confidence" that matches the BSOD/not-BSOD verdict.
    // This avoids confusing UI states like "BSoD detected" while showing a low
    // broad-category confidence (e.g., 22%).
    let verdictConf = null;
    if (payload && typeof payload.verdictConfidence === 'number') verdictConf = payload.verdictConfidence;
    else if (typeof bsod5Conf === 'number') verdictConf = bsod5Conf;
    else if (typeof conf === 'number') verdictConf = conf;

    // When USB-only cannot confirm visibility, hide confidence to avoid overclaiming.
    if (!isBsodDetected && (signalUsbCannotConfirm || sigHostUnsupportedGlobal)) verdictConf = null;

    const evidenceUsed = payload && Array.isArray(payload.evidenceUsed)
      ? payload.evidenceUsed.map(v => String(v || '').trim()).filter(Boolean).slice(0, 10)
      : [];
    const evidenceMissing = payload && Array.isArray(payload.evidenceMissing)
      ? payload.evidenceMissing.map(v => String(v || '').trim()).filter(Boolean).slice(0, 10)
      : [];

    function mapEvidenceKey(k) {
      const kk = String(k || '').trim();
      if (!kk) return '';
      return tMaybe(`ai.evidence.${kk}`, kk);
    }

    const verifiedByText = verifiedBy.map(mapEvidenceKey).filter(Boolean);
    const evidenceUsedText = evidenceUsed.map(mapEvidenceKey).filter(Boolean);
    const evidenceMissingText = evidenceMissing.map(mapEvidenceKey).filter(Boolean);

    function mapBsod5ToCauseGroup(key) {
      const k = String(key || '');
      if (k === 'hardware_failure') return i18n.t('ai.group.hardware');
      if (k === 'corrupt_system_files') return i18n.t('ai.group.osCorruptFiles');
      if (k === 'faulty_os_updates') return i18n.t('ai.group.osUpdates');
      if (k === 'incompatible_apps') return i18n.t('ai.group.apps');
      if (k === 'overheating') return i18n.t('ai.group.overheating');
      return i18n.t('ai.group.other');
    }

    const possibleCauseGroup = isBsodDetected ? mapBsod5ToCauseGroup(bsod5Key) : '';
    const possibleCausesLine = isBsodDetected ? i18n.t('ai.bsod.possibleLine') : '';

    // In inconclusive mode, override the summary fields to stay honest.
    let displayLikelyCause = likelyCause || (isBsodDetected
      ? (mapBsod5KeyToLabel(bsod5Key) || bsod5Label || cause)
      : (mapCommonLabel(commonTopKey, commonTopLabel) || commonTopLabel || cause));
    let displayWhyText = whyText;
    let displayNextStep = nextStep;
    let displayHumanSummary = (humanSummary && humanSummary !== whyText) ? humanSummary : '';
    let displayActions = actions;

    // If the signal cross-check indicates the MTP UI-freeze pattern, prefer a
    // technician-friendly explanation over generic "App malfunctions" wording.
    try {
      const sigPattern = signalFallback && typeof signalFallback.patternKey === 'string'
        ? String(signalFallback.patternKey)
        : '';
      const sigBsod5Key = signalFallback && typeof signalFallback.bsod5Key === 'string'
        ? normKey(signalFallback.bsod5Key)
        : '';
      const sigTitle = signalFallback && typeof signalFallback.crossCheckTitle === 'string'
        ? String(signalFallback.crossCheckTitle)
        : '';
      const signalSaysUiFreeze = (
        sigPattern === 'mtp_ui_freeze'
        || sigBsod5Key === 'incompatible_apps'
        || /^bsod\s*\(ui\s*freeze\)/i.test(sigTitle)
      );

      if (signalSaysUiFreeze && !forcePhoneVisibleNonBsod) {
        displayLikelyCause = 'BSOD – UI freeze likely caused by a third-party app. Recovery: Safe Mode.';
        if (!displayWhyText) {
          displayWhyText = 'MTP is visible (phone partially alive), but the device appears unresponsive. This pattern often matches a UI freeze/ANR caused by a 3rd-party app or heavy system load.';
        }
        if (!displayNextStep) {
          displayNextStep = 'Recovery: Safe Mode.';
        }
        // Avoid contradictory summary text from a stale broad-class fallback.
        displayHumanSummary = '';

        // Keep confidence conservative unless the signal cross-check is explicitly high.
        const signalFreezeHigh = !!(signalFallback && String(signalFallback.crossCheckConfidence || '').toLowerCase() === 'high');
        if (!signalFreezeHigh && typeof verdictConf === 'number') {
          verdictConf = Math.min(verdictConf, 0.75);
        }
      }

      if (sigPattern === 'usb_unstable_phone') {
        displayLikelyCause = 'Possible hard freeze / USB reset loop (USB-only)';
        displayWhyText = displayWhyText || 'Windows USB enumeration changed during sampling while phone-like transport signals were present. This often points to cable/port/connector/host driver instability, but can also happen when the phone is hard-freezing and repeatedly resetting its USB stack.';
        displayNextStep = displayNextStep || 'Try a known-good data cable + direct USB port (no hub), then force reboot the phone and re-test. If the pattern persists across PCs/cables, suspect phone USB port/power/mainboard.';
      }

      if (sigPattern === 'samsung_download') {
        displayLikelyCause = 'OS corruption / boot failure — device is in Samsung Download/Odin mode.';
        displayWhyText = displayWhyText || 'Windows detects a Samsung Download/Odin (firmware repair) transport device. Android is not booting normally, so ADB/MTP/fastboot may be absent.';
        displayNextStep = displayNextStep || 'Use authorized firmware repair tools/workflows (e.g., Odin) to flash stock firmware, or force reboot to exit Download mode and retry normal boot.';
        displayHumanSummary = '';
        if (typeof verdictConf === 'number') verdictConf = Math.min(verdictConf, 0.85);
      }
    } catch {
      // ignore
    }
    if (!isBsodDetected && (signalUsbCannotConfirm || sigHostUnsupportedGlobal)) {
      const isGenericUsbOnly = (() => {
        try {
          const st = signalFallback && typeof signalFallback.bsodStatusText === 'string'
            ? String(signalFallback.bsodStatusText).toLowerCase()
            : '';
          return st.includes('generic usb');
        } catch {
          return false;
        }
      })();

      displayLikelyCause = displayLikelyCause || mapBsod5KeyToLabel('not_bsod');
      if (sigHostUnsupportedGlobal) {
        displayWhyText = 'MTP probe failed due to a host COM interface error. Cannot assess the phone\'s state from this PC.';
        displayNextStep = 'Please reinstall Windows Portable Devices drivers or test on another PC. If you can visually see the phone is normal, ignore this result.';
        displayHumanSummary = 'Host limitation: USB-only cannot confirm a BSOD-style failure on this PC until COM/WPD support works.';
      } else if (isGenericUsbOnly) {
        displayWhyText = 'A generic USB transport device was detected, but it was not identified as phone-like (no MTP/ADB/fastboot). This may be the phone using a generic composite driver, or another USB device.';
        displayNextStep = 'Unplug other USB devices, replug the phone, and re-test to confirm the generic device is the phone.';
        displayHumanSummary = 'USB-only cannot confirm BSOD until a phone-like USB identity (MTP/ADB/fastboot) is observed.';
      } else {
        displayWhyText = 'No USB visibility from this PC. USB-only cannot confirm a BSOD-style failure when Windows does not enumerate the phone.';
        displayNextStep = 'Confirm a data-capable cable/port, force reboot the phone, and re-test (ideally on another PC).';
        displayHumanSummary = 'Webcam is only a visual hint (screen in view). USB-only cannot confirm BSOD until the phone enumerates over USB.';
      }
      if (signalFallback && Array.isArray(signalFallback.actions) && signalFallback.actions.length) {
        displayActions = signalFallback.actions.filter(Boolean).slice(0, 6);
      }
    }

    const allActions = Array.isArray(displayActions) ? displayActions.filter(Boolean) : [];
    const filteredActions = displayNextStep
      ? allActions.filter(a => String(a || '').trim() !== displayNextStep)
      : allActions;
    const shortActions = filteredActions.slice(0, 3);
    const extraActions = filteredActions.slice(3);
    const signalFallback2 = signalFallback;

    aiConclusionEl.innerHTML = `
      <div class="ai-result-box ui-fade-in">
        <div class="ai-result-title">
          ${renderSmartHubAiTitle()}
          <span class="ai-result-meta" style="margin-top: 0;">${verdictConf != null ? `Confidence: ${escapeHtml(String(Math.round(verdictConf * 100)))}%` : ''}</span>
        </div>

        <div class="ai-result-meta" style="margin-top: 6px;">${escapeHtml(verdictText)}${verifiedByText.length ? ` · ${escapeHtml(i18n.t('ai.verifiedBy'))} ${escapeHtml(verifiedByText.join(', '))}` : ''}</div>

        ${renderBsodHighlightRow({ statusText: bsodStatusText, causeGroup: possibleCauseGroup, bsod5Label: (isBsodDetected ? (mapBsod5KeyToLabel(bsod5Key) || bsod5Label || bsod5Key) : ''), isDetected: isBsodDetected, isNot: !isBsodDetected, isInconclusive: false })}
        ${possibleCausesLine ? `<div class="ai-result-meta" style="margin-top: 6px;">${escapeHtml(possibleCausesLine)}</div>` : ''}

        <div class="ai-result-meta" style="margin-top: 8px;"><strong>${escapeHtml(i18n.t('ai.label.likelyCause'))}</strong> ${escapeHtml(displayLikelyCause || '')}</div>
        ${displayWhyText
          ? `
            <div class="ai-result-meta" style="margin-top: 8px;"><strong>${escapeHtml(i18n.t('ai.label.why'))}</strong> ${escapeHtml(displayWhyText)}</div>
          `
          : ''
        }
        ${displayNextStep
          ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${escapeHtml(i18n.t('ai.label.doFirst'))}</strong> ${escapeHtml(displayNextStep)}</div>`
          : ''}
        ${displayHumanSummary
          ? `
            <div class="ai-result-meta" style="margin-top: 8px;"><strong>${escapeHtml(i18n.t('ai.label.summary'))}</strong> ${escapeHtml(displayHumanSummary)}</div>
          `
          : ''
        }

        ${isBsodDetected
          ? `
            <div class="no-debug-label" style="margin-top: 10px;">${escapeHtml(i18n.t('ai.bsod.required5'))}</div>
            <div class="ai-cause-value">${escapeHtml(mapBsod5KeyToLabel(bsod5Key) || bsod5Label || bsod5Key || tMaybe('ai.bsod5.not_bsod', 'Not BSOD'))}</div>
            ${bsod5Conf != null ? `<div class="ai-result-meta">Confidence: ${escapeHtml(String(Math.round(bsod5Conf * 100)))}%</div>` : ''}
          `
          : ''
        }
        ${bsod5Key === 'not_bsod' && (commonTopKey || commonTopLabel)
          ? `
            <div class="root-cause-note" style="margin-top: 8px;">General (Common-5): ${escapeHtml(mapCommonLabel(commonTopKey, commonTopLabel) || 'Unknown')}${commonTopConf != null ? ` · ${escapeHtml(String(Math.round(commonTopConf * 100)))}%` : ''}</div>
          `
          : ''
        }

        <div class="no-debug-label" style="margin-top: 10px;">${escapeHtml(i18n.t('ai.label.nextActions'))}</div>
        ${shortActions.length
          ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${shortActions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
          : `<div class="ai-result-meta" style="margin-top: 6px;">${escapeHtml(i18n.t('ai.offline.nextSteps.none'))}</div>`
        }

        ${renderOnlineAiSummary(payload && (payload.__onlineAi || payload.online))}

        <details id="bsod-ai-advanced" style="margin-top: 10px;">
          <summary class="root-cause-note">Advanced (details, memory, metrics)</summary>

          ${(evidenceUsedText.length || evidenceMissingText.length)
            ? `
              <div class="ai-result-meta" style="margin-top: 8px;"><strong>${escapeHtml(i18n.t('ai.evidence.usedLabel'))}</strong> ${escapeHtml(evidenceUsedText.join(', ') || 'None')}</div>
              <div class="ai-result-meta" style="margin-top: 6px;"><strong>${escapeHtml(i18n.t('ai.evidence.missingLabel'))}</strong> ${escapeHtml(evidenceMissingText.join(', ') || 'None')}</div>
            `
            : ''
          }

          ${signalFallback2
            ? `
              <div class="root-cause-note" style="margin-top: 8px;">Signal cross-check: ${escapeHtml(String(signalFallback2.crossCheckTitle || ''))}${signalFallback2.crossCheckConfidence ? ` · Confidence: ${escapeHtml(String(signalFallback2.crossCheckConfidence))}` : ''}</div>
            `
            : ''
          }

          ${(extraActions.length)
            ? `
              <div class="root-cause-note" style="margin-top: 8px;">More actions:</div>
              <ul style="margin: 6px 0 0; padding-left: 18px;">${extraActions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
            `
            : ''
          }

          ${bsod5Evidence.length
            ? `
              <div class="root-cause-note" style="margin-top: 8px;">BSOD-5 evidence:</div>
              <ul style="margin: 6px 0 0; padding-left: 18px;">${bsod5Evidence.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
            `
            : ''
          }

          ${bsod5Ranked.length
            ? `
              <div class="root-cause-note" style="margin-top: 8px;">BSOD-5 ranking:</div>
              <ul style="margin: 6px 0 0; padding-left: 18px;">
                ${bsod5Ranked
                  .map(it => {
                    const k = it && it.key ? String(it.key) : '';
                    const l = it && it.label ? String(it.label) : k;
                    const p = it && typeof it.confidence === 'number' ? it.confidence : null;
                    const pct = p != null ? `${Math.round(p * 100)}%` : '';
                    return `<li>${escapeHtml(l)}${pct ? ` — ${escapeHtml(pct)}` : ''}</li>`;
                  })
                  .join('')}
              </ul>
            `
            : ''
          }

          ${bsod5Key === 'not_bsod' && commonRanked.length
            ? `
              <div class="root-cause-note" style="margin-top: 8px;">Common-5 ranking:</div>
              <ul style="margin: 6px 0 0; padding-left: 18px;">
                ${commonRanked
                  .map(it => {
                    const k = it && it.key ? String(it.key) : '';
                    const l = it && it.label ? String(it.label) : '';
                    const p = it && typeof it.confidence === 'number' ? it.confidence : null;
                    const pct = p != null ? `${Math.round(p * 100)}%` : '';
                    return `<li>${escapeHtml(mapCommonLabel(k, l))}${pct ? ` — ${escapeHtml(pct)}` : ''}</li>`;
                  })
                  .join('')}
              </ul>
            `
            : ''
          }

          ${specificLabel || specificKey
            ? `
              <div class="no-debug-label" style="margin-top: 10px;">Specific cause</div>
              <div class="ai-cause-value">${escapeHtml(specificLabel || specificKey)}</div>
              ${specificConf != null ? `<div class="ai-result-meta">Confidence: ${escapeHtml(String(Math.round(specificConf * 100)))}%</div>` : ''}
              ${specificEvidence.length
                ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${specificEvidence.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
                : ''
              }
              ${appSuspects.length
                ? `
                  <div class="root-cause-note" style="margin-top: 8px;">Apps that often trigger BSOD-like symptoms:</div>
                  <ul style="margin: 6px 0 0; padding-left: 18px;">${appSuspects.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
                `
                : ''
              }
            `
            : ''
          }

          <div class="no-debug-label" style="margin-top: 10px;">Broad cause</div>
          <div class="ai-cause-value">${escapeHtml(cause || 'No conclusion returned.')}</div>
          ${label && label !== cause ? `<div class="ai-result-meta">${escapeHtml(label)}</div>` : ''}

          <div class="no-debug-label" style="margin-top: 10px;">SmartHub AI support memory</div>
          <div id="bsod-ai-memory-status" class="ai-result-meta">${Array.isArray(similar) && similar.length ? `Found ${escapeHtml(String(similar.length))} similar past case(s).` : 'No similar past cases found yet.'}${(memTotal != null || memLabeled != null || memUnlabeled != null || memDistinct != null || memRepeats != null)
            ? ` Memory: ${escapeHtml(String(memTotal != null ? memTotal : '?'))} total · ${escapeHtml(String(memDistinct != null ? memDistinct : '?'))} distinct · ${escapeHtml(String(memLabeled != null ? memLabeled : '?'))} labeled · ${escapeHtml(String(memUnlabeled != null ? memUnlabeled : '?'))} unlabeled${(memRepeats != null && memRepeats > 0) ? ` · ${escapeHtml(String(memRepeats))} repeats` : ''}${(memOldestUnlabeledAgeSec != null && memOldestUnlabeledAgeSec > 0) ? ` · oldest unlabeled ${escapeHtml(fmtAgeShort(memOldestUnlabeledAgeSec))}` : ''}.`
            : ''
          }</div>
          <div id="bsod-ai-memory-save" class="ai-result-meta" style="margin-top: 2px;">Saving this case to SmartHub AI support memory…</div>

          ${renderSimilarCases(similar)}

          <div id="bsod-ai-metrics" class="ai-result-meta" style="margin-top: 10px;">Accuracy: open Advanced to load…</div>
          ${calibrationText
            ? `<div id="bsod-ai-calibration" class="ai-result-meta" style="margin-top: 4px;">${escapeHtml(calibrationText)}</div>`
            : ''
          }
        </details>
      </div>
    `;

    // Fetch measured accuracy metrics (local, labeled cases) when Advanced is opened.
    (async () => {
      const metricsEl = document.getElementById('bsod-ai-metrics');
      if (!metricsEl) return;

      const detailsEl = document.getElementById('bsod-ai-advanced');
      let loaded = false;

      const loadOnce = async () => {
        if (loaded) return;
        loaded = true;
        try {
          const r = await fetch('http://127.0.0.1:3333/ai-no-debug-metrics?lookback=2000');
          const m = await r.json().catch(() => null);
          const by = m && m.metrics_by_kind && typeof m.metrics_by_kind === 'object' ? m.metrics_by_kind : null;
          const byVerified = m && m.metrics_by_kind_verified && typeof m.metrics_by_kind_verified === 'object'
            ? m.metrics_by_kind_verified
            : null;
          const byDistinct = m && m.metrics_by_kind_distinct && typeof m.metrics_by_kind_distinct === 'object'
            ? m.metrics_by_kind_distinct
            : null;
          const byDistinctVerified = m && m.metrics_by_kind_distinct_verified && typeof m.metrics_by_kind_distinct_verified === 'object'
            ? m.metrics_by_kind_distinct_verified
            : null;

          function fmt(kind) {
            if (!kind || typeof kind !== 'object') return 'n/a';
            const usable = typeof kind.usable === 'number' ? kind.usable : null;
            const labeled = typeof kind.labeled === 'number' ? kind.labeled : null;
            const ap = typeof kind.accuracy_percent === 'number' ? kind.accuracy_percent : null;

            const frp = typeof kind.false_verified_rate_percent === 'number' ? kind.false_verified_rate_percent : null;
            const fup = typeof kind.false_verified_rate_upper_95_percent === 'number' ? kind.false_verified_rate_upper_95_percent : null;

            const counts = (labeled != null || usable != null)
              ? ` (labeled ${labeled != null ? labeled : '?'} / usable ${usable != null ? usable : '?'})`
              : '';

            if (usable === 0) return `n/a${counts}`;
            if (usable != null && ap != null) {
              let extra = '';
              if (fup != null) {
                const pct = String(Math.round(fup));
                extra = ` · ${i18n.t('ai.metrics.falseVerifiedUpper95').replace('{p}', pct)}`;
              } else if (frp != null) {
                extra = ` · false-verified ${Math.round(frp)}%`;
              }
              return `${Math.round(ap)}%${counts}${extra}`;
            }
            return `n/a${counts}`;
          }

          if (m && m.ok && by) {
            metricsEl.textContent = `Accuracy (measured, local): Broad ${fmt(by.broad)} · BSOD-5 ${fmt(by.bsod5)} · Common-5 ${fmt(by.common5)}`;

            // How rare VERIFIED is (helps keep VERIFIED conservative)
            try {
              const vs = m && m.verified_summary && typeof m.verified_summary === 'object' ? m.verified_summary : null;
              const vrp = vs && typeof vs.verified_rate_percent === 'number' ? vs.verified_rate_percent : null;
              const dvrp = vs && typeof vs.distinct_verified_rate_percent === 'number' ? vs.distinct_verified_rate_percent : null;
              if (vrp != null) {
                metricsEl.textContent += ` · Verified rate ${Math.round(vrp)}%`;
                if (dvrp != null) metricsEl.textContent += ` (distinct ${Math.round(dvrp)}%)`;
              }
            } catch {
              // ignore
            }

            // VERIFIED-only accuracy (precision hardening signal)
            try {
              if (byVerified) {
                const verifiedText = `Verified-only: Broad ${fmt(byVerified.broad)} · BSOD-5 ${fmt(byVerified.bsod5)} · Common-5 ${fmt(byVerified.common5)}`;
                metricsEl.textContent += ` · ${verifiedText}`;
              }
            } catch {
              // ignore
            }

            // Prefer also showing distinct-case accuracy (fingerprint-deduped) when present.
            try {
              if (byDistinct) {
                const distinctText = `Distinct: Broad ${fmt(byDistinct.broad)} · BSOD-5 ${fmt(byDistinct.bsod5)} · Common-5 ${fmt(byDistinct.common5)}`;
                metricsEl.textContent += ` · ${distinctText}`;
              }
            } catch {
              // ignore
            }

            // Distinct-case VERIFIED-only accuracy
            try {
              if (byDistinctVerified) {
                const distinctVerifiedText = `Distinct verified-only: Broad ${fmt(byDistinctVerified.broad)} · BSOD-5 ${fmt(byDistinctVerified.bsod5)} · Common-5 ${fmt(byDistinctVerified.common5)}`;
                metricsEl.textContent += ` · ${distinctVerifiedText}`;
              }
            } catch {
              // ignore
            }

            // Phase 4 validation gate (data-driven PASS/WAIT)
            try {
              const p4 = m && m.phase4_validation && typeof m.phase4_validation === 'object' ? m.phase4_validation : null;
              const pass = p4 && typeof p4.pass === 'boolean' ? p4.pass : null;
              if (pass === true) metricsEl.textContent += ` · ${i18n.t('ai.metrics.phase4Gate.pass')}`;
              else if (pass === false) metricsEl.textContent += ` · ${i18n.t('ai.metrics.phase4Gate.wait')}`;

              const p4b = p4 && typeof p4.broad_verified_only === 'object' ? p4.broad_verified_only : null;
              const usable = p4b && typeof p4b.usable === 'number' ? p4b.usable : null;
              const min = p4b && typeof p4b.min_usable === 'number' ? p4b.min_usable : null;
              const remaining = p4b && typeof p4b.remaining_needed === 'number' ? p4b.remaining_needed : null;
              const target = p4b && typeof p4b.target_upper_95_percent === 'number' ? p4b.target_upper_95_percent : null;
              const upper = p4b && typeof p4b.upper_95_percent === 'number' ? p4b.upper_95_percent : null;

              if (usable != null && min != null && target != null) {
                const tpl = String(i18n.t('ai.metrics.phase4Gate.detail') || '');
                const upperTxt = (upper != null) ? String(Math.round(upper)) : 'n/a';
                const detail = tpl
                  .replace('{usable}', String(usable))
                  .replace('{min}', String(min))
                  .replace('{target}', String(target))
                  .replace('{upper}', upperTxt);
                if (detail) metricsEl.textContent += ` ${detail}`;

                if (remaining != null && remaining > 0) {
                  const remTpl = String(i18n.t('ai.metrics.phase4Gate.remaining') || '');
                  const remTxt = remTpl ? remTpl.replace('{n}', String(remaining)) : '';
                  if (remTxt) metricsEl.textContent += `, ${remTxt}`;
                }
              }
            } catch {
              // ignore
            }

            // Compact VERIFIED-by breakdown (top 2 verifier flags by usage)
            try {
              const vb = m && m.verified_by_breakdown && typeof m.verified_by_breakdown === 'object'
                ? m.verified_by_breakdown
                : null;
              const vbBroad = vb && Array.isArray(vb.broad) ? vb.broad : [];
              if (vbBroad.length) {
                const top = vbBroad.slice(0, 2)
                  .map(it => {
                    const flag = it && it.flag ? String(it.flag) : '';
                    const n = it && typeof it.verified_cases === 'number' ? it.verified_cases : null;
                    const ap = it && typeof it.accuracy_percent === 'number' ? it.accuracy_percent : null;
                    const usable = it && typeof it.usable === 'number' ? it.usable : null;
                    const accTxt = (usable && usable > 0 && ap != null) ? `, acc ${Math.round(ap)}%` : '';
                    const flagTxt = flag ? tMaybe(`ai.evidence.${flag}`, flag) : '';
                    return (flagTxt && n != null) ? `${flagTxt} (${n}${accTxt})` : null;
                  })
                  .filter(Boolean);
                if (top.length) metricsEl.textContent += ` · ${i18n.t('ai.verifiedBy')} ${top.join(', ')}`;
              }
            } catch {
              // ignore
            }

            // Optional: show the most common confusion pair (if any) to guide tuning.
            try {
              const kinds = [
                { key: 'broad', label: 'Broad' },
                { key: 'bsod5', label: 'BSOD-5' },
                { key: 'common5', label: 'Common-5' },
              ];
              for (const k of kinds) {
                const kind = by && by[k.key] && typeof by[k.key] === 'object' ? by[k.key] : null;
                const tc = kind && Array.isArray(kind.top_confusions) ? kind.top_confusions : [];
                if (tc.length > 0 && tc[0] && tc[0].actual && tc[0].pred) {
                  const first = tc[0];
                  const a = String(first.actual);
                  const p = String(first.pred);
                  const c = typeof first.count === 'number' ? first.count : null;
                  metricsEl.textContent += ` · Top confusion: ${k.label} ${a}→${p}${c != null ? ` (${c})` : ''}`;
                  break;
                }
              }
            } catch {
              // ignore
            }
          } else if (m && m.ok && typeof m.usable === 'number' && m.usable === 0) {
            metricsEl.textContent = 'Accuracy (measured, local): no labeled cases yet.';
          } else if (m && m.ok && typeof m.accuracy_percent === 'number' && typeof m.usable === 'number') {
            metricsEl.textContent = `Accuracy (measured, local): ${Math.round(m.accuracy_percent)}% · Cases: ${m.usable}`;
          } else {
            metricsEl.textContent = 'Accuracy (measured, local): unavailable.';
          }
        } catch {
          metricsEl.textContent = 'Accuracy (measured, local): unavailable.';
        }
      };

      if (detailsEl && !detailsEl.open) {
        metricsEl.textContent = 'Accuracy: open Advanced to load…';
        detailsEl.addEventListener('toggle', () => {
          if (detailsEl.open) loadOnce();
        }, { once: true });
        return;
      }

      await loadOnce();
    })();

    // Allow the technician to label the current case to improve measured accuracy.
    (async () => {
      const selectEl = document.getElementById('bsod-ai-label-select');
      const btnEl = document.getElementById('bsod-ai-label-save-btn');
      const statusEl = document.getElementById('bsod-ai-label-status');

      if (!selectEl || !btnEl || !statusEl) return;

      const updateBtn = () => {
        const hasSelection = !!String(selectEl.value || '').trim();
        btnEl.disabled = labelRememberInFlight || !hasSelection;
      };

      updateBtn();
      selectEl.addEventListener('change', updateBtn);

      const refreshMetrics = async () => {
        const metricsEl = document.getElementById('bsod-ai-metrics');
        if (!metricsEl) return;
        metricsEl.textContent = 'Accuracy (measured, local): refreshing…';
        try {
          const r = await fetch('http://127.0.0.1:3333/ai-no-debug-metrics?lookback=2000');
          const m = await r.json().catch(() => null);
          const by = m && m.metrics_by_kind && typeof m.metrics_by_kind === 'object' ? m.metrics_by_kind : null;
          const byVerified = m && m.metrics_by_kind_verified && typeof m.metrics_by_kind_verified === 'object'
            ? m.metrics_by_kind_verified
            : null;
          const byDistinct = m && m.metrics_by_kind_distinct && typeof m.metrics_by_kind_distinct === 'object'
            ? m.metrics_by_kind_distinct
            : null;
          const byDistinctVerified = m && m.metrics_by_kind_distinct_verified && typeof m.metrics_by_kind_distinct_verified === 'object'
            ? m.metrics_by_kind_distinct_verified
            : null;

          function fmt(kind) {
            if (!kind || typeof kind !== 'object') return 'n/a';
            const usable = typeof kind.usable === 'number' ? kind.usable : null;
            const labeled = typeof kind.labeled === 'number' ? kind.labeled : null;
            const ap = typeof kind.accuracy_percent === 'number' ? kind.accuracy_percent : null;

            const frp = typeof kind.false_verified_rate_percent === 'number' ? kind.false_verified_rate_percent : null;

            const counts = (labeled != null || usable != null)
              ? ` (labeled ${labeled != null ? labeled : '?'} / usable ${usable != null ? usable : '?'})`
              : '';

            if (usable === 0) return `n/a${counts}`;
            if (usable != null && ap != null) {
              const extra = (frp != null) ? ` · false-verified ${Math.round(frp)}%` : '';
              return `${Math.round(ap)}%${counts}${extra}`;
            }
            return `n/a${counts}`;
          }

          if (m && m.ok && by) {
            metricsEl.textContent = `Accuracy (measured, local): Broad ${fmt(by.broad)} · BSOD-5 ${fmt(by.bsod5)} · Common-5 ${fmt(by.common5)}`;

            try {
              const vs = m && m.verified_summary && typeof m.verified_summary === 'object' ? m.verified_summary : null;
              const vrp = vs && typeof vs.verified_rate_percent === 'number' ? vs.verified_rate_percent : null;
              const dvrp = vs && typeof vs.distinct_verified_rate_percent === 'number' ? vs.distinct_verified_rate_percent : null;
              if (vrp != null) {
                metricsEl.textContent += ` · Verified rate ${Math.round(vrp)}%`;
                if (dvrp != null) metricsEl.textContent += ` (distinct ${Math.round(dvrp)}%)`;
              }
            } catch {
              // ignore
            }

            try {
              if (byVerified) {
                const verifiedText = `Verified-only: Broad ${fmt(byVerified.broad)} · BSOD-5 ${fmt(byVerified.bsod5)} · Common-5 ${fmt(byVerified.common5)}`;
                metricsEl.textContent += ` · ${verifiedText}`;
              }
            } catch {
              // ignore
            }

            try {
              if (byDistinct) {
                const distinctText = `Distinct: Broad ${fmt(byDistinct.broad)} · BSOD-5 ${fmt(byDistinct.bsod5)} · Common-5 ${fmt(byDistinct.common5)}`;
                metricsEl.textContent += ` · ${distinctText}`;
              }
            } catch {
              // ignore
            }

            try {
              if (byDistinctVerified) {
                const distinctVerifiedText = `Distinct verified-only: Broad ${fmt(byDistinctVerified.broad)} · BSOD-5 ${fmt(byDistinctVerified.bsod5)} · Common-5 ${fmt(byDistinctVerified.common5)}`;
                metricsEl.textContent += ` · ${distinctVerifiedText}`;
              }
            } catch {
              // ignore
            }

            try {
              const vb = m && m.verified_by_breakdown && typeof m.verified_by_breakdown === 'object'
                ? m.verified_by_breakdown
                : null;
              const vbBroad = vb && Array.isArray(vb.broad) ? vb.broad : [];
              if (vbBroad.length) {
                const top = vbBroad.slice(0, 2)
                  .map(it => {
                    const flag = it && it.flag ? String(it.flag) : '';
                    const n = it && typeof it.verified_cases === 'number' ? it.verified_cases : null;
                    const ap = it && typeof it.accuracy_percent === 'number' ? it.accuracy_percent : null;
                    const usable = it && typeof it.usable === 'number' ? it.usable : null;
                    const accTxt = (usable && usable > 0 && ap != null) ? `, acc ${Math.round(ap)}%` : '';
                    return (flag && n != null) ? `${flag} (${n}${accTxt})` : null;
                  })
                  .filter(Boolean);
                if (top.length) metricsEl.textContent += ` · Verified by: ${top.join(', ')}`;
              }
            } catch {
              // ignore
            }
          } else if (m && m.ok && typeof m.usable === 'number' && m.usable === 0) {
            metricsEl.textContent = 'Accuracy (measured, local): no labeled cases yet.';
          } else {
            metricsEl.textContent = 'Accuracy (measured, local): unavailable.';
          }
        } catch {
          // ignore
        }
      };

      btnEl.addEventListener('click', async () => {
        const key = String(selectEl.value || '').trim();
        if (!key) return;

        if (!lastAiRememberPayload || !lastAiRememberPayload.connection) {
          statusEl.textContent = i18n.t('ai.labelCase.unavailable');
          return;
        }

        const outcome = `bsod5:${key}`;
        if (lastLabeledSeq === bsodDiagnoseRunSeq && lastLabeledOutcome === outcome) {
          statusEl.textContent = i18n.t('ai.labelCase.alreadySaved');
          return;
        }

        labelRememberInFlight = true;
        statusEl.textContent = i18n.t('ai.labelCase.saving');
        updateBtn();

        try {
          const res = await fetch('http://127.0.0.1:3333/ai-no-debug-remember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connection: buildConnectionWithTechConfirm(lastAiRememberPayload.connection),
              visual: lastAiRememberPayload.visual,
              outcome,
              note: `Labeled from BSOD diagnose UI (${outcome})`,
            }),
          });

          if (!res.ok) {
            statusEl.textContent = `${i18n.t('ai.labelCase.failed')} (HTTP ${res.status}).`;
            return;
          }

          const json = await res.json().catch(() => null);
          if (json && json.ok) {
            lastLabeledSeq = bsodDiagnoseRunSeq;
            lastLabeledOutcome = outcome;
            statusEl.textContent = i18n.t('ai.labelCase.saved');
            await refreshMetrics();
          } else {
            statusEl.textContent = json && json.error ? String(json.error) : i18n.t('ai.labelCase.failed');
          }
        } catch {
          statusEl.textContent = i18n.t('ai.labelCase.failed');
        } finally {
          labelRememberInFlight = false;
          updateBtn();
        }
      });
    })();

    // Technician confirmations: save human-verified evidence into offline memory.
    (async () => {
      const screenEl = document.getElementById('bsod-tech-screen-fixed');
      const otherPcEl = document.getElementById('bsod-tech-works-other-pc');
      const safeModeEl = document.getElementById('bsod-tech-safe-mode-improves');
      const oemFlashEl = document.getElementById('bsod-tech-oem-flash-failure');
      const uiFrozenEl = document.getElementById('bsod-tech-ui-frozen');
      const btnEl = document.getElementById('bsod-tech-save-btn');
      const statusEl = document.getElementById('bsod-tech-save-status');

      if (!screenEl || !otherPcEl || !safeModeEl || !oemFlashEl || !uiFrozenEl || !btnEl || !statusEl) return;

      const sync = () => {
        techConfirm.screenTestFixed = !!screenEl.checked;
        techConfirm.worksOtherPc = !!otherPcEl.checked;
        techConfirm.safeModeImproves = !!safeModeEl.checked;
        techConfirm.oemFlashFailure = !!oemFlashEl.checked;
        techConfirm.uiFrozen = !!uiFrozenEl.checked;
        btnEl.disabled = techConfirmSaveInFlight;

        // Live UI update: tech confirmations should immediately affect the
        // signal cross-check and wording (without forcing a full re-sample).
        try {
          if (lastSignalSnapshotForAi && typeof lastSignalSnapshotForAi === 'object') {
            lastSignalSnapshotForAi.techUiFrozen = !!techConfirm.uiFrozen;
          }

          const snap = (lastSignalSnapshotForAi && typeof lastSignalSnapshotForAi === 'object')
            ? Object.assign({}, lastSignalSnapshotForAi)
            : null;

          if (snap) {
            updateTwoLineBadges({
              phoneVisible: !!snap.phoneVisible,
              usbPresent: !!snap.usbPresent,
              phoneLikely: !!snap.phoneLikely,
              cameraRes: lastCameraResForUi,
              techUiFrozen: !!techConfirm.uiFrozen,
            });
          }

          if (lastAiSuggestForUi && snap) {
            const signalDiag = inferSignalDiagnosis(snap);
            const aiView = Object.assign({}, lastAiSuggestForUi, {
              __signalFallback: signalDiag,
              __cameraLooksNotBsod: !!snap.cameraLooksNotBsod,
            });
            renderAiConclusion('ok', aiView);
          }
        } catch {
          // best-effort
        }
      };

      screenEl.addEventListener('change', sync);
      otherPcEl.addEventListener('change', sync);
      safeModeEl.addEventListener('change', sync);
      oemFlashEl.addEventListener('change', sync);
      uiFrozenEl.addEventListener('change', sync);
      sync();

      btnEl.addEventListener('click', async () => {
        if (!lastAiRememberPayload || !lastAiRememberPayload.connection) {
          statusEl.textContent = i18n.t('ai.techConfirm.unavailable');
          return;
        }

        techConfirmSaveInFlight = true;
        sync();
        statusEl.textContent = i18n.t('ai.techConfirm.saving');

        try {
          const flags = [];
          if (techConfirm.screenTestFixed) flags.push('screenTestFixed');
          if (techConfirm.worksOtherPc) flags.push('worksOtherPc');
          if (techConfirm.safeModeImproves) flags.push('safeModeImproves');
          if (techConfirm.oemFlashFailure) flags.push('oemFlashFailure');
          if (techConfirm.uiFrozen) flags.push('uiFrozen');

          const res = await fetch('http://127.0.0.1:3333/ai-no-debug-remember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connection: buildConnectionWithTechConfirm(lastAiRememberPayload.connection),
              visual: lastAiRememberPayload.visual,
              note: flags.length
                ? `Technician confirmations: ${flags.join(', ')}`
                : 'Technician confirmations saved (none checked).',
            }),
          });

          if (!res.ok) {
            statusEl.textContent = `${i18n.t('ai.techConfirm.failed')} (HTTP ${res.status}).`;
            return;
          }

          const json = await res.json().catch(() => null);
          if (json && json.ok) {
            statusEl.textContent = i18n.t('ai.techConfirm.saved');
          } else {
            statusEl.textContent = json && json.error ? String(json.error) : i18n.t('ai.techConfirm.failed');
          }
        } catch {
          statusEl.textContent = i18n.t('ai.techConfirm.failed');
        } finally {
          techConfirmSaveInFlight = false;
          sync();
        }
      });
    })();

  }

  async function autoRememberAiCase(payload, signature, seq) {
    if (!payload || !signature) return;
    const saveEl = document.getElementById('bsod-ai-memory-save');

    if (signature === lastAutoRememberSig) {
      if (saveEl) {
        saveEl.textContent = lastAutoRememberCaseId != null
          ? `Saved to SmartHub AI support memory (case #${lastAutoRememberCaseId}).`
          : 'Saved to SmartHub AI support memory.';
      }
      return;
    }

    if (signature === autoRememberInFlightSig) return;
    autoRememberInFlightSig = signature;

    if (saveEl) saveEl.textContent = 'Saving this case to SmartHub AI support memory…';

    try {
      const res = await fetch('http://127.0.0.1:3333/ai-no-debug-remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: payload.connection,
          visual: payload.visual,
          note: 'Auto-saved from BSOD diagnose (unlabeled)',
        }),
      });

      if (seq !== bsodDiagnoseRunSeq) return;

      if (!res.ok) {
        autoRememberInFlightSig = '';
        if (saveEl) saveEl.textContent = `SmartHub AI support memory: save failed (HTTP ${res.status}).`;
        return;
      }

      const json = await res.json();
      const mem = json && json.memory && typeof json.memory === 'object' ? json.memory : null;
      const saved = mem && typeof mem.saved === 'boolean' ? mem.saved : null;
      const caseId = mem && typeof mem.case_id === 'number' ? mem.case_id : null;

      if (saveEl) {
        if (saved === true && caseId != null) saveEl.textContent = `Saved to SmartHub AI support memory (case #${caseId}).`;
        else if (saved === true) saveEl.textContent = 'Saved to SmartHub AI support memory.';
        else if (saved === false) saveEl.textContent = `SmartHub AI support memory: save failed${mem && mem.error ? ` (${String(mem.error)})` : '.'}`;
        else saveEl.textContent = 'SmartHub AI support memory: save status unknown.';
      }

      if (saved === true) {
        lastAutoRememberSig = signature;
        lastAutoRememberCaseId = caseId != null ? caseId : null;
      }

      autoRememberInFlightSig = '';
    } catch {
      autoRememberInFlightSig = '';
      if (saveEl) saveEl.textContent = 'SmartHub AI support memory: save failed (service unavailable).';
    }
  }

  async function runCameraCheck() {
    if (!cameraStatusEl || !cameraDetailEl || !cameraRunBtn) return null;
    if (bsodCameraIsRunning) return null;
    bsodCameraIsRunning = true;
    cameraRunBtn.disabled = true;
    setStatus(cameraStatusEl, '', 'Running…');
    cameraDetailEl.textContent = 'Analyzing camera view… (point the phone at the webcam)';

    let visual = null;
    let visualPayload = null;
    let visualError = '';
    let looksNotBsod = false;
    let suggestsBsodStyle = false;
    let visualCategory = '';
    let dialogHint = false;
    let uiCrashDetected = false;
    let darkStable = false;
    try {
      const vRes = await fetch('http://127.0.0.1:3333/screen-visual-check?samples=30&delayMs=500');
      let vData = null;
      try {
        vData = await vRes.json();
      } catch {
        vData = null;
      }
      visualPayload = vData;
      if (vData && vData.ok && vData.analysis) {
        visual = vData.analysis;
      } else if (vData && typeof vData.error === 'string' && vData.error.trim()) {
        const parts = [vData.error.trim()];
        if (typeof vData.install === 'string' && vData.install.trim()) {
          parts.push(`Install: ${vData.install.trim()}`);
        }
        if (typeof vData.note === 'string' && vData.note.trim()) {
          parts.push(vData.note.trim());
        }
        if (typeof vData.details === 'string' && vData.details.trim()) {
          parts.push(`Details: ${vData.details.trim()}`);
        }
        visualError = parts.join(' ');
      } else if (!vRes.ok) {
        visualError = `HTTP ${vRes.status}`;
      }
    } catch {
      visualError = 'Could not reach camera helper endpoint.';
    }

    const suppressCameraDialogHints = (() => {
      try {
        return localStorage.getItem('bsod_camera_dialog_suppress') === '1';
      } catch {
        return false;
      }
    })();

    if (visual) {
      const visualCat = (visual && visual.category) ? String(visual.category) : '';
      const visualCatLower = visualCat.toLowerCase();
      visualCategory = visualCatLower;
      const visualStability = (visual && visual.sample && typeof visual.sample.stability === 'number') ? visual.sample.stability : null;
      const visualContentHint = !!(visual && (visual.content_visible_hint || visual.contentVisibleHint));
      const visualContrastStd = (visual && typeof visual.contrast_std === 'number') ? visual.contrast_std : ((visual && typeof visual.contrastStd === 'number') ? visual.contrastStd : null);
      const systemUiDialogHint = !!(visual && (visual.systemui_dialog_hint || visual.systemuiDialogHint));
      const anrDialogHint = !!(visual && (visual.anr_dialog_hint || visual.anrDialogHint));
      uiCrashDetected = systemUiDialogHint || anrDialogHint;
      const dialogHintRaw = systemUiDialogHint || anrDialogHint;
      // Dark frames are high false-positive risk for OCR dialog hints.
      // Treat as very low confidence: do not surface dialogHint when the frame is dark.
      const dialogHintReliable = dialogHintRaw
        && !suppressCameraDialogHints
        && (visualCatLower !== 'dark')
        && (visualContentHint || (typeof visualContrastStd === 'number' && visualContrastStd >= 22));
      const dialogHintSuppressed = dialogHintRaw && !dialogHintReliable;
      dialogHint = dialogHintReliable;
      looksNotBsod = visualCatLower === 'normal'
        && (visualStability == null || visualStability >= 0.7)
        && (visualContentHint || (typeof visualContrastStd === 'number' && visualContrastStd >= 18))
        && !dialogHint;
      suggestsBsodStyle = (visualCatLower === 'blue') || dialogHint;
      darkStable = (visualCatLower === 'dark') && (visualStability != null) && (visualStability >= 0.9);

      const visualCrackHint = !!(visual && (visual.screen_crack_hint || visual.crack_hint || visual.screenCrackHint));
      const visualBandingHint = !!(visual && (visual.banding_hint || visual.bandingHint));
      const visualEdgeShadowHint = !!(visual && (visual.edge_shadow_hint || visual.edgeShadowHint));

      const cameraKind = looksNotBsod
        ? 'ok'
        : (suggestsBsodStyle || visualCatLower === 'dark' ? 'warn' : 'ok');
      const cameraLabel = looksNotBsod
        ? '✓ Screen looks normal'
        : (dialogHint
          ? '⚠ Dialog detected'
          : (visualCatLower === 'blue'
            ? '⚠ Blue screen suspected'
            : (visualCatLower === 'dark'
              ? '⚠ Dark / unclear'
              : '✓ Completed')));
      setStatus(cameraStatusEl, cameraKind, cameraLabel);
      cameraDetailEl.innerHTML = `
        <div style="margin-top: 2px;">
          ${looksNotBsod
            ? `<div class="root-cause-note">Not BSOD: camera sees normal screen content.</div>`
            : ''
          }
          ${visualCatLower === 'dark'
            ? `<div class="root-cause-note">Dark frames are inconclusive: this may mean the phone screen is off, the camera is pointed away, or the phone is not present.</div>`
            : ''
          }
          ${dialogHintSuppressed
            ? `<div class="root-cause-note">⚠ OCR dialog hint detected but suppressed due to low visual content/contrast (likely false positive).</div>`
            : ''
          }
          ${suppressCameraDialogHints
            ? `<div class="root-cause-note">ℹ Camera dialog hints are currently suppressed (marked as false positives on this PC).</div>`
            : ''
          }
          ${systemUiDialogHint
            ? `<div class="root-cause-note">⚠ ${visualCatLower === 'dark' ? 'Raw OCR hint (low confidence on dark frames):' : 'Detected:'} native System UI crash/ANR dialog text.</div>`
            : ''
          }
          ${(!systemUiDialogHint && anrDialogHint)
            ? `<div class="root-cause-note">⚠ ${visualCatLower === 'dark' ? 'Raw OCR hint (low confidence on dark frames):' : 'Detected:'} native ANR (App Not Responding) dialog text.</div>`
            : ''
          }
          ${visualCat
            ? `<div class="root-cause-note">Category: ${escapeHtml(visualCat)}${visualStability != null ? ` · Stability: ${escapeHtml(String(Math.round(visualStability * 100)))}%` : ''}</div>`
            : ''
          }
          <div class="root-cause-note">Camera hints (not definitive):</div>
          <ul style="margin: 6px 0 0; padding-left: 18px;">
            <li>${systemUiDialogHint ? '✓' : '—'} System UI crash/ANR dialog text</li>
            <li>${anrDialogHint ? '✓' : '—'} App Not Responding (ANR) dialog text</li>
            <li>${visualCrackHint ? '✓' : '—'} Cracks / strong line artifacts</li>
            <li>${visualBandingHint ? '✓' : '—'} Horizontal banding / dead rows</li>
            <li>${visualEdgeShadowHint ? '✓' : '—'} Uneven backlight / edge shadow</li>
          </ul>

          ${(dialogHintRaw)
            ? `
              <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                <button id="bsod-camera-fp-btn" class="compact" type="button">Mark dialog hint as false positive</button>
                <button id="bsod-camera-fp-reset-btn" class="compact" type="button">Reset</button>
              </div>
              <div class="ai-result-meta" style="margin-top: 4px;">Use this if the phone is normal but OCR keeps reporting ANR/System UI dialogs (reflections/dark frames).</div>
            `
            : ''
          }
        </div>
      `;

      try {
        const fpBtn = document.getElementById('bsod-camera-fp-btn');
        const fpResetBtn = document.getElementById('bsod-camera-fp-reset-btn');
        if (fpBtn) {
          fpBtn.addEventListener('click', () => {
            try { localStorage.setItem('bsod_camera_dialog_suppress', '1'); } catch {}
            runCameraCheck();
          });
        }
        if (fpResetBtn) {
          fpResetBtn.addEventListener('click', () => {
            try { localStorage.removeItem('bsod_camera_dialog_suppress'); } catch {}
            runCameraCheck();
          });
        }
      } catch {
        // ignore
      }
    } else {
      setStatus(cameraStatusEl, 'warn', '⚠ Unavailable');
      const baseMsg = 'Camera-based checks unavailable. Ensure Python 3.8+, OpenCV, NumPy and a webcam are installed on this PC.';
      cameraDetailEl.textContent = visualError ? `${baseMsg} Details: ${visualError}` : baseMsg;
    }

    cameraRunBtn.disabled = false;
    bsodCameraIsRunning = false;

    return { visual, visualPayload, visualError, looksNotBsod, suggestsBsodStyle, visualCategory, dialogHint, uiCrashDetected, darkStable };
  }

  async function runChecks() {
    if (bsodDiagnoseIsRunning) return;
    bsodDiagnoseIsRunning = true;
    const mySeq = ++bsodDiagnoseRunSeq;

    summaryTextEl.textContent = 'Running USB-only checks from this PC (usually about 1 minute)…';
    setBsodSaveStatus('running', 'Auto-save status: Waiting for diagnostic result.');
    setLoading(true);
    setSummaryBadge(presenceBadgeEl, 'warn', 'Checking');
    setSummaryBadge(screenBadgeEl, 'warn', 'Checking');
    if (usbDetectedStatusEl) setStatus(usbDetectedStatusEl, 'running', 'Checking…');
    if (usbDetectedDetailEl) usbDetectedDetailEl.textContent = '';
    setStatus(adbStatusEl, 'running', 'Checking…');
    adbDetailEl.textContent = '';
    setStatus(fbStatusEl, 'running', 'Checking…');
    fbDetailEl.textContent = '';
    if (mtpStatusEl) setStatus(mtpStatusEl, 'running', 'Checking…');
    if (mtpDetailEl) mtpDetailEl.textContent = '';
    if (usbStatusEl) setStatus(usbStatusEl, 'running', 'Checking…');
    if (usbDetailEl) usbDetailEl.textContent = '';
    if (hostEvidenceStatusEl) setStatus(hostEvidenceStatusEl, 'running', 'Checking…');
    if (hostEvidenceDetailEl) hostEvidenceDetailEl.textContent = '';
    if (part1StatusEl) setStatus(part1StatusEl, 'running', 'Checking…');
    if (part1DetailEl) part1DetailEl.textContent = '';
    if (cameraStatusEl) setStatus(cameraStatusEl, '', 'Optional');
    if (cameraDetailEl) cameraDetailEl.textContent = 'Requires a webcam. This does not read the phone; it only analyzes what the camera sees.';
    if (cameraRunBtn) cameraRunBtn.disabled = false;

    setNoDeviceUiMode(false);

    // Use webcam as a cross-check only when there is no USB visibility.
    let cameraPromise = Promise.resolve(null);

    // Reset cached per-run UI helpers.
    lastCameraResForUi = null;

    renderTopReasons(null, null);
    renderNextSteps(['Checking device connection signals…']);
    renderAiConclusion('loading');

    const finish = () => {
      // Always release the running flag so the UI can't get stuck.
      bsodDiagnoseIsRunning = false;

      // Only update the UI if this run is still current.
      if (mySeq !== bsodDiagnoseRunSeq) return;
      setLoading(false);
    };

    const failAll = (summary, details, nextSteps) => {
      if (mySeq !== bsodDiagnoseRunSeq) return;
      summaryTextEl.textContent = summary;
      if (usbDetectedStatusEl) setStatus(usbDetectedStatusEl, 'error', 'Error');
      if (usbDetectedDetailEl) usbDetectedDetailEl.textContent = details || '';
      setStatus(adbStatusEl, 'error', 'Error');
      adbDetailEl.textContent = details || '';
      setStatus(fbStatusEl, 'error', 'Error');
      fbDetailEl.textContent = details || '';
      if (mtpStatusEl) setStatus(mtpStatusEl, 'error', 'Error');
      if (mtpDetailEl) mtpDetailEl.textContent = details || '';
      if (usbStatusEl) setStatus(usbStatusEl, 'error', 'Error');
      if (usbDetailEl) usbDetailEl.textContent = details || '';
      if (hostEvidenceStatusEl) setStatus(hostEvidenceStatusEl, 'error', 'Error');
      if (hostEvidenceDetailEl) hostEvidenceDetailEl.textContent = details || '';
      if (part1StatusEl) setStatus(part1StatusEl, 'error', 'Error');
      if (part1DetailEl) part1DetailEl.textContent = '';

      renderTopReasons(null, null);
      renderAiConclusion('error', { error: 'AI conclusion unavailable because the connection check failed.' });
      renderNextSteps(Array.isArray(nextSteps) ? nextSteps : []);
      setBsodSaveStatus('error', 'Auto-save skipped because diagnose did not complete.');
    };

    const readLocalAuthToken = () => {
      try {
        if (window.SmartHubAuth && typeof window.SmartHubAuth.getToken === 'function') {
          const t = String(window.SmartHubAuth.getToken() || '').trim();
          if (t) return t;
        }
      } catch {
        // ignore
      }

      try {
        const t = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
        if (t) return t;
      } catch {
        // ignore
      }

      return '';
    };

    const buildConnectionCheckRequestInit = () => {
      const headers = {
        Accept: 'application/json',
      };
      const token = readLocalAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return {
        cache: 'no-store',
        headers,
      };
    };

    const readResponseDetails = async (res) => {
      try {
        const text = String(await res.text()).replace(/\s+/g, ' ').trim();
        if (!text) return '';
        return text.length > 220 ? `${text.slice(0, 220)}...` : text;
      } catch {
        return '';
      }
    };

    const probeBackendHealth = async (origins) => {
      const list = Array.isArray(origins) ? origins : [];
      for (const origin of list) {
        try {
          const healthUrl = `${String(origin || '').replace(/\/$/, '')}/health`;
          const res = await fetch(healthUrl, { cache: 'no-store' });
          if (res && res.ok) {
            return { ok: true, origin: String(origin || '').replace(/\/$/, '') };
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, origin: '' };
    };

    try {
      let data = null;
      try {
        // BSOD diagnose must work even when adb is unavailable/unwanted.
        // Use Windows USB/MTP/PnP evidence for detection and let fastboot stay best-effort.
        const buildUrl = (origin) => {
          const url = new URL(`${origin}/connection-check`);
          url.searchParams.set('autoTest', '1');
          url.searchParams.set('usbOnly', '1');
          url.searchParams.set('samples', '30');
          url.searchParams.set('delayMs', '1500');
          url.searchParams.set('deep', '1');
          url.searchParams.set('mtpProbe', '1');
          url.searchParams.set('mtpProbeTimeoutMs', '8000');
          // Requested cadence: every 2s for 15s.
          url.searchParams.set('hbIntervalMs', '2000');
          url.searchParams.set('hbWindowMs', '15000');
          url.searchParams.set('hbAttemptTimeoutMs', '5000');
          // Technician confirmation fallback (never used as sole evidence unless host probe is unavailable).
          if (techConfirm && techConfirm.uiFrozen) url.searchParams.set('uiFrozen', '1');
          return String(url);
        };

        const configuredOrigin = (() => {
          try {
            const raw = typeof window.SMART_HUB_BACKEND_ORIGIN === 'string' ? window.SMART_HUB_BACKEND_ORIGIN.trim() : '';
            return raw ? raw.replace(/\/$/, '') : '';
          } catch {
            return '';
          }
        })();

        const origins = Array.from(new Set([
          configuredOrigin,
          'http://127.0.0.1:3333',
          'http://localhost:3333',
        ].filter(Boolean)));
        let lastNetworkErr = '';
        let recovered = false;

        for (let pass = 0; pass < 4 && !data; pass += 1) {
          for (const origin of origins) {
            try {
              const res = await fetch(buildUrl(origin), buildConnectionCheckRequestInit());
              if (!res.ok) {
                const detailText = await readResponseDetails(res);
                if (res.status === 401 || res.status === 403) {
                  failAll(
                    'Connection check requires an active SmartHub session.',
                    detailText || `Cannot run /connection-check without a valid login session (HTTP ${res.status}).`,
                    [
                      'Sign in again in this app to refresh your local session token.',
                      'If already signed in, log out then sign in again and retry.',
                    ],
                  );
                  return;
                }

                failAll(
                  `Could not run connection check (HTTP ${res.status}).`,
                  detailText || 'Could not run /connection-check. The backend returned an error.',
                  [
                    'Verify the SmartHub backend is running (http://127.0.0.1:3333).',
                    'Close and reopen the SmartHub desktop app, then retry.',
                  ],
                );
                return;
              }
              data = await res.json();
              if (pass > 0) {
                recovered = true;
              }
              break;
            } catch (e) {
              lastNetworkErr = e && e.message ? String(e.message) : 'network failure';
            }
          }

          if (!data && pass === 0) {
            try {
              if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
                window.chrome.webview.postMessage({ type: 'ensureBackend' });
              }
            } catch {
              // ignore
            }
          }

          if (!data) {
            await new Promise(resolve => setTimeout(resolve, pass < 2 ? 1200 : 1800));
          }
        }

        if (!data) {
          throw new Error(lastNetworkErr || 'backend unreachable');
        }

        if (recovered) {
          summaryTextEl.textContent = 'Recovered companion service connection. Running USB-only checks…';
        }
      } catch (e) {
        const networkErrMsg = e && e.message ? String(e.message) : 'network failure';
        // If running inside the Windows companion app (WebView2), ask the
        // host shell to ensure the backend service is running.
        try {
          if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
            window.chrome.webview.postMessage({ type: 'ensureBackend' });
          }
        } catch {
          // ignore
        }

        const health = await probeBackendHealth([
          'http://127.0.0.1:3333',
          'http://localhost:3333',
        ]);
        if (health.ok) {
          failAll(
            'Companion service is running, but /connection-check did not complete.',
            `Request failed before response (${networkErrMsg}). Health endpoint is reachable at ${health.origin}/health.`,
            [
              'Sign out then sign in again to refresh session authorization.',
              'Close and reopen SmartHub, then retry BSOD diagnose.',
            ],
          );
          return;
        }

        failAll(
          'Could not reach the companion service (http://127.0.0.1:3333).',
          'Could not reach /connection-check. The backend is unreachable.',
          [
            'Start the backend (npm run dev) or open the SmartHub desktop app.',
            'If port 3333 is in use, close the old instance and retry.',
          ],
        );
        return;
      }

      if (mySeq !== bsodDiagnoseRunSeq) return;

    const autoTest = (data && typeof data.autoTest === 'object' && data.autoTest) ? data.autoTest : null;
    const baseSummary = (data && typeof data.summary === 'string' && data.summary.trim())
      ? data.summary
      : 'USB-only checks completed.';
    // Set an initial summary early; we’ll overwrite it with a more human-friendly
    // summary once signals are parsed.
    if (autoTest && typeof autoTest.verdict === 'string' && autoTest.verdict.trim()) {
      const v = String(autoTest.verdict).trim().toUpperCase();
      const conf = (autoTest && typeof autoTest.confidence === 'string' && autoTest.confidence.trim()) ? String(autoTest.confidence).trim() : '';
      summaryTextEl.textContent = `Auto-test: ${v}${conf ? ` (${conf})` : ''}. ${baseSummary}`;
    } else {
      summaryTextEl.textContent = baseSummary;
    }

    const adb = (data && data.adb) || {};
    const fastboot = (data && data.fastboot) || {};
    const hostUsb = (data && data.hostUsb) || {};
    const bsod = (data && data.bsodAnalysis) || null;

    const adbDevices = Array.isArray(adb.devices) ? adb.devices : [];
    const portableDevices = Array.isArray(hostUsb.portableDevices) ? hostUsb.portableDevices : [];
    const transportDevices = Array.isArray(hostUsb.transportDevices) ? hostUsb.transportDevices : [];
    const fbDevices = Array.isArray(fastboot.devices) ? fastboot.devices : [];

    const hostUsbError = (hostUsb && typeof hostUsb.error === 'string' && hostUsb.error.trim()) ? String(hostUsb.error).trim() : '';
    const usbQueryFailed = !!(hostUsbError && /(powershell|cim|wmi|failed to query windows usb devices|cannot query windows usb devices|command failed|timed out)/i.test(hostUsbError));

    const adbState = (adbDevices[0] && adbDevices[0].state) ? String(adbDevices[0].state) : '';

    // Backend already filters hostUsb.* lists to be phone-relevant.
    // In USB-only mode (no ADB), many phones expose generic names; avoid re-filtering here.
    const isExcludedPeripheral = (value) => {
      const v = String(value || '');
      if (!v) return false;
      return /(microphone|headphone|headset|speaker|audio|usb audio|webcam|camera|video|hid|keyboard|mouse|gamepad|joystick|printer|scanner|usb input device|\binput device\b|wireless|wi-?fi|802\.11|bluetooth|ethernet|\blan\b|network|\bnic\b)/i.test(v);
    };

    const portableCandidates = portableDevices.filter(p => !isExcludedPeripheral(p && p.name ? p.name : ''));
    const transportCandidates = transportDevices.filter(t => !isExcludedPeripheral(`${t && t.name ? t.name : ''} ${t && t.class ? t.class : ''}`));

    // If Windows PnP enumeration is unavailable/blocked, we may still detect MTP via the WPD probe.
    const mtpProbeEvidence = (hostUsb && hostUsb.mtpProbeEvidence && typeof hostUsb.mtpProbeEvidence === 'object')
      ? hostUsb.mtpProbeEvidence
      : null;
    const mtpProbeDeviceCount = (mtpProbeEvidence && typeof mtpProbeEvidence.deviceCount === 'number')
      ? mtpProbeEvidence.deviceCount
      : null;
    const mtpProbeSuggestsMtp = !!(
      mtpProbeEvidence
      && mtpProbeEvidence.ok === true
      && mtpProbeEvidence.tool === 'wpd'
      && ((typeof mtpProbeDeviceCount === 'number' && mtpProbeDeviceCount > 0)
        || (typeof mtpProbeEvidence.deviceName === 'string' && mtpProbeEvidence.deviceName.trim().length > 0))
    );

    const mtpProbeZeroDevices = !!(
      portableCandidates.length > 0
      && mtpProbeEvidence
      && mtpProbeEvidence.tool === 'wpd'
      && mtpProbeEvidence.ok === true
      && typeof mtpProbeDeviceCount === 'number'
      && mtpProbeDeviceCount === 0
      && !(mtpProbeEvidence && mtpProbeEvidence.hostUnsupported)
    );

    const isPhoneLikeText = (value) => {
      const v = String(value || '');
      if (!v) return false;
      return /(android|mtp|phone|adb|fastboot|bootloader|qdloader|9008|qhusb|edl|qualcomm|preloader|mtk|mediatek|brom|vcom|spreadtrum|spd|unisoc|download|odin|recovery|samsung|galaxy|huawei|honor|xiaomi|redmi|oppo|vivo|oneplus|realme|motorola|pixel|google|nokia|sony|lg|htc|tecno|infinix|itel)/i.test(v);
    };

    const transportLooksPhone = transportCandidates.some(t => isPhoneLikeText(`${t && t.name ? t.name : ''} ${t && t.instanceId ? t.instanceId : ''}`));

    // "USB present" means Windows enumerated *some* USB VID/PID device.
    // "Phone visible" means at least one phone-like signal exists (ADB/Fastboot/MTP/phone-like transport).
    const usbPresent = transportCandidates.length > 0 || portableCandidates.length > 0 || adbDevices.length > 0 || fbDevices.length > 0 || mtpProbeSuggestsMtp;

    // Use VID as a *hint* for presence when the device name is generic.
    // This avoids treating unrelated dongles as a "likely phone".
    const phoneLikeVids = new Set([
      '18D1', // Google / Android
      '04E8', // Samsung
      '05C6', // Qualcomm (incl. 9008/EDL on many devices)
      '0E8D', // MediaTek
      '12D1', // Huawei
      '2717', // Xiaomi
      '22D9', // OPPO/OnePlus/Realme (common)
      '2A70', // OnePlus (common)
    ]);
    const transportLooksPhoneByVid = transportCandidates.some(t => {
      const vid = (t && t.vid) ? String(t.vid).toUpperCase() : '';
      if (!vid) return false;
      return phoneLikeVids.has(vid);
    });

    const phoneVisible = adbDevices.length > 0
      || fbDevices.length > 0
      || portableCandidates.length > 0
      || mtpProbeSuggestsMtp
      || transportLooksPhone
      || transportLooksPhoneByVid;

    // Baseline compare: helps distinguish "no phone" vs "phone present but generic".
    // If the user runs this once with no phone, then plugs the phone and re-checks,
    // we can show "LIKELY (NEW USB)" when a new generic transport appears.
    const transportSig = transportCandidates
      .map(t => {
        const vid = (t && t.vid) ? String(t.vid).toUpperCase() : '';
        const pid = (t && t.pid) ? String(t.pid).toUpperCase() : '';
        const name = (t && t.name) ? String(t.name) : '';
        const instanceId = (t && t.instanceId) ? String(t.instanceId) : '';
        const locInfo = (t && t.locationInfo) ? String(t.locationInfo) : '';
        const locPaths = (t && Array.isArray(t.locationPaths)) ? t.locationPaths.map(x => String(x || '')).filter(Boolean).slice(0, 2).join(',') : '';
        return `${vid}:${pid}|${name}|${instanceId}|${locInfo}|${locPaths}`;
      })
      .filter(Boolean)
      .sort()
      .join('||');

    let baselineSig = null;
    try {
      baselineSig = (window && window.__bsodUsbBaselineSig) ? String(window.__bsodUsbBaselineSig) : null;
    } catch {
      baselineSig = null;
    }
    const baselineKnown = baselineSig != null;
    const genericUsbNewSinceBaseline = baselineKnown && transportSig !== String(baselineSig || '');
    const genericUsbSameAsBaseline = baselineKnown && transportSig === String(baselineSig || '');

    // Only treat "likely phone" from generic USB when something NEW appeared compared to baseline,
    // or when VID strongly hints a phone.
    const compositeCandidates = transportCandidates.filter(t => /usb\s+composite\s+device/i.test(String(t && t.name ? t.name : '')));
    const phoneLikely = !phoneVisible && usbPresent && (
      transportLooksPhoneByVid ||
      (genericUsbNewSinceBaseline && transportCandidates.length === 1 && compositeCandidates.length === 1)
    );

    const presenceHint = (() => {
      if (phoneVisible) return '';
      if (!usbPresent) return '';
      if (phoneLikely) return 'Likely (USB)';
      if (!baselineKnown) return 'Maybe (generic USB)';
      if (genericUsbNewSinceBaseline) return 'Likely (new USB)';
      if (genericUsbSameAsBaseline) return 'Unknown (matches baseline)';
      return 'Maybe (generic USB)';
    })();

    try {
      // Always update baseline to the latest observed signature for next re-check.
      if (window) window.__bsodUsbBaselineSig = transportSig;
    } catch {
      // ignore
    }

    // Keep existing variable name used throughout the UI, but make it mean "phone visible".
    const deviceDetected = phoneVisible;

    // Auto-run webcam when there is no USB visibility OR when we only have generic USB
    // (USB Composite / transport-only) OR when only MTP is visible (no ADB/Fastboot).
    // This helps answer "BSOD-style screen?" and the "MTP alive but UI frozen" pattern.
    if (!usbPresent || (usbPresent && !phoneVisible) || ((portableCandidates.length > 0 || mtpProbeSuggestsMtp) && adbDevices.length === 0 && fbDevices.length === 0)) {
      cameraPromise = runCameraCheck();
    }

    const cameraRes = await cameraPromise;
    lastCameraResForUi = cameraRes;
    const cameraPayload = (cameraRes && cameraRes.visualPayload) ? cameraRes.visualPayload : null;
    const cameraLooksNotBsod = !!(cameraRes && cameraRes.looksNotBsod);
    const cameraDialogHint = !!(cameraRes && cameraRes.dialogHint);
    const cameraUiCrashDetected = !!(cameraRes && cameraRes.uiCrashDetected);
    const cameraSuggestsBsodStyle = !!(cameraRes && cameraRes.suggestsBsodStyle);
    const cameraIsDark = !!(cameraRes && cameraRes.visualCategory && String(cameraRes.visualCategory).toLowerCase() === 'dark');
    const cameraDarkStable = !!(cameraRes && cameraRes.darkStable);

    // Save a snapshot for manual webcam refreshes.
    // (Assigned later once anyChange/looksEdl/etc are computed.)
    lastDeviceDetectedForAi = !!deviceDetected;

    const bsodPart1 = (bsod && bsod.part1 && typeof bsod.part1 === 'object') ? bsod.part1 : null;
    const bsodCategory = (bsodPart1 && bsodPart1.category)
      ? String(bsodPart1.category)
      : (bsod && bsod.category ? String(bsod.category) : '');
    const bsodConfidence = (bsodPart1 && bsodPart1.confidence)
      ? String(bsodPart1.confidence)
      : (bsod && bsod.confidence ? String(bsod.confidence) : '');
    const bsodReasons = (bsodPart1 && Array.isArray(bsodPart1.reasons))
      ? bsodPart1.reasons
      : (bsod && Array.isArray(bsod.reasons) ? bsod.reasons : []);
    const firstReason = bsodReasons.map(r => String(r || '').trim()).find(Boolean) || '';

    const autoPrefix = (() => {
      if (!autoTest || typeof autoTest.verdict !== 'string' || !autoTest.verdict.trim()) return '';
      const v = String(autoTest.verdict).trim().toUpperCase();
      const conf = (autoTest && typeof autoTest.confidence === 'string' && autoTest.confidence.trim()) ? String(autoTest.confidence).trim() : '';
      return `Auto-test: ${v}${conf ? ` (${conf})` : ''}. `;
    })();

    let deviceLine = deviceDetected
      ? 'Phone detected over USB.'
      : (usbPresent ? 'USB device detected (not confirmed as phone).' : (usbQueryFailed ? 'USB visibility is unknown on this PC (USB enumeration failed).' : 'No phone detected over USB.'));

    let connectionLine = (() => {
      if (usbPresent && !phoneVisible) return 'USB device detected, but not identified as a phone (generic transport only).';
      if (adbDevices.length > 0) {
        if (adbState === 'unauthorized') return 'ADB needs authorization (tap “Allow USB debugging” on the phone).';
        if (adbState === 'offline') return 'ADB is offline (replug cable or revoke USB debugging auth then retry).';
        return 'ADB is available.';
      }
      if (fbDevices.length > 0) return 'Phone appears in fastboot/bootloader mode.';
      if (portableCandidates.length > 0 || transportCandidates.length > 0) return 'USB connection is present, but ADB is not available (USB debugging likely OFF).';
      if (usbQueryFailed) return `Could not query Windows USB devices on this PC (${hostUsbError}).`;
      return 'No usable USB signal yet (check cable/port, try another USB port).';
    })();

    // Make hostUnsupported explicit and keep the outcome conservative.
    if (
      mtpProbeEvidence
      && mtpProbeEvidence.hostUnsupported
      && usbPresent
      && phoneVisible
      && adbDevices.length === 0
      && fbDevices.length === 0
      && !/BSOD\s*–\s*UI\s*freeze/i.test(bsodCategory)
    ) {
      connectionLine = 'MTP probe failed due to a host COM interface error. Cannot assess the phone\'s state. Please reinstall Windows Portable Devices drivers or test on another PC. If you can visually see the phone is normal, ignore this result.';
    }

    let outcomeLine = (() => {
      if (usbQueryFailed) return 'Result: inconclusive (host USB enumeration failed).';
      if (!usbPresent) return 'Result: limited (no USB detection).';
      if (usbPresent && !phoneVisible) return 'Result: inconclusive (generic USB device only).';
      if (bsodCategory) {
        const conf = bsodConfidence ? ` (${bsodConfidence} confidence)` : '';
        const reason = firstReason ? ` Reason: ${firstReason}` : '';
        return `Result: ${bsodCategory}${conf}.${reason}`;
      }
      return 'Result: no clear BSOD cause from USB-only signals yet.';
    })();

    if (!usbPresent && cameraRes) {
      const cat = (cameraRes && typeof cameraRes.visualCategory === 'string') ? cameraRes.visualCategory : '';
      deviceLine = (cameraRes && cameraRes.visual)
        ? (usbQueryFailed ? 'USB enumeration failed on this PC; webcam analysis ran.' : 'No USB visibility from this PC; webcam analysis ran.')
        : 'No phone detected over USB.';

      if (cameraRes && cameraRes.visual) {
        if (cameraRes.looksNotBsod) {
          connectionLine = 'Webcam: normal screen content visible (likely not a BSOD-style boot failure).';
          deviceLine = usbQueryFailed ? 'USB enumeration failed on this PC; webcam sees normal screen content.' : 'No USB visibility from this PC; webcam sees normal screen content.';
        } else if (cat === 'dark') {
          connectionLine = 'Webcam: view is dark/unclear (cannot confirm phone presence).';
          outcomeLine = usbQueryFailed ? 'Result: inconclusive from USB-only (USB enumeration failed).' : 'Result: inconclusive from USB-only (no USB visibility).';
        } else if (cameraRes.suggestsBsodStyle) {
          connectionLine = `Webcam: possible BSOD-style screen/dialog${cat ? ` (${cat})` : ''}.`;
        } else {
          connectionLine = `Webcam: screen seen but inconclusive${cat ? ` (${cat})` : ''}.`;
        }
        outcomeLine = usbQueryFailed ? 'Result: inconclusive from USB-only (USB enumeration failed).' : 'Result: inconclusive from USB-only (no USB visibility).';
      }
    }

    // In generic-USB-only mode, keep the result inconclusive, but add a camera hint when available.
    if (usbPresent && !phoneVisible && cameraRes && cameraRes.visual) {
      const cat = (cameraRes && typeof cameraRes.visualCategory === 'string') ? cameraRes.visualCategory : '';
      if (cameraRes.looksNotBsod) {
        connectionLine = `${connectionLine} Webcam: normal screen content visible (likely not BSOD-style).`;
      } else if (cat === 'dark') {
        connectionLine = `${connectionLine} Webcam: dark/unclear (cannot confirm BSOD-style screen).`;
      } else if (cameraRes.suggestsBsodStyle) {
        connectionLine = `${connectionLine} Webcam: possible BSOD-style screen/dialog${cat ? ` (${cat})` : ''}.`;
      } else {
        connectionLine = `${connectionLine} Webcam: inconclusive${cat ? ` (${cat})` : ''}.`;
      }
    }

    // Summary override: if the signal cross-check infers the MTP UI-freeze pattern,
    // present this as BSOD (UI freeze) even in USB-only mode.
    try {
      const mtpProbeEvidenceForSummary = (hostUsb && typeof hostUsb.mtpProbeEvidence === 'object')
        ? hostUsb.mtpProbeEvidence
        : null;
      const mtpProbeStillEnumerated = (hostUsb && typeof hostUsb.mtpProbeStillEnumerated === 'boolean')
        ? hostUsb.mtpProbeStillEnumerated
        : true;
      const mtpProbeTimedOut = !!(mtpProbeEvidenceForSummary && mtpProbeEvidenceForSummary.timedOut && mtpProbeStillEnumerated);
      const mtpProbeErrorText = (mtpProbeEvidenceForSummary && typeof mtpProbeEvidenceForSummary.error === 'string')
        ? String(mtpProbeEvidenceForSummary.error)
        : '';
      const mtpProbeDeepErrorText = (mtpProbeEvidenceForSummary && typeof mtpProbeEvidenceForSummary.deepError === 'string')
        ? String(mtpProbeEvidenceForSummary.deepError)
        : '';
      const mtpProbeHrHex = (mtpProbeEvidenceForSummary && typeof mtpProbeEvidenceForSummary.errorHResultHex === 'string')
        ? String(mtpProbeEvidenceForSummary.errorHResultHex)
        : '';
      const mtpProbeDeepHrHex = (mtpProbeEvidenceForSummary && typeof mtpProbeEvidenceForSummary.deepErrorHResultHex === 'string')
        ? String(mtpProbeEvidenceForSummary.deepErrorHResultHex)
        : '';
      const heartbeatFreezeConfirmed = !!(hostUsb && hostUsb.mtpHeartbeat && hostUsb.mtpHeartbeat.freezeConfirmed);

      const mtpProbeHostUnsupported = !!(
        (mtpProbeEvidenceForSummary && mtpProbeEvidenceForSummary.hostUnsupported)
        || /(0x80004002|E_NOINTERFACE|No such interface supported|QueryInterface.*IPortableDevice|0x80040154|Class not registered)/i.test(mtpProbeErrorText)
      );
      const mtpProbeNotFound = /device\s+not\s+found\s+in\s+shell/i.test(mtpProbeErrorText);
      const mtpProbeCannotOpen = /cannot\s+open\s+mtp\s+folder/i.test(mtpProbeErrorText);
      const mtpProbeDeepCannotOpen = /cannot\s+open\s+child\s+folder/i.test(mtpProbeDeepErrorText);
      const mtpProbeSuspectHr = (mtpProbeStillEnumerated && (/(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeHrHex) || /(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeDeepHrHex)));
      const mtpProbeHardFail = !!(
        heartbeatFreezeConfirmed
        || (!mtpProbeHostUnsupported && (mtpProbeTimedOut || mtpProbeCannotOpen || mtpProbeDeepCannotOpen || mtpProbeSuspectHr))
      );
      const mtpProbeUnresponsive = !!(
        mtpProbeStillEnumerated
        && (
          heartbeatFreezeConfirmed
          || (!mtpProbeHostUnsupported && (mtpProbeTimedOut || mtpProbeCannotOpen || mtpProbeDeepCannotOpen || mtpProbeSuspectHr || mtpProbeZeroDevices))
        )
      );
      const mtpProbeLimited = !!(
        mtpProbeEvidenceForSummary
        && mtpProbeEvidenceForSummary.ok === true
        && typeof mtpProbeEvidenceForSummary.deepOk === 'boolean'
        && mtpProbeEvidenceForSummary.deepOk === false
      );

      const summarySig = inferSignalDiagnosis({
        hasAnyUsbSignal: usbPresent,
        usbPresent,
        phoneVisible,
        genericUsbOnly: (usbPresent && !phoneVisible),
        hasAdb,
        hasFastboot,
        hasMtp,
        anyChange,
        looksEdl,
        looksMtk,
        cameraLooksNotBsod,
        cameraDialogHint,
        cameraUiCrashDetected,
        cameraSuggestsBsodStyle,
        cameraIsDark,
        cameraDarkStable,
        techUiFrozen: !!(techConfirm && techConfirm.uiFrozen),
        hostUnsupported: mtpProbeHostUnsupported,
        mtpProbeTimedOut,
        mtpProbeStillEnumerated,
        mtpProbeUnresponsive,
        mtpProbeLimited,
        mtpProbeHardFail,
        mtpProbeNotFound,
        mtpProbeZeroDevices,
      });
      if (summarySig && typeof summarySig.patternKey === 'string') {
        const pk = String(summarySig.patternKey);
        const cc = (summarySig && typeof summarySig.crossCheckConfidence === 'string') ? summarySig.crossCheckConfidence : 'low';

        if (pk === 'mtp_ui_freeze') {
          const ccPretty = (cameraUiCrashDetected && cc === 'high') ? 'high (90–95%)' : cc;
          outcomeLine = cameraUiCrashDetected
            ? `Result: BSOD – UI freeze detected. The device is partially alive (MTP visible), but the UI is unresponsive. Webcam confirms System UI crash / ANR dialog. Likely caused by a third-party app. Recovery: Safe Mode. (${ccPretty} confidence).`
            : `Result: BSOD – UI freeze detected. The device is partially alive (MTP visible), but the UI is unresponsive. Likely caused by a third-party app. Recovery: Safe Mode. (${cc} confidence).`;
        }
      }
    } catch {
      // ignore
    }

    updateTwoLineBadges({ phoneVisible, usbPresent, phoneLikely, presenceHint, cameraRes, techUiFrozen: !!(techConfirm && techConfirm.uiFrozen), hostUnsupported: !!(mtpProbeEvidence && mtpProbeEvidence.hostUnsupported) });

    summaryTextEl.textContent = `${autoPrefix}${deviceLine} ${connectionLine} ${outcomeLine}`.trim();

    renderHostEvidenceCard(hostUsb);

    if (usbDetectedStatusEl && usbDetectedDetailEl) {
      const hasUsbSignal = adbDevices.length > 0 || fbDevices.length > 0 || portableCandidates.length > 0 || transportCandidates.length > 0;
      const hostUsbError = (hostUsb && typeof hostUsb.error === 'string' && hostUsb.error.trim()) ? hostUsb.error.trim() : '';

      if (hasUsbSignal) {
        if (!phoneVisible && transportCandidates.length > 0 && portableCandidates.length === 0 && adbDevices.length === 0 && fbDevices.length === 0) {
          setStatus(usbDetectedStatusEl, 'warn', '⚠ USB device detected (generic/unknown)');
        } else {
          setStatus(usbDetectedStatusEl, 'ok', '✓ Detected');
        }
        const detailParts = [];
        if (adbDevices.length > 0) detailParts.push('ADB visible');
        if (fbDevices.length > 0) detailParts.push('Fastboot visible');
        if (portableCandidates.length > 0) detailParts.push(`MTP/Portable (${portableCandidates.length})`);
        if (transportCandidates.length > 0) detailParts.push(`USB transport (${transportCandidates.length})`);
        if (!phoneVisible && transportCandidates.length > 0 && portableCandidates.length === 0 && adbDevices.length === 0 && fbDevices.length === 0) {
          const locHints = (() => {
            const first = transportCandidates.find(d => (d && (d.locationInfo || (Array.isArray(d.locationPaths) && d.locationPaths.length))));
            if (!first) return '';
            const loc = (first && first.locationInfo) ? String(first.locationInfo).trim() : '';
            const paths = (first && Array.isArray(first.locationPaths))
              ? first.locationPaths.map(x => String(x || '').trim()).filter(Boolean).slice(0, 2)
              : [];
            const parts = [];
            if (loc) parts.push(`port=${loc}`);
            if (paths.length) parts.push(`path=${paths.join(' , ')}`);
            return parts.length ? ` (${parts.join(' · ')})` : '';
          })();

          usbDetectedDetailEl.textContent = detailParts.length
            ? `Signals: ${detailParts.join(' · ')}. This may be the phone using a generic driver (composite), or another USB device.${locHints}`
            : `A generic USB device was detected. This may be the phone (composite driver) or another USB device.${locHints}`;
        } else {
          usbDetectedDetailEl.textContent = detailParts.length ? `Signals: ${detailParts.join(' · ')}` : 'Detected by this PC over USB.';
        }
      } else if (hostUsbError) {
        setStatus(usbDetectedStatusEl, 'warn', '⚠ Unknown');
        usbDetectedDetailEl.textContent = `Could not query Windows USB devices: ${hostUsbError}`;
      } else {
        if (cameraRes && cameraRes.visual) {
          const cat = (cameraRes && typeof cameraRes.visualCategory === 'string') ? cameraRes.visualCategory : '';
          if (cat === 'dark') {
            setStatus(usbDetectedStatusEl, 'warn', '⚠ No USB visibility (webcam: dark/unclear)');
            usbDetectedDetailEl.textContent = 'USB-only cannot see a phone from this PC. Webcam analysis ran, but the view is dark/unclear, so phone presence cannot be confirmed.';
          } else if (cameraRes.looksNotBsod) {
            setStatus(usbDetectedStatusEl, 'warn', '⚠ No USB visibility (webcam: normal content)');
            usbDetectedDetailEl.textContent = 'USB-only cannot see a phone from this PC, but the webcam sees normal screen content. This suggests the phone may be present while USB is disabled/frozen, or the cable/port is charge-only or failing.';
          } else {
            setStatus(usbDetectedStatusEl, 'warn', `⚠ No USB visibility (webcam: ${cat || 'inconclusive'})`);
            usbDetectedDetailEl.textContent = 'USB-only cannot see a phone from this PC. Webcam provides only a visual hint; treat this as inconclusive until the phone enumerates over USB.';
          }
        } else {
          setStatus(usbDetectedStatusEl, 'warn', '✕ No device detected');
          usbDetectedDetailEl.textContent = 'No Android phone signals were detected from this PC. Check cable/port and confirm the phone has power.';
        }
      }
    }

    if (adbDevices.length > 0) {
      const first = adbDevices[0];
      const st = first && first.state ? String(first.state) : '';
      const kind = (st === 'unauthorized' || st === 'offline') ? 'warn' : 'ok';
      const statusText = st === 'unauthorized'
        ? `⚠ ${adbDevices.length} device${adbDevices.length > 1 ? 's' : ''} (unauthorized)`
        : (st === 'offline'
          ? `⚠ ${adbDevices.length} device${adbDevices.length > 1 ? 's' : ''} (offline)`
          : `✓ ${adbDevices.length} device${adbDevices.length > 1 ? 's' : ''} visible`);
      setStatus(adbStatusEl, kind, statusText);

      const deviceLabel = first && first.model
        ? `${first.model} (${first.id || ''})`
        : (first && first.id ? first.id : '');
      adbDetailEl.textContent = st
        ? `Example: ${deviceLabel || 'device'} · state=${st}`
        : (deviceLabel ? `Example: ${deviceLabel}` : 'ADB is responding from this PC.');
    } else if (adb && adb.skipped) {
      setStatus(adbStatusEl, '', 'Skipped');
      adbDetailEl.textContent = 'ADB check skipped (USB-only mode). Detection uses Windows USB/MTP/PnP signals.';
    } else if (adb && typeof adb.error === 'string' && adb.error.trim()) {
      setStatus(adbStatusEl, 'error', '⚠ Error');
      adbDetailEl.textContent = adb.error;
    } else {
      setStatus(adbStatusEl, 'warn', '✕ Not detected');
      adbDetailEl.textContent = 'USB debugging may be OFF, the phone may not be booted, or the PC is not trusted.';
    }

    if (fbDevices.length > 0) {
      setStatus(fbStatusEl, 'warn', `✓ ${fbDevices.length} device${fbDevices.length > 1 ? 's' : ''} in bootloader`);
      const fbSig = (data && data.signals && Array.isArray(data.signals.fastboot) && data.signals.fastboot[0] && typeof data.signals.fastboot[0] === 'object')
        ? data.signals.fastboot[0]
        : null;
      const fbVars = (fbSig && fbSig.vars && typeof fbSig.vars === 'object') ? fbSig.vars : null;
      const fbVarCount = fbVars ? Object.keys(fbVars).length : 0;

      if (fbVarCount > 0) {
        const pick = (k) => {
          try {
            const v = fbVars[k];
            return (v == null) ? '' : String(v).trim();
          } catch {
            return '';
          }
        };
        const hints = [];
        const product = pick('product');
        const unlocked = pick('unlocked');
        const secure = pick('secure');
        const slot = pick('current-slot') || pick('slot-suffix');
        const snapshot = pick('snapshot-update-status') || pick('snapshot_state');

        if (product) hints.push(`product=${product}`);
        if (typeof unlocked === 'string' && unlocked) hints.push(`unlocked=${unlocked}`);
        if (typeof secure === 'string' && secure) hints.push(`secure=${secure}`);
        if (slot) hints.push(`slot=${slot}`);
        if (snapshot) hints.push(`snapshot=${snapshot}`);

        fbDetailEl.textContent = `Phone is not in normal Android mode; it is visible in fastboot/bootloader. getvar captured (${fbVarCount} vars)${hints.length ? `: ${hints.join(' · ')}` : '.'}`;
      } else if (fbSig && typeof fbSig.error === 'string' && fbSig.error.trim()) {
        fbDetailEl.textContent = `Phone is not in normal Android mode; it is visible in fastboot/bootloader. (fastboot getvar failed: ${fbSig.error.trim()})`;
      } else {
        fbDetailEl.textContent = 'Phone is not in normal Android mode; it is visible in fastboot/bootloader.';
      }
    } else if (fastboot && fastboot.skipped) {
      setStatus(fbStatusEl, '', 'Skipped');
      fbDetailEl.textContent = 'Fastboot check skipped (USB-only mode).';
    } else if (fastboot && typeof fastboot.error === 'string' && fastboot.error.trim()) {
      setStatus(fbStatusEl, 'error', '⚠ Error');
      fbDetailEl.textContent = fastboot.error;
    } else {
      setStatus(fbStatusEl, '', '✕ Not detected');
      fbDetailEl.textContent = 'No device listed by fastboot from this PC.';
    }

    if (mtpStatusEl && mtpDetailEl) {
      if (portableCandidates.length > 0) {
        setStatus(mtpStatusEl, 'ok', `✓ Detected (${portableCandidates.length})`);
        const names = portableCandidates
          .map(p => p && p.name)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ');
        mtpDetailEl.textContent = names
          ? `Example: ${names}`
          : 'Windows enumerates a Portable/WPD (often MTP) device. This does not guarantee File Explorer access if the phone is frozen/locked.';
      } else if (mtpProbeSuggestsMtp) {
        setStatus(mtpStatusEl, 'ok', '✓ Detected (via MTP probe)');
        const n = (mtpProbeEvidence && typeof mtpProbeEvidence.deviceName === 'string') ? mtpProbeEvidence.deviceName.trim() : '';
        mtpDetailEl.textContent = n
          ? `Detected via WPD MTP probe: ${n}`
          : 'Detected via WPD MTP probe even though the host portable-device list was empty/unavailable.';
      } else if (hostUsb && typeof hostUsb.error === 'string' && hostUsb.error.trim()) {
        setStatus(mtpStatusEl, 'error', '⚠ Error');
        mtpDetailEl.textContent = hostUsb.error;
      } else {
        setStatus(mtpStatusEl, '', '✕ Not detected');
        mtpDetailEl.textContent = 'No portable/MTP device was reported by the host OS.';
      }
    }

    if (usbStatusEl && usbDetailEl) {
      const sample = (hostUsb && hostUsb.sample) || {};
      const anyChange = !!(sample && sample.anyChange);
      const hasTransport = transportCandidates.length > 0;
      const transportIssues = transportCandidates.some(t => {
        const status = (t && t.status) ? String(t.status) : '';
        const problem = (t && typeof t.problemCode === 'number') ? t.problemCode : null;
        return (status && status.toUpperCase() !== 'OK') || (typeof problem === 'number' && problem !== 0);
      });

      let kind = '';
      let label = hasTransport ? `✓ Transport devices (${transportCandidates.length})` : 'No transport devices reported';
      if (anyChange) {
        kind = 'warn';
        label = '⚠ USB state changing (unstable)';
      } else if (hasTransport && transportIssues) {
        kind = 'warn';
        label = '⚠ Transport errors detected';
      } else if (hasTransport) {
        kind = 'ok';
      }
      if (hostUsb && typeof hostUsb.error === 'string' && hostUsb.error.trim()) {
        kind = 'error';
        label = '⚠ Error';
      }

      setStatus(usbStatusEl, kind, label);

      const parts = [];
      if (anyChange) {
        parts.push('USB enumeration changed during sampling (cable/port/hub, power instability, or device USB port).');
      }
      if (hasTransport && transportIssues && !anyChange) {
        parts.push('Some USB transport devices are not OK (driver/enumeration issue possible).');
      }
      if (hasTransport) {
        const samples = transportCandidates
          .slice(0, 5)
          .map(t => {
            const name = (t && t.name) ? String(t.name) : 'USB device';
            const status = (t && t.status) ? String(t.status) : '';
            const vid = (t && t.vid) ? String(t.vid) : '';
            const pid = (t && t.pid) ? String(t.pid) : '';
            const id = (vid && pid) ? ` (${vid}:${pid})` : '';
            const problem = (t && typeof t.problemCode === 'number') ? t.problemCode : null;
            const prob = (typeof problem === 'number' && problem !== 0) ? ` · Code ${problem}` : '';
            return status ? `${name}${id} – ${status}${prob}` : `${name}${id}${prob}`;
          });
        parts.push(`Examples: ${samples.join(' · ')}`);
      }

      const native = hostUsb && hostUsb.nativeUsbEvidence ? hostUsb.nativeUsbEvidence : null;
      if (native && typeof native.ok === 'boolean') {
        const dur = (native.durationMs && typeof native.durationMs === 'number') ? ` (${Math.round(native.durationMs)}ms)` : '';
        if (native.ok) {
          parts.push(`Native USB helper: ✓ used${dur}.`);
        } else {
          const err = (native.error && String(native.error).trim()) ? ` – ${String(native.error).trim()}` : '';
          parts.push(`Native USB helper: ⚠ failed${dur}${err}.`);
        }
      }

      if (hostUsb && typeof hostUsb.error === 'string' && hostUsb.error.trim()) {
        parts.push(hostUsb.error.trim());
      }
      usbDetailEl.textContent = parts.join(' ');
    }

    const transportNames = transportCandidates.map(t => (t && t.name ? String(t.name) : '')).join(' ');
    const sample = (hostUsb && hostUsb.sample) || {};
    const anyChange = !!(sample && sample.anyChange);
    const hasAdb = adbDevices.length > 0;
    const hasFastboot = fbDevices.length > 0;
    const hasMtp = portableCandidates.length > 0 || mtpProbeSuggestsMtp;
    const looksEdl = /\b(9008|qdloader|edl|qhusb)\b/i.test(transportNames);
    const looksMtk = /\b(preloader|brom|vcom)\b/i.test(transportNames);
    const looksDownload = /\b(cdc\s*composite|download|odin)\b/i.test(transportNames)
      || transportCandidates.some(t => {
        const n = (t && t.name) ? String(t.name) : '';
        return /SAMSUNG\s+Mobile\s+USB\s+CDC\s+Composite\s+Device/i.test(n)
          || /samsung.*\b(download|odin)\b/i.test(n)
          || /\b(download|odin)\b.*samsung/i.test(n);
      });

    // Deep MTP responsiveness signals (WPD helper), used for the USB-only
    // cross-check / Offline AI override.
    const mtpProbeForSnap = hostUsb && hostUsb.mtpProbeEvidence && typeof hostUsb.mtpProbeEvidence === 'object'
      ? hostUsb.mtpProbeEvidence
      : null;
    const mtpProbeStillEnumeratedForSnap = (hostUsb && typeof hostUsb.mtpProbeStillEnumerated === 'boolean')
      ? hostUsb.mtpProbeStillEnumerated
      : true;
    const heartbeatFreezeConfirmedForSnap = !!(hostUsb && hostUsb.mtpHeartbeat && hostUsb.mtpHeartbeat.freezeConfirmed);
    const mtpProbeTimedOutForSnap = !!(mtpProbeForSnap && mtpProbeForSnap.timedOut && mtpProbeStillEnumeratedForSnap);
    const mtpProbeErrorTextForSnap = (mtpProbeForSnap && typeof mtpProbeForSnap.error === 'string') ? String(mtpProbeForSnap.error) : '';
    const mtpProbeDeepErrorTextForSnap = (mtpProbeForSnap && typeof mtpProbeForSnap.deepError === 'string') ? String(mtpProbeForSnap.deepError) : '';
    const mtpProbeHrHexForSnap = (mtpProbeForSnap && typeof mtpProbeForSnap.errorHResultHex === 'string') ? String(mtpProbeForSnap.errorHResultHex) : '';
    const mtpProbeDeepHrHexForSnap = (mtpProbeForSnap && typeof mtpProbeForSnap.deepErrorHResultHex === 'string') ? String(mtpProbeForSnap.deepErrorHResultHex) : '';
    const mtpProbeHostUnsupportedForSnap = !!(
      (mtpProbeForSnap && mtpProbeForSnap.hostUnsupported)
      || /(0x80004002|E_NOINTERFACE|No such interface supported|QueryInterface.*IPortableDevice|0x80040154|Class not registered)/i.test(mtpProbeErrorTextForSnap)
    );
    const mtpProbeNotFoundForSnap = /device\s+not\s+found\s+in\s+shell/i.test(mtpProbeErrorTextForSnap);
    const mtpProbeCannotOpenForSnap = /cannot\s+open\s+mtp\s+folder/i.test(mtpProbeErrorTextForSnap);
    const mtpProbeDeepCannotOpenForSnap = /cannot\s+open\s+child\s+folder/i.test(mtpProbeDeepErrorTextForSnap);
    const mtpProbeSuspectHrForSnap = (mtpProbeStillEnumeratedForSnap && (/(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeHrHexForSnap) || /(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeDeepHrHexForSnap)));

    const mtpProbeDeviceCountForSnap = (mtpProbeForSnap && typeof mtpProbeForSnap.deviceCount === 'number')
      ? mtpProbeForSnap.deviceCount
      : null;
    const mtpProbeZeroDevicesForSnap = !!(
      portableCandidates.length > 0
      && mtpProbeForSnap
      && mtpProbeForSnap.tool === 'wpd'
      && mtpProbeForSnap.ok === true
      && typeof mtpProbeDeviceCountForSnap === 'number'
      && mtpProbeDeviceCountForSnap === 0
      && !mtpProbeHostUnsupportedForSnap
    );
    const mtpProbeHardFailForSnap = !!(
      heartbeatFreezeConfirmedForSnap
      || (!mtpProbeHostUnsupportedForSnap && (mtpProbeTimedOutForSnap || mtpProbeCannotOpenForSnap || mtpProbeDeepCannotOpenForSnap || mtpProbeSuspectHrForSnap))
    );
    const mtpProbeUnresponsiveForSnap = !!(
      mtpProbeStillEnumeratedForSnap
      && (
        heartbeatFreezeConfirmedForSnap
        || (!mtpProbeHostUnsupportedForSnap && (
          (mtpProbeForSnap && mtpProbeForSnap.ok === false)
          || mtpProbeSuspectHrForSnap
          || mtpProbeZeroDevicesForSnap
        ))
      )
    );
    const mtpProbeLimitedForSnap = !!(
      mtpProbeForSnap
      && mtpProbeForSnap.ok === true
      && typeof mtpProbeForSnap.deepOk === 'boolean'
      && mtpProbeForSnap.deepOk === false
    );

    lastSignalSnapshotForAi = {
      hasAnyUsbSignal: !!usbPresent,
      usbPresent: !!usbPresent,
      phoneVisible: !!phoneVisible,
      phoneLikely: !!phoneLikely,
      hostUnsupported: mtpProbeHostUnsupportedForSnap,
      anyChange,
      hasAdb,
      hasFastboot,
      hasMtp,
      looksEdl,
      looksMtk,
      looksDownload,
      genericUsbOnly: (usbPresent && !phoneVisible),
      cameraLooksNotBsod,
      cameraDialogHint,
      cameraSuggestsBsodStyle,
      cameraIsDark,
      cameraDarkStable,
      techUiFrozen: !!(techConfirm && techConfirm.uiFrozen),
      mtpProbeTimedOut: mtpProbeTimedOutForSnap,
      mtpProbeStillEnumerated: mtpProbeStillEnumeratedForSnap,
      mtpProbeUnresponsive: mtpProbeUnresponsiveForSnap,
      mtpProbeZeroDevices: mtpProbeZeroDevicesForSnap,
      mtpUnresponsive: !!(mtpProbeTimedOutForSnap || mtpProbeUnresponsiveForSnap || mtpProbeZeroDevicesForSnap),
      mtpProbeLimited: mtpProbeLimitedForSnap,
      mtpProbeHardFail: mtpProbeHardFailForSnap,
      mtpProbeNotFound: mtpProbeNotFoundForSnap,
    };

    let active = null;
    if (bsod && bsod.part1 && typeof bsod.part1 === 'object') {
      active = bsod.part1;
    } else if (bsod && typeof bsod === 'object') {
      active = bsod;
    }

    const inferredPart1 = inferBsodPart1FromSignals({ hasAnyUsbSignal: usbPresent, hasAdb, hasFastboot, hasMtp, anyChange, looksEdl, looksMtk, looksDownload, cameraLooksNotBsod, cameraDialogHint, cameraUiCrashDetected, cameraSuggestsBsodStyle, cameraIsDark, cameraDarkStable, genericUsbOnly: (usbPresent && !phoneVisible), techUiFrozen: !!(techConfirm && techConfirm.uiFrozen), mtpProbeTimedOut: mtpProbeTimedOutForSnap, mtpProbeStillEnumerated: mtpProbeStillEnumeratedForSnap, mtpProbeUnresponsive: mtpProbeUnresponsiveForSnap, mtpProbeZeroDevices: mtpProbeZeroDevicesForSnap });
    let activeForUi = (usbPresent && !phoneVisible)
      ? inferredPart1
      : ((active && (active.primaryReason || active.category)) ? active : inferredPart1);

    // If our signal inference detects the MTP UI-freeze pattern (often app/ANR),
    // prefer it over the backend Part 1 so the UI matches what the tech sees.
    try {
      const pr = inferredPart1 && inferredPart1.primaryReason ? String(inferredPart1.primaryReason) : '';
      if (/ui\s*freeze/i.test(pr)) {
        activeForUi = inferredPart1;
      }
    } catch {
      // ignore
    }

    if (part1StatusEl && part1DetailEl) {
      const catRaw = activeForUi && (activeForUi.primaryReason || activeForUi.category)
        ? String(activeForUi.primaryReason || activeForUi.category)
        : '';
      const conf = activeForUi && activeForUi.confidence ? String(activeForUi.confidence) : 'low';
      const reasons = (activeForUi && Array.isArray(activeForUi.reasons)) ? activeForUi.reasons.filter(Boolean) : [];

      // UX guardrail: some legacy payloads label host USB/MTP driver problems as
      // "System Errors", which reads like a phone OS BSOD. If the reasons clearly
      // point to Windows Device Manager / enumeration / driver issues, show a
      // connectivity/host-USB label instead.
      let cat = catRaw;
      try {
        const catL = String(catRaw || '').toLowerCase();
        const reasonText = String((reasons || []).join(' ') || '').toLowerCase();
        const looksHostUsb =
          reasonText.includes('device manager') ||
          reasonText.includes('enumeration') ||
          reasonText.includes('wpd') ||
          reasonText.includes('mtp') ||
          reasonText.includes('driver') ||
          reasonText.includes('problem code') ||
          reasonText.includes('host');

        if ((catL.includes('system errors') || catL === 'system errors') && looksHostUsb) {
          cat = 'Connectivity issues (Host USB/MTP driver)';
        }
      } catch {
        cat = catRaw;
      }

      if (cat) {
        const kind = conf === 'high' ? 'ok' : (conf === 'medium' ? 'warn' : '');
        setStatus(part1StatusEl, kind, cat);
        part1DetailEl.textContent = `Confidence: ${conf}. ${reasons.join(' ')}`.trim();
      } else {
        setStatus(part1StatusEl, '', 'No analysis available');
        part1DetailEl.textContent = '';
      }
    }

    setNoDeviceUiMode(false);

    const transport = transportCandidates;

    const logEvidence = (data && data.signals && data.signals.adb && data.signals.adb.logEvidence) ? data.signals.adb.logEvidence : null;
    renderTopReasons(activeForUi, {
      hasAdb,
      hasFastboot,
      hasMtp,
      anyChange,
      looksEdl,
      looksMtk,
      looksDownload,
      logEvidence,
    });

    const mtpProbeEvidenceForSignal = (data && data.hostUsb && typeof data.hostUsb.mtpProbeEvidence === 'object')
      ? data.hostUsb.mtpProbeEvidence
      : null;
    const mtpProbeStillEnumerated = (data && data.hostUsb && typeof data.hostUsb.mtpProbeStillEnumerated === 'boolean')
      ? data.hostUsb.mtpProbeStillEnumerated
      : true;
    const mtpProbeTimedOut = !!(mtpProbeEvidenceForSignal && mtpProbeEvidenceForSignal.timedOut && mtpProbeStillEnumerated);
    const mtpProbeErrorText = (mtpProbeEvidenceForSignal && typeof mtpProbeEvidenceForSignal.error === 'string')
      ? String(mtpProbeEvidenceForSignal.error)
      : '';
    const mtpProbeDeepErrorText = (mtpProbeEvidenceForSignal && typeof mtpProbeEvidenceForSignal.deepError === 'string')
      ? String(mtpProbeEvidenceForSignal.deepError)
      : '';
    const mtpProbeHrHex = (mtpProbeEvidenceForSignal && typeof mtpProbeEvidenceForSignal.errorHResultHex === 'string')
      ? String(mtpProbeEvidenceForSignal.errorHResultHex)
      : '';
    const mtpProbeDeepHrHex = (mtpProbeEvidenceForSignal && typeof mtpProbeEvidenceForSignal.deepErrorHResultHex === 'string')
      ? String(mtpProbeEvidenceForSignal.deepErrorHResultHex)
      : '';
    const heartbeatFreezeConfirmed = !!(data && data.hostUsb && data.hostUsb.mtpHeartbeat && data.hostUsb.mtpHeartbeat.freezeConfirmed);
    const mtpProbeNotFound = /device\s+not\s+found\s+in\s+shell/i.test(mtpProbeErrorText);
    const mtpProbeCannotOpen = /cannot\s+open\s+mtp\s+folder/i.test(mtpProbeErrorText);
    const mtpProbeDeepCannotOpen = /cannot\s+open\s+child\s+folder/i.test(mtpProbeDeepErrorText);
    const mtpProbeSuspectHr = (mtpProbeStillEnumerated && (/(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeHrHex) || /(0x80004005|0x8000ffff|0x80004004|0x802a)/i.test(mtpProbeDeepHrHex)));
    const mtpProbeHardFail = mtpProbeTimedOut || mtpProbeCannotOpen || mtpProbeDeepCannotOpen || mtpProbeSuspectHr || heartbeatFreezeConfirmed;
    const mtpProbeUnresponsive = !!(
      mtpProbeStillEnumerated
      && (
        heartbeatFreezeConfirmed
        || (mtpProbeEvidenceForSignal && mtpProbeEvidenceForSignal.ok === false)
        || mtpProbeSuspectHr
        || mtpProbeZeroDevices
      )
    );
    const mtpProbeLimited = !!(
      mtpProbeEvidenceForSignal
      && mtpProbeEvidenceForSignal.ok === true
      && typeof mtpProbeEvidenceForSignal.deepOk === 'boolean'
      && mtpProbeEvidenceForSignal.deepOk === false
    );

    // Offline AI conclusion: enrich with webcam payload when available.
    let signalDiagForAi = {
      bsodStatusText: 'Inconclusive (signal estimate unavailable)',
      possibleCauseGroup: 'Other',
      actions: ['Retry the BSOD diagnose to collect USB/MTP signals.'],
    };
    let queueAutoRemember = () => {};
    let onlineAiPayload = {
      required: REQUIRE_ONLINE_AI_FOR_BSOD,
      used: false,
      text: '',
      error: '',
      citations: [],
      webSearch: null,
    };

    try {
      const enriched = Object.assign({}, data || {});
      lastEnrichedForAi = enriched;

      const connectionForAi = buildConnectionWithTechConfirm(enriched);
      const langForAi = (() => {
        try {
          return window.SmartHubI18n && typeof window.SmartHubI18n.getCurrentLang === 'function'
            ? window.SmartHubI18n.getCurrentLang()
            : 'en';
        } catch {
          return 'en';
        }
      })();

      const authTokenForAi = readLocalAuthToken();
      const aiHeaders = { 'Content-Type': 'application/json' };
      if (authTokenForAi) {
        aiHeaders.Authorization = `Bearer ${authTokenForAi}`;
      }

      let onlineAiResult = null;
      if (REQUIRE_ONLINE_AI_FOR_BSOD) {
        onlineAiResult = {
          ok: false,
          text: '',
          error: '',
          citations: [],
          webSearch: null,
        };
        try {
          const onlineRes = await fetch('http://127.0.0.1:3333/ai-online-suggest', {
            method: 'POST',
            headers: aiHeaders,
            body: JSON.stringify({
              kind: 'bsod_usb_only',
              features: {
                connection: connectionForAi,
                visual: cameraPayload,
                lang: langForAi,
              },
            }),
          });

          const onlineRaw = await onlineRes.text();
          let onlineBody = null;
          try {
            onlineBody = onlineRaw ? JSON.parse(onlineRaw) : null;
          } catch {
            onlineBody = null;
          }

          if (onlineRes.ok && onlineBody && onlineBody.ok && typeof onlineBody.text === 'string' && onlineBody.text.trim()) {
            const normalizedCitations = Array.isArray(onlineBody.citations)
              ? onlineBody.citations
                .map((it) => {
                  if (!it || typeof it !== 'object') return null;
                  const title = typeof it.title === 'string' ? it.title.trim() : '';
                  const url = typeof it.url === 'string' ? it.url.trim() : '';
                  const snippet = typeof it.snippet === 'string' ? it.snippet.trim() : '';
                  const source = typeof it.source === 'string' ? it.source.trim() : '';
                  const query = typeof it.query === 'string' ? it.query.trim() : '';
                  if (!/^https?:\/\//i.test(url)) return null;
                  return { title, url, snippet, source, query };
                })
                .filter(Boolean)
                .slice(0, 8)
              : [];

            const normalizedWebSearch = onlineBody.webSearch && typeof onlineBody.webSearch === 'object'
              ? {
                provider: typeof onlineBody.webSearch.provider === 'string' ? onlineBody.webSearch.provider.trim() : '',
                hitCount: Number.isFinite(Number(onlineBody.webSearch.hitCount))
                  ? Number(onlineBody.webSearch.hitCount)
                  : normalizedCitations.length,
                queries: Array.isArray(onlineBody.webSearch.queries)
                  ? onlineBody.webSearch.queries.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 5)
                  : [],
              }
              : null;

            onlineAiResult.ok = true;
            onlineAiResult.text = onlineBody.text.trim();
            onlineAiResult.citations = normalizedCitations;
            onlineAiResult.webSearch = normalizedWebSearch;
          } else if (onlineRes.ok && onlineRaw && onlineRaw.trim()) {
            onlineAiResult.ok = true;
            onlineAiResult.text = onlineRaw.trim();
          } else {
            const bodyErr = onlineBody && typeof onlineBody.error === 'string' ? onlineBody.error.trim() : '';
            onlineAiResult.error = bodyErr || `Online AI HTTP ${onlineRes.status}`;
          }
        } catch (e) {
          onlineAiResult.error = e && e.message ? String(e.message) : 'Online AI request failed';
        }

        onlineAiPayload = {
          required: REQUIRE_ONLINE_AI_FOR_BSOD,
          used: !!onlineAiResult.ok,
          text: onlineAiResult.ok && onlineAiResult.text ? String(onlineAiResult.text).trim() : '',
          error: onlineAiResult.ok
            ? ''
            : String(onlineAiResult.error || 'Online AI did not return a usable response.').trim(),
          citations: Array.isArray(onlineAiResult.citations) ? onlineAiResult.citations : [],
          webSearch: onlineAiResult.webSearch && typeof onlineAiResult.webSearch === 'object'
            ? onlineAiResult.webSearch
            : null,
        };
      } else {
        // Built-in/local AI only: do not call online suggest endpoint.
        onlineAiResult = null;
        onlineAiPayload = {
          required: false,
          used: false,
          text: '',
          error: '',
          citations: [],
          webSearch: null,
        };
      }
      lastOnlineAiAudit = Object.assign({}, onlineAiPayload);

      signalDiagForAi = inferSignalDiagnosis({
        hasAnyUsbSignal: usbPresent,
        hasAdb,
        hasFastboot,
        hasMtp,
        anyChange,
        looksEdl,
        looksMtk,
        cameraLooksNotBsod,
        cameraDialogHint,
        cameraUiCrashDetected,
        cameraSuggestsBsodStyle,
        cameraIsDark,
        cameraDarkStable,
        genericUsbOnly: (usbPresent && !phoneVisible),
        techUiFrozen: !!(techConfirm && techConfirm.uiFrozen),
        hostUnsupported: !!(mtpProbeEvidenceForSignal && mtpProbeEvidenceForSignal.hostUnsupported),
        mtpProbeTimedOut,
        mtpProbeStillEnumerated,
        mtpProbeUnresponsive,
        mtpProbeLimited,
        mtpProbeHardFail,
        mtpProbeNotFound,
        mtpProbeZeroDevices,
      });

      if (REQUIRE_ONLINE_AI_FOR_BSOD && !onlineAiPayload.used) {
        const failReason = onlineAiPayload.error || 'Online AI request failed.';
        summaryTextEl.textContent = `${summaryTextEl.textContent} Built-in AI will be used; Online AI was unavailable.`.trim();
        renderAiConclusion('error', {
          error: `Built-in AI will be used for BSOD diagnosis. ${failReason}`,
          online: onlineAiPayload,
          fallback: {
            note: 'Signal cross-check is shown; built-in/local AI is used as a fallback.',
            bsodStatusText: signalDiagForAi.bsodStatusText,
            possibleCauseGroup: signalDiagForAi.possibleCauseGroup,
            actions: signalDiagForAi.actions,
          },
        });
        renderNextSteps([
          'Online AI settings were skipped. Built-in AI (local) is being used instead.',
          'If you prefer Online AI, configure API URL/key in settings and retry.',
        ]);
        setBsodSaveStatus('warn', 'Auto-save: Online AI unavailable; using built-in AI.');
        return;
      }

      // Always prepare auto-save payload from USB-only diagnosis data.
      // This keeps memory saving available even when ADB is missing or AI helper fails.
      lastAiRememberPayload = { connection: connectionForAi, visual: cameraPayload };

      const buildAutoRememberSignature = (topKey = '', specKey = '') => {
        const primaryName = (enriched && enriched.hostUsb && Array.isArray(enriched.hostUsb.portableDevices) && enriched.hostUsb.portableDevices[0] && enriched.hostUsb.portableDevices[0].name)
          ? String(enriched.hostUsb.portableDevices[0].name)
          : '';
        const signalBsod5 = (signalDiagForAi && typeof signalDiagForAi.bsod5Key === 'string')
          ? String(signalDiagForAi.bsod5Key)
          : '';
        const signalPattern = (signalDiagForAi && typeof signalDiagForAi.patternKey === 'string')
          ? String(signalDiagForAi.patternKey)
          : '';

        return [
          topKey,
          specKey,
          signalBsod5,
          signalPattern,
          primaryName,
          hasAdb ? `adb:${adbState || 'device'}` : 'noadb',
          hasFastboot ? 'fb' : 'nofb',
          hasMtp ? 'mtp' : 'nomtp',
          anyChange ? 'unstable' : 'stable',
          looksEdl ? 'edl' : '',
          looksMtk ? 'mtk' : '',
          (() => {
            try {
              const transportList = (typeof transportCandidates !== 'undefined' && Array.isArray(transportCandidates))
                ? transportCandidates
                : ((typeof transport !== 'undefined' && Array.isArray(transport)) ? transport : []);
              const ids = transportList
                .slice(0, 3)
                .map(t => {
                  const vid = (t && t.vid) ? String(t.vid) : '';
                  const pid = (t && t.pid) ? String(t.pid) : '';
                  if (!vid || !pid) return '';
                  return `${vid}:${pid}`;
                })
                .filter(Boolean);
              return ids.length ? `usb:${ids.join(',')}` : '';
            } catch {
              return '';
            }
          })(),
        ].filter(Boolean).join('|');
      };

      queueAutoRemember = (topKey = '', specKey = '') => {
        try {
          const signature = buildAutoRememberSignature(topKey, specKey);
          autoRememberAiCase(lastAiRememberPayload, signature, mySeq);
        } catch {
          // ignore auto-memory errors
        }
      };

      const aiRes = await fetch('http://127.0.0.1:3333/ai-no-debug-suggest', {
        method: 'POST',
        headers: aiHeaders,
        body: JSON.stringify({
          connection: connectionForAi,
          visual: cameraPayload,
          lang: langForAi,
        }),
      });

      if (mySeq !== bsodDiagnoseRunSeq) return;

      if (aiRes.ok) {
        const ai = await aiRes.json();
        if (ai && ai.ok) {
          lastAiSuggestForUi = ai;
          const aiView = Object.assign({}, ai, {
            __signalFallback: signalDiagForAi,
            __autoTest: autoTest,
            __cameraLooksNotBsod: cameraLooksNotBsod,
            __onlineAi: onlineAiPayload,
          });
          renderAiConclusion('ok', aiView);
          const topKey = ai && ai.top && typeof ai.top === 'object' && ai.top.key ? String(ai.top.key) : '';
          const specKey = ai && ai.specific && typeof ai.specific === 'object' && ai.specific.key ? String(ai.specific.key) : '';
          queueAutoRemember(topKey, specKey);
        } else {
          renderAiConclusion('error', {
            error: (ai && ai.error) ? ai.error : 'AI helper returned an error.',
            online: onlineAiPayload,
            fallback: {
              note: 'SmartHub AI helper failed; showing signal-based estimate only.',
              bsodStatusText: signalDiagForAi.bsodStatusText,
              possibleCauseGroup: signalDiagForAi.possibleCauseGroup,
              actions: signalDiagForAi.actions,
            },
          });
          queueAutoRemember();
        }
      } else {
        let detail = `AI helper HTTP ${aiRes.status}`;
        try {
          const raw = await aiRes.text();
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = null;
          }
          if (body && typeof body.error === 'string' && body.error.trim()) {
            detail = `${detail}: ${body.error}`;
          } else if (body && typeof body.message === 'string' && body.message.trim()) {
            detail = `${detail}: ${body.message}`;
          } else if (raw && raw.trim()) {
            const compact = raw.replace(/\s+/g, ' ').trim();
            detail = `${detail}: ${compact.slice(0, 240)}${compact.length > 240 ? '…' : ''}`;
          }
        } catch {
          // ignore JSON parse errors
        }
        renderAiConclusion('error', {
          error: detail,
          online: onlineAiPayload,
          fallback: {
            note: 'SmartHub AI helper unavailable; showing signal-based estimate only.',
            bsodStatusText: signalDiagForAi.bsodStatusText,
            possibleCauseGroup: signalDiagForAi.possibleCauseGroup,
            actions: signalDiagForAi.actions,
          },
        });
        queueAutoRemember();
      }
    } catch {
      renderAiConclusion('error', {
        error: 'AI helper unavailable on this PC.',
        online: onlineAiPayload,
        fallback: {
          note: 'SmartHub AI helper unavailable; showing signal-based estimate only.',
          bsodStatusText: signalDiagForAi.bsodStatusText,
          possibleCauseGroup: signalDiagForAi.possibleCauseGroup,
          actions: signalDiagForAi.actions,
        },
      });
      queueAutoRemember();
    }

    const steps = [];
    const pushUnique = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      if (steps.includes(t)) return;
      steps.push(t);
    };

    // Add common quick-fix guidance when the diagnosis points to it.
    // Keep this lightweight and non-invasive: we only append tips for issues
    // that SmartHub explicitly flags (overheating, low storage, battery/power).
    try {
      const ar = (activeForUi && (activeForUi.primaryReason || activeForUi.category))
        ? String(activeForUi.primaryReason || activeForUi.category)
        : '';
      const lowerAr = ar.toLowerCase();

      const bsodPrimary = (bsod && typeof bsod.primaryReason === 'string') ? bsod.primaryReason : '';
      const lowerPrimary = String(bsodPrimary || '').toLowerCase();

      const matches = (re) => re.test(lowerAr) || re.test(lowerPrimary);

      if (matches(/overheat|thermal|temperature/)) {
        pushUnique('Overheating quick fix: stop charging and close heavy apps, then let the phone cool down before re-testing.');
        pushUnique('Avoid stressing the phone (gaming/video/camera) while it is charging during troubleshooting.');
      }

      if (matches(/insufficient storage|storage|\/data/)) {
        pushUnique('Low storage quick fix: uninstall unused apps and delete/move large photos/videos to cloud or SD card.');
        pushUnique('Clear app cache for the worst offenders (Settings → Apps → Storage → Clear cache), then reboot once.');
      }

      if (matches(/battery|power delivery|brownout|power ic/)) {
        pushUnique('Battery/power quick fix: use a known-good charger and data-capable cable; try another USB port (no hub).');
        pushUnique('If battery is extremely low, leave it charging for 15–30 minutes before re-testing.');
      }
    } catch {
      // best-effort only
    }

    // Prefer automatic verdict guidance when available.
    if (autoTest && typeof autoTest === 'object') {
      const v = (autoTest && typeof autoTest.verdict === 'string') ? String(autoTest.verdict).trim().toUpperCase() : '';
      const conf = (autoTest && typeof autoTest.confidence === 'string') ? String(autoTest.confidence).trim() : '';
      if (v) pushUnique(`Auto-test verdict: ${v}${conf ? ` (${conf})` : ''}.`);
      const nx = (autoTest && Array.isArray(autoTest.nextActions)) ? autoTest.nextActions : [];
      for (const item of nx) pushUnique(item);
    }

    // User confirmation fallback when the host cannot run MTP probing.
    try {
      const mtpProbeEvidence = (hostUsb && hostUsb.mtpProbeEvidence && typeof hostUsb.mtpProbeEvidence === 'object') ? hostUsb.mtpProbeEvidence : null;
      const hostUnsupported = !!(mtpProbeEvidence && mtpProbeEvidence.hostUnsupported);
      if (hostUnsupported) {
        pushUnique('Host MTP probe is unavailable on this PC (COM/WPD error), so automatic freeze detection is limited.');
        pushUnique('If NO, treat this result as inconclusive and test on another PC (or reinstall Windows Portable Devices drivers).');
      }
    } catch {
      // ignore
    }
    if (cameraLooksNotBsod) {
      pushUnique('Camera indicates the screen looks normal (not BSOD). Reconfirm the symptom and run standard diagnostics.');
    }

    if (hasAdb && adbState === 'unauthorized') {
      pushUnique('ADB is detected but unauthorized: if the screen works, unlock the phone and accept the “Allow USB debugging” prompt (then run Diagnose again).');
      pushUnique('If the screen is unusable, try a USB-OTG mouse/keyboard or supported external display mode (no bypass).');
    }
    if (hasAdb && adbState === 'offline') {
      pushUnique('ADB shows offline: replug the cable/port, then run Diagnose again (USB instability or driver stack issue).');
    }
    if (!hasAdb && !hasFastboot && !hasMtp && transport.length === 0) {
      pushUnique('Try a known-good data cable and a direct USB port (avoid hubs).');
      pushUnique('Check Windows drivers (Device Manager) and re-plug the phone.');
    }

    if (anyChange) {
      pushUnique('USB is unstable: try a different cable/port first before concluding a phone fault.');
    }

    if (looksEdl || looksMtk || looksDownload) {
      pushUnique(looksDownload
        ? 'Device appears in Samsung Download/Odin mode. ADB/fastboot usually will not work.'
        : 'Device appears in a low-level mode (EDL/Preloader). ADB/fastboot usually will not work.');
      pushUnique('Use authorized OEM service recovery workflows (firmware repair).');
    } else if (hasFastboot && !hasAdb) {
      pushUnique('Device is in bootloader/fastboot mode: Android is not booting normally.');
      pushUnique('Try recovery mode and check for mount/update errors.');
      pushUnique('Consider firmware repair (authorized tools) after confirming customer consent/data risk.');
    } else if (hasMtp && !hasAdb) {
      pushUnique('Phone is alive enough for MTP but not debuggable. USB debugging may be OFF or not trusted.');
      pushUnique('If the screen is blank/blue, test with a known-good display assembly or reseat the display flex.');
    } else if (hasAdb) {
      pushUnique('ADB is visible: the OS is running. A blank/blue screen often points to display/backlight/connector path.');
      pushUnique('If available, run device tests (vibrate/flash/speaker) to confirm the board is alive even if the screen is faulty.');
    }

    if (steps.length === 0) {
      pushUnique('Review the Top reasons and confirm using physical checks (cable/port, display assembly, recovery/boot modes).');
    }
      renderNextSteps(steps);

      const detectedAdbId = (() => {
        const first = Array.isArray(adbDevices) ? adbDevices.find(d => d && d.id) : null;
        return first && first.id ? String(first.id).trim() : '';
      })();
      const selectedDeviceId = (() => {
        try {
          const sel = document.getElementById('device-select');
          const value = sel && sel.value ? String(sel.value).trim() : '';
          return value && value !== 'all' ? value : '';
        } catch {
          return '';
        }
      })();
      const historyKey = detectedAdbId || selectedDeviceId || DEFAULT_BSOD_HISTORY_KEY;

      const selectedDeviceLabel = (() => {
        try {
          const sel = document.getElementById('device-select');
          if (!sel || !sel.options || sel.selectedIndex < 0) return '';
          const text = sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text
            ? String(sel.options[sel.selectedIndex].text).trim()
            : '';
          if (!text || /^all devices$/i.test(text)) return '';
          return text;
        } catch {
          return '';
        }
      })();

      const confidenceRaw = (
        activeForUi && activeForUi.confidence
          ? String(activeForUi.confidence)
          : (bsodConfidence ? String(bsodConfidence) : 'low')
      ).toLowerCase();
      const confidence = confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
        ? confidenceRaw
        : 'low';
      const hasIssue = confidence === 'high' || confidence === 'medium';
      const reasonLabel = (() => {
        if (activeForUi && activeForUi.primaryReason) return String(activeForUi.primaryReason);
        if (activeForUi && activeForUi.category) return String(activeForUi.category);
        if (bsodCategory) return String(bsodCategory);
        return 'USB-only BSOD signal analysis';
      })();

      const adbDisplayName = (() => {
        const first = Array.isArray(adbDevices) ? adbDevices.find(d => d && (d.model || d.id)) : null;
        if (!first) return '';
        const model = first.model ? String(first.model).trim() : '';
        const id = first.id ? String(first.id).trim() : '';
        if (model && id) return `${model} (${id})`;
        return model || id;
      })();

      const portableDisplayName = (() => {
        const first = Array.isArray(portableCandidates) ? portableCandidates.find(d => d && d.name) : null;
        return first && first.name ? String(first.name).trim() : '';
      })();

      const fastbootDisplayName = (() => {
        const first = Array.isArray(fbDevices) ? fbDevices.find(d => d && d.id) : null;
        return first && first.id ? `Fastboot ${String(first.id).trim()}` : '';
      })();

      const detectedPhoneName = selectedDeviceLabel || adbDisplayName || portableDisplayName || fastbootDisplayName;
      const phoneConnected = !!(phoneVisible || phoneLikely || usbPresent || hasAdb || hasFastboot || hasMtp);
      const phoneDetectedLabel = detectedPhoneName
        ? detectedPhoneName
        : (phoneConnected ? 'Phone connected' : 'No phone detected');

      const bsodStatusText = (signalDiagForAi && typeof signalDiagForAi.bsodStatusText === 'string')
        ? String(signalDiagForAi.bsodStatusText).trim()
        : '';
      const bsod5Key = (signalDiagForAi && typeof signalDiagForAi.bsod5Key === 'string')
        ? String(signalDiagForAi.bsod5Key).trim().toLowerCase()
        : '';
      let wasBsod = null;
      if (bsod5Key === 'not_bsod') {
        wasBsod = false;
      } else if (bsod5Key && bsod5Key !== 'inconclusive') {
        wasBsod = true;
      } else if (/not bsod|no deep boot failure|no symptoms of bsod/i.test(bsodStatusText)) {
        wasBsod = false;
      } else if (/bsod|ui freeze/i.test(bsodStatusText) && !/inconclusive|unknown/i.test(bsodStatusText)) {
        wasBsod = true;
      }
      const bsodVerdict = wasBsod === true ? 'Yes' : (wasBsod === false ? 'No' : 'Unknown');

      const counts = {
        high: confidence === 'high' ? 1 : 0,
        medium: confidence === 'medium' ? 1 : 0,
        low: confidence === 'low' ? 1 : 0,
      };
      const summaryLine = String(summaryTextEl.textContent || '').trim();
      const onlineAiUsageLine = (() => {
        if (!lastOnlineAiAudit || !lastOnlineAiAudit.required) return '';
        if (lastOnlineAiAudit.used) return 'AI used: Online';
        const msg = String(lastOnlineAiAudit.error || 'unavailable').replace(/\s+/g, ' ').trim();
        return `AI used: No (${msg})`;
      })();
      const recordTs = Date.now();

      const bsodHistoryRecord = {
        deviceLabel: selectedDeviceLabel || 'BSOD USB-only run',
        timestamp: recordTs,
        historyType: 'bsod_usb_only',
        counts,
        diagStages: {
          usbOnlyBsod: {
            ok: !hasIssue,
            status: hasIssue ? 'issue' : 'ok',
            label: reasonLabel,
            details: outcomeLine || summaryLine,
          },
        },
        diagDetails: {
          usbOnlyBsod: {
            confidence,
            phoneDetectedLabel,
            phoneName: detectedPhoneName || '',
            phoneConnected,
            bsodVerdict,
            bsodStatusText,
            bsod5Key: bsod5Key || '',
            wasBsod,
            primaryReason: reasonLabel,
            firstReason: firstReason || '',
            deviceLine,
            connectionLine,
            outcomeLine,
            onlineAiRequired: !!(lastOnlineAiAudit && lastOnlineAiAudit.required),
            onlineAiUsed: !!(lastOnlineAiAudit && lastOnlineAiAudit.used),
            onlineAiSummary: (lastOnlineAiAudit && lastOnlineAiAudit.text) ? String(lastOnlineAiAudit.text) : '',
            onlineAiError: (lastOnlineAiAudit && lastOnlineAiAudit.error) ? String(lastOnlineAiAudit.error) : '',
            steps,
            signalSnapshot: lastSignalSnapshotForAi || null,
          },
        },
        textReport: [
          'BSOD USB-only diagnostic',
          `Summary: ${summaryLine || 'No summary available.'}`,
          `Phone detected: ${phoneDetectedLabel}`,
          `BSOD detected: ${bsodVerdict}${bsodStatusText ? ` (${bsodStatusText})` : ''}`,
          `Primary reason: ${reasonLabel}`,
          firstReason ? `Reason detail: ${firstReason}` : '',
          `Confidence: ${confidence}`,
          onlineAiUsageLine,
          steps.length ? `Recommended actions: ${steps.join(' | ')}` : '',
        ].filter(Boolean).join('\n'),
      };

      try {
        setBsodSaveStatus('running', 'Auto-save status: Saving to Supabase history…');

        const token = readLocalAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const saveRes = await fetch(
          `http://localhost:3333/history/${encodeURIComponent(historyKey)}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(bsodHistoryRecord),
          },
        );

        const saveBody = await saveRes.json().catch(() => null);
        if (!saveRes.ok) {
          const reason = (saveBody && (saveBody.error || saveBody.message))
            ? String(saveBody.error || saveBody.message)
            : `HTTP ${saveRes.status}`;
          throw new Error(reason);
        }

        rememberBsodHistoryKey(historyKey);
        setBsodSaveStatus('ok', `Auto-save status: Saved to Supabase history (${historyKey}).`);

        if (typeof renderHistoryList === 'function') {
          Promise.resolve(renderHistoryList(historyKey)).catch(() => {});
        }

        if (typeof window.renderHistoryBrowserModal === 'function') {
          Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
        }
      } catch (saveErr) {
        const msg = (saveErr && saveErr.message) ? String(saveErr.message) : 'unknown error';
        setBsodSaveStatus('error', `Auto-save failed: ${msg}`);
      }
    } catch (e) {
      failAll(
        'BSOD diagnose failed unexpectedly.',
        (e && e.message) ? String(e.message) : 'Unexpected error while rendering results.',
        [
          'Retry the BSOD diagnose.',
          'If this keeps happening, check the DevTools console for a JS error.',
        ],
      );
    } finally {
      finish();
    }
  }
  modal.classList.remove('hidden');
  if (cameraRunBtn) {
    cameraRunBtn.onclick = async () => {
      const cam = await runCameraCheck();
      if (!cam || !lastEnrichedForAi) return;

      lastCameraResForUi = cam;

      // Update the two-line badges immediately using the latest signals + webcam result.
      try {
        const snap = lastSignalSnapshotForAi && typeof lastSignalSnapshotForAi === 'object' ? lastSignalSnapshotForAi : null;
        const phoneVisible = !!(snap && snap.phoneVisible);
        const usbPresent = !!(snap && snap.usbPresent);
        const phoneLikely = !!(snap && snap.phoneLikely);
        const snapHostUnsupported = !!(snap && snap.hostUnsupported);
        updateTwoLineBadges({ phoneVisible, usbPresent, phoneLikely, cameraRes: cam, techUiFrozen: !!(techConfirm && techConfirm.uiFrozen), hostUnsupported: snapHostUnsupported });
      } catch {
        updateTwoLineBadges({ phoneVisible: false, usbPresent: false, phoneLikely: false, cameraRes: cam, techUiFrozen: !!(techConfirm && techConfirm.uiFrozen), hostUnsupported: false });
      }

      // Refresh Offline AI panel using the new camera payload only.
      try {
        const aiRes = await fetch('http://127.0.0.1:3333/ai-no-debug-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection: buildConnectionWithTechConfirm(lastEnrichedForAi),
            visual: cam.visualPayload || null,
            lang: (() => {
              try {
                return window.SmartHubI18n && typeof window.SmartHubI18n.getCurrentLang === 'function'
                  ? window.SmartHubI18n.getCurrentLang()
                  : 'en';
              } catch {
                return 'en';
              }
            })(),
          }),
        });

        if (!aiRes.ok) {
          renderAiConclusion('error', { error: `AI helper HTTP ${aiRes.status}` });
          return;
        }

        const ai = await aiRes.json();
        if (!ai || !ai.ok) {
          renderAiConclusion('error', { error: (ai && ai.error) ? ai.error : 'AI helper returned an error.' });
          return;
        }

        lastAiSuggestForUi = ai;

        const snap = lastSignalSnapshotForAi && typeof lastSignalSnapshotForAi === 'object'
          ? Object.assign({}, lastSignalSnapshotForAi)
          : { hasAnyUsbSignal: !!lastDeviceDetectedForAi, usbPresent: !!lastDeviceDetectedForAi, phoneVisible: !!lastDeviceDetectedForAi };
        snap.cameraLooksNotBsod = !!(cam && cam.looksNotBsod);
        snap.cameraDialogHint = !!(cam && cam.dialogHint);
        snap.cameraSuggestsBsodStyle = !!(cam && cam.suggestsBsodStyle);
        snap.cameraIsDark = !!(cam && cam.visualCategory && String(cam.visualCategory).toLowerCase() === 'dark');
        snap.cameraDarkStable = !!(cam && cam.darkStable);
        const signalDiag = inferSignalDiagnosis(snap);
        const aiView = Object.assign({}, ai, { __signalFallback: signalDiag, __cameraLooksNotBsod: !!(cam && cam.looksNotBsod) });
        renderAiConclusion('ok', aiView);
      } catch {
        renderAiConclusion('error', { error: 'AI helper unavailable on this PC.' });
      }
    };
  }

  await runChecks();
}

function bindBlueTestButton(btn, detailEl, endpoint, runningLabel, successFallback) {
  if (!btn || !detailEl) return;
  btn.onclick = async () => {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = runningLabel;
    detailEl.textContent = 'Running test via ADB…';
    try {
      // Prefer an explicit selected device when available.
      const sel = document.getElementById('device-select');
      const selected = sel && sel.value && sel.value !== 'all' ? sel.value : '';
      const url = selected
        ? `http://localhost:3333/${endpoint}?id=${encodeURIComponent(selected)}`
        : `http://localhost:3333/${endpoint}`;

      const res = await fetch(url, {
        method: 'POST',
      });
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        // ignore JSON parse error; handled below
      }
      if (!res.ok || !payload || payload.ok === false) {
        const msg =
          payload && payload.error
            ? `Test failed: ${payload.error}`
            : `Test failed (HTTP ${res.status})`;
        detailEl.textContent = msg;
      } else {
        detailEl.textContent = payload.message || successFallback;
      }
    } catch {
      detailEl.textContent = 'Test failed: could not reach the companion service.';
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };
}

async function openTestDeviceModal() {
  const modal = document.getElementById('test-device-modal');
  const summaryEl = document.getElementById('test-device-summary');
  const flashBtn = document.getElementById('quick-test-flash-btn');
  const flashDetail = document.getElementById('quick-test-flash-detail');
  const vibrateBtn = document.getElementById('quick-test-vibrate-btn');
  const vibrateDetail = document.getElementById('quick-test-vibrate-detail');
  const soundBtn = document.getElementById('quick-test-sound-btn');
  const soundDetail = document.getElementById('quick-test-sound-detail');
  const volumeBtn = document.getElementById('quick-test-volume-btn');
  const volumeDetail = document.getElementById('quick-test-volume-detail');
  const wakeBtn = document.getElementById('quick-test-wake-btn');
  const wakeDetail = document.getElementById('quick-test-wake-detail');
  const screenBtn = document.getElementById('quick-test-screen-btn');
  const screenDetail = document.getElementById('quick-test-screen-detail');
  const touchBtn = document.getElementById('quick-test-touch-btn');
  const touchDetail = document.getElementById('quick-test-touch-detail');
  const sensorsBtn = document.getElementById('quick-test-sensors-btn');
  const sensorsDetail = document.getElementById('quick-test-sensors-detail');
  const healthBtn = document.getElementById('quick-test-health-btn');
  const healthDetail = document.getElementById('quick-test-health-detail');

  if (!modal || !summaryEl) return;

  summaryEl.textContent =
    'These tests require the phone to be visible to ADB (USB debugging ON and trusted). Use them to confirm that the board responds even when the screen may be faulty.';

  if (flashDetail) {
    flashDetail.textContent =
      'Requires phone visible to ADB. Briefly turns on flash to check if the board is alive.';
  }
  if (vibrateDetail) {
    vibrateDetail.textContent =
      'Requires phone visible to ADB. Triggers a short vibration to confirm power and OS response.';
  }
  if (soundDetail) {
    soundDetail.textContent =
      'Requires phone visible to ADB. Automatically raises media volume and then plays a short tone through the speaker to confirm audio output.';
  }
  if (volumeDetail) {
    volumeDetail.textContent =
      'Requires phone visible to ADB. Automatically raises media volume to maximum so the speaker test can be heard.';
  }
  if (wakeDetail) {
    wakeDetail.textContent =
      'Requires phone visible to ADB. Sends a power-key press to see if the display/backlight reacts.';
  }

  modal.classList.remove('hidden');

  bindBlueTestButton(
    flashBtn,
    flashDetail,
    'blue-test/flash',
    'Testing flashlight…',
    'Flashlight test sent. Ask if light was visible.',
  );
  bindBlueTestButton(
    vibrateBtn,
    vibrateDetail,
    'blue-test/vibrate',
    'Testing vibration…',
    'Vibration test sent. Ask if it was felt.',
  );
  bindBlueTestButton(
    soundBtn,
    soundDetail,
    'blue-test/sound',
    'Testing speaker…',
    'Sound test sent. Ask if a tone was heard.',
  );
  bindBlueTestButton(
    volumeBtn,
    volumeDetail,
    'blue-test/volume-max',
    'Maximizing volume…',
    'Media volume set to maximum.',
  );
  bindBlueTestButton(
    wakeBtn,
    wakeDetail,
    'blue-test/wake',
    'Toggling screen…',
    'Power-key test sent. Check if screen/backlight reacted.',
  );

  if (screenBtn && screenDetail) {
    screenBtn.onclick = () => {
      screenDetail.textContent =
        'On the phone, open any full-screen colour test (service menu, gallery images or a solid-colour test video) and cycle Red, Green, Blue, Black, White. Look for dead pixels, lines, colour blotches or uneven backlight.';
    };
  }

  if (touchBtn && touchDetail) {
    bindBlueTestButton(
      touchBtn,
      touchDetail,
      'blue-test/touch',
      'Starting touch-screen test…',
      'Touch-screen test sent. Ask the user to drag and tap across the entire display and report any dead spots.',
    );
  }

  bindBlueTestButton(
    sensorsBtn,
    sensorsDetail,
    'test/sensors',
    'Checking sensors…',
    'Sensor snapshot collected. Move/cover the phone to confirm they react.',
  );

  bindBlueTestButton(
    healthBtn,
    healthDetail,
    'test/health',
    'Reading battery & memory…',
    'Battery & memory snapshot collected from the device.',
  );
}

async function runGlobalSecurityScan() {
  const devices = Array.from(document.querySelectorAll('.device'));
  if (!devices.length) {
    return;
  }

  const sel = document.getElementById('device-select');
  const selected = sel && sel.value && sel.value !== 'all' ? sel.value : '';
  const deviceEl = selected
    ? devices.find(d => d && d.dataset && d.dataset.id === selected) || devices[0]
    : devices[0];

  const deviceId = deviceEl && deviceEl.dataset ? deviceEl.dataset.id : null;
  if (!deviceId) return;

  const label = typeof getDeviceLabelFromEl === 'function' ? getDeviceLabelFromEl(deviceEl) : deviceId;

  // Switch the selected device tabs to the Software Check view
  const softwareTab = deviceEl.querySelector('.device-tab[data-tab="software"]');
  if (softwareTab) {
    softwareTab.click();
  }

  const softwareSummaryEl = document.getElementById(`software-summary-${deviceId}`);
  const softwareLogEl = document.getElementById(`software-log-${deviceId}`);

  const modal = document.getElementById('security-modal');
  const titleEl = document.getElementById('security-modal-title');
  const subtitleEl = document.getElementById('security-modal-subtitle');
  const summaryEl = document.getElementById('security-summary');
  const reportEl = document.getElementById('security-report');
  if (!modal || !summaryEl || !reportEl) return;

  if (titleEl) titleEl.textContent = 'Security Scan Result';
  if (subtitleEl) subtitleEl.textContent = `Live security scan · ${new Date().toLocaleString()}`;
  summaryEl.textContent = 'Scanning installed apps and permissions for threats…';
  reportEl.textContent = '';
  modal.classList.remove('hidden');

  if (softwareSummaryEl) {
    softwareSummaryEl.textContent = 'Scanning for threats in apps, files and OS configuration…';
  }
  if (softwareLogEl) {
    softwareLogEl.textContent =
      'Starting software check…\n' +
      '- Enumerating installed apps and packages\n' +
      '- Inspecting requested permissions for risky behaviour\n' +
      '- Looking for signs of OS or storage problems (crash logs, low space)\n';
  }

  try {
    const res = await fetch(`http://localhost:3333/apps/${encodeURIComponent(deviceId)}`);
    if (!res.ok) {
      summaryEl.textContent = `Could not run security scan (HTTP ${res.status}).`;
      return;
    }
    const data = await res.json();
    const apps = Array.isArray(data.apps) ? data.apps : [];

    // Prefer the suspicious-apps view (high/medium/low) for user-facing
    // summaries instead of the raw permission buckets.
    let suspiciousAppsForSummary = [];
    try {
      if (typeof window !== 'undefined' && window.suspiciousAppsByDevice) {
        const fromGlobal = window.suspiciousAppsByDevice[deviceId];
        if (Array.isArray(fromGlobal) && fromGlobal.length) {
          suspiciousAppsForSummary = fromGlobal;
        }
      }
    } catch (e) {
      // ignore – best-effort only
    }
    if ((!suspiciousAppsForSummary || !suspiciousAppsForSummary.length) &&
        Array.isArray(data.suspiciousApps) && data.suspiciousApps.length) {
      suspiciousAppsForSummary = data.suspiciousApps;
    }

    const suspiciousHigh = (suspiciousAppsForSummary || []).filter(a => a.threatLevel === 'high').length;
    const suspiciousMedium = (suspiciousAppsForSummary || []).filter(a => a.threatLevel === 'medium').length;
    const suspiciousLow = (suspiciousAppsForSummary || []).filter(a => a.threatLevel === 'low').length;
    const suspiciousTotal = suspiciousHigh + suspiciousMedium + suspiciousLow;

    const summary = `Apps scanned: ${apps.length}. ${suspiciousTotal} suspicious app(s): ${suspiciousHigh} high, ${suspiciousMedium} medium, ${suspiciousLow} low risk.`;

    // Only list suspicious apps in the detailed report so the user
    // does not have to scroll through hundreds of safe entries.
    const suspiciousList = (suspiciousAppsForSummary || []).slice();
    suspiciousList.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.threatLevel] || 3) - (order[b.threatLevel] || 3);
    });

    const lines = [];
    let index = 1;
    for (const app of suspiciousList) {
      const threatLabel = app.threatLevel === 'high' ? 'HIGH' : app.threatLevel === 'medium' ? 'MEDIUM' : 'LOW';
      const name = app.displayName || app.packageName || '(unknown app)';
      const scoreText = typeof app.score === 'number' ? ` ${app.score}/100` : '';
      lines.push(index + '. ' + name + ' - ' + threatLabel + scoreText);
      index += 1;
    }

    const textReport = lines.length ? summary + '\n\n' + lines.join('\n') : summary;

    summaryEl.textContent = summary;
    reportEl.textContent = textReport;

    if (softwareSummaryEl) {
      softwareSummaryEl.textContent = summary;
    }
    if (softwareLogEl) {
      softwareLogEl.textContent =
        'Software check completed.\n\n' +
        'Summary (suspicious apps only):\n' +
        `- Apps scanned: ${apps.length}\n` +
        `- Suspicious apps: ${suspiciousTotal} (High: ${suspiciousHigh}, Medium: ${suspiciousMedium}, Low: ${suspiciousLow})\n\n` +
        (lines.length ? 'Per-app detail (suspicious only):\n' + lines.join('\n') : 'No suspicious apps were detected on this device.');
    }

    const saveBtn = document.getElementById('security-save-btn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.onclick = async () => {
        try {
          let localToken = '';
          try {
            localToken = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
          } catch {
            localToken = '';
          }

          const saveHeaders = { 'Content-Type': 'application/json' };
          if (localToken) {
            saveHeaders.Authorization = `Bearer ${localToken}`;
          }

            const record = {
              deviceLabel: label,
              timestamp: Date.now(),
              historyType: 'adb_security',
              counts: {
                high: suspiciousHigh,
                medium: suspiciousMedium,
                low: suspiciousLow,
              },
              textReport,
            };
          const resSave = await fetch(
            `http://localhost:3333/history/${encodeURIComponent(deviceId)}`,
            {
              method: 'POST',
              headers: saveHeaders,
              body: JSON.stringify(record),
            },
          );
          if (!resSave.ok) throw new Error(`HTTP ${resSave.status}`);
          await resSave.json();
          if (typeof renderHistoryList === 'function') {
            renderHistoryList(deviceId);
          }
          if (typeof window !== 'undefined' && typeof window.renderHistoryBrowserModal === 'function') {
            Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
          }
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saved';
        } catch (e) {
          console.error('Failed to save security history', e);
        }
      };
    }
  } catch (err) {
    summaryEl.textContent = 'Security scan failed. Please verify that the companion service is running.';
    if (softwareSummaryEl) {
      softwareSummaryEl.textContent = 'Software check failed. Please verify that the companion service is running.';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.SmartHubAuth && typeof window.SmartHubAuth.onReady === 'function') {
      await window.SmartHubAuth.onReady();
    }
  } catch {
    // ignore auth readiness errors and continue best-effort
  }

  let readOnlyEnabled = false;
  let readOnlyForced = false;

  // Theme selector (Light / Dark)
  try {
    const themeSelect = document.getElementById('theme-select');
    const root = document.documentElement;
    const storageKey = 'smarthub.theme';
    const allowed = new Set(['light', 'dark']);

    const applyTheme = (value) => {
      const v = allowed.has(String(value || '')) ? String(value) : 'light';
      if (root) root.setAttribute('data-theme', v);
      try {
        localStorage.setItem(storageKey, v);
      } catch {
        // ignore
      }
      return v;
    };

    let initial = 'light';
    try {
      const stored = localStorage.getItem(storageKey);
      if (allowed.has(String(stored || ''))) initial = String(stored);
    } catch {
      // ignore
    }

    const applied = applyTheme(initial);
    if (themeSelect) {
      themeSelect.value = applied;
      themeSelect.addEventListener('change', () => {
        applyTheme(themeSelect.value);
      });
    }
  } catch {
    // ignore
  }

  // Language selector (English / Tagalog)
  try {
    const i18n = i18nApi();
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = i18n.getCurrentLang();
      langSelect.addEventListener('change', () => {
        i18n.setCurrentLang(langSelect.value);
        applyReadOnlyUiState();

        // Re-render device banners/cards so dynamic strings update.
        try {
          if (typeof window.refreshDevices === 'function') {
            window.refreshDevices();
          } else {
            const refreshBtn = document.getElementById('refresh');
            if (refreshBtn && typeof refreshBtn.click === 'function') refreshBtn.click();
          }
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }

  // Apply initial translations as early as possible.
  try {
    i18nApi().applyTranslations();
  } catch {
    // ignore
  }

  const showMessageModal = ({ title, subtitle, message } = {}) => {
    const i18n = i18nApi();
    const modal = document.getElementById('message-modal');
    const titleEl = document.getElementById('message-modal-title');
    const subtitleEl = document.getElementById('message-modal-subtitle');
    const bodyEl = document.getElementById('message-modal-body');

    const safeTitle = title != null && String(title).trim() ? String(title).trim() : i18n.t('modal.messageTitle');
    const safeSubtitle = subtitle != null && String(subtitle).trim() ? String(subtitle).trim() : '';
    const safeMessage = message != null ? String(message) : '';

    if (titleEl) titleEl.textContent = safeTitle;
    if (subtitleEl) {
      subtitleEl.textContent = safeSubtitle;
      subtitleEl.classList.toggle('hidden', !safeSubtitle);
    }
    if (bodyEl) {
      bodyEl.classList.remove('bsod-history-view');
      bodyEl.textContent = safeMessage;
    }
    if (modal) {
      modal.classList.remove('bsod-history-modal');
    }

    if (modal) {
      modal.classList.remove('hidden');
      return;
    }

    // Extremely defensive fallback (should not happen in the packaged app).
    try {
      alert(`${safeTitle}\n\n${safeMessage}`);
    } catch {
      // ignore
    }
  };

  async function refreshOnlineAiStatusHint() {
    const hintEl = document.getElementById('online-ai-status');
    if (!hintEl) return;

    const setHint = (state, text) => {
      hintEl.className = `online-ai-status online-ai-status-${state}`;
      hintEl.textContent = `Online Assist: ${text}`;
      try {
        window.__smartHubOnlineAiStatus = {
          state,
          text,
          online: state === 'on',
          updatedAt: Date.now(),
        };
      } catch {
        // ignore
      }
    };

    setHint('checking', 'Checking...');
    try {
      const res = await fetch('http://localhost:3333/online-ai/status', { cache: 'no-store' });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.ok !== true) {
        setHint('unknown', 'Unknown');
        return;
      }

      const enabled = !!data.enabled;
      const configured = !!data.configured;
      const source = data.source ? String(data.source) : '';
      const model = data.model ? String(data.model) : '';

      if (!enabled) {
        setHint('disabled', 'Disabled');
        return;
      }

      if (!configured) {
        setHint('off', 'OFF (no API key)');
        return;
      }

      const parts = ['ON'];
      if (source) parts.push(`(key: ${source})`);
      if (model) parts.push(`model: ${model}`);
      setHint('on', parts.join(' '));
    } catch {
      setHint('offline', 'Offline');
    }
  }

  const readOnlyToggleBtn = document.getElementById('read-only-toggle');

  function applyReadOnlyUiState() {
    const i18n = i18nApi();
    const label = `${i18n.t('label.readOnly')}: ${readOnlyEnabled ? i18n.t('state.on') : i18n.t('state.off')}`;
    if (readOnlyToggleBtn) {
      readOnlyToggleBtn.textContent = label;
      readOnlyToggleBtn.disabled = !!readOnlyForced;
      readOnlyToggleBtn.title = readOnlyForced
        ? i18n.t('btn.readOnly.title.forced')
        : i18n.t('btn.readOnly.title.normal');
    }

    const idsToDisable = [
      'install-app-btn',
      'action-test',
      'smartlink-install-btn',
      'quick-test-flash-btn',
      'quick-test-vibrate-btn',
      'quick-test-sound-btn',
      'quick-test-volume-btn',
      'quick-test-wake-btn',
      'quick-test-screen-btn',
      'quick-test-touch-btn',
      'quick-test-sensors-btn',
      'quick-test-health-btn',
    ];

    idsToDisable.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if ('disabled' in el) {
        try {
          el.disabled = !!readOnlyEnabled;
          if (readOnlyEnabled) {
            el.title = 'Disabled because Read-only mode is enabled.';
          }
        } catch {
          // ignore
        }
      }
    });

    const testSummary = document.getElementById('test-device-summary');
    if (testSummary && readOnlyEnabled) {
      const base =
        'Use these tests when the phone is visible to ADB to confirm flashlight, vibration, speaker output and screen reaction.';
      testSummary.textContent = `${base} Read-only mode is enabled, so these actions are disabled.`;
    } else if (testSummary && !readOnlyEnabled) {
      testSummary.textContent =
        'Use these tests when the phone is visible to ADB to confirm flashlight, vibration, speaker output and screen reaction.';
    }
  }

  function getStoredReadOnlyPreference() {
    try {
      return window.localStorage.getItem('smarthub_read_only') === '1';
    } catch {
      return false;
    }
  }

  function storeReadOnlyPreference(enabled) {
    try {
      window.localStorage.setItem('smarthub_read_only', enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }

  async function fetchReadOnlyFromServer() {
    try {
      const res = await fetch('http://localhost:3333/read-only');
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data.enabled !== 'boolean') return;
      readOnlyEnabled = data.enabled;
      readOnlyForced = !!data.forced;
      storeReadOnlyPreference(readOnlyEnabled);
      applyReadOnlyUiState();
    } catch {
      // ignore
    }
  }

  async function setReadOnlyOnServer(enabled) {
    const res = await fetch('http://localhost:3333/read-only', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !!enabled }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (data && typeof data.enabled === 'boolean') {
      readOnlyEnabled = data.enabled;
      readOnlyForced = !!data.forced;
      storeReadOnlyPreference(readOnlyEnabled);
      applyReadOnlyUiState();
    }
  }

  // Apply a fast local preference immediately, then sync from backend.
  readOnlyEnabled = getStoredReadOnlyPreference();
  applyReadOnlyUiState();
  fetchReadOnlyFromServer();

  // Online Assist is optional; show its status so users can confirm the API key
  // is loaded (without revealing it).
  refreshOnlineAiStatusHint();

  if (readOnlyToggleBtn) {
    readOnlyToggleBtn.addEventListener('click', async () => {
      if (readOnlyForced) return;
      const btn = readOnlyToggleBtn;
      btn.disabled = true;
      try {
        await setReadOnlyOnServer(!readOnlyEnabled);
      } catch (e) {
        console.error('Failed to toggle read-only mode:', e);
        showMessageModal({
          title: 'Could not change Read-only mode',
          message: `Reason: ${e && e.message ? e.message : e}`,
        });
      } finally {
        btn.disabled = !!readOnlyForced;
      }
    });
  }

  const refreshBtn = document.getElementById('refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refresh);
  }

  const installAppBtn = document.getElementById('install-app-btn');
  if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      if (readOnlyEnabled) {
        showMessageModal({
          title: 'Read-only mode',
          message: 'Read-only mode is enabled. Installing apps is disabled.',
        });
        return;
      }
      const btn = installAppBtn;
      const originalText = btn.textContent;
      let installSucceeded = false;
      btn.disabled = true;
      btn.textContent = 'Installing app…';
      try {
        const res = await fetch('http://localhost:3333/install-app', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (res.ok && data && data.ok) {
          installSucceeded = true;
          const launchOk = !!data.launchOk;
          if (launchOk) {
            btn.textContent = 'App installed – launched on phone';
          } else {
            btn.textContent = 'App installed – open on phone';
          }

          // Give the technician a clear hint about what to expect using a modal.
          const modal = document.getElementById('install-result-modal');
          const summaryEl = document.getElementById('install-result-summary');
          const detailEl = document.getElementById('install-result-detail');
          const extra = data.launchMessage && typeof data.launchMessage === 'string' ? data.launchMessage : '';
          const autoMsg = launchOk
            ? 'The diagnostics app should now appear on the phone.'
            : 'If it does not open automatically, tap "SmartHub Mobile Diagnostics" on the phone.';

          if (modal && summaryEl) {
            summaryEl.textContent = `Mobile app installed successfully. ${autoMsg}`;
            if (detailEl) {
              if (extra && extra.trim()) {
                detailEl.textContent = extra.trim();
                detailEl.classList.remove('hidden');
              } else {
                detailEl.textContent = '';
                detailEl.classList.add('hidden');
              }
            }
            modal.classList.remove('hidden');
          } else {
            // Fallback if modal markup is missing for some reason.
            const extraSuffix = extra && extra.trim() ? `\n\n${extra.trim()}` : '';
            showMessageModal({
              title: 'Mobile app installed',
              message: `${autoMsg}${extraSuffix}`,
            });
          }
        } else {
          const msg = (data && data.error) || `Install failed (HTTP ${res.status})`;
          console.error('Install mobile app failed:', msg);
          btn.textContent = 'Install failed';
          showMessageModal({
            title: 'Install mobile app failed',
            message: msg,
          });
        }
      } catch (err) {
        console.error('Install mobile app error:', err);
        btn.textContent = 'Install failed';
      } finally {
        if (installSucceeded) {
          // Keep the success label so it does not look like an endless loop.
          btn.disabled = true;
        } else {
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
          }, 3000);
        }
      }
    });
  }

  const startBtn = document.getElementById('action-start');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const deviceEls = Array.from(document.querySelectorAll('.device'));
      if (!deviceEls.length) return;

      const sel = document.getElementById('device-select');
      const selected = sel && sel.value ? sel.value : 'all';
      const targets =
        selected && selected !== 'all'
          ? deviceEls.filter(d => d && d.dataset && d.dataset.id === selected)
          : deviceEls;

      if (!targets.length) return;

      const runnableDevices = [];
      const requiredModal = document.getElementById('mobile-app-required-modal');
      if (requiredModal) {
        requiredModal.classList.add('hidden');
      }

      for (const deviceEl of targets) {
        const id = deviceEl.dataset.id;
        if (!id) continue;

        let stateKnown = false;
        let appInstalled = false;
        let appRunning = false;

        try {
          const stateRes = await fetch(
            `http://localhost:3333/mobile-app-state/${encodeURIComponent(id)}`,
          );
          if (stateRes.ok) {
            const s = await stateRes.json();
            stateKnown = true;
            appInstalled = !!(s && s.installed);
            appRunning = !!(s && s.running);
          }
        } catch {
          // Proceed even if state check fails; diagnostics can still run via ADB.
        }

        let launchAttempted = false;
        let launchOk = false;
        let launchMessage = '';

        if (appInstalled && !appRunning) {
          launchAttempted = true;
          try {
            const openRes = await fetch('http://localhost:3333/mobile-app-open', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ id }),
            });

            let openBody = null;
            try {
              openBody = await openRes.json();
            } catch {
              openBody = null;
            }

            launchOk = !!(
              openRes.ok
              && openBody
              && openBody.ok
              && (openBody.running || openBody.launchOk)
            );

            if (openBody && typeof openBody.message === 'string' && openBody.message.trim()) {
              launchMessage = openBody.message.trim();
            } else if (openBody && typeof openBody.error === 'string' && openBody.error.trim()) {
              launchMessage = openBody.error.trim();
            } else if (!openRes.ok) {
              launchMessage = `Auto-open failed (HTTP ${openRes.status}).`;
            }
          } catch (openErr) {
            launchMessage = openErr && openErr.message
              ? String(openErr.message)
              : 'Could not auto-open SmartHub mobile app.';
          }
        }

        const metaEl = document.getElementById(`diag-meta-${id}`);
        if (metaEl) {
          if (!stateKnown) {
            metaEl.textContent = 'Starting ADB diagnostics. Could not verify mobile app state.';
          } else if (!appInstalled) {
            metaEl.textContent = 'SmartHub mobile app is not installed on this phone. Starting ADB diagnostics anyway.';
          } else if (appRunning) {
            metaEl.textContent = 'SmartHub mobile app is already running. Starting ADB diagnostics.';
          } else if (launchAttempted && launchOk) {
            metaEl.textContent = 'Opened SmartHub mobile app automatically. Starting ADB diagnostics.';
          } else if (launchAttempted) {
            metaEl.textContent = launchMessage
              ? `${launchMessage} Starting ADB diagnostics anyway.`
              : 'Could not auto-open SmartHub mobile app. Starting ADB diagnostics anyway.';
          } else {
            metaEl.textContent = 'Starting ADB diagnostics.';
          }
        }

        runnableDevices.push(deviceEl);
      }

      if (!runnableDevices.length) return;

      const problemText = await (async () => {
        const problemModal = document.getElementById('adb-problem-modal');
        const inputEl = document.getElementById('adb-problem-input');
        const closeBtn = document.getElementById('adb-problem-close-btn');
        const cancelBtn = document.getElementById('adb-problem-cancel-btn');
        const continueBtn = document.getElementById('adb-problem-continue-btn');

        if (!problemModal || !inputEl || !continueBtn || !cancelBtn) {
          // Fallback: if modal isn't available for some reason, proceed without the problem.
          return '';
        }

        return await new Promise(resolve => {
          const onKeyDown = (ev) => {
            try {
              if (!ev) return;
              if (ev.key === 'Escape') {
                ev.preventDefault();
                cancel();
                return;
              }
              // Enter submits; Shift+Enter inserts a newline.
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                continueBtn.click();
              }
            } catch {
              // ignore
            }
          };

          const cleanup = () => {
            try {
              continueBtn.onclick = null;
              cancelBtn.onclick = null;
              if (closeBtn) closeBtn.onclick = null;
              inputEl.removeEventListener('keydown', onKeyDown);
            } catch {
              // ignore
            }
          };

          const close = (value) => {
            cleanup();
            problemModal.classList.add('hidden');
            resolve(typeof value === 'string' ? value : '');
          };

          const cancel = () => {
            cleanup();
            problemModal.classList.add('hidden');
            resolve(null);
          };

          continueBtn.onclick = () => {
            const v = String(inputEl.value || '').trim();
            close(v);
          };
          cancelBtn.onclick = () => cancel();
          if (closeBtn) closeBtn.onclick = () => cancel();
          problemModal.classList.remove('hidden');

          try {
            inputEl.addEventListener('keydown', onKeyDown);
          } catch {
            // ignore
          }

          try {
            inputEl.value = '';
            setTimeout(() => {
              try {
                inputEl.focus();
              } catch {
                // ignore
              }
            }, 0);
          } catch {
            // ignore
          }
        });
      })();

      if (problemText == null) {
        // User cancelled; do not start diagnostics.
        return;
      }

      try {
        if (typeof window !== 'undefined') {
          if (typeof window.userProblemByDevice === 'undefined') {
            window.userProblemByDevice = {};
          }
          runnableDevices.forEach(deviceEl => {
            const id = deviceEl && deviceEl.dataset ? deviceEl.dataset.id : null;
            if (!id) return;
            window.userProblemByDevice[id] = problemText;
          });
        }
      } catch (_) {
        // best-effort only
      }

      runnableDevices.forEach(deviceEl => runSequentialDiagnosticsForDevice(deviceEl));
    });
  }

  const testBtn = document.getElementById('action-test');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      openTestDeviceModal();
    });
  }

  const smartLinkBtn = document.getElementById('smartlink-btn');
  if (smartLinkBtn) {
    smartLinkBtn.addEventListener('click', () => {
      const modal = document.getElementById('smartlink-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  }

  const quickNoDebugBtn = document.getElementById('action-no-debug');
  if (quickNoDebugBtn) {
    quickNoDebugBtn.addEventListener('click', () => {
      openBsodDiagnoseModal();
    });
  }

  const historyNavBtn = document.getElementById('action-history');
  if (historyNavBtn) {
    historyNavBtn.addEventListener('click', () => {
      if (typeof window.openGlobalHistoryModal === 'function') {
        window.openGlobalHistoryModal();
      }
    });
  }

  const bsodModal = document.getElementById('bsod-diagnose-modal');
  if (bsodModal) {
    const closeButtons = [
      document.getElementById('bsod-diagnose-close-btn'),
      document.getElementById('bsod-diagnose-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        bsodModal.classList.add('hidden');
      });
    });
  }

  const historyBrowserModal = document.getElementById('history-browser-modal');
  if (historyBrowserModal) {
    const closeButtons = [
      document.getElementById('history-browser-close-btn'),
      document.getElementById('history-browser-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        historyBrowserModal.classList.add('hidden');
      });
    });
  }

  const adbProblemModal = document.getElementById('adb-problem-modal');
  if (adbProblemModal) {
    const closeButtons = [
      document.getElementById('adb-problem-close-btn'),
      document.getElementById('adb-problem-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        adbProblemModal.classList.add('hidden');
      });
    });
  }

  const deviceDetailsModal = document.getElementById('device-details-modal');
  if (deviceDetailsModal) {
    const closeButtons = [
      document.getElementById('device-details-close-btn'),
      document.getElementById('device-details-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        deviceDetailsModal.classList.add('hidden');
      });
    });
  }

  const diagModal = document.getElementById('diag-modal');
  if (diagModal) {
    const closeButtons = [
      document.getElementById('modal-close-btn'),
      document.getElementById('modal-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        diagModal.classList.add('hidden');
      });
    });
  }

  const diagStepDetailModal = document.getElementById('diag-step-detail-modal');
  if (diagStepDetailModal) {
    const closeButtons = [
      document.getElementById('diag-step-detail-close-btn'),
      document.getElementById('diag-step-detail-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        diagStepDetailModal.classList.add('hidden');
      });
    });
  }

  const devGuideBtn = document.getElementById('dev-guide-btn');
  if (devGuideBtn) {
    devGuideBtn.addEventListener('click', () => {
      const modal = document.getElementById('dev-guide-modal');
      if (modal) {
        modal.classList.remove('hidden');
        return;
      }

      const lines = [
        'To run full diagnostics the phone must be visible to ADB.',
        '',
        'Step 1 – Enable Developer options:',
        '• Open Settings on the phone.',
        '• Scroll to About phone (or About device).',
        '• Find Build number and tap it 7 times, then enter the device PIN if asked.',
        '• A message will appear: "You are now a developer".',
        '',
        'Step 2 – Turn on USB debugging:',
        '• Go back to Settings → System (or Additional settings).',
        '• Open Developer options.',
        '• Turn on USB debugging and confirm the warning.',
        '',
        'Step 3 – Trust this PC:',
        '• Connect the phone to the PC with a USB cable.',
        '• When asked "Allow USB debugging?", tick "Always allow from this computer" and tap Allow.',
        '',
        'After these steps, click "↻ Refresh devices" above. The phone should now appear as ADB‑visible and full diagnostics can run.',
      ];

      showMessageModal({
        title: 'How to enable Developer options',
        message: lines.join('\n'),
      });
    });
  }




  const testDeviceModal = document.getElementById('test-device-modal');
  if (testDeviceModal) {
    const closeButtons = [
      document.getElementById('test-device-close-btn'),
      document.getElementById('test-device-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        testDeviceModal.classList.add('hidden');
      });
    });
  }

  const mobileAppRequiredModal = document.getElementById('mobile-app-required-modal');
  if (mobileAppRequiredModal) {
    const closeButtons = [
      document.getElementById('mobile-app-required-close-btn'),
      document.getElementById('mobile-app-required-ok-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        mobileAppRequiredModal.classList.add('hidden');
      });
    });
  }

  const installResultModal = document.getElementById('install-result-modal');
  if (installResultModal) {
    const closeButtons = [
      document.getElementById('install-result-close-btn'),
      document.getElementById('install-result-ok-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        installResultModal.classList.add('hidden');
      });
    });
  }

  const smartLinkModal = document.getElementById('smartlink-modal');
  if (smartLinkModal) {
    const closeButtons = [
      document.getElementById('smartlink-close-btn'),
      document.getElementById('smartlink-ok-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        smartLinkModal.classList.add('hidden');
      });
    });

    const installBtn = document.getElementById('smartlink-install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (readOnlyEnabled) {
          showMessageModal({
            title: 'Read-only mode',
            message: 'Read-only mode is enabled. Installing apps is disabled.',
          });
          return;
        }
        const btn = installBtn;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing…';

        const manualInstructions =
          'SmartLink APK has been copied to the phone.\n\n' +
          'Location on device: Internal storage/Download/SmartLink/smartlink.apk\n\n' +
          'On the phone: open Files/Downloads → SmartLink → tap smartlink.apk → Install.\n' +
          'If blocked: enable "Install unknown apps" for your file manager.';

        async function downloadApkFallback() {
          try {
            const apkRes = await fetch('http://localhost:3333/smartlink/agent-apk');
            if (!apkRes.ok) {
              let msg = `Download failed (HTTP ${apkRes.status})`;
              try {
                const err = await apkRes.json();
                if (err && err.error) msg = err.error;
              } catch {
                // ignore
              }
              throw new Error(msg);
            }
            const blob = await apkRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'smartlink.apk';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            btn.textContent = 'APK copied / downloaded';
            showMessageModal({
              title: 'Manual install steps',
              message: manualInstructions,
            });
          } catch (e) {
            console.error('SmartLink APK download failed:', e);
            btn.textContent = 'Download failed';
            showMessageModal({
              title: 'SmartLink APK download failed',
              message: e && e.message ? e.message : e,
            });
          }
        }

        try {
          // If ADB is available, attempt the existing "push + install" route.
          // Otherwise fall back to MTP/manual install (download APK).
          let adbDeviceCount = 0;
          try {
            const checkRes = await fetch('http://localhost:3333/connection-check?deep=0');
            if (checkRes.ok) {
              const check = await checkRes.json();
              const devices = check && check.adb && Array.isArray(check.adb.devices) ? check.adb.devices : [];
              adbDeviceCount = devices.length;
            }
          } catch {
            // If we can't check, just try install and then fallback.
          }

          if (adbDeviceCount <= 0) {
            btn.textContent = 'Downloading APK…';
            await downloadApkFallback();
            return;
          }

          btn.textContent = 'Installing…';
          const res = await fetch('http://localhost:3333/install-smartlink-app', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            // In development, callers can optionally supply apkPath in the
            // request body; in the packaged Windows app we rely on the
            // backend's default SmartLink APK search paths.
            body: JSON.stringify({}),
          });

          let data = null;
          try {
            data = await res.json();
          } catch {
            data = null;
          }

          if (res.ok && data && data.ok) {
            btn.textContent = 'SmartLink installed';
          } else {
            const msg = (data && data.error) || `Install failed (HTTP ${res.status})`;
            console.error('Install SmartLink app failed:', msg);
            // If ADB install fails, fall back to manual download+install.
            btn.textContent = 'Downloading APK…';
            showMessageModal({
              title: 'ADB install failed',
              message: `Switching to manual install.\n\nReason: ${msg}`,
            });
            await downloadApkFallback();
          }
        } catch (err) {
          console.error('Install SmartLink app error:', err);
          btn.textContent = 'Downloading APK…';
          await downloadApkFallback();
        } finally {
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
          }, 3000);
        }
      });
    }
  }

  const bsodLaunchModal = document.getElementById('bsod-launch-modal');
  if (bsodLaunchModal) {
    const closeButtons = [
      document.getElementById('bsod-launch-close-btn'),
      document.getElementById('bsod-launch-ok-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        bsodLaunchModal.classList.add('hidden');
      });
    });
  }

  const securityModal = document.getElementById('security-modal');
  if (securityModal) {
    const closeButtons = [
      document.getElementById('security-modal-close-btn'),
      document.getElementById('security-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        securityModal.classList.add('hidden');
      });
    });
  }

  const appUsageModal = document.getElementById('app-usage-modal');
  if (appUsageModal) {
    const closeButtons = [
      document.getElementById('app-usage-close-btn'),
      document.getElementById('app-usage-cancel-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        appUsageModal.classList.add('hidden');
      });
    });
  }

  const devGuideModalEl = document.getElementById('dev-guide-modal');
  if (devGuideModalEl) {
    const devGuideCloseButtons = [
      document.getElementById('dev-guide-close-btn'),
      document.getElementById('dev-guide-ok-btn'),
    ].filter(Boolean);
    devGuideCloseButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        devGuideModalEl.classList.add('hidden');
      });
    });
  }

  const messageModal = document.getElementById('message-modal');
  if (messageModal) {
    const closeButtons = [
      document.getElementById('message-modal-close-btn'),
      document.getElementById('message-modal-ok-btn'),
    ].filter(Boolean);
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        messageModal.classList.add('hidden');
      });
    });
  }

  // Global keyboard shortcuts (Windows app / WebView)
  // - Ctrl+R: Refresh devices
  // - Ctrl+Enter: Start diagnostic
  // - Ctrl+B: BSOD-only diagnose
  // - Ctrl+I: Install mobile app
  // - Ctrl+L: Toggle read-only
  // - Ctrl+G: Developer options guide
  // - Esc: Close the top-most modal
  const closeTopModal = () => {
    const openModals = Array.from(document.querySelectorAll('.modal')).filter(
      el => el && !el.classList.contains('hidden')
    );
    if (openModals.length === 0) return false;
    openModals[openModals.length - 1].classList.add('hidden');
    return true;
  };

  const clickById = id => {
    const el = document.getElementById(id);
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  };

  document.addEventListener(
    'keydown',
    e => {
      if (!e) return;

      // Esc closes the top-most modal.
      if (e.key === 'Escape') {
        const closed = closeTopModal();
        if (closed) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Ctrl-based app shortcuts.
      if (!e.ctrlKey || e.altKey || e.metaKey) return;

      // Normalize key.
      const key = (e.key || '').toLowerCase();

      if (key === 'r') {
        e.preventDefault();
        e.stopPropagation();
        clickById('refresh');
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        clickById('action-start');
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        e.stopPropagation();
        clickById('action-no-debug');
        return;
      }

      if (key === 'i') {
        e.preventDefault();
        e.stopPropagation();
        clickById('install-app-btn');
        return;
      }

      if (key === 'l') {
        e.preventDefault();
        e.stopPropagation();
        clickById('read-only-toggle');
        return;
      }

      if (key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        clickById('dev-guide-btn');
        return;
      }
    },
    true
  );

  refresh();
});

