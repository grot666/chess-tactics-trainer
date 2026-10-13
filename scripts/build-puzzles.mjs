#!/usr/bin/env node
/**
 * Build puzzle bank from Lichess open puzzle database (CC0).
 * Source: https://database.lichess.org/#puzzles
 *
 * Usage:
 *   curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst \
 *     | zstd -d \
 *     | node scripts/build-puzzles.mjs
 *
 * Or with a local CSV:
 *   node scripts/build-puzzles.mjs < puzzles.csv
 *
 * Filter (Phase 1):
 *   - Rating 800–1600
 *   - Popularity >= 90
 *   - NbPlays >= 2000
 *   - Themes intersecting preferred tactical themes
 *   - Target ~400 puzzles, theme-balanced
 *   - Convert UCI → SAN via chess.js
 *   - Lichess convention: Moves[0] is opponent's move that creates the puzzle;
 *     FEN is before that move. We apply Moves[0], then store player solution as SAN.
 */

import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../src/data/puzzles.json');
const TARGET = 400;
const MIN_RATING = 800;
const MAX_RATING = 1600;
const MIN_POP = 90;
const MIN_PLAYS = 2000;

const PREFERRED = new Set([
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'doubleCheck',
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'hangingPiece',
  'attraction',
  'deflection',
  'sacrifice',
  'trappedPiece',
  'interference',
  'clearance',
  'xRayAttack',
  'capturingDefender',
  'exposedKing',
  'backRankMate',
  'smotheredMate',
  'kingsideAttack',
  'queensideAttack',
]);

const themeBuckets = new Map();
for (const t of PREFERRED) themeBuckets.set(t, []);

function uciToMove(chess, uci) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return chess.move({ from, to, promotion });
}

function convertPuzzle(row) {
  const [PuzzleId, FEN, Moves, Rating, , Popularity, NbPlays, Themes] = row;
  const rating = Number(Rating);
  const pop = Number(Popularity);
  const plays = Number(NbPlays);
  if (
    !PuzzleId ||
    !FEN ||
    !Moves ||
    Number.isNaN(rating) ||
    rating < MIN_RATING ||
    rating > MAX_RATING ||
    pop < MIN_POP ||
    plays < MIN_PLAYS
  ) {
    return null;
  }

  const themes = (Themes || '').split(' ').filter(Boolean);
  const hit = themes.filter((t) => PREFERRED.has(t));
  if (hit.length === 0) return null;

  const uciMoves = Moves.trim().split(/\s+/);
  if (uciMoves.length < 2) return null;

  try {
    const chess = new Chess(FEN);
    // Opponent's last move that creates the puzzle position
    const setup = uciToMove(chess, uciMoves[0]);
    if (!setup) return null;
    const playerFen = chess.fen();
    const sideToMove = chess.turn() === 'w' ? 'white' : 'black';

    const sanMoves = [];
    for (let i = 1; i < uciMoves.length; i++) {
      const m = uciToMove(chess, uciMoves[i]);
      if (!m) return null;
      sanMoves.push(m.san);
    }
    if (sanMoves.length === 0) return null;

    return {
      id: PuzzleId,
      fen: playerFen,
      setupFen: FEN,
      setupUci: uciMoves[0],
      moves: sanMoves,
      movesUci: uciMoves.slice(1),
      themes: hit,
      allThemes: themes,
      rating,
      popularity: pop,
      nbPlays: plays,
      sideToMove,
      explanation: `主题：${hit.join('、')} · 评级 ${rating}`,
    };
  } catch {
    return null;
  }
}

function pickBalanced(buckets, target) {
  const selected = [];
  const used = new Set();
  const keys = [...buckets.keys()];
  let guard = 0;
  while (selected.length < target && guard < target * 20) {
    guard++;
    let added = false;
    for (const k of keys) {
      if (selected.length >= target) break;
      const arr = buckets.get(k);
      while (arr.length) {
        const p = arr.shift();
        if (used.has(p.id)) continue;
        used.add(p.id);
        selected.push(p);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return selected;
}

async function main() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let headerSkipped = false;
  let scanned = 0;
  let keptRaw = 0;

  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    scanned++;
    // CSV is simple enough here: fields don't contain commas in Lichess export
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const puzzle = convertPuzzle(cols);
    if (!puzzle) continue;
    keptRaw++;
    // Put into the rarest preferred theme bucket first for balance
    const primary =
      puzzle.themes.sort(
        (a, b) => (themeBuckets.get(a)?.length ?? 0) - (themeBuckets.get(b)?.length ?? 0),
      )[0] || puzzle.themes[0];
    themeBuckets.get(primary)?.push(puzzle);

    // Early exit when every bucket has enough candidates
    let minBucket = Infinity;
    for (const arr of themeBuckets.values()) {
      if (arr.length < minBucket) minBucket = arr.length;
    }
    if (keptRaw >= TARGET * 8 && minBucket >= 5) {
      break;
    }
    if (scanned % 100000 === 0) {
      console.error(`scanned=${scanned} candidates=${keptRaw}`);
    }
  }

  // Sort each bucket by popularity * log(plays)
  for (const [k, arr] of themeBuckets) {
    arr.sort(
      (a, b) =>
        b.popularity * Math.log10(b.nbPlays + 1) -
        a.popularity * Math.log10(a.nbPlays + 1),
    );
    themeBuckets.set(k, arr);
  }

  const selected = pickBalanced(themeBuckets, TARGET);
  selected.sort((a, b) => a.rating - b.rating);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(selected, null, 0));
  console.error(
    `Done. scanned=${scanned} candidates=${keptRaw} written=${selected.length} -> ${OUT}`,
  );
  const themeCounts = {};
  for (const p of selected) {
    for (const t of p.themes) themeCounts[t] = (themeCounts[t] || 0) + 1;
  }
  console.error('Theme counts:', JSON.stringify(themeCounts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
