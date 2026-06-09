const express = require('express');
const bodyparser = require('body-parser')
require('dotenv').config();
const auth = require('./router/auth');
const product = require('./router/product');
const order = require('./router/order');
const cart = require('./router/cart');
const review = require('./router/review');
const connectdb = require('./config');
const helmet = require('helmet');
const payment = require('./router/payment');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config');
const wishlist = require('./router/wishlist');

// Admin routes
const admin_products = require('./admin_router/products');
const admin_orders = require('./admin_router/orders');
const admin_categories = require('./admin_router/categories');
const admin_customers = require('./admin_router/customers');
const admin_reviews = require('./admin_router/reviews');
const admin_settings = require('./admin_router/store-settings');
const admin_dashboard = require('./admin_router/dashboard');
const admin_auth_routes = require('./admin_router/auth');

const app = express();

const port = process.env.PORT;

app.set('trust proxy', 1);

const path = require('path');

connectDB().then(() => {
    const seedAdmins = require('./seed-helper');
    seedAdmins();
});

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,
    hsts: {     //need to remove while in developement
        maxAge: 31536000,
        includeSubDomains: true,
    }
}));
app.use(express.json({ limit: '50mb' }));
app.use(bodyparser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
console.log(rawAllowedOrigins);
const envAllowedOrigins = rawAllowedOrigins
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
const allowedOrigins = envAllowedOrigins;
console.log('Environment Allowed Origins:',allowedOrigins);
if (!envAllowedOrigins.length) {
    console.warn('ALLOWED_ORIGINS is not set or empty; using default allowed origins.');
}
console.log('Allowed Origins:', allowedOrigins);

app.use(require('cors')({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        const sanitizedOrigin = origin.replace(/\/$/, '');
        
        const isAllowed = allowedOrigins.some(allowed => allowed.replace(/\/$/, '') === sanitizedOrigin);
        if (isAllowed) {
            return callback(null, true);
        }
        
        // Fallback: allow localhost, vercel.app and harshithaenterpries.com subdomains
        if (
            sanitizedOrigin.startsWith('http://localhost:') || 
            sanitizedOrigin.startsWith('https://localhost:') ||
            /https?:\/\/([a-z0-9-]+\.)?harshithaenterpries\.com$/i.test(sanitizedOrigin) ||
            /https?:\/\/([a-z0-9-]+\.)?vercel\.app$/i.test(sanitizedOrigin)
        ) {
            return callback(null, true);
        }
        
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
    credentials: true
}));

connectdb();

app.use((req, res, next) => {
    console.log(`Got request at ${req.url} with method ${req.method} from ${req.ip}`);
    next();
});
app.use('/api/auth',rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max : 10,
    message: 'Too many requests from this IP, please try again after 15 minutes'
}));
app.use('/api/auth',auth);
app.use('/api/product',product);
app.use('/api/cart',cart);
app.use('/api/order',rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max : 50,
    message: 'Too many requests from this IP, please try again after 15 minutes'
}));
app.use('/api/order',order);

app.get('/health',(req,res)=>{
    res.status(200).send({status: 'ok',message : "Backend is running"});
});
app.use('/api/wishlist',wishlist);
app.use('/api/payment',payment);
app.use('/api/review',review);


// Admin API Routes
app.use('/api/admin/products', admin_products);
app.use('/api/admin/orders', admin_orders);
app.use('/api/admin/categories', admin_categories);
app.use('/api/admin/customers', admin_customers);
app.use('/api/admin/reviews', admin_reviews);
app.use('/api/admin/settings', admin_settings);
app.use('/api/admin/dashboard', admin_dashboard);
app.use('/api/admin', admin_auth_routes);


app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

const server = app.listen(port, () => {
    console.log(`server is running on http://localhost:${port}`)
});

server.on ('error',(error)=>{
        console.error('Server execution error:', error);
})
