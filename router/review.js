const Router = require('express').Router();
const { createReview, getProductReviews, getMyReviews, updateReview, deleteReview, markHelpful } = require('../controller/review');
const { authmiddleware } = require('../middleware/authmiddleware');

// Get reviews for a product (public)
Router.get('/product/:productId', getProductReviews);

// Create review (requires auth)
Router.post('/', authmiddleware, createReview);

// Get user's own reviews
Router.get('/my-reviews', authmiddleware, getMyReviews);

// Update own review
Router.put('/:id', authmiddleware, updateReview);

// Delete own review
Router.delete('/:id', authmiddleware, deleteReview);

// Mark review as helpful
Router.post('/:id/helpful', markHelpful);

module.exports = Router;
