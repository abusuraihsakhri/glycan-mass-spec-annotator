# Glycan Mass Spec Annotator

Browser-based candidate composition matching for glycan mass spectrometry, alongside the repository's existing Python audit CLI and API.

## What the browser application does

- Reads m/z peak lists from pasted values or CSV/TSV files (up to 5,000 peaks / 1 MB).
- Enumerates candidate compositions using user-defined maximum Hex, HexNAc, Fuc, NeuAc and NeuGc residue counts (up to 50,000 combinations).
- Calculates monoisotopic masses for free/released, **underivatized** glycans, with terminal H₂O included.
- Models protonated, deprotonated and singly sodiated ions, charge magnitude 1–5 for the proton modes.
- Matches theoretical m/z to observed peaks within a user-selected ppm tolerance; exports candidate matches as CSV.
- Works locally without third-party JavaScript dependencies, accounts, external APIs or data uploads.

**Scientific limitations:** A composition match is **not** a structure identification. Structural isomers, cross-ring/glycosidic MS/MS fragment assignment, isotope envelopes, derivatization, isotopic labeling, adduct mixtures and biochemical constraints are not calculated. The browser application reports *candidate compositions*, not identification confidence or clinical interpretations.

Theoretical neutral mass is calculated as the sum of monosaccharide **residue** masses plus 18.010564684 Da (H₂O). Monoisotopic masses and adduct conventions are documented in `web/annotator.mjs`.

## Run the browser application

Serve the `web` directory as static files:

```bash
python -m http.server 8080 --directory web
```

Open `http://localhost:8080`. Choose **Load example** to see a matching peak, then paste or upload your own peak list. Files are processed entirely inside the browser tab. No browser-Python runtime is needed.

GitHub Pages deployment is defined in `.github/workflows/pages.yml`. Once the repository's Pages environment is enabled and the deployment succeeds, the app can be opened from the verified Pages URL.

## Existing Python workflows

There are two distinct **legacy threshold-audit** pipelines. They perform generic input checks and status classification, **not** glycan structural analysis or MS/MS fragmentation:

- `cli.py`: Pydantic-validated task audits and HMAC-chained in-memory audit logs, plus CSV batch and FastAPI.
- `glyco_mind.cli`: a separate threshold-audit CLI and API with a different output schema.
- `enrichment.py`: generic threshold evaluations grouped under glycomics-related labels. These do not implement the biological analyses implied by their names.

Install Python 3.9+:

```bash
python -m pip install -e ".[server,test]"
export AUDIT_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
python cli.py audit
python cli.py batch --input sample.csv --output results.csv
python cli.py serve --host 127.0.0.1 --port 8000
```

The FastAPI endpoints include `GET /health`, `POST /api/audit` and `POST /api/chat`; `GET /metrics` reports process-local counts. The API is not suitable for direct internet exposure without application-layer authentication and deployment-specific protections. The audit-log endpoint is disabled by default; set a separate `AUDIT_ADMIN_TOKEN` and send it in `X-Audit-Token` to enable authorized log reads. Docker Compose binds port 8000 to localhost.

A separate CLI is installed as `glycan-mass-spec-annotator` (see `glyco_mind/cli.py`). Run `glycan-mass-spec-annotator --help` for its commands. It is **not** the browser mass-composition annotator.

For Docker Compose, set a unique secret in your environment before launching:

```bash
export AUDIT_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
docker compose up --build
```

No production audit secret is stored in the repository. The in-memory HMAC ledger is not persistent across restarts, and the PHI regex checks cannot establish HIPAA compliance.

## Tests

```bash
python -m pytest -q
node --test web/annotator.test.mjs
node --check web/app.mjs
```

CI covers Python 3.9–3.13 and Node.js 22. No external mass-spectrometry reference data or validated experimental peak library is bundled.

## Technology, privacy and compatibility

The browser application uses HTML, CSS and modern JavaScript modules. It is intended for up-to-date desktop and mobile browsers that support ES modules and the File API. Files are not uploaded and neither inputs nor results are persisted. CSV exports are downloaded locally. The separate backend uses Python, Pydantic, FastAPI and Uvicorn.

## License

MIT — see [LICENSE](LICENSE).
