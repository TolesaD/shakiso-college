const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Photo = require('../models/Photo');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Using promises version for async/await
const mongoose = require('mongoose');

// Configure storage for uploaded photos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadPath = path.join(__dirname, '../../public/uploads/photos');
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpe?g|png|gif/i;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname));

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only JPEG, JPG, PNG, and GIF images are allowed'), false);
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
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
      photos,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
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
      req.flash('error_msg', 'No file uploaded or invalid file type');
      return res.redirect('/admin/photos');
    }
    
    const newPhoto = new Photo({
      title,
      description,
      imageUrl: '/uploads/photos/' + req.file.filename,
      uploadedBy: req.user._id,
      isFeatured: isFeatured === 'on'
    });
    
    await newPhoto.save();
    req.flash('success_msg', 'Photo uploaded successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(err);
    let errorMsg = 'Error uploading photo';
    if (err instanceof multer.MulterError) {
      errorMsg = err.message;
    } else if (err instanceof mongoose.Error.ValidationError) {
      errorMsg = Object.values(err.errors).map(val => val.message).join(', ');
    }
    req.flash('error_msg', errorMsg);
    res.redirect('/admin/photos');
  }
});

// Admin - Show edit photo form
router.get('/admin/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id).lean();
    if (!photo) {
      req.flash('error_msg', 'Photo not found');
      return res.redirect('/admin/photos');
    }
    res.render('admin/edit-photo', { 
      title: 'Edit Photo',
      photo,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading photo');
    res.redirect('/admin/photos');
  }
});
// Admin - Update photo (including image)
router.put('/admin/:id', ensureAuthenticated, upload.single('image'), async (req, res) => {
  try {
    const { title, description, isFeatured, currentImage } = req.body;
    
    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      updatedAt: Date.now()
    };

    if (req.file) {
      updateData.imageUrl = '/uploads/photos/' + req.file.filename;
      
      // Delete old image file if new one was uploaded
      if (currentImage) {
        const oldPath = path.join(__dirname, '../../public', currentImage);
        try {
          await fs.unlink(oldPath);
        } catch (unlinkErr) {
          console.error('Error deleting old image:', unlinkErr);
        }
      }
    }

    const updatedPhoto = await Photo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedPhoto) {
      req.flash('error_msg', 'Photo not found');
      return res.redirect('/admin/photos');
    }

    req.flash('success_msg', 'Photo updated successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(err);
    let errorMsg = 'Error updating photo';
    if (err instanceof mongoose.Error.ValidationError) {
      errorMsg = Object.values(err.errors).map(val => val.message).join(', ');
    } else if (err instanceof multer.MulterError) {
      errorMsg = err.message;
    }
    req.flash('error_msg', errorMsg);
    res.redirect(`/admin/photos/${req.params.id}/edit`);
  }
});

// Admin - Delete photo
router.delete('/admin/:id', ensureAuthenticated, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      req.flash('error_msg', 'Photo not found');
      return res.redirect('/admin/photos');
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../public', photo.imageUrl);
    try {
      await fs.unlink(filePath);
    } catch (unlinkErr) {
      console.error('Error deleting image file:', unlinkErr);
    }
    
    await Photo.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Photo deleted successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting photo');
    res.redirect('/admin/photos');
  }
});

module.exports = router;