// js/repairShorts.js

const repairTips = [
    { id: 1, title: "Screen won't turn on?", description: "Press and hold Power + Volume Down for 10 seconds to force a hard reset.", icon: "fa-mobile-screen" },
    { id: 2, title: "Battery draining fast?", description: "Check Settings → Battery → App usage. Uninstall or restrict background activity for heavy apps.", icon: "fa-battery-three-quarters" },
    { id: 3, title: "Phone overheating?", description: "Remove the case, close unused apps, and avoid direct sunlight. If persists, check for malware.", icon: "fa-temperature-high" },
    { id: 4, title: "WiFi keeps disconnecting?", description: "Forget the network, restart your phone and router, then reconnect. Also try resetting network settings.", icon: "fa-wifi" },
    { id: 5, title: "Can't hear calls?", description: "Check if the speaker is blocked. Use a soft brush to clean the earpiece. Test with a Bluetooth headset.", icon: "fa-volume-up" },
    { id: 6, title: "Apps crashing often?", description: "Clear the app cache: Settings → Apps → [App] → Storage → Clear Cache. If that fails, reinstall the app.", icon: "fa-triangle-exclamation" },
];

let likedTips = new Set();

export function renderRepairShorts() {
    const container = document.getElementById('repairShortsContainer');
    if (!container) {
        console.warn('repairShortsContainer not found');
        return;
    }

    let html = `
        <div style="display: flex; flex-direction: column; gap: 16px; padding: 16px 12px 80px;">
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #1e293b;">🔧 Repair Shorts</h2>
            <p style="color: #6B7280; font-size: 14px; margin-top: 0; margin-bottom: 12px;">Quick tips to fix common phone issues</p>
    `;

    for (const tip of repairTips) {
        const liked = likedTips.has(tip.id);
        html += `
            <div class="repair-card" data-id="${tip.id}" style="
                background: white;
                border-radius: 16px;
                padding: 18px 20px 14px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                border: 1px solid #f1f3f5;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
            ">
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

    html += `</div>`;
    container.innerHTML = html;

    // ---- Attach event listeners ----
    container.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const tip = repairTips.find(t => t.id === id);
            if (!tip) return;
            const liked = likedTips.has(id);
            if (liked) {
                likedTips.delete(id);
            } else {
                likedTips.add(id);
            }
            const countSpan = btn.querySelector('.like-count');
            const heartIcon = btn.querySelector('i');
            if (liked) {
                countSpan.textContent = '0';
                btn.style.color = '#9ca3af';
                heartIcon.className = 'fas fa-heart';
            } else {
                countSpan.textContent = '1';
                btn.style.color = '#dc2626';
                heartIcon.className = 'fas fa-heart';
            }
        });
    });

    container.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            const tip = repairTips.find(t => t.id === id);
            if (!tip) return;
            const text = `🔧 ${tip.title}\n${tip.description}`;
            if (navigator.share) {
                navigator.share({ title: 'Repair Tip', text });
            } else {
                navigator.clipboard.writeText(text).then(() => {
                    alert('Tip copied to clipboard!');
                }).catch(() => {
                    prompt('Copy this tip:', text);
                });
            }
        });
    });
}

// Expose globally so ui.js can call it
window.renderRepairShorts = renderRepairShorts;