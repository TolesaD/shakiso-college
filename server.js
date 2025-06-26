// Suppress deprecation warnings
process.removeAllListeners('warning');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('express-flash');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const methodOverride = require('method-override');

// Initialize Express app
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
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

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Error: Only images and videos are allowed!'));
    }
};

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    },
    fileFilter: fileFilter
});

// Set EJS as view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Debugging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Routes
app.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(5);
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

// Admin Login
app.get('/admin/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        error: req.flash('error'),
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

// Announcements Management
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
app.get('/admin/announcements/new', ensureAuthenticated, (req, res) => {
    res.render('admin/edit-announcement', {
        announcement: null, // Important for new announcements
        user: req.session.user,
        messages: req.flash()
    });
});

// Edit Announcement Form
app.get('/admin/announcements/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
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
        const { title, content, mediaTitle, mediaDescription, mediaUrl } = req.body;
        
        const newAnnouncement = new Announcement({ 
            title, 
            content,
            media: {
                title: mediaTitle,
                description: mediaDescription,
                url: mediaUrl,
                type: mediaUrl ? (mediaUrl.includes('youtube') ? 'video' : 'image') : null
            },
            createdAt: new Date()
        });
        
        await newAnnouncement.save();
        req.flash('success', 'Announcement created successfully');
        res.redirect('/admin/announcements');
    } catch (err) {
        console.error('Create announcement error:', err);
        req.flash('error', 'Failed to create announcement');
        res.redirect('/admin/announcements/new');
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
            }
        });
        
        req.flash('success', 'Announcement updated successfully');
        res.redirect('/admin/announcements');
    } catch (err) {
        console.error('Update announcement error:', err);
        req.flash('error', 'Failed to update announcement');
        res.redirect(`/admin/announcements/${req.params.id}`/edit);
    }
});

// Delete Announcement
app.delete('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        req.flash('success', 'Announcement deleted successfully');
        res.redirect('/admin/announcements');
    } catch (err) {
        console.error('Delete announcement error:', err);
        req.flash('error', 'Failed to delete announcement');
        res.redirect('/admin/announcements');
    }
});

// Photos Management
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
app.post('/admin/photos', ensureAuthenticated, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please select an image file');
            return res.redirect('/admin/photos');
        }

        const { title, description } = req.body;
        const imagePath = '/uploads/' + req.file.filename;

        const newPhoto = new Photo({
            title: title || 'Untitled',
            description,
            imagePath
        });

        await newPhoto.save();
        req.flash('success', 'Photo uploaded successfully');
        res.redirect('/admin/photos');
    } catch (err) {
        console.error('Photo upload error:', err);
        
        // Delete the uploaded file if error occurred
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public', 'uploads', req.file.filename), () => {});
        }
        
        req.flash('error', 'Failed to upload photo');
        res.redirect('/admin/photos');
    }
});

// Update Photo
app.post('/admin/photos/:id', ensureAuthenticated, upload.single('photo'), async (req, res) => {
    try {
        const { title, description } = req.body;
        const updateData = { title, description };
        
        if (req.file) {
            updateData.imagePath = '/uploads/' + req.file.filename;
            // Delete old file if updating
            const oldPhoto = await Photo.findById(req.params.id);
            if (oldPhoto?.imagePath) {
                const oldPath = path.join(__dirname, 'public', oldPhoto.imagePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
        }
        
        await Photo.findByIdAndUpdate(req.params.id, updateData);
        req.flash('success', 'Photo updated successfully');
        res.redirect('/admin/photos');
    } catch (err) {
        console.error('Photo update error:', err);
        req.flash('error', 'Failed to update photo');
        res.redirect(`/admin/photos`);
    }
});

// Delete Photo
app.post('/admin/photos/:id/delete', ensureAuthenticated, async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        
        if (photo) {
            const filePath = path.join(__dirname, 'public', photo.imagePath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            await Photo.findByIdAndDelete(req.params.id);
        }
        
        req.flash('success', 'Photo deleted successfully');
        res.redirect('/admin/photos');
    } catch (err) {
        console.error('Delete photo error:', err);
        req.flash('error', 'Failed to delete photo');
        res.redirect('/admin/photos');
    }
});

// Videos Management
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

// Create Video
app.post('/admin/videos', ensureAuthenticated, upload.single('video'), async (req, res) => {
    try {
        const { title, description, youtubeUrl } = req.body;
        let videoPath, isYoutube = false;

        if (youtubeUrl) {
            const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
            const match = youtubeUrl.match(regExp);
            
            if (match && match[1]) {
                videoPath = `https://www.youtube.com/embed/${match[1]}`;
                isYoutube = true;
            } else {
                req.flash('error', 'Please provide a valid YouTube URL');
                return res.redirect('/admin/videos');
            }
        } else if (req.file) {
            videoPath = '/uploads/' + req.file.filename;
        } else {
            req.flash('error', 'Please provide either a YouTube URL or video file');
            return res.redirect('/admin/videos');
        }

        const newVideo = new Video({
            title: title || 'Untitled Video',
            description: description || '',
            videoPath,
            isYoutube,
            createdAt: new Date()
        });

        await newVideo.save();
        req.flash('success', 'Video added successfully');
        res.redirect('/admin/videos');
    } catch (err) {
        console.error('Video upload error:', err);
        
        if (req.file) {
            fs.unlink(path.join(__dirname, 'public', 'uploads', req.file.filename), () => {});
        }
        
        req.flash('error', 'Failed to add video');
        res.redirect('/admin/videos');
    }
});

// Delete Video
app.post('/admin/videos/:id/delete', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (video && !video.isYoutube) {
            const filePath = path.join(__dirname, 'public', video.videoPath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        await Video.findByIdAndDelete(req.params.id);
        req.flash('success', 'Video deleted successfully');
        res.redirect('/admin/videos');
    } catch (err) {
        console.error('Delete video error:', err);
        req.flash('error', 'Failed to delete video');
        res.redirect('/admin/videos');
    }
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).render('error', {
                message: 'Failed to logout',
                error: process.env.NODE_ENV === 'development' ? err : {}
            });
        }
        res.redirect('/admin/login');
    });
});

// Middleware to ensure user is authenticated and is admin
function ensureAuthenticated(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Please login to access this page');
    res.redirect('/admin/login');
}

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

// Start server
(async () => {
    try {
        await connectDB();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, async () => {
            console.log(`Server running on port ${PORT}`);
            await initializeAdmin();
        });
    } catch (err) {
        console.error('Server startup error:', err);
        process.exit(1);
    }
})();