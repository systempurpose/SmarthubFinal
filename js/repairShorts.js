// js/repairShorts.js
import { loadVideoFeed } from './videoLoader.js';
import { uploadVideo } from './videoUpload.js';

const repairTips = [
    // ... (existing tips as before)
];

let likedTips = new Set();

export function renderRepairShorts() {
    const container = document.getElementById('pageContent');
    if (!container) {
        console.warn('pageContent not found');
        return;
    }

    let html = `
        <div style="max-width: 600px; margin: 0 auto; padding: 16px 12px 80px;">
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #1e293b;">🔧 Repair Shorts</h2>
            <p style="color: #6B7280; font-size: 14px; margin-top: 0; margin-bottom: 12px;">Quick tips and repair videos</p>

            <!-- Upload button -->
            <div style="margin-bottom: 20px;">
                <button id="uploadVideoBtn" class="btn-primary" style="
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 10px 20px; border-radius: 10px; font-weight: 600;
                ">
                    <i class="fas fa-upload"></i> Upload Repair Video
                </button>
                <input type="file" id="videoFileInput" accept="video/*" style="display:none;">
                <div id="uploadProgress" style="margin-top: 8px; display:none; color: #0d6efd;">Uploading...</div>
            </div>

            <!-- Video Feed -->
            <div id="videoFeed"></div>

            <!-- Tips (existing) -->
            <div id="tipsContainer" style="margin-top: 20px;"></div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Render tips ----
    const tipsContainer = document.getElementById('tipsContainer');
    let tipsHtml = '';
    for (const tip of repairTips) {
        const liked = likedTips.has(tip.id);
        tipsHtml += `
            <div class="repair-card" data-id="${tip.id}" style="
                background: white;
                border-radius: 16px;
                padding: 18px 20px 14px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                border: 1px solid #f1f3f5;
                margin-bottom: 16px;
            ">
                <!-- ... (same card content as before) ... -->
                <div style="display: flex; align-items: flex-start; gap: 14px;">
                    <div style="
                        width: 44px;
                        height: 44px;
                        border-radius: 12px;
                        background: #eff6ff;
                        color: #0d6efd;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 22px;
                        flex-shrink: 0;
                    ">
                        <i class="fas ${tip.icon}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h3 style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1e293b;">${tip.title}</h3>
                        <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.5;">${tip.description}</p>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px; border-top: 1px solid #f1f3f5; padding-top: 10px;">
                    <button class="like-btn" data-id="${tip.id}" style="
                        background: none;
                        border: none;
                        font-size: 18px;
                        cursor: pointer;
                        color: ${liked ? '#dc2626' : '#9ca3af'};
                        transition: color 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        <i class="fas fa-heart"></i> <span class="like-count" style="font-size: 14px; color: #6B7280;">${liked ? 1 : 0}</span>
                    </button>
                    <button class="share-btn" data-id="${tip.id}" style="
                        background: none;
                        border: none;
                        font-size: 16px;
                        color: #9ca3af;
                        cursor: pointer;
                        transition: color 0.2s;
                    ">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }
    tipsContainer.innerHTML = tipsHtml;

    // ---- Attach event listeners for tips ----
    tipsContainer.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // ... like logic (same as before) ...
        });
    });
    tipsContainer.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // ... share logic (same as before) ...
        });
    });

    // ---- Video upload handler ----
    const uploadBtn = document.getElementById('uploadVideoBtn');
    const fileInput = document.getElementById('videoFileInput');
    const progressDiv = document.getElementById('uploadProgress');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            progressDiv.style.display = 'block';
            progressDiv.textContent = 'Compressing and uploading...';
            const result = await uploadVideo(file);
            progressDiv.textContent = '✅ Upload complete!';
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 3000);
            // Refresh the video feed
            await loadVideoFeed('videoFeed');
        } catch (err) {
            progressDiv.style.color = '#dc2626';
            progressDiv.textContent = '❌ ' + err.message;
        } finally {
            fileInput.value = '';
        }
    });

    // ---- Load initial video feed ----
    loadVideoFeed('videoFeed');
}

// Expose globally
window.renderRepairShorts = renderRepairShorts;