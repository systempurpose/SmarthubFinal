// Actionable Advice System - Non-destructive addition to existing diagnostics
// This module adds contextual advice buttons to diagnostic results without modifying core logic

// Global storage for suspicious apps data (populated by devices.js)
if (typeof window.suspiciousAppsByDevice === 'undefined') {
  window.suspiciousAppsByDevice = {};
}

// Storage for non-security findings (e.g., battery/display/OS) keyed by device ID
if (typeof window.attentionFindingsByDevice === 'undefined') {
  window.attentionFindingsByDevice = {};
}

const ADVICE_DATABASE = {
  'security-high-risk': {
    title: 'Security - High Risk',
    icon: '🛡️',
    content: `
      <strong>Immediate actions recommended:</strong>
      <ul>
        <li>Review and uninstall any flagged apps with risky permissions</li>
        <li>Disable Developer Options if not needed (Settings → System → Developer Options)</li>
        <li>Check for unauthorized APKs in Downloads folder</li>
        <li>Verify "Install from Unknown Sources" is disabled</li>
        <li>Run a full security scan using the built-in tool</li>
      </ul>
    `,
    dynamic: true, // Indicates this advice can be dynamically enhanced with specific app info
  },
  'security-overview': {
    title: 'Security overview',
    icon: '🛡️',
    content: `
      <strong>What this Security card shows:</strong>
      <ul>
        <li>Status of installed apps and recent log signals after you run a scan.</li>
        <li>Whether any apps look risky based on permissions, source and behaviour.</li>
        <li>High‑level guidance on cleaning or hardening the device if issues are found.</li>
      </ul>
      <strong>How to use it:</strong>
      <ul>
        <li>First, connect a device and run <em>Scan for Threats</em> for this phone.</li>
        <li>Re‑open this advice if the badge changes to Moderate / Risky to see specific steps.</li>
        <li>Use this view together with app details and customer history before making decisions.</li>
      </ul>
    `,
  },
  'security-moderate': {
    title: 'Security - Moderate Risk',
    icon: '🛡️',
    content: `
      <strong>Recommended actions:</strong>
      <ul>
        <li>Review apps with sensitive permissions (location, contacts, SMS)</li>
        <li>Update all apps to their latest versions</li>
        <li>Enable Google Play Protect scanning</li>
        <li>Check recent app installations for suspicious entries</li>
      </ul>
    `,
    dynamic: true,
  },
  'battery-low': {
    title: 'Battery - Low Level',
    icon: '🔋',
    content: `
      <strong>Quick fixes to extend battery life:</strong>
      <ul>
        <li>Enable Battery Saver / Low Power Mode</li>
        <li>Reduce screen brightness to 20-30%</li>
        <li>Turn off Wi-Fi, Bluetooth, and GPS when not needed</li>
        <li>Close background apps consuming excessive power</li>
        <li>Charge with an official or quality-certified charger</li>
      </ul>
    `,
  },
  'battery-hot': {
    title: 'Battery - Overheating',
    icon: '🔥',
    content: `
      <strong>Immediate actions to prevent damage:</strong>
      <ul>
        <li>Stop charging immediately if the device is hot</li>
        <li>Close resource-intensive apps and games</li>
        <li>Remove any phone case to improve heat dissipation</li>
        <li>Move device to a cooler environment (avoid direct sunlight)</li>
        <li>If temperature exceeds 45°C regularly, battery replacement may be needed</li>
      </ul>
    `,
  },
  'battery-health': {
    title: 'Battery - Health Issue',
    icon: '⚠️',
    content: `
      <strong>Battery health concerns detected:</strong>
      <ul>
        <li>Check battery health status: Settings → Battery → Battery Health</li>
        <li>Avoid charging overnight or keeping at 100% for extended periods</li>
        <li>Optimal charge range is 20-80% for longevity</li>
        <li>If capacity is below 80% of original, consider battery replacement</li>
        <li>Use original charger to maintain proper charging efficiency</li>
      </ul>
    `,
  },
  'storage-full': {
    title: 'Storage - Nearly Full',
    icon: '💾',
    content: `
      <strong>Actions to free up space:</strong>
      <ul>
        <li>Clear system cache: Settings → Storage → Cached Data</li>
        <li>Delete large files over 100MB (use Files app → sort by size)</li>
        <li>Remove unused apps and games</li>
        <li>Clear app caches individually: Settings → Apps → [App] → Clear Cache</li>
        <li>Move photos/videos to cloud storage or external SD card</li>
        <li>Delete old downloads and duplicate files</li>
      </ul>
    `,
  },
  'system-crash': {
    title: 'System - Crash / ANR Detected',
    icon: '⚡',
    content: `
      <strong>System stability recommendations:</strong>
      <ul>
        <li>Clear app cache for frequently crashing apps</li>
        <li>Check for Android system updates: Settings → System → System Update</li>
        <li>Reboot device to clear temporary system issues</li>
        <li>Free up RAM by closing background apps</li>
        <li>If crashes persist, consider factory reset (backup data first)</li>
      </ul>
    `,
  },
  'attention-issues': {
    title: 'Attention needed',
    icon: '⚠️',
    content: '',
    dynamic: true,
  },
  'display-issue': {
    title: 'Display - Hardware Issue',
    icon: '🖥️',
    content: `
      <strong>Display troubleshooting steps:</strong>
      <ul>
        <li>Check for loose display connector (requires technician)</li>
        <li>Test with screen test patterns to identify dead pixels</li>
        <li>Verify GPU/SurfaceFlinger is not reporting errors in logs</li>
        <li>If backlight works but no image, LCD or GPU driver issue likely</li>
        <li>Consider professional display assembly replacement if hardware fault confirmed</li>
      </ul>
    `,
  },
  'touch-ghost': {
    title: 'Touch - Ghost Touch / Input Issues',
    icon: '👆',
    content: `
      <strong>Touch sensitivity fixes:</strong>
      <ul>
        <li>Disconnect charger if ghost touches occur during charging (faulty charger/cable)</li>
        <li>Clean screen thoroughly - dirt and moisture cause phantom touches</li>
        <li>Remove screen protector temporarily to test if it's the cause</li>
        <li>Restart device to reset touch calibration</li>
        <li>If persistent, touch digitizer may need replacement</li>
      </ul>
    `,
  },
  'os-corruption': {
    title: 'OS - Possible Corruption',
    icon: '🧩',
    content: `
      <strong>Operating system repair steps:</strong>
      <ul>
        <li>Boot into Recovery Mode and clear system cache partition</li>
        <li>Check if custom ROM/root caused filesystem errors</li>
        <li>Backup data and perform factory reset if safe mode doesn't help</li>
        <li>If dm-verity errors persist, reflash stock firmware (advanced)</li>
        <li>Storage chip (eMMC/UFS) wear may require professional board repair</li>
      </ul>
    `,
  },
};

// Create and attach advice button to summary badges
function attachAdviceButton(badgeElement, adviceKey) {
  if (!badgeElement) return;

  // If a button already exists but for a different advice key, replace it.
  const existingKey = badgeElement.dataset.adviceKey;
  if (badgeElement.dataset.adviceAttached === 'true' && existingKey === adviceKey) {
    return;
  }

  if (badgeElement.dataset.adviceAttached === 'true' && existingKey !== adviceKey) {
    const maybeBtn = badgeElement.nextElementSibling;
    if (maybeBtn && maybeBtn.classList && maybeBtn.classList.contains('advice-btn')) {
      maybeBtn.remove();
    }
    badgeElement.dataset.adviceAttached = 'false';
  }

  // Extract device ID from badge ID (e.g., "security-badge-12345" -> "12345")
  let deviceId = null;
  if (badgeElement.id) {
    const match = badgeElement.id.match(/-(badge|value)-(.+)$/);
    if (match && match[2]) {
      deviceId = match[2];
    }
  }

  const btn = document.createElement('button');
  btn.className = 'advice-btn';
  btn.textContent = 'i';
  btn.setAttribute('aria-label', 'Show actionable advice');
  btn.dataset.adviceKey = adviceKey;
  if (deviceId) {
    btn.dataset.deviceId = deviceId; // Store device ID directly on button
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAdviceTooltip(btn, adviceKey);
  });

  badgeElement.parentElement.insertBefore(btn, badgeElement.nextSibling);
  badgeElement.dataset.adviceAttached = 'true';
  badgeElement.dataset.adviceKey = adviceKey;
}

// Generate dynamic advice content with specific app information
function generateDynamicAdvice(adviceKey, deviceId) {
  const baseAdvice = ADVICE_DATABASE[adviceKey];
  if (!baseAdvice || !baseAdvice.dynamic) {
    console.log('[Advice Debug] No dynamic advice available for key:', adviceKey);
    return baseAdvice;
  }

  // Device-level attention list (battery / display / OS issues)
  if (adviceKey === 'attention-issues') {
    const issuesByDevice = window.attentionFindingsByDevice || {};
    const issues = Array.isArray(issuesByDevice[deviceId]) ? issuesByDevice[deviceId] : [];

    if (!issues.length) {
      return {
        title: baseAdvice.title,
        icon: baseAdvice.icon,
        content:
          '<div style="font-size:13px; color:#e5e7eb;">No detailed findings yet for this device. Run a diagnostic to capture battery, display, and OS checks, then reopen this info.</div>',
      };
    }

    const severityMeta = {
      high: { label: 'High', color: '#fecaca', icon: '⛔' },
      medium: { label: 'Medium', color: '#fde68a', icon: '⚠' },
      low: { label: 'Low', color: '#bbf7d0', icon: '✓' },
    };

    const inferCategory = id => {
      if (!id || typeof id !== 'string') return 'System';
      const lower = id.toLowerCase();
      if (lower.includes('battery')) return 'Battery';
      if (lower.includes('display') || lower.includes('surface') || lower.includes('gpu')) return 'Display';
      if (lower.includes('storage') || lower.includes('disk')) return 'Storage';
      if (lower.includes('os') || lower.includes('system') || lower.includes('fs')) return 'OS / Filesystem';
      return 'System';
    };

    const cards = issues.slice(0, 6).map(issue => {
      const sev = (issue.severity || 'medium').toLowerCase();
      const meta = severityMeta[sev] || severityMeta.medium;
      const category = inferCategory(issue.id);
      const title = issue.title || issue.id || 'Issue detected';
      const detail = issue.details || 'Investigate this component before handing back the device.';

      return `
        <div style="border:1px solid ${meta.color}; border-radius:10px; padding:10px; margin-bottom:8px; background: rgba(15, 23, 42, 0.85);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="color:${meta.color}; font-weight:700; font-size:12px;">${meta.icon} ${meta.label} · ${category}</span>
            <span style="color:#cbd5e1; font-size:12px;">${issue.id || ''}</span>
          </div>
          <div style="color:#e5e7eb; font-weight:600; font-size:14px; margin-bottom:6px;">${title}</div>
          <div style="color:#cbd5e1; font-size:12px; line-height:1.5;">${detail}</div>
        </div>`;
    }).join('');

    const remaining = issues.length > 6 ? `<div style="color:#9ca3af; font-size:12px;">…and ${issues.length - 6} more finding(s).</div>` : '';

    const guidance = `
      <div style="margin-top:10px; font-size:12px; color:#9ca3af; line-height:1.5;">
        Quick next steps: focus on the flagged components above. For screens showing no image, re-seat the connector and run the display tests. For OS or storage findings, try safe mode and check filesystem/verity logs. For battery flags, confirm temperature, cycle count, and consider replacement.
      </div>`;

    return {
      title: baseAdvice.title,
      icon: baseAdvice.icon,
      content: `<div style="font-size:13px; color:#e5e7eb;">Detected issues on this device:</div>${cards}${remaining}${guidance}`,
    };
  }

  // Get suspicious apps for this device
  const suspiciousApps = window.suspiciousAppsByDevice?.[deviceId] || [];
  console.log('[Advice Debug] Suspicious apps for device', deviceId, ':', suspiciousApps);
  
  if (!suspiciousApps.length) {
    console.log('[Advice Debug] No suspicious apps found, showing generic advice');
    console.warn('⚠️ Expected suspicious apps but found none. This may indicate:');
    console.warn('1. Apps scan has not been run yet (click "🛡️ Scan for Threats" button)');
    console.warn('2. All installed apps are safe/trusted');
    console.warn('3. Data storage issue - check window.suspiciousAppsByDevice');
    return baseAdvice;
  }

  // Show all suspicious apps for security-related advice (don't filter by exact threat level)
  // This ensures medium/low risk apps still appear even if badge says "High Risk"
  let relevantApps = suspiciousApps;
  
  // Sort by threat level: high first, then medium, then low
  relevantApps.sort((a, b) => {
    const threatOrder = { high: 0, medium: 1, low: 2 };
    return (threatOrder[a.threatLevel] || 3) - (threatOrder[b.threatLevel] || 3);
  });

  console.log('[Advice Debug] Will show', relevantApps.length, 'apps in tooltip:', relevantApps.map(a => a.displayName));


  // Build dynamic content with specific apps
  let content = '<strong>⚠️ Suspicious apps detected on this device:</strong><div style=\"margin-top: 12px;\">';

  relevantApps.slice(0, 5).forEach((app, index) => {
    const threatColor = app.threatLevel === 'high' ? '#fecaca' : app.threatLevel === 'medium' ? '#fde68a' : '#e9d5ff';
    const threatLabel = app.threatLevel === 'high' ? 'HIGH RISK' : app.threatLevel === 'medium' ? 'MODERATE' : 'LOW';

    content += `
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid ${threatColor}; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="color: ${threatColor}; font-weight: 700; font-size: 10px; letter-spacing: 0.1em;">${threatLabel}</span>
          <span style="color: #e5e7eb; font-weight: 600; font-size: 13px;">${app.displayName}</span>
        </div>
        <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">${app.reason}</div>
        <div style="font-size: 11px; color: #38bdf8; font-weight: 600;">
          📱 Package: <code style="background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px; font-size: 10px;">${app.packageName}</code>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
          <strong style="color: #22d3ee; font-size: 12px;">✓ Action:</strong>
          <div style="color: #e5e7eb; font-size: 11px; margin-top: 4px;">${app.suggestedAction}</div>
        </div>
      </div>
    `;
  });

  if (relevantApps.length > 5) {
    content += `<div style="font-size: 11px; color: #9ca3af; margin-top: 8px;">...and ${relevantApps.length - 5} more suspicious app(s) detected.</div>`;
  }

  content += '</div>';

  // Add generic advice after specific apps
  content += '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.2);">';
  content += '<strong>General security recommendations:</strong>';
  content += '<ul style="margin-top: 8px; padding-left: 16px;">';
  content += '<li>Use ADB command: <code style="background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px; font-size: 10px;">adb uninstall [package.name]</code></li>';
  content += '<li>Or uninstall via Settings → Apps → [App Name] → Uninstall</li>';
  content += '<li>If uninstall fails, disable Device Admin first: Settings → Security → Device Admins</li>';
  content += '<li>Install apps only from Google Play Store</li>';
  content += '<li>Enable Play Protect: Play Store → Menu → Play Protect → Settings → Scan device for security threats</li>';
  content += '</ul></div>';

  console.log('[Advice Debug] Successfully generated dynamic advice with', relevantApps.length, 'app(s)');

  return {
    title: baseAdvice.title,
    icon: baseAdvice.icon,
    content: content,
  };
}

// Show advice tooltip near the button
function showAdviceTooltip(button, adviceKey) {
  const tooltip = document.getElementById('advice-tooltip');
  const titleEl = document.getElementById('advice-title');
  const contentEl = document.getElementById('advice-content');

  if (!tooltip || !titleEl || !contentEl) return;

  // Get device ID from button's data attribute (set during attachment)
  let deviceId = button.dataset.deviceId || null;
  
  // FALLBACK: If no device ID on button, try to extract from badge ID
  if (!deviceId) {
    const badge = button.previousElementSibling;
    if (badge && badge.id) {
      const match = badge.id.match(/-(badge|value)-(.+)$/);
      if (match && match[2]) {
        deviceId = match[2];
        console.log('[Advice Debug] Extracted device ID from badge:', deviceId);
      }
    }
  }

  console.log('=== ADVICE DEBUG START ===');
  console.log('[Advice Debug] Device ID:', deviceId);
  console.log('[Advice Debug] Advice Key:', adviceKey);
  console.log('[Advice Debug] All Suspicious Apps:', window.suspiciousAppsByDevice);
  console.log('[Advice Debug] This Device Apps:', window.suspiciousAppsByDevice?.[deviceId]);
  console.log('=== ADVICE DEBUG END ===');

   // If we have suspicious apps but somehow the advice key is still the overview,
   // upgrade to the high-risk advice so the list is shown without requiring re-attach.
   if (adviceKey === 'security-overview' && deviceId) {
     const existingApps = window.suspiciousAppsByDevice?.[deviceId];
     if (Array.isArray(existingApps) && existingApps.length > 0) {
       console.log('[Advice Debug] Auto-upgrading advice to security-high-risk because suspicious apps exist.');
       adviceKey = 'security-high-risk';
       button.dataset.adviceKey = adviceKey;
     }
   }

  // Get dynamic advice if device ID is available
  const advice = deviceId ? generateDynamicAdvice(adviceKey, deviceId) : ADVICE_DATABASE[adviceKey];
  if (!advice) return;

  titleEl.textContent = advice.title;
  contentEl.innerHTML = advice.content;

  // Position tooltip near the button
  const rect = button.getBoundingClientRect();
  const tooltipWidth = 320;
  const tooltipHeight = 300; // approximate

  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 8;

  // Adjust if tooltip would go off-screen
  if (left + tooltipWidth > window.innerWidth) {
    left = window.innerWidth - tooltipWidth - 20;
  }
  if (top + tooltipHeight > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - tooltipHeight - 8;
  }

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.classList.add('visible');

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!tooltip.contains(e.target) && e.target !== button) {
        tooltip.classList.remove('visible');
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

// Close button handler
document.addEventListener('DOMContentLoaded', () => {
  const tooltip = document.getElementById('advice-tooltip');
  const closeBtn = document.getElementById('advice-close');

  if (closeBtn && tooltip) {
    closeBtn.addEventListener('click', () => {
      tooltip.classList.remove('visible');
    });
  }

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tooltip && tooltip.classList.contains('visible')) {
      tooltip.classList.remove('visible');
    }
  });
});

// Hook into existing diagnostic result processing
// This monitors changes to summary badges and adds advice buttons when needed
function monitorDiagnosticResults() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList && target.classList.contains('summary-badge')) {
          processAdviceForBadge(target);
        }
      }
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const badges = node.querySelectorAll ? node.querySelectorAll('.summary-badge') : [];
            badges.forEach(processAdviceForBadge);
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });

  // Process existing badges on load
  setTimeout(() => {
    document.querySelectorAll('.summary-badge').forEach(processAdviceForBadge);
  }, 1000);
}

function processAdviceForBadge(badge) {
  if (!badge || badge.dataset.adviceAttached === 'true') return;

  const id = badge.id;
  const text = badge.textContent.toLowerCase();
  const isIssue = text.includes('issue') || text.includes('attention') || text.includes('high risk');
  const isDanger = badge.classList.contains('summary-badge-danger');
  const isWarn = badge.classList.contains('summary-badge-warn');

  console.log('[Advice] Processing badge:', { id, text, isIssue, isDanger, isWarn });

  // Security badges - always attach an info button.
  if (id && id.includes('security-badge')) {
    // If the badge is warning/danger we want the dynamic suspicious-app advice.
    // Previously we only checked for the word "risk" in the text, so a badge that
    // says "Moderate" would incorrectly show the generic overview. Now any warn or
    // danger state gets the high-risk advice (which renders the suspicious apps list).
    if (isDanger || isWarn) {
      console.log('[Advice] Attaching high-risk security advice button to badge:', id);
      attachAdviceButton(badge, 'security-high-risk');
    } else {
      console.log('[Advice] Attaching overview security advice button to badge:', id);
      attachAdviceButton(badge, 'security-overview');
    }
  }

  // Status badges (covers battery, storage, system issues)
  else if (id && id.includes('status-badge')) {
    // Get associated device ID
    const deviceId = id.replace('status-badge-', '');
    
    // Check specific issue type from the summary value
    const valueEl = document.getElementById(`status-value-${deviceId}`);
    const subtextEl = document.getElementById(`status-subtext-${deviceId}`);
    
    if (valueEl && subtextEl) {
      if (isDanger || isWarn) {
        // Always show an attention list with the actual findings driving this badge.
        attachAdviceButton(badge, 'attention-issues');
        return;
      }
    }
  }
}

// Start monitoring when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  monitorDiagnosticResults();
});

// DEBUG: Global function to manually show suspicious apps
window.showSuspiciousAppsDebug = function(deviceId) {
  const allDevices = window.suspiciousAppsByDevice || {};
  
  if (!deviceId) {
    console.log('=== ALL SUSPICIOUS APPS BY DEVICE ===');
    console.log(allDevices);
    
    Object.keys(allDevices).forEach(id => {
      console.log(`\n--- Device: ${id} ---`);
      allDevices[id].forEach(app => {
        console.log(`${app.displayName} (${app.packageName})`);
        console.log(`  Threat: ${app.threatLevel}`);
        console.log(`  Reason: ${app.reason}`);
        console.log(`  Action: ${app.suggestedAction}`);
      });
    });
    return;
  }
  
  const apps = allDevices[deviceId];
  if (!apps || apps.length === 0) {
    console.log(`No suspicious apps found for device: ${deviceId}`);
    return;
  }
  
  console.log(`=== Suspicious Apps for Device: ${deviceId} ===`);
  apps.forEach((app, index) => {
    console.log(`\n${index + 1}. ${app.displayName}`);
    console.log(`   Package: ${app.packageName}`);
    console.log(`   Threat Level: ${app.threatLevel}`);
    console.log(`   Reason: ${app.reason}`);
    console.log(`   Action: ${app.suggestedAction}`);
  });
  
  return apps;
};

console.log('💡 Advice system loaded. Type showSuspiciousAppsDebug() in console to see detected apps.');
