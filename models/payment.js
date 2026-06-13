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
    cashfreePaymentSessionId: {
        type: String,
        unique: true,
        sparse: true
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
    // Full order payload stored at processPayment time.
    // Used by verifyPayment / verifyWebhook to create the Order after payment confirms.
    orderData: {
        customerId: { type: String, default: null },
        customerEmail: { type: String },
        products: { type: mongoose.Schema.Types.Mixed },
        shippingAddress: { type: String },
        paymentMethod: { type: String, default: 'card' }
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'used', 'failed'],
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
