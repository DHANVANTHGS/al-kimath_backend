# Admin Endpoints

Mounted under `/api/admin` in `server.js`.

## Authentication

- POST `/api/admin/login` — admin login — admin_controller: [admin_controller.js/auth.js](admin_controller.js/auth.js)

## Products

- GET `/api/admin/products` — list products — [admin_router/products.js](admin_router/products.js)
- GET `/api/admin/products/:id` — product detail — [admin_router/products.js](admin_router/products.js)
- POST `/api/admin/products` — create product — [admin_router/products.js](admin_router/products.js)
- PUT `/api/admin/products/:id` — update product — [admin_router/products.js](admin_router/products.js)
- DELETE `/api/admin/products/:id` — delete product — [admin_router/products.js](admin_router/products.js)
- POST `/api/admin/products/upload-images` — upload images — [admin_router/products.js](admin_router/products.js)
- DELETE `/api/admin/products/:productId/image/:imageId` — delete image — [admin_router/products.js](admin_router/products.js)

## Orders

- GET `/api/admin/orders` — list orders — [admin_router/orders.js](admin_router/orders.js)
- GET `/api/admin/orders/:id` — order detail — [admin_router/orders.js](admin_router/orders.js)
- POST `/api/admin/orders` — create order — [admin_router/orders.js](admin_router/orders.js)
- PUT `/api/admin/orders/:id/status` — update order status — [admin_router/orders.js](admin_router/orders.js)
- PUT `/api/admin/orders/:id` — update order — [admin_router/orders.js](admin_router/orders.js)
- DELETE `/api/admin/orders/:id` — delete order — [admin_router/orders.js](admin_router/orders.js)

## Categories

- GET `/api/admin/categories` — list categories — [admin_router/categories.js](admin_router/categories.js)
- GET `/api/admin/categories/:id` — category detail — [admin_router/categories.js](admin_router/categories.js)
- POST `/api/admin/categories` — create category — [admin_router/categories.js](admin_router/categories.js)
- PUT `/api/admin/categories/:id` — update category — [admin_router/categories.js](admin_router/categories.js)
- DELETE `/api/admin/categories/:id` — delete category — [admin_router/categories.js](admin_router/categories.js)

## Customers

- GET `/api/admin/customers` — list customers — [admin_router/customers.js](admin_router/customers.js)
- GET `/api/admin/customers/:id` — customer detail — [admin_router/customers.js](admin_router/customers.js)
- POST `/api/admin/customers` — create customer — [admin_router/customers.js](admin_router/customers.js)
- PUT `/api/admin/customers/:id` — update customer — [admin_router/customers.js](admin_router/customers.js)
- DELETE `/api/admin/customers/:id` — delete customer — [admin_router/customers.js](admin_router/customers.js)

## Reviews

- GET `/api/admin/reviews` — list reviews — [admin_router/reviews.js](admin_router/reviews.js)
- GET `/api/admin/reviews/:id` — review detail — [admin_router/reviews.js](admin_router/reviews.js)
- PUT `/api/admin/reviews/:id` — update review — [admin_router/reviews.js](admin_router/reviews.js)
- DELETE `/api/admin/reviews/:id` — delete review — [admin_router/reviews.js](admin_router/reviews.js)

## Settings (store-settings)

- GET `/api/admin/settings` — get store settings — [admin_router/store-settings.js](admin_router/store-settings.js)
- PUT `/api/admin/settings` — update store settings — [admin_router/store-settings.js](admin_router/store-settings.js)

## Dashboard

- GET `/api/admin/dashboard/stats` — dashboard stats — [admin_router/dashboard.js](admin_router/dashboard.js)

## Notes

- `admin_router/profile.js` and `admin_router/settings.js` exist but are not mounted in `server.js` (endpoints currently unreachable).
- All admin routes are protected by `adminmiddleware` or `admin_protect` as indicated in router files.
