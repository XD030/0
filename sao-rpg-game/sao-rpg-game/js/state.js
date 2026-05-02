/* ========================================================================
 * state.js — 全域遊戲狀態
 *
 * 內容:
 *   1. 不可變常數(SK / DATA_VER / ATTRS / EQUIP_OPTIONS / SKILL_DEFS …)
 *   2. 全域執行狀態(currentPage / currentAdvPage / inAdvMode)
 *   3. localStorage 包裝:load() / save()
 *      ── 之後會搬到 storage.js,目前先放這以保持單檔可運作 ──
 *   4. initState():從 localStorage 讀取存檔並補齊預設值,版本不符時重建
 *   5. runStateMigrations():一次性的存檔遷移 / 清理(原本是檔案末段的 IIFE)
 *
 * 注意:
 *   - 本檔案載入後**不會自動執行任何邏輯**,只負責定義。
 *   - 啟動流程由 main.js 負責呼叫 initState() 與 runStateMigrations()。
 *   - 函式都掛在 window(全域),沿用原始檔的全域命名,避免大改。
 * ======================================================================== */

/* ════════════════════════════════════════════════
 * 1. 常數
 * ════════════════════════════════════════════════ */
const SK='wxrpg6';
const DATA_VER=4;

const ATTRS=['STR','VIT','DEX','AGI','INT','LUK'];
const ATTR_COLOR={STR:'#ff7040',VIT:'#00c8ff',DEX:'#ffcc44',AGI:'#00ffcc',INT:'#cc88ff',LUK:'#ff88cc'};
const LIFE_ATTRS=['HUNT','GATH','MINE','CRFT','COOK'];
const LIFE_COLOR={HUNT:'#ff6644',GATH:'#88dd44',MINE:'#aaaaaa',CRFT:'#ffaa33',COOK:'#ff88aa'};
const LIFE_SKILL_NAME={HUNT:'狩獵',GATH:'採集',MINE:'挖礦',CRFT:'製造',COOK:'烹飪'};
const SLOT_UNLOCKS=[1,1,5,10,20,30,50,70];

const HUNT_MAX_MS=24*60*60*1000;
const HUNT_MIN_MS=30*60*1000;

const EQUIP_OPTIONS={
  main:[
    {name:'Iron Sword',rarity:'common',stat:'STR +3',durability:5,maxDurability:10},
    {name:'Anneal Blade',rarity:'rare',stat:'STR +8',durability:6,maxDurability:8},
    {name:'Elucidator',rarity:'epic',stat:'STR +15',durability:4,maxDurability:6}
  ],
  off:[
    {name:'Small Shield',rarity:'common',stat:'VIT +2',durability:6,maxDurability:8},
    {name:'Kite Shield',rarity:'rare',stat:'VIT +6',durability:5,maxDurability:8}
  ],
  helmet:[
    {name:'Iron Helm',rarity:'common',stat:'VIT +2',durability:4,maxDurability:6},
    {name:'Steel Helm',rarity:'rare',stat:'VIT +5',durability:6,maxDurability:10}
  ],
  chest:[
    {name:'Leather Coat',rarity:'common',stat:'VIT +3',durability:3,maxDurability:8},
    {name:'Scale Armor',rarity:'rare',stat:'VIT +7',durability:5,maxDurability:8}
  ],
  pants:[
    {name:'Leather Pants',rarity:'common',stat:'AGI +2',durability:5,maxDurability:8},
    {name:'Iron Greaves',rarity:'rare',stat:'AGI +5',durability:2,maxDurability:8}
  ],
  boots:[
    {name:'Leather Boots',rarity:'common',stat:'AGI +2',durability:6,maxDurability:8},
    {name:'Wind Boots',rarity:'rare',stat:'AGI +6',durability:4,maxDurability:8}
  ],
  acc1:[
    {name:'Ring of AGI',rarity:'rare',stat:'AGI +4',durability:6,maxDurability:6},
    {name:'Amulet of STR',rarity:'epic',stat:'STR +8',durability:3,maxDurability:6}
  ],
  acc2:[
    {name:'Ring of AGI',rarity:'rare',stat:'AGI +4',durability:6,maxDurability:6},
    {name:'Amulet of STR',rarity:'epic',stat:'STR +8',durability:5,maxDurability:6}
  ]
};

/* ── 技能定義 ──
 * move: { id, name, type:'atk'|'def'|'spc', hits, mul, desc, profReq }
 * mul: STR 倍率(atk)或 回復倍率(def)
 * profBonus: 熟練度 1000 時的額外加成倍率
 */
const SKILL_DEFS={
  unarmed:{
    name:'體術', desc:'徒手戰鬥',
    moves:[
      {id:'unarmed_strike', name:'普通攻擊', type:'atk', hits:1, mul:0.8,  profBonus:0.4, profReq:0,   desc:'基礎攻擊,STR×0.8'},
      {id:'unarmed_combo',  name:'連擊',     type:'atk', hits:2, mul:0.5,  profBonus:0.3, profReq:400, desc:'2連擊,各STR×0.5'},
      {id:'unarmed_burst',  name:'爆發拳',   type:'atk', hits:1, mul:2.0,  profBonus:0.5, profReq:800, desc:'STR×2.0,自身-10HP', selfDmg:10},
    ],
  },
  sword1:{
    name:'單手劍', desc:'單手劍技',
    moves:[
      {id:'sword1_slash',   name:'基礎斬擊',   type:'atk', hits:1, mul:1.0,  profBonus:0.5, profReq:0,   desc:'基礎劍技,STR×1.0'},
      {id:'sword1_spiral',  name:'螺旋斬',     type:'atk', hits:1, mul:1.5,  profBonus:0.5, profReq:300, desc:'STR×1.5,破防效果', debuff:'PRT_break'},
      {id:'sword1_horizon', name:'水平方陣斬', type:'atk', hits:4, mul:0.6,  profBonus:0.4, profReq:700, desc:'4連擊,各STR×0.6'},
      {id:'sword1_aura',    name:'劍氣',       type:'atk', hits:1, mul:2.5,  profBonus:0.5, profReq:900, desc:'劍氣衝擊,STR×2.5'},
    ],
  },
  parry:{
    name:'格擋', desc:'防禦反擊',
    moves:[
      {id:'parry_basic',   name:'格擋',       type:'def', mul:0.4,  profBonus:0.2, profReq:0,   desc:'減傷40%,持續1回合'},
      {id:'parry_counter', name:'反擊格擋',   type:'def', mul:0.4,  profBonus:0.2, profReq:400, desc:'減傷+反擊STR×0.8', counterMul:0.8},
      {id:'parry_perfect', name:'完美格擋',   type:'def', mul:1.0,  profBonus:0,   profReq:800, desc:'完全無傷+敵方眩暈1回合', stun:true},
    ],
  },
  heal:{
    name:'治癒術', desc:'戰鬥中回復',
    moves:[
      {id:'heal_basic',  name:'治癒',   type:'def', healMul:0.25, profBonus:0.15, profReq:0,   desc:'回復最大HP的25%'},
      {id:'heal_regen',  name:'再生',   type:'def', regenTurns:3, profBonus:0,    profReq:400, desc:'持續3回合緩慢回血'},
      {id:'heal_burst',  name:'爆發治癒',type:'def', healMul:0.5,  profBonus:0.2, profReq:800, desc:'回復最大HP的50%'},
    ],
  },
  poison:{
    name:'毒術', desc:'毒素攻擊',
    moves:[
      {id:'poison_mist',  name:'毒霧',   type:'spc', poisonTurns:4, profBonus:0, profReq:0,   desc:'敵人中毒4回合'},
      {id:'poison_burst', name:'毒爆',   type:'atk', hits:1, mul:0.8, poisonTurns:3, profBonus:0.4, profReq:500, desc:'攻擊+中毒3回合'},
      {id:'poison_cloud', name:'劇毒雲', type:'spc', poisonTurns:6, profBonus:0, profReq:900, desc:'敵人劇毒6回合'},
    ],
  },
  charge:{
    name:'蓄力', desc:'強化下次攻擊',
    moves:[
      {id:'charge_basic', name:'蓄力',   type:'spc', chargeMul:2.5, profBonus:0.5, profReq:0,   desc:'下回合傷害×2.5'},
      {id:'charge_full',  name:'全力蓄力',type:'spc', chargeMul:4.0, profBonus:0,   profReq:600, desc:'下回合傷害×4.0,需跳過此回合'},
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
  if(!s.character)s.character={name:'無名俠客',level:1,exp:0,hp:200,STR:1,VIT:1,DEX:1,AGI:1,INT:1,LUK:1,pendingPoints:0,skillSlots:2};
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
  const _nameToKey={'One-Hand Sword':'sword1','Parry':'parry','Sprint':'charge','Battle Heal':'heal','Searching':'poison'};
  Object.keys(s.skills).forEach(i=>{const v=s.skills[i];if(v&&!SKILL_DEFS[v]&&_nameToKey[v])s.skills[i]=_nameToKey[v];});
  if(!s.bag)s.bag={
    materials:{iron_ore:5,copper_ore:3,moongrass:4,wolf_pelt:2},
    weapons:[
      {uid:'w1',key:'sword1', name:'鐵劍',      rarity:'common',weaponType:'sword1',dur:8, maxDur:10,enhance:0,sellPrice:150},
      {uid:'w2',key:'dagger1',name:'暗影匕首',  rarity:'rare',  weaponType:'dagger', dur:5, maxDur:8, enhance:1,sellPrice:600},
    ],
    armors:[
      {uid:'a1',key:'helmet1',name:'鐵頭盔',    rarity:'common',armorType:'helmet',  dur:7, maxDur:10,enhance:0,sellPrice:100},
      {uid:'a2',key:'chest1', name:'精鋼胸甲',  rarity:'rare',  armorType:'chest',   dur:5, maxDur:8, enhance:2,sellPrice:400},
    ],
    items:{hp_s:3,scroll:1},
  };
  if(!s.completionLog)s.completionLog={};
  // today() 來自 utils 區(目前還在 inline JS 裡定義),這裡靠呼叫順序保證已存在
  if(!s.lastDailyDate||s.lastDailyDate!==today()){
    s.dailyTasks.forEach(t=>{t.submitted=false;t.todayValue=0;});
    s.personalTasks.forEach(t=>{t.todayDone=false;t.todayCount=0;t.todayValue=0;t.todaySubmitted=false;});
    // maxHp 同樣來自 inline JS(將在 Phase 4 移到 character.js)
    const mhp=maxHp(s.character.level,s.character.VIT);
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
  // 首次初始化採集系統(不重置已有資料)
  if(!s.gath)delete s.harv; // 只在 gath 不存在時清 harv
  if(!s.lifeSkills)s.lifeSkills={};
  if(!s.lifeSkills.GATH)s.lifeSkills.GATH={lv:1,exp:0};
  LIFE_ATTRS.forEach(a=>s.character[a]=0);
  save(s);
}
