(function () {
  'use strict';

  var messageListeners = [];
  var commandListeners = [];

  var harness = {
    storage: {},
    badge: { text: null, color: null },
    sent: [],
    command: function (name) {
      commandListeners.forEach(function (fn) {
        fn(name);
      });
    }
  };

  window.__e2e = harness;

  // В service worker здесь был бы importScripts('lib/palette.js'): палитра
  // в харнессе уже подключена отдельным скриптом.
  window.importScripts = function () {};

  window.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener: function (fn) {
          messageListeners.push(fn);
        }
      },
      sendMessage: function (message, callback) {
        harness.sent.push(message);
        new Promise(function (resolve) {
          messageListeners.forEach(function (fn) {
            fn(message, {}, resolve);
          });
        }).then(callback);
      }
    },
    commands: {
      onCommand: {
        addListener: function (fn) {
          commandListeners.push(fn);
        }
      }
    },
    tabs: {
      query: function () {
        return Promise.resolve([{ id: 1, url: 'https://example.test/' }]);
      }
    },
    action: {
      setBadgeText: function (details) {
        harness.badge.text = details.text;
        return Promise.resolve();
      },
      setBadgeBackgroundColor: function (details) {
        harness.badge.color = details.color;
        return Promise.resolve();
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
    },
    scripting: {
      executeScript: function (options) {
        return new Promise(function (resolve, reject) {
          try {
            if (options.files) {
              if (window.rulebox) {
                resolve([{ result: undefined }]);
                return;
              }
              var script = document.createElement('script');
              script.src = window.__libPath;
              script.onload = function () {
                resolve([{ result: undefined }]);
              };
              script.onerror = function () {
                reject(new Error('не удалось загрузить ' + options.files[0]));
              };
              document.head.appendChild(script);
              return;
            }
            var fn = window.eval('(' + options.func.toString() + ')');
            resolve([{ result: fn.apply(null, options.args || []) }]);
          } catch (error) {
            reject(error);
          }
        });
      }
    }
  };
})();
