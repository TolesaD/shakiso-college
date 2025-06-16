const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid'); // For unique IDs
require('dotenv').config(); //Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable or default to 3000

// ... (rest of your middleware and file handling code remains the same) ...

// --- Admin Authentication (Using environment variable) ---
const ADMIN_USERNAME = 'shakiso';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // Get password from environment variable

// Middleware to protect admin routes
const authenticateAdmin = (req, res, next) => {
    // In a production app, replace this with robust session/JWT handling. For now, it is ok.
    const { token } = req.headers;
    if (token === process.env.ADMIN_TOKEN) { //Validate simple token
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
        //Instead of setting a flag, generate a simple token for security.
        const token = uuidv4(); //Generate unique token
        res.json({ success: true, message: 'Login successful!', token }); 
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
});

// Admin Logout
app.post('/api/admin/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully.' }); //No need to change anything in backend
});

// Check Admin Status (Frontend can use this to determine if admin panel should be shown)
app.get('/api/admin/status', authenticateAdmin, (req, res) => { //Protected route
    res.json({ loggedIn: true });
});

// ... (rest of your API endpoints, protected with authenticateAdmin where needed) ...

// Start the server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});