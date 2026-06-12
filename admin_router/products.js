const Router = require('express').Router();
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const { getProducts, getProduct, createProduct, updateProduct, deleteProduct, uploadImages, deleteImage } = require('../admin_controller.js/products');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getProducts);
Router.get('/:id', adminmiddleware, getProduct);
// Accept single image file for main image (field name: image)
Router.post('/', adminmiddleware, upload.single('image'), createProduct);
// Accept single image file for update
Router.put('/:id', adminmiddleware, upload.single('image'), updateProduct);
Router.delete('/:id', adminmiddleware, deleteProduct);
// Accept multiple files for gallery images (field name: images/files)
Router.post('/upload-images', adminmiddleware, upload.any(), uploadImages);
Router.delete('/:productId/image/:imageId', adminmiddleware, deleteImage);

module.exports = Router;
