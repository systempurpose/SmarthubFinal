async function refresh() {
  const container = document.getElementById('devices');
  container.innerHTML = '<div class="status-banner"><div class="status-icon">⏳</div><div><strong>Scanning for devices</strong><br/>Querying ADB via the local companion service...</div></div>';
  try {
    const res = await fetch('http://localhost:3333/device');
    if (!res.ok) {
      throw new Error(`Backend error: HTTP ${res.status}`);
    }
    const data = await res.json();
    const devices = Array.isArray(data.devices) ? data.devices : [];

    console.log('Devices from backend:', devices);

    if (!devices.length) {
      container.innerHTML = '<div class="status-banner"><div class="status-icon">ℹ️</div><div><strong>No devices detected</strong><br/>Ensure your phone is connected, USB debugging is enabled, and that <code>adb devices</code> shows it.</div></div>';
      return;
    }

    container.innerHTML = '';
    devices.forEach(d => {
      const div = document.createElement('div');
      div.className = 'device';
      const name = d.model || d.product || d.deviceCode || d.id;
      const heading = `${name} (${d.id}, ${d.state})`;

      let connectionText = '';
      let connectionClass = '';
      if (d.connection && d.connection.type) {
        if (d.connection.type === 'tcpip') {
          const host = d.connection.host || (typeof d.id === 'string' && d.id.includes(':') ? d.id.split(':')[0] : '');
          const port = d.connection.port || (typeof d.id === 'string' && d.id.includes(':') ? d.id.split(':')[1] : '');
          const endpoint = [host, port].filter(Boolean).join(':');
          connectionText = endpoint ? `Connection: TCP/IP ${endpoint}` : 'Connection: TCP/IP';
          connectionClass = 'tcpip';
        } else if (d.connection.type === 'usb') {
          const path = d.connection.usbPath || d.usbPath;
          connectionText = path ? `Connection: USB (usb path: ${path})` : 'Connection: USB';
          connectionClass = 'usb';
        } else if (d.connection.type === 'emulator') {
          connectionText = 'Connection: Emulator';
          connectionClass = 'emulator';
        }
      }

      div.innerHTML = `
          <div class="device-header">
            <div class="device-title">
              <h3>${heading}</h3>
              ${connectionText ? `<div class="device-meta">${connectionText}</div>` : ''}
            </div>
            ${connectionClass ? `<span class="chip ${connectionClass}">${connectionClass}</span>` : ''}
          </div>
          <div class="device-body">
            <div class="device-summary-row">
              <div class="summary-card" id="status-card-${d.id}">
                <div class="summary-header">
                  <span class="summary-icon">✔</span>
                  <span class="summary-badge summary-badge-safe" id="status-badge-${d.id}">Safe</span>
                </div>
                <div class="summary-label">System Status</div>
                <div class="summary-value" id="status-value-${d.id}">Not scanned</div>
                <div class="summary-subtext" id="status-subtext-${d.id}">Run quick checks to analyse battery, storage and display.</div>
              </div>
              <div class="summary-card" id="security-card-${d.id}">
                <div class="summary-header">
                  <span class="summary-icon">🛡️</span>
                  <span class="summary-badge summary-badge-safe" id="security-badge-${d.id}">Safe</span>
                </div>
                <div class="summary-label">Security</div>
                <div class="summary-value" id="security-value-${d.id}">Not scanned</div>
                <div class="summary-subtext" id="security-subtext-${d.id}">App and log analysis after a scan.</div>
              </div>
              <div class="summary-card">
                <div class="summary-header">
                  <span class="summary-icon">📱</span>
                  <span class="summary-badge summary-badge-safe">Connected</span>
                </div>
                <div class="summary-label">Devices</div>
                <div class="summary-value">1 Active</div>
                <div class="summary-subtext">ID: ${d.id}</div>
              </div>
            </div>

            <div class="device-main">
              <div class="device-tabs">
                <button class="device-tab active" data-tab="overview">Overview</button>
                <button class="device-tab" data-tab="details">Details</button>
                <button class="device-tab" data-tab="logs">Logs</button>
              </div>
              <div class="device-tab-panels">
                <div class="device-tab-panel active" data-panel="overview">
                  <div class="device-overview-grid">
                    <div class="overview-item">
                      <div class="overview-label">Device ID</div>
                      <div class="overview-value">${d.id}</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label">Model</div>
                      <div class="overview-value">${name}</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label">Connection</div>
                      <div class="overview-value">${connectionClass ? connectionClass.toUpperCase() : 'Unknown'}</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label">Status</div>
                      <div class="overview-value">${d.state}</div>
                    </div>
                  </div>
                  <div class="device-actions">
                    <div class="device-actions-row">
                      <button data-id="${d.id}" class="collect btn-collect">Run quick checks</button>
                      <button data-id="${d.id}" class="apps btn-apps compact">Scan installed apps</button>
                      <button data-id="${d.id}" class="app-risk btn-app-risk compact">Check one app</button>
                    </div>
                    <pre id="out-${d.id}"></pre>
                  </div>
                </div>
                <div class="device-tab-panel" data-panel="details">
                  <div class="device-overview-grid">
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">🔋</span>Battery</div>
                      <div class="overview-value" id="detail-battery-${d.id}">Awaiting scan…</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">💾</span>Storage</div>
                      <div class="overview-value" id="detail-storage-${d.id}">Awaiting scan…</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">🖥️</span>Display pipeline</div>
                      <div class="overview-value" id="detail-display-${d.id}">Awaiting scan…</div>
                    </div>
                  </div>
                  <div class="details-spec">
                    <div class="details-spec-section">
                      <div class="details-spec-title">Display</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Size</div>
                        <div class="details-spec-value" id="spec-display-size-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Resolution</div>
                        <div class="details-spec-value" id="spec-display-resolution-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Density</div>
                        <div class="details-spec-value" id="spec-display-density-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Platform</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">OS</div>
                        <div class="details-spec-value" id="spec-platform-os-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Chipset</div>
                        <div class="details-spec-value" id="spec-platform-chipset-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">CPU</div>
                        <div class="details-spec-value" id="spec-platform-cpu-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Memory</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">RAM</div>
                        <div class="details-spec-value" id="spec-memory-ram-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Internal</div>
                        <div class="details-spec-value" id="spec-memory-internal-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Battery</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Type</div>
                        <div class="details-spec-value" id="spec-battery-type-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Misc</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Model</div>
                        <div class="details-spec-value" id="spec-misc-model-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Board</div>
                        <div class="details-spec-value" id="spec-misc-board-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Manufacturer</div>
                        <div class="details-spec-value" id="spec-misc-manufacturer-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Device code</div>
                        <div class="details-spec-value" id="spec-misc-device-${d.id}">–</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="device-tab-panel" data-panel="logs">
                  <div>
                    <pre id="logs-${d.id}"></pre>
                  </div>
                  <div class="device-visual">
                    <img src="http://localhost:3333/screenshot/${d.id}" alt="Device screenshot"/>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      container.appendChild(div);
    });

    // Tab switching per device (and auto-run quick checks when entering Details once)
    container.querySelectorAll('.device').forEach(deviceEl => {
      const tabs = deviceEl.querySelectorAll('.device-tab');
      const panels = deviceEl.querySelectorAll('.device-tab-panel');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-tab');
          tabs.forEach(t => t.classList.toggle('active', t === tab));
          panels.forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-panel') === target);
          });

          // When user first opens Details, automatically run quick checks
          if (target === 'details' && deviceEl.dataset.scanned !== 'true') {
            deviceEl.dataset.scanned = 'true';
            const collectBtn = deviceEl.querySelector('.collect');
            if (collectBtn) {
              collectBtn.click();
            }
          }
        });
      });
    });

    container.querySelectorAll('.collect').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const outEl = document.getElementById(`out-${id}`);
        if (outEl) {
          outEl.textContent = 'Running quick checks...';
        }

        const res = await fetch(`http://localhost:3333/collect/${id}`);
        const data = await res.json();
        const findings = Array.isArray(data.findings) ? data.findings : [];

        const logsEl = document.getElementById(`logs-${id}`);
        if (logsEl && typeof data.logs === 'string') {
          logsEl.textContent = data.logs;
        }

        if (!outEl) return;

        // Build summary stats
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;

        findings.forEach(f => {
          const sev = (f.severity || 'low').toLowerCase();
          if (sev === 'high') highCount += 1;
          else if (sev === 'medium') mediumCount += 1;
          else lowCount += 1;
        });

        if (!findings.length) {
          outEl.textContent = 'No issues detected in battery, storage or display pipeline.';
        }

        // Icon-based textual view inside the log area
        const severityIcons = {
          low: '✓',
          medium: '⚠',
          high: '⛔',
        };

        const categoryIcons = {
          battery: '🔋',
          storage: '💾',
          display: '🖥️',
          logs: '📋',
          generic: '📱',
        };

        function inferCategory(id) {
          if (!id || typeof id !== 'string') return 'generic';
          const lower = id.toLowerCase();
          if (lower.includes('battery')) return 'battery';
          if (lower.includes('storage') || lower.includes('disk')) return 'storage';
          if (lower.includes('display') || lower.includes('surface') || lower.includes('gpu')) return 'display';
          if (lower.includes('log') || lower.includes('crash')) return 'logs';
          return 'generic';
        }

        const blocks = findings.map(f => {
          const sev = (f.severity || 'low').toLowerCase();
          const sevLabel = sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low';
          const sevIcon = severityIcons[sev] || '✓';
          const category = inferCategory(f.id);
          const catIcon = categoryIcons[category] || categoryIcons.generic;

          const title = f.title || f.id || 'Unknown check';
          const details = f.details || '';

          return [
            `${catIcon}  ${title}`,
            `   ${sevIcon}  Severity: ${sevLabel}`,
            details ? `   • ${details}` : undefined,
          ]
            .filter(Boolean)
            .join('\n');
        });

        if (blocks.length) {
          outEl.textContent = blocks.join('\n\n');
        }

        // Update summary tiles and details tab
        const statusValueEl = document.getElementById(`status-value-${id}`);
        const statusBadgeEl = document.getElementById(`status-badge-${id}`);
        const statusSubEl = document.getElementById(`status-subtext-${id}`);
        const securityValueEl = document.getElementById(`security-value-${id}`);
        const securityBadgeEl = document.getElementById(`security-badge-${id}`);
        const securitySubEl = document.getElementById(`security-subtext-${id}`);

        const overallState = highCount > 0 ? 'danger' : mediumCount > 0 ? 'warn' : 'safe';

        function applyBadge(el, state) {
          if (!el) return;
          el.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
          if (state === 'danger') {
            el.classList.add('summary-badge-danger');
            el.textContent = 'Issue';
          } else if (state === 'warn') {
            el.classList.add('summary-badge-warn');
            el.textContent = 'Warning';
          } else {
            el.classList.add('summary-badge-safe');
            el.textContent = 'Safe';
          }
        }

        if (statusValueEl) {
          statusValueEl.textContent = overallState === 'safe' ? 'All Clear' : 'Attention needed';
        }
        if (statusSubEl) {
          statusSubEl.textContent = `${highCount + mediumCount} issue(s) detected across battery, storage or display.`;
        }
        applyBadge(statusBadgeEl, overallState);

        if (securityValueEl) {
          securityValueEl.textContent = overallState === 'danger' ? 'High Risk' : overallState === 'warn' ? 'Moderate' : 'Safe';
        }
        if (securitySubEl) {
          securitySubEl.textContent = `${highCount} high, ${mediumCount} medium, ${lowCount} low findings.`;
        }
        applyBadge(securityBadgeEl, overallState);

        // Details tab: map specific finding IDs where possible
        const batteryDetailEl = document.getElementById(`detail-battery-${id}`);
        const storageDetailEl = document.getElementById(`detail-storage-${id}`);
        const displayDetailEl = document.getElementById(`detail-display-${id}`);

        const byId = {};
        findings.forEach(f => {
          if (f.id) byId[f.id] = f;
        });

        function describe(f, fallbackLabel) {
          if (!f) return `${fallbackLabel}: OK`;
          const sev = (f.severity || 'low').toLowerCase();
          const sevLabel = sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low';
          return `${sevLabel} · ${f.title || fallbackLabel}`;
        }

        if (batteryDetailEl) {
          batteryDetailEl.textContent = describe(byId['battery-level'] || byId['battery-temp'], 'Battery');
        }
        if (storageDetailEl) {
          storageDetailEl.textContent = describe(byId['storage-full'], 'Storage');
        }
        if (displayDetailEl) {
          displayDetailEl.textContent = describe(byId['display-pipeline'], 'Display');
        }

        // Spec-style hardware summary: populate sections for Display, Platform, Memory, Battery, Misc
        if (
          data &&
          typeof data === 'object' &&
          ((data.props && typeof data.props === 'object') || typeof data.propsDump === 'string')
        ) {
          function parseGetprop(raw) {
            const out = {};
            const text = typeof raw === 'string' ? raw : '';
            if (!text.trim()) return out;

            text.split(/\r?\n/).forEach(lineRaw => {
              const line = String(lineRaw || '').trim();
              if (!line) return;

              const m1 = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]$/);
              if (m1) {
                const k = String(m1[1] || '').trim();
                const v = String(m1[2] || '').trim();
                if (k) out[k] = v;
                return;
              }

              const m2 = line.match(/^([a-zA-Z0-9._-]+)=(.*)$/);
              if (m2) {
                const k = String(m2[1] || '').trim();
                const v = String(m2[2] || '').trim();
                if (k) out[k] = v;
              }
            });

            return out;
          }

          const props = (data.props && typeof data.props === 'object') ? data.props : parseGetprop(data.propsDump);

          const manufacturer =
            props['ro.product.manufacturer'] ||
            props['ro.product.system.manufacturer'] ||
            props['ro.product.vendor.manufacturer'] ||
            props['ro.product.odm.manufacturer'] ||
            props['ro.product.brand'];
          const model =
            props['ro.product.model'] ||
            props['ro.product.system.model'] ||
            props['ro.product.vendor.model'] ||
            props['ro.product.odm.model'] ||
            props['ro.product.name'];
          const deviceCode =
            props['ro.product.device'] ||
            props['ro.product.system.device'] ||
            props['ro.product.vendor.device'] ||
            props['ro.product.odm.device'];
          const board =
            props['ro.product.board'] ||
            props['ro.product.system.board'] ||
            props['ro.board.platform'] ||
            props['ro.hardware'];
          const soc =
            props['ro.soc.model'] ||
            props['ro.hardware.chipname'] ||
            props['ro.mediatek.platform'] ||
            props['ro.board.platform'];
          const abi = props['ro.product.cpu.abi'];
          const abiList = props['ro.product.cpu.abilist'] || props['ro.product.cpu.abilist64'] || props['ro.product.cpu.abilist32'];
          const android = props['ro.build.version.release'] || props['ro.build.version.release_or_codename'];
          const patch = props['ro.build.version.security_patch'];

          const batteryTech = data.batteryMeta && data.batteryMeta.technology;
          let screenW = data.displayMeta && data.displayMeta.width;
          let screenH = data.displayMeta && data.displayMeta.height;
          const screenDiag = data.displayMeta && data.displayMeta.diagonalInches;
          const screenArea = data.displayMeta && data.displayMeta.areaCm2;

          // Fallback: wm size (Physical size / Override size)
          if ((!screenW || !screenH) && typeof data.wmSizeDump === 'string') {
            const ws = data.wmSizeDump;
            const mm = ws.match(/(?:Physical\s+size|Override\s+size):\s*(\d+)x(\d+)/i);
            if (mm) {
              const w = Number(mm[1]);
              const h = Number(mm[2]);
              if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
                screenW = w;
                screenH = h;
              }
            }
          }

          // Fallback: dumpsys display parsing
          if ((!screenW || !screenH) && typeof data.displayDump === 'string') {
            const dd = data.displayDump;
            const m1 = dd.match(/logicalWidth=(\d+),\s*logicalHeight=(\d+)/i);
            const m2 = dd.match(/DisplayDeviceInfo\{".*?".*?width=(\d+),\s*height=(\d+)/i);
            const m3 = dd.match(/mBaseDisplayInfo\s+real\s+(\d+)\s*x\s*(\d+)/i);
            const mm = m1 || m2 || m3;
            if (mm) {
              const w = Number(mm[1]);
              const h = Number(mm[2]);
              if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
                screenW = w;
                screenH = h;
              }
            }
          }

          // RAM from memInfo (MemTotal in kB)
          let ramText;
          if (typeof data.memInfo === 'string') {
            const memMatch = data.memInfo.match(/MemTotal:\s+(\d+) kB/i);
            if (memMatch) {
              const kb = Number(memMatch[1]);
              if (!Number.isNaN(kb) && kb > 0) {
                const gb = kb / (1024 * 1024);
                const rounded = gb >= 1 ? gb.toFixed(1) : (kb / 1024).toFixed(0) + ' MB';
                ramText = typeof rounded === 'string' && rounded.endsWith(' MB') ? rounded : `${rounded} GB`;
              }
            }
          }

          // Internal storage size from df -h (look for /data or /storage/emulated/0)
          let storageText;
          if (typeof data.storageDump === 'string') {
            const lines = data.storageDump.split(/\r?\n/).slice(1);
            let candidate;
            for (const line of lines) {
              if (!line.trim()) continue;
              if (line.includes(' /data') || line.includes(' /storage/emulated/0')) {
                candidate = line;
                break;
              }
            }
            if (!candidate && lines.length) {
              candidate = lines[0];
            }
            if (candidate && typeof candidate === 'string') {
    const parts = candidate.trim().split(/\s+/);
    if (parts.length >= 2) {
        storageText = parts[1];
    }
}
          }

          function setSpecValue(el, text, fallback = 'Unknown') {
            if (!el) return;
            const raw = (text === null || typeof text === 'undefined') ? '' : String(text);
            const value = raw.trim() ? raw : fallback;
            el.textContent = value;
          }

          function hideSpecRowIfUnknown(valueEl) {
            if (!valueEl) return;
            const v = String(valueEl.textContent || '').trim();
            const isUnknown = !v || v === 'Unknown' || v === '–' || v === '-';
            const row = valueEl.closest('.details-spec-row');
            if (row) {
              row.classList.toggle('hidden', isUnknown);
            }
          }

          // Look up spec fields in the Details panel
          const displaySizeEl = document.getElementById(`spec-display-size-${id}`);
          const displayResolutionEl = document.getElementById(`spec-display-resolution-${id}`);
          const displayDensityEl = document.getElementById(`spec-display-density-${id}`);

          const platformOsEl = document.getElementById(`spec-platform-os-${id}`);
          const platformChipsetEl = document.getElementById(`spec-platform-chipset-${id}`);
          const platformCpuEl = document.getElementById(`spec-platform-cpu-${id}`);

          const memoryRamEl = document.getElementById(`spec-memory-ram-${id}`);
          const memoryInternalEl = document.getElementById(`spec-memory-internal-${id}`);

          const batteryTypeEl = document.getElementById(`spec-battery-type-${id}`);

          const miscModelEl = document.getElementById(`spec-misc-model-${id}`);
          const miscBoardEl = document.getElementById(`spec-misc-board-${id}`);
          const miscManufacturerEl = document.getElementById(`spec-misc-manufacturer-${id}`);
          const miscDeviceCodeEl = document.getElementById(`spec-misc-device-${id}`);

          // Defaults: ensure every row shows something after a scan.
          setSpecValue(displaySizeEl, '');
          setSpecValue(displayResolutionEl, '');
          setSpecValue(displayDensityEl, '');
          setSpecValue(platformOsEl, '');
          setSpecValue(platformChipsetEl, '');
          setSpecValue(platformCpuEl, '');
          setSpecValue(memoryRamEl, '');
          setSpecValue(memoryInternalEl, '');
          setSpecValue(batteryTypeEl, '');
          setSpecValue(miscModelEl, '');
          setSpecValue(miscBoardEl, '');
          setSpecValue(miscManufacturerEl, '');
          setSpecValue(miscDeviceCodeEl, '');

          // Display section
          if (screenW && screenH) {
            setSpecValue(displayResolutionEl, `${screenW} x ${screenH} pixels`);

            if (typeof screenDiag === 'number' && typeof screenArea === 'number' && screenDiag > 0 && screenArea > 0) {
              const diagStr = screenDiag.toFixed(1);
              const areaStr = screenArea.toFixed(1);
              setSpecValue(displaySizeEl, `${diagStr} inches, ${areaStr} cm² (approx)`);

              const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
              const ppi = diagPx / screenDiag;
              if (ppi > 0) {
                const rounded = Math.round(ppi);
                setSpecValue(displayDensityEl, `~${rounded} ppi (approx)`);
              }
            }
          }

          // Density fallback: use logical lcd density when PPI is not computable.
          if (displayDensityEl && (!displayDensityEl.textContent || displayDensityEl.textContent.trim() === 'Unknown')) {
            const lcd = props['ro.sf.lcd_density'] || props['ro.display.lcd_density'] || '';
            const lcdNum = Number(String(lcd).trim());
            if (!Number.isNaN(lcdNum) && lcdNum > 0) {
              setSpecValue(displayDensityEl, `${lcdNum} dpi (logical)`);
            } else if (typeof data.wmDensityDump === 'string') {
              const wd = data.wmDensityDump;
              const mm = wd.match(/(?:Physical\s+density|Override\s+density):\s*(\d+)/i);
              if (mm && mm[1]) {
                const d = Number(mm[1]);
                if (!Number.isNaN(d) && d > 0) {
                  setSpecValue(displayDensityEl, `${d} dpi (logical)`);
                }
              }
            } else if (typeof data.displayDump === 'string') {
              const dm = data.displayDump.match(/(logicalDensityDpi|densityDpi)=(\d+)/i);
              if (dm && dm[2]) {
                const d = Number(dm[2]);
                if (!Number.isNaN(d) && d > 0) {
                  setSpecValue(displayDensityEl, `${d} dpi (logical)`);
                }
              }
            }
          }

          // Size fallback: approximate diagonal using logical density when physical size isn't available.
          if (displaySizeEl && (!displaySizeEl.textContent || displaySizeEl.textContent.trim() === 'Unknown')) {
            const densityText = displayDensityEl ? String(displayDensityEl.textContent || '') : '';
            const dm = densityText.match(/(\d+)\s*dpi/i);
            const dpi = dm ? Number(dm[1]) : NaN;
            if (screenW && screenH && !Number.isNaN(dpi) && dpi > 0) {
              const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
              const diagIn = diagPx / dpi;
              if (diagIn > 0.1 && diagIn < 20) {
                setSpecValue(displaySizeEl, `${diagIn.toFixed(1)} inches (approx)`);
              }
            }
          }

          // Platform section
          if (android) {
            setSpecValue(platformOsEl, patch ? `Android ${android} (patch ${patch})` : `Android ${android}`);
          }

          const chipsetPieces = [];
          if (soc) chipsetPieces.push(soc);
          if (board && (!soc || soc.indexOf(board) === -1)) chipsetPieces.push(board);
          if (chipsetPieces.length) {
            setSpecValue(platformChipsetEl, chipsetPieces.join(' · '));
          }

          const cpuText = abiList || abi;
          function cpuFromCpuInfo(raw) {
            const text = typeof raw === 'string' ? raw : '';
            if (!text.trim()) return '';
            const lines = text.split(/\r?\n/);
            function find(prefix) {
              for (const line of lines) {
                const m = line.match(new RegExp('^' + prefix + '\\s*:\\s*(.+)$', 'i'));
                if (m && m[1]) return String(m[1]).trim();
              }
              return '';
            }
            return find('Hardware') || find('model name') || find('Processor') || '';
          }

          const cpuHuman = cpuFromCpuInfo(data.cpuInfoDump);
          const cpuFinal = cpuHuman || cpuText;
          if (cpuFinal) {
            setSpecValue(platformCpuEl, cpuFinal);
          }

          // Memory section
          if (ramText) {
            setSpecValue(memoryRamEl, ramText);
          }
          if (storageText) {
            setSpecValue(memoryInternalEl, storageText);
          }

          // Battery section
          if (batteryTech) {
            setSpecValue(batteryTypeEl, batteryTech);
          } else if (typeof data.batteryDump === 'string') {
            const tm = data.batteryDump.match(/technology:\s*(.+)/i);
            if (tm && tm[1]) {
              setSpecValue(batteryTypeEl, tm[1].trim());
            }
          }

          // Misc section
          const modelLabel = [manufacturer, model].filter(Boolean).join(' ');
          if (modelLabel) {
            setSpecValue(miscModelEl, modelLabel);
          }
          if (board) {
            setSpecValue(miscBoardEl, board);
          }
          if (manufacturer) {
            setSpecValue(miscManufacturerEl, manufacturer);
          }
          if (deviceCode) {
            setSpecValue(miscDeviceCodeEl, deviceCode);
          }

          // Hide only the fields the user requested when Unknown.
          hideSpecRowIfUnknown(platformOsEl);
          hideSpecRowIfUnknown(platformChipsetEl);
          hideSpecRowIfUnknown(miscModelEl);
          hideSpecRowIfUnknown(miscBoardEl);
          hideSpecRowIfUnknown(miscManufacturerEl);
          hideSpecRowIfUnknown(miscDeviceCodeEl);
        }
      });
    });

    container.querySelectorAll('.apps').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const outEl = document.getElementById(`out-${id}`);
        if (outEl) {
          outEl.textContent = 'Scanning installed apps for risk...';
        }

        const res = await fetch(`http://localhost:3333/apps/${id}`);
        const data = await res.json();

        const apps = Array.isArray(data.apps) ? data.apps : [];
        const riskByPkg = data.riskByPkg || {};
        const riskScoreByPkg = data.riskScoreByPkg || {};
        const permsByPkg = data.permsByPkg || {};

        let safeCount = 0;
        let moderateCount = 0;
        let riskyCount = 0;

        const lines = [];
        let index = 1;

        for (const app of apps) {
          const pkgName = app.packageName || '';
          const raw = app.raw || '';

          let risk = pkgName && riskByPkg[pkgName] ? riskByPkg[pkgName] : '';

          if (risk === 'unknown' && pkgName && permsByPkg[pkgName]) {
            const perms = permsByPkg[pkgName] || [];
            const upper = perms.map(p => p.toUpperCase());

            const RISKY_PERMISSIONS = [
              'BIND_ACCESSIBILITY_SERVICE',
              'RECEIVE_SMS',
              'READ_SMS',
              'READ_CALL_LOG',
              'WRITE_SETTINGS',
              'SYSTEM_ALERT_WINDOW',
              'DEVICE_ADMIN',
            ];

            const MODERATE_PERMISSIONS = [
              'READ_CONTACTS',
              'WRITE_CONTACTS',
              'GET_ACCOUNTS',
              'ACCESS_FINE_LOCATION',
              'ACCESS_COARSE_LOCATION',
              'RECORD_AUDIO',
              'CAMERA',
              'READ_CALL_LOG',
              'WRITE_CALL_LOG',
              'READ_PHONE_STATE',
              'CALL_PHONE',
              'READ_EXTERNAL_STORAGE',
              'WRITE_EXTERNAL_STORAGE',
              'MANAGE_EXTERNAL_STORAGE',
            ];

            const hasRisky = upper.some(p => RISKY_PERMISSIONS.some(r => p.indexOf(r) !== -1));
            const hasModerate = upper.some(p => MODERATE_PERMISSIONS.some(m => p.indexOf(m) !== -1));

            if (hasRisky) {
              risk = 'risky';
            } else if (hasModerate) {
              risk = 'moderate';
            } else {
              risk = 'safe';
            }
          }

          if (!risk) {
            risk = 'safe';
          }

          const score = pkgName && typeof riskScoreByPkg[pkgName] === 'number' ? riskScoreByPkg[pkgName] : 0;

          if (risk === 'safe') safeCount += 1;
          else if (risk === 'moderate') moderateCount += 1;
          else if (risk === 'risky') riskyCount += 1;

          const label =
            risk === 'safe'
              ? 'SAFE'
              : risk === 'moderate'
                ? 'MODERATE'
                : 'RISKY';

          let displayName = '(unknown app)';
          let sourceName = pkgName;

          if (!sourceName && raw) {
            const eqIdx = raw.lastIndexOf('=');
            if (eqIdx !== -1 && eqIdx + 1 < raw.length) {
              sourceName = raw.substring(eqIdx + 1);
            }
          }

          if (!sourceName && app.path) {
            const slashIdx = app.path.lastIndexOf('/');
            if (slashIdx !== -1 && slashIdx + 1 < app.path.length) {
              sourceName = app.path.substring(slashIdx + 1);
            }
          }

          if (sourceName && typeof sourceName === 'string') {
    const parts = sourceName.split('.');
    const last = parts[parts.length - 1] || sourceName;
    displayName = last.replace(/[_-]+/g, ' ');
    displayName = displayName.replace(/\b\w/g, function(c) {
        return c.toUpperCase();
    });
}

          const scoreText = score ? ` ${score}/100` : '';
          lines.push(index + '. ' + displayName + ' - ' + label + scoreText);
          index += 1;
        }

        const summary = `Summary: ${riskyCount} risky, ${moderateCount} moderate, ${safeCount} safe apps.`;

        const findingsText = Array.isArray(data.findings)
          ? `\n\nDetails:\n${JSON.stringify(data.findings, null, 2)}`
          : '';

        document.getElementById(`out-${id}`).textContent = `${summary}\n\nPer-app risk:\n${lines.join(
          '\n',
        )}${findingsText}`;
      });
    });

    container.querySelectorAll('.app-risk').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const pkg = prompt('Enter exact package name to check (e.g. com.example.app):');
        if (!pkg) return;
        try {
          const res = await fetch(`http://localhost:3333/app-risk/${id}/${encodeURIComponent(pkg)}`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          const risk = data.risk || 'unknown';
          const label =
            risk === 'safe'
              ? 'SAFE'
              : risk === 'moderate'
                ? 'MODERATE'
                : risk === 'dangerous'
                  ? 'DANGEROUS'
                  : 'UNKNOWN';

          const detailsLines = [];
          if (Array.isArray(data.riskyPermissions) && data.riskyPermissions.length) {
            detailsLines.push('Risky permissions: ' + data.riskyPermissions.join(', '));
          }
          if (Array.isArray(data.moderatePermissions) && data.moderatePermissions.length) {
            detailsLines.push('Sensitive permissions: ' + data.moderatePermissions.join(', '));
          }

          const detailsText = detailsLines.length ? `\n${detailsLines.join('\n')}` : '';

          document.getElementById(`out-${id}`).textContent = `App ${data.packageName || pkg} is ${label}.${detailsText}`;
        } catch (err) {
          console.error('Failed to check app risk:', err);
          document.getElementById(`out-${id}`).textContent = 'Failed to check app risk. ' + err;
        }
      });
    });
  } catch (err) {
    console.error('Failed to load devices:', err);
    const msg = err && err.message ? err.message : 'Unknown error';
    const container = document.getElementById('devices');
    container.innerHTML = `<div class="status-banner error"><div class="status-icon">!</div><div><strong>Could not load devices from backend</strong><br/>${msg}.<br/>Verify that the companion service is running on <strong>http://localhost:3333</strong> and that <code>adb</code> is installed and available on PATH.</div></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh').addEventListener('click', refresh);
  refresh();
});
