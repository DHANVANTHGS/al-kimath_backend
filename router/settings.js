const Router = require('express').Router();
const { getSettings } = require('../admin_controller.js/settings');

Router.get('/', getSettings);

module.exports = Router;
