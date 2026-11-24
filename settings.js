document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const API_BASE = 'https://api.ispconnect.co.ke/api/admin/settings';

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

    // --- SIDEBAR & PROFILE DROPDOWN ---
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

    function showToast(message, type = "success") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        const icon = type === "error" ? "alert-circle" : "check-circle";
        toast.innerHTML = `<i data-lucide="${icon}" width="18"></i> <span>${message}</span>`;
        container.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
    }

    // --- TAB SWITCHING ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // --- LIVE BRANDING PREVIEW ---
    const primaryInput = document.getElementById('brandPrimary');
    const secondaryInput = document.getElementById('brandSecondary');
    const welcomeInput = document.getElementById('brandWelcome');
    const previewBox = document.getElementById('brandPreviewBox');
    const previewText = document.getElementById('brandPreviewText');

    function updateBrandPreview() {
        const p = primaryInput.value || '#00B37E';
        const s = secondaryInput.value || '#007BFF';
        document.getElementById('brandPrimaryHex').textContent = p.toUpperCase();
        document.getElementById('brandSecondaryHex').textContent = s.toUpperCase();
        previewBox.style.background = `linear-gradient(135deg, ${p}, ${s})`;
        previewText.textContent = welcomeInput.value.trim() || 'Welcome to High-Speed Wi-Fi';
    }

    primaryInput.addEventListener('input', updateBrandPreview);
    secondaryInput.addEventListener('input', updateBrandPreview);
    welcomeInput.addEventListener('input', updateBrandPreview);

    // --- PAYHERO HELPERS ---
    document.getElementById('togglePhKey').addEventListener('click', (e) => {
        const input = document.getElementById('phApiKey');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        e.currentTarget.innerHTML = isHidden
            ? '<i data-lucide="eye-off" width="15"></i> Hide'
            : '<i data-lucide="eye" width="15"></i> Show';
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: e.currentTarget });
    });

    document.getElementById('copyWebhookBtn').addEventListener('click', () => {
        const url = document.getElementById('webhookUrl').value;
        navigator.clipboard.writeText(url).then(() => {
            showToast("Webhook URL copied to clipboard.", "success");
        });
    });

    // --- LOAD SETTINGS ---
    async function loadSettings() {
        try {
            const res = await fetch(API_BASE, {
                headers: { "Authorization": `Bearer ${ispToken}` }
            });
            if (checkAuthError(res)) return;
            if (!res.ok) return;

            const data = await res.json();

            if (data.brand_primary) primaryInput.value = data.brand_primary;
            if (data.brand_secondary) secondaryInput.value = data.brand_secondary;
            if (data.brand_logo) document.getElementById('brandLogo').value = data.brand_logo;
            if (data.brand_bg) document.getElementById('brandBg').value = data.brand_bg;
            if (data.brand_welcome) welcomeInput.value = data.brand_welcome;
            updateBrandPreview();

            if (data.payhero_api_key) document.getElementById('phApiKey').value = data.payhero_api_key;
            if (data.payhero_channel_id) document.getElementById('phChannel').value = data.payhero_channel_id;

            if (data.isp_name) document.getElementById('bizName').value = data.isp_name;
            if (data.support_contact) document.getElementById('bizContact').value = data.support_contact;
        } catch (err) {
            console.error("Failed to load settings", err);
        }
    }

    // --- SAVE SETTINGS ---
    async function saveSettings(category, payload, btnId, originalText, onSuccess) {
        const btn = document.getElementById(btnId);
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" width="16" class="spin"></i> Saving...`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });

        try {
            const res = await fetch(`${API_BASE}/${category}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ispToken}`
                },
                body: JSON.stringify(payload)
            });
            if (checkAuthError(res)) return;
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.detail || "Failed to update settings");

            showToast(resData.message || "Settings updated successfully.", "success");
            if (onSuccess) onSuccess();
        } catch (err) {
            showToast(err.message || "Failed to update settings.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
        }
    }

    // --- FORM HANDLERS ---
    document.getElementById('formBranding').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings('branding', {
            brand_primary: primaryInput.value,
            brand_secondary: secondaryInput.value,
            brand_logo: document.getElementById('brandLogo').value.trim(),
            brand_bg: document.getElementById('brandBg').value.trim(),
            brand_welcome: welcomeInput.value.trim()
        }, 'btnBranding', '<i data-lucide="save" width="16"></i> Save Branding');
    });

    document.getElementById('formPayhero').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings('payhero', {
            payhero_api_key: document.getElementById('phApiKey').value.trim(),
            payhero_channel_id: document.getElementById('phChannel').value.trim()
        }, 'btnPayhero', '<i data-lucide="save" width="16"></i> Save Payment Config');
    });

    document.getElementById('formBusiness').addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = document.getElementById('bizName').value.trim();
        const newContact = document.getElementById('bizContact').value.trim();
        saveSettings('business', {
            isp_name: newName,
            support_contact: newContact
        }, 'btnBusiness', '<i data-lucide="save" width="16"></i> Save Profile', () => {
            if (newName) {
                localStorage.setItem("companyName", newName);
                const sidebarLogo = document.getElementById("sidebar-logo-text");
                const navCompany = document.getElementById("navCompany");
                if (sidebarLogo) sidebarLogo.textContent = newName;
                if (navCompany) navCompany.textContent = newName;
            }
        });
    });

    document.getElementById('formSecurity').addEventListener('submit', (e) => {
        e.preventDefault();
        const newUser = document.getElementById('adminUser').value.trim();
        const newPass = document.getElementById('adminPass').value.trim();
        if (!newUser && !newPass) {
            showToast("Enter a new username or password first.", "error");
            return;
        }
        saveSettings('security', {
            username: newUser,
            password: newPass
        }, 'btnSecurity', '<i data-lucide="shield-check" width="16"></i> Update Credentials', () => {
            if (newUser) {
                localStorage.setItem("adminName", newUser);
                document.getElementById("navName").textContent = newUser;
                document.getElementById("navAvatar").textContent = newUser.substring(0, 2).toUpperCase();
            }
            document.getElementById('adminPass').value = '';
        });
    });

    loadSettings();
});
