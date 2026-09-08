


// const fs = require('fs/promises');
// const path = require('path');
// const db = require('../../config/db');
// const UserAuthModel = require('./userAuth.model');
// const { generateRefreshToken, generateToken } = require('../../utils/jwt');
// const { sendNimbusSms } = require('../../utils/sms');

// const normalizeMobile = (value) => String(value || '').replace(/\D/g, '').slice(-10);
// const isEnvTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

// const safeUnlink = async (relativePathValue) => {
//     const raw = String(relativePathValue || '').trim();
//     if (!raw || /^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) {
//         return;
//     }

//     const normalized = raw.replace(/^\/+/, '').replace(/\\/g, '/');
//     const absolutePath = path.resolve(__dirname, '../../../', normalized);

//     try {
//         await fs.unlink(absolutePath);
//     } catch (error) {
//         if (error?.code !== 'ENOENT') {
//             console.warn('[USER ACCOUNT DELETE] Failed to remove file:', absolutePath, error?.message || error);
//         }
//     }
// };

// const getGooglePlayReviewConfig = () => ({
//     enabled: isEnvTrue(process.env.GOOGLE_PLAY_REVIEW_ENABLED),
//     phone: normalizeMobile(process.env.GOOGLE_PLAY_REVIEW_PHONE),
//     otp: String(process.env.GOOGLE_PLAY_REVIEW_OTP || '').trim()
// });

// class UserAuthService {
//     static async createSessionPayload(user) {
//         const token = generateToken({ id: user.id, role: user.role, mobile: user.mobile });
//         const refreshToken = generateRefreshToken();
//         await UserAuthModel.createSession(user.id, refreshToken);
//         return { token, refreshToken, user };
//     }

//     static async devLogin({ mobile, countryCode }) {
//         const cleanMobile = normalizeMobile(mobile);

//         let user = await UserAuthModel.findByMobile(cleanMobile);
//         let isNewUser = false;

//         if (!user) {
//             isNewUser = true;
//             const id = await UserAuthModel.createUser({ mobile: cleanMobile, countryCode });
//             user = await UserAuthModel.findById(id);
//         } else {
//             user = await UserAuthModel.findById(user.id);
//         }

//         return {
//             ...await this.createSessionPayload(user),
//             isNewUser
//         };
//     }

//     static async sendOtp({ mobile, countryCode }) {
//         const cleanMobile = normalizeMobile(mobile);
//         const reviewConfig = getGooglePlayReviewConfig();

//         if (reviewConfig.enabled && cleanMobile === reviewConfig.phone) {
//             console.log('[GOOGLE PLAY REVIEW LOGIN]');
//             console.log('Review account detected');
//             console.log('Skipping Nimbus SMS');
//             console.log(`[GOOGLE PLAY REVIEW OTP] Phone: +91${cleanMobile}, OTP: ${reviewConfig.otp}`);

//             return {
//                 success: true,
//                 message: 'OTP sent successfully',
//                 reviewAccount: true,
//                 prepared: true
//             };
//         }

//         // Rate limiting: Max 5 OTPs per 15 minutes
//         const recentCount = await UserAuthModel.countRecentOtps(cleanMobile, 15);
//         if (recentCount >= 5) {
//             const error = new Error('Too many OTP requests. Please try again after 15 minutes.');
//             error.statusCode = 429;
//             throw error;
//         }

//         // Generate 6 digit OTP
//         const otp = Math.floor(100000 + Math.random() * 900000).toString();
//         console.log(`[OTP GENERATED] Mobile: ${cleanMobile}, OTP: ${otp}`);

//         // Invalidate old OTPs
//         await UserAuthModel.invalidateOldOtps(cleanMobile);

//         // Expiry 10 minutes from now
//         const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//         // Save OTP
//         await UserAuthModel.saveOtp(cleanMobile, otp, expiresAt);
//         console.log(`[OTP SAVED] Mobile: ${cleanMobile}`);

//         // Send SMS via Nimbus
//         await sendNimbusSms(cleanMobile, otp);

//         return { success: true, message: 'OTP sent successfully' };
//     }

//     static async resendOtp({ mobile }) {
//         return this.sendOtp({ mobile });
//     }

//     static async verifyOtp({ mobile, otp }) {
//         const cleanMobile = normalizeMobile(mobile);
//         const cleanOtp = String(otp || '').trim();
//         const reviewConfig = getGooglePlayReviewConfig();

//         if (reviewConfig.enabled && cleanMobile === reviewConfig.phone && cleanOtp === reviewConfig.otp) {
//             console.log('[GOOGLE PLAY REVIEW LOGIN]');
//             console.log('Review OTP accepted');

//             const data = await this.devLogin({ mobile: cleanMobile });

//             console.log('Review user logged in');

//             return {
//                 ...data,
//                 reviewAccount: true
//             };
//         }

//         const otpRecord = await UserAuthModel.findOtp(cleanMobile, cleanOtp);

//         if (!otpRecord) {
//             console.log(`[OTP VERIFY FAILED] Mobile: ${cleanMobile}, Reason: Invalid OTP`);
//             const error = new Error('Invalid OTP');
//             error.statusCode = 400;
//             throw error;
//         }

//         if (new Date() > new Date(otpRecord.expires_at)) {
//             console.log(`[OTP VERIFY FAILED] Mobile: ${cleanMobile}, Reason: OTP Expired`);
//             const error = new Error('OTP has expired');
//             error.statusCode = 400;
//             throw error;
//         }

//         // Mark OTP as verified
//         await UserAuthModel.markOtpVerified(otpRecord.id);
//         console.log(`[OTP VERIFY SUCCESS] Mobile: ${cleanMobile}`);

//         // Reuse devLogin logic to create or fetch user and generate token
//         return this.devLogin({ mobile: cleanMobile });
//     }

//     static async updateProfile(userId, { name, gender, email, city }) {
//         const user = await UserAuthModel.findById(userId);
//         if (!user) {
//             const error = new Error('User not found');
//             error.statusCode = 404;
//             throw error;
//         }

//         await UserAuthModel.updateProfile(userId, { name, gender, email, city });
//         const updated = await UserAuthModel.findById(userId);
//         return { user: updated };
//     }

//     static async updateAvatar(userId, avatar) {
//         const user = await UserAuthModel.findById(userId);
//         if (!user) {
//             const error = new Error('User not found');
//             error.statusCode = 404;
//             throw error;
//         }

//         await UserAuthModel.updateAvatar(userId, avatar);
//         const updated = await UserAuthModel.findById(userId);
//         return { user: updated, avatar };
//     }

//     static async refreshSession({ refreshToken }) {
//         if (!refreshToken) {
//             const error = new Error('Refresh token required');
//             error.statusCode = 401;
//             throw error;
//         }

//         const session = await UserAuthModel.findSessionForRefreshToken(refreshToken);
//         if (!session) {
//             const error = new Error('Session expired or revoked');
//             error.statusCode = 401;
//             throw error;
//         }

//         const user = await UserAuthModel.findById(session.user_id);
//         if (!user || String(user.status).toLowerCase() === 'deleted') {
//             const error = new Error('User session is invalid');
//             error.statusCode = 401;
//             throw error;
//         }

//         const nextRefreshToken = generateRefreshToken();
//         const rotated = await UserAuthModel.rotateSession(user.id, refreshToken, nextRefreshToken);
//         if (!rotated) {
//             const error = new Error('Session refresh failed');
//             error.statusCode = 401;
//             throw error;
//         }

//         const token = generateToken({ id: user.id, role: user.role, mobile: user.mobile });
//         return { token, refreshToken: nextRefreshToken, user };
//     }

//     static async logout({ userId, refreshToken = null }) {
//         if (!userId) {
//             return { success: true };
//         }

//         await UserAuthModel.revokeSessionForUser(userId, refreshToken || null);
//         return { success: true };
//     }

//     static async deleteAccount({ userId, ip, device }) {
//         const id = Number(userId);
//         if (!Number.isFinite(id) || id <= 0) {
//             const error = new Error('Invalid user id');
//             error.statusCode = 400;
//             throw error;
//         }

//         const conn = await db.getConnection();
//         let user = null;

//         try {
//             await conn.beginTransaction();

//             user = await UserAuthModel.findById(id, conn);
//             if (!user) {
//                 const error = new Error('User not found');
//                 error.statusCode = 404;
//                 throw error;
//             }

//             await conn.query(
//                 `
//                 UPDATE users
//                 SET
//                   name = NULL,
//                   email = NULL,
//                   gender = NULL,
//                   city = NULL,
//                   avatar = NULL,
//                   expo_push_token = NULL,
//                   status = 'deleted',
//                   updated_at = NOW()
//                 WHERE id = ?
//                 `,
//                 [id]
//             );

//             await UserAuthModel.revokeAllSessionsForUser(id);
//             await conn.query('DELETE FROM user_otp WHERE mobile = ?', [user.mobile]);

//             await conn.commit();
//         } catch (error) {
//             try {
//                 await conn.rollback();
//             } catch {
//                 // ignore
//             }
//             throw error;
//         } finally {
//             conn.release();
//         }

//         await safeUnlink(user?.avatar);

//         console.log('[USER ACCOUNT DELETE]', {
//             userId: id,
//             deletedTime: new Date().toISOString(),
//             ip: ip || null,
//             device: device || null,
//         });

//         return { success: true };
//     }
// }

// module.exports = UserAuthService;


const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/db');
const UserAuthModel = require('./userAuth.model');
const { generateRefreshToken, generateToken } = require('../../utils/jwt');
const { sendNimbusSms } = require('../../utils/sms');

const normalizeMobile = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const isEnvTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const safeUnlink = async (relativePathValue) => {
    const raw = String(relativePathValue || '').trim();
    if (!raw || /^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) {
        return;
    }

    const normalized = raw.replace(/^\/+/, '').replace(/\\/g, '/');
    const absolutePath = path.resolve(__dirname, '../../../', normalized);

    try {
        await fs.unlink(absolutePath);
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            console.warn('[USER ACCOUNT DELETE] Failed to remove file:', absolutePath, error?.message || error);
        }
    }
};

const getGooglePlayReviewConfig = () => ({
    enabled: isEnvTrue(process.env.GOOGLE_PLAY_REVIEW_ENABLED),
    phone: normalizeMobile(process.env.GOOGLE_PLAY_REVIEW_PHONE),
    otp: String(process.env.GOOGLE_PLAY_REVIEW_OTP || '').trim()
});

class UserAuthService {
    static async createSessionPayload(user) {
        const token = generateToken({ id: user.id, role: user.role, mobile: user.mobile });
        const refreshToken = generateRefreshToken();
        await UserAuthModel.createSession(user.id, refreshToken);
        return { token, refreshToken, user };
    }

    static async devLogin({ mobile, countryCode }) {
        const cleanMobile = normalizeMobile(mobile);

        let user = await UserAuthModel.findByMobile(cleanMobile);
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const id = await UserAuthModel.createUser({ mobile: cleanMobile, countryCode });
            user = await UserAuthModel.findById(id);
        } else {
            user = await UserAuthModel.findById(user.id);
        }

        return {
            ...await this.createSessionPayload(user),
            isNewUser
        };
    }

    static async sendOtp({ mobile, countryCode }) {
        const cleanMobile = normalizeMobile(mobile);
        const reviewConfig = getGooglePlayReviewConfig();

        if (reviewConfig.enabled && cleanMobile === reviewConfig.phone) {
            console.log('[GOOGLE PLAY REVIEW LOGIN]');
            console.log('Review account detected');
            console.log('Skipping Nimbus SMS');
            console.log('[OTP] review OTP requested');

            return {
                success: true,
                message: 'OTP sent successfully',
                reviewAccount: true,
                prepared: true
            };
        }

        // Rate limiting: Max 5 OTPs per 15 minutes
        const recentCount = await UserAuthModel.countRecentOtps(cleanMobile, 15);
        if (recentCount >= 5) {
            const error = new Error('Too many OTP requests. Please try again after 15 minutes.');
            error.statusCode = 429;
            throw error;
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('[OTP] generated successfully');

        // Invalidate old OTPs
        await UserAuthModel.invalidateOldOtps(cleanMobile);

        // Expiry 10 minutes from now
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Save OTP
        await UserAuthModel.saveOtp(cleanMobile, otp, expiresAt);
        console.log('[OTP] saved');

        // Send SMS via Nimbus
        await sendNimbusSms(cleanMobile, otp);

        return { success: true, message: 'OTP sent successfully' };
    }

    static async resendOtp({ mobile }) {
        return this.sendOtp({ mobile });
    }

    static async verifyOtp({ mobile, otp }) {
        const cleanMobile = normalizeMobile(mobile);
        const cleanOtp = String(otp || '').trim();
        const reviewConfig = getGooglePlayReviewConfig();

        if (reviewConfig.enabled && cleanMobile === reviewConfig.phone && cleanOtp === reviewConfig.otp) {
            console.log('[GOOGLE PLAY REVIEW LOGIN]');
            console.log('Review OTP accepted');

            const data = await this.devLogin({ mobile: cleanMobile });

            console.log('Review user logged in');

            return {
                ...data,
                reviewAccount: true
            };
        }

        const otpRecord = await UserAuthModel.findOtp(cleanMobile, cleanOtp);

        if (!otpRecord) {
            console.log('[OTP] verification failed: invalid code');
            const error = new Error('Invalid OTP');
            error.statusCode = 400;
            throw error;
        }

        if (new Date() > new Date(otpRecord.expires_at)) {
            console.log('[OTP] verification failed: expired code');
            const error = new Error('OTP has expired');
            error.statusCode = 400;
            throw error;
        }

        // Mark OTP as verified
        await UserAuthModel.markOtpVerified(otpRecord.id);
        console.log('[OTP] verification succeeded');

        // Reuse devLogin logic to create or fetch user and generate token
        return this.devLogin({ mobile: cleanMobile });
    }

    static async updateProfile(userId, { name, gender, email, city }) {
        const user = await UserAuthModel.findById(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await UserAuthModel.updateProfile(userId, { name, gender, email, city });
        const updated = await UserAuthModel.findById(userId);
        return { user: updated };
    }

    static async updateAvatar(userId, avatar) {
        const user = await UserAuthModel.findById(userId);
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await UserAuthModel.updateAvatar(userId, avatar);
        const updated = await UserAuthModel.findById(userId);
        return { user: updated, avatar };
    }

    static async refreshSession({ refreshToken }) {
        if (!refreshToken) {
            const error = new Error('Refresh token required');
            error.statusCode = 401;
            throw error;
        }

        const session = await UserAuthModel.findSessionForRefreshToken(refreshToken);
        if (!session) {
            const error = new Error('Session expired or revoked');
            error.statusCode = 401;
            throw error;
        }

        const user = await UserAuthModel.findById(session.user_id);
        if (!user || String(user.status).toLowerCase() === 'deleted') {
            const error = new Error('User session is invalid');
            error.statusCode = 401;
            throw error;
        }

        const nextRefreshToken = generateRefreshToken();
        const rotated = await UserAuthModel.rotateSession(user.id, refreshToken, nextRefreshToken);
        if (!rotated) {
            const error = new Error('Session refresh failed');
            error.statusCode = 401;
            throw error;
        }

        const token = generateToken({ id: user.id, role: user.role, mobile: user.mobile });
        return { token, refreshToken: nextRefreshToken, user };
    }

    static async logout({ userId, refreshToken = null }) {
        if (!userId) {
            return { success: true };
        }

        await UserAuthModel.revokeSessionForUser(userId, refreshToken || null);
        return { success: true };
    }

    static async deleteAccount({ userId, ip, device, rejectAlreadyDeleted = false }) {
        const id = Number(userId);
        if (!Number.isFinite(id) || id <= 0) {
            const error = new Error('Invalid user id');
            error.statusCode = 400;
            throw error;
        }

        const conn = await db.getConnection();
        let user = null;

        try {
            await conn.beginTransaction();

            user = await UserAuthModel.findById(id, conn);
            if (!user) {
                const error = new Error('User not found');
                error.statusCode = 404;
                throw error;
            }

            if (rejectAlreadyDeleted && String(user.status || '').toLowerCase() === 'deleted') {
                const error = new Error('User account is already deleted');
                error.statusCode = 409;
                throw error;
            }

            await conn.query(
                `
                UPDATE users
                SET
                                    mobile = CONCAT('deleted_', id),
                                    country_code = NULL,
                  name = NULL,
                  email = NULL,
                  gender = NULL,
                  city = NULL,
                  avatar = NULL,
                  expo_push_token = NULL,
                  status = 'deleted',
                  updated_at = NOW()
                WHERE id = ?
                `,
                [id]
            );

            await UserAuthModel.revokeAllSessionsForUser(id, conn);
            await conn.query('DELETE FROM user_otp WHERE mobile = ?', [user.mobile]);

            await conn.commit();
        } catch (error) {
            try {
                await conn.rollback();
            } catch {
                // ignore
            }
            throw error;
        } finally {
            conn.release();
        }

        await safeUnlink(user?.avatar);

        console.log('[USER ACCOUNT DELETE]', {
            userId: id,
            deletedTime: new Date().toISOString(),
            ip: ip || null,
            device: device || null,
        });

        return { success: true };
    }
}

module.exports = UserAuthService;
