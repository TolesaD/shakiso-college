const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Announcement = require('../models/Announcement');
const Video = require('../models/Video');
const Photo = require('../models/Photo');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Cloudinary setup
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'shakiso-college', // Folder in Cloudinary
        format: async (req, file) => {
            if (file.mimetype.startsWith('image')) return 'jpeg'; // Example for images
            if (file.mimetype.startsWith('video')) return 'mp4'; // Example for videos
            return 'raw'; // Default for other file types
        },
        public_id: (req, file) => `shakiso-${Date.now()}-${file.originalname.replace(/ /g, '-')}`,
    },
});

const upload = multer({ storage: storage });

// Admin Login Page
router.get('/login', (req, res) => {
    res.render('admin-login', {
        title: 'Admin Login',
        error: req.flash('error'),
        success: req.flash('success')
    });
});

// Admin Login POST
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            req.flash('error', 'Invalid credentials.');
            return res.redirect('/admin/login');
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            req.flash('error', 'Invalid credentials.');
            return res.redirect('/admin/login');
        }

        req.session.userId = user._id;
        req.flash('success', 'Logged in successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Server error during login.');
        res.redirect('/admin/login');
    }
});

// Admin Dashboard (Protected)
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ date: -1 });
        const videos = await Video.find().sort({ uploadedAt: -1 });
        const photos = await Photo.find().sort({ uploadedAt: -1 });
        res.render('admin-dashboard', {
            title: 'Admin Dashboard',
            user: req.session.userId,
            announcements,
            videos,
            photos,
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Could not load dashboard data.');
        res.redirect('/admin/login'); // Redirect to login if dashboard fails to load
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/admin/dashboard');
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        req.flash('success', 'You have been logged out.');
        res.redirect('/admin/login');
    });
});

// --- Announcement Routes ---
router.post('/announcements', isAuthenticated, async (req, res) => {
    const { title, content } = req.body;
    try {
        await Announcement.create({ title, content });
        req.flash('success', 'Announcement added successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to add announcement.');
        res.redirect('/admin/dashboard');
    }
});

router.post('/announcements/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        req.flash('success', 'Announcement deleted successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete announcement.');
        res.redirect('/admin/dashboard');
    }
});

// --- Video Routes ---
router.post('/videos', isAuthenticated, async (req, res) => {
    const { title, url, description } = req.body;
    try {
        // Simple validation for URL format
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            req.flash('error', 'Video URL must start with http:// or https://');
            return res.redirect('/admin/dashboard');
        }

        await Video.create({ title, url, description });
        req.flash('success', 'Video added successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to add video.');
        res.redirect('/admin/dashboard');
    }
});

router.post('/videos/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await Video.findByIdAndDelete(req.params.id);
        req.flash('success', 'Video deleted successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete video.');
        res.redirect('/admin/dashboard');
    }
});

// --- Photo Routes ---
router.post('/photos', isAuthenticated, upload.single('photo'), async (req, res) => {
    // 'photo' is the name of the input field in the form
    if (!req.file) {
        req.flash('error', 'No photo file uploaded.');
        return res.redirect('/admin/dashboard');
    }
    const { title, description } = req.body;
    try {
        const newPhoto = {
            title,
            description,
            url: req.file.path, // Cloudinary URL
            public_id: req.file.filename // Cloudinary public_id
        };
        await Photo.create(newPhoto);
        req.flash('success', 'Photo uploaded successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to upload photo.');
        res.redirect('/admin/dashboard');
    }
});

router.post('/photos/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) {
            req.flash('error', 'Photo not found.');
            return res.redirect('/admin/dashboard');
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(photo.public_id);
        
        // Delete from MongoDB
        await Photo.findByIdAndDelete(req.params.id);

        req.flash('success', 'Photo deleted successfully!');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete photo.');
        res.redirect('/admin/dashboard');
    }
});

module.exports = router;