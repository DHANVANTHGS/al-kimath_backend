const Router = require('express').Router();
const {register, login, me} = require('../controller/auth');
const { authmiddleware } = require('../middleware/authmiddleware');

Router.post('/register', register);
Router.post('/login', login);
Router.get('/me', authmiddleware, me);

module.exports = Router;