#!/usr/bin/env node
'use strict';
/* Minimal runner so the suite needs nothing but Node. */
const assert = require('assert');

let passed = 0, failed = 0;
const failures = [];
let suite = '';

function test(name, fn) {
  try { fn(); passed++; process.stdout.write('.'); }
  catch (error) { failed++; failures.push({ suite, name, error }); process.stdout.write('x'); }
}

const suites = ['./mechanics.test.cjs', './core.test.cjs', './bundle.test.cjs'];
for (const file of suites) {
  suite = file.replace('./', '').replace('.test.cjs', '');
  process.stdout.write('\n' + suite.padEnd(10) + ' ');
  require(file)({ test, assert });
}

console.log('\n');
for (const f of failures) {
  console.log('FAIL  ' + f.suite + ' › ' + f.name);
  console.log('      ' + String(f.error.message).split('\n').join('\n      ') + '\n');
}
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
