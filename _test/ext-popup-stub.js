(function () {
  'use strict';

  var harness = {
    sent: [],
    count: 2,
    storage: { borderColor: '#7c3aed' },
    failNext: null
  };

  harness.respond = function (message) {
    if (harness.failNext) {
      var error = harness.failNext;
      harness.failNext = null;
      return { ok: false, error: error };
    }
    if (message.type === 'state') {
      return { ok: true, count: harness.count };
    }
    if (message.type === 'create') {
      harness.count += 1;
      return {
        ok: true,
        count: harness.count,
        color: message.color,
        nextColor: ruleboxNextColor(message.color)
      };
    }
    if (message.type === 'remove-last') {
      harness.count = Math.max(0, harness.count - 1);
      return { ok: true, count: harness.count };
    }
    if (message.type === 'remove-all') {
      harness.count = 0;
      return { ok: true, count: 0 };
    }
    return { ok: false, error: 'неизвестный тип: ' + message.type };
  };

  window.__popupHarness = harness;

  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage: function (message, callback) {
        harness.sent.push(message);
        var response = harness.respond(message);
        setTimeout(function () {
          callback(response);
        }, 0);
      }
    },
    storage: {
      local: {
        get: function (key) {
          var out = {};
          if (Object.prototype.hasOwnProperty.call(harness.storage, key)) {
            out[key] = harness.storage[key];
          }
          return Promise.resolve(out);
        },
        set: function (patch) {
          Object.keys(patch).forEach(function (key) {
            harness.storage[key] = patch[key];
          });
          return Promise.resolve();
        }
      }
    }
  };
})();
