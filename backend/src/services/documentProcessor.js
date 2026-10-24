import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function generateTranscriptWithFallback(genAI, prompt, mediaPayload) {
  const fallbackModels = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
  ];

  let lastError = null;

  for (const modelName of fallbackModels) {
    try {
      console.log(`Transcribing with model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent([prompt, mediaPayload]);
      const text = response.response.text();
      console.log(`Success with ${modelName}!`);
      return text;
    } catch (err) {
      console.warn(`Model ${modelName} encountered an issue (${err.message}). Trying next fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error("All fallback transcription models were unavailable.");
}

export async function processFileToChunks(file, userId = 'guest') {
  let rawText = '';
  const filename = file.originalname.toLowerCase();

  // 1. PDF
  if (filename.endsWith('.pdf')) {
    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    rawText = result.text;
  }
  // 2. Text
  else if (filename.endsWith('.txt') || filename.endsWith('.md')) {
    rawText = file.buffer.toString('utf-8');
  }
  // 3. Word
  else if (filename.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    rawText = result.value;
  }
  // 4. CSV
  else if (filename.endsWith('.csv')) {
    const fileContent = file.buffer.toString('utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true });
    rawText = records
      .map((row, index) => {
        const rowDetails = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `[Row ${index + 1}] ${rowDetails}`;
      })
      .join('\n');
  }
  // 5. Excel
  else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);

    const records = parse(csvContent, { columns: true, skip_empty_lines: true });
    rawText = records
      .map((row, index) => {
        const rowDetails = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `[Excel Row ${index + 1}] ${rowDetails}`;
      })
      .join('\n');
  }
  // 6. Audio & Video
  else if (
    filename.endsWith('.mp3') ||
    filename.endsWith('.wav') ||
    filename.endsWith('.m4a') ||
    filename.endsWith('.mp4') ||
    filename.endsWith('.mov') ||
    filename.endsWith('.webm')
  ) {
    console.log(`Initiating multimedia processing via Gemini File API...`);

    const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

    const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${file.originalname}`);
    await fs.promises.writeFile(tempFilePath, file.buffer);

    let fileRecord = null;

    try {
      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: file.mimetype,
        displayName: file.originalname,
      });

      fileRecord = uploadResult.file;

      while (fileRecord.state === 'PROCESSING') {
        console.log('Video processing in progress, waiting 3 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        fileRecord = await fileManager.getFile(fileRecord.name);
      }

      if (fileRecord.state === 'FAILED') {
        throw new Error('Gemini failed to process multimedia file.');
      }

      const prompt = `Transcribe this audio or video completely and accurately. Include timestamps (e.g. [00:15]) and identify speakers wherever possible.`;
      const mediaPayload = {
        fileData: { fileUri: fileRecord.uri, mimeType: fileRecord.mimeType },
      };

      rawText = await generateTranscriptWithFallback(genAI, prompt, mediaPayload);
      await fileManager.deleteFile(fileRecord.name);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }
    }
  }
  else {
    throw new Error(`Unsupported format. Allowed: .pdf, .txt, .docx, .csv, .xlsx, .mp3, .wav, .mp4`);
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('File contains no readable content.');
  }

  // Split into chunks with user_id attached to metadata
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 100,
  });

  const docs = await splitter.createDocuments(
    [rawText],
    [{ filename: file.originalname, fileType: file.mimetype, userId: userId }]
  );

  return docs;
}