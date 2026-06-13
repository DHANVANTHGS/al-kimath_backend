const Router = require('express').Router();
const { processPayment, verifyPayment, verifyWebhook } = require('../controller/payment');

Router.post('/process', processPayment);
Router.post('/verify', verifyPayment);
Router.post('/webhook', verifyWebhook);

module.exports = Router;
