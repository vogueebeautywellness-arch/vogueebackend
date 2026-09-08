const express = require('express');
const ReviewController = require('./review.controller');
const { userProtect, adminProtect } = require('../../middlewares/auth.middleware');

const reviewRoutes = express.Router();
const adminReviewRoutes = express.Router();

// User / public
reviewRoutes.post('/create', userProtect, ReviewController.create);
reviewRoutes.get('/my', userProtect, ReviewController.my);
reviewRoutes.get('/approved', ReviewController.approved);

// Admin
adminReviewRoutes.get('/', adminProtect, ReviewController.adminList);
adminReviewRoutes.put('/:id/approve', adminProtect, ReviewController.approve);
adminReviewRoutes.put('/:id/reject', adminProtect, ReviewController.reject);
adminReviewRoutes.delete('/:id', adminProtect, ReviewController.remove);

module.exports = { reviewRoutes, adminReviewRoutes };
