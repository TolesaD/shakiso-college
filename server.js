const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt'); // Import bcrypt
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Data File Paths ---
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'data', 'announcements.json');
const MEDIA_FILE = path.join(__dirname, 'data', 'media.json');
const ADMIN_DATA_FILE = path.join(__dirname, 'data', 'admin.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist (with error handling)
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });


// --- Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});
const upload = multer({ storage: storage });

// --- JSON Helper Functions ---
const readJsonFile = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) { return []; }
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


// --- Admin Authentication (with bcrypt) ---
const authenticateAdmin = async (req, res, next) => {
    try {
        const adminData = readJsonFile(ADMIN_DATA_FILE);
        //If adminData is an empty array or null, it will return the error message
        if (!adminData || Object.keys(adminData).length === 0) {
            return res.status(500).json({ message: "Admin data not found!" });
        }

        const { username, password } = req.body;
       
        //Since it's not an array, you can directly compare usernames
        if (adminData.username !== username) {
            return res.status(401).json({ message: 'Invalid username' });
        }

        const passwordMatch = await bcrypt.compare(password, adminData.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        next();
    } catch (error) {
        console.error("Authentication error:", error);
        return res.status(500).json({ message: 'Authentication failed' });
    }
};

// --- API Endpoints ---

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        await authenticateAdmin(req, res, () => {
            const token = uuidv4();
            res.json({ success: true, message: 'Login successful!', token });
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});


// Admin Routes (Protected) --- Add your admin routes here (protected by authenticateAdmin middleware)
app.post('/api/admin/announcements', upload.single('announcementImage'), authenticateAdmin, async (req, res) => {
    try {
        let announcements = readJsonFile(ANNOUNCEMENTS_FILE);
        const newAnnouncement = {
            id: uuidv4(),
            title: req.body.title,
            content: req.body.content,
            image: req.file ? req.file.filename : null, // Handle cases where no image is uploaded
            date: new Date().toISOString()
        };
        announcements.push(newAnnouncement);
        writeJsonFile(ANNOUNCEMENTS_FILE, announcements);
        res.json({ message: 'Announcement posted successfully!', announcement: newAnnouncement });
    } catch (error) {
        console.error('Error posting announcement:', error);
        res.status(500).json({ message: 'Error posting announcement' });
    }
});


app.post('/api/admin/media', upload.single('mediaFile'), authenticateAdmin, async (req, res) => {
    try {
        let media = readJsonFile(MEDIA_FILE);
        const newMedia = {
            id: uuidv4(),
            title: req.body.title,
            file: req.file.filename,
            date: new Date().toISOString()
        };
        media.push(newMedia);
        writeJsonFile(MEDIA_FILE, media);
        res.json({ message: 'Media uploaded successfully!', media: newMedia });
    } catch (error) {
        console.error('Error uploading media:', error);
        res.status(500).json({ message: 'Error uploading media' });
    }
});


app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});