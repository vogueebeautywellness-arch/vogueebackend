

// const express = require('express');
// const path = require('path');
// const fs = require('fs');
// const multer = require('multer');

// const db = require('../config/db');
// const generateOtp = require('../utils/generateOtp');
// const { sendExpoNotification } = require('../utils/sendExpoNotification');
// const { partnerProtect } = require('../middlewares/auth.middleware');

// const router = express.Router();

// const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'service_proofs');
// fs.mkdirSync(uploadDir, { recursive: true });

// const upload = multer({
//     dest: uploadDir,
//     limits: { fileSize: 8 * 1024 * 1024 },
//     fileFilter: (req, file, cb) => {
//         const type = String(file.mimetype || '').toLowerCase();
//         if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') return cb(null, true);
//         return cb(new Error('Only JPEG/PNG images are allowed'));
//     },
// });

// // POST /api/booking/upload-proof
// router.post('/upload-proof', partnerProtect, upload.single('image'), async (req, res, next) => {
//     try {
//         console.log('[PROOF BACKEND] upload-proof request received');
//         const { bookingId, notes } = req.body;
//         const partnerId = req.partner?.id;

//         if (!req.file) {
//             return res.status(400).json({ success: false, message: 'Image is required' });
//         }

//         const id = Number(bookingId);
//         if (!id || Number.isNaN(id)) {
//             return res.status(400).json({ success: false, message: 'bookingId is required' });
//         }

//         // Verify booking belongs to authenticated partner
//         const [bookingRows] = await db.query(
//             'SELECT id, partner_id, user_id, service_name FROM payments WHERE id = ?',
//             [id]
//         );

//         if (!bookingRows || !bookingRows.length) {
//             return res.status(404).json({ success: false, message: 'Booking not found' });
//         }

//         const booking = bookingRows[0];
//         if (booking.partner_id !== partnerId) {
//             return res.status(403).json({ success: false, message: 'Unauthorized: This booking does not belong to you' });
//         }

//         const otp = generateOtp();

//         await db.query(
//             `UPDATE payments
//        SET proof_image = ?, partner_notes = ?, service_otp = ?, proof_uploaded = 1
//        WHERE id = ?`,
//             [req.file.filename, notes || '', otp, id]
//         );

//         console.log('[PROOF BACKEND] upload-proof success');

//         // 🔥 SOCKET EMIT TO USER
//         try {
//             const io = req.app.get('io');
//             if (io && booking?.user_id != null && booking?.id != null) {
//                 // eslint-disable-next-line no-console
//                 console.log('EMIT PROOF TO:', `user:${booking.user_id}`);
//                 io.to(`user:${booking.user_id}`).emit('serviceProofUploaded', {
//                     bookingId: String(booking.id),
//                     proof_image: String(req.file.filename || ''),
//                     notes: String(notes || ''),
//                     hasOtp: Boolean(otp)
//                 });
//             }
//         } catch {
//             // ignore
//         }

//         // Send notification to user that proof has been uploaded
//         try {
//             if (booking?.user_id) {
//                 const [userRows] = await db.query(
//                     'SELECT expo_push_token FROM users WHERE id = ?',
//                     [booking.user_id]
//                 );
//                 const userToken = userRows?.[0]?.expo_push_token;
//                 if (userToken) {
//                     void sendExpoNotification(
//                         userToken,
//                         'Service Proof Received',
//                         `We've received the proof for your ${booking.service_name} service. Please verify the OTP.`,
//                         {
//                             bookingId: booking.id,
//                             screen: 'BookingDetails',
//                         },
//                         {
//                             type: 'SERVICE_PROOF_UPLOADED',
//                             eventId: `booking_${booking.id}_PROOF_UPLOADED`,
//                             recipientId: booking.user_id,
//                             recipientRole: 'user',
//                         }
//                     ).catch(() => { });
//                 }
//             }
//         } catch (err) {
//             // eslint-disable-next-line no-console
//             console.warn('[upload-proof] Failed to send notification:', err?.message || err);
//         }

//         return res.json({ success: true });
//     } catch (err) {
//         return next(err);
//     }
// });

// // POST /api/booking/verify-otp
// router.post('/verify-otp', async (req, res, next) => {
//     try {
//         const { bookingId, otp } = req.body || {};

//         const id = Number(bookingId);
//         if (!id || Number.isNaN(id)) {
//             return res.status(400).json({ success: false, message: 'bookingId is required' });
//         }

//         const code = String(otp || '').trim();
//         if (!code) {
//             return res.status(400).json({ success: false, message: 'otp is required' });
//         }

//         const [rows] = await db.query('SELECT id, service_otp, user_id, service_name, partner_id, booking_status, booking_type, service_mode FROM payments WHERE id = ?', [id]);
//         if (!rows || !rows.length) {
//             return res.status(404).json({ success: false, message: 'Not found' });
//         }

//         if (String(rows[0].service_otp || '') !== code) {
//             return res.status(400).json({ success: false, message: 'Invalid OTP' });
//         }

//         const [updateResult] = await db.query(
//             `UPDATE payments
//        SET booking_status = 'completed'
//        WHERE id = ? AND booking_status <> 'completed'`,
//             [id]
//         );

//         if (Number(updateResult?.affectedRows || 0) !== 1) {
//             return res.json({ success: true, alreadyCompleted: true });
//         }

//         const booking = rows[0];
//         const isSalonVisit = String(booking.booking_type || '').trim() === 'visit_salon'
//             || String(booking.service_mode || '').trim() === 'visit_salon';
//         const io = req.app.get('io');
//         const completedPayload = { bookingId: id, status: 'completed', booking_status: 'completed' };
//         if (io) {
//             io.to(`user:${booking.user_id}`).emit('bookingStatusUpdate', completedPayload);
//             io.to(`partner:${booking.partner_id}`).emit('bookingStatusUpdate', completedPayload);
//         }

//         // Push delivery is best-effort and must not affect completion success.
//         try {
//             const [userRows] = await db.query(
//                 `SELECT u.expo_push_token AS user_token, p.expo_push_token AS partner_token
//                  FROM users u LEFT JOIN partners p ON p.id = ? WHERE u.id = ?`,
//                 [booking.partner_id, booking.user_id]
//             );
//             const recipient = userRows?.[0];
//             if (recipient?.user_token) {
//                 void sendExpoNotification(
//                     recipient.user_token,
//                     'Service Completed',
//                     isSalonVisit ? 'Your salon service has been completed.' : 'Your service has been completed successfully.',
//                     { bookingId: id, screen: 'BookingHistory' },
//                     {
//                         type: isSalonVisit ? 'SALON_SERVICE_COMPLETED' : 'SERVICE_COMPLETED',
//                         eventId: `booking_${id}_COMPLETED`,
//                         recipientId: booking.user_id,
//                         recipientRole: 'user',
//                     }
//                 ).catch(() => { });
//             }
//             if (recipient?.partner_token) {
//                 void sendExpoNotification(
//                     recipient.partner_token,
//                     'Service Completed',
//                     `Service for booking #${id} has been completed.`,
//                     { bookingId: id, screen: 'BookingsOverview' },
//                     {
//                         type: 'SERVICE_COMPLETED',
//                         eventId: `booking_${id}_COMPLETED`,
//                         recipientId: booking.partner_id,
//                         recipientRole: 'partner',
//                     }
//                 ).catch(() => { });
//             }
//         } catch (err) {
//             // eslint-disable-next-line no-console
//             console.warn('[verify-otp] Failed to send notification:', err?.message || err);
//         }

//         return res.json({ success: true });
//     } catch (err) {
//         return next(err);
//     }
// });

// module.exports = router;


const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const db = require('../config/db');
const generateOtp = require('../utils/generateOtp');
const { sendExpoNotification } = require('../utils/sendExpoNotification');
const { partnerProtect } = require('../middlewares/auth.middleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'service_proofs');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const type = String(file.mimetype || '').toLowerCase();
        if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') return cb(null, true);
        return cb(new Error('Only JPEG/PNG images are allowed'));
    },
});

// POST /api/booking/upload-proof
router.post('/upload-proof', partnerProtect, upload.single('image'), async (req, res, next) => {
    try {
        console.log('[PROOF BACKEND] upload-proof request received');
        const { bookingId, notes } = req.body;
        const partnerId = req.partner?.id;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        const id = Number(bookingId);
        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ success: false, message: 'bookingId is required' });
        }

        // Verify booking belongs to authenticated partner
        const [bookingRows] = await db.query(
            `SELECT id, partner_id, user_id, service_name,
                    COALESCE(NULLIF(TRIM(booking_type), ''), NULLIF(TRIM(service_mode), ''), 'home') AS booking_type
             FROM payments WHERE id = ?`,
            [id]
        );

        if (!bookingRows || !bookingRows.length) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const booking = bookingRows[0];
        if (booking.partner_id !== partnerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: This booking does not belong to you' });
        }

        const otp = generateOtp();

        await db.query(
            `UPDATE payments
       SET proof_image = ?, partner_notes = ?, service_otp = ?, proof_uploaded = 1
       WHERE id = ?`,
            [req.file.filename, notes || '', otp, id]
        );

        console.log('[PROOF BACKEND] upload-proof success');

        // 🔥 SOCKET EMIT TO USER
        try {
            const io = req.app.get('io');
            if (io && booking?.user_id != null && booking?.id != null) {
                // eslint-disable-next-line no-console
                console.log('EMIT PROOF TO:', `user:${booking.user_id}`);
                io.to(`user:${booking.user_id}`).emit('serviceProofUploaded', {
                    bookingId: String(booking.id),
                    proof_image: String(req.file.filename || ''),
                    notes: String(notes || ''),
                    hasOtp: Boolean(otp)
                });
            }
        } catch {
            // ignore
        }

        // Send notification to user that proof has been uploaded
        try {
            if (booking?.user_id) {
                const [userRows] = await db.query(
                    'SELECT expo_push_token FROM users WHERE id = ?',
                    [booking.user_id]
                );
                const userToken = userRows?.[0]?.expo_push_token;
                if (userToken) {
                    void sendExpoNotification(
                        userToken,
                        'Service Proof Received',
                        `We've received the proof for your ${booking.service_name} service. Please verify the OTP.`,
                        {
                            bookingId: booking.id,
                            screen: 'BookingDetails',
                        },
                        {
                            type: 'SERVICE_PROOF_UPLOADED',
                            eventId: `booking_${booking.id}_PROOF_UPLOADED`,
                            recipientId: booking.user_id,
                            recipientRole: 'user',
                        }
                    ).catch(() => { });
                }
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[upload-proof] Failed to send notification:', err?.message || err);
        }

        try {
            const bookingType = String(booking.booking_type || '').trim().toLowerCase();
            if (['home', 'at_home', 'instant', 'near', 'scheduled'].includes(bookingType) && booking?.user_id) {
                const [userRows] = await db.query(
                    'SELECT expo_push_token FROM users WHERE id = ?',
                    [booking.user_id]
                );
                const userToken = userRows?.[0]?.expo_push_token;
                if (userToken) {
                    void sendExpoNotification(
                        userToken,
                        'Your Service OTP',
                        `Your OTP for ${booking.service_name} service is ${otp}. Share it with your partner to complete the service.`,
                        {
                            bookingId: booking.id,
                            otp,
                            screen: 'BookingDetails',
                        },
                        {
                            type: 'SERVICE_OTP_GENERATED',
                            eventId: `booking_${booking.id}_OTP_GENERATED_${otp}`,
                            recipientId: booking.user_id,
                            recipientRole: 'user',
                        }
                    ).catch(() => { });
                }
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[upload-proof] Failed to send OTP notification:', err?.message || err);
        }

        return res.json({ success: true });
    } catch (err) {
        return next(err);
    }
});

// POST /api/booking/verify-otp
router.post('/verify-otp', async (req, res, next) => {
    try {
        const { bookingId, otp } = req.body || {};

        const id = Number(bookingId);
        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ success: false, message: 'bookingId is required' });
        }

        const code = String(otp || '').trim();
        if (!code) {
            return res.status(400).json({ success: false, message: 'otp is required' });
        }

        const [rows] = await db.query('SELECT id, service_otp, user_id, service_name, partner_id, booking_status, booking_type, service_mode, final_amount_after_discount, amount FROM payments WHERE id = ?', [id]);
        if (!rows || !rows.length) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }

        if (String(rows[0].service_otp || '') !== code) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        const [updateResult] = await db.query(
            `UPDATE payments
       SET booking_status = 'completed'
       WHERE id = ? AND booking_status <> 'completed'`,
            [id]
        );

        if (Number(updateResult?.affectedRows || 0) !== 1) {
            return res.json({ success: true, alreadyCompleted: true });
        }

        // Trigger Referral Commission Calculation (PDF Rule #15)
        try {
            const ReferralModel = require('../modules/referral/referral.model');
            const booking = rows[0];
            const serviceAmount = Number(booking.final_amount_after_discount || booking.amount || 0);
            if (serviceAmount > 0) {
                await ReferralModel.createCommissionForCompletedService(booking.id, booking.user_id, serviceAmount);
            }
        } catch (refErr) {
            console.warn('[referral] Commission trigger warning:', refErr?.message || refErr);
        }

        const booking = rows[0];
        const isSalonVisit = String(booking.booking_type || '').trim() === 'visit_salon'
            || String(booking.service_mode || '').trim() === 'visit_salon';
        const io = req.app.get('io');
        const completedPayload = { bookingId: id, status: 'completed', booking_status: 'completed' };
        if (io) {
            io.to(`user:${booking.user_id}`).emit('bookingStatusUpdate', completedPayload);
            io.to(`partner:${booking.partner_id}`).emit('bookingStatusUpdate', completedPayload);
        }

        // Push delivery is best-effort and must not affect completion success.
        try {
            const [userRows] = await db.query(
                `SELECT u.expo_push_token AS user_token, p.expo_push_token AS partner_token
                 FROM users u LEFT JOIN partners p ON p.id = ? WHERE u.id = ?`,
                [booking.partner_id, booking.user_id]
            );
            const recipient = userRows?.[0];
            if (recipient?.user_token) {
                void sendExpoNotification(
                    recipient.user_token,
                    'Service Completed',
                    isSalonVisit ? 'Your salon service has been completed.' : 'Your service has been completed successfully.',
                    { bookingId: id, screen: 'BookingHistory' },
                    {
                        type: isSalonVisit ? 'SALON_SERVICE_COMPLETED' : 'SERVICE_COMPLETED',
                        eventId: `booking_${id}_COMPLETED`,
                        recipientId: booking.user_id,
                        recipientRole: 'user',
                    }
                ).catch(() => { });
            }
            if (recipient?.partner_token) {
                void sendExpoNotification(
                    recipient.partner_token,
                    'Service Completed',
                    `Service for booking #${id} has been completed.`,
                    { bookingId: id, screen: 'BookingsOverview' },
                    {
                        type: 'SERVICE_COMPLETED',
                        eventId: `booking_${id}_COMPLETED`,
                        recipientId: booking.partner_id,
                        recipientRole: 'partner',
                    }
                ).catch(() => { });
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[verify-otp] Failed to send notification:', err?.message || err);
        }

        return res.json({ success: true });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
