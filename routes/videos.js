const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middlewares/auth');
const Video = require('../models/Video');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure storage for uploaded videos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../public/uploads/videos');
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /mp4|webm|ogg/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only videos (mp4, webm, ogg) are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
});

// Get all videos (public API)
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find()
      .sort({ createdAt: -1 })
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
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'username');
    res.render('admin/manage-videos', {
      title: 'Manage Videos',
      videos,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching videos');
    res.redirect('/admin/dashboard');
  }
});

// Admin - Upload video or add YouTube URL
router.post('/admin', ensureAuthenticated, upload.single('video'), async (req, res) => {
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;

    if (source === 'upload' && !req.file) {
      req.flash('error_msg', 'Please upload a video file');
      return res.redirect('/admin/videos');
    }

    if (source === 'youtube' && !youtubeUrl) {
      req.flash('error_msg', 'Please provide a YouTube URL');
      return res.redirect('/admin/videos');
    }

    const videoData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      uploadedBy: req.user._id,
      source
    };

    if (source === 'youtube') {
      const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = youtubeUrl.match(regExp);
      if (!match) {
        req.flash('error_msg', 'Invalid YouTube URL');
        return res.redirect('/admin/videos');
      }
      videoData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;
    } else {
      videoData.videoUrl = `/uploads/videos/${req.file.filename}`;
    }

    const newVideo = new Video(videoData);
    await newVideo.save();
    req.flash('success_msg', 'Video added successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(err);
    if (req.file) {
      await fs.unlink(path.join(__dirname, '../../public/uploads/videos', req.file.filename)).catch((unlinkErr) =>
        console.error('Error deleting uploaded video:', unlinkErr)
      );
    }
    req.flash('error_msg', 'Error uploading video');
    res.redirect('/admin/videos');
  }
});

// Admin - Show edit video form
router.get('/admin/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).lean();
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/admin/videos');
    }
    res.render('admin/edit-video', {
      title: 'Edit Video',
      video,
      messages: {
        success: req.flash('success_msg'),
        error: req.flash('error_msg')
      }
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading video');
    res.redirect('/admin/videos');
  }
});

// Admin - Update video
router.put('/admin/:id', ensureAuthenticated, upload.single('video'), async (req, res) => {
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    const video = await Video.findById(req.params.id);

    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/admin/videos');
    }

    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      updatedAt: Date.now(),
      source
    };

    if (source === 'youtube') {
      const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = youtubeUrl.match(regExp);
      if (!match) {
        req.flash('error_msg', 'Invalid YouTube URL');
        return res.redirect(`/admin/videos/${req.params.id}/edit`);
      }
      updateData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;

      if (video.source === 'upload' && video.videoUrl) {
        const oldPath = path.join(__dirname, '../../public', video.videoUrl);
        await fs.unlink(oldPath).catch((unlinkErr) =>
          console.error('Error deleting old video:', unlinkErr)
        );
      }
    } else if (req.file) {
      updateData.videoUrl = `/uploads/videos/${req.file.filename}`;
      if (video.source === 'upload' && video.videoUrl) {
        const oldPath = path.join(__dirname, '../../public', video.videoUrl);
        await fs.unlink(oldPath).catch((unlinkErr) =>
          console.error('Error deleting old video:', unlinkErr)
        );
      }
    } else {
      updateData.videoUrl = video.videoUrl;
    }

    await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    req.flash('success_msg', 'Video updated successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(err);
    if (req.file) {
      await fs.unlink(path.join(__dirname, '../../public/uploads/videos', req.file.filename)).catch((unlinkErr) =>
        console.error('Error deleting uploaded video:', unlinkErr)
      );
    }
    req.flash('error_msg', 'Error updating video');
    res.redirect(`/admin/videos/${req.params.id}/edit`);
  }
});

// Admin - Delete video
router.delete('/admin/:id', ensureAuthenticated, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error_msg', 'Video not found');
      return res.redirect('/admin/videos');
    }

    if (video.source === 'upload' && video.videoUrl) {
      const filePath = path.join(__dirname, '../../public', video.videoUrl);
      await fs.unlink(filePath).catch((unlinkErr) =>
        console.error('Error deleting video file:', unlinkErr)
      );
    }

    await Video.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Video deleted successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting video');
    res.redirect('/admin/videos');
  }
});

module.exports = router;