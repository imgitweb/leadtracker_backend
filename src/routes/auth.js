import express from 'express';
import { protect } from '../middleware/auth.js';
import { loginLimiter } from '../config/rateLimiter.js';
import {
	register,
	login,
	logout,
	refreshToken,
	getCurrentUser,
	forgotPassword,
	resetPassword,
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login',  login);
router.post('/logout', protect, logout);
router.post('/refresh-token', refreshToken);
router.get('/me', protect, getCurrentUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

export default router;
