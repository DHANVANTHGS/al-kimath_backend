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

    return res.status(200).json({
        products: allProducts,
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
    
    return res.status(200).json(checkProduct);
});

module.exports = { products, product };