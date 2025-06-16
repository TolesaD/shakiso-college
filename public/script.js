document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // --- Common elements and functions ---
    const getAnnouncements = async () => {
        try {
            const response = await fetch('/api/announcements');
            return await response.json();
        } catch (error) {
            console.error('Error fetching announcements:', error);
            return [];
        }
    };

    const getMedia = async () => {
        try {
            const response = await fetch('/api/media');
            return await response.json();
        } catch (error) {
            console.error('Error fetching media:', error);
            return [];
        }
    };

    // --- Home Page Logic (`index.html`) ---
    if (path === '/' || path.includes('index.html')) {
        const announcementsList = document.getElementById('announcements-list');
        const mediaGallery = document.getElementById('media-gallery');

        const loadAnnouncements = async () => {
            const announcements = await getAnnouncements();
            if (announcementsList) {
                announcementsList.innerHTML = ''; // Clear previous
                if (announcements.length === 0) {
                    announcementsList.innerHTML = '<p>No announcements available yet.</p>';
                } else {
                    announcements.forEach(ann => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <h3>${ann.title}</h3>
                            <p>${ann.content}</p>
                            <p><small>Date: ${new Date(ann.date).toLocaleDateString()}</small></p>
                        `;
                        announcementsList.appendChild(li);
                    });
                }
            }
        };

        const loadMedia = async () => {
            const mediaItems = await getMedia();
            if (mediaGallery) {
                mediaGallery.innerHTML = ''; // Clear previous
                if (mediaItems.length === 0) {
                    mediaGallery.innerHTML = '<p>No photos or videos available yet.</p>';
                } else {
                    mediaItems.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'media-item';
                        let mediaElement;
                        if (item.type === 'image') {
                            mediaElement = `<img src="${item.url}" alt="${item.title}">`;
                        } else if (item.type === 'video') {
                            mediaElement = `<video controls src="${item.url}"></video>`;
                        } else {
                            mediaElement = `<p>Unsupported media type</p>`;
                        }
                        div.innerHTML = `
                            ${mediaElement}
                            <div class="info">
                                <h3>${item.title}</h3>
                                <p>${item.description}</p>
                                <p><small>Date: ${new Date(item.date).toLocaleDateString()}</small></p>
                            </div>
                        `;
                        mediaGallery.appendChild(div);
                    });
                }
            }
        };

        loadAnnouncements();
        loadMedia();
    }

    // --- Admin Page Logic (`admin.html`) ---
    if (path.includes('admin.html')) {
        const adminLoginForm = document.getElementById('admin-login-form');
        const adminLoginSection = document.getElementById('admin-login');
        const adminPanelContent = document.getElementById('admin-panel-content');
        const logoutBtn = document.getElementById('logout-btn');

        const announcementForm = document.getElementById('announcement-form');
        const announcementsAdminList = document.getElementById('announcements-admin-list');

        const mediaForm = document.getElementById('media-form');
        const mediaAdminList = document.getElementById('media-admin-list');

        let currentAnnouncementId = null; // For editing
        let currentMediaId = null; // For editing

        // Check if admin is logged in (client-side simple check)
        const checkAdminStatus = () => {
            const token = localStorage.getItem('adminToken');
            if (token === 'shakiso_admin_token') {
                adminLoginSection.style.display = 'none';
                adminPanelContent.style.display = 'block';
                loadAdminData();
            } else {
                adminLoginSection.style.display = 'block';
                adminPanelContent.style.display = 'none';
            }
        };

        // Admin Login
        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = e.target.username.value;
                const password = e.target.password.value;

                try {
                    const response = await fetch('/api/admin/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await response.json();
                    if (data.success) {
                        localStorage.setItem('adminToken', data.token); // Store token
                        checkAdminStatus();
                    } else {
                        alert(data.message);
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    alert('An error occurred during login.');
                }
            });
        }

        // Admin Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                localStorage.removeItem('adminToken');
                isAdminLoggedIn = false; // Reset in-memory flag (won't persist server restart)
                                         // For true logout, you'd send a request to server.
                alert('You have been logged out.');
                checkAdminStatus();
            });
        }


        // --- Load Admin Data (Announcements & Media) ---
        const loadAdminData = async () => {
            await loadAdminAnnouncements();
            await loadAdminMedia();
        };

        const loadAdminAnnouncements = async () => {
            const announcements = await getAnnouncements();
            if (announcementsAdminList) {
                announcementsAdminList.innerHTML = '';
                if (announcements.length === 0) {
                    announcementsAdminList.innerHTML = '<p>No announcements posted yet.</p>';
                } else {
                    announcements.forEach(ann => {
                        const li = document.createElement('li');
                        li.dataset.id = ann.id;
                        li.innerHTML = `
                            <div class="item-content">
                                <h4>${ann.title}</h4>
                                <p>${ann.content.substring(0, 100)}...</p>
                                <small>${new Date(ann.date).toLocaleDateString()}</small>
                            </div>
                            <div class="item-actions">
                                <button class="edit-btn" data-id="${ann.id}" data-type="announcement">Edit</button>
                                <button class="delete-btn" data-id="${ann.id}" data-type="announcement">Delete</button>
                            </div>
                        `;
                        announcementsAdminList.appendChild(li);
                    });
                }
            }
        };

        const loadAdminMedia = async () => {
            const mediaItems = await getMedia();
            if (mediaAdminList) {
                mediaAdminList.innerHTML = '';
                if (mediaItems.length === 0) {
                    mediaAdminList.innerHTML = '<p>No media posted yet.</p>';
                } else {
                    mediaItems.forEach(item => {
                        const li = document.createElement('li');
                        li.dataset.id = item.id;
                        let thumbnail = '';
                        if (item.type === 'image') {
                            thumbnail = `<img src="${item.url}" alt="${item.title}" class="media-thumbnail">`;
                        } else if (item.type === 'video') {
                            thumbnail = `<video src="${item.url}" controls class="media-thumbnail"></video>`;
                        }
                        li.innerHTML = `
                            <div class="item-content">
                                ${thumbnail}
                                <h4>${item.title} (${item.type})</h4>
                                <p>${item.description.substring(0, 100)}...</p>
                                <small>${new Date(item.date).toLocaleDateString()}</small>
                            </div>
                            <div class="item-actions">
                                <button class="edit-btn" data-id="${item.id}" data-type="media">Edit</button>
                                <button class="delete-btn" data-id="${item.id}" data-type="media">Delete</button>
                            </div>
                        `;
                        mediaAdminList.appendChild(li);
                    });
                }
            }
        };

        // --- Handle Announcement Form Submission ---
        if (announcementForm) {
            announcementForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = e.target.title.value;
                const content = e.target.content.value;
                const method = currentAnnouncementId ? 'PUT' : 'POST';
                const url = currentAnnouncementId ? `/api/announcements/${currentAnnouncementId}` : '/api/announcements';

                try {
                    const response = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('adminToken')}` // Send token
                        },
                        body: JSON.stringify({ title, content })
                    });
                    if (response.ok) {
                        alert(`Announcement ${currentAnnouncementId ? 'updated' : 'added'} successfully!`);
                        e.target.reset();
                        currentAnnouncementId = null; // Reset for new entry
                        document.getElementById('announcement-submit-btn').textContent = 'Add Announcement';
                        loadAdminAnnouncements();
                    } else {
                        const errorData = await response.json();
                        alert(`Error: ${errorData.message}`);
                    }
                } catch (error) {
                    console.error('Announcement form error:', error);
                    alert('An error occurred. Check console.');
                }
            });
        }

        // --- Handle Media Form Submission ---
        if (mediaForm) {
            mediaForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const method = currentMediaId ? 'PUT' : 'POST'; // Note: PUT for media only updates metadata, not file.
                const url = currentMediaId ? `/api/media/${currentMediaId}` : '/api/media';

                try {
                    const response = await fetch(url, {
                        method: method,
                        headers: {
                             'Authorization': `Bearer ${localStorage.getItem('adminToken')}` // Send token
                        },
                        body: formData // FormData handles content-type automatically for file uploads
                    });
                    if (response.ok) {
                        alert(`Media ${currentMediaId ? 'updated' : 'added'} successfully!`);
                        e.target.reset();
                        currentMediaId = null; // Reset for new entry
                        document.getElementById('media-submit-btn').textContent = 'Add Media';
                        loadAdminMedia();
                    } else {
                        const errorData = await response.json();
                        alert(`Error: ${errorData.message}`);
                    }
                } catch (error) {
                    console.error('Media form error:', error);
                    alert('An error occurred. Check console.');
                }
            });
        }

        // --- Handle Edit/Delete Buttons ---
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('edit-btn')) {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;

                if (type === 'announcement') {
                    const announcements = await getAnnouncements();
                    const ann = announcements.find(a => a.id === id);
                    if (ann) {
                        document.getElementById('announcement-title').value = ann.title;
                        document.getElementById('announcement-content').value = ann.content;
                        currentAnnouncementId = ann.id;
                        document.getElementById('announcement-submit-btn').textContent = 'Update Announcement';
                    }
                } else if (type === 'media') {
                    const mediaItems = await getMedia();
                    const item = mediaItems.find(m => m.id === id);
                    if (item) {
                        document.getElementById('media-title').value = item.title;
                        document.getElementById('media-description').value = item.description;
                        document.getElementById('media-type').value = item.type;
                        // File input cannot be programmatically set for security reasons.
                        // User will need to re-upload if they want to change the file.
                        // Or, in this PUT endpoint, we only update metadata.
                        currentMediaId = item.id;
                        document.getElementById('media-submit-btn').textContent = 'Update Media Info';
                    }
                }
            } else if (e.target.classList.contains('delete-btn')) {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;

                if (confirm(`Are you sure you want to delete this ${type}?`)) {
                    try {
                        const url = type === 'announcement' ? `/api/announcements/${id}` : `/api/media/${id}`;
                        const response = await fetch(url, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('adminToken')}` // Send token
                            }
                        });
                        if (response.ok) {
                            alert(`${type} deleted successfully!`);
                            if (type === 'announcement') loadAdminAnnouncements();
                            else loadAdminMedia();
                        } else {
                            const errorData = await response.json();
                            alert(`Error: ${errorData.message}`);
                        }
                    } catch (error) {
                        console.error('Delete error:', error);
                        alert('An error occurred during deletion.');
                    }
                }
            }
        });

        checkAdminStatus(); // Initial check on page load
    }
});