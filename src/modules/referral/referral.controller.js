const ReferralModel = require('./referral.model');
const {
  validateAadhaar,
  validatePan,
  validateIfsc,
  validateAccountNumber,
  validatePayoutAmount,
  validateEmail
} = require('./referral.validation');

class ReferralController {
  // Get Current User's Referral Profile
  static async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const partner = await ReferralModel.findPartnerByUserId(userId);

      if (!partner) {
        return res.json({
          success: true,
          isReferralPartner: false,
          kycStatus: null,
          partner: null
        });
      }

      const maskedAadhaar = partner.aadhaar_number ? `XXXX-XXXX-${partner.aadhaar_number.slice(-4)}` : null;
      const maskedPan = partner.pan_number ? `XXXXX${partner.pan_number.slice(-4)}` : null;
      const maskedAcc = partner.account_number ? `XXXX${partner.account_number.slice(-4)}` : null;

      return res.json({
        success: true,
        isReferralPartner: true,
        kycStatus: partner.kyc_status,
        partner: {
          id: partner.id,
          referralCode: partner.referral_code,
          fullName: partner.full_name,
          mobile: partner.mobile,
          email: partner.email,
          dob: partner.dob,
          address: partner.address,
          aadhaarNumber: maskedAadhaar,
          panNumber: maskedPan,
          bankName: partner.bank_name,
          accountHolderName: partner.account_holder_name,
          accountNumber: maskedAcc,
          ifscCode: partner.ifsc_code,
          kycStatus: partner.kyc_status,
          rejectionReason: partner.rejection_reason,
          createdAt: partner.created_at
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // Register or Submit KYC
  static async submitKyc(req, res, next) {
    try {
      const userId = req.user.id;
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
        ifscCode
      } = req.body;

      // Validation Checks
      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ success: false, message: 'Full name is required' });
      }

      if (email && email.trim()) {
        const vEmail = validateEmail(email);
        if (!vEmail.valid) return res.status(400).json({ success: false, message: vEmail.message });
      }

      const vAadhaar = validateAadhaar(aadhaarNumber);
      if (!vAadhaar.valid) return res.status(400).json({ success: false, message: vAadhaar.message });

      const vPan = validatePan(panNumber);
      if (!vPan.valid) return res.status(400).json({ success: false, message: vPan.message });

      const vIfsc = validateIfsc(ifscCode);
      if (!vIfsc.valid) return res.status(400).json({ success: false, message: vIfsc.message });

      const vAcc = validateAccountNumber(accountNumber);
      if (!vAcc.valid) return res.status(400).json({ success: false, message: vAcc.message });

      if (!bankName || !bankName.trim()) {
        return res.status(400).json({ success: false, message: 'Bank name is required' });
      }

      let partner = await ReferralModel.findPartnerByUserId(userId);
      if (!partner) {
        const partnerId = await ReferralModel.createPartner({
          userId,
          fullName: fullName.trim(),
          mobile: mobile || req.user.mobile,
          email: email || req.user.email
        });
        partner = await ReferralModel.findPartnerByUserId(userId);
      }

      const kycDocPath = req.files?.kycDoc?.[0]?.path || req.body?.kycDocPath || null;
      const selfiePath = req.files?.selfie?.[0]?.path || req.body?.selfiePath || null;

      const updated = await ReferralModel.updateKyc(partner.id, {
        fullName: fullName.trim(),
        mobile: mobile ? mobile.trim() : null,
        email: email ? email.trim() : null,
        dob: dob ? dob.trim() : null,
        address: address ? address.trim() : null,
        aadhaarNumber: vAadhaar.clean,
        panNumber: vPan.clean,
        bankName: bankName.trim(),
        accountHolderName: accountHolderName ? accountHolderName.trim() : fullName.trim(),
        accountNumber: vAcc.clean,
        ifscCode: vIfsc.clean,
        kycDocPath,
        selfiePath
      });

      return res.json({
        success: true,
        message: 'KYC submitted successfully and is now under review.',
        kycStatus: updated?.kyc_status || 'UNDER_REVIEW'
      });
    } catch (err) {
      next(err);
    }
  }

  // Get Referral Partner Dashboard Data
  static async getDashboard(req, res, next) {
    try {
      const userId = req.user.id;
      const partner = await ReferralModel.findPartnerByUserId(userId);

      if (!partner || partner.kyc_status !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          message: 'Referral Partner approval required to access dashboard.',
          kycStatus: partner?.kyc_status || 'NOT_APPLIED'
        });
      }

      const stats = await ReferralModel.getPartnerEarningsStats(partner.id);
      const settings = await ReferralModel.getSettings();
      const minPayoutAmount = Number(settings.min_payout_amount || 500);

      return res.json({
        success: true,
        partner: {
          id: partner.id,
          referralCode: partner.referral_code,
          fullName: partner.full_name,
          shareLink: `https://voguee.co.in/ref/${partner.referral_code}`
        },
        stats: {
          ...stats,
          minPayoutAmount
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // Get Referred Team List
  static async getTeam(req, res, next) {
    try {
      const userId = req.user.id;
      const partner = await ReferralModel.findPartnerByUserId(userId);

      if (!partner || partner.kyc_status !== 'APPROVED') {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      const team = await ReferralModel.getReferredTeam(partner.id);

      return res.json({
        success: true,
        count: team.length,
        team
      });
    } catch (err) {
      next(err);
    }
  }

  // Remove/Leave User from Team (Rule #13)
  static async removeTeamMember(req, res, next) {
    try {
      const userId = req.user.id;
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const partner = await ReferralModel.findPartnerByUserId(userId);
      if (!partner) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      await ReferralModel.removeUserFromTeam(partner.id, customerId);

      return res.json({
        success: true,
        message: 'User removed from referral team. Previous commissions remain valid.'
      });
    } catch (err) {
      next(err);
    }
  }

  // Attach Referral Code during New User Registration (Rule #17)
  static async applyReferralCode(req, res, next) {
    try {
      const customerId = req.user.id;
      const { referralCode } = req.body;

      if (!referralCode || !referralCode.trim()) {
        return res.status(400).json({ success: false, message: 'Referral code is required' });
      }

      const result = await ReferralModel.attachReferralAttribution(customerId, referralCode.trim());

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.message });
      }

      return res.json({
        success: true,
        message: `Successfully attached to Referral Partner (${result.partner.full_name || result.partner.referral_code})`
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Request Payout
  static async requestPayout(req, res, next) {
    try {
      const userId = req.user.id;
      const { amount } = req.body;

      const partner = await ReferralModel.findPartnerByUserId(userId);
      if (!partner || partner.kyc_status !== 'APPROVED') {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      const stats = await ReferralModel.getPartnerEarningsStats(partner.id);
      const settings = await ReferralModel.getSettings();
      const minPayout = Number(settings.min_payout_amount || 500);

      const vAmount = validatePayoutAmount(amount, stats.availableForPayout, minPayout);
      if (!vAmount.valid) {
        return res.status(400).json({ success: false, message: vAmount.message });
      }

      const payoutId = await ReferralModel.createPayoutRequest(partner.id, vAmount.num);

      return res.json({
        success: true,
        message: 'Payout request submitted successfully.',
        payoutId
      });
    } catch (err) {
      next(err);
    }
  }

  // Get Payout History
  static async getPayoutHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const partner = await ReferralModel.findPartnerByUserId(userId);

      if (!partner) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      const payouts = await ReferralModel.getPayoutHistory(partner.id);

      return res.json({
        success: true,
        payouts
      });
    } catch (err) {
      next(err);
    }
  }

  // Get Detailed Commission History (Per Booking)
  static async getCommissionHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const partner = await ReferralModel.findPartnerByUserId(userId);

      if (!partner) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      const history = await ReferralModel.getCommissionHistory(partner.id);

      return res.json({
        success: true,
        count: history.length,
        history
      });
    } catch (err) {
      next(err);
    }
  }

  // --- ADMIN ENDPOINTS ---

  static async adminListPartners(req, res, next) {
    try {
      const { status, search } = req.query;
      const partners = await ReferralModel.listAllPartners({ status, search });
      return res.json({ success: true, count: partners.length, partners });
    } catch (err) {
      next(err);
    }
  }

  static async adminUpdateKycStatus(req, res, next) {
    try {
      const { partnerId, kycStatus, rejectionReason } = req.body;
      if (!partnerId || !kycStatus) {
        return res.status(400).json({ success: false, message: 'partnerId and kycStatus are required' });
      }

      const validStatuses = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BLOCKED'];
      if (!validStatuses.includes(kycStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid kycStatus value' });
      }

      await ReferralModel.updateKycStatus(partnerId, kycStatus, rejectionReason);

      return res.json({
        success: true,
        message: `Referral Partner status updated to ${kycStatus}`
      });
    } catch (err) {
      next(err);
    }
  }

  static async adminListPayouts(req, res, next) {
    try {
      const { status } = req.query;
      const payouts = await ReferralModel.listAllPayouts({ status });
      return res.json({ success: true, count: payouts.length, payouts });
    } catch (err) {
      next(err);
    }
  }

  static async adminProcessPayout(req, res, next) {
    try {
      const { payoutId, status, transactionRef, rejectionReason } = req.body;
      if (!payoutId || !status) {
        return res.status(400).json({ success: false, message: 'payoutId and status are required' });
      }

      const validStatuses = ['PAID', 'REJECTED', 'PROCESSING'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
      }

      await ReferralModel.processPayout(payoutId, { status, transactionRef, rejectionReason });

      return res.json({
        success: true,
        message: `Payout #${payoutId} updated to ${status}`
      });
    } catch (err) {
      next(err);
    }
  }

  static async adminGetSettings(req, res, next) {
    try {
      const settings = await ReferralModel.getSettings();
      return res.json({ success: true, settings });
    } catch (err) {
      next(err);
    }
  }

  static async adminUpdateSetting(req, res, next) {
    try {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ success: false, message: 'Setting key required' });

      await ReferralModel.updateSetting(key, value);
      return res.json({ success: true, message: 'Setting updated successfully' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReferralController;
