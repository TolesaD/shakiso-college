const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    url: { // Cloudinary URL for the image
        type: String,
        required: true
    },
    public_id: { // Cloudinary public ID for deletion
        type: String,
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Photo', photoSchema);