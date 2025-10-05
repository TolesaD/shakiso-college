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
const nodemailer = require('nodemailer');

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

console.log('Loaded ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? 'Set' : 'Not set');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Not set');
console.log('B2_KEY_ID:', process.env.B2_KEY_ID ? 'Set' : 'Not set');
console.log('B2_APPLICATION_KEY:', process.env.B2_APPLICATION_KEY ? 'Set' : 'Not set');
console.log('B2_ENDPOINT:', process.env.B2_ENDPOINT);
console.log('B2_BUCKET_NAME:', process.env.B2_BUCKET_NAME);

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
    secret: process.env.SESSION_SECRET,
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

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
    }), { expiresIn: 604800 });
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
      await mongoose.model('Video').createIndexes();
      await mongoose.model('Photo').createIndexes();
      await mongoose.model('Announcement').createIndexes();
      await mongoose.model('Message').createIndexes();
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
const Message = require('./models/Message');

// Initialize admin user
async function initializeAdmin() {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Initializing admin user...`);
    const deleteResult = await Admin.deleteMany({});
    console.log(`[${new Date().toISOString()}] Deleted existing admin users:`, {
      deletedCount: deleteResult.deletedCount,
    });

    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    const admin = new Admin({
      username: process.env.ADMIN_USERNAME,
      password: hashedPassword,
      email: process.env.ADMIN_EMAIL,
      role: 'admin',
    });
    await admin.save();
    console.log(`[${new Date().toISOString()}] Created admin user:`, {
      username: admin.username,
      email: admin.email,
      role: admin.role,
      duration: `${Date.now() - startTime}ms`,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Admin initialization error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    process.exit(1);
  }
}

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
  console.log(`[${new Date().toISOString()}] Checking session:`, {
    sessionID: req.sessionID,
    user: req.session.user,
    cookies: req.cookies || 'No cookies',
    sessionExists: !!req.session,
  });
  if (req.session.user && req.session.user.role === 'admin') {
    req.session.touch();
    console.log(`[${new Date().toISOString()}] Session valid, proceeding to next middleware`);
    return next();
  }
  console.log(`[${new Date().toISOString()}] Session invalid, destroying session`, {
    sessionID: req.sessionID,
    user: req.session.user,
  });
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
    console.log(`[${new Date().toISOString()}] Fetching homepage data`);
    const [announcements, photos, videos] = await Promise.all([
      Announcement.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .catch(err => {
          console.error(`[${new Date().toISOString()}] Announcement query error:`, {
            message: err.message,
            stack: err.stack,
          });
          return [];
        }),
      Photo.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .catch(err => {
          console.error(`[${new Date().toISOString()}] Photo query error:`, {
            message: err.message,
            stack: err.stack,
          });
          return [];
        }),
      Video.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .catch(err => {
          console.error(`[${new Date().toISOString()}] Video query error:`, {
            message: err.message,
            stack: err.stack,
          });
          return [];
        }),
    ]);
    console.log(`[${new Date().toISOString()}] Fetched homepage data:`, {
      announcementCount: announcements.length,
      photoCount: photos.length,
      videoCount: videos.length,
      user: req.session.user ? req.session.user.username : 'Not authenticated',
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('index', {
      announcements,
      photos,
      videos,
      user: req.session.user || null,
      currentRoute: 'home',
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
      user: req.session.user || null,
      currentRoute: 'home',
      messages: req.flash(),
    });
  }
});

// Contact Route
app.get('/contact', (req, res) => {
  res.render('contact', {
    user: req.session.user || null,
    currentRoute: 'contact',
    messages: req.flash(),
    formData: req.session.formData || null,
  });
});

app.post('/contact', async (req, res) => {
  const startTime = Date.now();
  try {
    const { name, email, subject, message } = req.body;
    console.log(`[${new Date().toISOString()}] Contact form submitted:`, { name, email, subject, message });

    // Validate form data
    if (!name || !email || !subject || !message) {
      console.log(`[${new Date().toISOString()}] Validation failed: Missing fields`);
      req.flash('error', 'All fields are required');
      req.session.formData = { name, email, subject, message };
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/contact');
      });
      return;
    }

    // Save to MongoDB
    const newMessage = new Message({
      name,
      email,
      subject,
      message,
      createdAt: new Date(),
    });
    await newMessage.save();
    console.log(`[${new Date().toISOString()}] Saved contact message:`, newMessage.toObject(), { duration: `${Date.now() - startTime}ms` });

    // Send email notification (optional)
    const mailOptions = {
      from: email,
      to: process.env.ADMIN_EMAIL,
      subject: `Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage: ${message}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(`[${new Date().toISOString()}] Email error:`, error);
      } else {
        console.log(`[${new Date().toISOString()}] Email sent: ${info.response}`);
      }
    });

    req.flash('success', 'Your message has been sent successfully!');
    delete req.session.formData;
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
    req.flash('error', `Failed to send message: ${err.message}`);
    req.session.formData = req.body;
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/contact');
    });
  }
});

// Admin Route
app.get('/admin', (req, res) => {
  console.log(`[${new Date().toISOString()}] Accessing /admin:`, {
    sessionID: req.sessionID,
    user: req.session.user,
    cookies: req.cookies || 'No cookies',
  });
  if (req.session.user && req.session.user.role === 'admin') {
    console.log(`[${new Date().toISOString()}] User authenticated, redirecting to /admin/dashboard`);
    return res.redirect('/admin/dashboard');
  }
  console.log(`[${new Date().toISOString()}] User not authenticated, redirecting to /admin/login`);
  res.redirect('/admin/login');
});

app.get('/about', (req, res) => {
  res.render('about', {
    user: req.session.user || null,
    currentRoute: 'about',
    messages: req.flash(),
  });
});

app.get('/announcements', async (req, res) => {
  const startTime = Date.now();
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    console.log(`[${new Date().toISOString()}] Fetched public announcements:`, {
      count: announcements.length,
      sample: announcements.length > 0 ? {
        id: announcements[0]._id,
        title: announcements[0].title,
        content: announcements[0].content ? announcements[0].content.substring(0, 50) + '...' : null,
        isActive: announcements[0].isActive,
        createdAt: announcements[0].createdAt
      } : null,
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('announcements', {
      announcements: announcements || [],
      user: req.session.user || null,
      currentRoute: 'announcements',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Public announcements error:`, {
      message: err.message,
      stack: err.stack,
      name: err.name,
      view: err.view || 'N/A',
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load announcements: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'Failed to load announcements',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.session.user || null,
        currentRoute: 'announcements',
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
      sample: photos.length > 0 ? {
        title: photos[0].title,
        imageUrl: photos[0].imageUrl ? photos[0].imageUrl.substring(0, 50) + '...' : null,
        createdAt: photos[0].createdAt
      } : null,
      duration: `${Date.now() - startTime}ms`,
    });
    res.render('gallery', {
      photos: photos || [],
      user: req.session.user || null,
      currentRoute: 'gallery',
      messages: req.flash(),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Gallery error:`, {
      message: err.message,
      stack: err.stack,
      name: err.name,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load gallery: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'Failed to load gallery',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.session.user || null,
        currentRoute: 'gallery',
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
      user: req.session.user || null,
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
      res.status(500).render('error', {
        message: 'Failed to load videos',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.session.user || null,
        currentRoute: 'videos',
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
    currentRoute: 'login',
    layout: false
  });
});

app.post('/admin/login', async (req, res) => {
  const startTime = Date.now();
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Login attempt:`, { username });

    const admin = await Admin.findOne({ username });
    if (!admin) {
      console.log(`[${new Date().toISOString()}] User not found:`, username);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/login');
      });
      return;
    }

    const isMatch = await admin.comparePassword(password);
    console.log(`[${new Date().toISOString()}] Password match:`, isMatch);
    if (!isMatch) {
      console.log(`[${new Date().toISOString()}] Password mismatch for user:`, username);
      req.flash('error', 'Invalid credentials');
      req.flash('username', username);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/login');
      });
      return;
    }

    req.session.user = {
      id: admin._id.toString(),
      username: admin.username,
      role: 'admin',
    };
    console.log(`[${new Date().toISOString()}] Session created:`, {
      sessionID: req.sessionID,
      user: req.session.user,
      duration: `${Date.now() - startTime}ms`,
    });

    req.session.save((err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Session save error:`, err);
        req.flash('error', 'Failed to save session');
        return res.redirect('/admin/login');
      }
      console.log(`[${new Date().toISOString()}] Session saved successfully. Session ID:`, req.sessionID);
      sessionStore.get(req.sessionID, (err, session) => {
        if (err || !session) {
          console.error(`[${new Date().toISOString()}] Session not found in store:`, err);
          req.flash('error', 'Session storage failed');
          return res.redirect('/admin/login');
        }
        console.log(`[${new Date().toISOString()}] Session verified in store:`, {
          sessionID: req.sessionID,
          user: session.user,
          expires: session.cookie.expires,
        });
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
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.status(500).render('error', {
        message: 'An error occurred during login',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.session.user || null,
        currentRoute: 'login',
        messages: req.flash(),
      });
    });
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
app.use('/admin/*', (req, res, next) => {
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
  const startTime = Date.now();
  try {
    const [announcementCount, photoCount, videoCount] = await Promise.all([
      Announcement.countDocuments(),
      Photo.countDocuments(),
      Video.countDocuments(),
    ]);

    res.render('admin/dashboard', {
      user: req.session.user || null,
      announcementCount,
      photoCount,
      videoCount,
      currentRoute: 'dashboard',
      messages: req.flash(),
      layout: false
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
      user: req.session.user || null,
      currentRoute: 'dashboard',
      messages: req.flash(),
      layout: false
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
      user: req.session.user || null,
      currentRoute: 'announcements',
      messages: req.flash(),
      layout: false
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
      user: req.session.user || null,
      currentRoute: 'announcements',
      messages: req.flash(),
      layout: false
    });
  }
});

app.get('/admin/announcements/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-announcement', {
    announcement: null,
    user: req.session.user || null,
    currentRoute: 'announcements',
    messages: req.flash(),
    layout: false
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
      user: req.session.user || null,
      currentRoute: 'announcements',
      messages: req.flash(),
      layout: false
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
      user: req.session.user || null,
      currentRoute: 'photos',
      messages: req.flash(),
      layout: false
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
      user: req.session.user || null,
      currentRoute: 'photos',
      messages: req.flash(),
      layout: false
    });
  }
});

app.get('/admin/photos/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-photo', {
    photo: null,
    user: req.session.user || null,
    currentRoute: 'photos',
    messages: req.flash(),
    layout: false
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
      user: req.session.user || null,
      currentRoute: 'photos',
      messages: req.flash(),
      layout: false
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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
    if (req.headers.accept.includes('application/json') || req.query.ajax === 'true') {
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
      user: req.session.user || null,
      currentRoute: 'videos',
      messages: req.flash(),
      layout: false
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Videos error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to load videos: ${err.message}`);
    res.render('admin/manage-videos', {
      videos: [],
      user: req.session.user || null,
      currentRoute: 'videos',
      messages: req.flash(),
      layout: false
    });
  }
});

app.get('/admin/videos/new', ensureAuthenticated, (req, res) => {
  res.render('admin/edit-video', {
    video: null,
    user: req.session.user || null,
    currentRoute: 'videos',
    messages: req.flash(),
    layout: false
  });
});

app.get('/admin/videos/:id/edit', ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      req.flash('error', 'Video not found');
      return res.redirect('/admin/videos');
    }
    res.render('admin/edit-video', {
      video,
      user: req.session.user || null,
      currentRoute: 'videos',
      messages: req.flash(),
      layout: false
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
    console.log(`[${new Date().toISOString()}] Video upload attempt:`, {
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
      body: req.body,
      user: req.session.user,
    });
    const { title, description, isFeatured, source, youtubeUrl } = req.body;

    if (source === 'youtube' && !youtubeUrl) {
      req.flash('error', 'Please provide a YouTube URL');
      console.log(`[${new Date().toISOString()}] No YouTube URL provided`);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos/new');
      });
      return;
    }
    if (source === 'upload' && !req.file) {
      req.flash('error', 'Please select a video file');
      console.log(`[${new Date().toISOString()}] No video file uploaded`);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos/new');
      });
      return;
    }

    let videoUrl, b2Key;
    if (source === 'upload') {
      console.log(`[${new Date().toISOString()}] Uploading video to B2:`, { title, description, isFeatured });
      const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'videos');
      console.log(`[${new Date().toISOString()}] B2 video upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
      videoUrl = signedUrl;
      b2Key = key;
    } else {
      videoUrl = youtubeUrl;
    }

    const newVideo = new Video({
      title,
      description,
      videoUrl,
      b2Key: source === 'upload' ? b2Key : undefined,
      source,
      isFeatured: isFeatured === 'on',
      uploadedBy: req.session.user.id,
    });

    await newVideo.save();
    console.log(`[${new Date().toISOString()}] Saved video:`, newVideo.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video uploaded successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
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
    req.flash('error', `Failed to upload video: ${err.message}`);
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos/new');
    });
  }
});

app.put('/admin/videos/:id', ensureAuthenticated, uploadVideo.single('video'), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] Updating video:`, {
      id: req.params.id,
      session: req.sessionID,
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'No file',
      body: req.body,
    });
    const { title, description, isFeatured, source, youtubeUrl } = req.body;
    const updateData = {
      title,
      description,
      isFeatured: isFeatured === 'on',
      source,
      updatedAt: Date.now(),
    };

    if (source === 'youtube' && youtubeUrl) {
      updateData.videoUrl = youtubeUrl;
      updateData.b2Key = undefined;
    } else if (source === 'upload' && req.file) {
      console.log(`[${new Date().toISOString()}] Uploading new video to B2`);
      const { signedUrl, key, totalDuration } = await uploadToB2(req.file, 'videos');
      updateData.videoUrl = signedUrl;
      updateData.b2Key = key;
      console.log(`[${new Date().toISOString()}] B2 video upload successful:`, { signedUrl, key, totalDuration: `${totalDuration}ms` });
    }

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!updatedVideo) {
      req.flash('error', 'Video not found');
      console.log(`[${new Date().toISOString()}] Video not found:`, req.params.id);
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos');
      });
      return;
    }
    console.log(`[${new Date().toISOString()}] Updated video:`, updatedVideo.toObject(), { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video updated successfully');
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
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
    const isAjax = req.headers.accept.includes('application/json') || req.query.ajax === 'true';
    
    const video = await Video.findById(req.params.id);
    if (!video) {
      console.log(`[${new Date().toISOString()}] Video not found:`, req.params.id);
      req.flash('error', 'Video not found');
      if (isAjax) {
        return res.status(404).json({ success: false, message: 'Video not found' });
      }
      req.session.save((err) => {
        if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
        res.redirect('/admin/videos');
      });
      return;
    }

    await Video.findByIdAndDelete(req.params.id);
    console.log(`[${new Date().toISOString()}] Deleted video:`, req.params.id, { duration: `${Date.now() - startTime}ms` });
    req.flash('success', 'Video deleted successfully');
    if (isAjax) {
      return res.status(200).json({ success: true, message: 'Video deleted successfully' });
    }
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos');
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Delete video error:`, {
      message: err.message,
      stack: err.stack,
      duration: `${Date.now() - startTime}ms`,
    });
    req.flash('error', `Failed to delete video: ${err.message}`);
    if (req.headers.accept.includes('application/json') || req.query.ajax === 'true') {
      return res.status(500).json({ success: false, message: `Failed to delete video: ${err.message}` });
    }
    req.session.save((err) => {
      if (err) console.error(`[${new Date().toISOString()}] Session save error:`, err);
      res.redirect('/admin/videos');
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Server error:`, {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).render('error', {
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {},
    user: req.session.user || null,
    currentRoute: req.path || 'home',
    messages: req.flash(),
  });
});

// Start server and initialize admin
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();
    await sessionStore.clear();
    console.log(`[${new Date().toISOString()}] Cleared all sessions from MongoDB store`);
    await initializeAdmin();
    app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to start server:`, {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

startServer();

// Schedule cleanup of expired signed URLs
cron.schedule('0 0 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running cleanup for expired signed URLs`);
  try {
    const photos = await Photo.find();
    const videos = await Video.find();
    const currentTime = Date.now();

    for (const photo of photos) {
      if (photo.imageUrl && photo.imageUrl.includes('X-Amz-Expires')) {
        const url = new URL(photo.imageUrl);
        const expires = parseInt(url.searchParams.get('X-Amz-Expires'), 10);
        const signed = parseInt(url.searchParams.get('X-Amz-Date'), 10);
        if (signed + expires * 1000 < currentTime) {
          console.log(`[${new Date().toISOString()}] Refreshing expired photo URL:`, photo._id);
          const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: process.env.B2_BUCKET_NAME,
            Key: photo.b2Key,
          }), { expiresIn: 604800 });
          await Photo.findByIdAndUpdate(photo._id, { imageUrl: signedUrl });
        }
      }
    }

    for (const video of videos) {
      if (video.videoUrl && video.videoUrl.includes('X-Amz-Expires')) {
        const url = new URL(video.videoUrl);
        const expires = parseInt(url.searchParams.get('X-Amz-Expires'), 10);
        const signed = parseInt(url.searchParams.get('X-Amz-Date'), 10);
        if (signed + expires * 1000 < currentTime) {
          console.log(`[${new Date().toISOString()}] Refreshing expired video URL:`, video._id);
          const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: process.env.B2_BUCKET_NAME,
            Key: video.b2Key,
          }), { expiresIn: 604800 });
          await Video.findByIdAndUpdate(video._id, { videoUrl: signedUrl });
        }
      }
    }
    console.log(`[${new Date().toISOString()}] Cleanup completed`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Cleanup error:`, {
      message: err.message,
      stack: err.stack,
    });
  }
});