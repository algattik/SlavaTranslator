function load_slava() {
    chrome.runtime.sendMessage({ type: "load" });
}
load_slava();
