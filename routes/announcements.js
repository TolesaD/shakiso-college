const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Announcement = require('../models/Announcement');
const mongoose = require('mongoose');
const methodOverride = require('method-override');

router.use(methodOverride('_method'));

// Enhanced GET all announcements with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;  // Fixed missing 
    const limit = parseInt(req.query.limit) || 10;  // Fixed missing 
    const skip = (page - 1) * limit;

    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username name')
      .lean();

    const count = await Announcement.countDocuments({ isActive: true });

    res.json({
      announcements,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (err) {
    console.error('Announcements fetch error:', err);
    res.status(500).json({ 
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});

// Admin routes
router.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .populate('author', 'username name')
      .lean();

    res.render('admin/manage-announcements', { 
      title: 'Manage Announcements',
      announcements,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
    });
  } catch (err) {
    console.error('Admin announcements fetch error:', err);
    req.flash('error_msg', 'Failed to load announcements');
    res.redirect('/admin/dashboard');
  }
});

// New announcement form
router.get('/admin/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-announcement', {
    announcement: null,
    messages: {
      success: req.flash('success_msg'),
      error: req.flash('error_msg')
    }
  });
});

// Edit announcement form
router.get('/admin/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).lean();
    if (!announcement) {
      req.flash('error_msg', 'Announcement not found');
      return res.redirect('/announcements/admin');
    }
    res.render('admin/edit-announcement', { 
      announcement,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
    });
  } catch (err) {
    console.error('Edit announcement error:', err);
    req.flash('error_msg', 'Error loading announcement');
    res.redirect('/announcements/admin');
  }
});

// Create announcement
router.post('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content } = req.body;
    
    if (!title || !content) {
      req.flash('error_msg', 'Title and content are required');
      return res.redirect('/announcements/admin/new');
    }

    const newAnnouncement = new Announcement({
      title,
      content,
      author: req.user._id,
      isActive: true
    });

    await newAnnouncement.save();
    req.flash('success_msg', 'Announcement created successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error('Announcement creation error:', err);
    let errorMsg = 'Error creating announcement';
    if (err instanceof mongoose.Error.ValidationError) {
      errorMsg = Object.values(err.errors).map(val => val.message).join(', ');
    }
    req.flash('error_msg', errorMsg);
    res.redirect('/announcements/admin/new');
  }
});

// Update announcement
router.put('/admin/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content, isActive } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error_msg', 'Invalid announcement ID');
      return res.redirect('/announcements/admin');
    }
const updated = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        isActive: isActive === 'on',
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      req.flash('error_msg', 'Announcement not found');
      return res.redirect('/announcements/admin');
    }

    req.flash('success_msg', 'Announcement updated successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error('Announcement update error:', err);
    let errorMsg = 'Error updating announcement';
    if (err instanceof mongoose.Error.ValidationError) {
      errorMsg = Object.values(err.errors).map(val => val.message).join(', ');
    }
    req.flash('error_msg', errorMsg);
    res.redirect(`/announcements/admin/${req.params.id}/edit`);
  }
});

// Delete announcement
router.delete('/admin/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error_msg', 'Invalid announcement ID');
      return res.redirect('/announcements/admin');
    }

    const deleted = await Announcement.findByIdAndDelete(req.params.id);
    
    if (!deleted) {
      req.flash('error_msg', 'Announcement not found');
      return res.redirect('/announcements/admin');
    }

    req.flash('success_msg', 'Announcement deleted successfully');
    res.redirect('/announcements/admin');
  } catch (err) {
    console.error('Announcement deletion error:', err);
    req.flash('error_msg', 'Failed to delete announcement');
    res.redirect('/announcements/admin');
  }
});

module.exports = router;