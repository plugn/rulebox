(function () {
  'use strict';

  var listeners = { message: [], command: [] };
  var badge = { text: null, color: null };
  var storage = {};

  window.__harness = {
    badge: badge,
    storage: storage,
    failNext: null,
    send: function (message) {
      return new Promise(function (resolve) {
        var listener = listeners.message[0];
        if (!listener) {
          resolve({ ok: false, error: 'нет listener' });
          return;
        }
        listener(message, {}, resolve);
      });
    },
    command: function (name) {
      listeners.command.forEach(function (fn) {
        fn(name);
      });
    }
  };

  window.importScripts = function () {
    // palette.js уже подключён в харнессе; в service worker здесь был бы
    // importScripts('lib/palette.js').
  };

  window.chrome = {
    runtime: {
      onMessage: {
        addListener: function (fn) {
          listeners.message.push(fn);
        }
      },
      lastError: null
    },
    commands: {
      onCommand: {
        addListener: function (fn) {
          listeners.command.push(fn);
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
        badge.text = details.text;
        return Promise.resolve();
      },
      setBadgeBackgroundColor: function (details) {
        badge.color = details.color;
        return Promise.resolve();
      }
    },
    storage: {
      local: {
        get: function (key) {
          var out = {};
          if (Object.prototype.hasOwnProperty.call(storage, key)) {
            out[key] = storage[key];
          }
          return Promise.resolve(out);
        },
        set: function (patch) {
          Object.keys(patch).forEach(function (key) {
            storage[key] = patch[key];
          });
          return Promise.resolve();
        }
      }
    },
    scripting: {
      executeScript: function (options) {
        return new Promise(function (resolve, reject) {
          if (window.__harness.failNext) {
            var reason = window.__harness.failNext;
            window.__harness.failNext = null;
            reject(new Error(reason));
            return;
          }
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
