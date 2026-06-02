const Router = require('express').Router();
const { getOrders, getOrder, createOrder, updateOrderStatus, updateOrder, deleteOrder } = require('../admin_controller.js/orders');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getOrders);
Router.get('/:id', adminmiddleware, getOrder);
Router.post('/', adminmiddleware, createOrder);
Router.put('/:id/status', adminmiddleware, updateOrderStatus);
Router.put('/:id', adminmiddleware, updateOrder);
Router.delete('/:id', adminmiddleware, deleteOrder);

module.exports = Router;
