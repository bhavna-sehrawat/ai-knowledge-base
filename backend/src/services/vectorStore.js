import 'dotenv/config';
import pg from 'pg';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { CallbackHandler } from '@langfuse/langchain';

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "gemini-embedding-001",
});

import { pool } from '../db.js';

const config = {
  pool: pool,
  tableName: "knowledge_vectors",
  columns: {
    idColumnName: "id",
    vectorColumnName: "vector",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
};

let vectorStoreInstance = null;

async function getVectorStore() {
  if (!vectorStoreInstance) {
    vectorStoreInstance = await PGVectorStore.initialize(embeddings, config);
    if (vectorStoreInstance.client) {
      vectorStoreInstance.client.on('error', (err) => {
        console.warn('VectorStore internal client connection dropped (handled):', err.message);
        vectorStoreInstance = null;
      });
      try {
        if (typeof vectorStoreInstance.client.release === 'function') {
          vectorStoreInstance.client.release();
        }
      } catch (e) {
        // ignore if already released
      }
    }
  }
  return vectorStoreInstance;
}

export async function saveDocument(content, metadata = {}) {
  try {
    const store = await getVectorStore();
    await store.addDocuments([
      {
        pageContent: content,
        metadata: metadata,
      },
    ]);
    return { success: true };
  } catch (err) {
    if (err.message?.includes('Connection terminated') || err.message?.includes('closed')) {
      console.warn('Re-initializing vector store after connection drop...');
      vectorStoreInstance = null;
      const store = await getVectorStore();
      await store.addDocuments([
        {
          pageContent: content,
          metadata: metadata,
        },
      ]);
      return { success: true };
    }
    throw err;
  }
}

export async function saveMultipleDocuments(docs) {
  try {
    const store = await getVectorStore();
    await store.addDocuments(docs);
    return { count: docs.length };
  } catch (err) {
    if (err.message?.includes('Connection terminated') || err.message?.includes('closed')) {
      console.warn('Re-initializing vector store after connection drop...');
      vectorStoreInstance = null;
      const store = await getVectorStore();
      await store.addDocuments(docs);
      return { count: docs.length };
    }
    throw err;
  }
}

// Ask Question with Multi-Tenant Isolation
export async function askQuestion(question, userId = 'guest') {
  let results;
  const filter = userId ? { userId: userId } : undefined;
  try {
    const store = await getVectorStore();
    results = await store.similaritySearch(question, 3, filter);
  } catch (err) {
    if (err.message?.includes('Connection terminated') || err.message?.includes('closed')) {
      console.warn('Re-initializing vector store after connection drop in askQuestion...');
      vectorStoreInstance = null;
      const store = await getVectorStore();
      results = await store.similaritySearch(question, 3, filter);
    } else {
      throw err;
    }
  }

  if (!results || results.length === 0) {
    return {
      answer: `I couldn't find any relevant documents in the knowledge base for user '${userId}'.`,
      sources: [],
    };
  }

  const contextText = results
    .map((r, i) => `[Snippet ${i + 1} from ${r.metadata.filename || r.metadata.category || 'Note'}]:\n${r.pageContent}`)
    .join("\n\n---\n\n");

  const sources = [
    ...new Set(results.map((r) => r.metadata.filename || r.metadata.category || 'Note')),
  ];

  const langfuseHandler = new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
  });

  const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-3.5-flash",
    temperature: 0.2,
  });

  const response = await llm.invoke(
    [
      {
        role: "system",
        content: `You are a helpful knowledge-base assistant.
Answer the user's question using ONLY the context snippets provided below:

${contextText}

Instructions:
1. Provide a direct, helpful answer based on the context.
2. If the user's exact phrase isn't used, identify the closest matching role, project, or detail in the context.
3. Only state that you don't know if the topic is completely absent from the context.`,
      },
      {
        role: "user",
        content: question,
      },
    ],
    {
      callbacks: [langfuseHandler],
    }
  );

  if (langfuseHandler.flushAsync) {
    await langfuseHandler.flushAsync();
  }

  return {
    answer: response.content,
    sources: sources,
  };
}

// Fetch indexed content/transcription for file preview
export async function getFilePreview(filename, userId = 'guest') {
  try {
    // 1. Strict match on userId first to prevent mixing with other users or unassigned rows
    let result = await pool.query(
      `SELECT content, metadata
       FROM knowledge_vectors
       WHERE LOWER(metadata->>'filename') = LOWER($1)
         AND metadata->>'userId' = $2
       ORDER BY id ASC;`,
      [filename, userId]
    );

    // 2. Fallback to unassigned legacy rows only if no user-specific rows exist
    if (!result.rows || result.rows.length === 0) {
      result = await pool.query(
        `SELECT content, metadata
         FROM knowledge_vectors
         WHERE LOWER(metadata->>'filename') = LOWER($1)
           AND metadata->>'userId' IS NULL
         ORDER BY id ASC;`,
        [filename]
      );
    }

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    // Deduplicate any repeated content chunks
    const uniqueContents = [];
    for (const row of result.rows) {
      const trimmed = row.content?.trim();
      if (trimmed && !uniqueContents.includes(trimmed)) {
        uniqueContents.push(trimmed);
      }
    }

    const combinedContent = uniqueContents.join('\n\n');
    const firstMetadata = result.rows[0].metadata || {};

    return {
      filename,
      userId,
      fileType: firstMetadata.fileType || 'text/plain',
      chunksCount: uniqueContents.length,
      content: combinedContent,
    };
  } catch (err) {
    console.error('Error fetching file preview:', err);
    throw err;
  }
}