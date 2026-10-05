# Slava Russian Dictionary 0.1.0

This release replaces the removed Manifest V2 implementation with a project-owned Manifest V3 extension.

## User-visible behavior

- Adds Russian stress marks with verified packaged stress and morphology indexes.
- Retrieves definitions from an ordered selection of 21 Wiktionary editions: English, Russian, Ukrainian, German, French, Spanish, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Hebrew, Polish, Romanian, Turkish, Italian, Kazakh, Latvian, Estonian, and Lithuanian.
- Advances only on a missing page or missing Russian entry and labels results from later selected editions as fallback.
- Provides temporary tab activation, user-approved persistent site activation, reversible annotation, accessible definition dialogs, settings, permission revocation, and sanitized diagnostics.

## Privacy and security

- No page-load prefetch, synthetic-event requests, analytics, telemetry, Slava account, definition service, or persistent definition cache.
- Exact Wiktionary provider permissions and credential-free bounded requests.
- Text-only detached parsing, replay/concurrency controls, verified local indexes, package allowlisting, SBOM, dependency review, CodeQL, and pinned workflow actions.

## Release evidence

The release process retains the exact ZIP and checksum, source identity, local-data digests, reproducibility comparison, SBOM, provenance statement and GitHub attestation, license inventory, quality and package report, activation performance report, live-canary result, and packaged Chromium smoke evidence. The activation gate enforces a 500 ms p95 budget on calibrated renderer work after warmup and a 64 MiB heap-delta budget; wall-clock p50, p95, and warmup timings remain diagnostic because shared-runner scheduling is outside the extension's control.
