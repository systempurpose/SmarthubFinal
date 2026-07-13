// js/emailVerification.js

let verificationEmail = '';

/**
 * Show the verification modal with the user's email.
 */
export function showVerificationModal(email) {
    verificationEmail = email;
    let modal = document.getElementById('verificationModal');
    if (!modal) {
        const html = `
            <div id="verificationModal" class="modal" style="display: none; z-index: 100010; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 400px; padding: 0; border-radius: 16px; overflow: hidden; background: white;">
                    <div style="background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%); padding: 16px 24px;">
                        <h3 style="margin:0; color:white; font-size:18px;">Verify Your Email</h3>
                    </div>
                    <div style="padding: 24px;">
                        <p style="margin: 0 0 8px 0; font-size:14px;">We sent a 6‑digit code to <strong id="verifyEmailDisplay"></strong></p>
                        <p style="font-size:13px; color:#6b7280; margin-bottom:16px;">Enter it below to complete registration.</p>
                        <input type="text" id="verifyCodeInput" maxlength="6" placeholder="Enter code" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; font-size:16px; text-align:center; letter-spacing:4px;">
                        <div id="verifyError" style="color:#dc2626; font-size:13px; margin-top:8px; display:none;"></div>
                        <div style="display:flex; gap:10px; margin-top:16px;">
                            <button id="verifySubmitBtn" class="btn-primary" style="flex:1; padding:10px;">Verify</button>
                            <button id="verifyResendBtn" class="btn-secondary" style="flex:1; padding:10px;">Resend</button>
                        </div>
                        <button id="verifyCancelBtn" style="margin-top:12px; background:none; border:none; color:#6b7280; cursor:pointer; font-size:13px; width:100%;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById('verificationModal');
    }

    document.getElementById('verifyEmailDisplay').textContent = email;
    document.getElementById('verifyCodeInput').value = '';
    document.getElementById('verifyError').style.display = 'none';
    modal.style.display = 'flex';

    const input = document.getElementById('verifyCodeInput');
    setTimeout(() => input.focus(), 100);

    // Attach event listeners (ensure they are not duplicated)
    const submitBtn = document.getElementById('verifySubmitBtn');
    const resendBtn = document.getElementById('verifyResendBtn');
    const cancelBtn = document.getElementById('verifyCancelBtn');
    const errorEl = document.getElementById('verifyError');

    // Clone and replace to remove old listeners
    const newSubmit = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
    newSubmit.addEventListener('click', () => handleVerification(email));

    const newResend = resendBtn.cloneNode(true);
    resendBtn.parentNode.replaceChild(newResend, resendBtn);
    newResend.addEventListener('click', async () => {
        await sendVerificationCode(email);
        errorEl.style.display = 'none';
        toast('Code resent! Check your email.', 'success');
    });

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

/**
 * Call backend to send a verification code.
 */
export async function sendVerificationCode(email) {
    try {
        const response = await fetch('/api/send-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });

        // Try to parse the response body as JSON
        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If the response is not JSON, read as text
            const text = await response.text();
            throw new Error(`Server returned non‑JSON response (${response.status}): ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            // Use the error message from the server, or a fallback
            const errorMsg = data?.error || data?.message || `Server error (${response.status})`;
            throw new Error(errorMsg);
        }

        // If we get here, the request was successful
        return data; // optional, contains { success: true }
    } catch (err) {
        // Handle network errors or our own thrown errors
        if (err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_REFUSED')) {
            throw new Error('Backend server is not running. Please start the SmartHub companion service.');
        }
        // Re‑throw the error with a clear message
        throw new Error(`Failed to send code: ${err.message}`);
    }
}

/**
 * Handle code verification.
 */
async function handleVerification(email) {
    const input = document.getElementById('verifyCodeInput');
    const code = input.value.trim();
    const errorEl = document.getElementById('verifyError');

    if (!code || code.length !== 6) {
        errorEl.textContent = 'Please enter the 6‑digit code.';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
        });
        const data = await response.json();
        if (!response.ok) {
            errorEl.textContent = data.error || 'Verification failed.';
            errorEl.style.display = 'block';
            return;
        }

        // Success
        document.getElementById('verificationModal').style.display = 'none';
        toast('✅ Email verified! You can now log in.', 'success');
        // Optionally auto-login or just close the modal.
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
}

// ---- Tiny toast (reuse from login.js or duplicate) ----
function toast(message, tone = 'info') {
    let holder = document.getElementById('authToastHolder');
    if (!holder) {
        holder = document.createElement('div');
        holder.id = 'authToastHolder';
        holder.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100010;display:flex;flex-direction:column;gap:8px;align-items:center;';
        document.body.appendChild(holder);
    }
    const colors = { info: '#0d6efd', success: '#16a34a', error: '#dc2626' };
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