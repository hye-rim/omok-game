'use strict';

// 서버 보안·안정성 회귀 테스트: 잘못된 주소, 숨김 파일, 큰 웹소켓 메시지, 방 코드 무차별 대입
// 실행: npm test  (Node 18 이상, 별도 설치 없이 node:test 사용)
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { WebSocket } = require('ws');

// 운영체제가 지금 비어 있는 포트를 골라 준다. 예전엔 정해 둔 범위에서 무작위로 골라서, 다른 시험의 서버나
// 다른 프로그램이 쓰는 포트와 겹치면 시험이 엉뚱한 서버에 붙어 가끔 실패했다
const freePort = () => Number(require('child_process').execFileSync(process.execPath, ['-e', "const s = require('net').createServer().listen(0, '127.0.0.1', () => { console.log(s.address().port); s.close(); })"]));
const PORT = freePort();

const get = (p) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.end();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 서버를 모듈 맨 위에서 띄우고, 모든 테스트가 준비될 때까지 기다린다 (Node 18 과 22 모두에서 같게 동작하도록 before 훅을 쓰지 않는다)
const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
child.unref();                                  // 서버가 테스트 프로세스의 종료를 붙잡지 않게
process.on('exit', () => child.kill());
const ready = (async () => {
  for (let i = 0; i < 80; i++) { try { await get('/'); return; } catch { await sleep(100); } }
  throw new Error('server did not start');
})();

test('malformed URLs get 400 and the server stays up', async () => {
  await ready;
  assert.strictEqual(await get('/%'), 400);
  assert.strictEqual(await get('/%00'), 400);
  assert.strictEqual(await get('/%E0%A4%A'), 400);
  assert.strictEqual(await get('/'), 200);          // 여전히 살아 있다
});

test('dotfiles and paths outside the public dir are not served', async () => {
  await ready;
  assert.strictEqual(await get('/.git/config'), 403);
  assert.strictEqual(await get('/.hidden'), 403);
  assert.ok([403, 404].includes(await get('/../server.js')));
});

const open = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const c = { ws, msgs: [], closed: null };
  ws.on('message', (d) => { try { c.msgs.push(JSON.parse(d)); } catch {} });
  ws.on('close', (code) => { c.closed = code; });
  ws.on('error', () => {});
  ws.on('open', () => resolve(c));
  setTimeout(() => reject(new Error('websocket connect failed')), 3000);
});

test('oversized websocket message closes the connection (1009)', async () => {
  await ready;
  const c = await open();
  c.ws.send('x'.repeat(2 * 1024 * 1024));
  await sleep(500);
  assert.strictEqual(c.closed, 1009);
  assert.strictEqual(await get('/'), 200);          // 한 손님의 오류로 서버가 죽으면 안 된다
});

const lastRoom = (c) => [...c.msgs].reverse().find((m) => m.t === 'room');
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(15); } return false; };

test('place: only an integer cell number is accepted (null, strings, booleans are ignored)', async () => {
  await ready;
  const a = await open(), b = await open();
  a.ws.send(JSON.stringify({ t: 'quick' }));
  await until(() => a.msgs.some((m) => m.t === 'queued'));
  b.ws.send(JSON.stringify({ t: 'quick' }));
  assert.ok(await until(() => lastRoom(a) && lastRoom(a).state === 'playing' && lastRoom(b) && lastRoom(b).state === 'playing'));
  const mover = lastRoom(a).turn === lastRoom(a).you ? a : b;
  // Number(null) 은 0, Number('5') 는 5 가 되어 예전엔 0번·5번 칸 착수로 받아들여졌다
  for (const bad of [null, '0', '5', true, false, [], [3], 3.5, -1, 15 * 15, 'x']) mover.ws.send(JSON.stringify({ t: 'place', i: bad }));
  mover.ws.send(JSON.stringify({ t: 'place' }));
  await sleep(400);
  assert.strictEqual(lastRoom(a).moves.length, 0, 'nothing was accepted');
  mover.ws.send(JSON.stringify({ t: 'place', i: 112 }));
  assert.ok(await until(() => lastRoom(a).moves.length === 1), 'a real cell number is accepted');
  a.ws.close(); b.ws.close();
});

// 같은 주소에서 코드를 일부러 많이 틀리므로 이 시험은 맨 뒤에 둔다 (뒤의 시험이 막히지 않게)
test('repeated wrong room codes get temporarily blocked', async () => {
  await ready;
  const c = await open();
  for (let i = 0; i < 10; i++) { c.ws.send(JSON.stringify({ t: 'join', code: 'ZZZ' + 'ABCDEFGH'[i] })); }
  await sleep(500);
  const texts = c.msgs.filter((m) => m.t === 'error').map((m) => m.msg);
  assert.ok(texts.some((x) => /그런 방이 없어요/.test(x)), 'first attempts are answered with room-not-found');
  assert.ok(texts.some((x) => /너무 많이 틀렸어요/.test(x)), 'many wrong codes get blocked (' + texts.length + ' replies)');
  c.ws.close();
});

test('shutdown', () => { child.kill(); });
