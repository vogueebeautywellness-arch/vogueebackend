const express = require('express');
const router = express.Router();

const db = require('../config/db');
const { adminProtect } = require('../middlewares/auth.middleware');
const PartnerAuthService = require('../modules/partnerAuth/partnerAuth.service');
const { successResponse } = require('../utils/response');

const AdminPartnerController = {
  getAllPartners: async (req, res, next) => {
    try {
      const [partners] = await db.query(`
        SELECT
          p.id,
          COALESCE(
            NULLIF(p.name, ''),
            NULLIF(pk.full_name, ''),
            NULLIF(pk.salon_name, ''),
            NULLIF(p.mobile, ''),
            CONCAT('Partner ', p.id)
          ) AS name,
          p.mobile,
          p.kyc_status,
          p.created_at
        FROM partners p
        LEFT JOIN partner_kyc pk ON pk.partner_id = p.id
        ORDER BY p.created_at DESC
      `);

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('ADMIN PARTNERS QUERY:', partners);
      }

      return res.json({ partners });
    } catch (error) {
      return next(error);
    }
  },

  deletePartner: async (req, res, next) => {
    try {
      const data = await PartnerAuthService.deleteAccount({
        partnerId: req.params.id,
        rejectAlreadyDeleted: true,
        anonymizePersonalData: true,
        ip: req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || null,
        device: req.headers['user-agent'] || null
      });

      return successResponse(res, 200, 'Partner account deleted successfully', data);
    } catch (error) {
      return next(error);
    }
  }
};

router.get('/partners', adminProtect, AdminPartnerController.getAllPartners);
router.delete('/partners/:id', adminProtect, AdminPartnerController.deletePartner);

module.exports = router;
