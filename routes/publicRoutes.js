const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const Video = require('../models/Video');
const Photo = require('../models/Photo');

// Home Page
router.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ date: -1 }).limit(3); // Latest 3
        const videos = await Video.find().sort({ uploadedAt: -1 }).limit(3); // Latest 3
        const photos = await Photo.find().sort({ uploadedAt: -1 }).limit(6); // Latest 6
        res.render('index', {
            title: 'Home',
            announcements,
            videos,
            photos
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// About Page
router.get('/about', (req, res) => {
    res.render('about', { title: 'About Us' });
});

// Contact Us Page
router.get('/contact', (req, res) => {
    res.render('contact', { title: 'Contact Us' });
});

module.exports = router;