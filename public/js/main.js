// Mobile menu toggle - Enhanced version
document.addEventListener('DOMContentLoaded', function() {
    // ======================
    // Enhanced Mobile Menu
    // ======================
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navOverlay = document.createElement('div');
    
    if (hamburger && navLinks) {
        // Create overlay element
        navOverlay.className = 'nav-overlay';
        document.body.appendChild(navOverlay);

        // Toggle menu function
        function toggleMenu() {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
            navOverlay.classList.toggle('active');
            document.body.style.overflow = 
                navLinks.classList.contains('active') ? 'hidden' : '';
        }

        // Hamburger click event
        hamburger.addEventListener('click', toggleMenu);

        // Overlay click event
        navOverlay.addEventListener('click', toggleMenu);

        // Close menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks.classList.contains('active')) {
                    toggleMenu();
                }
            });
        });
    }

    // ======================
    // Existing Lightbox Code
    // ======================
    const galleryItems = document.querySelectorAll('.gallery-item');
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    document.body.appendChild(lightbox);

    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            const img = item.querySelector('img');
            const clone = img.cloneNode();
            lightbox.innerHTML = '';
            lightbox.appendChild(clone);
            lightbox.classList.add('active');
        });
    });

    lightbox.addEventListener('click', e => {
        if (e.target !== e.currentTarget) return;
        lightbox.classList.remove('active');
    });

    // ======================
    // Existing Form Validation
    // ======================
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            const message = document.getElementById('message');
            let isValid = true;

            if (name.value.trim() === '') {
                isValid = false;
                name.classList.add('error');
            } else {
                name.classList.remove('error');
            }

            if (email.value.trim() === '' || !email.value.includes('@')) {
                isValid = false;
                email.classList.add('error');
            } else {
                email.classList.remove('error');
            }

            if (message.value.trim() === '') {
                isValid = false;
                message.classList.add('error');
            } else {
                message.classList.remove('error');
            }

            if (!isValid) {
                e.preventDefault();
                alert('Please fill in all required fields correctly.');
            }
        });
    }
});