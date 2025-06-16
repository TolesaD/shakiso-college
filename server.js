const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid'); // For unique IDs

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors()); // Enable CORS for development
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Data File Paths ---
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'data', 'announcements.json');
const MEDIA_FILE = path.join(__dirname, 'data', 'media.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure data and uploads directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// --- Multer Storage Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});
const upload = multer({ storage: storage });

// --- Helper Functions to Read/Write JSON ---
const readJsonFile = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return [];
    }
};

const writeJsonFile = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error.message);
    }
};

// --- Admin Authentication (Simple in-memory flag for demonstration) ---
let isAdminLoggedIn = false; // This is a very basic, non-persistent flag.
                             // In a real app, use sessions/JWTs.
const ADMIN_USERNAME = 'shakiso';
const ADMIN_PASSWORD = 'shakiso';

// Middleware to protect admin routes
const authenticateAdmin = (req, res, next) => {
    // For a real app, you'd check a session token or JWT from req.headers or cookies
    if (isAdminLoggedIn) { // This will only work if the server is not restarted often
                           // and on the same session. For a truly persistent admin state
                           // with JSON, you'd need to store a simple token in a file
                           // or use client-side local storage with a simple token validation.
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized: Admin login required.' });
    }
};

// --- API Endpoints ---

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        isAdminLoggedIn = true; // Set flag
        res.json({ success: true, message: 'Login successful!', token: 'shakiso_admin_token' }); // Provide a simple token
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
});

// Admin Logout (Optional, but good practice)
app.post('/api/admin/logout', (req, res) => {
    isAdminLoggedIn = false;
    res.json({ success: true, message: 'Logged out successfully.' });
});

// Check Admin Status (Frontend can use this to determine if admin panel should be shown)
app.get('/api/admin/status', (req, res) => {
    res.json({ loggedIn: isAdminLoggedIn });
});

// --- Announcements API ---
// Get all announcements (Public & Admin)
app.get('/api/announcements', (req, res) => {
    const announcements = readJsonFile(ANNOUNCEMENTS_FILE);
    res.json(announcements.sort((a, b) => new Date(b.date) - new Date(a.date))); // Sort by date desc
});

// Add new announcement (Admin only)
app.post('/api/announcements', authenticateAdmin, (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }
    const announcements = readJsonFile(ANNOUNCEMENTS_FILE);
    const newAnnouncement = {
        id: uuidv4(),
        title,
        content,
        date: new Date().toISOString()
    };
    announcements.push(newAnnouncement);
    writeJsonFile(ANNOUNCEMENTS_FILE, announcements);
    res.status(201).json(newAnnouncement);
});

// Update announcement (Admin only)
app.put('/api/announcements/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    let announcements = readJsonFile(ANNOUNCEMENTS_FILE);
    const index = announcements.findIndex(a => a.id === id);

    if (index === -1) {
        return res.status(404).json({ message: 'Announcement not found.' });
    }

    announcements[index] = {
        ...announcements[index],
        title: title || announcements[index].title,
        content: content || announcements[index].content
    };
    writeJsonFile(ANNOUNCEMENTS_FILE, announcements);
    res.json(announcements[index]);
});

// Delete announcement (Admin only)
app.delete('/api/announcements/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    let announcements = readJsonFile(ANNOUNCEMENTS_FILE);
    const initialLength = announcements.length;
    announcements = announcements.filter(a => a.id !== id);

    if (announcements.length === initialLength) {
        return res.status(404).json({ message: 'Announcement not found.' });
    }
    writeJsonFile(ANNOUNCEMENTS_FILE, announcements);
    res.status(204).send(); // No content
});

// --- Media (Photos/Videos) API ---
// Get all media (Public & Admin)
app.get('/api/media', (req, res) => {
    const media = readJsonFile(MEDIA_FILE);
    res.json(media.sort((a, b) => new Date(b.date) - new Date(a.date))); // Sort by date desc
});

// Add new media (Admin only)
app.post('/api/media', authenticateAdmin, upload.single('mediaFile'), (req, res) => {
    const { title, description, type } = req.body; // type should be 'image' or 'video'
    if (!req.file || !title || !type) {
        return res.status(400).json({ message: 'Title, type, and media file are required.' });
    }

    const media = readJsonFile(MEDIA_FILE);
    const newMedia = {
        id: uuidv4(),
        title,
        description: description || '',
        type,
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`, // URL to access the file
        date: new Date().toISOString()
    };
    media.push(newMedia);
    writeJsonFile(MEDIA_FILE, media);
    res.status(201).json(newMedia);
});

// Update media (Admin only) - Note: This only updates metadata, not the file itself.
app.put('/api/media/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    let media = readJsonFile(MEDIA_FILE);
    const index = media.findIndex(m => m.id === id);

    if (index === -1) {
        return res.status(404).json({ message: 'Media not found.' });
    }

    media[index] = {
        ...media[index],
        title: title || media[index].title,
        description: description || media[index].description
    };
    writeJsonFile(MEDIA_FILE, media);
    res.json(media[index]);
});

// Delete media (Admin only)
app.delete('/api/media/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    let media = readJsonFile(MEDIA_FILE);
    const mediaToDelete = media.find(m => m.id === id);

    if (!mediaToDelete) {
        return res.status(404).json({ message: 'Media not found.' });
    }

    // Delete the actual file from the uploads directory
    const filePath = path.join(UPLOADS_DIR, mediaToDelete.filename);
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Error deleting file ${filePath}:`, err);
            // Even if file deletion fails, proceed with JSON update for data consistency
        }
        media = media.filter(m => m.id !== id);
        writeJsonFile(MEDIA_FILE, media);
        res.status(204).send(); // No content
    });
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Admin panel: http://localhost:3000/admin.html');
});