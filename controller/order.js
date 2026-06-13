const Order = require('../models/order');
const Payment = require('../models/payment');
const { deductStock } = require('../utils/stockManager');
const expressAsyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

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

    console.log('[ORDER] createOrder called by', req.user?.id, 'payload:', JSON.stringify({
        orderId, customerId, customerName, customerEmail,
        productsCount: Array.isArray(products) ? products.length : 0,
        total, paymentMethod, paymentSessionId
    }));

    if (!customerName || !customerEmail || !products || !total || !shippingAddress) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'customerName, customerEmail, products, total, and shippingAddress are required'
        });
    }

    // ── FIX C: Idempotency — return existing order if same orderId submitted twice ──
    if (orderId) {
        const existing = await Order.findOne({ id: orderId });
        if (existing) {
            console.warn('[ORDER] Duplicate createOrder call for orderId:', orderId, '— returning existing');
            return res.status(200).json(existing);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    let payment = null;
    if (paymentSessionId) {
        payment = await Payment.findOne({ paymentSessionId });

        if (!payment) {
            return res.status(404).json({ error: 'Payment session not found' });
        }

        // ── FIX A: Corrected typo "paided" → "paid" ─────────────────────────
        if (payment.status !== 'paid') {
            return res.status(400).json({
                error: 'Payment session is not eligible for order placement',
                status: payment.status
            });
        }
        // ─────────────────────────────────────────────────────────────────────

        payment.status = 'used';
        await payment.save();
    }

    const validProducts = [];
    if (Array.isArray(products)) {
        for (const p of products) {
            if (mongoose.Types.ObjectId.isValid(p.productId)) {
                validProducts.push(p);
            } else {
                console.warn(`[ORDER] Skipping invalid productId: ${p.productId}`);
            }
        }
    }

    if (validProducts.length === 0) {
        console.error('[ORDER] No valid products found in request. Raw products:', JSON.stringify(products));
        return res.status(400).json({
            error: 'No valid products in order',
            details: 'All productId values must be valid MongoDB ObjectIds.'
        });
    }

    const createdOrder = await Order.create({
        id: orderId || generateOrderId(),
        customerId: mongoose.Types.ObjectId.isValid(customerId)
            ? new mongoose.Types.ObjectId(customerId)
            : (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
                ? new mongoose.Types.ObjectId(req.user.id)
                : undefined),
        customerName,
        customerEmail,
        products: validProducts,
        total,
        paymentId: payment?.paymentId,
        paymentSessionId: paymentSessionId || undefined,
        // ── FIX B: Auto-confirm COD; online orders stay "pending" until verifyPayment ──
        status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
        // ─────────────────────────────────────────────────────────────────────
        paymentMethod: paymentMethod || 'card',
        shippingAddress
    });

    // COD orders are confirmed immediately — deduct stock right away.
    // Online payment orders stay "pending" and stock is deducted in verifyPayment/webhook.
    if (paymentMethod === 'cod') {
        await deductStock(validProducts);
    }

    return res.status(201).json(createdOrder);
});

const getOrders = expressAsyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (req.user) {
        // ── FIX D: Cast customerId to ObjectId for correct MongoDB comparison ──
        filter.customerId = mongoose.Types.ObjectId.isValid(req.user.id)
            ? new mongoose.Types.ObjectId(req.user.id)
            : req.user.id;
        // ─────────────────────────────────────────────────────────────────────
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
