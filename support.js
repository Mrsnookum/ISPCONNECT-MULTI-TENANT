const API_BASE = "https://api.ispconnect.co.ke";
const IDLE_WARN_MS = 9 * 60 * 1000;     // 9 minutes -> 60s warning modal
const IDLE_LOGOUT_MS = 10 * 60 * 1000;  // 10 minutes -> auto logout
const HEARTBEAT_MS = 45 * 1000;         // 45s presence heartbeat
const POLL_MS = 25 * 1000;              // 25s live inbox/alert refresh

let authToken = localStorage.getItem("isp_support_token") || "";
let currentAgent = null;
let isOnline = true;
let activeTab = "inbox";
let activeInqFilter = "";
let activeStageFilter = "";
let lastOpenIncidentCount = 0;

let lastActivityTs = Date.now();
let idleWarningShown = false;
let idleCheckTimer = null;
let heartbeatTimer = null;
let pollTimer = null;

const $ = (id) => document.getElementById(id);

function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function fmtWa(phone) {
    const d = String(phone || "").replace(/\D/g, "");
    return d.startsWith("0") ? "254" + d.slice(1) : d;
}

function showToast(msg, type = "ok") {
    const t = $("toast");
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.classList.remove("show"), 3200);
}

function playAlertBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
    } catch (_) {}
}

async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if ((res.status === 401 || res.status === 403) && authToken && path !== "/api/support/login") {
            performLogout("manual", false, data.detail || "Session ended.");
        }
        throw new Error(data.detail || "Request failed");
    }
    return data;
}

function stopTimers() {
    clearInterval(idleCheckTimer);
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
}

async function performLogout(reason = "manual", callServer = true, toastMsg = "Logged out") {
    stopTimers();
    $("idleModal").classList.remove("active");
    idleWarningShown = false;

    if (callServer && authToken) {
        try {
            await fetch(`${API_BASE}/api/support/logout`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ reason })
            });
        } catch (_) {}
    }
    authToken = "";
    currentAgent = null;
    localStorage.removeItem("isp_support_token");
    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");
    if (toastMsg) showToast(toastMsg, reason === "idle_timeout" ? "err" : "ok");
}

// --- 10-MINUTE INACTIVITY TRACKER ---
function markUserActivity() {
    if (!authToken || idleWarningShown) return;
    lastActivityTs = Date.now();
}

["mousemove", "mousedown", "keydown", "scroll", "touchstart"].forEach((ev) => {
    window.addEventListener(ev, markUserActivity, { passive: true });
});

function startTimers() {
    stopTimers();
    lastActivityTs = Date.now();

    idleCheckTimer = setInterval(() => {
        if (!authToken) return;
        const idleMs = Date.now() - lastActivityTs;
        if (idleMs >= IDLE_LOGOUT_MS) {
            performLogout("idle_timeout", true, "Logged out due to 10 minutes of inactivity.");
        } else if (idleMs >= IDLE_WARN_MS) {
            idleWarningShown = true;
            const secsLeft = Math.max(0, Math.ceil((IDLE_LOGOUT_MS - idleMs) / 1000));
            $("idleCountdown").textContent = String(secsLeft);
            $("idleModal").classList.add("active");
        }
    }, 1000);

    heartbeatTimer = setInterval(() => sendHeartbeat(), HEARTBEAT_MS);
    pollTimer = setInterval(() => pollLiveQueues(), POLL_MS);
}

function syncDutyButtons() {
    [$("sideDutyBtn"), $("mobDutyBtn")].forEach((btn) => {
        if (!btn) return;
        btn.className = `duty-pill ${isOnline ? "duty-on" : "duty-off"}`;
        btn.innerHTML = `<span class="duty-dot"></span> ${isOnline ? "Online" : "Offline"}`;
    });
}

function updateBadges(openInq, openInc) {
    [$("sideInboxBadge"), $("mobInboxBadge")].forEach((el) => {
        if (!el) return;
        el.textContent = String(openInq);
        el.classList.toggle("show", openInq > 0);
    });
    [$("sideAlertsBadge"), $("mobAlertsBadge")].forEach((el) => {
        if (!el) return;
        el.textContent = String(openInc);
        el.classList.toggle("show", openInc > 0);
    });
    if (openInc > lastOpenIncidentCount && lastOpenIncidentCount !== 0) {
        playAlertBeep();
        showToast("New ISP Failure Alert!", "err");
    }
    lastOpenIncidentCount = openInc;
}

async function sendHeartbeat(overrideOnline = null) {
    if (!authToken) return;
    try {
        const body = overrideOnline === null ? {} : { is_online: overrideOnline };
        const res = await api("/api/support/heartbeat", { method: "POST", body: JSON.stringify(body) });
        isOnline = res.is_online;
        syncDutyButtons();
        updateBadges(res.open_inquiries || 0, res.open_incidents || 0);
    } catch (_) {}
}

async function pollLiveQueues() {
    if (!authToken) return;
    await Promise.all([loadInquiries(true), loadIncidents(true)]);
}

function switchTab(tab) {
    if (!tab) return;
    activeTab = tab;

    ["inbox", "alerts", "leads", "diagnostics", "more"].forEach((t) => {
        const sec = $(`tab-${t}`);
        if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    document.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    window.scrollTo({ top: 0, behavior: "instant" });

    requestAnimationFrame(() => {
        if (tab === "inbox") loadInquiries(true);
        if (tab === "alerts") loadIncidents(true);
        if (tab === "leads") loadLeads();
        if (tab === "more") loadCommissions();
    });
}

async function bootDashboard() {
    try {
        const data = await api("/api/support/me");
        currentAgent = data.agent;
        isOnline = Boolean(currentAgent.is_online);
        $("authView").classList.add("hidden");
        $("appView").classList.remove("hidden");
        $("sideAgentName").textContent = currentAgent.full_name;
        $("sideAgentMeta").textContent = `Served today: ${data.served_today || 0} · Ref: ${currentAgent.referral_code}`;
        $("kpiServedToday").textContent = String(data.served_today || 0);
        $("moreRefCode").textContent = currentAgent.referral_code;
        syncDutyButtons();

        if (currentAgent.must_change_password) $("forcePwModal").classList.add("active");
        startTimers();
        if (window.lucide) lucide.createIcons();
        await Promise.all([sendHeartbeat(true), loadInquiries(), loadIncidents(), loadLeads(), loadCommissions()]);
    } catch {
        performLogout("manual", false, "");
    }
}

// --- INBOX ---
async function loadInquiries(silent = false) {
    try {
        const q = activeInqFilter ? `?status=${encodeURIComponent(activeInqFilter)}` : "";
        const { inquiries } = await api(`/api/support/inquiries${q}`);
        const list = $("inboxList");
        if (!inquiries.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:26px;">No inquiries in this view.</div>`;
            return;
        }
        list.innerHTML = inquiries.map((i) => {
            const srcBadge = i.source === "email" ? `<span class="badge b-blue">Email</span>`
                : i.source === "enterprise_quote" ? `<span class="badge b-purple">Enterprise Quote</span>`
                : `<span class="badge b-green">Contact Form</span>`;
            const stBadge = `<span class="badge ${i.status === "open" ? "b-red" : i.status === "resolved" ? "b-green" : "b-amber"}">${esc(i.status)}</span>`;
            return `
                <div class="item-card ${i.status === "open" ? "urgent" : ""}">
                    <div class="item-top">
                        <div>
                            <div class="item-title">${esc(i.subject || i.sender_name)}</div>
                            <div class="item-meta">
                                <span><strong>${esc(i.sender_name)}</strong></span>
                                ${i.sender_email ? `<span>${esc(i.sender_email)}</span>` : ""}
                                ${i.sender_phone ? `<a href="https://wa.me/${fmtWa(i.sender_phone)}" target="_blank" style="color:var(--primary-dark);font-weight:600;">${esc(i.sender_phone)}</a>` : ""}
                                <span>${new Date(i.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">${srcBadge}${stBadge}</div>
                    </div>
                    <div class="item-body">${esc(i.message)}</div>
                    ${i.claimed_by_name ? `<div style="font-size:0.76rem;color:var(--muted);">Assigned to: <strong>${esc(i.claimed_by_name)}</strong></div>` : ""}
                    ${i.reply_text ? `<div style="font-size:0.78rem;background:#ECFDF5;padding:8px 10px;border-radius:8px;color:#065F46;"><strong>Reply sent:</strong> ${esc(i.reply_text)}</div>` : ""}
                    <div class="item-actions">
                        ${i.status === "open" ? `<button class="btn btn-primary btn-sm" onclick="window.__claimInq('${i.id}')">Claim</button>` : ""}
                        ${i.status !== "resolved" ? `<button class="btn btn-blue btn-sm" onclick="window.__openReply('${i.id}','${esc(i.sender_name)}','${esc(i.sender_email || "")}')">Reply</button>` : ""}
                        ${i.status !== "resolved" ? `<button class="btn btn-outline btn-sm" onclick="window.__convertInq('${i.id}')">+ Convert to Lead</button>` : ""}
                    </div>
                </div>
            `;
        }).join("");
    } catch (err) {
        if (!silent) showToast(err.message, "err");
    }
}

window.__claimInq = async (id) => {
    try {
        await api(`/api/support/inquiries/${id}/claim`, { method: "POST" });
        showToast("Inquiry claimed & locked to you.");
        loadInquiries();
    } catch (err) { showToast(err.message, "err"); }
};

window.__openReply = (id, name, email) => {
    $("replyInqId").value = id;
    $("replyText").value = "";
    $("replyMeta").textContent = email ? `Replying to ${name} (${email})` : `Logging follow-up note for ${name}`;
    $("sendEmailCheckWrap").classList.toggle("hidden", !email);
    $("replySendEmail").checked = Boolean(email);
    $("replyModal").classList.add("active");
};

window.__convertInq = async (id) => {
    try {
        await api(`/api/support/inquiries/${id}/convert-lead`, { method: "POST" });
        showToast("Converted to your Leads Pipeline!");
        loadInquiries();
        loadLeads();
    } catch (err) { showToast(err.message, "err"); }
};

// --- LIVE ISP FAILURE ALERTS ---
async function loadIncidents(silent = false) {
    try {
        const { incidents } = await api("/api/support/incidents");
        const openCount = incidents.filter((x) => x.status === "open").length;
        updateBadges(Number($("sideInboxBadge").textContent || 0), openCount);
        const list = $("incidentsList");
        if (!incidents.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:26px;">All ISPs healthy — no failure alerts.</div>`;
            return;
        }
        list.innerHTML = incidents.map((inc) => `
            <div class="item-card ${inc.status === "open" ? "urgent" : ""}">
                <div class="item-top">
                    <div>
                        <div class="item-title">${esc(inc.business_name)} · ${esc(inc.incident_type.replace("_", " "))}</div>
                        <div class="item-meta">
                            <span>${new Date(inc.created_at).toLocaleString()}</span>
                            ${inc.sms_sent_to ? `<span>SMS pinged: ${esc(inc.sms_sent_to)}</span>` : ""}
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <span class="badge ${inc.status === "open" ? "b-red" : inc.status === "resolved" ? "b-green" : "b-amber"}">${esc(inc.status)}</span>
                        ${inc.escalated_to_admin ? `<span class="badge b-purple">Escalated</span>` : ""}
                    </div>
                </div>
                <div class="item-body">${esc(inc.message)}</div>
                ${inc.resolution_note ? `<div style="font-size:0.78rem;color:#065F46;"><strong>Fix:</strong> ${esc(inc.resolution_note)}</div>` : ""}
                <div class="item-actions">
                    ${inc.status === "open" ? `<button class="btn btn-primary btn-sm" onclick="window.__claimInc('${inc.id}')">Claim Alert</button>` : ""}
                    ${inc.status !== "resolved" ? `<button class="btn btn-blue btn-sm" onclick="window.__resolveInc('${inc.id}')">Mark Resolved</button>` : ""}
                    ${inc.status !== "resolved" && !inc.escalated_to_admin ? `<button class="btn btn-danger btn-sm" onclick="window.__openEscalate('${inc.id}')">Escalate to Admin</button>` : ""}
                </div>
            </div>
        `).join("");
    } catch (err) {
        if (!silent) showToast(err.message, "err");
    }
}

window.__claimInc = async (id) => {
    try {
        await api(`/api/support/incidents/${id}/claim`, { method: "POST" });
        showToast("Alert claimed.");
        loadIncidents();
    } catch (err) { showToast(err.message, "err"); }
};

window.__resolveInc = async (id) => {
    const note = prompt("Short note on how you fixed it (optional):") || "Resolved by support";
    try {
        await api(`/api/support/incidents/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution_note: note }) });
        showToast("Incident marked resolved!");
        loadIncidents();
    } catch (err) { showToast(err.message, "err"); }
};

window.__openEscalate = (id) => {
    $("escIncId").value = id;
    $("escNote").value = "";
    $("escalateModal").classList.add("active");
};

// --- LEADS ---
async function loadLeads() {
    try {
        const q = activeStageFilter ? `?stage=${encodeURIComponent(activeStageFilter)}` : "";
        const { leads } = await api(`/api/support/leads${q}`);
        if (!activeStageFilter) {
            $("kpiTotalLeads").textContent = String(leads.length);
            $("kpiActiveTrials").textContent = String(leads.filter((l) => ["trial", "mikrotik_connected", "first_payment"].includes(l.stage)).length);
            $("kpiConverted").textContent = String(leads.filter((l) => l.stage === "converted").length);
        }
        const list = $("leadsList");
        if (!leads.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:26px;">No leads found.</div>`;
            return;
        }
        list.innerHTML = leads.map((l) => `
            <div class="item-card">
                <div class="item-top">
                    <div>
                        <div class="item-title">${esc(l.isp_name)}</div>
                        <div class="item-meta">
                            <span>${esc(l.contact_name)} ${l.location ? "· " + esc(l.location) : ""}</span>
                            <a href="https://wa.me/${fmtWa(l.phone)}" target="_blank" style="color:var(--primary-dark);font-weight:700;">${esc(l.phone)}</a>
                            <span>${l.routers_count} router(s)</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <span class="badge ${l.plan_interest === "enterprise" ? "b-purple" : "b-blue"}">${esc(l.plan_interest)}</span>
                        <span class="badge b-gray">${esc(l.lead_source || "direct")}</span>
                    </div>
                </div>
                ${l.notes ? `<div class="item-body" style="font-size:0.82rem;color:var(--muted);">${esc(l.notes)}</div>` : ""}
                <div class="item-actions">
                    <label style="font-size:0.76rem;color:var(--muted);font-weight:600;">Stage:</label>
                    <select style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:0.82rem;font-weight:600;" onchange="window.__updateLeadStage('${l.id}', this.value)">
                        ${["new", "trial", "mikrotik_connected", "first_payment", "converted", "lost"]
                            .map((s) => `<option value="${s}" ${l.stage === s ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}
                    </select>
                </div>
            </div>
        `).join("");
    } catch (err) { showToast(err.message, "err"); }
}

window.__updateLeadStage = async (id, stage) => {
    try {
        await api(`/api/support/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
        showToast(stage === "converted" ? "Marked converted — pending commission queued for Admin!" : "Stage updated.");
        loadLeads();
        loadCommissions();
    } catch (err) { showToast(err.message, "err"); }
};

// --- COMMISSIONS ---
async function loadCommissions() {
    try {
        const { summary, commissions } = await api("/api/support/commissions");
        $("comPending").textContent = `KES ${Number(summary.pending_total).toLocaleString()}`;
        $("comWeek").textContent = `KES ${Number(summary.earned_this_week).toLocaleString()}`;
        $("comPaid").textContent = `KES ${Number(summary.total_paid).toLocaleString()}`;
        $("comTrials").textContent = String(summary.active_trials_in_pipeline);

        const list = $("commissionsList");
        list.innerHTML = commissions.length ? commissions.map((c) => `
            <div class="item-card">
                <div class="item-top">
                    <div>
                        <div class="item-title">KES ${Number(c.amount).toLocaleString()} · ${esc(c.commission_type.replace("_", " "))}</div>
                        <div class="item-meta"><span>${new Date(c.created_at).toLocaleDateString()}</span><span>${esc(c.notes || "—")}</span></div>
                    </div>
                    <span class="badge ${c.status === "paid" ? "b-green" : c.status === "approved" ? "b-blue" : "b-amber"}">${esc(c.status)}</span>
                </div>
            </div>
        `).join("") : `<div style="text-align:center;color:var(--muted);padding:20px;">No commission entries yet.</div>`;
    } catch (err) { showToast(err.message, "err"); }
}

// --- EVENTS ---
document.addEventListener("DOMContentLoaded", () => {
    if (window.lucide) lucide.createIcons();

    $("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = $("loginBtn");
        btn.disabled = true;
        try {
            const data = await api("/api/support/login", {
                method: "POST",
                body: JSON.stringify({
                    email: $("loginEmail").value.trim(),
                    password: $("loginPassword").value,
                    device_info: navigator.userAgent.slice(0, 120)
                })
            });
            authToken = data.token;
            localStorage.setItem("isp_support_token", authToken);
            $("loginForm").reset();
            await bootDashboard();
            showToast(`Online! Welcome, ${data.agent.full_name}`);
        } catch (err) {
            showToast(err.message, "err");
        } finally {
            btn.disabled = false;
        }
    });

    document.addEventListener("click", (e) => {
        const tabBtn = e.target.closest("[data-tab]");
        if (!tabBtn) return;
        e.preventDefault();
        switchTab(tabBtn.getAttribute("data-tab"));
    });

    [$("sideDutyBtn"), $("mobDutyBtn")].forEach((b) => {
        b?.addEventListener("click", () => {
            sendHeartbeat(!isOnline);
            showToast(!isOnline ? "You are now Online (receiving failure SMS)." : "You are now Offline (SMS paused).");
        });
    });

    [$("logoutBtn"), $("mobLogoutBtn")].forEach((b) => b?.addEventListener("click", () => performLogout("manual", true)));

    $("stayOnlineBtn").addEventListener("click", () => {
        idleWarningShown = false;
        lastActivityTs = Date.now();
        $("idleModal").classList.remove("active");
        sendHeartbeat(true);
    });

    document.querySelectorAll("[data-close-modal]").forEach((b) => {
        b.addEventListener("click", () => b.closest(".modal-overlay")?.classList.remove("active"));
    });

    $("refreshInboxBtn").addEventListener("click", () => loadInquiries());
    $("refreshAlertsBtn").addEventListener("click", () => loadIncidents());

    $("inboxFilters").querySelectorAll(".pill").forEach((p) => {
        p.addEventListener("click", () => {
            $("inboxFilters").querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
            p.classList.add("active");
            activeInqFilter = p.dataset.inqStatus;
            loadInquiries();
        });
    });

    $("stageFilters").querySelectorAll(".pill").forEach((p) => {
        p.addEventListener("click", () => {
            $("stageFilters").querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
            p.classList.add("active");
            activeStageFilter = p.dataset.stage;
            loadLeads();
        });
    });

    $("replyForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = $("replySubmitBtn");
        btn.disabled = true;
        try {
            const res = await api(`/api/support/inquiries/${$("replyInqId").value}/reply`, {
                method: "POST",
                body: JSON.stringify({
                    reply_text: $("replyText").value,
                    send_email: $("replySendEmail").checked,
                    mark_resolved: true
                })
            });
            $("replyModal").classList.remove("active");
            showToast(res.email_dispatched ? "Email sent from support@ispconnect.co.ke!" : "Reply logged & resolved.");
            loadInquiries();
        } catch (err) {
            showToast(err.message, "err");
        } finally {
            btn.disabled = false;
        }
    });

    $("openLeadModalBtn").addEventListener("click", () => $("leadModal").classList.add("active"));
    $("leadForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await api("/api/support/leads", {
                method: "POST",
                body: JSON.stringify({
                    isp_name: $("leadIsp").value,
                    contact_name: $("leadContact").value,
                    phone: $("leadPhone").value,
                    location: $("leadLoc").value,
                    routers_count: Number($("leadRouters").value || 1),
                    lead_source: $("leadSource").value,
                    plan_interest: $("leadPlan").value,
                    notes: $("leadNotes").value
                })
            });
            $("leadForm").reset();
            $("leadModal").classList.remove("active");
            showToast("Lead logged!");
            loadLeads();
        } catch (err) { showToast(err.message, "err"); }
    });

    $("escalateForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await api(`/api/support/incidents/${$("escIncId").value}/escalate`, {
                method: "POST",
                body: JSON.stringify({ escalation_note: $("escNote").value })
            });
            $("escalateModal").classList.remove("active");
            showToast("Escalated to Admin in God Mode.");
            loadIncidents();
        } catch (err) { showToast(err.message, "err"); }
    });

    $("diagSearchForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = $("diagQuery").value.trim();
        if (q.length < 3) return showToast("Enter at least 3 characters", "err");
        $("diagSearchBtn").disabled = true;
        try {
            const data = await api(`/api/support/diagnostics/search?q=${encodeURIComponent(q)}`);
            $("diagResults").classList.remove("hidden");

            $("diagTenantsList").innerHTML = data.tenants.length ? data.tenants.map((t) => `
                <div class="item-card">
                    <div class="item-top">
                        <div>
                            <div class="item-title">${esc(t.business_name)}</div>
                            <div class="item-meta"><span>${esc(t.support_phone || "No phone")}</span></div>
                        </div>
                        <span class="badge ${t.subscription_status === "active" ? "b-green" : "b-amber"}">${esc(t.subscription_status || "trial")}</span>
                    </div>
                    <div class="health-steps">
                        <div class="h-step ${t.health.registered ? "ok" : ""}">1. Registered</div>
                        <div class="h-step ${t.health.payhero_linked ? "ok" : ""}">2. PayHero</div>
                        <div class="h-step ${t.health.router_connected ? "ok" : ""}">3. MikroTik</div>
                        <div class="h-step ${t.health.first_sale ? "ok" : ""}">4. First Sale</div>
                    </div>
                </div>
            `).join("") : `<div style="color:var(--muted);font-size:0.84rem;">No matching ISPs found.</div>`;

            $("diagPaymentsList").innerHTML = data.payments.length ? data.payments.map((p) => `
                <div class="item-card">
                    <div class="item-top">
                        <div>
                            <div class="item-title">${esc(p.phone)} · KES ${Number(p.amount).toLocaleString()}</div>
                            <div class="item-meta">
                                <span>Voucher: <strong>${esc(p.voucher_code || "—")}</strong></span>
                                <span>M-Pesa: ${esc(p.mpesa_receipt_number || "—")}</span>
                                <span>${new Date(p.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <span class="badge ${p.status === "completed" ? "b-green" : "b-amber"}">${esc(p.status)}</span>
                    </div>
                    ${p.status === "completed" && p.voucher_code ? `<div class="item-actions"><button class="btn btn-outline btn-sm" onclick="window.__resendVoucher('${p.id}', this)">Resend Voucher SMS</button></div>` : ""}
                </div>
            `).join("") : `<div style="color:var(--muted);font-size:0.84rem;">No matching M-Pesa payments found.</div>`;
        } catch (err) {
            showToast(err.message, "err");
        } finally {
            $("diagSearchBtn").disabled = false;
        }
    });

    window.__resendVoucher = async (pid, btn) => {
        btn.disabled = true;
        try {
            const res = await api("/api/support/diagnostics/resend-voucher", { method: "POST", body: JSON.stringify({ payment_id: pid }) });
            showToast(res.message);
        } catch (err) { showToast(err.message, "err"); }
        finally { btn.disabled = false; }
    };

    document.querySelectorAll(".copy-qr").forEach((btn) => {
        btn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(btn.dataset.text);
            showToast("Copied to clipboard!");
        });
    });

    async function submitPw(curId, newId, forced) {
        try {
            await api("/api/support/change-password", {
                method: "POST",
                body: JSON.stringify({ current_password: $(curId).value, new_password: $(newId).value })
            });
            $(curId).value = ""; $(newId).value = "";
            if (forced) $("forcePwModal").classList.remove("active");
            showToast("Password updated!");
        } catch (err) { showToast(err.message, "err"); }
    }

    $("changePwForm").addEventListener("submit", (e) => { e.preventDefault(); submitPw("curPw", "newPw", false); });
    $("forcePwForm").addEventListener("submit", (e) => { e.preventDefault(); submitPw("forceCurPw", "forceNewPw", true); });

    if (authToken) bootDashboard();
});
