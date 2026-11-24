(function () {
    const API_BILLING = 'https://api.ispconnect.co.ke/api/billing';
    const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
    const LOGIN_URL = 'register.html?view=login';

    const ispToken = localStorage.getItem('isp_token');
    if (!ispToken) return; // Individual page auth handles missing tokens

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

    // Catch sleeping/background tabs immediately when the user returns
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkIdleAndLogout();
    });

    resetIdleTimer();

    // =========================================================
    // 2. GLOBAL SUBSCRIPTION PAYWALL & AUTO-UNLOCK
    // =========================================================
    function injectGuardStyles() {
        if (document.getElementById('ispGuardStyle')) return;
        const style = document.createElement('style');
        style.id = 'ispGuardStyle';
        style.textContent = `
            #ispGuardBackdrop {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(6px); z-index: 99999; display: flex;
                align-items: center; justify-content: center; padding: 16px;
                font-family: 'Inter', sans-serif;
            }
            #ispGuardModal {
                background: #ffffff; color: #1E293B; border-radius: 16px;
                max-width: 430px; width: 100%; padding: 28px 24px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); text-align: center;
            }
            .guard-icon {
                width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 14px;
                background: #FEE2E2; color: #EF4444; display: flex;
                align-items: center; justify-content: center; font-size: 24px;
            }
            #ispGuardModal h2 { font-size: 1.25rem; font-weight: 700; margin: 0 0 8px; }
            #ispGuardModal p { font-size: 0.85rem; color: #64748B; line-height: 1.5; margin: 0 0 18px; }
            .guard-field { text-align: left; margin-bottom: 14px; }
            .guard-field label { display: block; font-size: 0.72rem; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 6px; }
            .guard-field input {
                width: 100%; padding: 11px 14px; border: 1px solid #CBD5E1;
                border-radius: 10px; font-size: 0.9rem; outline: none; box-sizing: border-box;
            }
            .guard-field input:focus { border-color: #00B37E; }
            .guard-btn {
                width: 100%; padding: 12px 18px; border: none; border-radius: 10px;
                background: #00B37E; color: #fff; font-size: 0.9rem; font-weight: 600;
                cursor: pointer; transition: opacity 0.2s;
            }
            .guard-btn:disabled { opacity: 0.65; cursor: not-allowed; }
            .guard-status { margin-top: 12px; font-size: 0.8rem; font-weight: 500; min-height: 18px; }
            .guard-logout {
                margin-top: 14px; background: transparent; border: none;
                color: #64748B; font-size: 0.8rem; font-weight: 600; cursor: pointer;
            }
            .guard-logout:hover { color: #EF4444; }
        `;
        document.head.appendChild(style);
    }

    function showHardPaywall(defaultPhone, monthlyFee) {
        if (document.getElementById('ispGuardBackdrop')) return;
        injectGuardStyles();
        document.body.style.overflow = 'hidden';

        const backdrop = document.createElement('div');
        backdrop.id = 'ispGuardBackdrop';
        backdrop.innerHTML = `
            <div id="ispGuardModal">
                <div class="guard-icon">&#128274;</div>
                <h2>Subscription Expired</h2>
                <p>Your ISPConnect monthly fee (<strong>KES ${Number(monthlyFee).toLocaleString()}</strong>) is overdue. Your dashboard and customer captive portal are currently locked. Pay via M-Pesa below to unlock everything immediately.</p>
                <form id="ispGuardForm">
                    <div class="guard-field">
                        <label>M-Pesa Phone Number</label>
                        <input type="tel" id="ispGuardPhone" value="${defaultPhone || ''}" placeholder="e.g. 0712345678" required>
                    </div>
                    <button type="submit" class="guard-btn" id="ispGuardPayBtn">Pay KES ${Number(monthlyFee).toLocaleString()} via M-Pesa</button>
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
            btn.textContent = 'Sending STK Push...';
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

                btn.textContent = 'Waiting for M-Pesa PIN...';
                statusEl.style.color = '#007BFF';
                statusEl.textContent = 'Check your phone and enter your M-Pesa PIN. Unlocking automatically...';

                // Poll every 4 seconds for up to 2 minutes
                let attempts = 0;
                clearInterval(pollTimer);
                pollTimer = setInterval(async () => {
                    attempts++;
                    resetIdleTimer(); // Keep session alive while waiting for M-Pesa
                    try {
                        const checkRes = await fetch(`${API_BILLING}/wallet-status`, {
                            headers: { 'Authorization': `Bearer ${ispToken}` }
                        });
                        if (checkRes.ok) {
                            const checkData = await checkRes.json();
                            if (!checkData.is_suspended) {
                                clearInterval(pollTimer);
                                statusEl.style.color = '#00B37E';
                                statusEl.textContent = 'Payment confirmed! Unlocking your dashboard...';
                                setTimeout(() => window.location.reload(), 1200);
                            }
                        }
                    } catch (_) {}

                    if (attempts >= 30) {
                        clearInterval(pollTimer);
                        btn.disabled = false;
                        btn.textContent = `Pay KES ${Number(monthlyFee).toLocaleString()} via M-Pesa`;
                        statusEl.style.color = '#D97706';
                        statusEl.textContent = 'Still waiting. If you already paid, refresh the page.';
                    }
                }, 4000);
            } catch (err) {
                btn.disabled = false;
                btn.textContent = `Pay KES ${Number(monthlyFee).toLocaleString()} via M-Pesa`;
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