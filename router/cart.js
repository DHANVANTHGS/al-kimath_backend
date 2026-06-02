const Router = require('express').Router();
const { cart, update_item, delete_item, add_item} = require('../controller/cart');
const { authmiddleware } = require('../middleware/authmiddleware');
Router.get('/', authmiddleware, cart);
Router.patch('/:product_id', authmiddleware, update_item);
Router.delete('/:product_id', authmiddleware, delete_item);
Router.post('/:product_id', authmiddleware, add_item);

module.exports = Router;