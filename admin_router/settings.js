const Router = require('express').Router();
const { getReviews, getReview, updateReview, deleteReview } = require('../admin_controller.js/reviews');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getReviews);
Router.get('/:id', adminmiddleware, getReview);
Router.put('/:id', adminmiddleware, updateReview);
Router.delete('/:id', adminmiddleware, deleteReview);

module.exports = Router;
