#!/usr/bin/env node
// Doodle Tank shared-tank server.
// Serves the game and keeps shared group tanks in JSON files. No dependencies: needs Node 18 or newer.
//
//   node server/server.js                   -> http://localhost:8080
//   PORT=3000 TANK_KEY=secret node server/server.js
//
// Environment:
//   PORT          port to listen on (default 8080)
//   TANK_KEY      optional password; players type it into the game to join
//   DATA_DIR      where tank files are saved (default ./server/data)
//   DEFAULT_TANK  tank name the game joins automatically (default "family")
//   MAX_FISH      most fish one tank can hold (default 60)

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const KEY = process.env.TANK_KEY || '';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const DEFAULT_TANK = process.env.DEFAULT_TANK || 'family';
const MAX_FISH = Number(process.env.MAX_FISH) || 60;
const MAX_BODY = 400 * 1024;
const GAME = path.join(__dirname, '..', 'index.html');

fs.mkdirSync(DATA, { recursive: true });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Tank-Key',
  'Access-Control-Max-Age': '600',
};
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const tanks = new Map();
function tank(name) {
  if (tanks.has(name)) return tanks.get(name);
  let fish = {};
  try { fish = JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8')) || {}; } catch (_) {}
  const t = { fish, clients: new Set(), timer: null };
  tanks.set(name, t);
  return t;
}
function persist(name, t) {
  clearTimeout(t.timer);
  t.timer = setTimeout(() => {
    const file = path.join(DATA, name + '.json');
    fs.writeFile(file + '.tmp', JSON.stringify(t.fish), err => {
      if (err) return console.error('save failed', err.message);
      fs.rename(file + '.tmp', file, e => e && console.error('save failed', e.message));
    });
  }, 300);
}
function broadcast(t, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of t.clients) res.write(msg);
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function keyOk(req, url) {
  if (!KEY) return true;
  const given = String(req.headers['x-tank-key'] || url.searchParams.get('key') || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(KEY).digest();
  return crypto.timingSafeEqual(a, b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
function cleanFish(b) {
  if (!b || typeof b !== 'object') return null;
  if (typeof b.tex !== 'string' || !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.tex)) return null;
  return {
    name: str(b.name, 24) || 'Fishy',
    kind: ['swim', 'ground', 'drift'].includes(b.kind) ? b.kind : 'swim',
    wiggle: num(b.wiggle, 0.3, 2, 1),
    size: num(b.size, 0.4, 2, 1),
    pers: ['bold', 'shy', 'playful', 'normal'].includes(b.pers) ? b.pers : 'normal',
    glow: !!b.glow,
    tex: b.tex,
    by: str(b.by, 20),
    born: num(b.born, 0, 9e15, Date.now()),
    level: num(b.level, 1, 99, 1),
    sentAt: Date.now(),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    if (parts[0] !== 'api') {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return fs.readFile(GAME, (err, buf) => {
          if (err) { res.writeHead(500); return res.end('index.html not found next to the server folder'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(buf);
        });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }

    if (parts[1] === 'info' && req.method === 'GET') return json(res, 200, { app: 'doodle-tank', needKey: !!KEY, defaultTank: DEFAULT_TANK, maxFish: MAX_FISH });

    if (parts[1] !== 'tanks' || !NAME_RE.test(parts[2] || '')) return json(res, 404, { error: 'not found' });
    if (!keyOk(req, url)) return json(res, 401, { error: 'wrong tank key' });
    const name = parts[2].toLowerCase(), t = tank(name);

    if (parts[3] === 'events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...CORS });
      res.write('retry: 3000\n');
      res.write(`event: snapshot\ndata: ${JSON.stringify(t.fish)}\n\n`);
      t.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); t.clients.delete(res); });
      return;
    }

    if (parts[3] === 'fish' && !parts[4] && req.method === 'GET') return json(res, 200, t.fish);

    if (parts[3] === 'fish' && ID_RE.test(parts[4] || '')) {
      const id = parts[4];
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'fish picture too big' : 'bad request' }); }
        const fish = cleanFish(body);
        if (!fish) return json(res, 400, { error: 'not a fish' });
        if (!t.fish[id] && Object.keys(t.fish).length >= MAX_FISH) return json(res, 507, { error: 'tank is full' });
        const isNew = !t.fish[id];
        t.fish[id] = fish; persist(name, t);
        broadcast(t, 'put', { id, data: fish });
        console.log(`[${name}] ${isNew ? 'added' : 'updated'} "${fish.name}"${fish.by ? ' by ' + fish.by : ''}`);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        if (t.fish[id]) { console.log(`[${name}] removed "${t.fish[id].name}"`); delete t.fish[id]; persist(name, t); broadcast(t, 'delete', { id }); }
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Doodle Tank server running on http://localhost:${PORT}`);
  console.log(KEY ? 'Tank key is ON. Players need it to join.' : 'No tank key set. Anyone who can reach this server can add fish.');
  console.log(`Saving tanks in ${DATA}`);
});
