document.addEventListener('DOMContentLoaded', () => {

  chrome.runtime.sendMessage({ type: "get-language_pref" }, function (lang_pref) {
    var langs = $('#slava-langs');
    $.each(lang_pref, function (i, lang) {
      text = slavaConfig.wiktionary[lang].name;
      $('<div class="list-group-item"/>').appendTo(langs).text(text).attr("data-lang", lang);
    });

    var sortable = Sortable.create(langs.get(0), {
      animation: 150,
      onSort: function (evt) {
        langs = $.map($(evt.to).children('div'), function (el) {
          return $(el).attr("data-lang");
        });
        chrome.runtime.sendMessage({ type: "set-language_pref", payload: langs });
      }
    });

    $('#container').css('visibility', 'visible');
  });

})
