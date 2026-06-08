const Product = require('../models/product');
const expressAsyncHandler = require('express-async-handler');

const products = expressAsyncHandler(async (req, res) => {
    const { category, search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = { status: 'active' };
    
    if (category) filter.category = category;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    const allProducts = await Product.find(filter)
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);
    const pages = Math.ceil(total / limitNum);

    // Map products to avoid sending raw binary buffers. Provide image URLs for clients to fetch.
    const mapped = allProducts.map(p => {
        const obj = p.toObject();
        // main image availability
        if (obj.image) {
            obj.imageUrl = `/api/product/${obj._id}/image`;
            delete obj.image;
        }
        if (obj.images && Array.isArray(obj.images)) {
            obj.images = obj.images.map(img => ({ id: img.id, url: `/api/product/${obj._id}/image/${img.id}` }));
        }
        return obj;
    });

    return res.status(200).json({
        products: mapped,
        total,
        pages,
        currentPage: pageNum
    });
});

const product = expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const checkProduct = await Product.findById(id).populate('reviews.user', 'name avatar');
    
    if (!checkProduct) {
        return res.status(404).json({ error: 'Product not found' });
    }
    
    const obj = checkProduct.toObject();
    if (obj.image) {
        obj.imageUrl = `/api/product/${obj._id}/image`;
        delete obj.image;
    }
    if (obj.images && Array.isArray(obj.images)) {
        obj.images = obj.images.map(img => ({ id: img.id, url: `/api/product/${obj._id}/image/${img.id}` }));
    }
    return res.status(200).json(obj);
});

// Serve product image (main)
const productImage = expressAsyncHandler(async (req, res) => {
    const { id, imageId } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (imageId) {
        const img = (product.images || []).find(i => i.id && i.id.toString() === imageId.toString());
        if (!img) return res.status(404).json({ error: 'Image not found' });
        if (img.contentType) res.set('Content-Type', img.contentType);
        return res.send(img.data);
    }

    // main image
    if (!product.image) return res.status(404).json({ error: 'Image not found' });
    // main image content type unknown; default to octet-stream
    res.set('Content-Type', 'application/octet-stream');
    return res.send(product.image);
});

module.exports = { products, product, productImage };