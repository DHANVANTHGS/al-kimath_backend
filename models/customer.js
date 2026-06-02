const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: true
    },
    avatar: {
        type: String
    },
    address: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    ordersCount: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    lastOrderAt: {
        type: Date
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, {timestamps: true});

module.exports = mongoose.model('customer', customerSchema);
