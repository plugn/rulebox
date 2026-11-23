(function () {
  rulebox.create();
  rulebox.create('#ff0000');
  window.__firstRun = {
    api: rulebox,
    items: rulebox._items,
    count: rulebox._items.length,
    attached: rulebox._items.filter(function (el) {
      return document.body.contains(el);
    }).length
  };
})();
