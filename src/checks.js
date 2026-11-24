// Проверяет, чего не хватает для запуска. Ничего не меняет: исправления только описаны.
const fs = require('node:fs'), path = require('node:path');
const { which, version, versionOk, busy, reachable, owner, freePort, output } = require('./sys.js');
const { text, has, COMPOSE } = require('./detect.js');

const SAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist', 'env.example'];
function parseEnv(t) {
  const o = new Map();
  for (const line of t.split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)$/); if (m) o.set(m[1], m[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2')); }
  return o;
}
const INSTALL = { node: 'https://nodejs.org', python: 'https://python.org', python3: 'https://python.org', py: 'https://python.org', go: 'https://go.dev/dl', cargo: 'https://rustup.rs', dotnet: 'https://dotnet.microsoft.com/download', java: 'https://adoptium.net', docker: 'https://docs.docker.com/get-docker', php: 'https://php.net', ruby: 'https://ruby-lang.org', pnpm: 'npm install -g pnpm', yarn: 'npm install -g yarn', bun: 'https://bun.sh', uv: 'https://docs.astral.sh/uv', poetry: 'https://python-poetry.org', pipenv: 'https://pipenv.pypa.io', composer: 'https://getcomposer.org', mvn: 'https://maven.apache.org', gradle: 'https://gradle.org', bundle: 'https://bundler.io' };
const DB = { postgres: ['PostgreSQL', 5432], postgresql: ['PostgreSQL', 5432], mysql: ['MySQL', 3306], mariadb: ['MariaDB', 3306], mongodb: ['MongoDB', 27017], redis: ['Redis', 6379], amqp: ['RabbitMQ', 5672] };

// адреса баз из .env: проверяем только локальные, значения никуда не выводим
function databases(env) {
  const found = new Map();
  for (const v of env.values()) {
    const m = v.match(/^(\w+?)(?:\+\w+)?s?:\/\/(?:[^@/\s]*@)?(\[[^\]]+\]|[^:/\s?]+)(?::(\d+))?/); const d = m && (DB[m[1]] || DB[m[1] + 's']);
    if (d && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(m[2])) found.set(+(m[3] || d[1]), d[0]);
  }
  const host = env.get('DB_HOST') || env.get('POSTGRES_HOST'); if (host && /^(localhost|127\.0\.0\.1)$/.test(host)) { const p = +(env.get('DB_PORT') || env.get('POSTGRES_PORT') || 0), k = Object.values(DB).find(x => x[1] === p); if (p) found.set(p, k ? k[0] : 'DB'); }
  return [...found].map(([port, name]) => ({ port, name }));
}
function composeServices(dir) {
  const f = COMPOSE.find(x => has(dir, x)); if (!f) return [];
  const out = []; let inside = false, cur = null;
  for (const line of text(dir, f).split(/\r?\n/)) {
    if (/^\S/.test(line)) { inside = /^services\s*:/.test(line); continue; }
    if (!inside) continue;
    const s = line.match(/^ {2}([\w.-]+)\s*:\s*(#.*)?$/), img = line.match(/^\s{4,}image\s*:\s*["']?([^\s"'#]+)/);
    if (s) out.push(cur = { name: s[1], image: '' }); else if (img && cur) cur.image = img[1];
  }
  return out.filter(s => /postgres|postgis|mysql|mariadb|mongo|redis|rabbitmq|elasticsearch|minio|valkey/i.test(s.image) && /^[\w.-]+$/.test(s.name));
}

async function check(p, rootDir, L) {
  const items = [], add = (id, state, title, note, fix) => items.push({ id, state, title, note: note || '', fix: fix || null });
  // язык и его версия
  if (p.need) {
    const { cmd, range } = p.need, v = which(cmd) ? version(cmd) : '';
    if (!which(cmd) || !v) add('runtime', 'stop', cmd, L('не установлен: ', 'not installed: ') + (INSTALL[cmd] || ''));
    else if (!versionOk(v, range)) add('runtime', 'warn', cmd + ' ' + v, L('проекту нужна ', 'project wants ') + range);
    else add('runtime', 'ok', cmd + ' ' + v);
  }
  if (p.tool && !which(p.tool)) {
    if (['pnpm', 'yarn'].includes(p.tool) && which('corepack')) { for (const s of [p.start, p.deps && p.deps.fix]) if (s && s.cmd === p.tool) { s.args = [p.tool, ...s.args]; s.cmd = 'corepack'; } add('tool', 'ok', p.tool, L('через corepack', 'via corepack')); }
    else add('tool', 'stop', p.tool, L('не установлен: ', 'not installed: ') + (INSTALL[p.tool] || ''));
  }
  // зависимости
  if (p.deps && p.deps.fix) {
    if (p.deps.ok) add('deps', 'ok', L('зависимости', 'dependencies'));
    else add('deps', 'fix', L('зависимости', 'dependencies'), p.deps.why === 'stale' ? L('устарели', 'outdated') : L('не установлены', 'not installed'), [].concat(p.deps.fix));
  }
  // .env
  const sample = SAMPLES.find(f => has(p.dir, f)); let env = parseEnv(text(p.dir, '.env') + '\n' + text(p.dir, '.env.local'));
  if (sample && !has(p.dir, '.env') && !has(p.dir, '.env.local')) {
    env = parseEnv(text(p.dir, sample)); const empty = [...env].filter(([, v]) => !v || /^(your|change|xxx|todo|<)/i.test(v)).map(([k]) => k);
    add('env', 'fix', '.env', L('нет файла', 'missing') + (empty.length ? L(', заполни потом: ', ', fill in later: ') + empty.slice(0, 5).join(', ') : ''), [{ title: L('создать .env из ', 'create .env from ') + sample, copy: [path.join(p.dir, sample), path.join(p.dir, '.env')] }, ...(p.laravel && env.has('APP_KEY') && !env.get('APP_KEY') ? [{ title: 'php artisan key:generate', cmd: 'php', args: ['artisan', 'key:generate'] }] : [])]);
  } else if (sample) {
    const miss = [...parseEnv(text(p.dir, sample)).keys()].filter(k => !env.has(k) && !(k in process.env));
    if (miss.length) add('env', 'warn', '.env', L('не хватает: ', 'missing: ') + miss.slice(0, 6).join(', ')); else add('env', 'ok', '.env');
  }
  // порт
  const asked = env.get('PORT'), port = asked && /^\d{2,5}$/.test(asked) && !p.portFixed ? +asked : p.port;
  if (port) {
    if (await busy(port)) {
      const who = owner(port), other = p.envPort ? await freePort(port + 1) : null, note = L('занят', 'busy') + (who ? ': ' + who.name + ' (' + who.pid + ')' : '');
      if (other) add('port', 'fix', L('порт ', 'port ') + port, note, [{ title: L('взять порт ', 'use port ') + other, port: other }]);
      else add('port', 'warn', L('порт ', 'port ') + port, note);
    } else add('port', 'ok', L('порт ', 'port ') + port, L('свободен', 'free'));
  }
  // базы данных
  const services = composeServices(rootDir);
  for (const d of databases(p.dir === rootDir ? env : new Map([...parseEnv(text(rootDir, '.env')), ...env]))) {
    if (await reachable(d.port)) { add('db', 'ok', d.name, L('отвечает', 'responds')); continue; }
    const key = d.name.toLowerCase().slice(0, 5), s = services.find(x => x.image.toLowerCase().includes(key));
    if (s && which('docker')) add('db', 'fix', d.name, L('не запущен', 'not running'), [{ title: 'docker compose up -d ' + s.name, cmd: 'docker', args: ['compose', 'up', '-d', s.name], cwd: rootDir }]);
    else add('db', 'warn', d.name, L('не отвечает на порту ', 'no answer on port ') + d.port + (s ? L(', есть в compose, но нет Docker', ', defined in compose but Docker is missing') : ''));
  }
  if (p.docker && which('docker') && !output('docker', ['info', '--format', '{{.ServerVersion}}'])) add('docker', 'stop', 'Docker', L('не запущен', 'not running'));
  return items;
}
module.exports = { check, parseEnv, databases, composeServices };
