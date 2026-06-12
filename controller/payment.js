const Payment = require('../models/payment');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');

const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
const generateSessionId = () => `CFS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const generateCashfreeOrderId = () => `CFORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;

const processPayment = expressAsyncHandler(async (req, res) => {
    console.log('[PAYMENT] processPayment request payload:', JSON.stringify(req.body, null, 2));

    const { orderId } = req.body;
    let { amount, email, phone, customerName, productInfo } = req.body;

    if (!orderId) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'orderId is required'
        });
    }

    // Try to load order details from database if any is missing
    const Order = require('../models/order');
    let order = null;
    try {
        order = await Order.findOne({ id: orderId });
        if (order) {
            console.log(`[PAYMENT] Loaded order ${orderId} from database as fallback.`);
        }
    } catch (dbErr) {
        console.error(`[PAYMENT] Database error looking up order ${orderId}:`, dbErr);
    }

    if (order) {
        if (!amount) amount = order.total;
        if (!customerName) customerName = order.customerName;
        if (!email) email = order.customerEmail;
        if (!productInfo && order.products) {
            productInfo = order.products.map(p => p.productName || 'Product').join(', ');
        }
        if (!phone && order.shippingAddress) {
            const phoneMatch = order.shippingAddress.match(/Phone:\s*([+0-9]+)/);
            if (phoneMatch) {
                phone = phoneMatch[1];
            }
        }
    }

    // Validation
    if (!amount || !email || !phone || !customerName) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: `Missing fields for Cashfree order creation: ${[
                !amount && 'amount',
                !email && 'email',
                !phone && 'phone',
                !customerName && 'customerName'
            ].filter(Boolean).join(', ')}. Ensure order exists or supply them in request body.`
        });
    }

    if (!productInfo) productInfo = "E-commerce Purchase";

    const existingPayment = await Payment.findOne({ merchantOrderId: orderId });
    if (existingPayment) {
        if (existingPayment.status === 'created') {
            console.log(`[PAYMENT] Found existing created payment session for orderId: ${orderId}. Reusing it.`);
            return res.status(200).json({
                message: 'Payment session already created',
                paymentSessionId: existingPayment.paymentSessionId,
                cashfreeOrderId: existingPayment.cashfreeOrderId,
                paymentId: existingPayment.paymentId,
                status: existingPayment.status
            });
        }

        console.log(`[PAYMENT] Payment record for orderId: ${orderId} already exists with status: ${existingPayment.status}`);
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

    // Self-healing frontendUrl logic based on request Origin
    const origin = req.get('origin');
    let frontendUrl = origin || process.env.FRONTEND_URL || "https://alhikmath.com";

    // Standardize URL by removing trailing slash
    frontendUrl = frontendUrl.replace(/\/+$/, "");

    // Upgrade http to https for non-local hosts in production
    const isSandbox = (baseUrl.includes("sandbox") || process.env.NEXT_PUBLIC_CASHFREE_MODE === "sandbox");
    if (!isSandbox && frontendUrl.startsWith("http://")) {
        if (!frontendUrl.includes("localhost") && !frontendUrl.includes("127.0.0.1")) {
            frontendUrl = frontendUrl.replace("http://", "https://");
            console.log(`[PAYMENT] Upgraded non-secure frontend URL to HTTPS: ${frontendUrl}`);
        }
    }

    const returnUrl = `${frontendUrl}/order-confirmation?orderId=${orderId}&session_id={payment_session_id}`;
    const notifyUrl = `${process.env.BACKEND_URL || "https://al-kimath-backend.onrender.com"}/api/payment/webhook`;

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
            return_url: returnUrl,
            notify_url: notifyUrl
        },
        order_note: productInfo
    };

    console.log('[PAYMENT] Sending order creation request to Cashfree:');
    console.log(`Endpoint: POST ${baseUrl}/orders`);
    console.log('Headers x-client-id:', appId);
    console.log('Payload:', JSON.stringify(paymentPayload, null, 2));

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

        const status = response.status;
        const responseText = await response.text();

        console.log(`[PAYMENT] Cashfree order creation response code: ${status}`);
        console.log(`[PAYMENT] Cashfree order creation response body: ${responseText}`);

        if (!response.ok) {
            return res.status(status).json({ 
                error: 'Failed to create Cashfree payment order', 
                details: responseText,
                statusCode: status
            });
        }

        let paymentOrder;
        try {
            paymentOrder = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('[PAYMENT] Failed to parse Cashfree response as JSON:', parseErr);
            return res.status(502).json({
                error: 'Invalid JSON response from Cashfree gateway',
                details: responseText
            });
        }

        if (!paymentOrder.payment_session_id) {
            console.error('[PAYMENT] Cashfree order response is missing payment_session_id:', paymentOrder);
            return res.status(502).json({
                error: 'Missing paymentSessionId in Cashfree response',
                details: responseText
            });
        }

        const payment = await Payment.create({
            paymentId: generateUniqueId('PAY'),
            merchantOrderId: orderId,
            paymentSessionId: paymentOrder.payment_session_id,
            cashfreeOrderId: paymentOrder.order_id || paymentOrder.cf_order_id,
            amount,
            email,
            phone,
            customerName,
            productInfo,
            status: 'created'
        });

        console.log(`[PAYMENT] Internal payment session created in MongoDB: ${payment.paymentId}`);

        return res.status(201).json({
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            paymentId: payment.paymentId,
            merchantOrderId: payment.merchantOrderId,
            amount: payment.amount,
            status: payment.status
        });
    } catch (err) {
        console.error("[PAYMENT] Unhandled exception during payment session creation:", err);
        return res.status(500).json({ 
            error: 'Internal server error during payment processing',
            details: err.message,
            stack: err.stack
        });
    }
});

const verifyPayment = expressAsyncHandler(async (req, res) => {
    console.log('[PAYMENT] verifyPayment request payload:', JSON.stringify(req.body, null, 2));
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
        console.warn(`[PAYMENT] Payment record not found in database for orderId: ${orderId}`);
        return res.status(404).json({ error: 'Payment record not found' });
    }

    if (payment.status === 'paided' || payment.status === 'used') {
        console.log(`[PAYMENT] Payment for orderId: ${orderId} already verified in database. Status: ${payment.status}`);
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

    console.log(`[PAYMENT] Verifying payment transactions on Cashfree: GET ${baseUrl}/orders/${orderId}/payments`);

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

        const status = response.status;
        const responseText = await response.text();

        console.log(`[PAYMENT] Cashfree verification response code: ${status}`);
        console.log(`[PAYMENT] Cashfree verification response body: ${responseText}`);

        if (!response.ok) {
            return res.status(status).json({ 
                error: 'Payment verification call failed at Cashfree gateway', 
                details: responseText 
            });
        }

        let payments;
        try {
            payments = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('[PAYMENT] Failed to parse Cashfree verification response as JSON:', parseErr);
            return res.status(502).json({
                error: 'Invalid JSON response from Cashfree gateway verification',
                details: responseText
            });
        }

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

        console.log(`[PAYMENT] Verification result for orderId ${orderId}: isSuccessful = ${isSuccessful}`);

        if (isSuccessful) {
            payment.status = 'paided';
            payment.verificationDetails = {
                verifiedAt: new Date(),
                method: 'api_verify',
                cfPaymentId: paymentData.cf_payment_id
            };
            await payment.save();
            console.log(`[PAYMENT] Payment record updated to 'paided' for orderId: ${orderId}`);

            // Also update the order status to confirmed
            const Order = require('../models/order');
            const order = await Order.findOne({ id: orderId });
            if (order) {
                order.status = 'confirmed';
                order.paymentId = payment.paymentId;
                order.paymentSessionId = payment.paymentSessionId;
                await order.save();
                console.log(`[ORDER] Order record updated to 'confirmed' for orderId: ${orderId}`);
            } else {
                console.warn(`[PAYMENT] Corresponding order record not found for id: ${orderId}`);
            }
        }

        return res.status(200).json({
            paymentId: payment.paymentId,
            paymentSessionId: payment.paymentSessionId,
            cashfreeOrderId: payment.cashfreeOrderId,
            status: payment.status
        });
    } catch (err) {
        console.error("[PAYMENT] Unhandled exception during payment verification:", err);
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
