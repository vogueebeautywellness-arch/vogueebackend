const CouponModel = require('./coupon.model');
const { successResponse, errorResponse } = require('../../utils/response');

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const normalizeCouponServiceMode = (value) => {
  const input = String(value || '').trim().toLowerCase();
  if (['home', 'at_home', 'visit_home', 'doorstep'].includes(input)) return 'at_home';
  if (['salon', 'visit_salon', 'offline_salon'].includes(input)) return 'visit_salon';
  return 'all';
};

const normalizeServiceMode = (value) => {
  const input = String(value || '').trim().toLowerCase();
  if (['home', 'at_home', 'online_home', 'visit_home', 'doorstep'].includes(input)) return 'home';
  if (['salon', 'offline_salon', 'visit_salon'].includes(input)) return 'salon';
  return 'all';
};

const normalizeBookingServiceMode = (value) => {
  const input = String(value || '').trim().toLowerCase();
  if (['home', 'at_home', 'visit_home', 'doorstep'].includes(input)) return 'at_home';
  if (['salon', 'visit_salon', 'offline_salon'].includes(input)) return 'visit_salon';
  return 'all';
};

const normalizeIdArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item) && item > 0);
      }
    } catch {
      // fall through to comma parsing
    }

    return value
      .split(',')
      .map((item) => Number(String(item || '').trim()))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  return [];
};

const toIdSet = (value) => {
  return new Set(normalizeIdArray(value));
};

const parseExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const parsed = new Date(expiryDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRequestContext = (req) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query && typeof req.query === 'object' ? req.query : {};

  return {
    amount: Number(body.amount ?? query.amount ?? 0),
    serviceMode: normalizeBookingServiceMode(body.service_mode ?? body.serviceMode ?? query.service_mode ?? query.serviceMode),
    serviceIds: normalizeIdArray(body.service_ids ?? body.serviceIds ?? query.service_ids ?? query.serviceIds),
    categoryIds: normalizeIdArray(body.category_ids ?? body.categoryIds ?? query.category_ids ?? query.categoryIds),
    bookingId: String(body.booking_id ?? body.bookingId ?? query.booking_id ?? query.bookingId ?? '').trim() || null,
    couponCode: normalizeCode(body.coupon_code ?? body.couponCode ?? query.coupon_code ?? query.couponCode),
    couponId: Number(body.coupon_id ?? body.couponId ?? query.coupon_id ?? query.couponId ?? 0),
  };
};

const calculateDiscount = (coupon, amount) => {
  const base = round2(amount);
  if (!coupon || !Number.isFinite(base) || base <= 0) {
    return { discount_amount: 0, final_amount: round2(base) };
  }

  const discountType = String(coupon.discount_type || 'flat').toLowerCase();
  const discountValue = Number(coupon.discount_value || 0);
  const maxDiscount = coupon.max_discount == null ? null : Number(coupon.max_discount);

  let discount = 0;
  if (discountType === 'percentage') {
    discount = round2((base * discountValue) / 100);
  } else {
    discount = round2(discountValue);
  }

  if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
    discount = Math.min(discount, round2(maxDiscount));
  }

  if (!Number.isFinite(discount) || discount < 0) discount = 0;
  if (discount > base) discount = base;

  return {
    discount_amount: round2(discount),
    final_amount: round2(Math.max(0, base - discount)),
  };
};

const couponMatchesRequest = (coupon, serviceMode, serviceIds, categoryIds) => {
  if (!coupon) return false;

  const couponMode = normalizeCouponServiceMode(coupon.service_mode);
  const bookingMode = normalizeBookingServiceMode(serviceMode);

  console.log('SERVICE MODE', bookingMode);

  if (couponMode !== 'all' && bookingMode !== 'all' && couponMode !== bookingMode) {
    return false;
  }

  const couponServiceIds = toIdSet(coupon.service_ids);
  const bookingServiceIds = normalizeIdArray(serviceIds);
  const hasServiceMatch =
    couponServiceIds.size === 0
      ? true
      : bookingServiceIds.some((id) => couponServiceIds.has(Number(id)));

  console.log('BOOKING SERVICE IDS', bookingServiceIds);
  console.log('COUPON SERVICE IDS', Array.from(couponServiceIds));
  console.log('SERVICE MATCH', hasServiceMatch);

  if (!hasServiceMatch) return false;

  const couponCategoryIds = toIdSet(coupon.category_ids);
  const bookingCategoryIds = normalizeIdArray(categoryIds);
  const hasCategoryMatch =
    couponCategoryIds.size === 0
      ? true
      : bookingCategoryIds.length === 0
        ? true
      : bookingCategoryIds.some((id) => couponCategoryIds.has(Number(id)));

  console.log('BOOKING CATEGORY IDS', bookingCategoryIds);
  console.log('COUPON CATEGORY IDS', Array.from(couponCategoryIds));
  console.log('CATEGORY MATCH', hasCategoryMatch);

  if (!hasCategoryMatch) return false;

  return true;
};

const couponMatchesAvailability = (coupon, serviceMode, serviceIds, categoryIds, amount) => {
  if (!coupon) {
    return { matched: false, reason: 'missing_coupon' };
  }

  if (!coupon.is_active) {
    return { matched: false, reason: 'inactive_coupon' };
  }

  const expiry = parseExpiry(coupon.expiry_date);
  if (expiry && expiry.getTime() < Date.now()) {
    return { matched: false, reason: 'expired_coupon' };
  }

  const baseAmount = round2(amount);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { matched: false, reason: 'invalid_amount' };
  }

  if (baseAmount < Number(coupon.min_booking_amount || 0)) {
    return { matched: false, reason: 'below_minimum_amount' };
  }

  const couponServiceIds = toIdSet(coupon.service_ids);
  const bookingServiceIds = normalizeIdArray(serviceIds);
  const couponCategoryIds = toIdSet(coupon.category_ids);
  const bookingCategoryIds = normalizeIdArray(categoryIds);

  const normalizedCouponMode = normalizeServiceMode(coupon.service_mode);
  const normalizedBookingMode = normalizeServiceMode(serviceMode);
  const hasNoRestrictions = couponServiceIds.size === 0 && couponCategoryIds.size === 0;

  if (normalizedCouponMode === 'all') {
    return { matched: true, reason: 'coupon_all_mode' };
  }

  if (hasNoRestrictions) {
    return { matched: true, reason: 'no_restrictions' };
  }

  const modeCompatible = normalizedBookingMode === 'all' || normalizedCouponMode === normalizedBookingMode;
  if (!modeCompatible) {
    return { matched: false, reason: 'mode_mismatch' };
  }

  const serviceMatches =
    couponServiceIds.size > 0
      ? bookingServiceIds.map(Number).some((id) => couponServiceIds.has(Number(id)))
      : false;

  if (serviceMatches) {
    return { matched: true, reason: 'service_match' };
  }

  const categoryMatches =
    couponCategoryIds.size > 0
      ? bookingCategoryIds.map(Number).some((id) => couponCategoryIds.has(Number(id)))
      : false;

  if (categoryMatches) {
    return { matched: true, reason: 'category_match' };
  }

  return { matched: false, reason: 'no_matching_ids' };
};

const validateCouponForUser = async ({ coupon, userId, amount, serviceMode, serviceIds, categoryIds, bookingId }) => {
  if (!coupon) {
    return { ok: false, statusCode: 404, message: 'Coupon not found' };
  }

  if (!coupon.is_active) {
    return { ok: false, statusCode: 400, message: 'Coupon is inactive' };
  }

  const expiry = parseExpiry(coupon.expiry_date);
  if (expiry && expiry.getTime() < Date.now()) {
    return { ok: false, statusCode: 400, message: 'Coupon has expired' };
  }

  const baseAmount = round2(amount);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { ok: false, statusCode: 400, message: 'Invalid amount' };
  }

  if (baseAmount < Number(coupon.min_booking_amount || 0)) {
    return { ok: false, statusCode: 400, message: `Minimum booking amount is ₹${round2(coupon.min_booking_amount || 0)}` };
  }

  if (Number.isFinite(Number(coupon.total_usage_limit)) && Number(coupon.total_usage_limit) > 0) {
    const actualUsageCount = await CouponModel.getCouponUsageCount(coupon.id);
    if (actualUsageCount >= Number(coupon.total_usage_limit)) {
      return { ok: false, statusCode: 400, message: 'Coupon usage limit exceeded' };
    }
  }

  const userUsageCount = await CouponModel.countCouponUsageByUser(coupon.id, userId);
  if (userUsageCount >= Number(coupon.per_user_limit || 1)) {
    return { ok: false, statusCode: 400, message: 'You have already used this coupon' };
  }

  if (coupon.is_first_booking_only) {
    const bookingHistoryCount = await CouponModel.countBookingHistoryByUser(userId);
    if (bookingHistoryCount > 0) {
      return { ok: false, statusCode: 400, message: 'Coupon is valid for first booking only' };
    }
  }

  if (!couponMatchesRequest(coupon, serviceMode, serviceIds, categoryIds)) {
    return { ok: false, statusCode: 400, message: 'Coupon is not applicable for this service' };
  }

  if (bookingId) {
    const usageRecord = await CouponModel.getUsageByBookingId(bookingId);
    if (usageRecord) {
      return { ok: false, statusCode: 409, message: 'Coupon already applied for this booking' };
    }
  }

  const calculation = calculateDiscount(coupon, baseAmount);

  // eslint-disable-next-line no-console
  console.log('[COUPON APPLY]', {
    coupon_id: coupon.id,
    coupon_code: coupon.coupon_code,
    user_id: userId,
    amount: baseAmount,
    discount: calculation.discount_amount,
  });

  return {
    ok: true,
    coupon,
    ...calculation,
  };
};

exports.validate = async (req, res, next) => {
  try {
    const { amount, serviceMode, serviceIds, categoryIds, bookingId, couponCode, couponId } = getRequestContext(req);
    // eslint-disable-next-line no-console
    console.log('[COUPON APPLY RECEIVED]', {
      coupon_id: couponId || null,
      coupon_code: couponCode || null,
      booking_id: bookingId || null,
      user_id: req.user.id,
      amount,
      service_mode: serviceMode,
    });
    const coupon = couponId ? await CouponModel.getCouponById(couponId) : await CouponModel.getCouponByCode(couponCode);
    const result = await validateCouponForUser({
      coupon,
      userId: req.user.id,
      amount,
      serviceMode,
      serviceIds,
      categoryIds,
      bookingId,
    });

    if (!result.ok) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, 200, 'Coupon validated', {
      coupon: result.coupon,
      discount_amount: result.discount_amount,
      final_amount: result.final_amount,
      savings_amount: result.discount_amount,
    });
  } catch (err) {
    next(err);
  }
};

exports.available = async (req, res, next) => {
  try {
    const { amount, serviceMode, serviceIds, categoryIds } = getRequestContext(req);
    const rawServiceIds = req.query?.service_ids || req.query?.['service_ids[]'] || [];
    const rawCategoryIds = req.query?.category_ids || req.query?.['category_ids[]'] || [];
    const bookingServiceIds = Array.isArray(rawServiceIds)
      ? rawServiceIds.map(Number).filter((item) => Number.isFinite(item) && item > 0)
      : [Number(rawServiceIds)].filter(Boolean);
    const bookingCategoryIds = Array.isArray(rawCategoryIds)
      ? rawCategoryIds.map(Number).filter((item) => Number.isFinite(item) && item > 0)
      : [Number(rawCategoryIds)].filter(Boolean);

    // eslint-disable-next-line no-console
    console.log('[NORMALIZED BOOKING IDS]', {
      rawServiceIds,
      bookingServiceIds,
      rawCategoryIds,
      bookingCategoryIds,
    });

    const coupons = await CouponModel.listCoupons();

    const available = [];
    for (const coupon of coupons) {
      const matchedResult = couponMatchesAvailability(coupon, serviceMode, bookingServiceIds, bookingCategoryIds, amount);

      // eslint-disable-next-line no-console
      console.log('[AVAILABLE COUPON CHECK]', {
        coupon: coupon.coupon_code,
        coupon_service_mode: coupon.service_mode,
        booking_service_mode: serviceMode,
        coupon_service_ids: coupon.service_ids,
        booking_service_ids: bookingServiceIds,
        coupon_category_ids: coupon.category_ids,
        booking_category_ids: bookingCategoryIds,
        matched: matchedResult.matched,
        reason: matchedResult.reason,
      });

      if (!matchedResult.matched) continue;

      const calculation = calculateDiscount(coupon, amount);
      available.push({
        ...coupon,
        applicable_for: coupon.service_mode || 'all',
        estimated_discount: calculation.discount_amount,
        savings_amount: calculation.discount_amount,
        estimated_final_amount: calculation.final_amount,
      });
    }

    // eslint-disable-next-line no-console
    console.log('[FINAL AVAILABLE COUPONS]', available.map((coupon) => coupon.coupon_code));

    return successResponse(res, 200, 'Available coupons fetched', available);
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const coupons = await CouponModel.listCoupons();
    // eslint-disable-next-line no-console
    console.log('[COUPON METADATA]', {
      rows: Array.isArray(coupons) ? coupons.length : 0,
      sample: Array.isArray(coupons) && coupons[0] ? {
        coupon_id: coupons[0].id,
        coupon_code: coupons[0].coupon_code,
        used_count: coupons[0].used_count,
        total_usage_records: coupons[0].total_usage_records,
        total_discount_given: coupons[0].total_discount_given,
      } : null,
    });
    const summary = coupons.reduce((acc, coupon) => {
      acc.totalCoupons += 1;
      acc.activeCoupons += coupon.is_active ? 1 : 0;
      acc.expiredCoupons += coupon.expiry_date && new Date(coupon.expiry_date).getTime() < Date.now() ? 1 : 0;
      acc.totalUsageCount += Number(coupon.total_usage_records || 0);
      acc.totalDiscountGiven += Number(coupon.total_discount_given || 0);
      return acc;
    }, {
      totalCoupons: 0,
      activeCoupons: 0,
      expiredCoupons: 0,
      totalUsageCount: 0,
      totalDiscountGiven: 0,
    });

    // eslint-disable-next-line no-console
    console.log('[COUPON SUMMARY UPDATED]', summary);

    return successResponse(res, 200, 'Coupons fetched', { coupons, summary });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const created = await CouponModel.createCoupon(req.body);
    return successResponse(res, 201, 'Coupon created', created);
  } catch (err) {
    if (err?.statusCode) {
      return errorResponse(res, err.statusCode, err.message);
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await CouponModel.updateCoupon(id, req.body);
    if (!updated) {
      return errorResponse(res, 404, 'Coupon not found');
    }
    return successResponse(res, 200, 'Coupon updated', updated);
  } catch (err) {
    if (err?.statusCode) {
      return errorResponse(res, err.statusCode, err.message);
    }
    next(err);
  }
};

exports.toggle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await CouponModel.toggleCoupon(id);
    if (!updated) {
      return errorResponse(res, 404, 'Coupon not found');
    }
    return successResponse(res, 200, 'Coupon status updated', updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await CouponModel.deleteCoupon(id);
    if (!result) {
      return errorResponse(res, 404, 'Coupon not found');
    }

    return successResponse(
      res,
      200,
      result.archived ? 'Coupon archived because it has historical records' : 'Coupon deleted',
      result
    );
  } catch (err) {
    next(err);
  }
};

exports.reconcileBookingCoupon = async ({ userId, bookingId, bookingData, amount }) => {
  const couponCode = normalizeCode(bookingData?.coupon_code ?? bookingData?.couponCode);
  if (!couponCode) {
    return {
      coupon: null,
      discount_amount: 0,
      final_amount: round2(amount),
    };
  }

  const coupon = bookingData?.coupon_id
    ? await CouponModel.getCouponById(bookingData.coupon_id)
    : await CouponModel.getCouponByCode(couponCode);

  const result = await validateCouponForUser({
    coupon,
    userId,
    amount,
    serviceMode: normalizeBookingServiceMode(bookingData?.service_mode ?? bookingData?.serviceMode ?? bookingData?.bookingType),
    serviceIds: normalizeIdArray(bookingData?.service_ids ?? bookingData?.serviceIds),
    categoryIds: normalizeIdArray(bookingData?.category_ids ?? bookingData?.categoryIds),
    bookingId,
  });

  if (!result.ok) {
    return {
      coupon: null,
      discount_amount: 0,
      final_amount: round2(amount),
    };
  }

  return {
    coupon: result.coupon,
    discount_amount: result.discount_amount,
    final_amount: result.final_amount,
  };
};