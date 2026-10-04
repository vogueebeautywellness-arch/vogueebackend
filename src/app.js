const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const { errorMiddleware } = require('./middlewares/error.middleware');
const { errorResponse } = require('./utils/response');

const adminAuthRoutes = require('./modules/adminAuth/adminAuth.route');
const adminDashboardRoutes = require('./modules/adminDashboard/adminDashboard.route');
const adminUserRoutes = require('./routes/adminUser.routes');
const adminBookingRoutes = require('./routes/adminBooking.routes');
const adminPartnerRoutes = require('./routes/adminPartner.routes');
const adminPayoutRoutes = require('./routes/adminPayout.routes');
const userAuthRoutes = require('./modules/userAuth/userAuth.route');
const partnerAuthRoutes = require('./modules/partnerAuth/partnerAuth.route');
const partnerKycRoutes = require('./modules/partnerKyc/partnerKyc.route');
const partnerLocationRoutes = require('./modules/partnerLocation/partnerLocation.route');
const adminPartnerKycRoutes = require('./modules/adminPartnerKyc/adminPartnerKyc.route');
const partnerPaymentRoutes = require('./modules/partnerPayment/partnerPayment.route');
const partnerBookingRoutes = require('./routes/partnerBooking.routes');
const partnerEarningsRoutes = require('./routes/partnerEarnings.routes');
const bookingRetryRoutes = require('./routes/bookingRetry.routes');
const bookingProofRoutes = require('./routes/bookingProof.routes');
const expoRoutes = require('./routes/expo.routes');
const couponRoutes = require('./routes/coupon.routes');
const adminCouponRoutes = require('./routes/adminCoupon.routes');
const salonRoutes = require('./modules/salon/salon.route');

const { reviewRoutes, adminReviewRoutes } = require('./modules/reviews/review.routes');
const referralRoutes = require('./modules/referral/referral.route');

const app = express();
app.set("trust proxy", 1);
const publicCategoryRoutes = require('./modules/category/category.public.route');
const publicServiceRoutes = require('./modules/service/service.public.route');

// Security Middleware
// Allow static assets (like /uploads/*) to be embedded cross-origin in dev
// (frontend runs on a different port/origin than backend).
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
);
app.use(cors());

// Rate Limiting
const isProduction = process.env.NODE_ENV === 'production';
const createAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 100 : 10000, // Don't block local dev with low limits
    message: 'Too many requests from this IP, please try again later.',
    handler: (req, res, next, options) => {
        const msg = typeof options.message === 'string' ? options.message : 'Too many requests';
        return errorResponse(res, options.statusCode || 429, msg);
    }
});
app.use('/api', createAccountLimiter);

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('dev'));

// Static uploads
// Public assets under /uploads must be reachable without auth for image rendering.
app.use('/uploads', (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('Serving upload file:', req.path);
    }

    return next();
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/admin', adminBookingRoutes);
app.use('/api/admin', adminPartnerRoutes);
app.use('/api/admin', adminPayoutRoutes);
app.use('/api/admin', adminCouponRoutes);

// Admin Partner KYC
app.use('/api/admin/partner-kyc', adminPartnerKycRoutes);

// User auth
app.use('/api/user/auth', userAuthRoutes);

// Partner auth
app.use('/api/partner/auth', partnerAuthRoutes);

// Partner KYC (protected)
app.use('/api/partner/kyc', partnerKycRoutes);

// Partner location (protected)
app.use('/api/partner/location', partnerLocationRoutes);

// Partner payment (protected)
app.use('/api/partner/payment', partnerPaymentRoutes);

// Partner booking actions (protected)
// Exposes: POST /api/accept-booking
app.use('/api', partnerBookingRoutes);

// Partner earnings (protected)
// Exposes: GET /api/partner/salon-earnings
app.use('/api/partner', partnerEarningsRoutes);

// Booking retry (user)
// Exposes: POST /api/booking/retry
app.use('/api/booking', bookingRetryRoutes);

// Booking proof upload
// Exposes: POST /api/booking/upload-proof
app.use('/api/booking', bookingProofRoutes);

// Expo notifications
// Exposes: POST /api/expo/user/save-token, POST /api/expo/partner/save-token
app.use('/api/expo', expoRoutes);

// Coupons
app.use('/api/coupons', couponRoutes);

// Referral Partner Program
app.use('/api/referral', referralRoutes);

// Public API (no auth)
app.use('/api/categories', publicCategoryRoutes);
app.use('/api/services', publicServiceRoutes);
app.use('/api/salons', salonRoutes);
const categoryRoutes = require('./modules/category/category.route');
app.use('/api/admin/categories', categoryRoutes);

const serviceRoutes = require('./modules/service/service.route');
app.use('/api/admin/services', serviceRoutes);

const bannerRoutes = require('./modules/banner/banner.route');
app.use('/api/admin/banner', bannerRoutes);

// Payments
app.use('/api/payment', require('./modules/payment/payment.routes'));

// Reviews
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin/reviews', adminReviewRoutes);

// Error Handling Middleware
app.use(errorMiddleware);

module.exports = app;
