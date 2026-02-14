# Memory System

Takopi gives each agent persistent memory that survives across chat sessions. Memory is built from markdown files stored on disk and indexed in a SQLite database for search.

## Storage Layout

All memory lives under the agent's workspace directory:

```
~/.takopi/agents/{agentId}/
├── MEMORY.md              # Long-term curated memory
├── SOUL.md                # Personality and behavior guidelines
├── IDENTITY.md            # Name, creature, vibe, emoji
├── USER.md                # Info about the user
├── memory/
│   ├── 2025-01-15.md      # Daily notes
│   ├── 2025-01-15-1430.md # Session transcript
│   └── ...
└── memory-index.sqlite    # Search index (FTS + vectors)
```

## File Types

### MEMORY.md

Long-term curated knowledge. The agent writes here when something is worth remembering permanently — decisions, preferences, recurring patterns.

### Daily Notes (`memory/YYYY-MM-DD.md`)

Raw logs of what happened on a given day. When a user says "remember this", the agent writes to today's daily note.

### Session Files (`memory/YYYY-MM-DD-HHMM.md`)

Automatic transcripts saved when a chat session ends (user clicks "New Chat"). Contains the chat ID, agent ID, and the conversation's user/assistant messages.

### Workspace Files

`SOUL.md`, `IDENTITY.md`, and `USER.md` are always-on context files loaded into the system prompt. They have different jobs and should not be mixed:

- `SOUL.md` (behavior contract): how the agent should think and act. Put stable operating principles here (tone, boundaries, collaboration style, decision defaults).
- `IDENTITY.md` (character profile): who the agent is. Put name, creature/archetype, voice/vibe, and presentation traits here.
- `USER.md` (user profile): who the user is to this agent. Put durable user preferences, goals, constraints, and recurring workflow context here.

Use these files for stable guidance, not chat logs. Day-to-day events and conversation history belong in `memory/` files; durable learned facts belong in `MEMORY.md`.

## Automatic Context Loading

At the start of every chat, the system loads and injects into the system prompt:

1. **Workspace files** — `SOUL.md`, `IDENTITY.md`, `USER.md` (if they exist)
2. **MEMORY.md** (if it exists)
3. **Today's daily note** (`memory/YYYY-MM-DD.md`)
4. **Yesterday's daily note** (for continuity across midnight)

Files larger than 20,000 characters are truncated, keeping 70% from the head and 20% from the tail.

## Session Memory Saving

When the user starts a new chat (while an active chat exists), the current session is saved automatically:

1. User and assistant messages are extracted from the chat
2. A file is written to `memory/YYYY-MM-DD-HHMM.md` with a header containing the session timestamp, chat ID, and agent ID
3. The conversation content follows as `role: text` lines

When a chat is deleted, its associated session memory file is also deleted.

## Search Index

Memory files are indexed in a SQLite database (`memory-index.sqlite`) using [LibSQL](https://github.com/tursodatabase/libsql) for hybrid search.

### Schema

| Table                   | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `memory_meta`           | Stores config like embedding dimension                |
| `memory_files`          | Tracks indexed files by path, content hash, and mtime |
| `memory_chunks`         | Stores chunked text with embeddings                   |
| `memory_chunks_fts`     | FTS5 virtual table for keyword search                 |
| `memory_chunks_vec_idx` | Vector index for semantic search                      |

### Chunking

Files are split into chunks of up to 1,600 characters, respecting line boundaries. Each chunk records its source file path and line range.

### Indexing

When the `MemorySearch` tool is called, files are synced before searching:

1. All `.md` files in `memory/` are listed
2. Each file's content hash (including the embedding model name) is compared to the indexed version
3. Changed or new files are re-chunked, embedded (if an embedding model is configured), and inserted
4. Deleted files are removed from the index

If the embedding model changes (different dimension), the entire chunks table is dropped and rebuilt.

### Hybrid Search

Search combines two strategies with weighted scoring:

- **FTS (30% weight)** — BM25 full-text search. The query is split into words (2+ chars) and joined with OR. Scores are normalized to 0–1.
- **Vector (70% weight)** — Cosine distance search using the configured embedding model. Score is `1 - distance`.

Results from both are merged by chunk ID, scores are summed, and the top N results are returned.

If no embedding model is configured, search falls back to FTS only.

## AI Tools

Agents have two tools for accessing memory:

### MemorySearch

Searches indexed memory files for relevant past conversations and context.

**Input:**

- `query` (string) — the search query
- `maxResults` (number, default 5) — max results to return

**Output:** Array of `{ path, lines, score }` — file paths and line ranges sorted by relevance.

### MemoryGet

Reads content from a memory file, optionally by line range.

**Input:**

- `path` (string) — relative path to the file (as returned by MemorySearch)
- `from` (number, optional) — starting line number (1-based)
- `lines` (number, optional) — number of lines to read

**Output:** `{ path, text }` — the file content.

Both tools are read-only and do not require user confirmation. Path traversal outside the workspace directory is blocked.

## Embeddings

Embedding generation is optional and depends on the user's settings (`embeddingModel` in config). When configured:

- `embedMany()` from the Vercel AI SDK generates embeddings for text chunks during indexing
- `embed()` generates a single embedding for the search query
- The embedding dimension is auto-detected and stored in `memory_meta`

Without an embedding model, the system still works using FTS-only search.

## Configuration

The embedding model is configured in the app settings page. The config field is `embeddingModel` in the format `providerId/modelId` (e.g., `openai/text-embedding-3-small`).
