const Order = require('../models/order');
const { restoreStock } = require('../utils/stockManager');
const expressAsyncHandler = require('express-async-handler');

// Get all orders with optional filters
const getOrders = expressAsyncHandler(async (req, res) => {
    const { status, paymentMethod, search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (search) {
        filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { customerEmail: { $regex: search, $options: 'i' } },
            { id: { $regex: search, $options: 'i' } }
        ];
    }

    const orders = await Order.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .populate('products.productId');

    const total = await Order.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        orders,
        total,
        pages,
        currentPage: pageNum
    });
});

// Get single order
const getOrder = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await Order.findById(id).populate('products.productId');

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json(order);
});

// Create new order
const createOrder = expressAsyncHandler(async (req, res) => {
    const { customerId, customerName, customerEmail, products, total, paymentMethod, shippingAddress, status } = req.body;

    if (!customerName || !customerEmail || !products || !total || !paymentMethod || !shippingAddress) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'Required fields: customerName, customerEmail, products, total, paymentMethod, shippingAddress'
        });
    }

    const orderId = `ORD-${Date.now()}`;
    const order = await Order.create({
        id: orderId,
        customerId,
        customerName,
        customerEmail,
        products,
        total,
        status: status || 'pending',
        paymentMethod,
        shippingAddress
    });

    res.status(201).json(order);
});

// Update order status
const updateOrderStatus = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status', validStatuses });
    }

    // Fetch first so we have the previous status and the products list
    const order = await Order.findById(id);

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    const previousStatus = order.status;
    order.status = status;
    await order.save();

    // Restore stock when an order transitions to cancelled
    if (status === 'cancelled' && previousStatus !== 'cancelled') {
        await restoreStock(order.products);
    }

    res.status(200).json(order);
});

// Update order details
const updateOrder = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const order = await Order.findByIdAndUpdate(id, updates, { returnDocument: 'after' });

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json(order);
});

// Delete order
const deleteOrder = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await Order.findByIdAndDelete(id);

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json({ success: true, message: 'Order deleted successfully' });
});

module.exports = {
    getOrders,
    getOrder,
    createOrder,
    updateOrderStatus,
    updateOrder,
    deleteOrder
};
