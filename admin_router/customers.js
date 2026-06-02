const Router = require('express').Router();
const { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } = require('../admin_controller.js/customers');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getCustomers);
Router.get('/:id', adminmiddleware, getCustomer);
Router.post('/', adminmiddleware, createCustomer);
Router.put('/:id', adminmiddleware, updateCustomer);
Router.delete('/:id', adminmiddleware, deleteCustomer);

module.exports = Router;
