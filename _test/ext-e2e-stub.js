(function () {
  'use strict';

  var messageListeners = [];
  var commandListeners = [];

  var harness = {
    storage: {},
    badge: { text: null, color: null },
    sent: [],
    captures: 0,
    command: function (name) {
      commandListeners.forEach(function (fn) {
        fn(name);
      });
    }
  };

  window.__e2e = harness;

  harness.send = function (message) {
    var sender = message && message.type === 'magnet-auto-refresh'
      ? { tab: { id: 1, windowId: 7 } }
      : {};
    return new Promise(function (resolve) {
      messageListeners.forEach(function (fn) {
        fn(message, sender, resolve);
      });
    });
  };

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
        var sender = message && message.type === 'magnet-auto-refresh'
          ? { tab: { id: 1, windowId: 7 } }
          : {};
        new Promise(function (resolve) {
          messageListeners.forEach(function (fn) {
            fn(message, sender, resolve);
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
        return Promise.resolve([{ id: 1, url: 'https://example.test/', windowId: 7 }]);
      },
      onUpdated: {
        addListener: function () {}
      },
      // Заглушка снимка вкладки: синтетический «макет» с линиями.
      captureVisibleTab: function () {
        harness.captures += 1;
        harness.captureBadges = harness.captureBadges || [];
        harness.captureBadges.push({ text: harness.badge.text, color: harness.badge.color });
        if (harness.failNext) {
          var reason = harness.failNext;
          harness.failNext = null;
          return Promise.reject(new Error(reason));
        }

        var width = document.documentElement.clientWidth;
        var height = document.documentElement.clientHeight;
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#222222';
        ctx.fillRect(window.__fixtureX || width - 100, 0, 2, height);
        ctx.fillRect(0, window.__fixtureY || height - 80, width, 2);

        return Promise.resolve(canvas.toDataURL('image/png'));
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
              var file = options.files[0] || '';
              var isDetector = file.indexOf('edges') >= 0;
              var isActivity = file.indexOf('activity') >= 0;

              if (isDetector && window.ruleboxDetectLines) {
                resolve([{ result: undefined }]);
                return;
              }
              if (!isDetector && !isActivity && window.rulebox) {
                resolve([{ result: undefined }]);
                return;
              }

              var script = document.createElement('script');
              if (isActivity) {
                script.src = window.__activityPath;
              } else {
                script.src = isDetector ? window.__edgesPath : window.__libPath;
              }
              script.onload = function () {
                resolve([{ result: undefined }]);
              };
              script.onerror = function () {
                reject(new Error('не удалось загрузить ' + file));
              };
              document.head.appendChild(script);
              return;
            }

            var fn = window.eval('(' + options.func.toString() + ')');
            Promise.resolve(fn.apply(null, options.args || [])).then(function (value) {
              resolve([{ result: value }]);
            }, reject);
          } catch (error) {
            reject(error);
          }
        });
      }
    }
  };
})();
