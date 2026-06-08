const Router = require('express').Router();
const {products, product, productImage} = require('../controller/product');

Router.get('/', products);
Router.get('/:id', product);
// Serve main image
Router.get('/:id/image', productImage);
// Serve gallery image
Router.get('/:id/image/:imageId', productImage);

module.exports = Router;