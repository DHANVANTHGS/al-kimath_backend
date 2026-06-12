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

    // Detect MIME type from buffer magic bytes
    function sniffMimeType(buf) {
        if (!buf || buf.length < 4) return 'image/jpeg';
        const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
        if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
        if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
        return 'image/jpeg'; // safe default
    }

    if (imageId) {
        const img = (product.images || []).find(i => i.id && i.id.toString() === imageId.toString());
        if (!img) return res.status(404).json({ error: 'Image not found' });
        const mime = img.contentType || sniffMimeType(img.data);
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'public, max-age=86400'); // cache 24h
        return res.send(img.data);
    }

    // main image
    if (!product.image) return res.status(404).json({ error: 'Image not found' });
    const mime = sniffMimeType(product.image);
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(product.image);
});

module.exports = { products, product, productImage };