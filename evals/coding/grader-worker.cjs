// Executed in a separate Node permission-restricted process. VM timeout also bounds each call.
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const context = vm.createContext(
  { module: { exports: {} } },
  { codeGeneration: { strings: false, wasm: false } },
);
try {
  vm.runInContext(payload.source, context, { timeout: 1000 });
  let passed = 0;
  for (const check of payload.checks) {
    context.inputJSON = JSON.stringify(check.input);
    const actual = vm.runInContext(
      'var evalInput = JSON.parse(inputJSON); JSON.stringify(module.exports(evalInput))',
      context,
      { timeout: 1000 },
    );
    assert.equal(
      vm.runInContext('JSON.stringify(evalInput)', context, { timeout: 1000 }),
      context.inputJSON,
    );
    assert.deepEqual(JSON.parse(actual), check.output);
    passed++;
  }
  process.stdout.write(JSON.stringify({ passed: true, checks: passed }));
} catch {
  process.stdout.write(JSON.stringify({ passed: false, checks: payload.checks.length }));
}
