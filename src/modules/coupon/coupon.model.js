const db = require('../../config/db');

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const toJsonArray = (value) => {
  if (Array.isArray(value)) return value.filter((item) => item !== null && typeof item !== 'undefined');
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => item !== null && typeof item !== 'undefined') : null;
    } catch {
      return value
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    }
  }

  return null;
};

const toBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
};

const mapCouponRow = (row) => {
  if (!row) return null;

  return {
    id: Number(row.id),
    coupon_code: row.coupon_code,
    title: row.title,
    description: row.description,
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value || 0),
    max_discount: row.max_discount == null ? null : Number(row.max_discount),
    min_booking_amount: Number(row.min_booking_amount || 0),
    service_mode: row.service_mode || 'all',
    service_ids: toJsonArray(row.service_ids),
    category_ids: toJsonArray(row.category_ids),
    total_usage_limit: row.total_usage_limit == null ? null : Number(row.total_usage_limit),
    used_count: Number(row.used_count || 0),
    per_user_limit: Number(row.per_user_limit || 1),
    is_first_booking_only: toBool(row.is_first_booking_only),
    is_active: toBool(row.is_active),
    expiry_date: row.expiry_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    total_discount_given: Number(row.total_discount_given || 0),
    total_usage_records: Number(row.total_usage_records || 0),
  };
};

const refreshCouponUsageCount = async (couponId) => {
  const cid = Number(couponId);
  if (!Number.isFinite(cid) || cid <= 0) return 0;

  const [rows] = await db.query('SELECT COUNT(*) AS total FROM coupon_usages WHERE coupon_id = ?', [cid]);
  const total = Number(rows?.[0]?.total || 0);

  await db.query('UPDATE coupons SET used_count = ? WHERE id = ?', [total, cid]);
  return total;
};

class CouponModel {
  static async ensureTables() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_code VARCHAR(80) NOT NULL UNIQUE,
        title VARCHAR(160) NOT NULL,
        description TEXT DEFAULT NULL,
        discount_type ENUM('flat','percentage') NOT NULL,
        discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
        max_discount DECIMAL(10, 2) DEFAULT NULL,
        min_booking_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        service_mode ENUM('all','home','salon') NOT NULL DEFAULT 'all',
        service_ids JSON DEFAULT NULL,
        category_ids JSON DEFAULT NULL,
        total_usage_limit INT DEFAULT NULL,
        used_count INT NOT NULL DEFAULT 0,
        per_user_limit INT NOT NULL DEFAULT 1,
        is_first_booking_only TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        expiry_date DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_coupon_code (coupon_code),
        KEY idx_coupon_active (is_active),
        KEY idx_coupon_expiry (expiry_date)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS coupon_usages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_id INT NOT NULL,
        user_id INT NOT NULL,
        booking_id VARCHAR(80) DEFAULT NULL,
        payment_id VARCHAR(120) DEFAULT NULL,
        coupon_code VARCHAR(80) NOT NULL,
        original_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        final_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_coupon_booking (booking_id),
        UNIQUE KEY uniq_coupon_payment (payment_id),
        KEY idx_coupon_user (coupon_id, user_id),
        KEY idx_coupon_payment (payment_id),
        KEY idx_coupon_code_usage (coupon_code)
      )
    `);

    const alterCouponUsageQueries = [
      'ALTER TABLE coupon_usages ADD COLUMN payment_id VARCHAR(120) DEFAULT NULL',
      'ALTER TABLE coupon_usages ADD UNIQUE KEY uniq_coupon_payment (payment_id)',
      'ALTER TABLE coupon_usages ADD KEY idx_coupon_payment (payment_id)',
    ];

    for (const query of alterCouponUsageQueries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.query(query);
      } catch {
        // ignore migration drift
      }
    }

    const alterPayments = [
      "ALTER TABLE payments ADD COLUMN coupon_id INT DEFAULT NULL",
      "ALTER TABLE payments ADD COLUMN coupon_code VARCHAR(80) DEFAULT NULL",
      "ALTER TABLE payments ADD COLUMN coupon_discount DECIMAL(10, 2) DEFAULT NULL",
      "ALTER TABLE payments ADD COLUMN original_amount DECIMAL(10, 2) DEFAULT NULL",
      "ALTER TABLE payments ADD COLUMN final_amount_after_discount DECIMAL(10, 2) DEFAULT NULL",
    ];

    for (const query of alterPayments) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.query(query);
      } catch {
        // ignore migration drift
      }
    }
  }

  static async listCoupons() {
    await this.ensureTables();
    // eslint-disable-next-line no-console
    console.log('[COUPON SUMMARY QUERY]', {
      source: 'coupon_usages',
      query: 'COUNT(DISTINCT u.id), SUM(u.discount_amount) grouped by coupon.id',
    });
    const [rows] = await db.query(`
      SELECT
        c.id,
        c.coupon_code,
        c.title,
        c.description,
        c.discount_type,
        c.discount_value,
        c.max_discount,
        c.min_booking_amount,
        c.service_mode,
        c.service_ids,
        c.category_ids,
        c.total_usage_limit,
        COALESCE(COUNT(DISTINCT u.id), 0) AS used_count,
        c.per_user_limit,
        c.is_first_booking_only,
        c.is_active,
        c.expiry_date,
        c.created_at,
        c.updated_at,
        COALESCE(COUNT(DISTINCT u.id), 0) AS total_usage_records,
        COALESCE(SUM(COALESCE(u.discount_amount, 0)), 0) AS total_discount_given
      FROM coupons c
      LEFT JOIN coupon_usages u ON u.coupon_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    return Array.isArray(rows) ? rows.map(mapCouponRow) : [];
  }

  static async getCouponById(id) {
    await this.ensureTables();
    const couponId = Number(id);
    if (!Number.isFinite(couponId) || couponId <= 0) return null;

    const [rows] = await db.query('SELECT * FROM coupons WHERE id = ? LIMIT 1', [couponId]);
    return rows && rows[0] ? mapCouponRow(rows[0]) : null;
  }

  static async getCouponByCode(code) {
    await this.ensureTables();
    const couponCode = String(code || '').trim().toUpperCase();
    if (!couponCode) return null;

    const [rows] = await db.query('SELECT * FROM coupons WHERE coupon_code = ? LIMIT 1', [couponCode]);
    return rows && rows[0] ? mapCouponRow(rows[0]) : null;
  }

  static async createCoupon(payload) {
    await this.ensureTables();
    const data = payload && typeof payload === 'object' ? payload : {};
    const couponCode = String(data.coupon_code || '').trim().toUpperCase();
    const title = String(data.title || '').trim();

    if (!couponCode || !title) {
      const err = new Error('Coupon code and title are required');
      err.statusCode = 400;
      throw err;
    }

    const [result] = await db.query(
      `
        INSERT INTO coupons (
          coupon_code, title, description, discount_type, discount_value, max_discount,
          min_booking_amount, service_mode, service_ids, category_ids, total_usage_limit,
          used_count, per_user_limit, is_first_booking_only, is_active, expiry_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        couponCode,
        title,
        data.description ?? null,
        String(data.discount_type || 'flat').toLowerCase() === 'percentage' ? 'percentage' : 'flat',
        Number(data.discount_value || 0),
        data.max_discount === '' || data.max_discount == null ? null : Number(data.max_discount),
        Number(data.min_booking_amount || 0),
        ['all', 'home', 'salon'].includes(String(data.service_mode || 'all').toLowerCase())
          ? String(data.service_mode || 'all').toLowerCase()
          : 'all',
        data.service_ids ? JSON.stringify(toJsonArray(data.service_ids) || []) : null,
        data.category_ids ? JSON.stringify(toJsonArray(data.category_ids) || []) : null,
        data.total_usage_limit === '' || data.total_usage_limit == null ? null : Number(data.total_usage_limit),
        Number(data.used_count || 0),
        Number(data.per_user_limit || 1),
        toBool(data.is_first_booking_only) ? 1 : 0,
        toBool(data.is_active) ? 1 : 0,
        data.expiry_date ? new Date(data.expiry_date) : null,
      ]
    );

    return this.getCouponById(result?.insertId);
  }

  static async updateCoupon(id, payload) {
    await this.ensureTables();
    const existing = await this.getCouponById(id);
    if (!existing) return null;

    const data = payload && typeof payload === 'object' ? payload : {};
    const couponCode = String((typeof data.coupon_code !== 'undefined' ? data.coupon_code : existing.coupon_code) || '').trim().toUpperCase();
    const title = String((typeof data.title !== 'undefined' ? data.title : existing.title) || '').trim();

    await db.query(
      `
        UPDATE coupons
        SET coupon_code = ?, title = ?, description = ?, discount_type = ?, discount_value = ?, max_discount = ?,
            min_booking_amount = ?, service_mode = ?, service_ids = ?, category_ids = ?, total_usage_limit = ?,
            per_user_limit = ?, is_first_booking_only = ?, is_active = ?, expiry_date = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        couponCode,
        title,
        typeof data.description !== 'undefined' ? data.description : existing.description,
        String((typeof data.discount_type !== 'undefined' ? data.discount_type : existing.discount_type) || 'flat').toLowerCase() === 'percentage' ? 'percentage' : 'flat',
        Number(typeof data.discount_value !== 'undefined' ? data.discount_value : existing.discount_value || 0),
        typeof data.max_discount !== 'undefined'
          ? (data.max_discount === '' || data.max_discount == null ? null : Number(data.max_discount))
          : existing.max_discount,
        Number(typeof data.min_booking_amount !== 'undefined' ? data.min_booking_amount : existing.min_booking_amount || 0),
        ['all', 'home', 'salon'].includes(String((typeof data.service_mode !== 'undefined' ? data.service_mode : existing.service_mode) || 'all').toLowerCase())
          ? String((typeof data.service_mode !== 'undefined' ? data.service_mode : existing.service_mode) || 'all').toLowerCase()
          : 'all',
        typeof data.service_ids !== 'undefined' ? (data.service_ids === '' ? null : JSON.stringify(toJsonArray(data.service_ids) || [])) : JSON.stringify(existing.service_ids || []),
        typeof data.category_ids !== 'undefined' ? (data.category_ids === '' ? null : JSON.stringify(toJsonArray(data.category_ids) || [])) : JSON.stringify(existing.category_ids || []),
        typeof data.total_usage_limit !== 'undefined'
          ? (data.total_usage_limit === '' || data.total_usage_limit == null ? null : Number(data.total_usage_limit))
          : existing.total_usage_limit,
        Number(typeof data.per_user_limit !== 'undefined' ? data.per_user_limit : existing.per_user_limit || 1),
        toBool(typeof data.is_first_booking_only === 'undefined' ? existing.is_first_booking_only : data.is_first_booking_only) ? 1 : 0,
        toBool(typeof data.is_active === 'undefined' ? existing.is_active : data.is_active) ? 1 : 0,
        typeof data.expiry_date !== 'undefined'
          ? (data.expiry_date ? new Date(data.expiry_date) : null)
          : existing.expiry_date,
        Number(id),
      ]
    );

    return this.getCouponById(id);
  }

  static async toggleCoupon(id) {
    await this.ensureTables();
    const existing = await this.getCouponById(id);
    if (!existing) return null;

    const next = existing.is_active ? 0 : 1;
    await db.query('UPDATE coupons SET is_active = ?, updated_at = NOW() WHERE id = ?', [next, Number(id)]);
    return this.getCouponById(id);
  }

  static async deleteCoupon(id) {
    await this.ensureTables();
    const couponId = Number(id);
    if (!Number.isFinite(couponId) || couponId <= 0) return null;

    const existing = await this.getCouponById(couponId);
    if (!existing) return null;

    const [usageRows] = await db.query('SELECT COUNT(*) AS total FROM coupon_usages WHERE coupon_id = ?', [couponId]);
    const [paymentRows] = await db.query('SELECT COUNT(*) AS total FROM payments WHERE coupon_id = ?', [couponId]);
    const hasHistory = Number(usageRows?.[0]?.total || 0) > 0 || Number(paymentRows?.[0]?.total || 0) > 0;

    if (hasHistory) {
      await db.query('UPDATE coupons SET is_active = 0, updated_at = NOW() WHERE id = ?', [couponId]);
      return { id: couponId, archived: true };
    }

    const [result] = await db.query('DELETE FROM coupons WHERE id = ?', [couponId]);
    return Number(result?.affectedRows || 0) > 0 ? { id: couponId, archived: false } : null;
  }

  static async countCouponUsageByUser(couponId, userId) {
    await this.ensureTables();
    const cid = Number(couponId);
    const uid = Number(userId);
    if (!Number.isFinite(cid) || !Number.isFinite(uid)) return 0;

    const [rows] = await db.query('SELECT COUNT(*) AS total FROM coupon_usages WHERE coupon_id = ? AND user_id = ?', [cid, uid]);
    return Number(rows?.[0]?.total || 0);
  }

  static async getCouponUsageCount(couponId) {
    await this.ensureTables();
    const cid = Number(couponId);
    if (!Number.isFinite(cid) || cid <= 0) return 0;

    const [rows] = await db.query('SELECT COUNT(*) AS total FROM coupon_usages WHERE coupon_id = ?', [cid]);
    return Number(rows?.[0]?.total || 0);
  }

  static async countBookingHistoryByUser(userId) {
    await this.ensureTables();
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return 0;

    const [rows] = await db.query(
      `SELECT COUNT(*) AS total FROM payments WHERE user_id = ? AND COALESCE(payment_status, '') = 'PAID'`,
      [uid]
    );
    return Number(rows?.[0]?.total || 0);
  }

  static async getUsageByBookingId(bookingId) {
    await this.ensureTables();
    const bid = String(bookingId || '').trim();
    if (!bid) return null;

    const [rows] = await db.query('SELECT * FROM coupon_usages WHERE booking_id = ? LIMIT 1', [bid]);
    return rows && rows[0] ? rows[0] : null;
  }

  static async getUsageByPaymentId(paymentId) {
    await this.ensureTables();
    const pid = String(paymentId || '').trim();
    if (!pid) return null;

    const [rows] = await db.query('SELECT * FROM coupon_usages WHERE payment_id = ? LIMIT 1', [pid]);
    return rows && rows[0] ? rows[0] : null;
  }

  static async recordUsage(payload) {
    await this.ensureTables();

    const data = payload && typeof payload === 'object' ? payload : {};
    const couponId = data.couponId ?? data.coupon_id;
    const userId = data.userId ?? data.user_id;
    const bookingId = data.bookingId ?? data.booking_id;
    const paymentId = data.paymentId ?? data.payment_id;
    const couponCode = data.couponCode ?? data.coupon_code;
    const originalAmount = data.originalAmount ?? data.original_amount;
    const discountAmount = data.discountAmount ?? data.discount_amount;
    const finalAmount = data.finalAmount ?? data.final_amount;

    const cid = Number(couponId);
    const uid = Number(userId);
    const bid = String(bookingId || '').trim() || null;
    const pid = String(paymentId || '').trim() || null;
    if (!Number.isFinite(cid) || !Number.isFinite(uid) || !bid) return { affectedRows: 0 };

    const original = round2(originalAmount);
    const discount = round2(discountAmount);
    const final = round2(finalAmount);

    // eslint-disable-next-line no-console
    console.log('[COUPON USAGE INSERT START]', {
      coupon_id: cid,
      coupon_code: String(couponCode || '').trim().toUpperCase(),
      payment_id: pid,
      booking_id: bid,
      user_id: uid,
      discount_amount: discount,
      original_amount: original,
      final_amount: final,
    });

    try {
      const [existingRows] = await db.query(
        'SELECT id FROM coupon_usages WHERE payment_id = ? LIMIT 1',
        [pid]
      );

      if (existingRows && existingRows[0]) {
        await refreshCouponUsageCount(cid);
        // eslint-disable-next-line no-console
        console.log('[COUPON USAGE INSERT SUCCESS]', {
          coupon_id: cid,
          payment_id: pid,
          booking_id: bid,
          user_id: uid,
          discount_amount: discount,
          original_amount: original,
          final_amount: final,
          duplicate: true,
        });
        return { affectedRows: 0, existing: existingRows[0] };
      }

      const [result] = await db.query(
        `
          INSERT IGNORE INTO coupon_usages
            (coupon_id, user_id, booking_id, payment_id, coupon_code, original_amount, discount_amount, final_amount, used_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [cid, uid, bid, pid, String(couponCode || '').trim().toUpperCase(), original, discount, final]
      );

      if (Number(result?.affectedRows || 0) > 0) {
        await refreshCouponUsageCount(cid);
      }

      // eslint-disable-next-line no-console
      console.log('[COUPON USAGE INSERT SUCCESS]', {
        coupon_id: cid,
        payment_id: pid,
        booking_id: bid,
        user_id: uid,
        discount_amount: discount,
        original_amount: original,
        final_amount: final,
        affectedRows: Number(result?.affectedRows || 0),
      });

      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[COUPON USAGE INSERT FAILED]', {
        coupon_id: cid,
        payment_id: pid,
        booking_id: bid,
        user_id: uid,
        discount_amount: discount,
        original_amount: original,
        final_amount: final,
        error: error?.message || error,
      });
      throw error;
    }
  }
}

module.exports = CouponModel;