// Immediate Auth Guard — redirects unauthenticated users to register.html
const AUTH_TOKEN = localStorage.getItem("isp_token") || localStorage.getItem("token");
if (!AUTH_TOKEN) {
    window.location.replace("register.html");
}

const API_BASE = window.API_BASE_URL || "https://api.ispconnect.co.ke";

let allVouchers = [];
let currentFilter = "all";
let pendingRevokeId = null;
let pendingRevokeCode = "";

function getToken() {
    return localStorage.getItem("isp_token") || localStorage.getItem("token") || "";
}

function handleUnauthorized() {
    localStorage.clear();
    window.location.replace("register.html");
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
    };
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i data-lucide="${type === "error" ? "alert-circle" : "check-circle"}" width="18"></i><span>${message}</span>`;
    container.appendChild(toast);
    if (typeof lucide !== "undefined") lucide.createIcons();
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatDate(isoStr) {
    if (!isoStr) return "—";
    try {
        const normalized = isoStr.endsWith("Z") || isoStr.includes("+") ? isoStr : `${isoStr}Z`;
        return new Date(normalized).toLocaleString("en-KE", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return isoStr;
    }
}

function initHeaderAndSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("mobileOverlay");
    const mobileToggle = document.getElementById("mobileToggle");
    const profileBtn = document.getElementById("profileToggleBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    const logoutBtn = document.getElementById("logoutBtn");

    if (mobileToggle && sidebar && overlay) {
        mobileToggle.addEventListener("click", () => {
            sidebar.classList.toggle("open");
            overlay.classList.toggle("active");
        });
        overlay.addEventListener("click", () => {
            sidebar.classList.remove("open");
            overlay.classList.remove("active");
        });
    }

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle("active");
        });
        document.addEventListener("click", () => profileDropdown.classList.remove("active"));
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            handleUnauthorized();
        });
    }

    // Populate user profile from localStorage if available
    const name = localStorage.getItem("isp_admin_name") || localStorage.getItem("user_name") || "ISP Admin";
    const company = localStorage.getItem("isp_business_name") || localStorage.getItem("business_name") || "Administrator";
    const navName = document.getElementById("navName");
    const navCompany = document.getElementById("navCompany");
    const navAvatar = document.getElementById("navAvatar");
    if (navName) navName.textContent = name;
    if (navCompany) navCompany.textContent = company;
    if (navAvatar) {
        navAvatar.textContent = name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    }
}

async function loadPackages() {
    const hiddenInput = document.getElementById("voucherPackageSelect");
    const label = document.getElementById("customPackageLabel");
    const menu = document.getElementById("customPackageMenu");
    const wrapper = document.getElementById("customPackageSelect");

    try {
        const res = await fetch(`${API_BASE}/api/admin/vouchers/packages`, { headers: authHeaders() });
        if (res.status === 401) return handleUnauthorized();
        if (!res.ok) throw new Error("Failed to fetch packages");
        const pkgs = await res.json();

        if (!pkgs.length) {
            label.textContent = "No active packages found";
            menu.innerHTML = `<div style="padding:12px;text-align:center;font-size:0.8rem;color:var(--text-muted);">No active packages found</div>`;
            return;
        }

        label.textContent = "-- Select a Package --";
        hiddenInput.value = "";

        menu.innerHTML = pkgs.map(p => {
            const mins = Math.round((p.duration_seconds || 3600) / 60);
            const dur = mins >= 1440 ? `${Math.round(mins / 1440)}d` : mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
            return `
                <div class="custom-option" data-id="${p.id}" data-label="${p.name} (${dur} • KES ${p.price})">
                    <span>${p.name}</span>
                    <span class="custom-option-meta">${dur} • KES ${p.price}</span>
                </div>
            `;
        }).join("");

        menu.querySelectorAll(".custom-option").forEach(opt => {
            opt.addEventListener("click", () => {
                menu.querySelectorAll(".custom-option").forEach(o => o.classList.remove("selected"));
                opt.classList.add("selected");
                hiddenInput.value = opt.dataset.id;
                label.textContent = opt.dataset.label;
                wrapper.classList.remove("open");
            });
        });
    } catch (err) {
        label.textContent = "Error loading packages";
        showToast("Could not load packages", "error");
    }
}

async function loadVouchers() {
    const tbody = document.getElementById("vouchers-tbody");
    try {
        const res = await fetch(`${API_BASE}/api/admin/vouchers`, { headers: authHeaders() });
        if (res.status === 401) return handleUnauthorized();
        if (!res.ok) throw new Error("Failed to fetch vouchers");
        allVouchers = await res.json();
        updateKPIs();
        renderVouchers();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px;">Failed to load vouchers.</td></tr>`;
        showToast("Could not load manual vouchers", "error");
    }
}

function updateKPIs() {
    const total = allVouchers.length;
    const active = allVouchers.filter(v => v.status === "active").length;
    const expired = total - active;
    document.getElementById("kpi-total").textContent = total;
    document.getElementById("kpi-active").textContent = active;
    document.getElementById("kpi-expired").textContent = expired;
}

function renderVouchers() {
    const tbody = document.getElementById("vouchers-tbody");
    const q = (document.getElementById("searchVouchers").value || "").trim().toLowerCase();

    const filtered = allVouchers.filter(v => {
        if (currentFilter === "active" && v.status !== "active") return false;
        if (currentFilter === "expired" && v.status === "active") return false;
        if (q) {
            const hay = `${v.code} ${v.package_name} ${v.phone} ${v.customer_name}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:28px;">No manual vouchers found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(v => {
        const isActive = v.status === "active";
        const statusHtml = isActive
            ? `<span class="status-pill status-active">Active</span>`
            : `<span class="status-pill status-expired">Expired</span>`;

        const revokeBtn = isActive
            ? `<button class="action-btn revoke" onclick="openRevokeModal('${v.id}', '${v.code}')" title="Revoke & Disconnect"><i data-lucide="ban" width="15"></i> Revoke</button>`
            : "";

        return `
            <tr>
                <td data-label="Voucher Code"><span class="code-pill">${v.code}</span></td>
                <td data-label="Package"><strong>${v.package_name}</strong></td>
                <td data-label="Customer / Phone">
                    <div>${v.customer_name || "Cash Customer"}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);">${v.phone || "—"}</div>
                </td>
                <td data-label="Created">${formatDate(v.started_at)}</td>
                <td data-label="Expires">${formatDate(v.expires_at)}</td>
                <td data-label="Status">${statusHtml}</td>
                <td data-label="Actions" style="text-align:right;white-space:nowrap;">
                    <button class="action-btn" onclick="copyText('${v.code}')" title="Copy Code"><i data-lucide="copy" width="15"></i></button>
                    ${revokeBtn}
                </td>
            </tr>
        `;
    }).join("");

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${text} to clipboard`, "success");
    }).catch(() => {
        showToast("Copy failed", "error");
    });
}

function openRevokeModal(id, code) {
    pendingRevokeId = id;
    pendingRevokeCode = code;
    document.getElementById("revokeModalText").textContent =
        `Revoke voucher ${code}? This immediately removes it from FreeRADIUS and disconnects any active device.`;
    document.getElementById("revokeModal").classList.add("active");
}

function closeRevokeModal() {
    pendingRevokeId = null;
    pendingRevokeCode = "";
    document.getElementById("revokeModal").classList.remove("active");
}

async function confirmRevoke() {
    if (!pendingRevokeId) return;
    const btn = document.getElementById("btnConfirmRevoke");
    btn.disabled = true;
    btn.textContent = "Revoking...";
    try {
        const res = await fetch(`${API_BASE}/api/admin/vouchers/${pendingRevokeId}/revoke`, {
            method: "POST",
            headers: authHeaders()
        });
        if (res.status === 401) return handleUnauthorized();
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to revoke");
        showToast(`Voucher ${pendingRevokeCode} revoked & disconnected`, "success");
        closeRevokeModal();
        loadVouchers();
    } catch (err) {
        showToast(err.message || "Error revoking voucher", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Revoke Now";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!getToken()) return handleUnauthorized();

    if (typeof lucide !== "undefined") lucide.createIcons();
    initHeaderAndSidebar();

    // Custom package dropdown open/close
    const customSelect = document.getElementById("customPackageSelect");
    const customTrigger = document.getElementById("customPackageTrigger");
    if (customTrigger && customSelect) {
        customTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            customSelect.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
            if (!customSelect.contains(e.target)) customSelect.classList.remove("open");
        });
    }

    loadPackages();
    loadVouchers();

    document.getElementById("btnRefreshVouchers").addEventListener("click", () => {
        loadPackages();
        loadVouchers();
    });

    document.getElementById("searchVouchers").addEventListener("input", renderVouchers);

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderVouchers();
        });
    });

    document.getElementById("btnCancelRevoke").addEventListener("click", closeRevokeModal);
    document.getElementById("btnConfirmRevoke").addEventListener("click", confirmRevoke);

    document.getElementById("btnCopyGenerated").addEventListener("click", () => {
        const code = document.getElementById("generatedCodeText").textContent;
        if (code && code !== "------") copyText(code);
    });

    document.getElementById("formGenerateVoucher").addEventListener("submit", async (e) => {
        e.preventDefault();
        const packageId = document.getElementById("voucherPackageSelect").value;
        const phone = document.getElementById("voucherPhoneInput").value.trim();
        const customerName = document.getElementById("voucherNameInput").value.trim() || "Cash Customer";
        const sendSms = document.getElementById("voucherSendSms").checked;

        if (!packageId) {
            showToast("Please select a package first", "error");
            return;
        }

        const btn = document.getElementById("btnGenerateVoucher");
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16" class="spin"></i> Generating...`;
        if (typeof lucide !== "undefined") lucide.createIcons();

        try {
            const res = await fetch(`${API_BASE}/api/admin/vouchers/generate`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    package_id: packageId,
                    phone: phone,
                    customer_name: customerName,
                    send_sms: sendSms
                })
            });
            if (res.status === 401) return handleUnauthorized();
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Voucher generation failed");

            document.getElementById("generatedCodeText").textContent = data.voucher_code;
            document.getElementById("generatedMetaText").textContent =
                `${data.package_name} • Expires ${formatDate(data.expires_at)}${data.sms_queued ? " • SMS Sent" : ""}`;
            document.getElementById("generatedBanner").classList.add("show");

            document.getElementById("voucherPhoneInput").value = "";
            document.getElementById("voucherNameInput").value = "";

            showToast(`Voucher ${data.voucher_code} generated!`, "success");
            loadVouchers();
        } catch (err) {
            showToast(err.message || "Could not generate voucher", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="sparkles" width="16"></i> Generate Voucher`;
            if (typeof lucide !== "undefined") lucide.createIcons();
        }
    });
});