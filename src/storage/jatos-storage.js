(function (global) {
    'use strict';

    global.CLTStorageFactories = global.CLTStorageFactories || {};
    global.CLTStorageFactories.jatos = function createJatosStorage(deploymentMetadata) {
        let context = null;
        let queue = Promise.resolve();
        let firstWriteError = null;
        let readyPromise = null;
        const recordedTrials = [];

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
                participant_id: String(context ? context.participant.subjectID : ''),
                session_identifier: String(ids.studyResultId || global.jatos.studyResultId || ''),
                experiment_version: deploymentMetadata.experimentVersion,
                git_commit: deploymentMetadata.gitCommit,
                timestamp: new Date().toISOString(),
                ...ids,
                ...data
            };
        }

        function formatCsvCell(val) {
            if (val === undefined || val === null) return '';
            let str = (typeof val === 'object') ? JSON.stringify(val) : String(val);
            if (str.indexOf('"') !== -1 || str.indexOf(',') !== -1 || str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        function buildTrialsCSV(trials, sessionSummary) {
            if (!trials || trials.length === 0) return '';
            const priorityColumns = [
                'participant_id', 'subjectID', 'session_identifier',
                'experiment_version', 'git_commit', 'timestamp', 'debug_mode', 'rndSeed',
                'studyCode', 'studyId', 'studyTitle', 'batchId', 'batchTitle',
                'componentId', 'componentPos', 'componentTitle',
                'workerId', 'studyResultId', 'componentResultId',
                'groupResultId', 'groupMemberId',
                'block', 'trial', 'setSize', 'isChange', 'experimentType',
                'rt', 'response', 'correctResponse', 'accuracy'
            ];

            const allKeysSet = new Set();
            const summaryObj = (sessionSummary && typeof sessionSummary === 'object') ? sessionSummary : {};
            const summaryKeys = Object.keys(summaryObj);
            for (const t of trials) {
                for (const k of Object.keys(t)) {
                    if (k !== 'record_type') allKeysSet.add(k);
                }
            }
            for (const sk of summaryKeys) {
                allKeysSet.add(sk);
            }
            const remainingKeys = Array.from(allKeysSet).filter(k => !priorityColumns.includes(k));
            const columns = priorityColumns.concat(remainingKeys);

            const lines = [columns.join(',')];
            for (const t of trials) {
                const mergedTrial = Object.assign({}, t, summaryObj);
                lines.push(columns.map(col => formatCsvCell(mergedTrial[col])).join(','));
            }
            return '\uFEFF' + lines.join('\r\n') + '\r\n';
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
            saveTrial(row) {
                const env = envelope('trial', row);
                recordedTrials.push(env);
                return append(env);
            },
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
                    const partId = String((context && context.participant && context.participant.subjectID) || (recordedTrials[0] && recordedTrials[0].participant_id) || 'unknown');
                    const sessId = String((recordedTrials[0] && recordedTrials[0].session_identifier) || global.jatos.studyResultId || '0');
                    const filename = `participant_${partId}_${sessId}.csv`;

                    const hasUploadFn = typeof global.jatos.uploadResultFile === 'function';
                    await append(envelope('csv_upload_attempt', {
                        filename: filename,
                        has_upload_fn: hasUploadFn,
                        recorded_trials_count: recordedTrials.length
                    }));

                    if (hasUploadFn && recordedTrials.length > 0) {
                        try {
                            const sessionSummary = {};
                            if (payload && typeof payload === 'object') {
                                if (payload.questionnaire && typeof payload.questionnaire === 'object') {
                                    Object.assign(sessionSummary, payload.questionnaire);
                                }
                                if (payload.probePlanViolations !== undefined) sessionSummary.probe_plan_violations = payload.probePlanViolations;
                                if (payload.lowAccuracyFlag !== undefined) sessionSummary.low_accuracy_flag = Boolean(payload.lowAccuracyFlag);
                                if (payload.lowAccuracyBlockCount !== undefined) sessionSummary.low_accuracy_block_count = payload.lowAccuracyBlockCount;
                            }

                            const csvContent = buildTrialsCSV(recordedTrials, sessionSummary);
                            const blob = (typeof global.Blob === 'function')
                                ? new global.Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                                : csvContent;
                            await global.jatos.uploadResultFile(blob, filename);
                            await append(envelope('csv_upload_status', {
                                success: true,
                                filename: filename
                            }));
                        } catch (uploadError) {
                            const errMsg = (uploadError && (uploadError.message || uploadError.toString())) || 'unknown error';
                            await append(envelope('csv_upload_status', {
                                success: false,
                                filename: filename,
                                error: errMsg
                            }));
                            if (typeof global.console !== 'undefined' && typeof global.console.warn === 'function') {
                                global.console.warn('JATOS uploadResultFile warning (non-blocking):', uploadError);
                            }
                        }
                    } else if (!hasUploadFn) {
                        await append(envelope('csv_upload_status', {
                            success: false,
                            filename: filename,
                            error: 'global.jatos.uploadResultFile is not a function'
                        }));
                    }
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
