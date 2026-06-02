const usermodel = require('../models/user');
const expressasynhandler = require('express-async-handler');


const cart = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    return res.status(200).json(check_user.mycart);
});

const update_item = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const product_id = req.params.product_id;
    const {quantity} = req.body;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    const item_index = check_user.mycart.findIndex(item => item.product.toString() === product_id);
    if(item_index === -1) {
        return res.status(404).json({message: "Item not found in cart"});
    }
    check_user.mycart[item_index].quantity = quantity;
    await check_user.save();
    return res.status(200).json({message: "Cart updated successfully"});
});

const delete_item = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const product_id = req.params.product_id;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message:"user not found"});
    }
    const item_index = check_user.mycart.findIndex(item=> item.product.toString() === product_id);
    if(item_index ===-1){
        return res.status(404).json({message: "Item not found in cart"});
    }
    check_user.mycart.splice(item_index,1);
    await check_user.save();
    return res.status(200).json({message: "Item removed from cart successfully"});
});

const add_item = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const product_id = req.params.product_id;
    const {quantity} = req.body;
    const check_user = await usermodel.findById(user_id);
    if(!check_user) {
        return res.status(404).json({message: "User not found"});
    }
    const item_index = check_user.mycart.findIndex(item => item.product.toString() === product_id);
    if(item_index === -1) {
        check_user.mycart.push({product: product_id, quantity: quantity});
    } else {
        check_user.mycart[item_index].quantity += quantity;
    }
    await check_user.save();
    return res.status(200).json({message: "Item added to cart successfully"});
});

module.exports = {cart, update_item, delete_item, add_item};
