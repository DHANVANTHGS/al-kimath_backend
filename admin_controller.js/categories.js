const Category = require('../models/category');
const expressAsyncHandler = require('express-async-handler');

// Get all categories
const getCategories = expressAsyncHandler(async (req, res) => {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.status(200).json({ categories });
});

// Get single category
const getCategory = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
        return res.status(404).json({ error: 'Category not found' });
    }

    res.status(200).json(category);
});

// Create new category
const createCategory = expressAsyncHandler(async (req, res) => {
    const { name, slug, description, icon, color } = req.body;

    if (!name || !slug) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'name and slug are required'
        });
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({ $or: [{ name }, { slug }] });
    if (existingCategory) {
        return res.status(400).json({ error: 'Category with this name or slug already exists' });
    }

    const category = await Category.create({
        name,
        slug: slug.toLowerCase(),
        description,
        icon: icon || 'Package',
        color: color || '#9EFF00',
        status: 'active'
    });

    res.status(201).json(category);
});

// Update category
const updateCategory = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const category = await Category.findByIdAndUpdate(id, updates, { new: true });

    if (!category) {
        return res.status(404).json({ error: 'Category not found' });
    }

    res.status(200).json(category);
});

// Delete category
const deleteCategory = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const category = await Category.findByIdAndDelete(id);

    if (!category) {
        return res.status(404).json({ error: 'Category not found' });
    }

    res.status(200).json({ success: true, message: 'Category deleted successfully' });
});

module.exports = {
    getCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory
};
