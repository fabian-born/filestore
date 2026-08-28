import { randomUUID } from 'crypto';

const jobs = new Map();
const CLEANUP_DELAY_MS = 5 * 60 * 1000;

export function createJob(total) {
  const id = randomUUID();
  const job = { id, status: 'running', total, moved: 0, error: null };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

// Finished jobs are kept around briefly so the frontend's last poll still
// finds them, then dropped so the map doesn't grow forever.
export function scheduleCleanup(id) {
  setTimeout(() => jobs.delete(id), CLEANUP_DELAY_MS).unref();
}
