const Router = require('express').Router();
const { createOrder, getOrders, getOrder } = require('../controller/order');
const { authmiddleware } = require('../middleware/authmiddleware');

Router.get('/', authmiddleware, getOrders);
Router.get('/:id', authmiddleware, getOrder);
Router.post('/', authmiddleware, createOrder);

module.exports = Router;
