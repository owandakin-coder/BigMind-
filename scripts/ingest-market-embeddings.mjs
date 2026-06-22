#!/usr/bin/env node
/**
 * ingest-market-embeddings.mjs
 *
 * Replaces placeholder zero-vectors in the market_embeddings table
 * with real OpenAI text-embedding-3-small vectors.
 *
 * Also supports ingesting new niche documents from a JSON file.
 *
 * Usage:
 *   # Replace placeholder zero-vectors (seed data)
 *   OPENAI_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... \
 *     node scripts/ingest-market-embeddings.mjs
 *
 *   # Ingest new niches from a JSON file
 *   node scripts/ingest-market-embeddings.mjs --file ./niches.json
 *
 * niches.json format:
 *   [
 *     {
 *       "niche": "python programming",
 *       "content": "Full market research text for embedding…",
 *       "source_url": "https://…",   // optional
 *       "metadata": {}               // optional extra fields
 *     }
 *   ]
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { setTimeout as delay } from 'timers/promises'

/* ── Config ────────────────────────────────────────────────── */

const OPENAI_API_KEY          = process.env.OPENAI_API_KEY
const SUPABASE_URL            = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMBEDDING_MODEL         = 'text-embedding-3-small'  // 1536 dims, cheap
const EMBED_DIM               = 1536
const BATCH_SIZE              = 10   // OpenAI parallel embeds per request
const RATE_LIMIT_DELAY_MS     = 500  // ms between batches

/* ── Validation ────────────────────────────────────────────── */

const missing = []
if (!OPENAI_API_KEY)            missing.push('OPENAI_API_KEY')
if (!SUPABASE_URL)              missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')

if (missing.length > 0) {
  console.error(`\n❌  Missing env vars: ${missing.join(', ')}\n`)
  process.exit(1)
}

/* ── Clients ───────────────────────────────────────────────── */

const openai   = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/* ── Embedding function ────────────────────────────────────── */

async function generateEmbeddings(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return response.data.map(d => d.embedding)
}

function isZeroVector(v) {
  if (!Array.isArray(v) || v.length !== EMBED_DIM) return true
  return v.every(x => x === 0)
}

/* ── Ingest from database (fix zero-vectors) ────────────────── */

async function fixZeroVectors() {
  console.log('\n🔍  Scanning for zero-vector embeddings…\n')

  const { data: rows, error } = await supabase
    .from('market_embeddings')
    .select('id, niche, content_chunk, embedding')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌  Failed to fetch market_embeddings:', error.message)
    process.exit(1)
  }

  const toFix = rows.filter(r => isZeroVector(r.embedding))
  console.log(`  Found ${toFix.length}/${rows.length} rows with zero-vectors.\n`)

  if (toFix.length === 0) {
    console.log('✅  All embeddings are already populated.')
    return
  }

  // Batch process
  let fixed = 0
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const batch = toFix.slice(i, i + BATCH_SIZE)
    const texts = batch.map(r => r.content_chunk)

    process.stdout.write(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toFix.length / BATCH_SIZE)}…`)

    const embeddings = await generateEmbeddings(texts)

    for (let j = 0; j < batch.length; j++) {
      const { error: updateError } = await supabase
        .from('market_embeddings')
        .update({ embedding: embeddings[j] })
        .eq('id', batch[j].id)

      if (updateError) {
        console.error(`\n  ❌  Failed to update row ${batch[j].id}: ${updateError.message}`)
      } else {
        fixed++
      }
    }

    console.log(` ✅  (${fixed}/${toFix.length} done)`)
    if (i + BATCH_SIZE < toFix.length) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log(`\n✅  Fixed ${fixed} embeddings.\n`)
}

/* ── Ingest from JSON file ──────────────────────────────────── */

async function ingestFromFile(filePath) {
  console.log(`\n📄  Reading niches from ${filePath}…\n`)

  let niches
  try {
    niches = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch (err) {
    console.error(`❌  Failed to parse JSON file: ${err.message}`)
    process.exit(1)
  }

  if (!Array.isArray(niches) || niches.length === 0) {
    console.error('❌  JSON file must be a non-empty array.')
    process.exit(1)
  }

  console.log(`  Found ${niches.length} niche(s) to ingest.\n`)

  let inserted = 0
  for (let i = 0; i < niches.length; i += BATCH_SIZE) {
    const batch = niches.slice(i, i + BATCH_SIZE)
    const texts = batch.map(n => n.content)

    process.stdout.write(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(niches.length / BATCH_SIZE)}…`)

    const embeddings = await generateEmbeddings(texts)

    // 90-day expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 90)

    const rows = batch.map((n, j) => ({
      niche:         n.niche,
      content_chunk: n.content,
      embedding:     embeddings[j],
      source_url:    n.source_url ?? null,
      expires_at:    expiresAt.toISOString(),
      metadata:      n.metadata ?? {},
    }))

    const { error } = await supabase
      .from('market_embeddings')
      .upsert(rows, { onConflict: 'niche,content_chunk' })

    if (error) {
      console.error(`\n  ❌  Upsert failed: ${error.message}`)
    } else {
      inserted += batch.length
    }

    console.log(` ✅  (${inserted}/${niches.length} done)`)
    if (i + BATCH_SIZE < niches.length) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log(`\n✅  Ingested ${inserted} niche embeddings.\n`)
}

/* ── Main ───────────────────────────────────────────────────── */

async function main() {
  console.log('┌─────────────────────────────────────────────────────┐')
  console.log('│  CourseForge AI — Market Embeddings Ingestion       │')
  console.log('└─────────────────────────────────────────────────────┘')
  console.log(`  Model: ${EMBEDDING_MODEL} (${EMBED_DIM}d)`)
  console.log(`  Supabase: ${SUPABASE_URL}`)

  const fileFlag = process.argv.indexOf('--file')
  if (fileFlag !== -1 && process.argv[fileFlag + 1]) {
    await ingestFromFile(process.argv[fileFlag + 1])
  } else {
    await fixZeroVectors()
  }
}

main().catch(err => {
  console.error('\n❌  Unexpected error:', err)
  process.exit(1)
})
