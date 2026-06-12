const Router = require('express').Router();
const { processPayment, verifyPayment, verifyWebhook, createCheckoutSession } = require('../controller/payment');

Router.post('/process', processPayment);
Router.post('/checkout', createCheckoutSession);
Router.post('/verify', verifyPayment);
Router.post('/webhook', verifyWebhook);

module.exports = Router;
