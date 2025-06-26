const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    content: {
        type: String,
        required: [true, 'Content is required'],
        trim: true
    },
    media: {
        title: {
            type: String,
            trim: true,
            maxlength: [100, 'Media title cannot exceed 100 characters']
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters']
        },
        url: {
            type: String,
            trim: true,
            validate: {
                validator: function(v) {
                    if (!v) return true; // Optional field
                    return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
                },
                message: function(props) {
                    return props.value + ' is not a valid URL!';
                }
            }
        },
        type: {
            type: String,
            enum: {
                values: ['image', 'video', null],
                message: 'Media type must be either image or video'
            },
            default: null
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
AnnouncementSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Automatically determine media type based on URL
AnnouncementSchema.pre('save', function(next) {
    if (this.media && this.media.url) {
        if (this.media.url.includes('youtube.com') || this.media.url.includes('vimeo.com')) {
            this.media.type = 'video';
        } else if (this.media.url.match(/\.(jpeg|jpg|gif|png)$/i)) {
            this.media.type = 'image';
        }
    }
    next();
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);