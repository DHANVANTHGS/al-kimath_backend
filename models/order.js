const mongoose = require('mongoose');

const order = new mongoose.Schema({
    id: {
        type: String,
        unique: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    customerName: {
        type: String,
        required: true
    },
    customerEmail: {
        type: String,
        required: true
    },
    products: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'product',
                required: true
            },
            productName: {
                type: String
            },
            quantity: {
                type: Number,
                required: true
            },
            price: {
                type: Number,
                required: true
            }
        }
    ],
    total: {
        type: Number,
        required: true
    },
    paymentId: {
        type: String
    },
    paymentSessionId: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['upi', 'card', 'cod', 'netbanking', 'wallet'],
        required: true
    },
    shippingAddress: {
        type: String,
        required: true
    }
}, {timestamps: true});

module.exports = mongoose.model('order', order);