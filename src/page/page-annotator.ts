import type { RuntimeRequest, RuntimeResponse } from "../contracts/messages";

const TOKEN_PATTERN =
  /[\p{Script=Cyrillic}\p{Mark}]+(?:[-'’][\p{Script=Cyrillic}\p{Mark}]+)*/gu;
const OWNED_ATTRIBUTE = "data-slava-token";
const ORIGINAL_ATTRIBUTE = "data-slava-original";
const STRESSED_GRAPHEME_ATTRIBUTE = "data-slava-stressed-grapheme";
const STRESS_COPY_MARK_ATTRIBUTE = "data-slava-stress-copy-mark";
const POSITIONED_STRESS_ATTRIBUTE = "data-slava-positioned-stress";
const EXCLUDED_ELEMENTS = new Set([
  "BUTTON",
  "CODE",
  "INPUT",
  "KBD",
  "OPTION",
  "PRE",
  "SAMP",
  "SCRIPT",
  "SELECT",
  "STYLE",
  "TEXTAREA",
]);
const NODE_BATCH_SIZE = 250;
const LOOKUP_BATCH_SIZE = 128;

interface LocalLookupResult {
  token: string;
  stressed: string | null;
  interactive: boolean;
}

function appendTokenText(
  document: Document,
  container: HTMLElement,
  value: string,
  positionStress: boolean,
): void {
  const graphemes = value.match(/\P{Mark}\p{Mark}*|\p{Mark}+/gu) ?? [value];
  for (const grapheme of graphemes) {
    if (!grapheme.includes("\u0301")) {
      container.append(grapheme);
      continue;
    }
    const stressed = document.createElement("span");
    stressed.setAttribute(STRESSED_GRAPHEME_ATTRIBUTE, "");
    stressed.style.setProperty("display", "inline-block", "important");
    stressed.style.setProperty("letter-spacing", "0px", "important");
    if (!positionStress) {
      stressed.textContent = grapheme;
      container.append(stressed);
      continue;
    }
    stressed.setAttribute(POSITIONED_STRESS_ATTRIBUTE, "");
    stressed.style.setProperty(
      "background-image",
      "linear-gradient(115deg, transparent 42%, currentcolor 43%, currentcolor 57%, transparent 58%)",
      "important",
    );
    stressed.style.setProperty(
      "background-position",
      "center top",
      "important",
    );
    stressed.style.setProperty("background-repeat", "no-repeat", "important");
    stressed.style.setProperty("background-size", "0.22em 0.24em", "important");
    stressed.style.setProperty("position", "relative", "important");
    stressed.append(grapheme.replaceAll("\u0301", ""));
    const copyMark = document.createElement("span");
    copyMark.setAttribute(STRESS_COPY_MARK_ATTRIBUTE, "");
    copyMark.style.setProperty("font-size", "0", "important");
    copyMark.style.setProperty("height", "0", "important");
    copyMark.style.setProperty("line-height", "0", "important");
    copyMark.style.setProperty("opacity", "0", "important");
    copyMark.style.setProperty("overflow", "hidden", "important");
    copyMark.style.setProperty("position", "absolute", "important");
    copyMark.style.setProperty("width", "0", "important");
    copyMark.textContent = "\u0301";
    stressed.append(copyMark);
    container.append(stressed);
  }
}

function hasHostTracking(node: Text): boolean {
  const parent = node.parentElement;
  if (parent === null) {
    return false;
  }
  const letterSpacing = getComputedStyle(parent).letterSpacing;
  return letterSpacing !== "normal" && Number.parseFloat(letterSpacing) !== 0;
}

export interface PageAnnotatorDependencies {
  sendMessage(request: RuntimeRequest): Promise<RuntimeResponse | undefined>;
  createRequestId(): string;
  showStressMarks?: boolean;
}

function isElementHidden(element: Element): boolean {
  if (
    element.hasAttribute("hidden") ||
    element.hasAttribute("inert") ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return true;
  }
  const style = getComputedStyle(element);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.contentVisibility === "hidden"
  );
}

function selectionIntersects(node: Text): boolean {
  const selection = node.ownerDocument.getSelection();
  if (selection === null || selection.isCollapsed) {
    return false;
  }
  for (let index = 0; index < selection.rangeCount; index++) {
    try {
      if (selection.getRangeAt(index).intersectsNode(node)) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function isEligibleTextNode(node: Text): boolean {
  if (
    !node.isConnected ||
    node.data.length === 0 ||
    node.ownerDocument.designMode === "on" ||
    selectionIntersects(node)
  ) {
    return false;
  }
  let element = node.parentElement;
  while (element !== null) {
    if (
      EXCLUDED_ELEMENTS.has(element.tagName) ||
      element.hasAttribute(OWNED_ATTRIBUTE) ||
      element.hasAttribute("data-slava-root") ||
      element.matches("[contenteditable]:not([contenteditable='false'])") ||
      isElementHidden(element)
    ) {
      return false;
    }
    element = element.parentElement;
  }
  return true;
}

function extractTokens(value: string): string[] {
  return [...value.matchAll(TOKEN_PATTERN)].map((match) => match[0] ?? "");
}

export class PageAnnotator {
  private readonly pendingNodes = new Set<Text>();
  private readonly lookupCache = new Map<string, LocalLookupResult>();
  private observer: MutationObserver | null = null;
  private scheduledTimer: number | null = null;
  private stopped = true;

  constructor(
    private readonly document: Document,
    private readonly dependencies: PageAnnotatorDependencies,
  ) {}

  start(): void {
    if (!this.stopped || this.document.body === null) {
      return;
    }
    this.stopped = false;
    this.enqueueSubtree(this.document.body);
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "characterData" &&
          mutation.target instanceof Text
        ) {
          this.pendingNodes.add(mutation.target);
        }
        for (const added of mutation.addedNodes) {
          this.enqueueSubtree(added);
        }
      }
      this.schedule();
    });
    this.observer.observe(this.document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    this.schedule();
  }

  deactivate(): void {
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    if (this.scheduledTimer !== null) {
      window.clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    this.pendingNodes.clear();
    this.lookupCache.clear();
    const parents = new Set<Node>();
    for (const element of this.document.querySelectorAll<HTMLElement>(
      `[${OWNED_ATTRIBUTE}]`,
    )) {
      const parent = element.parentNode;
      if (parent !== null) {
        parents.add(parent);
      }
      element.replaceWith(
        this.document.createTextNode(
          element.getAttribute(ORIGINAL_ATTRIBUTE) ?? element.textContent ?? "",
        ),
      );
    }
    for (const parent of parents) {
      parent.normalize();
    }
  }

  private enqueueSubtree(root: Node): void {
    if (root instanceof Text) {
      this.pendingNodes.add(root);
      return;
    }
    if (!(root instanceof Element)) {
      return;
    }
    const walker = this.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current !== null) {
      if (current instanceof Text) {
        this.pendingNodes.add(current);
      }
      current = walker.nextNode();
    }
  }

  private schedule(): void {
    if (
      this.stopped ||
      this.scheduledTimer !== null ||
      this.pendingNodes.size === 0
    ) {
      return;
    }
    this.scheduledTimer = window.setTimeout(() => {
      this.scheduledTimer = null;
      void this.processBatch().catch((error: unknown) => {
        console.error("Slava page annotation failed", error);
      });
    });
  }

  private async processBatch(): Promise<void> {
    const nodes = [...this.pendingNodes].slice(0, NODE_BATCH_SIZE);
    for (const node of nodes) {
      this.pendingNodes.delete(node);
    }
    const tokens = [
      ...new Set(
        nodes
          .filter(isEligibleTextNode)
          .flatMap((node) => extractTokens(node.data))
          .filter((token) => /\p{Script=Cyrillic}/u.test(token)),
      ),
    ];
    await this.ensureLookups(tokens);
    if (this.stopped) {
      return;
    }
    for (const node of nodes) {
      this.annotateNode(node);
    }
    this.schedule();
  }

  private async ensureLookups(tokens: string[]): Promise<void> {
    const uncached = tokens.filter((token) => !this.lookupCache.has(token));
    for (
      let offset = 0;
      offset < uncached.length;
      offset += LOOKUP_BATCH_SIZE
    ) {
      const batch = uncached.slice(offset, offset + LOOKUP_BATCH_SIZE);
      const results = await this.lookupBatch(batch);
      const resultByToken = new Map(
        results.map((result) => [result.token, result]),
      );
      for (const token of batch) {
        this.lookupCache.set(
          token,
          resultByToken.get(token) ?? {
            token,
            stressed: null,
            interactive: false,
          },
        );
      }
    }
  }

  private async lookupBatch(tokens: string[]): Promise<LocalLookupResult[]> {
    if (tokens.length === 0) {
      return [];
    }
    const response = await this.dependencies.sendMessage({
      kind: "local.lookup-batch",
      requestId: this.dependencies.createRequestId(),
      tokens,
    });
    if (response?.kind !== "local.batch-result") {
      return tokens.map((token) => ({
        token,
        stressed: null,
        interactive: false,
      }));
    }
    return response.results.map(({ token, morphology, stress }) => ({
      token,
      interactive: morphology.candidates.length > 0,
      stressed:
        stress.status === "resolved" || stress.status === "ambiguous"
          ? (stress.candidates[0]?.stressed ?? null)
          : null,
    }));
  }

  private annotateNode(node: Text): void {
    if (!isEligibleTextNode(node)) {
      return;
    }
    const original = node.data;
    const matches = [...original.matchAll(TOKEN_PATTERN)];
    if (matches.length === 0) {
      return;
    }
    const fragment = this.document.createDocumentFragment();
    const positionStress = hasHostTracking(node);
    let offset = 0;
    let changed = false;
    for (const match of matches) {
      const token = match[0] ?? "";
      const index = match.index;
      if (index > offset) {
        fragment.append(original.slice(offset, index));
      }
      const result = this.lookupCache.get(token);
      if (result?.interactive === true) {
        const span = this.document.createElement("span");
        span.setAttribute(OWNED_ATTRIBUTE, "");
        span.setAttribute(ORIGINAL_ATTRIBUTE, token);
        span.style.setProperty("white-space", "nowrap", "important");
        appendTokenText(
          this.document,
          span,
          this.dependencies.showStressMarks === false
            ? token
            : (result.stressed ?? token),
          positionStress,
        );
        fragment.append(span);
        changed = true;
      } else {
        fragment.append(token);
      }
      offset = index + token.length;
    }
    if (!changed || node.data !== original || !node.isConnected) {
      return;
    }
    fragment.append(original.slice(offset));
    node.replaceWith(fragment);
  }
}
