const Payment = require('../models/payment');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');

const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
const generateSessionId = () => `CFS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateCashfreeOrderId = () => `CFORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const getCashfreeApiBaseUrl = () => {
    const env = (process.env.CASHFREE_ENV || 'production').trim().toLowerCase();
    return env === 'test' || env === 'sandbox'
        ? 'https://test.cashfree.com'
        : 'https://api.cashfree.com';
};

const getCashfreeCredentials = () => {
    const appId = process.env.CASHFREE_APP_ID;
    const appSecret = process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_APP_SECRET;
    return { appId, appSecret };
};

const createCashfreeOrder = async ({ orderId, amount, email, phone, customerName, productInfo, customerId }) => {
    const { appId, appSecret } = getCashfreeCredentials();
    const baseUrl = getCashfreeApiBaseUrl();

    if (!appId || !appSecret) {
        throw new Error('Missing Cashfree credentials');
    }

    const returnUrl = `${process.env.FRONTEND_URL || 'https://alhikmath.com'}/order-confirmation?orderId=${encodeURIComponent(orderId)}&session_id={payment_session_id}`;
    const notifyUrl = `${process.env.BACKEND_URL || 'https://al-kimath-backend.onrender.com'}/api/payment/webhook`;

    const payload = {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
            customer_id: customerId || `cust_${Date.now()}`,
            customer_email: email,
            customer_phone: phone,
            customer_name: customerName
        },
        order_meta: {
            return_url: returnUrl,
            notify_url: notifyUrl
        },
        order_note: typeof productInfo === 'string' ? productInfo : JSON.stringify(productInfo)
    };

    const response = await fetch(`${baseUrl}/pg/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': appSecret
        },
        body: JSON.stringify(payload)
    });

    const responseBody = await response.json();
    if (!response.ok) {
        const error = new Error(`Cashfree order creation failed: ${response.status}`);
        error.details = responseBody;
        throw error;
    }

    return responseBody;
};

const createCashfreeCheckoutSession = async ({ orderId, amount, currency, customer_details, payment_session_id }) => {
    const { appId, appSecret } = getCashfreeCredentials();
    const baseUrl = getCashfreeApiBaseUrl();

    if (!appId || !appSecret) {
        throw new Error('Missing Cashfree credentials');
    }

    const payload = {
        payment_session_id,
        order_id: orderId,
        order_amount: amount,
        order_currency: currency,
        customer_details,
        order_meta: {
            return_url: `${process.env.FRONTEND_URL || 'https://alhikmath.com'}/order-confirmation?orderId=${encodeURIComponent(orderId)}&session_id={payment_session_id}`
        }
    };

    const response = await fetch(`${baseUrl}/pg/view/sessions/checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': appSecret
        },
        body: JSON.stringify(payload)
    });

    const responseBody = await response.json();
    if (!response.ok) {
        const error = new Error(`Cashfree checkout session creation failed: ${response.status}`);
        error.details = responseBody;
        throw error;
    }

    return responseBody;
};

const processPayment = expressAsyncHandler(async (req, res) => {
    const { orderId, amount, email, phone, customerName, productInfo, customerId } = req.body;

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
                cashfreePaymentSessionId: existingPayment.cashfreePaymentSessionId,
                paymentId: existingPayment.paymentId,
                status: existingPayment.status
            });
        }

        return res.status(400).json({
            error: 'Payment already exists for this order',
            status: existingPayment.status
        });
    }

    const cashfreeResponse = await createCashfreeOrder({
        orderId,
        amount,
        email,
        phone,
        customerName,
        productInfo,
        customerId
    });

    const payment = await Payment.create({
        paymentId: generateUniqueId('PAY'),
        merchantOrderId: orderId,
        paymentSessionId: generateSessionId(),
        cashfreeOrderId: cashfreeResponse.cf_order_id || cashfreeResponse.order_id || generateCashfreeOrderId(),
        cashfreePaymentSessionId: cashfreeResponse.payment_session_id || null,
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
        cashfreePaymentSessionId: payment.cashfreePaymentSessionId,
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

const createCheckoutSession = expressAsyncHandler(async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId is required'
        });
    }

    const payment = await Payment.findOne({ merchantOrderId: orderId });
    if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
    }

    if (!payment.cashfreePaymentSessionId) {
        return res.status(400).json({
            error: 'Cashfree payment session is not available',
            details: 'Create the payment order first via /api/payment/process'
        });
    }

    const customer_details = {
        customer_id: payment.email || `cust_${Date.now()}`,
        customer_email: payment.email,
        customer_phone: payment.phone,
        customer_name: payment.customerName
    };

    const checkoutResponse = await createCashfreeCheckoutSession({
        orderId: payment.merchantOrderId,
        amount: payment.amount,
        currency: payment.currency,
        customer_details,
        payment_session_id: payment.cashfreePaymentSessionId
    });

    return res.status(200).json({
        checkoutResponse,
        cashfreePaymentSessionId: payment.cashfreePaymentSessionId,
        cashfreeOrderId: payment.cashfreeOrderId
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
    createCheckoutSession,
    verifyPayment,
    verifyWebhook
};
