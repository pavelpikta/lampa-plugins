(function () {
  'use strict';

  function account(url) {
    if (url.indexOf('account_email=') == -1) {
      var email = Lampa.Storage.get('account_email');
      if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    }

    return url;
  }

  Lampa.TMDB.image = function (url) {
    var base = Lampa.Utils.protocol() + 'image.tmdb.org/' + url;
    return Lampa.Storage.field('proxy_tmdb') ? 'https://lampa-plugins.devsecops.stream/tmdb/img/' + account(url) : base;
  };

  Lampa.TMDB.api = function (url) {
    var base = Lampa.Utils.protocol() + 'api.themoviedb.org/3/' + url;
    return Lampa.Storage.field('proxy_tmdb') ? 'https://lampa-plugins.devsecops.stream/tmdb/api/3/' + account(url) : base;
  };

  Lampa.Settings.listener.follow('open', function (e) {
    if (e.name == 'tmdb') {
      e.body.find('[data-parent="proxy"]').remove();
    }
  });

})();
