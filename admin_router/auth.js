const Router = require('express').Router();
const {login} = require('../admin_controller.js/auth');
const {adminmiddleware} = require('../middleware/authmiddleware');

Router.post('/login', login);


module.exports = Router;