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

    // Call Cashfree API to create order session
    const appId = process.env.CASHFREE_APP_ID;
    const appSecret = process.env.CASHFREE_APP_SECRET;
    const baseUrl = process.env.CASHFREE_API_BASE_URL || "https://api.cashfree.com/pg";

    if (!appId || !appSecret) {
        console.error('[PAYMENT] Cashfree credentials not configured. Set CASHFREE_APP_ID and CASHFREE_APP_SECRET in Render environment variables.');
        return res.status(503).json({ 
            error: 'Payment gateway not configured',
            details: 'CASHFREE_APP_ID and CASHFREE_APP_SECRET must be set in the server environment. Contact the administrator.'
        });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    const paymentPayload = {
        order_id: orderId,
        order_amount: Number(amount),
        order_currency: "INR",
        customer_details: {
            customer_id: `cust_${Date.now()}`,
            customer_email: email,
            customer_phone: phone,
            customer_name: customerName,
        },
        order_meta: {
            return_url: `${frontendUrl}/order-confirmation?orderId=${orderId}&session_id={payment_session_id}`,
            notify_url: `${process.env.BACKEND_URL || "https://al-kimath-backend.onrender.com"}/api/payment/webhook`
        },
        order_note: productInfo
    };

    try {
        const response = await fetch(`${baseUrl}/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-version": "2023-08-01",
                "x-client-id": appId,
                "x-client-secret": appSecret,
            },
            body: JSON.stringify(paymentPayload),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Cashfree API error:", errText);
            return res.status(response.status).json({ error: 'Failed to create Cashfree payment order', details: errText });
        }

        const paymentOrder = await response.json();

        const payment = await Payment.create({
            paymentId: generateUniqueId('PAY'),
            merchantOrderId: orderId,
            paymentSessionId: paymentOrder.payment_session_id,
            cashfreeOrderId: paymentOrder.cf_order_id || paymentOrder.order_id,
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
    } catch (err) {
        console.error("Payment session creation failed:", err);
        return res.status(500).json({ 
            error: 'Internal server error during payment processing',
            details: err.message,
            stack: err.stack
        });
    }
});

const verifyPayment = expressAsyncHandler(async (req, res) => {
    const { orderId, paymentSessionId } = req.body;

    if (!orderId) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId is required'
        });
    }

    const query = { merchantOrderId: orderId };
    if (paymentSessionId) {
        query.paymentSessionId = paymentSessionId;
    }

    const payment = await Payment.findOne(query);
    if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
    }

    if (payment.status === 'paided' || payment.status === 'used') {
        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status
        });
    }

    // Call Cashfree to verify payment
    const appId = process.env.CASHFREE_APP_ID;
    const appSecret = process.env.CASHFREE_APP_SECRET;
    const baseUrl = process.env.CASHFREE_API_BASE_URL || "https://api.cashfree.com/pg";

    if (!appId || !appSecret) {
        console.error('[PAYMENT] Cashfree credentials not configured. Set CASHFREE_APP_ID and CASHFREE_APP_SECRET in Render environment variables.');
        return res.status(503).json({ 
            error: 'Payment gateway not configured',
            details: 'CASHFREE_APP_ID and CASHFREE_APP_SECRET must be set in the server environment. Contact the administrator.'
        });
    }

    try {
        const response = await fetch(`${baseUrl}/orders/${orderId}/payments`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-version": "2023-08-01",
                "x-client-id": appId,
                "x-client-secret": appSecret,
            }
        });

        if (!response.ok) {
            console.error("Payment verification call failed");
            return res.status(response.status).json({ error: 'Payment verification failed' });
        }

        const payments = await response.json();
        let isSuccessful = false;
        let paymentData = {};

        if (Array.isArray(payments)) {
            const successPayment = payments.find(p => p.payment_status === "SUCCESS");
            if (successPayment) {
                isSuccessful = true;
                paymentData = successPayment;
            } else if (payments.length > 0) {
                paymentData = payments[0];
            }
        } else if (payments && typeof payments === 'object') {
            isSuccessful = payments.payment_status === "SUCCESS";
            paymentData = payments;
        }

        if (isSuccessful) {
            payment.status = 'paided';
            payment.verificationDetails = {
                verifiedAt: new Date(),
                method: 'api_verify',
                cfPaymentId: paymentData.cf_payment_id
            };
            await payment.save();

            // Also update the order status to confirmed
            const Order = require('../models/order');
            const order = await Order.findOne({ id: orderId });
            if (order) {
                order.status = 'confirmed';
                order.paymentId = payment.paymentId;
                order.paymentSessionId = payment.paymentSessionId;
                await order.save();
            }
        }

        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status
        });
    } catch (err) {
        console.error("Verification failed:", err);
        return res.status(500).json({ 
            error: 'Internal server error during payment verification',
            details: err.message,
            stack: err.stack
        });
    }
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
