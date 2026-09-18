# Full-Probe MindProbe/JATOS Deployment

## Boundaries

GitHub is the source of truth. MindProbe/JATOS is the runtime and result store. Participant results and credentials never enter Git. The source page keeps the unconfigured Supabase-compatible/local-XLSX mode; the generated JATOS entry uses `jatos.js` and append-only result data.

## Preflight

```powershell
node --check full_probe.js
node --check src/storage/index.js
node --check src/storage/supabase-storage.js
node --check src/storage/jatos-storage.js
node --test tests/storage-adapters.test.js tests/scientific-invariants.test.js
python -m unittest tests/test_jatos_scripts.py
python -m compileall -q scripts
python scripts/build_study_assets.py
```

Check `build/study-assets/build-info.json`, `MANIFEST.sha256`, entry `full_probe.html`, local SheetJS, and absence of Supabase code, secrets, `.env`, and results.

## Storage behavior

JATOS records newline-delimited JSON: `session_start`, one `trial` per completed formal response, one `checkpoint` per completed block, and one `final`. Trial writes are queued without changing the 50 ms task transition. Finalization flushes the queue before ending the Study. Practice stays browser-only. Refresh/early exit may preserve partial records but never resumes the task.

Trial records contain the original participant fields, including name, phone, and masked ID card. `tired` and `attention` are collected after all trials and are stored in the final record questionnaire payload; the local XLSX retains the original per-row representation.

## Local acceptance and official archive

Create a new local JATOS 3.11.1 Study named `CDT Full-Probe`, one Component with entry `full_probe.html`, and upload `build/study-assets`. Verify normal completion, early exit, exact record counts, XLSX generation, console/network, and result state. Export the Study with JATOS itself and import it into a second clean local instance. Do not hand-build JZIP metadata.

## MindProbe

Credentials are read only from `JATOS_BASE_URL` and `JATOS_API_TOKEN`.

```powershell
python scripts/jatos_healthcheck.py
python scripts/jatos_deploy.py import --jzip <OFFICIAL_JZIP> --expected-title "CDT Full-Probe"
```

After checking the dry-run title, UUID, target server, commit, Component, and Batch, an explicitly authorized deployment adds `--apply`. Complete a production smoke test and record Study/Component/Batch IDs, UUIDs, deployment time, commit, link type, and non-secret access link. Never delete smoke or participant results without separate approval.
