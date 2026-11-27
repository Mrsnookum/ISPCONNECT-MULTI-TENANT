document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    
    // --- 1. AUTHENTICATION & MULTI-TENANT CHECK ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    // Block access if the JWT token is missing
    if (!adminName || !ispToken) {
        window.location.href = 'register.html?view=login';
        return;
    }
    
    const navNameEl = document.getElementById("navName");
    const navAvatarEl = document.getElementById("navAvatar");
    if (navNameEl) navNameEl.textContent = adminName;
    if (navAvatarEl) navAvatarEl.textContent = adminName.substring(0, 2).toUpperCase();
    
    // Inject Dynamic ISP Branding if it exists
    if (companyName) {
        const sidebarLogo = document.getElementById("sidebar-logo-text");
        const navCompany = document.getElementById("navCompany");
        if (sidebarLogo) sidebarLogo.textContent = companyName;
        if (navCompany) navCompany.textContent = companyName;
    }

    // --- 2. DROPDOWN & LOGOUT LOGIC ---
    const profileToggleBtn = document.getElementById("profileToggleBtn");
    const profileDropdown = document.getElementById("profileDropdown");

    if (profileToggleBtn && profileDropdown) {
        profileToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation(); 
            profileDropdown.classList.toggle("active");
        });

        document.addEventListener("click", (e) => {
            if (!profileToggleBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove("active");
            }
        });
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            localStorage.removeItem("companyName");
            window.location.href = 'register.html?view=login';
        });
    }

    // --- 3. MOBILE SIDEBAR TOGGLE ---
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");
    const mobileToggle = document.getElementById("mobileToggle");

    function toggleSidebar() {
        if (sidebar) sidebar.classList.toggle("open");
        if (mobileOverlay) mobileOverlay.classList.toggle("active");
    }
    
    if (mobileToggle) mobileToggle.addEventListener("click", toggleSidebar);
    if (mobileOverlay) mobileOverlay.addEventListener("click", toggleSidebar);

    // --- 4. TOAST NOTIFICATION SYSTEM ---
    function showToast(message, type = "error") {
        const container = document.getElementById("toastContainer");
        if (!container) return;
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

    // --- 5. CHART SETUP ---
    let mainChart;
    const chartCanvas = document.getElementById('revenueChart');
    const ctx = chartCanvas ? chartCanvas.getContext('2d') : null;
    const gradient = ctx ? ctx.createLinearGradient(0, 0, 0, 260) : null;
    if (gradient) {
        gradient.addColorStop(0, 'rgba(0, 123, 255, 0.14)');
        gradient.addColorStop(1, 'rgba(0, 123, 255, 0)');
    }

    function initOrUpdateChart(labels = [], dataPoints = []) {
        if (!ctx) return;
        if (mainChart) {
            mainChart.data.labels = labels;
            mainChart.data.datasets[0].data = dataPoints;
            mainChart.update();
            return;
        }

        const isCompact = window.innerWidth < 640;

        mainChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: dataPoints,
                    borderColor: '#007BFF',
                    backgroundColor: gradient || 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#007BFF',
                    pointBorderWidth: 2,
                    pointRadius: isCompact ? 3 : 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#FFFFFF', titleColor: '#94A3B8', bodyColor: '#1E293B',
                        borderColor: '#E2E8F0', borderWidth: 1, padding: 10, displayColors: false,
                        callbacks: { label: (c) => 'KSh ' + Number(c.parsed.y || 0).toLocaleString() }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: '#94A3B8', padding: 8, maxTicksLimit: isCompact ? 5 : 8 }
                    },
                    y: {
                        border: { display: false },
                        grid: { color: '#F1F5F9' },
                        suggestedMax: 1000,
                        ticks: {
                            color: '#94A3B8',
                            padding: isCompact ? 8 : 14,
                            callback: (v) => {
                                if (v === 0) return 'KSh 0';
                                if (v >= 1000) return 'KSh ' + Number((v / 1000).toFixed(1)) + 'k';
                                return 'KSh ' + Math.round(v);
                            }
                        },
                        min: 0
                    }
                }
            }
        });
    }

    // --- 6. DATA ENGINE & FETCH ---
    const API_BASE = 'https://api.ispconnect.co.ke/api/admin';
    const sparklineInstances = {}; 

    function updateKPI(id, dataArray, formatAsCurrency = false) {
        const valEl = document.getElementById(`val-${id}`);
        if (!valEl) return;

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            valEl.textContent = formatAsCurrency ? "KSh 0" : "0";
            return;
        }

        const current = Number(dataArray[dataArray.length - 1] || 0);
        valEl.textContent = formatAsCurrency ? `KSh ${current.toLocaleString()}` : current.toLocaleString();

        const badge = document.getElementById(`badge-${id}`);
        const icon = document.getElementById(`icon-${id}`);
        const pctEl = document.getElementById(`pct-${id}`);

        if (dataArray.length < 2) {
            if (pctEl) pctEl.textContent = "0%";
            return;
        }

        const previous = Number(dataArray[dataArray.length - 2] || 0);
        const diff = current - previous;
        const percent = previous === 0 ? (current > 0 ? 100 : 0) : Math.abs((diff / previous) * 100).toFixed(1);
        
        if (pctEl) pctEl.textContent = `${percent}%`;

        if (badge && icon) {
            if (diff >= 0) {
                badge.className = "trend-badge trend-up";
                icon.setAttribute("data-lucide", "arrow-up-right");
            } else {
                badge.className = "trend-badge trend-down";
                icon.setAttribute("data-lucide", "arrow-down-right");
            }
        }
    }

    function drawSparkline(canvasId, dataArray, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !Array.isArray(dataArray) || dataArray.length === 0) return;

        if (sparklineInstances[canvasId]) {
            sparklineInstances[canvasId].destroy();
        }
        
        sparklineInstances[canvasId] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: dataArray.map((_, i) => i),
                datasets: [{ data: dataArray, borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                animation: false
            }
        });
    }

    function renderTables(payments = [], packages = []) {
        const tbodyPay = document.getElementById('table-payments');
        if (tbodyPay) {
            tbodyPay.innerHTML = payments.length ? payments.map(p => {
                const stat = (p.status || "").toLowerCase();
                const statusClass = (stat === 'success' || stat === 'completed') ? 'status-success' 
                                  : stat === 'pending' ? 'status-pending' 
                                  : 'status-failed';
                
                const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                return `
                    <tr>
                        <td><div class="customer-cell"><div class="avatar-sm">${initial}</div> ${p.name || 'Unknown'}</div></td>
                        <td>KSh ${Number(p.amount || 0).toLocaleString()}</td>
                        <td><span class="status-pill ${statusClass}"><div class="dot"></div> ${p.status || 'Unknown'}</span></td>
                    </tr>
                `;
            }).join('') : `<tr><td colspan="3" style="color: var(--text-muted); text-align: center; padding: 20px 0;">No recent payments</td></tr>`;
        }

        const tbodyPack = document.getElementById('table-packages');
        if (tbodyPack) {
            tbodyPack.innerHTML = packages.length ? packages.map(p => {
                const pct = Math.max(0, Math.min(100, Number(p.percent || 0)));
                return `
                    <tr>
                        <td><div class="customer-cell"><i data-lucide="clock" width="14" color="#94A3B8"></i> ${p.name}</div></td>
                        <td>${Number(p.count || 0)}</td>
                        <td>
                            <div class="progress-wrapper">
                                <div class="progress-track"><div class="progress-fill" style="width: ${pct}%;"></div></div>
                                <div class="progress-text">KSh ${Number(p.revenue || 0).toLocaleString()} (${pct}%)</div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : `<tr><td colspan="3" style="color: var(--text-muted); text-align: center; padding: 20px 0;">No package sales yet</td></tr>`;
        }
    }

    async function loadDashboardData(period) {
        try {
            // MULTI-TENANT FIX: Attach the JWT token to the headers so the backend can verify the Tenant ID
            const res = await fetch(`${API_BASE}/dashboard-stats?period=${period}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ispToken}`
                }
            });
            
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem("adminName");
                localStorage.removeItem("isp_token");
                window.location.href = 'register.html?view=login';
                return;
            }
            
            if (!res.ok) throw new Error("Failed to fetch dashboard data.");
            
            const data = await res.json();

            updateKPI("revenue", data.revenue?.trend, true);
            drawSparkline("spark-revenue", data.revenue?.trend, "#00B37E");

            updateKPI("customers", data.customers?.trend);
            drawSparkline("spark-customers", data.customers?.trend, "#007BFF");

            updateKPI("online", data.online?.trend);
            drawSparkline("spark-online", data.online?.trend, "#8B5CF6");

            updateKPI("sessions", data.sessions?.trend);
            drawSparkline("spark-sessions", data.sessions?.trend, "#007BFF");

            initOrUpdateChart(data.chart?.labels || [], data.chart?.data || []);
            renderTables(data.recent_payments || [], data.packages || []);

            if (data.router) {
                const uptimeEl = document.getElementById('router-uptime');
                const hotspotEl = document.getElementById('hotspot-users');
                const radiusEl = document.getElementById('radius-uptime');
                if (uptimeEl) {
                    const uptimeText = String(data.router.main_uptime || '0 / 0 Online');
                    uptimeEl.textContent = uptimeText;

                    // Dynamically flip the "• Online" / "• Offline" badge above #router-uptime
                    const statusBadge = uptimeEl.previousElementSibling;
                    if (statusBadge) {
                        const match = uptimeText.match(/^(\d+)/);
                        const onlineCount = match ? parseInt(match[1], 10) : 0;
                        const isOnline = onlineCount > 0;
                        statusBadge.style.color = isOnline ? '#00B37E' : '#EF4444';
                        statusBadge.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${isOnline ? '#00B37E' : '#EF4444'};margin-right:5px;vertical-align:middle;"></span>${isOnline ? 'Online' : 'Offline'}`;
                    }
                }
                if (hotspotEl) hotspotEl.textContent = data.router.hotspot_active;
                if (radiusEl) radiusEl.textContent = data.router.radius_uptime;
            }

            lucide.createIcons();

        } catch (err) {
            console.error(err);
            showToast("Cannot connect to backend. Showing zero-state data.");
        }
    }

    const toggles = document.querySelectorAll('.toggles button');
    toggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toggles.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const period = e.target.getAttribute('data-period');
            loadDashboardData(period);
        });
    });

    // --- 7. ONBOARDING CHECKLIST LOADER ---
    async function loadOnboardingChecklist() {
        const card = document.getElementById('onboardingCard');
        if (!card || localStorage.getItem('isp_onboarding_dismissed') === 'true') return;

        try {
            const res = await fetch('https://api.ispconnect.co.ke/api/billing/onboarding-checklist', {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (!res.ok) return;

            const data = await res.json();
            if (data.complete) {
                card.classList.remove('visible');
                return;
            }

            const stepKeys = ['mikrotik', 'payhero', 'packages', 'activated'];
            let doneCount = 0;

            stepKeys.forEach((key, index) => {
                const el = document.getElementById(`step-${key}`);
                if (!el) return;
                const badge = el.querySelector('.step-badge');
                if (data.steps && data.steps[key]) {
                    doneCount++;
                    el.classList.add('done');
                    if (badge) badge.innerHTML = '<i data-lucide="check" width="14"></i>';
                } else {
                    el.classList.remove('done');
                    if (badge) badge.textContent = String(index + 1);
                }
            });

            const pct = Math.round((doneCount / stepKeys.length) * 100);
            const fillEl = document.getElementById('onboardingProgressFill');
            const labelEl = document.getElementById('onboardingProgressLabel');
            if (fillEl) fillEl.style.width = `${pct}%`;
            if (labelEl) labelEl.textContent = `${doneCount} of ${stepKeys.length} completed`;

            const trialPill = document.getElementById('onboardingTrialPill');
            const trialText = document.getElementById('onboardingTrialText');
            const actHint = document.getElementById('step-activated-hint');
            if (data.is_trial && data.days_left !== null && trialPill && trialText) {
                trialPill.style.display = 'inline-flex';
                trialText.textContent = `${data.days_left} day${data.days_left === 1 ? '' : 's'} left in trial`;
                if (actHint) actHint.textContent = `KES ${Number(data.monthly_fee || 1300).toLocaleString()} after trial`;
            }

            card.classList.add('visible');
            lucide.createIcons({ root: card });
        } catch (err) {
            console.error('Checklist load error:', err);
        }
    }

    const dismissOnboardingBtn = document.getElementById('dismissOnboardingBtn');
    if (dismissOnboardingBtn) {
        dismissOnboardingBtn.addEventListener('click', () => {
            localStorage.setItem('isp_onboarding_dismissed', 'true');
            const card = document.getElementById('onboardingCard');
            if (card) card.classList.remove('visible');
        });
    }

    loadOnboardingChecklist();
    loadDashboardData('7D');
});
