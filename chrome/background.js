console.log("loading dictionary data");
var forms_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/forms.json'));
var lemmas_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/words.json'));
var active_tabs = {}

function load(unload) {
  apply_to_tab(function (tab) {
    if (active_tabs[tab.id]) {
      chrome.tabs.executeScript(null, { file: "generated/underscore.js" });
      chrome.tabs.executeScript(null, { file: "generated/jquery.js" });
      chrome.tabs.executeScript(null, { file: "generated/bootstrap.js" });
      chrome.tabs.executeScript(null, { file: "content_script.js" });
      chrome.tabs.insertCSS(null, { file: "generated/bootstrap.css" });
    }
    else if (unload) {
      chrome.tabs.executeScript(null, { code: "location.reload()" });
    }
  });
}

function apply_to_tab(f) {
  chrome.tabs.query({
    "currentWindow": true,
    "active": true //Add any parameters you want
  }, function (tabs) {//It returns an array
    $.each(tabs, function (i, tab) {
      f(tab);
    });
  });
}


$.when(forms_q, lemmas_q).done(function (forms_r, lemmas_r) {
  console.log("loaded dictionary data");
  var forms = forms_r[0];
  var lemmas = lemmas_r[0];

  chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
      if (request.type == "resolve") {
        var retval = {};
        $.each(request.payload, function (entry_i, entry) {
          var forms_for_entry = forms[entry];
          if (forms_for_entry) {
            var return_entries = Array();
            $.each(forms_for_entry, function (form_i, form) {
              return_entries.push([lemmas[form[0]], form[1], form[2]]);
            });
            retval[entry] = return_entries;
          }
        });
        sendResponse({ payload: { forms: retval } });
      }
      else if (request.type == "get-enabled") {
        apply_to_tab(function (tab) {
          sendResponse(active_tabs[tab.id])
        });
        return true; // mark message response as async
      }
      else if (request.type == "set-enabled") {
        apply_to_tab(function (tab) {
          console.log("Set", tab.id)
          active_tabs[tab.id] = request.payload
        });
        load(true);

      }
      else if (request.type == "load") {
        load(false);
      }
    });

});
