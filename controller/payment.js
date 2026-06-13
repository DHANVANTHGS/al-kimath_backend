const Payment = require('../models/payment');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');

const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
const generateSessionId = () => `CFS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateCashfreeOrderId = () => `CFORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const getCashfreeApiBaseUrl = () => {
    const env = (process.env.CASHFREE_ENV || 'production').trim().toLowerCase();
    // base URL now includes the /pg segment to simplify endpoint composition
    if (env === 'test' || env === 'sandbox') {
        return 'https://sandbox.cashfree.com/pg';
    }
    return 'https://api.cashfree.com/pg';
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

    const frontendUrl = (process.env.FRONTEND_URL || 'https://alhikmath.com').replace(/\/$/, '');
    const backendUrl = (process.env.BACKEND_URL || 'https://al-kimath-backend.onrender.com').replace(/\/$/, '');

    // Enforce HTTPS for production environment
    if (((process.env.CASHFREE_ENV || 'production').trim().toLowerCase() === 'production') && !/^https:\/\//i.test(frontendUrl)) {
        console.error('[CASHFREE] FRONTEND_URL must be HTTPS in production:', frontendUrl);
        throw new Error('Invalid FRONTEND_URL for production');
    }

    const returnUrl = `${frontendUrl}/order-confirmation?orderId={order_id}&session_id={payment_session_id}`;
    const notifyUrl = `${backendUrl}/api/payment/webhook`;

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

    const url = `${baseUrl}/orders`;
    console.log({ url, appId: appId ? 'PRESENT' : 'MISSING', appSecret: appSecret ? 'PRESENT' : 'MISSING', apiVersion: '2023-08-01' });
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': appSecret,
            'x-api-version': '2023-08-01'
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

    const url = `${baseUrl}/view/sessions/checkout`;
    console.log({ url, appId: appId ? 'PRESENT' : 'MISSING', appSecret: appSecret ? 'PRESENT' : 'MISSING', apiVersion: '2023-08-01' });
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': appSecret,
            'x-api-version': '2023-08-01'
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

    // Call Cashfree to check order status before marking payment as paid
    try {
        const cfBase = getCashfreeApiBaseUrl();
        const cfUrl = `${cfBase}/orders/${encodeURIComponent(orderId)}`;
        const { appId: cfAppId, appSecret: cfAppSecret } = getCashfreeCredentials();
        console.log({ url: cfUrl, appId: cfAppId ? 'PRESENT' : 'MISSING', appSecret: cfAppSecret ? 'PRESENT' : 'MISSING', apiVersion: '2023-08-01' });
        const cfResp = await fetch(cfUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': cfAppId,
                'x-client-secret': cfAppSecret,
                'x-api-version': '2023-08-01'
            }
        });

        const cfBody = await cfResp.json();
        if (!cfResp.ok) {
            return res.status(502).json({ error: 'Failed to verify order with Cashfree', details: cfBody });
        }

        const cfStatus = cfBody.order_status || cfBody.orderStatus || cfBody.status;
        if (cfStatus === 'PAID' || cfStatus === 'paid') {
            if (payment.status !== 'created') {
                return res.status(400).json({ error: 'Payment session cannot be verified', status: payment.status });
            }

            payment.status = 'paided';
            payment.verificationDetails = {
                verifiedAt: new Date(),
                method: 'cashfree_order_check',
                cashfree: cfBody
            };
            await payment.save();
            return res.status(200).json({ paymentId: payment.paymentId, paymentSessionId: payment.paymentSessionId, cashfreeOrderId: payment.cashfreeOrderId, status: payment.status });
        }

        // Map other statuses to clear errors
        if (cfStatus === 'ACTIVE') {
            return res.status(400).json({ error: 'ORDER_ACTIVE', status: cfStatus, details: 'Order is created but not paid yet' });
        }
        if (cfStatus === 'EXPIRED') {
            return res.status(400).json({ error: 'ORDER_EXPIRED', status: cfStatus });
        }
        if (cfStatus === 'FAILED') {
            return res.status(400).json({ error: 'ORDER_FAILED', status: cfStatus });
        }

        return res.status(400).json({ error: 'ORDER_NOT_PAID', status: cfStatus });
    } catch (err) {
        console.error('[PAYMENT] Error while verifying with Cashfree:', err);
        return res.status(500).json({ error: 'Internal verification error', details: err.message });
    }
});

const createCheckoutSession = expressAsyncHandler(async (req, res) => {
    const { orderId } = req.body;

    console.log('[PAYMENT] createCheckoutSession called', { orderId });

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

    console.log('[PAYMENT] checkout payload', {
        payment_session_id: payment.cashfreePaymentSessionId,
        orderId: payment.merchantOrderId,
        amount: payment.amount,
        currency: payment.currency
    });

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
