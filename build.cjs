#!/usr/bin/env node
/* Build the standalone index.html from src/. Node is needed only to rebuild,
 * never to use the delivered app. No dependencies, no network.
 */
'use strict';
const fs = require('fs'), path = require('path');

const src = file => fs.readFileSync(path.join(__dirname, 'src', file), 'utf8').replace(/\n$/, '');

const parts = {
  '/*{{STYLES}}*/': src('styles.css'),
  '//{{CORE}}': src('core.js'),
  '//{{THREE_D}}': src('three-d.js'),
  '//{{MECHANICS}}': src('mechanics.js'),
  '//{{APP}}': src('app.js')
};

let html = src('shell.html');
for (const [token, body] of Object.entries(parts)) {
  if (!html.includes(token)) throw new Error('shell.html is missing the ' + token + ' placeholder.');
  html = html.replace(token, () => body);
}
html += '\n';

const out = path.join(__dirname, 'index.html');
fs.writeFileSync(out, html);
console.log('Wrote ' + path.relative(process.cwd(), out) + ' (' + Buffer.byteLength(html) + ' bytes)');
