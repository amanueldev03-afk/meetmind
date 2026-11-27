import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireGroupRole, requireMeetingRole } from '../../middleware/rbac.middleware.js';
import {
  cancelMeeting,
  createMeeting,
  endMeeting,
  getMeetingAttendance,
  getMeetingById,
  joinMeeting,
  listMeetings,
} from './meetings.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', requireGroupRole(['OWNER', 'MANAGER', 'MEMBER']), listMeetings);
router.post('/', requireGroupRole(['OWNER', 'MANAGER']), createMeeting);
router.get('/:id', requireMeetingRole(['OWNER', 'MANAGER', 'MEMBER']), getMeetingById);
router.patch('/:id/cancel', requireMeetingRole(['OWNER', 'MANAGER']), cancelMeeting);
router.post('/:id/join', joinMeeting);
router.post('/:id/end', requireMeetingRole(['OWNER', 'MANAGER']), endMeeting);
router.get(
  '/:id/attendance',
  requireMeetingRole(['OWNER', 'MANAGER', 'MEMBER']),
  getMeetingAttendance,
);

export default router;