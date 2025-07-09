// Suppress deprecation warnings
process.removeAllListeners('warning');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const methodOverride = require('method-override');

// Initialize Express app
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Modified session configuration without encryption
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'strict'
    },
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native'
        // Removed the crypto configuration
    })
}));

// Flash messages
app.use(flash());

// Database connection
mongoose.set('strictQuery', false);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

// Models
const Admin = require('./models/Admin');
const Announcement = require('./models/Announcement');
const Photo = require('./models/Photo');
const Video = require('./models/Video');

// Configure image upload
const imageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'public/uploads/images');
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, JPG, PNG, GIF) are allowed'), false);
  }
};

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2048 * 1024 * 1024 } // 5MB
});

// Configure video upload
const videoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'public/uploads/videos');
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const videoFilter = (req, file, cb) => {
  const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only videos (MP4, WebM, OGG) are allowed'), false);
  }
};

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Set EJS as view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Debugging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ======================
// ENHANCED AUTHENTICATION MIDDLEWARE
// ======================

function ensureAuthenticated(req, res, next) {
    // Check for active session
    if (req.session.user && req.session.user.role === 'admin') {
        // Refresh session expiration on each request
        req.session.touch();
        return next();
    }
    
    // Clear any invalid session data
    req.session.destroy(() => {
        req.flash('error', 'Session expired or unauthorized access');
        return res.redirect('/admin/login');
    });
}

// ======================
// ERROR HANDLING MIDDLEWARE
// ======================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    req.flash('error', err.message);
    return res.redirect('back');
  }
  next(err);
});

// ======================
// FRONTEND ROUTES
// ======================

app.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 }).limit(5);
        const photos = await Photo.find().sort({ createdAt: -1 }).limit(6);
        const videos = await Video.find().sort({ createdAt: -1 }).limit(3);
        res.render('index', { 
            announcements, 
            photos,
            videos,
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Homepage error:', err);
        res.status(500).render('error', {
            message: 'Failed to load homepage',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

app.get('/about', (req, res) => {
    res.render('about', { 
        user: req.session.user,
        messages: req.flash()
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', { 
        user: req.session.user,
        messages: req.flash()
    });
});

app.get('/gallery', async (req, res) => {
    try {
        const photos = await Photo.find().sort({ createdAt: -1 });
        res.render('gallery', { 
            photos, 
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Gallery error:', err);
        res.status(500).render('error', {
            message: 'Failed to load gallery',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });
        res.render('videos', { 
            videos, 
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Videos error:', err);
        res.status(500).render('error', {
            message: 'Failed to load videos',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

// ======================
// ADMIN ROUTES
// ======================

// ======================
// ======================
// ADMIN LOGIN ROUTES
// ======================

app.get('/admin/login', (req, res) => {
    // Check for both session user and logout success message
    if (req.session.user) {
        return res.redirect('/admin/dashboard');
    }
    
    res.render('admin/login', { 
        error: req.flash('error'),
        success: req.query.logout === 'success' 
            ? ['You have been logged out successfully'] 
            : req.flash('success'),
        username: req.flash('username')
    });
});

app.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        
        if (!admin) {
            req.flash('error', 'Invalid credentials');
            req.flash('username', username);
            return res.redirect('/admin/login');
        }
        
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            req.flash('error', 'Invalid credentials');
            req.flash('username', username);
            return res.redirect('/admin/login');
        }
        
        req.session.user = { 
            id: admin._id, 
            username: admin.username,
            role: 'admin'
        };
        
        req.flash('success', 'Logged in successfully');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Login error:', err);
        req.flash('error', 'An error occurred during login');
        res.redirect('/admin/login');
    }
});

// ======================
// ADMIN LOGOUT ROUTE
// ======================

app.get('/admin/logout', (req, res) => {
    // Store user info for logging before destroying session
    const user = req.session.user ? {...req.session.user} : null;
    
    // Create a clean redirect function that won't touch session
    const safeRedirect = (url) => {
        res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.header('Pragma', 'no-cache');
        res.header('Expires', '0');
        res.status(302).location(url).end();
    };

    // Destroy session
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            // Continue with logout even if destruction fails
        }

        // Clear session cookie from all paths
        res.clearCookie('connect.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        // Log the logout
        if (user) {
            console.log(`Admin ${user.username} logged out at ${new Date()}`);
        }

        // Redirect with success message via query parameter
        safeRedirect('/admin/login?logout=success');
    });
});

// ======================
// SESSION VERIFICATION MIDDLEWARE
// ======================

app.use('/admin*', (req, res, next) => {
    // Skip session verification for login page and static assets
    if (req.path === '/admin/login' || req.path.startsWith('/admin/assets/')) {
        return next();
    }
    
    // Verify session exists in store
    if (req.sessionID) {
        req.sessionStore.get(req.sessionID, (err, session) => {
            if (err || !session) {
                // Session not found in store
                req.session.destroy(() => {
                    res.clearCookie('connect.sid');
                    return res.redirect('/admin/login');
                });
            } else {
                // Session exists, continue
                next();
            }
        });
    } else {
        // No session ID present
        res.redirect('/admin/login');
    }
});

// Admin Dashboard
app.get('/admin/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const [announcementCount, photoCount, videoCount] = await Promise.all([
            Announcement.countDocuments(),
            Photo.countDocuments(),
            Video.countDocuments()
        ]);
        
        res.render('admin/dashboard', { 
            user: req.session.user,
            announcementCount,
            photoCount,
            videoCount,
            currentRoute: 'dashboard',
            messages: req.flash()
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).render('error', {
            message: 'Failed to load dashboard',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/announcements/'); // Adjust path as needed
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Auto-create admin if missing
const initAdmin = async () => {
  if (!await Admin.exists({ username: process.env.ADMIN_USERNAME })) {
    const admin = new Admin({
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD // Auto-hashed by schema
    });
    await admin.save();
    console.log("Initial admin created");
  }
};
initAdmin();

app.get('/debug-env', (req, res) => {
  res.json({
    ADMIN_USERNAME: process.env.ADMIN_USERNAME ? "✅ Exists" : "❌ Missing",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? "✅ Exists" : "❌ Missing",
    NODE_ENV: process.env.NODE_ENV
  });
});

// ANNOUNCEMENTS ROUTES
// ======================

// List announcements
app.get('/admin/announcements', ensureAuthenticated, async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.render('admin/manage-announcements', { 
            announcements,
            user: req.session.user,
            currentRoute: 'announcements',
            messages: req.flash()
        });
    } catch (err) {
        console.error('Announcements error:', err);
        res.status(500).render('error', {
            message: 'Failed to load announcements',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

// New Announcement Form
app.get('/admin/announcements', ensureAuthenticated, (req, res) => {
    res.render('admin/edit-announcement', {
        announcement: null,
        user: req.session.user,
        messages: req.flash()
    });
});

// Edit Announcement Form
app.get('/admin/announcements/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) {
            req.flash('error', 'Announcement not found');
            return res.redirect('/admin/announcements');
        }
        res.render('admin/edit-announcement', {
            announcement,
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load announcement');
        res.redirect('/admin/announcements');
    }
});

// Create Announcement
app.post('/admin/announcements', ensureAuthenticated, async (req, res) => {
    try {
        const { title, content, isActive, mediaTitle, mediaDescription, mediaUrl } = req.body;
        
        const newAnnouncement = new Announcement({ 
            title, 
            content,
            media: {
                title: mediaTitle,
                description: mediaDescription,
                url: mediaUrl,
                type: mediaUrl ? (mediaUrl.includes('youtube') ? 'video' : 'image') : null
            },
            author: req.session.user.id
        });
        
        await newAnnouncement.save();
        req.flash('success', 'Announcement created successfully');
        res.redirect('/admin/announcements');
    } catch (err) {
        console.error('Create announcement error:', err);
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to create announcement');
        res.redirect('/admin/announcements');
    }
});

// Public route for all users to view announcements
app.get('/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find({ 
            isActive: true  // Only show active announcements
        }).sort({ createdAt: -1 });

        res.render('announcements', {  // Will create this template next
            announcements,
            currentRoute: 'announcements'
        });
    } catch (err) {
        console.error('Public announcements error:', err);
        res.status(500).render('error', {
            message: 'Failed to load announcements'
        });
    }
});

// Update Announcement
app.put('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
    try {
        const { title, content, isActive, mediaTitle, mediaDescription, mediaUrl } = req.body;
        
        await Announcement.findByIdAndUpdate(req.params.id, { 
            title, 
            content,
            isActive: isActive === 'on',
            media: {
                title: mediaTitle,
                description: mediaDescription,
                url: mediaUrl,
                type: mediaUrl ? (mediaUrl.includes('youtube') ? 'video' : 'image') : null
            },
            updatedAt: Date.now()
        }, { new: true, runValidators: true });
        
        req.flash('success', 'Announcement updated successfully');
        res.redirect('/admin/announcements');
    } catch (err) {
        console.error('Update announcement error:', err);
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to update announcement');
        res.redirect(`/admin/announcements/${req.params.id}/edit`);
    }
});

// Delete Announcement - Updated Route
app.delete('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
    try {
        const announcement = await Announcement.findByIdAndDelete(req.params.id);
        
        if (!announcement) {
            return res.status(404).json({ 
                success: false, 
                message: 'Announcement not found' 
            });
        }

        // Return JSON response
        return res.json({ 
            success: true,
            message: 'Announcement deleted successfully'
        });

    } catch (err) {
        console.error('Delete announcement error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete announcement' 
        });
    }
});

// ======================
// PHOTOS ROUTES
// ======================

// List photos
app.get('/admin/photos', ensureAuthenticated, async (req, res) => {
    try {
        const photos = await Photo.find().sort({ createdAt: -1 });
        res.render('admin/manage-photos', { 
            photos,
            user: req.session.user,
            currentRoute: 'photos',
            messages: req.flash()
        });
    } catch (err) {
        console.error('Photos error:', err);
        res.status(500).render('error', {
            message: 'Failed to load photos',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

//Photo Route

// New Photo Form
app.get('/admin/photos', ensureAuthenticated, (req, res) => {
    res.render('admin/edit-photo', {
        photo: null,
        user: req.session.user,
        messages: req.flash()
    });
});

// Edit Photo Form
app.get('/admin/photos/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) {
            req.flash('error', 'Photo not found');
            return res.redirect('/admin/photos');
        }
        res.render('admin/edit-photo', {
            photo,
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Photo edit error:', err);
        req.flash('error', 'Failed to load photo for editing');
        res.redirect('/admin/photos');
    }
});

// Create Photo
app.post('/admin/photos', ensureAuthenticated, uploadImage.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please select an image file');
            return res.redirect('/admin/photos/new');
        }

        const { title, description, isFeatured } = req.body;
        const newPhoto = new Photo({
            title,
            description,
            imageUrl: '/uploads/images/' + req.file.filename,
            isFeatured: isFeatured === 'on',
            uploadedBy: req.session.user.id
        });

        await newPhoto.save();
        req.flash('success', 'Photo uploaded successfully');
        res.redirect('/admin/photos');
    } catch (err) {
        console.error('Photo upload error:', err);
        
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public/uploads/images', req.file.filename))
                .catch(unlinkErr => console.error('Failed to delete uploaded file:', unlinkErr));
        }
        
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to upload photo');
        res.redirect('/admin/photos/new');
    }
});

// Update Photo
app.put('/admin/photos/:id', ensureAuthenticated, uploadImage.single('image'), async (req, res) => {
    try {
        const { title, description, isFeatured } = req.body;
        const updateData = { 
            title, 
            description,
            isFeatured: isFeatured === 'on',
            updatedAt: Date.now()
        };

        if (req.file) {
            updateData.imageUrl = '/uploads/images/' + req.file.filename;
            const oldPhoto = await Photo.findById(req.params.id);
            if (oldPhoto?.imageUrl) {
                const oldPath = path.join(__dirname, 'public', oldPhoto.imageUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlink(oldPath)
                        .catch(unlinkErr => console.error('Failed to delete old image:', unlinkErr));
                }
            }
        }

        await Photo.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        req.flash('success', 'Photo updated successfully');
        res.redirect('/admin/photos');
    } catch (err) {
        console.error('Photo update error:', err);
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public/uploads/images', req.file.filename))
                .catch(unlinkErr => console.error('Failed to delete uploaded file:', unlinkErr));
        }
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to update photo');
        res.redirect(`/admin/photos/${req.params.id}/edit`);
    }
});

// Delete Photo - Optimized Version
app.delete('/admin/photos/:id', ensureAuthenticated, async (req, res) => {
    try {
        // First get the photo details
        const photo = await Photo.findById(req.params.id);
        if (!photo) {
            return res.status(404).json({ success: false, message: 'Photo not found' });
        }

        // Store the file path
        const filePath = photo.imageUrl ? path.join(__dirname, 'public', photo.imageUrl) : null;

        // Delete from database first
        await Photo.findByIdAndDelete(req.params.id);

        // Then delete the file if it exists
        let fileDeleted = false;
        if (filePath && fs.existsSync(filePath)) {
            try {
                await fs.unlink(filePath);
                fileDeleted = true;
            } catch (unlinkErr) {
                console.error('File deletion error:', unlinkErr);
                // Continue even if file deletion fails
            }
        }

        // Return JSON response for AJAX calls
        return res.json({ 
            success: true,
            message: 'Photo deleted successfully',
            fileDeleted: fileDeleted
        });

    } catch (err) {
        console.error('Delete photo error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete photo' 
        });
    }
});

// ======================
// VIDEOS ROUTES
// ======================

// List videos
app.get('/admin/videos', ensureAuthenticated, async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });
        res.render('admin/manage-videos', { 
            videos,
            user: req.session.user,
            currentRoute: 'videos',
            messages: req.flash()
        });
    } catch (err) {
        console.error('Videos error:', err);
        res.status(500).render('error', {
            message: 'Failed to load videos',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

// New Video Form
app.get('/admin/videos/new', ensureAuthenticated, (req, res) => {
    res.render('admin/edit-video', {
        video: null,
        user: req.session.user,
        messages: req.flash()
    });
});

// Edit Video Form
app.get('/admin/videos/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            req.flash('error', 'Video not found');
            return res.redirect('/admin/videos');
        }
        res.render('admin/edit-video', {
            video,
            user: req.session.user,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Video edit error:', err);
        req.flash('error', 'Failed to load video for editing');
        res.redirect('/admin/videos');
    }
});

// Create Video
app.post('/admin/videos', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
    try {
        const { title, description, isFeatured, source, youtubeUrl } = req.body;
        
        if (source === 'upload' && !req.file) {
            req.flash('error', 'Please upload a video file');
            return res.redirect('/admin/videos/new');
        }

        if (source === 'youtube' && !youtubeUrl) {
            req.flash('error', 'Please provide a YouTube URL');
            return res.redirect('/admin/videos/new');
        }

        const videoData = {
            title,
            description,
            isFeatured: isFeatured === 'on',
            uploadedBy: req.session.user.id,
            source
        };

        if (source === 'youtube') {
            const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
            const match = youtubeUrl.match(regExp);
            if (!match) {
                req.flash('error', 'Invalid YouTube URL');
                return res.redirect('/admin/videos/new');
            }
            videoData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;
        } else {
            videoData.videoUrl = '/uploads/videos/' + req.file.filename;
        }

        await new Video(videoData).save();
        req.flash('success', 'Video added successfully');
        res.redirect('/admin/videos');
    } catch (err) {
        console.error('Video upload error:', err);
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public/uploads/videos', req.file.filename))
                .catch(unlinkErr => console.error('Failed to delete uploaded video:', unlinkErr));
        }
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to add video');
        res.redirect('/admin/videos/new');
    }
});

// Update Video
app.put('/admin/videos/:id', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
    try {
        const { title, description, isFeatured, source, youtubeUrl } = req.body;
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            req.flash('error', 'Video not found');
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
                req.flash('error', 'Invalid YouTube URL');
                return res.redirect(`/admin/videos/${req.params.id}/edit`);
            }
            updateData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;
            
            if (video.source === 'upload' && video.videoUrl) {
                const oldPath = path.join(__dirname, 'public', video.videoUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlink(oldPath)
                        .catch(unlinkErr => console.error('Failed to delete old video:', unlinkErr));
                }
            }
        } else if (req.file) {
            updateData.videoUrl = '/uploads/videos/' + req.file.filename;
            
            if (video.source === 'upload' && video.videoUrl) {
                const oldPath = path.join(__dirname, 'public', video.videoUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlink(oldPath)
                        .catch(unlinkErr => console.error('Failed to delete old video:', unlinkErr));
                }
            }
        } else {
            updateData.videoUrl = video.videoUrl;
        }

        await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        req.flash('success', 'Video updated successfully');
        res.redirect('/admin/videos');
    } catch (err) {
        console.error('Video update error:', err);
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public/uploads/videos', req.file.filename))
                .catch(unlinkErr => console.error('Failed to delete uploaded video:', unlinkErr));
        }
        req.flash('error', err instanceof mongoose.Error.ValidationError 
            ? Object.values(err.errors).map(e => e.message).join(', ')
            : 'Failed to update video');
        res.redirect(`/admin/videos/${req.params.id}/edit`);
    }
});

// Delete Video
app.delete('/admin/videos/:id', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findByIdAndDelete(req.params.id);
        if (video && video.source === 'upload' && video.videoUrl) {
            const filePath = path.join(__dirname, 'public', video.videoUrl);
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath)
                    .catch(unlinkErr => console.error('Failed to delete video file:', unlinkErr));
            }
        }
        req.flash('success', 'Video deleted successfully');
        res.redirect('/admin/videos');
    } catch (err) {
        console.error('Delete video error:', err);
        req.flash('error', 'Failed to delete video');
        res.redirect('/admin/videos');
    }
});

// Add this with your other routes in server.js
app.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        // Basic validation
        if (!name || !email || !subject || !message) {
            req.flash('error', 'All fields are required');
            return res.redirect('/contact');
        }

        // Log the form submission (for debugging)
        console.log('New contact form submission:', {
            name,
            email,
            subject,
            message,
            date: new Date()
        });

        // Here you would typically:
        // 1. Save to database (create a Contact model)
        // 2. Or send an email (using nodemailer)
        
        req.flash('success', 'Thank you for your message! We will contact you soon.');
        res.redirect('/contact');
    } catch (err) {
        console.error('Contact form error:', err);
        req.flash('error', 'Failed to send your message. Please try again later.');
        res.redirect('/contact');
    }
});
// ======================
// SERVER INITIALIZATION
// ======================

// Initialize admin user if not exists
async function initializeAdmin() {
    try {
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            const admin = new Admin({
                username: process.env.ADMIN_USERNAME || 'admin',
                password: hashedPassword
            });
            await admin.save();
            console.log('Default admin user created');
        }
    } catch (err) {
        console.error('Error initializing admin:', err);
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).render('error', {
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start server (Updated)
(async () => {
    try {
        await connectDB();
        await initializeAdmin();
        
        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
        
        // Handle server shutdown gracefully
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Shutting down gracefully');
            server.close(() => {
                console.log('Server closed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        });
    } catch (err) {
        console.error('Server startup error:', err);
        process.exit(1);
    }
})();