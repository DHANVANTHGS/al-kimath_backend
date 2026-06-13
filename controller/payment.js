const Payment = require('../models/payment');
const Order = require('../models/order');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');
const mongoose = require('mongoose');

const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
const generateSessionId = () => `CFS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateCashfreeOrderId = () => `CFORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const getCashfreeApiBaseUrl = () => {
    const env = (process.env.CASHFREE_ENV || 'production').trim().toLowerCase();
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
    console.log('[CASHFREE] Creating order:', { url, orderId, amount });

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
 * Helper: create an Order document from a Payment record's stored orderData.
 * Idempotent — checks for existing Order before creating.
 * Returns the existing or newly created Order (or null on failure).
 */
const createOrderFromPayment = async (payment) => {
    // Idempotency: return existing Order if already created
    const existing = await Order.findOne({ id: payment.merchantOrderId });
    if (existing) {
        // If the order was pre-created as "pending" (legacy path), confirm it now
        if (existing.status === 'pending') {
            existing.status = 'confirmed';
            existing.paymentId = payment.paymentId;
            await existing.save();
            console.log('[PAYMENT] Existing pending order confirmed:', existing.id);
        }
        return existing;
    }

    if (!payment.orderData || !payment.orderData.products) {
        console.error('[PAYMENT] No orderData on payment record:', payment.paymentId);
        return null;
    }

    const { customerId, customerEmail, products, shippingAddress, paymentMethod } = payment.orderData;

    // Filter to valid MongoDB ObjectId product IDs
    const validProducts = Array.isArray(products)
        ? products.filter(p => mongoose.Types.ObjectId.isValid(p.productId))
        : [];

    if (validProducts.length === 0) {
        console.error('[PAYMENT] No valid product IDs in orderData for payment:', payment.paymentId);
        return null;
    }

    const order = await Order.create({
        id: payment.merchantOrderId,
        customerId: mongoose.Types.ObjectId.isValid(customerId)
            ? new mongoose.Types.ObjectId(customerId)
            : undefined,
        customerName: payment.customerName,
        customerEmail,
        products: validProducts,
        total: payment.amount,
        paymentId: payment.paymentId,
        paymentSessionId: payment.paymentSessionId,
        status: 'confirmed',
        paymentMethod: paymentMethod || 'card',
        shippingAddress
    });

    console.log('[PAYMENT] Order created after payment confirmation:', order.id);
    return order;
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payment/process
 *
 * Creates a Cashfree order and saves a Payment record (with full orderData).
 * Does NOT create an Order document — that happens only after payment is verified.
 *
 * Body (required):
 *   orderId, amount, email, phone, customerName, productInfo,
 *   customerEmail, products[], shippingAddress, customerId (optional)
 */
const processPayment = expressAsyncHandler(async (req, res) => {
    const {
        orderId, amount, email, phone, customerName, productInfo,
        customerId, customerEmail, products, shippingAddress
    } = req.body;

    // Validate all required fields including the new orderData fields
    if (!orderId || !amount || !email || !phone || !customerName || !productInfo) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId, amount, email, phone, customerName, and productInfo are required'
        });
    }

    if (!customerEmail || !products || !shippingAddress) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'customerEmail, products, and shippingAddress are required for order creation'
        });
    }

    // Idempotency: return existing session if already created for this orderId
    const existingPayment = await Payment.findOne({ merchantOrderId: orderId });
    if (existingPayment) {
        if (existingPayment.status === 'created') {
            console.log('[PAYMENT] Returning existing payment session for orderId:', orderId);
            return res.status(200).json({
                message: 'Payment session already created',
                paymentSessionId: existingPayment.cashfreePaymentSessionId,
                cashfreeOrderId: existingPayment.cashfreeOrderId,
                cashfreePaymentSessionId: existingPayment.cashfreePaymentSessionId,
                paymentId: existingPayment.paymentId,
                merchantOrderId: existingPayment.merchantOrderId,
                status: existingPayment.status
            });
        }

        return res.status(400).json({
            error: 'Payment already exists for this order',
            status: existingPayment.status
        });
    }

    // Create the Cashfree order
    const cashfreeResponse = await createCashfreeOrder({
        orderId,
        amount,
        email,
        phone,
        customerName,
        productInfo,
        customerId
    });

    // Save the Payment record including the full orderData for later Order creation
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
        // Store full order payload — used by verifyPayment/verifyWebhook to create Order
        orderData: {
            customerId: customerId || null,
            customerEmail,
            products,
            shippingAddress,
            paymentMethod: 'card'
        },
        status: 'created'
    });

    console.log('[PAYMENT] Payment record created:', payment.paymentId, 'for orderId:', orderId);

    // Return the cashfreePaymentSessionId — the frontend SDK uses it with cashfree.checkout()
    return res.status(201).json({
        paymentSessionId: payment.cashfreePaymentSessionId,
        cashfreeOrderId: payment.cashfreeOrderId,
        cashfreePaymentSessionId: payment.cashfreePaymentSessionId,
        paymentId: payment.paymentId,
        merchantOrderId: payment.merchantOrderId,
        amount: payment.amount,
        status: payment.status
    });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payment/verify
 *
 * Verifies payment with Cashfree. On success:
 *   1. Marks Payment.status = "paid"
 *   2. Creates the Order document (status: "confirmed") using Payment.orderData
 *   3. Returns the order to the frontend
 *
 * Idempotent: if Payment is already "paid"/"used", returns the existing Order immediately.
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
        return typeof sessionId === 'string' &&
            /^(?:\{?payment[_-]?session[_-]?id\}?|\{paymentSessionId\})$/i.test(sessionId.trim());
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

    // Idempotent re-verification: already paid → return existing order
    if (payment.status === 'paid' || payment.status === 'used') {
        const existingOrder = await Order.findOne({ id: payment.merchantOrderId });
        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status,
            orderId: payment.merchantOrderId,
            order: existingOrder || null
        });
    }

    // Fetch Cashfree order status
    try {
        const cfBase = getCashfreeApiBaseUrl();
        const cfUrl = `${cfBase}/orders/${encodeURIComponent(orderId)}`;
        const { appId: cfAppId, appSecret: cfAppSecret } = getCashfreeCredentials();

        console.log('[CASHFREE] Verifying order:', cfUrl);

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
        console.log('[CASHFREE] Order status for', orderId, ':', cfStatus);

        if (cfStatus === 'PAID' || cfStatus === 'paid') {
            // Mark payment as paid
            payment.status = 'paid';
            payment.verificationDetails = {
                verifiedAt: new Date(),
                method: 'cashfree_order_check',
                cashfree: cfBody
            };
            await payment.save();

            // ── Create the Order now that payment is confirmed ────────────────
            const order = await createOrderFromPayment(payment);
            // ─────────────────────────────────────────────────────────────────

            return res.status(200).json({
                paymentId: payment.paymentId,
                paymentSessionId: payment.paymentSessionId,
                cashfreeOrderId: payment.cashfreeOrderId,
                status: payment.status,
                orderId: payment.merchantOrderId,
                order   // returned to frontend for confirmation page
            });
        }

        // Map non-PAID statuses to clear client errors
        if (cfStatus === 'ACTIVE') {
            return res.status(400).json({ error: 'ORDER_ACTIVE', status: cfStatus, details: 'Order created but not paid yet' });
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payment/webhook
 *
 * Handles async Cashfree webhook events.
 * On PAYMENT_SUCCESS: marks Payment as "paid" and creates the Order.
 *
 * Signature spec (Cashfree v2023-08-01):
 *   Header: x-webhook-signature (base64 HMAC-SHA256)
 *   Header: x-webhook-timestamp (Unix timestamp)
 *   Message: `${timestamp}.${rawBody}`
 *
 * IMPORTANT: server.js uses express.raw() for this route so req.body is a Buffer.
 */
const verifyWebhook = expressAsyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || '';

    if (!signature || !timestamp || !secret) {
        console.warn('[WEBHOOK] Missing signature, timestamp, or webhook secret');
        return res.status(403).json({ error: 'Webhook signature verification failed' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('base64');

    if (expectedSignature !== signature) {
        console.error('[WEBHOOK] Invalid signature');
        return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    let body;
    try {
        body = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
    } catch (parseErr) {
        console.error('[WEBHOOK] Failed to parse body:', parseErr);
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { event, data } = body;
    console.log('[WEBHOOK] Received event:', event);

    const payment = await Payment.findOne({
        $or: [
            { cashfreePaymentSessionId: data?.payment_session_id },
            { cashfreeOrderId: data?.order?.cf_order_id },
            { merchantOrderId: data?.order?.order_id }
        ]
    });

    if (!payment) {
        console.warn('[WEBHOOK] No matching payment record for event:', event, 'data.order.order_id:', data?.order?.order_id);
        // Return 200 so Cashfree doesn't keep retrying
        return res.status(200).json({ success: true, note: 'Payment record not found, acknowledged' });
    }

    payment.webhookEvents = payment.webhookEvents || [];
    payment.webhookEvents.push({ event, data, receivedAt: new Date() });
    payment.webhookStatus = event;

    if (event === 'PAYMENT_SUCCESS' && payment.status === 'created') {
        payment.status = 'paid';
        payment.verificationDetails = {
            verifiedAt: new Date(),
            method: 'webhook'
        };
        await payment.save();

        // ── Create the Order now that webhook has confirmed payment ──────────
        const order = await createOrderFromPayment(payment);
        if (order) {
            console.log('[WEBHOOK] Order confirmed via webhook:', order.id);
        }
        // ─────────────────────────────────────────────────────────────────────
    } else {
        await payment.save();
    }

    return res.status(200).json({ success: true });
});

module.exports = {
    processPayment,
    verifyPayment,
    verifyWebhook
};
