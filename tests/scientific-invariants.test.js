'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'full_probe.js'), 'utf8');

assert.match(source, /setSizes:\s*\[4,\s*6\]/);
assert.match(source, /change:\s*\[0,\s*1\]/);
assert.match(source, /numBlocks:\s*4/);
assert.match(source, /numTrials:\s*35/);
assert.match(source, /nPerCond:\s*35/);
assert.match(source, /nPractice:\s*20/);
assert.match(source, /ITI:\s*500/);
assert.match(source, /stimulusDuration:\s*250/);
assert.match(source, /retentionInterval:\s*1000/);
assert.match(source, /experimentType:\s*'FullProbe'/);
assert.match(source, /trialData\.accuracy\s*=\s*\(trialData\.isChange\s*===\s*responseType\)\s*\?\s*1\s*:\s*0/);
assert.match(source, /let k = ss \* \(hitRate - faRate\)/);
assert.match(source, /filter\(c => !usedColors\.includes\(c\)\)/);
assert.match(source, /window\.CLTStorage\.saveTrial\(completedRow\)/);
assert.match(source, /window\.CLTStorage\.saveCheckpoint/);
assert.match(source, /window\.CLTStorage\.saveFinalResult/);
assert.match(source, /currentBlock < prefs\.numBlocks && !p\.debugMode/);

console.log('scientific-invariants.test.js: PASS');
