const express = require('express');
const router = express.Router();
const ReferralController = require('./referral.controller');
const { userProtect, adminProtect } = require('../../middlewares/auth.middleware');

// User / Referral Partner Endpoints
router.get('/profile', userProtect, ReferralController.getProfile);
router.post('/kyc', userProtect, ReferralController.submitKyc);
router.get('/dashboard', userProtect, ReferralController.getDashboard);
router.get('/team', userProtect, ReferralController.getTeam);
router.post('/team/remove', userProtect, ReferralController.removeTeamMember);
router.post('/apply-code', userProtect, ReferralController.applyReferralCode);
router.post('/payout-request', userProtect, ReferralController.requestPayout);
router.get('/payout-history', userProtect, ReferralController.getPayoutHistory);
router.get('/commission-history', userProtect, ReferralController.getCommissionHistory);

// Admin Endpoints
router.get('/admin/partners', adminProtect, ReferralController.adminListPartners);
router.post('/admin/partners/kyc-status', adminProtect, ReferralController.adminUpdateKycStatus);
router.get('/admin/payouts', adminProtect, ReferralController.adminListPayouts);
router.post('/admin/payouts/process', adminProtect, ReferralController.adminProcessPayout);
router.get('/admin/settings', adminProtect, ReferralController.adminGetSettings);
router.post('/admin/settings/update', adminProtect, ReferralController.adminUpdateSetting);

module.exports = router;
