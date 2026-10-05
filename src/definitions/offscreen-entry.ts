import {
  isOffscreenParseRequest,
  type OffscreenParseResponse,
} from "./offscreen-parser";
import { parseWiktionaryHtml } from "./parser";

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isOffscreenParseRequest(message)) {
      return false;
    }
    const response: OffscreenParseResponse = {
      kind: "offscreen.parse-result",
      requestId: message.requestId,
      result: parseWiktionaryHtml(message.edition, message.html),
    };
    sendResponse(response);
    return false;
  },
);
