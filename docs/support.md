# Support, compatibility, and recovery

## Support matrix

| Surface | Status |
|---------|--------|
| Chrome Manifest V3 | Release target and blocking test platform |
| Playwright bundled Chromium | Automated lifecycle, privacy, accessibility, performance, and packaged-artifact coverage |
| Firefox-compatible build | Portability evidence; store signing and publication are not release-blocking |
| Ordinary visible HTML text | Supported |
| Form controls, editable regions, code/preformatted text, hidden content, active selections | Intentionally excluded |
| English, Russian, Ukrainian, German, French, Spanish, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Hebrew, Polish, Romanian, Turkish, Italian, Kazakh, Latvian, Estonian, and Lithuanian Wiktionary definitions | Supported after a trusted 100 ms hover or explicit lookup; availability and coverage vary |

## Troubleshooting

If annotation fails, deactivate and reactivate the tab, then inspect the options-page integrity and error diagnostics. If online definitions fail, check the typed error before retrying; offline, timeout, throttling, response-size, origin, content-type, malformed-response, and parser-change failures have different remedies.

Report reproducible bugs at <https://github.com/algattik/SlavaTranslator/issues>. Include the extension version, Chrome version, selected edition, sanitized diagnostic export, and minimal reproduction. Do not post sensitive page content or security vulnerabilities in a public issue.

## Parser-change response

Wiktionary markup is community-edited and can change without a schema version. Scheduled live canaries detect likely drift, while captured fixtures keep releases deterministic. A parser break requires a reviewed code update, refreshed bounded fixtures where appropriate, the full quality gate, and a new extension release. Slava has no hosted parser and no remote kill switch.

## Local-index rollback

A bad stress or morphology index is not repaired remotely. Rebuild a new extension version from an accepted prior source snapshot and its recorded digest, run semantic/determinism/package tests, and publish that new version. Never replace packaged bytes in place or bypass digest verification.

## Release rollback

Retain the prior accepted ZIP, checksums, source revision, source-data digests, SBOM, license inventory, and quality report. If a release is defective, stop distribution where the store permits, restore the prior accepted source state, increment the version, rebuild reproducibly, rerun packaged smoke tests, and submit the replacement. Store publication and rollback are explicit maintainer actions.
