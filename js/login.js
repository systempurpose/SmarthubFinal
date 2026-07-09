// js/login.js

import { saveAccount, loadAccount } from './account-storage.js';

let register, login, userExists;
let authLoadError = null;

// ---- Try to load auth.js ----
try {
    const authModule = await import('./auth.js');
    register = authModule.register;
    login = authModule.login;
    userExists = authModule.userExists;
    console.log('✅ auth.js loaded successfully');
} catch (err) {
    authLoadError = err;
    console.error('❌ Failed to load auth.js:', err);
    toast('⚠️ Login unavailable: ' + err.message, 'error');
}

// ---- DOM references ----
let loginModal, registerModal, loginBtn, logoutBtn, userInfo, userEmailDisplay, userAvatar;
let initialized = false;

// ---- Initialize all DOM references ----
function initDOM() {
    loginModal = document.getElementById('loginModal');
    registerModal = document.getElementById('registerModal');
    loginBtn = document.getElementById('loginBtn');
    logoutBtn = document.getElementById('logoutBtn');
    userInfo = document.getElementById('userInfo');
    userEmailDisplay = document.getElementById('userEmailDisplay');
    userAvatar = document.getElementById('userAvatar');
}

// ---- Tiny toast helper ----
function toast(message, tone = 'info') {
    let holder = document.getElementById('authToastHolder');
    if (!holder) {
        holder = document.createElement('div');
        holder.id = 'authToastHolder';
        holder.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100010;display:flex;flex-direction:column;gap:8px;align-items:center;';
        document.body.appendChild(holder);
    }
    const colors = {
        info: '#0d6efd',
        success: '#16a34a',
        error: '#dc2626'
    };
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `background:${colors[tone] || colors.info};color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;box-shadow:0 8px 20px rgba(0,0,0,0.2);opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;`;
    holder.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 250);
    }, 2800);
}

// ---- Registration Handler ----
export async function handleRegister(email, password) {
    if (authLoadError) {
        showError('registerError', 'Login system failed to load. Check the console for details.');
        return false;
    }
    try {
        if (await userExists(email)) {
            showError('registerError', 'Email already registered.');
            return false;
        }

        await register(email, password);
        toast('✅ Registration successful! Please login.', 'success');
        closeModal(registerModal);
        openModal(loginModal);
        return true;
    } catch (err) {
        showError('registerError', err.message);
        return false;
    }
}

// ---- 👇 UPDATED Login Handler (saves to AppData) ----
export async function handleLogin(email, password) {
    if (authLoadError) {
        showError('loginError', 'Login system failed to load. Check the console for details.');
        return null;
    }
    try {
        const user = await login(email, password);
        console.log('Logged in as:', user.email);

        // Save to localStorage (fast access)
        localStorage.setItem('smarthub.user', JSON.stringify(user));
        // 👇 NEW: Save encrypted account to AppData
        await saveAccount(user);

        updateUIAfterLogin(user);
        closeModal(loginModal);
        toast('👋 Welcome, ' + user.email + '!', 'success');
        return user;
    } catch (err) {
        showError('loginError', err.message);
        return null;
    }
}

// ---- UI Update after Login ----
function updateUIAfterLogin(user) {
    if (userInfo) {
        userInfo.hidden = false;
    }
    if (userEmailDisplay) {
        userEmailDisplay.textContent = user.email;
    }
    if (userAvatar) {
        userAvatar.textContent = (user.email || '?').trim().charAt(0);
    }
    if (loginBtn) {
        loginBtn.hidden = true;
    }
}

// ---- UI Update after Logout ----
function updateUIAfterLogout() {
    if (userInfo) {
        userInfo.hidden = true;
    }
    if (loginBtn) {
        loginBtn.hidden = false;
    }
    localStorage.removeItem('smarthub.user');
    // 👇 NEW: Also remove from sessionStorage (if we ever use it)
    sessionStorage.removeItem('smarthub.session');
}

// ---- Logout Handler ----
export function handleLogout() {
    updateUIAfterLogout();
    toast('👋 Logged out successfully.', 'info');
}

// ---- Modal helpers ----
function openModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
        const errorEls = modal.querySelectorAll('[id$="Error"]');
        errorEls.forEach(el => { el.style.display = 'none'; el.textContent = ''; });
    }
}

function closeModal(modal) {
    if (modal) modal.style.display = 'none';
}

function showError(errorId, message) {
    const el = document.getElementById(errorId);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    } else {
        toast(message, 'error');
    }
}

// ---- Show Login Modal ----
export function showLoginModal() {
    openModal(loginModal);
}

// ---- Show Register Modal ----
export function showRegisterModal() {
    openModal(registerModal);
}

// ---- 👇 UPDATED Auto-login (loads from AppData first) ----
export async function autoLogin() {
    console.log('[autoLogin] Checking for stored user...');

    // 1. Try to load from AppData (encrypted file)
    let user = null;
    try {
        user = await loadAccount();
        if (user) {
            // Also update localStorage for faster future loads
            localStorage.setItem('smarthub.user', JSON.stringify(user));
            updateUIAfterLogin(user);
            console.log('✅ Auto-logged in from AppData as:', user.email);
            return user;
        }
    } catch (err) {
        console.warn('[autoLogin] Failed to load from AppData:', err);
        // Fall through to localStorage
    }

    // 2. Fallback to localStorage
    const storedUser = localStorage.getItem('smarthub.user');
    if (storedUser) {
        try {
            user = JSON.parse(storedUser);
            updateUIAfterLogin(user);
            // Attempt to re-save to AppData (if it was missing or failed)
            try {
                await saveAccount(user);
                console.log('✅ Re-saved account to AppData from localStorage.');
            } catch (saveErr) {
                console.warn('Could not re-save account to AppData:', saveErr);
            }
            console.log('✅ Auto-logged in from localStorage as:', user.email);
            return user;
        } catch (e) {
            localStorage.removeItem('smarthub.user');
        }
    }

    console.log('[autoLogin] No valid user found – logged out.');
    updateUIAfterLogout();
    return null;
}

// ---- 👇 UPDATED initAuthForms (async) ----
export async function initAuthForms() {
    if (initialized) return;
    initialized = true;

    initDOM();

    if (authLoadError) {
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toast('⚠️ Login is unavailable — auth.js failed to load. See console.', 'error');
            });
        }
        updateUIAfterLogout();
        return;
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            await handleLogin(email, password);
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;

            if (password !== confirmPassword) {
                showError('registerError', 'Passwords do not match.');
                return;
            }
            if (password.length < 6) {
                showError('registerError', 'Password must be at least 6 characters.');
                return;
            }
            await handleRegister(email, password);
        });
    }

    const switchToRegister = document.getElementById('switchToRegister');
    if (switchToRegister) {
        switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(loginModal);
            openModal(registerModal);
        });
    }

    const switchToLogin = document.getElementById('switchToLogin');
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(registerModal);
            openModal(loginModal);
        });
    }

    const loginClose = document.getElementById('loginModalClose');
    if (loginClose) {
        loginClose.addEventListener('click', () => closeModal(loginModal));
    }

    const registerClose = document.getElementById('registerModalClose');
    if (registerClose) {
        registerClose.addEventListener('click', () => closeModal(registerModal));
    }

    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) closeModal(loginModal);
        });
    }
    if (registerModal) {
        registerModal.addEventListener('click', (e) => {
            if (e.target === registerModal) closeModal(registerModal);
        });
    }

    // 👇 NEW: Await autoLogin
    await autoLogin();
}

// ---- Expose modal functions globally (for inline onclick) ----
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.handleLogout = handleLogout;

// ---- 👇 UPDATED initialization block (handles async initAuthForms) ----
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAuthForms();
    });
} else {
    // No need to await – the function is async but we don't need to wait.
    initAuthForms();
}