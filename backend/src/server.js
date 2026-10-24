import 'dotenv/config';

// Global resilience handler: prevents transient Neon / PgBouncer socket disconnects from terminating Node
process.on('uncaughtException', (err) => {
  if (
    err.message?.includes('Connection terminated') ||
    err.message?.includes('socket') ||
    err.code === 'ECONNRESET' ||
    err.message?.includes('Client has encountered a connection error')
  ) {
    console.warn('⚠️ Handled database connection termination (Neon sleep/PgBouncer drop):', err.message);
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled Rejection (handled):', reason);
});

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

const sdk = new NodeSDK({
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      exportMode: 'immediate',
    }),
  ],
});
sdk.start();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { processFileToChunks } from './services/documentProcessor.js';
import { saveDocument, saveMultipleDocuments, askQuestion, getFilePreview } from './services/vectorStore.js';
import { createJob, createCompletedJob, completeJob, failJob, getJobById, getAllJobs } from './services/jobService.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get('/api/health', (req, res) => {
  res.json({ status: "Server is healthy and running!" });
});

// 1. Ingest Raw Text Note with userId
app.post('/api/documents', async (req, res) => {
  try {
    const { content, metadata, userId = 'guest' } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required." });
    }

    const noteTitle = metadata?.category && metadata.category.trim()
      ? `Note: ${metadata.category.trim()}`
      : `Note: ${content.trim().slice(0, 35)}${content.trim().length > 35 ? '...' : ''}`;

    const docMetadata = { ...(metadata || {}), filename: noteTitle, userId };
    await saveDocument(content, docMetadata);

    // Register note in ingestion_jobs so it appears in the files list
    await createCompletedJob(noteTitle, 'text/plain', userId, 1);

    res.status(201).json({
      message: `Note saved to knowledge base for user '${userId}'.`,
      filename: noteTitle,
    });
  } catch (err) {
    console.error("Error saving note:", err);
    res.status(500).json({ error: "Failed to store note." });
  }
});

// 2. ASYNC File Ingestion with userId
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file was uploaded." });
    }

    const userId = req.body.userId || 'guest';
    console.log(`\n--- Incoming Upload: ${req.file.originalname} (User: ${userId}) ---`);

    const job = await createJob(req.file.originalname, req.file.mimetype, userId);

    res.status(202).json({
      message: "File accepted for background processing.",
      jobId: job.id,
      userId: job.user_id,
      status: job.status,
    });

    (async () => {
      try {
        console.log(`[Job ${job.id}] Background processing started for user '${userId}'...`);
        const chunks = await processFileToChunks(req.file, userId);
        await saveMultipleDocuments(chunks);
        await completeJob(job.id, chunks.length);
        console.log(`[Job ${job.id}] Successfully completed! Indexed ${chunks.length} chunks.`);
      } catch (backgroundError) {
        console.error(`[Job ${job.id}] Processing failed:`, backgroundError.message);
        await failJob(job.id, backgroundError.message);
      }
    })();

  } catch (err) {
    console.error("Upload initiation error:", err.message);
    res.status(500).json({ error: "Failed to queue file for processing." });
  }
});

// 3. Get Files isolated by userId
app.get('/api/files', async (req, res) => {
  try {
    const userId = req.query.userId || 'guest';
    const files = await getAllJobs(userId);
    res.json(files);
  } catch (err) {
    console.error("Failed to fetch files:", err);
    res.status(500).json({ error: "Failed to retrieve drive files." });
  }
});

// 3b. File Content Preview (Notes, Transcripts, Extracted Documents)
app.get('/api/files/preview', async (req, res) => {
  try {
    const { filename, userId = 'guest' } = req.query;
    if (!filename) {
      return res.status(400).json({ error: "Filename is required." });
    }
    const preview = await getFilePreview(filename, userId);
    if (!preview) {
      return res.status(404).json({ error: "No indexed content found for this file." });
    }
    res.json(preview);
  } catch (err) {
    console.error("Preview fetch error:", err);
    res.status(500).json({ error: "Failed to load file preview." });
  }
});

// 4. Job Polling
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    res.json(job);
  } catch (err) {
    console.error("Job lookup error:", err);
    res.status(500).json({ error: "Failed to check job status." });
  }
});

// 5. Chat Query with userId Isolation
app.post('/api/chat', async (req, res) => {
  try {
    const { question, userId = 'guest' } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required." });
    }

    console.log(`\n--- Incoming Question from '${userId}': "${question}" ---`);
    const result = await askQuestion(question, userId);
    res.json(result);
  } catch (err) {
    console.error("Error querying knowledge base:", err);
    res.status(500).json({ error: "Failed to process chat query." });
  }
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Backend server listening on http://localhost:${PORT}`);
  console.log(`===============================================`);
});