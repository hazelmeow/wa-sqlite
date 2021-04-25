// Copyright 2021 Roy T. Hashimoto. All Rights Reserved.
// @ts-ignore
import SQLiteModuleFactory from '../dist/wa-sqlite-async.mjs';
import { MemoryAsyncVFS } from '../test/MemoryAsyncVFS.js';
import * as SQLite from '../src/sqlite-api.js';

// This is the path to the local monaco-editor installed via devDependencies.
// This will need to be changed if using a package manager other than Yarn 2.
// The value can also reference an external CDN, e.g.
// https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.23.0/min/vs
const MONACO_VS = '/.yarn/unplugged/monaco-editor-npm-0.23.0-f10184dc03/node_modules/monaco-editor/dev/vs';

const DEFAULT_SQL = `
-- Optionally select statements to execute.
CREATE TABLE tbl (x PRIMARY KEY, y);
REPLACE INTO tbl VALUES ('foo', 6), ('bar', 7);
SELECT y * y FROM tbl WHERE x = 'bar';
`.trim();

const DB_NAME = "myDB";

(async function() {
  // Initialize SQLite and Monaco in parallel because both are slow.
  const [SQLiteModule, editor] = await Promise.all([SQLiteModuleFactory(), createEditor()]);
  const sqlite3 = SQLite.Factory(SQLiteModule);

  // Create and register a VFS.
  const vfs = new MemoryAsyncVFS();
  sqlite3.vfs_register(vfs, false);

  // Execute SQL on button click.
  document.getElementById('execute').addEventListener('click', async function() {
    // Get SQL from editor.
    const selection = editor.getSelection();
    const queries = selection.isEmpty() ?
      editor.getValue() :
      editor.getModel().getValueInRange(selection);

    // Open and close the database on every execution to test data persistence.
    const db = await sqlite3.open_v2(DB_NAME, undefined, vfs.name);
    const sql = SQLite.tag(sqlite3, db);

    const output = document.getElementById('output');
    while (output.firstChild) output.removeChild(output.lastChild);
    try {
      // Execute the SQL.
      const results = await sql`${queries}`;

      results.map(formatTable).forEach(table => output.append(table));
    } catch (e) {
      output.innerHTML = `<pre>${e.stack}</pre>`;
    } finally {
      // Make sure to close to avoid leaking resources.
      sqlite3.close(db);
    }
  });

  // Change the button text with selection.
  editor.onDidChangeCursorSelection(({selection}) => {
    document.getElementById('execute').textContent = selection.isEmpty() ?
      'Execute' :
      'Execute selection';
  });

  // Persist editor content across page loads.
  /** @type {*} */ let change = 0;
  editor.onDidChangeModelContent(function() {
    clearTimeout(change);
    change = setTimeout(function() {
      change = 0;
      localStorage.setItem('wa-sqlite demo', editor.getValue());
    }, 1000);
  });
  editor.setValue(localStorage.getItem('wa-sqlite demo') ?? DEFAULT_SQL);
})();

async function createEditor() {
  // Insert a script element to bootstrap the monaco loader.
  await new Promise(resolve => {
    const loader = document.createElement('script');
    loader.src = `${MONACO_VS}/loader.js`;
    loader.async = true;
    loader.addEventListener('load', resolve, { once: true });
    document.head.appendChild(loader);
  });

  // Load monaco itself.
  /** @type {any} */ const require = globalThis.require;
  require.config({ paths: { vs: MONACO_VS } });
  const monaco = await new Promise(resolve => {
    require(['vs/editor/editor.main'], resolve);
  });

  // Create editor.
  // https://microsoft.github.io/monaco-editor/api/modules/monaco.editor.html#create
  return monaco.editor.create(document.getElementById('editor-container'), {
    language: 'sql',
    minimap: { enabled: false },
    automaticLayout: true
  });
}

function formatTable({ columns, rows }) {
  const table = document.createElement('table');

  const thead = table.appendChild(document.createElement('thead'));
  thead.appendChild(formatRow(columns, 'th'));

  const tbody = table.appendChild(document.createElement('tbody'));
  for (const row of rows) {
    tbody.appendChild(formatRow(row));
  }

  return table;
}

function formatRow(data, tag = 'td') {
  const row = document.createElement('tr');
  for (const value of data) {
    const cell = row.appendChild(document.createElement(tag));
    cell.textContent = value.toString();
  }
  return row;
}