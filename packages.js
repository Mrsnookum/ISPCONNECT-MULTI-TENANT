document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Icons
    lucide.createIcons();
    
    // --- 2. AUTHENTICATION & SHELL LOGIC ---
    const adminName = localStorage.getItem("adminName");
    const ispToken = localStorage.getItem("isp_token");
    const companyName = localStorage.getItem("companyName");

    // Block access if the JWT token is missing
    if (!adminName || !ispToken) {
        window.location.href = 'register.html?view=login';
        return;
    }
    
    document.getElementById("navName").textContent = adminName;
    document.getElementById("navAvatar").textContent = adminName.substring(0, 2).toUpperCase();

    // Inject Dynamic ISP Branding
    if (companyName) {
        const sidebarLogo = document.getElementById("sidebar-logo-text");
        const navCompany = document.getElementById("navCompany");
        if (sidebarLogo) sidebarLogo.textContent = companyName;
        if (navCompany) navCompany.textContent = companyName;
    }

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
        window.location.href = 'register.html?view=login';
    });

    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");
    const mobileToggle = document.getElementById("mobileToggle");

    function toggleSidebar() {
        sidebar.classList.toggle("open");
        mobileOverlay.classList.toggle("active");
    }
    
    mobileToggle.addEventListener("click", toggleSidebar);
    mobileOverlay.addEventListener("click", toggleSidebar);

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

    // --- 3. CUSTOM CONFIRM MODAL LOGIC ---
    const confirmModal = document.getElementById('confirmModal');
    let pendingConfirmCallback = null;

    function showCustomConfirm(title, message, btnText, btnColor, iconName, iconColor, bgLightColor, callback) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        
        const acceptBtn = document.getElementById('acceptConfirmBtn');
        acceptBtn.textContent = btnText;
        acceptBtn.style.background = btnColor;
        
        const icon = document.getElementById('confirmIcon');
        icon.setAttribute('data-lucide', iconName);
        icon.style.color = iconColor;
        
        document.getElementById('confirmIconBg').style.background = bgLightColor;
        
        lucide.createIcons({ root: confirmModal });

        pendingConfirmCallback = callback;
        confirmModal.classList.add('active');
    }

    document.getElementById('cancelConfirmBtn').addEventListener('click', () => {
        confirmModal.classList.remove('active');
        pendingConfirmCallback = null;
    });

    document.getElementById('acceptConfirmBtn').addEventListener('click', () => {
        confirmModal.classList.remove('active');
        if (pendingConfirmCallback) pendingConfirmCallback();
    });

    // --- 4. PACKAGES PAGE LOGIC ---
    const API_BASE = 'https://api.ispconnect.co.ke/api/admin';
    let currentPackages = [];

    // Formatters
    function formatDuration(seconds) {
        if (!seconds) return "Unlimited";
        const minutes = seconds / 60;
        if (minutes < 60) return `${Math.round(minutes)} Minutes`;
        const hours = minutes / 60;
        if (hours < 24) return `${Math.round(hours)} Hour${hours > 1 ? 's' : ''}`;
        const days = hours / 24;
        return `${Math.round(days)} Day${days > 1 ? 's' : ''}`;
    }

    function formatSpeed(kbps) {
        if (!kbps || kbps === 0) return "Unlimited";
        if (kbps >= 1024) return `${parseFloat((kbps / 1024).toFixed(1))}M`;
        return `${kbps}K`;
    }

    function parseRatePartToMbps(part) {
        if (!part) return '';
        const clean = part.trim().toLowerCase();
        const num = parseFloat(clean);
        if (isNaN(num)) return '';
        if (clean.endsWith('m')) return parseFloat(num.toFixed(2));
        if (clean.endsWith('k')) return parseFloat((num / 1024).toFixed(2));
        return parseFloat((num / 1048576).toFixed(2));
    }

    function formatRateLimitDisplay(rateStr) {
        if (!rateStr || !rateStr.includes('/')) return rateStr || '';
        const [up, down] = rateStr.split('/');
        const upMbps = parseRatePartToMbps(up);
        const downMbps = parseRatePartToMbps(down);
        if (upMbps === '' || downMbps === '') return rateStr;
        return `${formatSpeed(Math.round(upMbps * 1024))}/${formatSpeed(Math.round(downMbps * 1024))}`;
    }

    function checkAuthError(res) {
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("adminName");
            localStorage.removeItem("isp_token");
            window.location.href = 'register.html?view=login';
            return true;
        }
        return false;
    }

    // FUP Toggle & Smart Auto-Fill
    const fupCheckbox = document.getElementById('pkgFupEnabled');
    const fupContainer = document.getElementById('fupFieldsContainer');
    const fupLimitInput = document.getElementById('pkgFupLimitGb');
    const fupResetSelect = document.getElementById('pkgFupResetPolicy');
    const fupDownloadInput = document.getElementById('pkgFupDownload');
    const fupUploadInput = document.getElementById('pkgFupUpload');

    function toggleFupFields(enabled, autoFill = false) {
        fupContainer.style.display = enabled ? 'grid' : 'none';
        fupLimitInput.required = enabled;
        fupDownloadInput.required = enabled;
        fupUploadInput.required = enabled;

        if (enabled && autoFill) {
            const normalDown = parseFloat(document.getElementById('pkgDownload').value);
            const normalUp = parseFloat(document.getElementById('pkgUpload').value);
            const durationMins = parseInt(document.getElementById('pkgDuration').value, 10) || 0;

            if (!fupDownloadInput.value && !isNaN(normalDown) && normalDown > 0) {
                fupDownloadInput.value = Math.max(0.5, parseFloat((normalDown * 0.5).toFixed(1)));
            }
            if (!fupUploadInput.value && !isNaN(normalUp) && normalUp > 0) {
                fupUploadInput.value = Math.max(0.5, parseFloat((normalUp * 0.5).toFixed(1)));
            }
            if (!fupLimitInput.value) {
                if (durationMins >= 10080) fupLimitInput.value = 5;
                else if (durationMins >= 1440) fupLimitInput.value = 2;
                else fupLimitInput.value = 1;
            }
            fupResetSelect.value = durationMins >= 1440 ? 'daily' : 'session';
        }
    }

    if (fupCheckbox) {
        fupCheckbox.addEventListener('change', (e) => {
            toggleFupFields(e.target.checked, true);
        });
    }

    // Package Modal Control
    const packageModal = document.getElementById('packageModal');
    const form = document.getElementById('packageForm');
    
    window.openModal = function(pkg = null) {
        form.reset();
        if (pkg) {
            document.getElementById('modalTitle').textContent = 'Edit Package';
            document.getElementById('pkgId').value = pkg.id;
            document.getElementById('pkgName').value = pkg.name;
            document.getElementById('pkgType').value = pkg.type;
            document.getElementById('pkgStatus').value = pkg.is_active;
            document.getElementById('pkgPrice').value = pkg.price;
            document.getElementById('pkgDuration').value = pkg.duration_seconds / 60; 
            document.getElementById('pkgDownload').value = pkg.speed_download_kbps ? parseFloat((pkg.speed_download_kbps / 1024).toFixed(2)) : '';
            document.getElementById('pkgUpload').value = pkg.speed_upload_kbps ? parseFloat((pkg.speed_upload_kbps / 1024).toFixed(2)) : '';
            document.getElementById('pkgDevices').value = pkg.devices;

            const hasFup = Boolean(pkg.fup_enabled);
            fupCheckbox.checked = hasFup;
            if (hasFup) {
                fupLimitInput.value = pkg.fup_limit_mb ? parseFloat((pkg.fup_limit_mb / 1024).toFixed(2)) : '';
                fupResetSelect.value = pkg.fup_reset_policy || 'daily';
                if (pkg.fup_rate_limit && pkg.fup_rate_limit.includes('/')) {
                    const [upPart, downPart] = pkg.fup_rate_limit.split('/');
                    fupUploadInput.value = parseRatePartToMbps(upPart);
                    fupDownloadInput.value = parseRatePartToMbps(downPart);
                }
            }
            toggleFupFields(hasFup, false);
        } else {
            document.getElementById('modalTitle').textContent = 'Create a package';
            document.getElementById('pkgId').value = '';
            fupCheckbox.checked = false;
            toggleFupFields(false, false);
        }
        packageModal.classList.add('active');
    }

    window.closeModal = function() {
        packageModal.classList.remove('active');
    }

    document.getElementById('btnNewPackage').addEventListener('click', () => openModal());
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

    // Fetch and Render
    async function loadPackages() {
        try {
            const res = await fetch(`${API_BASE}/packages`, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            
            if (checkAuthError(res)) return;
            if (!res.ok) throw new Error("Failed to load packages");
            
            currentPackages = await res.json();
            renderPackages(currentPackages);
        } catch (err) {
            console.error(err);
            showToast("Failed to fetch packages from database.", "error");
        }
    }

    function renderPackages(data) {
        const tbody = document.getElementById('packages-tbody');
        let activeCount = 0;

        tbody.innerHTML = data.map(p => {
            if (p.is_active) activeCount++;
            
            const statusClass = p.is_active ? 'status-success' : 'status-failed';
            const statusText = p.is_active ? 'LIVE' : 'HIDDEN';
            // The backend automatically calculates p.rate_limit, but we can still format the display gracefully
            const speedString = `${formatSpeed(p.speed_upload_kbps)}/${formatSpeed(p.speed_download_kbps)}`;
            const durationString = formatDuration(p.duration_seconds);
            const serialized = encodeURIComponent(JSON.stringify(p));

            let fupBadgeHtml = '';
            if (p.fup_enabled && p.fup_limit_mb && p.fup_rate_limit) {
                const capGb = parseFloat((p.fup_limit_mb / 1024).toFixed(1));
                const fupSpeed = formatRateLimitDisplay(p.fup_rate_limit);
                const policyLabel = p.fup_reset_policy === 'session' ? 'plan' : 'day';
                fupBadgeHtml = `<div><span class="fup-pill">FUP: ${capGb}GB/${policyLabel} → ${fupSpeed}</span></div>`;
            }

            return `
                <tr>
                    <td>
                        <div style="font-weight: 600; color: var(--text-dark);">${p.name}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${durationString}</div>
                    </td>
                    <td><span style="background: #E2E8F0; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; color: var(--text-muted);">${p.type}</span></td>
                    <td style="font-weight: 500;">KSh ${p.price.toLocaleString()}</td>
                    <td style="color: var(--text-muted); font-size: 0.75rem;">
                        <div>${speedString}</div>
                        ${fupBadgeHtml}
                    </td>
                    <td><span class="status-pill ${statusClass}"><div class="dot"></div> ${statusText}</span></td>
                    <td style="text-align: right;">
                        <button class="action-btn" onclick="editPackage('${serialized}')" title="Edit"><i data-lucide="edit-2" width="16"></i></button>
                        <button class="action-btn" onclick="togglePackageStatus('${p.id}', ${p.is_active})" title="${p.is_active ? 'Hide' : 'Publish'}">
                            <i data-lucide="${p.is_active ? 'eye-off' : 'eye'}" width="16"></i>
                        </button>
                        <button class="action-btn delete" onclick="deletePackage('${p.id}')" title="Delete"><i data-lucide="trash-2" width="16"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('kpi-all').textContent = data.length;
        document.getElementById('kpi-active').textContent = activeCount;
        document.getElementById('kpi-hidden').textContent = data.length - activeCount;
        document.getElementById('kpi-subs').textContent = "0"; // Hardcoded to 0 for now!

        lucide.createIcons();
    }

    // Table Actions using the Custom Confirm Modal
    window.editPackage = function(encodedData) {
        const pkg = JSON.parse(decodeURIComponent(encodedData));
        openModal(pkg);
    };

    window.togglePackageStatus = function(id, currentStatus) {
        const newStatus = !currentStatus;
        const actionWord = currentStatus ? "Hide" : "Publish";
        const iconColor = currentStatus ? "#F59E0B" : "#00B37E";
        const bgLightColor = currentStatus ? "#FEF3C7" : "#E6F7F2";
        
        showCustomConfirm(
            `${actionWord} Package`, 
            `Are you sure you want to ${actionWord.toLowerCase()} this package?`, 
            `Yes, ${actionWord}`, 
            iconColor, 
            currentStatus ? 'eye-off' : 'eye', 
            iconColor, 
            bgLightColor,
            async () => {
                try {
                    const res = await fetch(`${API_BASE}/packages/${id}/status?is_active=${newStatus}`, { 
                        method: 'PATCH',
                        headers: { "Authorization": `Bearer ${ispToken}` }
                    });
                    
                    if (checkAuthError(res)) return;
                    if (!res.ok) throw new Error("Failed to update status");
                    
                    showToast(`Package status updated.`, "success");
                    loadPackages(); 
                } catch(err) {
                    showToast("Failed to update package status.", "error");
                }
            }
        );
    };

    window.deletePackage = function(id) {
        showCustomConfirm(
            "Delete Package", 
            "Are you sure you want to delete this package? This action cannot be undone.", 
            "Yes, Delete", 
            "#EF4444", 
            "trash-2", 
            "#EF4444", 
            "#FEF2F2",
            async () => {
                try {
                    const res = await fetch(`${API_BASE}/packages/${id}`, { 
                        method: 'DELETE',
                        headers: { "Authorization": `Bearer ${ispToken}` }
                    });
                    
                    if (checkAuthError(res)) return;
                    if (!res.ok) throw new Error("Failed to delete");
                    
                    showToast("Package deleted successfully.", "success");
                    loadPackages(); 
                } catch(err) {
                    showToast("Failed to delete package.", "error");
                }
            }
        );
    };

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const saveBtn = document.getElementById('savePackageBtn');
        if(saveBtn) {
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;
        }

        const fupEnabled = fupCheckbox.checked;
        const payload = {
            id: document.getElementById('pkgId').value || null,
            name: document.getElementById('pkgName').value,
            type: document.getElementById('pkgType').value,
            price: parseFloat(document.getElementById('pkgPrice').value),
            duration_seconds: parseInt(document.getElementById('pkgDuration').value) * 60,
            speed_download_kbps: Math.round(parseFloat(document.getElementById('pkgDownload').value) * 1024),
            speed_upload_kbps: Math.round(parseFloat(document.getElementById('pkgUpload').value) * 1024),
            devices: parseInt(document.getElementById('pkgDevices').value),
            is_active: document.getElementById('pkgStatus').value === 'true',
            fup_enabled: fupEnabled,
            fup_limit_mb: fupEnabled ? Math.round(parseFloat(fupLimitInput.value) * 1024) : null,
            fup_speed_download_kbps: fupEnabled ? Math.round(parseFloat(fupDownloadInput.value) * 1024) : null,
            fup_speed_upload_kbps: fupEnabled ? Math.round(parseFloat(fupUploadInput.value) * 1024) : null,
            fup_reset_policy: fupEnabled ? fupResetSelect.value : 'daily'
        };

        try {
            const res = await fetch(`${API_BASE}/packages`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ispToken}`
                },
                body: JSON.stringify(payload)
            });

            if (checkAuthError(res)) return;
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to save package");
            }

            closeModal();
            showToast("Package saved successfully!", "success");
            loadPackages();

        } catch (err) {
            console.error(err);
            showToast(err.message || "Failed to save package to database.", "error");
        } finally {
            if(saveBtn) {
                saveBtn.textContent = "Save Package";
                saveBtn.disabled = false;
            }
        }
    });

    // Real-time Search
    document.getElementById('searchPackages').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = currentPackages.filter(p => 
            p.name.toLowerCase().includes(term) || 
            p.price.toString().includes(term)
        );
        renderPackages(filtered);
    });

    // Load initial data
    loadPackages();
});
