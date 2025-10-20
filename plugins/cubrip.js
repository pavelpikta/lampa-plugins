(function () {
  'use strict';

  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }

  Lampa.Storage.set('cub_domain', 'cub.rip');
  Lampa.Storage.set('cub_mirrors', ['cub.rip', 'durex.monster', 'cubnotrip.top']);

  Lampa.Storage.set('proxy_tmdb_auto', 'true');
  Lampa.Storage.set('proxy_tmdb', 'true');

  window.lampa_settings.socket_url = 'wss://cub.rip:8443';
})();
