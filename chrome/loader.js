function load_slava() {
    chrome.storage.local.get('enabled', function (payload) {
        var enabled = payload.enabled;
        if (enabled === undefined) {
            enabled = true;
        }
        if (enabled) {
            chrome.runtime.sendMessage({ type: "load" });
        }
    });
}
load_slava();
