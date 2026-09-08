const express = require('express');
const controller = require('../modules/coupon/coupon.controller');
const { adminProtect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/coupons', adminProtect, controller.list);
router.post('/coupons/create', adminProtect, controller.create);
router.put('/coupons/:id', adminProtect, controller.update);
router.patch('/coupons/:id/toggle', adminProtect, controller.toggle);
router.delete('/coupons/:id', adminProtect, controller.remove);

module.exports = router;