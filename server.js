require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const http = require('http');
const path = require('path');
const { attachSocket } = require('./socket/socket');
const { startBookingDispatchCron } = require('./src/utils/bookingDispatchCron');

const ensureDatabaseExists = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    await connection.end();
};

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        await ensureDatabaseExists();

        // Require app AFTER DB exists (pool uses DB_NAME)
        const app = require('./src/app');

        // Static uploads (proof images, etc.)
        // app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

        // Ensure tables via their models
        const AdminAuthModel = require('./src/modules/adminAuth/adminAuth.model');
        const UserAuthModel = require('./src/modules/userAuth/userAuth.model');
        const PartnerAuthModel = require('./src/modules/partnerAuth/partnerAuth.model');
        const PartnerKycModel = require('./src/modules/partnerKyc/partnerKyc.model');
        const PartnerPaymentModel = require('./src/modules/partnerPayment/partnerPayment.model');
        const CategoryModel = require('./src/modules/category/category.model');
        const ServiceModel = require('./src/modules/service/service.model');
        const BannerModel = require('./src/modules/banner/banner.model');
        const PaymentModel = require('./src/modules/payment/payment.model');
        const ReferralModel = require('./src/modules/referral/referral.model');
        await AdminAuthModel.ensureTables();
        await UserAuthModel.ensureTable();
        await PartnerAuthModel.ensureTable();
        await PartnerKycModel.ensureTable();
        await PartnerPaymentModel.ensureTable();
        await CategoryModel.ensureTable();
        await ServiceModel.ensureTable();
        await BannerModel.ensureTable();
        await PaymentModel.ensureTable();
        await ReferralModel.ensureTables();

        console.log('Database connection initialized successfully.');
        console.log('Database tables ensured.');

        const server = http.createServer(app);
        const io = attachSocket(server);
        // Expose io to routes/controllers via req.app.get('io')
        app.set('io', io);

        // Start DB-backed dispatch scheduler (survives restarts)
        startBookingDispatchCron();

        server.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.error(`Startup failed: Port ${PORT} is already in use. Close the other process using it and try again.`);
            } else {
                console.error('Startup failed: Server error:', err?.message || err);
            }
            process.exit(1);
        });

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Startup failed:', error.message);
        process.exit(1);
    }
};

start();
