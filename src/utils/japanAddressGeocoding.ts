/**
 * =====================================================================
 * 全国市区町村座標マスター & 階層スコープ型住所パーサー
 * 
 * 構造的欠陥・他府県誤判定（同名区の誤爆等）を完全防止する階層ツリー構造:
 *   【第1階層: 都道府県スコープ】(愛知県, 岐阜県, 三重県, 静岡県, 東京都, 大阪府 等)
 *       │
 *       ▼
 *   【第2階層: 政令指定都市 / 市区町村スコープ】(名古屋市, 豊田市, 大阪市 等)
 *       │
 *       ▼
 *   【第3階層: 行政区・町名・特定現場スポット】(西区, 上挙母, 牛島町, 莇生町 等)
 *       │
 *       ▼ (該当なし時)
 *   【第4階層: 所属拠点（自拠点）安全フォールバック】
 * =====================================================================
 */

export type RegionKeyType = 'nagoya_owari' | 'mikawa' | 'gifu' | 'mie' | 'shizuoka' | 'tokyo' | 'osaka' | 'other';

export interface GeocodedLocation {
  coords: [number, number]; // [lat, lng]
  regionKey: RegionKeyType;
  matchedName: string;
  source: 'preset_spot' | 'ward' | 'city' | 'prefecture' | 'fallback_base';
}

// 住所表記の正規化（郵便番号・全角半角・記号の整形）
export function normalizeAddressString(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // 1. ピンアイコンや装飾文字の除去
  str = str.replace(/^[📍🏢🚗\s\u3000]+/g, '');
  str = str.replace(/「([^」]+)」/g, '$1');
  str = str.replace(/滞在中/g, '').replace(/から移動中/g, '').replace(/へ移動/g, '');

  // 2. 郵便番号 (例: 〒470-0206, 470-0206) の除去
  str = str.replace(/〒?\s*\d{3}[-ー]\d{4}/g, '');

  // 3. 全角英数・スペース・ハイフンを半角に変換
  str = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  str = str.replace(/[\u3000\t]+/g, ' ');
  str = str.replace(/[ー−―‐－~〜]/g, '-');

  // 4. カタカナ・ひらがな地名の漢字正規化
  const KANA_CONVERSIONS: [RegExp, string][] = [
    [/アイチケン|あいちけん/g, '愛知県'],
    [/ギフケン|ぎふけん/g, '岐阜県'],
    [/ミエケン|みえけん/g, '三重県'],
    [/シズオカケン|しずおかけん/g, '静岡県'],
    [/トウキョウト|とうきょうと/g, '東京都'],
    [/オオサカフ|おおさかふ/g, '大阪府'],
    [/ナゴヤシ|なごやし/g, '名古屋市'],
    [/トヨタシ|とよたし/g, '豊田市'],
    [/ミヨシシ|みよしし/g, 'みよし市'],
    [/オカザキシ|おかざきし/g, '岡崎市'],
    [/オオブシ|おおぶし/g, '大府市'],
    [/アンジョウシ|あんじょうし/g, '安城市'],
    [/カリヤシ|かりやし/g, '刈谷市'],
    [/イチノミヤシ|いちのみやし/g, '一宮市'],
    [/ニシク|にしく/g, '西区'],
    [/キタク|きたく/g, '北区'],
    [/ナカク|なかく/g, '中区'],
    [/ナカムラク|なかむらく/g, '中村区'],
    [/ヒガシク|ひがしく/g, '東区'],
    [/ミナミク|みなみく/g, '南区'],
    [/ミナトク|みなとく/g, '港区'],
    [/ミズホク|みずほく/g, '瑞穂区'],
    [/アツタク|あつたく/g, '熱田区'],
    [/チクサク|ちくさく/g, '千種区'],
    [/ショウワク|しょうわく/g, '昭和区'],
    [/テンパクク|てんぱくく/g, '天白区'],
    [/メイトウク|めいとうく/g, '名東区'],
    [/ウシジマチョウ|うしじまちょう/g, '牛島町'],
    [/カミゴモ|かみごも/g, '上挙母'],
    [/アザブチョウ|あざぶちょう/g, '莇生町'],
  ];

  for (const [regex, kanji] of KANA_CONVERSIONS) {
    str = str.replace(regex, kanji);
  }

  // 5. 前後の不要な空白・コロン・カッコ除去
  str = str.replace(/^[ :：\-\]]+/, '').replace(/[ :：\-\[]+$/, '').trim();

  return str;
}

// =====================================================================
// 都道府県定義 (第1階層)
// =====================================================================
interface PrefectureDef {
  name: string;
  aliases: string[];
  regionKey: RegionKeyType;
  defaultCoords: [number, number];
}

const PREFECTURES: PrefectureDef[] = [
  { name: '愛知県', aliases: ['愛知県', '愛知'], regionKey: 'nagoya_owari', defaultCoords: [35.1814, 136.9064] },
  { name: '岐阜県', aliases: ['岐阜県', '岐阜'], regionKey: 'gifu', defaultCoords: [35.4233, 136.7607] },
  { name: '三重県', aliases: ['三重県', '三重'], regionKey: 'mie', defaultCoords: [34.7303, 136.5086] },
  { name: '静岡県', aliases: ['静岡県', '静岡'], regionKey: 'shizuoka', defaultCoords: [34.9756, 138.3828] },
  { name: '東京都', aliases: ['東京都', '東京'], regionKey: 'tokyo', defaultCoords: [35.6895, 139.6917] },
  { name: '大阪府', aliases: ['大阪府', '大阪'], regionKey: 'osaka', defaultCoords: [34.6937, 135.5023] },
  { name: '神奈川県', aliases: ['神奈川県', '神奈川'], regionKey: 'tokyo', defaultCoords: [35.4437, 139.6380] },
  { name: '埼玉県', aliases: ['埼玉県', '埼玉'], regionKey: 'tokyo', defaultCoords: [35.8617, 139.6455] },
  { name: '千葉県', aliases: ['千葉県', '千葉'], regionKey: 'tokyo', defaultCoords: [35.6074, 140.1065] },
  { name: '京都府', aliases: ['京都府', '京都'], regionKey: 'osaka', defaultCoords: [35.0116, 135.7681] },
  { name: '兵庫県', aliases: ['兵庫県', '兵庫'], regionKey: 'osaka', defaultCoords: [34.6901, 135.1955] },
  { name: '滋賀県', aliases: ['滋賀県', '滋賀'], regionKey: 'other', defaultCoords: [35.0044, 135.8686] },
  { name: '奈良県', aliases: ['奈良県', '奈良'], regionKey: 'osaka', defaultCoords: [34.6853, 135.8328] },
];

// =====================================================================
// 政令指定都市と区定義（同名区の誤爆を完全防止）
// =====================================================================
interface WardDef {
  wardName: string;
  coords: [number, number];
  spots?: Record<string, [number, number]>;
}

interface DesignatedCityDef {
  cityName: string;
  aliases: string[];
  prefName: string;
  regionKey: RegionKeyType;
  defaultCoords: [number, number];
  wards: Record<string, WardDef>;
}

const DESIGNATED_CITIES: DesignatedCityDef[] = [
  // 名古屋市 (16区)
  {
    cityName: '名古屋市',
    aliases: ['名古屋市', '名古屋'],
    prefName: '愛知県',
    regionKey: 'nagoya_owari',
    defaultCoords: [35.1814, 136.9064],
    wards: {
      '西区': {
        wardName: '西区',
        coords: [35.1964, 136.8856],
        spots: {
          '牛島町': [35.1745, 136.8820], // 名古屋ルーセントタワー周辺
          '名駅': [35.1709, 136.8815],
          '浄心': [35.1925, 136.8920],
          '庄内通': [35.2045, 136.8910],
        }
      },
      '北区': {
        wardName: '北区',
        coords: [35.1932, 136.9110],
        spots: {
          '清水': [35.1932, 136.9110], // 名古屋拠点 (清水)
          '清水5丁目': [35.1932, 136.9110],
          '大曽根': [35.1915, 136.9360],
          '黒川': [35.1975, 136.9115],
        }
      },
      '中区': {
        wardName: '中区',
        coords: [35.1691, 136.9025],
        spots: {
          '伏見': [35.1691, 136.9025],
          '栄': [35.1691, 136.9085],
          '丸の内': [35.1750, 136.9015],
          '大須': [35.1590, 136.9030],
          '金山': [35.1430, 136.9015],
        }
      },
      '中村区': {
        wardName: '中村区',
        coords: [35.1709, 136.8815],
        spots: {
          '名駅': [35.1709, 136.8815],
          '名駅南': [35.1660, 136.8840],
          '太閤': [35.1680, 136.8750],
          '本陣': [35.1770, 136.8650],
        }
      },
      '熱田区': {
        wardName: '熱田区',
        coords: [35.1278, 136.9038],
        spots: {
          '五番町': [35.1278, 136.9038],
          '神宮': [35.1260, 136.9100],
          '金山町': [35.1420, 136.9010],
        }
      },
      '千種区': {
        wardName: '千種区',
        coords: [35.1711, 136.9422],
        spots: {
          '星ヶ丘': [35.1620, 136.9860],
          '今池': [35.1700, 136.9370],
          '本山': [35.1630, 136.9640],
        }
      },
      '東区': {
        wardName: '東区',
        coords: [35.1804, 136.9245],
        spots: {
          '東桜': [35.1730, 136.9150],
          '泉': [35.1760, 136.9120],
          '大曽根': [35.1915, 136.9360],
        }
      },
      '昭和区': { wardName: '昭和区', coords: [35.1484, 136.9367] },
      '瑞穂区': { wardName: '瑞穂区', coords: [35.1258, 136.9348] },
      '中川区': { wardName: '中川区', coords: [35.1384, 136.8643] },
      '港区': { wardName: '港区', coords: [35.1054, 136.8821] },
      '南区': { wardName: '南区', coords: [35.0934, 136.9318] },
      '守山区': { wardName: '守山区', coords: [35.2045, 136.9772] },
      '緑区': {
        wardName: '緑区',
        coords: [35.0844, 136.9535],
        spots: {
          '鳴海': [35.0844, 136.9535],
          '大高': [35.0689, 136.9367],
        }
      },
      '名東区': {
        wardName: '名東区',
        coords: [35.1764, 137.0016],
        spots: {
          '藤が丘': [35.1825, 137.0218],
          '一社': [35.1680, 136.9960],
        }
      },
      '天白区': { wardName: '天白区', coords: [35.1245, 136.9748] },
    }
  },

  // 大阪市 (24区)
  {
    cityName: '大阪市',
    aliases: ['大阪市', '大阪'],
    prefName: '大阪府',
    regionKey: 'osaka',
    defaultCoords: [34.6937, 135.5023],
    wards: {
      '北区': { wardName: '北区', coords: [34.7056, 135.5019], spots: { '梅田': [34.7024, 135.4959] } },
      '中央区': { wardName: '中央区', coords: [34.6814, 135.5100], spots: { '難波': [34.6660, 135.5010], '本町': [34.6820, 135.5020] } },
      '西区': { wardName: '西区', coords: [34.6786, 135.4950] },
      '都島区': { wardName: '都島区', coords: [34.7042, 135.5297] },
      '福島区': { wardName: '福島区', coords: [34.6931, 135.4853] },
      '此花区': { wardName: '此花区', coords: [34.6833, 135.4578] },
      '港区': { wardName: '港区', coords: [34.6644, 135.4594] },
      '大正区': { wardName: '大正区', coords: [34.6533, 135.4778] },
      '天王寺区': { wardName: '天王寺区', coords: [34.6542, 135.5200] },
      '浪速区': { wardName: '浪速区', coords: [34.6603, 135.4994] },
      '西淀川区': { wardName: '西淀川区', coords: [34.7125, 135.4597] },
      '淀川区': { wardName: '淀川区', coords: [34.7214, 135.4878], spots: { '新大阪': [34.7335, 135.5005] } },
      '東淀川区': { wardName: '東淀川区', coords: [34.7436, 135.5342] },
      '東成区': { wardName: '東成区', coords: [34.6719, 135.5433] },
      '生野区': { wardName: '生野区', coords: [34.6519, 135.5414] },
      '旭区': { wardName: '旭区', coords: [34.7225, 135.5447] },
      '城東区': { wardName: '城東区', coords: [34.7000, 135.5478] },
      '鶴見区': { wardName: '鶴見区', coords: [34.7067, 135.5786] },
      '阿倍野区': { wardName: '阿倍野区', coords: [34.6389, 135.5186] },
      '住之江区': { wardName: '住之江区', coords: [34.6111, 135.4839] },
      '住吉区': { wardName: '住吉区', coords: [34.6006, 135.5019] },
      '東住吉区': { wardName: '東住吉区', coords: [34.6225, 135.5317] },
      '平野区': { wardName: '平野区', coords: [34.6214, 135.5533] },
      '西成区': { wardName: '西成区', coords: [34.6419, 135.4958] },
    }
  },

  // 静岡市 (3区)
  {
    cityName: '静岡市',
    aliases: ['静岡市', '静岡'],
    prefName: '静岡県',
    regionKey: 'shizuoka',
    defaultCoords: [34.9756, 138.3828],
    wards: {
      '葵区': { wardName: '葵区', coords: [34.9756, 138.3828] },
      '駿河区': { wardName: '駿河区', coords: [34.9575, 138.3967] },
      '清水区': { wardName: '清水区', coords: [35.0167, 138.4878] },
    }
  },

  // 浜松市
  {
    cityName: '浜松市',
    aliases: ['浜松市', '浜松'],
    prefName: '静岡県',
    regionKey: 'shizuoka',
    defaultCoords: [34.7108, 137.7261],
    wards: {
      '中央区': { wardName: '中央区', coords: [34.7108, 137.7261] },
      '中区': { wardName: '中区', coords: [34.7108, 137.7261] },
      '浜名区': { wardName: '浜名区', coords: [34.7958, 137.7858] },
      '浜北区': { wardName: '浜北区', coords: [34.7958, 137.7858] },
      '天竜区': { wardName: '天竜区', coords: [35.0167, 137.8167] },
    }
  },

  // 東京23区 (特別区)
  {
    cityName: '東京23区',
    aliases: ['特別区', '23区'],
    prefName: '東京都',
    regionKey: 'tokyo',
    defaultCoords: [35.6895, 139.6917],
    wards: {
      '千代田区': { wardName: '千代田区', coords: [35.6940, 139.7536] },
      '中央区': { wardName: '中央区', coords: [35.6707, 139.7719], spots: { '銀座': [35.6710, 139.7650], '日本橋': [35.6830, 139.7740] } },
      '港区': { wardName: '港区', coords: [35.6581, 139.7514], spots: { '新橋': [35.6660, 139.7580], '六本木': [35.6630, 139.7320], '品川駅': [35.6285, 139.7388] } },
      '新宿区': { wardName: '新宿区', coords: [35.6938, 139.7034] },
      '文京区': { wardName: '文京区', coords: [35.7078, 139.7525] },
      '台東区': { wardName: '台東区', coords: [35.7126, 139.7797] },
      '墨田区': { wardName: '墨田区', coords: [35.7093, 139.8172] },
      '江東区': { wardName: '江東区', coords: [35.6733, 139.8172] },
      '品川区': { wardName: '品川区', coords: [35.6092, 139.7303] },
      '目黒区': { wardName: '目黒区', coords: [35.6414, 139.6981] },
      '大田区': { wardName: '大田区', coords: [35.5614, 139.7161] },
      '世田谷区': { wardName: '世田谷区', coords: [35.6464, 139.6533] },
      '渋谷区': { wardName: '渋谷区', coords: [35.6628, 139.7041] },
      '中野区': { wardName: '中野区', coords: [35.7075, 139.6639] },
      '杉並区': { wardName: '杉並区', coords: [35.6994, 139.6364] },
      '豊島区': { wardName: '豊島区', coords: [35.7264, 139.7164], spots: { '池袋': [35.7290, 139.7110] } },
      '北区': { wardName: '北区', coords: [35.7528, 139.7336], spots: { '赤羽': [35.7770, 139.7210] } },
      '荒川区': { wardName: '荒川区', coords: [35.7361, 139.7833] },
      '板橋区': { wardName: '板橋区', coords: [35.7511, 139.7094] },
      '練馬区': { wardName: '練馬区', coords: [35.7356, 139.6517] },
      '足立区': { wardName: '足立区', coords: [35.7750, 139.8044] },
      '葛飾区': { wardName: '葛飾区', coords: [35.7436, 139.8472] },
      '江戸川区': { wardName: '江戸川区', coords: [35.6781, 139.8703] },
    }
  }
];

// =====================================================================
// 市区町村定義 (第2階層: 各都道府県所属)
// =====================================================================
interface MunicipalityEntry {
  name: string;
  prefName: string;
  regionKey: RegionKeyType;
  coords: [number, number];
  spots?: Record<string, [number, number]>;
}

const MUNICIPALITIES_BY_PREF: Record<string, MunicipalityEntry[]> = {
  '愛知県': [
    // 三河エリア (mikawa)
    {
      name: '豊田市',
      prefName: '愛知県',
      regionKey: 'mikawa',
      coords: [35.0822, 137.1562],
      spots: {
        '上挙母': [35.0822, 137.1562],
        '上挙母4丁目': [35.0822, 137.1562],
        '元町': [35.0680, 137.1350],
        'トヨタ町': [35.0530, 137.1560],
      }
    },
    {
      name: 'みよし市',
      prefName: '愛知県',
      regionKey: 'mikawa',
      coords: [35.0878, 137.0756],
      spots: {
        '莇生町': [35.0975, 137.1025],
        '三好町': [35.0878, 137.0756],
      }
    },
    { name: '岡崎市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.9548, 137.1723] },
    { name: '安城市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.9589, 137.0803] },
    { name: '刈谷市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.9889, 137.0016] },
    { name: '知立市', prefName: '愛知県', regionKey: 'mikawa', coords: [35.0075, 137.0425] },
    { name: '高浜市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.9278, 136.9889] },
    { name: '碧南市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.8847, 136.9958] },
    { name: '西尾市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.8644, 137.0543] },
    { name: '幸田町', prefName: '愛知県', regionKey: 'mikawa', coords: [34.8617, 137.1658] },
    { name: '豊橋市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.7628, 137.3817] },
    { name: '豊川市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.8258, 137.3912] },
    { name: '蒲郡市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.8272, 137.2217] },
    { name: '新城市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.9017, 137.4967] },
    { name: '田原市', prefName: '愛知県', regionKey: 'mikawa', coords: [34.6675, 137.2647] },
    { name: '設楽町', prefName: '愛知県', regionKey: 'mikawa', coords: [35.0747, 137.5258] },
    { name: '東栄町', prefName: '愛知県', regionKey: 'mikawa', coords: [35.0783, 137.7019] },
    { name: '豊根村', prefName: '愛知県', regionKey: 'mikawa', coords: [35.1583, 137.7467] },

    // 尾張・知多エリア (nagoya_owari)
    { name: '一宮市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.3038, 136.7956] },
    { name: '瀬戸市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2244, 137.0853] },
    { name: '春日井市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2475, 136.9719] },
    { name: '犬山市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.3844, 136.9444] },
    { name: '江南市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.3344, 136.8744] },
    { name: '小牧市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2908, 136.9106] },
    { name: '稲沢市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2536, 136.7825] },
    { name: '尾張旭市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2158, 137.0344] },
    { name: '岩倉市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2789, 136.8722] },
    { name: '豊明市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.0561, 137.0142] },
    { name: '日進市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1311, 137.0444] },
    { name: '清須市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2014, 136.8458] },
    { name: '北名古屋市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2458, 136.8722] },
    { name: '長久手市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1833, 137.0494] },
    { name: '東郷町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.0931, 137.0489] },
    { name: '豊山町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.2483, 136.9158] },
    { name: '大口町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.3267, 136.9042] },
    { name: '扶桑町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.3589, 136.9158] },
    { name: '津島市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1764, 136.7278] },
    { name: '愛西市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1506, 136.7258] },
    { name: '弥富市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1136, 136.7247] },
    { name: 'あま市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1764, 136.7578] },
    { name: '大治町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1706, 136.8194] },
    { name: '蟹江町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.1317, 136.7936] },
    { name: '飛島村', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.0747, 136.8153] },
    { name: '半田市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.8919, 136.9367] },
    { name: '常滑市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.8872, 136.8378] },
    { name: '東海市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [35.0258, 136.9075] },
    {
      name: '大府市',
      prefName: '愛知県',
      regionKey: 'nagoya_owari',
      coords: [35.0133, 136.9625],
      spots: {
        'テクノエイト': [35.0345, 136.9850]
      }
    },
    { name: '知多市', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.9961, 136.8647] },
    { name: '阿久比町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.9317, 136.9189] },
    { name: '東浦町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.9753, 136.9692] },
    { name: '南知多町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.7336, 136.9422] },
    { name: '美浜町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.7878, 136.8986] },
    { name: '武豊町', prefName: '愛知県', regionKey: 'nagoya_owari', coords: [34.8517, 136.9172] },
  ],

  '岐阜県': [
    { name: '岐阜市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.4233, 136.7607] },
    { name: '大垣市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3589, 136.6128] },
    { name: '各務原市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3997, 136.8483] },
    { name: '多治見市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3322, 137.1278] },
    {
      name: '可児市',
      prefName: '岐阜県',
      regionKey: 'gifu',
      coords: [35.4278, 137.0583],
      spots: {
        '可茂環境衛生': [35.4378, 137.0543],
        '可茂': [35.4378, 137.0543],
      }
    },
    {
      name: '美濃加茂市',
      prefName: '岐阜県',
      regionKey: 'gifu',
      coords: [35.4378, 137.0543],
      spots: {
        '可茂環境衛生': [35.4378, 137.0543],
        '可茂': [35.4378, 137.0543],
      }
    },
    { name: '高山市', prefName: '岐阜県', regionKey: 'gifu', coords: [36.1461, 137.2522] },
    { name: '関市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.4958, 136.9172] },
    { name: '中津川市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.4878, 137.5028] },
    { name: '美濃市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.5458, 136.9117] },
    { name: '瑞浪市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3619, 137.2519] },
    { name: '羽島市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3211, 136.7028] },
    { name: '恵那市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.4489, 137.4089] },
    { name: '土岐市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3533, 137.1836] },
    { name: '山県市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.5186, 136.7842] },
    { name: '瑞穂市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.3917, 136.6908] },
    { name: '飛騨市', prefName: '岐阜県', regionKey: 'gifu', coords: [36.2367, 137.1867] },
    { name: '本巣市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.4856, 136.6806] },
    { name: '郡上市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.7483, 136.9639] },
    { name: '下呂市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.8033, 137.2436] },
    { name: '海津市', prefName: '岐阜県', regionKey: 'gifu', coords: [35.2217, 136.6367] },
  ],

  '三重県': [
    { name: '四日市市', prefName: '三重県', regionKey: 'mie', coords: [34.9653, 136.6236] },
    { name: '津市', prefName: '三重県', regionKey: 'mie', coords: [34.7303, 136.5086] },
    { name: '鈴鹿市', prefName: '三重県', regionKey: 'mie', coords: [34.8822, 136.5847] },
    { name: '桑名市', prefName: '三重県', regionKey: 'mie', coords: [35.0658, 136.6822] },
    { name: '松阪市', prefName: '三重県', regionKey: 'mie', coords: [34.5786, 136.5317] },
    { name: '伊勢市', prefName: '三重県', regionKey: 'mie', coords: [34.4878, 136.7092] },
    { name: '名張市', prefName: '三重県', regionKey: 'mie', coords: [34.6247, 136.1361] },
    { name: '亀山市', prefName: '三重県', regionKey: 'mie', coords: [34.8553, 136.4528] },
    { name: 'いなべ市', prefName: '三重県', regionKey: 'mie', coords: [35.1558, 136.5167] },
    { name: '伊賀市', prefName: '三重県', regionKey: 'mie', coords: [34.7672, 136.1311] },
    { name: '志摩市', prefName: '三重県', regionKey: 'mie', coords: [34.3314, 136.8319] },
    { name: '鳥羽市', prefName: '三重県', regionKey: 'mie', coords: [34.4839, 136.8428] },
    { name: '尾鷲市', prefName: '三重県', regionKey: 'mie', coords: [34.0706, 136.1911] },
    { name: '熊野市', prefName: '三重県', regionKey: 'mie', coords: [33.8897, 136.0989] },
    { name: '菰野町', prefName: '三重県', regionKey: 'mie', coords: [35.0117, 136.5147] },
  ],

  '静岡県': [
    { name: '沼津市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.1003, 138.8597] },
    { name: '富士市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.1614, 138.6764] },
    { name: '富士宮市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.2217, 138.6142] },
    { name: '三島市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.1189, 138.9189] },
    { name: '熱海市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.0964, 139.0717] },
    { name: '伊東市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.9658, 139.0989] },
    { name: '島田市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.8344, 138.1747] },
    { name: '磐田市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.7186, 137.8519] },
    { name: '焼津市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.8708, 138.3183] },
    { name: '掛川市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.7694, 138.0147] },
    { name: '藤枝市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.8694, 138.2575] },
    { name: '御殿場市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.3089, 138.9344] },
    { name: '袋井市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.7472, 137.9256] },
    { name: '裾野市', prefName: '静岡県', regionKey: 'shizuoka', coords: [35.1764, 138.9108] },
    { name: '湖西市', prefName: '静岡県', regionKey: 'shizuoka', coords: [34.7214, 137.5244] },
  ],

  '東京都': [
    { name: '八王子市', prefName: '東京都', regionKey: 'tokyo', coords: [35.6558, 139.3239] },
    { name: '立川市', prefName: '東京都', regionKey: 'tokyo', coords: [35.6994, 139.4139] },
    { name: '武蔵野市', prefName: '東京都', regionKey: 'tokyo', coords: [35.7178, 139.5661] },
    { name: '三鷹市', prefName: '東京都', regionKey: 'tokyo', coords: [35.6833, 139.5597] },
    { name: '町田市', prefName: '東京都', regionKey: 'tokyo', coords: [35.5467, 139.4386] },
    { name: '調布市', prefName: '東京都', regionKey: 'tokyo', coords: [35.6519, 139.5406] },
    { name: '府中市', prefName: '東京都', regionKey: 'tokyo', coords: [35.6706, 139.4775] },
  ],

  '大阪府': [
    { name: '堺市', prefName: '大阪府', regionKey: 'osaka', coords: [34.5733, 135.4831] },
    { name: '豊中市', prefName: '大阪府', regionKey: 'osaka', coords: [34.7814, 135.4706] },
    { name: '吹田市', prefName: '大阪府', regionKey: 'osaka', coords: [34.7597, 135.5167] },
    { name: '高槻市', prefName: '大阪府', regionKey: 'osaka', coords: [34.8469, 135.6178] },
    { name: '枚方市', prefName: '大阪府', regionKey: 'osaka', coords: [34.8142, 135.6517] },
    { name: '茨木市', prefName: '大阪府', regionKey: 'osaka', coords: [34.8164, 135.5683] },
    { name: '八尾市', prefName: '大阪府', regionKey: 'osaka', coords: [34.6272, 135.6014] },
    { name: '寝屋川市', prefName: '大阪府', regionKey: 'osaka', coords: [34.7667, 135.6264] },
    { name: '東大阪市', prefName: '大阪府', regionKey: 'osaka', coords: [34.6792, 135.6008] },
  ],
};

// =====================================================================
// 階層スコープ型 住所解決メイン関数
// =====================================================================
export function resolveLocationWithFullHierarchy(
  rawLocation?: string,
  fallbackBase?: { coords: [number, number]; regionKey: any; name?: string; address?: string }
): GeocodedLocation {
  if (!rawLocation || !rawLocation.trim()) {
    return {
      coords: fallbackBase?.coords || [35.1932, 136.9110],
      regionKey: fallbackBase?.regionKey || 'nagoya_owari',
      matchedName: fallbackBase?.name || '拠点',
      source: 'fallback_base',
    };
  }

  const cleanOriginal = rawLocation.trim();
  const normalized = normalizeAddressString(cleanOriginal);

  // ----------------------------------------------------
  // 【第1ステップ: 都道府県スコープの特定】
  // ----------------------------------------------------
  let scopedPref: PrefectureDef | null = null;
  for (const pref of PREFECTURES) {
    if (pref.aliases.some((alias) => normalized.includes(alias) || cleanOriginal.includes(alias))) {
      scopedPref = pref;
      break;
    }
  }

  // ----------------------------------------------------
  // 【第2ステップ: 政令指定都市の特定（区の同名誤爆を完全防止）】
  // ----------------------------------------------------
  // 都道府県スコープがある場合はその都道府県の政令市のみ、ない場合は全政令市を照合
  const candidateCities = DESIGNATED_CITIES.filter(
    (c) => !scopedPref || c.prefName === scopedPref.name
  );

  for (const city of candidateCities) {
    const isCityMatched = city.aliases.some(
      (alias) => normalized.includes(alias) || cleanOriginal.includes(alias)
    );

    // 都道府県が一致していて政令市名が省略された場合（例: 「愛知県西区牛島町」）も許容
    const isPrefMatchedForCity = scopedPref && scopedPref.name === city.prefName;

    if (isCityMatched || isPrefMatchedForCity) {
      // 市内の区を最長一致で照合（例: 「西区」「北区」「中区」等）
      const sortedWards = Object.entries(city.wards).sort(([a], [b]) => b.length - a.length);

      for (const [wardKey, wardDef] of sortedWards) {
        if (normalized.includes(wardKey) || cleanOriginal.includes(wardKey)) {
          // 区内の特定スポット（牛島町、名駅、清水等）を優先照合
          if (wardDef.spots) {
            const sortedSpots = Object.entries(wardDef.spots).sort(([a], [b]) => b.length - a.length);
            for (const [spotKey, spotCoords] of sortedSpots) {
              if (normalized.includes(spotKey) || cleanOriginal.includes(spotKey)) {
                return {
                  coords: spotCoords,
                  regionKey: city.regionKey,
                  matchedName: `${city.cityName}${wardKey}${spotKey}`,
                  source: 'preset_spot',
                };
              }
            }
          }

          // 区名にヒット
          return {
            coords: wardDef.coords,
            regionKey: city.regionKey,
            matchedName: `${city.cityName}${wardKey}`,
            source: 'ward',
          };
        }
      }

      // 区の指定がなく「名古屋市」などの市名単体の場合
      if (isCityMatched) {
        return {
          coords: city.defaultCoords,
          regionKey: city.regionKey,
          matchedName: city.cityName,
          source: 'city',
        };
      }
    }
  }

  // ----------------------------------------------------
  // 【第3ステップ: 一般市区町村の照合】
  // ----------------------------------------------------
  // 都道府県スコープがある場合はその県内の自治体のみ、ない場合は全自治体を照合
  const prefListsToSearch = scopedPref
    ? [MUNICIPALITIES_BY_PREF[scopedPref.name] || []]
    : Object.values(MUNICIPALITIES_BY_PREF);

  // 最長一致優先
  for (const mList of prefListsToSearch) {
    const sortedList = [...mList].sort((a, b) => b.name.length - a.name.length);
    for (const muni of sortedList) {
      const muniShortName = muni.name.replace(/[市区町村]$/, '');
      if (
        normalized.includes(muni.name) ||
        cleanOriginal.includes(muni.name) ||
        (muniShortName.length >= 2 && (normalized.includes(muniShortName) || cleanOriginal.includes(muniShortName)))
      ) {
        // 市内の特定スポット（上挙母、莇生町等）を優先照合
        if (muni.spots) {
          const sortedSpots = Object.entries(muni.spots).sort(([a], [b]) => b.length - a.length);
          for (const [spotKey, spotCoords] of sortedSpots) {
            if (normalized.includes(spotKey) || cleanOriginal.includes(spotKey)) {
              return {
                coords: spotCoords,
                regionKey: muni.regionKey,
                matchedName: `${muni.name}${spotKey}`,
                source: 'preset_spot',
              };
            }
          }
        }

        return {
          coords: muni.coords,
          regionKey: muni.regionKey,
          matchedName: muni.name,
          source: 'city',
        };
      }
    }
  }

  // ----------------------------------------------------
  // 【第4ステップ: 都道府県名単体へのフォールバック】
  // ----------------------------------------------------
  if (scopedPref) {
    return {
      coords: scopedPref.defaultCoords,
      regionKey: scopedPref.regionKey,
      matchedName: scopedPref.name,
      source: 'prefecture',
    };
  }

  // ----------------------------------------------------
  // 【第5ステップ (第4階層): 自拠点安全フォールバック】
  // ----------------------------------------------------
  return {
    coords: fallbackBase?.coords || [35.1932, 136.9110],
    regionKey: fallbackBase?.regionKey || 'nagoya_owari',
    matchedName: fallbackBase?.name || '自拠点フォールバック',
    source: 'fallback_base',
  };
}

// =====================================================================
// 後方互換・座標逆引き用辞書 (PRESET_SPECIFIC_SPOTS & MUNICIPALITY_COORDINATES)
// =====================================================================
export interface SpotInfo {
  coords: [number, number];
  regionKey: RegionKeyType;
  prefName?: string;
  desc?: string;
}

export const PRESET_SPECIFIC_SPOTS: Record<string, SpotInfo> = {};
export const MUNICIPALITY_COORDINATES: Record<string, SpotInfo> = {};

// 政令指定都市・区・スポットから自動生成
DESIGNATED_CITIES.forEach((city) => {
  MUNICIPALITY_COORDINATES[city.cityName] = {
    coords: city.defaultCoords,
    regionKey: city.regionKey,
    prefName: city.prefName,
  };
  Object.entries(city.wards).forEach(([wardName, wardDef]) => {
    MUNICIPALITY_COORDINATES[`${city.cityName}${wardName}`] = {
      coords: wardDef.coords,
      regionKey: city.regionKey,
      prefName: city.prefName,
    };
    MUNICIPALITY_COORDINATES[`${wardName}(${city.cityName})`] = {
      coords: wardDef.coords,
      regionKey: city.regionKey,
      prefName: city.prefName,
    };
    if (wardDef.spots) {
      Object.entries(wardDef.spots).forEach(([spotName, spotCoords]) => {
        PRESET_SPECIFIC_SPOTS[`${city.cityName}${wardName}${spotName}`] = {
          coords: spotCoords,
          regionKey: city.regionKey,
          prefName: city.prefName,
          desc: `${city.cityName}${wardName} ${spotName}`,
        };
        PRESET_SPECIFIC_SPOTS[`${wardName} ${spotName}`] = {
          coords: spotCoords,
          regionKey: city.regionKey,
          prefName: city.prefName,
          desc: `${city.cityName}${wardName} ${spotName}`,
        };
        if (!PRESET_SPECIFIC_SPOTS[spotName]) {
          PRESET_SPECIFIC_SPOTS[spotName] = {
            coords: spotCoords,
            regionKey: city.regionKey,
            prefName: city.prefName,
            desc: `${city.cityName}${wardName} ${spotName}`,
          };
        }
      });
    }
  });
});

// 都道府県別一般市区町村・スポットから自動生成
Object.entries(MUNICIPALITIES_BY_PREF).forEach(([prefName, munis]) => {
  munis.forEach((muni) => {
    MUNICIPALITY_COORDINATES[muni.name] = {
      coords: muni.coords,
      regionKey: muni.regionKey,
      prefName,
    };
    if (muni.spots) {
      Object.entries(muni.spots).forEach(([spotName, spotCoords]) => {
        PRESET_SPECIFIC_SPOTS[`${muni.name}${spotName}`] = {
          coords: spotCoords,
          regionKey: muni.regionKey,
          prefName,
          desc: `${muni.name}${spotName}`,
        };
        PRESET_SPECIFIC_SPOTS[`${muni.name} ${spotName}`] = {
          coords: spotCoords,
          regionKey: muni.regionKey,
          prefName,
          desc: `${muni.name} ${spotName}`,
        };
        if (!PRESET_SPECIFIC_SPOTS[spotName]) {
          PRESET_SPECIFIC_SPOTS[spotName] = {
            coords: spotCoords,
            regionKey: muni.regionKey,
            prefName,
            desc: `${muni.name} ${spotName}`,
          };
        }
      });
    }
  });
});

