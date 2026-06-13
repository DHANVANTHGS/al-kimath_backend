/**
 * Cleanup Script: Cancel Orphaned "pending" Online Payment Orders
 *
 * Finds all Order documents with:
 *   - status: "pending"
 *   - paymentMethod !== "cod"
 *
 * For each, checks whether a Payment record with status "paid" or "used" exists.
 *   - If YES → data recovery: updates Order to "confirmed"
 *   - If NO  → orphan: updates Order to "cancelled"
 *
 * Run once after deploying the Option A backend:
 *   node cleanup-pending-orders.js
 *
 * Safe to run multiple times — only processes "pending" orders.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/order');
const Payment = require('./models/payment');

async function cleanup() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('[CLEANUP] MONGO_URI not set in .env');
        process.exit(1);
    }

    console.log('[CLEANUP] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[CLEANUP] Connected.\n');

    // Find all pending non-COD orders
    const pendingOrders = await Order.find({
        status: 'pending',
        paymentMethod: { $ne: 'cod' }
    });

    console.log(`[CLEANUP] Found ${pendingOrders.length} pending online payment order(s) to evaluate.\n`);

    if (pendingOrders.length === 0) {
        console.log('[CLEANUP] Nothing to process. Exiting.');
        await mongoose.disconnect();
        process.exit(0);
    }

    let confirmed = 0;
    let cancelled = 0;
    let skipped = 0;

    for (const order of pendingOrders) {
        const payment = await Payment.findOne({
            merchantOrderId: order.id,
            status: { $in: ['paid', 'used'] }
        });

        if (payment) {
            // Payment was confirmed — recover the order
            order.status = 'confirmed';
            order.paymentId = payment.paymentId;
            await order.save();
            console.log(`  ✅ CONFIRMED  Order ${order.id} (matched Payment ${payment.paymentId})`);
            confirmed++;
        } else {
            // No paid payment found — this is an orphan
            const anyPayment = await Payment.findOne({ merchantOrderId: order.id });
            if (anyPayment && anyPayment.status === 'created') {
                // Payment was initiated but never completed — cancel
                order.status = 'cancelled';
                await order.save();
                console.log(`  ❌ CANCELLED  Order ${order.id} (payment status: ${anyPayment.status})`);
                cancelled++;
            } else if (!anyPayment) {
                // No payment record at all — cancel
                order.status = 'cancelled';
                await order.save();
                console.log(`  ❌ CANCELLED  Order ${order.id} (no payment record found)`);
                cancelled++;
            } else {
                console.log(`  ⏭  SKIPPED   Order ${order.id} (payment status: ${anyPayment?.status})`);
                skipped++;
            }
        }
    }

    console.log(`\n[CLEANUP] Done.`);
    console.log(`  Confirmed : ${confirmed}`);
    console.log(`  Cancelled : ${cancelled}`);
    console.log(`  Skipped   : ${skipped}`);

    await mongoose.disconnect();
    process.exit(0);
}

cleanup().catch((err) => {
    console.error('[CLEANUP] Fatal error:', err);
    process.exit(1);
});
