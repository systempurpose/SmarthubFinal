// js/storageAnalysis.js
(function() {
    'use strict';

    // ===== HELPERS =====
    function formatSize(bytes) {
        if (!bytes || bytes === '0') return '0 B';
        const num = parseFloat(bytes);
        if (isNaN(num)) return String(bytes);
        if (num >= 1024 * 1024 * 1024) return (num / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        if (num >= 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + ' MB';
        if (num >= 1024) return (num / 1024).toFixed(1) + ' KB';
        return num + ' B';
    }

    function parseSize(str) {
        if (!str || str === '?') return 0;
        const trimmed = String(str).trim();
        const match = trimmed.match(/^([\d.]+)\s*([GMK]?)/i);
        if (!match) return 0;
        let val = parseFloat(match[1]);
        const unit = (match[2] || '').toUpperCase();
        if (unit === 'G') return val * 1024 * 1024 * 1024;
        if (unit === 'M') return val * 1024 * 1024;
        if (unit === 'K') return val * 1024;
        return val;
    }

    function getDeviceId() {
        return typeof currentDeviceId !== 'undefined' ? currentDeviceId : null;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function getFileIcon(path) {
        const ext = path.split('.').pop().toLowerCase();
        const icons = {
            'apk': '📦', 'zip': '📦', 'rar': '📦', '7z': '📦', 'gz': '📦',
            'mp4': '🎬', 'mkv': '🎬', 'avi': '🎬', 'mov': '🎬', 'webm': '🎬',
            'mp3': '🎵', 'flac': '🎵', 'wav': '🎵', 'aac': '🎵', 'm4a': '🎵',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'heic': '🖼️',
            'pdf': '📄', 'doc': '📄', 'docx': '📄', 'xls': '📄', 'xlsx': '📄',
            'ppt': '📄', 'pptx': '📄', 'txt': '📄', 'json': '📄', 'xml': '📄',
            'rpa': '🎮', 'obb': '🎮', 'bin': '💾'
        };
        return icons[ext] || '📁';
    }

    function getSizeColor(bytes) {
        if (bytes >= 1024 * 1024 * 1024) return '#dc2626';
        if (bytes >= 500 * 1024 * 1024) return '#f59e0b';
        return '#6b7280';
    }

    async function runAdb(command) {
        const deviceId = getDeviceId();
        if (!deviceId) throw new Error('No device connected');
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: deviceId, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        const data = await resp.json();
        return data.output;
    }

    async function fetchLargeFiles(deviceId) {
        const baseUrl = window.BACKEND_URL || '';
        const patterns = [
            `${baseUrl}/api/large-files?deviceId=${encodeURIComponent(deviceId)}`,
            `${baseUrl}/large-files?deviceId=${encodeURIComponent(deviceId)}`,
            `${baseUrl}/api/storage/large-files?deviceId=${encodeURIComponent(deviceId)}`,
            `${baseUrl}/storage/large-files?deviceId=${encodeURIComponent(deviceId)}`,
        ];

        let lastError = null;
        for (const url of patterns) {
            console.log('[StorageAnalysis] Trying URL:', url);
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 300000);
                const resp = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (resp.ok) {
                    const data = await resp.json();
                    console.log('[StorageAnalysis] Success with URL:', url);
                    return data;
                }
                lastError = `HTTP ${resp.status}: ${resp.statusText}`;
                console.warn('[StorageAnalysis] Failed with URL:', url, lastError);
            } catch (err) {
                lastError = err.message;
                console.warn('[StorageAnalysis] Error with URL:', url, err.message);
            }
        }
        throw new Error(`All attempts failed. Last error: ${lastError}`);
    }

    // ===== DELETE / UNINSTALL HANDLERS =====
    async function deleteFile(path) {
        const confirmed = await (window.showConfirm || confirm)(
            'Delete File',
            `Are you sure you want to delete this file?\n\n${path}`,
            { icon: '🗑️', danger: true, yesText: 'Delete', isPath: true }
        );
        if (!confirmed) return false;
        try {
            const resp = await fetch(`${window.BACKEND_URL || ''}/api/delete-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: getDeviceId(), filePath: path })
            });
            const data = await resp.json();
            if (resp.ok) return true;
            await (window.showAlert || alert)('Error', `Failed to delete: ${data.error || 'Unknown error'}`);
            return false;
        } catch (err) {
            await (window.showAlert || alert)('Error', `Error: ${err.message}`);
            return false;
        }
    }

    async function uninstallApp(packageName) {
        const confirmed = await (window.showConfirm || confirm)(
            'Uninstall App',
            `Are you sure you want to uninstall this app?\n\n📱 ${packageName}`,
            { icon: '🗑️', danger: true, yesText: 'Uninstall', isPath: false }
        );
        if (!confirmed) return false;
        try {
            const resp = await fetch(`${window.BACKEND_URL || ''}/api/uninstall-package`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: getDeviceId(), packageName })
            });
            const data = await resp.json();
            if (resp.ok) return true;
            await (window.showAlert || alert)('Error', `Failed to uninstall: ${data.error || 'Unknown error'}`);
            return false;
        } catch (err) {
            await (window.showAlert || alert)('Error', `Error: ${err.message}`);
            return false;
        }
    }

    window._handleDelete = async function(path, button) {
        button.disabled = true;
        button.textContent = '⏳';
        const success = await deleteFile(path);
        if (success) removeItemFromList(path);
        else {
            button.disabled = false;
            button.textContent = '🗑️ Delete';
        }
    };

    window._handleUninstall = async function(packageName, button) {
        button.disabled = true;
        button.textContent = '⏳';
        const success = await uninstallApp(packageName);
        if (success) removeItemFromList('package:' + packageName);
        else {
            button.disabled = false;
            button.textContent = '🗑️ Uninstall';
        }
    };

    function removeItemFromList(path) {
        const itemEl = document.querySelector(`.storage-item[data-path="${CSS.escape(path)}"]`);
        if (itemEl) itemEl.remove();
        updateStats();
        const deviceId = getDeviceId();
        if (deviceId) updateStorageSummary(deviceId);
    }

    function updateStats() {
        const items = document.querySelectorAll('.storage-item');
        const totalSpan = document.querySelector('.large-total');
        const countSpan = document.querySelector('.large-count');
        if (totalSpan) {
            let totalBytes = 0;
            items.forEach(el => {
                const bytes = parseInt(el.dataset.bytes, 10);
                if (!isNaN(bytes)) totalBytes += bytes;
            });
            totalSpan.textContent = formatSize(totalBytes);
        }
        if (countSpan) countSpan.textContent = items.length;
    }

    async function updateStorageSummary(deviceId) {
        try {
            const resp = await fetch(`${window.BACKEND_URL || ''}/api/hardware/storage?deviceId=${encodeURIComponent(deviceId)}`);
            if (!resp.ok) return;
            const storage = await resp.json();
            const totalBytes = parseSize(storage.total);
            const usedBytes = parseSize(storage.used);
            const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
            const warningColor = percent > 90 ? '#dc2626' : percent > 75 ? '#f59e0b' : '#22c55e';
            const warningText = percent > 90 ? '⚠️ Storage is nearly full!' : percent > 75 ? '⚠️ Storage is getting full' : '✅ Storage is healthy';

            const summaryEl = document.getElementById('storage-summary');
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 15px; flex-wrap: wrap; gap: 8px;">
                        <span><strong>💾 Storage</strong> <span style="color: #1f2937;">${formatSize(usedBytes)}</span> / <span style="color: #6b7280;">${formatSize(totalBytes)}</span></span>
                        <span style="color: ${warningColor}; font-weight: 600;">${percent.toFixed(1)}% used</span>
                    </div>
                    <div style="margin-top: 8px; background: #e5e7eb; border-radius: 8px; height: 6px; overflow: hidden;">
                        <div style="width: ${Math.min(percent, 100)}%; background: ${warningColor}; height: 100%; border-radius: 8px;"></div>
                    </div>
                    <div style="margin-top: 6px; font-size: 13px; color: ${warningColor};">${warningText}</div>
                `;
            }
        } catch (e) { /* ignore */ }
    }

    // ===== MAIN SCAN FUNCTION =====
    window.runStorageAnalysis = async function() {
        const deviceId = getDeviceId();
        if (!deviceId) {
            if (window.showAlert) {
                await window.showAlert('No Device', 'Please connect a device first.');
            } else {
                alert('Please connect a device first.');
            }
            return;
        }

        // Launch Android storage page
        try {
            await runAdb('am start -n com.smarthub.diagnostics/.StorageAnalysisActivity');
            console.log('[StorageAnalysis] Android activity launched');
        } catch (e) {
            console.warn('[StorageAnalysis] Could not launch Android activity:', e);
        }

        // Create modal
        let modal = document.getElementById('storageAnalysisModal');
        if (!modal) {
            const modalHTML = `
                <div id="storageAnalysisModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="storageAnalysisTitle" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">💾 Storage Analysis</h3>
                            <span class="close-button" id="closeStorageModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="storageAnalysisBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="closeStorageModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('storageAnalysisModal');
        }

        document.getElementById('closeStorageModal').addEventListener('click', () => { modal.style.display = 'none'; renderDashboard(); });
        document.getElementById('closeStorageModalBtn').addEventListener('click', () => { modal.style.display = 'none'; renderDashboard(); });

        modal.style.display = 'flex';
        const bodyEl = document.getElementById('storageAnalysisBody');
        const titleEl = document.getElementById('storageAnalysisTitle');
        titleEl.textContent = '💾 Storage Analysis';
        bodyEl.innerHTML = window.getModernSpinnerHTML('Scanning for large files... This may take 2-3 minutes.');

        let scanStillRunning = true;
        const timeoutId = setTimeout(() => {
            if (scanStillRunning) {
                bodyEl.innerHTML = window.getModernSpinnerHTML('Still scanning... This may take a while.');
            }
        }, 30000);

        try {
            // Fetch storage summary
            let storage = { total: '0', used: '0', free: '0' };
            try {
                const resp = await fetch(`${window.BACKEND_URL || ''}/api/hardware/storage?deviceId=${encodeURIComponent(deviceId)}`);
                if (resp.ok) storage = await resp.json();
                console.log('[StorageAnalysis] Storage data:', storage);
            } catch (err) {
                console.warn('[StorageAnalysis] Storage API failed:', err);
            }

            // Fetch large files
            let largeFiles = { files: [] };
            try {
                largeFiles = await fetchLargeFiles(deviceId);
                console.log('[StorageAnalysis] Large files found:', largeFiles.files.length);
            } catch (err) {
                console.warn('[StorageAnalysis] Large files fetch failed:', err);
                bodyEl.innerHTML = `
                    <div style="color: #d32f2d; padding: 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                        <strong>Scan Failed</strong>
                        <p>${escapeHtml(err.message)}</p>
                        <button id="retryStorageScan" class="btn-primary" style="padding: 8px 24px; font-size: 14px;">🔄 Retry</button>
                    </div>
                `;
                document.getElementById('retryStorageScan')?.addEventListener('click', window.runStorageAnalysis);
                scanStillRunning = false;
                clearTimeout(timeoutId);
                return;
            }

            const totalBytes = parseSize(storage.total);
            const usedBytes = parseSize(storage.used);
            const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

            const files = (largeFiles.files || []).sort((a, b) => (b.bytes || 0) - (a.bytes || 0));

            // Save results
            const results = {
                files: files.map(f => ({
                    name: f.name || f.path || 'Unnamed',
                    path: f.path,
                    bytes: f.bytes,
                    size: f.size || formatSize(f.bytes)
                })),
                scanTime: new Date().toLocaleString(),
                storageUsed: formatSize(usedBytes),
                storageTotal: formatSize(totalBytes),
                percentUsed: percent
            };
            if (typeof saveStorageResults === 'function') {
                saveStorageResults(results);
            } else {
                localStorage.setItem('smartHubStorageResults', JSON.stringify(results));
            }

            scanStillRunning = false;
            clearTimeout(timeoutId);
            modal.style.display = 'none';
            renderDashboard();

        } catch (err) {
            console.error('[StorageAnalysis] Unexpected error:', err);
            scanStillRunning = false;
            clearTimeout(timeoutId);
            bodyEl.innerHTML = `
                <div style="color: #d32f2d; padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                    <strong>Unexpected Error</strong>
                    <p>${escapeHtml(err.message)}</p>
                    <button id="retryStorageScan" class="btn-primary" style="padding: 8px 24px; font-size: 14px;">🔄 Retry</button>
                </div>
            `;
            document.getElementById('retryStorageScan')?.addEventListener('click', window.runStorageAnalysis);
        }
    };

    // ===== EXPOSE HELPERS FOR GLOBAL USE =====
    window.formatSize = formatSize;
    window.getFileIcon = getFileIcon;
    window.getSizeColor = getSizeColor;
    window.parseSize = parseSize;

})();
