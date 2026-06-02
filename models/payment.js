const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    paymentId: {
        type: String,
        required: true,
        unique: true
    },
    merchantOrderId: {
        type: String,
        required: true
    },
    paymentSessionId: {
        type: String,
        required: true,
        unique: true
    },
    cashfreeOrderId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    productInfo: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    status: {
        type: String,
        enum: ['created', 'paided', 'used'],
        default: 'created'
    },
    verificationDetails: {
        type: mongoose.Schema.Types.Mixed
    },
    webhookStatus: {
        type: String
    },
    webhookEvents: [
        {
            event: String,
            data: mongoose.Schema.Types.Mixed,
            receivedAt: Date
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('payment', paymentSchema);
