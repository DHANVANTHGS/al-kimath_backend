const expressasynhandler = require('express-async-handler');
const admin_user = require('../models/admin_user');


const me = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const check_user = await admin_user.findById(user_id);
    return res.status(200).json({
        user: {
            name : check_user.name,
            email : check_user.email,
            role : check_user.role,
            orders : check_user.myorders
        }
    });
});

const update_profile = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const {name,email,avatar} = req.body;
    const check_user = await admin_user.findById(user_id);
    if(name) check_user.name = name;
    if(email) check_user.email = email;
    if(avatar) check_user.avatar = avatar;
    await check_user.save();
    return res.status(200).json({
        user: {
            name : check_user.name,
            email : check_user.email,
            avatar : check_user.avatar,
            role : Super_admin
        }
    });
});

const change_password = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const {old_password,new_password} = req.body;
    const check_user = await admin_user.findById(user_id);
    const check_pass = await bcrypt.compare(old_password,check_user.password);
    if(!check_pass) {
        console.log("invalid old password!");
        return res.status(400).json({message: "Invalid old password"});
    }
    const salt = await bcrypt.genSalt(10);
    const hashed_pass = await bcrypt.hash(new_password,salt);
    check_user.password = hashed_pass;
    await check_user.save();
    return res.status(200).json({message: "Password changed successfully"});
});

module.exports = {me, update_profile, change_password}

