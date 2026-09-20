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

    assert.deepEqual(records.map(record => record.record_type), ['session_start', 'trial', 'checkpoint', 'final', 'csv_upload_attempt', 'csv_upload_status']);

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





async function testJatosCsvUpload() {

    const appended = [];

    const uploadedFiles = [];

    const window = {

        CLTStorageFactories: {},

        jatos: {

            onLoad(callback) { callback(); },

            addJatosIds(target) {

                return Object.assign(target, {

                    studyId: 28539, componentId: 48905, workerId: 1202069,

                    studyResultId: 1248754, componentResultId: 1736418,

                    studyCode: 'ROzRWapgAbE', studyTitle: 'CDT Full-Probe',

                    batchId: 32325, batchTitle: 'Default',

                    componentPos: 1, componentTitle: 'CDT Full-Probe Experiment',

                    groupResultId: null, groupMemberId: null

                });

            },

            appendResultData(value) { appended.push(value); return Promise.resolve(); },

            uploadResultFile(blob, filename) {

                uploadedFiles.push({ blob, filename });

                return Promise.resolve();

            },

            showBeforeUnloadWarning() {},

            endStudyWithoutRedirect() { return Promise.resolve(); }

        }

    };

    const context = vm.createContext({ window, console, Promise, Date, JSON, String, Boolean, Error, Set, Array, Object });

    load('src/storage/jatos-storage.js', context);

    const adapter = window.CLTStorageFactories.jatos({

        experimentVersion: '1.0.0-jatos.1', gitCommit: '8b35ae26'

    });

    await adapter.initialize({ participant: { subjectID: '0199997000', rndSeed: 999, debugMode: true } });

    

    // Trial 1 (accuracy = 1)

    const t1 = {

        subjectID: '0199997000', block: 1, trial: 1, setSize: 6, isChange: 0,

        experimentType: 'FullProbe', rt: 0.34, response: 0, correctResponse: 0, accuracy: 1,

        itemLocs: [[414, 527], [173, 557]], itemColors: [6, 3], extraPropT1: 'special1'

    };

    // Trial 2 (accuracy = 0, with extra dynamic field)

    const t2 = {

        subjectID: '0199997000', block: 1, trial: 2, setSize: 6, isChange: 1,

        experimentType: 'FullProbe', rt: 0.15, response: 0, correctResponse: 1, accuracy: 0,

        itemLocs: [[425, 506], [171, 561]], itemColors: [8, 1], extraPropT2: 'special2'

    };



    await adapter.saveTrial(t1);

    await adapter.saveTrial(t2);

    await adapter.saveFinalResult({

        trials: [t1, t2],

        questionnaire: { tired: 3, attention: 5 },

        probePlanViolations: 0,

        lowAccuracyFlag: false

    });



    assert.equal(uploadedFiles.length, 1, 'uploadResultFile should be called once');

    const { blob, filename } = uploadedFiles[0];

    assert.equal(filename, 'participant_0199997000_1248754.csv');

    

    const csvText = typeof blob === 'string' ? blob : blob.toString();

    assert.ok(csvText.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');

    

    const lines = csvText.replace(/^\uFEFF/, '').trim().split('\r\n');

    assert.equal(lines.length, 3, 'CSV must have 1 header line and 2 data lines for 2 trials');

    

    const headers = lines[0].split(',');

    assert.ok(headers.includes('participant_id'));

    assert.ok(headers.includes('subjectID'));

    assert.ok(headers.includes('session_identifier'));

    assert.ok(headers.includes('studyId'));

    assert.ok(headers.includes('workerId'));

    assert.ok(headers.includes('extraPropT1'), 'Must include union of keys from t1');

    assert.ok(headers.includes('extraPropT2'), 'Must include union of keys from t2');

    assert.ok(headers.includes('tired'), 'Must include post-task questionnaire field tired');

    assert.ok(headers.includes('attention'), 'Must include post-task questionnaire field attention');

    assert.ok(headers.includes('probe_plan_violations'), 'Must include session summary probe_plan_violations');

    assert.ok(headers.includes('low_accuracy_flag'), 'Must include session summary low_accuracy_flag');



    // Check data row values

    assert.ok(lines[1].includes(',3,'), 'Must contain tired value 3');
    assert.ok(lines[1].includes(',5,'), 'Must contain attention value 5');



    // Test error resilience when uploadResultFile rejects

    window.jatos.uploadResultFile = () => Promise.reject(new Error('Network drop'));

    // Should not throw and finish gracefully

    await adapter.saveFinalResult({ trials: [t1, t2] });

    await adapter.finishExperiment({ successful: true });

}



async function main() {

    await testJatosCsvUpload();

    await testJatosAdapter();

    await testSupabaseAdapter();

    await testUnconfiguredSupabasePreservesLocalOnlyMode();

    console.log('storage-adapters.test.js: PASS');

}



main().catch(error => { console.error(error); process.exitCode = 1; });

