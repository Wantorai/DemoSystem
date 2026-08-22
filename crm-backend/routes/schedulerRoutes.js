const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  getJobs,
  patchJob,
  runJobNow,
  getJobRuns,
} = require('../controllers/schedulerController');

router.get('/admin/scheduler/jobs', auth, getJobs);
router.patch('/admin/scheduler/jobs/:jobId', auth, patchJob);
router.post('/admin/scheduler/jobs/:jobId/run-now', auth, runJobNow);
router.get('/admin/scheduler/jobs/:jobId/runs', auth, getJobRuns);

module.exports = router;
