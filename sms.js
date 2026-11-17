document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    const API_BASE = 'https://api.ispconnect.co.ke/api/admin/sms';

    // --- AUTHENTICATION & BRANDING ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    if (!adminName || !ispToken) {
        window.location.href = 'register.html?view=login';
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

    // --- STANDARD TEMPLATE LOGIC ---
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");
    
    document.getElementById("mobileToggle").addEventListener("click", () => {
        sidebar.classList.toggle("open"); mobileOverlay.classList.toggle("active");
    });
    mobileOverlay.addEventListener("click", () => {
        sidebar.classList.remove("open"); mobileOverlay.classList.remove("active");
    });

    const profileToggleBtn = document.getElementById('profileToggleBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (profileToggleBtn && profileDropdown) {
        profileToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        document.addEventListener('click', () => {
            if (profileDropdown) profileDropdown.classList.remove('active');
        });
    }

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("adminName");
        localStorage.removeItem("isp_token");
        localStorage.removeItem("companyName");
        window.location.href = 'register.html?view=login';
    });

    function checkAuthError(res) {
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            window.location.href = 'register.html?view=login';
            return true;
        }
        return false;
    }

    function showToast(message, type = "success") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.style.borderLeft = `4px solid ${type === 'error' ? '#EF4444' : '#00B37E'}`;
        toast.className = `toast`;
        const icon = type === "error" ? "alert-circle" : "check-circle";
        toast.innerHTML = `<i data-lucide="${icon}" width="18"></i> <span>${message}</span>`;
        container.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // --- WALLET & LEDGER LOGIC ---
    async function loadWalletBalance() {
        try {
            const res = await fetch(`${API_BASE}/wallet`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error();
            
            const data = await res.json();
            const displayAmount = Number(data.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            document.getElementById('walletBalanceDisplay').textContent = displayAmount;
        } catch (err) {
            console.error("Failed to load wallet balance");
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
            
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No SMS dispatches recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map(log => {
                const date = new Date(log.created_at).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const isSent = log.status.toLowerCase().includes('sent') || log.status.toLowerCase().includes('success');
                const statusHtml = `<span class="status-pill ${isSent ? 'status-sent' : 'status-failed'}">${isSent ? 'SENT' : 'FAILED'}</span>`;
                const costDisplay = log.cost > 0 ? `KES ${Number(log.cost).toFixed(2)}` : '0.00';
                
                return `
                    <tr>
                        <td style="white-space: nowrap; font-weight: 500;">${date}</td>
                        <td style="font-family: monospace; font-weight: 600;">${log.phone}</td>
                        <td style="max-width: 300px; color: var(--text-muted); line-height: 1.4;">${log.message}</td>
                        <td style="font-weight: 600;">${costDisplay}</td>
                        <td>${statusHtml}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 20px;">Failed to load SMS ledger.</td></tr>`;
        }
    }

    // --- M-PESA TOP-UP TRIGGER ---
    document.getElementById('formTopUp').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('topUpAmount').value;
        const btn = document.getElementById('btnTopUp');
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" width="16" class="spin"></i> Processing...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const res = await fetch(`${API_BASE}/wallet/topup`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ispToken}`
                },
                body: JSON.stringify({ amount: Number(amount) })
            });
            
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error("Top-up failed");
            
            showToast("Top-up request initiated! Please check your phone for the M-Pesa prompt.");
            
            // Auto-refresh the wallet balance after 15 seconds to check if payment cleared
            setTimeout(() => {
                loadWalletBalance();
            }, 15000);
            
            document.getElementById('topUpAmount').value = '';
        } catch (err) {
            showToast("Failed to initiate M-Pesa top-up.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });

    loadWalletBalance();
    loadLedger();
});
