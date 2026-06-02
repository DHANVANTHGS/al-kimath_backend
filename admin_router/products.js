const Router = require('express').Router();
const { getProducts, getProduct, createProduct, updateProduct, deleteProduct, uploadImages, deleteImage } = require('../admin_controller.js/products');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getProducts);
Router.get('/:id', adminmiddleware, getProduct);
Router.post('/', adminmiddleware, createProduct);
Router.put('/:id', adminmiddleware, updateProduct);
Router.delete('/:id', adminmiddleware, deleteProduct);
Router.post('/upload-images', adminmiddleware, uploadImages);
Router.delete('/:productId/image/:imageId', adminmiddleware, deleteImage);

module.exports = Router;
