const usermodel = require('../models/user');
const product_model = require('../models/product');
const expressasynhandler = require('express-async-handler');


const wishlist = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const check_user = await usermodel.findById(user_id).populate('mywishlist.product');
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    return res.status(200).json(check_user.mywishlist);
});

const add_item = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const product_id = req.body.product_id;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    const check_product = await product_model.findById(product_id);
    if(!check_product) {
        return res.status(404).json({message: "Product not found"});
    }
    const item_index = check_user.mywishlist.findIndex(item => item.product.toString() === product_id);
    if(item_index === -1) {
        check_user.mywishlist.push({product: product_id});
    } else {
        return res.status(400).json({message: "Item already in wishlist"});
    }
    await check_user.save();
        return res.status(200).json({message: "Item added to wishlist successfully"});
});

const delete_item = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const product_id = req.params.id;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    const item_index = check_user.mywishlist.findIndex(item => item.product.toString() === product_id);
    if(item_index === -1) {
        return res.status(404).json({message: "Item not found in wishlist"});
    }
    check_user.mywishlist.splice(item_index, 1);
    await check_user.save();
    return res.status(200).json({message: "Item deleted from wishlist successfully"});
});

module.exports = {wishlist, add_item, delete_item};
