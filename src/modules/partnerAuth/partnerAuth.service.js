


// const fs = require('fs/promises');
// const path = require('path');
// const db = require('../../config/db');
// const PartnerAuthModel = require('./partnerAuth.model');
// const PartnerKycModel = require('../partnerKyc/partnerKyc.model');
// const { generateRefreshToken, generateToken } = require('../../utils/jwt');
// const { sendNimbusSms } = require('../../utils/sms');

// const normalizeMobile = (value) => String(value || '').replace(/\D/g, '').slice(-10);
// const isEnvTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

// const getPartnerGooglePlayReviewConfig = () => ({
//     enabled: isEnvTrue(process.env.PARTNER_GOOGLE_PLAY_REVIEW_ENABLED),
//     phone: normalizeMobile(process.env.PARTNER_GOOGLE_PLAY_REVIEW_PHONE),
//     otp: String(process.env.PARTNER_GOOGLE_PLAY_REVIEW_OTP || '').trim(),
// });

// const parseArrayValue = (value) => {
//     if (Array.isArray(value)) return value.filter(Boolean);
//     if (typeof value === 'string') {
//         const trimmed = value.trim();
//         if (!trimmed) return [];
//         try {
//             const parsed = JSON.parse(trimmed);
//             return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
//         } catch {
//             return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
//         }
//     }
//     return [];
// };

// const isDeletedPartner = (partner) => String(partner?.status || '').trim().toLowerCase() === 'deleted';

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
//             console.warn('[PARTNER ACCOUNT DELETE] Failed to remove file:', absolutePath, error?.message || error);
//         }
//     }
// };

// const parseStoredArray = (value) => {
//     if (Array.isArray(value)) {
//         return value.filter(Boolean);
//     }

//     if (typeof value === 'string') {
//         const trimmed = value.trim();
//         if (!trimmed) return [];

//         try {
//             const parsed = JSON.parse(trimmed);
//             return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
//         } catch {
//             return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
//         }
//     }

//     return [];
// };

// class PartnerAuthService {
//     static async createSessionPayload(partner) {
//         const token = generateToken({ id: partner.id, role: 'partner', mobile: partner.mobile });
//         const refreshToken = generateRefreshToken();
//         await PartnerAuthModel.createSession(partner.id, refreshToken);
//         return { token, refreshToken, partner };
//     }

//     static async devLogin({ mobile, countryCode, allowDeleted = false, reactivateDeleted = false } = {}) {
//         const cleanMobile = normalizeMobile(mobile);

//         let partner = await PartnerAuthModel.findByMobile(cleanMobile);
//         let isNewPartner = false;

//         if (partner && isDeletedPartner(partner)) {
//             isNewPartner = true;
//             const id = await PartnerAuthModel.createPartner({ mobile: cleanMobile, countryCode });
//             partner = await PartnerAuthModel.findById(id);
//         }

//         if (!partner) {
//             isNewPartner = true;
//             const id = await PartnerAuthModel.createPartner({ mobile: cleanMobile, countryCode });
//             partner = await PartnerAuthModel.findById(id);
//         } else {
//             partner = await PartnerAuthModel.findById(partner.id);
//         }

//         return {
//             ...(await this.createSessionPayload(partner)),
//             isNewPartner,
//         };
//     }

//     static async sendOtp({ mobile }) {
//         const cleanMobile = normalizeMobile(mobile);
//         const reviewConfig = getPartnerGooglePlayReviewConfig();

//         if (reviewConfig.enabled && cleanMobile === reviewConfig.phone) {
//             console.log('[GOOGLE PLAY PARTNER LOGIN]');
//             console.log('Review Partner detected');
//             console.log('Skipping Nimbus SMS');
//             console.log(`OTP Ready: ${reviewConfig.otp}`);

//             return { success: true, message: 'OTP sent successfully' };
//         }

//         // Rate limiting: Max 5 OTPs per 15 minutes
//         const recentCount = await PartnerAuthModel.countRecentOtps(cleanMobile, 15);
//         if (recentCount >= 5) {
//             const error = new Error('Too many OTP requests. Please try again after 15 minutes.');
//             error.statusCode = 429;
//             throw error;
//         }

//         // Generate 6 digit OTP
//         const otp = Math.floor(100000 + Math.random() * 900000).toString();
//         console.log(`[PARTNER OTP GENERATED] Mobile: ${cleanMobile}, OTP: ${otp}`);

//         // Invalidate old OTPs
//         await PartnerAuthModel.invalidateOldOtps(cleanMobile);

//         // Expiry 10 minutes from now
//         const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//         // Save OTP
//         await PartnerAuthModel.saveOtp(cleanMobile, otp, expiresAt);
//         console.log(`[PARTNER OTP SAVED] Mobile: ${cleanMobile}`);

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
//         const reviewConfig = getPartnerGooglePlayReviewConfig();

//         if (reviewConfig.enabled && cleanMobile === reviewConfig.phone && cleanOtp === reviewConfig.otp) {
//             console.log('[GOOGLE PLAY PARTNER LOGIN]');
//             console.log('Review OTP Accepted');
//             const data = await this.devLogin({ mobile: cleanMobile, countryCode: '+91' });
//             console.log('Partner Logged In Successfully');
//             return data;
//         }

//         const otpRecord = await PartnerAuthModel.findOtp(cleanMobile, cleanOtp);

//         if (!otpRecord) {
//             console.log(`[PARTNER OTP VERIFY FAILED] Mobile: ${cleanMobile}, Reason: Invalid OTP`);
//             const error = new Error('Invalid OTP');
//             error.statusCode = 400;
//             throw error;
//         }

//         if (new Date() > new Date(otpRecord.expires_at)) {
//             console.log(`[PARTNER OTP VERIFY FAILED] Mobile: ${cleanMobile}, Reason: OTP Expired`);
//             const error = new Error('OTP has expired');
//             error.statusCode = 400;
//             throw error;
//         }

//         // Mark OTP as verified
//         await PartnerAuthModel.markOtpVerified(otpRecord.id);
//         console.log(`[PARTNER OTP VERIFY SUCCESS] Mobile: ${cleanMobile}`);

//         // Reuse devLogin logic to create or fetch partner and generate token
//         return this.devLogin({ mobile: cleanMobile });
//     }

//     static async refreshSession({ refreshToken }) {
//         if (!refreshToken) {
//             const error = new Error('Refresh token required');
//             error.statusCode = 401;
//             throw error;
//         }

//         const session = await PartnerAuthModel.findSessionForRefreshToken(refreshToken);
//         if (!session) {
//             const error = new Error('Session expired or revoked');
//             error.statusCode = 401;
//             throw error;
//         }

//         const partner = await PartnerAuthModel.findById(session.partner_id);
//         if (!partner || String(partner.status).toLowerCase() === 'deleted') {
//             const error = new Error('Partner session is invalid');
//             error.statusCode = 401;
//             throw error;
//         }

//         const nextRefreshToken = generateRefreshToken();
//         const rotated = await PartnerAuthModel.rotateSession(partner.id, refreshToken, nextRefreshToken);
//         if (!rotated) {
//             const error = new Error('Session refresh failed');
//             error.statusCode = 401;
//             throw error;
//         }

//         const token = generateToken({ id: partner.id, role: 'partner', mobile: partner.mobile });
//         return { token, refreshToken: nextRefreshToken, partner };
//     }

//     static async logout({ partnerId, refreshToken = null }) {
//         if (!partnerId) {
//             return { success: true };
//         }

//         await PartnerAuthModel.revokeSessionForUser(partnerId, refreshToken || null);
//         return { success: true };
//     }

//     static async deleteAccount({ partnerId, ip, device }) {
//         const id = Number(partnerId);
//         if (!Number.isFinite(id) || id <= 0) {
//             const error = new Error('Invalid partner id');
//             error.statusCode = 400;
//             throw error;
//         }

//         const conn = await db.getConnection();
//         let partner = null;
//         let kyc = null;

//         try {
//             await conn.beginTransaction();

//             partner = await PartnerAuthModel.findById(id, conn);
//             if (!partner) {
//                 const error = new Error('Partner not found');
//                 error.statusCode = 404;
//                 throw error;
//             }

//             kyc = await PartnerKycModel.findByPartnerId(id, conn);

//             await conn.query(
//                 `
//                 UPDATE partners
//                 SET
//                   name = NULL,
//                   rating = NULL,
//                   experience = NULL,
//                   avatar = NULL,
//                   expo_push_token = NULL,
//                   status = 'deleted',
//                   updated_at = NOW()
//                 WHERE id = ?
//                 `,
//                 [id]
//             );

//             await PartnerAuthModel.revokeAllSessionsForUser(id);

//             if (kyc) {
//                 await conn.query(
//                     `
//                     UPDATE partner_kyc
//                     SET
//                       full_name = 'Deleted Partner',
//                       service_area = 'Deleted',
//                       service_latitude = NULL,
//                       service_longitude = NULL,
//                       experience = NULL,
//                       skills = '[]',
//                       salon_name = NULL,
//                       salon_address = NULL,
//                       salon_latitude = NULL,
//                       salon_longitude = NULL,
//                       salon_logo = NULL,
//                       salon_gallery = NULL,
//                       opening_time = NULL,
//                       closing_time = NULL,
//                       aadhaar_url = NULL,
//                       pan_url = NULL,
//                       certificate_url = NULL,
//                       selfie_url = NULL,
//                       kyc_status = 'rejected',
//                       updated_at = NOW()
//                     WHERE partner_id = ?
//                     `,
//                     [id]
//                 );
//             }

//             await conn.query('DELETE FROM partner_otp WHERE mobile = ?', [partner.mobile]);

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

//         const cleanupPaths = [partner?.avatar, kyc?.salon_logo, kyc?.aadhaar_url, kyc?.pan_url, kyc?.certificate_url, kyc?.selfie_url];
//         const galleryPaths = parseArrayValue(kyc?.salon_gallery);

//         for (const item of [...cleanupPaths, ...galleryPaths]) {
//             // eslint-disable-next-line no-await-in-loop
//             await safeUnlink(item);
//         }

//         console.log('[PARTNER ACCOUNT DELETE]', {
//             partnerId: id,
//             deletedTime: new Date().toISOString(),
//             ip: ip || null,
//             device: device || null,
//         });

//         return { success: true };
//     }

//     static async me(partnerId) {
//         const row = await PartnerAuthModel.findByIdWithKyc(partnerId);
//         if (!row) {
//             const error = new Error('Partner not found');
//             error.statusCode = 404;
//             throw error;
//         }

//         const partner = {
//             id: row.id,
//             mobile: row.mobile,
//             country_code: row.country_code,
//             name: row.name,
//             rating: row.rating,
//             experience: row.experience,
//             avatar: row.avatar,
//             kyc_status: row.kyc_status,
//             status: row.status,
//             upi_id: row.upi_id,
//             upi_verified: row.upi_verified,
//             upi_verified_at: row.upi_verified_at,
//             created_at: row.created_at,
//             updated_at: row.updated_at,
//         };
//         const kyc = row.kyc_id
//             ? {
//                 id: row.kyc_id,
//                 partner_id: row.id,
//                 partner_type: row.partner_type || 'solo_partner',
//                 full_name: row.kyc_full_name || row.name || null,
//                 mobile: row.mobile,
//                 service_area: row.service_area,
//                 service_latitude: row.service_latitude,
//                 service_longitude: row.service_longitude,
//                 experience: row.kyc_experience || row.experience || null,
//                 skills: parseArrayValue(row.skills),
//                 salon_name: row.salon_name,
//                 salon_address: row.salon_address,
//                 salon_latitude: row.salon_latitude,
//                 salon_longitude: row.salon_longitude,
//                 salon_logo: row.salon_logo,
//                 salon_gallery: parseArrayValue(row.salon_gallery),
//                 opening_time: row.opening_time,
//                 closing_time: row.closing_time,
//                 aadhaar_url: row.aadhaar_url,
//                 pan_url: row.pan_url,
//                 certificate_url: row.certificate_url,
//                 selfie_url: row.selfie_url,
//                 kyc_status: row.kyc_record_status || kyc_status || 'pending',
//                 submit_count: row.kyc_submit_count || 0,
//             }
//             : null;

//         return { partner, kyc };
//     }
// }

// module.exports = PartnerAuthService;


const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/db');
const PartnerAuthModel = require('./partnerAuth.model');
const PartnerKycModel = require('../partnerKyc/partnerKyc.model');
const { generateRefreshToken, generateToken } = require('../../utils/jwt');
const { sendNimbusSms } = require('../../utils/sms');

const normalizeMobile = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const isEnvTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const getPartnerGooglePlayReviewConfig = () => ({
    enabled: isEnvTrue(process.env.PARTNER_GOOGLE_PLAY_REVIEW_ENABLED),
    phone: normalizeMobile(process.env.PARTNER_GOOGLE_PLAY_REVIEW_PHONE),
    otp: String(process.env.PARTNER_GOOGLE_PLAY_REVIEW_OTP || '').trim(),
});

const parseArrayValue = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }
    return [];
};

const isDeletedPartner = (partner) => String(partner?.status || '').trim().toLowerCase() === 'deleted';

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
            console.warn('[PARTNER ACCOUNT DELETE] Failed to remove file:', absolutePath, error?.message || error);
        }
    }
};

const parseStoredArray = (value) => {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];

        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }

    return [];
};

class PartnerAuthService {
    static async createSessionPayload(partner) {
        const token = generateToken({ id: partner.id, role: 'partner', mobile: partner.mobile });
        const refreshToken = generateRefreshToken();
        await PartnerAuthModel.createSession(partner.id, refreshToken);
        return { token, refreshToken, partner };
    }

    static async devLogin({ mobile, countryCode, allowDeleted = false, reactivateDeleted = false } = {}) {
        const cleanMobile = normalizeMobile(mobile);

        let partner = await PartnerAuthModel.findByMobile(cleanMobile);
        let isNewPartner = false;

        if (partner && isDeletedPartner(partner)) {
            isNewPartner = true;
            const id = await PartnerAuthModel.createPartner({ mobile: cleanMobile, countryCode });
            partner = await PartnerAuthModel.findById(id);
        }

        if (!partner) {
            isNewPartner = true;
            const id = await PartnerAuthModel.createPartner({ mobile: cleanMobile, countryCode });
            partner = await PartnerAuthModel.findById(id);
        } else {
            partner = await PartnerAuthModel.findById(partner.id);
        }

        return {
            ...(await this.createSessionPayload(partner)),
            isNewPartner,
        };
    }

    static async sendOtp({ mobile }) {
        const cleanMobile = normalizeMobile(mobile);
        const reviewConfig = getPartnerGooglePlayReviewConfig();

        if (reviewConfig.enabled && cleanMobile === reviewConfig.phone) {
            console.log('[GOOGLE PLAY PARTNER LOGIN]');
            console.log('Review Partner detected');
            console.log('Skipping Nimbus SMS');
            console.log('[OTP] review OTP requested');

            return { success: true, message: 'OTP sent successfully' };
        }

        // Rate limiting: Max 5 OTPs per 15 minutes
        const recentCount = await PartnerAuthModel.countRecentOtps(cleanMobile, 15);
        if (recentCount >= 5) {
            const error = new Error('Too many OTP requests. Please try again after 15 minutes.');
            error.statusCode = 429;
            throw error;
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('[OTP] generated successfully');

        // Invalidate old OTPs
        await PartnerAuthModel.invalidateOldOtps(cleanMobile);

        // Expiry 10 minutes from now
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Save OTP
        await PartnerAuthModel.saveOtp(cleanMobile, otp, expiresAt);
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
        const reviewConfig = getPartnerGooglePlayReviewConfig();

        if (reviewConfig.enabled && cleanMobile === reviewConfig.phone && cleanOtp === reviewConfig.otp) {
            console.log('[GOOGLE PLAY PARTNER LOGIN]');
            console.log('Review OTP Accepted');
            const data = await this.devLogin({ mobile: cleanMobile, countryCode: '+91' });
            console.log('Partner Logged In Successfully');
            return data;
        }

        const otpRecord = await PartnerAuthModel.findOtp(cleanMobile, cleanOtp);

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
        await PartnerAuthModel.markOtpVerified(otpRecord.id);
        console.log('[OTP] verification succeeded');

        // Reuse devLogin logic to create or fetch partner and generate token
        return this.devLogin({ mobile: cleanMobile });
    }

    static async refreshSession({ refreshToken }) {
        if (!refreshToken) {
            const error = new Error('Refresh token required');
            error.statusCode = 401;
            throw error;
        }

        const session = await PartnerAuthModel.findSessionForRefreshToken(refreshToken);
        if (!session) {
            const error = new Error('Session expired or revoked');
            error.statusCode = 401;
            throw error;
        }

        const partner = await PartnerAuthModel.findById(session.partner_id);
        if (!partner || String(partner.status).toLowerCase() === 'deleted') {
            const error = new Error('Partner session is invalid');
            error.statusCode = 401;
            throw error;
        }

        const nextRefreshToken = generateRefreshToken();
        const rotated = await PartnerAuthModel.rotateSession(partner.id, refreshToken, nextRefreshToken);
        if (!rotated) {
            const error = new Error('Session refresh failed');
            error.statusCode = 401;
            throw error;
        }

        const token = generateToken({ id: partner.id, role: 'partner', mobile: partner.mobile });
        return { token, refreshToken: nextRefreshToken, partner };
    }

    static async logout({ partnerId, refreshToken = null }) {
        if (!partnerId) {
            return { success: true };
        }

        await PartnerAuthModel.revokeSessionForUser(partnerId, refreshToken || null);
        return { success: true };
    }

    static async deleteAccount({ partnerId, ip, device, rejectAlreadyDeleted = false, anonymizePersonalData = false }) {
        const id = Number(partnerId);
        if (!Number.isFinite(id) || id <= 0) {
            const error = new Error('Invalid partner id');
            error.statusCode = 400;
            throw error;
        }

        const conn = await db.getConnection();
        let partner = null;
        let kyc = null;

        try {
            await conn.beginTransaction();

            partner = await PartnerAuthModel.findById(id, conn);
            if (!partner) {
                const error = new Error('Partner not found');
                error.statusCode = 404;
                throw error;
            }

            if (rejectAlreadyDeleted && isDeletedPartner(partner)) {
                const error = new Error('Partner account is already deleted');
                error.statusCode = 409;
                throw error;
            }

            kyc = await PartnerKycModel.findByPartnerId(id, conn);

            await conn.query(
                `
                UPDATE partners
                SET
                                    mobile = IF(?, CONCAT('deleted_', id), mobile),
                                    country_code = IF(?, NULL, country_code),
                  name = NULL,
                  rating = NULL,
                  experience = NULL,
                  avatar = NULL,
                  expo_push_token = NULL,
                  upi_id = IF(?, NULL, upi_id),
                  upi_verified = IF(?, false, upi_verified),
                  upi_verified_at = IF(?, NULL, upi_verified_at),
                  status = 'deleted',
                  online_status = IF(?, 'OFFLINE', online_status),
                  updated_at = NOW()
                WHERE id = ?
                `,
                [anonymizePersonalData, anonymizePersonalData, anonymizePersonalData, anonymizePersonalData, anonymizePersonalData, anonymizePersonalData, id]
            );

            await PartnerAuthModel.revokeAllSessionsForUser(id, conn);

            if (kyc) {
                await conn.query(
                    `
                    UPDATE partner_kyc
                    SET
                      full_name = 'Deleted Partner',
                      mobile = IF(?, CONCAT('deleted_', partner_id), mobile),
                      service_area = 'Deleted',
                      service_latitude = NULL,
                      service_longitude = NULL,
                      experience = NULL,
                      skills = '[]',
                      salon_name = NULL,
                      salon_address = NULL,
                      salon_latitude = NULL,
                      salon_longitude = NULL,
                      salon_logo = NULL,
                      salon_gallery = NULL,
                      opening_time = NULL,
                      closing_time = NULL,
                      aadhaar_url = NULL,
                      pan_url = NULL,
                      certificate_url = NULL,
                      selfie_url = NULL,
                      kyc_status = 'rejected',
                      updated_at = NOW()
                    WHERE partner_id = ?
                    `,
                    [anonymizePersonalData, id]
                );
            }

            await conn.query('DELETE FROM partner_otp WHERE mobile = ?', [partner.mobile]);

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

        const cleanupPaths = [partner?.avatar, kyc?.salon_logo, kyc?.aadhaar_url, kyc?.pan_url, kyc?.certificate_url, kyc?.selfie_url];
        const galleryPaths = parseArrayValue(kyc?.salon_gallery);

        for (const item of [...cleanupPaths, ...galleryPaths]) {
            // eslint-disable-next-line no-await-in-loop
            await safeUnlink(item);
        }

        console.log('[PARTNER ACCOUNT DELETE]', {
            partnerId: id,
            deletedTime: new Date().toISOString(),
            ip: ip || null,
            device: device || null,
        });

        return { success: true };
    }

    static async me(partnerId) {
        const row = await PartnerAuthModel.findByIdWithKyc(partnerId);
        if (!row) {
            const error = new Error('Partner not found');
            error.statusCode = 404;
            throw error;
        }

        const partner = {
            id: row.id,
            mobile: row.mobile,
            country_code: row.country_code,
            name: row.name,
            rating: row.rating,
            experience: row.experience,
            avatar: row.avatar,
            kyc_status: row.kyc_status,
            status: row.status,
            upi_id: row.upi_id,
            upi_verified: row.upi_verified,
            upi_verified_at: row.upi_verified_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
        const kyc = row.kyc_id
            ? {
                id: row.kyc_id,
                partner_id: row.id,
                partner_type: row.partner_type || 'solo_partner',
                full_name: row.kyc_full_name || row.name || null,
                mobile: row.mobile,
                service_area: row.service_area,
                service_latitude: row.service_latitude,
                service_longitude: row.service_longitude,
                experience: row.kyc_experience || row.experience || null,
                skills: parseArrayValue(row.skills),
                salon_name: row.salon_name,
                salon_address: row.salon_address,
                salon_latitude: row.salon_latitude,
                salon_longitude: row.salon_longitude,
                salon_logo: row.salon_logo,
                salon_gallery: parseArrayValue(row.salon_gallery),
                opening_time: row.opening_time,
                closing_time: row.closing_time,
                aadhaar_url: row.aadhaar_url,
                pan_url: row.pan_url,
                certificate_url: row.certificate_url,
                selfie_url: row.selfie_url,
                kyc_status: row.kyc_record_status || kyc_status || 'pending',
                submit_count: row.kyc_submit_count || 0,
            }
            : null;

        return { partner, kyc };
    }
}

module.exports = PartnerAuthService;
