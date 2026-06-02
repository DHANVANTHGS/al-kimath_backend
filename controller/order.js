const Order = require('../models/order');
const Payment = require('../models/payment');
const expressAsyncHandler = require('express-async-handler');

const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const createOrder = expressAsyncHandler(async (req, res) => {
    const {
        orderId,
        customerId,
        customerName,
        customerEmail,
        products,
        total,
        paymentMethod,
        shippingAddress,
        paymentSessionId
    } = req.body;

    if (!customerName || !customerEmail || !products || !total || !shippingAddress) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'customerName, customerEmail, products, total, and shippingAddress are required'
        });
    }

    let payment = null;
    if (paymentSessionId) {
        payment = await Payment.findOne({ paymentSessionId });

        if (!payment) {
            return res.status(404).json({ error: 'Payment session not found' });
        }

        if (payment.status !== 'paided') {
            return res.status(400).json({
                error: 'Payment session is not eligible for order placement',
                status: payment.status
            });
        }

        payment.status = 'used';
        await payment.save();
    }

    const createdOrder = await Order.create({
        id: orderId || generateOrderId(),
        customerId: customerId || req.user?.id,
        customerName,
        customerEmail,
        products,
        total,
        paymentId: payment?.paymentId,
        paymentSessionId: paymentSessionId || undefined,
        status: 'pending',
        paymentMethod: paymentMethod || 'card',
        shippingAddress
    });

    return res.status(201).json(createdOrder);
});

const getOrders = expressAsyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (req.user) {
        filter.customerId = req.user.id;
    }

    const orders = await Order.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 });

    const total = await Order.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({ orders, total, pages, currentPage: pageNum });
});

const getOrder = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await Order.findOne({ id });

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user && order.customerId && order.customerId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    res.status(200).json(order);
});

module.exports = {
    createOrder,
    getOrders,
    getOrder
};
