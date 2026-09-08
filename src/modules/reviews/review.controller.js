const db = require('../../config/db');
const ReviewModel = require('./review.model');
const PaymentModel = require('../payment/payment.model');
const UserAuthModel = require('../userAuth/userAuth.model');
const PartnerAuthModel = require('../partnerAuth/partnerAuth.model');
const { successResponse, errorResponse } = require('../../utils/response');

const normalizeBookingKey = (value) => {
    const v = value == null ? '' : String(value).trim();
    return v;
};

const isNumericId = (value) => {
    if (value == null) return false;
    const s = String(value).trim();
    if (!s) return false;
    return /^[0-9]+$/.test(s);
};

const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

const getPartnerDisplayName = async (partnerId) => {
    const pid = Number(partnerId);
    if (!Number.isFinite(pid)) return null;

    try {
        const [rows] = await db.query(
            `
            SELECT COALESCE(pk.full_name, p.name) AS name
            FROM partners p
            LEFT JOIN partner_kyc pk ON pk.partner_id = p.id
            WHERE p.id = ?
            LIMIT 1
            `,
            [pid]
        );
        const name = rows?.[0]?.name;
        return name ? String(name) : null;
    } catch {
        return null;
    }
};

const getUserDisplayName = async (userId) => {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;

    try {
        const [rows] = await db.query('SELECT name FROM users WHERE id = ? LIMIT 1', [uid]);
        const name = rows?.[0]?.name;
        return name ? String(name) : null;
    } catch {
        return null;
    }
};

class ReviewController {
    static async create(req, res, next) {
        try {
            await ReviewModel.ensureTable();
            await PaymentModel.ensureTable();
            await UserAuthModel.ensureTable();
            await PartnerAuthModel.ensureTable();

            const bookingId = normalizeBookingKey(req.body?.bookingId ?? req.body?.booking_id ?? req.body?.id);
            const ratingRaw = req.body?.rating;
            const reviewTextRaw = req.body?.review_text ?? req.body?.reviewText ?? req.body?.text;

            if (!bookingId) {
                return errorResponse(res, 400, 'bookingId is required');
            }

            const rating = toInt(ratingRaw);
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
                return errorResponse(res, 400, 'rating must be between 1 and 5');
            }

            const reviewText = String(reviewTextRaw || '').trim();
            if (reviewText.length < 5) {
                return errorResponse(res, 400, 'review_text must be at least 5 characters');
            }

            const userId = Number(req.user?.id);
            if (!Number.isFinite(userId)) {
                return errorResponse(res, 401, 'Not authorized, token failed');
            }

            const existing = await ReviewModel.findByBookingId(bookingId);
            if (existing) {
                return errorResponse(res, 409, 'Review already submitted for this booking');
            }

            const bookingRow = isNumericId(bookingId)
                ? await PaymentModel.getById(Number(bookingId))
                : await PaymentModel.getByBookingId(bookingId);

            if (!bookingRow) {
                return errorResponse(res, 404, 'Booking not found');
            }

            if (Number(bookingRow.user_id) !== userId) {
                return errorResponse(res, 403, 'Forbidden');
            }

            const bookingStatus = String(bookingRow.booking_status || '').trim();
            if (bookingStatus !== 'completed') {
                return errorResponse(res, 409, 'Only completed bookings can be reviewed');
            }

            const partnerId = Number(bookingRow.partner_id);
            if (!Number.isFinite(partnerId) || partnerId <= 0) {
                return errorResponse(res, 409, 'Partner not assigned for this booking');
            }

            const serviceName = String(bookingRow.service_name || '').trim() || null;

            const userName = (await getUserDisplayName(userId)) || 'Customer';
            const partnerName = (await getPartnerDisplayName(partnerId)) || 'Partner';

            const insertId = await ReviewModel.create({
                bookingId,
                userId,
                userName,
                partnerId,
                partnerName,
                serviceName,
                rating,
                reviewText,
            });

            return successResponse(res, 201, 'Review submitted', {
                id: insertId,
                booking_id: bookingId,
                status: 'pending',
            });
        } catch (err) {
            return next(err);
        }
    }

    static async my(req, res, next) {
        try {
            await ReviewModel.ensureTable();

            const userId = Number(req.user?.id);
            if (!Number.isFinite(userId)) {
                return errorResponse(res, 401, 'Not authorized, token failed');
            }

            const reviews = await ReviewModel.listByUser(userId);
            return successResponse(res, 200, 'My reviews', { reviews });
        } catch (err) {
            return next(err);
        }
    }

    static async approved(req, res, next) {
        try {
            await ReviewModel.ensureTable();

            const limit = req.query?.limit;
            const reviews = await ReviewModel.listApproved({ limit });
            return successResponse(res, 200, 'Approved reviews', { reviews });
        } catch (err) {
            return next(err);
        }
    }

    // Admin
    static async adminList(req, res, next) {
        try {
            await ReviewModel.ensureTable();
            const reviews = await ReviewModel.listAll();
            return successResponse(res, 200, 'All reviews', { reviews });
        } catch (err) {
            return next(err);
        }
    }

    static async approve(req, res, next) {
        try {
            await ReviewModel.ensureTable();
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return errorResponse(res, 400, 'Invalid id');
            }

            const ok = await ReviewModel.updateStatus(id, 'approved');
            if (!ok) {
                return errorResponse(res, 404, 'Review not found');
            }

            return successResponse(res, 200, 'Review approved', { id, status: 'approved' });
        } catch (err) {
            return next(err);
        }
    }

    static async reject(req, res, next) {
        try {
            await ReviewModel.ensureTable();
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return errorResponse(res, 400, 'Invalid id');
            }

            const ok = await ReviewModel.updateStatus(id, 'rejected');
            if (!ok) {
                return errorResponse(res, 404, 'Review not found');
            }

            return successResponse(res, 200, 'Review rejected', { id, status: 'rejected' });
        } catch (err) {
            return next(err);
        }
    }

    static async remove(req, res, next) {
        try {
            await ReviewModel.ensureTable();
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                return errorResponse(res, 400, 'Invalid id');
            }

            const deleted = await ReviewModel.delete(id);
            if (!deleted) {
                return errorResponse(res, 404, 'Review not found');
            }

            return successResponse(res, 200, 'Review deleted', { id });
        } catch (err) {
            return next(err);
        }
    }
}

module.exports = ReviewController;
