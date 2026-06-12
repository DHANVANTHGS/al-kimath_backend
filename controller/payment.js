const Payment = require('../models/payment');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');

const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
const generateSessionId = () => `CFS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateCashfreeOrderId = () => `CFORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const processPayment = expressAsyncHandler(async (req, res) => {
    const { orderId, amount, email, phone, customerName, productInfo } = req.body;

    if (!orderId || !amount || !email || !phone || !customerName || !productInfo) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId, amount, email, phone, customerName, and productInfo are required'
        });
    }

    const existingPayment = await Payment.findOne({ merchantOrderId: orderId });
    if (existingPayment) {
        if (existingPayment.status === 'created') {
            return res.status(200).json({
                message: 'Payment session already created',
                paymentSessionId: existingPayment.paymentSessionId,
                cashfreeOrderId: existingPayment.cashfreeOrderId,
                paymentId: existingPayment.paymentId,
                status: existingPayment.status
            });
        }

        return res.status(400).json({
            error: 'Payment already exists for this order',
            status: existingPayment.status
        });
    }

    const payment = await Payment.create({
        paymentId: generateUniqueId('PAY'),
        merchantOrderId: orderId,
        paymentSessionId: generateSessionId(),
        cashfreeOrderId: generateCashfreeOrderId(),
        amount,
        email,
        phone,
        customerName,
        productInfo,
        status: 'created'
    });

    return res.status(201).json({
        paymentSessionId: payment.paymentSessionId,
        cashfreeOrderId: payment.cashfreeOrderId,
        paymentId: payment.paymentId,
        merchantOrderId: payment.merchantOrderId,
        amount: payment.amount,
        status: payment.status
    });
});

const verifyPayment = expressAsyncHandler(async (req, res) => {
    const { orderId, paymentSessionId } = req.body;

    if (!orderId) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId is required'
        });
    }

    const isPlaceholderSessionId = (sessionId) => {
        return typeof sessionId === 'string' && /^(?:\{?payment[_-]?session[_-]?id\}?|\{paymentSessionId\})$/i.test(sessionId.trim());
    };

    let payment = null;
    const placeholderSessionId = isPlaceholderSessionId(paymentSessionId);

    if (paymentSessionId && !placeholderSessionId) {
        payment = await Payment.findOne({ merchantOrderId: orderId, paymentSessionId });
    }

    if (!payment) {
        payment = await Payment.findOne({ merchantOrderId: orderId });
    }

    if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
    }

    if (paymentSessionId && !placeholderSessionId && payment.paymentSessionId !== paymentSessionId) {
        return res.status(400).json({
            error: 'Payment session mismatch',
            details: 'Provided paymentSessionId does not match the stored session for this order'
        });
    }

    if (payment.status !== 'created') {
        return res.status(400).json({
            error: 'Payment session cannot be verified',
            status: payment.status
        });
    }

    payment.status = 'paided';
    payment.verificationDetails = {
        verifiedAt: new Date(),
        method: 'api_verify'
    };

    await payment.save();

    return res.status(200).json({
        paymentId: payment.paymentId,
        paymentSessionId: payment.paymentSessionId,
        cashfreeOrderId: payment.cashfreeOrderId,
        status: payment.status
    });
});

const verifyWebhook = expressAsyncHandler(async (req, res) => {
    const signature = req.headers['x-cashfree-signature'] || req.headers['x-signature'];
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || '';

    if (!signature || !secret) {
        return res.status(403).json({ error: 'Webhook signature verification failed' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (expectedSignature !== signature) {
        return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    const { event, data } = req.body;
    const payment = await Payment.findOne({
        $or: [
            { paymentSessionId: data.paymentSessionId },
            { cashfreeOrderId: data.cashfreeOrderId },
            { merchantOrderId: data.orderId }
        ]
    });

    if (!payment) {
        return res.status(404).json({ error: 'Payment record not found for webhook' });
    }

    payment.webhookEvents = payment.webhookEvents || [];
    payment.webhookEvents.push({ event, data, receivedAt: new Date() });
    payment.webhookStatus = event;

    if (event === 'PAYMENT_SUCCESS' && payment.status === 'created') {
        payment.status = 'paided';
        payment.verificationDetails = {
            verifiedAt: new Date(),
            method: 'webhook'
        };
    }

    await payment.save();

    return res.status(200).json({ success: true });
});

module.exports = {
    processPayment,
    verifyPayment,
    verifyWebhook
};
