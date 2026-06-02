const Product = require('../models/product');
const Order = require('../models/order');
const Customer = require('../models/customer');
const expressAsyncHandler = require('express-async-handler');

// Get dashboard statistics
const getDashboardStats = expressAsyncHandler(async (req, res) => {
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await Customer.countDocuments();

    // Calculate total revenue
    const revenueData = await Order.aggregate([
        { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    // Get pending orders
    const pendingOrders = await Order.countDocuments({ status: 'pending' });

    // Get active products
    const activeProducts = await Product.countDocuments({ status: 'active' });

    // Get this month's data
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const newCustomersThisMonth = await Customer.countDocuments({ createdAt: { $gte: startOfMonth } });

    const monthlyRevenueData = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startOfMonth }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$total' }
            }
        }
    ]);
    const revenueThisMonth = monthlyRevenueData.length > 0 ? monthlyRevenueData[0].total : 0;

    res.status(200).json({
        totalProducts,
        totalOrders,
        totalCustomers,
        totalRevenue,
        pendingOrders,
        activeProducts,
        newCustomersThisMonth,
        revenueThisMonth
    });
});

module.exports = {
    getDashboardStats
};
