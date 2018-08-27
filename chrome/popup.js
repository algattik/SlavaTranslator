document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: "get-enabled" }, function (response) {
    if (response) {
      $('#slava-enable').bootstrapToggle('on');
    }
    $('#slava-enable').change(function () {
      var checked = $(this).prop('checked');
      chrome.runtime.sendMessage({ type: "set-enabled", payload: checked });
      $('#slava-disable-reload').css('visibility', checked ? 'hidden' : 'visible');

    });
  });

  $('#go-to-options').click(function () {
    chrome.runtime.openOptionsPage();
  });
})
