chrome.browserAction.onClicked.addListener(function(tab) {
  chrome.tabs.executeScript(null, {file: "generated/underscore-min.js"});
  chrome.tabs.executeScript(null, {file: "generated/jquery.min.js"});
  chrome.tabs.executeScript(null, {file: "generated/bootstrap.min.js"});
  chrome.tabs.executeScript(null, {file: "content_script.js"});
});
