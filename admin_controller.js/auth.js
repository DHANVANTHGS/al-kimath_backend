const AdminUser = require('../models/admin_user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const expressAsyncHandler = require('express-async-handler');

// Admin login
const login = expressAsyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const admin = await AdminUser.findOne({ email });
    if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (admin.lockUntil && admin.lockUntil > new Date()) {
        return res.status(403).json({ error: 'Account is locked. Try again later.' });
    }

    const isPasswordCorrect = await bcrypt.compare(password, admin.password);
    if (!isPasswordCorrect) {
        admin.loginAttempts = (admin.loginAttempts || 0) + 1;
        if (admin.loginAttempts >= 5) {
            admin.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        }
        await admin.save();
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset login attempts on successful login
    admin.loginAttempts = 0;
    admin.lockUntil = null;
    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
        { id: admin._id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.status(200).json({
        message: 'Login successful',
        token,
        admin: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            permissions: admin.permissions
        }
    });
});



module.exports = {
    login
};