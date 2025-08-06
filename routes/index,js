const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const Photo = require('../models/Photo');
const Video = require('../models/Video');

// Home Page
router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5);
      
    const photos = await Photo.find().sort({ createdAt: -1 }).limit(6);
    const videos = await Video.find().sort({ createdAt: -1 }).limit(3);

    res.render('index', {
      title: 'Home',
      user: req.user,
      announcements,
      photos,
      videos,
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'Home',
      user: req.user,
      announcements: [],
      photos: [],
      videos: [],
      messages: req.flash()
    });
  }
});

// About Page
router.get('/about', (req, res) => {
  res.render('about', {
    title: 'About Us',
    user: req.user,
    messages: req.flash()
  });
});

// Contact Page
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us',
    user: req.user,
    messages: req.flash()
  });
});

// Gallery Page
router.get('/gallery', async (req, res) => {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    res.render('gallery', {
      title: 'Gallery',
      user: req.user,
      photos,
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    res.render('gallery', {
      title: 'Gallery',
      user: req.user,
      photos: [],
      messages: req.flash()
    });
  }
});

// Videos Page
router.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.render('videos', {
      title: 'Videos',
      user: req.user,
      videos,
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    res.render('videos', {
      title: 'Videos',
      user: req.user,
      videos: [],
      messages: req.flash()
    });
  }
});

module.exports = router;