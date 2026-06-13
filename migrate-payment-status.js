/**
 * Migration Script: paided → paid
 *
 * Updates all Payment documents in MongoDB that have status "paided"
 * (the old typo) to the correct status "paid".
 *
 * Run once before or after deploying the backend fix:
 *   node migrate-payment-status.js
 *
 * Safe to run multiple times — idempotent (only touches "paided" records).
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('[MIGRATE] MONGO_URI not set in .env');
        process.exit(1);
    }

    console.log('[MIGRATE] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[MIGRATE] Connected.');

    const collection = mongoose.connection.collection('payments');

    // Count records to migrate
    const count = await collection.countDocuments({ status: 'paided' });
    console.log(`[MIGRATE] Found ${count} payment record(s) with status "paided"`);

    if (count === 0) {
        console.log('[MIGRATE] Nothing to migrate. Exiting.');
        await mongoose.disconnect();
        process.exit(0);
    }

    // Perform the update
    const result = await collection.updateMany(
        { status: 'paided' },
        { $set: { status: 'paid' } }
    );

    console.log(`[MIGRATE] ✅ Updated ${result.modifiedCount} record(s) from "paided" → "paid"`);

    await mongoose.disconnect();
    console.log('[MIGRATE] Done. Disconnected from MongoDB.');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('[MIGRATE] Fatal error:', err);
    process.exit(1);
});
