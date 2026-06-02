const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String
    },
    icon: {
        type: String,
        default: 'Package'
    },
    color: {
        type: String,
        default: '#9EFF00'
    },
    productCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {timestamps: true});

module.exports = mongoose.model('category', categorySchema);
