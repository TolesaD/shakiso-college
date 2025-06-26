const express = require('express');
const router = express.Router();

// Admin Dashboard
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    user: req.user
  });
});

module.exports = router;