// Настоящие запуски. Языки, которых нет на машине, пропускаются.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const sys = require('../src/sys.js');
const RR = path.join(__dirname, '../bin/rr.js');
const can = cmd => !!sys.which(cmd) && !!sys.version(cmd);
function go(files, ...args) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rr e2e '));
  for (const [f, t] of Object.entries(files)) { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); }
  const r = spawnSync(process.execPath, [RR, d, '-y', '--no-open', '--lang', 'ru', ...args], { encoding: 'utf8', timeout: 240000 });
  return { ...r, dir: d, all: r.stdout + r.stderr };
}
const opt = cmd => ({ skip: !can(cmd) && 'нет ' + cmd, timeout: 260000 });

test('Node: npm install и запуск', opt('npm'), () => {
  const r = go({ 'package.json': '{"scripts":{"dev":"node app.js"},"dependencies":{"mylib":"file:./lib"}}', 'lib/package.json': '{"name":"mylib","version":"1.0.0"}', 'lib/index.js': 'module.exports="LIB OK"', 'app.js': 'console.log(require("mylib"))' });
  assert.strictEqual(r.status, 0, r.all); assert.match(r.stdout, /LIB OK/);
});
test('Python: venv и запуск', opt(sys.WIN ? 'py' : 'python3'), () => {
  const r = go({ 'requirements.txt': '', 'main.py': "import sys\nprint('VENV', sys.prefix != sys.base_prefix)\n" });
  assert.strictEqual(r.status, 0, r.all); assert.match(r.stdout, /VENV True/); assert.ok(fs.existsSync(path.join(r.dir, '.venv')));
});
test('Python: падение объясняется', opt(sys.WIN ? 'py' : 'python3'), () => {
  const r = go({ 'requirements.txt': '', 'main.py': 'import net_takogo_paketa\n' }); assert.strictEqual(r.status, 1); assert.match(r.stderr, /Нет Python-пакета net_takogo_paketa/);
});
test('Go', opt('go'), () => { const r = go({ 'go.mod': 'module x\n\ngo 1.20\n', 'main.go': 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("GO OK") }\n' }); assert.strictEqual(r.status, 0, r.all); assert.match(r.stdout, /GO OK/); });
test('Rust', opt('cargo'), () => { const r = go({ 'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"\nedition = "2021"\n', 'src/main.rs': 'fn main() { println!("RUST OK"); }\n' }); assert.strictEqual(r.status, 0, r.all); assert.match(r.stdout, /RUST OK/); });
test('.NET', opt('dotnet'), () => {
  const major = sys.version('dotnet').split('.')[0], r = go({ 'App.csproj': `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${major}.0</TargetFramework></PropertyGroup></Project>`, 'Program.cs': 'System.Console.WriteLine("NET OK");' });
  assert.strictEqual(r.status, 0, r.all); assert.match(r.stdout, /NET OK/);
});
test('два сервиса: вывод подписан, падение одного видно', opt('npm'), () => {
  const pkg = '{"scripts":{"dev":"node app.js"}}', r = go({ 'frontend/package.json': pkg, 'frontend/app.js': 'console.log("http://localhost:4872")', 'backend/package.json': pkg, 'backend/app.js': 'throw new Error("connect ECONNREFUSED 127.0.0.1:5432")' });
  assert.strictEqual(r.status, 1); assert.match(r.stdout, /\[frontend\]/); assert.match(r.stderr, /к порту 5432/);
});
