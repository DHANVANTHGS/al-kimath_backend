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

    // Handle multipart file (multer) or base64 image in JSON
    let mainImageBuffer = null;
    let mainImageContentType = null;
    if (req.file && req.file.buffer) {
        mainImageBuffer = req.file.buffer;
        mainImageContentType = req.file.mimetype;
    } else if (image && typeof image === 'string' && image.startsWith('data:')) {
        const parts = image.split(',');
        const meta = parts[0];
        const base64 = parts[1];
        mainImageBuffer = Buffer.from(base64, 'base64');
        const m = meta.match(/data:(.*);base64/);
        if (m) mainImageContentType = m[1];
    }

    const productData = {
        name,
        price,
        stock,
        category,
        description,
        badge,
        featured: featured || false,
        latest: latest || false,
        status: 'active'
    };

    if (mainImageBuffer) {
        productData.image = mainImageBuffer;
    }

    const product = await Product.create(productData);

    // If we want to store contentType for main image, consider adding a field. For now we only store buffer.

    res.status(201).json(product);
});

// Update product
const updateProduct = expressAsyncHandler(async (req, res) => {
    console.log('received body :', req.body);
    const { id } = req.params;
    const updates = req.body || {};

    // If multipart image provided, replace main image
    if (req.file && req.file.buffer) {
        updates.image = req.file.buffer;
    } else if (updates.image && typeof updates.image === 'string' && updates.image.startsWith('data:')) {
        const parts = updates.image.split(',');
        const base64 = parts[1];
        updates.image = Buffer.from(base64, 'base64');
    }

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

// Upload product images (gallery)
const uploadImages = expressAsyncHandler(async (req, res) => {
    const { productId } = req.body;
    const files = req.files; // multer array

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

    product.images = product.images || [];
    const imageEntries = files.map((file) => ({
        id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
        data: file.buffer,
        contentType: file.mimetype
    }));

    product.images.push(...imageEntries);

    await product.save();

    // Return ids for the stored images
    const ids = imageEntries.map(e => e.id);
    res.status(200).json({ images: ids });
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