const Review = require('../models/review');
const expressAsyncHandler = require('express-async-handler');

// Get all reviews with optional filters
const getReviews = expressAsyncHandler(async (req, res) => {
    const { status, productId, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (status) filter.status = status;
    if (productId) filter.product = productId;

    const reviews = await Review.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .populate('product')
        .populate('customer');

    const total = await Review.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        reviews,
        total,
        pages,
        currentPage: pageNum
    });
});

// Get single review
const getReview = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const review = await Review.findById(id)
        .populate('product')
        .populate('customer');

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json(review);
});

// Update review (status/content)
const updateReview = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, comment } = req.body;

    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
            error: 'Invalid status',
            validStatuses: ['pending', 'approved', 'rejected']
        });
    }

    const updates = {};
    if (status) updates.status = status;
    if (comment) updates.comment = comment;

    const review = await Review.findByIdAndUpdate(id, updates, { new: true });

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json(review);
});

// Delete review
const deleteReview = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const review = await Review.findByIdAndDelete(id);

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json({ success: true, message: 'Review deleted successfully' });
});

module.exports = {
    getReviews,
    getReview,
    updateReview,
    deleteReview
};
