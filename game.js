'use strict';

// ---------- Rules ----------
// 15×15 판, 흑이 먼저 둔다. 가로·세로·대각선으로 5개 이상 이으면 승리 (자유룰, 금수 없음).
const N = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const other = (p) => 3 - p;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// idx 에 방금 둔 돌로 5목 이상이 되었으면 그 줄의 칸들을, 아니면 null
function fiveAt(b, idx, p) {
  const r0 = (idx / N) | 0, c0 = idx % N;
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s;
      while (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === p) {
        line.push(r * N + c);
        r += dr * s; c += dc * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

// ---------- AI: 한 수 평가 ----------
// 빈칸에 p 가 둔다고 쳤을 때, 네 방향 각각 그 칸을 가운데로 한 9칸 문자열을 만들어 모양을 판정한다.
//   x = 내 돌(가운데 포함), o = 상대 돌이나 판 밖, . = 빈칸
const SHAPES = [
  { score: 10000000, pats: ['xxxxx'] },                                        // 0 오목
  { score: 1000000, pats: ['.xxxx.'] },                                        // 1 열린 4
  { score: 30000, pats: ['xxxx.', '.xxxx', 'x.xxx', 'xxx.x', 'xx.xx'] },       // 2 막힌 4 / 띈 4
  { score: 25000, pats: ['..xxx.', '.xxx..', '.xx.x.', '.x.xx.'] },            // 3 열린 3
  { score: 1500, pats: ['xxx..', '..xxx', 'xx.x.', '.x.xx', 'x.xx.', '.xx.x',
    'x..xx', 'xx..x', 'x.x.x', '.xxx.'] },                                     // 4 막힌 3
  { score: 800, pats: ['..xx..', '.x.x..', '..x.x.', '.x..x.'] },              // 5 열린 2
];
const S_FIVE = 0, S_OPEN4 = 1, S_FOUR = 2, S_OPEN3 = 3;
const S_TWO = SHAPES.length, S_ONE = S_TWO + 1, S_NONE = S_TWO + 2;
const SHAPE_SCORE = [...SHAPES.map((s) => s.score), 120, 10, 0];

function lineString(b, r, c, dr, dc, p) {
  let s = '';
  for (let k = -4; k <= 4; k++) {
    if (k === 0) { s += 'x'; continue; }
    const rr = r + dr * k, cc = c + dc * k;
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) s += 'o';
    else {
      const v = b[rr * N + cc];
      s += v === EMPTY ? '.' : v === p ? 'x' : 'o';
    }
  }
  return s;
}

function shapeOf(s) {
  for (let i = 0; i < SHAPES.length; i++) {
    for (const pat of SHAPES[i].pats) {
      let at = s.indexOf(pat);
      while (at !== -1) {
        if (at <= 4 && 4 < at + pat.length) return i;   // 가운데(방금 둔 칸)를 지나는 모양만
        at = s.indexOf(pat, at + 1);
      }
    }
  }
  // 나머지: 가운데를 포함하는 5칸 창에 상대 돌이 없으면 그 안의 내 돌 수로 판단
  let most = 0;
  for (let st = 0; st <= 4; st++) {
    const w = s.substr(st, 5);
    if (w.includes('o')) continue;
    let n = 0;
    for (const ch of w) if (ch === 'x') n++;
    if (n > most) most = n;
  }
  return most >= 2 ? S_TWO : most === 1 ? S_ONE : S_NONE;
}

function pointScore(b, idx, p) {
  const r = (idx / N) | 0, c = idx % N;
  let total = 0, fours = 0, threes = 0;
  for (const [dr, dc] of DIRS) {
    const sh = shapeOf(lineString(b, r, c, dr, dc, p));
    total += SHAPE_SCORE[sh];
    if (sh === S_OPEN4 || sh === S_FOUR) fours++;
    else if (sh === S_OPEN3) threes++;
  }
  // 겹치는 공격은 막을 수 없다: 4-4, 4-3 은 사실상 승리, 3-3 도 강력
  if (fours >= 2) total += 900000;
  else if (fours && threes) total += 800000;
  else if (threes >= 2) total += 150000;
  return total;
}

// 이미 놓인 돌에서 2칸 이내의 빈칸만 후보로 본다
function candidates(b) {
  const out = [];
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (b[i] !== EMPTY) { any = true; continue; }
    const r = (i / N) | 0, c = i % N;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] !== EMPTY) { near = true; break; }
      }
    }
    if (near) out.push(i);
  }
  if (!any) out.push(((N / 2) | 0) * N + ((N / 2) | 0));
  return out;
}

// 공격 점수 + 수비 점수(상대가 여기 두면 얼마나 좋은지)로 후보 순위를 매긴다
function rankMoves(b, p, defense = 1) {
  const list = candidates(b).map((i) => {
    const atk = pointScore(b, i, p), def = pointScore(b, i, other(p));
    return { i, atk, def, score: atk + def * defense };
  });
  list.sort((a, b2) => b2.score - a.score);
  return list;
}

// ---------- AI: 탐색 (어려움) ----------
// 판 전체의 5칸 창마다 한 사람 돌만 있으면 그 개수로 점수를 매긴다.
const WINDOWS = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    for (const [dr, dc] of DIRS) {
      const er = r + dr * 4, ec = c + dc * 4;
      if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
      WINDOWS.push([0, 1, 2, 3, 4].map((k) => (r + dr * k) * N + (c + dc * k)));
    }
  }
}
const WIN_WEIGHT = [0, 1, 15, 200, 4000];
const WIN_SCORE = 1e9;

// 차례인 p 입장에서 본 판 점수
function evaluate(b, p) {
  const q = other(p);
  let mine = 0, theirs = 0, myFour = false;
  const theirFourGaps = new Set();
  for (const w of WINDOWS) {
    let np = 0, nq = 0, gap = -1;
    for (const i of w) {
      const v = b[i];
      if (v === p) np++;
      else if (v === q) nq++;
      else gap = i;
    }
    if (np && nq) continue;
    if (np === 4) myFour = true;
    if (nq === 4) theirFourGaps.add(gap);
    mine += WIN_WEIGHT[np];
    theirs += WIN_WEIGHT[nq];
  }
  if (myFour) return WIN_SCORE / 2;                 // 내 차례에 4가 있으면 다음 수에 이긴다
  if (theirFourGaps.size >= 2) return -WIN_SCORE / 2; // 상대 4를 두 군데 다 막을 수는 없다
  return mine * 1.2 - theirs;                        // 둘 차례인 쪽이 조금 유리
}

function negamax(b, p, depth, alpha, beta, width) {
  if (depth === 0) return evaluate(b, p);
  const moves = rankMoves(b, p).slice(0, width);
  if (!moves.length) return 0;
  let best = -Infinity;
  for (const m of moves) {
    b[m.i] = p;
    const v = fiveAt(b, m.i, p) ? WIN_SCORE + depth : -negamax(b, other(p), depth - 1, -beta, -alpha, width);
    b[m.i] = EMPTY;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const LEVELS = {
  easy: { name: '쉬움' },
  normal: { name: '보통' },
  hard: { name: '어려움' },
};

function pickWeighted(list, weights) {
  const ws = weights.slice(0, list.length);
  let t = Math.random() * ws.reduce((a, x) => a + x, 0);
  for (let k = 0; k < list.length; k++) { t -= ws[k]; if (t <= 0) return list[k]; }
  return list[0];
}

const SEARCH_DEPTH = 4;   // 루트 다음으로 읽는 수. 5부터는 느려지기만 하고 더 세지지 않았다
const SEARCH_WIDTH = 7;   // 각 단계에서 살펴보는 후보 수

function aiMove(board, p, level) {
  const b = Int8Array.from(board);
  const ranked = rankMoves(b, p, level === 'easy' ? 0.6 : 1);
  if (!ranked.length) return -1;

  // 이길 수 있으면 바로 이긴다
  const win = ranked.find((m) => m.atk >= SHAPES[S_FIVE].score);
  if (win) return win.i;
  // 상대 5목은 막는다 (쉬움은 가끔 놓친다)
  const block = ranked.find((m) => m.def >= SHAPES[S_FIVE].score);
  if (block && (level !== 'easy' || Math.random() < 0.8)) return block.i;

  if (level === 'easy') return pickWeighted(ranked.slice(0, 5), [40, 25, 15, 12, 8]).i;

  if (level === 'normal') {
    const top = ranked[0].score;
    const close = ranked.filter((m) => m.score >= top * 0.95).slice(0, 3);
    return close[Math.floor(Math.random() * close.length)].i;
  }

  // 열린 4나 4-4·4-3 을 만들 수 있으면 끝낸다
  if (ranked[0].atk >= SHAPES[S_OPEN4].score) {
    const kill = ranked.filter((m) => m.atk >= SHAPES[S_OPEN4].score).sort((a, c) => c.atk - a.atk)[0];
    return kill.i;
  }

  // 어려움: 상위 후보들만 몇 수 앞까지 읽는다
  const roots = ranked.slice(0, 12);
  let best = roots[0].i, bestV = -Infinity, alpha = -Infinity;
  for (const m of roots) {
    b[m.i] = p;
    const v = -negamax(b, other(p), SEARCH_DEPTH, -Infinity, -alpha, SEARCH_WIDTH) + m.score * 1e-6; // 같은 값이면 휴리스틱 순
    b[m.i] = EMPTY;
    if (v > bestV) { bestV = v; best = m.i; }
    if (v > alpha) alpha = v;
  }
  return best;
}

if (typeof document === 'undefined') {
  module.exports = { N, EMPTY, BLACK, WHITE, fiveAt, aiMove, rankMoves };
} else {
// ---------- Canvas ----------
const CELL = 38;
const MARGIN = 34;
const SIZE = MARGIN * 2 + CELL * (N - 1);   // 600
const STONE_R = CELL * 0.46;
const STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 56;
  const scale = Math.min((innerWidth - 16) / SIZE, (innerHeight - 16 - hudH) / SIZE);
  const css = Math.floor(SIZE * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = canvas.style.height = css + 'px';
  canvas.width = canvas.height = Math.round(css * dpr);
  ctx.setTransform(canvas.width / SIZE, 0, 0, canvas.height / SIZE, 0, 0);
  $('col').style.width = Math.max(css, 300) + 'px';
  draw();
}
addEventListener('resize', fit);

// ---------- Storage ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const RECORD_KEY = 'omokRecord';   // { easy: {w, l}, normal: …, hard: … }
const WINS_KEY = 'omokWins';       // 컴퓨터 상대 총 승수 (로비 카드에 표시)
function loadRecord() {
  try { return JSON.parse(store.get(RECORD_KEY)) || {}; } catch (_) { return {}; }
}

// ---------- Sound ----------
let audio = null;
let muted = store.get('omokMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  place: (p) => tone(p === BLACK ? 220 : 260, 0.07, 'triangle', 0.2, -80),
  undo: () => tone(500, 0.08, 'sine', 0.08, -200),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'square', 0.06), i * 120)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 180)),
};

// ---------- Game state ----------
let board = new Int8Array(N * N);
let moves = [];            // 둔 순서대로 칸 번호
let turn = BLACK;
let winLine = null;
let over = false;
let mode = store.get('omokMode') || 'ai';            // ai | pvp
let level = store.get('omokLevel') || 'normal';      // easy | normal | hard
let humanColor = Number(store.get('omokColor')) || BLACK;
let thinking = false;
let aiTimer = null;
let hover = -1;            // 마우스가 올라간 칸
let pending = -1;          // 터치: 한 번 누르면 예약, 같은 칸을 한 번 더 누르면 착수
let cursor = -1;           // 키보드 커서
let started = false;

const isAiTurn = () => mode === 'ai' && turn !== humanColor;

function newGame() {
  clearTimeout(aiTimer);
  board = new Int8Array(N * N);
  moves = [];
  turn = BLACK;
  winLine = null;
  over = false;
  thinking = false;
  hover = pending = cursor = -1;
  started = true;
  hideOverlay();
  updateHud();
  draw();
  maybeAi();
}

function place(i) {
  if (over || board[i] !== EMPTY) return false;
  board[i] = turn;
  moves.push(i);
  sfx.place(turn);
  pending = -1;
  const line = fiveAt(board, i, turn);
  if (line) {
    winLine = line;
    finish(turn);
  } else if (moves.length === N * N) {
    finish(EMPTY);
  } else {
    turn = other(turn);
  }
  updateHud();
  draw();
  return true;
}

function finish(winner) {
  over = true;
  let title, sub = '';
  if (mode === 'ai' && winner !== EMPTY) {
    const won = winner === humanColor;
    const rec = loadRecord();
    const r = rec[level] || { w: 0, l: 0 };
    if (won) r.w++; else r.l++;
    rec[level] = r;
    store.set(RECORD_KEY, JSON.stringify(rec));
    if (won) store.set(WINS_KEY, String((Number(store.get(WINS_KEY)) || 0) + 1));
    title = won ? '🎉 승리!' : '😵 패배';
    sub = `${LEVELS[level].name} · ${r.w}승 ${r.l}패`;
    won ? sfx.win() : sfx.lose();
  } else if (winner === EMPTY) {
    title = '무승부';
  } else {
    title = `${winner === BLACK ? '⚫ 흑' : '⚪ 백'} 승리!`;
    sfx.win();
  }
  // 이긴 줄을 잠깐 보여준 뒤 결과창
  setTimeout(() => {
    if (!over) return;   // 그 사이 무르기
    showOverlay(`
      <h2>${title}</h2>
      ${sub ? `<p>${sub}</p>` : ''}
      <div class="row">
        <button class="main" data-act="again">한 판 더</button>
      </div>
      <div class="row">
        <button class="sub" data-act="view">판 보기</button>
        <button class="sub" data-act="undo">무르기</button>
        <button class="sub" data-act="menu">메뉴</button>
      </div>`);
  }, 900);
}

function maybeAi() {
  if (over || !isAiTurn()) return;
  thinking = true;
  updateHud();
  // 화면이 먼저 그려지도록 한 박자 쉬고 계산
  aiTimer = setTimeout(() => {
    const t0 = performance.now();
    const i = aiMove(board, turn, level);
    const wait = Math.max(0, 350 - (performance.now() - t0));
    aiTimer = setTimeout(() => {
      thinking = false;
      if (i >= 0) place(i);
      updateHud();
    }, wait);
  }, 30);
}

function humanPlace(i) {
  if (!started || over || thinking || isAiTurn()) return;
  if (place(i)) maybeAi();
}

function undo() {
  if (!started || !moves.length) return;
  clearTimeout(aiTimer);
  thinking = false;
  // 컴퓨터와 둘 때는 내 차례로 돌아오도록 컴퓨터 수까지 함께 무른다
  let n = 1;
  if (mode === 'ai') {
    const lastBy = board[moves[moves.length - 1]];
    n = lastBy === humanColor ? 1 : 2;
    if (moves.length < n) n = moves.length;
  }
  for (let k = 0; k < n; k++) {
    const i = moves.pop();
    turn = board[i];
    board[i] = EMPTY;
  }
  winLine = null;
  over = false;
  pending = -1;
  hideOverlay();
  sfx.undo();
  updateHud();
  draw();
  maybeAi();   // 컴퓨터가 흑이라 첫 수까지 물렀으면 다시 둔다
}

// ---------- HUD ----------
function updateHud() {
  const names = mode === 'ai'
    ? (humanColor === BLACK ? ['나', `컴퓨터 · ${LEVELS[level].name}`] : [`컴퓨터 · ${LEVELS[level].name}`, '나'])
    : ['흑', '백'];
  $('n1').textContent = names[0];
  $('n2').textContent = names[1];
  $('p1').classList.toggle('turn', started && !over && turn === BLACK);
  $('p2').classList.toggle('turn', started && !over && turn === WHITE);
  let status = '';
  if (!started) status = '';
  else if (over) status = winLine ? '게임 끝' : '무승부';
  else if (thinking) status = '생각 중…';
  else if (mode === 'ai') status = '내 차례';
  else status = `${turn === BLACK ? '흑' : '백'} 차례`;
  $('status').textContent = status;
  $('undoBtn').disabled = !started || !moves.length || (mode === 'ai' && !moves.some((i) => board[i] === humanColor));
}

// ---------- Draw ----------
const px = (i) => MARGIN + (i % N) * CELL;
const py = (i) => MARGIN + ((i / N) | 0) * CELL;

function drawStone(x, y, p, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.arc(x + 2, y + 3, STONE_R, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - STONE_R * 0.35, y - STONE_R * 0.4, STONE_R * 0.1, x, y, STONE_R);
  if (p === BLACK) { g.addColorStop(0, '#6a6a6a'); g.addColorStop(0.45, '#1a1a1a'); g.addColorStop(1, '#000'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#ececec'); g.addColorStop(1, '#b8b8b8'); }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function draw() {
  // 나무 판
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, '#e8bf73');
  g.addColorStop(1, '#d19a4c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = 'rgba(120,70,20,.08)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    const y = 20 + k * 43 + Math.sin(k * 1.7) * 8;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(SIZE * 0.3, y + 10, SIZE * 0.6, y - 12, SIZE, y + 4);
    ctx.stroke();
  }

  // 줄과 화점
  ctx.strokeStyle = '#5a3a14';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < N; k++) {
    const a = MARGIN + k * CELL;
    ctx.moveTo(MARGIN, a); ctx.lineTo(SIZE - MARGIN, a);
    ctx.moveTo(a, MARGIN); ctx.lineTo(a, SIZE - MARGIN);
  }
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, MARGIN, CELL * (N - 1), CELL * (N - 1));
  ctx.fillStyle = '#5a3a14';
  for (const [r, c] of STARS) {
    ctx.beginPath();
    ctx.arc(MARGIN + c * CELL, MARGIN + r * CELL, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 돌
  for (let i = 0; i < N * N; i++) if (board[i]) drawStone(px(i), py(i), board[i]);

  // 마지막 수 표시
  if (moves.length && !winLine) {
    const i = moves[moves.length - 1];
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(px(i), py(i), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 이긴 줄
  if (winLine) {
    const sorted = [...winLine].sort((a, b) => a - b);
    const a = sorted[0], b = sorted[sorted.length - 1];
    ctx.strokeStyle = 'rgba(255,60,60,.85)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // 놓을 자리 미리보기
  const canPlay = started && !over && !thinking && !isAiTurn();
  if (canPlay) {
    for (const [i, alpha] of [[hover, 0.45], [cursor, 0.45], [pending, 0.7]]) {
      if (i < 0 || board[i]) continue;
      drawStone(px(i), py(i), turn, alpha);
    }
    if (pending >= 0 && !board[pending]) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 2.5;
      const x = px(pending), y = py(pending), s = STONE_R + 4;
      ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    }
  }
}

// ---------- Overlay ----------
function showOverlay(html) {
  const o = $('overlay');
  o.innerHTML = html;
  o.classList.remove('hidden');
}
function hideOverlay() { $('overlay').classList.add('hidden'); }
const overlayOpen = () => !$('overlay').classList.contains('hidden');

function segHtml(key, opts, value) {
  return `<div class="seg" data-key="${key}">${opts.map(([v, label]) =>
    `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function showMenu() {
  const rec = loadRecord()[level];
  showOverlay(`
    <h1>오목</h1>
    <p>가로·세로·대각선으로 <b>5개</b>를 먼저 이으면 승리!</p>
    <div class="group">
      <span class="label">상대</span>
      ${segHtml('mode', [['ai', '🤖 컴퓨터'], ['pvp', '👥 둘이서']], mode)}
    </div>
    ${mode === 'ai' ? `
    <div class="group">
      <span class="label">난이도</span>
      ${segHtml('level', [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']], level)}
      <span class="record">${rec ? `전적 ${rec.w}승 ${rec.l}패` : ''}</span>
    </div>
    <div class="group">
      <span class="label">내 돌</span>
      ${segHtml('color', [[BLACK, '⚫ 흑 (먼저)'], [WHITE, '⚪ 백 (나중)']], humanColor)}
    </div>` : ''}
    <div class="row">
      <button class="main" data-act="start">${started && !over && moves.length ? '새로 시작' : '시작하기'}</button>
      ${started && !over && moves.length ? '<button class="sub" data-act="close">계속하기</button>' : ''}
    </div>
    <div class="help">🖱️ 클릭으로 착수 · 📱 두 번 눌러 착수<br>⌨️ 방향키 + Space · Z 무르기</div>`);
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const seg = btn.closest('.seg');
  if (seg) {
    const v = btn.dataset.v;
    if (seg.dataset.key === 'mode') { mode = v; store.set('omokMode', v); }
    if (seg.dataset.key === 'level') { level = v; store.set('omokLevel', v); }
    if (seg.dataset.key === 'color') { humanColor = Number(v); store.set('omokColor', v); }
    showMenu();
    return;
  }
  const act = btn.dataset.act;
  if (act === 'start' || act === 'again') newGame();
  else if (act === 'close' || act === 'view') { hideOverlay(); updateHud(); }
  else if (act === 'undo') undo();
  else if (act === 'menu') showMenu();
});

// ---------- Input ----------
function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (SIZE / rect.width);
  const y = (e.clientY - rect.top) * (SIZE / rect.height);
  const c = Math.round((x - MARGIN) / CELL), r = Math.round((y - MARGIN) / CELL);
  if (r < 0 || r >= N || c < 0 || c >= N) return -1;
  return r * N + c;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const i = cellAt(e);
  if (i !== hover) { hover = i; draw(); }
});
canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
canvas.addEventListener('pointerdown', (e) => {
  if (over && started && !overlayOpen()) { showMenuOrResult(); return; }
  const i = cellAt(e);
  if (i < 0 || board[i]) return;
  cursor = -1;
  if (e.pointerType === 'mouse') { humanPlace(i); return; }
  // 손가락은 빗나가기 쉬우니 한 번 눌러 확인, 같은 곳을 다시 눌러 착수
  if (pending === i) humanPlace(i);
  else { pending = i; draw(); }
});

// 결과창을 닫고 판을 보다가 누르면 다시 결과창으로
function showMenuOrResult() {
  showOverlay(`<h2>${winLine ? '게임 끝' : '무승부'}</h2>
    <div class="row"><button class="main" data-act="again">한 판 더</button></div>
    <div class="row">
      <button class="sub" data-act="view">판 보기</button>
      <button class="sub" data-act="undo">무르기</button>
      <button class="sub" data-act="menu">메뉴</button>
    </div>`);
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Escape') { overlayOpen() && started && !over ? hideOverlay() : showMenu(); return; }
  if (overlayOpen()) {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      $('overlay').querySelector('.main')?.click();
    }
    return;
  }
  if (e.code === 'KeyZ' || e.code === 'Backspace') { e.preventDefault(); undo(); return; }
  const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.code];
  if (move) {
    e.preventDefault();
    if (cursor < 0) cursor = moves.length ? moves[moves.length - 1] : 7 * N + 7;
    const r = Math.min(N - 1, Math.max(0, ((cursor / N) | 0) + move[0]));
    const c = Math.min(N - 1, Math.max(0, (cursor % N) + move[1]));
    cursor = r * N + c;
    hover = -1;
    draw();
  }
  if ((e.code === 'Space' || e.code === 'Enter') && cursor >= 0) {
    e.preventDefault();
    humanPlace(cursor);
  }
});

function toggleMute() {
  muted = !muted;
  store.set('omokMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('undoBtn').onclick = (e) => { e.currentTarget.blur(); undo(); };
$('menuBtn').onclick = (e) => { e.currentTarget.blur(); showMenu(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

showMenu();
updateHud();
fit();
}
