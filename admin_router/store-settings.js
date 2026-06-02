const Router = require('express').Router();
const { getSettings, updateSettings } = require('../admin_controller.js/settings');
const { adminmiddleware } = require('../middleware/authmiddleware');

Router.get('/', adminmiddleware, getSettings);
Router.put('/', adminmiddleware, updateSettings);

module.exports = Router;
