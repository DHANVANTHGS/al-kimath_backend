const Router = require('express').Router();
const {me, update_profile, change_password} = require('../admin_controller.js/profile');
const {admin_protect} = require('../middleware/authmiddleware');

Router.get('/me', admin_protect, me);
Router.put('/update', admin_protect, update_profile);
Router.put('/change-password', admin_protect, change_password);

module.exports = Router;