'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function load(relative, context, transform = source => source) {
    const source = transform(fs.readFileSync(path.join(root, relative), 'utf8'));
    vm.runInContext(source, context, { filename: relative });
}

async function testJatosAdapter() {
    const appended = [];
    const unloadWarnings = [];
    const ended = [];
    const window = {
        CLTStorageFactories: {},
        jatos: {
            onLoad(callback) { callback(); },
            addJatosIds(target) {
                return Object.assign(target, {
                    studyId: 10, componentId: 20, workerId: 30,
                    studyResultId: 40, componentResultId: 50
                });
            },
            appendResultData(value) { appended.push(value); return Promise.resolve(); },
            showBeforeUnloadWarning(value) { unloadWarnings.push(value); },
            endStudyWithoutRedirect(successful, message) {
                ended.push({ successful, message });
                return Promise.resolve();
            }
        }
    };
    const context = vm.createContext({ window, console, Promise, Date, JSON, String, Boolean, Error });
    load('src/storage/jatos-storage.js', context);
    const adapter = window.CLTStorageFactories.jatos({
        experimentVersion: '1.0.0-jatos-m.1', gitCommit: 'abc123'
    });
    await adapter.initialize({ participant: { subjectID: '00123', rndSeed: 123, debugMode: false } });
    const trial = {
        subjectID: '00123', block: 1, trial: 1, setSize: 4, isChange: 1,
        experimentType: 'CLT', rt: 0.5, response: 2, responseKey: 'right',
        accuracy: 1, correctResponse: 2, rndSeed: 123
    };
    await adapter.saveTrial(trial);
    await adapter.saveCheckpoint({ block: 1, completedTrials: 35 });
    await adapter.saveFinalResult({ trials: [trial], questionnaire: { tired: 2, attention: 4 }, probePlanViolations: 0 });
    await adapter.finishExperiment({ successful: true, message: 'CLT mouse completed' });
    const records = appended.map(line => {
        assert.ok(line.endsWith('\n'));
        return JSON.parse(line);
    });
    assert.deepEqual(records.map(record => record.record_type), ['session_start', 'trial', 'checkpoint', 'final']);
    for (const [key, value] of Object.entries(trial)) {
        assert.deepEqual(records[1][key], value, `JATOS trial field changed: ${key}`);
    }
    assert.equal(records[1].participant_id, '00123');
    assert.equal(records[1].experiment_version, '1.0.0-jatos-m.1');
    assert.deepEqual(records[3].questionnaire, { tired: 2, attention: 4 });
    assert.deepEqual(unloadWarnings, [true, false]);
    assert.deepEqual(ended, [{ successful: true, message: 'CLT mouse completed' }]);
}

async function testSupabaseAdapter() {
    const inserts = [];
    const client = {
        from(table) {
            assert.equal(table, 'vwm_data');
            return { async insert(rows) { inserts.push(rows); return { error: null }; } };
        }
    };
    const window = {
        CLTStorageFactories: {},
        supabase: { createClient() { return client; } }
    };
    const context = vm.createContext({ window, console, Promise, Error });
    load('src/storage/supabase-storage.js', context, source => source
        .replace('YOUR_SUPABASE_URL_HERE', 'https://example.supabase.co')
        .replace('YOUR_SUPABASE_PUBLISHABLE_KEY_HERE', 'test-publishable-key'));
    const adapter = window.CLTStorageFactories.supabase();
    await adapter.initialize();
    const rows = [{ subjectID: '0001', block: 1, trial: 1, setSize: 4, responseKey: 'left' }];
    await adapter.saveTrial(rows[0]);
    await adapter.saveCheckpoint({ block: 1 });
    await adapter.saveFinalResult({ trials: rows });
    assert.deepEqual(inserts, [rows]);
}

async function testUnconfiguredSupabasePreservesLocalOnlyMode() {
    const window = { CLTStorageFactories: {} };
    const context = vm.createContext({ window, console, Promise, Error });
    load('src/storage/supabase-storage.js', context);
    const adapter = window.CLTStorageFactories.supabase();
    await adapter.initialize();
    const result = await adapter.saveFinalResult({ trials: [{ subjectID: '0' }] });
    assert.match(result.message, /未配置服务器上传/);
}

async function main() {
    await testJatosAdapter();
    await testSupabaseAdapter();
    await testUnconfiguredSupabasePreservesLocalOnlyMode();
    console.log('storage-adapters.test.js: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
