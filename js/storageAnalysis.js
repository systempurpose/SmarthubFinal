// js/storageAnalysis.js
(function() {
    'use strict';

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
            'apk': '📦',
            'zip': '📦',
            'rar': '📦',
            '7z': '📦',
            'gz': '📦',
            'mp4': '🎬',
            'mkv': '🎬',
            'avi': '🎬',
            'mov': '🎬',
            'webm': '🎬',
            'mp3': '🎵',
            'flac': '🎵',
            'wav': '🎵',
            'aac': '🎵',
            'm4a': '🎵',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'heic': '🖼️',
            'pdf': '📄',
            'doc': '📄',
            'docx': '📄',
            'xls': '📄',
            'xlsx': '📄',
            'ppt': '📄',
            'pptx': '📄',
            'txt': '📄',
            'json': '📄',
            'xml': '📄',
            'rpa': '🎮',
            'obb': '🎮',
            'bin': '💾'
        };
        return icons[ext] || '📁';
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
                const resp = await fetch(url, { signal: AbortSignal.timeout(300000) });
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

    function showErrorModal(message, retryCallback) {
        const modalBody = document.getElementById('storageAnalysisBody');
        if (!modalBody) return;
        modalBody.innerHTML = `
            <div style="color: #d32f2d; padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                <strong style="font-size: 16px;">${escapeHtml(message)}</strong>
                <br><br>
                <span style="font-size: 13px; color: #666;">The scan may have timed out or the device is slow.</span>
                <br><br>
                <button id="retryStorageScan" class="btn-primary" style="padding: 8px 24px; font-size: 14px;">
                    🔄 Retry Scan
                </button>
            </div>
        `;
        document.getElementById('retryStorageScan')?.addEventListener('click', retryCallback);
    }

    // ---- Delete file with button state management ----
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
            if (resp.ok) {
                return true;
            } else {
                await (window.showAlert || alert)('Error', `Failed to delete: ${data.error || 'Unknown error'}`);
                return false;
            }
        } catch (err) {
            await (window.showAlert || alert)('Error', `Error: ${err.message}`);
            return false;
        }
    }

    // ---- Uninstall app with button state management ----
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
            if (resp.ok) {
                return true;
            } else {
                await (window.showAlert || alert)('Error', `Failed to uninstall: ${data.error || 'Unknown error'}`);
                return false;
            }
        } catch (err) {
            await (window.showAlert || alert)('Error', `Error: ${err.message}`);
            return false;
        }
    }

    // ---- Handlers for delete/uninstall buttons ----
    window._handleDelete = async function(path, button) {
        // Disable button to prevent double-click
        button.disabled = true;
        button.textContent = '⏳';
        button.style.opacity = '0.5';
        const success = await deleteFile(path);
        if (success) {
            // Remove from DOM and update stats
            removeItemFromList(path);
        } else {
            // Re-enable button if cancelled or failed
            button.disabled = false;
            button.textContent = '🗑️ Delete';
            button.style.opacity = '1';
        }
    };

    window._handleUninstall = async function(packageName, button) {
        button.disabled = true;
        button.textContent = '⏳';
        button.style.opacity = '0.5';
        const success = await uninstallApp(packageName);
        if (success) {
            // The path is "package:" + packageName for removal
            removeItemFromList('package:' + packageName);
        } else {
            button.disabled = false;
            button.textContent = '🗑️ Uninstall';
            button.style.opacity = '1';
        }
    };

    // ---- Update storage summary from API ----
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
        } catch (e) {
            console.warn('[StorageAnalysis] Failed to update storage summary:', e);
        }
    }

    // ---- Update stats (count & total) from remaining items ----
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

    function removeItemFromList(path) {
        const itemEl = document.querySelector(`.storage-item[data-path="${CSS.escape(path)}"]`);
        if (itemEl) {
            const fadeOut = itemEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
            fadeOut.onfinish = () => {
                itemEl.remove();
                updateStats();
                const deviceId = getDeviceId();
                if (deviceId) updateStorageSummary(deviceId);
            };
        }
    }

    function getSizeColor(bytes) {
        if (bytes >= 1024 * 1024 * 1024) return '#dc2626';
        if (bytes >= 500 * 1024 * 1024) return '#f59e0b';
        return '#6b7280';
    }

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

       try {
    await runAdb('am start -n com.smarthub.diagnostics/.StorageAnalysisActivity');
    console.log('[StorageAnalysis] Android activity launched');
} catch (e) {
    console.warn('[StorageAnalysis] Could not launch Android activity:', e);
}

        let modal = document.getElementById('storageAnalysisModal');
        if (!modal) {
            const modalHTML = `
                <div id="storageAnalysisModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
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
            document.getElementById('closeStorageModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeStorageModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }

        modal.style.display = 'flex';
        const modalBody = document.getElementById('storageAnalysisBody');
        const modalTitle = document.getElementById('storageAnalysisTitle');
        modalTitle.textContent = '💾 Storage Analysis – Large Files';
        modalBody.innerHTML = window.getModernSpinnerHTML ? window.getModernSpinnerHTML('Scanning for large files... This may take 2-3 minutes.') : '<div>Loading...</div>';

        try {
            let storage = { total: '0', used: '0', free: '0' };
            try {
                const resp = await fetch(`${window.BACKEND_URL || ''}/api/hardware/storage?deviceId=${encodeURIComponent(deviceId)}`);
                if (resp.ok) storage = await resp.json();
                console.log('[StorageAnalysis] Storage data:', storage);
            } catch (err) {
                console.warn('[StorageAnalysis] Storage API failed:', err);
            }

            let largeFiles = { files: [] };
            let scanError = null;
            try {
                largeFiles = await fetchLargeFiles(deviceId);
                console.log('[StorageAnalysis] Large files found:', largeFiles.files.length);
                if (largeFiles.error) {
                    scanError = largeFiles.error;
                }
            } catch (err) {
                scanError = err.message;
                console.warn('[StorageAnalysis] Large files fetch failed:', err);
            }

            if (scanError) {
                showErrorModal(scanError, window.runStorageAnalysis);
                return;
            }

            const totalBytes = parseSize(storage.total);
            const usedBytes = parseSize(storage.used);
            const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

            const files = (largeFiles.files || []).sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
            const largeTotal = files.reduce((sum, f) => sum + (f.bytes || 0), 0);

            const warningColor = percent > 90 ? '#dc2626' : percent > 75 ? '#f59e0b' : '#22c55e';
            const warningText = percent > 90 ? '⚠️ Storage is nearly full!' : percent > 75 ? '⚠️ Storage is getting full' : '✅ Storage is healthy';

            let html = `
                <div id="storage-summary" style="margin-bottom: 20px; padding: 16px 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 15px; flex-wrap: wrap; gap: 8px;">
                        <span><strong>💾 Storage</strong> <span style="color: #1f2937;">${formatSize(usedBytes)}</span> / <span style="color: #6b7280;">${formatSize(totalBytes)}</span></span>
                        <span style="color: ${warningColor}; font-weight: 600;">${percent.toFixed(1)}% used</span>
                    </div>
                    <div style="margin-top: 8px; background: #e5e7eb; border-radius: 8px; height: 6px; overflow: hidden;">
                        <div style="width: ${Math.min(percent, 100)}%; background: ${warningColor}; height: 100%; border-radius: 8px;"></div>
                    </div>
                    <div style="margin-top: 6px; font-size: 13px; color: ${warningColor};">${warningText}</div>
                    <div style="margin-top: 8px; font-size: 13px; color: #6b7280;">
                        <strong>📁 Large files (≥500 MB):</strong> <span class="large-count">${files.length}</span> files, <span class="large-total">${formatSize(largeTotal)}</span>
                    </div>
                </div>
            `;

            if (files.length === 0) {
                html += `<div style="padding: 40px 20px; text-align: center; color: #22c55e; font-size: 16px;">✅ No files larger than 500 MB found.</div>`;
                modalBody.innerHTML = html;
                return;
            }

            const categories = {
                'DCIM': { label: '📸 Camera (DCIM)', files: [] },
                'Movies': { label: '🎬 Movies', files: [] },
                'Music': { label: '🎵 Music', files: [] },
                'Pictures': { label: '🖼️ Pictures', files: [] },
                'Download': { label: '📥 Downloads', files: [] },
                'Android/obb': { label: '🎮 Game OBB', files: [] },
                'Android/data': { label: '📂 App Data (Games)', files: [] },
                'Documents': { label: '📄 Documents', files: [] },
                'Other': { label: '📦 Other', files: [] }
            };

            files.forEach(file => {
                const path = file.path || '';
                let category = 'Other';
                if (path.includes('/DCIM/')) category = 'DCIM';
                else if (path.includes('/Movies/')) category = 'Movies';
                else if (path.includes('/Music/')) category = 'Music';
                else if (path.includes('/Pictures/')) category = 'Pictures';
                else if (path.includes('/Download/')) category = 'Download';
                else if (path.includes('/Android/obb/')) category = 'Android/obb';
                else if (path.includes('/Android/data/')) category = 'Android/data';
                else if (path.includes('/Documents/')) category = 'Documents';
                categories[category].files.push(file);
            });

            let categoryHtml = '';
            for (const [key, cat] of Object.entries(categories)) {
                if (cat.files.length === 0) continue;
                const catSize = cat.files.reduce((sum, f) => sum + (f.bytes || 0), 0);
                categoryHtml += `
                    <div style="margin-top: 12px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #ffffff;">
                        <div style="background: #f8fafc; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; border-bottom: 1px solid #e5e7eb;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                            <span><strong>${cat.label}</strong> (${cat.files.length} files)</span>
                            <span style="color: #6b7280; font-size: 14px;">${formatSize(catSize)}</span>
                        </div>
                        <div style="padding: 6px 12px; display: block; max-height: 260px; overflow-y: auto;">
                            ${cat.files.map(file => {
                                const path = file.path || '';
                                const name = file.name || path || 'Unnamed';
                                const size = file.size || formatSize(file.bytes);
                                const isApp = path.startsWith('package:');
                                const displayPath = isApp ? path.replace('package:', '') : path;
                                const buttonLabel = isApp ? '🗑️ Uninstall' : '🗑️ Delete';
                                const icon = isApp ? '📱' : getFileIcon(path);
                                const sizeColor = getSizeColor(file.bytes || 0);
                                // Use the new handlers
                                const onClick = isApp
                                    ? `window._handleUninstall('${escapeHtml(displayPath)}', this)`
                                    : `window._handleDelete('${escapeHtml(path)}', this)`;
                                return `
                                    <div class="storage-item" data-path="${escapeHtml(path)}" data-bytes="${file.bytes || 0}" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-bottom: 1px solid #f1f3f5; font-size: 13px; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                        <span style="display: flex; align-items: center; gap: 8px; word-break: break-all; flex: 1; margin-right: 12px;">
                                            <span style="font-size: 16px;">${icon}</span>
                                            <span style="color: #1f2937;">${escapeHtml(name)}</span>
                                        </span>
                                        <span style="white-space: nowrap; margin-right: 12px; color: ${sizeColor}; font-weight: 500;">${escapeHtml(size)}</span>
                                        <button onclick="${onClick}" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 4px 14px; font-size: 11px; cursor: pointer; transition: background 0.15s ease; flex-shrink: 0;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">${buttonLabel}</button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            html += categoryHtml;
            modalBody.innerHTML = html;

        } catch (err) {
            console.error('[StorageAnalysis] Unexpected error:', err);
            showErrorModal(err.message || 'Unknown error occurred.', window.runStorageAnalysis);
        }
    };
})();