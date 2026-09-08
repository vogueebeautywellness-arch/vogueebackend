const express = require('express');
const router = express.Router();

const db = require('../config/db');
const { adminProtect: adminAuth } = require('../middlewares/auth.middleware');
const UserAuthService = require('../modules/userAuth/userAuth.service');
const { successResponse } = require('../utils/response');

const AdminUserController = {
	getAllUsers: async (req, res, next) => {
		try {
			const [users] = await db.query(`
				SELECT 
					id,
					name,
					mobile,
					email,
					gender,
					city,
					avatar,
					role,
					status,
					created_at,
					updated_at
				FROM users
				ORDER BY created_at DESC
			`);

			return res.json({ users });
		} catch (error) {
			return next(error);
		}
	},

	deleteUser: async (req, res, next) => {
		try {
			const data = await UserAuthService.deleteAccount({
				userId: req.params.id,
				rejectAlreadyDeleted: true,
				ip: req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || null,
				device: req.headers['user-agent'] || null
			});

			return successResponse(res, 200, 'User account deleted successfully', data);
		} catch (error) {
			return next(error);
		}
	}
};

router.get('/users', adminAuth, AdminUserController.getAllUsers);
router.delete('/users/:id', adminAuth, AdminUserController.deleteUser);

module.exports = router;
