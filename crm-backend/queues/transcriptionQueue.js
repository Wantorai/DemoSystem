const Queue = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const transcriptionQueue = new Queue('transcription', REDIS_URL);


transcriptionQueue.on('error', (err) => console.error('[queue] error', err));
transcriptionQueue.on('failed', (job, err) => console.warn('[queue] job failed', job.id, job.data, err && err.message));
transcriptionQueue.on('completed', (job, result) => console.log('[queue] job completed', job.id));
transcriptionQueue.on('stalled', (job) => console.warn('[queue] job stalled', job && job.id));
transcriptionQueue.on('active', (job, jobPromise) => console.log('[queue] job active', job.id, job.data));

module.exports = transcriptionQueue;
