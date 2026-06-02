const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    storeName: {
        type: String,
        default: 'AL HIKMATH ENTERPRISES PVT LTD'
    },
    storeAddress: {
        type: String,
        default: 'No.16/127, Inbharajapuram 1st Street, Bajanai Kovil Street, Choolaimedu - 600094'
    },
    phone1: {
        type: String,
        default: '+91 9342698344'
    },
    phone2: {
        type: String,
        default: '+91 9342798344'
    },
    email: {
        type: String,
        default: 'contact@alhikmath.com'
    },
    taxId: {
        type: String,
        default: 'GSTIN29AAAAA1111A1Z1'
    },
    logo: {
        type: String
    },
    favicon: {
        type: String
    },
    theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'dark'
    },
    currency: {
        type: String,
        default: 'INR'
    },
    shippingCost: {
        type: Number,
        default: 0
    },
    taxRate: {
        type: Number,
        default: 0
    }
}, {timestamps: true});

module.exports = mongoose.model('settings', settingsSchema);
