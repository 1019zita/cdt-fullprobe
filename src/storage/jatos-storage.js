(function (global) {
    'use strict';

    global.CLTStorageFactories = global.CLTStorageFactories || {};
    global.CLTStorageFactories.jatos = function createJatosStorage(deploymentMetadata) {
        let context = null;
        let queue = Promise.resolve();
        let firstWriteError = null;
        let readyPromise = null;

        function getReadyPromise() {
            if (readyPromise) return readyPromise;
            readyPromise = new Promise((resolve, reject) => {
                if (!global.jatos || typeof global.jatos.onLoad !== 'function') {
                    reject(new Error('jatos.js is unavailable'));
                    return;
                }
                global.jatos.onLoad(resolve);
            });
            return readyPromise;
        }

        function jatosIds() {
            if (typeof global.jatos.addJatosIds === 'function') return global.jatos.addJatosIds({});
            return {
                studyId: global.jatos.studyId,
                componentId: global.jatos.componentId,
                workerId: global.jatos.workerId,
                studyResultId: global.jatos.studyResultId,
                componentResultId: global.jatos.componentResultId
            };
        }

        function envelope(recordType, data) {
            const ids = jatosIds();
            return {
                record_type: recordType,
                participant_id: String(context.participant.subjectID),
                session_identifier: String(ids.studyResultId || global.jatos.studyResultId || ''),
                experiment_version: deploymentMetadata.experimentVersion,
                git_commit: deploymentMetadata.gitCommit,
                timestamp: new Date().toISOString(),
                ...ids,
                ...data
            };
        }

        function append(record) {
            const line = JSON.stringify(record) + '\n';
            queue = queue.then(() => global.jatos.appendResultData(line)).catch(error => {
                if (!firstWriteError) firstWriteError = error;
            });
            return queue;
        }

        async function flush() {
            await queue;
            if (firstWriteError) throw firstWriteError;
        }

        return {
            async initialize(initialContext) {
                await getReadyPromise();
                context = initialContext;
                if (typeof global.jatos.showBeforeUnloadWarning === 'function') global.jatos.showBeforeUnloadWarning(true);
                await append(envelope('session_start', {
                    debug_mode: Boolean(context.participant.debugMode),
                    rndSeed: context.participant.rndSeed
                }));
                await flush();
            },
            saveTrial(row) { return append(envelope('trial', row)); },
            saveCheckpoint(checkpoint) { return append(envelope('checkpoint', checkpoint)); },
            saveFinalResult(payload) {
                const trials = payload && Array.isArray(payload.trials) ? payload.trials : [];
                return append(envelope('final', {
                    trial_count: trials.length,
                    questionnaire: payload ? payload.questionnaire : undefined,
                    probe_plan_violations: payload ? payload.probePlanViolations : undefined,
                    low_accuracy_flag: payload ? Boolean(payload.lowAccuracyFlag) : undefined,
                    low_accuracy_block_count: payload ? payload.lowAccuracyBlockCount : undefined
                })).then(async () => {
                    await flush();
                    return { message: '数据已保存到 JATOS。' };
                });
            },
            async finishExperiment(status) {
                await flush();
                if (typeof global.jatos.showBeforeUnloadWarning === 'function') global.jatos.showBeforeUnloadWarning(false);
                const successful = !status || status.successful !== false;
                const message = status && status.message ? String(status.message).slice(0, 255) : '';
                if (typeof global.jatos.endStudyWithoutRedirect === 'function') {
                    await global.jatos.endStudyWithoutRedirect(successful, message);
                } else if (typeof global.jatos.endStudyAjax === 'function') {
                    await global.jatos.endStudyAjax(successful, message);
                } else {
                    throw new Error('JATOS end-study function is unavailable');
                }
                return { message: '' };
            }
        };
    };
})(window);
