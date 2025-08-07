const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const methodOverride = require('method-override');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cron = require('node-cron');

// Initialize Express app
const app = express();

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_EMAIL', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_ENDPOINT', 'B2_BUCKET_NAME'];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`[${new Date().toISOString()}] Error: Environment variable ${varName} is not set`);
    process.exit(1);
  }
});

console.log(`[${new Date().toISOString()}] Loaded ADMIN_USERNAME: ${process.env.ADMIN_USERNAME}`);
console.log(`[${new Date().toISOString()}] ADMIN_PASSWORD: ${process.env.ADMIN_PASSWORD ? 'Set' : 'Not set'}`);
console.log(`[${new Date().toISOString()}] ADMIN_EMAIL: ${process.env.ADMIN_EMAIL}`);
console.log(`[${new Date().toISOString()}] MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
console.log(`[${new Date().toISOString()}] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`[${new Date().toISOString()}] SESSION_SECRET: ${process.env.SESSION_SECRET ? 'Set' : 'Not set'}`);
console.log(`[${new Date().toISOString()}] B2_KEY_ID: ${process.env.B2_KEY_ID ? 'Set' : 'Not set'}`);
console.log(`[${new Date().toISOString()}] B2_APPLICATION_KEY: ${process.env.B2_APPLICATION_KEY ? 'Set' : 'Not set'}`);
console.log(`[${new Date().toISOString()}] B2_ENDPOINT: ${process.env.B2_ENDPOINT}`);
console.log(`[${new Date().toISOString()}] B2_BUCKET_NAME: ${process.env.B2_BUCKET_NAME}`);

// Trust Render's proxy
app.set('trust proxy', 1);

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
  ttl: 24 * 60 * 60, // 24 hours
  autoRemove: 'native',
});

sessionStore.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Session store error:`, err);
});

sessionStore.on('connected', () => {
  console.log(`[${new Date().toISOString()}] Session store connected to MongoDB`);
});

app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    },
    store: sessionStore,
  })
);

// Log session middleware details for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Session middleware:`, {
    sessionID: req.sessionID,
    cookie: req.cookies['connect.sid'] || 'none',
    user: req.session.user || 'none',
    path: req.path,
  });
  next();
});

// Flash messages
app.use(flash());

// Configure Backblaze B2
const s3 = new S3Client({
  region: 'ca-east-006',
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});

// Configure image upload
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, JPG, PNG, GIF allowed.'), false);
  }
};

const uploadImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Configure video upload
const videoFilter = (req, file, cb) => {
  const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only MP4, WebM, OGG allowed.'), false);
  }
};

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Upload to Backblaze B2 and generate signed URL
async function uploadToB2(file, folder) {
  const startTime = Date.now();
  const key = `${folder}/${Date.now()}${path.extname(file.originalname)}`;
  try {
    console.log(`[${new Date().toISOString()}] Starting B2 upload:`, { key, mimetype: file.mimetype, size: file.size });
    await s3.send(new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    const uploadDuration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] B2 upload completed:`, { key, duration: `${uploadDuration}ms` });
    const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: key,
    }), { expiresIn: 604800 }); // 7 days
    console.log(`[${new Date().toISOString()}] Generated signed URL:`, { signedUrl, duration: `${Date.now() - startTime - uploadDuration}ms` });
    return { signedUrl, key, totalDuration: Date.now() - startTime };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] B2 upload error:`, {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    throw err;
  }
}

// Database connection
mongoose.set('strictQuery', false);

const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`[${new Date().toISOString()}] Connected to MongoDB`);
      // Ensure indexes for Video and Photo collections
      await mongoose.model('Video').createIndexes();
      await mongoose.model('Photo').createIndexes();
      return;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] MongoDB connection error:`, {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack,
      });
      retries -= 1;
      if (retries === 0) {
        console.error(`[${new Date().toISOString()}] MongoDB connection failed after retries, exiting...`);
        process.exit(1);
      }
      console.log(`[${new Date().toISOString()}] Retrying connection (${retries} attempts left)...`);
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
    )} | Set-Cookie: ${res.get('Set-Cookie') || 'none'} | Accept: ${req.headers.accept || 'none'}`
  );
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Response headers: ${JSON.stringify(res.getHeaders())}`);
  });
  next();
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  console.log(`[${new Date().toISOString()}] ensureAuthenticated:`, {
    sessionID: req.sessionID,
    cookie: req.cookies['connect.sid'] || 'none',
    user: req.session.user || 'none',
    sessionExists: !!req.session,
    path: req.path,
  });
  if (req.session.user && req.session.user.role === 'admin') {
    req.session.touch();
    console.log(`[${new Date().toISOString()}] Session valid, proceeding`);
    return next();
  }
  console.log(`[${new Date().toISOString()}] Session invalid, redirecting to login`);
  res.redirect('/admin/login');
}

// Session Verification Middleware
app.use('/admin/*', (req, res, next) => {
  if (req.path === '/admin/login' || req.path.startsWith('/admin/assets/')) {
    return next();
  }
  console.log(`[${new Date().toISOString()}] Session verification:`, {
    sessionID: req.sessionID,
    cookie: req.cookies['connect.sid'] || 'none',
    path: req.path,
  });
  if (!req.sessionID || !req.cookies['connect.sid']) {
    console.log(`[${new Date().toISOString()}] No session ID or cookie, redirecting to login`);
    return res.redirect('/admin/login');
  }
  sessionStore.get(req.sessionID, (err, session) => {
    if (err || !session) {
      console.error(`[${new Date().toISOString()}] Session not found in store:`, err || 'No session data');
      res.redirect('/admin/login');
    } else {
      console.log(`[${new Date().toISOString()}] Session found in store:`, session);
      next();
    }
  });
});

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error(`[${new Date().toISOString()}] Multer error:`, {
      message: err.message,
      code: err.code,
      field: err.field,
    });
    req.flash('error', `Upload failed: ${err.message}`);
    return res.redirect(req.originalUrl.includes('photos') ? '/admin/photos/new' : '/admin/videos/new');
  } else if (err.message.includes('Invalid file format')) {
    console.error(`[${new Date().toISOString()}] File format error:`, err.message);
    req.flash('error', err.message);
    return res.redirect(req.originalUrl.includes('photos') ? '/admin/photos/new' : '/admin/videos/new');
  }
  next(err);
});

// Frontend Routes
app.get('/', async (req, res) => {
  const startTime = Date.now();
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
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('index', {
      announcements,
      photos,
      videos,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Homepage error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    res.status(500).render('error', {
      message: 'Failed to load homepage',
      error: process.env.NODE_ENV === 'development' ? err : {},
      messages: req.flash(),
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

app.get('/announcements', async (req, res) => {
  const startTime = Date.now();
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched public announcements:`, {
      count: announcements.length,
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('announcements', {
      announcements: announcements || [],
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Public announcements error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load announcements: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'Failed to load announcements',
        error: process.env.NODE_ENV === 'development' ? err : {},
        messages: req.flash(),
      });
    });
  }
});

app.get('/gallery', async (req, res) => {
  const startTime = Date.now();
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched gallery photos:`, {
      photoCount: photos.length,
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('gallery', {
      photos: photos || [],
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Gallery error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load gallery: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'Failed to load gallery',
        error: process.env.NODE_ENV === 'development' ? err : {},
        messages: req.flash(),
      });
    });
  }
});

app.get('/videos', async (req, res) => {
  const startTime = Date.now();
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched videos:`, {
      videoCount: videos.length,
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('videos', {
      videos: videos || [],
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Videos error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load videos: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'Failed to load videos',
        error: process.env.NODE_ENV === 'development' ? err : {},
        messages: req.flash(),
      });
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
  const startTime = Date.now();
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Login attempt:`, { username, sessionID: req.sessionID });

    const admin = await Admin.findOne({ username });
    if (!admin) {
      console.log(`[${new Date().toISOString()}] User not found:`, username);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      return res.redirect('/admin/login');
    }

    const isMatch = await admin.comparePassword(password);
    console.log(`[${new Date().toISOString()}] Password match:`, isMatch);
    if (!isMatch) {
      console.log(`[${new Date().toISOString()}] Password mismatch for user:`, username);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      return res.redirect('/admin/login');
    }

    req.session.user = {
      id: admin._id.toString(),
      username: admin.username,
      role: 'admin',
    };
    console.log(`[${new Date().toISOString()}] Session created:`, {
      user: req.session.user,
      sessionID: req.sessionID,
      duration: `${Date.now() - startTime}ms`,
    });

    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
        return res.redirect('/admin/login');
      }
      console.log(`[${new Date().toISOString()}] Session saved successfully. Session ID:`, req.sessionID);
      res.cookie('connect.sid', req.sessionID, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      });
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
    console.error(`[${new Date().toISOString()}] Login error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', 'An error occurred during login');
    res.redirect('/admin/login');
  }
});

// Admin Logout Route
app.get('/admin/logout', (req, res) => {
  const user = req.session.user ? { ...req.session.user } : null;

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

    res.redirect('/admin/login?logout=success');
  });
});

// Admin Dashboard
app.get('/admin/dashboard', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
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
    console.error(`[${new Date().toISOString()}] Dashboard error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? err : {},
      messages: req.flash(),
    });
  }
});

// Announcements Routes
app.get('/admin/announcements', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.render('admin/manage-announcements', {
      announcements: announcements || [],
      user: req.session.user,
      currentRoute: 'announcements',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Announcements error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    res.status(500).render('error', {
      message: 'Failed to load announcements',
      error: process.env.NODE_ENV === 'development' ? err : {},
      messages: req.flash(),
    });
  }
});

app.get('/admin/announcements/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-announcement', {
    announcement: null,
    user: req.session.user,
    messages: req.flash(),
  });
});

app.get('/admin/announcements/:id/edit', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      req.flash('error', 'Announcement not found');
      return res.redirect('/admin/announcements');
    }
    res.render('admin/edit-announcement', {
      announcement,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Announcement edit error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', 'Failed to load announcement');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements');
    });
  }
});

app.post('/admin/announcements', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const { title, content, isActive } = req.body;
    console.log(`[${new Date().toISOString()}] Creating announcement:`, { title, isActive });

    const announcementData = {
      title,
      content,
      isActive: isActive === 'on',
      author: req.session.user.id,
    };

    const newAnnouncement = new Announcement(announcementData);
    await newAnnouncement.save();
    console.log(`[${new Date().toISOString()}] Saved announcement:`, newAnnouncement.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Announcement created successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Create announcement error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : `Failed to create announcement: ${err.message}`
    );
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements/new');
    });
  }
});

app.put('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const { title, content, isActive } = req.body;
    console.log(`[${new Date().toISOString()}] Updating announcement:`, { id: req.params.id, title, isActive });

    const updateData = {
      title,
      content,
      isActive: isActive === 'on',
      updatedAt: Date.now(),
    };

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    console.log(`[${new Date().toISOString()}] Updated announcement:`, updatedAnnouncement.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Announcement updated successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Update announcement error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash(
      'error',
      err instanceof mongoose.Error.ValidationError
        ? Object.values(err.errors)
            .map((e) => e.message)
            .join(', ')
        : `Failed to update announcement: ${err.message}`
    );
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect(`/admin/announcements/${req.params.id}/edit`);
    });
  }
});

app.delete('/admin/announcements/:id', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      console.log(`[${new Date().toISOString()}] Announcement not found:`, req.params.id);
      req.flash('error', 'Announcement not found');
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/announcements');
      });
      return;
    }

    await Announcement.findByIdAndDelete(req.params.id);
    console.log(`[${new Date().toISOString()}] Deleted announcement:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Announcement deleted successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete announcement error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to delete announcement: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/announcements');
    });
  }
});

// Photos Routes
app.get('/admin/photos', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched admin photos:`, { photoCount: photos.length, duration: `${Date.now() - startTime}ms` });
    res.render('admin/manage-photos', {
      photos: photos || [],
      user: req.session.user,
      currentRoute: 'photos',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photos error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load photos: ${err.message}`);
    res.render('admin/manage-photos', {
      photos: [],
      user: req.session.user,
      currentRoute: 'photos',
      messages: req.flash(),
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
  const startTime = Date.now();
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
    console.error(`[${new Date().toISOString()}] Photo edit error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load photo for editing: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos');
    });
  }
});

app.post('/admin/photos', ensureAuthenticated, uploadImage.single('image'), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Photo upload attempt:`, {
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
      body: req.body,
      user: req.session.user,
    });
    if (!req.file) {
      req.flash('error', 'Please select an image file');
      console.log(`[${new Date().toISOString()}] No file uploaded`);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/photos/new');
      });
      return;
    }

    const { title, description, isFeatured } = req.body;
    console.log(`[${new Date().toISOString()}] Uploading to B2:`, { title, description, isFeatured });
    const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'images');
    console.log(`[${new Date().toISOString()}] B2 upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
    const newPhoto = new Photo({
      title,
      description,
      imageUrl: signedUrl,
      b2Key: key,
      isFeatured: isFeatured === 'on',
      uploadedBy: req.session.user.id,
    });

    await newPhoto.save();
    console.log(`[${new Date().toISOString()}] Saved photo:`, newPhoto.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Photo uploaded successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photo upload error:`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to upload photo: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos/new');
    });
  }
});

app.put('/admin/photos/:id', ensureAuthenticated, uploadImage.single('image'), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Updating photo:`, {
      id: req.params.id,
      session: req.sessionID,
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
    });
    const { title, description, isFeatured } = req.body;
    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      updatedAt: Date.now(),
    };

    if (req.file) {
      console.log(`[${new Date().toISOString()}] Uploading new image to B2`);
      const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'images');
      updateData.imageUrl = signedUrl;
      updateData.b2Key = key;
      console.log(`[${new Date().toISOString()}] B2 upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
    }

    const updatedPhoto = await Photo.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!updatedPhoto) {
      req.flash('error', 'Photo not found');
      console.log(`[${new Date().toISOString()}] Photo not found:`, req.params.id);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/photos');
      });
      return;
    }
    console.log(`[${new Date().toISOString()}] Updated photo:`, updatedPhoto.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Photo updated successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Photo update error:`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to update photo: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect(`/admin/photos/${req.params.id}/edit`);
    });
  }
});

app.delete('/admin/photos/:id', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Deleting photo:`, { id: req.params.id, accept: req.headers.accept });
    const isAjax = req.headers.accept.includes('application/json') || req.query.ajax === 'true';

    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      console.log(`[${new Date().toISOString()}] Photo not found:`, req.params.id);
      req.flash('error', 'Photo not found');
      if (isAjax) {
        return res.status(404).json({ success: false, message: 'Photo not found' });
      }
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/photos');
      });
      return;
    }

    await Photo.findByIdAndDelete(req.params.id);
    console.log(`[${new Date().toISOString()}] Deleted photo:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Photo deleted successfully');
    if (isAjax) {
      return res.status(200).json({ success: true, message: 'Photo deleted successfully' });
    }
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete photo error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to delete photo: ${err.message}`);
    if (isAjax) {
      return res.status(500).json({ success: false, message: `Failed to delete photo: ${err.message}` });
    }
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/photos');
    });
  }
});

// Videos Routes
app.get('/admin/videos', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched admin videos:`, { videoCount: videos.length, duration: `${Date.now() - startTime}ms` });
    res.render('admin/manage-videos', {
      videos: videos || [],
      user: req.session.user,
      currentRoute: 'videos',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Videos error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load videos: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.render('admin/manage-videos', {
        videos: [],
        user: req.session.user,
        currentRoute: 'videos',
        messages: req.flash(),
      });
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
  const startTime = Date.now();
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error', 'Video not found');
      console.log(`[${new Date().toISOString()}] Video not found:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos');
      });
      return;
    }
    console.log(`[${new Date().toISOString()}] Fetched video for edit:`, { id: req.params.id, duration: `${Date.now() - startTime}ms` });
    res.render('admin/edit-video', {
      video,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video edit error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load video for editing: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos');
    });
  }
});

app.post('/admin/videos', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
  const startTime = Date.now();
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    console.log(`[${new Date().toISOString()}] Video upload attempt:`, {
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
      body: req.body,
      user: req.session.user,
      duration: `${Date.now() - startTime}ms`,
    });

    if (source === 'upload' && !req.file) {
      req.flash('error', 'Please upload a video file');
      console.log(`[${new Date().toISOString()}] No video file uploaded`, { duration: `${Date.now() - startTime}ms` });
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos/new');
      });
      return;
    }

    if (source === 'youtube' && !youtubeUrl) {
      req.flash('error', 'Please provide a YouTube URL');
      console.log(`[${new Date().toISOString()}] No YouTube URL provided`, { duration: `${Date.now() - startTime}ms` });
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos/new');
      });
      return;
    }

    const videoData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      uploadedBy: req.session.user.id,
      source,
    };

    if (source === 'youtube') {
      const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = youtubeUrl.match(regExp);
      if (!match) {
        req.flash('error', 'Invalid YouTube URL');
        console.log(`[${new Date().toISOString()}] Invalid YouTube URL:`, youtubeUrl, { duration: `${Date.now() - startTime}ms` });
        req.session.save((err) => {
          if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
          res.redirect('/admin/videos/new');
        });
        return;
      }
      videoData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;
    } else {
      console.log(`[${new Date().toISOString()}] Uploading video to B2`, { duration: `${Date.now() - startTime}ms` });
      const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'videos');
      console.log(`[${new Date().toISOString()}] B2 upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
      videoData.videoUrl = signedUrl;
      videoData.b2Key = key;
    }

    const newVideo = new Video(videoData);
    await newVideo.save();
    console.log(`[${new Date().toISOString()}] Saved video:`, newVideo.toObject(), { totalDuration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video added successfully');
    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
      }
      res.redirect('/admin/videos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video upload error:`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to add video: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos/new');
    });
  }
});

app.put('/admin/videos/:id', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
  const startTime = Date.now();
  try {
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    console.log(`[${new Date().toISOString()}] Updating video:`, {
      id: req.params.id,
      title,
      source,
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
      duration: `${Date.now() - startTime}ms`,
    });

    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error', 'Video not found');
      console.log(`[${new Date().toISOString()}] Video not found:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos');
      });
      return;
    }

    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      updatedAt: Date.now(),
      source,
    };

    if (source === 'youtube') {
      const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = youtubeUrl.match(regExp);
      if (!match) {
        req.flash('error', 'Invalid YouTube URL');
        console.log(`[${new Date().toISOString()}] Invalid YouTube URL:`, youtubeUrl, { duration: `${Date.now() - startTime}ms` });
        req.session.save((err) => {
          if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
          res.redirect(`/admin/videos/${req.params.id}/edit`);
        });
        return;
      }
      updateData.videoUrl = `https://www.youtube.com/embed/${match[1]}`;
      updateData.b2Key = null;
    } else if (req.file) {
      console.log(`[${new Date().toISOString()}] Uploading new video to B2`, { duration: `${Date.now() - startTime}ms` });
      const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'videos');
      updateData.videoUrl = signedUrl;
      updateData.b2Key = key;
      console.log(`[${new Date().toISOString()}] B2 upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
    } else {
      updateData.videoUrl = video.videoUrl;
      updateData.b2Key = video.b2Key;
    }

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    console.log(`[${new Date().toISOString()}] Updated video:`, updatedVideo.toObject(), { totalDuration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video updated successfully');
    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
      }
      res.redirect('/admin/videos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Video update error:`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to update video: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect(`/admin/videos/${req.params.id}/edit`);
    });
  }
});

app.delete('/admin/videos/:id', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Deleting video:`, { id: req.params.id, accept: req.headers.accept });
    const video = await Video.findById(req.params.id);
    if (!video) {
      console.log(`[${new Date().toISOString()}] Video not found:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
      req.flash('error', 'Video not found');
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos');
      });
      return;
    }

    await Video.findByIdAndDelete(req.params.id);
    console.log(`[${new Date().toISOString()}] Deleted video:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video deleted successfully');
    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
      }
      res.redirect('/admin/videos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete video error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to delete video: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos');
    });
  }
});

// Refresh signed URLs
app.get('/admin/refresh-urls', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const photos = await Photo.find({ b2Key: { $exists: true } });
    for (const photo of photos) {
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: photo.b2Key,
      }), { expiresIn: 604800 });
      await Photo.findByIdAndUpdate(photo._id, { imageUrl: signedUrl });
    }
    const videos = await Video.find({ b2Key: { $exists: true } });
    for (const video of videos) {
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: video.b2Key,
      }), { expiresIn: 604800 });
      await Video.findByIdAndUpdate(video._id, { videoUrl: signedUrl });
    }
    console.log(`[${new Date().toISOString()}] Refreshed signed URLs`, { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Signed URLs refreshed successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/dashboard');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error refreshing URLs:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Error refreshing URLs: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/dashboard');
    });
  }
});

// Cron job to refresh signed URLs daily
cron.schedule('0 0 * * *', async () => {
  const startTime = Date.now();
  try {
    const photos = await Photo.find({ b2Key: { $exists: true } });
    for (const photo of photos) {
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: photo.b2Key,
      }), { expiresIn: 604800 });
      await Photo.findByIdAndUpdate(photo._id, { imageUrl: signedUrl });
    }
    const videos = await Video.find({ b2Key: { $exists: true } });
    for (const video of videos) {
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: video.b2Key,
      }), { expiresIn: 604800 });
      await Video.findByIdAndUpdate(video._id, { videoUrl: signedUrl });
    }
    console.log(`[${new Date().toISOString()}] Refreshed signed URLs via cron`, { duration: `${Date.now() - startTime}ms` });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Cron URL refresh error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
  }
});

app.post('/contact', async (req, res) => {
  const startTime = Date.now();
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      req.flash('error', 'All fields are required');
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/contact');
      });
      return;
    }

    console.log(`[${new Date().toISOString()}] New contact form submission:`, {
      name,
      email,
      subject,
      message,
      duration: `${Date.now() - startTime}ms`,
    });

    req.flash('success', 'Thank you for your message! We will contact you soon.');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/contact');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Contact form error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', 'Failed to send your message. Please try again later.');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/contact');
    });
  }
});

// Initialize admin user
async function initializeAdmin() {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Checking admin user...`);
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
      console.log(`[${new Date().toISOString()}] Admin user created:`, process.env.ADMIN_USERNAME, { duration: `${Date.now() - startTime}ms` });
    } else {
      console.log(`[${new Date().toISOString()}] Admin user already exists, skipping creation`, { duration: `${Date.now() - startTime}ms` });
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error initializing admin:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    throw err;
  }
}

// Global Error Handling
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Global error:`, {
    message: err.message,
    stack: err.stack,
    code: err.code,
    name: err.name,
    path: req.path,
  });
  res.status(500).render('error', {
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {},
    messages: req.flash(),
  });
});

// Start server
(async () => {
  try {
    await connectDB();
    await initializeAdmin();

    const PORT = process.env.PORT || 10000;
    const server = app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
      console.log(`[${new Date().toISOString()}] SIGTERM received. Shutting down gracefully`);
      server.close(() => {
        console.log(`[${new Date().toISOString()}] Server closed`);
        mongoose.connection.close(false, () => {
          console.log(`[${new Date().toISOString()}] MongoDB connection closed`);
          process.exit(0);
        });
      });
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Server startup error:`, {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
})();