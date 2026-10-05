<!-- markdownlint-disable-file -->
# RPI Changes: Slava Russian Dictionary rearchitecture

## Metadata

* Task ID: `SLAVA-MV3-REARCH-001`
* Related plan: [.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md](../../plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md)
* Implementation date: 2026-10-03

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: `P01` through `P07`
* All remaining active-plan markers: None
* Status basis: The refined accent rendering, `ё` restoration, capitalization preservation, selection-gesture protection, regenerated indexes, and complete release evidence pass.

## Execution Summary

The approved Manifest V3 architecture and Kaikki remediation are complete. The refinement batch uses a face-only toolbar icon, bounds definition concurrency, removes definition-free grammatical form pages, positions accents independently on tracked text, restores canonical `ё`, preserves source capitalization, protects drag selection from popup activation, preserves temporary same-origin activation, and separates stress and definition preferences.

## Completed Work

### Established the locked Manifest V3 workspace

* Related phase or task: `P01-T01`
* Files:
  * [package.json](../../../package.json)
  * [package-lock.json](../../../package-lock.json)
  * [wxt.config.ts](../../../wxt.config.ts)
  * [tsconfig.json](../../../tsconfig.json)
  * [eslint.config.js](../../../eslint.config.js)
  * [vitest.config.ts](../../../vitest.config.ts)
  * [playwright.config.ts](../../../playwright.config.ts)
  * [entrypoints](../../../entrypoints)
  * [src/config/wiktionary-hosts.ts](../../../src/config/wiktionary-hosts.ts)
  * [tests/unit/manifest-policy.test.ts](../../../tests/unit/manifest-policy.test.ts)
* Behavior or functionality changed: The repository now builds a project-owned WXT extension with strict TypeScript, Chrome MV3 background/popup/options output, a permission-neutral unlisted page-integration script, a Firefox-compatible build, exact Wiktionary host permissions, and automated manifest-policy enforcement. Dependencies are locked and audit clean.
* Validation: Passed `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build:firefox`, and `npm audit --audit-level=high`.

### Defined versioned local and remote runtime contracts

* Related phase or task: `P01-T02`
* Files:
  * [src/contracts](../../../src/contracts)
  * [src/domain/normalize-lemma.ts](../../../src/domain/normalize-lemma.ts)
  * [data/schema](../../../data/schema)
  * [tests/unit/contracts.test.ts](../../../tests/unit/contracts.test.ts)
* Behavior or functionality changed: Local stress/morphology results, background messages, definition requests/results/errors, fixture metadata, and data quality reports now have explicit versioned TypeScript and JSON contracts. Remote lemmas are normalized and rejected when empty, overlong, controlled, multi-line, non-Cyrillic, or multi-token. The four editions map to one authoritative exact-origin list, and quality reports enforce balanced record flow.
* Validation: Passed formatting, strict type-check, lint, Chrome MV3 build, manifest policy, and 18 unit tests.

### Verified exact-host Chromium behavior and captured definition fixtures

* Related phase or task: `P01-T03`
* Files:
  * [tests/e2e/fixtures.ts](../../../tests/e2e/fixtures.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
  * [tests/fixtures/mediawiki](../../../tests/fixtures/mediawiki)
  * [tests/unit/definition-fixtures.test.ts](../../../tests/unit/definition-fixtures.test.ts)
  * [tools/capture-mediawiki-fixtures.mjs](../../../tools/capture-mediawiki-fixtures.mjs)
* Behavior or functionality changed: Playwright now loads the unpacked MV3 extension in bundled Chromium, proves exact four-origin permissions, stops and restarts the extension worker, and verifies one bounded Action API GET per edition with an explicit `Api-User-Agent`. Browser-generated `OPTIONS` requests are accounted separately. Attributed real fixtures cover all four editions and a German missing page; deterministic synthetic fixtures cover redirect, malformed, hostile, oversized, no-Russian-entry, timeout, abort, wrong-origin, and wrong-content-type behavior.
* Validation: Passed formatting, strict type-check, lint, 24 unit tests, two deterministic Chromium extension tests, and six live Chromium tests across English, French, German, and Russian Wiktionary.

### Pinned and verified local-index source acquisition

* Related phase or task: `P02-T01`
* Files:
  * [data/config/index-sources.json](../../../data/config/index-sources.json)
  * [data/config/index-policy.json](../../../data/config/index-policy.json)
  * [data/generated/source-provenance.json](../../../data/generated/source-provenance.json)
  * [tools/acquire-index-sources.mjs](../../../tools/acquire-index-sources.mjs)
  * [tests/unit/source-provenance.test.ts](../../../tests/unit/source-provenance.test.ts)
* Behavior or functionality changed: Index acquisition now accepts only the reviewed pinned stress FSA, its MIT license, and the dated English Kaikki Russian snapshot. It validates HTTPS, safe cache names, revision metadata, expected byte lengths, ETags where available, and SHA-256 before publishing files. The deterministic provenance manifest records source, policy, and acquisition-tool digests. The field policy permits only morphology fields and forbids packaged definitions.
* Validation: Acquired and verified all three artifacts, including the 944,699,204-byte morphology snapshot; two isolated provenance runs produced byte-identical output; formatting, strict type-check, lint, Chrome MV3 build, and 26 unit tests passed.

### Generated the packaged stress index with explicit conflict evidence

* Related phase or task: `P02-T02`
* Files:
  * [public/indexes/stress](../../../public/indexes/stress)
  * [public/notices/russian-stress-marker.LICENSE.txt](../../../public/notices/russian-stress-marker.LICENSE.txt)
  * [src/indexes/stress-fsa.ts](../../../src/indexes/stress-fsa.ts)
  * [tools/build-stress-index.ts](../../../tools/build-stress-index.ts)
  * [data/generated/stress-report.json](../../../data/generated/stress-report.json)
  * [data/generated/stress-quality.json](../../../data/generated/stress-quality.json)
  * [tests/unit/stress-fsa.test.ts](../../../tests/unit/stress-fsa.test.ts)
* Behavior or functionality changed: The reviewed MIT FSA is packaged unchanged with its license, per-file digests, combined artifact digest, and a generated conflict deny-list. The browser-neutral reader preserves multiple stresses, capitalization normalization, inherent `ё` stress, and deliberate missing/ambiguous outcomes. Full English Kaikki validation examined 442,594 records and 1,395,487 stress-bearing keys, recording 709,699 exact matches, 14,484 conflicts, and 671,304 missing keys without guessing.
* Validation: Two complete builds produced byte-identical indexes and reports. After per-chunk integrity metadata was added, the estimated compressed package is 568,434 bytes, below the 0.75 MiB budget. Strict type-check, lint, Chrome MV3 packaging, and 36 unit tests passed.

### Generated the exact packaged morphology index

* Related phase or task: `P02-T03`
* Files:
  * [public/indexes/morphology](../../../public/indexes/morphology)
  * [src/indexes/morphology-index.ts](../../../src/indexes/morphology-index.ts)
  * [tools/build-morphology-index.ts](../../../tools/build-morphology-index.ts)
  * [data/generated/morphology-report.json](../../../data/generated/morphology-report.json)
  * [data/generated/morphology-quality.json](../../../data/generated/morphology-quality.json)
  * [tests/unit/morphology-index.test.ts](../../../tests/unit/morphology-index.test.ts)
* Behavior or functionality changed: The full verified English Kaikki snapshot is filtered to Russian single-token surfaces and encoded as reusable stem-plus-ending paradigms with explicit exceptions and a compact binary lemma table. The index preserves 1,340,027 form-to-lemma relations across 410,784 lemmas, including 376,595 ambiguous surfaces. Browser-neutral lookup normalizes case and combining stress, returns every candidate in deterministic order, and rejects absent or mixed-script surfaces.
* Validation: Semantic reconstruction mismatches were zero. Two isolated full builds produced byte-identical files and reports. After per-chunk integrity metadata was added, estimated compressed size is 6,612,430 bytes against the 15 MiB budget; installed size is 28,365,201 bytes. Strict type-check, lint, Chrome MV3 packaging, and 43 unit tests passed.

### Implemented persistent settings and user-scoped page permissions

* Related phase or task: `P03-T01`
* Files:
  * [src/settings/settings.ts](../../../src/settings/settings.ts)
  * [src/settings/page-permissions.ts](../../../src/settings/page-permissions.ts)
  * [src/background/settings-service.ts](../../../src/background/settings-service.ts)
  * [entrypoints/background.ts](../../../entrypoints/background.ts)
  * [wxt.config.ts](../../../wxt.config.ts)
  * [tests/unit/settings.test.ts](../../../tests/unit/settings.test.ts)
  * [tests/unit/settings-service.test.ts](../../../tests/unit/settings-service.test.ts)
* Behavior or functionality changed: Versioned storage now persists definition edition, temporary or persistent activation, accessibility choices, diagnostics state, and canonical origin-scoped grants. `activeTab` supports one-time injection; optional HTTP/HTTPS origins are requested and revoked separately from the four fixed Wiktionary providers. The worker registers listeners synchronously, reconstructs granted origins after restart, removes stale registrations, and refuses privileged browser pages.
* Validation: Manifest policy confirms fixed provider hosts plus optional page-host patterns and the required `scripting` permission. Storage migration, grant filtering, revocation, registration reconstruction, temporary activation, privileged-page rejection, strict type-check, lint, Chrome MV3 build, and 50 unit tests passed.

### Implemented verified lazy local lookup

* Related phase or task: `P03-T02`
* Files:
  * [src/indexes/verified-asset-reader.ts](../../../src/indexes/verified-asset-reader.ts)
  * [src/indexes/lazy-morphology-index.ts](../../../src/indexes/lazy-morphology-index.ts)
  * [src/background/local-lookup-service.ts](../../../src/background/local-lookup-service.ts)
  * [entrypoints/background.ts](../../../entrypoints/background.ts)
  * [tests/unit/verified-asset-reader.test.ts](../../../tests/unit/verified-asset-reader.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: The worker atomically validates index schemas and digests before publishing lookup state. Search directories are retained once, while postings and lemma text are fetched as verified 64 KiB chunks with a bounded LRU. Chrome extension range responses are handled in their observed partial-`200` form. Local lookup preserves all lemma candidates and stress ambiguity/conflict states, uses a bounded 512-result cache, and exposes cache diagnostics through the typed runtime service.
* Validation: Corrupted chunks fail closed. Chromium proved partial packaged-asset reads, returned `говорить` for `говорил`, and met the 150 ms cold and 50 ms warm p95 limits in the extension benchmark. Formatting, strict type-check, lint, Chrome MV3 build, 52 unit tests, and three deterministic Chromium tests passed.

### Implemented bounded live definitions and detached edition parsers

* Related phase or task: `P03-T03`
* Files:
  * [src/background/definition-service.ts](../../../src/background/definition-service.ts)
  * [src/definitions/mediawiki-client.ts](../../../src/definitions/mediawiki-client.ts)
  * [src/definitions/parser.ts](../../../src/definitions/parser.ts)
  * [src/definitions/offscreen-parser.ts](../../../src/definitions/offscreen-parser.ts)
  * [src/definitions/offscreen-entry.ts](../../../src/definitions/offscreen-entry.ts)
  * [entrypoints/offscreen.html](../../../entrypoints/offscreen.html)
  * [entrypoints/background.ts](../../../entrypoints/background.ts)
  * [src/contracts/messages.ts](../../../src/contracts/messages.ts)
  * [tests/unit/mediawiki-client.test.ts](../../../tests/unit/mediawiki-client.test.ts)
  * [tests/unit/definition-service.test.ts](../../../tests/unit/definition-service.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: Definition requests now accept only normalized Cyrillic lemmas and fixed editions, originate from a content-script tab, use bounded single-use request IDs, reject replay and concurrent work per tab, and abort on matching dismissal. The worker constructs exact edition URLs, sends credential-free GET requests with client identification, enforces an 8-second timeout, a 2 MiB response ceiling, exact final origins, JSON content types, singular `error` and plural `errors[]` shapes, throttling, and no retry or cache. Non-English requests fall back to English only for missing pages or absent Russian sections. Raw HTML crosses only into an offscreen DOM parser; edition-specific English, French, German, and Russian extraction returns bounded text senses, POS labels where present, source/revision attribution, and no scripts, media, links, examples, or unrelated-language content.
* Validation: Formatting, strict type-check, type-aware lint, Chrome MV3 build, 64 unit tests, and four deterministic Chromium tests passed. Captured fixtures for all four editions parsed successfully; hostile markup produced text only and an unrelated-language page returned `no-russian-entry`. All four opt-in live edition checks passed with one GET per edition, exact origins, JSON, response bounds, client identification, and separate preflight accounting. Performance tests now calculate cold and warm p95 from 20-sample corpora rather than treating one observation or the maximum as p95; three repeated benchmark runs and the complete deterministic Chromium suite passed.

### Implemented reversible bounded page annotation

* Related phase or task: `P04-T01`
* Files:
  * [src/page/page-annotator.ts](../../../src/page/page-annotator.ts)
  * [entrypoints/page-integration.ts](../../../entrypoints/page-integration.ts)
  * [src/contracts/messages.ts](../../../src/contracts/messages.ts)
  * [src/background/local-lookup-service.ts](../../../src/background/local-lookup-service.ts)
  * [tests/unit/contracts.test.ts](../../../tests/unit/contracts.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: The injected top-level page script now scans text nodes incrementally, batches at most 128 unique local lookups per message, and adds stress only when the verified index has one resolved candidate. It skips editable controls, code/preformatted content, hidden or inert regions, extension UI, and active selections; wrappers do not enter tab order or replace whole subtrees. A bounded mutation queue handles dynamic content without reprocessing owned spans. Activation is idempotent, and deactivation disconnects observation, clears pending work and lookup state, removes every extension-owned wrapper and attribute, restores original text, and unregisters its control listener.
* Validation: Formatting, strict type-check, type-aware lint, Chrome MV3 build, 66 unit tests, and five deterministic Chromium tests passed. Chromium verified ordinary and linked text annotation, selection preservation, exclusion of preformatted/editable/hidden/input surfaces, dynamic mutation handling, unchanged navigation, and complete restoration on deactivation.

### Implemented trusted accessible definition interaction

* Related phase or task: `P04-T02`
* Files:
  * [src/page/definition-popup.ts](../../../src/page/definition-popup.ts)
  * [entrypoints/page-integration.ts](../../../entrypoints/page-integration.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: Remote definitions begin only from browser-trusted primary clicks on extension-owned stress marks, `Alt+Shift+D` for a bounded selection, or a trusted typed-search submission; synthetic events and hover never send a request. Ambiguous local forms display every lemma as a separate explicit choice instead of silently selecting one. The isolated Shadow DOM dialog presents loading, offline, timeout, throttling, missing, parser-change, and other bounded states; renders definition text only with semantic headings and lists; labels English fallback; exposes the exact validated HTTPS Wiktionary source, revision, and attribution; applies stored font-scale, contrast, and reduced-motion preferences; and supports focus placement, Escape dismissal, cancellation, stale-result suppression, and focus return.
* Validation: Formatting, strict type-check, type-aware lint, Chrome MV3 build, 66 unit tests, and six deterministic Chromium tests passed. Chromium rejected a synthetic click, accepted trusted pointer and keyboard actions, preserved morphology ambiguity until explicit lemma choice, rendered captured English definitions and source links, dismissed with Escape, and completed the typed-search fallback.

### Implemented inspectable settings, permission controls, and sanitized diagnostics

* Related phase or task: `P04-T03`
* Files:
  * [src/contracts/messages.ts](../../../src/contracts/messages.ts)
  * [src/background/settings-service.ts](../../../src/background/settings-service.ts)
  * [src/background/local-lookup-service.ts](../../../src/background/local-lookup-service.ts)
  * [src/background/definition-service.ts](../../../src/background/definition-service.ts)
  * [entrypoints/background.ts](../../../entrypoints/background.ts)
  * [entrypoints/options/index.html](../../../entrypoints/options/index.html)
  * [entrypoints/options/main.ts](../../../entrypoints/options/main.ts)
  * [entrypoints/popup/index.html](../../../entrypoints/popup/index.html)
  * [entrypoints/popup/main.ts](../../../entrypoints/popup/main.ts)
  * [tests/unit/settings-service.test.ts](../../../tests/unit/settings-service.test.ts)
  * [tests/unit/contracts.test.ts](../../../tests/unit/contracts.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: The popup now gives explicit current-tab activation, exact-origin persistent access, deactivation, and settings controls. The options page persists the selected English, French, German, or Russian edition plus accessibility preferences; explains offline local lookup, online explicit definitions, and mandatory English fallback; lists and revokes persistent origins; and exposes package, exact-provider, local-integrity, index provenance/digest, bounded cache, and last-error diagnostics. Diagnostic export is a deliberate local download containing only selected settings and bounded technical state; it excludes persistent site origins, page URLs, surrounding text, browsing history, IP addresses, raw definitions, and lookup history.
* Validation: Formatting, strict type-check, type-aware lint, the Chrome MV3 production build, 72 unit tests, and eight deterministic Chromium tests passed. Unit coverage verifies permission grant, denial, normalized revocation, deactivation, inactive content scripts, and malformed message rejection. Chromium verifies persisted edition/accessibility settings, exact host and index diagnostics, sanitized export, and the complete popup control surface. Browser permission prompts were not automated because deterministic Chromium test navigation does not preserve the real toolbar-popup user-gesture chain; grant, denial, and revocation behavior is owned by unit tests around the browser permission API.

### Added deterministic domain, parser, hostile-input, and data-integrity gates

* Related phase or task: `P05-T01`
* Files:
  * [src/definitions/mediawiki-client.ts](../../../src/definitions/mediawiki-client.ts)
  * [src/definitions/parser.ts](../../../src/definitions/parser.ts)
  * [tests/unit/domain-properties.test.ts](../../../tests/unit/domain-properties.test.ts)
  * [tests/unit/index-artifacts.test.ts](../../../tests/unit/index-artifacts.test.ts)
  * [tests/unit/mediawiki-client.test.ts](../../../tests/unit/mediawiki-client.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: Generated Unicode cases now prove lemma and stress normalization idempotence, control/non-Cyrillic rejection, code-point limits, inherent `ё` stress, and malformed binary-index rejection. Every declared local index file and chunk is rehashed in tests, aggregate artifact digests are reconstructed, morphology record flow and zero-mismatch semantics are enforced, and compressed-size budgets remain executable assertions. Definition reduction now uses an injectable timeout signal so abort and timeout branches are deterministic without wall-clock sleeps; tests cover both MediaWiki error shapes, fallback ordering, attribution, and entry/sense/code-point bounds. The detached parser now removes forms, controls, embedded documents, SVG/MathML, media, executable markup, examples, and nested lists before text reduction, while preserving safe linked definition text without URLs or attributes.
* Validation: Formatting, strict type-check, type-aware lint, the production MV3 build, 89 deterministic unit/data/property tests, and eight deterministic Chromium tests passed. The Chromium parser test proves generated hostile event attributes, scripts, styles, media, forms, deep examples, and `javascript:` URLs do not enter the text-only result.

### Proved Chromium lifecycle, privacy, accessibility, and packaged behavior

* Related phase or task: `P05-T02`
* Files:
  * [src/page/definition-popup.ts](../../../src/page/definition-popup.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
  * [tests/e2e/fixtures.ts](../../../tests/e2e/fixtures.ts)
  * [tools/prepare-packaged-smoke.mjs](../../../tools/prepare-packaged-smoke.mjs)
  * [package.json](../../../package.json)
* Behavior or functionality changed: Deterministic Chromium coverage now proves service-worker restart, dynamic-page annotation and restoration, explicit pointer and keyboard lookup, synthetic-event rejection, single-use request replay protection, bounded selected-edition and English-fallback network attempts, credential-free request metadata, offline/throttled/timeout/oversized/wrong-origin/malformed/parser-drift failures, late-result suppression, semantic dialog naming, 200% zoom, contrast and reduced-motion preferences, focus containment and return, Escape dismissal, and exact packaged-artifact execution. The packaged smoke extracts the generated ZIP only after rejecting absolute and parent-traversal entries. Invisible focus sentinels retain keyboard containment without intercepting pointer actions.
* Validation: `npm run format`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run test:e2e:packaged` passed. This includes 89 deterministic unit/data/property tests, 12 deterministic unpacked Chromium scenarios, and one exact 7.21 MB packaged-ZIP smoke. Four live Wiktionary canaries remain intentionally opt-in and non-release-blocking. Real toolbar `activeTab` and browser permission prompts are unavailable to direct extension-page automation; browser-API unit tests own grant, denial, revocation, and temporary-injection behavior.

### Enforced CI, performance, package, and supply-chain release gates

* Related phase or task: `P05-T03`
* Files:
  * [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
  * [.github/workflows/codeql.yml](../../../.github/workflows/codeql.yml)
  * [.github/workflows/live-canary.yml](../../../.github/workflows/live-canary.yml)
  * [.github/workflows/release-candidate.yml](../../../.github/workflows/release-candidate.yml)
  * [data/config/release-policy.json](../../../data/config/release-policy.json)
  * [tools/verify-release.mjs](../../../tools/verify-release.mjs)
  * [tests/unit/release-policy.test.ts](../../../tests/unit/release-policy.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: Pull requests now run formatting, strict type-checking, lint, unit/property/data tests, deterministic Chromium tests, dependency review, CodeQL, SBOM generation, dependency-license enforcement, manifest and compiled-output policy, package allowlisting, size budgets, activation latency and renderer-heap budgets, and exact packaged-ZIP smoke testing. All third-party workflow actions are pinned to immutable commits with least-privilege job permissions. Scheduled live Wiktionary canaries are isolated from release blocking, while the manual release-candidate workflow cannot execute automatically on untrusted pull-request code. Release verification rejects undeclared files, traversal paths, source maps, remote executable imports, `eval`, function constructors, changed optional page-access patterns, unapproved dependency licenses, and package-size regressions; it emits per-artifact bytes, ZIP digest, license inventory, SBOM, and activation evidence.
* Validation: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run release:verify`, `npm run test:e2e:packaged`, and `actionlint` passed. The release ZIP is 7,206,654 bytes against 20 MiB; installed output is 29,515,460 bytes against 80 MiB. Twenty 100,000-character activation samples measured 158.5 ms p95 against 500 ms and a 30,598,640-byte maximum renderer-heap delta against 64 MiB. The suite contains 91 unit/data/policy tests, 13 deterministic Chromium scenarios, and the exact packaged smoke.

### Published truthful product, privacy, security, attribution, and recovery documentation

* Related phase or task: `P06-T01`
* Files:
  * [README.md](../../../README.md)
  * [docs/index.md](../../../docs/index.md)
  * [docs/examples.md](../../../docs/examples.md)
  * [docs/privacy.md](../../../docs/privacy.md)
  * [docs/support.md](../../../docs/support.md)
  * [docs/chrome-web-store.md](../../../docs/chrome-web-store.md)
  * [SECURITY.md](../../../SECURITY.md)
  * [LICENSE.md](../../../LICENSE.md)
  * [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md)
  * [tests/unit/release-policy.test.ts](../../../tests/unit/release-policy.test.ts)
* Behavior or functionality changed: User and contributor documentation now describes temporary and persistent activation, supported and excluded surfaces, packaged stress/morphology behavior, explicit online definitions, edition selection, labelled English fallback, sanitized diagnostics, accessibility, permission revocation, uninstall behavior, exact Wikimedia recipients and transmitted metadata, omitted page context and credentials, source licensing, support boundaries, parser-drift response, local-index rollback, release rollback, build and smoke-test commands, security reporting, and Chrome Web Store disclosures. It explicitly avoids claims of anonymity, guaranteed Wikimedia availability, fully offline definitions, perfect correctness, or absolute security.
* Validation: Formatting, strict type-check, lint, production MV3 build, and 92 unit/data/policy tests passed. Documentation-policy tests require all four exact Wiktionary hosts, the excluded sensitive fields, the no-passive-lookup promise, the private security-reporting route, and removal of the obsolete hover description.

### Removed the superseded MV2 implementation and legacy pipeline

* Related phase or task: `P06-T02`
* Files:
  * [.gitignore](../../../.gitignore)
  * [tests/unit/release-policy.test.ts](../../../tests/unit/release-policy.test.ts)
  * `chrome/` removed
  * `conf/` removed
  * `scripts/` removed
  * Obsolete screenshots under `docs/` removed
* Behavior or functionality changed: The repository now has one maintained Manifest V3 source tree, one TypeScript local-index pipeline, and one WXT package path. The MV2 manifest and scripts, jQuery/Bootstrap/Underscore runtime, remote-download packaging, live-HTML parser, passive-hover definition path, Python/Pipenv pipeline, obsolete configuration, and stale legacy screenshots are removed. Ignore rules now cover WXT, test, cache, benchmark, data-cache, release-evidence, and package output without hiding maintained generated indexes.
* Validation: Formatting, strict type-check, lint, production MV3 build, 93 unit/data/policy tests, 13 deterministic Chromium scenarios, release verification, exact packaged smoke, and `actionlint` passed. Static searches found no legacy roots or maintained references to MV2, jQuery, Bootstrap, Underscore, the old content script, old package script, or old download pipeline.

### Reproduced and verified the exact release ZIP

* Related phase or task: `P06-T03`
* Files:
  * [tools/package-release.mjs](../../../tools/package-release.mjs)
  * [tools/verify-reproducible-release.mjs](../../../tools/verify-reproducible-release.mjs)
  * [tools/verify-provenance.mjs](../../../tools/verify-provenance.mjs)
  * [tools/build-release-quality-report.mjs](../../../tools/build-release-quality-report.mjs)
  * [.github/workflows/release-candidate.yml](../../../.github/workflows/release-candidate.yml)
  * [docs/release-notes-0.1.0.md](../../../docs/release-notes-0.1.0.md)
  * [package.json](../../../package.json)
* Behavior or functionality changed: Chrome release packaging now has one deterministic path with fixed timestamps, sorted file order, normalized permissions, fixed compression, and excluded ZIP metadata. Two isolated production builds compare every output digest and the final archive digest before publishing the local candidate. The retained evidence includes the exact ZIP checksum, clean source revision and source-tree digest, local-index artifact digests, CycloneDX SBOM, dependency-license inventory, size and activation metrics, four-edition live-canary report, release notes, local in-toto provenance statement, provenance/checksum verification, and consolidated release-quality report. The manual least-privilege release workflow creates a GitHub artifact attestation for the same ZIP; Chrome Web Store publication remains separate.
* Validation: The final gate passed formatting, strict type-check, lint, 93 unit/data/policy tests, 13 deterministic Chromium scenarios, two byte-identical isolated builds, package policy and compiled-output scans, exact packaged smoke, four live Wiktionary canaries, Firefox-compatible build, zero high-severity npm audit findings, and `actionlint`. The ZIP is 7,207,378 bytes, installed output is 29,515,460 bytes, activation is 146 ms p95 with a 30,092,704-byte maximum heap delta, and the deterministic ZIP SHA-256 is `bbfcefb1bc42b8ae58be9855b4a696796288d489ea30b0524f14a6f00c4a1621`. The local provenance subject, checksum file, and release report all verify that digest. GitHub-signed attestation verification is unavailable until the explicitly manual release-candidate workflow runs after the branch is pushed.

## Implementation-Time Plan Updates

### Recorded the unresolved definition-delivery blocker

* Affected plan area or markers: Planning Readiness and Next Step; D7; `P01` and dependent phases
* What changed: Implementation was initially paused before `P01-T01` for D7; the subsequent decision entry records its resolution and the resulting plan-wide replanning blocker.
* Why: Recent size spikes reduced the local morphology index, while the user reopened the earlier bundled-definition decision by considering remote per-lookup definitions.
* Triggering evidence: [.copilot-tracking/spikes/2026-10-03/slava-rearchitecture-spikes.md](../../spikes/2026-10-03/slava-rearchitecture-spikes.md) S02E and S02F; [.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md](../../research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md)
* User answer or decision: Confirmed live MediaWiki API lookup with no Slava-hosted definition data.
* Reconciliation performed: Executive summary, confirmed direction, decisions D2/D5/D7, language matrix, readiness, goals, scope, FR-003, FR-004, NFR-002, NFR-003, and NFR-005 now reflect the decision or explicitly require replanning.
* Planning and critique state: Broad task-level replanning is required before implementation; critique remains optional after revision.

### Selected live MediaWiki definition delivery

* Affected plan area or markers: D2, D5, D7, `P01` through `P06`, FR-003, FR-004, NFR-002, NFR-003, NFR-005
* What changed: Definitions will not be bundled, downloaded as Slava packs, or hosted by Slava. Explicit lookup actions will call the corresponding live MediaWiki API and use English as a second request when the selected edition has no usable result.
* Why: The user prefers no permanent definition storage and no Slava-hosted definition corpus.
* Triggering evidence: Size review and S02F show that local stress and morphology can remain compact; the remaining definition storage can be removed entirely from the extension.
* User answer or decision: “Live MediaWiki API lookup with no Slava-hosted definition data.”
* Reconciliation performed: Current synthesized plan sections are updated; detailed phase diagrams, task requirements, dependencies, test cases, and release sequencing are intentionally routed to `/rpi-plan` because the change spans the full plan.
* Planning and critique state: Replanning required; implementation remains blocked.

### Clarified declared optional page-access wildcard permissions

* Affected plan area or markers: `P05-T03`
* What changed: The package gate rejects undeclared wildcard hosts and any wildcard required definition-provider permission, while retaining the declared optional `http://*/*` and `https://*/*` patterns needed for user-chosen persistent page activation.
* Why: Chrome requires requested persistent origins to be covered by `optional_host_permissions`; removing those patterns would break the approved exact-origin permission lifecycle.
* Triggering evidence: The generated MV3 manifest and `P03-T01` permission tests.
* User answer or decision: Not required; this is an evidence-backed clarification preserving the approved architecture.
* Reconciliation performed: The `P05-T03` package requirement now distinguishes required provider permissions from optional user-selected page permissions.
* Planning and critique state: Ready; no scope, architecture, or dependency change.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| Production validation | Full plan | Skipped | No production source was changed because the architecture decision blocks the first phase |
| Tracking consistency | Plan and changes record | Passed | D7 is confirmed and the cross-plan replanning blocker is represented in both artifacts |
| Implementation readiness | Full plan | Passed | The current plan is Ready; standard critique PC-010 and PC-011 are resolved |
| Workspace formatting | `P01-T01` | Passed | `npm run format:check` |
| Type safety | `P01-T01` | Passed | `npm run typecheck` |
| Lint | `P01-T01` | Passed | `npm run lint` |
| Chrome MV3 build and manifest policy | `P01-T01` | Passed | `npm test` built the extension and passed the generated-manifest test |
| Firefox-compatible build | `P01-T01` | Passed | `npm run build:firefox`; WXT emitted non-blocking Firefox metadata warnings for a later portability task |
| Dependency audit | `P01-T01` | Passed | `npm audit --audit-level=high` reported zero vulnerabilities |
| Public lock conversion | `P01-T01` | Unavailable | Public npm metadata timed out; the installed lock remains on the approved Microsoft npm mirror and retains exact versions and integrity |
| Contract and normalization tests | `P01-T02` | Passed | `npm test` passed 18 tests across manifest policy, editions, lemma validation, and quality invariants |
| Fixture contract and bounds | `P01-T03` | Passed | `npm test` passed 24 tests including all real and synthetic fixture scenarios |
| Chromium MV3 lifecycle | `P01-T03` | Passed | `npm run test:e2e` loaded exact permissions and restarted the stopped service worker |
| Live exact-host access | `P01-T03` | Passed | `npm run test:e2e:live` passed one GET per edition, bounded responses, exact final origins, JSON content types, client identification, and separate preflight accounting |
| Pinned source acquisition | `P02-T01` | Passed | Stress data, MIT license, and Kaikki morphology snapshot matched expected bytes and SHA-256; mutable metadata is checked before parsing |
| Provenance determinism | `P02-T01` | Passed | Two isolated `sources:acquire` runs produced identical `data/generated/source-provenance.json` digests |
| Stress semantic validation | `P02-T02` | Passed | Full snapshot comparison recorded exact, conflict, and missing behavior; representative capitalization, `ё`, compound, homograph, hyphen, and missing cases passed |
| Stress determinism and size | `P02-T02` | Passed | Two isolated builds were byte-identical; current estimated compressed package is 568,434 bytes against a 786,432-byte ceiling |
| Morphology semantic validation | `P02-T03` | Passed | 1,340,027 relations reconstructed with zero mismatches; ambiguity and explicit exceptions remain preserved |
| Morphology determinism and size | `P02-T03` | Passed | Two isolated full builds were byte-identical; current estimated compressed package is 6,612,430 bytes against a 15 MiB ceiling |
| Settings and permission lifecycle | `P03-T01` | Passed | Versioned storage, exact-origin optional grants, stale-grant removal, worker reconstruction, and temporary injection passed unit and manifest-policy tests |
| Verified local lookup | `P03-T02` | Passed | Chunk integrity, lazy reads, ambiguity, bounded cache diagnostics, and fail-closed behavior passed |
| Chromium local lookup performance | `P03-T02` | Passed | Packaged range reads succeeded; cold lookup stayed at or below 150 ms and warm p95 at or below 50 ms |
| Definition transport and fallback | `P03-T03` | Passed | Exact internal URLs, credential-free bounded GET, origin/content-type/error enforcement, selected-edition ordering, English fallback limits, timeout, abort, throttling, and response ceiling passed |
| Detached edition parsing | `P03-T03` | Passed | Captured English, French, German, and Russian pages parsed in Chromium; hostile markup returned text only and unrelated-language content was rejected |
| Live definition provider access | `P03-T03` | Passed | All four opt-in live edition checks passed exact-origin, JSON, response-size, client-identification, GET-count, and preflight assertions |
| Local lookup percentile benchmark | `P03-T02` | Passed | Cold and warm p95 use 20-sample corpora with nearest-rank indexing; three repeated benchmark runs and the complete deterministic Chromium suite passed |
| Reversible page annotation | `P04-T01` | Passed | Bounded batched lookup, ordinary and dynamic text annotation, exclusion surfaces, selection preservation, link preservation, idempotence, and full deactivation restoration passed in Chromium |
| Trusted definition interaction | `P04-T02` | Passed | Synthetic clicks were ignored; trusted pointer, keyboard selection, typed search, ambiguity choice, text-only rendering, source attribution, and Escape dismissal passed in Chromium |
| Settings, permissions, and diagnostics UI | `P04-T03` | Passed | Static checks, 72 unit tests, production MV3 build, and eight deterministic Chromium tests passed; browser permission prompt semantics are covered at the API boundary because toolbar user gestures are not reproducible through direct extension-page navigation |
| Domain, parser, property, and data gates | `P05-T01` | Passed | Static checks, 89 unit/data/property tests, production MV3 build, and eight Chromium tests passed; index files/chunks/digests, semantic flow, Unicode boundaries, deterministic timeout/abort, response bounds, and hostile reduction are enforced |
| Chromium lifecycle, privacy, accessibility, and package gates | `P05-T02` | Passed | Static checks, 89 unit/data/property tests, 12 deterministic unpacked Chromium scenarios, and the exact 7.21 MB packaged-ZIP smoke passed; live four-edition canaries remain opt-in |
| CI, performance, package, and supply-chain gates | `P05-T03` | Passed | Pinned least-privilege workflows, CodeQL, dependency review, SBOM, license and package allowlists, compiled-output scans, 91 unit/data/policy tests, 13 deterministic Chromium scenarios, exact packaged smoke, 7,206,654-byte ZIP, 29,515,460 installed bytes, 158.5 ms activation p95, and 30,598,640-byte maximum heap delta passed |
| User, privacy, security, attribution, and recovery documentation | `P06-T01` | Passed | Documentation-policy tests and static quality gates passed with exact hosts, transmitted and excluded data, permission justification, licensing, support, parser response, rollback, and store disclosures |
| Clean maintained source state | `P06-T02` | Passed | Legacy MV2, Python pipeline, remote-download package path, libraries, configuration, and stale assets were removed; 93 unit/data/policy tests, 13 Chromium scenarios, release verification, packaged smoke, and static legacy scans passed |
| Reproducible release candidate | `P06-T03` | Passed | Two isolated outputs and ZIPs were byte-identical; checksum/provenance verification, SBOM, license inventory, package scan, 93 tests, 13 Chromium scenarios, packaged smoke, four live canaries, Firefox build, npm audit, and workflow lint passed |
| GitHub-signed artifact attestation | `P06-T03` | Unavailable | The pinned manual release-candidate workflow owns signing and verification; no push or workflow run was authorized or performed |

## Pre-Review Reconciliation

* Plan markers and task-local context: Current through `P06`
* Completed-work entries and handoff prose: Current through `P06`
* Validation, blockers, remaining work, and follow-up items: Current
* Review readiness: Ready for `/rpi-review`; all implementation markers are complete

## Blockers

* None.

## Remaining Work

* No active implementation markers remain.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md](../../plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md), `## Follow-Up Items`
* After push, explicitly run the manual release-candidate workflow to obtain and verify the GitHub-signed artifact attestation before store submission.

## Return-to-Caller State

* Implementation execution status: Complete
* Declared scope and markers: Full plan; `P01` through `P06` complete
* Validation coverage: Workspace, manifest, dependency, contracts, fixture integrity, exact-host network access, MV3 worker lifecycle, source provenance, local-index determinism, semantics, size, file/chunk/aggregate digests, generated Unicode and malformed-binary boundaries, settings persistence, permission lifecycle, verified lazy loading, lookup performance, bounded live definition transport, deterministic timeout/abort, replay/concurrency/abort boundaries, fallback, detached parsing, hostile markup and forms/media/embedded-content removal, live four-edition access, reversible page annotation, exclusion surfaces, mutation handling, deactivation restoration, trusted pointer and keyboard actions, ambiguity choice, accessible text-only popup rendering, exact source attribution, dismissal, sanitized diagnostics, popup/options controls, network privacy and request limits, failure-state rendering, focus containment and return, 200% zoom, contrast, reduced motion, exact packaged-ZIP extraction and execution, CI action pinning, least-privilege workflows, CodeQL, dependency review, SBOM, license inventory, compiled-output scans, package allowlisting, release size budgets, activation latency, renderer-heap budgets, documentation policy, legacy-path removal, deterministic dual builds, checksums, local provenance verification, live canaries, Firefox portability, release notes, and final package evidence passed
* Blockers: None
* Current plan updates: The approved plan fully incorporates live MediaWiki definition delivery and critique corrections
* Planning and critique state: Ready; PC-010 and PC-011 resolved
* Follow-up items: Run the explicitly manual release-candidate workflow after push to obtain and verify the GitHub-signed artifact attestation
* Review readiness or no-handoff reason: Ready for `/rpi-review`
* Continuation owner: User

## Accepted Review Remediation

### Started release and permission consistency remediation

* Related plan markers: `P03-T01`, `P05-T03`, `P06-T01`, `P06-T03`
* Accepted review findings: `RV-001`, `RV-002`, `RV-003`, `RV-004`
* Active behavior changes: make clean-runner release evidence self-contained; package and verify morphology attribution; return coherent persistent-grant results after injection failure; derive consolidated quality claims from current machine-readable evidence.
* Planned validation: targeted settings and release-policy tests, clean-artifact release evidence, static quality gates, deterministic Chromium coverage, reproducible packaging, exact packaged smoke, and package-entry inspection.
* Blockers: None.
* Planning state: The findings clarify existing release, attribution, and permission requirements without changing architecture or user direction. Existing plan markers remain complete; this invocation implements the accepted review routes as ordinary follow-on work.

### Restored product identity and hover lookup as confirmed requirements

* Affected plan markers: `P01-T01`, `P03-T03`, `P04-T02`, `P05-T02`, `P05-T03`, `P06-T01`, `P06-T03`
* What changed: Manual testing established that the original owl icon and main-branch hover interaction are required product behavior. A trusted pointer dwell of at least 100 ms must open an anchored definition card without stealing focus, display the exact hovered surface form, and render every valid locally resolved lemma result.
* Why: The rebuilt implementation used generated/default icon treatment and intentionally required click or keyboard action, which does not match the user-approved legacy interaction.
* User answer or decision: “the icon in the taskbar should be the original own icon”; “when I hover, that a popup opens with the exact word form and definition(s), just like on main branch.”
* Security and privacy boundary: Hover requests remain trusted-event-only, cancellable before the delay, exact-host, credential-free, bounded, text-only, and limited to locally resolved lemmas. Synthetic events and arbitrary background fetch remain prohibited.
* Reconciliation performed: D12, executive summary, P03-T03, P04-T02, P05-T02, P06-T01, FR-004, NFR-002, non-goals, affected completion markers, and release follow-up state now reflect the confirmed behavior.
* Planning state: Implementation-ready; the user decision is authoritative and no additional product decision is required.

### Retaining current form-specific stress evidence

* Affected plan markers: `P02-T03`, `P03-T02`, `P05-T01`, `P06-T03`
* Material discovery: The pinned September 2026 Kaikki snapshot contains `иноаге́нтов` and other accented canonical and inflected forms that the compact dedicated stress dictionary does not cover. The morphology pipeline normalized those accents away, so current source evidence was available but not packaged.
* Implementation direction: Preserve exact-form Kaikki stress patterns that are absent from the dedicated FSA, encode them in the verified lazy morphology artifact, and consult them before returning a missing stress result. Do not propagate lemma stress across forms because Russian stress may shift within a paradigm.
* Conflict behavior: Multiple Kaikki patterns retain an ambiguous diagnostic and render the union of valid positions, matching old Slava; dedicated-versus-Kaikki conflicts continue to fail closed.
* Planned validation: Regression coverage for `иноагентов` → `иноаге́нтов`, direct-form stress shifts, missing and ambiguous outcomes, deterministic index generation, morphology size budget, runtime integrity, and exact packaged behavior.

### Reducing morphology string storage with a standard encoding

* Affected plan markers: `P02-T03`, `P03-T02`, `P05-T01`, `P05-T03`, `P06-T03`
* Decision: Encode morphology keys, stems, and lemmas as standard Windows-1251 where representable, with per-string UTF-8 fallback for historical Cyrillic outside that standard. Numeric directories and postings remain little-endian binary, and JSON remains UTF-8.
* Normalization: Typographic non-breaking hyphens and curly apostrophes are normalized to their dictionary-equivalent ASCII characters before indexing and lookup.
* Runtime boundary: Morphology metadata declares `windows-1251-with-utf-8-fallback`; mismatched or legacy metadata fails closed before publishing lookup state.
* Planned validation: Full-corpus encodability, deterministic rebuild, size comparison, punctuation equivalence, unit and Chromium lookup behavior, release budgets, reproducibility, and exact packaged smoke.

### Restoring the legacy definition-card presentation

* Affected plan markers: `P04-T02`, `P05-T02`, `P06-T01`
* User direction: Match the main-branch popup format and style as closely as practical and remove audit-heavy inline details such as edition labels, revision IDs, and licence prose.
* Presentation: The exact surface form is the compact card heading; each lemma is a direct Wiktionary source link; parts of speech and numbered senses are the primary content. English fallback remains labelled unobtrusively.
* Preserved boundaries: Source URLs remain validated, text remains detached and sanitized, the close control remains keyboard accessible, and detailed provenance stays available in diagnostics and release evidence rather than the reading surface.
* Planned validation: Hover, click, keyboard, fallback, source-link, focus, zoom, contrast, and failure-state Chromium coverage.

### Restoring legacy stress rendering conventions

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T01`, `P05-T01`, `P05-T02`, `P06-T03`
* Ambiguous forms: Preserve the diagnostic `ambiguous` status while rendering the union of every valid stress position, matching the old extension. For example, `полок` renders as `по́ло́к`.
* Monosyllables: Keep words available for hover definitions but suppress visually redundant acute marks when the normalized form has only one vowel, so `как` remains `как`.
* Proper nouns: Preserve canonical lemma casing from Kaikki so inflected forms such as `России` can request the case-sensitive Wiktionary title `Россия`.
* Planned validation: Full-corpus rebuild, `полок`, `как`, and `России` regressions, reversible page annotation, live title lookup, deterministic indexes, package budgets, and exact packaged smoke.

### Ranking the nearest definition first

* Affected plan markers: `P04-T02`, `P05-T02`
* User direction: When a surface form resolves to multiple Wiktionary candidates, show the nearest candidate before broader lemma definitions.
* Behavior: Rank candidates by normalized edit distance from the exact surface form, with exact matches first and Russian alphabetical order only as a deterministic tie-breaker. For `читают`, the `читают` entry precedes `читать`.
* Planned validation: Trusted hover, click, typed search, automatic multi-lemma lookup, source links, and exact-candidate ordering in Chromium.

### Supporting participle definition pages

* Affected plan markers: `P03-T03`, `P05-T01`, `P05-T02`
* Material discovery: English Wiktionary classifies `пропавший` under a `Participle` heading. The parser allowlist omitted that valid part of speech and incorrectly reported a global API-structure change.
* Behavior: Treat English `Participle` sections as ordinary definition sections while retaining the same bounded text-only extraction and hostile-content removal.
* Planned validation: Synthetic detached-parser coverage for the exact heading structure plus the full captured-fixture and Chromium suites.

### Preventing reverse form-of candidates

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T02`, `P05-T01`, `P05-T02`
* Material discovery: Kaikki form-entry records may put the lexical lemma in `forms[].form`. Treating that field as another surface of the form-entry headword reverses the relationship; for example, it made `старому` a candidate for `Старый`.
* Behavior: Form-of records remain exact searchable candidates for their own page title, but their canonical lemma field is not indexed as a surface of the inflected headword. Lexical entries continue to contribute complete paradigms.
* Source policy: The deterministic field allowlist now admits only the form-of classification fields needed to distinguish these records; definition text remains excluded.
* Planned validation: `Старый` excludes `старому`, `читают` retains its exact form page, semantic reconstruction remains exact, and full browser/release gates pass.

## Final Implementation Reconciliation

* Implementation execution status: Complete for the full declared plan.
* Completed markers: `P01` through `P06` and every contained task.
* Remaining markers: None.
* Review remediation: `RV-001` through `RV-004` are implemented.
* Local index behavior: The Kaikki fallback supplies 148,532 dedicated-dictionary-missing stressed forms. Ambiguous forms retain diagnostics and render the union of valid positions; one-vowel words suppress redundant acute marks. Form-of records remain exact candidates without generating reverse canonical links.
* Storage: Standard Windows-1251 string encoding with UTF-8 fallback for unsupported historical Cyrillic reduced the installed release from the earlier 36.16 MB intermediate build to 26,591,388 bytes. The final ZIP is 7,772,299 bytes.
* Definition behavior: Trusted 100 ms hover, click, keyboard, and typed lookup use the compact legacy-style card. Exact/nearest candidates are ordered first, proper-noun casing is preserved, successful definitions render progressively, and English participle pages are supported.

### Expanding ordered Wiktionary lookup providers

* User direction: Definition lookup supports the same 12 major languages as the interface, with multiple user-selected editions arranged in explicit fallback order.
* Provider contract: English, Russian, Ukrainian, German, French, Spanish, Portuguese, Chinese, Japanese, Korean, Arabic, and Hindi use exact manifest origins. English is not implicit; lookup advances only after a missing page or missing Russian section, while operational, security, and parser failures stop the chain.
* Settings and interface: The singular edition setting migrates to a non-empty, deduplicated ordered list. Existing non-English selections retain prior behavior as `[selected, "en"]`. The options page provides localized checkboxes and move controls, prevents clearing the final provider, and saves immediately.
* Parsing evidence: Captured current fixtures cover the 12 editions. Spanish numbered definition lists and Korean numbered top-level lists use explicit provider parsers; the remaining new editions use bounded ordered-list parsing with edition-specific Russian-section and part-of-speech allowlists.
* Documentation: README, user guide, privacy policy, store disclosures, support matrix, examples, release notes, schemas, fixture instructions, and third-party notices describe the exact providers and ordered fallback behavior.
* Validation: Formatting, strict type-check, lint, 135 unit/data/policy tests, 14 deterministic Chromium scenarios, packaged smoke, Firefox compatibility build, SBOM, zero-vulnerability npm audit, provenance verification, release gates, and two-build reproducibility passed. The Chrome archive contains 47 files, is 10,069,207 bytes compressed and 33,502,973 bytes installed, with SHA-256 `f0c4f9e3593d53c313919a5de1a0ec2d560341d8a7142393b081ddc5bad6aef3`; activation p95 remained within the 500 ms budget and maximum heap delta remained within the 64 MiB budget.
* Validation: Formatting, strict type-check, lint, 104 unit/data/policy tests, 13 deterministic Chromium scenarios, Firefox compatibility build, zero npm-audit vulnerabilities, two byte-identical isolated builds, SBOM, package policy, provenance verification, and exact packaged smoke passed.
* Release evidence: `artifacts/release-quality-report.json` records archive SHA-256 `859d56da7affb3fa2ce38d71021c610f35d84bc6840db110abf22b3cc3ec921c`, 143.5 ms activation p95, and a 30,839,476-byte maximum heap delta.
* External follow-up: The manual GitHub release-candidate workflow remains the owner of hosted artifact attestation after an authorized push; it is configured but was not run locally.
* Blockers: None.
* Review readiness: Ready.

## Multilingual interface and parser compatibility

* Triggering evidence: User validation requested major interface locales with a separate Wiktionary definition language, then reproduced French lookup failure for `драйвер` and missing annotation/popup behavior for `подвел` and `Углубленное`.
* Behavior or functionality changed: Slava now resolves an automatic browser language or an explicit interface-language override independently from the definition edition. Popup, options, definition-card copy, grammatical tags, aspect labels, bounded errors, writing direction, and diagnostics labels use a typed 12-locale catalog with English fallback. Arabic uses right-to-left layout.
* Linguistic indexing: The morphology builder adds `е` aliases for `ё`-bearing forms only when no exact `е` surface already exists, preserving existing homograph ownership while enabling `подвел` → `подвёл` / `подвести` and `Углубленное` → `Углублённое` / `углублённый`. Grammar aliases follow the same collision rule.
* Wiktionary compatibility: French parser headings with numeric sense suffixes, such as `Nom commun 1`, normalize to their semantic part of speech. A captured `драйвер` fixture pins the current French page structure.
* Regression coverage: Unit tests cover locale normalization, message substitution, French grammar labels, Arabic direction, settings migration, and `ё`-folded morphology. Chromium covers localized options and popup controls, independent interface/definition settings, French grammar rendering, Arabic RTL metadata, the French `драйвер` parser fixture, and visible/popup-capable `подвёл` and `Углублённое`.
* Tests: 116 unit/data/policy tests and 14 deterministic Chromium tests passed; four live-only canaries remained intentionally skipped. The packaged smoke test and Firefox compatibility build passed.
* Compatibility and quality: Formatting, strict type-check, lint, Chrome and Firefox builds, SBOM, package allowlist, provenance, zero-vulnerability npm audit, release gates, and two-build reproducibility passed.
* Performance: The 100,000-character activation benchmark measured 397.2 ms p95 and a 52,247,704-byte maximum heap delta, within the 500 ms and 64 MiB limits.
* Release artifact: The Chrome ZIP contains 46 files, is 10,066,150 bytes compressed and 33,493,284 bytes installed, and has SHA-256 `b31f22f6e25e4f7c3944283782991231f3e197091904c4e9802310834827f28c`.
* Reproducibility: Two isolated builds produced identical output and ZIP digests. The morphology artifact digest is `83b7c0b013e951c0fb3fd9754da99df3393d8dee911e47712c0c04e01ea7b22c`.
* Blockers: None.

## Expanding interface and definition languages to 21

* User direction: Add every proposed language: Hebrew, Polish, Romanian, Turkish, Italian, Kazakh, Latvian, Estonian, and Lithuanian.
* Interface behavior: The typed locale catalog now contains 21 locales with localized extension, settings, diagnostics, definition, error, aspect, and grammatical copy. Browser-locale selection recognizes regional variants. Hebrew joins Arabic as a right-to-left interface locale; fetched definition text retains independent automatic direction.
* User-facing terminology: The settings page labels the ordered provider control as “Definition languages” and explains that Slava tries the selected languages in order. All 21 locales use equivalent definition-focused wording rather than implementation-oriented Wiktionary lookup terminology.
* Provider contract: The ordered definition list now supports 21 exact Wiktionary origins. Each new edition has an explicit Russian-section selector, bounded parser behavior, a fixed autonym with `lang` and `dir="auto"`, exact Manifest permission, privacy and store disclosure, schema coverage, and a live canary.
* Parser qualification: Current bounded Action API fixtures cover Hebrew `сила`, Polish `говорить`, Romanian `Россия`, Turkish `говорить`, Italian `говорить`, Kazakh `Россия`, Latvian `Россия`, Estonian `говорить`, and Lithuanian `говорить`. Polish uses its field-marked `znaczenia` definition list; Hebrew uses its direct ordered list; Latvian uses `Skaidrojums`; the remaining editions use bounded part-of-speech allowlists and ordered senses.
* Coverage qualification: Hebrew Wiktionary currently has sparse Cyrillic Russian-entry coverage, so availability varies materially by edition. Missing pages and missing Russian sections continue to advance to the next configured provider.
* Validation: Formatting, strict type-check, lint, 172 unit/data/policy tests, 14 deterministic Chromium scenarios, 21 live provider canaries, packaged Chromium smoke, Firefox compatibility build, SBOM, provenance, zero-vulnerability npm audit, release gates, and two-build reproducibility passed.
* Performance and package: Activation measured 433.4 ms p95 with a 47,523,092-byte maximum heap delta. The 47-file Chrome archive is 10,100,427 bytes compressed and 33,599,471 bytes installed, with SHA-256 `e10ba76ba7bff2f1f92819dfd6cc5fbd45624df02d1a82e06c02bcaef3b3a148`.
* External follow-up: No hosted workflow, push, store upload, or publication was performed.
* Blockers: None.

## Rendering local definition context immediately

* User direction: Show the locally known lemma, grammatical form, aspect, and related aspect forms while online definitions are still loading.
* Definition behavior: After local morphology resolves, the definition card immediately renders every ranked lemma candidate and its available grammar and aspect metadata. Successful online results replace the provisional headings with validated source links and senses; bounded online failures retain the local context instead of replacing it with a bare error.
* Interface copy: All 21 locales use provider-neutral equivalents of “Loading definitions…” rather than exposing Wiktionary as the implementation detail of the pending state.
* Regression coverage: Chromium holds a definition response and verifies that the lemma and grammatical form are visible before any sense list arrives. The timeout scenario addresses the dialog by its stable extension-owned container because the accessible name intentionally changes from the generic dialog label to the resolved lemma.
* Validation: Strict type-check, lint, 21-locale catalog coverage, 172 unit/data/policy tests, and all 14 deterministic Chromium scenarios passed. The activation benchmark remained within its 500 ms latency and 64 MiB heap limits.

## Restoring stress for short participle forms

* Triggering evidence: The pinned Kaikki record for `отданный` contains the stressed short neuter form `о́тдано`, and the dedicated stress index already resolves `отдано` at the first vowel. The morphology builder discarded nested forms from pure form-of entries, so page annotation treated `отдано` as non-interactive and never rendered the available stress.
* Index behavior: Pure form-of pages remain excluded as lexical lemmas, while their explicitly tagged short forms are linked directly to the underlying lexical target. This restores `отдано` → `отдать` without indexing every nested declension form or materially inflating the packaged extension.
* Regression coverage: Unit tests pin both the dedicated stress position and lexical ownership. Chromium verifies that ordinary page text renders `о́тдано` and that deactivation restores the exact source text.

## Supporting English Wiktionary predicatives

* Triggering evidence: English Wiktionary revision `84965088` classifies Russian `должен` under the valid `Predicative` heading. The bounded English parser allowlist omitted that part of speech and returned a parser-drift error despite the ordinary ordered definition list.
* Parser behavior: `Predicative` is now an accepted English Russian-entry part of speech and retains its source heading in the rendered definition.
* Regression coverage: A bounded attributed `должен` fixture pins the current page structure. Detached-parser Chromium coverage requires a successful `Predicative` entry with at least one sense.

## Restoring persistent site grants

* Triggering evidence: Chrome requires `permissions.request()` to run directly within a user gesture. The popup delegated the request to the service worker through runtime messaging, so Chrome rejected the request and the popup reported that persistent access could not be configured.
* Permission behavior: The popup preflights the active page while open, then requests its exact normalized origin as the first asynchronous operation in the button click. Browser-granted optional page origins are authoritative: `permissions.onAdded` configures a new grant even if Chrome closes the popup, and startup adopts already-granted page origins while excluding the fixed Wiktionary providers. The background verifies the active tab before immediate injection and maintains one persistent registered content script across every granted page origin.
* Regression coverage: Background-service tests cover the fallback request path, the normal pre-granted popup path, denial and rollback, startup adoption of a browser-granted page origin, and exclusion of required definition-provider permissions.
* Popup control: The persistent-access button reflects the current site permission. It enables automatic access when absent and revokes the exact site permission, unregisters it from persistent activation, and deactivates the current tab when access is already granted.

## Supporting Chinese Wiktionary function-word sections

* Triggering evidence: Chinese Wiktionary revision `9727807` places Russian `с` definitions under `字母` (letter), `介詞` (preposition), and `前綴` (prefix). The bounded Chinese allowlist omitted these valid headings and returned a parser-drift error.
* Parser behavior: The three headings are explicit accepted Chinese Russian-entry sections and retain their source labels in rendered definitions.
* Regression coverage: A bounded attributed `с` fixture pins the current multi-etymology page. Detached-parser Chromium coverage requires successful preposition and prefix entries with senses.

## Correcting Verb Aspect Ownership and Presentation

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T02`, `P05-T01`, `P05-T02`, `P06-T03`
* Triggering evidence: The pinned Kaikki `разбухать` record includes `разбухнуть` in `forms[]` with the tag `perfective`, while the reciprocal record includes `разбухать` with `imperfective`. The morphology builder accepted both as ordinary paradigm forms, so an exact lookup for `разбухать` returned both lemmas.
* User direction: Fix the duplicate and show grammatical aspect.
* Current design: Aspect-only partner records are excluded from surface ownership and retained as explicit lemma metadata. Local lookup carries aspect and counterpart data to the popup, which renders it once alongside the matching lemma.
* Planned validation: Focused builder and lookup tests, deterministic morphology regeneration, Chromium popup coverage for `разбухать`, full unit/data/policy gates, exact package smoke, and reproducibility.
* Current blockers: None.

## Preserving Cross-Source Stress Ambiguity

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T01`, `P05-T01`, `P05-T02`, `P06-T03`
* Triggering evidence: Kaikki records `го́ду` as dative/partitive and `году́` as locative. The locative stress appears in a form-of entry whose canonical spelling was not retained, while runtime source precedence skipped supplemental evidence whenever the dedicated FSA had one result.
* User direction: In context-free annotation, retain both documented stress positions rather than presenting only `го́ду`.
* Current design: Form-of canonical spellings contribute exact stress evidence without creating reverse lemma relationships. Runtime lookup unions valid positions from dedicated and supplemental sources and marks differing evidence ambiguous, so `году` renders as `го́ду́`.
* Planned validation: Builder regression for both positions, local lookup ambiguity status, page annotation and Chromium rendering, deterministic regeneration, release budgets, reproducibility, and exact packaged smoke.

## Following Explicit Alternative Spellings

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T02`, `P05-T01`, `P05-T02`, `P06-T03`
* Triggering evidence: The exact `сел` page has a verb form-of relation to `сесть` and a separate noun `alt_of` relation to `сёл`. The source policy and builder retained `form_of` but discarded `alt_of`, so the canonical noun page was never requested.
* User direction: Show the definition of `сёл` when looking up `сел`.
* Current design: Preserve the exact `сел` candidate, its ordinary verb lemma, and explicit canonical alternative targets. Alternative relations are one-way and do not make the alternative surface an inflection owned by the canonical lemma.
* Planned validation: Deterministic morphology regression for all three candidates, candidate ordering, Chromium request/render coverage, package budgets, reproducibility, and exact packaged smoke.

## Auditing the Full Kaikki Semantic Surface

* Affected plan markers: `P02-T03`, `P03-T02`, `P05-T01`, `P06-T03`
* User direction: Analyze the complete pinned Kaikki corpus for additional improvement opportunities rather than continuing with isolated examples.
* Audit scope: Stream every record and quantify top-level fields, form `tags`/`source` combinations, sense relationship fields, grammatical metadata, aspect reciprocity, alternative targets, target availability, stress evidence, non-token values, and classes currently admitted or rejected by the builder.
* Decision rule: Implement only generic corrections with direct corpus evidence and user-visible benefit. Record speculative enrichments as follow-up findings rather than expanding the release contract without a caller or test.
* Planned validation: Reconcile audit counts with builder reports, add representative regressions for each accepted class, regenerate deterministic indexes, and rerun the full release gates.

### Corpus evidence: forms are not uniformly inflections

* The pinned source contains 2,914,519 form records across 442,594 entries.
* Explicit sources classify 1,490,540 declension forms, 422,101 conjugation forms, and 1,722 other inflections.
* Unsourced Russian forms include genuine grammatical variants but also lexical relations: 5,719 alternatives, 5,268 relational adjectives, 2,697 feminine counterparts, 2,132 diminutives, 1,140 adverbs, 956 abstract nouns, 937 masculine counterparts, and smaller derivational classes.
* Implementation direction: Keep sourced inflections, canonical forms, ordinary unsourced grammatical forms, and alternatives that point back to a canonical lemma. Exclude derivational/lexical-relative classes such as relational adjectives, gendered noun counterparts, diminutives, adverbs, abstract nouns, augmentatives, pejoratives, demonyms, and clippings from morphology ownership.
* Expected effect: Inputs such as `собачий`, `зонтик`, or `кошка` no longer gain unrelated base-lexeme definitions merely because Kaikki lists a derivational relative under another headword.

### Corpus evidence: some sourced tables are shared across lexemes

* Personal-pronoun records such as `она`, `он`, `мы`, and `себя` each embed the same complete declension table containing `я`, `ты`, every third-person gender, plural pronouns, and their cases.
* Treating every table row as owned by the record headword made common inputs such as `я`, `она`, and `их` resolve to eleven to fifteen unrelated lemma pages.
* The corpus contains explicit inflectional `form_of` targets for individual pronoun and inflected-form pages. Those relations can recover the intended lemma without assigning a shared table to every headword.
* Implementation direction: Ignore noncanonical pronoun table rows and add only `form_of` relations carrying genuine inflection markers such as case, number, person, tense, mood, participle, short-form, or degree. Exclude derivational `form_of` classes such as diminutives and standalone gendered lexical counterparts.

### Corpus evidence: abbreviation alternatives should not fan out

* After pronoun and inflection correction, the only surfaces with more than seven candidates were repeated `л` records resolving to twelve full-form pages such as `ладья`, `лампа`, `латунь`, and `литр`.
* These are abbreviation senses already represented on the exact `л` page, not alternative spellings requiring automatic follow-up.
* Implementation direction: Follow ordinary alternative spellings such as `сел` → `сёл`, but exclude `alt_of` expansion for senses tagged abbreviation, acronym, initialism, letter, morpheme, clipping, or ellipsis.

### Corpus evidence: secondary grave stress is notation, not spelling

* The residual ordinary alternative misses include targets such as `тё̀мно-зелёный`, `ко̀т-д'ивуарский`, `ню̀й-шу`, and `бу̀ти-дэнс`.
* Their combining grave marks represent secondary stress and should be removed by the same spelling-normalization boundary that removes combining acute stress. Diaeresis remains preserved so `ё` is not folded into `е`.

## Completed Kaikki Semantic Remediation

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T02`, `P05-T01`, `P05-T02`, `P06-T03`
* Corpus coverage: The audit streamed all 442,594 pinned Kaikki records and 2,914,519 form records. The generated index retains 999,678 deterministic relations across 411,719 lemmas, with zero semantic reconstruction mismatches.
* Definition candidates: Aspect counterparts no longer become duplicate inflection candidates; lexical/derivational relatives and shared noncanonical pronoun-table rows are excluded; explicit grammatical `form_of` targets and ordinary canonical alternatives remain available; abbreviation-like `alt_of` expansion is suppressed.
* User-visible behavior: `разбухать` renders one definition with `Imperfective · Perfective: разбухнуть`; the counterpart remains a source link and is not fetched automatically. `сел` retains `сел`, `сесть`, and `сёл`. `году` renders context-free ambiguity as `го́ду́`.
* Stress normalization: Combining acute and secondary grave marks are removed from lookup spelling while inherent diaeresis is preserved, so `ё` remains distinct.
* Generated artifact: The morphology package contains 18 files, 26,468,452 installed bytes, an estimated 7,397,046 compressed bytes, and SHA-256 `bcc46688fc902880246dbe495df93b841a0649ad7b9ceb568d3a49301c82c576`.
* Validation: Formatting, strict type-check, lint, 109 unit/data/policy tests, 13 deterministic Chromium tests with four live-only skips, Firefox compatibility, zero npm-audit vulnerabilities, packaged smoke, SBOM generation, package allowlisting, provenance verification, and two byte-identical isolated builds passed.
* Final release artifact: The Chrome ZIP contains 38 files, is 8,031,655 bytes compressed and 27,654,571 bytes installed, and has SHA-256 `d86d11610740f271d7e223c7e3140984f4223af13b0e631985f62d0d974516ba`.
* Reproducibility: Both isolated release builds produced the same output and ZIP digests. The release quality report records 141.9 ms activation p95 and a 31,755,588-byte maximum heap delta.
* Blockers: None.
* Review readiness: Ready.

## Restoring Popup Targets for Unstressed Known Words

* Affected plan markers: `P04-T01`, `P04-T02`, `P05-T02`, `P06-T03`
* Triggering evidence: `PageAnnotator.lookupBatch` retains only stress output and wraps a page token only when `stressed` is non-null. This couples popup eligibility to stress coverage even though local morphology and live surface-form lookup can resolve definitions independently.
* User direction: Explain and fix the missing popup over `от`.
* Implementation direction: Preserve an explicit interaction-eligibility flag when morphology has at least one candidate. Wrap those tokens without changing their visible spelling when stress is missing; continue leaving unknown Cyrillic strings untouched.
* Delivered behavior: `от` remains visibly unchanged, receives a reversible Slava token wrapper, opens from trusted hover, and requests its exact Wiktionary page. Unknown Cyrillic strings remain untouched.
* Validation: Morphology, page annotation, trusted-hover, complete unit/Chromium, packaged smoke, provenance, and reproducibility checks passed.

## Persisting Preferences on Change

* Affected plan markers: `P04-T03`, `P05-T02`, `P06-T03`
* Triggering evidence: The options page updates only on form submission. Selecting French changes the visible control but closing or reopening the page before pressing Save reloads the stored English default.
* User direction: Keep the selected preferred Wiktionary edition when preferences are reopened.
* Implementation direction: Serialize settings writes whenever a preference control changes, retain the Save button for an explicit confirmation path, and expose saving/failure status instead of silently discarding the visible value.
* Delivered behavior: Every preference control queues a serialized storage update with visible saving, success, and failure states; the Save button remains available. Selecting French persists across reload without pressing Save.
* Validation: The Chromium settings scenario, complete deterministic suite, package, provenance, and reproducibility checks passed.

## Preserving Exact-Form Grammatical Analyses

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T02`, `P05-T01`, `P05-T02`, `P06-T03`
* User direction: Store the grammatical tag because its value has low cardinality and can be encoded efficiently.
* Corpus evidence: `сельские` has nominative plural and accusative inanimate plural analyses. `библиотеки` has genitive singular and nominative/accusative plural analyses. Showing only one interpretation would be incorrect without sentence context.
* Implementation: A 395-entry ordered tag-set dictionary supports 1,394,304 packed lemma/analysis relations across 617,376 exact surfaces. Each relation occupies one `uint32`; all assets are range-readable and covered by per-file digests.
* UI behavior: `сельские` renders `Nominative plural; Accusative inanimate plural`. `библиотеки` renders `Nominative plural; Genitive singular; Accusative plural`. Mutually exclusive case tags encoded in one upstream row are split into separate valid analyses, and exact-form candidates own the label to prevent duplicates.
* Size explanation: Exact-form grammar adds 21,344,434 installed bytes. The complete morphology payload is 14,965,211 compressed bytes, below the 15 MiB requirement; the increase over the 13.2 MiB spike is the documented cost of preserving corpus-wide grammatical analyses rather than a corpus snapshot change.
* Validation: Exact eager and lazy reconstruction, ambiguity regressions, popup rendering, deterministic rebuild, size policy, packaged smoke, provenance, and reproducibility passed.

## Final Follow-up Release Evidence

* Affected plan markers: `P02-T03`, `P03-T02`, `P04-T01`, `P04-T02`, `P04-T03`, `P05-T01`, `P05-T02`, `P06-T03`
* Tests: 110 unit/data/policy tests and 13 deterministic Chromium tests passed; four live-only canaries remained intentionally skipped. The packaged smoke test passed.
* Compatibility and quality: Formatting, strict type-check, lint, Firefox compatibility build, SBOM, package allowlist, provenance, zero-vulnerability npm audit, activation budgets, and release gates passed.
* Performance: The 100,000-character activation benchmark measured 187.2 ms p95 and a 38,090,200-byte maximum heap delta, within the 500 ms and 64 MiB limits.
* Release artifact: The Chrome ZIP contains 42 files, is 15,593,609 bytes compressed and 49,101,895 bytes installed, and has SHA-256 `e38f9807345b1ee47c6dc4a63ccbac624178c837f139c6c1f37177a2eafc56b8`.
* Reproducibility: Two isolated builds produced identical output and ZIP digests. The morphology artifact digest is `e552d0a314045431ffb04193eac929735c3cb48b1ed980bcf50296b9b5d36267`.
* Blockers: None.
* Review readiness: Ready.

## Using a Face-Only Toolbar Icon

* Related phase or task: `P07-T01`
* Files:
  * [wxt.config.ts](../../../wxt.config.ts)
  * [public/owl_face_16.png](../../../public/owl_face_16.png)
  * [public/owl_face_32.png](../../../public/owl_face_32.png)
  * [public/owl_face_48.png](../../../public/owl_face_48.png)
  * [data/config/release-policy.json](../../../data/config/release-policy.json)
  * [tests/unit/manifest-policy.test.ts](../../../tests/unit/manifest-policy.test.ts)
* Behavior or functionality changed: Chrome action surfaces now use transparent owl-face crops at every declared density. The full owl remains the extension and store identity icon.
* Validation: Current Chrome build and manifest/release policy tests passed.

## Bounding Candidate Retrieval and Showing Lexical Entries

* Related phase or task: `P07-T02`
* Files:
  * [src/background/definition-service.ts](../../../src/background/definition-service.ts)
  * [src/page/definition-popup.ts](../../../src/page/definition-popup.ts)
  * [tools/build-morphology-index.ts](../../../tools/build-morphology-index.ts)
  * [public/indexes/morphology](../../../public/indexes/morphology)
  * [tests/unit/definition-service.test.ts](../../../tests/unit/definition-service.test.ts)
  * [tests/unit/morphology-index.test.ts](../../../tests/unit/morphology-index.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: Each tab may run at most two independently cancellable definition requests. Candidate batches resolve concurrently but render in deterministic rank order. Pure form pages identified through structured `form_of` senses or Kaikki grammatical-form head templates no longer become remote definition candidates; their stress and exact grammatical analyses remain indexed on lexical lemmas. `угрозы` therefore shows only `угроза`, while genuine alternatives such as `сёл` and `сесть` remain distinct candidates for `сел`.
* Size effect: Removing definition-free form-page lemmas reduced the generated Chrome installation from approximately 49.1 MB to 31.0 MB before packaging.
* Validation: Focused definition-service, morphology reconstruction, source-provenance, index-artifact, and deterministic Chromium definition tests passed.

## Protecting Combining Stress Marks from Host Typography

* Related phase or task: `P07-T03`
* Files:
  * [src/page/page-annotator.ts](../../../src/page/page-annotator.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Initial implementation: Base-plus-combining-acute grapheme clusters remained copyable text and rendered inside an inline-block span with an important local letter-spacing reset.
* Material finding: The CSS-property test passed, but user validation confirmed that some host typography still shapes the combining mark too far right. Declaration-level assertions did not verify the actual accent geometry.
* Revised implementation direction: Keep the combining acute in selectable text but visually hide it, then draw a separate non-text accent centered over the base glyph with inline, page-resistant positioning. Validate base/accent bounding geometry rather than only computed CSS values.
* Additional coverage finding: Baseline conflict keys discarded all stress unless Kaikki contributed a different pattern. Preserve exact Kaikki evidence even when it corroborates the dedicated pattern, so `нефтепродукты` resolves and `поводу` retains both documented positions. Continue suppressing accents on one-vowel words such as `бы`.

## Preserving Temporary Same-Origin Activation

* Related phase or task: `P07-T04`
* Files:
  * [src/background/temporary-tab-service.ts](../../../src/background/temporary-tab-service.ts)
  * [src/background/settings-service.ts](../../../src/background/settings-service.ts)
  * [entrypoints/background.ts](../../../entrypoints/background.ts)
  * [tests/unit/temporary-tab-service.test.ts](../../../tests/unit/temporary-tab-service.test.ts)
  * [tests/unit/settings-service.test.ts](../../../tests/unit/settings-service.test.ts)
* Behavior or functionality changed: Temporary tab activation is recorded in session storage and reinjected after completed same-origin navigation. Cross-origin navigation, explicit deactivation, persistent-site activation, and tab closure clear the record.
* Validation: Focused lifecycle and settings-service unit tests passed.

## Separating Stress and Definition Preferences

* Related phase or task: `P07-T05`
* Files:
  * [src/settings/settings.ts](../../../src/settings/settings.ts)
  * [entrypoints/options/index.html](../../../entrypoints/options/index.html)
  * [entrypoints/options/main.ts](../../../entrypoints/options/main.ts)
  * [entrypoints/page-integration.ts](../../../entrypoints/page-integration.ts)
  * [src/page/page-annotator.ts](../../../src/page/page-annotator.ts)
  * [tests/unit/settings.test.ts](../../../tests/unit/settings.test.ts)
  * [tests/e2e/extension.spec.ts](../../../tests/e2e/extension.spec.ts)
* Behavior or functionality changed: “Show stress marks” and “Show definition popups” persist independently and default to enabled for older stored settings. Definition-only mode keeps original spelling on interactive known words; stress-only mode annotates without definition listeners; disabling both leaves page text unwrapped. Page integration publishes its guard before awaiting settings, preventing duplicate initialization and making early deactivation safe.
* Validation: Settings parsing, persistence, options-page behavior, all three runtime combinations, timeout handling, and atomic startup passed deterministic Chromium coverage.

## Prior Refinement Release Evidence

* Related phase or task: `P07-T06`
* Tests: 112 unit/data/policy tests and 14 deterministic Chromium tests passed; four live-only canaries remained intentionally skipped. The packaged smoke test passed.
* Compatibility and quality: Formatting, strict type-check, lint, Chrome and Firefox builds, SBOM, package allowlist, provenance, zero-vulnerability npm audit, activation budgets, and release gates passed.
* Performance: The 100,000-character activation benchmark measured 361.1 ms p95 and a 48,532,900-byte maximum heap delta, within the 500 ms and 64 MiB limits.
* Release artifact: The Chrome ZIP contains 45 files, is 9,501,811 bytes compressed and 31,040,033 bytes installed, and has SHA-256 `0f9a662f1ec2cbdf9dce8e1095b356427bda9180b40c15cc2521d70522a2023d`.
* Reproducibility: Two isolated builds produced identical output and ZIP digests. The morphology artifact digest is `eff4fa9c243511ba5381779db7612f3d959c008f9a4585d99b5485b28c780e44`.
* Size comparison: The refined ZIP is 6,091,798 bytes smaller and the installed extension is 18,061,862 bytes smaller than the preceding validated package because pure grammatical form pages no longer consume lemma and exception postings.
* Blockers: None.
* Review readiness: Ready.

## Completed Accent and Interaction Corrections

* Related phase or task: `P07-T03`, `P07-T06`
* Triggering evidence: User validation on 2026-10-04 reports that the acute accent remains shifted right after the letter-spacing isolation change.
* Behavior or functionality changed: Host text with non-zero tracking uses a small centered CSS-rendered acute while retaining the combining mark in selectable text; ordinary text keeps the low-overhead native path. Token wrappers prohibit internal line breaks without preventing normal wrapping between words. Supplemental stress postings encode `ё` positions independently under an `е`-folded key, producing `твёрдого` rather than `тве́рдого`. Case-preserving cache keys prevent an earlier `Сильнее` lookup from capitalizing later `сильнее`. Pointer-down, movement, selection-change, and click state suppress definition activation throughout text-selection gestures. Grammatical analyses discard a less-specific subset when a more-specific analysis describes the same form, so `изменилось` shows one neuter singular past indicative label. Options persist on every control change without a save button. The popup states that temporary `activeTab` access follows same-origin links and requires activation or persistent permission on another site.
* Regression coverage: Chromium verifies hostile Georgia italic/tracked typography, a discreet right-rising acute rather than a grave accent, an unbroken `балти́йского` token in a narrow column, exact copied text, `по́воду́`, `нефтепроду́кты`, `твёрдого`, unaccented `бы`, preserved `Сильне́е сильне́е`, deduplicated `изменилось` grammar, reversible source text, and a real pointer drag that opens no popup and leaves subsequent selection behavior normal.
* Tests: 113 unit/data/policy tests and 14 deterministic Chromium tests passed; four live-only canaries remained intentionally skipped. The packaged smoke test passed.
* Compatibility and quality: Formatting, strict type-check, lint, Chrome and Firefox builds, SBOM, package allowlist, provenance, zero-vulnerability npm audit, activation budgets, and release gates passed.
* Performance: The 100,000-character activation benchmark measured 414.9 ms p95 and a 56,604,800-byte maximum heap delta, within the 500 ms and 64 MiB limits.
* Release artifact: The Chrome ZIP contains 45 files, is 9,819,796 bytes compressed and 32,451,875 bytes installed, and has SHA-256 `9f67b95a93461b8af5eed3bc402bcfd7727a41025ef5273b83a3f2e72f9e460b`.
* Reproducibility: Two isolated builds produced identical output and ZIP digests. The morphology artifact digest is `5ed879483e217dd6a77b56b1b631fab09c8a9fee8e59d08f67adf9ec6b3c3e71`.
* Blockers: None.
* Review readiness: Ready.
