// One-time import: parse 2023 Excel → update Supabase banks + post community notes
// Usage: node scripts/import-2023-notes.mjs [--apply]
//   --apply  actually write to DB (default is dry-run)

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const EXCEL_PATH = process.env.EXCEL_PATH ?? 'C:/Users/ben/Downloads/1738216686522_1730408939842_2023.xlsx';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://zcgfvggxijzoavxfbluj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // set in env — never hardcode
const DRY_RUN = !process.argv.includes('--apply');

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Name normalisation & fuzzy match ─────────────────────────────────────────
const STOP = new Set([
  'the','bank','savings','federal','national','state','community','of','and','inc',
  'incorporated','corp','corporation','co','company','association','assoc','ssb','fsb',
  'fa','na','llc','lp','ltd','trust','first','second','third','fourth','mutual',
  // 'cooperative' intentionally NOT in stop — needed to distinguish "Fidelity Co-op" from "Fidelity Bank"
  'credit','union','building','loan','sb','sl','sla','fsa',
]);

function normWords(s) {
  return s.toLowerCase().replace(/[.,'"&()]/g,' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
}
function normFull(s) {
  return s.toLowerCase().replace(/[.,'"&()]/g,' ').replace(/\s+/g,' ').trim();
}
function splitCamel(s) {
  // "CambridgeSavings" → "Cambridge Savings", "andLoan" → "and Loan", "BankGloucester" → "Bank Gloucester"
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}
function normalizeSpellings(s) {
  // Normalize common variant spellings so "Coperative" / "Co-operative" → "Cooperative"
  return s.replace(/\bco-?operative\b/gi, 'cooperative').replace(/\bcoperative\b/gi, 'cooperative');
}
function matchScore(a, b) {
  // Apply camelCase split + spelling normalization to both sides
  a = normalizeSpellings(splitCamel(a));
  b = normalizeSpellings(splitCamel(b));
  const na = normFull(a), nb = normFull(b);
  // Flat (no-space) check handles "Bank Gloucester" vs "BankGloucester"
  const naFlat = na.replace(/\s/g,''), nbFlat = nb.replace(/\s/g,'');
  if (naFlat === nbFlat) return 0.97;
  if (na === nb) return 1.0;
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.95;
  if (na.includes(nb) || nb.includes(na)) return 0.90;
  const wa = new Set(normWords(a));
  const wb = new Set(normWords(b));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? inter / union : 0;
}

// ─── Parse notes from bank name ───────────────────────────────────────────────
function parseBankNameNotes(raw) {
  const result = {
    cleanName: raw,
    altNames: [],   // alternate DB names to try (e.g. old name when "(NewName)" is present)
    openMethods: [],
    eligibility: null,
    status: null,
    conversionStage: null,
    minToOpen: null,
    communityNotes: [],
  };

  // Extract old name from "(NewName) OldName..." or "(New Name) OldName..."
  const newNameMatch = raw.match(/\(\s*new\s*name[^)]*\)\s*([^(]+)/i);
  if (newNameMatch) {
    // e.g. "IVES Bank,(NewName) Savings Bank of Danbury(in person)"
    // → try matching against "Savings Bank of Danbury" too
    const altSegments = newNameMatch[1].split(/,/).map(s => s.trim()).filter(Boolean);
    result.altNames.push(...altSegments);
  }

  const chexSuffix = /chex\s*system/i.test(raw) ? ' (uses ChexSystem)' : '';
  const cheskyBranch = /chesky\s+was\s+in\s+branch\s+.*\bx\s+let\b/i.test(raw);
  const sholyBranch  = !cheskyBranch && /was\s+in\s+branch.*\bx\s+let\b/i.test(raw);
  const mailDenial   = /by\s+mail\s+.*\bx\s+let\b/i.test(raw);
  const onlineDenial = /tried\s+online\s+and\s+x\s+let/i.test(raw);
  const notGoingToLet    = /not\s+going\s+to\s+let/i.test(raw);
  const closedMeUp       = /closed\s+me\s+up|me\s+tha[ty]\s+closed\s+up|thay\s+closed\s+me\s+up/i.test(raw);
  const closedOutOfState = /closed\s+all\s+out\s+of\s+state/i.test(raw);
  const noChance         = /no\s+chance\s+of\s+opening/i.test(raw);
  const creditIssue      = /to+\s+many\s+inquir/i.test(raw); // matches "too many" and "to many" typo

  const localPatterns = [
    /only\s+open\s+(local|for\s+surrounding|for\s+those\s+have)/i,
    /only\s+opening\s+for\s+(surrounding|local|those|east|a\s+\w)/i,
    /not\s+opening\s+for\s+out\s+of\s+(area|state)/i,
    /not\s+going\s+to\s+open\s+for\s+out/i,
    /will\s+not\s+open\s+for\s+out/i,
    /need\s+to\s+be\s+a\s+resident/i,
    /\d+\s+mile\s+radius/i,
    /zip\s+code\s+outside/i,
    /address\s+is\s+outside/i,
    /outside\s+of\s+the\s+area\s+service/i,
    /outside\s+of\s+(the\s+)?market\s+area/i,
    /unable\s+to\s+approve\s+out\s+of\s+area/i,
    /not\s+accepting\s+out\s+of\s+surrounding/i,
    /they.re\s+only\s+opening\s+for/i,
    /only\s+opening\s+for\s+a\s+/i,
    /only\s+open\s+for\s+surrounding/i,
    /for\s+out\s+of\s+(area|state)/i,
    /surrounding\s+(area|counties)/i,
    /only\s+for\s+(east|surrounding|market|local)/i,
  ];
  const isLocalOnly = localPatterns.some(p => p.test(raw));

  // Status + Sholy community note
  if (sholyBranch) {
    result.status = 'cannot_open';
    result.communityNotes.push(`Sholy: was at branch, they did not let${chexSuffix}`);
  } else if (mailDenial) {
    result.status = 'cannot_open';
    result.communityNotes.push(`Sholy: tried by mail, they did not let${chexSuffix}`);
  } else if (onlineDenial) {
    result.status = 'cannot_open';
    result.communityNotes.push('Sholy: tried online, they did not let');
  } else if (notGoingToLet || closedOutOfState || noChance) {
    result.status = 'cannot_open';
    result.communityNotes.push('Sholy: says does not allow');
  } else if (closedMeUp && !creditIssue) {
    result.status = 'cannot_open';
    result.communityNotes.push('Sholy: was at branch, they did not let');
  }

  if (isLocalOnly) {
    result.eligibility = 'local_only';
    if (!result.status) {
      result.status = 'cannot_open';
      result.communityNotes.push('Sholy: says does not allow');
    }
  }

  if (cheskyBranch) {
    result.communityNotes.push('Chesky: was at branch, they did not let');
  }

  // Open methods
  if (/\bin\s+person\b/i.test(raw)) result.openMethods.push('in_person');
  if (/was\s+in\s+branch/i.test(raw) && !result.openMethods.includes('in_person'))
    result.openMethods.push('in_person');
  if (/\bonline\b/i.test(raw) && !onlineDenial) result.openMethods.push('online');
  if (/\bby\s+phone\b|\btold\s+me\s+by\s+phone|\bphone\s+only\b/i.test(raw)) result.openMethods.push('phone');
  if (/\bby\s+mail\b/i.test(raw) && !result.openMethods.includes('mail')) result.openMethods.push('mail');

  // Min to open
  const minMatch = raw.match(/min\s+\$([0-9,]+)/i);
  if (minMatch) result.minToOpen = parseInt(minMatch[1].replace(/,/g, ''), 10);

  // Conversion stage
  if (/\bpublic\s+alre?a?d?y\b/i.test(raw)) {
    result.conversionStage = 'completed';
  } else if (/\b2nd\s+offering\b/i.test(raw) && !/2nd\s+offering\s+not\s+interesting/i.test(raw)) {
    result.conversionStage = 'second_possible';
  } else if (/\bgoing\s+public\b/i.test(raw)) {
    result.conversionStage = 'filed';
  }

  // Clean name: take text before first ( then strip keyword suffixes
  const parenIdx = raw.indexOf('(');
  let cleaned = (parenIdx > 0 ? raw.slice(0, parenIdx) : raw)
    .replace(/\bpublic\s+alre?a?d?y\b.*/gi, '')
    .replace(/\b2nd\s+offering\b.*/gi, '')
    .replace(/\bgoing\s+public\b.*/gi, '')
    .replace(/[,\s]+$/, '')
    .trim();
  result.cleanName = cleaned || raw.trim();

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no writes\n' : '✏️  APPLYING CHANGES\n');

  // 1. Load ALL existing banks (all users) — paginate past the 1000-row Supabase default cap
  const allBanks = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('banks')
      .select('id, user_id, cert, name, status, open_methods, eligibility, conversion_stage, min_to_open, city, state, assets, holding_company')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error('Failed to load banks: ' + error.message);
    allBanks.push(...data);
    if (data.length < PAGE) break;
  }

  // Deduplicate banks by cert (or name) for matching — just need one representative per bank
  // Build one representative row per unique bank for matching.
  // Key by cert (if set) else by lowercased name — do NOT rely on query order.
  const bankMap = new Map(); // cert:N or name:xxx → representative row
  for (const b of allBanks) {
    const key = b.cert != null ? `cert:${b.cert}` : `name:${b.name.toLowerCase()}`;
    if (!bankMap.has(key)) bankMap.set(key, b);
  }
  const uniqueBanks = [...bankMap.values()];
  console.log(`DB: ${allBanks.length} bank rows, ${uniqueBanks.length} unique banks\n`);

  // 2. Get first user ID for community note attribution
  const { data: profiles } = await db.from('profiles').select('id, display_name').limit(5);
  const primaryProfile = profiles?.[0];
  const authorId   = primaryProfile?.id   ?? null;
  const authorName = primaryProfile?.display_name ?? 'Import';
  if (!authorId) { console.warn('⚠️  No profiles found — community notes will be skipped'); }

  // 3. Load existing community notes (to deduplicate)
  const { data: existingNotes } = await db.from('bank_comments').select('cert, body');
  const noteSet = new Set((existingNotes ?? []).map(n => `${n.cert}:${n.body}`));

  // 4. Parse Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Header at row index 4: NAME, CITY, STATE, PFR, ASSETS, ACCOUNT1..., HOLDING COMPANY
  const dataRows = rows.slice(5).filter(r => r[0] && String(r[0]).trim());
  console.log(`Excel: ${dataRows.length} banks\n`);

  // 5. Match and collect updates
  const STAGE_ORDER = ['none','rumored','filed','subscription','completed','second_possible'];

  let matched = 0, noMatch = 0, willUpdateBanks = 0, willPostNotes = 0;
  const bankUpdates   = []; // { ids: string[], patch: {} }
  const noteInserts   = []; // { cert, body }
  const unmatched     = [];

  for (const r of dataRows) {
    const rawName    = String(r[0]).trim();
    const city       = String(r[1] || '').trim() || null;
    const state      = String(r[2] || '').trim() || null;
    const assets     = typeof r[4] === 'number' ? r[4] : null;
    const holdingCo  = String(r[11] || '').trim();
    const holding_company = holdingCo && holdingCo.toUpperCase() !== 'N/A' ? holdingCo : null;

    const parsed = parseBankNameNotes(rawName);

    // Find best DB match — try clean name and any extracted alternate names
    const namesToTry = [parsed.cleanName, ...parsed.altNames];
    let bestBank = null, bestScore = 0;
    for (const nameAttempt of namesToTry) {
      for (const b of uniqueBanks) {
        const s = matchScore(nameAttempt, b.name);
        if (s > bestScore) { bestScore = s; bestBank = b; }
      }
    }

    if (bestScore < 0.55) {
      noMatch++;
      // Queue for creation as a new bank
      unmatched.push({ rawName, parsed, city, state, assets, holding_company });
      continue;
    }
    matched++;

    // All DB rows for this bank (all users)
    const bankCert = bestBank.cert;
    const bankIds  = allBanks
      .filter(b => bestBank.cert != null ? b.cert === bestBank.cert : b.name.toLowerCase() === bestBank.name.toLowerCase())
      .map(b => b.id);

    // Build patch — only set fields that are new/better
    const patch = {};

    // City/State/Assets/HoldingCo: fill in if DB is missing it
    if (city && !bestBank.city) patch.city = city;
    if (state && !bestBank.state) patch.state = state;
    if (assets && !bestBank.assets) patch.assets = assets;
    if (holding_company && !bestBank.holding_company) patch.holding_company = holding_company;

    // Open methods: MERGE with existing
    if (parsed.openMethods.length) {
      const existing = bestBank.open_methods ?? [];
      const merged   = [...new Set([...existing, ...parsed.openMethods])];
      if (merged.join(',') !== existing.join(',')) patch.open_methods = merged;
    }

    // Eligibility: set if not already set
    if (parsed.eligibility && !bestBank.eligibility) {
      patch.eligibility = parsed.eligibility;
    }

    // Conversion stage: advance if new stage is further along.
    // second_possible requires a DB migration — fall back to 'completed' until then.
    if (parsed.conversionStage) {
      const dbStage = parsed.conversionStage === 'second_possible' ? 'completed' : parsed.conversionStage;
      const curIdx = STAGE_ORDER.indexOf(bestBank.conversion_stage ?? 'none');
      const newIdx = STAGE_ORDER.indexOf(dbStage);
      if (newIdx > curIdx) patch.conversion_stage = dbStage;
    }

    // Min to open: set if missing
    if (parsed.minToOpen && !bestBank.min_to_open) {
      patch.min_to_open = parsed.minToOpen;
    }

    // Status: only set cannot_open if current status is untracked/want_to_open
    if (parsed.status === 'cannot_open') {
      const safeToOverride = ['untracked', 'want_to_open', null];
      if (safeToOverride.includes(bestBank.status)) {
        patch.status = 'cannot_open';
      }
    }

    if (Object.keys(patch).length > 0) {
      bankUpdates.push({ ids: bankIds, patch, bankName: bestBank.name, score: bestScore });
      willUpdateBanks++;
    }

    // Community notes
    if (parsed.communityNotes.length && bankCert != null && authorId) {
      for (const body of parsed.communityNotes) {
        const key = `${bankCert}:${body}`;
        if (!noteSet.has(key)) {
          noteInserts.push({ cert: bankCert, body, bankName: bestBank.name });
          noteSet.add(key); // prevent dupes within this run
          willPostNotes++;
        }
      }
    }
  }

  // Build new-bank rows for unmatched entries
  // Get list of all distinct user_ids so we create one row per user
  const userIds = [...new Set(allBanks.map(b => b.user_id))];
  const newBankRows = [];
  for (const u of unmatched) {
    const p = u.parsed;
    const stage = p.conversionStage === 'second_possible' ? 'completed' : (p.conversionStage ?? 'none');
    for (const uid of userIds) {
      newBankRows.push({
        user_id:          uid,
        name:             p.cleanName,
        city:             u.city,
        state:            u.state,
        assets:           u.assets,
        holding_company:  u.holding_company,
        status:           p.status ?? 'untracked',
        open_methods:     p.openMethods.length ? p.openMethods : null,
        eligibility:      p.eligibility,
        conversion_stage: stage,
        min_to_open:      p.minToOpen,
      });
    }
  }

  // 6. Report
  console.log(`✅ Matched: ${matched}   ❌ Creating new: ${unmatched.length} (× ${userIds.length} users = ${newBankRows.length} rows)`);
  console.log(`📝 Banks to update: ${willUpdateBanks}`);
  console.log(`💬 Community notes to post: ${willPostNotes}\n`);

  if (unmatched.length) {
    console.log('── NEW BANKS TO CREATE ──');
    for (const u of unmatched) {
      console.log(`  "${u.parsed.cleanName}" (${u.city}, ${u.state}) notes=${u.parsed.communityNotes.length}`);
    }
    console.log('');
  }

  if (noteInserts.length) {
    console.log('── SAMPLE NOTES (first 10) ──');
    for (const n of noteInserts.slice(0, 10)) {
      console.log(`  [${n.bankName}] ${n.body}`);
    }
    if (noteInserts.length > 10) console.log(`  ... and ${noteInserts.length - 10} more`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run complete. Run with --apply to write changes.');
    return;
  }

  // 7. Apply bank updates (idempotent — already-set fields resolve to no-ops)
  console.log('Applying bank updates...');
  let updErr = 0;
  for (const u of bankUpdates) {
    const { error } = await db.from('banks').update(u.patch).in('id', u.ids);
    if (error) { console.error(`  ERR ${u.bankName}: ${error.message}`); updErr++; }
  }
  console.log(`  Done. ${bankUpdates.length - updErr} patched, ${updErr} errors.`);

  // 8. Create new banks
  if (newBankRows.length) {
    console.log(`Creating ${newBankRows.length} new bank rows...`);
    const { error } = await db.from('banks').insert(newBankRows);
    if (error) console.error('  ERR creating new banks:', error.message);
    else console.log(`  Done. ${newBankRows.length} rows inserted.`);
  }

  // 9. Post community notes
  if (noteInserts.length && authorId) {
    console.log('Posting community notes...');
    const { error } = await db.from('bank_comments').insert(
      noteInserts.map(n => ({
        cert:        n.cert,
        author_id:   authorId,
        author_name: authorName,
        body:        n.body,
      }))
    );
    if (error) console.error('  ERR inserting notes:', error.message);
    else console.log(`  Done. ${noteInserts.length} notes posted.`);
  }

  console.log('\n✅ Import complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
