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

/**
 * Creates a Cashfree order via /pg/orders and returns the order response.
 * The response includes `payment_session_id` which is used by the frontend SDK.
 */
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
    console.log('[CASHFREE] Creating order:', { url, appId: appId ? 'PRESENT' : 'MISSING', appSecret: appSecret ? 'PRESENT' : 'MISSING', apiVersion: '2023-08-01' });

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

/**
 * POST /api/payment/process
 *
 * Creates a Cashfree order and saves a Payment record.
 * Returns the cashfreePaymentSessionId for the frontend SDK to call cashfree.checkout().
 */
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
        // If already in 'created' state, return the existing session so the frontend can retry
        if (existingPayment.status === 'created') {
            return res.status(200).json({
                message: 'Payment session already created',
                paymentSessionId: existingPayment.cashfreePaymentSessionId,
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

    console.log('[PAYMENT] Order created. cashfreePaymentSessionId:', payment.cashfreePaymentSessionId);

    // Return the cashfreePaymentSessionId directly — the frontend SDK uses it with cashfree.checkout()
    return res.status(201).json({
        paymentSessionId: payment.cashfreePaymentSessionId,   // key field for frontend SDK
        cashfreeOrderId: payment.cashfreeOrderId,
        cashfreePaymentSessionId: payment.cashfreePaymentSessionId,
        paymentId: payment.paymentId,
        merchantOrderId: payment.merchantOrderId,
        amount: payment.amount,
        status: payment.status
    });
});

/**
 * POST /api/payment/verify
 *
 * Verifies a payment by checking the Cashfree order status.
 * Idempotent: if the payment is already marked "paid", returns 200 immediately.
 */
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

    // ── BUG FIX #1: Idempotent re-verification ──────────────────────────────
    // If already marked as paid (e.g. by a prior verify call or webhook), return success immediately.
    if (payment.status === 'paid' || payment.status === 'used') {
        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Call Cashfree to check order status before marking payment as paid
    try {
        const cfBase = getCashfreeApiBaseUrl();
        const cfUrl = `${cfBase}/orders/${encodeURIComponent(orderId)}`;
        const { appId: cfAppId, appSecret: cfAppSecret } = getCashfreeCredentials();
        console.log('[CASHFREE] Verifying order status:', { url: cfUrl, appId: cfAppId ? 'PRESENT' : 'MISSING', appSecret: cfAppSecret ? 'PRESENT' : 'MISSING' });

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
                // Already processed via another path — return success (idempotent)
                return res.status(200).json({
                    paymentId: payment.paymentId,
                    paymentSessionId: payment.paymentSessionId,
                    cashfreeOrderId: payment.cashfreeOrderId,
                    status: payment.status
                });
            }

            // ── BUG FIX #2: Use correct status value "paid" (not "paided") ──
            payment.status = 'paid';
            payment.verificationDetails = {
                verifiedAt: new Date(),
                method: 'cashfree_order_check',
                cashfree: cfBody
            };
            await payment.save();

            return res.status(200).json({
                paymentId: payment.paymentId,
                paymentSessionId: payment.paymentSessionId,
                cashfreeOrderId: payment.cashfreeOrderId,
                status: payment.status
            });
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

/**
 * POST /api/payment/webhook
 *
 * Handles Cashfree webhook events.
 *
 * Cashfree signature spec (v2023-08-01):
 *   - Header: x-webhook-signature  (base64 HMAC-SHA256)
 *   - Header: x-webhook-timestamp  (Unix timestamp string)
 *   - Message: `{timestamp}.{rawBody}`
 *   - Secret: CASHFREE_WEBHOOK_SECRET
 *
 * IMPORTANT: server.js must use express.raw() for this route so we receive
 * the unmodified raw body needed for signature verification.
 */
const verifyWebhook = expressAsyncHandler(async (req, res) => {
    // ── BUG FIX #4: Correct webhook signature algorithm ─────────────────────
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || '';

    if (!signature || !timestamp || !secret) {
        console.warn('[WEBHOOK] Missing signature, timestamp, or secret');
        return res.status(403).json({ error: 'Webhook signature verification failed' });
    }

    // req.body is the raw Buffer (express.raw middleware in server.js)
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    // Build the message: timestamp + "." + rawBody
    const signatureMessage = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signatureMessage)
        .digest('base64');

    if (expectedSignature !== signature) {
        console.error('[WEBHOOK] Invalid signature. Expected:', expectedSignature, 'Got:', signature);
        return res.status(403).json({ error: 'Invalid webhook signature' });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Parse body (it may be a raw buffer or already parsed JSON)
    let body;
    try {
        body = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
    } catch (parseErr) {
        console.error('[WEBHOOK] Failed to parse body:', parseErr);
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { event, data } = body;
    console.log('[WEBHOOK] Received event:', event, 'data:', JSON.stringify(data));

    const payment = await Payment.findOne({
        $or: [
            { paymentSessionId: data?.paymentSessionId },
            { cashfreeOrderId: data?.cashfreeOrderId },
            { merchantOrderId: data?.orderId || data?.order?.order_id }
        ]
    });

    if (!payment) {
        console.warn('[WEBHOOK] No matching payment record found for event data:', data);
        // Return 200 to prevent Cashfree from retrying (we just don't process it)
        return res.status(200).json({ success: true, note: 'Payment record not found, acknowledged' });
    }

    payment.webhookEvents = payment.webhookEvents || [];
    payment.webhookEvents.push({ event, data, receivedAt: new Date() });
    payment.webhookStatus = event;

    // ── BUG FIX #2: Use correct status "paid" (not "paided") ────────────────
    if (event === 'PAYMENT_SUCCESS' && payment.status === 'created') {
        payment.status = 'paid';
        payment.verificationDetails = {
            verifiedAt: new Date(),
            method: 'webhook'
        };
    }
    // ─────────────────────────────────────────────────────────────────────────

    await payment.save();
    return res.status(200).json({ success: true });
});

module.exports = {
    processPayment,
    verifyPayment,
    verifyWebhook
};
