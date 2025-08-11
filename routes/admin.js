const express = require('express');
const router = express.Router();

// Admin Dashboard (if needed, but likely redundant since handled in server.js)
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    user: req.session.user, // Use req.session.user, not req.user
    currentRoute: 'dashboard',
    messages: req.flash(),
  });
});

module.exports = router;