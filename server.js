const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const methodOverride = require('method-override');
const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');

// Initialize Express app
const app = express();

// Load environment variables
require('dotenv').config();
console.log('Loaded ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? 'Set' : 'Not set');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Not set');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set');
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET ? 'Set' : 'Not set');

// HTTPS redirection for production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      console.log(`[${new Date().toISOString()}] Redirecting HTTP to HTTPS: ${req.url}`);
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Middleware
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Session configuration
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
  ttl: 14 * 24 * 60 * 60,
  autoRemove: 'native',
});

sessionStore.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Session store error:`, err);
});

sessionStore.on('connected', () => {
  console.log('Session store connected to MongoDB');
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    },
    store: sessionStore,
  })
);

// Flash messages
app.use(flash());

// AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

// Configure image upload
const imageStorage = process.env.NODE_ENV === 'production' ? 
  multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    acl: 'public-read',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(null, `images/${Date.now()}${path.extname(file.originalname)}`);
    },
  }) :
  multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'public/uploads/images');
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
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
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Configure video upload
const videoStorage = process.env.NODE_ENV === 'production' ?
  multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    acl: 'public-read',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(null, `videos/${Date.now()}${path.extname(file.originalname)}`);
    },
  }) :
  multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'public/uploads/videos');
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
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
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Database connection
mongoose.set('strictQuery', false);

const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] MongoDB connection error:`, err);
      retries -= 1;
      if (retries === 0) {
        console.error('MongoDB connection failed after retries, exiting...');
        process.exit(1);
      }
      console.log(`Retrying connection (${retries} attempts left)...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

// Models
const Admin = require('./models/Admin');
const Announcement = require('./models/Announcement');
const Photo = require('./models/Photo');
const Video = require('./models/Video');

// Routes
const announcementRoutes = require('./routes/announcements');
const photoRoutes = require('./routes/photos');
const videoRoutes = require('./routes/videos');

app.use('/api/announcements', announcementRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/videos', videoRoutes);

// Set EJS as view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Debugging middleware
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url} | Cookies: ${JSON.stringify(
      req.cookies
    )} | Set-Cookie: ${res.get('Set-Cookie') || 'none'}`
  );
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Response headers: ${JSON.stringify(res.getHeaders())}`);
  });
  next();
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  console.log('Checking session:', {
    sessionID: req.sessionID,
    user: req.session.user,
    cookies: req.cookies || 'No cookies',
    sessionExists: !!req.session,
  });
  if (req.session.user && req.session.user.role === 'admin') {
    req.session.touch();
    console.log('Session valid, proceeding to next middleware');
    return next();
  }
  console.log('Session invalid, destroying session');
  req.session.destroy((err) => {
    if (err) console.error(`[${new Date().toISOString()}] Session destroy error:`, err);
    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.redirect('/admin/login');
  });
}

// Error handling middleware for Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    req.flash('error', err.message);
    return res.redirect('back');
  }
  next(err);
});

// Frontend Routes
app.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5);
    const photos = await Photo.find().sort({ createdAt: -1 }).limit(6);
    const videos = await Video.find().sort({ createdAt: -1 }).limit(3);
    console.log(`[${new Date().toISOString()}] Fetched homepage data:`, {
      announcementCount: announcements.length,
      photoCount: photos.length,
      videoCount: videos.length,
    });
    res.render('index', {
      announcements,
      photos,
      videos,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Homepage error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load homepage',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

app.get('/about', (req, res) => {
  res.render('about', {
    user: req.session.user,
    messages: req.flash(),
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', {
    user: req.session.user,
    messages: req.flash(),
  });
});

app.get('/gallery', async (req, res) => {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched gallery photos:`, { photoCount: photos.length });
    res.render('gallery', {
      photos,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Gallery error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load gallery',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

app.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched videos:`, { videoCount: videos.length });
    res.render('videos', {
      videos,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Videos error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load videos',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

// Admin Login Routes
app.get('/admin/login', (req, res) => {
  if (req.session.user) {
    console.log(`[${new Date().toISOString()}] User already logged in, redirecting to dashboard`);
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login', {
    error: req.flash('error'),
    success: req.query.logout === 'success' ? ['You have been logged out successfully'] : req.flash('success'),
    username: req.flash('username'),
  });
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Login attempt: { username: '${username}' }`);

    const admin = await Admin.findOne({ username });
    if (!admin) {
      console.log(`[${new Date().toISOString()}] User not found: ${username}`);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      return res.redirect('/admin/login');
    }

    const isMatch = await admin.comparePassword(password);
    console.log(`[${new Date().toISOString()}] Password match: ${isMatch}`);
    if (!isMatch) {
      console.log(`[${new Date().toISOString()}] Password mismatch for user: ${username}`);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      return res.redirect('/admin/login');
    }

    req.session.user = {
      id: admin._id.toString(),
      username: admin.username,
      role: 'admin',
    };
    console.log(`[${new Date().toISOString()}] Session created:`, req.session.user, { sessionID: req.sessionID });

    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
        return res.redirect('/admin/login');
      }
      console.log(`[${new Date().toISOString()}] Session saved successfully. Session ID: ${req.sessionID}`);
      sessionStore.get(req.sessionID, (err, session) => {
        if (err || !session) {
          console.error(`[${new Date().toISOString()}] Session not found in store:`, err);
          req.flash('error', 'Session storage failed');
          return res.redirect('/admin/login');
        }
        console.log(`[${new Date().toISOString()}] Session verified in store:`, session);
        req.flash('success', 'Logged in successfully');
        res.redirect('/admin/dashboard');
      });
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Login error:`, err);
    req.flash('error', 'An error occurred during login');
    res.redirect('/admin/login');
  }
});

// Admin Logout Route
app.get('/admin/logout', (req, res) => {
  const user = req.session.user ? { ...req.session.user } : null;

  const safeRedirect = (url) => {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.status(302).location(url).end();
  };

  req.session.destroy((err) => {
    if (err) {
      console.error(`[${new Date().toISOString()}] Session destruction error:`, err);
    }

    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    if (user) {
      console.log(`[${new Date().toISOString()}] Admin ${user.username} logged out`);
    }

    safeRedirect('/admin/login?logout=success');
  });
});

// Session Verification Middleware
app.use('/admin*', (req, res, next) => {
  if (req.path === '/admin/login' || req.path.startsWith('/admin/assets/')) {
    return next();
  }

  if (!req.sessionID || !req.cookies || !req.cookies['connect.sid']) {
    console.log(`[${new Date().toISOString()}] No session ID or connect.sid cookie, redirecting to login`);
    return res.redirect('/admin/login');
  }

  sessionStore.get(req.sessionID, (err, session) => {
    console.log(`[${new Date().toISOString()}] Session store check:`, {
      sessionID: req.sessionID,
      sessionExists: !!session,
      error: err,
      cookies: req.cookies,
    });
    if (err || !session) {
      console.log(`[${new Date().toISOString()}] Session not found in store, redirecting to login`);
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error(`[${new Date().toISOString()}] Session destroy error:`, destroyErr);
        res.clearCookie('connect.sid', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        });
        res.redirect('/admin/login');
      });
    } else {
      console.log(`[${new Date().toISOString()}] Session found:`, session);
      next();
    }
  });
});

// Admin Dashboard
app.get('/admin/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const [announcementCount, photoCount, videoCount] = await Promise.all([
      Announcement.countDocuments(),
      Photo.countDocuments(),
      Video.countDocuments(),
    ]);

    res.render('admin/dashboard', {
      user: req.session.user,
      announcementCount,
      photoCount,
      videoCount,
      currentRoute: 'dashboard',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Dashboard error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

// Announcements Routes
app.get('/admin/announcements', ensureAuthenticated, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .populate('author', 'username');
    console.log(`[${new Date().toISOString()}] Admin fetched announcements:`, 
      announcements.length, 
      announcements.map(a => ({ id: a._id, title: a.title, isActive: a.isActive, author: a.author ? a.author.username : 'N/A' }))
    );
    res.render('admin/manage-announcements', {
      title: 'Manage Announcements',
      announcements,
      user: req.session.user,
      currentRoute: 'announcements',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Announcements error:`, err);
    req.flash('error', 'Error fetching announcements');
    res.redirect('/admin/dashboard');
  }
});

app.get('/admin/announcements/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-announcement', {
    title: 'Create Announcement',
    announcement: null,
    user: req.session.user,
    messages: req.flash(),
  });
});

app.get('/admin/announcements/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).populate('author', 'username');
    if (!announcement) {
      req.flash('error', 'Announcement not found');
      return res.redirect('/admin/announcements');
    }
    res.render('admin/edit-announcement', {
      title: 'Edit Announcement',
      announcement,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Announcement edit error:`, err);
    req.flash('error', 'Failed to load announcement');
    res.redirect('/admin/announcements');
  }
});

app.post('/admin/announcements', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content, isActive } = req.body;
    const authorId = req.session.user.id;

    const admin = await Admin.findById(authorId);
    if (!admin) {
      throw new Error(`Invalid author ID: ${authorId}`);
    }
    console.log(`[${new Date().toISOString()}] Creating announcement with author:`, { authorId, username: admin.username });

    const newAnnouncement = new Announcement({
      title,
      content,
      isActive: isActive === 'on' ? true : false,
      author: authorId,
    });

    const savedAnnouncement = await newAnnouncement.save();
    console.log(`[${new Date().toISOString()}] Announcement created:`, {
      id: savedAnnouncement._id,
      title: savedAnnouncement.title,
      isActive: savedAnnouncement.isActive,
      author: savedAnnouncement.author,
    });
    req.flash('success', 'Announcement created successfully');
    res.redirect('/admin/announcements');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Create announcement error:`, err);
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : `Failed to create announcement: ${err.message}`
    );
    res.redirect('/admin/announcements/new');
  }
});

app.put('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content, isActive } = req.body;
    const authorId = req.session.user.id;

    const admin = await Admin.findById(authorId);
    if (!admin) {
      throw new Error(`Invalid author ID: ${authorId}`);
    }
    console.log(`[${new Date().toISOString()}] Updating announcement with author:`, { authorId, username: admin.username });

    const updateData = {
      title,
      content,
      isActive: isActive === 'on' ? true : false,
      updatedAt: Date.now(),
    };

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    console.log(`[${new Date().toISOString()}] Announcement updated:`, {
      id: updatedAnnouncement._id,
      title: updatedAnnouncement.title,
      isActive: updatedAnnouncement.isActive,
      author: updatedAnnouncement.author,
    });
    req.flash('success', 'Announcement updated successfully');
    res.redirect('/admin/announcements');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Update announcement error:`, err);
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : `Failed to update announcement: ${err.message}`
    );
    res.redirect(`/admin/announcements/${req.params.id}/edit`);
  }
});

app.delete('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    console.log(`[${new Date().toISOString()}] Announcement deleted:`, { id: req.params.id });
    return res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete announcement error:`, err);
    return res.status(500).json({ success: false, message: `Failed to delete announcement: ${err.message}` });
  }
});

// Photos Routes
app.get('/admin/photos', ensureAuthenticated, async (req, res) => {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched admin photos:`, { photoCount: photos.length });
    res.render('admin/manage-photos', {
      photos,
      user: req.session.user,
      currentRoute: 'photos',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photos error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load photos',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

app.get('/admin/photos/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-photo', {
    photo: null,
    user: req.session.user,
    messages: req.flash(),
  });
});

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
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photo edit error:`, err);
    req.flash('error', 'Failed to load photo for editing');
    res.redirect('/admin/photos');
  }
});

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
      imageUrl: process.env.NODE_ENV === 'production' ? req.file.location : '/uploads/images/' + req.file.filename,
      isFeatured: isFeatured === 'on' ? true : false,
      uploadedBy: req.session.user.id,
    });

    await newPhoto.save();
    console.log(`[${new Date().toISOString()}] Saved photo:`, newPhoto.toObject());
    req.flash('success', 'Photo uploaded successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photo upload error:`, err);
    if (req.file && process.env.NODE_ENV !== 'production') {
      fs.unlink(path.join(__dirname, 'public/uploads/images', req.file.filename)).catch((unlinkErr) =>
        console.error(`[${new Date().toISOString()}] Failed to delete uploaded file:`, unlinkErr)
      );
    }
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : 'Failed to upload photo'
    );
    res.redirect('/admin/photos/new');
  }
});

app.put('/admin/photos/:id', ensureAuthenticated, uploadImage.single('image'), async (req, res) => {
  try {
    const { title, description, isFeatured } = req.body;
    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on' ? true : false,
      updatedAt: Date.now(),
    };

    if (req.file) {
      updateData.imageUrl = process.env.NODE_ENV === 'production' ? req.file.location : '/uploads/images/' + req.file.filename;
      const oldPhoto = await Photo.findById(req.params.id);
      if (oldPhoto?.imageUrl && process.env.NODE_ENV !== 'production') {
        const oldPath = path.join(__dirname, 'public', oldPhoto.imageUrl);
        await fs.unlink(oldPath).catch((unlinkErr) =>
          console.error(`[${new Date().toISOString()}] Failed to delete old image:`, unlinkErr)
        );
      }
    }

    const updatedPhoto = await Photo.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    console.log(`[${new Date().toISOString()}] Updated photo:`, updatedPhoto.toObject());
    req.flash('success', 'Photo updated successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photo update error:`, err);
    if (req.file && process.env.NODE_ENV !== 'production') {
      fs.unlink(path.join(__dirname, 'public/uploads/images', req.file.filename)).catch((unlinkErr) =>
        console.error(`[${new Date().toISOString()}] Failed to delete uploaded file:`, unlinkErr)
      );
    }
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : 'Failed to update photo'
    );
    res.redirect(`/admin/photos/${req.params.id}/edit`);
  }
});

app.delete('/admin/photos/:id', ensureAuthenticated, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Photo not found' });
      }
      req.flash('error', 'Photo not found');
      return res.redirect('/admin/photos');
    }

    if (photo.imageUrl && process.env.NODE_ENV !== 'production') {
      const filePath = path.join(__dirname, 'public', photo.imageUrl);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath).catch((unlinkErr) =>
          console.error(`[${new Date().toISOString()}] Failed to delete photo file:`, unlinkErr)
        );
      }
    }

    await Photo.findByIdAndDelete(req.params.id);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Photo deleted successfully',
      });
    }
    req.flash('success', 'Photo deleted successfully');
    res.redirect('/admin/photos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete photo error:`, err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Failed to delete photo' });
    }
    req.flash('error', 'Failed to delete photo');
    res.redirect('/admin/photos');
  }
});

// Videos Routes
app.get('/admin/videos', ensureAuthenticated, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched admin videos:`, { videoCount: videos.length });
    res.render('admin/manage-videos', {
      videos,
      user: req.session.user,
      currentRoute: 'videos',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Videos error:`, err);
    res.status(500).render('error', {
      message: 'Failed to load videos',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  }
});

app.get('/admin/videos/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-video', {
    video: null,
    user: req.session.user,
    messages: req.flash(),
  });
});

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
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video edit error:`, err);
    req.flash('error', 'Failed to load video for editing');
    res.redirect('/admin/videos');
  }
});

app.post('/admin/videos', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    console.log(`[${new Date().toISOString()}] Creating video:`, { title, source });

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
      isFeatured: isFeatured === 'on' ? true : false,
      uploadedBy: req.session.user.id,
      source,
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
      videoData.videoUrl = process.env.NODE_ENV === 'production' ? req.file.location : '/uploads/videos/' + req.file.filename;
    }

    const newVideo = new Video(videoData);
    await newVideo.save();
    console.log(`[${new Date().toISOString()}] Saved video:`, newVideo.toObject());
    req.flash('success', 'Video added successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video upload error:`, err);
    if (req.file && process.env.NODE_ENV !== 'production') {
      fs.unlink(path.join(__dirname, 'public/uploads/videos', req.file.filename)).catch((unlinkErr) =>
        console.error(`[${new Date().toISOString()}] Failed to delete uploaded video:`, unlinkErr)
      );
    }
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : 'Failed to add video'
    );
    res.redirect('/admin/videos/new');
  }
});

app.put('/admin/videos/:id', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    console.log(`[${new Date().toISOString()}] Updating video:`, { id: req.params.id, title, source });

    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error', 'Video not found');
      return res.redirect('/admin/videos');
    }

    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on' ? true : false,
      updatedAt: Date.now(),
      source,
    };

    if (source === 'youtube') {
      const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = youtubeUrl.match(regExp);
      if (!match) {
        req.flash('error', 'Invalid YouTube URL');
        return res.redirect(`/admin/videos/${req.params.id}/edit`);
      }
      updateData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;

      if (video.source === 'upload' && video.videoUrl && process.env.NODE_ENV !== 'production') {
        const oldPath = path.join(__dirname, 'public', video.videoUrl);
        await fs.unlink(oldPath).catch((unlinkErr) =>
          console.error(`[${new Date().toISOString()}] Failed to delete old video:`, unlinkErr)
        );
      }
    } else if (req.file) {
      updateData.videoUrl = process.env.NODE_ENV === 'production' ? req.file.location : '/uploads/videos/' + req.file.filename;

      if (video.source === 'upload' && video.videoUrl && process.env.NODE_ENV !== 'production') {
        const oldPath = path.join(__dirname, 'public', video.videoUrl);
        await fs.unlink(oldPath).catch((unlinkErr) =>
          console.error(`[${new Date().toISOString()}] Failed to delete old video:`, unlinkErr)
        );
      }
    } else {
      updateData.videoUrl = video.videoUrl;
    }

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    console.log(`[${new Date().toISOString()}] Updated video:`, updatedVideo.toObject());
    req.flash('success', 'Video updated successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video update error:`, err);
    if (req.file && process.env.NODE_ENV !== 'production') {
      fs.unlink(path.join(__dirname, 'public/uploads/videos', req.file.filename)).catch((unlinkErr) =>
        console.error(`[${new Date().toISOString()}] Failed to delete uploaded video:`, unlinkErr)
      );
    }
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : 'Failed to update video'
    );
    res.redirect(`/admin/videos/${req.params.id}/edit`);
  }
});

app.delete('/admin/videos/:id', ensureAuthenticated, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Video not found' });
      }
      req.flash('error', 'Video not found');
      return res.redirect('/admin/videos');
    }

    if (video.source === 'upload' && video.videoUrl && process.env.NODE_ENV !== 'production') {
      const filePath = path.join(__dirname, 'public', video.videoUrl);
      await fs.unlink(filePath).catch((unlinkErr) =>
        console.error(`[${new Date().toISOString()}] Failed to delete video file:`, unlinkErr)
      );
    }

    await Video.findByIdAndDelete(req.params.id);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: 'Video deleted successfully' });
    }
    req.flash('success', 'Video deleted successfully');
    res.redirect('/admin/videos');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete video error:`, err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Failed to delete video' });
    }
    req.flash('error', 'Failed to delete video');
    res.redirect('/admin/videos');
  }
});

app.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      req.flash('error', 'All fields are required');
      return res.redirect('/contact');
    }

    console.log(`[${new Date().toISOString()}] New contact form submission:`, {
      name,
      email,
      subject,
      message,
    });

    req.flash('success', 'Thank you for your message! We will contact you soon.');
    res.redirect('/contact');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Contact form error:`, err);
    req.flash('error', 'Failed to send your message. Please try again later.');
    res.redirect('/contact');
  }
});

// Initialize admin user
async function initializeAdmin() {
  try {
    console.log('Checking admin user...');
    console.log('ADMIN_USERNAME:', process.env.ADMIN_USERNAME || 'Not set');
    console.log('ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? 'Set' : 'Not set');
    console.log('ADMIN_EMAIL:', process.env.ADMIN_EMAIL || 'Not set');

    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_EMAIL) {
        throw new Error('Missing required environment variables for admin creation');
      }
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await Admin.create({
        username: process.env.ADMIN_USERNAME,
        email: process.env.ADMIN_EMAIL,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Admin user created:', process.env.ADMIN_USERNAME);
    } else {
      console.log('Admin user already exists, skipping creation');
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error initializing admin:`, err);
    throw err;
  }
}

// Global Error Handling
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err.stack);
  res.status(500).render('error', {
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// Start server
(async () => {
  try {
    await connectDB();
    await initializeAdmin();

    const PORT = process.env.PORT || 10000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

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
    console.error(`[${new Date().toISOString()}] Server startup error:`, err);
    process.exit(1);
  }
})();