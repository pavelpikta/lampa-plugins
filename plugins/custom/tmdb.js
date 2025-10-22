(function () {
  'use strict';

  var tmdb_proxy = {
    name: 'TMDB Proxy',
    version: '1.0.0',
    description: 'Проксирование постеров и API сайта TMDB',
    worker: 'https://lampa-plugins.devsecops.stream/tmdb',
  };

  function account(url) {
    if (url.indexOf('account_email=') == -1) {
      var email = Lampa.Storage.get('account_email');
      if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    }

    return url;
  }

  Lampa.TMDB.image = function (url) {
    var base = Lampa.Utils.protocol() + 'image.tmdb.org/' + url;
    return Lampa.Storage.field('proxy_tmdb') ? tmdb_proxy.worker + '/img/' + account(url) : base;
  };

  Lampa.TMDB.api = function (url) {
    var base = Lampa.Utils.protocol() + 'api.themoviedb.org/3/' + url;
    return Lampa.Storage.field('proxy_tmdb') ? tmdb_proxy.worker + '/api/3/' + account(url) : base;
  };

  Lampa.Settings.listener.follow('open', function (e) {
    if (e.name == 'tmdb') {
      e.body.find('[data-parent="proxy"]').remove();
    }
  });

  console.log('TMDB-Proxy', tmdb_proxy.worker, 'started, enabled:', Lampa.Storage.field('proxy_tmdb'));

})();
