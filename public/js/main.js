document.addEventListener('DOMContentLoaded', function() {
    // Public Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    let navOverlay = document.querySelector('.nav-overlay');

    if (hamburger && navLinks) {
        // Create overlay if not present
        if (!navOverlay) {
            navOverlay = document.createElement('div');
            navOverlay.className = 'nav-overlay';
            document.body.appendChild(navOverlay);
        }

        function togglePublicMenu() {
            const isActive = navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
            navOverlay.classList.toggle('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
            console.log(`[${new Date().toISOString()}] Public menu toggled: ${isActive}`);
        }

        hamburger.addEventListener('click', togglePublicMenu);
        navOverlay.addEventListener('click', togglePublicMenu);

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks.classList.contains('active')) {
                    togglePublicMenu();
                    console.log(`[${new Date().toISOString()}] Public nav link clicked: ${link.href}`);
                }
            });
        });
    } else {
        console.error(`[${new Date().toISOString()}] Public hamburger or nav-links not found`);
    }

    // Admin Mobile Menu Toggle
    const adminHamburger = document.getElementById('admin-hamburger');
    const adminNavLinks = document.getElementById('admin-nav-links');
    let adminOverlay = document.querySelector('.admin-nav-overlay');

    if (adminHamburger && adminNavLinks) {
        // Create admin overlay if not present
        if (!adminOverlay) {
            adminOverlay = document.createElement('div');
            adminOverlay.className = 'admin-nav-overlay';
            document.body.appendChild(adminOverlay);
        }

        function toggleAdminMenu() {
            const isActive = adminNavLinks.classList.toggle('active');
            adminHamburger.classList.toggle('active');
            adminOverlay.classList.toggle('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
            console.log(`[${new Date().toISOString()}] Admin menu toggled: ${isActive}`);
        }

        adminHamburger.addEventListener('click', toggleAdminMenu);
        adminOverlay.addEventListener('click', toggleAdminMenu);

        adminNavLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (adminNavLinks.classList.contains('active')) {
                    toggleAdminMenu();
                    console.log(`[${new Date().toISOString()}] Admin nav link clicked: ${link.href}`);
                }
            });
        });
    } else {
        console.warn(`[${new Date().toISOString()}] Admin hamburger or nav-links not found`);
    }

    // Lightbox for Gallery
    const galleryItems = document.querySelectorAll('.gallery-item');
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
                console.log(`[${new Date().toISOString()}] Lightbox opened: ${img.src}`);
            }
        });
    });

    lightbox.addEventListener('click', e => {
        if (e.target !== e.currentTarget) return;
        lightbox.classList.remove('active');
        console.log(`[${new Date().toISOString()}] Lightbox closed`);
    });

    // Contact Form Validation
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            const message = document.getElementById('message');
            let isValid = true;

            if (!name.value.trim()) {
                isValid = false;
                name.classList.add('error');
            } else {
                name.classList.remove('error');
            }

            if (!email.value.trim() || !email.value.includes('@')) {
                isValid = false;
                email.classList.add('error');
            } else {
                email.classList.remove('error');
            }

            if (!message.value.trim()) {
                isValid = false;
                message.classList.add('error');
            } else {
                message.classList.remove('error');
            }

            if (!isValid) {
                e.preventDefault();
                alert('Please fill in all required fields correctly.');
                console.log(`[${new Date().toISOString()}] Contact form validation failed`);
            } else {
                console.log(`[${new Date().toISOString()}] Contact form validated successfully`);
            }
        });
    }
});