document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    
    // --- AUTHENTICATION & SHELL LOGIC ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    if (!adminName || !ispToken) {
        window.location.href = 'register.html?view=login';
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

    document.getElementById("profileToggleBtn").addEventListener("click", (e) => {
        e.stopPropagation(); 
        document.getElementById("profileDropdown").classList.toggle("active");
    });
    
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.profile-dropdown-container')) {
            document.getElementById("profileDropdown").classList.remove("active");
        }
    });
    
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("adminName");
        localStorage.removeItem("isp_token");
        localStorage.removeItem("companyName");
        window.location.href = 'register.html?view=login';
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

    window.showToast = function(message, type = "error") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        const icon = type === "error" ? "alert-circle" : "check-circle";
        toast.innerHTML = `<i data-lucide="${icon}" width="18"></i> <span>${message}</span>`;
        container.appendChild(toast);
        lucide.createIcons({ root: toast });
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function checkAuthError(res) {
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            window.location.href = '/register.html?view=login';
            return true;
        }
        return false;
    }

    // --- SESSIONS DATA ENGINE ---
    const API_BASE = 'https://api.ispconnect.co.ke/api/admin';
    let allSessions = [];
    let currentFilter = 'active';

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 MB';
        const mb = bytes / (1024 * 1024);
        if (mb >= 1024) {
            return (mb / 1024).toFixed(2) + ' GB';
        }
        return mb.toFixed(1) + ' MB';
    }

    function formatDate(dateString) {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleString('en-KE', { 
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        });
    }

    async function loadSessions() {
        try {
            const res = await fetch(`${API_BASE}/sessions`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error("Failed");
            
            allSessions = await res.json();
            
            updateKPIs(allSessions);
            renderSessions();
        } catch (err) {
            console.error(err);
            showToast("Failed to fetch live FreeRADIUS sessions.", "error");
        }
    }

    function updateKPIs(data) {
        let activeCount = 0;
        let totalBytes = 0;

        data.forEach(s => {
            const isLive = !s.acctstoptime;
            if (isLive) activeCount++;
            
            const up = s.acctinputoctets || 0;
            const down = s.acctoutputoctets || 0;
            totalBytes += (up + down);
        });

        document.getElementById('kpi-active').textContent = activeCount;
        document.getElementById('kpi-data').textContent = formatBytes(totalBytes);
        document.getElementById('kpi-total').textContent = data.length;
    }

    function renderSessions() {
        const tbody = document.getElementById('sessions-tbody');
        const searchTerm = document.getElementById('searchSessions').value.toLowerCase();
        
        const filteredData = allSessions.filter(s => {
            const isLive = !s.acctstoptime;
            if (currentFilter === 'active' && !isLive) return false;
            if (currentFilter === 'fup' && !s.fup_throttled) return false;
            
            const username = (s.username || '').toLowerCase();
            const ip = (s.framedipaddress || '').toLowerCase();
            const mac = (s.callingstationid || '').toLowerCase();
            
            return username.includes(searchTerm) || ip.includes(searchTerm) || mac.includes(searchTerm);
        });

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">No accounting telemetry sessions found.</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredData.map(s => {
            const isLive = !s.acctstoptime;
            const isFup = Boolean(s.fup_throttled);
            const statusClass = isLive ? 'status-live' : 'status-closed';
            const statusText = isLive ? 'LIVE' : 'CLOSED';
            
            const username = s.username || 'Anonymous';
            const encodedUser = encodeURIComponent(username);
            const ip = s.framedipaddress || 'No IP';
            const mac = s.callingstationid || 'No MAC';
            
            const upload = formatBytes(s.acctinputoctets);
            const download = formatBytes(s.acctoutputoctets);

            const fupBadge = isFup ? `<span class="fup-badge">FUP</span>` : '';
            
            const actionButtons = [];
            if (isFup && s.username) {
                actionButtons.push(`
                    <button class="action-btn-fup" onclick="resetUserFup('${encodedUser}')" title="Restore full speed">
                        <i data-lucide="rotate-ccw" width="14"></i> Reset FUP
                    </button>
                `);
            }
            if (isLive) {
                actionButtons.push(`
                    <button class="action-btn" onclick="terminateSession('${s.radacctid || s.id}')">
                        <i data-lucide="power" width="14"></i> Disconnect
                    </button>
                `);
            }

            const actions = actionButtons.length > 0
                ? `<div class="actions-wrap">${actionButtons.join('')}</div>`
                : `<span style="font-size: 0.75rem; color: var(--text-muted);">Session Ended</span>`;

            return `
                <tr>
                    <td><span class="code-pill">${username}</span>${fupBadge}</td>
                    <td>
                        <div style="font-weight: 600; color: var(--text-dark);">${ip}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${mac}</div>
                    </td>
                    <td>
                        <div class="data-usage">
                            <div>↑ ${upload}</div>
                            <div>↓ ${download}</div>
                        </div>
                    </td>
                    <td style="font-weight: 500;">${formatDate(s.acctstarttime)}</td>
                    <td><span class="status-pill ${statusClass}"><div class="dot"></div> ${statusText}</span></td>
                    <td style="text-align: right;">${actions}</td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    }

    // Filter switching
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderSessions();
        });
    });
    document.getElementById('searchSessions').addEventListener('input', renderSessions);

    // Reset FUP Action
    window.resetUserFup = async function(encodedUsername) {
        const username = decodeURIComponent(encodedUsername);
        try {
            const res = await fetch(`${API_BASE}/sessions/${encodedUsername}/reset-fup`, {
                method: 'POST',
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            
            if (checkAuthError(res)) return;
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to reset FUP");
            }
            
            const data = await res.json();
            showToast(`FUP reset for ${username}${data.coa_ack ? ' (Live speed restored)' : ''}.`, "success");
            loadSessions();
        } catch (err) {
            console.error(err);
            showToast(err.message || "Failed to reset FUP for user.", "error");
        }
    };

    // Disconnect Action
    window.terminateSession = async function(sessionId) {
        try {
            const res = await fetch(`${API_BASE}/sessions/${sessionId}/disconnect`, {
                method: 'POST',
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error("Failed to disconnect");
            
            showToast("Disconnect command sent to router.", "success");
            loadSessions();
        } catch (err) {
            console.error(err);
            showToast("Failed to disconnect active user session.", "error");
        }
    };

    loadSessions();
});
