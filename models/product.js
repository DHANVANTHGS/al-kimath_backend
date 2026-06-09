const mongoose = require('mongoose');

const product = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,   
        required: true
    },
    stock: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    originalPrice: {
        type: Number
    },
    brand: {
        type: String
    },
    tags: [
        {
            type: String
        }
    ],
    specifications: {
        type: Object,
        default: {}
    },
    image: {
        type: Buffer
    },
    images: [
        {
            id: {
                type: String
            },
            data: {
                type: Buffer
            },
            contentType: {
                type: String
            }
        }
    ],
    badge: {
        type: String
    },
    featured: {
        type: Boolean,
        default: false
    },
    latest: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    reviews: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            },
            rating: {
                type: Number,
                required: true
            },
            comment: {
                type: String,
                required: true
            }
        }
    ]
}, {timestamps: true});

module.exports = mongoose.model('product', product);