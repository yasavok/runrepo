const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net'), http = require('node:http');
const { spawnSync } = require('node:child_process');
const { detect } = require('../src/detect.js'), { check, parseEnv, databases, composeServices } = require('../src/checks.js'), { explain } = require('../src/explain.js'), sys = require('../src/sys.js'), { options, serve } = require('../bin/rr.js');
const L = ru => ru, RR = path.join(__dirname, '../bin/rr.js');
function project(files) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rr тест ')); for (const [f, t] of Object.entries(files)) { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof t === 'string' ? t : JSON.stringify(t)); } return d; }
const item = async (d, id) => { const p = detect(d)[0]; return (await check(p, d, L)).find(i => i.id === id); };

test('распознаёт проекты', () => {
  const kind = f => detect(project(f)).map(p => p.kind + ' | ' + p.start.title).join('; ');
  assert.match(kind({ 'package.json': { scripts: { dev: 'vite' }, devDependencies: { vite: '7' } }, 'pnpm-lock.yaml': '' }), /^Node\.js, vite \| pnpm run dev$/);
  assert.match(kind({ 'package.json': { scripts: { start: 'node .' }, packageManager: 'yarn@4.0.0' } }), /yarn run start/);
  assert.match(kind({ 'manage.py': '', 'requirements.txt': 'Django==5' }), /Django \| manage\.py runserver/);
  assert.match(kind({ 'main.py': 'api = FastAPI()', 'requirements.txt': 'fastapi\nuvicorn' }), /FastAPI \| uvicorn main:api/);
  assert.match(kind({ 'app.py': 'app = Flask(__name__)', 'requirements.txt': 'flask' }), /Flask \| flask run/);
  assert.match(kind({ 'go.mod': 'module x\ngo 1.22', 'main.go': 'package main' }), /Go \| go run \./);
  assert.match(kind({ 'Cargo.toml': '[package]', 'src/main.rs': '' }), /Rust/);
  assert.match(kind({ 'App.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>' }), /\.NET \| dotnet run --project App\.csproj/);
  assert.match(kind({ 'docker-compose.yml': 'services:\n' }), /Docker Compose/);
  assert.match(kind({ 'index.html': '' }), /HTML/);
  assert.strictEqual(kind({ 'notes.txt': '' }), '');
});
test('случаи из настоящих репозиториев', () => {
  const one = f => detect(project(f)).map(p => p.kind + ' | ' + p.start.title).join('; '), web = '<Project Sdk="Microsoft.NET.Sdk.Web"/>';
  assert.match(one({ artisan: '', 'composer.json': { scripts: { dev: ['x'] } }, 'package.json': { scripts: { dev: 'vite' } } }), /^PHP, Laravel \| composer run dev$/);
  assert.match(one({ artisan: '', 'composer.json': {}, 'package.json': { scripts: { dev: 'x' } } }), /^PHP, Laravel \| php artisan serve$/);
  assert.match(one({ 'bin/rails': '', Gemfile: '', 'package.json': { scripts: { dev: 'vite' } } }), /^Ruby, Rails/);
  assert.strictEqual(one({ 'package.json': { name: 'lib', files: ['lib'], dependencies: { a: '1' } }, 'index.js': '' }), '');
  assert.match(one({ 'package.json': { private: true, main: 'server.js' }, 'server.js': '' }), /node server\.js/);
  assert.match(one({ 'launch.py': 'start()', 'requirements.txt': 'fastapi' }), /\| launch\.py$/);
  assert.match(one({ 'blog.py': 'from app import create_app\napp = create_app()', 'requirements.txt': 'flask' }), /Flask \| flask run/);
  assert.match(one({ 'pyproject.toml': '[project]\nname="x"\n[project.scripts]\nmytool = "x:main"\n' }), /^Python \| mytool --help$/);
  assert.match(one({ 'Cargo.toml': '[package]\nname = "x"', 'src/bin/tool/main.rs': '' }), /\| cargo run$/);
  assert.match(one({ 'Cargo.toml': '[package]\nname = "x"\n[[bin]]\nname = "x-cli"\npath = "a"\n[[bin]]\nname = "x-server"\npath = "b"' }), /--bin x-server$/);
  assert.match(one({ 'A.sln': '', 'src/Api/Api.csproj': web, 'src/Web/Web.csproj': web }), /Web\.csproj$/);
  assert.match(one({ 'A.sln': '', 'src/Web/Web.csproj': web, 'src/App.AppHost/App.AppHost.csproj': '<Project Sdk="Microsoft.NET.Sdk"><OutputType>Exe</OutputType></Project>' }), /AppHost\.csproj$/);
  assert.match(one({ 'package.json': { scripts: { dev: 'x' } }, 'backend/app/main.py': 'app = FastAPI()', 'backend/requirements.txt': 'fastapi' }), /Node\.js.*; Python, FastAPI/);
  assert.match(one({ 'go.mod': 'module x', 'main.go': 'package main', 'web/package.json': { scripts: { dev: 'vite' } } }), /^Go .*; Node\.js/);
});
test('находит части проекта', () => { assert.deepStrictEqual(detect(project({ 'frontend/package.json': { scripts: { dev: 'vite' } }, 'backend/manage.py': '', 'backend/requirements.txt': '', 'docs/package.json': { scripts: { dev: 'x' } } })).map(p => p.name).sort(), ['backend', 'frontend']); });
test('сломанный package.json не роняет', () => assert.deepStrictEqual(detect(project({ 'package.json': '{oops' })), []));
test('порт из скрипта, конфига и фреймворка', () => {
  const port = f => detect(project(f))[0].port;
  assert.strictEqual(port({ 'package.json': { scripts: { dev: 'next dev -p 4321' }, dependencies: { next: '1' } } }), 4321);
  assert.strictEqual(port({ 'package.json': { scripts: { dev: 'vite' }, devDependencies: { vite: '1' } }, 'vite.config.js': 'server: { port: 9090 }' }), 9090);
  assert.strictEqual(port({ 'package.json': { scripts: { start: 'ng serve' }, devDependencies: { '@angular/cli': '1' } } }), 4200);
});
test('версии', () => {
  for (const [v, r, ok] of [['24.18.0', '>=20', true], ['18.0.0', '>=20', false], ['20.5.0', '^20.1.0', true], ['21.0.0', '^20.1.0', false], ['18.2.0', '16 || 18', true], ['20.0.0', '20.x', true], ['3.12.1', '>=3.10,<3.13', true], ['3.13.0', '>=3.10,<3.13', false], ['20.1.0', '>= 18 <22', true], ['1.2.3', 'lts/*', true], ['', '>=1', true], ['22.1.0', 'v22', true], ['9.9.9', '', true]]) assert.strictEqual(sys.versionOk(v, r), ok, v + ' ' + r);
});
test('зависимости', async () => {
  const pkg = { scripts: { dev: 'x' }, dependencies: { a: '1' } };
  assert.strictEqual((await item(project({ 'package.json': pkg }), 'deps')).state, 'fix');
  assert.strictEqual((await item(project({ 'package.json': pkg, 'node_modules/a/index.js': '' }), 'deps')).state, 'ok');
  assert.strictEqual((await item(project({ 'package.json': { scripts: { dev: 'x' } } }), 'deps')).state, 'ok');
});
test('.env', async () => {
  const base = { 'package.json': { scripts: { dev: 'x' } } };
  const a = await item(project({ ...base, '.env.example': 'KEY=\nPORT=3000\n' }), 'env'); assert.strictEqual(a.state, 'fix'); assert.match(a.note, /KEY/);
  const b = await item(project({ ...base, '.env.example': 'A=1\nRR_TEST_B=2', '.env': 'A=1' }), 'env'); assert.strictEqual(b.state, 'warn'); assert.match(b.note, /RR_TEST_B/);
  assert.strictEqual(parseEnv('export A="x y" # c\n#B=1\nC = \'z\'').get('A'), 'x y');
});
test('занятый порт', async () => {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port;
  const i = await item(project({ 'package.json': { scripts: { dev: 'next dev --port ' + port }, dependencies: { next: '1' } }, 'node_modules/x': '' }), 'port');
  assert.strictEqual(i.state, 'warn'); assert.match(i.note, /занят/); assert.ok(await sys.busy(port)); assert.notStrictEqual(await sys.freePort(port), port);
  await new Promise(r => s.close(r)); assert.ok(!(await sys.busy(port)));
});
test('базы: только локальные, пароли не показываются', async () => {
  assert.deepStrictEqual(databases(parseEnv('A=postgresql://u:secret@localhost:5999/db\nB=redis://127.0.0.1\nC=postgres://x:y@db.example.com/z\nD=mongodb+srv://a@cloud.example')), [{ port: 5999, name: 'PostgreSQL' }, { port: 6379, name: 'Redis' }]);
  const d = project({ 'package.json': { scripts: { dev: 'x' } }, '.env': 'DATABASE_URL=postgres://u:secret@localhost:59321/db' }), i = await item(d, 'db'); assert.strictEqual(i.state, 'warn'); assert.ok(!JSON.stringify(i).includes('secret'));
  assert.deepStrictEqual(composeServices(project({ 'compose.yml': 'services:\n  db:\n    image: postgres:16\n  web:\n    build: .\nvolumes:\n  x:\n' })).map(s => s.name), ['db']);
});
test('объяснения', () => {
  assert.match(explain('Error: listen EADDRINUSE: address already in use :::3000', L), /Порт 3000 занят/);
  assert.match(explain("ModuleNotFoundError: No module named 'requests'", L), /requests/);
  assert.match(explain('connect ECONNREFUSED 127.0.0.1:5432', L), /5432/);
  assert.match(explain("\x1b[1;35mModuleNotFoundError\x1b[0m: \x1b[35mNo module named 'requests'\x1b[0m", L), /requests/);
  assert.strictEqual(explain('всё хорошо', L), '');
});
test('опасные аргументы в cmd не проходят', { skip: !sys.WIN }, () => assert.throws(() => sys.plan('npm', ['run', 'dev & calc'])));
test('сервер не отдаёт .env и чужие файлы', async () => {
  const d = project({ 'index.html': 'привет', '.env': 'SECRET=1', 'a/b.txt': 'ok' }), s = await serve(d, 0), port = s.address().port;
  const get = p => new Promise(r => http.get({ port, host: '127.0.0.1', path: p }, x => { let t = ''; x.on('data', c => t += c); x.on('end', () => r([x.statusCode, t])); }));
  assert.deepStrictEqual(await get('/'), [200, 'привет']); assert.strictEqual((await get('/.env'))[0], 403); assert.notStrictEqual((await get('/..%2f..%2fwindows/win.ini'))[0], 200); assert.strictEqual((await get('/' + encodeURIComponent('нет')))[0], 404); assert.strictEqual((await get('/%E0%A4'))[0], 400);
  s.close(); s.closeAllConnections();
});
test('параметры', () => { assert.ok(options(['-c']).check); assert.throws(() => options(['--bad'])); assert.throws(() => options(['--lang', 'fr'])); });
test('--check ничего не меняет', () => { const d = project({ 'package.json': { scripts: { dev: 'x' }, dependencies: { a: '1' } }, '.env.example': 'A=1' }), before = fs.readdirSync(d).join(), r = spawnSync(process.execPath, [RR, d, '--check', '--lang', 'ru'], { encoding: 'utf8' }); assert.strictEqual(r.status, 1); assert.match(r.stdout, /не установлены/); assert.strictEqual(fs.readdirSync(d).join(), before); });
test('без терминала и без -y не запускает', () => { const r = spawnSync(process.execPath, [RR, project({ 'package.json': { scripts: { dev: 'node x.js' } }, 'x.js': 'console.log(1)' }), '--lang', 'ru'], { encoding: 'utf8', input: '' }); assert.strictEqual(r.status, 1); assert.match(r.stderr, /подтверждение/); });
test('чинит и запускает целиком', () => {
  const d = project({ 'package.json': { scripts: { dev: 'node app.js' } }, 'app.js': "console.log(require('fs').existsSync('.env') ? 'ENV ЕСТЬ' : 'нет'); console.log('http://localhost:4999')", '.env.example': 'A=1' }), r = spawnSync(process.execPath, [RR, d, '-y', '--no-open', '--lang', 'ru'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr); assert.match(r.stdout, /ENV ЕСТЬ/); assert.match(r.stdout, /Работает: http:\/\/localhost:4999/);
});
test('объясняет падение', () => { const r = spawnSync(process.execPath, [RR, project({ 'package.json': { scripts: { dev: 'node app.js' } }, 'app.js': "require('net-takogo')" }), '-y', '--lang', 'ru'], { encoding: 'utf8' }); assert.strictEqual(r.status, 1); assert.match(r.stderr, /Не найден модуль net-takogo/); });
