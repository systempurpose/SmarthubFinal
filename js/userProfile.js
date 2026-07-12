// js/userProfile.js
import { getSupabaseClient } from './supabase.js';
import { saveUserProfile, fetchUserProfile as fetchProfileFromDB } from './user_profile_sb.js';

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
    if (!user.id) {
        console.warn('⚠️ getCurrentUser() returned a user with no id — profile saves will likely fail.', user);
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
        console.log('📥 Fetched profile from Supabase:', profile);
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

    renderProfileUI(displayUser);
}

function renderProfileUI(user) {
    const container = document.getElementById('pageContent');
    const email = user.email || '';
    const name = user.name || '';
    const avatar = user.avatar_url || '';
    const confirmed = user.confirmed || false;

    container.innerHTML = `
        <div style="max-width:500px;margin:0 auto;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;">
                <button id="profileBackBtn" class="btn-secondary" style="padding:6px 14px;">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <h2 style="margin:0;">User Profile</h2>
            </div>
            <div style="display:flex;flex-direction:column;gap:20px;background:white;padding:24px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="display:flex;align-items:center;gap:24px;">
                    <div style="position:relative;width:80px;height:80px;border-radius:50%;overflow:hidden;background:#e2e8f0;border:2px solid #e2e8f0;flex-shrink:0;">
                        <img id="profileAvatarImg" src="${avatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"%3E%3Crect width="80" height="80" fill="%2364748b"/%3E%3Ctext x="40" y="48" font-size="32" text-anchor="middle" fill="white" font-family="sans-serif"%3E${email.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E'}" style="width:100%;height:100%;object-fit:cover;" alt="Avatar">
                        <label for="avatarUpload" style="position:absolute;bottom:0;right:0;background:#0d6efd;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;border:2px solid white;">
                            <i class="fas fa-camera"></i>
                            <input type="file" id="avatarUpload" accept="image/*" style="display:none;">
                        </label>
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:20px;">${name || email}</div>
                        <div style="font-size:14px;color:#64748b;">${email}</div>
                    </div>
                </div>
                <div>
                    <label style="font-weight:500;font-size:14px;color:#1e293b;">Email</label>
                    <input type="email" value="${email}" readonly style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f1f5f9;color:#475569;font-size:14px;">
                </div>
                <div>
                    <label for="profileName" style="font-weight:500;font-size:14px;color:#1e293b;">Full Name</label>
                    <input type="text" id="profileName" value="${name}" placeholder="Your full name" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div style="display:flex;align-items:center;gap:12px;background:${confirmed ? '#dcfce7' : '#fef3c7'};padding:12px 16px;border-radius:8px;">
                    <span style="font-size:20px;">${confirmed ? '✅' : '⚠️'}</span>
                    <span style="font-size:14px;color:${confirmed ? '#166534' : '#92400e'};">
                        ${confirmed ? 'Email confirmed' : 'Email not confirmed'}
                    </span>
                    ${!confirmed ? `<button id="resendConfirmBtn" class="btn-secondary" style="margin-left:auto;padding:4px 14px;font-size:12px;border-radius:6px;">Resend</button>` : ''}
                </div>
                <button id="profileSaveBtn" class="btn-primary" style="padding:12px;font-weight:600;width:100%;background:#0d6efd;border:none;color:white;border-radius:10px;">
                    Save Profile
                </button>
            </div>
        </div>
    `;

    document.getElementById('avatarUpload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('profileSaveBtn')?.addEventListener('click', () => saveProfile(user.id));
    document.getElementById('resendConfirmBtn')?.addEventListener('click', () => alert('Resend confirmation'));
    document.getElementById('profileBackBtn')?.addEventListener('click', () => {
        if (typeof window.navigateTo === 'function') window.navigateTo('dashboard');
        else document.querySelector('.nav-item[data-page="dashboard"]')?.click();
    });
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        document.getElementById('profileAvatarImg').src = ev.target.result;
        avatarFile = ev.target.result;
    };
    reader.readAsDataURL(file);
}

async function saveProfile(userId) {
    if (!userId) {
        alert('Missing user id — please log out and back in, then try again.');
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
        name,
        email,
    };
    if (avatar && avatar.startsWith('data:image')) updateData.avatar_url = avatar;

    if (!email) {
        alert('Email not found – please log in again.');
        return;
    }

    // ---- Show loading overlay ----
    if (typeof showLoading === 'function') {
        showLoading();
    }

    try {
        const result = await saveUserProfile(updateData, userId);
        console.log('✅ Save result:', result);

        if (result) {
            const storedUser = JSON.parse(localStorage.getItem('smarthub.user') || '{}');
            storedUser.name = result.name || name;
            storedUser.avatar_url = result.avatar_url || updateData.avatar_url;
            localStorage.setItem('smarthub.user', JSON.stringify(storedUser));
            updateSidebarUser(storedUser);
        }

        // ---- Re‑fetch fresh profile and re‑render ----
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
            // Fallback: use the data we just saved
            const storedUser = JSON.parse(localStorage.getItem('smarthub.user') || '{}');
            const updatedUser = {
                id: userId,
                email: storedUser.email || email,
                name: name || storedUser.name || '',
                avatar_url: avatar || storedUser.avatar_url || '',
                confirmed: storedUser.confirmed || false,
            };
            renderProfileUI(updatedUser);
        }

        alert('Profile updated!');
    } catch (err) {
        alert('Failed: ' + err.message);
    } finally {
        // ---- Hide loading overlay ----
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

function updateSidebarUser(user) {
    const avatarEl = document.getElementById('userAvatar');
    const emailEl = document.getElementById('userEmailDisplay');
    if (avatarEl) {
        if (user.avatar_url?.startsWith('data:image')) {
            avatarEl.style.backgroundImage = `url(${user.avatar_url})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
        } else {
            avatarEl.style.background = 'linear-gradient(135deg, #0d6efd 0%, #6ea8fe 100%)';
            avatarEl.textContent = (user.name || user.email || 'U')[0].toUpperCase();
        }
    }
    if (emailEl) emailEl.textContent = user.name || user.email || 'User';
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