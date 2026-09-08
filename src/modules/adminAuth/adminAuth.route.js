const express = require('express');
const router = express.Router();
const AdminAuthController = require('./adminAuth.controller');
const { adminProtect } = require('../../middlewares/auth.middleware');

router.post('/register', AdminAuthController.register);
router.post('/login', AdminAuthController.login);
router.get('/profile', adminProtect, AdminAuthController.getProfile);
router.get('/admins', adminProtect, AdminAuthController.listAdmins);
router.post('/admins', adminProtect, AdminAuthController.createAdmin);
router.delete('/admins/:id', adminProtect, AdminAuthController.deleteAdmin);
router.post('/forgot-password', AdminAuthController.forgotPassword);
router.post('/reset-password/:token', AdminAuthController.resetPassword);

module.exports = router;
