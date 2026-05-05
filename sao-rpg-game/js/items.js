/* ========================================================================
 * items.js — 物品總 registry(Phase A)
 *
 * 作為單一資料來源,**Definition(永久型錄)** 與 **Instance(放進 bag 的東西)** 分離。
 * 其他模組(market / shop / bag / panel / equipment / skills / state)在後續 phase
 * 會逐步切過來只讀這份 registry,不再各自維護一份重複資料。
 *
 * Phase D 已完成:舊資料(CRFT_WEAPONS / CRFT_ARMOR_PARTS / CRFT_MATERIALS /
 * MARKET_ITEMS / WEAPON_ICONS / ARMOR_ICONS / PANEL_*)全部刪除,本檔成為**唯一**
 * 物品定義來源。CRFT_ACC_PARTS(飾品子類型 ring/bracelet/...)與 EQUIP_OPTIONS
 * (舊 src:'static' 路徑用)仍保留。SHOP_BUY_ITEMS 改 shape 為 [{key, stock, price?}]
 * 精簡 stock entries(由 _resolveShopStock 配合 def 動態產生 render 物件)。
 *
 * 載入順序:storage → state → **items** → utils → character → ...
 * 載入位置在 state.js 之後、utils.js 之前。本檔不依賴任何其他 module。
 *
 * 物品分類:
 *   - 素材 (Material)    — 堆疊型;bag.materials[key] = qty
 *   - 武器 (Weapon)      — 個體型(每件有 uid);bag.weapons[]
 *   - 防具 (Armor)       — 同上;bag.armors[]
 *   - 道具 (Consumable)  — 堆疊型;bag.items[key] = qty
 *
 * 公開介面:
 *   常數:RARITIES / RARITY_COLOR / RARITY_ORDER
 *        WEAPON_TYPES / ARMOR_TYPES
 *        MATERIAL_REGISTRY / WEAPON_REGISTRY / ARMOR_REGISTRY / CONSUMABLE_REGISTRY
 *   查詢:getMaterialDef / getWeaponDef / getArmorDef / getConsumableDef
 *        getWeaponType / getArmorType
 *   Factory:newUid(prefix) / makeWeaponInstance(key) / makeArmorInstance(key)
 * ======================================================================== */


/* ════════════════ 稀有度 ════════════════ */
const RARITIES     = ['common','uncommon','rare','epic','legendary'];
const RARITY_COLOR = {
  common:    '#aaaaaa',
  uncommon:  '#44dd44',
  rare:      '#4499ff',
  epic:      '#aa66ff',
  legendary: '#ff8800',
};
// 排序用:小的數字 = 越稀有(legendary 在最前)
const RARITY_ORDER = {legendary:0, epic:1, rare:2, uncommon:3, common:4};


/* ════════════════ 製造系統:素材稀有度分數 ════════════════
 * Task A 引入。computeMaterialScore 取放入素材 score 加權平均(per unit),
 * 經 scoreToRarity 對映到目標 rarity,給 pickWeaponByTypeRarity 從 registry 挑 def。
 * 提高 score 上限的兩個方式:放更多素材(qty 加總)或放更稀有的素材(score 加成大)。
 */
const MATERIAL_RARITY_SCORE = {
  common: 1, uncommon: 3, rare: 9, epic: 25, legendary: 70,
};

// 目標 rarity 的分數上界(score < max 即落入該級)
const RARITY_THRESHOLDS = [
  {max: 2,        rarity: 'common'},
  {max: 5,        rarity: 'uncommon'},
  {max: 12,       rarity: 'rare'},
  {max: 30,       rarity: 'epic'},
  {max: Infinity, rarity: 'legendary'},
];


/* ════════════════ 武器類型 ════════════════
 * slot:預設裝備位;'main'(主手) | 'off'(副手) | 'both'(雙手)
 * craftParts:CRFT 製造小遊戲需要的部位定義
 */
const WEAPON_TYPES = [
  {key:'sword1',    name:'單手劍', icon:'🗡️', slot:'main', craftParts:[{key:'blade',label:'劍刃',qty:11},{key:'grip',label:'劍柄',qty:5}]},
  {key:'dagger',    name:'匕首',   icon:'🔪', slot:'main', craftParts:[{key:'blade',label:'刀刃',qty:6}, {key:'grip',label:'刀柄',qty:4}]},
  {key:'rapier',    name:'細劍',   icon:'🤺', slot:'main', craftParts:[{key:'blade',label:'劍身',qty:10},{key:'grip',label:'護手',qty:4}]},
  {key:'greatsword',name:'大劍',   icon:'⚔️', slot:'both', craftParts:[{key:'blade',label:'巨刃',qty:18},{key:'grip',label:'劍柄',qty:6}]},
  {key:'mace',      name:'單手錘', icon:'🔨', slot:'main', craftParts:[{key:'blade',label:'錘頭',qty:10},{key:'grip',label:'錘柄',qty:6}]},
  {key:'tachi',     name:'太刀',   icon:'🌸', slot:'main', craftParts:[{key:'blade',label:'刀身',qty:17},{key:'grip',label:'刀柄',qty:4}]},
  {key:'spear',     name:'長槍',   icon:'🔱', slot:'both', craftParts:[{key:'blade',label:'槍頭',qty:6}, {key:'grip',label:'槍桿',qty:12}]},
  {key:'axe',       name:'雙手斧', icon:'🪓', slot:'both', craftParts:[{key:'blade',label:'斧刃',qty:8}, {key:'grip',label:'斧柄',qty:14}]},
  {key:'shield',    name:'盾牌',   icon:'🛡️', slot:'off',  craftParts:[{key:'blade',label:'盾面',qty:12},{key:'grip',label:'盾框',qty:4}]},
];


/* ════════════════ 防具類型 ════════════════
 * slot:對應 s.equipment 的槽位 key('acc' 對應 acc1/acc2 兩個槽,equipFromBag 自動處理)
 */
const ARMOR_TYPES = [
  {key:'helmet', name:'頭盔', icon:'⛑️', slot:'helmet'},
  {key:'chest',  name:'上衣', icon:'🥻', slot:'chest'},
  {key:'pants',  name:'褲子', icon:'👖', slot:'pants'},
  {key:'boots',  name:'靴子', icon:'👢', slot:'boots'},
  {key:'main',   name:'主手', icon:'⚔️', slot:'main'},
  {key:'off',    name:'副手', icon:'🛡️', slot:'off'},
  {key:'acc',    name:'飾品', icon:'💍', slot:'acc'},
];


/* ════════════════ 素材 Material ════════════════
 * 欄位:key, name, icon, rarity, matCategory ('ore'|'plant'|'mob'|'craft'),
 *       basePrice (0 = 不在市集販售), source (來源系統,informational)
 * Bag 中的形式:s.bag.materials[key] = qty (整數)
 */
const MATERIAL_REGISTRY = [
  // ── craft 中間產物與基礎素材 ──
  {key:'iron_ore',     name:'鐵礦石',   icon:'⛏️', rarity:'common', matCategory:'ore',   basePrice:50,   source:['market','MINE']},
  {key:'steel_ingot',  name:'精鋼錠',   icon:'🔩', rarity:'rare',   matCategory:'craft', basePrice:200,  source:['market']},
  {key:'dark_crystal', name:'暗黑晶石', icon:'🔮', rarity:'epic',   matCategory:'craft', basePrice:1500, source:['market','MINE']},
  {key:'bone_handle',  name:'獸骨柄',   icon:'🦴', rarity:'rare',   matCategory:'craft', basePrice:0,    source:['market']},
  {key:'iron_plate',   name:'鐵板',     icon:'🟫', rarity:'common', matCategory:'craft', basePrice:0,    source:['market']},
  {key:'mithril',      name:'秘銀板',   icon:'⬜', rarity:'rare',   matCategory:'craft', basePrice:500,  source:['market','MINE']},
  {key:'crystal_core', name:'水晶芯',   icon:'💎', rarity:'rare',   matCategory:'craft', basePrice:0,    source:['market']},
  // ── 採集素材 ──
  {key:'moongrass',    name:'月光草',   icon:'🌿', rarity:'common', matCategory:'plant', basePrice:40,   source:['market','GATH']},
  {key:'sunflower',    name:'太陽花',   icon:'🌻', rarity:'common', matCategory:'plant', basePrice:0,    source:['GATH']},
  {key:'oak_wood',     name:'橡木',     icon:'🪵', rarity:'common', matCategory:'plant', basePrice:30,   source:['market','GATH']},
  // ── 採集植物:樹木 ──
  {key:'twig',             name:'細枝',     icon:'🌿', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'woodchip',         name:'木片',     icon:'🪵', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'pine_wood',        name:'松木',     icon:'🌲', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'maple_wood',       name:'楓木',     icon:'🍁', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'cherry_wood',      name:'櫻木',     icon:'🌸', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dark_wood',        name:'黑木',     icon:'🌲', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'iron_wood',        name:'鐵木',     icon:'🪵', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dragonblood_wood', name:'龍血木',   icon:'🩸', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'star_wood',        name:'星木',     icon:'⭐', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'laurel_wood',      name:'月桂木',   icon:'🌿', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'spirit_wood',      name:'靈木',     icon:'✨', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'yggdrasil_bark',   name:'世界樹幹', icon:'🌳', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  // ── 採集植物:葉子 ──
  {key:'weed',         name:'雜草',     icon:'🌱', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'mint',         name:'薄荷葉',   icon:'🌿', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'basil',        name:'羅勒',     icon:'🌿', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'eucalyptus',   name:'尤加利',   icon:'🌿', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'spirit_herb',  name:'靈藥草',   icon:'🍀', rarity:'rare',     matCategory:'plant', basePrice:300, source:['market','GATH']},
  {key:'silver_herb',  name:'銀葉草',   icon:'🌿', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'star_moss',    name:'星光苔',   icon:'✨', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dragon_tongue',name:'龍舌草',   icon:'🐲', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dream_leaf',   name:'幻夢葉',   icon:'💭', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'eternal_leaf', name:'不老葉',   icon:'🍃', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'divine_leaf',  name:'神木葉',   icon:'🍃', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'mandragora',   name:'曼陀羅',   icon:'🌺', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  // ── 採集植物:花朵 ──
  {key:'wildflower',     name:'野花',     icon:'🌼', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'daisy',          name:'雛菊',     icon:'🌼', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'lavender',       name:'薰衣草',   icon:'💜', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'rose',           name:'玫瑰',     icon:'🌹', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'lotus',          name:'蓮花',     icon:'🪷', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'night_bloom',    name:'夜來香',   icon:'🌙', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'star_flower',    name:'星辰花',   icon:'✨', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'higanbana',      name:'彼岸花',   icon:'🌺', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'phantom_flower', name:'幻光花',   icon:'🌷', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'sacred_lily',    name:'神聖百合', icon:'⚜️', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'soul_flower',    name:'靈魂花',   icon:'👻', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'eternal_rose',   name:'永恆薔薇', icon:'🌹', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  // ── 採集植物:果實 ──
  {key:'wild_berry',     name:'野莓',     icon:'🫐', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'apple',          name:'蘋果',     icon:'🍎', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'blueberry',      name:'藍莓',     icon:'🫐', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'peach',          name:'蜜桃',     icon:'🍑', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'kumquat',        name:'金柑',     icon:'🍊', rarity:'common',   matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'star_fruit',     name:'星果',     icon:'⭐', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'moon_pear',      name:'月梨',     icon:'🌙', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dragon_eye',     name:'龍眼',     icon:'👁️', rarity:'uncommon', matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'phoenix_pine',   name:'鳳梨',     icon:'🍍', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'dream_grape',    name:'夢幻葡萄', icon:'🍇', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'immortal_peach', name:'仙桃',     icon:'🍑', rarity:'rare',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'spirit_fruit',   name:'靈果',     icon:'✨', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  {key:'golden_apple',   name:'金蘋果',   icon:'🍎', rarity:'epic',     matCategory:'plant', basePrice:0, source:['GATH']},
  // ── 礦物 ──
  {key:'copper_ore',   name:'銅礦',     icon:'🟫', rarity:'common', matCategory:'ore', basePrice:0, source:['MINE']},
  {key:'silver_ore',   name:'銀礦',     icon:'⚪', rarity:'rare',   matCategory:'ore', basePrice:0, source:['MINE']},
  {key:'gold_ore',     name:'金礦',     icon:'🟡', rarity:'rare',   matCategory:'ore', basePrice:0, source:['MINE']},
  // ── 怪物素材 ──
  {key:'goblin_fang',  name:'哥布林獠牙', icon:'🦷', rarity:'common', matCategory:'mob', basePrice:0,    source:['HUNT']},
  {key:'wolf_pelt',    name:'狼皮',       icon:'🐺', rarity:'common', matCategory:'mob', basePrice:80,   source:['market','HUNT']},
  {key:'dragon_scale', name:'龍鱗',       icon:'🐉', rarity:'epic',   matCategory:'mob', basePrice:2000, source:['market','HUNT']},
  // ── 狩獵掉落 ──
  {key:'boar_meat',    name:'野豬肉', icon:'🍖', rarity:'common', matCategory:'mob', basePrice:0, source:['HUNT']},
  {key:'beast_hide',   name:'獸皮',   icon:'🟫', rarity:'common', matCategory:'mob', basePrice:0, source:['HUNT']},
  {key:'rare_fang',    name:'稀有獠牙',icon:'🦷', rarity:'rare',  matCategory:'mob', basePrice:0, source:['HUNT']},
  // ── 挖礦掉落 ──
  {key:'raw_iron',     name:'粗鐵塊',   icon:'🟫', rarity:'common', matCategory:'ore', basePrice:0, source:['MINE']},
  {key:'raw_silver',   name:'粗銀塊',   icon:'⚪', rarity:'rare',   matCategory:'ore', basePrice:0, source:['MINE']},
  {key:'gem_shard',    name:'寶石碎片', icon:'💎', rarity:'rare',   matCategory:'ore', basePrice:0, source:['MINE']},
  // ── 採集掉落:晶石(注意:shadow_crystal 原為 dark_crystal2,Phase D 會 migrate 舊存檔)──
  {key:'star_crystal',  name:'星晶', icon:'⭐', rarity:'common', matCategory:'plant', basePrice:0,   source:['GATH']},
  {key:'fire_crystal',  name:'火晶', icon:'🔥', rarity:'rare',   matCategory:'plant', basePrice:0,   source:['GATH']},
  {key:'shadow_crystal',name:'暗晶', icon:'🌑', rarity:'rare',   matCategory:'plant', basePrice:600, source:['GATH']},
  {key:'wind_crystal',  name:'風晶', icon:'💨', rarity:'rare',   matCategory:'plant', basePrice:0,   source:['GATH']},
  {key:'earth_crystal', name:'土晶', icon:'🟫', rarity:'common', matCategory:'plant', basePrice:0,   source:['GATH']},
  // ── 製造失敗保底(Task A)──
  {key:'scrap',         name:'廢料', icon:'🗑️', rarity:'common', matCategory:'craft', basePrice:0,   source:['craft']},
];


/* ════════════════ 武器 Definition ════════════════
 * Phase A 階段全部到位:market 原 5 件 + shop 新增 3 件(cheap_iron_sword/short_dagger 是 NEW、
 * 其他 shop 高階武器例如 sword2/tachi1 直接對映到 market 已有的 def)+ shadow_dagger(state 預設)
 *
 * 欄位:key, name, rarity, weaponType, baseDur, maxDur, baseEnhance, basePrice, stat, sellable
 * stat 字串格式 "ATTR +N",由 character.js / battle.js 用 regex 解析(/([A-Z]+)\s*\+(\d+)/)
 */
const WEAPON_REGISTRY = [
  {key:'iron_sword',        name:'鐵劍',     rarity:'common', weaponType:'sword1', baseDur:8, maxDur:10, baseEnhance:0, basePrice:300,  stat:'',  source:['market'],         sellable:true},
  {key:'steel_sword',       name:'精鋼劍',   rarity:'rare',   weaponType:'sword1', baseDur:6, maxDur:8,  baseEnhance:2, basePrice:1200, stat:'',  source:['market','shop'],  sellable:true},
  {key:'iron_dagger',       name:'鐵匕首',   rarity:'common', weaponType:'dagger', baseDur:9, maxDur:10, baseEnhance:0, basePrice:250,  stat:'',  source:['market'],         sellable:true},
  {key:'dark_blade',        name:'暗黑刃',   rarity:'epic',   weaponType:'tachi',  baseDur:4, maxDur:6,  baseEnhance:4, basePrice:5000, stat:'', source:['market','shop'],  sellable:true},
  {key:'iron_spear',        name:'鐵槍',     rarity:'common', weaponType:'spear',  baseDur:7, maxDur:10, baseEnhance:0, basePrice:280,  stat:'',  source:['market'],         sellable:true},
  // ── shop 低階武器(便宜版,跟 market 同名但不同數值)──
  {key:'cheap_iron_sword',  name:'鐵劍',     rarity:'common', weaponType:'sword1', baseDur:6, maxDur:6,  baseEnhance:0, basePrice:150,  stat:'',  source:['shop'],           sellable:true},
  {key:'short_dagger',      name:'短刀',     rarity:'common', weaponType:'dagger', baseDur:6, maxDur:6,  baseEnhance:0, basePrice:130,  stat:'',  source:['shop'],           sellable:true},
  // ── state.js 預設 bag 的武器(不在任何商店販售;Phase D migration 把 dagger1 → shadow_dagger)──
  {key:'shadow_dagger',     name:'暗影匕首', rarity:'rare',   weaponType:'dagger', baseDur:5, maxDur:8,  baseEnhance:1, basePrice:1200, stat:'',  source:['state_default'],  sellable:true},
  // ── Rapier 細劍(AGI 系,輕、易斷)──
  {key:'wooden_rapier',     name:'木細劍',   rarity:'common',    weaponType:'rapier',     baseDur:6,  maxDur:8,  baseEnhance:0, basePrice:200,   stat:'',  source:['market'],         sellable:true},
  {key:'iron_rapier',       name:'鐵細劍',   rarity:'uncommon',  weaponType:'rapier',     baseDur:7,  maxDur:10, baseEnhance:1, basePrice:500,   stat:'',  source:['market'],         sellable:true},
  {key:'silver_rapier',     name:'銀細劍',   rarity:'rare',      weaponType:'rapier',     baseDur:5,  maxDur:8,  baseEnhance:2, basePrice:1300,  stat:'',  source:['market'],         sellable:true},
  {key:'phantom_rapier',    name:'幻影細劍', rarity:'epic',      weaponType:'rapier',     baseDur:4,  maxDur:6,  baseEnhance:4, basePrice:4500,  stat:'', source:['market','shop'],  sellable:true},
  {key:'wind_thorn',        name:'風之刺',   rarity:'legendary', weaponType:'rapier',     baseDur:3,  maxDur:5,  baseEnhance:6, basePrice:12000, stat:'', source:[],                 sellable:true},
  // ── Greatsword 大劍(STR 強,雙手)──
  {key:'iron_greatsword',   name:'鐵大劍',   rarity:'common',    weaponType:'greatsword', baseDur:8,  maxDur:10, baseEnhance:0, basePrice:400,   stat:'',  source:['market'],         sellable:true},
  {key:'steel_greatsword',  name:'精鋼大劍', rarity:'uncommon',  weaponType:'greatsword', baseDur:7,  maxDur:10, baseEnhance:1, basePrice:900,   stat:'',  source:['market'],         sellable:true},
  {key:'flamberge',         name:'焰紋大劍', rarity:'rare',      weaponType:'greatsword', baseDur:6,  maxDur:8,  baseEnhance:2, basePrice:2200,  stat:'', source:['market'],         sellable:true},
  {key:'dragon_slayer',     name:'屠龍大劍', rarity:'epic',      weaponType:'greatsword', baseDur:5,  maxDur:8,  baseEnhance:4, basePrice:6500,  stat:'', source:['market','shop'],  sellable:true},
  {key:'world_breaker',     name:'破世大劍', rarity:'legendary', weaponType:'greatsword', baseDur:4,  maxDur:7,  baseEnhance:6, basePrice:18000, stat:'', source:[],                 sellable:true},
  // ── Mace 單手錘(STR 中,鈍器、高耐久)──
  {key:'wooden_mace',       name:'木錘',     rarity:'common',    weaponType:'mace',       baseDur:10, maxDur:12, baseEnhance:0, basePrice:220,   stat:'',  source:['market'],         sellable:true},
  {key:'iron_mace',         name:'鐵錘',     rarity:'uncommon',  weaponType:'mace',       baseDur:9,  maxDur:12, baseEnhance:1, basePrice:480,   stat:'',  source:['market'],         sellable:true},
  {key:'morning_star',      name:'晨星錘',   rarity:'rare',      weaponType:'mace',       baseDur:8,  maxDur:12, baseEnhance:2, basePrice:1100,  stat:'',  source:['market'],         sellable:true},
  {key:'crusher',           name:'粉碎者',   rarity:'epic',      weaponType:'mace',       baseDur:7,  maxDur:10, baseEnhance:4, basePrice:3800,  stat:'', source:['market','shop'],  sellable:true},
  {key:'judgment_hammer',   name:'審判之鎚', rarity:'legendary', weaponType:'mace',       baseDur:6,  maxDur:10, baseEnhance:6, basePrice:11000, stat:'', source:[],                 sellable:true},
  // ── Axe 雙手斧(STR 極高,爆發、易斷)──
  {key:'stone_axe',         name:'石斧',     rarity:'common',    weaponType:'axe',        baseDur:6,  maxDur:8,  baseEnhance:0, basePrice:300,   stat:'',  source:['market'],         sellable:true},
  {key:'iron_axe',          name:'鐵斧',     rarity:'uncommon',  weaponType:'axe',        baseDur:7,  maxDur:10, baseEnhance:1, basePrice:700,   stat:'',  source:['market'],         sellable:true},
  {key:'battle_axe',        name:'戰斧',     rarity:'rare',      weaponType:'axe',        baseDur:6,  maxDur:9,  baseEnhance:2, basePrice:1900,  stat:'', source:['market'],         sellable:true},
  {key:'berserker_axe',     name:'狂戰士斧', rarity:'epic',      weaponType:'axe',        baseDur:5,  maxDur:7,  baseEnhance:4, basePrice:5800,  stat:'', source:['market','shop'],  sellable:true},
  {key:'world_cleaver',     name:'裂世斧',   rarity:'legendary', weaponType:'axe',        baseDur:4,  maxDur:6,  baseEnhance:6, basePrice:16000, stat:'', source:[],                 sellable:true},
  // ── Shield 盾牌(VIT 系,副手、最高耐久)──
  {key:'wooden_shield',     name:'木盾',     rarity:'common',    weaponType:'shield',     baseDur:10, maxDur:12, baseEnhance:0, basePrice:180,   stat:'',  source:['market'],         sellable:true},
  {key:'iron_shield',       name:'鐵盾',     rarity:'uncommon',  weaponType:'shield',     baseDur:12, maxDur:15, baseEnhance:1, basePrice:450,   stat:'',  source:['market'],         sellable:true},
  {key:'tower_shield',      name:'塔盾',     rarity:'rare',      weaponType:'shield',     baseDur:11, maxDur:15, baseEnhance:2, basePrice:1200,  stat:'',  source:['market'],         sellable:true},
  {key:'aegis',             name:'神盾',     rarity:'epic',      weaponType:'shield',     baseDur:10, maxDur:14, baseEnhance:4, basePrice:4200,  stat:'', source:['market','shop'],  sellable:true},
  {key:'world_guardian',    name:'守世盾',   rarity:'legendary', weaponType:'shield',     baseDur:9,  maxDur:13, baseEnhance:6, basePrice:13500, stat:'', source:[],                 sellable:true},
];


/* ════════════════ 防具 Definition ════════════════ */
const ARMOR_REGISTRY = [
  {key:'iron_helmet',  name:'鐵頭盔',   rarity:'common', armorType:'helmet', baseDur:8, maxDur:10, baseEnhance:0, basePrice:200,  stat:'', source:['market'],        sellable:true},
  {key:'steel_chest',  name:'精鋼胸甲', rarity:'rare',   armorType:'chest',  baseDur:5, maxDur:8,  baseEnhance:3, basePrice:800,  stat:'', source:['market','shop'], sellable:true},
  {key:'leather_pants',name:'皮革褲',   rarity:'common', armorType:'pants',  baseDur:9, maxDur:10, baseEnhance:0, basePrice:180,  stat:'', source:['market'],        sellable:true},
  {key:'iron_boots',   name:'鐵靴',     rarity:'common', armorType:'boots',  baseDur:7, maxDur:10, baseEnhance:1, basePrice:160,  stat:'', source:['market'],        sellable:true},
  {key:'dragon_ring',  name:'龍骨戒指', rarity:'epic',   armorType:'acc',    baseDur:3, maxDur:6,  baseEnhance:5, basePrice:3000, stat:'', source:['market','shop'], sellable:true},
  // ── shop 低階防具 ──
  {key:'leather_armor',name:'皮甲',     rarity:'common', armorType:'chest',  baseDur:6, maxDur:6,  baseEnhance:0, basePrice:120,  stat:'', source:['shop'],          sellable:true},
  {key:'light_boots',  name:'輕步靴',   rarity:'common', armorType:'boots',  baseDur:6, maxDur:6,  baseEnhance:0, basePrice:100,  stat:'', source:['shop'],          sellable:true},
];


/* ════════════════ 消耗道具 Definition ════════════════
 * effect.kind:'heal' (恢復 HP,amount 必填)
 *           |'cure' (解狀態,status:'poison'|'all')
 *           |'escape' (戰鬥逃脫,無 amount)
 *           |'identify' (鑑定,無 amount)
 *           |'buff' (暫時加屬性,attr/delta/duration 必填)
 *           |'noop' (純收藏品,無效果)
 * itemType: 'potion'|'food'|'scroll'|'tool'|'other'(顯示分類)
 */
const CONSUMABLE_REGISTRY = [
  {key:'hp_s',     name:'初級回復藥', icon:'🧪', rarity:'common',   itemType:'potion', basePrice:80,  stack:true, effect:{kind:'heal', amount:50},        source:['market','shop'], sellable:true},
  {key:'hp_m',     name:'中級回復藥', icon:'🧪', rarity:'rare',     itemType:'potion', basePrice:300, stack:true, effect:{kind:'heal', amount:150},       source:['market','shop'], sellable:true},
  {key:'hp_l',     name:'高級回復藥', icon:'🧪', rarity:'rare',     itemType:'potion', basePrice:200, stack:true, effect:{kind:'heal', amount:300},       source:['shop'],          sellable:true},
  {key:'bread',    name:'麵包',       icon:'🍞', rarity:'common',   itemType:'food',   basePrice:50,  stack:true, effect:{kind:'heal', amount:30},        source:['market'],        sellable:true},
  {key:'stew',     name:'燉肉',       icon:'🍖', rarity:'rare',     itemType:'food',   basePrice:200, stack:true, effect:{kind:'heal', amount:80},        source:['market'],        sellable:true},
  {key:'antidote', name:'解毒藥',     icon:'💊', rarity:'common',   itemType:'potion', basePrice:40,  stack:true, effect:{kind:'cure', status:'poison'},  source:['shop'],          sellable:true},
  {key:'elixir',   name:'萬能藥',     icon:'💊', rarity:'rare',     itemType:'potion', basePrice:180, stack:true, effect:{kind:'cure', status:'all'},     source:['shop'],          sellable:true},
  {key:'scroll',   name:'逃脫卷軸',   icon:'📜', rarity:'common',   itemType:'scroll', basePrice:150, stack:true, effect:{kind:'escape'},                 source:['market'],        sellable:true},
  {key:'id_book',  name:'鑑定書',     icon:'📖', rarity:'rare',     itemType:'tool',   basePrice:400, stack:true, effect:{kind:'identify'},               source:['market'],        sellable:true},
];


/* ════════════════ 種子定義(GATH 農田系統)════════════════
 * 加新種子兩步:
 *   1. 確認 output.matKey 在 MATERIAL_REGISTRY 已存在(植物素材通常已在 GATH 區)
 *   2. 在 SEED_REGISTRY 加一行 {key, name, icon, rarity, growthMs, growthIcons[4], output, gathExp}
 * 種子本身也是 material(matCategory:'seed'),會被 push 進 MATERIAL_REGISTRY,
 * 所以走 bag/market/shop/chest 流程零新管線。
 * ═══════════════════════════════════════════════════════════ */
const SEED_REGISTRY = [
  { key:'seed_weed',         name:'雜草種子',   icon:'🌰', rarity:'common',
    growthMs: 5*60*1000,
    growthIcons: ['🌱','🌿','🌾','🌿'],
    output: { matKey:'weed', min:1, max:3 },
    gathExp: 5 },
  { key:'seed_mint',         name:'薄荷種子',   icon:'🌰', rarity:'common',
    growthMs: 8*60*1000,
    growthIcons: ['🌱','🌿','🌾','🌿'],
    output: { matKey:'mint', min:1, max:3 },
    gathExp: 6 },
  { key:'seed_moongrass',    name:'月光草種子', icon:'🌰', rarity:'uncommon',
    growthMs: 20*60*1000,
    growthIcons: ['🌱','🌿','🌾','🌙'],
    output: { matKey:'moongrass', min:2, max:4 },
    gathExp: 12 },
  { key:'seed_rose',         name:'玫瑰種子',   icon:'🌰', rarity:'uncommon',
    growthMs: 30*60*1000,
    growthIcons: ['🌱','🌿','🌾','🌹'],
    output: { matKey:'rose', min:1, max:3 },
    gathExp: 15 },
  { key:'seed_apple',        name:'蘋果種子',   icon:'🌰', rarity:'rare',
    growthMs: 60*60*1000,
    growthIcons: ['🌱','🌿','🌳','🍎'],
    output: { matKey:'apple', min:2, max:5 },
    gathExp: 25 },
  { key:'seed_lotus',        name:'蓮花種子',   icon:'🌰', rarity:'rare',
    growthMs: 90*60*1000,
    growthIcons: ['🌱','🌿','🌾','🪷'],
    output: { matKey:'lotus', min:1, max:3 },
    gathExp: 35 },
  { key:'seed_spirit_herb',  name:'靈藥草種子', icon:'🌰', rarity:'epic',
    growthMs: 3*60*60*1000,
    growthIcons: ['🌱','🌿','✨','🍀'],
    output: { matKey:'spirit_herb', min:1, max:2 },
    gathExp: 60 },
  { key:'seed_golden_apple', name:'金蘋果種子', icon:'🌰', rarity:'legendary',
    growthMs: 8*60*60*1000,
    growthIcons: ['🌱','🌿','🌳','🍎'],
    output: { matKey:'golden_apple', min:1, max:2 },
    gathExp: 200 },
];

// 種子也算 material(合進 MATERIAL_REGISTRY,shape 兼容,matCategory:'seed')。
// 必須在 _itemCache 第一次建立之前 push 完。
SEED_REGISTRY.forEach(s => MATERIAL_REGISTRY.push({
  key: s.key, name: s.name, icon: s.icon, rarity: s.rarity,
  matCategory: 'seed',
  basePrice: { common:30, uncommon:80, rare:200, epic:600, legendary:2000 }[s.rarity] || 50,
  source: ['HUNT','shop','chest'],
}));

function getSeedDef(key){ return SEED_REGISTRY.find(s => s.key === key) || null; }


/* ════════════════ 查詢函式(lazy Map cache) ════════════════
 * 第一次呼叫時建 Map,之後 O(1) 查找。registry 是 array(便於 iterate/filter),
 * cache 是 Map(便於 key lookup),兩者並存。
 */
const _itemCache = {};
function _findIn(arr, cacheKey, key){
  let m = _itemCache[cacheKey];
  if(!m){
    m = new Map();
    arr.forEach(d => m.set(d.key, d));
    _itemCache[cacheKey] = m;
  }
  return m.get(key) || null;
}
function getMaterialDef(key)  { return _findIn(MATERIAL_REGISTRY,   'mat', key); }
function getWeaponDef(key)    { return _findIn(WEAPON_REGISTRY,     'wpn', key); }
function getArmorDef(key)     { return _findIn(ARMOR_REGISTRY,      'arm', key); }
function getConsumableDef(key){ return _findIn(CONSUMABLE_REGISTRY, 'csm', key); }
function getWeaponType(key)   { return _findIn(WEAPON_TYPES,        'wt',  key); }
function getArmorType(key)    { return _findIn(ARMOR_TYPES,         'at',  key); }


/* ════════════════ Factory:Definition → Instance ════════════════
 * uid 規則:'w'+Date.now()+'_'+rand6 / 'a'+Date.now()+'_'+rand6
 * (CLAUDE.md hard rule 1:Date.now() 單獨用會碰撞,必加 random 後綴)
 *
 * Instance 欄位完整對應 bag.weapons / bag.armors 既有 shape,新增 stat 欄位
 * (修 statStr 從未寫入的 bug)。其他欄位(uid/key/name/rarity/weaponType|armorType/
 * dur/maxDur/enhance/sellPrice)維持與既有資料 binary-compatible。
 */
function newUid(prefix){
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2,8);
}

function makeWeaponInstance(key, opts){
  // opts(可選):{equipSkill?:string|null, customName?:string|null, overrides?:{}}
  // 不傳 opts 時行為與舊版相同(Phase B / D 寫入點都不傳 opts)。
  // overrides 可覆寫 dur / maxDur(Task A 製造產出耐久浮動用)。
  const d = getWeaponDef(key);
  if(!d){ console.warn('[items] makeWeaponInstance: unknown weapon key:', key); return null; }
  const o = opts || {};
  const inst = {
    uid:        newUid('w'),
    key:        d.key,
    name:       d.name,
    rarity:     d.rarity,
    weaponType: d.weaponType,
    stat:       d.stat || '',
    dur:        d.baseDur,
    maxDur:     d.maxDur,
    enhance:    d.baseEnhance || 0,
    sellPrice:  Math.floor(d.basePrice * 0.5),
    equipSkill: (o.equipSkill !== undefined) ? o.equipSkill : null, // Task B 用,v1 先 null
    customName: (o.customName !== undefined) ? o.customName : null, // Task B 用,v1 先 null
  };
  if(o.overrides && typeof o.overrides === 'object') Object.assign(inst, o.overrides);
  return inst;
}

function makeArmorInstance(key){
  const d = getArmorDef(key);
  if(!d){ console.warn('[items] makeArmorInstance: unknown armor key:', key); return null; }
  return {
    uid:        newUid('a'),
    key:        d.key,
    name:       d.name,
    rarity:     d.rarity,
    armorType:  d.armorType,
    stat:       d.stat || '',
    dur:        d.baseDur,
    maxDur:     d.maxDur,
    enhance:    d.baseEnhance || 0,
    sellPrice:  Math.floor(d.basePrice * 0.5),
  };
}


/* ════════════════ 動態查詢 view ════════════════
 * getMarketBuyList():給市集 render 用,組出與舊 MARKET_ITEMS 同 shape 的物件,
 *   但內容從 *_REGISTRY 動態組出。filter 條件:source 含 'market' 且 basePrice > 0。
 *   注意:weapon / armor / item 的物件帶 price 欄位(= basePrice)以維持與既有
 *   render code 相容(舊 code 讀 item.price)。
 *
 * getConsumableSafe(key):market.js / panel.js / bag.js 的「未知道具 key fallback」
 *   工具,回傳穩定的最小欄位物件,確保 UI 不爆。
 */
function getMarketBuyList(){
  const wrap = (d, extra) => ({...d, price: d.basePrice, ...extra});
  return {
    material: MATERIAL_REGISTRY
      .filter(m => m.basePrice > 0 && (m.source||[]).includes('market'))
      .map(m => wrap(m, {category:'material'})),
    weapon: WEAPON_REGISTRY
      .filter(w => w.basePrice > 0 && (w.source||[]).includes('market'))
      .map(w => wrap(w, {category:'weapon', dur:w.baseDur, enhance:w.baseEnhance||0})),
    armor: ARMOR_REGISTRY
      .filter(a => a.basePrice > 0 && (a.source||[]).includes('market'))
      .map(a => wrap(a, {category:'armor', dur:a.baseDur, enhance:a.baseEnhance||0})),
    item: CONSUMABLE_REGISTRY
      .filter(i => i.basePrice > 0 && (i.source||[]).includes('market'))
      .map(i => wrap(i, {category:'item'})),
  };
}

function getConsumableSafe(key){
  return getConsumableDef(key) || {key, name:key, rarity:'common', itemType:'other', basePrice:0};
}


/* ════════════════ 製造系統 helpers(Task A)════════════════
 * 三個工具函式都是純函式,可重用於將來 armor/potion 製造的 backend。
 *
 * computeMaterialScore(slots):取 {[partKey]:[{matKey,qty},...]} 形式的素材槽,
 *   攤平所有素材,回傳 (sum(score×qty)) / sum(qty),即 per-unit 的稀有度分數。
 *   空槽回 0;未知 matKey 視為 common(score=1)+ console.warn(由 getMaterialDef 印)。
 *
 * scoreToRarity(score):依 RARITY_THRESHOLDS 區間決定目標 rarity 字串。
 *
 * pickWeaponByTypeRarity(weaponType, rarity):從 WEAPON_REGISTRY 找符合
 *   weaponType + rarity 的 def,多個則隨機。找不到則先往低 rarity 退、再往高 rarity 試,
 *   全空回 null + warn(代表 registry 沒覆蓋該 weaponType,呼叫端需自行處理)。
 */
function computeMaterialScore(slots){
  let totalScore = 0, totalQty = 0;
  Object.values(slots || {}).forEach(matList => {
    (matList || []).forEach(m => {
      const def = getMaterialDef(m.matKey);
      const score = MATERIAL_RARITY_SCORE[def && def.rarity] || 1;
      totalScore += score * m.qty;
      totalQty   += m.qty;
    });
  });
  return totalQty > 0 ? totalScore / totalQty : 0;
}

function scoreToRarity(score){
  for(const t of RARITY_THRESHOLDS){
    if(score < t.max) return t.rarity;
  }
  return 'common';
}

function pickWeaponByTypeRarity(weaponType, rarity){
  const order = ['common','uncommon','rare','epic','legendary'];
  const startIdx = order.indexOf(rarity);
  // 試:目標 → 比目標低(由近至遠) → 比目標高(由近至遠)
  const tryOrder = startIdx < 0
    ? order.slice()
    : [
        rarity,
        ...order.slice(0, startIdx).reverse(),
        ...order.slice(startIdx + 1),
      ];
  for(const r of tryOrder){
    const candidates = WEAPON_REGISTRY.filter(w =>
      w.weaponType === weaponType && w.rarity === r);
    if(candidates.length > 0){
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      if(r !== rarity){
        console.warn('[craft] '+weaponType+' '+rarity+' 無 def, fallback to '+r+': '+picked.key);
      }
      return picked;
    }
  }
  console.warn('[craft] '+weaponType+' 完全無 def');
  return null;
}
