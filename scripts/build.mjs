// Builds one unpacked folder and one store-ready ZIP per browser:
//   dist/chrome/   dist/lexiflip-chrome-<version>.zip
//   dist/edge/     dist/lexiflip-edge-<version>.zip
//   dist/firefox/  dist/lexiflip-firefox-<version>.zip
// Usage: node scripts/build.mjs [chrome|edge|firefox ...]   (no args = all three)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { createZip } from './util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Never change this after the first AMO upload: Firefox identifies the add-on by it.
const GECKO_ID = '{b11a9c72-8daf-457d-8be0-8479260546b4}';

const ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 96: 'icons/icon-96.png', 128: 'icons/icon-128.png' };

// Order matters: core defines LX, ui.js needs extract/styles, widget.js mounts everything.
const CONTENT_SCRIPTS = ['shared/core.js', 'shared/extract.js', 'shared/styles.js', 'shared/ui.js', 'content/widget.js'];

// Mozilla's pdf.js (Apache-2.0), copied unmodified from node_modules for the PDF reader.
const VENDOR = {
  'vendor/pdf.min.mjs': 'node_modules/pdfjs-dist/legacy/build/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs': 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  'vendor/pdfjs-LICENSE': 'node_modules/pdfjs-dist/LICENSE',
};

function manifest(target) {
  const base = {
    manifest_version: 3,
    name: 'Lexiflip',
    short_name: 'Lexiflip',
    version: pkg.version,
    description: 'Flashcard kosakata dari artikel, dokumen, atau kata yang kamu tambahkan sendiri, selalu siap di pojok layar.',
    icons: ICONS,
    action: {
      default_title: 'Lexiflip',
      default_popup: 'popup/popup.html',
      default_icon: { 16: ICONS[16], 32: ICONS[32], 48: ICONS[48] },
    },
    // scripting + the http(s) host permissions: re-inject the widget into tabs that were
    // already open when Lexiflip was installed or updated (see injectIntoOpenTabs).
    permissions: ['storage', 'contextMenus', 'scripting'],
    host_permissions: [
      'https://api.dictionaryapi.dev/*',
      'https://api.mymemory.translated.net/*',
      'http://*/*',
      'https://*/*',
    ],
    content_scripts: [{
      matches: ['http://*/*', 'https://*/*'],
      js: CONTENT_SCRIPTS,
      run_at: 'document_idle',
    }],
    commands: {
      'toggle-widget': {
        suggested_key: { default: 'Alt+Shift+K' },
        description: 'Tampilkan atau sembunyikan Lexiflip',
      },
    },
  };

  if (target === 'firefox') {
    return {
      ...base,
      background: { scripts: ['background.js'] },
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          strict_min_version: '140.0',
          // Words from the page are sent to the dictionary and translation services.
          data_collection_permissions: { required: ['websiteContent'] },
        },
      },
    };
  }
  return { ...base, minimum_chrome_version: '116', background: { service_worker: 'background.js' } };
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function check(target, man, outDir) {
  const referenced = [
    ...Object.values(man.icons),
    ...man.content_scripts.flatMap((c) => c.js),
    ...(man.background.scripts || [man.background.service_worker]),
    man.action.default_popup,
    ...Object.keys(VENDOR),
  ];
  // Scripts referenced from the extension pages.
  for (const page of [man.action.default_popup, 'app/app.html']) {
    const html = readFileSync(join(outDir, page), 'utf8');
    for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) referenced.push(join(dirname(page), src));
  }
  for (const file of referenced) {
    if (!existsSync(join(outDir, file))) throw new Error(`[${target}] manifest references missing file: ${file}`);
  }
  // Every script is a classic (non-module) script, so vm.Script is a full syntax check.
  for (const file of listFiles(outDir).filter((f) => f.endsWith('.js'))) {
    try {
      new Script(readFileSync(file, 'utf8'), { filename: relative(outDir, file) });
    } catch (err) {
      throw new Error(`[${target}] syntax error in ${relative(outDir, file)}: ${err.message}`);
    }
  }
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'edge', 'firefox'];
for (const target of targets) {
  if (!['chrome', 'edge', 'firefox'].includes(target)) throw new Error(`Unknown target: ${target}`);
  const outDir = join(DIST, target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(SRC, outDir, { recursive: true });
  for (const [to, from] of Object.entries(VENDOR)) {
    if (!existsSync(join(ROOT, from))) throw new Error(`Missing ${from}. Run "npm install" first.`);
    mkdirSync(dirname(join(outDir, to)), { recursive: true });
    cpSync(join(ROOT, from), join(outDir, to));
  }

  const man = manifest(target);
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(man, null, 2)}\n`);
  check(target, man, outDir);

  const entries = listFiles(outDir)
    .map((file) => [relative(outDir, file).replace(/\\/g, '/'), readFileSync(file)])
    .sort(([a], [b]) => a.localeCompare(b));
  const zipPath = join(DIST, `lexiflip-${target}-${pkg.version}.zip`);
  writeFileSync(zipPath, createZip(entries));
  console.log(`${target.padEnd(8)} dist/${target}/  ->  ${relative(ROOT, zipPath).replace(/\\/g, '/')} (${entries.length} files)`);
}
