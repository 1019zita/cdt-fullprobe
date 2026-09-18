# AGENTS.md

- GitHub repository `1019zita/cdt-fullprobe` is the source of truth; MindProbe/JATOS is runtime and result collection only.
- Do not change conditions, trial/block counts, randomization, stimuli, timing, scoring, K, questionnaire, participant fields, or task flow without explicit researcher approval.
- Never commit tokens, passwords, private keys, participant data, XLSX files, JZIP results, or real `.env` files.
- Read `README.md`, `docs/MINDPROBE_DEPLOYMENT.md`, and `CHANGELOG.md` before deployment.
- Build JATOS assets only with `python scripts/build_study_assets.py`; do not edit `build/study-assets` manually.
- Before any MindProbe write, verify server, Study title/UUID, Component entry, target commit, and JZIP identity. API credentials come only from process environment variables.
- Use a migration branch; do not make unreviewed deployment changes directly on `main`.
