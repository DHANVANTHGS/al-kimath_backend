const Router = require('express').Router();
const { getCategories, getCategory, createCategory, updateCategory, deleteCategory } = require('../admin_controller.js/categories');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getCategories);
Router.get('/:id', adminmiddleware, getCategory);
Router.post('/', adminmiddleware, createCategory);
Router.put('/:id', adminmiddleware, updateCategory);
Router.delete('/:id', adminmiddleware, deleteCategory);

module.exports = Router;
