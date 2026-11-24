#!/usr/bin/env node
// DagleiTV WebRTC lab server: static pages + a minimal signaling relay on ONE port.
// Zero dependencies (Node built-ins only).
//
// Signaling = Server-Sent Events (server → browser) + HTTP POST (browser → server).
// Why not WebSocket: Node has no built-in WebSocket *server*; SSE + POST needs no
// package and no hand-written frame parser, works over the same HTTP/HTTPS port, and
// a few messages per call make the extra latency irrelevant.
//
// The server only relays offer / answer / candidate / bye between peers in the same
// room. It never sees media. It is a lab tool: no auth, in-memory rooms, no persistence.
//
// Usage:
//   node server/server.mjs                         # http://localhost:8787
//   node server/server.mjs --host 0.0.0.0          # reachable from the LAN (see README: secure context)
//   node server/server.mjs --https --cert certs/lab.pem --key certs/lab-key.pem
//   options: --port <n> (or PORT env), --host <addr>

import { readFile, stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));

// ---- options ----
function parseArgs(argv) {
  const opts = { port: Number(process.env.PORT) || 8787, host: 'localhost', https: false, cert: null, key: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === '--port') opts.port = Number(next());
    else if (a === '--host') opts.host = next();
    else if (a === '--https') opts.https = true;
    else if (a === '--cert') opts.cert = next();
    else if (a === '--key') opts.key = next();
    else if (a === '--help' || a === '-h') {
      console.log('node server/server.mjs [--port 8787] [--host localhost|0.0.0.0] [--https --cert <pem> --key <pem>]');
      process.exit(0);
    } else throw new Error(`Unknown option: ${a}`);
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) throw new Error('--port must be 1–65535');
  if (opts.https && (!opts.cert || !opts.key)) throw new Error('--https needs --cert <file> and --key <file> (see README: mkcert)');
  return opts;
}

// ---- static files ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad path');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');
  try {
    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, 'Not found');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'Not found');
  }
}

function send(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

// ---- signaling ----
/** room code → Map(peerId → { res, role }) */
const rooms = new Map();
const ROOM_RE = /^[A-Za-z0-9-]{3,32}$/;
const MAX_PEERS = 8;
const MAX_BODY = 64 * 1024;
const RELAYED = new Set(['offer', 'answer', 'candidate', 'bye']);
const ROLES = new Set(['publisher', 'viewer', 'peer']);

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function openEvents(req, res, url) {
  const room = url.searchParams.get('room') ?? '';
  const role = url.searchParams.get('role') ?? 'peer';
  if (!ROOM_RE.test(room)) return send(res, 400, 'room must be 3–32 letters, digits or dashes');
  if (!ROLES.has(role)) return send(res, 400, 'role must be publisher, viewer or peer');
  const peers = rooms.get(room) ?? new Map();
  if (peers.size >= MAX_PEERS) return send(res, 409, 'room is full');
  rooms.set(room, peers);

  const id = randomUUID();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Tell the newcomer who it is and who is already here; tell the others it joined.
  sse(res, 'welcome', { id, room, role, peers: [...peers].map(([pid, p]) => ({ id: pid, role: p.role })) });
  for (const [, p] of peers) sse(p.res, 'peer-joined', { id, role });
  peers.set(id, { res, role });
  log(`join  room=${room} peer=${id.slice(0, 8)} role=${role} (${peers.size} in room)`);

  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    peers.delete(id);
    for (const [, p] of peers) sse(p.res, 'peer-left', { id });
    if (peers.size === 0) rooms.delete(room);
    log(`leave room=${room} peer=${id.slice(0, 8)} (${peers.size} left)`);
  });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function relay(req, res) {
  let msg;
  try {
    msg = await readJson(req);
  } catch (err) {
    return send(res, 400, `bad JSON: ${err.message}`);
  }
  const { room, from, to, type, payload } = msg ?? {};
  if (!ROOM_RE.test(room ?? '') || !RELAYED.has(type)) return send(res, 400, 'need room and type offer|answer|candidate|bye');
  const peers = rooms.get(room);
  if (!peers?.has(from)) return send(res, 403, 'unknown sender for this room');
  const targets = to ? [[to, peers.get(to)]].filter(([, p]) => p) : [...peers].filter(([id]) => id !== from);
  if (to && targets.length === 0) return send(res, 404, 'target peer not in room');
  for (const [, p] of targets) sse(p.res, 'signal', { from, type, payload });
  send(res, 200, JSON.stringify({ delivered: targets.length }), 'application/json');
}

// ---- server ----
function log(line) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
}

function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://lab.local');
  if (url.pathname === '/signal/events' && req.method === 'GET') return openEvents(req, res, url);
  if (url.pathname === '/signal/send' && req.method === 'POST') return void relay(req, res);
  if (url.pathname === '/healthz') return send(res, 200, JSON.stringify({ ok: true, rooms: rooms.size }), 'application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  return void serveStatic(req, res, url.pathname);
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const server = opts.https
    ? createHttpsServer({ cert: readFileSync(opts.cert), key: readFileSync(opts.key) }, handler)
    : createHttpServer(handler);
  server.listen(opts.port, opts.host, () => {
    const scheme = opts.https ? 'https' : 'http';
    console.log(`DagleiTV WebRTC lab on ${scheme}://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}/`);
    if (opts.host === '0.0.0.0') {
      for (const ip of lanAddresses()) console.log(`  LAN: ${scheme}://${ip}:${opts.port}/`);
      if (!opts.https) console.log('  Note: other devices need HTTPS for camera/screen APIs (secure context). See README.');
    }
  });
  // SSE streams stay open, so close them too or close() would wait forever.
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
