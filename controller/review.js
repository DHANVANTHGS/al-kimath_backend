const Review = require('../models/review');
const Product = require('../models/product');
const expressAsyncHandler = require('express-async-handler');

// Create a new review
const createReview = expressAsyncHandler(async (req, res) => {
    const { productId, rating, comment } = req.body;
    const customerId = req.user.id; // From auth middleware

    if (!productId || !rating || !comment) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'productId, rating, and comment are required'
        });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({ product: productId, customer: customerId });
    if (existingReview) {
        return res.status(400).json({ error: 'You have already reviewed this product' });
    }

    const review = await Review.create({
        product: productId,
        productName: product.name,
        customer: customerId,
        rating,
        comment,
        status: 'pending'
    });

    // Populate customer details
    await review.populate('customer', 'name avatar');

    res.status(201).json({
        message: 'Review created successfully and is pending approval',
        review
    });
});

// Get reviews for a specific product
const getProductReviews = expressAsyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    // Get only approved reviews
    const reviews = await Review.find({ product: productId, status: 'approved' })
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .populate('customer', 'name avatar');

    const total = await Review.countDocuments({ product: productId, status: 'approved' });
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        reviews,
        total,
        pages,
        currentPage: pageNum
    });
});

// Get user's own reviews
const getMyReviews = expressAsyncHandler(async (req, res) => {
    const customerId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reviews = await Review.find({ customer: customerId })
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .populate('product', 'name image');

    const total = await Review.countDocuments({ customer: customerId });
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        reviews,
        total,
        pages,
        currentPage: pageNum
    });
});

// Update user's own review
const updateReview = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const customerId = req.user.id;
    const { rating, comment } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const review = await Review.findById(id);

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    // Only allow users to update their own reviews
    if (review.customer.toString() !== customerId) {
        return res.status(403).json({ error: 'You can only update your own reviews' });
    }

    if (rating) review.rating = rating;
    if (comment) review.comment = comment;
    review.status = 'pending'; // Reset to pending after update

    await review.save();

    res.status(200).json({
        message: 'Review updated and is pending approval',
        review
    });
});

// Delete user's own review
const deleteReview = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const customerId = req.user.id;

    const review = await Review.findById(id);

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    // Only allow users to delete their own reviews
    if (review.customer.toString() !== customerId) {
        return res.status(403).json({ error: 'You can only delete your own reviews' });
    }

    await Review.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: 'Review deleted successfully' });
});

// Mark review as helpful
const markHelpful = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const review = await Review.findByIdAndUpdate(
        id,
        { $inc: { helpful: 1 } },
        { new: true }
    );

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json(review);
});

module.exports = {
    createReview,
    getProductReviews,
    getMyReviews,
    updateReview,
    deleteReview,
    markHelpful
};
