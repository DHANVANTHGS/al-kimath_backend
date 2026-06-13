const Product = require('../models/product');

/**
 * Deducts stock for each product in the given products array.
 * Called when an order is confirmed/created.
 *
 * @param {Array<{ productId: string|ObjectId, quantity: number }>} products
 */
const deductStock = async (products) => {
    if (!Array.isArray(products) || products.length === 0) return;

    const ops = products.map((p) =>
        Product.findByIdAndUpdate(
            p.productId,
            { $inc: { stock: -p.quantity } },
            { new: true }
        )
    );

    await Promise.all(ops);
    console.log(`[STOCK] Deducted stock for ${products.length} product(s)`);
};

/**
 * Restores stock for each product in the given products array.
 * Called when an order is cancelled.
 *
 * @param {Array<{ productId: string|ObjectId, quantity: number }>} products
 */
const restoreStock = async (products) => {
    if (!Array.isArray(products) || products.length === 0) return;

    const ops = products.map((p) =>
        Product.findByIdAndUpdate(
            p.productId,
            { $inc: { stock: p.quantity } },
            { new: true }
        )
    );

    await Promise.all(ops);
    console.log(`[STOCK] Restored stock for ${products.length} product(s)`);
};

module.exports = { deductStock, restoreStock };
