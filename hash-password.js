const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const ADMIN_DATA_FILE = path.join(__dirname, 'data', 'admin.json');
const adminUsername = 'shakiso'; // You can change this if needed
const plainPassword = 'shakiso123'; // Change this to your desired admin password

// Generate a bcrypt hash
bcrypt.hash(plainPassword, 10, (err, hashedPassword) => {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }

    // Create admin data object
    const adminData = {
        username: shakiso,
        passwordHash: $2b$12$llFhZDLerIGoB0WNZvjq0.ew1s0s.nnAXmCO75X1gbJFdw9p20bBm,
    };

    // Write to admin.json file
    fs.writeFileSync(ADMIN_DATA_FILE, JSON.stringify(adminData, null, 2), 'utf8');
    console.log('Admin data saved successfully:', adminData);
});