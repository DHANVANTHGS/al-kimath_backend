const mongoose = require('mongoose');
const { ref } = require('node:process');

const user = new mongoose.Schema({
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
        type : String , 
        required : true,
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    mycart: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'product'
            },
            quantity: {
                type: Number,
                default: 1
            }
        }
    ],
    myorders: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref : 'order'
        }
    ] ,
    mywishlist: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'product'
            }
        }
    ]     
}, {timestamps: true});

module.exports = mongoose.model('user', user);