const db = require('../../config/db');

class ReferralModel {
  static async ensureTables() {
    // 1. Referral Partners Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_partners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        referral_code VARCHAR(50) NOT NULL UNIQUE,
        full_name VARCHAR(255) DEFAULT NULL,
        mobile VARCHAR(20) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        dob DATE DEFAULT NULL,
        address TEXT DEFAULT NULL,
        aadhaar_number VARCHAR(50) DEFAULT NULL,
        pan_number VARCHAR(50) DEFAULT NULL,
        bank_name VARCHAR(255) DEFAULT NULL,
        account_holder_name VARCHAR(255) DEFAULT NULL,
        account_number VARCHAR(100) DEFAULT NULL,
        ifsc_code VARCHAR(50) DEFAULT NULL,
        kyc_doc_path VARCHAR(500) DEFAULT NULL,
        selfie_path VARCHAR(500) DEFAULT NULL,
        kyc_status ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BLOCKED') DEFAULT 'PENDING',
        rejection_reason TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Referral Attributions Table (First Valid Referral Code Wins)
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_attributions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL UNIQUE,
        referral_partner_id INT NOT NULL,
        referral_code_used VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (referral_partner_id) REFERENCES referral_partners(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Referral Commissions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_commissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        referral_partner_id INT NOT NULL,
        customer_id INT NOT NULL,
        service_amount DECIMAL(10,2) NOT NULL,
        commission_rate DECIMAL(5,2) NOT NULL,
        commission_amount DECIMAL(10,2) NOT NULL,
        status ENUM('PENDING', 'APPROVED', 'CANCELLED', 'PAID') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_partner_id) REFERENCES referral_partners(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Referral Payouts Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        referral_partner_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        bank_name VARCHAR(255) DEFAULT NULL,
        account_holder_name VARCHAR(255) DEFAULT NULL,
        account_number VARCHAR(100) DEFAULT NULL,
        ifsc_code VARCHAR(50) DEFAULT NULL,
        status ENUM('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED') DEFAULT 'REQUESTED',
        transaction_ref VARCHAR(255) DEFAULT NULL,
        rejection_reason TEXT DEFAULT NULL,
        processed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referral_partner_id) REFERENCES referral_partners(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Referral Settings Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Default global commission rate setting (e.g. 20.00%)
    await db.query(`
      INSERT IGNORE INTO referral_settings (setting_key, setting_value)
      VALUES ('global_commission_rate', '20.00'), ('min_payout_amount', '500.00');
    `);
  }

  // Generate unique referral code (e.g. VRP82K7)
  static generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'VRP';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Check if code is taken anywhere in referral_partners table (regardless of status)
  static async isCodeTaken(code) {
    if (!code) return false;
    const [rows] = await db.query(
      'SELECT id FROM referral_partners WHERE referral_code = ?',
      [code.trim().toUpperCase()]
    );
    return rows.length > 0;
  }

  static async findPartnerById(id) {
    const [rows] = await db.query(
      'SELECT * FROM referral_partners WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findPartnerByUserId(userId) {
    const [rows] = await db.query(
      'SELECT * FROM referral_partners WHERE user_id = ?',
      [userId]
    );
    return rows[0] || null;
  }

  static async findPartnerByCode(code) {
    const [rows] = await db.query(
      'SELECT * FROM referral_partners WHERE referral_code = ? AND kyc_status = "APPROVED"',
      [code.trim().toUpperCase()]
    );
    return rows[0] || null;
  }

  static async createPartner({ userId, fullName, mobile, email }) {
    let referralCode = this.generateUniqueCode();
    let taken = await this.isCodeTaken(referralCode);
    let maxAttempts = 20;
    while (taken && maxAttempts > 0) {
      referralCode = this.generateUniqueCode();
      taken = await this.isCodeTaken(referralCode);
      maxAttempts--;
    }

    const [result] = await db.query(
      `INSERT INTO referral_partners (user_id, referral_code, full_name, mobile, email, kyc_status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [userId, referralCode, fullName || null, mobile || null, email || null]
    );

    return result.insertId;
  }

  static async updateKyc(partnerId, kycData) {
    const {
      fullName,
      mobile,
      email,
      dob,
      address,
      aadhaarNumber,
      panNumber,
      bankName,
      accountHolderName,
      accountNumber,
      ifscCode,
      kycDocPath,
      selfiePath
    } = kycData;

    await db.query(
      `UPDATE referral_partners SET
        full_name = COALESCE(?, full_name),
        mobile = COALESCE(?, mobile),
        email = COALESCE(?, email),
        dob = COALESCE(?, dob),
        address = COALESCE(?, address),
        aadhaar_number = ?,
        pan_number = ?,
        bank_name = ?,
        account_holder_name = ?,
        account_number = ?,
        ifsc_code = ?,
        kyc_doc_path = COALESCE(?, kyc_doc_path),
        selfie_path = COALESCE(?, selfie_path),
        kyc_status = 'UNDER_REVIEW'
       WHERE id = ?`,
      [
        fullName || null,
        mobile || null,
        email || null,
        dob || null,
        address || null,
        aadhaarNumber ? aadhaarNumber.replace(/\s+/g, '') : null,
        panNumber ? panNumber.trim().toUpperCase() : null,
        bankName ? bankName.trim() : null,
        accountHolderName ? accountHolderName.trim() : null,
        accountNumber ? accountNumber.trim() : null,
        ifscCode ? ifscCode.trim().toUpperCase() : null,
        kycDocPath || null,
        selfiePath || null,
        partnerId
      ]
    );

    return this.findPartnerById(partnerId);
  }

  // Attribution (First Referral Code Wins & Self-Referral Prevention)
  static async attachReferralAttribution(customerId, referralCode) {
    const partner = await this.findPartnerByCode(referralCode);
    if (!partner) {
      throw new Error('Invalid or inactive referral code');
    }

    // Prevention Rule: Cannot refer oneself
    if (Number(partner.user_id) === Number(customerId)) {
      throw new Error('You cannot use your own referral code');
    }

    // Check if customer is already attributed
    const [existing] = await db.query(
      'SELECT id FROM referral_attributions WHERE customer_id = ?',
      [customerId]
    );
    if (existing.length > 0) {
      return { success: false, message: 'Customer already has an active referral attribution' };
    }

    await db.query(
      `INSERT INTO referral_attributions (customer_id, referral_partner_id, referral_code_used)
       VALUES (?, ?, ?)`,
      [customerId, partner.id, referralCode.trim().toUpperCase()]
    );

    return { success: true, partner };
  }

  static async getAttributionForCustomer(customerId) {
    const [rows] = await db.query(
      `SELECT ra.*, rp.referral_code, rp.full_name as partner_name
       FROM referral_attributions ra
       JOIN referral_partners rp ON ra.referral_partner_id = rp.id
       WHERE ra.customer_id = ?`,
      [customerId]
    );
    return rows[0] || null;
  }

  static async getReferredTeam(partnerId) {
    const [rows] = await db.query(
      `SELECT 
        u.id as user_id,
        u.name,
        CONCAT(LEFT(u.mobile, 3), '****', RIGHT(u.mobile, 3)) as masked_mobile,
        ra.created_at as joined_date,
        COUNT(rc.id) as booking_count,
        COALESCE(SUM(CASE WHEN rc.status != 'CANCELLED' THEN rc.commission_amount ELSE 0 END), 0) as eligible_earnings,
        'ACTIVE' as status
       FROM referral_attributions ra
       JOIN users u ON ra.customer_id = u.id
       LEFT JOIN referral_commissions rc ON rc.customer_id = u.id AND rc.referral_partner_id = ra.referral_partner_id
       WHERE ra.referral_partner_id = ?
       GROUP BY u.id, u.name, u.mobile, ra.created_at
       ORDER BY ra.created_at DESC`,
      [partnerId]
    );
    return rows;
  }

  static async removeUserFromTeam(partnerId, customerId) {
    await db.query(
      'DELETE FROM referral_attributions WHERE referral_partner_id = ? AND customer_id = ?',
      [partnerId, customerId]
    );
    return true;
  }

  // Auto-sync missing commissions for completed bookings
  static async syncMissingCommissionsForPartner(partnerId) {
    try {
      const [unprocessedPayments] = await db.query(
        `SELECT p.id, p.user_id, COALESCE(p.final_amount_after_discount, p.amount) as final_amount
         FROM payments p
         JOIN referral_attributions ra ON p.user_id = ra.customer_id
         LEFT JOIN referral_commissions rc ON p.id = rc.booking_id AND rc.referral_partner_id = ra.referral_partner_id
         WHERE ra.referral_partner_id = ?
           AND LOWER(p.booking_status) = 'completed'
           AND rc.id IS NULL`,
        [partnerId]
      );

      for (const payment of unprocessedPayments) {
        if (Number(payment.final_amount) > 0) {
          await this.createCommissionForCompletedService(payment.id, payment.user_id, payment.final_amount);
        }
      }
    } catch (err) {
      console.warn('[referral] Sync missing commissions warning:', err?.message || err);
    }
  }

  // Earnings Stats
  static async getPartnerEarningsStats(partnerId) {
    await this.syncMissingCommissionsForPartner(partnerId);

    const [teamCountRow] = await db.query(
      'SELECT COUNT(*) as total_referred FROM referral_attributions WHERE referral_partner_id = ?',
      [partnerId]
    );

    const [commissionStatsRow] = await db.query(
      `SELECT 
        COALESCE(SUM(commission_amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amount ELSE 0 END), 0) as pending_earnings,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN commission_amount ELSE 0 END), 0) as approved_earnings,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END), 0) as paid_earnings,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN commission_amount ELSE 0 END), 0) as cancelled_earnings,
        COUNT(DISTINCT booking_id) as total_bookings
       FROM referral_commissions 
       WHERE referral_partner_id = ?`,
      [partnerId]
    );

    const [payoutStatsRow] = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN status IN ('REQUESTED', 'PROCESSING') THEN amount ELSE 0 END), 0) as pending_payout_requests
       FROM referral_payouts 
       WHERE referral_partner_id = ?`,
      [partnerId]
    );

    const comm = commissionStatsRow[0] || {};
    const totalEarned = Number(comm.total_earned || 0);
    const approved = Number(comm.approved_earnings || 0);
    const paid = Number(comm.paid_earnings || 0);
    const rawPending = Number(comm.pending_earnings || 0);
    const pendingPayoutRequests = Number(payoutStatsRow[0]?.pending_payout_requests || 0);

    // Pending Earnings = Earnings waiting to be transferred to bank or in pipeline (Approved + Raw Pending)
    const pendingEarnings = Math.max(0, Math.round((approved + rawPending) * 100) / 100);

    const availableForPayout = Math.max(0, Math.round((approved - pendingPayoutRequests) * 100) / 100);

    return {
      totalReferredUsers: Number(teamCountRow[0]?.total_referred || 0),
      totalBookings: Number(comm.total_bookings || 0),
      totalEarned,
      pendingEarnings,
      approvedEarnings: approved,
      paidEarnings: paid,
      cancelledEarnings: Number(comm.cancelled_earnings || 0),
      availableForPayout
    };
  }

  // Create Commission on Service Completion (Strict PDF Rule #15)
  static async createCommissionForCompletedService(bookingId, customerId, serviceAmount) {
    const amountNum = Number(serviceAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;

    const attribution = await this.getAttributionForCustomer(customerId);
    if (!attribution) return null; // Customer was not referred

    const [existing] = await db.query(
      'SELECT id FROM referral_commissions WHERE booking_id = ? AND referral_partner_id = ?',
      [bookingId, attribution.referral_partner_id]
    );
    if (existing.length > 0) return existing[0];

    const [settingRows] = await db.query(
      'SELECT setting_value FROM referral_settings WHERE setting_key = "global_commission_rate"'
    );
    const rate = Number(settingRows[0]?.setting_value || 20.00);

    const commissionAmount = Math.round((amountNum * (rate / 100)) * 100) / 100;

    const [result] = await db.query(
      `INSERT INTO referral_commissions (booking_id, referral_partner_id, customer_id, service_amount, commission_rate, commission_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'APPROVED')`,
      [bookingId, attribution.referral_partner_id, customerId, amountNum, rate, commissionAmount]
    );

    return {
      id: result.insertId,
      bookingId,
      referralPartnerId: attribution.referral_partner_id,
      commissionAmount
    };
  }

  // Payout Management
  static async createPayoutRequest(partnerId, amount) {
    const [partnerRows] = await db.query('SELECT * FROM referral_partners WHERE id = ?', [partnerId]);
    const p = partnerRows[0];
    if (!p) throw new Error('Partner not found');

    const [result] = await db.query(
      `INSERT INTO referral_payouts (referral_partner_id, amount, bank_name, account_holder_name, account_number, ifsc_code, status)
       VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED')`,
      [partnerId, amount, p.bank_name, p.account_holder_name, p.account_number, p.ifsc_code]
    );

    return result.insertId;
  }

  static async getCommissionHistory(partnerId) {
    await this.syncMissingCommissionsForPartner(partnerId);
    const [rows] = await db.query(
      `SELECT 
        rc.id,
        rc.booking_id,
        rc.service_amount,
        rc.commission_rate,
        rc.commission_amount,
        rc.status,
        rc.created_at,
        u.name as customer_name,
        u.mobile as customer_mobile
       FROM referral_commissions rc
       JOIN users u ON rc.customer_id = u.id
       WHERE rc.referral_partner_id = ?
       ORDER BY rc.id DESC`,
      [partnerId]
    );
    return rows;
  }

  static async getPayoutHistory(partnerId) {
    const [rows] = await db.query(
      'SELECT * FROM referral_payouts WHERE referral_partner_id = ? ORDER BY created_at DESC',
      [partnerId]
    );
    return rows;
  }

  // Admin Operations
  static async listAllPartners({ status, search }) {
    let sql = 'SELECT * FROM referral_partners WHERE 1=1';
    const params = [];

    if (status && status !== 'ALL') {
      sql += ' AND kyc_status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (full_name LIKE ? OR mobile LIKE ? OR referral_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async updateKycStatus(partnerId, kycStatus, rejectionReason = null) {
    await db.query(
      'UPDATE referral_partners SET kyc_status = ?, rejection_reason = ? WHERE id = ?',
      [kycStatus, rejectionReason, partnerId]
    );
    return true;
  }

  static async listAllPayouts({ status }) {
    let sql = `
      SELECT rp.*, p.full_name as partner_name, p.mobile as partner_mobile, p.referral_code
      FROM referral_payouts rp
      JOIN referral_partners p ON rp.referral_partner_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (status && status !== 'ALL') {
      sql += ' AND rp.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY rp.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async processPayout(payoutId, { status, transactionRef, rejectionReason }) {
    await db.query(
      `UPDATE referral_payouts SET
        status = ?,
        transaction_ref = ?,
        rejection_reason = ?,
        processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, transactionRef || null, rejectionReason || null, payoutId]
    );

    if (status === 'PAID') {
      const [payoutRow] = await db.query('SELECT referral_partner_id, amount FROM referral_payouts WHERE id = ?', [payoutId]);
      if (payoutRow[0]) {
        await db.query(
          `UPDATE referral_commissions 
           SET status = 'PAID' 
           WHERE referral_partner_id = ? AND status = 'APPROVED'`,
          [payoutRow[0].referral_partner_id]
        );
      }
    }
    return true;
  }

  static async getSettings() {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM referral_settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    return settings;
  }

  static async updateSetting(key, value) {
    await db.query(
      `INSERT INTO referral_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [key, String(value), String(value)]
    );
    return true;
  }
}

module.exports = ReferralModel;
