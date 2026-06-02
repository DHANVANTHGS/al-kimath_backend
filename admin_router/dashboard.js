const Router = require('express').Router();
const { getDashboardStats } = require('../admin_controller.js/dashboard');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/stats', adminmiddleware, getDashboardStats);

module.exports = Router;
