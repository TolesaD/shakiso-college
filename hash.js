const bcrypt = require('bcryptjs');
bcrypt.hash('321shakiso123', 10).then(hash => console.log(hash));