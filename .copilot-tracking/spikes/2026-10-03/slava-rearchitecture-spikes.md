<!-- markdownlint-disable-file -->
# Slava rearchitecture spike programme

## Purpose

Resolve the architectural unknowns that can invalidate substantial implementation work. Spike code is disposable; measurements, input identities, criteria, findings, and decisions are durable.

## Execution Rules

* Test one architectural unknown per spike.
* Freeze inputs and criteria before execution.
* Use the smallest sample that can falsify the hypothesis.
* Record null, mixed, and invalidating results without converting spike code into production code.
* Re-select the next spike after every result.
* Do not begin a dependent spike until its input contract is frozen.

## Ordered Spike Map

| ID | Decision unblocked | Originating risk | Dependency | Status |
|----|--------------------|------------------|------------|--------|
| S01 | Which source files and fields can supply English, French, German, and Russian definitions, forms, and stresses? | Building the pipeline against the wrong dump, edition, or schema invalidates all data and index work | None | Complete |
| S01B | Can target-edition entries be aligned safely to English fallback groups? | Spelling-only joins can merge unrelated homographs and return wrong fallback definitions | S01 four-edition corpus | Supported with constraints |
| S02 | Which compact read-only key index should the extension package? | A convenient format can exceed package, memory, or latency budgets | S01 frozen representative corpus | Adjust: key-index result available; payload gate added |
| S02A | Which lossless payload representation can approach the package budget? | Definitions and result payload, not key lookup, dominate package size | S02 semantic model | Adjust: representation result available; semantic deduplication gate added |
| S02B | How much can cross-edition grouping and form deduplication reduce size, and where are the product scope boundaries? | Serialization alone cannot meet the provisional package budget | S01 raw corpus and S02A result | Adjust: grouping result available; hot/cold split added |
| S02C | How should the hot stress index and cold definition payload be separated? | Per-form result objects make page marking pay for definition and grammar data it does not use | S01B fallback-aware grouped model | Supported with constraints |
| S02D | Can accent-position outputs in a compact automaton make the hot stress index materially smaller? | S02C proves that a sorted table plus repeated stressed display strings cannot meet the package aspiration | S02C stress semantic map | Complete; source rejected |
| S02E | Can a dedicated curated Russian stress corpus provide the hot index within budget? | Definition-edition forms remain too redundant even after compact output encoding | S02D representation result | Supported with constraints |
| S02F | Can Russian forms share stems and ending paradigms without changing lookup results? | The flat form-to-lemma table is larger than the definition text and repeats related inflections | S02C lemma semantic map | Supported |
| S03 | How should packaged shards be loaded and cached in Chromium? | A compact file format can still perform poorly through extension URLs and browser APIs | S02E stress baseline, S02F morphology index, and cold definitions | Pending |
| S04 | Which DOM annotation strategy is reversible and bounded? | Page mutation can break applications or create unacceptable activation cost | Independent after programme definition | Pending |
| S05 | Which MV3 permission and service-worker lifecycle pattern is reliable? | Optional permissions and worker termination can lose activation or settings state | Independent after programme definition | Pending |

## S01: Source acquisition and parsing

### Decision

Select the exact upstream artifact class and establish whether its records can populate the source, lemma, form, stress, sense, attribution, and quality contracts without parsing Wiktionary HTML.

### Hypothesis

We believe the language-specific post-processed Kaikki JSONL downloads for Russian entries from English, French, German, and Russian Wiktionary contain compatible structured records sufficient for the first-release dictionary contract.

We will test this by sampling five deterministic byte windows from each current file, parsing complete JSONL records, and comparing language identity, top-level schema, definitions, forms, stress-bearing strings, source metadata, and record sizes.

We will know the hypothesis is supported when:

* All three URLs support byte ranges and expose stable `Content-Length`, `Last-Modified`, and `ETag` metadata.
* At least 99.5% of complete sampled lines decode as UTF-8 JSON.
* At least 99.5% of parsed records identify Russian as `lang_code == "ru"`.
* At least 99% contain a non-empty `word`, `pos`, and `senses` field.
* Each edition yields structured definition text without HTML parsing.
* The combined samples contain structured forms and at least one stress-bearing form or headword, or the result explicitly demonstrates that a separate stress source is required.
* Edition-specific field differences can be mapped into one versioned intermediate contract without discarding ambiguity or provenance.

The hypothesis is invalidated when any edition lacks a usable Russian-only artifact, requires whole-dump HTML parsing, cannot provide attributable structured definitions, or has incompatible semantics that cannot be mapped without language-specific product behavior.

### Fixed Inputs

| Edition | Artifact | Snapshot identity before execution |
|---------|----------|------------------------------------|
| English Wiktionary | `https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl` | Kaikki extraction 2026-09-28 from enwiktionary dump 2026-09-02; Wiktextract `1a05e46`; Wikitextprocessor `e3d6d4e` |
| Russian Wiktionary | `https://kaikki.org/ruwiktionary/Русский/kaikki.org-dictionary-Русский.jsonl` | Kaikki extraction 2026-10-02 from ruwiktionary dump 2026-10-01; Wiktextract `1a05e46`; Wikitextprocessor `e3d6d4e` |
| French Wiktionary | `https://kaikki.org/frwiktionary/Russe/kaikki.org-dictionary-Russe.jsonl` | Kaikki extraction 2026-10-02 from frwiktionary dump 2026-10-01; Wiktextract `1a05e46`; Wikitextprocessor `e3d6d4e` |
| German Wiktionary | `https://kaikki.org/dewiktionary/Russisch/kaikki.org-dictionary-Russisch.jsonl` | Kaikki extraction 2026-10-02 from dewiktionary dump 2026-09-01; Wiktextract `1a05e46`; Wikitextprocessor `e3d6d4e` |

Sampling uses 2 MiB windows beginning at 0%, 20%, 40%, 60%, and 80% of each file. Partial first and last lines are excluded. The window positions, response validators, byte counts, line counts, and sample SHA-256 digests are recorded.

### Outputs

* Machine-readable field, coverage, and provenance report.
* Frozen edition-balanced JSONL sample for S02.
* Field mapping and source decision.
* Explicit stress-data disposition: sufficient, partial, or separate-source-required.

### Stop Conditions

* Stop S02 if any edition cannot satisfy structured definition and provenance requirements.
* Narrow or replace the source before continuing if sampled records are not Russian-pure.
* Add a separate stress-source spike before S02 if no edition provides sufficient stress/form evidence.

## S02: Index representation trade study

### Decision

Select one packaged read-only representation for normalized-form lookup and structured payload retrieval.

### Hypothesis

We believe one of three representations can preserve all S01 records and ambiguity while meeting provisional package and warm-lookup budgets without IndexedDB or SQLite/WASM.

### Candidates

1. Prefix-sharded canonical JSON with deterministic Brotli/gzip packaging and in-shard binary search.
2. Sorted UTF-8 key table with fixed-width offsets into compact payload blocks.
3. Finite-state key index with separate deduplicated payload blocks.

### Fixed Method

* Use the identical frozen S01 corpus, normalized keys, payload schema, lookup set, and benchmark host for all candidates.
* Include exact hits, misses, `ё/е`, combining accents, case, hyphens, inflections, homographs, and multi-language payloads.
* Measure generator complexity, deterministic digest, compressed and unpacked bytes, largest shard, cold load, warm p50/p95 lookup, peak heap, and corruption behavior.
* Time-box implementation equally; unsupported candidate-specific optimizations are excluded.

### Decision Criteria

* Zero semantic loss against the frozen corpus.
* Deterministic byte output.
* Provisional complete-corpus projection at or below 12 MB compressed and 30 MB installed, with projection method recorded.
* Warm exact lookup p95 at or below 10 ms on the reference host.
* Bounded lazy loading and explicit integrity failure.
* Select the simplest candidate that meets every hard criterion; do not select by weighted score.

### Stop Conditions

* If no candidate meets the hard criteria, do not optimize indefinitely. Record the failed boundary and return to the architecture decision for IndexedDB, SQLite/WASM, a revised data scope, or revised measured budgets.

## S03: Chromium packaged-shard loading

### Decision

Choose the browser loading, caching, and context ownership pattern for the S02 representation.

### Hypothesis

We believe packaged extension URLs plus bounded in-memory caching can meet popup-ready, page-batch, and memory budgets across service-worker restarts without copying the dictionary into IndexedDB.

### Method and Criteria

* Load the exact S02 representation through an unpacked MV3 extension in Playwright Chromium.
* Compare lookup ownership in the service worker and content context only where both are valid.
* Measure first lookup, warm lookup, 100-word page batch, worker restart, cache recovery, peak heap, and corrupt/missing shard behavior.
* Support requires popup-ready p95 at or below 50 ms, warm exact lookup p95 at or below 10 ms, bounded cache growth, no startup copy, and explicit failure.

## S04: Reversible DOM annotation

### Decision

Select a bounded text-node annotation and teardown strategy.

### Hypothesis

We believe incremental text-node processing with explicit node ownership can mark supported Russian text, survive SPA mutation, and restore the page without replacing HTML or adding token tab stops.

### Method and Criteria

* Compare range/wrapper and text-node replacement-with-ledger approaches on static, dynamic, hostile CSS, selection, iframe, shadow DOM, content-editable, and high-mutation fixtures.
* Measure activation time, mutation work, node growth, teardown equality, event-handler preservation, selection behavior, and tab order.
* Require idempotent activation/teardown, zero normal-tab-order additions, preserved fixture handlers/state, and bounded behavior under the declared page limits.

## S05: MV3 permission and worker lifecycle

### Decision

Select the optional-host permission, registration, storage, and recovery pattern.

### Hypothesis

We believe `activeTab`, `scripting`, `storage`, optional host permissions, and synchronous service-worker listener registration can preserve current-tab and per-site behavior across worker termination without `<all_urls>`.

### Method and Criteria

* Exercise temporary activation, grant, denial, revoke, browser restart, worker termination, SPA navigation, unsupported schemes, and teardown in Playwright Chromium.
* Require no required host permissions, no worker-global authoritative state, correct restore/revoke behavior, and no developer-controlled network request.

## Result Log

| Spike | Verdict | Decision | Evidence |
|-------|---------|----------|----------|
| S01 | Supported with constraints | Use language-specific post-processed Kaikki JSONL for all four editions; normalize edition-specific fields through one intermediate contract; do not use German as a stress authority | Complete German file: 3,771/3,771 records parsed, 100% Russian purity, 98.04% structured-gloss coverage, 97.93% forms coverage, 4.99% stress coverage; canonical sample SHA-256 `45560bb2b15dc4a120f649a59dda918df0908246512e95024a14dba2f0006ec4` |
| S01B | Supported with constraints | Use normalized headword plus part of speech only as an ambiguity-preserving storage and fallback bucket; retain every child entry; if the bucket has any eligible target definitions show all target children, otherwise show all eligible English children with `fallbackUsed`; claim no sense-level equivalence | Complete English stream: 442,594 records, 431,676 groups, SHA-256 `eab01279fe888f4fedf044350e04f8f619dd34bbd325ca186b0017e595ad3b6b`; complete German edition provides target definitions for 3,326 English groups (0.7705%) and leaves 428,280 defined English groups using fallback; 415 German/English high-risk review candidates demonstrate that same spelling and POS can contain multiple non-corresponding child entries |
| S02 | Adjust | Carry the sorted key/offset table into S03 as the provisional key index; do not finalize the package format until S02A addresses payload size | All candidates returned zero mismatches over 10,000 queries. Sorted table: 1,383,352 index bytes, 885,414-byte sample ZIP, p95 0.0045 ms in CPython. JSON shards: 616 files and 889,728-byte ZIP. Minimal DAWG was larger and slower. Shared payload was 532,415 compressed bytes; linear full-corpus projection was approximately 157 MB for the sorted-table package |
| S02A | Adjust | Use positional JSON as the provisional payload encoding; run semantic grouping/scope analysis before accepting a package budget | All candidates round-tripped without semantic loss. Tuple JSON produced a 795,122-byte sample ZIP and approximately 141 MB linear projection. Object JSON projected near 157 MB. Binary string tables reduced installed bytes but compressed worse, projecting near 174 MB |
| S02B | Adjust | Preserve grouping for definition payloads, but replace per-form result objects with purpose-specific hot and cold indexes | Grouping retained all 6,000 source entries and 8,857 definitions, reduced 54,349 results to 52,583, and yielded an 813,032-byte all-definition sample ZIP. Linear projections remained approximately 144 MB all-language, 124 MB English-definition, and 115 MB for the incorrectly rich “stress-only” model |
| S02C | Supported with constraints | Keep physically separate hot stress and cold definition packages, but reject the tested sorted-table/full-display stress representation | Four-edition 8,000-record sample: stress ZIP 405,360 bytes and linear projection 54,204,131 bytes; definitions ZIP 573,284 bytes and projection 76,658,677 bytes; combined projection 130,859,866 bytes; German sample SHA-256 `657a6d8c29033926a593f90cacd2dea9678f705140ea23c9ca486a15c26ccf51` |
| S02D | Does not meet threshold | Retain the minimal DAWG plus accent-position output pattern as a viable codec, but reject the four definition editions as the hot stress source | Zero mismatches over 30,029 keys; 172 reusable output patterns; deterministic two-build SHA-256 `d71003f5bc512f90ee6504ce51c551be04e457b2c851d775d21f99bbd0900331`; DAWG ZIP 183,680 bytes and linear projection 24,561,414 bytes versus sorted-output-ID ZIP 192,113 bytes and projection 25,689,062 bytes |
| S02E | Supported with constraints | Use the MIT Russian Stress Marker FSA as a compact hot baseline only; do not treat it as complete or authoritative for homographs, secondary stress, or disagreements; supplement reviewed exceptions or leave uncertain words unchanged | Revision `1cd1a1555f01bbbaeebb2d4fd15fe5e9d52c9a37`; dictionary 721,732 bytes, deterministic ZIP 517,442 bytes, SHA-256 `a0ae40ae0e3f4b1c7b0513afee4168178be60b72667e71691ac3be3e6d1d06ae`; 14,077/30,029 Kaikki stress keys hit (46.88%), 13,623 exact (45.37%), 454 conflicts, 15,952 missing; 57.0 µs mean CPython reference lookup |
| S02F | Supported | Filter lookup surfaces to Russian words, then store reusable stem-plus-ending paradigms with a flat exception table; preserve every ambiguous group mapping exactly | 31,601 Russian lookup keys and 2,700 ambiguous keys reproduced with zero mismatches; best candidate ZIP 98,881 bytes versus 264,218-byte filtered flat baseline, a 62.6% reduction; projected 13,222,219 bytes compressed and 49,718,410 bytes installed; 2,668 groups use 588 paradigms, 4,443 groups remain exceptions; deterministic SHA-256 `0933ebef93a701a65bfbb283d578af05eaeef72b5ab629877ebf80fcab57ebc0` |
| S03 | Pending | Pending | Pending |
| S04 | Pending | Pending | Pending |
| S05 | Pending | Pending | Pending |

### S01 Findings

* The English, French, and Russian language-specific files support byte ranges and expose `Content-Length`, `Last-Modified`, and `ETag`; German exposes the same headers and is being added to the sample.
* The current complete file sizes are 944,699,204 bytes for English definitions, 185,104,012 bytes for French definitions, 6,628,903 bytes for German definitions, and 1,797,108,984 bytes for Russian definitions.
* The German file was parsed in full rather than by windows. It contains 3,771 records and 3,703 normalized headword-plus-POS groups.
* German has excellent definition coverage but very sparse corpus coverage relative to English: only 3,326 of 431,676 English groups have a German definition under the selected bucket key. A German target therefore uses English fallback for approximately 99.23% of English groups in the current snapshots.
* All complete sampled lines parsed successfully and all sampled records identify Russian.
* `word`, `lang`, `lang_code`, `pos`, and `senses` are present in every sampled record.
* Definitions are consistently available as structured sense glosses, but some records legitimately have no gloss and must be accounted for rather than treated as parser failure.
* Forms and stresses are strongest in the English edition, substantial in the Russian edition, and partial in the French edition. The union is viable, but stress authority and conflict handling must be tested explicitly rather than assuming the editions are equivalent.
* Edition schemas differ: English uses fields such as `etymology_text`, `head_templates`, and form `source`; Russian and French commonly use `etymology_texts`, and tag/raw-tag conventions differ. The production intermediate contract must map meanings, not copy top-level fields wholesale.
* The earlier three-edition S02 corpus and its size results are retained as provisional evidence but are superseded for final decisions by the four-edition, fallback-aware corpus.

## S01B: Target-language to English fallback alignment

### Decision

Define an ambiguity-preserving cross-edition key that can determine whether a French, German, or Russian definition is available for an English fallback group.

### Hypothesis

We believe normalized headword plus compatible part of speech, morphology, and explicit ambiguity preservation can create useful target/English groups without asserting one-to-one sense equivalence.

### Method and Criteria

* Use the complete German subset and deterministic samples from English, French, and Russian.
* Build candidate groups using progressively stronger keys: normalized headword; headword plus part of speech; headword plus part of speech and compatible morphology.
* Review a stratified corpus of matches, target-only entries, English-only entries, homographs, multiple etymologies, and conflicting parts of speech.
* The runtime rule is group-level: if any eligible target-edition entry exists in the selected aligned group, return all preserved target alternatives; otherwise return all preserved English alternatives and set `fallbackUsed`.
* Never merge child entries or claim sense-level translation equivalence.
* Success requires zero false merges in the reviewed high-risk corpus, deterministic grouping, explicit unmatched records, and stable ambiguity counts.

### Stop Conditions

* If safe automatic grouping cannot be demonstrated, do not implement silent fallback. Use side-by-side target and English alternatives with explicit source labels, or obtain a user decision for a narrower fallback contract.

### Result

Supported with constraints.

* Normalized headword plus part of speech is acceptable as a storage and fallback bucket, not as proof that child senses are translations.
* The runtime must retain all target and English child entries separately. It may select the target edition or English fallback at bucket level but may not pair, merge, or deduplicate cross-edition senses.
* The complete English stream contained 442,594 records and 431,676 groups. The complete German edition aligned to 3,330 English candidate groups, of which 3,326 had German definitions.
* The German target covers 0.7705% of English groups; 428,280 defined English groups use fallback. This is a product-coverage limitation, not a parser failure.
* High-risk examples such as `аба`, `абаз`, and `абаза` show multiple English homographs or inflected-form entries under the same normalized word and part of speech. Child-count or ordering alignment would be unsafe.
* French and Russian target-coverage percentages remain provisional because their target inputs were deterministic 2,000-record samples; this does not affect the selected no-sense-alignment contract.

### S02 Findings

* The fixed corpus produced 6,000 lemmas, 54,349 lemma/form results, 32,792 normalized keys, and 10,340 ambiguous keys.
* All three candidates returned zero semantic mismatches for 8,000 hits and 2,000 misses.
* The sorted key/offset table is the provisional winner because it uses three files, has the smallest sample ZIP, has comparable warm lookup to JSON, and is simpler than the DAWG.
* Prefix-sharded JSON has slightly lower installed bytes but creates 616 files on the sample; the full corpus would create package and request-management overhead without a material compressed-size benefit.
* The minimal DAWG is rejected for the current contract: postings prevent useful suffix merging, producing a larger index and slower lookup than the sorted table.
* Index choice is not the main package-size lever. The sample's common lemma/result payload contributes 532,415 compressed bytes before the index, and the first-pass record-count estimate is approximately 1,065,977 full-corpus entries.
* Linear projection places the sorted-table package near 157 MB compressed. This estimate is not a release budget, but it invalidates proceeding directly to browser loading under the current 12 MB assumption.

## S02A: Lossless payload compaction and scope boundary

### Decision

Determine the smallest lossless representation of the S02 semantic payload and whether the three-edition/all-definition scope can plausibly meet a revised package budget.

### Hypothesis

We believe deduplicated strings and compact typed tables can materially reduce the definition/result payload while preserving every lemma, form, tag, definition, language, and ambiguity in the frozen corpus.

### Candidates

1. Canonical object JSON baseline.
2. Positional tuple JSON with short manifests and no repeated property names.
3. Binary columnar tables with one deduplicated UTF-8 string table, fixed-width lemma/result rows, and offset/count arrays for definitions and tags.

### Fixed Method and Criteria

* Reuse the exact S02 semantic model and sorted key index.
* Round-trip each candidate to the same canonical lemma/result objects; any mismatch rejects the candidate.
* Measure raw payload bytes, deterministic ZIP contribution, complete sample package bytes, per-edition definition characters, unique-string ratio, and linear full-corpus projection.
* Preserve all definitions; truncation, edition removal, and lossy summarization are diagnostic projections only and cannot win without a new user scope decision.
* Select the simplest lossless candidate with the smallest package contribution when its complexity has a material payoff.

### Stop Conditions

* If every lossless candidate projects far above the current package budget, stop format tuning and return a quantified product decision: revise the package budget, revise the bundled definition scope, or split the product architecture.

### S02A Findings

* Positional tuple JSON is the best provisional lossless payload representation because ordinary ZIP compression already removes repeated JSON syntax and strings effectively.
* The binary string table reduced sample installed bytes from 6.75 MB to 4.35 MB but increased the sample ZIP from 885 KB to 981 KB.
* Tuple JSON reduced the sample ZIP to 795 KB but still projected to approximately 141 MB for the estimated full corpus.
* Only 24.9% of sampled string occurrences are unique, but the remaining unique definition text still dominates enough that serialization changes cannot recover an order of magnitude.

## S02B: Cross-edition grouping and scope projections

### Decision

Determine whether a semantically grouped data model can retain all edition entries and ambiguity while materially reducing duplicate lemmas/forms, and quantify the package boundaries for all definitions, English definitions only, and stress marking only.

### Hypothesis

We believe grouping records by normalized headword and part of speech, while retaining every edition record as a distinct child entry, can deduplicate shared forms and display strings without collapsing homographs.

### Method and Criteria

* Build groups by normalized headword plus part of speech. Never merge or discard child edition records or their definitions.
* Union identical form/display/tag results within each group while preserving distinct stressed displays and tags.
* Generate deterministic tuple JSON plus the sorted key/offset table.
* Round-trip and count every source record, definition, grouped entry, form result, and lookup posting.
* Measure three diagnostic scopes:
  * all English, French, and Russian definitions plus unioned stress/forms;
  * English definitions plus unioned stress/forms from all editions;
  * stress/form lookup only.
* Scope diagnostics do not change the confirmed product decision. They provide the quantified choices required if the all-definition scope misses the package boundary.

### Stop Conditions

* If lossless grouping remains far above the provisional package budget, stop payload-format experimentation. The next step is a user-owned product decision, not another codec.

### S02B Findings

* The balanced sample contains 5,668 normalized headword/part-of-speech groups; 274 groups contain multiple edition or homograph entries.
* Grouping retains every source entry and definition, while deduplicating 1,766 form-result objects.
* The all-definition package projection remains approximately 144 MB. English definitions only project near 124 MB.
* The first stress-only diagnostic was invalid because it retained lemma groups, grammar tags, and per-form result objects. It does not represent the compact page-marking index and cannot support a product decision.

## S02C: Split hot stress and cold definition indexes

### Decision

Determine whether page stress marking can use a compact independent index while definitions remain in separately loaded lemma shards.

### Hypothesis

We believe the hot path needs only normalized form → stressed display alternatives, while definition lookup can use normalized form → lemma-group IDs and load multilingual definition payloads only on demand.

### Method and Criteria

* Build a stress map containing only forms with explicit combining stress or `ё`, preserving every distinct stressed display alternative.
* Build a lemma-link map from every normalized form to all matching grouped lemma IDs.
* Store grouped edition entries/definitions separately from both indexes; the final four-edition model must retain English fallback groups and French, German, and Russian target groups without sense-level merging.
* Measure deterministic ZIP and installed bytes for the stress layer, definition layer, and combined sample.
* Report lookup coverage, ambiguous stress keys, ambiguous lemma keys, and linear projections separately.
* This spike does not remove grammatical tags from the product contract; it determines whether they belong in a third cold relation table rather than the hot stress index.

### Stop Conditions

* If the dedicated stress map still cannot plausibly meet the original package target, revisit the source and stress representation.
* If definitions dominate while the stress map is compact, stop index-codec experiments and return a quantified package/scope decision for definitions.

### Result

Supported with constraints.

* Physical separation is retained: page marking loads only the stress package, while explicit dictionary lookup loads the lemma index and multilingual definition groups.
* The tested hot representation is rejected. Its sorted UTF-8 key table points to repeated stressed display strings and projects to approximately 54.2 MB compressed.
* The cold definition package projects to approximately 76.7 MB compressed and the combined package to approximately 130.9 MB.
* The projection is moderate-to-low confidence because it scales an equal 2,000-record sample from each edition even though the complete German edition is much smaller. It is still sufficient to reject the 12 MB total-package assumption and the tested hot representation.
* S02D must encode accent positions rather than complete display strings and compare a compact automaton with the sorted-table baseline.

## S02D: Compact hot stress automaton

### Decision

Choose the representation for normalized Russian surface form to one or more stress positions.

### Hypothesis

We believe storing accent positions as small reusable outputs in a minimal byte-level automaton will compress substantially better than the S02C sorted key table plus repeated stressed strings while preserving every ambiguous stress position.

### Candidates

* Sorted UTF-8 key table with output-pattern IDs.
* Minimal byte-level DAWG with output-pattern IDs on final states.

### Fixed Inputs

* The exact four-edition S02C stress semantic map.
* Normalization remains NFD → remove U+0301 → NFC → casefold, with `ё` distinct from `е`.
* Output patterns contain Unicode code-point stress positions; `ё` is recoverable from the normalized key and is not duplicated as a display string.

### Acceptance Criteria

* Exact semantic round-trip for every sampled key and every ambiguous stress pattern.
* Deterministic byte-identical output across two builds.
* At least 70% compressed-size reduction from the S02C 405,360-byte sample stress ZIP, or a projected complete hot package below 12 MB.
* Lookup design remains implementable without WebAssembly or runtime data transformation.

### Stop Conditions

* If neither representation meets the threshold, treat a dedicated curated stress source or an extension-package size increase as a user-owned architecture decision.

### Result

Does not meet the threshold.

* Both candidates round-tripped all 30,029 stress keys with zero mismatches and produced byte-identical archives across two builds.
* The minimal DAWG won at 183,680 compressed bytes, a 54.7% reduction from S02C's 405,360-byte stress ZIP.
* Its linear full-corpus projection is approximately 24.6 MB, so the four definition editions remain unsuitable as the hot page-marking source.
* The codec is retained for S02E because a curated corpus with less redundant morphology may still fit comfortably.

## S02E: Dedicated stress-source benchmark

### Decision

Choose whether the hot page-marking index should be built from a dedicated curated Russian stress corpus rather than unioning forms from definition editions.

### Hypothesis

We believe a reviewed dedicated source can provide materially broader and smaller stress coverage because it encodes one normalized form-to-stress relation without multilingual definition payload structure or duplicate morphology.

### Fixed Inputs

* The public Russian Stress Marker corpus/FSA evidence recorded as research source W6.
* The S02D minimal DAWG plus accent-position output codec.
* A compatibility sample against Kaikki forms and the golden ambiguity corpus.

### Acceptance Criteria

* Source license and redistribution terms are recorded and compatible with the release.
* Exact source digest, record count, malformed/conflicting record accounting, and deterministic build output are recorded.
* The complete compressed hot index is at most 5 MB, leaving package budget for code and cold definitions.
* Coverage and disagreement against the definition-edition stress evidence are quantified; conflicts remain explicit rather than silently overwritten.

### Stop Conditions

* If no compatible dedicated source meets coverage, licensing, and size thresholds, return a user-owned choice between a larger hot index, narrower page marking, or a separate product architecture.

### Result

Supported with constraints.

* The source is MIT-licensed and the complete dictionary is 721,732 bytes raw and 517,442 bytes in a deterministic ZIP, comfortably below the 5 MB hot-index threshold.
* It hit 14,077 of 30,029 stress-bearing Kaikki sample keys. Of those, 13,623 matched the same stress-position pattern and 454 disagreed.
* Several disagreements are explainable policy differences: the dedicated source marks secondary stress in compounds such as `автопортрет`, while Kaikki records only the primary accent; it deliberately leaves homographs unstressed, while Kaikki may expose multiple alternatives.
* It cannot be the sole correctness authority. The runtime contract is: use reviewed unambiguous FSA results; retain explicit supplemental alternatives where evidence agrees they are valid; leave unresolved conflicts and homographs unchanged rather than guessing.
* The hot package is no longer the total-size blocker. S02F subsequently separates the cold definition text from the form index and reduces the total all-bundled projection to approximately 46 MB compressed.

## S02F: Stem and ending-paradigm morphology index

### Decision

Determine whether the local surface-form-to-lemma index can share Russian stems and reusable ending sets instead of storing every inflected form independently.

### Hypothesis

We believe Russian page-word lookup can use a hybrid stem-plus-paradigm index with a flat exception table and reproduce the existing form-to-group relation exactly.

### Method and Criteria

* Exclude romanizations, transcriptions, multiword strings, symbols, and other non-Russian surfaces that the page tokenizer cannot query.
* Group records by normalized headword plus part of speech, preserving all ambiguous group IDs.
* Derive the longest common stem for each group's observed Russian forms and deduplicate identical suffix sets as paradigms.
* Retain singleton, irregular, and short-stem groups in a flat exception table.
* Compare minimum stem lengths from one through four characters.
* Reconstruct every form-to-group posting and require zero semantic mismatches.
* Build each candidate twice and require byte-identical output.

### Result

Supported.

* Filtering removed 8,661 non-Russian helper forms and 408 non-Russian headwords from the page-word index. This reduces the exact flat baseline projection from approximately 44.0 MB to 35.3 MB compressed.
* The one-character-minimum hybrid encoded 2,668 of 7,111 groups through 588 reusable paradigms; 4,443 singleton or irregular groups remained explicit exceptions.
* The candidate reproduced all 31,601 lookup keys, including 2,700 ambiguous keys, with zero mismatches.
* Its sample ZIP is 98,881 bytes versus 264,218 bytes for the filtered flat baseline, a 62.6% reduction. The linear projection is approximately 13.2 MB compressed and 49.7 MB installed.
* Two builds produced the same SHA-256 `0933ebef93a701a65bfbb283d578af05eaeef72b5ab629877ebf80fcab57ebc0`.
* Runtime lookup must enumerate matching stored stems and verify the observed suffix against the referenced paradigm; S03 must benchmark this path in Chromium.
