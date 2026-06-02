const Product = require('../models/product');
const expressAsyncHandler = require('express-async-handler');

// Get all products with optional filters
const getProducts = expressAsyncHandler(async (req, res) => {
    const { category, search, status, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    const products = await Product.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    res.status(200).json({
        products,
        total,
        pages,
        currentPage: pageNum
    });
});

// Get single product
const getProduct = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(product);
});

// Create new product
const createProduct = expressAsyncHandler(async (req, res) => {
    const { name, price, stock, category, description, image, badge, featured, latest } = req.body;

    if (!name || !price || !stock || !category) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'name, price, stock, and category are required'
        });
    }

    const product = await Product.create({
        name,
        price,
        stock,
        category,
        description,
        image,
        badge,
        featured: featured || false,
        latest: latest || false,
        status: 'active'
    });

    res.status(201).json(product);
});

// Update product
const updateProduct = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const product = await Product.findByIdAndUpdate(id, updates, { new: true });

    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(product);
});

// Delete product
const deleteProduct = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
});

// Upload product images
const uploadImages = expressAsyncHandler(async (req, res) => {
    const { productId } = req.body;
    const files = req.files; // Assuming multer middleware is used

    if (!productId || !files || files.length === 0) {
        return res.status(400).json({
            error: 'Invalid request parameters',
            details: 'productId and files are required'
        });
    }

    const product = await Product.findById(productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    const imageUrls = files.map((file) => file.path || file.filename);
    product.images = product.images || [];
    product.images.push(
        ...imageUrls.map((url) => ({ id: new Date().getTime(), url }))
    );

    await product.save();

    res.status(200).json({
        images: imageUrls
    });
});

// Delete single product image
const deleteImage = expressAsyncHandler(async (req, res) => {
    const { productId, imageId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    product.images = product.images.filter((img) => img.id.toString() !== imageId);
    await product.save();

    res.status(200).json({ success: true, message: 'Image deleted successfully' });
});

module.exports = {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadImages,
    deleteImage
};