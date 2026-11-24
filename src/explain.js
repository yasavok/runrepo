// Объясняет частые падения человеческими словами
const RULES = [
  [/EADDRINUSE.*?:(\d{2,5})|[Pp]ort (\d{2,5}) is (?:already )?in use|[Aa]ddress already in use/, (m, L) => L('Порт ' + (m[1] || m[2] || '') + ' занят другой программой. Закрой её или смени порт.', 'Port ' + (m[1] || m[2] || '') + ' is taken by another program. Close it or change the port.')],
  [/Cannot find (?:module|package) ['"]([^'"]+)['"]|ERR_MODULE_NOT_FOUND/, (m, L) => L('Не найден модуль ' + (m[1] || '') + '. Запусти rr ещё раз или поставь его вручную.', 'Module ' + (m[1] || '') + ' is missing. Run rr again or install it.')],
  [/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/, (m, L) => L('Нет Python-пакета ' + m[1] + '. Добавь его в requirements.txt и запусти rr.', 'Python package ' + m[1] + ' is missing. Add it to requirements.txt and run rr.')],
  [/ECONNREFUSED[^\n]*?:(\d{2,5})|[Cc]onnection refused[^\n]*?(\d{4,5})?/, (m, L) => L('Программа не смогла подключиться' + (m[1] || m[2] ? ' к порту ' + (m[1] || m[2]) : '') + '. Обычно это незапущенная база данных.', 'Could not connect' + (m[1] || m[2] ? ' to port ' + (m[1] || m[2]) : '') + '. Usually the database is not running.')],
  [/KeyError: ['"]([A-Z][A-Z0-9_]{2,})['"]|(?:Missing|Undefined|required)[^\n]{0,30}env[^\n]{0,30}?\b([A-Z][A-Z0-9_]{2,})/i, (m, L) => L('Похоже, в .env нет переменной ' + (m[1] || m[2]) + '.', 'Looks like .env lacks ' + (m[1] || m[2]) + '.')],
  [/Unsupported engine|EBADENGINE|requires? (?:a peer of )?[Nn]ode(?:\.js)? (?:version )?([^\s,]+)/, (m, L) => L('Не подходит версия Node.js' + (m[1] ? ', нужна ' + m[1] : '') + '.', 'Wrong Node.js version' + (m[1] ? ', needs ' + m[1] : '') + '.')],
  [/ERESOLVE|unable to resolve dependency tree/, (m, L) => L('Зависимости требуют несовместимые версии. Попробуй npm install --legacy-peer-deps.', 'Dependencies conflict. Try npm install --legacy-peer-deps.')],
  [/digital envelope routines::unsupported/, (m, L) => L('Старый сборщик и новый Node.js. Нужен Node 16 или обновление webpack.', 'Old bundler with a new Node.js. Use Node 16 or update webpack.')],
  [/ENOSPC/, (m, L) => L('Закончилось место на диске или лимит наблюдения за файлами.', 'Disk is full or the file watch limit is reached.')],
  [/EACCES|EPERM|Permission denied/, (m, L) => L('Нет прав на файл или папку. Закрой программы, которые их держат.', 'No permission for a file or folder. Close programs using it.')],
  [/error NETSDK1045|does not support targeting \.NET (\S+)/, (m, L) => L('Установленный .NET SDK старше, чем нужно проекту.', 'The installed .NET SDK is older than the project needs.')],
  [/SyntaxError[^\n]*/, (m, L) => L('Ошибка в коде: ', 'Code error: ') + m[0].slice(0, 120)],
];
function explain(log, L) { for (const [re, f] of RULES) { const m = log.match(re); if (m) return f(m, L).replace(/\s+([.,])/g, '$1').replace(/ {2,}/g, ' '); } return ''; }
module.exports = { explain };
