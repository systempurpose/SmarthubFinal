// js/login.js
import { saveAccount, loadAccount } from './account-storage.js';
import { showVerificationModal, sendVerificationCode } from './emailVerification.js';
import { getSupabaseClient } from './supabase.js';
import { sha256 } from './auth.js'; // assuming auth.js exports sha256

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

function initDOM() {
    loginModal = document.getElementById('loginModal');
    registerModal = document.getElementById('registerModal');
    loginBtn = document.getElementById('loginBtn');
    logoutBtn = document.getElementById('logoutBtn');
    userInfo = document.getElementById('userInfo');
    userEmailDisplay = document.getElementById('userEmailDisplay');
    userAvatar = document.getElementById('userAvatar');
}

// ---- Toast helper ----
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

// ---- Fetch user profile from Supabase (using user_account) ----
async function fetchUserProfile(user) {
    if (!user || !user.id) return user;
    try {
        const { getSupabaseClient } = await import('./supabase.js');
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('user_account')
            .select('name, avatar_url, confirmed')
            .eq('id', user.id)
            .maybeSingle();
        if (error) {
            console.warn('Failed to fetch profile:', error);
            return user;
        }
        if (data) {
            return {
                ...user,
                name: data.name || user.name || user.email,
                avatar_url: data.avatar_url || user.avatar_url || null,
                confirmed: data.confirmed ?? false,
            };
        }
        return user;
    } catch (err) {
        console.warn('[Auth] Profile fetch error:', err);
        return user;
    }
}

// ---- reCAPTCHA v2 Checkbox helper ----
// This uses data-callback on the widget and a promise to wait for the user to check the box.
let recaptchaResolve = null;
let recaptchaReject = null;
let recaptchaTimer = null;

// This function is called by the reCAPTCHA widget when the user successfully completes the challenge.
window.onRecaptchaSuccess = function(token) {
    console.log('✅ reCAPTCHA solved:', token);
    if (recaptchaResolve) {
        recaptchaResolve(token);
        recaptchaResolve = null;
        recaptchaReject = null;
        if (recaptchaTimer) {
            clearTimeout(recaptchaTimer);
            recaptchaTimer = null;
        }
    }
};

// This function is called if the challenge expires.
window.onRecaptchaExpired = function() {
    console.warn('⚠️ reCAPTCHA expired');
    if (recaptchaReject) {
        recaptchaReject(new Error('reCAPTCHA challenge expired. Please try again.'));
        recaptchaResolve = null;
        recaptchaReject = null;
        if (recaptchaTimer) {
            clearTimeout(recaptchaTimer);
            recaptchaTimer = null;
        }
    }
};

async function getRecaptchaToken() {
    return new Promise((resolve, reject) => {
        if (typeof grecaptcha === 'undefined') {
            reject(new Error('reCAPTCHA not loaded. Please refresh.'));
            return;
        }
        // Check if already solved
        const existingToken = grecaptcha.getResponse();
        if (existingToken) {
            resolve(existingToken);
            return;
        }
        // Wait for the user to solve it via the callback
        recaptchaResolve = resolve;
        recaptchaReject = reject;
        // Timeout after 30 seconds
        recaptchaTimer = setTimeout(() => {
            if (recaptchaReject) {
                recaptchaReject(new Error('reCAPTCHA challenge not completed within the time limit.'));
                recaptchaResolve = null;
                recaptchaReject = null;
                recaptchaTimer = null;
            }
        }, 30000);
    });
}

// ---- Send Code Handler (step 1) – NO CAPTCHA ----
// ---- Send Code Handler (step 1) – Creates account + sends code ----
// ---- Send Code Handler (step 1) – ONLY sends code, NO account creation ----
// ---- Send Code Handler (step 1) – ONLY sends code ----
export async function handleSendCode(email, password, confirmPassword) {
    const emailInput = document.getElementById('registerEmail');
    const emailError = document.getElementById('emailError');
    let hasError = false;

    // ---- Email validation ----
    if (!email || !email.trim()) {
        emailError.textContent = 'Email is required.';
        emailError.style.display = 'block';
        emailInput.style.borderColor = '#dc2626';
        hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailError.textContent = 'Please enter a valid email address.';
        emailError.style.display = 'block';
        emailInput.style.borderColor = '#dc2626';
        hasError = true;
    } else {
        emailError.style.display = 'none';
        emailInput.style.borderColor = '#16a34a';
    }

    if (hasError) {
        showError('registerError', 'Please fix the errors above.');
        return false;
    }

    // ---- Password validation ----
    if (!password || password.length < 6) {
        showError('registerError', 'Password must be at least 6 characters.');
        return false;
    }
    if (password !== confirmPassword) {
        showError('registerError', 'Passwords do not match.');
        return false;
    }

    // ---- Check if email already exists ----
    try {
        if (await userExists(email)) {
            showError('registerError', 'Email already registered.');
            return false;
        }
    } catch (err) {
        showError('registerError', 'Error checking email: ' + err.message);
        return false;
    }

    // ---- Store email and password temporarily ----
    window._tempRegistration = { email, password };

    // ---- Send verification code ----
    const sendBtn = document.getElementById('sendCodeBtn');
    const originalText = sendBtn?.textContent || 'Send Code';
    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';
        }
        await sendVerificationCode(email);
        document.getElementById('codeSentMsg').style.display = 'block';
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sent';
        }
        toast('✅ Verification code sent to your email.', 'success');
        return true;
    } catch (err) {
        showError('registerError', 'Failed to send code: ' + err.message);
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;
        }
        return false;
    }
}

// ---- Register Handler (step 2) – VERIFIES CODE + CAPTCHA, THEN CREATES ACCOUNT ----
// ---- Register Handler (step 2) – VERIFIES CODE + CAPTCHA, THEN CREATES ACCOUNT ----
// ---- Register Handler (step 2) – VERIFIES CODE + CAPTCHA, THEN CREATES ACCOUNT ----
export async function handleRegister(email, password) {
    // Use stored email/password if not provided
    if (!email || !password) {
        const temp = window._tempRegistration || {};
        email = temp.email || document.getElementById('registerEmail').value.trim();
        password = temp.password || document.getElementById('registerPassword').value;
    }

    // Get verification code
    const code = document.getElementById('registerVerificationCode').value.trim();
    if (!code || code.length !== 6) {
        showError('registerError', 'Please enter the 6-digit verification code.');
        return false;
    }

    // ---- 1. Verify reCAPTCHA ----
    let token;
    try {
        token = await getRecaptchaToken();
        if (!token) {
            showError('registerError', 'reCAPTCHA token missing. Please check the box.');
            return false;
        }
    } catch (err) {
        showError('registerError', 'reCAPTCHA not available: ' + err.message);
        return false;
    }

    try {
        const response = await fetch('/api/verify-recaptcha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        const result = await response.json();
        if (!result.success) {
            showError('registerError', 'CAPTCHA verification failed. Please try again.');
            return false;
        }
    } catch (err) {
        showError('registerError', 'Failed to verify CAPTCHA. Please try again.');
        return false;
    }

    // ---- 2. Verify the code ----
    try {
        const response = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
        });
        const result = await response.json();
        if (!result.success) {
            const errorMsg = result.error || 'Invalid code. Please try again.';
            showError('registerError', errorMsg);
            return false;
        }
    } catch (err) {
        showError('registerError', 'Failed to verify code: ' + err.message);
        return false;
    }

    // ---- 3. Create the account with confirmed: true ----
    try {
        // We need a version of register that creates confirmed = true
        // Option A: modify auth.js register to accept a param
        // Option B: use the existing register and then update
        // For simplicity, we'll use a direct insert or call register and then update.
        // Let's call register (which creates with confirmed: false) and then update.
        const result = await register(email, password);
        console.log('✅ Account created (unconfirmed), result:', result);

        if (!result || result.length === 0) {
            throw new Error('Account creation failed – no data returned.');
        }

        // Now update confirmed to true
        const supabase = await getSupabaseClient();
        const emailHash = await sha256(email);
        const { error: updateError } = await supabase
            .from('user_account')
            .update({ confirmed: true })
            .eq('email_hash', emailHash);
        if (updateError) {
            console.error('Failed to confirm account:', updateError);
            showError('registerError', 'Account created but could not confirm. Please contact support.');
            return false;
        }
        console.log('✅ Account confirmed successfully.');
    } catch (err) {
        console.error('❌ Failed to create account:', err);
        showError('registerError', 'Failed to create account: ' + err.message);
        return false;
    }

    // ---- All good ----
    toast('✅ Registration successful! You can now login.', 'success');
    closeModal(registerModal);
    openModal(loginModal);
    return true;
}

// ---- Register Handler (step 2) – VERIFIES CODE + CAPTCHA ----
// ---- Register Handler (step 2) – VERIFIES CODE + CAPTCHA ----


// ---- Login Handler (checks confirmation) ----
export async function handleLogin(email, password) {
    if (authLoadError) {
        showError('loginError', 'Login system failed to load. Check the console for details.');
        return null;
    }
    try {
        let user = await login(email, password);
        user = await fetchUserProfile(user);

        if (!user.confirmed) {
            showError('loginError', 'Please verify your email first. A verification code has been sent.');
            try {
                await sendVerificationCode(email);
                showVerificationModal(email);
            } catch (err) {
                toast('Failed to resend code. Please try again later.', 'error');
            }
            return null;
        }

        console.log('Logged in as:', user.email);
        localStorage.setItem('smarthub.user', JSON.stringify(user));
        await saveAccount(user);

        updateUIAfterLogin(user);
        closeModal(loginModal);
        toast('👋 Welcome, ' + (user.name || user.email) + '!', 'success');

        if (typeof window.loadAndApplySettings === 'function') {
            await window.loadAndApplySettings();
        }

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
        userEmailDisplay.textContent = user.name || user.email;
    }
    if (userAvatar) {
        if (user.avatar_url && user.avatar_url.startsWith('data:image')) {
            userAvatar.style.backgroundImage = `url(${user.avatar_url})`;
            userAvatar.style.backgroundSize = 'cover';
            userAvatar.style.backgroundPosition = 'center';
            userAvatar.textContent = '';
        } else {
            userAvatar.style.backgroundImage = '';
            userAvatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
        }
    }
    if (loginBtn) {
        loginBtn.hidden = true;
    }
    if (typeof window.updateHeaderUser === 'function') {
        window.updateHeaderUser(user);
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
    sessionStorage.removeItem('smarthub.session');
    if (typeof window.updateHeaderUser === 'function') {
        window.updateHeaderUser(null);
    }
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
function closeModal(modal) { if (modal) modal.style.display = 'none'; }
function showError(errorId, message) {
    const el = document.getElementById(errorId);
    if (el) { el.textContent = message; el.style.display = 'block'; }
    else { toast(message, 'error'); }
}

export function showLoginModal() { openModal(loginModal); }
export function showRegisterModal() { openModal(registerModal); }

// ---- Auto-login ----
export async function autoLogin() {
    console.log('[autoLogin] Checking for stored user...');
    let user = null;
    try {
        user = await loadAccount();
        if (user) {
            localStorage.setItem('smarthub.user', JSON.stringify(user));
            user = await fetchUserProfile(user);
            localStorage.setItem('smarthub.user', JSON.stringify(user));
            updateUIAfterLogin(user);
            console.log('✅ Auto-logged in from AppData as:', user.email);
            if (typeof window.loadAndApplySettings === 'function') {
                await window.loadAndApplySettings();
            }
            return user;
        }
    } catch (err) {
        console.warn('[autoLogin] Failed to load from AppData:', err);
    }

    const storedUser = localStorage.getItem('smarthub.user');
    if (storedUser) {
        try {
            user = JSON.parse(storedUser);
            user = await fetchUserProfile(user);
            localStorage.setItem('smarthub.user', JSON.stringify(user));
            updateUIAfterLogin(user);
            await saveAccount(user);
            console.log('✅ Auto-logged in from localStorage as:', user.email);
            if (typeof window.loadAndApplySettings === 'function') {
                await window.loadAndApplySettings();
            }
            return user;
        } catch (e) {
            localStorage.removeItem('smarthub.user');
        }
    }

    console.log('[autoLogin] No valid user found – logged out.');
    updateUIAfterLogout();
    return null;
}

// ---- initAuthForms ----
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
        loginBtn.addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleLogout(); });
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
            await handleRegister(email, password);
        });
    }

    // Send Code button
    const sendCodeBtn = document.getElementById('sendCodeBtn');
if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        await handleSendCode(email, password, confirmPassword);
    });
}
// ---- Forgot Password Flow ----
let resetEmail = '';
let resetCode = '';

// Open reset modal
document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(loginModal);
    document.getElementById('resetPasswordModal').style.display = 'flex';
    // Reset UI
    document.getElementById('resetStep1').style.display = 'block';
    document.getElementById('resetStep2').style.display = 'none';
    document.getElementById('resetStep3').style.display = 'none';
    document.getElementById('resetEmail').value = '';
    document.getElementById('resetCode').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
});

// Close reset modal
document.getElementById('resetPasswordModalClose')?.addEventListener('click', () => {
    document.getElementById('resetPasswordModal').style.display = 'none';
});

// Send Reset Code
document.getElementById('sendResetCodeBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value.trim();
    const errorEl = document.getElementById('resetEmailError');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email.';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';

    const btn = document.getElementById('sendResetCodeBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const response = await fetch('/api/request-password-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById('resetCodeSentMsg').style.display = 'block';
            resetEmail = email;
            // Go to step 2
            document.getElementById('resetStep1').style.display = 'none';
            document.getElementById('resetStep2').style.display = 'block';
        } else {
            document.getElementById('resetSendError').textContent = data.error || 'Failed to send code.';
            document.getElementById('resetSendError').style.display = 'block';
        }
    } catch (err) {
        document.getElementById('resetSendError').textContent = 'Error: ' + err.message;
        document.getElementById('resetSendError').style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Reset Code';
    }
});

// Verify Reset Code
// ---- Step 2 → Step 3: Verify code (frontend-only check) ----
document.getElementById('verifyResetCodeBtn')?.addEventListener('click', () => {
    const code = document.getElementById('resetCode').value.trim();
    const errorEl = document.getElementById('resetCodeError');
    if (!code || code.length !== 6) {
        errorEl.textContent = 'Please enter the 6-digit code.';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    // Store the code and move to step 3 (no backend call)
    resetCode = code;
    document.getElementById('resetStep2').style.display = 'none';
    document.getElementById('resetStep3').style.display = 'block';
});

// Reset Password
document.getElementById('resetPasswordBtn')?.addEventListener('click', async () => {
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const errorEl = document.getElementById('resetPasswordError');

    if (!newPassword || newPassword.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'block';
        return;
    }
    if (newPassword !== confirmNewPassword) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';

    const btn = document.getElementById('resetPasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Resetting...';

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
        });
        const data = await response.json();
        if (data.success) {
            toast('✅ Password reset successfully! You can now login.', 'success');
            document.getElementById('resetPasswordModal').style.display = 'none';
            openModal(loginModal);
        } else {
            errorEl.textContent = data.error || 'Failed to reset password.';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Error: ' + err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Reset Password';
    }
});
    // Switch between login/register
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

    // Close buttons
    const loginClose = document.getElementById('loginModalClose');
    if (loginClose) loginClose.addEventListener('click', () => closeModal(loginModal));
    const registerClose = document.getElementById('registerModalClose');
    if (registerClose) registerClose.addEventListener('click', () => closeModal(registerModal));

    // Click outside to close
    if (loginModal) loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModal(loginModal); });
    if (registerModal) registerModal.addEventListener('click', (e) => { if (e.target === registerModal) closeModal(registerModal); });

    await autoLogin();
}

// ---- Expose globally ----
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.handleLogout = handleLogout;

// ---- Initialize ----
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthForms);
} else {
    initAuthForms();
}