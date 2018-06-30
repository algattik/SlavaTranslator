
var language_pref = Array();
function set_language_pref(lp) {
  chrome.storage.sync.set({ 'language_pref': lp });
  language_pref = lp;
}
chrome.storage.sync.get('language_pref', function (response) {
  language_pref = response.language_pref;
  for (var key in slavaConfig.wiktionary) {
    if (!language_pref.includes(key)) {
      language_pref.push(key);
    }
  }
});
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
      chrome.tabs.executeScript(null, { file: "generated/slavaConfig.js" });
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
              return_entries.push([lemmas[form[0]], form[1], form[2], 0]);

              // e.g. шедшая -> шедший -> идти
              //      про́ще -> простой -> простоя́ть
              var forms_root = forms[lemmas[form[0]][0]];
              if (forms_root) {
                $.each(forms_root, function (root_i, root) {
                  return_entries.push([lemmas[root[0]], [], [], 1]);
                });
              }



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
          active_tabs[tab.id] = request.payload
        });
        load(true);

      }
      else if (request.type == "load") {
        load(false);
      }
      else if (request.type == "set-language_pref") {
        set_language_pref(request.payload);
      }
      else if (request.type == "get-language_pref") {
        sendResponse(language_pref);
      }
    });

});
