document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const API_ADMIN = 'https://api.ispconnect.co.ke/api/admin';
    const API_BILLING = 'https://api.ispconnect.co.ke/api/billing';

    // --- AUTHENTICATION & BRANDING ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    if (!adminName || !ispToken) {
        window.location.href = '/register.html?view=login';
        return;
    }

    document.getElementById("navName").textContent = adminName;
    document.getElementById("navAvatar").textContent = adminName.substring(0, 2).toUpperCase();
    if (companyName) {
        const sidebarLogo = document.getElementById("sidebar-logo-text");
        const navCompany = document.getElementById("navCompany");
        if (sidebarLogo) sidebarLogo.textContent = companyName;
        if (navCompany) navCompany.textContent = companyName;
    }

    // --- SIDEBAR & PROFILE ---
    const profileToggleBtn = document.getElementById("profileToggleBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    profileToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle("active");
    });
    document.addEventListener("click", (e) => {
        if (!profileToggleBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove("active");
        }
    });
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("adminName");
        localStorage.removeItem("isp_token");
        localStorage.removeItem("companyName");
        window.location.href = '/register.html?view=login';
    });

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

    function checkAuthError(res) {
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            window.location.href = '/register.html?view=login';
            return true;
        }
        return false;
    }

    window.showToast = function (message, type = "success") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        const icon = type === "error" ? "alert-circle" : "check-circle";
        toast.innerHTML = `<i data-lucide="${icon}" width="18"></i> <span>${message}</span>`;
        container.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
    };

    // --- PRESET CHIPS ---
    const topUpInput = document.getElementById("walletTopUpAmount");
    const presetChips = document.querySelectorAll(".preset-chip");
    presetChips.forEach(chip => {
        chip.addEventListener("click", () => {
            presetChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            topUpInput.value = chip.dataset.amount;
        });
    });
    topUpInput.addEventListener("input", () => {
        presetChips.forEach(c => c.classList.toggle("active", c.dataset.amount === topUpInput.value));
    });

    // --- WALLET & SUBSCRIPTION STATUS ---
    let isHardLocked = false;

    async function loadBillingStatus() {
        try {
            const res = await fetch(`${API_BILLING}/wallet-status`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) return;

            const data = await res.json();
            const bal = Number(data.payment_wallet_balance || 0);
            document.getElementById("kpi-wallet").textContent =
                `KES ${bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById("kpi-wallet-sub").textContent =
                bal < 50 ? "Low balance! Top up soon" : "Active for tx fees";

            const subStatusEl = document.getElementById("kpi-sub-status");
            const subExpiryEl = document.getElementById("kpi-sub-expiry");
            if (data.is_suspended) {
                subStatusEl.textContent = "Suspended";
                subStatusEl.style.color = "#EF4444";
                subExpiryEl.textContent = "Pay KES 1,300 to restore";
            } else {
                subStatusEl.textContent = "Active";
                subStatusEl.style.color = "#00B37E";
                subExpiryEl.textContent = data.days_left !== null
                    ? `${data.days_left} day(s) remaining`
                    : "KES 1,300 / month";
            }

            if (data.support_phone && !document.getElementById("subPayPhone").value) {
                document.getElementById("subPayPhone").value = data.support_phone;
            }

            isHardLocked = Boolean(data.is_suspended);
            if (isHardLocked) {
                openPaywallModal(true);
            } else {
                document.getElementById("paywallModal").classList.remove("active");
            }
        } catch (err) {
            console.error("Failed to load billing status", err);
        }
    }

    function openPaywallModal(locked) {
        const modal = document.getElementById("paywallModal");
        const closeBtn = document.getElementById("btnClosePaywall");
        closeBtn.style.display = locked ? "none" : "inline-block";
        modal.classList.add("active");
    }

    document.getElementById("btnOpenRenew").addEventListener("click", () => openPaywallModal(false));
    document.getElementById("sidebarRenewBtn").addEventListener("click", () => openPaywallModal(false));
    document.getElementById("btnClosePaywall").addEventListener("click", () => {
        if (!isHardLocked) document.getElementById("paywallModal").classList.remove("active");
    });

    // --- PAYMENT WALLET TOP-UP ---
    document.getElementById("formWalletTopUp").addEventListener("submit", async (e) => {
        e.preventDefault();
        const amount = Number(topUpInput.value);
        const phone = document.getElementById("walletTopUpPhone").value.trim();
        const btn = document.getElementById("btnWalletTopUp");
        const orig = btn.innerHTML;

        if (amount < 100) {
            showToast("Minimum deposit is KES 100.", "error");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16" class="spin"></i> Sending STK Push...`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });

        try {
            const payload = { amount };
            if (phone) payload.phone = phone;

            const res = await fetch(`${API_BILLING}/payment-wallet/topup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ispToken}`
                },
                body: JSON.stringify(payload)
            });
            if (checkAuthError(res)) return;
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.detail || "Deposit failed");

            showToast(resData.message || "STK Push sent! Enter your M-Pesa PIN.");
            setTimeout(loadBillingStatus, 15000);
            setTimeout(loadBillingStatus, 30000);
        } catch (err) {
            showToast(err.message || "Failed to initiate deposit.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    });

    // --- MONTHLY SUBSCRIPTION PAYMENT (KES 1,300) ---
    document.getElementById("formPaySub").addEventListener("submit", async (e) => {
        e.preventDefault();
        const phone = document.getElementById("subPayPhone").value.trim();
        const btn = document.getElementById("btnPaySub");
        const orig = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16" class="spin"></i> Sending STK Push...`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });

        try {
            const res = await fetch(`${API_BILLING}/subscription/pay`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ispToken}`
                },
                body: JSON.stringify({ phone })
            });
            if (checkAuthError(res)) return;
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.detail || "Subscription payment failed");

            showToast(resData.message || "STK Push sent for KES 1,300!");
            setTimeout(loadBillingStatus, 15000);
            setTimeout(loadBillingStatus, 30000);
        } catch (err) {
            showToast(err.message || "Failed to initiate subscription payment.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    });

    // --- PAYMENTS LEDGER ---
    let allPayments = [];
    let currentFilter = "all";

    function formatDate(dateString) {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleString("en-KE", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
    }

    async function loadPayments() {
        try {
            const res = await fetch(`${API_ADMIN}/payments-ledger`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error("Failed to load payments");

            allPayments = await res.json();
            let revenue = 0, failed = 0;
            allPayments.forEach(p => {
                if (String(p.status).toLowerCase() === "completed") revenue += Number(p.amount || 0);
                else failed++;
            });

            document.getElementById("kpi-revenue").textContent = `KES ${revenue.toLocaleString()}`;
            document.getElementById("kpi-transactions").textContent = allPayments.length.toLocaleString();
            document.getElementById("kpi-failed").textContent = `${failed.toLocaleString()} pending / failed`;
            renderPayments();
        } catch (err) {
            showToast("Failed to fetch payments ledger.", "error");
        }
    }

    function renderPayments() {
        const tbody = document.getElementById("payments-tbody");
        const searchTerm = document.getElementById("searchPayments").value.toLowerCase();

        const filtered = allPayments.filter(p => {
            const stat = String(p.status || "").toLowerCase();
            if (currentFilter === "completed" && stat !== "completed") return false;
            if (currentFilter === "failed" && stat === "completed") return false;
            const mpesa = (p.mpesa_receipt_number || "").toLowerCase();
            const phone = (p.phone || "").toLowerCase();
            const voucher = (p.voucher_code || "").toLowerCase();
            return mpesa.includes(searchTerm) || phone.includes(searchTerm) || voucher.includes(searchTerm);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No matching transactions found.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(p => {
            const stat = String(p.status || "").toLowerCase();
            const statusClass = stat === "completed" ? "status-success" : stat === "pending" ? "status-pending" : "status-failed";
            const mpesaDisplay = p.mpesa_receipt_number ? `<span class="code-pill">${p.mpesa_receipt_number}</span>` : `<span style="color:var(--text-muted);font-size:0.75rem;">Pending</span>`;
            const voucherDisplay = p.voucher_code ? `<span class="code-pill" style="color:var(--primary);background:var(--primary-light);border-color:var(--primary-light);">${p.voucher_code}</span>` : `<span style="color:var(--text-muted);font-size:0.75rem;">None</span>`;

            return `
                <tr>
                    <td data-label="Date" style="font-weight: 500;">${formatDate(p.created_at)}</td>
                    <td data-label="Phone" style="font-weight: 600;">${p.phone || "Unknown"}</td>
                    <td data-label="M-Pesa">${mpesaDisplay}</td>
                    <td data-label="Voucher">${voucherDisplay}</td>
                    <td data-label="Amount" style="font-weight: 600;">KES ${Number(p.amount || 0).toLocaleString()}</td>
                    <td data-label="Status"><span class="status-pill ${statusClass}">${stat.toUpperCase()}</span></td>
                    <td data-label="Actions" style="text-align: right;">
                        <button class="action-btn" onclick="copyText('${p.voucher_code || ""}')" title="Copy Voucher"><i data-lucide="copy" width="15"></i></button>
                    </td>
                </tr>
            `;
        }).join("");

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    window.copyText = function (text) {
        if (!text) return showToast("No voucher code to copy.", "error");
        navigator.clipboard.writeText(text).then(() => showToast(`Voucher ${text} copied!`));
    };

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentFilter = e.target.dataset.filter;
            renderPayments();
        });
    });

    document.getElementById("searchPayments").addEventListener("input", renderPayments);
    document.getElementById("btnRefreshAll").addEventListener("click", () => {
        loadBillingStatus();
        loadPayments();
        showToast("Payments & wallet refreshed.");
    });

    loadBillingStatus();
    loadPayments();
});
