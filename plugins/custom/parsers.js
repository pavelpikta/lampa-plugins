(function () {
  'use strict';

  function translate() {
    Lampa.Lang.add({
      lme_parser: {
        ru: 'Каталог парсеров',
        en: 'Parsers catalog',
        uk: 'Каталог парсерів',
        zh: '解析器目录'
      },
      lme_parser_description: {
        ru: 'Нажмите для выбора парсера из ',
        en: 'Click to select a parser from the ',
        uk: 'Натисніть для вибору парсера з ',
        zh: '单击以从可用的 '
      },
      lme_pubtorr: {
        ru: 'Каталог TorrServer',
        en: 'TorrServer catalog',
        uk: 'Каталог TorrServer',
        zh: '解析器目录'
      },
      lme_pubtorr_description: {
        ru: 'Бесплатные серверы от проекта LME',
        en: 'Free servers from the LME project',
        uk: 'Безкоштовні сервери від проєкту LME',
        zh: '来自 LME 项目的免费服务器 '
      }
    });
  }
  var Lang = {
    translate: translate
  };

  var parsersInfo = [
    {
      base: 'jdr_devsecops_stream',
      name: 'JDR.devsecops.stream',
      settings: {
        url: 'https://jdr.devsecops.stream',
        key: 'devsecops',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'jd_devsecops_stream',
      name: 'JD.devsecops.stream',
      settings: {
        url: 'https://jd.devsecops.stream',
        key: '',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'lampac_devsecops_stream',
      name: 'Lampac.devsecops.stream',
      settings: {
        url: 'https://lampac.devsecops.stream',
        key: '1',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'jacred_xyz',
      name: 'Jacred.xyz',
      settings: {
        url: 'jacred.xyz',
        key: '',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'jacred_pro',
      name: 'Jacred.pro',
      settings: {
        url: 'jacred.pro',
        key: '',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'lampa_app',
      name: 'Lampa.app',
      settings: {
        url: 'lampa.app',
        key: '',
        parser_torrent_type: 'jackett'
      }
    },
    {
      base: 'lampa_vip',
      name: 'Lampa.vip',
      settings: {
        url: 'lampa.vip',
        key: '1',
        parser_torrent_type: 'jackett'
      }
    }
  ];

  /**/
  // Lampa.Controller.listener.follow('toggle', (e) => {
  //     if (e.name === 'select') {
  //         checkAlive("parser");
  //     }
  // });

  function changeParser() {
    var jackettUrlTwo = Lampa.Storage.get("lme_url_two");
    var selectedParser = parsersInfo.find(function (parser) {
      return parser.base === jackettUrlTwo;
    });
    if (selectedParser) {
      var settings = selectedParser.settings;
      Lampa.Storage.set(settings.parser_torrent_type === 'prowlarr' ? "prowlarr_url" : "jackett_url", settings.url);
      Lampa.Storage.set(settings.parser_torrent_type === 'prowlarr' ? "prowlarr_key" : "jackett_key", settings.key);
      Lampa.Storage.set("parser_torrent_type", settings.parser_torrent_type);
    } else {
      console.warn("Jackett URL not found in parsersInfo");
    }
  }
  var s_values = parsersInfo.reduce(function (prev, _ref) {
    var base = _ref.base,
      name = _ref.name;
    prev[base] = name;
    return prev;
  }, {
    no_parser: 'Не выбран'
  });
  function parserSetting() {
    Lampa.SettingsApi.addParam({
      component: 'parser',
      param: {
        name: 'lme_url_two',
        type: 'select',
        values: s_values,
        "default": 'no_parser'
      },
      field: {
        name: "<div class=\"settings-folder\" style=\"padding:0!important\"><div style=\"font-size:1.0em\">".concat(Lampa.Lang.translate('lme_parser'), "</div></div>"),
        description: "".concat(Lampa.Lang.translate('lme_parser_description'), " ").concat(parsersInfo.length)
      },
      onChange: function onChange(value) {
        changeParser();
        Lampa.Settings.update();
      },
      onRender: function onRender(item) {
        $('.settings-param__value p.parserName').remove();
        changeParser();
        setTimeout(function () {
          $('div[data-children="parser"]').on('hover:enter', function () {
            Lampa.Settings.update();
          });
          if (Lampa.Storage.field('parser_use')) {
            item.show();
            $('.settings-param__name', item).css('color', 'f3d900');
            $('div[data-name="lme_url_two"]').insertAfter('div[data-children="parser"]');
          } else {
            item.hide();
          }
        });
      }
    });
  }
  var Parser = {
    parserSetting: parserSetting
  };

  Lampa.Platform.tv();
  function add() {
    Lang.translate();
    Parser.parserSetting();
  }
  function startPlugin() {
    window.plugin_lmepublictorr_ready = true;
    if (window.appready) add(); else {
      Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') add();
      });
    }
  }
  if (!window.plugin_lmepublictorr_ready) startPlugin();

})();
