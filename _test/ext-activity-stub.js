(function () {
  'use strict';

  window.__sent = [];
  window.__ruleboxActivityOptions = { debounceMs: 40 };

  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage: function (message, callback) {
        window.__sent.push(message);
        if (typeof callback === 'function') {
          setTimeout(function () {
            callback({ ok: true });
          }, 0);
        }
      }
    }
  };
})();
