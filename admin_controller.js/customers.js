const Customer = require('../models/customer');
const expressAsyncHandler = require('express-async-handler');

// Get all customers with optional filters
const getCustomers = expressAsyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (status) filter.status = status;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }

    const customers = await Customer.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 });

    const total = await Customer.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        customers,
        total,
        pages,
        currentPage: pageNum
    });
});

// Get single customer
const getCustomer = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await Customer.findById(id);

    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    res.status(200).json(customer);
});

// Create new customer
const createCustomer = expressAsyncHandler(async (req, res) => {
    const { name, email, phone, address, status } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'name, email, and phone are required'
        });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
        return res.status(400).json({ error: 'Customer with this email already exists' });
    }

    const customer = await Customer.create({
        name,
        email,
        phone,
        address,
        status: status || 'active'
    });

    res.status(201).json(customer);
});

// Update customer
const updateCustomer = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const customer = await Customer.findByIdAndUpdate(id, updates, { returnDocument: 'after' });

    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    res.status(200).json(customer);
});

// Delete customer
const deleteCustomer = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const customer = await Customer.findByIdAndDelete(id);

    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    res.status(200).json({ success: true, message: 'Customer deleted successfully' });
});

module.exports = {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer
};
