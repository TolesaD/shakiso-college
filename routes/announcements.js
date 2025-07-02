const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Announcement = require('../models/Announcement');

// Get all announcements
router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('author', 'username');
    res.json(announcements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Admin - List announcements
router.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .populate('author', 'username');
    res.render('admin/announcements', { 
      title: 'Manage Announcements',
      announcements 
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching announcements');
    res.redirect('/admin/dashboard');
  }
});

// Admin - Create announcement
router.post('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content } = req.body;
    const newAnnouncement = new Announcement({
      title,
      content,
      author: req.user._id
    });
    await newAnnouncement.save();
    req.flash('success_msg', 'Announcement created successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating announcement');
    res.redirect('/announcements/admin');
  }
});

// Admin - Update announcement
router.post('/admin/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content, isActive } = req.body;
    await Announcement.findByIdAndUpdate(req.params.id, {
      title,
      content,
      isActive: isActive === 'on',
      updatedAt: Date.now()
    });
    req.flash('success_msg', 'Announcement updated successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating announcement');
    res.redirect('/announcements/admin');
  }
});

// Admin - Delete announcement
router.post('/admin/:id/delete', ensureAuthenticated, async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Announcement deleted successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting announcement');
    res.redirect('/announcements/admin');
  }
});

module.exports = router;