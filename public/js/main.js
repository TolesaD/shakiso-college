document.addEventListener('DOMContentLoaded', () => {
    const timestamp = () => new Date().toISOString();

    // Public Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    let navOverlay = document.getElementById('nav-overlay');

    if (hamburger && navLinks && navOverlay) {
        const togglePublicMenu = () => {
            const isActive = navLinks.classList.toggle('active');
            hamburger.classList.toggle('active', isActive);
            navOverlay.classList.toggle('active', isActive);
            document.body.style.overflow = isActive ? 'hidden' : '';
            console.log(`[${timestamp()}] Public menu toggled: ${isActive}`);
        };

        hamburger.addEventListener('click', () => {
            console.log(`[${timestamp()}] Hamburger clicked`);
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

        console.log(`[${timestamp()}] Hamburger visibility:`, window.getComputedStyle(hamburger).display);
        hamburger.querySelectorAll('span').forEach((span, index) => {
            console.log(`[${timestamp()}] Hamburger span ${index + 1} visibility:`, window.getComputedStyle(span).display);
        });
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
    let adminOverlay = document.getElementById('admin-nav-overlay');

    if (adminHamburger && adminNavLinks && adminOverlay) {
        const toggleAdminMenu = () => {
            const isActive = adminNavLinks.classList.toggle('active');
            adminHamburger.classList.toggle('active', isActive);
            adminOverlay.classList.toggle('active', isActive);
            document.body.style.overflow = isActive ? 'hidden' : '';
            console.log(`[${timestamp()}] Admin menu toggled: ${isActive}`);
        };

        adminHamburger.addEventListener('click', () => {
            console.log(`[${timestamp()}] Admin hamburger clicked`);
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