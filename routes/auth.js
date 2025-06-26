const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const { forwardAuthenticated } = require('../middlewares/auth');

// Login Page
router.get('/login', forwardAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

// Login Handle
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/admin/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// Logout Handle
router.get('/logout', (req, res) => {
  req.logout();
  req.flash('success_msg', 'You are logged out');
  res.redirect('/login');
});

// Create Admin User (Run once)
router.get('/setup-admin', async (req, res) => {
  try {
    const adminExists = await User.findOne({ username: 'admin' });
    if (adminExists) return res.send('Admin user already exists');
   
    const admin = new User({
      username: 'admin',
      role: 'admin'
    });
   
    await User.register(admin, 'admin123');
    res.send('Admin created. Username: admin, Password: admin123');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating admin user');
  }
});

module.exports = router;