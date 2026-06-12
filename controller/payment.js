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

    const isPlaceholderSessionId = typeof paymentSessionId === 'string' && paymentSessionId.trim().toLowerCase() === '{payment_session_id}';
    const query = isPlaceholderSessionId || !paymentSessionId
        ? { merchantOrderId: orderId }
        : { merchantOrderId: orderId, paymentSessionId };

    const payment = await Payment.findOne(query);
    if (!payment) {
        return res.status(404).json({
            error: 'Payment record not found',
            details: 'Check the orderId and paymentSessionId; the placeholder {payment_session_id} must be replaced with the real session id before verify.'
        });
    }

    if (payment.status === 'paided') {
        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status
        });
    }

    if (payment.status !== 'created') {
        return res.status(400).json({
            error: 'Payment session cannot be verified',
            status: payment.status
        });
    }

    if (isPlaceholderSessionId || !paymentSessionId) {
        return res.status(400).json({
            error: 'Payment session pending verification',
            details: 'A real paymentSessionId is required for API verification. If you are using Cashfree return_url, wait for the redirect to include the actual session id value.'
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
