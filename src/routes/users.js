import express from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  getCompanyUsers,
  deleteUser,
  createUser,
  updateUserRole,
  updateUserStatus,
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadAvatar as uploadAvatarMiddleware } from '../config/multer.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.post('/avatar', uploadAvatarMiddleware.single('avatar'), uploadAvatar);

// Admin only
router.get('/company-users', authorize('admin', 'super_admin'), getCompanyUsers);
router.post('/company-users', authorize('admin', 'super_admin'), createUser);
router.put('/:userId/role', authorize('admin', 'super_admin'), updateUserRole);
router.put('/:userId/status', authorize('admin', 'super_admin'), updateUserStatus);
router.delete('/:userId', authorize('admin', 'super_admin'), deleteUser);

export default router;
