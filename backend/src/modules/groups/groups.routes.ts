import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireGroupRole } from '../../middleware/rbac.middleware.js';
import {
  listGroupMembers,
  listGroups,
  updateGroup,
  updateMemberRole,
} from './groups.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', listGroups);
router.get('/:groupId/members', requireGroupRole(['OWNER', 'MANAGER', 'MEMBER']), listGroupMembers);
router.patch('/:groupId', requireGroupRole(['OWNER']), updateGroup);
router.patch('/:groupId/members/:userId/role', requireGroupRole(['OWNER']), updateMemberRole);

export default router;