(function () {
  'use strict';

  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }

  Lampa.Storage.set('torrserver_url', 'https://ts.devsecops.stream');
  Lampa.Storage.set('torrserver_auth', 'true');
  Lampa.Storage.set('torrserver_login', 'ts');
  Lampa.Storage.set('torrserver_password', 'ts');
  Lampa.Storage.set('torrserver_preload', 'false');
  Lampa.Storage.set('torrserver_savedb', 'true');

  Lampa.Storage.set('parser_use', 'true');
  Lampa.Storage.set('parser_torrent_type', 'jackett');
  Lampa.Storage.set('parse_in_search', 'true');
  Lampa.Storage.set('parse_timeout', '30');
  Lampa.Storage.set('parse_lang', 'df');
  Lampa.Storage.set('jackett_url', 'https://jdr.devsecops.stream');
  Lampa.Storage.set('jackett_key', 'devsecops');
  Lampa.Storage.set('jackett_interview', 'all');

  Lampa.Storage.set('screensaver', 'false');
  Lampa.Storage.set('helper', 'false');

  Lampa.Storage.set('player_torrent', 'infuse');

  Lampa.Storage.set('cloud_use', 'true');

  Lampa.Storage.set('theme_select', 'emerald');

})();
