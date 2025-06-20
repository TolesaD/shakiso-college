require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const User = require('./models/User'); // Import User model

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected successfully!');
        // Create default admin user if not exists
        createDefaultAdmin();
    })
    .catch(err => console.error('MongoDB connection error:', err));

// Function to create a default admin user
async function createDefaultAdmin() {
    try {
        const existingAdmin = await User.findOne({ username: process.env.ADMIN_USERNAME });
        if (!existingAdmin) {
            const newAdmin = new User({
                username: process.env.ADMIN_USERNAME,
                password: process.env.ADMIN_PASSWORD, // Password will be hashed by pre-save hook
                role: 'admin'
            });
            await newAdmin.save();
            console.log(`Default admin user '${process.env.ADMIN_USERNAME}' created.`);
            console.warn('NOTE: Please change the default admin password immediately after first login!');
        }
    } catch (err) {
        console.error('Error creating default admin user:', err);
    }
}

// Middleware
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies (for form data)
app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' directory

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Flash messages middleware
app.use(flash());

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables for templates (e.g., flash messages)
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    res.locals.isAuthenticated = req.session.userId ? true : false;
    next();
});

// Import Routes
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Use Routes
app.use('/', publicRoutes); // Public facing routes
app.use('/admin', adminRoutes); // Admin routes (protected)

// Handle 404 - Not Found
app.use((req, res, next) => {
    res.status(404).render('404', { title: 'Page Not Found' }); // Create a 404.ejs later
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});