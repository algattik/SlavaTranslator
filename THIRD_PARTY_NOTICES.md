# Third-party notices

## Russian stress data

The packaged stress dictionary is derived from [`zdarsch/russian-stress-marker`](https://github.com/zdarsch/russian-stress-marker) revision `1cd1a1555f01bbbaeebb2d4fd15fe5e9d52c9a37` under the MIT License. The complete license is packaged at `notices/russian-stress-marker.LICENSE.txt`.

## Russian morphology data

The packaged morphology index is derived from the Kaikki English Wiktionary Russian extraction identified as `enwiktionary-2026-09-02_wiktextract-1a05e46_wikitextprocessor-e3d6d4e`, snapshot date 2026-09-28. Kaikki data is extracted from Wiktionary with Wiktextract and is subject to CC BY-SA 4.0 and GFDL terms. Source identity and digests are recorded in `data/generated/source-provenance.json` and the packaged morphology metadata.

## Live Wiktionary definitions

Definitions are retrieved after explicit user action from user-selected English, Russian, Ukrainian, German, French, Spanish, Portuguese, Chinese, Japanese, Korean, Arabic, or Hindi Wiktionary editions. Slava displays the source edition and page link. Wikimedia-hosted content remains subject to the applicable Wikimedia terms and page licensing; it is not relicensed as Slava project code.

## Development dependencies

The release pipeline generates `artifacts/sbom.cdx.json` and verifies installed dependency license expressions against `data/config/release-policy.json`. Development dependencies are not copied into the extension ZIP unless present in compiled output permitted by the package allowlist.
