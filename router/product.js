const Router = require('express').Router();
const {products, product} = require('../controller/product');

Router.get('/', products);
Router.get('/:id', product);

module.exports = Router;