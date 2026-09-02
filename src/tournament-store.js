import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assignBoard,
  autoAssignBoards,
  createTournamentState,
  publicTournamentSnapshot,
  recordTournamentResult,
  releaseBoard,
  undoTournamentResult,
  updateTournamentSettings,
} from './tournament-ops.js';
import { availableMatches, participantIndex, resolveCompetitor } from './tournament-brackets.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const STATE_TOKEN = String(process.env.CAMARILLO_STATE_TOKEN || '');
const REMOTE = Boolean(SUPABASE_URL && SUPABASE_KEY && STATE_TOKEN);
const LOCAL_PATH = process.env.TOURNAMENT_DB_PATH
  ? path.resolve(process.env.TOURNAMENT_DB_PATH)
  : path.resolve(process.env.DB_PATH ? path.join(path.dirname(process.env.DB_PATH), 'tournaments.json') : 'data/tournaments.json');

const remoteHeaders = (extra = {}) => ({
  apikey: SUPABASE_KEY,
  authorization: `Bearer ${SUPABASE_KEY}`,
  'x-camarillo-key': STATE_TOKEN,
  'content-type': 'application/json',
  accept: 'application/json',
  ...extra,
});

async function remoteFetch(resource, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method,
    headers: remoteHeaders(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Tournament database ${method} failed (${res.status}): ${data?.message || data?.error || text || 'Unknown error'}`);
  return data;
}

async function ensureLocal() {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  try { await fs.access(LOCAL_PATH); }
  catch { await fs.writeFile(LOCAL_PATH, JSON.stringify({ tournaments: [] }, null, 2)); }
}

async function localRead() {
  await ensureLocal();
  const parsed = JSON.parse(await fs.readFile(LOCAL_PATH, 'utf8'));
  return { tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [] };
}

async function localWrite(db) {
  await ensureLocal();
  await fs.writeFile(LOCAL_PATH, JSON.stringify(db, null, 2));
}

function matchRows(state) {
  const results = new Map(Object.entries(state.results || {}));
  const participants = participantIndex(state.bracket);
  const assignmentByMatch = new Map((state.boards || []).filter(b => b.matchId).map(b => [b.matchId, b.number]));
  const readyIds = new Set(availableMatches(state.bracket, results).map(m => m.id));

  return state.bracket.matches.map(match => {
    const result = state.results?.[match.id] || null;
    const competitorA = resolveCompetitor(match.sourceA, results, participants);
    const competitorB = resolveCompetitor(match.sourceB, results, participants);
    const boardNumber = assignmentByMatch.get(match.id) ?? result?.boardNumber ?? null;
    const status = result ? 'completed' : boardNumber ? 'assigned' : readyIds.has(match.id) ? 'ready' : 'pending';
    return {
      match_id: `${state.id}:${match.id}`,
      competition_id: state.id,
      status,
      updated_at: state.updatedAt,
      raw_data: {
        tournamentMatchId: match.id,
        number: match.number,
        stage: match.stage,
        round: match.round,
        index: match.index,
        sourceA: match.sourceA,
        sourceB: match.sourceB,
        routes: match.routes,
        competitorA,
        competitorB,
        boardNumber,
        result,
      },
    };
  });
}

async function audit(action, state, metadata = {}) {
  if (!REMOTE) return;
  try {
    await remoteFetch('camarillo_audit_log', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: {
        action,
        actor: 'tournament-director',
        entity_type: 'competition',
        entity_id: state?.id || null,
        metadata,
      },
    });
  } catch {}
}

export function tournamentDatabaseBackend() {
  return REMOTE ? 'supabase' : 'local-json';
}

export async function saveTournamentState(state, { auditAction = 'tournament_saved', auditMetadata = {} } = {}) {
  if (REMOTE) {
    await remoteFetch('camarillo_competitions?on_conflict=competition_id', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        competition_id: state.id,
        name: state.name,
        type: 'tournament',
        status: state.status,
        updated_at: state.updatedAt,
        raw_data: state,
      },
    });
    const rows = matchRows(state);
    if (rows.length) {
      await remoteFetch('camarillo_matches?on_conflict=match_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: rows,
      });
    }
  } else {
    const db = await localRead();
    const index = db.tournaments.findIndex(t => t.id === state.id);
    if (index >= 0) db.tournaments[index] = state;
    else db.tournaments.push(state);
    await localWrite(db);
  }
  await audit(auditAction, state, auditMetadata);
  return state;
}

export async function listTournamentStates({ limit = 50, status = '' } = {}) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  if (REMOTE) {
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const rows = await remoteFetch(`camarillo_competitions?select=competition_id,name,type,status,updated_at,raw_data&type=eq.tournament${filter}&order=updated_at.desc&limit=${n}`);
    return (Array.isArray(rows) ? rows : []).map(r => r.raw_data).filter(Boolean);
  }
  const db = await localRead();
  return db.tournaments
    .filter(t => !status || t.status === status)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, n);
}

export async function getTournamentState(id) {
  const tournamentId = String(id || '').trim();
  if (!tournamentId) return null;
  if (REMOTE) {
    const rows = await remoteFetch(`camarillo_competitions?competition_id=eq.${encodeURIComponent(tournamentId)}&type=eq.tournament&select=raw_data&limit=1`);
    return Array.isArray(rows) ? rows[0]?.raw_data || null : null;
  }
  const db = await localRead();
  return db.tournaments.find(t => t.id === tournamentId) || null;
}

function assertRevision(state, expectedRevision) {
  if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') return;
  if (Number(expectedRevision) !== Number(state.revision)) {
    const error = new Error(`Tournament changed since this screen was loaded. Refresh and try again. Current revision is ${state.revision}.`);
    error.statusCode = 409;
    throw error;
  }
}

async function mutate(id, expectedRevision, mutator, action, metadata = {}) {
  const current = await getTournamentState(id);
  if (!current) {
    const error = new Error('Tournament not found.');
    error.statusCode = 404;
    throw error;
  }
  assertRevision(current, expectedRevision);
  const next = mutator(current);
  await saveTournamentState(next, { auditAction: action, auditMetadata: metadata });
  return next;
}

export async function createTournamentPersistent(input = {}) {
  const state = createTournamentState(input);
  await saveTournamentState(state, { auditAction: 'tournament_created', auditMetadata: { format: state.format, entrants: state.entrants.length } });
  return state;
}

export async function updateTournamentPersistent(id, patch = {}, expectedRevision) {
  return mutate(id, expectedRevision, state => updateTournamentSettings(state, patch), 'tournament_settings_updated', patch);
}

export async function recordTournamentResultPersistent(id, matchId, input = {}) {
  return mutate(
    id,
    input.expectedRevision,
    state => recordTournamentResult(state, matchId, input.winnerId, input),
    'tournament_match_result',
    { matchId, winnerId: input.winnerId, boardNumber: input.boardNumber ?? null },
  );
}

export async function undoTournamentResultPersistent(id, matchId, expectedRevision) {
  return mutate(id, expectedRevision, state => undoTournamentResult(state, matchId), 'tournament_match_undone', { matchId });
}

export async function assignTournamentBoardPersistent(id, matchId, boardNumber, expectedRevision) {
  return mutate(id, expectedRevision, state => assignBoard(state, matchId, boardNumber), 'tournament_board_assigned', { matchId, boardNumber });
}

export async function releaseTournamentBoardPersistent(id, boardNumber, expectedRevision) {
  return mutate(id, expectedRevision, state => releaseBoard(state, boardNumber), 'tournament_board_released', { boardNumber });
}

export async function autoAssignTournamentBoardsPersistent(id, expectedRevision) {
  return mutate(id, expectedRevision, state => autoAssignBoards(state), 'tournament_boards_auto_assigned');
}

export async function getPublicTournamentState(id) {
  const state = await getTournamentState(id);
  return state ? publicTournamentSnapshot(state) : null;
}
