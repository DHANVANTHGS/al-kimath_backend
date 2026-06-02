const Settings = require('../models/settings');
const expressAsyncHandler = require('express-async-handler');

// Get store settings
const getSettings = expressAsyncHandler(async (req, res) => {
    let settings = await Settings.findOne();

    if (!settings) {
        settings = await Settings.create({
            storeName: 'AL HIKMATH ENTERPRISES PVT LTD',
            storeAddress: 'No.16/127, Inbharajapuram 1st Street, Bajanai Kovil Street, Choolaimedu - 600094',
            phone1: '+91 9342698344',
            phone2: '+91 9342798344',
            email: 'contact@alhikmath.com',
            taxId: 'GSTIN29AAAAA1111A1Z1'
        });
    }

    res.status(200).json(settings);
});

// Update store settings
const updateSettings = expressAsyncHandler(async (req, res) => {
    const { storeName, storeAddress, phone1, phone2, email, taxId, logo, favicon, theme, currency, shippingCost, taxRate } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
        settings = await Settings.create(req.body);
    } else {
        Object.assign(settings, req.body);
        await settings.save();
    }

    res.status(200).json(settings);
});

module.exports = {
    getSettings,
    updateSettings
};
