#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), readline = require('node:readline/promises');
const { detect } = require('../src/detect.js'), { check } = require('../src/checks.js'), { explain } = require('../src/explain.js'), sys = require('../src/sys.js');

const tty = process.stdout.isTTY && !process.env.NO_COLOR, paint = n => s => tty ? `\x1b[${n}m${s}\x1b[0m` : String(s);
const bold = paint(1), dim = paint(90), green = paint(32), red = paint(31), blue = paint(36);
const MARK = { ok: green('✓'), fix: blue('+'), warn: red('!'), stop: red('✗') };

function options(argv) {
  const o = { dir: '.', lang: /^ru/i.test(process.env.RR_LANG || Intl.DateTimeFormat().resolvedOptions().locale) ? 'ru' : 'en', open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true; else if (a === '-v' || a === '--version') o.version = true; else if (a === '-c' || a === '--check') o.check = true; else if (a === '-y' || a === '--yes') o.yes = true;
    else if (a === '--json') o.json = o.check = true; else if (a === '--no-open') o.open = false; else if (a === '--no-scripts') o.noScripts = true;
    else if (a === '--lang') { o.lang = argv[++i]; if (!['ru', 'en'].includes(o.lang)) throw new Error('--lang ru|en'); }
    else if (a === '--only') { o.only = argv[++i]; if (!o.only) throw new Error('--only <name>'); }
    else if (a.startsWith('-')) throw new Error('Unknown option ' + a); else o.dir = a;
  }
  return o;
}
const help = L => L(`rr [папка]          проверить проект, починить и запустить

  -c, --check       только проверить, ничего не менять
  -y, --yes         не спрашивать подтверждение
  --only имя        запустить одну часть проекта
  --no-scripts      ставить npm-зависимости без их скриптов
  --no-open         не открывать браузер
  --json            результат проверки для программ
  --lang ru|en      язык`, `rr [folder]         check the project, fix it and run

  -c, --check       only check, change nothing
  -y, --yes         do not ask
  --only name       run one part of the project
  --no-scripts      install npm dependencies without their scripts
  --no-open         do not open the browser
  --json            machine-readable check result
  --lang ru|en      language`);

function run(cmd, args, cwd) {
  return new Promise((ok, fail) => {
    let c, log = ''; try { c = sys.start(cmd, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'] }); } catch (e) { return fail(e); }
    for (const s of ['stdout', 'stderr']) c[s].on('data', d => { process[s].write(d); log = (log + d).slice(-20000); });
    c.on('error', fail); c.on('close', code => ok({ code, log }));
  });
}
function serve(dir, port) {
  const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }, root = fs.realpathSync(dir);
  return new Promise((ok, fail) => {
    const s = http.createServer((q, r) => {
      const no = c => { r.writeHead(c); r.end(); }; let f; try { f = path.join(root, decodeURIComponent(q.url.split(/[?#]/)[0])); } catch { return no(400); }
      try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); f = fs.realpathSync(f); } catch { return no(404); }
      if (f !== root && !f.startsWith(root + path.sep) || path.relative(root, f).split(path.sep).some(x => x.startsWith('.'))) return no(403); // .env и .git не отдаём
      r.writeHead(200, { 'content-type': T[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).on('error', () => r.destroy()).pipe(r);
    });
    s.once('error', fail); s.listen(port, '127.0.0.1', () => ok(s));
  });
}
function browse(url) { const [c, a] = sys.WIN ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; try { const p = sys.start(c, a, { stdio: 'ignore', detached: true }); p.on('error', () => {}); p.unref(); } catch { /* браузера нет */ } }

async function main() {
  const o = options(process.argv.slice(2)), L = (ru, en) => o.lang === 'ru' ? ru : en;
  if (o.help) return console.log(help(L)); if (o.version) return console.log(require('../package.json').version);
  const dir = path.resolve(o.dir); if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(L('Нет такой папки: ', 'No such folder: ') + dir);
  let parts = detect(dir); if (o.only) parts = parts.filter(p => p.name === o.only);
  if (!parts.length) { if (o.json) console.log('[]'); throw new Error(L('Не понял, как запускать этот проект. Посмотри README.', 'Could not tell how to run this project. See its README.')); }
  for (const p of parts) p.items = await check(p, dir, L);
  if (o.json) return console.log(JSON.stringify(parts.map(p => ({ name: p.name, kind: p.kind, start: p.start.title, items: p.items.map(({ id, state, title, note, fix }) => ({ id, state, title, note, fix: (fix || []).map(s => s.title) })) })), null, 2));

  const word = s => o.lang === 'en' && s.en ? s.en : s.title, fixes = [];
  for (const p of parts) {
    console.log('\n' + bold(p.name) + dim('  ' + p.kind));
    const w = Math.max(...p.items.map(i => i.title.length), 8);
    for (const i of p.items) { console.log('  ' + MARK[i.state] + ' ' + i.title.padEnd(w) + (i.note ? '  ' + dim(i.note) : '')); for (const f of i.fix || []) { fixes.push({ ...f, p }); console.log('    ' + ' '.repeat(w) + blue('→ ' + word(f))); } }
    console.log('  ' + blue('▶') + ' ' + word(p.start));
  }
  console.log('');
  if (parts.some(p => p.items.some(i => i.state === 'stop'))) { process.exitCode = 1; console.log(red(L('Сначала поставь то, что отмечено ✗.', 'Install what is marked ✗ first.'))); return; }
  if (o.check) { process.exitCode = fixes.length || parts.some(p => p.items.some(i => i.state === 'warn')) ? 1 : 0; return; }
  if (!o.yes) {
    if (!process.stdin.isTTY) throw new Error(L('Нужно подтверждение: добавь -y или запусти в терминале.', 'Confirmation needed: add -y or use a terminal.'));
    if (fixes.some(f => f.scripts)) console.log(dim(L('Установка и запуск выполняют код проекта. Чужому не доверяй вслепую.', 'Installing and running executes project code. Do not trust strangers blindly.')));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout }), a = (await rl.question((fixes.length ? L('Исправить и запустить?', 'Fix and run?') : L('Запустить?', 'Run?')) + ' [Y/n] ')).trim().toLowerCase(); rl.close();
    if (a && !['y', 'yes', 'д', 'да'].includes(a)) return;
  }
  for (const f of fixes) {
    if (f.port) { f.p.usePort = f.port; continue; }
    console.log(blue('→ ' + word(f)));
    if (f.copy) { fs.copyFileSync(f.copy[0], f.copy[1], fs.constants.COPYFILE_EXCL); continue; }
    const args = o.noScripts && ['npm', 'pnpm', 'yarn', 'corepack'].includes(f.cmd) && f.scripts ? [...f.args, '--ignore-scripts'] : f.args, r = await run(f.cmd, args, f.cwd || f.p.dir);
    if (r.code !== 0) { const why = explain(r.log, L); throw new Error(L('Не получилось: ', 'Failed: ') + word(f) + (why ? '\n' + why : '')); }
  }
  let opened = false, stopping = false; const kids = [];
  const url = u => { if (opened) return; opened = true; console.log('\n' + green(L('Работает: ', 'Running: ')) + bold(u) + '\n'); if (o.open && process.stdout.isTTY) browse(u); };
  process.on('SIGINT', () => { if (stopping) process.exit(130); stopping = true; if (!kids.length) process.exit(0); });
  await Promise.all(parts.map(async p => {
    const port = p.usePort || p.port;
    if (p.start.serve) { await serve(p.dir, port); url('http://localhost:' + port); return new Promise(() => {}); }
    let c; try { c = sys.start(p.start.cmd, p.start.args, { cwd: p.dir, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, ...(p.usePort ? { PORT: String(p.usePort) } : {}), FORCE_COLOR: tty ? '1' : '0', PYTHONUNBUFFERED: '1' } }); } catch (e) { throw new Error(L('Не нашёл программу: ', 'Program not found: ') + e.message); }
    kids.push(c); let log = ''; const tag = parts.length > 1 ? dim('[' + p.name + '] ') : '';
    for (const s of ['stdout', 'stderr']) { let rest = ''; c[s].on('data', d => {
      const t = String(d); log = (log + t).slice(-20000); if (!tag) process[s].write(t); else { const lines = (rest + t).split('\n'); rest = lines.pop(); for (const l of lines) process[s].write(tag + l + '\n'); }
      const m = t.replace(/\x1b\[[0-9;]*m/g, '').match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/); if (m) url('http://localhost:' + m[1]); }); }
    const code = await new Promise((ok, fail) => { c.on('error', fail); c.on('close', ok); });
    if (code && !stopping) { const why = explain(log, L); console.error('\n' + red(p.name + L(': остановился с кодом ', ': exited with code ') + code) + (why ? '\n' + why : '')); process.exitCode = 1; }
  }));
}
if (require.main === module) main().catch(e => { console.error(red(e.message)); process.exitCode = 1; });
module.exports = { options, serve };
