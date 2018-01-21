document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('enabled', function (payload) {
    var enabled = payload.enabled;
    if (enabled === undefined) {
      enabled = true;
    }
    if (enabled) {
      $('#slava-enable').bootstrapToggle('on');
    }
    $('#slava-enable').change(function () {
      var checked = $(this).prop('checked');
      chrome.storage.local.set({ 'enabled': checked });
      $('#slava-enable-reload').css('visibility', checked ? 'visible' : 'hidden');
    });
    $('#container').css('visibility', 'visible');
  })
});
