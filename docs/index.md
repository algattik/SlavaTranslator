# Slava user guide

## Activate Slava

Open the toolbar popup on the page you want to read. **Activate on this tab** uses Chrome's temporary `activeTab` grant and lasts for the current page context. **Always activate on this site** asks Chrome for persistent access to that exact site origin. The options page lists persistent origins and lets you revoke each one.

Slava annotates ordinary visible Russian text with stress marks. It does not alter text fields, text areas, editable regions, code, preformatted text, hidden content, or a selection you are actively using. **Deactivate on this tab** removes Slava's wrappers and restores the original text.

## Look up a definition

Hold a real pointer over an annotated word for at least 100 ms to open an anchored card showing the exact word form and definitions for every locally resolved lemma. Move away before the delay to cancel it. Click the word, use the keyboard action, or enter a Russian term in the lookup form for the accessible dialog. Synthetic page events cannot authorize a definition request.

Choose and order one or more definition languages in settings. Slava tries their exact Wiktionary hosts from top to bottom and labels a result when a later selection succeeds. Only a missing page or missing Russian entry advances to the next selected language; operational, security, and parser failures stop the lookup. English is not requested unless selected.

Definitions require network access. Slava displays typed failure states for offline access, timeout, Wikimedia throttling, oversized or malformed responses, unexpected redirects or content types, and parser changes. Wikimedia availability and community-edited content are outside Slava's control.

## Accessibility

The definition interface supports keyboard-only use, named controls and dialogs, focus containment and return, Escape dismissal, 200% zoom, high contrast, reduced motion, and larger text. Annotated words do not become thousands of tab stops; lookup follows selection or the dedicated search interface.

## Diagnostics

The options page shows the package version, exact Wiktionary hosts, local-index revisions and digests, integrity state, bounded cache counters, and the last bounded definition error. Exported diagnostics exclude granted site origins, page URLs, surrounding text, browsing history, IP addresses, raw definitions, and lookup history.

## Revoke access or uninstall

Use the options page to revoke a persistent site origin. Chrome's extension settings can also remove site access or uninstall Slava. Uninstalling removes extension settings and grants managed by Chrome. Slava does not operate an account, analytics service, telemetry endpoint, or server-side definition store.

## Limitations

Stress and morphology data can be incomplete, ambiguous, or incorrect. Slava leaves unresolved stress conflicts unchanged rather than guessing. Definition quality and availability vary by edition; German coverage is often sparse. Slava does not guarantee anonymity, API availability, fully offline definitions, perfect linguistic correctness, or absolute security.

For examples of current behavior, see [examples](examples.md). For troubleshooting and recovery, see [support](support.md). For data handling, see the [privacy policy](privacy.md).
