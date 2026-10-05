import { PageAnnotator } from "../src/page/page-annotator";
import { DefinitionPopupController } from "../src/page/definition-popup";
import type { RuntimeResponse } from "../src/contracts/messages";

const STATE_SYMBOL = Symbol.for("slava.pageIntegration");

interface PageIntegrationState {
  ready: boolean;
  deactivate(): void;
}

const HOVER_DELAY_MILLISECONDS = 100;

export default defineUnlistedScript(() => {
  const extensionGlobal = globalThis as typeof globalThis & {
    [key: symbol]: PageIntegrationState | undefined;
  };
  if (window.top !== window || extensionGlobal[STATE_SYMBOL] !== undefined) {
    return;
  }
  let cleanup = () => undefined;
  let deactivated = false;
  const state: PageIntegrationState = {
    ready: false,
    deactivate: () => {
      if (deactivated) {
        return;
      }
      deactivated = true;
      cleanup();
      browser.runtime.onMessage.removeListener(handleControlMessage);
      if (extensionGlobal[STATE_SYMBOL] === state) {
        delete extensionGlobal[STATE_SYMBOL];
      }
    },
  };
  const handleControlMessage = (message: unknown): false => {
    if (
      typeof message === "object" &&
      message !== null &&
      "kind" in message &&
      message.kind === "page.deactivate"
    ) {
      state.deactivate();
    }
    return false;
  };
  extensionGlobal[STATE_SYMBOL] = state;
  browser.runtime.onMessage.addListener(handleControlMessage);
  void (async () => {
    const settingsResponse: RuntimeResponse | undefined =
      await browser.runtime.sendMessage({
        kind: "settings.get",
        requestId: crypto.randomUUID(),
      });
    if (settingsResponse?.kind !== "settings.result") {
      throw new Error("Slava settings are unavailable");
    }
    if (deactivated) {
      return;
    }
    const { features } = settingsResponse.settings;
    const annotator = new PageAnnotator(document, {
      createRequestId: () => crypto.randomUUID(),
      sendMessage: (request) => browser.runtime.sendMessage(request),
      showStressMarks: features.stressMarks,
    });
    const definitions = features.definitionPopups
      ? new DefinitionPopupController(document, {
          createRequestId: () => crypto.randomUUID(),
          sendMessage: (request) => browser.runtime.sendMessage(request),
        })
      : null;
    let hoverTimer: number | null = null;
    let hoverTarget: HTMLElement | null = null;
    let primaryPointerDown = false;
    let selectionDrag = false;
    let pointerDownX = 0;
    let pointerDownY = 0;
    const clearHoverTimer = () => {
      if (hoverTimer !== null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    };
    const tokenElement = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-slava-token]")
        : null;
    const hasTextSelection = () =>
      document.getSelection()?.isCollapsed === false;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !event.isTrusted ||
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest("[data-slava-root]") !== null)
      ) {
        return;
      }
      primaryPointerDown = true;
      selectionDrag = false;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      clearHoverTimer();
      hoverTarget = null;
      definitions?.scheduleHoverClose();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (
        primaryPointerDown &&
        Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) >
          4
      ) {
        selectionDrag = true;
      }
    };
    const handlePointerUp = () => {
      primaryPointerDown = false;
    };
    const handlePointerCancel = () => {
      primaryPointerDown = false;
      selectionDrag = false;
    };
    const handleSelectionChange = () => {
      if (!primaryPointerDown || !hasTextSelection()) {
        return;
      }
      clearHoverTimer();
      hoverTarget = null;
      definitions?.scheduleHoverClose();
    };
    const handlePointerOver = (event: PointerEvent) => {
      if (!event.isTrusted || primaryPointerDown) {
        return;
      }
      const target = tokenElement(event.target);
      if (target === null || target === hoverTarget) {
        return;
      }
      clearHoverTimer();
      hoverTarget = target;
      definitions?.cancelHoverClose();
      hoverTimer = window.setTimeout(() => {
        hoverTimer = null;
        if (
          hoverTarget !== target ||
          !target.isConnected ||
          primaryPointerDown
        ) {
          return;
        }
        const surfaceForm = target.getAttribute("data-slava-original");
        if (surfaceForm !== null) {
          void definitions
            ?.openHover(surfaceForm, target)
            .catch((error: unknown) => {
              console.error("Slava hover definition failed", error);
            });
        }
      }, HOVER_DELAY_MILLISECONDS);
    };
    const handlePointerOut = (event: PointerEvent) => {
      const target = tokenElement(event.target);
      if (target === null || target !== hoverTarget) {
        return;
      }
      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }
      clearHoverTimer();
      hoverTarget = null;
      definitions?.scheduleHoverClose();
    };
    const handlePointerLookup = (event: MouseEvent) => {
      if (!event.isTrusted || event.button !== 0) {
        return;
      }
      const suppressLookup = selectionDrag || hasTextSelection();
      selectionDrag = false;
      if (suppressLookup) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.hasAttribute("data-slava-token")
      ) {
        void definitions
          ?.open(target.getAttribute("data-slava-original"))
          .catch((error: unknown) => {
            console.error("Slava definition popup failed", error);
          });
      }
    };
    const handleKeyboardLookup = (event: KeyboardEvent) => {
      if (
        !event.isTrusted ||
        !event.altKey ||
        !event.shiftKey ||
        event.key.toLocaleLowerCase() !== "d"
      ) {
        return;
      }
      event.preventDefault();
      const selected = document.getSelection()?.toString().trim() ?? "";
      void definitions
        ?.open([...selected].length <= 64 ? selected : null)
        .catch((error: unknown) => {
          console.error("Slava definition popup failed", error);
        });
    };
    cleanup = () => {
      clearHoverTimer();
      hoverTarget = null;
      definitions?.deactivate();
      annotator.deactivate();
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("click", handlePointerLookup);
      document.removeEventListener("keydown", handleKeyboardLookup);
    };
    if (features.definitionPopups) {
      document.addEventListener("pointerover", handlePointerOver);
      document.addEventListener("pointerout", handlePointerOut);
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerCancel);
      document.addEventListener("selectionchange", handleSelectionChange);
      document.addEventListener("click", handlePointerLookup);
      document.addEventListener("keydown", handleKeyboardLookup);
    }
    if (features.stressMarks || features.definitionPopups) {
      annotator.start();
    }
    state.ready = true;
  })().catch((error: unknown) => {
    state.deactivate();
    console.error("Slava page integration failed", error);
  });
});
