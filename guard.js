(function () {
    const API_BILLING = 'https://api.ispconnect.co.ke/api/billing';
    const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
    const LOGIN_URL = '/register.html?view=login';

    const ispToken = localStorage.getItem('isp_token');
    if (!ispToken) return;

    // =========================================================
    // 1. 5-MINUTE INACTIVITY AUTO-LOGOUT
    // =========================================================
    let idleTimer = null;

    function forceLogout() {
        localStorage.removeItem('adminName');
        localStorage.removeItem('isp_token');
        localStorage.removeItem('companyName');
        localStorage.removeItem('isp_last_activity');
        window.location.href = LOGIN_URL;
    }

    function resetIdleTimer() {
        const now = Date.now();
        localStorage.setItem('isp_last_activity', String(now));
        clearTimeout(idleTimer);
        idleTimer = setTimeout(checkIdleAndLogout, IDLE_LIMIT_MS);
    }

    function checkIdleAndLogout() {
        const last = Number(localStorage.getItem('isp_last_activity') || Date.now());
        if (Date.now() - last >= IDLE_LIMIT_MS) {
            forceLogout();
        } else {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(checkIdleAndLogout, IDLE_LIMIT_MS - (Date.now() - last));
        }
    }

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
        window.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkIdleAndLogout();
    });

    resetIdleTimer();

    // =========================================================
    // 2. GLOBAL SUBSCRIPTION PAYWALL & AUTO-UNLOCK
    // =========================================================
    const LOCK_SVG = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>`;

    const CHECK_SVG = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;

    const SPINNER_SVG = `
        <svg class="guard-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>`;

    function injectGuardStyles() {
        if (document.getElementById('ispGuardStyle')) return;
        const style = document.createElement('style');
        style.id = 'ispGuardStyle';
        style.textContent = `
            @keyframes guardFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes guardPopIn {
                0% { opacity: 0; transform: translateY(16px) scale(0.95); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes guardPulse {
                0% { transform: scale(0.95); opacity: 0.7; }
                70% { transform: scale(1.45); opacity: 0; }
                100% { transform: scale(1.45); opacity: 0; }
            }
            @keyframes guardFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }
            @keyframes guardSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            #ispGuardBackdrop {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.82);
                backdrop-filter: blur(8px); z-index: 99999; display: flex;
                align-items: center; justify-content: center; padding: 16px;
                font-family: 'Inter', sans-serif;
                animation: guardFadeIn 0.25s ease forwards;
            }
            #ispGuardModal {
                background: #ffffff; color: #1E293B; border-radius: 18px;
                max-width: 430px; width: 100%; padding: 32px 26px 26px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08);
                text-align: center;
                animation: guardPopIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .guard-icon-wrap {
                position: relative; width: 64px; height: 64px; margin: 0 auto 18px;
                display: flex; align-items: center; justify-content: center;
            }
            .guard-icon-ring {
                position: absolute; inset: 0; border-radius: 50%;
                background: rgba(239, 68, 68, 0.22);
                animation: guardPulse 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
            }
            .guard-icon {
                position: relative; z-index: 2; width: 58px; height: 58px;
                border-radius: 50%; background: linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%);
                color: #EF4444; display: flex; align-items: center; justify-content: center;
                border: 1px solid rgba(239, 68, 68, 0.18);
                box-shadow: 0 6px 16px rgba(239, 68, 68, 0.14);
                transition: all 0.3s ease;
            }
            .guard-icon svg { animation: guardFloat 2.8s ease-in-out infinite; }
            .guard-icon.unlocked {
                background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
                color: #00B37E; border-color: rgba(0, 179, 126, 0.25);
                box-shadow: 0 6px 16px rgba(0, 179, 126, 0.2);
            }
            .guard-icon-ring.unlocked { background: rgba(0, 179, 126, 0.25); }

            #ispGuardModal h2 { font-size: 1.28rem; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
            #ispGuardModal p { font-size: 0.86rem; color: #64748B; line-height: 1.55; margin: 0 0 20px; }
            .guard-field { text-align: left; margin-bottom: 14px; }
            .guard-field label { display: block; font-size: 0.72rem; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
            .guard-field input {
                width: 100%; padding: 12px 14px; border: 1px solid #CBD5E1;
                border-radius: 10px; font-size: 0.92rem; outline: none; box-sizing: border-box;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .guard-field input:focus { border-color: #00B37E; box-shadow: 0 0 0 3px rgba(0, 179, 126, 0.12); }
            .guard-btn {
                width: 100%; padding: 13px 18px; border: none; border-radius: 10px;
                background: #00B37E; color: #fff; font-size: 0.9rem; font-weight: 600;
                cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                transition: transform 0.15s ease, background 0.2s ease, opacity 0.2s;
                box-shadow: 0 4px 12px rgba(0, 179, 126, 0.25);
            }
            .guard-btn:hover:not(:disabled) { background: #009B6D; transform: translateY(-1px); }
            .guard-btn:active:not(:disabled) { transform: translateY(0); }
            .guard-btn:disabled { opacity: 0.7; cursor: not-allowed; }
            .guard-spin { animation: guardSpin 0.85s linear infinite; }
            .guard-status { margin-top: 12px; font-size: 0.8rem; font-weight: 500; min-height: 18px; }
            .guard-logout {
                margin-top: 14px; background: transparent; border: none;
                color: #64748B; font-size: 0.8rem; font-weight: 600; cursor: pointer;
                transition: color 0.2s;
            }
            .guard-logout:hover { color: #EF4444; }
        `;
        document.head.appendChild(style);
    }

    function showHardPaywall(defaultPhone, monthlyFee) {
        if (document.getElementById('ispGuardBackdrop')) return;
        injectGuardStyles();
        document.body.style.overflow = 'hidden';

        const formattedFee = Number(monthlyFee).toLocaleString();
        const backdrop = document.createElement('div');
        backdrop.id = 'ispGuardBackdrop';
        backdrop.innerHTML = `
            <div id="ispGuardModal">
                <div class="guard-icon-wrap">
                    <div class="guard-icon-ring" id="guardIconRing"></div>
                    <div class="guard-icon" id="guardIcon">${LOCK_SVG}</div>
                </div>
                <h2 id="guardTitle">Subscription Expired</h2>
                <p>Your ISPConnect monthly fee (<strong>KES ${formattedFee}</strong>) is overdue. Your dashboard and customer captive portal are currently locked. Pay via M-Pesa below to unlock everything immediately.</p>
                <form id="ispGuardForm">
                    <div class="guard-field">
                        <label>M-Pesa Phone Number</label>
                        <input type="tel" id="ispGuardPhone" value="${defaultPhone || ''}" placeholder="e.g. 0712345678" required>
                    </div>
                    <button type="submit" class="guard-btn" id="ispGuardPayBtn">Pay KES ${formattedFee} via M-Pesa</button>
                </form>
                <div class="guard-status" id="ispGuardStatus"></div>
                <button type="button" class="guard-logout" id="ispGuardLogout">Sign Out</button>
            </div>
        `;
        document.body.appendChild(backdrop);

        document.getElementById('ispGuardLogout').addEventListener('click', forceLogout);

        let pollTimer = null;
        document.getElementById('ispGuardForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('ispGuardPhone').value.trim();
            const btn = document.getElementById('ispGuardPayBtn');
            const statusEl = document.getElementById('ispGuardStatus');

            btn.disabled = true;
            btn.innerHTML = `${SPINNER_SVG} Sending STK Push...`;
            statusEl.style.color = '#64748B';
            statusEl.textContent = '';

            try {
                const res = await fetch(`${API_BILLING}/subscription/pay`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ispToken}`
                    },
                    body: JSON.stringify({ phone })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Payment initiation failed');

                btn.innerHTML = `${SPINNER_SVG} Waiting for M-Pesa PIN...`;
                statusEl.style.color = '#007BFF';
                statusEl.textContent = 'Check your phone and enter your M-Pesa PIN. Unlocking automatically...';

                let attempts = 0;
                clearInterval(pollTimer);
                pollTimer = setInterval(async () => {
                    attempts++;
                    resetIdleTimer();
                    try {
                        const checkRes = await fetch(`${API_BILLING}/wallet-status`, {
                            headers: { 'Authorization': `Bearer ${ispToken}` }
                        });
                        if (checkRes.ok) {
                            const checkData = await checkRes.json();
                            if (!checkData.is_suspended) {
                                clearInterval(pollTimer);
                                const iconEl = document.getElementById('guardIcon');
                                const ringEl = document.getElementById('guardIconRing');
                                iconEl.classList.add('unlocked');
                                ringEl.classList.add('unlocked');
                                iconEl.innerHTML = CHECK_SVG;
                                document.getElementById('guardTitle').textContent = 'Subscription Restored';
                                btn.innerHTML = 'Unlocked!';
                                statusEl.style.color = '#00B37E';
                                statusEl.textContent = 'Payment confirmed! Loading your dashboard...';
                                setTimeout(() => window.location.reload(), 1200);
                            }
                        }
                    } catch (_) {}

                    if (attempts >= 30) {
                        clearInterval(pollTimer);
                        btn.disabled = false;
                        btn.textContent = `Pay KES ${formattedFee} via M-Pesa`;
                        statusEl.style.color = '#D97706';
                        statusEl.textContent = 'Still waiting. If you already paid, refresh the page.';
                    }
                }, 4000);
            } catch (err) {
                btn.disabled = false;
                btn.textContent = `Pay KES ${formattedFee} via M-Pesa`;
                statusEl.style.color = '#EF4444';
                statusEl.textContent = err.message || 'Failed to send STK Push.';
            }
        });
    }

    async function verifySubscription() {
        try {
            const res = await fetch(`${API_BILLING}/wallet-status`, {
                headers: { 'Authorization': `Bearer ${ispToken}` }
            });
            if (res.status === 401 || res.status === 403) {
                forceLogout();
                return;
            }
            if (!res.ok) return;
            const data = await res.json();
            if (data.is_suspended) {
                showHardPaywall(data.support_phone, data.monthly_fee || 1300);
            }
        } catch (err) {
            console.error('Guard check failed:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verifySubscription);
    } else {
        verifySubscription();
    }
})();
