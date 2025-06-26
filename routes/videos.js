const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Video = require('../models/Video');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for uploaded videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../public/uploads/videos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|ogg/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Videos only (mp4, webm, ogg)!');
    }
  }
});

// Get all videos
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find()
      .sort({ uploadedAt: -1 })
      .limit(6)
      .populate('uploadedBy', 'username');
    res.json(videos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Admin - List videos
router.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const videos = await Video.find()
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username');
    res.render('admin/videos', { 
      title: 'Manage Videos',
      videos 
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching videos');
    res.redirect('/admin/dashboard');
  }
});

// Admin - Upload video
router.post('/admin', ensureAuthenticated, upload.single('video'), async (req, res) => {
  try {
    const { title, description, isFeatured } = req.body;
    
    if (!req.file) {
      req.flash('error_msg', 'No file uploaded');
      return res.redirect('/videos/admin');
    }
    
    const newVideo = new Video({
      title,
      description,
      videoUrl: `/uploads/videos/${req.file.filename}`,
      uploadedBy: req.user._id,
      isFeatured: isFeatured === 'on'
    });
    
    await newVideo.save();
    req.flash('success_msg', 'Video uploaded successfully');
    res.redirect('/videos/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error uploading video');
    res.redirect('/videos/admin');
  }
});

// Admin - Delete video
router.post('/admin/:id/delete', ensureAuthenticated, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/videos/admin');
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../public', video.videoUrl);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
    
    await Video.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Video deleted successfully');
    res.redirect('/videos/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting video');
    res.redirect('/videos/admin');
  }
});

module.exports = router;