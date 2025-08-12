document.addEventListener('DOMContentLoaded', () => {
    const timestamp = () => new Date().toISOString();

    // Public Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    const navOverlay = document.getElementById('nav-overlay');

    if (hamburger && navLinks && navOverlay) {
        // Fallback CSS
        hamburger.style.cssText = `
            display: none; cursor: pointer; width: 30px; height: 20px;
            position: relative; z-index: 1002; pointer-events: auto;
            visibility: visible; background: transparent;
        `;
        hamburger.querySelectorAll('span').forEach(span => {
            span.style.cssText = `
                background: #ffffff; display: block !important; height: 3px;
                margin-bottom: 5px; position: relative;
            `;
        });
        navLinks.style.cssText = `
            display: flex; list-style: none; margin-left: auto;
        `;
        navOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 999; display: none;
            opacity: 0; transition: opacity 0.3s ease-in-out;
        `;

        const togglePublicMenu = () => {
            try {
                const isActive = navLinks.classList.toggle('active');
                hamburger.classList.toggle('active', isActive);
                navOverlay.classList.toggle('active', isActive);
                document.body.style.overflow = isActive ? 'hidden' : '';

                // Apply mobile styles
                if (isActive) {
                    navLinks.style.cssText = `
                        display: flex !important; flex-direction: column;
                        position: fixed; top: 60px; right: 0; width: 250px;
                        height: calc(100vh - 60px); background-color: #2c3e50;
                        padding: 1rem; z-index: 1001; transform: translateX(0) !important;
                    `;
                    navOverlay.style.cssText = `
                        display: block !important; opacity: 1; pointer-events: auto;
                    `;
                    hamburger.querySelectorAll('span')[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                    hamburger.querySelectorAll('span')[1].style.opacity = '0';
                    hamburger.querySelectorAll('span')[2].style.transform = 'rotate(-45deg) translate(7px, -7px)';
                } else {
                    navLinks.style.cssText = `
                        display: none !important; flex-direction: column;
                        position: fixed; top: 60px; right: 0; width: 250px;
                        height: calc(100vh - 60px); background-color: #2c3e50;
                        padding: 1rem; z-index: 1001; transform: translateX(100%) !important;
                    `;
                    navOverlay.style.cssText = `
                        display: none !important; opacity: 0; pointer-events: none;
                    `;
                    hamburger.querySelectorAll('span')[0].style.transform = 'none';
                    hamburger.querySelectorAll('span')[1].style.opacity = '1';
                    hamburger.querySelectorAll('span')[2].style.transform = 'none';
                }

                console.log(`[${timestamp()}] Public menu toggled: ${isActive}`);
                console.log(`[${timestamp()}] nav-links display:`, window.getComputedStyle(navLinks).display);
                console.log(`[${timestamp()}] nav-overlay display:`, window.getComputedStyle(navOverlay).display);
                console.log(`[${timestamp()}] nav-links transform:`, window.getComputedStyle(navLinks).transform);
            } catch (error) {
                console.error(`[${timestamp()}] Error toggling public menu:`, error);
            }
        };

        hamburger.addEventListener('click', (e) => {
            console.log(`[${timestamp()}] Hamburger clicked at position: (${e.clientX}, ${e.clientY})`);
            togglePublicMenu();
        });

        navOverlay.addEventListener('click', () => {
            console.log(`[${timestamp()}] Public nav overlay clicked`);
            togglePublicMenu();
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks.classList.contains('active')) {
                    console.log(`[${timestamp()}] Public nav link clicked: ${link.href}`);
                    togglePublicMenu();
                }
            });
        });

        // Log initial visibility
        console.log(`[${timestamp()}] Hamburger visibility:`, window.getComputedStyle(hamburger).display);
        hamburger.querySelectorAll('span').forEach((span, index) => {
            console.log(`[${timestamp()}] Hamburger span ${index + 1} visibility:`, window.getComputedStyle(span).display);
        });

        // Ensure hamburger visibility on mobile
        if (window.innerWidth <= 768) {
            hamburger.style.display = 'block';
            console.log(`[${timestamp()}] Hamburger set to display: block for mobile`);
        }
    } else {
        console.error(`[${timestamp()}] Public hamburger or nav-links not found`, {
            hamburger: !!hamburger,
            navLinks: !!navLinks,
            navOverlay: !!navOverlay,
        });
    }

    // Admin Mobile Menu Toggle
    const adminHamburger = document.getElementById('admin-hamburger');
    const adminNavLinks = document.getElementById('admin-nav-links');
    const adminOverlay = document.getElementById('admin-nav-overlay');

    if (adminHamburger && adminNavLinks && adminOverlay) {
        // Fallback CSS
        adminHamburger.style.cssText = `
            display: none; cursor: pointer; width: 30px; height: 20px;
            position: relative; z-index: 1002; pointer-events: auto;
            visibility: visible; background: transparent;
        `;
        adminHamburger.querySelectorAll('span').forEach(span => {
            span.style.cssText = `
                background: #ffffff; display: block !important; height: 3px;
                margin-bottom: 5px; position: relative;
            `;
        });
        adminNavLinks.style.cssText = `
            display: flex; list-style: none; margin-left: auto;
        `;
        adminOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 999; display: none;
            opacity: 0; transition: opacity 0.3s ease-in-out;
        `;

        const toggleAdminMenu = () => {
            try {
                const isActive = adminNavLinks.classList.toggle('active');
                adminHamburger.classList.toggle('active', isActive);
                adminOverlay.classList.toggle('active', isActive);
                document.body.style.overflow = isActive ? 'hidden' : '';

                if (isActive) {
                    adminNavLinks.style.cssText = `
                        display: flex !important; flex-direction: column;
                        position: fixed; top: 60px; right: 0; width: 250px;
                        height: calc(100vh - 60px); background-color: #2c3e50;
                        padding: 1rem; z-index: 1001; transform: translateX(0) !important;
                    `;
                    adminOverlay.style.cssText = `
                        display: block !important; opacity: 1; pointer-events: auto;
                    `;
                    adminHamburger.querySelectorAll('span')[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                    adminHamburger.querySelectorAll('span')[1].style.opacity = '0';
                    adminHamburger.querySelectorAll('span')[2].style.transform = 'rotate(-45deg) translate(7px, -7px)';
                } else {
                    adminNavLinks.style.cssText = `
                        display: none !important; flex-direction: column;
                        position: fixed; top: 60px; right: 0; width: 250px;
                        height: calc(100vh - 60px); background-color: #2c3e50;
                        padding: 1rem; z-index: 1001; transform: translateX(100%) !important;
                    `;
                    adminOverlay.style.cssText = `
                        display: none !important; opacity: 0; pointer-events: none;
                    `;
                    adminHamburger.querySelectorAll('span')[0].style.transform = 'none';
                    adminHamburger.querySelectorAll('span')[1].style.opacity = '1';
                    adminHamburger.querySelectorAll('span')[2].style.transform = 'none';
                }

                console.log(`[${timestamp()}] Admin menu toggled: ${isActive}`);
                console.log(`[${timestamp()}] admin-nav-links display:`, window.getComputedStyle(adminNavLinks).display);
                console.log(`[${timestamp()}] admin-nav-overlay display:`, window.getComputedStyle(adminOverlay).display);
            } catch (error) {
                console.error(`[${timestamp()}] Error toggling admin menu:`, error);
            }
        };

        adminHamburger.addEventListener('click', (e) => {
            console.log(`[${timestamp()}] Admin hamburger clicked at position: (${e.clientX}, ${e.clientY})`);
            toggleAdminMenu();
        });

        adminOverlay.addEventListener('click', () => {
            console.log(`[${timestamp()}] Admin nav overlay clicked`);
            toggleAdminMenu();
        });

        adminNavLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (adminNavLinks.classList.contains('active')) {
                    console.log(`[${timestamp()}] Admin nav link clicked: ${link.href}`);
                    toggleAdminMenu();
                }
            });
        });

        console.log(`[${timestamp()}] Admin hamburger visibility:`, window.getComputedStyle(adminHamburger).display);
        adminHamburger.querySelectorAll('span').forEach((span, index) => {
            console.log(`[${timestamp()}] Admin hamburger span ${index + 1} visibility:`, window.getComputedStyle(span).display);
        });

        if (window.innerWidth <= 768) {
            adminHamburger.style.display = 'block';
            console.log(`[${timestamp()}] Admin hamburger set to display: block for mobile`);
        }
    } else {
        console.warn(`[${timestamp()}] Admin hamburger or nav-links not found`, {
            adminHamburger: !!adminHamburger,
            adminNavLinks: !!adminNavLinks,
            adminOverlay: !!adminOverlay,
        });
    }

    // Lightbox for Gallery
    const galleryItems = document.querySelectorAll('.photo-card');
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    document.body.appendChild(lightbox);

    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            const img = item.querySelector('img');
            if (img) {
                const clone = img.cloneNode(true);
                lightbox.innerHTML = '';
                lightbox.appendChild(clone);
                lightbox.classList.add('active');
                console.log(`[${timestamp()}] Lightbox opened: ${img.src}`);
            }
        });
    });

    lightbox.addEventListener('click', e => {
        if (e.target !== e.currentTarget) return;
        lightbox.classList.remove('active');
        console.log(`[${timestamp()}] Lightbox closed`);
    });

    // Contact Form Validation
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', e => {
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            const message = document.getElementById('message');
            let isValid = true;

            if (!name?.value.trim()) {
                isValid = false;
                name.classList.add('error');
            } else {
                name.classList.remove('error');
            }

            if (!email?.value.trim() || !email.value.includes('@')) {
                isValid = false;
                email.classList.add('error');
            } else {
                email.classList.remove('error');
            }

            if (!message?.value.trim()) {
                isValid = false;
                message.classList.add('error');
            } else {
                message.classList.remove('error');
            }

            if (!isValid) {
                e.preventDefault();
                alert('Please fill in all required fields correctly.');
                console.log(`[${timestamp()}] Contact form validation failed`);
            } else {
                console.log(`[${timestamp()}] Contact form validated successfully`);
            }
        });
    }
});