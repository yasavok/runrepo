// Работа с системой: поиск программ, версии, порты, запуск
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const WIN = process.platform === 'win32';

function which(cmd) {
  if (/[\\/]/.test(cmd)) return fs.existsSync(cmd) ? cmd : null;
  const ext = WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(e => /^\.(com|exe|cmd|bat)$/i.test(e)) : [''];
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d || d === '.') continue; // программы из самого проекта не подхватываем
    for (const e of ext) { const f = path.join(d, cmd + e.toLowerCase()); try { const s = fs.statSync(f); if (s.isFile() && (WIN || s.mode & 0o111)) return f; } catch { try { if (WIN && fs.lstatSync(f).isSymbolicLink()) return f; } catch { /* нет такого */ } } }
  }
  return null;
}

// .cmd и .bat в Windows запускаются только через cmd.exe, поэтому аргументы строго проверяются
function plan(cmd, args) {
  const file = which(cmd); if (!file) return null;
  if (!WIN || !/\.(cmd|bat)$/i.test(file)) return { file, args, opts: {} };
  for (const a of args) if (!/^[\w@.:/\\=+ -]*$/.test(a)) throw new Error('Небезопасный аргумент: ' + a);
  return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', '"' + ['"' + file + '"', ...args.map(a => / /.test(a) ? '"' + a + '"' : a)].join(' ') + '"'], opts: { windowsVerbatimArguments: true } };
}
function start(cmd, args, opts) { const p = plan(cmd, args); if (!p) { const e = new Error(cmd); e.code = 'NOTFOUND'; throw e; } return spawn(p.file, p.args, { ...opts, ...p.opts }); }
function output(cmd, args, timeout = 8000) { let p; try { p = plan(cmd, args); } catch { return ''; } if (!p) return ''; const r = spawnSync(p.file, p.args, { encoding: 'utf8', timeout, windowsHide: true, ...p.opts }); return r.status === 0 ? (r.stdout || '') + (r.stderr || '') : ''; }

function version(cmd) {
  const out = cmd === 'go' ? output('go', ['version']) : cmd === 'java' ? output('java', ['-version']) : output(cmd, ['--version']);
  return (out.match(/(\d+(?:\.\d+){0,2})/) || [])[1] || '';
}
// достаточно для engines, requires-python и go.mod; непонятное условие считаем выполненным
function versionOk(have, range) {
  if (!range || !have) return true;
  const num = v => v.split('.').map(x => +x), cmp = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }, h = num(have);
  return range.split('||').some(part => part.trim().replace(/(>=|<=|[<>^~=!])\s+/g, '$1').split(/[\s,]+/).filter(Boolean).every(t => {
    const m = t.match(/^(>=|<=|>|<|\^|~=?|={1,2}|!=)?v?(\d+(?:\.(?:\d+|[x*]))*)$/i); if (!m) return true;
    const raw = m[2].split('.').filter(x => /^\d+$/.test(x)), v = raw.map(Number), c = cmp(h, v), same = n => v.slice(0, n).every((x, i) => (h[i] || 0) === x);
    switch (m[1]) { case '>=': return c >= 0; case '<=': return c <= 0 || same(raw.length); case '>': return c > 0; case '<': return c < 0; case '^': return same(1) && c >= 0; case '~': return same(Math.min(2, raw.length)) && c >= 0; case '~=': return same(Math.max(1, raw.length - 1)) && c >= 0; case '!=': return !same(raw.length); default: return same(raw.length); }
  }));
}

const probe = (port, host) => new Promise(done => { const s = net.createServer(); s.once('error', e => done(e.code === 'EADDRINUSE' || e.code === 'EACCES')); s.once('listening', () => s.close(() => done(false))); s.listen({ port, host, exclusive: true }); });
const busy = async port => (await probe(port, '127.0.0.1')) || (await probe(port, '0.0.0.0')) || (await probe(port, '::1').catch(() => false));
const reachable = (port, host = '127.0.0.1') => new Promise(done => { const s = net.connect({ port, host, timeout: 900 }); const end = v => { s.destroy(); done(v); }; s.once('connect', () => end(true)); s.once('error', () => end(false)); s.once('timeout', () => end(false)); });
async function freePort(from) { for (let p = from; p < from + 50 && p < 65536; p++) if (!(await busy(p))) return p; return null; }
function owner(port) {
  if (WIN) {
    const row = output('netstat', ['-ano', '-p', 'TCP']).split(/\r?\n/).concat(output('netstat', ['-ano', '-p', 'TCPv6']).split(/\r?\n/)).find(l => new RegExp('[:.]' + port + '\\s+\\S+:0\\s').test(l)), pid = row && +row.trim().split(/\s+/).pop(); if (!pid) return null;
    const m = output('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH']).match(/^"([^"]+)"/m); return { pid, name: m ? m[1].replace(/\.exe$/i, '') : '?' };
  }
  const o = output('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-Fpc']), pid = (o.match(/^p(\d+)/m) || [])[1]; return pid ? { pid: +pid, name: (o.match(/^c(.+)/m) || [])[1] || '?' } : null;
}
module.exports = { WIN, which, plan, start, output, version, versionOk, busy, reachable, freePort, owner };
