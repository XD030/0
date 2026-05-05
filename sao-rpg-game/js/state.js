/* ========================================================================
 * state.js — 全域遊戲狀態
 *
 * 內容:
 *   1. 不可變常數(SK / DATA_VER / ATTRS / EQUIP_OPTIONS / SKILL_DEFS、製造 / 命名平衡參數 …)
 *   2. 全域執行狀態(currentPage / currentAdvPage / inAdvMode)
 *   3. initState():從 localStorage 讀取存檔並補齊預設值,版本不符時重建
 *   4. runStateMigrations():一次性的存檔遷移 / 清理
 *
 * 注意:
 *   - 本檔載入後**不會自動執行任何邏輯**,只負責定義;啟動流程由 main.js 呼叫。
 *   - load() / save() 已搬到 storage.js,本檔仍直接使用全域版本。
 *   - 函式都掛在全域(window),沿用原始檔命名。
 * ======================================================================== */

/* ════════════════════════════════════════════════
 * 1. 常數
 * ════════════════════════════════════════════════ */
const SK='wxrpg6';
const DATA_VER=4;

// ── 主屬性(12 個,中文 key)──
// 肉體系 6:力量 / 敏捷 / 反應 / 體魄 / 技巧 / 肉體抗性
// 精神系 6:靈力 / 理智 / 專注 / 意志 / 感知 / 親和
// E5 之前雷達圖鎖死,屬性 row 仍依此順序顯示
const ATTRS=['力量','敏捷','反應','體魄','技巧','肉體抗性','靈力','理智','專注','意志','感知','親和'];
const ATTR_COLOR={
  // 肉體系暖色
  '力量':'#ff7040', '敏捷':'#00ffcc', '反應':'#ffcc44',
  '體魄':'#00c8ff', '技巧':'#ffaa33', '肉體抗性':'#bb8866',
  // 精神系冷色
  '靈力':'#cc88ff', '理智':'#88aaff', '專注':'#44ddff',
  '意志':'#dde8ff', '感知':'#ff88cc', '親和':'#ffaaee'
};
// 肉體系 / 精神系分群(E5 雷達圖切換 toggle 用,E1 暫不使用)
const ATTRS_PHYS=['力量','敏捷','反應','體魄','技巧','肉體抗性'];
const ATTRS_MIND=['靈力','理智','專注','意志','感知','親和'];

// E1.5:屬性顯示名(只覆蓋需要縮短/改寫的 key,其他 fallback 到 attr 本身)
// 程式內仍用「肉體抗性」當 key(不影響 migration / 衍生值公式 / 裝備字串解析)
const ATTR_DISPLAY_NAME={'肉體抗性':'抗性'};

const LIFE_ATTRS=['HUNT','GATH','MINE','CRFT','COOK'];
const LIFE_COLOR={HUNT:'#ff6644',GATH:'#88dd44',MINE:'#aaaaaa',CRFT:'#ffaa33',COOK:'#ff88aa'};
const LIFE_SKILL_NAME={HUNT:'狩獵',GATH:'採集',MINE:'挖礦',CRFT:'製造',COOK:'烹飪'};
const SLOT_UNLOCKS=[1,1,5,10,20,30,50,70];

const HUNT_MAX_MS=24*60*60*1000;
const HUNT_MIN_MS=30*60*1000;

/* ── 製造系統平衡常數(Task A)──
 * 成功率 = clamp(BASE + lv*LV_BONUS - tier*TIER_PENALTY, MIN, MAX)
 *   tier:目標 rarity 在 [common,uncommon,rare,epic,legendary] 的 index(0~4)
 * 退材率(失敗時每個素材獨立判定):lv 1 = 30%、lv 100 = 70%(線性內插)
 * 製造時間:lv 1 = 15 分鐘、lv 100 = 10 分鐘(線性內插)
 * 佇列上限 4 把、進佇列即扣素材、按下當下凍結 lv 與 score(避免邊製造邊升級作弊)
 */
const CRFT_LV_CAP        = 100;
const CRFT_BASE_SUCCESS  = 40;
const CRFT_LV_BONUS      = 0.6;
const CRFT_TIER_PENALTY  = 10;
const CRFT_SUCCESS_MIN   = 10;
const CRFT_SUCCESS_MAX   = 95;
const CRFT_RETURN_MIN    = 0.30;
const CRFT_RETURN_MAX    = 0.70;
const CRFT_TIME_MAX_MS   = 15 * 60 * 1000;
const CRFT_TIME_MIN_MS   = 10 * 60 * 1000;
const CRFT_QUEUE_MAX     = 4;

const CRFT_EXP_TABLE = {common:3, uncommon:6, rare:10, epic:17, legendary:30};
const CRFT_EXP_FAIL  = 1;

/* ── 命名加成參數(Task B)──
 * 命名加成依武器 rarity 決定 stat 與 dur 範圍;命中愈高 → 落點愈接近 high。
 * 命中規則:逐字比對玩家輸入 vs 今日 craftNamingRule.goodWords / badWords,
 *          每字最多算 1 次,壞詞 ×NAMING_BAD_WEIGHT,淨命中 clamp(0, NAMING_HITS_MAX)。
 */
const NAMING_RARITY_RANGES = {
  common:    {statLow:1,  statHigh:5,  durLow:0.80, durHigh:1.20},
  uncommon:  {statLow:3,  statHigh:8,  durLow:0.85, durHigh:1.30},
  rare:      {statLow:5,  statHigh:12, durLow:0.90, durHigh:1.40},
  epic:      {statLow:8,  statHigh:18, durLow:0.95, durHigh:1.50},
  legendary: {statLow:15, statHigh:30, durLow:1.00, durHigh:1.60},
};
const NAMING_NAME_MAX     = 15;   // 武器名上限字數
const NAMING_BAD_WEIGHT   = 2;    // 壞詞每字扣 1×weight
const NAMING_HITS_MAX     = 15;   // 淨命中上限
const NAMING_GOOD_PER_DAY = 10;   // 每日抽好詞數
const NAMING_BAD_PER_DAY  = 5;    // 每日抽壞詞數

const EQUIP_OPTIONS={
  main:[
    {name:'Iron Sword',rarity:'common',stat:'',durability:5,maxDurability:10},
    {name:'Anneal Blade',rarity:'rare',stat:'',durability:6,maxDurability:8},
    {name:'Elucidator',rarity:'epic',stat:'',durability:4,maxDurability:6}
  ],
  off:[
    {name:'Small Shield',rarity:'common',stat:'',durability:6,maxDurability:8},
    {name:'Kite Shield',rarity:'rare',stat:'',durability:5,maxDurability:8}
  ],
  helmet:[
    {name:'Iron Helm',rarity:'common',stat:'',durability:4,maxDurability:6},
    {name:'Steel Helm',rarity:'rare',stat:'',durability:6,maxDurability:10}
  ],
  chest:[
    {name:'Leather Coat',rarity:'common',stat:'',durability:3,maxDurability:8},
    {name:'Scale Armor',rarity:'rare',stat:'',durability:5,maxDurability:8}
  ],
  pants:[
    {name:'Leather Pants',rarity:'common',stat:'',durability:5,maxDurability:8},
    {name:'Iron Greaves',rarity:'rare',stat:'',durability:2,maxDurability:8}
  ],
  boots:[
    {name:'Leather Boots',rarity:'common',stat:'',durability:6,maxDurability:8},
    {name:'Wind Boots',rarity:'rare',stat:'',durability:4,maxDurability:8}
  ],
  acc1:[
    {name:'Ring of AGI',rarity:'rare',stat:'',durability:6,maxDurability:6},
    {name:'Amulet of STR',rarity:'epic',stat:'',durability:3,maxDurability:6}
  ],
  acc2:[
    {name:'Ring of AGI',rarity:'rare',stat:'',durability:6,maxDurability:6},
    {name:'Amulet of STR',rarity:'epic',stat:'',durability:5,maxDurability:6}
  ]
};

/* ── 精髓系統(Phase 1:UI 框架)──
 * 20 格純槽位,每 5 級開 1 格(lv5→1, lv100→20)
 * 每格 null 或 essence 物件 { id, name, tier:1-9 } (1 最高 9 最低)
 * 暫僅 UI,不開放填入
 */
const ESSENCE_MAX = 20;
const ESSENCE_PER_PAGE = 20;  // 改單頁顯示後等於 ESSENCE_MAX,常數名暫保留
const ESSENCE_UNLOCK_STEP = 5;
function essenceUnlocked(level){
  // lv 1 起預設 1 格,之後每 5 級 +1 格(lv 5→2, lv 95→20, lv 100 cap 在 20)
  return Math.min(ESSENCE_MAX, 1 + Math.max(0, Math.floor((level||0)/ESSENCE_UNLOCK_STEP)));
}
function nextEssenceLv(level){
  // cur=1(lv 1-4) → 下個 lv 5; cur=2(lv 5-9) → 下個 lv 10 ... cur=20 → 全開回 null
  const cur = essenceUnlocked(level);
  if(cur >= ESSENCE_MAX) return null;
  return cur * ESSENCE_UNLOCK_STEP;
}

/* ── 技能定義 ──
 * move: { id, name, type:'atk'|'def'|'spc', hits, mul, desc, profReq }
 * mul: STR 倍率(atk)或 回復倍率(def)
 * profBonus: 熟練度 1000 時的額外加成倍率
 */
const SKILL_DEFS={
  unarmed:{
    name:'體術', desc:'徒手戰鬥',
    moves:[
      {id:'unarmed_strike', name:'普通攻擊', type:'atk', hits:1, mul:0.8,  profBonus:0.4, profReq:0,   cost:0, recover:3, desc:'基礎攻擊,STR×0.8(回 3 MP)'},
      {id:'unarmed_combo',  name:'連擊',     type:'atk', hits:2, mul:0.5,  profBonus:0.3, profReq:400, cost:2, desc:'2連擊,各STR×0.5'},
      {id:'unarmed_burst',  name:'爆發拳',   type:'atk', hits:1, mul:2.0,  profBonus:0.5, profReq:800, cost:6, desc:'STR×2.0,自身-10HP', selfDmg:10},
    ],
  },
  sword1:{
    name:'單手劍', desc:'單手劍技',
    moves:[
      {id:'sword1_slash',   name:'基礎斬擊',   type:'atk', hits:1, mul:1.0,  profBonus:0.5, profReq:0,   cost:0, recover:3, desc:'基礎劍技,STR×1.0(回 3 MP)'},
      {id:'sword1_spiral',  name:'螺旋斬',     type:'atk', hits:1, mul:1.5,  profBonus:0.5, profReq:300, cost:4, desc:'STR×1.5,破防效果', debuff:'PRT_break'},
      {id:'sword1_horizon', name:'水平方陣斬', type:'atk', hits:4, mul:0.6,  profBonus:0.4, profReq:700, cost:6, desc:'4連擊,各STR×0.6'},
      {id:'sword1_aura',    name:'劍氣',       type:'atk', hits:1, mul:2.5,  profBonus:0.5, profReq:900, cost:10,desc:'劍氣衝擊,STR×2.5'},
    ],
  },
  parry:{
    name:'格擋', desc:'防禦反擊',
    moves:[
      {id:'parry_basic',   name:'格擋',       type:'def', mul:0.4,  profBonus:0.2, profReq:0,   cost:0, recover:2, desc:'減傷40%,持續1回合(回 2 MP)'},
      {id:'parry_counter', name:'反擊格擋',   type:'def', mul:0.4,  profBonus:0.2, profReq:400, cost:2, desc:'減傷+反擊STR×0.8', counterMul:0.8},
      {id:'parry_perfect', name:'完美格擋',   type:'def', mul:1.0,  profBonus:0,   profReq:800, cost:6, desc:'完全無傷+敵方眩暈1回合', stun:true},
    ],
  },
  heal:{
    name:'治癒術', desc:'戰鬥中回復',
    moves:[
      {id:'heal_basic',  name:'治癒',   type:'def', healMul:0.25, profBonus:0.15, profReq:0,   cost:2, desc:'回復最大HP的25%'},
      {id:'heal_regen',  name:'再生',   type:'def', regenTurns:3, profBonus:0,    profReq:400, cost:4, desc:'持續3回合緩慢回血'},
      {id:'heal_burst',  name:'爆發治癒',type:'def', healMul:0.5,  profBonus:0.2, profReq:800, cost:6, desc:'回復最大HP的50%'},
    ],
  },
  poison:{
    name:'毒術', desc:'毒素攻擊',
    moves:[
      {id:'poison_mist',  name:'毒霧',   type:'spc', poisonTurns:4, profBonus:0, profReq:0,   cost:2, desc:'敵人中毒4回合'},
      {id:'poison_burst', name:'毒爆',   type:'atk', hits:1, mul:0.8, poisonTurns:3, profBonus:0.4, profReq:500, cost:4, desc:'攻擊+中毒3回合'},
      {id:'poison_cloud', name:'劇毒雲', type:'spc', poisonTurns:6, profBonus:0, profReq:900, cost:6, desc:'敵人劇毒6回合'},
    ],
  },
  charge:{
    name:'蓄力', desc:'強化下次攻擊',
    moves:[
      {id:'charge_basic', name:'蓄力',   type:'spc', chargeMul:2.5, profBonus:0.5, profReq:0,   cost:2, desc:'下回合傷害×2.5'},
      {id:'charge_full',  name:'全力蓄力',type:'spc', chargeMul:4.0, profBonus:0,   profReq:600, cost:4, desc:'下回合傷害×4.0,需跳過此回合'},
    ],
  },
};

/* 技能 key 對應 SKILL_OPTIONS(用於技能槽選擇) */
const SKILL_OPTIONS=Object.entries(SKILL_DEFS)
  .filter(([k])=>k!=='sword_mastery'&&k!=='unarmed')
  .map(([k,v])=>({key:k, name:v.name, desc:v.desc}));

/* 屬性關鍵字(用於 guessAttr 自動分類) */
const ATTR_KW={
  HUNT:['狩獵','打獵','獵','捕','射擊','弓箭','陷阱','野外','運動','健身','跑步','走路','散步','騎車','游泳'],
  GATH:['採集','採','摘','收集','採摘','草藥','植物','花','種植','澆水','栽培'],
  MINE:['挖礦','挖','採礦','礦','鑿','石頭','金屬','鐵','打掃','整理','清潔'],
  CRFT:['製造','製作','做','工藝','打造','裝備','木工','縫紉','編織','畫','寫','讀','學習','閱讀','筆記','練習'],
  COOK:['烹飪','煮','做菜','料理','烤','炒','燉','食譜','廚','吃飯','吃','飲食','喝水','飲水','水'],
};

/* ════════════════════════════════════════════════
 * 2. 全域執行狀態(runtime UI state)
 * ════════════════════════════════════════════════ */
let currentPage='adventure';
let currentAdvPage='map';
let inAdvMode=false;

/* ════════════════════════════════════════════════
 * 3. localStorage 包裝
 *    Phase 2:已搬到 storage.js — load() / save() 在 js/storage.js 中定義。
 *    state.js 仍直接使用全域的 load() / save(),只是不在這裡定義。
 * ════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════
 * 4. initState — 載入並補齊存檔
 *    版本不符會清空重建,確保格式正確。
 * ════════════════════════════════════════════════ */
function initState(){
  let s=load();
  // 版本不符就清掉重建
  if(!s.ver||s.ver<DATA_VER){
    s={ver:DATA_VER};
  }
  if(!s.character){
    s.character={name:'無名俠客',level:1,exp:0,hp:1000,mp:100,pendingPoints:0,skillSlots:2};
    ATTRS.forEach(a=>s.character[a]=0);
  }
  // 生活技能等級系統(獨立於戰鬥屬性)
  if(!s.lifeSkills)s.lifeSkills={};
  LIFE_ATTRS.forEach(a=>{
    if(!s.lifeSkills[a])s.lifeSkills[a]={lv:1,exp:0};
  });
  const defaultDaily=[
    {id:'d1',name:'睡眠',desc:'睡滿 7-8 小時'},
    {id:'d2',name:'飲水',desc:'喝足 2000ml'},
    {id:'d3',name:'運動',desc:'至少 30 分鐘'},
    {id:'d4',name:'蔬果',desc:'吃蔬菜或水果'},
    {id:'d5',name:'學習',desc:'閱讀或學習 15 分鐘'}
  ];
  if(!s.dailyTasks)s.dailyTasks=defaultDaily.map(t=>({...t,submitted:false,todayValue:0}));
  // 確保每個 daily task 欄位正確
  s.dailyTasks.forEach((t,i)=>{
    t.id=t.id||defaultDaily[i]?.id||'d'+(i+1);
    if(t.submitted===undefined)t.submitted=false;
    if(t.todayValue===undefined)t.todayValue=0;
    delete t.done;
  });
  if(!s.personalTasks)s.personalTasks=[];
  if(!s.timedTasks)s.timedTasks=[];
  if(!s.character.gold) s.character.gold=500;
  if(!s.equipment)s.equipment={main:null,off:null,helmet:null,chest:null,pants:null,boots:null,acc1:null,acc2:null};
  if(!s.skills)s.skills={};
  if(!s.skillProf)s.skillProf={};
  if(!s.unlockedMoves)s.unlockedMoves={};
  // 精髓系統(Phase 1):20 格陣列,長度不對時重建(保留有效格資料)
  if(!Array.isArray(s.essences) || s.essences.length !== ESSENCE_MAX){
    const _oldEss = Array.isArray(s.essences) ? s.essences : [];
    s.essences = Array(ESSENCE_MAX).fill(null).map((_, i)=> _oldEss[i] || null);
  }
  const _nameToKey={'One-Hand Sword':'sword1','Parry':'parry','Sprint':'charge','Battle Heal':'heal','Searching':'poison'};
  Object.keys(s.skills).forEach(i=>{const v=s.skills[i];if(v&&!SKILL_DEFS[v]&&_nameToKey[v])s.skills[i]=_nameToKey[v];});
  if(!s.bag){
    // 預設 bag 由 items.js factory 產生(Phase B);所有 instance 走 registry,
    // schema 與市集 / shop 買進的物品一致。
    s.bag={
      materials:{iron_ore:5,copper_ore:3,moongrass:4,wolf_pelt:2,seed_weed:3,seed_mint:2},
      weapons:[makeWeaponInstance('iron_sword'), makeWeaponInstance('shadow_dagger')].filter(Boolean),
      armors:[makeArmorInstance('iron_helmet'), makeArmorInstance('steel_chest')].filter(Boolean),
      items:{hp_s:3,scroll:1},
      pendingWeapons:[], // Task A:製造完成的武器先進這,Task B 命名後才入 weapons
    };
  }
  // Task A:確保既有 bag 也有 pendingWeapons / crftQueue 欄位
  if(s.bag && !s.bag.pendingWeapons) s.bag.pendingWeapons=[];
  if(!s.crftQueue) s.crftQueue=[];
  // Task B:命名準則(每天會由 ensureNamingRule 重建,初始化時放 null 占位)
  if(!('craftNamingRule' in s)) s.craftNamingRule=null;
  // CRFT dropdown:記住三個 tab 上次選的種類(potion 暫無類型清單,占位用)
  if(!s.crftLastPick) s.crftLastPick={weapon:null, armor:null, potion:null};
  if(!s.cook) s.cook={phase:'capture', photoUrl:null, selected:[], log:[], itemName:null};
  if(!Array.isArray(s.huntHistory)) s.huntHistory=[];
  if(!s.mineStates) s.mineStates={};
  if(!s.mineDiscovered) s.mineDiscovered={};
  if(typeof s.mineCurrentFloor !== 'number') s.mineCurrentFloor=null;
  if(!s.completionLog)s.completionLog={};
  // today() 來自 utils 區(目前還在 inline JS 裡定義),這裡靠呼叫順序保證已存在
  if(!s.lastDailyDate||s.lastDailyDate!==today()){
    s.dailyTasks.forEach(t=>{t.submitted=false;t.todayValue=0;});
    s.personalTasks.forEach(t=>{t.todayDone=false;t.todayCount=0;t.todayValue=0;t.todaySubmitted=false;});
    // maxHp 已搬到 character.js;簽名改吃整個 character 物件
    const mhp=maxHp(s.character.level,s.character);
    s.character.hp=mhp;
    s.lastDailyDate=today();
  }
  s.timedTasks.forEach(t=>{if(t.status==='active'&&t.deadline<today()){t.status='failed';s.character[t.attr]=Math.max(0,(s.character[t.attr]||1)-1);}});
  save(s);return s;
}

/* ════════════════════════════════════════════════
 * 5. 一次性存檔遷移(原檔末段的 IIFE)
 *    把已棄用欄位刪掉、補上必要欄位、重置生活屬性槽。
 * ════════════════════════════════════════════════ */
function runStateMigrations(){
  const s=load();
  delete s.mineState;
  delete s.cultSlots;
  delete s.cultCrystals;
  // 採集系統重構(花牌 → 農田):清掉舊 gath / harv,改用 s.farm
  delete s.gath;
  delete s.harv;
  if(!s.lifeSkills)s.lifeSkills={};
  if(!s.lifeSkills.GATH)s.lifeSkills.GATH={lv:1,exp:0};
  LIFE_ATTRS.forEach(a=>s.character[a]=0);

  // ── E1:6 主屬性 → 12 主屬性 schema 遷移(attrSchemaV 旗標,不 bump DATA_VER)──
  // 舊存檔的 STR/VIT/DEX/AGI/INT/LUK 點數全部退回 pendingPoints,12 個新中文 key 補 0。
  // 玩家進入後可在屬性分配頁重配。
  const ATTR_SCHEMA_V = 1;
  if(s.character && (s.character.attrSchemaV||0) < ATTR_SCHEMA_V){
    const OLD_KEYS = ['STR','VIT','DEX','AGI','INT','LUK'];
    let refund = 0;
    OLD_KEYS.forEach(k=>{
      if(typeof s.character[k] === 'number'){
        refund += s.character[k];
        delete s.character[k];
      }
    });
    s.character.pendingPoints = (s.character.pendingPoints||0) + refund;
    ATTRS.forEach(a=>{
      if(typeof s.character[a] !== 'number') s.character[a]=0;
    });
    s.character.attrSchemaV = ATTR_SCHEMA_V;
    if(refund > 0) console.log('[E1 migration] 舊屬性退回 '+refund+' 點到 pendingPoints');
  }

  // ── E2-B:bag/equipment instance 的舊 stat 字串清空(attrStringSchemaV 旗標)──
  // E2-A 已清空 def 的 stat,但舊存檔的 instance 仍帶 'STR +N' 等字串。
  // 這裡一次性清空,跟 def 對齊。命名系統(applyNamingToWeapon)現階段不動,
  // 之後重做時會一起改 — 同步等戰鬥公式(E4)接通才有正確設計依據。
  const ATTR_STRING_SCHEMA_V = 1;
  if((s.attrStringSchemaV||0) < ATTR_STRING_SCHEMA_V){
    let cleared = 0;
    // 1. bag.weapons / bag.armors / bag.pendingWeapons
    if(s.bag){
      ['weapons','armors','pendingWeapons'].forEach(k=>{
        const arr = s.bag[k];
        if(Array.isArray(arr)){
          arr.forEach(item=>{
            if(item && typeof item.stat === 'string' && item.stat !== ''){
              item.stat = '';
              cleared++;
            }
          });
        }
      });
    }
    // 2. equipment 8 個槽位
    if(s.equipment){
      Object.keys(s.equipment).forEach(slot=>{
        const it = s.equipment[slot];
        if(it && typeof it.stat === 'string' && it.stat !== ''){
          it.stat = '';
          cleared++;
        }
      });
    }
    s.attrStringSchemaV = ATTR_STRING_SCHEMA_V;
    if(cleared > 0) console.log('[E2-B migration] 清空 '+cleared+' 條舊 stat 字串');
  }

  // 防呆:即使旗標已置位,12 個 key 仍補齊(避免半途中斷的存檔)
  ATTRS.forEach(a=>{
    if(typeof s.character[a] !== 'number') s.character[a]=0;
  });

  // 裝備格去重:同一個 uid 不該同時在多個槽(舊版多買 Date.now() 碰撞或舊 bug 殘留)
  if(s.equipment){
    const seenUids=new Set();
    const slotOrder=['main','off','helmet','chest','pants','boots','acc1','acc2'];
    for(const k of slotOrder){
      const v=s.equipment[k];
      if(v && typeof v==='object' && v.uid){
        if(seenUids.has(v.uid)) s.equipment[k]=null; // 後出現的清掉
        else seenUids.add(v.uid);
      }
    }
  }

  // ── Phase D 一次性遷移:items.js registry 統一(itemSchemaV 旗標) ──
  // 順序很重要:先做 key 重映射,再做 stat 補齊,否則 stat 會用錯誤的 def 取。
  // DATA_VER 不 bump(避免清空玩家進度),靠 itemSchemaV 旗標跳過已遷移的存檔。
  if(!(s.itemSchemaV>=1)){
    // 1. material key rename: dark_crystal2 → shadow_crystal
    if(s.bag?.materials?.dark_crystal2 != null){
      const qty=s.bag.materials.dark_crystal2;
      s.bag.materials.shadow_crystal=(s.bag.materials.shadow_crystal||0)+qty;
      delete s.bag.materials.dark_crystal2;
      console.warn('[migrate] material key rename: dark_crystal2 → shadow_crystal, qty:', qty);
    }
    // 2. orphan material key 警告(不刪,留著等 user 回報)
    if(typeof getMaterialDef==='function'){
      Object.keys(s.bag?.materials||{}).forEach(k=>{
        if(!getMaterialDef(k)) console.warn('[migrate] orphan material key:', k, 'qty:', s.bag.materials[k]);
      });
    }
    // 3. weapon / armor instance.key 重映射 + stat 補齊
    // 涵蓋兩個歷史寫入路徑的 instance.key:
    //   (a) state.js 預設 bag(sword1/dagger1/helmet1/chest1)
    //   (b) shop 用 item.id 直接當 instance.key 寫進 bag(Phase B 之前)
    //       —— 含 shop 的 8 個 weapon/armor ids
    const LEGACY_KEY_MAP={
      // state.js 預設
      sword1:'iron_sword', dagger1:'shadow_dagger',
      helmet1:'iron_helmet', chest1:'steel_chest',
      // shop 武器(sword1/dagger1 與 state 共用上面的 mapping)
      sword2:'steel_sword', tachi1:'dark_blade',
      // shop 防具
      armor1:'leather_armor', armor2:'steel_chest',
      ring1:'dragon_ring',   boots1:'light_boots',
    };
    if(typeof getWeaponDef==='function'){
      (s.bag?.weapons||[]).forEach(w=>{
        if(LEGACY_KEY_MAP[w.key]){
          const oldKey=w.key;
          w.key=LEGACY_KEY_MAP[oldKey];
          console.warn('[migrate] weapon key map:', {old:oldKey, new:w.key, uid:w.uid, name:w.name, sellPrice:w.sellPrice});
        }
        if(!w.stat){
          const d=getWeaponDef(w.key);
          if(d) w.stat=d.stat||'';
          else console.warn('[migrate] orphan weapon instance.key:', w.key, w.uid, w.name);
        }
      });
    }
    if(typeof getArmorDef==='function'){
      (s.bag?.armors||[]).forEach(a=>{
        if(LEGACY_KEY_MAP[a.key]){
          const oldKey=a.key;
          a.key=LEGACY_KEY_MAP[oldKey];
          console.warn('[migrate] armor key map:', {old:oldKey, new:a.key, uid:a.uid, name:a.name});
        }
        if(!a.stat){
          const d=getArmorDef(a.key);
          if(d) a.stat=d.stat||'';
          else console.warn('[migrate] orphan armor instance.key:', a.key, a.uid, a.name);
        }
      });
    }
    // 4. equipment slot 同步補 stat(src:'bag' 的;對應 instance 已在步驟 3 補好)
    if(typeof EQUIP_SLOT_TYPE==='object' && s.equipment){
      Object.keys(EQUIP_SLOT_TYPE).forEach(slotKey=>{
        const eq=s.equipment[slotKey];
        if(eq && typeof eq==='object' && eq.src==='bag' && !eq.stat){
          const bagItem=(s.bag?.weapons||[]).find(w=>w.uid===eq.uid)
                     ||(s.bag?.armors||[]).find(a=>a.uid===eq.uid);
          if(bagItem) eq.stat=bagItem.stat||'';
        }
      });
    }
    // 5. 旗標標記
    s.itemSchemaV=1;
  }

  // ── 精髓系統(Phase 1):確保 20 格陣列存在,長度不對時重建(保留有效格資料)──
  if(!Array.isArray(s.essences) || s.essences.length !== ESSENCE_MAX){
    const old = Array.isArray(s.essences) ? s.essences : [];
    s.essences = Array(ESSENCE_MAX).fill(null).map((_, i)=> old[i] || null);
  }

  // ── MP 欄位 migration:舊存檔補上,以當前精神系屬性算 maxMp(E1)──
  // 公式 §7.2:基礎 MP × (1 + 靈力×0.011 + 理智×0.004 + 專注×0.004 + 親和×0.002)
  // 公式內聯避免依賴 character.js(載入順序 state.js 先);改公式記得兩處同步
  if(s.character && (typeof s.character.mp !== 'number' || s.character.mp < 0)){
    const c=s.character;
    const mul = 1 + (c['靈力']||0)*0.011 + (c['理智']||0)*0.004 + (c['專注']||0)*0.004 + (c['親和']||0)*0.002;
    s.character.mp = Math.round(100 * mul);
  }

  // ── Task A:確保製造佇列 / 待命名區欄位存在(不 bump DATA_VER)──
  if(!s.crftQueue) s.crftQueue=[];
  if(s.bag && !s.bag.pendingWeapons) s.bag.pendingWeapons=[];
  // ── Task B:命名準則欄位(進製造頁時才會 ensure)──
  if(!('craftNamingRule' in s)) s.craftNamingRule=null;
  // ── CRFT dropdown:記住三個 tab 上次選的種類 ──
  if(!s.crftLastPick) s.crftLastPick={weapon:null, armor:null, potion:null};
  // ── 烹飪狀態搬進存檔(Set → Array;舊存檔沒這欄位就建立預設)──
  if(!s.cook) s.cook={phase:'capture', photoUrl:null, selected:[], log:[], itemName:null};
  // ── HUNT 歷史紀錄(階段二)──
  if(!Array.isArray(s.huntHistory)) s.huntHistory=[];
  // ── MINE 階段二:per-floor 狀態 / 礦物圖鑑 / 目前樓層 ──
  if('mineState' in s) delete s.mineState;  // 舊單一 mineState 棄用
  if(!s.mineStates) s.mineStates={};
  if(!s.mineDiscovered) s.mineDiscovered={};
  if(typeof s.mineCurrentFloor !== 'number') s.mineCurrentFloor=null;

  save(s);
}
