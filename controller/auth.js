const user = require('../models/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const expressasynhandler = require ('express-async-handler');

const register = expressasynhandler(async(req,res)=>{
    const {name,email,password} = req.body;
    const check_user = await user.findOne({email:email});
    if(check_user) {
        console.log("email already exits!");
        return res.status(400).json({message: "User already exits"});
    }
    const round = 10;
    const hashed_pass = await bcrypt.hash(password,round);
    const newuser = await user.create({
        name: name,
        email: email,
        password: hashed_pass
    });
    const token = jwt.sign({id: newuser._id, role: newuser.role}, process.env.JWT_SECRET, {expiresIn: '1d'});
    console.log(`new user created successfully as ${newuser}`);
    res.status(201).json({
        message: 'user created succesfully',
        token,
        user:{
            id: newuser._id.toString(),
            name : newuser.name,
            email : newuser.email,
            role : newuser.role
        }
    });
});

const login = expressasynhandler(async(req,res)=>{
    const {email,password} = req.body;
    const check_user = await user.findOne({email:email});
    if(!check_user) {
        console.log("email does not exits!");
        return res.status(400).json({message: "User does not exits"});
    }
    const check_pass = await bcrypt.compare(password,check_user.password);
    if(!check_pass) {
        console.log("invalid password!");
        return res.status(400).json({message: "Invalid password"});
    }
    const token = jwt.sign({id:check_user._id, role:check_user.role}, process.env.JWT_SECRET, {expiresIn: '1d'});
    console.log(`user logged in successfully as ${check_user}`);
    return res.status(200).json({
        message: 'user logged in successfully',
        token,
        user:{  
            id: check_user._id.toString(),
            name : check_user.name,
            email : check_user.email,
            role : check_user.role
        }
    });
});

const me = expressasynhandler(async(req,res)=>{
    const user_id = req.user.id;
    const check_user = await user.findById(user_id);
    return res.status(200).json({
        user: {
            name : check_user.name,
            email : check_user.email,
            role : check_user.role,
            orders : check_user.myorders
        }
    });
});


module.exports = {
    register,
    login,
    me,
}   