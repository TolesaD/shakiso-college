const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Photo = require('../models/Photo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for uploaded photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../public/uploads/photos');
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images only (jpeg, jpg, png, gif)!');
    }
  }
});

// Get all photos
router.get('/', async (req, res) => {
  try {
    const photos = await Photo.find()
      .sort({ uploadedAt: -1 })
      .limit(12)
      .populate('uploadedBy', 'username');
    res.json(photos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Admin - List photos
router.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const photos = await Photo.find()
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'username');
    res.render('admin/photos', { 
      title: 'Manage Photos',
      photos 
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching photos');
    res.redirect('/admin/dashboard');
  }
});

// Admin - Upload photo
router.post('/admin', ensureAuthenticated, upload.single('image'), async (req, res) => {
  try {
    const { title, description, isFeatured } = req.body;
    
    if (!req.file) {
      req.flash('error_msg', 'No file uploaded');
      return res.redirect('/photos/admin');
    }
    
    const newPhoto = new Photo({
      title,
      description,
      imageUrl: `/uploads/photos/${req.file.filename}`,
      uploadedBy: req.user._id,
      isFeatured: isFeatured === 'on'
    });
    
    await newPhoto.save();
    req.flash('success_msg', 'Photo uploaded successfully');
    res.redirect('/photos/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error uploading photo');
    res.redirect('/photos/admin');
  }
});

// Admin - Delete photo
router.post('/admin/:id/delete', ensureAuthenticated, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      req.flash('error_msg', 'Photo not found');
      return res.redirect('/photos/admin');
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../public', photo.imageUrl);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
    
    await Photo.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Photo deleted successfully');
    res.redirect('/photos/admin');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting photo');
    res.redirect('/photos/admin');
  }
});

module.exports = router;