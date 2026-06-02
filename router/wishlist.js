const Router = require('express').Router();
const { wishlist, add_item, delete_item } = require('../controller/wishlist');
const { authmiddleware } = require('../middleware/authmiddleware');                 

Router.get('/', authmiddleware, wishlist);
Router.post('/', authmiddleware, add_item);
Router.delete('/:id', authmiddleware, delete_item);

module.exports = Router;