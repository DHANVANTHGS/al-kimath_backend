const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'product',
        required: true
    },
    productName: {
        type: String
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    customerName: {
        type: String
    },
    customerAvatar: {
        type: String
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    helpful: {
        type: Number,
        default: 0
    }
}, {timestamps: true});

module.exports = mongoose.model('review', reviewSchema);
