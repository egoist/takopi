import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { createClient, type Client } from "@libsql/client"
import { getAgentWorkspaceDir } from "./paths"

const MAX_CHUNK_CHARS = 1600

export type MemoryChunk = {
  id: number
  path: string
  startLine: number
  endLine: number
  score: number
}

export type EmbedFn = (texts: string[]) => Promise<number[][]>

// --- DB lifecycle ---

const dbCache = new Map<string, Client>()

export async function openMemoryDB(agentId: string): Promise<Client> {
  if (dbCache.has(agentId)) {
    return dbCache.get(agentId)!
  }

  const dbDir = getAgentWorkspaceDir(agentId)
  await fs.mkdir(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, "memory-index.sqlite")

  const client = createClient({ url: `file:${dbPath}` })

  // Create metadata table for tracking schema configuration
  await client.execute(
    `CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )

  // Read stored embedding dimension (or default to 1536)
  const storedRow = await client.execute(
    `SELECT value FROM memory_meta WHERE key = 'embedding_dimension'`
  )
  const dimension = storedRow.rows[0]?.value
    ? Number(storedRow.rows[0].value)
    : 1536

  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS memory_files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      mtime_ms REAL NOT NULL
    )`,
      `CREATE TABLE IF NOT EXISTS memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      hash TEXT NOT NULL,
      embedding F32_BLOB(${dimension})
    )`,
      `CREATE INDEX IF NOT EXISTS idx_chunks_path ON memory_chunks(path)`
    ],
    "write"
  )

  // Store the dimension used
  await client.execute({
    sql: `INSERT OR REPLACE INTO memory_meta (key, value) VALUES ('embedding_dimension', ?)`,
    args: [String(dimension)]
  })

  // Create FTS table — separate batch since virtual tables can't mix with regular DDL in some cases
  try {
    await client.execute(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(text, content=memory_chunks, content_rowid=id)`
    )
  } catch {
    // FTS5 might not be available in all builds
  }

  // Create vector index
  try {
    await client.execute(
      `CREATE INDEX IF NOT EXISTS memory_chunks_vec_idx ON memory_chunks(libsql_vector_idx(embedding))`
    )
  } catch {
    // Vector index might fail if no embeddings yet or not supported
  }

  // FTS sync triggers
  try {
    await client.batch(
      [
        `CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(rowid, text) VALUES (new.id, new.text);
      END`,
        `CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
      END`
      ],
      "write"
    )
  } catch {
    // Triggers might already exist or FTS not available
  }

  dbCache.set(agentId, client)
  return client
}

/**
 * Ensure the memory_chunks table uses the correct embedding dimension.
 * If the dimension changed (e.g. user switched embedding models), drops and
 * recreates the chunks table so all files will be re-indexed.
 * Returns true if migration happened.
 */
export async function ensureEmbeddingDimension(
  db: Client,
  dimension: number
): Promise<boolean> {
  const storedRow = await db.execute(
    `SELECT value FROM memory_meta WHERE key = 'embedding_dimension'`
  )
  const storedDim = storedRow.rows[0]?.value
    ? Number(storedRow.rows[0].value)
    : null

  if (storedDim === dimension) return false

  // Dimension changed — drop and recreate chunks table
  try {
    await db.execute(`DROP TABLE IF EXISTS memory_chunks_fts`)
  } catch {}
  await db.batch(
    [
      `DROP TABLE IF EXISTS memory_chunks`,
      `DELETE FROM memory_files`
    ],
    "write"
  )

  // Recreate with new dimension
  await db.batch(
    [
      `CREATE TABLE memory_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        text TEXT NOT NULL,
        hash TEXT NOT NULL,
        embedding F32_BLOB(${dimension})
      )`,
      `CREATE INDEX IF NOT EXISTS idx_chunks_path ON memory_chunks(path)`
    ],
    "write"
  )

  // Recreate FTS
  try {
    await db.execute(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(text, content=memory_chunks, content_rowid=id)`
    )
  } catch {}

  // Recreate vector index
  try {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS memory_chunks_vec_idx ON memory_chunks(libsql_vector_idx(embedding))`
    )
  } catch {}

  // Recreate FTS triggers
  try {
    await db.batch(
      [
        `CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
          INSERT INTO memory_chunks_fts(rowid, text) VALUES (new.id, new.text);
        END`,
        `CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
          INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
        END`
      ],
      "write"
    )
  } catch {}

  // Store new dimension
  await db.execute({
    sql: `INSERT OR REPLACE INTO memory_meta (key, value) VALUES ('embedding_dimension', ?)`,
    args: [String(dimension)]
  })

  return true
}

// --- Chunking ---

type Chunk = {
  startLine: number
  endLine: number
  text: string
}

export function chunkMarkdown(content: string): Chunk[] {
  const lines = content.split("\n")
  if (lines.length === 0) return []

  const chunks: Chunk[] = []
  let current: { line: string; lineNo: number }[] = []
  let currentChars = 0

  const flush = () => {
    if (current.length === 0) return
    const first = current[0]!
    const last = current[current.length - 1]!
    chunks.push({
      startLine: first.lineNo,
      endLine: last.lineNo,
      text: current.map((e) => e.line).join("\n")
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const lineNo = i + 1
    const lineSize = line.length + 1

    if (currentChars + lineSize > MAX_CHUNK_CHARS && current.length > 0) {
      flush()
      current = []
      currentChars = 0
    }

    current.push({ line, lineNo })
    currentChars += lineSize
  }

  flush()
  return chunks
}

// --- Hashing ---

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

// --- Sync ---

async function listMemoryMdFiles(workspaceDir: string): Promise<string[]> {
  const result: string[] = []

  // Only index .md files in memory/ dir (not MEMORY.md which is loaded directly into context)
  const memoryDir = path.join(workspaceDir, "memory")
  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        result.push(path.join(memoryDir, entry.name))
      }
    }
  } catch {}

  return result
}

export async function syncMemoryFiles(
  db: Client,
  workspaceDir: string,
  embedFn?: EmbedFn,
  embeddingModel?: string
): Promise<void> {
  const files = await listMemoryMdFiles(workspaceDir)

  // Detect embedding dimension and migrate schema if needed (before reading indexed state)
  if (embedFn) {
    try {
      const probe = await embedFn(["dimension probe"])
      if (probe[0]) {
        await ensureEmbeddingDimension(db, probe[0].length)
      }
    } catch {
      // Embedding unavailable — will fall back to FTS-only
    }
  }

  // Get current indexed files
  const indexed = await db.execute("SELECT path, hash FROM memory_files")
  const indexedMap = new Map<string, string>()
  for (const row of indexed.rows) {
    indexedMap.set(row.path as string, row.hash as string)
  }

  const currentPaths = new Set<string>()
  console.log(files)
  for (const absPath of files) {
    const relPath = path.relative(workspaceDir, absPath)
    currentPaths.add(relPath)

    const content = await fs.readFile(absPath, "utf-8")
    const hash = hashText(content + "\0" + (embeddingModel ?? ""))
    const stat = await fs.stat(absPath)

    // Skip if unchanged
    if (indexedMap.get(relPath) === hash) continue

    // Remove old chunks for this file
    await db.execute({ sql: "DELETE FROM memory_chunks WHERE path = ?", args: [relPath] })

    // Chunk and index
    const chunks = chunkMarkdown(content)
    if (chunks.length === 0) continue

    // Get embeddings if available
    let embeddings: number[][] | null = null
    if (embedFn) {
      try {
        console.log(`Generating embeddings for ${relPath} with model ${embeddingModel}...`)
        embeddings = await embedFn(chunks.map((c) => c.text))
      } catch (err) {
        console.error("Failed to generate embeddings:", err)
      }
    }

    // Insert chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      const chunkHash = hashText(chunk.text)
      const embedding = embeddings?.[i]

      if (embedding) {
        await db.execute({
          sql: `INSERT INTO memory_chunks (path, start_line, end_line, text, hash, embedding)
                VALUES (?, ?, ?, ?, ?, vector32(?))`,
          args: [
            relPath,
            chunk.startLine,
            chunk.endLine,
            chunk.text,
            chunkHash,
            JSON.stringify(embedding)
          ]
        })
      } else {
        await db.execute({
          sql: `INSERT INTO memory_chunks (path, start_line, end_line, text, hash)
                VALUES (?, ?, ?, ?, ?)`,
          args: [relPath, chunk.startLine, chunk.endLine, chunk.text, chunkHash]
        })
      }
    }

    // Update file record
    await db.execute({
      sql: `INSERT OR REPLACE INTO memory_files (path, hash, mtime_ms) VALUES (?, ?, ?)`,
      args: [relPath, hash, stat.mtimeMs]
    })
  }

  // Remove deleted files
  for (const [indexedPath] of indexedMap) {
    if (!currentPaths.has(indexedPath)) {
      await db.execute({ sql: "DELETE FROM memory_chunks WHERE path = ?", args: [indexedPath] })
      await db.execute({ sql: "DELETE FROM memory_files WHERE path = ?", args: [indexedPath] })
    }
  }
}

// --- Search ---

export async function searchMemory(
  db: Client,
  query: string,
  queryEmbedding?: number[],
  options?: { maxResults?: number }
): Promise<MemoryChunk[]> {
  const maxResults = options?.maxResults ?? 5
  const resultMap = new Map<number, MemoryChunk>()

  // FTS search
  try {
    const ftsResults = await db.execute({
      sql: `SELECT c.id, c.path, c.start_line, c.end_line,
                   bm25(memory_chunks_fts) AS rank
            FROM memory_chunks_fts f
            JOIN memory_chunks c ON c.id = f.rowid
            WHERE memory_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
      args: [buildFtsQuery(query), maxResults * 2]
    })

    for (const row of ftsResults.rows) {
      const id = row.id as number
      // BM25 returns negative scores (closer to 0 is better), normalize to 0-1
      const rank = Math.abs(row.rank as number)
      const score = 1 / (1 + rank) // normalize to 0-1
      resultMap.set(id, {
        id,
        path: row.path as string,
        startLine: row.start_line as number,
        endLine: row.end_line as number,
        score: score * 0.3 // FTS weight
      })
    }
  } catch {
    // FTS might not be available
  }

  // Vector search
  if (queryEmbedding) {
    try {
      const vecResults = await db.execute({
        sql: `SELECT c.id, c.path, c.start_line, c.end_line, distance
              FROM vector_top_k('memory_chunks_vec_idx', vector32(?), ?) AS v
              JOIN memory_chunks c ON c.rowid = v.id`,
        args: [JSON.stringify(queryEmbedding), maxResults * 2]
      })

      for (const row of vecResults.rows) {
        const id = row.id as number
        const distance = row.distance as number
        const score = Math.max(0, 1 - distance) // cosine distance: 0 = identical

        const existing = resultMap.get(id)
        if (existing) {
          existing.score += score * 0.7 // vector weight, add to FTS score
        } else {
          resultMap.set(id, {
            id,
            path: row.path as string,
            startLine: row.start_line as number,
            endLine: row.end_line as number,
            score: score * 0.7
          })
        }
      }
    } catch {
      // Vector search might not be available
    }
  }

  // Sort by score descending, take top results
  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

function buildFtsQuery(query: string): string {
  // Split into words, filter short ones, join with OR for broader matching
  const words = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)

  if (words.length === 0) return query

  // Use OR to find documents matching any term
  return words.map((w) => `"${w}"`).join(" OR ")
}
