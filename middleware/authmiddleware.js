const jsonwebtoken = require('jsonwebtoken');

const authmiddleware = (req,res,next)=>{
    const authheader= req.headers.authorization;
    if(!authheader || !authheader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authheader.split(" ")[1];
    if(!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized" });
    }
};

const adminmiddleware = (req,res,next)=>{
    const authheader = req.headers.authorization;
    if(!authheader || !authheader.startsWith("Bearer ")) { 
        return res.status(401).json({message: "Unauthorized"});
    }
    const token = authheader.split(" ")[1];
    if(!token) {
        return res.status(401).json({message: "Unauthorized"});
    }
    try {
        const decoded = jsonwebtoken.verify(token,process.env.JWT_SECRET);
        if(decoded.role !== 'Admin' && decoded.role !== 'Super Admin') {
            return res.status(403).json({message: "Forbidden"});
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({message: "Unauthorized"});
    }
};

module.exports = { authmiddleware, adminmiddleware };