(function () {
  const TOKEN_KEY = 'smarthub.auth.localSessionToken';
  const USER_KEY = 'smarthub.auth.user';
  const OFFLINE_UNTIL_KEY = 'smarthub.auth.offlineValidUntil';
  const FALLBACK_BACKEND_ORIGIN = 'http://127.0.0.1:3333';

  const backendOrigin =
    typeof window !== 'undefined' && typeof window.SMART_HUB_BACKEND_ORIGIN === 'string'
      ? window.SMART_HUB_BACKEND_ORIGIN
      : FALLBACK_BACKEND_ORIGIN;

  let readyResolved = false;
  let readyResolve = null;
  const readyPromise = new Promise(resolve => {
    readyResolve = resolve;
  });

  function resolveReadyOnce() {
    if (readyResolved) return;
    readyResolved = true;
    if (typeof readyResolve === 'function') {
      readyResolve();
    }
  }

  function readStoredToken() {
    try {
      return String(localStorage.getItem(TOKEN_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function readStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function storeSession(token, user, offlineValidUntil) {
    try {
      localStorage.setItem(TOKEN_KEY, String(token || '').trim());
      if (user && typeof user === 'object') {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
      if (offlineValidUntil != null) {
        localStorage.setItem(OFFLINE_UNTIL_KEY, String(offlineValidUntil));
      }
    } catch {
      // ignore
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(OFFLINE_UNTIL_KEY);
    } catch {
      // ignore
    }
  }

  function isBackendUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.startsWith(backendOrigin) || url.startsWith('http://localhost:3333');
  }

  function wrapFetchWithAuthHeader() {
    if (typeof window === 'undefined') return;
    if (!window.fetch || window.__smarthubAuthFetchWrapped) return;

    const originalFetch = window.fetch.bind(window);
    window.__smarthubAuthFetchWrapped = true;

    window.fetch = function (input, init) {
      try {
        const sourceUrl = typeof input === 'string' ? input : (input && input.url) || '';
        if (!isBackendUrl(sourceUrl)) {
          return originalFetch(input, init);
        }

        const token = readStoredToken();
        if (!token) {
          return originalFetch(input, init);
        }

        const headers = new Headers();

        if (typeof Request !== 'undefined' && input instanceof Request) {
          input.headers.forEach((v, k) => headers.set(k, v));
        }

        if (init && init.headers) {
          const initHeaders = new Headers(init.headers);
          initHeaders.forEach((v, k) => headers.set(k, v));
        }

        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        const mergedInit = Object.assign({}, init || {}, { headers });

        if (typeof Request !== 'undefined' && input instanceof Request) {
          const requestWithHeaders = new Request(input, mergedInit);
          return originalFetch(requestWithHeaders);
        }

        return originalFetch(input, mergedInit);
      } catch {
        return originalFetch(input, init);
      }
    };
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function formatDate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
      return new Date(n).toLocaleString();
    } catch {
      return '';
    }
  }

  function setAuthStatus(statusEl, message, kind) {
    if (!statusEl) return;
    statusEl.textContent = String(message || '');
    statusEl.classList.remove('error', 'ok');
    if (kind === 'error') statusEl.classList.add('error');
    if (kind === 'ok') statusEl.classList.add('ok');
  }

  async function verifySavedSession(statusEl) {
    const token = readStoredToken();
    if (!token) {
      return { ok: false, reason: 'No saved local session found.' };
    }

    try {
      const res = await fetch(`${backendOrigin}/auth/session/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = await safeJson(res);
      if (!res.ok || !data || data.ok !== true || data.authenticated !== true) {
        if (res.status === 401) {
          clearSession();
        }
        return {
          ok: false,
          reason: (data && data.error) || `Could not restore saved session (HTTP ${res.status}).`,
        };
      }

      if (data.user) {
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } catch {
          // ignore
        }
      }
      if (data.offlineValidUntil != null) {
        try {
          localStorage.setItem(OFFLINE_UNTIL_KEY, String(data.offlineValidUntil));
        } catch {
          // ignore
        }
      }

      const untilText = formatDate(data.offlineValidUntil);
      setAuthStatus(
        statusEl,
        untilText
          ? `Offline access restored. Valid until ${untilText}.`
          : 'Offline access restored.',
        'ok',
      );

      return {
        ok: true,
        user: data.user || readStoredUser() || null,
      };
    } catch {
      return {
        ok: false,
        reason:
          'Cannot reach local backend now. Start SmartHub backend first, then sign in online at least once.',
      };
    }
  }

  async function requestLogin(email, password) {
    const res = await fetch(`${backendOrigin}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(res);
    if (!res.ok || !data || data.ok !== true || !data.localSessionToken) {
      const msg = (data && data.error) || `Sign-in failed (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    return data;
  }

  async function requestRegister(displayName, email, password, passwordConfirm) {
    const res = await fetch(`${backendOrigin}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName, email, password, passwordConfirm }),
    });

    const data = await safeJson(res);
    if (!res.ok || !data || data.ok !== true) {
      const msg = (data && data.error) || `Registration failed (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    return data;
  }

  async function requestForgotPassword(email) {
    const res = await fetch(`${backendOrigin}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await safeJson(res);
    if (!res.ok || !data || data.ok !== true) {
      const msg = (data && data.error) || `Forgot password request failed (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    return data;
  }

  function showAuthenticatedUi(elements, user, offlineValidUntil) {
    const { gateEl, userBadgeEl, logoutBtn } = elements;
    if (gateEl) gateEl.classList.add('hidden');

    const labelSource =
      (user && (user.displayName || user.email || user.id)) ||
      (readStoredUser() && (readStoredUser().displayName || readStoredUser().email || readStoredUser().id)) ||
      'Authenticated';

    if (userBadgeEl) {
      userBadgeEl.textContent = `Signed in: ${labelSource}`;
      userBadgeEl.classList.remove('hidden');
      if (offlineValidUntil) {
        const untilText = formatDate(offlineValidUntil);
        if (untilText) {
          userBadgeEl.title = `Offline access valid until ${untilText}`;
        }
      }
    }

    if (logoutBtn) {
      logoutBtn.classList.remove('hidden');
      logoutBtn.disabled = false;
    }

    resolveReadyOnce();
  }

  function showUnauthenticatedUi(elements) {
    const { gateEl, userBadgeEl, logoutBtn } = elements;

    if (gateEl) gateEl.classList.remove('hidden');
    if (userBadgeEl) {
      userBadgeEl.textContent = '';
      userBadgeEl.title = '';
      userBadgeEl.classList.add('hidden');
    }
    if (logoutBtn) {
      logoutBtn.classList.add('hidden');
      logoutBtn.disabled = false;
    }
  }

  async function logoutAndReload() {
    try {
      await fetch(`${backendOrigin}/auth/logout`, {
        method: 'POST',
      });
    } catch {
      // ignore
    }

    clearSession();

    try {
      window.location.reload();
    } catch {
      // ignore
    }
  }

  function bootAuthUi() {
    const gateEl = document.getElementById('auth-gate');
    const subtitleEl = document.getElementById('auth-subtitle');
    const nameFieldEl = document.getElementById('auth-name-field');
    const nameEl = document.getElementById('auth-display-name');
    const statusEl = document.getElementById('auth-status');
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const confirmFieldEl = document.getElementById('auth-confirm-field');
    const confirmEl = document.getElementById('auth-password-confirm');
    const loginBtn = document.getElementById('auth-login-btn');
    const registerBtn = document.getElementById('auth-register-btn');
    const offlineBtn = document.getElementById('auth-use-offline-btn');
    const switchToRegisterBtn = document.getElementById('auth-switch-to-register-btn');
    const switchToLoginBtn = document.getElementById('auth-switch-to-login-btn');
    const forgotPasswordBtn = document.getElementById('auth-forgot-password-btn');
    const userBadgeEl = document.getElementById('auth-user-badge');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const supportsRegisterMode =
      !!nameFieldEl &&
      !!nameEl &&
      !!confirmFieldEl &&
      !!confirmEl &&
      !!registerBtn &&
      !!switchToRegisterBtn &&
      !!switchToLoginBtn;
    let mode = 'login';

    const elements = { gateEl, statusEl, userBadgeEl, logoutBtn };

    if (!gateEl || !statusEl || !emailEl || !passEl || !loginBtn || !offlineBtn) {
      // If auth UI was removed accidentally, do not block app startup forever.
      resolveReadyOnce();
      return;
    }

    showUnauthenticatedUi(elements);

    function setMode(nextMode) {
      const desired = nextMode === 'register' && supportsRegisterMode ? 'register' : 'login';
      mode = desired;

      const isRegister = desired === 'register';
      loginBtn.classList.toggle('hidden', isRegister);

      if (supportsRegisterMode) {
        nameFieldEl.classList.toggle('hidden', !isRegister);
        confirmFieldEl.classList.toggle('hidden', !isRegister);
        registerBtn.classList.toggle('hidden', !isRegister);
        switchToRegisterBtn.classList.toggle('hidden', isRegister);
        switchToLoginBtn.classList.toggle('hidden', !isRegister);
        if (forgotPasswordBtn) {
          forgotPasswordBtn.classList.toggle('hidden', isRegister);
        }
      }

      if (subtitleEl) {
        subtitleEl.textContent = isRegister
          ? 'Create your account in this Windows app, then continue with desktop diagnostics.'
          : 'Sign in online once. After that, this app can run offline until your local session expires.';
      }

      passEl.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    }

    function setBusy(isBusy) {
      loginBtn.disabled = !!isBusy;
      if (registerBtn) registerBtn.disabled = !!isBusy;
      offlineBtn.disabled = !!isBusy;
      if (switchToRegisterBtn) switchToRegisterBtn.disabled = !!isBusy;
      if (switchToLoginBtn) switchToLoginBtn.disabled = !!isBusy;
      if (forgotPasswordBtn) forgotPasswordBtn.disabled = !!isBusy;
      if (logoutBtn) logoutBtn.disabled = !!isBusy;
    }

    async function tryRestoreSavedSession() {
      setBusy(true);
      setAuthStatus(statusEl, 'Checking saved session...', '');

      const restored = await verifySavedSession(statusEl);
      setBusy(false);

      if (restored.ok) {
        showAuthenticatedUi(elements, restored.user, localStorage.getItem(OFFLINE_UNTIL_KEY));
        return true;
      }

      setAuthStatus(statusEl, restored.reason || 'Sign in online to continue.', 'error');
      showUnauthenticatedUi(elements);
      return false;
    }

    if (forgotPasswordBtn) {
      forgotPasswordBtn.addEventListener('click', async () => {
        const email = String(emailEl.value || '').trim();
        if (!email) {
          setAuthStatus(statusEl, 'Enter your email first, then click Forgot password.', 'error');
          return;
        }

        setBusy(true);
        setAuthStatus(statusEl, 'Sending password reset email...', '');
        try {
          const resetData = await requestForgotPassword(email);
          setAuthStatus(
            statusEl,
            (resetData && resetData.message) || 'Password reset email sent. Check your inbox.',
            'ok',
          );
        } catch (e) {
          setAuthStatus(
            statusEl,
            e && e.message ? e.message : 'Could not send password reset email.',
            'error',
          );
        } finally {
          setBusy(false);
        }
      });
    }

    setMode('login');

    loginBtn.addEventListener('click', async () => {
      const email = String(emailEl.value || '').trim();
      const password = String(passEl.value || '');

      if (!email || !password) {
        setAuthStatus(statusEl, 'Enter email and password.', 'error');
        return;
      }

      setBusy(true);
      setAuthStatus(statusEl, 'Signing in online...', '');

      try {
        const loginData = await requestLogin(email, password);
        storeSession(loginData.localSessionToken, loginData.user || null, loginData.offlineValidUntil);
        passEl.value = '';

        const untilText = formatDate(loginData.offlineValidUntil);
        setAuthStatus(
          statusEl,
          untilText
            ? `Sign-in successful. Offline access valid until ${untilText}.`
            : 'Sign-in successful.',
          'ok',
        );

        showAuthenticatedUi(elements, loginData.user || null, loginData.offlineValidUntil);
      } catch (e) {
        setAuthStatus(statusEl, e && e.message ? e.message : 'Sign-in failed.', 'error');
        showUnauthenticatedUi(elements);
      } finally {
        setBusy(false);
      }
    });

    if (supportsRegisterMode) {
      switchToRegisterBtn.addEventListener('click', () => {
        setMode('register');
        setAuthStatus(statusEl, 'Enter details, then click Create account online.', '');
        try {
          nameEl.focus();
        } catch {
          // ignore
        }
      });

      switchToLoginBtn.addEventListener('click', () => {
        setMode('login');
        setAuthStatus(statusEl, 'Sign in with your existing account.', '');
        try {
          emailEl.focus();
        } catch {
          // ignore
        }
      });

      registerBtn.addEventListener('click', async () => {
        const displayName = String(nameEl.value || '').trim();
        const email = String(emailEl.value || '').trim();
        const password = String(passEl.value || '');
        const passwordConfirm = String(confirmEl.value || '');

        if (!displayName || displayName.length < 2) {
          setAuthStatus(statusEl, 'Enter a display name with at least 2 characters.', 'error');
          return;
        }

        if (!email || !password) {
          setAuthStatus(statusEl, 'Enter email and password.', 'error');
          return;
        }

        if (password.length < 8) {
          setAuthStatus(statusEl, 'Password must be at least 8 characters.', 'error');
          return;
        }

        if (password !== passwordConfirm) {
          setAuthStatus(statusEl, 'Password confirmation does not match.', 'error');
          return;
        }

        setBusy(true);
        setAuthStatus(statusEl, 'Creating account online...', '');

        try {
          const registerData = await requestRegister(displayName, email, password, passwordConfirm);

          if (registerData.localSessionToken) {
            storeSession(
              registerData.localSessionToken,
              registerData.user || null,
              registerData.offlineValidUntil,
            );
            passEl.value = '';
            confirmEl.value = '';

            const untilText = formatDate(registerData.offlineValidUntil);
            setAuthStatus(
              statusEl,
              untilText
                ? `Account created. Offline access valid until ${untilText}.`
                : 'Account created and signed in successfully.',
              'ok',
            );

            showAuthenticatedUi(elements, registerData.user || null, registerData.offlineValidUntil);
            return;
          }

          passEl.value = '';
          confirmEl.value = '';
          setMode('login');
          setAuthStatus(
            statusEl,
            registerData.message || 'Account created. Sign in from this app to continue.',
            'ok',
          );
        } catch (e) {
          setAuthStatus(statusEl, e && e.message ? e.message : 'Registration failed.', 'error');
          showUnauthenticatedUi(elements);
        } finally {
          setBusy(false);
        }
      });
    }

    offlineBtn.addEventListener('click', async () => {
      await tryRestoreSavedSession();
    });

    passEl.addEventListener('keydown', e => {
      if (e && e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'register' && supportsRegisterMode) {
          registerBtn.click();
          return;
        }
        loginBtn.click();
      }
    });

    if (supportsRegisterMode) {
      confirmEl.addEventListener('keydown', e => {
        if (e && e.key === 'Enter') {
          e.preventDefault();
          registerBtn.click();
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        logoutAndReload();
      });
    }

    void (async () => {
      const restored = await tryRestoreSavedSession();
      if (restored) return;

      // Show a config hint when the backend has no Supabase keys.
      try {
        const cfgRes = await fetch(`${backendOrigin}/auth/config`, { cache: 'no-store' });
        const cfg = await safeJson(cfgRes);
        if (cfg && cfg.configured === false) {
          setAuthStatus(
            statusEl,
            'Supabase keys are missing on backend. Put them in supabase.local.json and restart the Windows app.',
            'error',
          );
        }
      } catch {
        // ignore
      }

      try {
        emailEl.focus();
      } catch {
        // ignore
      }
    })();
  }

  wrapFetchWithAuthHeader();

  window.SmartHubAuth = {
    onReady: () => readyPromise,
    isAuthenticated: () => !!readStoredToken(),
    getToken: () => readStoredToken(),
    logout: async () => {
      await logoutAndReload();
    },
  };

  document.addEventListener('DOMContentLoaded', bootAuthUi);
})();
