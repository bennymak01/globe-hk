#!/usr/bin/env node
/**
 * fetch-keywords.mjs — pull real search volume + difficulty from DataForSEO
 * for the globe-hk keyword list, and write the results into the repo CSV
 * and back to the Google Sheet.
 *
 * Usage:
 *   node scripts/fetch-keywords.mjs                 # all keywords in the CSV
 *   node scripts/fetch-keywords.mjs --batch 20      # smaller API batches
 *   node scripts/fetch-keywords.mjs --only 地球儀    # filter
 *
 * Env:
 *   DATAFORSEO_LOGIN     API login  (app.dataforseo.com → API Access)
 *   DATAFORSEO_PASSWORD  API password
 *
 * Location 24128 = Hong Kong, language 1028 = zh-Hant (Traditional Chinese).
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOGIN = process.env.DATAFORSEO_LOGIN;
const PASSWORD = process.env.DATAFORSEO_PASSWORD;
const API = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';

const LOCATION_CODE = 2344; // Hong Kong (NOT 24128 — Google Ads rejects that)
const LANGUAGE_CODE = 'zh_TW'; // Traditional Chinese (NOT 1028 — Google Ads rejects that)

if (!LOGIN || !PASSWORD) {
  console.error('✗ DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx > -1 ? args[onlyIdx + 1] : null;
const batchIdx = args.indexOf('--batch');
const BATCH = batchIdx > -1 ? Number(args[batchIdx + 1]) : 25;

/** Parse the repo's keyword CSV into records. */
function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split('\n');
  const headers = headerLine.split(',').map((h) => h.trim());
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',');
    const rec = {};
    headers.forEach((h, i) => (rec[h] = (cells[i] || '').trim()));
    return rec;
  });
}

/** Call the DataForSEO live endpoint for one batch of keywords. */
async function fetchBatch(keywords) {
  const body = JSON.stringify([
    {
      keywords,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      include_serp_data: false,
    },
  ]);

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64'),
    },
    body,
  });

  const json = await res.json();
  if (json.status_code !== 20000) {
    console.warn(`  ! status ${json.status_code}: ${json.status_message}`);
    return [];
  }
  const task = (json.tasks || [])[0];
  // A task-level error (bad field, no data) is NOT a success — surface it.
  if (task?.status_code && task.status_code !== 20000) {
    console.warn(`  ! task ${task.status_code}: ${task.status_message}`);
    return [];
  }
  const results = task?.result || [];
  if (!results.length) {
    console.warn(`  ! task ${task?.status_code}: no rows for ${keywords.length} keyword(s)`);
  }
  return results;
}

const csvPath = path.resolve('SEO_KEYWORDS.csv');
const records = parseCsv(await readFile(csvPath, 'utf8'));
const targets = only
  ? records.filter((r) => r.Keyword.includes(only))
  : records;

console.log(`→ fetching ${targets.length} keywords (batch ${BATCH}) for HK / zh-Hant`);

const found = new Map();
let cost = 0;

for (let i = 0; i < targets.length; i += BATCH) {
  const slice = targets.slice(i, i + BATCH);
  const keywords = slice.map((r) => r.Keyword);
  process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(targets.length / BATCH)} (${keywords.length})… `);
  try {
    const results = await fetchBatch(keywords);
    for (const r of results) {
      found.set(r.keyword, {
        volume: r.search_volume ?? 0,
        difficulty: r.keyword_difficulty ?? null,
        competition: r.competition ?? null,
        cpc: r.cpc ?? null,
        intent: r.search_intent?.search_intent_type ?? null,
      });
    }
    console.log(`ok (${results.length} returned)`);
  } catch (err) {
    console.log(`FAILED — ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 1200)); // be polite to the API
}

// Merge results back into the CSV, preserving the existing column order.
const outHeaders = [
  'Keyword', 'Category', 'Intent', 'Target_Series', 'Target_Slug',
  'Difficulty_Estimate', 'Volume_Actual', 'Notes',
  'Difficulty_Actual', 'Competition', 'CPC_USD', 'Search_Intent',
];
const outLines = [outHeaders.join(',')];

for (const rec of records) {
  const d = found.get(rec.Keyword);
  outLines.push([
    rec.Keyword,
    rec.Category,
    rec.Intent,
    rec.Target_Series,
    rec.Target_Slug,
    rec.Difficulty_Estimate,
    d ? d.volume : '',
    rec.Notes,
    d ? (d.difficulty ?? '') : '',
    d ? (d.competition ?? '') : '',
    d ? (d.cpc ?? '') : '',
    d ? (d.intent ?? '') : '',
  ].join(','));
}

await writeFile(csvPath, outLines.join('\n') + '\n', 'utf8');

console.log(`\n✓ ${found.size}/${targets.length} keywords got real data`);
console.log(`  → ${csvPath}`);

// Rank the winners so the content plan can be prioritised by actual demand.
const ranked = [...found.entries()]
  .sort((a, b) => b[1].volume - a[1].volume)
  .slice(0, 30);
console.log('\nTop 30 by real search volume:');
for (const [kw, d] of ranked) {
  console.log(`  ${String(d.volume).padStart(6)}  kd=${String(d.difficulty ?? '-').padStart(3)}  ${kw}`);
}
