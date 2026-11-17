document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // This will eventually be https://api.ispconnect.co.ke/api/portal
    const API_BASE = 'http://212.95.56.131:8001/api/portal';
    let selectedPackageId = null;

    // --- MULTI-TENANT ROUTING: Grab the specific ISP identifier ---
    const urlParams = new URLSearchParams(window.location.search);
    const tenantId = urlParams.get('tenant_id');

    if (!tenantId) {
        showToast("Configuration Error: Missing ISP ID. Please connect through the official hotspot network.");
        document.getElementById('btnPay').disabled = true;
        document.getElementById('btnConnect').disabled = true;
        return;
    }

    // Grab the router's local IP destination and add Google Redirect
    let routerLoginUrl = urlParams.get('login_url') || "http://10.0.0.1/login";
    if (routerLoginUrl.includes('?')) {
        routerLoginUrl += '&dst=https://google.com';
    } else {
        routerLoginUrl += '?dst=https://google.com';
    }
    
    const loginForm = document.getElementById('mtik-login-form');
    if (loginForm) {
        loginForm.action = routerLoginUrl;
    }

    const packagesContainer = document.getElementById('packagesContainer');
    const phoneInput = document.getElementById('phoneInput');
    const voucherInput = document.getElementById('voucherInput');
    const btnPay = document.getElementById('btnPay');
    const btnConnect = document.getElementById('btnConnect');

    function showToast(msg) {
        const toast = document.getElementById('toastMsg');
        let iconHtml = typeof lucide !== 'undefined' ? `<i data-lucide="info" width="18"></i> ` : '';
        toast.innerHTML = `${iconHtml}${msg}`;
        if (typeof lucide !== 'undefined') lucide.createIcons({root: toast});
        
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    // --- DYNAMIC BRANDING ENGINE (Tenant Specific) ---
    async function loadPortalBranding() {
        try {
            const res = await fetch(`${API_BASE}/settings?tenant_id=${tenantId}`);
            if (!res.ok) return;
            
            const config = await res.json();

            // 1. Theme Colors
            if (config.brand_primary) {
                document.documentElement.style.setProperty('--primary', config.brand_primary);
                document.documentElement.style.setProperty('--primary-dark', config.brand_primary);
                const leftPanel = document.getElementById('portalLeftPanel');
                if (leftPanel) {
                    leftPanel.style.background = `linear-gradient(135deg, #022C22 0%, ${config.brand_primary} 100%)`;
                }
            }

            // 2. Custom Background Image
            if (config.brand_bg) {
                document.body.style.backgroundImage = `url('${config.brand_bg}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundAttachment = 'fixed';
            }

            // 3. Custom Logo & ISP Name
            const brandNameEl = document.getElementById('portalBrandName');
            if (config.brand_logo && brandNameEl) {
                brandNameEl.innerHTML = `<img src="${config.brand_logo}" alt="Logo" style="max-height: 32px; border-radius: 4px;"> ${config.isp_name || 'ISPConnect'}`;
            } else if (config.isp_name && brandNameEl) {
                brandNameEl.textContent = config.isp_name;
            }

            if (config.isp_name) {
                document.title = `Connect | ${config.isp_name} Wi-Fi`;
            }

            // 4. Custom Welcome Message
            if (config.brand_welcome) {
                const welcomeMsg = document.getElementById('portalWelcome');
                if (welcomeMsg) welcomeMsg.textContent = config.brand_welcome;
            }
        } catch (err) {
            console.error("Failed to load dynamic branding:", err);
        }
    }

    // --- FETCH PACKAGES (Tenant Specific) ---
    async function loadPackages() {
        try {
            const res = await fetch(`${API_BASE}/packages?tenant_id=${tenantId}`);
            if (!res.ok) throw new Error("Failed to load packages");
            
            const packages = await res.json();
            
            if (!packages || packages.length === 0) {
                packagesContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #EF4444; font-size: 0.85rem; padding: 20px;">No active plans available for this network right now.</div>`;
                return;
            }

            packagesContainer.innerHTML = packages.map(p => `
                <div class="pkg-btn" data-id="${p.id}">
                    <div class="pkg-price">KES ${p.price}</div>
                    <div class="pkg-name">${p.name}</div>
                </div>
            `).join('');

            document.querySelectorAll('.pkg-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.pkg-btn').forEach(b => b.classList.remove('selected'));
                    this.classList.add('selected');
                    selectedPackageId = this.getAttribute('data-id');
                });
            });

        } catch (err) {
            console.error("Error loading packages:", err);
            packagesContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #EF4444; font-size: 0.85rem; padding: 20px;">Could not connect to database.</div>`;
        }
    }

    btnPay.addEventListener('click', async () => {
        const phone = phoneInput.value.trim();
        
        if (!selectedPackageId) return showToast("Please select a package first!");
        if (!phone || phone.length < 10) return showToast("Please enter a valid phone number.");

        const originalText = btnPay.innerHTML;
        btnPay.innerHTML = `Initiating Payment...`;
        btnPay.disabled = true;

        try {
            const routerMac = urlParams.get('mac') || (window.mTikData ? window.mTikData.mac : "");
            const routerIp = urlParams.get('routerIp') || urlParams.get('ip') || (window.mTikData ? window.mTikData.ip : "");

            const res = await fetch(`${API_BASE}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: phone, 
                    package_id: selectedPackageId,
                    tenant_id: tenantId,
                    mac: routerMac,
                    ip: routerIp
                })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                btnPay.innerHTML = `Verifying Payment...`;
                showToast("Check your phone! Enter your M-Pesa PIN to complete payment.");
                
                let attempts = 0;
                const maxAttempts = 20; 

                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const checkRes = await fetch(`${API_BASE}/verify/${phone}?tenant_id=${tenantId}`);
                        const checkData = await checkRes.json();

                        if (checkData.status === "success") {
                            clearInterval(pollInterval);
                            showToast("Payment received! Connecting you to the internet...");
                            
                            setTimeout(() => {
                                const autoVoucher = checkData.voucher;
                                window.location.href = `${routerLoginUrl}&username=${autoVoucher}&password=${autoVoucher}`;
                            }, 1500);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(pollInterval);
                            btnPay.innerHTML = originalText;
                            btnPay.disabled = false;
                            showToast("Verification timeout. If you paid, try logging in with your phone number.");
                        }
                    } catch (err) {
                        console.error("Polling error", err);
                    }
                }, 3000); 

            } else {
                throw new Error(data.detail || "Payment failed");
            }
        } catch (err) {
            showToast(`Error: ${err.message}`);
            btnPay.innerHTML = originalText;
            btnPay.disabled = false;
        } 
    });

    btnConnect.addEventListener('click', async () => {
        const voucher = voucherInput.value.trim().toUpperCase();
        if (!voucher) return showToast("Please enter a voucher code or M-Pesa code.");

        const originalText = btnConnect.innerHTML;
        btnConnect.innerHTML = `Verifying Code...`;
        btnConnect.disabled = true;

        const routerMac = urlParams.get('mac') || (window.mTikData ? window.mTikData.mac : "");

        try {
            const res = await fetch(`${API_BASE}/reconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: voucher, mac: routerMac, tenant_id: tenantId })
            });

            const data = await res.json();

            if (res.ok) {
                showToast("Code accepted! Connecting...");
                setTimeout(() => {
                    const autoVoucher = data.username || voucher;
                    window.location.href = `${routerLoginUrl}&username=${autoVoucher}&password=${autoVoucher}`;
                }, 1500);
            } else {
                throw new Error(data.detail || "Invalid code or used on another device");
            }
        } catch (err) {
            showToast(`Error: ${err.message}`);
            btnConnect.innerHTML = originalText;
            btnConnect.disabled = false;
        }
    });

    loadPortalBranding();
    loadPackages();
});