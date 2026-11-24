// Определяет, что за проект в папке и как его запускать. Только читает файлы.
const fs = require('node:fs'), path = require('node:path');
const { which, versionOk } = require('./sys.js');

const has = (dir, f) => fs.existsSync(path.join(dir, f));
const text = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, ''); } catch { return ''; } };
const json = (dir, f) => { try { return JSON.parse(text(dir, f)); } catch { return null; } };
const list = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
const mtime = (dir, f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } };
const step = (title, cmd, args, extra) => ({ title, cmd, args, ...extra });
const first = (...v) => v.find(Boolean);

// ----- Node.js
const PORTS = { next: 3000, nuxt: 3000, vite: 5173, 'react-scripts': 3000, '@angular/cli': 4200, astro: 4321, '@sveltejs/kit': 5173, gatsby: 8000, '@remix-run/dev': 3000, parcel: 1234, '@vue/cli-service': 8080, '@nestjs/core': 3000 };
function node(dir) {
  const p = json(dir, 'package.json'); if (!p) return null;
  const deps = { ...p.dependencies, ...p.devDependencies }, scripts = p.scripts || {};
  const named = (p.packageManager || '').match(/^(npm|pnpm|yarn|bun)@/);
  const pm = named ? named[1] : has(dir, 'pnpm-lock.yaml') ? 'pnpm' : has(dir, 'yarn.lock') ? 'yarn' : has(dir, 'bun.lock') || has(dir, 'bun.lockb') ? 'bun' : 'npm';
  const script = ['dev', 'start:dev', 'develop', 'start', 'serve'].find(s => scripts[s]);
  const main = [p.main, 'index.js', 'server.js', 'app.js'].find(f => f && has(dir, f) && /\.[cm]?js$/.test(f));
  if (!script && !(main && (p.main || Object.keys(deps).length))) return Object.keys(scripts).length || p.workspaces || p.bin ? null : null;
  const lock = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: has(dir, 'bun.lock') ? 'bun.lock' : 'bun.lockb' }[pm];
  const needs = Object.keys(deps).length > 0, modules = has(dir, 'node_modules') || has(dir, '.pnp.cjs');
  const stale = modules && pm === 'npm' && mtime(dir, 'node_modules/.package-lock.json') > 0 && mtime(dir, lock) > mtime(dir, 'node_modules/.package-lock.json') + 2000;
  const body = script ? scripts[script] : '', framework = Object.keys(PORTS).find(k => deps[k]);
  const cfg = text(dir, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].find(f => has(dir, f)) || '').match(/\bport\s*:\s*(\d{2,5})/);
  const given = body.match(/(?:--port[ =]|(?:^|\s)-p[ =]?|\bPORT=)(\d{2,5})\b/);
  return {
    kind: 'Node.js' + (framework ? ', ' + framework : ''), need: { cmd: 'node', range: first((p.engines || {}).node, text(dir, '.nvmrc').trim(), text(dir, '.node-version').trim()) || '' }, tool: pm === 'npm' ? null : pm,
    deps: { ok: !needs || (modules && !stale), why: stale ? 'stale' : 'missing', fix: step(pm + ' install', pm, ['install'], { scripts: true }) },
    start: script ? step(pm + ' run ' + script, pm, ['run', script]) : step('node ' + main, 'node', [main]), script: body,
    port: first(given && +given[1], cfg && +cfg[1], PORTS[framework]) || null, portFixed: !!(given || cfg), envPort: !given && !cfg && !/^(vite|@sveltejs)/.test(framework || ''),
  };
}

// ----- Python
function python(dir) {
  const req = ['requirements.txt', 'requirements/dev.txt', 'requirements/base.txt'].find(f => has(dir, f)), toml = text(dir, 'pyproject.toml');
  const entry = ['manage.py', 'main.py', 'app.py', 'run.py', 'server.py', 'wsgi.py', '__main__.py', 'src/main.py', 'app/main.py'].find(f => has(dir, f));
  if (!req && !toml && !has(dir, 'Pipfile') && !(entry && entry !== '__main__.py')) return null;
  if (!entry) return null;
  const win = process.platform === 'win32', venv = ['.venv', 'venv', 'env'].find(v => has(dir, v + (win ? '/Scripts/python.exe' : '/bin/python')));
  const base = win ? (which('py') ? 'py' : 'python') : which('python3') ? 'python3' : 'python', tool = has(dir, 'uv.lock') ? 'uv' : has(dir, 'poetry.lock') || /\[tool\.poetry\]/.test(toml) ? 'poetry' : has(dir, 'Pipfile') ? 'pipenv' : null;
  const all = (req ? text(dir, req) : '') + toml + text(dir, 'Pipfile'), uses = n => new RegExp('(^|[^\\w-])' + n + '($|[^\\w-])', 'im').test(all), code = text(dir, entry);
  const py = v => path.join(dir, v, win ? 'Scripts/python.exe' : 'bin/python'), target = venv || '.venv', external = req || toml || tool;
  const mod = entry.replace(/\.py$/, '').replace(/\//g, '.'), obj = (code.match(/^(\w+)\s*(?::\s*\w+\s*)?=\s*(?:FastAPI|Flask|Starlette)\(/m) || [])[1] || 'app';
  let args = [entry], label = entry, port = null;
  if (entry === 'manage.py') { args = ['manage.py', 'runserver']; label = 'manage.py runserver'; port = 8000; }
  else if (uses('streamlit')) { args = ['-m', 'streamlit', 'run', entry]; label = 'streamlit run ' + entry; port = 8501; }
  else if ((uses('fastapi') || uses('starlette')) && !/uvicorn\.run\(/.test(code)) { args = ['-m', 'uvicorn', mod + ':' + obj, '--reload']; label = 'uvicorn ' + mod + ':' + obj; port = 8000; }
  else if (uses('flask') && !/\.run\(/.test(code)) { args = ['-m', 'flask', '--app', mod, 'run']; label = 'flask run'; port = 5000; }
  else { const m = code.match(/\bport\s*=\s*(\d{2,5})/); port = m ? +m[1] : uses('flask') ? 5000 : null; }
  const fix = tool === 'uv' ? [step('uv sync', 'uv', ['sync'])] : tool === 'poetry' ? [step('poetry install', 'poetry', ['install'])] : tool === 'pipenv' ? [step('pipenv install', 'pipenv', ['install'])]
    : [...(venv ? [] : [step('создать .venv', base, ['-m', 'venv', '.venv'], { en: 'create .venv' })]), step('pip install', py(target), req ? ['-m', 'pip', 'install', '-r', req] : ['-m', 'pip', 'install', '-e', '.'], { scripts: true })];
  const start = tool ? step(label, tool, ['run', 'python', ...args]) : step(label, external || venv ? py(target) : base, args);
  return { kind: 'Python' + (entry === 'manage.py' ? ', Django' : uses('fastapi') ? ', FastAPI' : uses('flask') ? ', Flask' : uses('streamlit') ? ', Streamlit' : ''), need: { cmd: base, range: ((toml.match(/requires-python\s*=\s*["']([^"']+)/) || [])[1]) || text(dir, '.python-version').trim() }, tool,
    deps: { ok: !external || (tool ? (tool === 'uv' ? has(dir, '.venv') : true) : !!venv), why: 'missing', fix }, start, port, portFixed: true };
}

// ----- остальные языки
function go(dir) {
  if (!has(dir, 'go.mod')) return null;
  const cmds = list(path.join(dir, 'cmd')).filter(d => d.isDirectory()).map(d => './cmd/' + d.name), main = list(dir).some(f => /\.go$/.test(f.name) && !/_test\.go$/.test(f.name) && /^package main\b/m.test(text(dir, f.name)));
  const t = main ? '.' : cmds[0]; if (!t) return null;
  return { kind: 'Go', need: { cmd: 'go', range: ((text(dir, 'go.mod').match(/^go (\S+)/m) || [])[1] || '').replace(/^(.+)$/, '>=$1') }, start: step('go run ' + t, 'go', ['run', t]) };
}
function rust(dir) {
  const t = text(dir, 'Cargo.toml'); if (!t || !(has(dir, 'src/main.rs') || /\[\[bin\]\]|\[workspace\]/.test(t))) return null;
  return { kind: 'Rust', need: { cmd: 'cargo', range: '' }, start: step('cargo run', 'cargo', ['run']) };
}
function dotnet(dir) {
  const found = []; const scan = (d, depth) => { for (const f of list(d)) { if (f.isDirectory()) { if (depth && !/^(\.|bin$|obj$|node_modules$)|test/i.test(f.name)) scan(path.join(d, f.name), depth - 1); } else if (/\.(cs|fs)proj$/.test(f.name)) found.push(path.join(d, f.name)); } };
  if (!list(dir).some(f => /\.(sln|slnx|csproj|fsproj)$/.test(f.name))) return null; scan(dir, 3);
  const runnable = found.filter(f => /Sdk\.Web|<OutputType>\s*(Win)?Exe/i.test(fs.readFileSync(f, 'utf8'))); if (!runnable.length) return null;
  const pick = runnable.find(f => /Sdk\.Web/.test(fs.readFileSync(f, 'utf8'))) || runnable[0], pd = path.dirname(pick), rel = path.relative(dir, pick), tf = (fs.readFileSync(pick, 'utf8').match(/<TargetFrameworks?>net(\d+)\.0/) || [])[1];
  const urls = text(pd, 'Properties/launchSettings.json').match(/http:\/\/localhost:(\d+)/);
  return { kind: '.NET' + (/Sdk\.Web/.test(fs.readFileSync(pick, 'utf8')) ? ', ASP.NET' : ''), need: { cmd: 'dotnet', range: tf ? '>=' + tf : '' }, deps: { ok: fs.existsSync(path.join(pd, 'obj/project.assets.json')), why: 'missing', fix: step('dotnet restore', 'dotnet', ['restore', rel]) }, start: step('dotnet run --project ' + rel, 'dotnet', ['run', '--project', rel]), port: urls ? +urls[1] : null, portFixed: true };
}
function java(dir) {
  const win = process.platform === 'win32', spring = /spring-boot/.test(text(dir, 'pom.xml') + text(dir, 'build.gradle') + text(dir, 'build.gradle.kts'));
  if (has(dir, 'pom.xml') && spring) { const w = has(dir, win ? 'mvnw.cmd' : 'mvnw'); return { kind: 'Java, Spring', need: { cmd: 'java', range: '' }, tool: w ? null : 'mvn', start: step('spring-boot:run', w ? path.join(dir, win ? 'mvnw.cmd' : 'mvnw') : 'mvn', ['spring-boot:run']), port: 8080, portFixed: true }; }
  if (has(dir, 'build.gradle') || has(dir, 'build.gradle.kts')) { const w = has(dir, win ? 'gradlew.bat' : 'gradlew'), t = spring ? 'bootRun' : 'run'; if (!spring && !/application/.test(text(dir, 'build.gradle') + text(dir, 'build.gradle.kts'))) return null; return { kind: 'Java, Gradle', need: { cmd: 'java', range: '' }, tool: w ? null : 'gradle', start: step('gradle ' + t, w ? path.join(dir, win ? 'gradlew.bat' : 'gradlew') : 'gradle', [t]), port: spring ? 8080 : null, portFixed: true }; }
  return null;
}
function php(dir) { if (!has(dir, 'artisan')) return null; return { kind: 'PHP, Laravel', need: { cmd: 'php', range: '' }, tool: 'composer', deps: { ok: has(dir, 'vendor/autoload.php'), why: 'missing', fix: step('composer install', 'composer', ['install'], { scripts: true }) }, start: step('php artisan serve', 'php', ['artisan', 'serve']), port: 8000, portFixed: true }; }
function rails(dir) { if (!has(dir, 'bin/rails') || !has(dir, 'Gemfile')) return null; return { kind: 'Ruby, Rails', need: { cmd: 'ruby', range: '' }, tool: 'bundle', start: step('rails server', 'ruby', ['bin/rails', 'server']), deps: { ok: true }, port: 3000, portFixed: true }; }
function compose(dir) { const f = COMPOSE.find(x => has(dir, x)); return f ? { kind: 'Docker Compose', need: { cmd: 'docker', range: '' }, start: step('docker compose up', 'docker', ['compose', 'up']), docker: true } : null; }
function still(dir) { return has(dir, 'index.html') ? { kind: 'HTML', need: null, start: { title: 'встроенный сервер', en: 'built-in server', serve: true }, port: 8080, envPort: true } : null; }

const COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'];
const ORDER = [node, dotnet, php, rails, python, go, rust, java];
const one = dir => { for (const d of ORDER) { const p = d(dir); if (p) return { dir, ...p }; } return null; };
const SUB = /^(apps?|api|backend|back|client|frontend|front|server|services?|site|src|ui|web|website)$/i, SKIP = /^(\.|node_modules$|dist$|build$|vendor$|target$|docs?$|tests?$|examples?$)/i;

// корень важнее вложенных; если корень не запускается, ищем части проекта
function detect(dir) {
  const top = one(dir); if (top) return [{ ...top, name: path.basename(dir) }];
  const parts = [];
  for (const d of list(dir)) if (d.isDirectory() && !SKIP.test(d.name)) {
    const p = one(path.join(dir, d.name)); if (p) parts.push({ ...p, name: d.name, known: SUB.test(d.name) });
    else if (/^(apps|packages|services)$/i.test(d.name)) for (const e of list(path.join(dir, d.name))) if (e.isDirectory() && !SKIP.test(e.name)) { const q = one(path.join(dir, d.name, e.name)); if (q) parts.push({ ...q, name: d.name + '/' + e.name, known: true }); }
  }
  const known = parts.filter(p => p.known); if (known.length) return known.slice(0, 4); if (parts.length) return parts.slice(0, 4);
  const c = compose(dir) || still(dir); return c ? [{ dir, name: path.basename(dir), ...c }] : [];
}
module.exports = { detect, COMPOSE, text, has, list, versionOk };
