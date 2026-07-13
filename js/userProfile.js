// js/userProfile.js
import { getSupabaseClient } from './supabase.js';
import { saveUserProfile, fetchUserProfile as fetchProfileFromDB } from './user_profile_sb.js';
import { sendVerificationCode } from './emailVerification.js';   // <-- new import

let avatarFile = null;

async function getCurrentUser() {
    try {
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return session.user;
    } catch (err) {
        console.error('getSession failed:', err);
    }
    const stored = localStorage.getItem('smarthub.user');
    if (stored) try { return JSON.parse(stored); } catch {}
    return null;
}

export async function showProfilePage() {
    const user = await getCurrentUser();
    if (!user) {
        alert('Please log in first.');
        return;
    }
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('profile');
    } else {
        renderProfilePageContent(user);
    }
}

export async function renderProfilePageContent(user) {
    const container = document.getElementById('pageContent');
    if (!container) return;

    let profile = null;
    try {
        profile = await fetchProfileFromDB();
        console.log('📥 Fetched profile:', profile);
    } catch (err) {
        console.error('❌ Failed to fetch profile:', err);
    }

    const displayUser = {
        id: user.id,
        email: profile?.plainEmail || user.email,
        name: profile?.name || user.name || '',
        avatar_url: profile?.avatar_url || user.avatar_url || '',
        confirmed: profile?.confirmed ?? user.confirmed ?? false,
    };

    // Update sidebar with the loaded data
    updateSidebarUser(displayUser);
    renderProfileUI(displayUser);
}

// Injects the profile page's styles once per document.
function ensureProfileStyles() {
    if (document.getElementById('profilePageStyles')) return;
    const style = document.createElement('style');
    style.id = 'profilePageStyles';
    style.textContent = `
        .profile-page {
            --pp-ink: #0f172a;
            --pp-muted: #64748b;
            --pp-canvas: #f8fafc;
            --pp-border: #e2e8f0;
            --pp-accent: #0d9488;
            --pp-accent-hover: #0f766e;
            --pp-accent-tint: #ccfbf1;
            --pp-success-bg: #dcfce7;
            --pp-success-fg: #15803d;
            --pp-warn-bg: #fef3c7;
            --pp-warn-fg: #b45309;
            max-width: 520px;
            margin: 0 auto;
            color: var(--pp-ink);
        }
        .profile-page * { box-sizing: border-box; }
        .profile-page__header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 1.75rem;
        }
        .profile-page__back {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 600;
            color: var(--pp-muted);
            background: #fff;
            border: 1px solid var(--pp-border);
            border-radius: 999px;
            cursor: pointer;
            transition: border-color .15s ease, color .15s ease, background .15s ease;
        }
        .profile-page__back:hover {
            color: var(--pp-ink);
            border-color: #cbd5e1;
            background: var(--pp-canvas);
        }
        .profile-page__title {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.01em;
        }
        .profile-card {
            background: #fff;
            border: 1px solid var(--pp-border);
            border-radius: 16px;
            padding: 28px;
            display: flex;
            flex-direction: column;
            gap: 24px;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.08);
        }
        .profile-identity {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        .profile-avatar {
            position: relative;
            width: 84px;
            height: 84px;
            flex-shrink: 0;
        }
        .profile-avatar__ring {
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            border: 2px solid var(--pp-accent-tint);
            transition: border-color .2s ease;
        }
        .profile-avatar:hover .profile-avatar__ring {
            border-color: var(--pp-accent);
        }
        .profile-avatar img {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            object-fit: cover;
            background: #e2e8f0;
            display: block;
        }
        .profile-avatar__edit {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: var(--pp-accent);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            cursor: pointer;
            border: 2px solid #fff;
            transition: background .15s ease, transform .15s ease;
        }
        .profile-avatar__edit:hover {
            background: var(--pp-accent-hover);
            transform: scale(1.06);
        }
        .profile-identity__name {
            font-weight: 700;
            font-size: 19px;
            line-height: 1.3;
        }
        .profile-identity__email {
            font-size: 13.5px;
            color: var(--pp-muted);
            margin-top: 2px;
        }
        .profile-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .profile-field label {
            font-weight: 600;
            font-size: 12.5px;
            color: var(--pp-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .profile-field input {
            width: 100%;
            padding: 11px 14px;
            border: 1px solid var(--pp-border);
            border-radius: 10px;
            font-size: 14.5px;
            color: var(--pp-ink);
            background: #fff;
            transition: border-color .15s ease, box-shadow .15s ease;
        }
        .profile-field input:focus {
            outline: none;
            border-color: var(--pp-accent);
            box-shadow: 0 0 0 3px var(--pp-accent-tint);
        }
        .profile-field input[readonly] {
            background: var(--pp-canvas);
            color: var(--pp-muted);
            cursor: not-allowed;
        }
        .profile-status {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 13px 16px;
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 500;
        }
        .profile-status--ok {
            background: var(--pp-success-bg);
            color: var(--pp-success-fg);
        }
        .profile-status--warn {
            background: var(--pp-warn-bg);
            color: var(--pp-warn-fg);
        }
        .profile-status i.status-icon { font-size: 15px; }
        .profile-status__resend {
            margin-left: auto;
            padding: 6px 14px;
            font-size: 12.5px;
            font-weight: 600;
            border-radius: 999px;
            border: 1px solid currentColor;
            background: transparent;
            color: inherit;
            cursor: pointer;
            transition: background .15s ease, opacity .15s ease;
        }
        .profile-status__resend:hover { background: rgba(180, 83, 9, 0.1); }
        .profile-status__resend:disabled { opacity: 0.6; cursor: not-allowed; }
        .profile-save {
            padding: 13px;
            font-weight: 700;
            font-size: 14.5px;
            width: 100%;
            background: var(--pp-accent);
            border: none;
            color: #fff;
            border-radius: 10px;
            cursor: pointer;
            transition: background .15s ease, transform .1s ease;
        }
        .profile-save:hover { background: var(--pp-accent-hover); }
        .profile-save:active { transform: translateY(1px); }
        @media (max-width: 480px) {
            .profile-card { padding: 20px; border-radius: 12px; }
            .profile-identity { gap: 14px; }
            .profile-avatar { width: 68px; height: 68px; }
        }
    `;
    document.head.appendChild(style);
}

function renderProfileUI(user) {
    ensureProfileStyles();
    const container = document.getElementById('pageContent');
    const email = user.email || '';
    const name = user.name || '';
    const avatar = user.avatar_url || '';
    const confirmed = user.confirmed || false;

    const fallbackAvatar = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84"%3E%3Crect width="84" height="84" fill="%230d9488"/%3E%3Ctext x="42" y="51" font-size="32" text-anchor="middle" fill="white" font-family="sans-serif"%3E${email.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E`;

    container.innerHTML = `
        <div class="profile-page">
            <div class="profile-page__header">
                <button id="profileBackBtn" class="profile-page__back" type="button">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <h2 class="profile-page__title">User Profile</h2>
            </div>

            <div class="profile-card">
                <div class="profile-identity">
                    <div class="profile-avatar">
                        <div class="profile-avatar__ring"></div>
                        <img id="profileAvatarImg" src="${avatar || fallbackAvatar}" alt="Avatar">
                        <label for="avatarUpload" class="profile-avatar__edit">
                            <i class="fas fa-camera"></i>
                            <input type="file" id="avatarUpload" accept="image/*" style="display:none;">
                        </label>
                    </div>
                    <div>
                        <div class="profile-identity__name">${name || email}</div>
                        <div class="profile-identity__email">${email}</div>
                    </div>
                </div>

                <div class="profile-field">
                    <label>Email</label>
                    <input type="email" value="${email}" readonly>
                </div>

                <div class="profile-field">
                    <label for="profileName">Full name</label>
                    <input type="text" id="profileName" value="${name}" placeholder="Your full name">
                </div>

                <div class="profile-status ${confirmed ? 'profile-status--ok' : 'profile-status--warn'}">
                    <i class="status-icon fas ${confirmed ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
                    <span>${confirmed ? 'Email confirmed' : 'Email not confirmed'}</span>
                    ${!confirmed ? `<button id="resendConfirmBtn" class="profile-status__resend" type="button">Resend</button>` : ''}
                </div>

                <button id="profileSaveBtn" class="profile-save" type="button">
                    Save profile
                </button>
            </div>
        </div>
    `;

    // ---- Event listeners ----
    document.getElementById('avatarUpload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('profileSaveBtn')?.addEventListener('click', () => saveProfile(user.id));

    // ---- Real "Resend" button handler ----
    const resendBtn = document.getElementById('resendConfirmBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', async function() {
            const emailAddr = user.email;
            if (!emailAddr) {
                alert('No email address found.');
                return;
            }
            const originalLabel = resendBtn.textContent;
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending…';
            try {
                await sendVerificationCode(emailAddr);
                alert('✅ Verification code resent to your email.');
                // Optionally re‑fetch the profile to see if confirmed changed
                const fresh = await fetchProfileFromDB();
                if (fresh && fresh.confirmed !== user.confirmed) {
                    user.confirmed = fresh.confirmed;
                    // Re‑render the UI to update the status
                    renderProfileUI(user);
                    return;
                }
            } catch (err) {
                alert('❌ Failed to resend code: ' + err.message);
            } finally {
                resendBtn.disabled = false;
                resendBtn.textContent = originalLabel;
            }
        });
    }

    document.getElementById('profileBackBtn')?.addEventListener('click', () => {
        if (typeof window.navigateTo === 'function') window.navigateTo('dashboard');
        else document.querySelector('.nav-item[data-page="dashboard"]')?.click();
    });
}

async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const compressedDataUrl = await compressImage(file, 150, 150, 0.7);
        document.getElementById('profileAvatarImg').src = compressedDataUrl;
        avatarFile = compressedDataUrl;
    } catch (err) {
        console.error('Image compression failed:', err);
        alert('Failed to process image. Please try a smaller file.');
    }
}

function compressImage(file, maxWidth = 200, maxHeight = 200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round(width * (maxHeight / height));
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveProfile(userId) {
    if (!userId) {
        alert('Missing user id — please log out and back in.');
        console.error('saveProfile called with no userId');
        return;
    }

    const name = document.getElementById('profileName').value.trim();
    const avatar = avatarFile || document.getElementById('profileAvatarImg')?.src || '';

    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }

    const updateData = {
        name: name,
        email: email,
    };
    if (avatar && avatar.startsWith('data:image')) {
        updateData.avatar_url = avatar;
    }

    if (!email) {
        alert('Email not found – please log in again.');
        return;
    }

    if (typeof showLoading === 'function') showLoading();

    try {
        const result = await saveUserProfile(updateData, userId);
        console.log('✅ Save result:', result);

        // ---- UPDATE LOCALSTORAGE WITH NEW DATA ----
        const storedUser = JSON.parse(localStorage.getItem('smarthub.user') || '{}');
        storedUser.name = name;
        storedUser.avatar_url = avatar;
        localStorage.setItem('smarthub.user', JSON.stringify(storedUser));

        // ---- FORCE SIDEBAR UPDATE IMMEDIATELY ----
        const avatarEl = document.getElementById('userAvatar');
        const emailEl = document.getElementById('userEmailDisplay');
        if (avatarEl) {
            if (avatar && avatar.startsWith('data:image')) {
                avatarEl.style.backgroundImage = `url(${avatar})`;
                avatarEl.style.backgroundSize = 'cover';
                avatarEl.style.backgroundPosition = 'center';
                avatarEl.textContent = '';
            } else {
                avatarEl.style.background = 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)';
                avatarEl.textContent = (name || email || 'U')[0].toUpperCase();
            }
        }
        if (emailEl) {
            emailEl.textContent = name || email || 'User';
        }

        // Re-fetch and re-render the profile page
        const freshProfile = await fetchProfileFromDB();
        if (freshProfile) {
            const updatedUser = {
                id: freshProfile.id,
                email: freshProfile.plainEmail || freshProfile.email || email,
                name: freshProfile.name || '',
                avatar_url: freshProfile.avatar_url || '',
                confirmed: freshProfile.confirmed || false,
            };
            renderProfileUI(updatedUser);
        } else {
            const updatedUser = {
                id: userId,
                email: email,
                name: name,
                avatar_url: avatar,
                confirmed: storedUser.confirmed || false,
            };
            renderProfileUI(updatedUser);
        }

        alert('Profile updated!');
    } catch (err) {
        alert('Failed: ' + err.message);
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

function updateSidebarUser(user) {
    console.log('🔄 Updating sidebar with:', user);
    const avatarEl = document.getElementById('userAvatar');
    const emailEl = document.getElementById('userEmailDisplay');
    if (avatarEl) {
        if (user.avatar_url?.startsWith('data:image')) {
            avatarEl.style.backgroundImage = `url(${user.avatar_url})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
        } else {
            avatarEl.style.background = 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)';
            avatarEl.textContent = (user.name || user.email || 'U')[0].toUpperCase();
        }
    }
    if (emailEl) {
        emailEl.textContent = user.name || user.email || 'User';
    }
}

export async function initUserProfile() {
    const chip = document.getElementById('userInfo');
    if (!chip) return;
    chip.addEventListener('click', async (e) => {
        if (e.target.closest('#logoutBtn')) return;
        if (!chip.hasAttribute('hidden')) {
            if (typeof window.navigateTo === 'function') window.navigateTo('profile');
            else await showProfilePage();
        }
    });
}

document.addEventListener('DOMContentLoaded', initUserProfile);

window.showProfilePage = showProfilePage;
window.renderProfilePageContent = renderProfilePageContent;
window.updateSidebarUser = updateSidebarUser;