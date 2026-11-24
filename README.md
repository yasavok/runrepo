# runrepo

Run any project with one command. `rr` works out what the project is, shows what is missing, asks, fixes it and starts it.

[По-русски](README.ru.md)

```
$ rr

shop  Node.js, next
  ✓ node 24.18.0
  + dependencies  not installed
                → npm install
  + .env          missing, fill in later: STRIPE_KEY
                → create .env from .env.example
  + port 3000     busy: python (15624)
                → use port 3001
  ! PostgreSQL    no answer on port 5432
  ▶ npm run dev

Fix and run? [Y/n]
```

## Install

Needs Node.js 20+. No dependencies.

```
git clone https://github.com/yasavok/runrepo
cd runrepo
npm link
```

Then go to any project and type `rr`. If `rr` is already taken on your system, use `runrepo`.

## What it checks

| Check | What happens |
| --- | --- |
| Language and version | compares with `engines`, `.nvmrc`, `requires-python`, `go.mod`, target framework |
| Dependencies | installs with the package manager the project uses |
| `.env` | creates it from the example, lists missing keys |
| Port | names the program that holds it, takes the next free port if the project allows |
| Database | finds local addresses in `.env`, starts the service from `compose` if it is there |

Knows Node.js, Python, .NET, Go, Rust, Java, PHP, Ruby, Docker Compose and plain HTML. Finds `frontend` and `backend` folders and runs them together.

If the project crashes, `rr` says why in plain words.

## Options

```
rr [folder]
  -c, --check       only check, change nothing
  -y, --yes         do not ask
  --only name       run one part of the project
  --no-scripts      install npm dependencies without their scripts
  --no-open         do not open the browser
  --json            machine-readable check result
  --lang ru|en      language
```

## Safety

- Nothing changes before you agree. `--check` never changes anything.
- It never kills other programs and never overwrites an existing `.env`.
- Values from `.env` are not printed, only key names.
- Installing and running executes the project's code, just as it would by hand. Do not run projects you do not trust.

## Status

Early. Tests run on Windows, Linux and macOS. Node.js, Python, Go, Rust and .NET are started for real in tests. Java, PHP, Ruby and Docker are detected but not yet started in tests. Detection was tried on 53 popular repositories.

If `rr` did not understand your project, [open an issue](https://github.com/yasavok/runrepo/issues/new/choose).

## License

[MIT](LICENSE)
