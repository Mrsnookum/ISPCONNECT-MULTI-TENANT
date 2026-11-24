document.addEventListener("DOMContentLoaded", () => {
    const API_GM = "https://api.ispconnect.co.ke/api/godmode";
    const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

    let gmToken = localStorage.getItem("godmode_token") || "";
    let currentPeriod = "monthly";
    let currentMonth = new Date().toISOString().slice(0, 7);
    let currentView = "overview";
    let tenantStatusFilter = "all";
    let ledgerTypeFilter = "all";

    let cachedOverview = null;
    let cachedTenants = [];
    let cachedLedger = [];
    let cachedRouters = [];
    let cachedAudit = [];

    const charts = {};
    let idleTimer = null;

    // =========================================================
    // 1. UTILITIES, THEME & TOASTS
    // =========================================================
    function escapeHtml(val) {
        return String(val ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function fmtKES(num) {
        const n = Number(num || 0);
        return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
    }

    function fmtCompactKES(num) {
        const n = Number(num || 0);
        if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `KES ${(n / 1_000).toFixed(1)}k`;
        return `KES ${Math.round(n)}`;
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("en-KE", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
    }

    function showToast(msg, type = "success") {
        const container = document.getElementById("toastContainer");
        if (!container) return;
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        const icon = type === "error" ? "alert-circle" : "check-circle-2";
        el.innerHTML = `<i data-lucide="${icon}" width="17"></i><span>${escapeHtml(msg)}</span>`;
        container.appendChild(el);
        lucide.createIcons({ root: el });
        setTimeout(() => el.classList.add("show"), 15);
        setTimeout(() => {
            el.classList.remove("show");
            setTimeout(() => el.remove(), 260);
        }, 3500);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("godmode_theme", theme);
        const icon = document.getElementById("themeIcon");
        if (icon) {
            icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
            lucide.createIcons({ root: document.getElementById("themeToggleBtn") });
        }
        if (cachedOverview) renderCharts(cachedOverview);
    }

    const savedTheme = localStorage.getItem("godmode_theme") || "dark";
    applyTheme(savedTheme);

    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
        const curr = document.documentElement.getAttribute("data-theme");
        applyTheme(curr === "dark" ? "light" : "dark");
    });

    // =========================================================
    // 2. AUTH & API WRAPPER
    // =========================================================
    function logoutGodMode(reasonMsg) {
        gmToken = "";
        localStorage.removeItem("godmode_token");
        localStorage.removeItem("godmode_email");
        clearTimeout(idleTimer);
        document.getElementById("appShell")?.classList.add("hidden");
        document.getElementById("authGate")?.classList.remove("hidden");
        if (reasonMsg) showToast(reasonMsg, "error");
    }

    function resetIdle() {
        if (!gmToken) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => logoutGodMode("God Mode locked due to inactivity."), IDLE_LIMIT_MS);
    }

    ["mousemove", "keydown", "click", "touchstart"].forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));

    async function apiFetch(path, options = {}) {
        const res = await fetch(`${API_GM}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(gmToken ? { Authorization: `Bearer ${gmToken}` } : {}),
                ...(options.headers || {})
            }
        });
        if (res.status === 401 || res.status === 403) {
            logoutGodMode("Super Admin session expired.");
            throw new Error("Unauthorized");
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Request failed");
        return data;
    }

    // Login Form
    document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const errBox = document.getElementById("authError");
        const btn = document.getElementById("loginSubmitBtn");

        errBox.classList.remove("show");
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16"></i> Authenticating...`;
        lucide.createIcons({ root: btn });

        try {
            const res = await fetch(`${API_GM}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Invalid credentials");

            gmToken = data.token;
            localStorage.setItem("godmode_token", gmToken);
            localStorage.setItem("godmode_email", data.email);
            document.getElementById("loginPassword").value = "";
            enterApp(data.email);
        } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.add("show");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="lock" width="16"></i> Unlock God Mode`;
            lucide.createIcons({ root: btn });
        }
    });

    document.getElementById("logoutSuperBtn")?.addEventListener("click", () => logoutGodMode("Signed out of God Mode."));

    async function enterApp(email) {
        document.getElementById("authGate")?.classList.add("hidden");
        document.getElementById("appShell")?.classList.remove("hidden");
        const lbl = document.getElementById("superEmailLabel");
        if (lbl) lbl.textContent = email || "Super Admin";
        const mp = document.getElementById("monthPicker");
        if (mp && !mp.value) mp.value = currentMonth;
        resetIdle();
        lucide.createIcons();
        await refreshEverything();
    }

    // Verify existing token on boot
    (async function boot() {
        lucide.createIcons();
        if (!gmToken) return;
        try {
            const info = await apiFetch("/verify");
            enterApp(info.email || localStorage.getItem("godmode_email"));
        } catch (_) {
            logoutGodMode();
        }
    })();

    // =========================================================
    // 3. NAVIGATION, SIDEBAR & DRAWER
    // =========================================================
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");

    function closeSidebar() {
        sidebar?.classList.remove("open");
        mobileOverlay?.classList.remove("active");
    }

    document.getElementById("menuToggleBtn")?.addEventListener("click", () => {
        sidebar?.classList.toggle("open");
        mobileOverlay?.classList.toggle("active");
    });
    document.getElementById("mobileMoreBtn")?.addEventListener("click", () => {
        sidebar?.classList.add("open");
        mobileOverlay?.classList.add("active");
    });
    mobileOverlay?.addEventListener("click", closeSidebar);

    function switchView(viewName) {
        currentView = viewName;
        document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
        document.getElementById(`view-${viewName}`)?.classList.add("active");

        document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
        document.querySelectorAll(".mob-nav-btn[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
        closeSidebar();

        if (viewName === "ledger" && !cachedLedger.length) loadLedger();
        if (viewName === "routers" && !cachedRouters.length) loadRouters();
        if (viewName === "audit" && !cachedAudit.length) loadAuditLogs();
        if (viewName === "broadcast") updateBroadcastPreview();
    }

    document.querySelectorAll(".nav-btn[data-view], .mob-nav-btn[data-view]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    document.getElementById("viewAllTenantsBtn")?.addEventListener("click", () => switchView("tenants"));

    // Alert Notification Drawer
    const alertDrawer = document.getElementById("alertDrawer");
    const drawerBackdrop = document.getElementById("drawerBackdrop");
    function toggleDrawer(open) {
        alertDrawer?.classList.toggle("open", open);
        drawerBackdrop?.classList.toggle("open", open);
    }
    document.getElementById("alertsToggleBtn")?.addEventListener("click", () => toggleDrawer(true));
    document.getElementById("closeDrawerBtn")?.addEventListener("click", () => toggleDrawer(false));
    drawerBackdrop?.addEventListener("click", () => toggleDrawer(false));

    // Custom Modals Close Handlers
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById(btn.dataset.closeModal)?.classList.remove("open");
        });
    });

    // =========================================================
    // 4. DATA LOADERS
    // =========================================================
    async function refreshEverything() {
        try {
            await Promise.all([loadOverview(), loadTenants(), loadLedger(), loadRouters(), loadAuditLogs()]);
        } catch (err) {
            if (err.message !== "Unauthorized") showToast(err.message, "error");
        }
    }

    async function loadOverview() {
        const data = await apiFetch(`/overview?period=${currentPeriod}&month=${encodeURIComponent(currentMonth)}`);
        cachedOverview = data;
        renderOverview(data);
    }

    async function loadTenants() {
        const data = await apiFetch("/tenants");
        cachedTenants = data.tenants || [];
        document.getElementById("navTenantCount").textContent = String(cachedTenants.length);
        renderTenantsTables();
        updateBroadcastPreview();
    }

    async function loadLedger() {
        const data = await apiFetch(`/ledger?tx_type=${encodeURIComponent(ledgerTypeFilter)}&limit=150`);
        cachedLedger = data.transactions || [];
        renderLedgerTable();
    }

    async function loadRouters() {
        const data = await apiFetch("/routers");
        cachedRouters = data.routers || [];
        document.getElementById("navRouterCount").textContent = String(cachedRouters.length);
        document.getElementById("totalRoutersLabel").textContent = String(cachedRouters.length);
        renderRoutersTable();
    }

    async function loadAuditLogs() {
        const data = await apiFetch("/audit-logs?limit=120");
        cachedAudit = data.logs || [];
        renderAuditTable();
    }

    // Period & Month Controls
    document.getElementById("periodToggle")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-period]");
        if (!btn) return;
        currentPeriod = btn.dataset.period;
        document.querySelectorAll("#periodToggle button").forEach(b => b.classList.toggle("active", b === btn));
        loadOverview().catch(err => showToast(err.message, "error"));
    });

    document.getElementById("monthPicker")?.addEventListener("change", (e) => {
        if (e.target.value) {
            currentMonth = e.target.value;
            currentPeriod = "monthly";
            document.querySelectorAll("#periodToggle button").forEach(b => b.classList.toggle("active", b.dataset.period === "monthly"));
            loadOverview().catch(err => showToast(err.message, "error"));
        }
    });

    document.getElementById("refreshAllBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("refreshAllBtn");
        btn.disabled = true;
        await refreshEverything();
        btn.disabled = false;
        showToast("Dashboard synced with live data.");
    });

    // Global Search
    document.getElementById("globalSearchInput")?.addEventListener("input", (e) => {
        const q = e.target.value;
        if (currentView === "overview" && q.trim().length >= 2) switchView("tenants");
        if (currentView === "tenants") {
            document.getElementById("tenantSearchInput").value = q;
            renderTenantsTables();
        } else if (currentView === "ledger") {
            document.getElementById("ledgerSearchInput").value = q;
            renderLedgerTable();
        } else if (currentView === "routers") {
            document.getElementById("routerSearchInput").value = q;
            renderRoutersTable();
        }
    });

    // =========================================================
    // 5. OVERVIEW RENDERING & CHART.JS ENGINE
    // =========================================================
    const trackBackgroundPlugin = {
        id: "trackBackground",
        beforeDatasetsDraw(chart, args, pluginOptions) {
            if (!pluginOptions || !pluginOptions.enabled) return;
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales.x) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) return;

            ctx.save();
            ctx.fillStyle = pluginOptions.color || "rgba(148,163,184,0.12)";
            meta.data.forEach((bar) => {
                const w = bar.width || 10;
                const x = bar.x - w / 2;
                const y = chartArea.top;
                const h = chartArea.bottom - chartArea.top;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4);
                else ctx.rect(x, y, w, h);
                ctx.fill();
            });
            ctx.restore();
        }
    };
    Chart.register(trackBackgroundPlugin);

    function renderOverview(data) {
        const k = data.kpis;
        document.getElementById("kpiSaasRev").textContent = fmtKES(k.saas_revenue.value);
        document.getElementById("kpiSaasGrowth").textContent = `${k.saas_revenue.growth_pct >= 0 ? "+" : ""}${k.saas_revenue.growth_pct}%`;

        document.getElementById("kpiActiveIsps").textContent = String(k.active_isps.total);
        document.getElementById("kpiIspSub").textContent = `${k.active_isps.trial} on trial · ${k.active_isps.suspended} suspended · ${k.active_isps.pending} pending`;

        document.getElementById("kpiGmv").textContent = fmtCompactKES(k.ecosystem_gmv.value);
        document.getElementById("kpiGmvGrowth").textContent = `${k.ecosystem_gmv.growth_pct >= 0 ? "+" : ""}${k.ecosystem_gmv.growth_pct}%`;

        document.getElementById("kpiOnlineUsers").textContent = `${k.live_network.online_users.toLocaleString()} Users`;
        document.getElementById("kpiRoutersSub").textContent = `${k.live_network.online_routers} / ${k.live_network.total_routers} MikroTik routers online`;

        // Perf footer
        const pf = data.performance_chart.footer;
        document.getElementById("footSubs").textContent = fmtKES(pf.subscriptions);
        document.getElementById("footWallets").textContent = fmtKES(pf.wallet_topups);
        document.getElementById("footOnbSms").textContent = fmtKES(pf.onboarding_sms);

        // Donut center & legend
        document.getElementById("donutTotalVal").textContent = fmtCompactKES(data.revenue_streams.total);
        const legendEl = document.getElementById("streamLegend");
        legendEl.innerHTML = data.revenue_streams.items.map(it => `
            <div class="stream-item">
                <div class="stream-left"><span class="stream-dot" style="background:${it.color};"></span>${escapeHtml(it.label)}</div>
                <span class="stream-pct">${it.pct}%</span>
            </div>
        `).join("");

        // Daily Inflows summary
        document.getElementById("dailyTxBadge").textContent = `${data.daily_inflows.total_tx} tx`;
        document.getElementById("dailyHighest").textContent = String(data.daily_inflows.highest_day);
        document.getElementById("dailyAvg").textContent = String(data.daily_inflows.avg_per_day);

        // Peak hour pill
        document.getElementById("peakHourBadge").textContent = `Peak: ${data.peak_hours.peak_label}`;

        // Top ISPs Ranked List
        const topEl = document.getElementById("topIspsList");
        topEl.innerHTML = data.top_isps.length ? data.top_isps.map((isp, idx) => `
            <div class="ranked-row">
                <div class="ranked-top">
                    <div class="ranked-name"><span class="rank-num">${idx + 1}</span><span>${escapeHtml(isp.business_name)}</span></div>
                    <strong style="font-size:0.78rem;">${fmtKES(isp.revenue)}</strong>
                </div>
                <div class="rank-track"><div class="rank-fill" style="width:${Math.max(4, isp.percent)}%;"></div></div>
            </div>
        `).join("") : `<div style="font-size:0.82rem;color:var(--text-muted);text-align:center;padding:24px 0;">No ISP sales recorded in this period.</div>`;

        // Alerts Drawer + Badge
        const alerts = data.alerts || [];
        const badge = document.getElementById("alertCountBadge");
        badge.textContent = String(alerts.length);
        badge.classList.toggle("show", alerts.length > 0);
        const drawerBody = document.getElementById("alertDrawerBody");
        drawerBody.innerHTML = alerts.length ? alerts.map(a => {
            const color = a.type === "warning" ? "#F59E0B" : a.type === "pending" ? "#94A3B8" : "#3B82F6";
            const bg = a.type === "warning" ? "rgba(245,158,11,0.16)" : a.type === "pending" ? "rgba(148,163,184,0.16)" : "rgba(37,99,235,0.16)";
            const icon = a.type === "warning" ? "alarm-clock" : a.type === "pending" ? "user-plus" : "wallet";
            return `
                <div class="alert-item" data-jump-tenant="${escapeHtml(a.tenant_id || "")}">
                    <div class="alert-icon" style="background:${bg};color:${color};"><i data-lucide="${icon}" width="16"></i></div>
                    <div>
                        <div style="font-size:0.82rem;font-weight:600;">${escapeHtml(a.title)}</div>
                        <div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(a.subtitle)}</div>
                    </div>
                </div>
            `;
        }).join("") : `<div style="text-align:center;color:var(--text-muted);font-size:0.82rem;padding:28px 0;">All systems healthy. No active alerts.</div>`;

        drawerBody.querySelectorAll("[data-jump-tenant]").forEach(item => {
            item.addEventListener("click", () => {
                toggleDrawer(false);
                switchView("tenants");
            });
        });

        // Expiring Soon in Watchdog tab
        const expEl = document.getElementById("expiringSoonList");
        const expList = data.expiring_soon || [];
        expEl.innerHTML = expList.length ? expList.map(x => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);flex-wrap:wrap;">
                <div>
                    <div style="font-weight:600;font-size:0.84rem;">${escapeHtml(x.business_name)}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);">${escapeHtml(x.status.toUpperCase())} · ${x.days_left} day(s) left</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="window.__gmSub('${escapeHtml(x.tenant_id)}')">Extend</button>
                    <button class="btn btn-primary btn-sm" onclick="window.__gmSms('${escapeHtml(x.tenant_id)}')">SMS</button>
                </div>
            </div>
        `).join("") : `<div style="font-size:0.82rem;color:var(--text-muted);padding:12px 0;">No active or trial ISPs expiring in the next 3 days.</div>`;

        renderCharts(data);
        lucide.createIcons();
    }

    function destroyChart(key) {
        if (charts[key]) {
            charts[key].destroy();
            delete charts[key];
        }
    }

    function drawSpark(key, canvasId, arr, color) {
        destroyChart(key);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const pts = (arr && arr.length) ? arr : [0, 0, 0, 0, 0];
        charts[key] = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: pts.map((_, i) => i),
                datasets: [{ data: pts, borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    }

    function renderCharts(data) {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const gridColor = isDark ? "rgba(148,163,184,0.1)" : "#F1F5F9";
        const tickColor = isDark ? "#94A3B8" : "#64748B";
        const surfaceBg = isDark ? "#121826" : "#FFFFFF";
        const trackColor = isDark ? "rgba(148,163,184,0.12)" : "#EEF2F7";
        const tooltipBg = isDark ? "#1E293B" : "#FFFFFF";
        const tooltipText = isDark ? "#F8FAFC" : "#0F172A";

        // 1. KPI Sparklines
        drawSpark("s1", "sparkSaas", data.kpis.saas_revenue.sparkline, "#00B37E");
        drawSpark("s2", "sparkIsps", [1, 2, 2, 3, Math.max(1, data.kpis.active_isps.total)], "#2563EB");
        drawSpark("s3", "sparkGmv", data.kpis.ecosystem_gmv.sparkline, "#8B5CF6");
        drawSpark("s4", "sparkNet", [1, 2, 3, Math.max(1, data.kpis.live_network.total_routers)], "#F59E0B");

        // 2. Platform Revenue Performance Combo Chart (Bars + Hollow-Node Line)
        destroyChart("perf");
        const perfCanvas = document.getElementById("perfChart");
        if (perfCanvas) {
            charts.perf = new Chart(perfCanvas.getContext("2d"), {
                data: {
                    labels: data.performance_chart.labels,
                    datasets: [
                        {
                            type: "bar",
                            label: "SaaS Revenue (KES)",
                            data: data.performance_chart.revenue_bars,
                            backgroundColor: "#2563EB",
                            borderRadius: 5,
                            maxBarThickness: 18,
                            yAxisID: "y"
                        },
                        {
                            type: "line",
                            label: "Transactions",
                            data: data.performance_chart.tx_line,
                            borderColor: "#38BDF8",
                            backgroundColor: surfaceBg,
                            pointBackgroundColor: surfaceBg,
                            pointBorderColor: "#38BDF8",
                            pointBorderWidth: 2,
                            pointRadius: 3.5,
                            tension: 0.35,
                            yAxisID: "y1"
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: tooltipBg, titleColor: tickColor, bodyColor: tooltipText,
                            borderColor: gridColor, borderWidth: 1, padding: 10
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 8 } },
                        y: {
                            position: "left", beginAtZero: true, suggestedMax: 1000,
                            grid: { color: gridColor }, border: { display: false },
                            ticks: {
                                color: tickColor,
                                callback: (v) => v === 0 ? "0" : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)
                            }
                        },
                        y1: { position: "right", beginAtZero: true, suggestedMax: 5, grid: { display: false }, ticks: { display: false }, border: { display: false } }
                    }
                }
            });
        }

        // 3. Revenue by Stream Donut
        destroyChart("donut");
        const donutCanvas = document.getElementById("streamDonut");
        if (donutCanvas) {
            const vals = data.revenue_streams.items.map(i => i.amount);
            const hasAny = vals.some(v => v > 0);
            charts.donut = new Chart(donutCanvas.getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: hasAny ? data.revenue_streams.items.map(i => i.label) : ["No Revenue Yet"],
                    datasets: [{
                        data: hasAny ? vals : [1],
                        backgroundColor: hasAny ? data.revenue_streams.items.map(i => i.color) : [trackColor],
                        borderWidth: 0, hoverOffset: 5
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: "70%",
                    plugins: { legend: { display: false }, tooltip: { enabled: hasAny } }
                }
            });
        }

        // 4. Daily Platform Inflows (With Background Tracks)
        destroyChart("inflows");
        const infCanvas = document.getElementById("dailyInflowsChart");
        if (infCanvas) {
            charts.inflows = new Chart(infCanvas.getContext("2d"), {
                type: "bar",
                data: {
                    labels: data.daily_inflows.labels,
                    datasets: [{
                        label: "Transactions",
                        data: data.daily_inflows.values,
                        backgroundColor: "#2563EB",
                        borderRadius: 4,
                        maxBarThickness: 12
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        trackBackground: { enabled: true, color: trackColor }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 6 } },
                        y: { beginAtZero: true, suggestedMax: 5, grid: { color: gridColor }, border: { display: false }, ticks: { color: tickColor, precision: 0 } }
                    }
                }
            });
        }

        // 5. Peak Hotspot Activity by Hour (24h With Background Tracks)
        destroyChart("peak");
        const peakCanvas = document.getElementById("peakHourChart");
        if (peakCanvas) {
            charts.peak = new Chart(peakCanvas.getContext("2d"), {
                type: "bar",
                data: {
                    labels: data.peak_hours.labels,
                    datasets: [{
                        label: "Customer Sales",
                        data: data.peak_hours.values,
                        backgroundColor: "#2563EB",
                        borderRadius: 3,
                        maxBarThickness: 9
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        trackBackground: { enabled: true, color: trackColor }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 8 } },
                        y: { beginAtZero: true, suggestedMax: 5, grid: { color: gridColor }, border: { display: false }, ticks: { color: tickColor, precision: 0 } }
                    }
                }
            });
        }
    }

    // =========================================================
    // 6. TENANT COMMAND CENTER & GOD POWERS
    // =========================================================
    function statusBadgeHtml(status, daysLeft) {
        const s = (status || "pending").toLowerCase();
        const cls = s === "active" ? "st-active" : s === "trial" ? "st-trial" : s === "suspended" ? "st-suspended" : "st-pending";
        const lbl = s === "trial" ? `14d Trial${daysLeft !== null ? ` (${daysLeft}d)` : ""}`
                  : s === "active" ? `Active${daysLeft !== null ? ` (${daysLeft}d)` : ""}`
                  : s.charAt(0).toUpperCase() + s.slice(1);
        return `<span class="status-badge ${cls}"><span class="dot"></span>${escapeHtml(lbl)}</span>`;
    }

    function renderTenantsTables() {
        // Overview quick table (top 6)
        const ovBody = document.getElementById("overviewTenantsBody");
        if (ovBody) {
            const slice = cachedTenants.slice(0, 6);
            ovBody.innerHTML = slice.length ? slice.map(t => `
                <tr>
                    <td>
                        <div class="isp-cell">
                            <span class="isp-name">${escapeHtml(t.business_name)}</span>
                            <span class="isp-meta">${escapeHtml(t.support_phone || t.admin_email || "—")}</span>
                        </div>
                    </td>
                    <td>${statusBadgeHtml(t.status, t.days_left)}</td>
                    <td><strong>${fmtKES(t.payment_wallet_balance)}</strong></td>
                    <td>${fmtKES(t.sms_wallet_balance)} <span class="isp-meta">(${t.sms_units} SMS)</span></td>
                    <td>${t.routers_count}</td>
                    <td>
                        <div class="action-row">
                            <button class="btn btn-primary btn-sm" onclick="window.__gmWallet('${escapeHtml(t.id)}')">Credit Wallet</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmSub('${escapeHtml(t.id)}')">Extend</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmImpersonate('${escapeHtml(t.id)}')">Login As ISP</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmSms('${escapeHtml(t.id)}')">SMS</button>
                        </div>
                    </td>
                </tr>
            `).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No tenants found.</td></tr>`;
        }

        // Full Tenants Fleet Table
        const q = (document.getElementById("tenantSearchInput")?.value || "").trim().toLowerCase();
        const filtered = cachedTenants.filter(t => {
            const matchStatus = tenantStatusFilter === "all" || t.status === tenantStatusFilter;
            const matchQuery = !q ||
                (t.business_name || "").toLowerCase().includes(q) ||
                (t.admin_email || "").toLowerCase().includes(q) ||
                (t.support_phone || "").toLowerCase().includes(q);
            return matchStatus && matchQuery;
        });

        const fullBody = document.getElementById("fullTenantsBody");
        if (fullBody) {
            fullBody.innerHTML = filtered.length ? filtered.map(t => `
                <tr>
                    <td>
                        <div class="isp-cell">
                            <span class="isp-name">${escapeHtml(t.business_name)}</span>
                            <span class="isp-meta">${escapeHtml(t.admin_email || "No admin")} · ${escapeHtml(t.support_phone || "No phone")}</span>
                        </div>
                    </td>
                    <td>
                        ${statusBadgeHtml(t.status, t.days_left)}
                        <div class="isp-meta" style="margin-top:4px;">Exp: ${fmtDate(t.subscription_expires_at)}</div>
                    </td>
                    <td><strong>${fmtKES(t.payment_wallet_balance)}</strong></td>
                    <td><strong>${fmtKES(t.sms_wallet_balance)}</strong><div class="isp-meta">${t.sms_units} SMS left</div></td>
                    <td>
                        <div class="isp-meta">Routers: <strong>${t.routers_count}</strong> · Pkgs: <strong>${t.packages_count}</strong></div>
                        <div class="isp-meta">PayHero: <strong style="color:${t.payhero_configured ? "#10B981" : "#F59E0B"};">${t.payhero_configured ? "Ready" : "Not Set"}</strong></div>
                    </td>
                    <td>
                        <div class="action-row">
                            <button class="btn btn-primary btn-sm" onclick="window.__gmWallet('${escapeHtml(t.id)}')">Wallet</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmSub('${escapeHtml(t.id)}')">Plan</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmImpersonate('${escapeHtml(t.id)}')">Impersonate</button>
                            <button class="btn btn-outline btn-sm" onclick="window.__gmSms('${escapeHtml(t.id)}')">SMS</button>
                            <button class="btn btn-danger btn-sm" onclick="window.__gmDelete('${escapeHtml(t.id)}')" title="Purge Tenant"><i data-lucide="trash-2" width="13"></i></button>
                        </div>
                    </td>
                </tr>
            `).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">No ISPs match the current filter.</td></tr>`;
        }
        lucide.createIcons();
    }

    document.getElementById("tenantFilterPills")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-status]");
        if (!btn) return;
        tenantStatusFilter = btn.dataset.status;
        document.querySelectorAll("#tenantFilterPills button").forEach(b => b.classList.toggle("active", b === btn));
        renderTenantsTables();
    });
    document.getElementById("tenantSearchInput")?.addEventListener("input", renderTenantsTables);

    function findTenant(id) {
        return cachedTenants.find(t => t.id === id);
    }

    // God Power 1: Wallet Adjust Modal
    window.__gmWallet = (id) => {
        const t = findTenant(id);
        if (!t) return;
        document.getElementById("wmTenantId").value = t.id;
        document.getElementById("wmTenantName").textContent = t.business_name;
        document.getElementById("wmAmount").value = "";
        document.getElementById("wmReason").value = "";
        document.getElementById("walletModal").classList.add("open");
    };

    document.getElementById("walletModalForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tid = document.getElementById("wmTenantId").value;
        const btn = document.getElementById("wmSubmitBtn");
        btn.disabled = true;
        try {
            const res = await apiFetch(`/tenants/${tid}/wallet`, {
                method: "POST",
                body: JSON.stringify({
                    wallet_type: document.getElementById("wmType").value,
                    operation: document.getElementById("wmOp").value,
                    amount: parseFloat(document.getElementById("wmAmount").value),
                    reason: document.getElementById("wmReason").value.trim(),
                    notify_sms: document.getElementById("wmNotify").checked
                })
            });
            document.getElementById("walletModal").classList.remove("open");
            showToast(`Wallet updated! New balance: ${fmtKES(res.new_balance)}`);
            await refreshEverything();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    // God Power 2: Subscription Override Modal
    const smActionEl = document.getElementById("smAction");
    function syncSubFields() {
        const v = smActionEl.value;
        document.getElementById("smDaysWrap").style.display = v === "extend_days" ? "block" : "none";
        document.getElementById("smDateWrap").style.display = v === "set_expiry" ? "block" : "none";
    }
    smActionEl?.addEventListener("change", syncSubFields);

    window.__gmSub = (id) => {
        const t = findTenant(id);
        if (!t) return;
        document.getElementById("smTenantId").value = t.id;
        document.getElementById("smTenantName").textContent = `${t.business_name} (${t.status.toUpperCase()})`;
        smActionEl.value = t.status === "pending" ? "activate_onboarding" : "activate_30d";
        document.getElementById("smReason").value = "";
        syncSubFields();
        document.getElementById("subModal").classList.add("open");
    };

    document.getElementById("subModalForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tid = document.getElementById("smTenantId").value;
        const action = smActionEl.value;
        const btn = document.getElementById("smSubmitBtn");
        btn.disabled = true;
        try {
            await apiFetch(`/tenants/${tid}/subscription`, {
                method: "POST",
                body: JSON.stringify({
                    action,
                    days: action === "extend_days" ? parseInt(document.getElementById("smDays").value, 10) : null,
                    custom_expiry: action === "set_expiry" ? document.getElementById("smExpiry").value : null,
                    reason: document.getElementById("smReason").value.trim(),
                    notify_sms: document.getElementById("smNotify").checked
                })
            });
            document.getElementById("subModal").classList.remove("open");
            showToast("Tenant subscription updated successfully.");
            await refreshEverything();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    // God Power 3: Impersonate ("Login As ISP")
    window.__gmImpersonate = async (id) => {
        try {
            const data = await apiFetch(`/tenants/${id}/impersonate`, { method: "POST" });
            localStorage.setItem("isp_token", data.isp_token);
            localStorage.setItem("adminName", data.admin_name);
            localStorage.setItem("companyName", data.company_name);
            localStorage.setItem("isp_last_activity", String(Date.now()));
            showToast(`Opening ${data.company_name} dashboard...`);
            window.open("dashboard.html", "_blank", "noopener");
            loadAuditLogs();
        } catch (err) {
            showToast(err.message, "error");
        }
    };

    // God Power 4: Direct SMS
    window.__gmSms = (id) => {
        const t = findTenant(id);
        if (!t) return;
        document.getElementById("smsTenantId").value = t.id;
        document.getElementById("smsTenantLabel").textContent = `${t.business_name} (${t.support_phone || "No Phone"})`;
        document.getElementById("smsModalMsg").value = "";
        document.getElementById("smsModal").classList.add("open");
    };

    document.getElementById("smsModalForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tid = document.getElementById("smsTenantId").value;
        const btn = document.getElementById("smsSubmitBtn");
        btn.disabled = true;
        try {
            await apiFetch(`/tenants/${tid}/sms`, {
                method: "POST",
                body: JSON.stringify({ message: document.getElementById("smsModalMsg").value.trim() })
            });
            document.getElementById("smsModal").classList.remove("open");
            showToast("SMS sent successfully via TalkSasa.");
            loadAuditLogs();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    // God Power 5: Delete Tenant
    window.__gmDelete = (id) => {
        const t = findTenant(id);
        if (!t) return;
        document.getElementById("dmTenantId").value = t.id;
        document.getElementById("dmTenantName").textContent = t.business_name;
        document.getElementById("dmConfirmInput").value = "";
        document.getElementById("deleteModal").classList.add("open");
    };

    document.getElementById("deleteModalForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tid = document.getElementById("dmTenantId").value;
        const btn = document.getElementById("dmSubmitBtn");
        btn.disabled = true;
        try {
            await apiFetch(`/tenants/${tid}`, {
                method: "DELETE",
                body: JSON.stringify({ confirm_name: document.getElementById("dmConfirmInput").value.trim() })
            });
            document.getElementById("deleteModal").classList.remove("open");
            showToast("Tenant permanently deleted.");
            await refreshEverything();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    // =========================================================
    // 7. LEDGER, BROADCAST, ROUTERS, WATCHDOG, AUDIT
    // =========================================================
    function renderLedgerTable() {
        const q = (document.getElementById("ledgerSearchInput")?.value || "").trim().toLowerCase();
        const rows = cachedLedger.filter(r => !q ||
            (r.business_name || "").toLowerCase().includes(q) ||
            (r.mpesa_receipt || "").toLowerCase().includes(q) ||
            (r.reference || "").toLowerCase().includes(q) ||
            (r.note || "").toLowerCase().includes(q)
        );
        const body = document.getElementById("ledgerTableBody");
        body.innerHTML = rows.length ? rows.map(r => {
            const amt = Number(r.amount || 0);
            const amtColor = amt >= 0 ? "#10B981" : "#F87171";
            return `
                <tr>
                    <td>${fmtDate(r.created_at)}</td>
                    <td><strong>${escapeHtml(r.business_name)}</strong></td>
                    <td><span class="mini-pill pill-blue">${escapeHtml(r.tx_type)}</span></td>
                    <td style="color:${amtColor};font-weight:700;">${amt >= 0 ? "+" : ""}${fmtKES(amt)}</td>
                    <td>${escapeHtml(r.source || "payhero")}</td>
                    <td style="font-family:monospace;font-size:0.78rem;">${escapeHtml(r.mpesa_receipt || r.reference || "—")}</td>
                    <td class="isp-meta">${escapeHtml(r.note || "—")}</td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No platform transactions logged yet.</td></tr>`;
    }

    document.getElementById("ledgerFilterPills")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-type]");
        if (!btn) return;
        ledgerTypeFilter = btn.dataset.type;
        document.querySelectorAll("#ledgerFilterPills button").forEach(b => b.classList.toggle("active", b === btn));
        loadLedger().catch(err => showToast(err.message, "error"));
    });
    document.getElementById("ledgerSearchInput")?.addEventListener("input", renderLedgerTable);

    // Broadcast preview & submit
    function updateBroadcastPreview() {
        const seg = document.getElementById("broadcastSegment")?.value || "all";
        const phones = new Set();
        cachedTenants.forEach(t => {
            if (!t.support_phone) return;
            if (seg !== "all" && t.status !== seg) return;
            phones.add(t.support_phone.trim());
        });
        const el = document.getElementById("broadcastMatchCount");
        if (el) el.textContent = String(phones.size);
    }

    document.getElementById("broadcastSegment")?.addEventListener("change", updateBroadcastPreview);
    document.getElementById("broadcastMessage")?.addEventListener("input", (e) => {
        document.getElementById("broadcastCharCount").textContent = String(e.target.value.length);
    });

    document.getElementById("broadcastForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("broadcastSendBtn");
        const seg = document.getElementById("broadcastSegment").value;
        const msg = document.getElementById("broadcastMessage").value.trim();
        btn.disabled = true;
        try {
            const res = await apiFetch("/broadcast", {
                method: "POST",
                body: JSON.stringify({ segment: seg, message: msg })
            });
            document.getElementById("broadcastResultBox").innerHTML = `
                <div style="padding:14px;border-radius:12px;background:rgba(0,179,126,0.12);border:1px solid rgba(0,179,126,0.3);color:var(--text);">
                    <div style="font-weight:700;margin-bottom:6px;">Broadcast Completed</div>
                    <div>Segment: <strong>${escapeHtml(seg.toUpperCase())}</strong></div>
                    <div>Targeted: <strong>${res.targeted}</strong> · Delivered: <strong style="color:#10B981;">${res.sent}</strong> · Failed: <strong style="color:#F87171;">${res.failed}</strong></div>
                </div>
            `;
            document.getElementById("broadcastMessage").value = "";
            document.getElementById("broadcastCharCount").textContent = "0";
            showToast(`Broadcast sent to ${res.sent} ISP(s).`);
            loadAuditLogs();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    // Global Routers Table
    function renderRoutersTable() {
        const q = (document.getElementById("routerSearchInput")?.value || "").trim().toLowerCase();
        const rows = cachedRouters.filter(r => !q ||
            (r.name || "").toLowerCase().includes(q) ||
            (r.ip_address || "").toLowerCase().includes(q) ||
            (r.business_name || "").toLowerCase().includes(q)
        );
        const body = document.getElementById("routersTableBody");
        body.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td style="font-family:monospace;">${escapeHtml(r.ip_address)}</td>
                <td>${escapeHtml(r.business_name)}</td>
                <td>${statusBadgeHtml(r.tenant_status, null)}</td>
                <td><span class="status-badge ${String(r.status).toLowerCase() === "offline" ? "st-suspended" : "st-active"}"><span class="dot"></span>${escapeHtml(r.status)}</span></td>
                <td>${fmtDate(r.created_at)}</td>
            </tr>
        `).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No routers found.</td></tr>`;
    }
    document.getElementById("routerSearchInput")?.addEventListener("input", renderRoutersTable);

    // Watchdog Triggers
    async function triggerWatchdog(force) {
        const box = document.getElementById("watchdogResultBox");
        try {
            showToast(force ? "Running forced watchdog sweep..." : "Running standard watchdog sweep...");
            const res = await apiFetch(`/watchdog/run?force=${force ? "true" : "false"}`, { method: "POST" });
            const s = res.summary;
            if (box) {
                box.innerHTML = `
                    <div style="color:var(--text);font-weight:600;margin-bottom:4px;">Sweep completed at ${fmtDate(s.ran_at)}</div>
                    <div>Tenants checked: <strong>${s.checked}</strong> · Suspended: <strong style="color:#F87171;">${s.suspended.length}</strong> · Reminded: <strong style="color:#F59E0B;">${s.reminded.length}</strong></div>
                `;
            }
            showToast(`Watchdog finished: ${s.suspended.length} suspended, ${s.reminded.length} reminded.`);
            await refreshEverything();
        } catch (err) {
            showToast(err.message, "error");
        }
    }

    document.getElementById("topWatchdogBtn")?.addEventListener("click", () => triggerWatchdog(false));
    document.getElementById("runWatchdogNormalBtn")?.addEventListener("click", () => triggerWatchdog(false));
    document.getElementById("runWatchdogForceBtn")?.addEventListener("click", () => triggerWatchdog(true));

    // Audit Logs Table
    function renderAuditTable() {
        const body = document.getElementById("auditTableBody");
        body.innerHTML = cachedAudit.length ? cachedAudit.map(l => `
            <tr>
                <td>${fmtDate(l.created_at)}</td>
                <td>${escapeHtml(l.admin_email)}</td>
                <td><span class="mini-pill pill-blue">${escapeHtml(l.action_type)}</span></td>
                <td><strong>${escapeHtml(l.business_name)}</strong></td>
                <td class="isp-meta" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(JSON.stringify(l.details || {}))}</td>
            </tr>
        `).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No audit logs yet.</td></tr>`;
    }
});