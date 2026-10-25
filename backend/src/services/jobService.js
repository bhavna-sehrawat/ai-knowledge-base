import { pool } from '../db.js';

// 1. Create job with userId
export async function createJob(filename, fileType, userId = 'guest') {
  const result = await pool.query(
    `INSERT INTO ingestion_jobs (filename, file_type, user_id, status)
     VALUES ($1, $2, $3, 'processing')
     RETURNING id, filename, user_id, status, created_at;`,
    [filename, fileType, userId]
  );
  return result.rows[0];
}

// 1b. Create immediately completed job record (for text notes)
export async function createCompletedJob(filename, fileType = 'text/plain', userId = 'guest', chunksCount = 1) {
  const result = await pool.query(
    `INSERT INTO ingestion_jobs (filename, file_type, user_id, status, chunks_created)
     VALUES ($1, $2, $3, 'completed', $4)
     RETURNING id, filename, user_id, status, chunks_created, created_at;`,
    [filename, fileType, userId, chunksCount]
  );
  return result.rows[0];
}

// 2. Mark job completed
export async function completeJob(jobId, chunksCount) {
  await pool.query(
    `UPDATE ingestion_jobs 
     SET status = 'completed', chunks_created = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2;`,
    [chunksCount, jobId]
  );
}

// 3. Mark job failed
export async function failJob(jobId, errorMessage) {
  await pool.query(
    `UPDATE ingestion_jobs 
     SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2;`,
    [errorMessage, jobId]
  );
}

// 4. Get single job status
export async function getJobById(jobId) {
  const result = await pool.query(
    `SELECT id, filename, user_id, status, chunks_created, error_message, created_at, updated_at
     FROM ingestion_jobs
     WHERE id = $1;`,
    [jobId]
  );
  return result.rows[0];
}

// 5. Get files isolated by active user
export async function getAllJobs(userId = 'guest') {
  const result = await pool.query(
    `SELECT id, filename, user_id, file_type, status, chunks_created, created_at
     FROM ingestion_jobs
     WHERE user_id = $1
     ORDER BY created_at DESC;`,
    [userId]
  );
  return result.rows;
}

// 6. Delete a job record
export async function deleteJob(jobId, userId = 'guest') {
  const result = await pool.query(
    `DELETE FROM ingestion_jobs
     WHERE id = $1 AND user_id = $2
     RETURNING id, filename, user_id;`,
    [jobId, userId]
  );
  return result.rows[0];
}