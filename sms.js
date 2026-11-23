document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const API_BASE = 'https://api.ispconnect.co.ke/api/admin/sms';
    let currentSmsRate = 0.80;

    // --- AUTHENTICATION & BRANDING ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    if (!adminName || !ispToken) {
        window.location.href = '/register.html?view=login';
        return;
    }

    document.getElementById("navAvatar").textContent = adminName.substring(0, 2).toUpperCase();
    document.getElementById("navName").textContent = adminName;

    if (companyName) {
        const sidebarLogo = document.getElementById("sidebar-logo-text");
        const navCompany = document.getElementById("navCompany");
        if (sidebarLogo) sidebarLogo.textContent = companyName;
        if (navCompany) navCompany.textContent = companyName;
    }

    // --- SIDEBAR & PROFILE DROPDOWN ---
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");

    document.getElementById("mobileToggle").addEventListener("click", () => {
        sidebar.classList.toggle("open");
        mobileOverlay.classList.toggle("active");
    });
    mobileOverlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        mobileOverlay.classList.remove("active");
    });

    const profileToggleBtn = document.getElementById('profileToggleBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileToggleBtn && profileDropdown) {
        profileToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        document.addEventListener('click', () => profileDropdown.classList.remove('active'));
    }

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("adminName");
        localStorage.removeItem("isp_token");
        localStorage.removeItem("companyName");
        window.location.href = '/register.html?view=login';
    });

    function checkAuthError(res) {
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            window.location.href = '/register.html?view=login';
            return true;
        }
        return false;
    }

    function showToast(message, type = "success") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.style.borderLeft = `4px solid ${type === 'error' ? '#EF4444' : '#00B37E'}`;
        toast.className = "toast";
        const icon = type === "error" ? "alert-circle" : "check-circle";
        toast.innerHTML = `<i data-lucide="${icon}" width="18"></i> <span>${message}</span>`;
        container.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
    }

    // --- LIVE TOP-UP CONVERSION ---
    const topUpInput = document.getElementById('topUpAmount');
    const conversionUnitsEl = document.getElementById('conversionUnits');
    const conversionRateEl = document.getElementById('conversionRateText');
    const presetChips = document.querySelectorAll('.preset-chip');

    function updateConversionPreview() {
        const amount = parseFloat(topUpInput.value) || 0;
        const units = amount > 0 ? Math.floor(amount / currentSmsRate) : 0;
        conversionUnitsEl.textContent = `${units.toLocaleString()} SMS units`;
        conversionRateEl.textContent = `Calculated at KES ${currentSmsRate.toFixed(2)} / SMS`;
    }

    topUpInput.addEventListener('input', () => {
        presetChips.forEach(c => c.classList.toggle('active', c.dataset.amount === topUpInput.value));
        updateConversionPreview();
    });

    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            topUpInput.value = chip.dataset.amount;
            updateConversionPreview();
        });
    });

    // --- WALLET & LEDGER LOGIC ---
    async function loadWalletBalance() {
        try {
            const res = await fetch(`${API_BASE}/wallet`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error();

            const data = await res.json();
            const balance = Number(data.balance || 0);
            currentSmsRate = Number(data.sms_rate || 0.80);
            const units = data.sms_units !== undefined ? Number(data.sms_units) : Math.floor(balance / currentSmsRate);

            document.getElementById('walletBalanceDisplay').textContent =
                `KES ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('smsUnitsDisplay').textContent = units.toLocaleString();
            document.getElementById('smsRateDisplay').textContent = `KES ${currentSmsRate.toFixed(2)}`;
            updateConversionPreview();
        } catch (err) {
            console.error("Failed to load wallet balance", err);
        }
    }

    async function loadLedger() {
        const tbody = document.getElementById('smsLedgerBody');
        try {
            const res = await fetch(`${API_BASE}/ledger`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error();

            const data = await res.json();

            let sentCount = 0;
            let failedCount = 0;
            data.forEach(log => {
                const statusStr = String(log.status || '').toLowerCase();
                if (statusStr.includes('sent') || statusStr.includes('success')) sentCount++;
                else failedCount++;
            });

            document.getElementById('sentCountDisplay').textContent = sentCount.toLocaleString();
            document.getElementById('failedCountDisplay').textContent = `${failedCount.toLocaleString()} failed`;

            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No SMS dispatches recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(log => {
                const date = new Date(log.created_at).toLocaleString('en-KE', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const isSent = String(log.status || '').toLowerCase().includes('sent') ||
                               String(log.status || '').toLowerCase().includes('success');
                const statusHtml = `<span class="status-pill ${isSent ? 'status-sent' : 'status-failed'}">${isSent ? 'SENT' : 'FAILED'}</span>`;
                const costDisplay = Number(log.cost) > 0 ? `KES ${Number(log.cost).toFixed(2)}` : 'KES 0.00';

                return `
                    <tr>
                        <td data-label="Time" style="white-space: nowrap; font-weight: 500;">${date}</td>
                        <td data-label="Recipient" style="font-family: monospace; font-weight: 600;">${log.phone}</td>
                        <td data-label="Message" class="msg-cell">${log.message}</td>
                        <td data-label="Cost" style="font-weight: 600;">${costDisplay}</td>
                        <td data-label="Status">${statusHtml}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 24px;">Failed to load SMS ledger.</td></tr>`;
        }
    }

    // --- M-PESA TOP-UP TRIGGER ---
    document.getElementById('formTopUp').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = Number(topUpInput.value);
        const phone = document.getElementById('topUpPhone').value.trim();
        const btn = document.getElementById('btnTopUp');
        const originalText = btn.innerHTML;

        if (amount < 50) {
            showToast("Minimum top-up is KES 50.", "error");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16" class="spin"></i> Sending STK Push...`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });

        try {
            const payload = { amount };
            if (phone) payload.phone = phone;

            const res = await fetch(`${API_BASE}/wallet/topup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ispToken}`
                },
                body: JSON.stringify(payload)
            });

            if (checkAuthError(res)) return;
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.detail || "Top-up failed");

            showToast(resData.message || "STK Push sent! Enter your M-Pesa PIN to complete.");

            // Auto-refresh balance after 15s and 30s to catch callback completion
            setTimeout(loadWalletBalance, 15000);
            setTimeout(loadWalletBalance, 30000);
        } catch (err) {
            showToast(err.message || "Failed to initiate M-Pesa top-up.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    });

    document.getElementById('btnRefreshAll').addEventListener('click', () => {
        loadWalletBalance();
        loadLedger();
        showToast("SMS wallet & ledger refreshed.");
    });

    updateConversionPreview();
    loadWalletBalance();
    loadLedger();
});
