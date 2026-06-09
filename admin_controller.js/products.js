const Product = require('../models/product');
const expressAsyncHandler = require('express-async-handler');

const parseBase64Image = (value) => {
    const parts = value.split(',');
    const meta = parts[0];
    const base64 = parts[1] || '';
    const buffer = Buffer.from(base64, 'base64');
    const m = meta.match(/data:(.*);base64/);
    return {
        data: buffer,
        contentType: m ? m[1] : 'application/octet-stream'
    };
};

const buildImageEntry = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string' && entry.startsWith('data:')) {
        const { data, contentType } = parseBase64Image(entry);
        return {
            id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
            data,
            contentType
        };
    }
    if (entry.buffer && entry.mimetype) {
        return {
            id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
            data: entry.buffer,
            contentType: entry.mimetype
        };
    }
    if (entry.data && entry.contentType) {
        const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'base64');
        return {
            id: entry.id || Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
            data,
            contentType: entry.contentType
        };
    }
    return null;
};

const buildImageArray = (images) => {
    if (!Array.isArray(images)) return [];
    return images.map(buildImageEntry).filter(Boolean);
};

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
    const {
        name,
        price,
        stock,
        category,
        description,
        image,
        images,
        badge,
        featured,
        latest,
        originalPrice,
        brand,
        tags,
        specifications,
        status,
        isFeatured
    } = req.body;

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
        const parsed = parseBase64Image(image);
        mainImageBuffer = parsed.data;
        mainImageContentType = parsed.contentType;
    } else if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string' && images[0].startsWith('data:')) {
        const parsed = parseBase64Image(images[0]);
        mainImageBuffer = parsed.data;
        mainImageContentType = parsed.contentType;
    }

    const productData = {
        name,
        price,
        stock,
        category,
        description,
        badge,
        featured: featured ?? isFeatured ?? false,
        latest: latest || false,
        originalPrice,
        brand,
        tags,
        specifications: specifications || {},
        status: status || 'active'
    };

    if (mainImageBuffer) {
        productData.image = mainImageBuffer;
    }

    if (Array.isArray(images) && images.length) {
        productData.images = buildImageArray(images);
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

    if ('isFeatured' in updates) {
        updates.featured = updates.isFeatured;
        delete updates.isFeatured;
    }

    // If multipart image provided, replace main image
    if (req.file && req.file.buffer) {
        updates.image = req.file.buffer;
    } else if (updates.image && typeof updates.image === 'string' && updates.image.startsWith('data:')) {
        const parsed = parseBase64Image(updates.image);
        updates.image = parsed.data;
    }

    if (Array.isArray(updates.images)) {
        updates.images = buildImageArray(updates.images);
    }

    const product = await Product.findByIdAndUpdate(id, updates, { returnDocument: 'after' });

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