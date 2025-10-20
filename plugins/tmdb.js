(function () {
  'use strict';

  var domain = Lampa.Manifest && Lampa.Manifest.cub_domain ? Lampa.Manifest.cub_domain : 'cub.rip';
  var tmdb_proxy = {
    name: 'TMDB Proxy',
    version: '1.0.0',
    description: 'Проксирование постеров и API сайта TMDB',
    worker: 'https://lampa-plugins.devsecops.stream/tmdb/',
    path_image: Lampa.Account.hasPremium() ? 'imagetmdb.' + domain + '/' : 'imagetmdb.com/',
    path_api: 'apitmdb.' + domain + '/3/'
  };


  // function filter(u) {
  //   var s = u.slice(0, 8);
  //   var e = u.slice(8).replace(/\/+/g, '/');
  //   return s + e;
  // }

  // function email() {
  //   return Lampa.Storage.get('account', '{}').email || '';
  // }

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

  // Lampa.TMDB.image = function (url) {
  //   var base = Lampa.Utils.protocol() + 'image.tmdb.org/' + url;
  //   return Lampa.Utils.addUrlComponent(filter(Lampa.Storage.field('proxy_tmdb') ? Lampa.Utils.protocol() + tmdb_proxy.path_image + url : base), 'email=' + encodeURIComponent(email()));
  // };

  // Lampa.TMDB.api = function (url) {
  //   var base = Lampa.Utils.protocol() + 'api.themoviedb.org/3/' + url;
  //   return Lampa.Utils.addUrlComponent(filter(Lampa.Storage.field('proxy_tmdb') ? Lampa.Utils.protocol() + tmdb_proxy.path_api + url : base), 'email=' + encodeURIComponent(email()));
  // };

  Lampa.Settings.listener.follow('open', function (e) {
    if (e.name == 'tmdb') {
      e.body.find('[data-parent="proxy"]').remove();
    }
  });

  console.log('TMDB-Proxy', tmdb_proxy.worker, 'started, enabled:', Lampa.Storage.field('proxy_tmdb'));

})();
