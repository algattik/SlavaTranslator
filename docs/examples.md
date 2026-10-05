# Behavior examples

| Situation | Slava behavior |
|-----------|----------------|
| A known unambiguous stress form such as `говорил` | Displays the reviewed stressed form from the packaged stress index. |
| A grammatical form that shares a lemma with many endings | Uses the packaged stem/paradigm morphology index to find the lemma without storing a separate full definition for every form. |
| `ё` in a word | Treats `ё` as inherently stressed. |
| A homograph or source conflict | Shows each valid lemma definition and leaves unresolved page stress unchanged rather than guessing. |
| A selected definition edition with no usable Russian entry | Tries the next user-selected edition and labels a result from a later selection as fallback. |
| Offline, timeout, throttling, malformed content, unexpected redirect, or parser drift | Shows the specific failure and does not present an empty result as success. |
| Holding a real pointer over an annotated word for at least 100 ms | Opens an anchored card for the exact surface form and requests each locally resolved lemma from the selected Wiktionary edition. |
| Text inside an input, editable region, code block, hidden element, or active selection | Leaves it unchanged. |
| Deactivation | Restores the original page text. |

Definitions are text-only reductions of the selected Wiktionary page and include a source link. Slava does not insert remote HTML into the page.
