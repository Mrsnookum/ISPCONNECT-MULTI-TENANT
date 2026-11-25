document.addEventListener("DOMContentLoaded", () => {
    const WHATSAPP_NUMBER = "254712153539";

    // --- 1. MOBILE MENU TOGGLE ---
    const mobileToggle = document.getElementById("mobileToggle");
    const navMenu = document.getElementById("navMenu");
    const navItems = document.querySelectorAll(".nav-item");

    const burgerIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="7" x2="21" y2="7"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="17" x2="21" y2="17"></line></svg>';
    const closeIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    function closeMobileMenu() {
        if (!navMenu || !mobileToggle) return;
        navMenu.classList.remove("active");
        mobileToggle.setAttribute("aria-expanded", "false");
        mobileToggle.innerHTML = burgerIcon;
    }

    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener("click", () => {
            const isOpen = navMenu.classList.toggle("active");
            mobileToggle.setAttribute("aria-expanded", String(isOpen));
            mobileToggle.innerHTML = isOpen ? closeIcon : burgerIcon;
        });

        navItems.forEach((item) => item.addEventListener("click", closeMobileMenu));
    }

    // --- 2. SCROLL REVEAL ANIMATIONS ---
    const revealEls = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window && revealEls.length) {
        const observer = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        obs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
        );
        revealEls.forEach((el) => observer.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add("visible"));
    }

    // --- 3. FAQ ACCORDION ---
    const faqItems = document.querySelectorAll(".faq-item");
    faqItems.forEach((item) => {
        const btn = item.querySelector(".faq-question");
        if (!btn) return;
        btn.addEventListener("click", () => {
            const wasActive = item.classList.contains("active");
            faqItems.forEach((other) => other.classList.remove("active"));
            if (!wasActive) item.classList.add("active");
        });
    });

    // --- 4. SMOOTH SCROLLING ---
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", function (e) {
            const targetId = this.getAttribute("href");
            if (!targetId || targetId === "#") return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                window.scrollTo({
                    top: target.getBoundingClientRect().top + window.pageYOffset - 74,
                    behavior: "smooth"
                });
            }
        });
    });

    // --- 5. STICKY NAVBAR SHADOW ---
    const navbar = document.getElementById("navbar");
    if (navbar) {
        window.addEventListener("scroll", () => {
            navbar.style.boxShadow = window.scrollY > 12 ? "0 6px 20px rgba(15,23,42,0.07)" : "none";
        }, { passive: true });
    }

    // --- 6. INTERACTIVE REVENUE ESTIMATOR ---
    const estUsers = document.getElementById("estUsers");
    const estPrice = document.getElementById("estPrice");
    const estUsersVal = document.getElementById("estUsersVal");
    const estPriceVal = document.getElementById("estPriceVal");
    const estMonthlyTotal = document.getElementById("estMonthlyTotal");
    const estCostPct = document.getElementById("estCostPct");

    function updateEstimator() {
        if (!estUsers || !estPrice) return;
        const users = Number(estUsers.value);
        const price = Number(estPrice.value);
        const monthly = users * price * 30;
        const pct = monthly > 0 ? ((1300 / monthly) * 100).toFixed(1) : "0.0";

        if (estUsersVal) estUsersVal.textContent = `${users} users/day`;
        if (estPriceVal) estPriceVal.textContent = `KES ${price}`;
        if (estMonthlyTotal) estMonthlyTotal.textContent = `KES ${monthly.toLocaleString()}`;
        if (estCostPct) estCostPct.textContent = `${pct}%`;
    }

    if (estUsers && estPrice) {
        estUsers.addEventListener("input", updateEstimator);
        estPrice.addEventListener("input", updateEstimator);
        updateEstimator();
    }

    // --- 7. MODAL HELPERS ---
    const customModal = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const demoModal = document.getElementById("demoModal");
    const enterpriseModal = document.getElementById("enterpriseModal");

    function openOverlay(el) {
        if (!el) return;
        el.classList.add("active");
        el.setAttribute("aria-hidden", "false");
    }

    function closeAllModals() {
        document.querySelectorAll(".modal-overlay.active").forEach((m) => {
            m.classList.remove("active");
            m.setAttribute("aria-hidden", "true");
        });
    }

    function openModal(title, message) {
        if (modalTitle) modalTitle.textContent = title;
        if (modalMessage) modalMessage.textContent = message;
        openOverlay(customModal);
    }

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", closeAllModals);
    });

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeAllModals);

    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeAllModals();
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAllModals();
            closeMobileMenu();
        }
    });

    // --- 8. INTERACTIVE CAPTIVE PORTAL DEMO ---
    const demoBtn = document.getElementById("demoBtn");
    const demoPkgs = document.querySelectorAll(".demo-pkg");
    const demoPayBtn = document.getElementById("demoPayBtn");
    const demoStatus = document.getElementById("demoStatus");
    let selectedDemoPkg = "1 Hour — KES 20";

    if (demoBtn && demoModal) {
        demoBtn.addEventListener("click", () => {
            if (demoStatus) demoStatus.textContent = "";
            openOverlay(demoModal);
        });
    }

    demoPkgs.forEach((pkg) => {
        pkg.addEventListener("click", () => {
            demoPkgs.forEach((p) => p.classList.remove("selected"));
            pkg.classList.add("selected");
            selectedDemoPkg = pkg.getAttribute("data-demo-pkg") || "1 Hour — KES 20";
            if (demoStatus) demoStatus.textContent = `Selected: ${selectedDemoPkg}`;
        });
    });

    if (demoPayBtn && demoStatus) {
        demoPayBtn.addEventListener("click", () => {
            demoPayBtn.disabled = true;
            demoStatus.style.color = "#2563EB";
            demoStatus.textContent = "Sending M-Pesa STK Push to phone...";
            setTimeout(() => {
                demoStatus.style.color = "#059669";
                demoStatus.textContent = `Payment confirmed! Voucher #K8P4X9 active (${selectedDemoPkg}). Connected!`;
                demoPayBtn.disabled = false;
            }, 1200);
        });
    }

    // --- 9. ENTERPRISE QUOTE MODAL -> SAVE TO SUPPORT INBOX + WHATSAPP ---
    const enterpriseBtn = document.getElementById("enterpriseBtn");
    const enterpriseForm = document.getElementById("enterpriseForm");

    if (enterpriseBtn && enterpriseModal) {
        enterpriseBtn.addEventListener("click", () => openOverlay(enterpriseModal));
    }

    if (enterpriseForm) {
        enterpriseForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("entName").value.trim();
            const routers = document.getElementById("entRouters").value.trim();
            const notes = document.getElementById("entNotes").value.trim();

            fetch("https://api.ispconnect.co.ke/api/support/public/inquiry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({
                    source: "enterprise_quote",
                    sender_name: name,
                    plan_interest: "Enterprise Edition",
                    routers_info: routers,
                    subject: `Enterprise Quote — ${name}`,
                    message: `Routers/Sites: ${routers}${notes ? `\nNotes: ${notes}` : ""}`
                })
            }).catch(() => {});

            const msg = `Hi ISPConnect! I'm interested in the *Enterprise Edition (Full Single-ISP System Ownership)*.\n\n*Name/ISP:* ${name}\n*Routers/Sites:* ${routers}${notes ? `\n*Notes:* ${notes}` : ""}`;
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");

            enterpriseForm.reset();
            closeAllModals();
            openModal("Quote Request Sent", "Your Enterprise inquiry has been logged with our support team and opened in WhatsApp.");
        });
    }

    // --- 10. CONTACT FORM SUBMISSION -> SAVE TO SUPPORT INBOX + WHATSAPP ---
    const contactForm = document.getElementById("contactForm");
    if (contactForm) {
        contactForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("contactName").value.trim();
            const phone = document.getElementById("contactPhone").value.trim();
            const plan = document.getElementById("contactPlan").value;
            const message = document.getElementById("contactMessage").value.trim();

            fetch("https://api.ispconnect.co.ke/api/support/public/inquiry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({
                    source: "contact_form",
                    sender_name: name,
                    sender_phone: phone,
                    plan_interest: plan,
                    subject: `Contact Form — ${plan}`,
                    message: message
                })
            }).catch(() => {});

            const waText = `Hi ISPConnect!\n*Name:* ${name}\n*Phone:* ${phone}\n*Interested In:* ${plan}\n*Message:* ${message}`;
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`, "_blank", "noopener");

            contactForm.reset();
            openModal("Message Sent", "Your message has been logged to our Support Desk and loaded into WhatsApp.");
        });
    }
});
