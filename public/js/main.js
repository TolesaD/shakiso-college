// Basic JavaScript for any interactive elements, e.g., mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
    // Example: Smooth scroll for internal links (if any)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // You can add more complex JS here for carousels, modals, form validation, etc.
});