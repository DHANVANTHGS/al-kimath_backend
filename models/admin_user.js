const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'Super Admin'],
        default: 'Admin'
    },
    phone: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    permissions: [
        {
            type: String,
            enum: [
                'manage_products',
                'manage_orders',
                'manage_customers',
                'manage_categories',
                'manage_reviews',
                'manage_settings',
                'view_dashboard',
                'manage_admins'
            ]
        }
    ],
    lastLogin: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    }
}, {timestamps: true});

module.exports = mongoose.model('admin_user', adminUserSchema);
