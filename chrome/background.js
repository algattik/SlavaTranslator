console.log("loading dictionary data");
var forms_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/forms.json'));
var lemmas_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/words.json'));

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
          console.log(forms_for_entry);
          if (forms_for_entry) {
            var return_entries = Array();
            $.each(forms_for_entry, function (form_i, form) {
              return_entries.push([lemmas[form[0]], form[1]]);
            });
            retval[entry] = return_entries;

          }
        });
        sendResponse({ payload: { forms: retval } });
      }
    });

  chrome.browserAction.onClicked.addListener(function (tab) {
    chrome.tabs.executeScript(null, { file: "generated/underscore.js" });
    chrome.tabs.executeScript(null, { file: "generated/jquery.js" });
    chrome.tabs.executeScript(null, { file: "generated/bootstrap.js" });
    chrome.tabs.executeScript(null, { file: "content_script.js" });
  });
});
