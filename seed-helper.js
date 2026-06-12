const AdminUser = require('./models/admin_user');
const bcrypt = require('bcrypt');

const seedAdmins = async () => {
    try {
        const adminsToSeed = [
            {
                name: 'Al-Hikmath Admin',
                email: 'admin@al-hikmath.com',
                password: 'Admin@1234',
                role: 'Super Admin',
                permissions: [
                    'manage_products',
                    'manage_orders',
                    'manage_customers',
                    'manage_categories',
                    'manage_reviews',
                    'manage_settings',
                    'view_dashboard',
                    'manage_admins'
                ]
            },
            {
                name: 'Default Admin',
                email: 'admin@gmail.com',
                password: 'admin@123',
                role: 'Super Admin',
                permissions: [
                    'manage_products',
                    'manage_orders',
                    'manage_customers',
                    'manage_categories',
                    'manage_reviews',
                    'manage_settings',
                    'view_dashboard',
                    'manage_admins'
                ]
            }
        ];

        for (const adminData of adminsToSeed) {
            const exists = await AdminUser.findOne({ email: adminData.email });
            if (!exists) {
                const hashedPassword = await bcrypt.hash(adminData.password, 10);
                await AdminUser.create({
                    ...adminData,
                    password: hashedPassword
                });
                console.log(`Seeded admin user: ${adminData.email}`);
            } else {
                console.log(`Admin user already exists: ${adminData.email}`);
            }
        }
    } catch (error) {
        console.error('Error seeding admin users:', error);
    }
};

module.exports = seedAdmins;
