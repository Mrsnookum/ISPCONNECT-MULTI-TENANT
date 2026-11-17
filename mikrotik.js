document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const API_BASE = "http://212.95.56.131:8001";

    // --- AUTHENTICATION & UI ---
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

    // --- STANDARD TEMPLATE LOGIC ---
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const profileToggleBtn = document.getElementById('profileToggleBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (mobileToggle && sidebar && mobileOverlay) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            mobileOverlay.classList.add('active');
        });
    }

    if (mobileOverlay && sidebar) {
        mobileOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            mobileOverlay.classList.remove('active');
        });
    }

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

    // --- CUSTOM TOAST SYSTEM ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return; 

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
        const iconColor = type === 'success' ? 'var(--primary)' : '#EF4444';

        toast.innerHTML = `
            <i data-lucide="${iconName}" width="18" style="color: ${iconColor}"></i> 
            <span>${message}</span>
        `;
        container.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- DASHBOARD DATA & LIVE FILTERING LOGIC ---
    let allRouters = [];

    function renderRouters(filterType) {
        const tbody = document.querySelector('table tbody');
        if (!tbody) return;

        let filtered = allRouters;
        if (filterType === 'Online') filtered = allRouters.filter(r => r.status === 'Online');
        if (filterType === 'Offline') filtered = allRouters.filter(r => r.status === 'Offline');
        if (filterType === 'Onboarding') filtered = allRouters.filter(r => r.provisioning_status === 'Awaiting_Services');

        if (filtered.length === 0) {
            const emptyText = filterType === 'All' ? 'routers' : filterType.toLowerCase() + ' routers';
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
                        <i data-lucide="hard-drive" width="40" style="margin-bottom: 12px; opacity: 0.5;"></i>
                        <p style="margin: 0; font-size: 0.9rem;">No ${emptyText} found.</p>
                    </td>
                </tr>`;
        } else {
            tbody.innerHTML = filtered.map(r => `
                <tr>
                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                    <td><strong>${r.name || r.identity}</strong></td>
                    <td>${r.identity}</td>
                    <td>${r.ip_address || 'Unknown'}</td>
                    <td><span class="badge" style="padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; background: ${r.status === 'Online' ? 'var(--primary-light)' : '#FEE2E2'}; color: ${r.status === 'Online' ? 'var(--primary)' : '#EF4444'};">${r.status}</span></td>
                    <td><button class="btn btn-sm action-btn" style="padding: 4px 8px; border: 1px solid #E2E8F0; background: transparent; border-radius: 4px; cursor: pointer; color: var(--text-dark); transition: all 0.2s;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">Manage</button></td>
                </tr>
            `).join('');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const filterTabs = document.querySelectorAll('.filter-tabs .filter-btn');
    filterTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            filterTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderRouters(btn.getAttribute('data-filter'));
        });
    });

    document.querySelectorAll('.metric-card').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.getAttribute('data-filter');
            const targetTab = document.querySelector(`.filter-tabs .filter-btn[data-filter="${filter}"]`);
            if (targetTab) targetTab.click();
        });
    });

    async function loadDashboardRouters() {
        try {
            const response = await fetch(`${API_BASE}/api/provision/routers`, {
                headers: { 
                    "Authorization": `Bearer ${ispToken}`,
                    "ngrok-skip-browser-warning": "true" 
                }
            });
            
            if (checkAuthError(response)) return;
            const result = await response.json();

            if (result.status === "success") {
                const now = new Date();
                
                result.data.forEach(r => {
                    if (r.last_seen_at) {
                        const lastSeen = new Date(r.last_seen_at);
                        const diffMinutes = (now - lastSeen) / (1000 * 60);
                        if (diffMinutes > 3) {
                            r.status = 'Offline';
                        }
                    }
                });
                
                allRouters = result.data;

                const totalCount = allRouters.length;
                const onlineCount = allRouters.filter(r => r.status === 'Online').length;
                const offlineCount = allRouters.filter(r => r.status === 'Offline').length;
                const onboardingCount = allRouters.filter(r => r.provisioning_status === 'Awaiting_Services').length;

                if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = totalCount;
                if(document.getElementById('stat-online')) document.getElementById('stat-online').innerText = onlineCount;
                if(document.getElementById('stat-offline')) document.getElementById('stat-offline').innerText = offlineCount;
                if(document.getElementById('stat-onboarding')) document.getElementById('stat-onboarding').innerText = onboardingCount;

                const tabAll = document.querySelector('.filter-tabs .filter-btn[data-filter="All"]');
                const tabOnline = document.querySelector('.filter-tabs .filter-btn[data-filter="Online"]');
                const tabOffline = document.querySelector('.filter-tabs .filter-btn[data-filter="Offline"]');
                const tabOnboarding = document.querySelector('.filter-tabs .filter-btn[data-filter="Onboarding"]');
                
                if(tabAll) tabAll.innerText = `All (${totalCount})`;
                if(tabOnline) tabOnline.innerText = `Online (${onlineCount})`;
                if(tabOffline) tabOffline.innerText = `Offline (${offlineCount})`;
                if(tabOnboarding) tabOnboarding.innerText = `Onboarding (${onboardingCount})`;

                const activeTab = document.querySelector('.filter-tabs .filter-btn.active');
                renderRouters(activeTab ? activeTab.getAttribute('data-filter') : 'All');
            }
        } catch (err) {
            console.error("Failed to load dashboard routers:", err);
        }
    }

    loadDashboardRouters();
    setInterval(loadDashboardRouters, 60000);

    // --- WIZARD LOGIC ---
    let activeProvisioningToken = null; 
    let pollingInterval;

    const dashboardView = document.getElementById('routers-dashboard-view');
    const wizardView = document.getElementById('onboarding-wizard-view');
    const step1 = document.getElementById('wizard-step-1');
    const step2 = document.getElementById('wizard-step-2');
    const step3 = document.getElementById('wizard-step-3');
    
    const step3Form = document.getElementById('wizard-step-3-form');
    const step3Terminal = document.getElementById('wizard-step-3-terminal');

    const ind1 = document.getElementById('step-1-indicator');
    const ind2 = document.getElementById('step-2-indicator');
    const ind3 = document.getElementById('step-3-indicator'); 

    const btnLinkMikrotik = document.getElementById('btn-link-mikrotik');
    if (btnLinkMikrotik) {
        btnLinkMikrotik.addEventListener('click', () => {
            if (dashboardView) dashboardView.style.display = 'none';
            if (wizardView) wizardView.style.display = 'block';
            resetWizard();
        });
    }

    const btnCancelOnboarding = document.getElementById('btn-cancel-onboarding');
    if (btnCancelOnboarding) {
        btnCancelOnboarding.addEventListener('click', () => {
            if (wizardView) wizardView.style.display = 'none';
            if (dashboardView) dashboardView.style.display = 'block'; 
            resetWizard();
        });
    }

    const btnNextStep1 = document.getElementById('btn-next-step-1');
    if (btnNextStep1) {
        btnNextStep1.addEventListener('click', () => {
            step1.style.display = 'none';
            step2.style.display = 'block';
            ind2.classList.add('active');
        });
    }

    const btnBackStep2 = document.getElementById('btn-back-step-2');
    if (btnBackStep2) {
        btnBackStep2.addEventListener('click', () => {
            step2.style.display = 'none';
            step1.style.display = 'block';
            ind2.classList.remove('active');
        });
    }

    const btnNextStep2 = document.getElementById('btn-next-step-2');
    if (btnNextStep2) {
        btnNextStep2.addEventListener('click', () => {
            step2.style.display = 'none';
            step3.style.display = 'block';
            ind3.classList.add('active');
        });
    }

    const btnBackStep3 = document.getElementById('btn-back-step-3');
    if (btnBackStep3) {
        btnBackStep3.addEventListener('click', () => {
            step3.style.display = 'none';
            step2.style.display = 'block';
            ind3.classList.remove('active');
        });
    }

    // Step 3: Generate Script & Provision
    const btnGenerateScript = document.getElementById('btn-generate-script');
    if (btnGenerateScript) {
        btnGenerateScript.addEventListener('click', async () => {
            
            const identityInput = document.getElementById('mikrotik-identity');
            const identity = identityInput ? identityInput.value.trim() : '';

            if(!identity) {
                showToast("Please enter a MikroTik Identity.", "error");
                if (identityInput) identityInput.focus();
                return;
            }

            const originalBtnText = btnGenerateScript.innerHTML;
            btnGenerateScript.disabled = true;
            btnGenerateScript.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#fff;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Generating...`;

            try {
                const response = await fetch(`${API_BASE}/api/provision/init`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ispToken}`
                    },
                    body: JSON.stringify({
                        identity: identity,
                        backend_url: API_BASE
                    })
                });

                if (checkAuthError(response)) return;
                if (!response.ok) throw new Error("Failed to initialize provisioning session");

                const data = await response.json();
                activeProvisioningToken = data.token; 

                if (step3Form) step3Form.style.display = 'none';
                if (step3Terminal) step3Terminal.style.display = 'block';

                const provisioningCommandText = document.getElementById('provisioning-command-text');
                if (provisioningCommandText) {
                    provisioningCommandText.innerText = data.command;
                }

                showToast("Provisioning command generated.");
                startPollingBackend(data.token);

            } catch (err) {
                console.error(err);
                showToast("Failed to connect to backend server.", "error");
            } finally {
                btnGenerateScript.disabled = false;
                btnGenerateScript.innerHTML = originalBtnText;
            }
        });
    }

    // --- UNIVERSAL COPY BUTTON LOGIC ---
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.removeAttribute('onclick');
        btn.addEventListener('click', () => {
            let textToCopy = "";
            const dataCommand = btn.getAttribute('data-command');
            
            if (dataCommand) {
                textToCopy = dataCommand; 
            } else if (btn.id === 'btn-copy-command') {
                const textElem = document.getElementById('provisioning-command-text');
                if (textElem) textToCopy = textElem.innerText; 
            } else {
                const prevElem = btn.previousElementSibling;
                if (prevElem && prevElem.tagName === 'CODE') {
                    textToCopy = prevElem.innerText;
                }
            }

            if (!textToCopy) return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                btn.innerHTML = `<i data-lucide="check" width="20" color="var(--primary)"></i>`;
                if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
                
                showToast("Command copied to clipboard!");

                setTimeout(() => {
                    btn.innerHTML = `<i data-lucide="copy" width="20"></i>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
                }, 2000);
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
                showToast("Failed to copy command.", "error");
            });
        });
    });

    function startPollingBackend(token) {
        clearInterval(pollingInterval);
        const pollingText = document.getElementById('polling-text');
        if (pollingText) pollingText.innerText = "Waiting for router to connect...";

        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE}/api/provision/status/${token}`, {
                    headers: {
                        "Authorization": `Bearer ${ispToken}`,
                        "ngrok-skip-browser-warning": "true"
                    }
                });
                if (checkAuthError(response)) return;
                if (!response.ok) return;

                const data = await response.json();
                if (data.status === "connected") {
                    clearInterval(pollingInterval);
                    showToast("Router successfully provisioned and ready!");

                    if (wizardView) wizardView.style.display = 'none';
                    if (dashboardView) dashboardView.style.display = 'block';

                    loadDashboardRouters();
                    resetWizard();
                }
            } catch (err) {
                console.error("Status check failed:", err);
            }
        }, 2000); 
    }

    function resetWizard() {
        clearInterval(pollingInterval);
        activeProvisioningToken = null; 

        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'none';
        
        if (step3Form) step3Form.style.display = 'block';
        if (step3Terminal) step3Terminal.style.display = 'none';

        if (ind1) ind1.classList.add('active');
        if (ind2) ind2.classList.remove('active');
        if (ind3) ind3.classList.remove('active');

        const identityInput = document.getElementById('mikrotik-identity');
        if (identityInput) identityInput.value = '';
    }
});