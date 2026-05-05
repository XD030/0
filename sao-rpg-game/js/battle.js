/* ========================================================================
 * battle.js — 戰鬥系統(Phase 5d 第三階段第一波)
 *
 * 內容:
 *   1. 工具:isInBattle()
 *   2. 卡牌定義 CARDS / SKILL_TO_CARD
 *   3. 狀態效果 STATUS_DEF / STATUS_ICON
 *   4. 樓層系統 TOTAL_FLOORS / getFloorData / getMaxUnlockedFloor /
 *               renderFloorSelect / enterFloor / exitFloorMap / onBossCleared
 *   5. 圖示字典 IMG
 *   6. 戰鬥狀態 mockChar / BATTLE_DEFAULT_ENEMY / ENEMY_ATTACKS_CARD /
 *               CARD_DECK / STATUS_DESC / battle / autoMode / selectedCard / tooltipTimer
 *   7. 狀態系統函式 hasStatus / addStatus / removeStatus / tickStatuses
 *   8. 戰鬥計算 calcIncomingDmg / tryAct / onHit / calcMaxStagger / addStagger
 *   9. 渲染 renderAll / renderStatusSlot / showStatusTooltip / fleeBattle
 *  10. 卡片系統 renderCards / makeCardHTML / selectCard / showConfirm / hideConfirm
 *  11. 戰鬥執行 executePlayerCard / executeEnemyTurn / endBattle / exitBattle
 *  12. 戰鬥日誌 / 浮字 battleLog / spawnDmg
 *
 * 不在這裡(待 stage 2 抽出):
 *   - 地圖系統 NODE_TYPES / MAP_FLOORS / mapState / showMap / renderMap /
 *               renderNextChoices / markNodeDone / startBattleWith
 *   - 戰鬥中狀態面板 renderBattlePanel(屬於 map-panel,Phase 6 處理)
 *
 * 依賴:
 *   - state.js: SK / SKILL_DEFS / SLOT_UNLOCKS 等
 *   - storage.js: load / save
 *   - utils.js: showToast / fmtTime / today / gConfirm
 *   - character.js: maxHp / addExp / applyHpPenalty / renderStatus(可選)
 *   - equipment.js: getEquipItem / buildBattleDeck / profMul / gainSkillProf /
 *                   hexEquip / durBar
 *   - 仍在 inline JS:renderMap / updateMapHp / renderNextChoices /
 *                    startBattleWith / openShop / openChestGame / showMap
 *                    這些將於 stage 2 抽出。
 * ======================================================================== */


/* ════════════════ 1. 戰鬥狀態檢查 ════════════════ */
function isInBattle(){
  // 注意:讀 #adv-battle-map(戰鬥畫面本身,z-index:101,由 showMap/hideMap 控制 display)
  // 不是 #page-map-battle(冒險模式外層,地圖+戰鬥共用,地圖頁也是 flex 會誤判)
  const b=document.getElementById('adv-battle-map');
  return !!(b && b.style.display==='flex');
}



/* ════════════════ 2. 戰鬥核心(L1800-2598 連續區塊)════════════════ */
// ============ 冒險系統 ============
// 卡牌定義
// E4-4 後續:CARDS 補完 type / damageType / aoe / element 欄位
// type:'atk'/'def'/'spc' — executePlayerCard 分支判斷
// damageType:'blunt'/'slash'/'pierce' — 對應擊打/切割/貫穿熟練
// aoe:true — 點任一敵人打全場
// element:'fire'/'water'/... — 觸發元素感應加成、敵人元素相性(沒寫 = 物理)
const CARDS = {
  slash:  {id:'slash',  name:'SLASH',   type:'atk', cat:'atk', dmgMul:1.1, damageType:'slash',  poise:12, agiCost:0,  desc:'基本斬擊，造成傷害並積累Poise', uses:null},
  heavy:  {id:'heavy',  name:'HEAVY',   type:'atk', cat:'atk', dmgMul:2.6, damageType:'blunt',  poise:40, agiCost:3,  desc:'強力重擊，施展後AGI -3回合', uses:2},
  flurry: {id:'flurry', name:'FLURRY',  type:'atk', cat:'atk', dmgMul:0.55,damageType:'slash',  poise:14, agiCost:1,  desc:'三連擊，各段造成傷害', hits:3, uses:null, maxCd:2, cd:0},
  rend:   {id:'rend',   name:'REND',    type:'atk', cat:'atk', dmgMul:0.8, damageType:'slash',  poise:20, agiCost:0,  desc:'流血攻擊，後續每回合流血傷害', dot:true, uses:null, maxCd:3, cd:0},
  focus:  {id:'focus',  name:'FOCUS',   type:'spc', cat:'spc', dmgMul:0,   poise:0,  agiCost:0,  desc:'集中，下回合攻擊暴擊率+50%', buff:'focus', uses:null, maxCd:2, cd:0},
  pierce: {id:'pierce', name:'PIERCE',  type:'atk', cat:'atk', dmgMul:1.4, damageType:'pierce', poise:18, agiCost:0,  desc:'穿刺攻擊，無視部分防禦', uses:null, maxCd:2, cd:0},
  whirl:  {id:'whirl',  name:'WHIRL',   type:'atk', cat:'atk', dmgMul:0.7, damageType:'slash',  aoe:true, poise:10, agiCost:0,  desc:'旋風斬，對所有敵人造成傷害', hits:2, uses:null, maxCd:3, cd:0},
  charge: {id:'charge', name:'CHARGE',  type:'spc', cat:'spc', dmgMul:0,   poise:0,  agiCost:0,  desc:'蓄力，下次攻擊傷害×2', buff:'CHG', uses:null, maxCd:3, cd:0},
  defend: {id:'defend', name:'DEFEND',  type:'def', cat:'def', dmgMul:0,   poise:-20,agiCost:0,  desc:'防禦姿態，減傷並恢復Poise', uses:null},
  dodge:  {id:'dodge',  name:'DODGE',   type:'def', cat:'def', dmgMul:0,   poise:0,  agiCost:0,  desc:'閃避，AGI決定成功率，成功完全免傷', uses:null, maxCd:2, cd:0},
};
// 技能名對應卡牌
const SKILL_TO_CARD = {
  'ONE-HAND SWORD':'slash','PARRY':'defend','SPRINT':'dodge',
  'BATTLE HEAL':'focus','SEARCHING':'rend',
};
// 敵人攻擊模式

// ── 狀態效果系統 ──
const STATUS_DEF = {
  // Debuffs
  BLD: {name:'Bleed 出血',  abbr:'BLD', type:'debuff', color:'#ff2244', bg:'rgba(255,34,68,.12)',  desc:'每回合扣除最大HP 3%'},
  PSN: {name:'Poison 毒',   abbr:'PSN', type:'debuff', color:'#44dd44', bg:'rgba(68,221,68,.1)',   desc:'每回合扣除固定值，可疊層'},
  BRN: {name:'Burn 燃燒',   abbr:'BRN', type:'debuff', color:'#ff7722', bg:'rgba(255,119,34,.1)',  desc:'每回合扣HP，防禦 -20%'},
  FRZ: {name:'Frostbite 凍傷',abbr:'FRZ',type:'debuff',color:'#88ddff', bg:'rgba(136,221,255,.1)',desc:'AGI -3，受擊額外 +25% 傷害'},
  PAR: {name:'Paralysis 麻痺',abbr:'PAR',type:'debuff',color:'#ffee22', bg:'rgba(255,238,34,.1)', desc:'行動有 60% 機率無效'},
  STN: {name:'Stun 暈眩',   abbr:'STN', type:'debuff', color:'#ffcc00', bg:'rgba(255,204,0,.1)',   desc:'完全跳過一回合'},
  SLP: {name:'Sleep 睡眠',  abbr:'SLP', type:'debuff', color:'#aabbff', bg:'rgba(170,187,255,.1)', desc:'跳過行動，受擊解除但+50%傷害'},
  CRS: {name:'Curse 詛咒',  abbr:'CRS', type:'debuff', color:'#cc44ff', bg:'rgba(204,68,255,.1)',  desc:'所有回復效果歸零'},
  // Buffs
  RGN: {name:'Regen 再生',  abbr:'RGN', type:'buff',   color:'#00ffcc', bg:'rgba(0,255,204,.1)',   desc:'每回合回復最大HP 4%'},
  FCS: {name:'Focus 集中',  abbr:'FCS', type:'buff',   color:'#ffcc44', bg:'rgba(255,204,68,.1)',  desc:'下次攻擊暴擊率 +50%'},
  CHG: {name:'Charge 蓄力', abbr:'CHG', type:'buff',   color:'#ffffff', bg:'rgba(255,255,255,.08)',desc:'下次攻擊傷害 ×2'},
  PRT: {name:'Protect 守護',abbr:'PRT', type:'buff',   color:'#4499ff', bg:'rgba(68,153,255,.1)',  desc:'受傷害減少 35%'},
  HST: {name:'Haste 加速',  abbr:'HST', type:'buff',   color:'#00ffaa', bg:'rgba(0,255,170,.1)',   desc:'AGI +4，影響時間軸順序'},
};

// 加狀態：{id, dur, stacks?}

// 移除狀態

// 有無狀態

// 回合結束狀態tick（扣血/回血/遞減）

// 渲染狀態列

// SVG 圖示定義（幾何形狀，之後可換成 <img>）
const STATUS_ICON = {
  BLD: `<svg viewBox="0 0 18 18" fill="none"><path d="M9 2 L13 9 L9 16 L5 9 Z" fill="rgba(255,34,68,.8)" stroke="#ff2244" stroke-width="1"/><line x1="9" y1="5" x2="9" y2="12" stroke="rgba(255,150,150,.6)" stroke-width="1" stroke-linecap="round"/></svg>`,
  PSN: `<svg viewBox="0 0 18 18" fill="none"><polygon points="9,2 15.2,5.5 15.2,12.5 9,16 2.8,12.5 2.8,5.5" fill="rgba(68,221,68,.15)" stroke="#44dd44" stroke-width="1.2"/><circle cx="9" cy="9" r="2.5" fill="#44dd44" opacity=".7"/></svg>`,
  BRN: `<svg viewBox="0 0 18 18" fill="none"><path d="M9 16 C5 16 3 13 4 10 C5 8 7 8 7 6 C7 4 8 2 9 2 C9 5 11 5 12 7 C13 9 13 11 11 13 C10 14 10 15 9 16Z" fill="rgba(255,119,34,.7)" stroke="#ff7722" stroke-width=".8"/></svg>`,
  FRZ: `<svg viewBox="0 0 18 18" fill="none"><line x1="9" y1="2" x2="9" y2="16" stroke="#88ddff" stroke-width="1.5"/><line x1="2" y1="9" x2="16" y2="9" stroke="#88ddff" stroke-width="1.5"/><line x1="4" y1="4" x2="14" y2="14" stroke="#88ddff" stroke-width="1.2"/><line x1="14" y1="4" x2="4" y2="14" stroke="#88ddff" stroke-width="1.2"/><circle cx="9" cy="9" r="2" fill="rgba(136,221,255,.4)" stroke="#88ddff" stroke-width="1"/></svg>`,
  PAR: `<svg viewBox="0 0 18 18" fill="none"><path d="M9 2 L16 9 L9 16 L2 9 Z" fill="rgba(255,238,34,.1)" stroke="#ffee22" stroke-width="1.2"/><path d="M9 5 L12 9 L9 13 L6 9 Z" fill="rgba(255,238,34,.5)"/></svg>`,
  STN: `<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" fill="rgba(255,204,0,.12)" stroke="#ffcc00" stroke-width="1.2"/><text x="9" y="13" text-anchor="middle" font-size="9" fill="#ffcc00" font-family="monospace">★</text></svg>`,
  SLP: `<svg viewBox="0 0 18 18" fill="none"><path d="M4 12 C4 7 7 4 12 5 C8 5 6 8 7 12 C8 15 11 16 14 15 C12 17 7 17 4 12Z" fill="rgba(170,187,255,.6)" stroke="#aabbff" stroke-width=".8"/><text x="13" y="7" text-anchor="middle" font-size="6" fill="#aabbff" font-family="monospace">z</text></svg>`,
  CRS: `<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" fill="rgba(204,68,255,.1)" stroke="#cc44ff" stroke-width="1.2" stroke-dasharray="3 2"/><line x1="6" y1="6" x2="12" y2="12" stroke="#cc44ff" stroke-width="1.5"/><line x1="12" y1="6" x2="6" y2="12" stroke="#cc44ff" stroke-width="1.5"/></svg>`,
  RGN: `<svg viewBox="0 0 18 18" fill="none"><path d="M9 3 C9 3 5 6 5 10 C5 13.3 6.8 15 9 15 C11.2 15 13 13.3 13 10 C13 6 9 3 9 3Z" fill="rgba(0,255,204,.15)" stroke="#00ffcc" stroke-width="1"/><line x1="9" y1="7" x2="9" y2="13" stroke="#00ffcc" stroke-width="1.2" stroke-linecap="round"/><line x1="6.5" y1="10" x2="11.5" y2="10" stroke="#00ffcc" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  FCS: `<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" fill="none" stroke="#ffcc44" stroke-width="1.2"/><circle cx="9" cy="9" r="2.5" fill="rgba(255,204,68,.6)" stroke="#ffcc44" stroke-width="1"/><line x1="9" y1="2" x2="9" y2="4" stroke="#ffcc44" stroke-width="1.2"/><line x1="9" y1="14" x2="9" y2="16" stroke="#ffcc44" stroke-width="1.2"/><line x1="2" y1="9" x2="4" y2="9" stroke="#ffcc44" stroke-width="1.2"/><line x1="14" y1="9" x2="16" y2="9" stroke="#ffcc44" stroke-width="1.2"/></svg>`,
  CHG: `<svg viewBox="0 0 18 18" fill="none"><polygon points="10,2 5,10 9,10 8,16 13,8 9,8" fill="rgba(255,255,255,.7)" stroke="rgba(255,255,255,.9)" stroke-width=".8"/></svg>`,
  PRT: `<svg viewBox="0 0 18 18" fill="none"><path d="M9 2 L15 4.5 L15 10 C15 13.5 12 16 9 17 C6 16 3 13.5 3 10 L3 4.5 Z" fill="rgba(68,153,255,.15)" stroke="#4499ff" stroke-width="1.2"/></svg>`,
  HST: `<svg viewBox="0 0 18 18" fill="none"><line x1="3" y1="9" x2="15" y2="9" stroke="#00ffaa" stroke-width="1.5"/><polyline points="10,5 15,9 10,13" fill="none" stroke="#00ffaa" stroke-width="1.5" stroke-linejoin="round"/><line x1="3" y1="6" x2="8" y2="6" stroke="rgba(0,255,170,.4)" stroke-width="1"/><line x1="3" y1="12" x2="8" y2="12" stroke="rgba(0,255,170,.4)" stroke-width="1"/></svg>`,
};








// 固定4格：玩家2格＋敵人2格
// 順序由AGI差值決定：
//   差值 > eAgi → 玩家連行兩次再敵人 PPEE
//   差值 > 0    → 玩家先交錯 PEPE
//   差值 = 0    → 交錯 PEPE
//   差值 < 0    → 敵人先交錯 EPEP
//   差值 < -pAgi → 敵人連行兩次 EEPP
// ══════════════════════════════════════════════
// ══════════════════════════════════════════
// 樓層系統
// ══════════════════════════════════════════

const TOTAL_FLOORS = 100;

function getFloorData(s){
  if(!s.clearedFloors) s.clearedFloors = [];
  return s.clearedFloors;
}

function getMaxUnlockedFloor(s){
  const cleared = getFloorData(s);
  // 第1層永遠可進，cleared包含已過關的樓層
  let max = 1;
  for(let f = 1; f <= TOTAL_FLOORS; f++){
    if(cleared.includes(f)) max = f + 1;
    else break;
  }
  return Math.min(max, TOTAL_FLOORS);
}

function renderFloorSelect(){
  const s = initState();
  const maxUnlocked = getMaxUnlockedFloor(s);
  const cleared = getFloorData(s);
  const list = document.getElementById('floor-list');
  const sub = document.getElementById('floor-select-sub');
  if(!list) return;
  if(sub) sub.textContent = `已抵達第 ${maxUnlocked} 層`;

  // 解鎖層：從高到低
  const unlockedItems = [];
  for(let f = maxUnlocked; f >= 1; f--){
    const isCurrent = f === maxUnlocked;
    const isCleared = cleared.includes(f);
    unlockedItems.push({f, unlocked:true, isCurrent, isCleared});
  }
  // 鎖定層：只顯示接下來 3 層
  const lockedItems = [];
  for(let f = maxUnlocked+1; f <= Math.min(maxUnlocked+3, TOTAL_FLOORS); f++){
    lockedItems.push({f, unlocked:false, isCurrent:false, isCleared:false});
  }

  const renderItem = ({f, unlocked, isCurrent, isCleared}) => {
    const cls = ['floor-item', unlocked?'unlocked':'locked', isCurrent?'current-max':''].filter(Boolean).join(' ');
    const status = isCleared ? 'CLEARED' : unlocked ? (isCurrent ? 'AVAILABLE' : 'UNLOCKED') : 'LOCKED';
    const onclick = unlocked ? `enterFloor(${f})` : '';
    return `<div class="${cls}" ${onclick?`onclick="${onclick}"`:''}>
      <div class="floor-num-badge">${f}</div>
      <div class="floor-info">
        <div class="floor-name">第 ${f} 層${f===1?' — FLOOR 1 (開放中)':f===TOTAL_FLOORS?' — 最終層':''}</div>
        <div class="floor-status-tag">${status}</div>
      </div>
      ${unlocked?'<div class="floor-chevron">›</div>':''}
    </div>`;
  };

  list.innerHTML = [...unlockedItems, ...lockedItems].map(renderItem).join('');
}

function enterFloor(floorNum){
  const s = initState();
  // 記錄當前樓層
  if(!s.currentFloor) s.currentFloor = 1;
  s.currentFloor = floorNum;
  save(s);
  // 初始化地圖狀態
  mapState = { floor: 0, currentCol: -1, chosenPath: {} };
  currentNodeId = null;
  // E4-4:同步玩家 HP(12 中文 schema)
  mockChar = _buildBattleChar(s);
  mockChar.hp = s.character.hp || mockChar.maxHp;
  // 顯示地圖
  document.getElementById('page-map-battle').style.display = 'flex';
  setBottomBarVisible(false);
  document.getElementById('map-floor-label').textContent = `FLOOR ${floorNum}`;
  showMap();
  updateMapHp();
  renderNextChoices();
}

function exitFloorMap(){
  document.getElementById('page-map-battle').style.display = 'none';
  setBottomBarVisible(true);
  // 把HP寫回主檔state
  const s = initState();
  s.character.hp = Math.max(0, mockChar.hp);
  save(s);
  goAdvPage('map');
}

function onBossCleared(floorNum){
  const s = initState();
  if(!s.clearedFloors) s.clearedFloors = [];
  if(!s.clearedFloors.includes(floorNum)){
    s.clearedFloors.push(floorNum);
    save(s);
    showToast(`// FLOOR ${floorNum} CLEARED！解鎖第 ${floorNum+1} 層`);
  }
}


// ══════════════════════════════════════════
// 圖片路徑設定 — 之後換圖只改這裡
// ══════════════════════════════════════════
const IMG = {
  player:       'img/player.png',
  enemy_knight: 'img/enemy_knight.png',
  // 卡牌圖示
  card_atk:     'img/card/atk_normal.png',
  card_heavy:   'img/card/atk_heavy.png',
  card_swift:   'img/card/atk_swift.png',
  card_charge:  'img/card/spc_charge.png',
  card_poison:  'img/card/spc_poison.png',
  card_guard:   'img/card/def_guard.png',
  card_heal:    'img/card/def_heal.png',
  card_regen:   'img/card/def_regen.png',
  card_flee:    'img/card/spc_flee.png',
  // Row icon
  row_atk:      'img/icon_atk.png',
  row_def:      'img/icon_def.png',
  // 地圖節點 icon
  node_battle:  'img/map/node_battle.png',
  node_elite:   'img/map/node_elite.png',
  node_boss:    'img/map/node_boss.png',
  node_chest:   'img/map/node_chest.png',
  node_trap:    'img/map/node_trap.png',
  node_rest:    'img/map/node_rest.png',
  node_shop:    'img/map/node_shop.png',
  node_hidden:  'img/map/node_hidden.png',
};

// ── 模擬玩家 ──
// mockChar 從主檔資料初始化，enterFloor時會更新
// E4-4:mockChar 12 中文 schema 初始化(從 localStorage 讀目前角色)
let mockChar = (()=>{
  try{
    const s = JSON.parse(localStorage.getItem('wxrpg6') || '{}');
    const c = s.character || {};
    const battleC = { level: c.level || 1, hp: 0 };
    ATTRS.forEach(a=> battleC[a] = c[a] || 0);
    battleC.maxHp = Math.round(1000 * hpMul(battleC));
    battleC.maxMp = Math.round(100 * mpMul(battleC));
    battleC.hp = c.hp || battleC.maxHp;
    battleC.mp = c.mp || 0;
    return battleC;
  }catch{
    const fb = { level:1, hp:1000, maxHp:1000, mp:100, maxMp:100 };
    ATTRS.forEach(a=> fb[a] = 0);
    return fb;
  }
})();

// ── 敵人 ──
// E4-2:多敵人模板(name 由 ENEMY_NAME_POOL 隨機選)
// E4-4:加 lv / physDef / magicDef / 攻擊元素 / 型態相性 / 9 元素相性
const BATTLE_DEFAULT_ENEMY={
  name:'巡邏士兵', maxHp:180, atk:18, imgKey:'enemy_knight',
  pattern:['slash','heavy','guard','slash','slash'], patternIdx:0,
  _maxStagger:90,
  // E4-4 新欄位
  lv: 1,
  physDef: 20,
  magicDef: 15,
  // 攻擊元素(承受時玩家用對應元素抵抗減傷)
  attackElement: null,  // null = 物理無屬性
  // 對玩家 3 種型態的相性(>1 易傷,<1 抗性)
  bluntAffinity: 1.0,
  slashAffinity: 1.0,
  pierceAffinity: 1.0,
  // 對 9 元素的相性
  elementAffinity: {
    fire:1.0, water:1.0, ice:1.0, thunder:1.0, wind:1.0,
    rock:1.0, holy:1.0, chaos:1.0, dark:1.0,
  },
};

// E4-2:名字池(隨機抽,可重複)
const ENEMY_NAME_POOL = ['巡邏士兵', '魔狼', '崩坍者', '獨眼巨', '守衛裝置', '崩口虫'];

// E4-2:樓層難度 → 敵人數
function _enemyCountForFloor(floor, isBoss){
  if(isBoss) return 1;
  if(floor <= 3) return 1 + Math.floor(Math.random() * 2);     // 1-2
  if(floor <= 7) return 2 + Math.floor(Math.random() * 2);     // 2-3
  if(floor <= 9) return 3 + Math.floor(Math.random() * 2);     // 3-4
  return 1 + Math.floor(Math.random() * 4);                    // 1-4 fallback
}

// E4-2:給定數量,決定每隻佔哪個 slot
// slot 0,1 = 後排 / slot 2,3 = 前排
// 1 隻 → [2](前排左,單獨)
// 2 隻 → [2,3](前排兩格)
// 3 隻 → [2,3,0](前 2 後 1)
// 4 隻 → [2,3,0,1](前 2 後 2)
function _slotsForCount(n){
  if(n === 1) return [2];
  if(n === 2) return [2, 3];
  if(n === 3) return [2, 3, 0];
  return [2, 3, 0, 1];
}
const ENEMY_ATTACKS_CARD={
  slash:    {name:'劍擊',   dmgMul:1.0},
  heavy:    {name:'重擊',   dmgMul:1.8, isHeavy:true},
  guard:    {name:'防禦',   dmgMul:0,   isGuard:true},
  curse_all:{name:'萬禍降臨', dmgMul:0, isCurseAll:true},
};

// ════════════════════════════════════════════════════════════════════════
// E4-4 — 戰鬥公式 helpers(接通 derived.js)
// ════════════════════════════════════════════════════════════════════════

// 讀 character 物件的 12 中文屬性 + 裝備 bonus
// (裝備 stat 字串 E2 之後是中文 key,例:「力量 +3」)
function _calcEquipBonus(s){
  const bonus = {};
  ATTRS.forEach(a=> bonus[a] = 0);
  Object.keys(s.equipment || {}).forEach(key=>{
    const item = getEquipItem(s, key);
    if(item && item.stat){
      const m = item.stat.match(/(\S+?)\s*\+(\d+)/);
      if(m && bonus[m[1]] !== undefined) bonus[m[1]] += parseInt(m[2]);
    }
  });
  return bonus;
}

// 構建戰鬥用 character 物件(c + 裝備 bonus,12 中文屬性)
function _buildBattleChar(s){
  const c = s.character;
  const bonus = _calcEquipBonus(s);
  const battleC = { level: c.level, hp: c.hp, mp: c.mp || 0 };
  ATTRS.forEach(a=> battleC[a] = (c[a] || 0) + (bonus[a] || 0));
  // 計算 maxHp / maxMp(用 derived 套有效值)
  battleC.maxHp = Math.round(1000 * hpMul(battleC));
  battleC.maxMp = Math.round(100 * mpMul(battleC));
  return battleC;
}

// 物防修正(§16.1):敵人物防 - 玩家穿透,曲線
function _physDefMod(enemy, player){
  const def = Math.max(0, (enemy.physDef || 0) - penetration(player));
  return 100 / (100 + def);
}
// 魔抗修正(§16.2)
function _magicDefMod(enemy, player){
  const def = Math.max(0, (enemy.magicDef || 0) - penetration(player));
  return 100 / (100 + def);
}

// 等級差傷害修正(§17.1) [0.7, 1.25]
function _lvDmgMod(player, enemy){
  const diff = (player.level || 1) - (enemy.lv || 1);
  return Math.max(0.7, Math.min(1.25, 1 + diff * 0.015));
}
// 等級差承傷修正(§17.2) [0.75, 1.35]
function _lvIncomingMod(player, enemy){
  const diff = (player.level || 1) - (enemy.lv || 1);
  return Math.max(0.75, Math.min(1.35, 1 - diff * 0.012));
}

// 取卡牌的傷害型態(blunt/slash/pierce);沒指定預設 slash
function _cardDamageType(card){
  if(card.damageType) return card.damageType;
  // 暫定:預設 slash;未來在 CARDS 加 damageType 欄
  return 'slash';
}
// 取對應型態的熟練度倍率
function _typeMastery(player, type){
  if(type === 'blunt') return bluntMastery(player);
  if(type === 'pierce') return pierceMastery(player);
  return slashMastery(player);
}
// 取敵人對該型態的相性
function _typeAffinity(enemy, type){
  if(type === 'blunt') return enemy.bluntAffinity || 1;
  if(type === 'pierce') return enemy.pierceAffinity || 1;
  return enemy.slashAffinity || 1;
}
// 取敵人對指定元素的相性
function _elemAffinity(enemy, element){
  if(!element) return 1;
  return (enemy.elementAffinity && enemy.elementAffinity[element]) || 1;
}
// 玩家對指定元素的抵抗(承受時減傷,§22 倒數用)
function _elemResist(player, element){
  if(!element) return 0;
  switch(element){
    case 'fire': return fireResist(player);
    case 'water': return waterResist(player);
    case 'ice': return iceResist(player);
    case 'thunder': return thunderResist(player);
    case 'wind': return windResist(player);
    case 'rock': return rockResist(player);
    case 'holy': return holyResist(player);
    case 'chaos': return chaosResist(player);
    case 'dark': return darkResist(player);
    default: return 0;
  }
}

// 物理技能傷害(§21):
//   damageType基礎值 × physPower × typeMastery × cardMul × critExpected
//   × physDefMod × typeAffinity × levelDmgMod × hitRate
// hitRate 在外面用作命中判定;這裡只算傷害數值
function _calcPhysDmg(card, player, enemy){
  const type = _cardDamageType(card);
  const baseByType = type === 'blunt' ? 105 : type === 'pierce' ? 98 : 100;
  const cardMul = (card.dmgMul || card.mul || 1);
  const dmg = baseByType
    * physPower(player)
    * _typeMastery(player, type)
    * cardMul
    * critExpected(player)
    * _physDefMod(enemy, player)
    * _typeAffinity(enemy, type)
    * _lvDmgMod(player, enemy);
  return Math.max(1, Math.round(dmg));
}

// 法術技能傷害(§22)
function _calcMagicDmg(card, player, enemy){
  const type = _cardDamageType(card);
  const baseByType = type === 'blunt' ? 105 : type === 'pierce' ? 98 : 100;
  const cardMul = (card.dmgMul || card.mul || 1);
  const elem = card.element || null;
  // 元素感應加成
  let elemSenseBonus = 0;
  if(elem){
    switch(elem){
      case 'fire': elemSenseBonus = fireSense(player); break;
      case 'water': elemSenseBonus = waterSense(player); break;
      case 'ice': elemSenseBonus = iceSense(player); break;
      case 'thunder': elemSenseBonus = thunderSense(player); break;
      case 'wind': elemSenseBonus = windSense(player); break;
      case 'rock': elemSenseBonus = rockSense(player); break;
      case 'holy': elemSenseBonus = holySense(player); break;
      case 'chaos': elemSenseBonus = chaosSense(player); break;
      case 'dark': elemSenseBonus = darkSense(player); break;
    }
  }
  const dmg = baseByType
    * magicPower(player)
    * _typeMastery(player, type)
    * cardMul
    * _magicDefMod(enemy, player)
    * _typeAffinity(enemy, type)
    * _elemAffinity(enemy, elem)
    * (1 + elemSenseBonus / 100)
    * _lvDmgMod(player, enemy);
  return Math.max(1, Math.round(dmg));
}

// 敵人對玩家的傷害(§27)
function _calcEnemyDmg(rawDmg, enemy, player){
  const elem = enemy.attackElement || null;
  const dmg = rawDmg
    * (1 - physDef(player) / 100)
    * (1 - _elemResist(player, elem) / 100)
    * _lvIncomingMod(player, enemy);
  return Math.max(1, Math.round(dmg));
}

// 治療量(§23)
function _calcHeal(card, player){
  const cardMul = (card.healMul || card.mul || 1);
  return Math.round(
    240 * magicPower(player) * cardMul
    * (1 + regenMul(player) * 0.08)
    * (1 + (player['親和']||0) * 0.002)
  );
}

// 護盾量(§24)
function _calcShield(card, player){
  const cardMul = (card.shieldMul || card.mul || 1);
  return Math.round(
    220 * magicPower(player) * cardMul
    * (1 + magicDef(player) / 100)
    * (1 + (player['意志']||0) * 0.002)
  );
}

// 暴擊判定(用衍生值)
function _rollCrit(player){
  return Math.random() * 100 < critRate(player);
}

// 命中判定(物理 §18.1)
function _rollPhysHit(card, player, enemy){
  const lvHit = (player.level || 1) - (enemy.lv || 1);
  const finalHit = Math.max(40, Math.min(98,
    hitRate(player) + (card.hitBonus || 0) - (enemy.evasion || 0) + lvHit
  ));
  return Math.random() * 100 < finalHit;
}

// ── 卡牌定義 ──
let CARD_DECK=[];

// ── 狀態 ──
const STATUS_DESC={
  BLD:'每回合損失最大HP的5%',
  PSN:'每回合損失最大HP的4%',
  CHG:'下回合攻擊傷害×2.5',
  PRT:'受到的傷害減少40%',
  RGN:'每回合回復最大HP的4%',
};

let battle=null, autoMode=false, selectedCard=null, tooltipTimer=null;

// ── 圖片 helper（有圖用img，沒圖用placeholder）──

// ── 狀態 ──
function hasStatus(t,id){return(t.statuses||[]).some(s=>s.id===id&&s.dur>0);}
function addStatus(t,id,dur){
  if(!t.statuses)t.statuses=[];
  const ex=t.statuses.find(s=>s.id===id);
  if(ex){ex.dur=Math.max(ex.dur,dur);}else{t.statuses.push({id,dur});}
}
function removeStatus(t,id){if(t.statuses)t.statuses=t.statuses.filter(s=>s.id!==id);}
function tickStatuses(t){
  if(!t.statuses)return;
  // 每回合持續傷害
  ['BLD','PSN','BRN'].forEach(id=>{
    const s=t.statuses.find(x=>x.id===id&&x.dur>0);
    if(s){
      const dmg=id==='BLD'?Math.round(t.maxHp*0.05):id==='PSN'?Math.round(t.maxHp*0.04):Math.round(t.maxHp*0.06);
      t.hp=Math.max(0,t.hp-dmg);
      battleLog(`${id==='BLD'?'🩸出血':id==='PSN'?'☠️中毒':'🔥燃燒'} → -${dmg} HP`,'warn');
    }
  });
  // 再生回血
  const rgn=t.statuses.find(x=>x.id==='RGN'&&x.dur>0);
  if(rgn&&!hasStatus(t,'CRS')){
    const h=Math.round(t.maxHp*0.04);
    t.hp=Math.min(t.maxHp,t.hp+h);
    battleLog(`💚再生 → +${h} HP`,'heal');
  }
  t.statuses=t.statuses.map(s=>({...s,dur:s.dur-1})).filter(s=>s.dur>0);
}

// 計算實際傷害（含FRZ、BRN防禦減益）
function calcIncomingDmg(target, rawDmg){
  let dmg=rawDmg;
  if(hasStatus(target,'FRZ'))dmg=Math.round(dmg*1.25);
  if(hasStatus(target,'BRN'))dmg=Math.round(dmg*1.20);
  return dmg;
}

// 嘗試行動（PAR/STN/SLP判定），回傳是否可行動
function tryAct(target, name){
  if(hasStatus(target,'STN')){
    removeStatus(target,'STN');
    battleLog(`${name} 暈眩！跳過行動`,'system');
    return false;
  }
  if(hasStatus(target,'SLP')){
    removeStatus(target,'SLP');
    battleLog(`${name} 睡眠！跳過行動`,'system');
    return false;
  }
  if(hasStatus(target,'PAR')){
    if(Math.random()<0.6){
      battleLog(`${name} 麻痺！行動失敗`,'system');
      return false;
    }
  }
  return true;
}

// 受擊時解除睡眠
function onHit(target){
  if(hasStatus(target,'SLP')){removeStatus(target,'SLP');}
}

// ── 舊版enterBattle（已不使用，由enterFloor取代）──


// ── 渲染 ──
function renderAll(){
  if(!battle)return;
  const {player,enemy}=battle;
  const el=id=>document.getElementById(id);
  // 玩家 HP / MP
  if(el('bp-p-cur'))el('bp-p-cur').textContent=player.hp;
  if(el('bp-p-max'))el('bp-p-max').textContent='/'+player.maxHp;
  if(el('bp-p-bar'))el('bp-p-bar').style.width=Math.max(0,player.hp/player.maxHp*100)+'%';
  const pmp=player.mp||0, pmaxMp=player.maxMp||1;
  if(el('bp-p-mp-cur'))el('bp-p-mp-cur').textContent=pmp;
  if(el('bp-p-mp-max'))el('bp-p-mp-max').textContent=pmaxMp;
  if(el('bp-p-mp-bar'))el('bp-p-mp-bar').style.width=Math.min(100,(pmp/pmaxMp)*100)+'%';
  // 玩家僵直條
  const ps=el('bp-p-stagger');
  if(ps){const ms=calcMaxStagger(player);ps.style.width=Math.min(100,(player.stagger||0)/ms*100)+'%';ps.className='bp-stagger-bar'+(player.stunned?' full':'');}
  // 玩家 status slots
  // E4-1b:玩家 buff/debuff icon(Minecraft 風格)
  renderStatusIcons('p-status-icons', player);
  // 敵人渲染改由 renderEnemySlots 處理
  renderEnemySlots();
}

// E4-2:敵人 slots 渲染(loop battle.enemies array,每隻渲染到自己的 slotIdx)
function renderEnemySlots(){
  if(!battle) return;
  const enemies = battle.enemies || [];
  // 清空所有 4 格
  for(let i=0; i<4; i++){
    const slot = document.getElementById('enemy-slot-'+i);
    if(slot){
      slot.innerHTML = '';
      slot.onclick = null;
      slot.style.cursor = '';
    }
  }
  // 各活敵人渲染到自己 slotIdx
  enemies.forEach(en=>{
    if(!en || en.dead) return;
    const slot = document.getElementById('enemy-slot-' + en.slotIdx);
    if(!slot) return;
    // 點敵人觸發攻擊
    slot.onclick = (e)=>{ e.stopPropagation(); attackEnemy(en.slotIdx); };
    slot.style.cursor = 'pointer';

    const hpPct = Math.max(0, en.hp / en.maxHp * 100);
    const ms = calcMaxStagger(en);
    const stPct = Math.min(100, (en.stagger || 0) / ms * 100);
    const lv = en.lv || '-';
    const imgKey = en.imgKey || 'enemy_default';
    slot.innerHTML =
      '<div class="enemy-card" data-enemy-id="'+en._enemyId+'">'+
        '<div class="enemy-name">'+en.name+' <span style="opacity:.6;">Lv.'+lv+'</span></div>'+
        '<div class="enemy-frame">'+
          '<img class="enemy-sprite" src="img/'+imgKey+'.png" onerror="this.outerHTML=\'<div class=&quot;enemy-sprite-placeholder&quot;>ENEMY</div>\'">'+
        '</div>'+
        '<div class="enemy-hp-wrap">'+
          '<div class="enemy-hp-text">'+en.hp+' / '+en.maxHp+'</div>'+
          '<div class="enemy-bar-track"><div class="enemy-hp-fill" style="width:'+hpPct+'%;"></div></div>'+
          '<div class="enemy-bar-track" style="margin-top:1px;background:rgba(255,200,0,.08);"><div class="bp-stagger-bar'+(en.stunned?' full':'')+'" style="width:'+stPct+'%;height:100%;"></div></div>'+
        '</div>'+
        // E4-2:每隻敵人各自的 status icons,id 用 e-status-icons-{slotIdx}
        '<div class="bp-status-icons enemy-status-icons" id="e-status-icons-'+en.slotIdx+'"></div>'+
      '</div>';
    // 渲染該敵人的 buff/debuff icon
    renderStatusIcons('e-status-icons-'+en.slotIdx, en);
  });
}

// E4-1b:Minecraft 風格 buff/debuff icon 渲染
// 讀 target.statuses (array),依 STATUS_DEF + STATUS_ICON 渲染
// 空 array 時 div 內容為空 → :empty selector 隱藏
function renderStatusIcons(elId, target){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = '';
  const arr = target && target.statuses;
  if(!arr || !arr.length) return;
  arr.forEach(st=>{
    const def = STATUS_DEF[st.id];
    if(!def) return;
    const icon = STATUS_ICON[st.id] || '';
    const num = st.dur || st.stacks || '';
    const slot = document.createElement('div');
    slot.className = 'bp-status-icon ' + (def.type === 'buff' ? 'buff' : 'debuff');
    slot.title = def.name + (def.desc ? ' - ' + def.desc : '');
    slot.innerHTML = icon + (num ? '<div class="si-num">'+num+'</div>' : '');
    el.appendChild(slot);
  });
}

// 計算僵直上限
function calcMaxStagger(target){
  // E4-4:用新表體魄/力量/敏捷;敵人沒這些 key 時用 _maxStagger 預設
  const vit = target['體魄'] || 0;
  const str = target['力量'] || 0;
  const agi = target['敏捷'] || 0;
  return target._maxStagger || (50 + vit*10 + str*3 + agi*2);
}
// 累積僵直值
function addStagger(target, dmg){
  if(target.stunned)return;
  const ms=calcMaxStagger(target);
  target.stagger=(target.stagger||0)+dmg/target.maxHp*60;
  if(target.stagger>=ms){target.stagger=ms;target.stunned=true;}
}

function renderStatusSlot(elId, target, type){
  const wrap=document.getElementById(elId)?.parentElement; // status-slot-wrap
  const el=document.getElementById(elId); if(!el)return;
  const list=(target.statuses||[]).filter(s=>STATUS_DEF[s.id]?.type===type);

  // 移除舊下拉
  wrap?.querySelector('.status-dropdown')?.remove();

  if(!list.length){
    el.className='status-slot empty';
    el.style.cssText='';
    el.textContent=type==='buff'?'▲':'▼';
    el.onclick=null; el.oncontextmenu=null;
    return;
  }

  // 優先顯示：回合數最多的
  const sorted=[...list].sort((a,b)=>b.dur-a.dur);
  const s0=sorted[0]; const def=STATUS_DEF[s0.id];
  el.className='status-slot has-status';
  el.style.cssText=`background:${def.bg};border-color:${def.color}66;box-shadow:0 0 6px ${def.color}44;position:relative;`;
  const iconInner=STATUS_ICON[s0.id]?.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]||s0.id[0];
  const badge=list.length>1?`<span style="position:absolute;top:-5px;right:-5px;background:#111;border:1px solid ${def.color}88;border-radius:8px;font-size:9px;font-family:var(--font-mono);color:${def.color};padding:0 3px;line-height:14px;z-index:2;">${list.length}</span>`:'';
  el.innerHTML=`<svg class="status-slot-icon" viewBox="0 0 18 18" fill="none">${iconInner}</svg><span class="status-slot-dur" style="color:${def.color}">${s0.dur}</span>${badge}`;

  // 建立下拉，跳過第一個（已在格子顯示）
  if(wrap&&sorted.length>1){
    const dd=document.createElement('div');
    dd.className='status-dropdown';
    sorted.slice(1).forEach(s=>{
      const d=STATUS_DEF[s.id]; if(!d)return;
      const item=document.createElement('div');
      item.className='status-dropdown-item';
      item.style.cssText=`background:${d.bg};border-color:${d.color}66;box-shadow:0 0 4px ${d.color}33;`;
      const inn=STATUS_ICON[s.id]?.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]||'';
      item.innerHTML=`<svg class="status-slot-icon" viewBox="0 0 18 18" fill="none">${inn}</svg><span class="status-slot-dur" style="color:${d.color}">${s.dur}</span>`;
      item.onclick=(e)=>{e.stopPropagation();showStatusTooltip(s.id);};
      dd.appendChild(item);
    });
    wrap.style.position='relative';
    wrap.appendChild(dd);
  }

  // 點擊展開下拉，長按顯示tooltip
  let holdTimer=null;
  el.oncontextmenu=(e)=>{e.preventDefault();showStatusTooltip(s0.id);};
  el.ontouchstart=(e)=>{holdTimer=setTimeout(()=>{showStatusTooltip(s0.id);holdTimer=null;},500);};
  el.ontouchend=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}};
  el.onclick=(e)=>{
    e.stopPropagation();
    showStatusTooltip(s0.id);
    const dd=wrap?.querySelector('.status-dropdown');
    if(!dd||sorted.length<=1)return;
    const isOpen=dd.classList.contains('open');
    document.querySelectorAll('.status-dropdown.open').forEach(x=>x.classList.remove('open'));
    if(!isOpen){
      dd.classList.add('open');
      setTimeout(()=>{
        const closeDD=(ev)=>{
          if(!dd.contains(ev.target)&&ev.target!==el){
            dd.classList.remove('open');
            document.removeEventListener('touchstart',closeDD);
            document.removeEventListener('click',closeDD);
          }
        };
        document.addEventListener('touchstart',closeDD);
        document.addEventListener('click',closeDD);
      },50);
    }
  };
}


function showStatusTooltip(id){
  const def=STATUS_DEF[id]; if(!def)return;
  const tt=document.getElementById('card-tooltip'); if(!tt)return;
  // 用 STATUS_ICON 的 SVG
  const iconInner=STATUS_ICON[id]?.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]||'';
  const ph=document.getElementById('ct-icon-placeholder');
  if(iconInner){
    ph.innerHTML='';
    ph.style.cssText=`width:36px;height:36px;display:flex;align-items:center;justify-content:center;`;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 18 18');svg.setAttribute('fill','none');
    svg.setAttribute('width','36');svg.setAttribute('height','36');
    svg.innerHTML=iconInner;ph.appendChild(svg);
  } else {
    ph.textContent=def.name[0];ph.style.color=def.color;
  }
  // tag 顏色跟 STATUS_DEF 一致
  const tag=document.getElementById('ct-tag');
  tag.textContent=def.type==='buff'?'BUFF':'DEBUFF';
  tag.style.cssText=`font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:${def.color};border:1px solid ${def.color}66;padding:2px 5px;`;
  document.getElementById('ct-title').textContent=def.name;
  document.getElementById('ct-cd').textContent='';
  document.getElementById('ct-desc').textContent=STATUS_DESC[id]||'';
  tt.classList.add('show');
  // 點其他地方消失
  setTimeout(()=>{
    const hide=(e)=>{if(!tt.contains(e.target)){tt.classList.remove('show');document.removeEventListener('touchstart',hide);document.removeEventListener('click',hide);}};
    document.addEventListener('touchstart',hide,{once:false});
    document.addEventListener('click',hide,{once:false});
  },100);
}

// ── 卡牌渲染 ──
function fleeBattle(){
  if(!battle||battle.phase==='end')return;
  battleLog('// 成功逃跑！','system');
  endBattle('flee');
}

// E4-1a:卡牌翻頁狀態(單排 4 卡;有 5+ 張時翻頁)
let cardPage = 0;
const CARDS_PER_PAGE = 4;

function cardPagePrev(){
  if(cardPage > 0){
    cardPage--;
    selectedCard = null;
    hideConfirm();
    renderCards();
  }
}
function cardPageNext(){
  const totalPages = Math.ceil((CARD_DECK.length || 0) / CARDS_PER_PAGE);
  if(cardPage < totalPages - 1){
    cardPage++;
    selectedCard = null;
    hideConfirm();
    renderCards();
  }
}
function cardPageReset(){
  cardPage = 0;
}

// E4-1a:左右滑手勢處理(touch + mouse drag)
let _cardSwipeStart = null;
function _bindCardSwipe(){
  const wrap = document.querySelector('.card-page-wrap');
  if(!wrap || wrap._swipeBound) return;
  wrap._swipeBound = true;
  wrap.addEventListener('touchstart', e=>{
    if(e.touches.length !== 1) return;
    _cardSwipeStart = {x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now()};
  }, {passive:true});
  wrap.addEventListener('touchend', e=>{
    if(!_cardSwipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _cardSwipeStart.x;
    const dy = t.clientY - _cardSwipeStart.y;
    const dt = Date.now() - _cardSwipeStart.t;
    _cardSwipeStart = null;
    if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)*1.5 && dt < 600){
      if(dx < 0) cardPageNext();
      else cardPagePrev();
    }
  }, {passive:true});
  let mDown = null;
  wrap.addEventListener('mousedown', e=>{
    mDown = {x:e.clientX, y:e.clientY, t:Date.now()};
  });
  wrap.addEventListener('mouseup', e=>{
    if(!mDown) return;
    const dx = e.clientX - mDown.x;
    const dy = e.clientY - mDown.y;
    const dt = Date.now() - mDown.t;
    mDown = null;
    if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)*1.5 && dt < 600){
      if(dx < 0) cardPageNext();
      else cardPagePrev();
    }
  });
  wrap.addEventListener('mouseleave', ()=>{mDown=null;});
}

function renderCards(){
  const row1=document.getElementById('cards-row-1');
  if(!row1) return;
  row1.innerHTML='';

  const locked = battle && battle.phase !== 'player';
  const total = CARD_DECK.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / CARDS_PER_PAGE));
  if(cardPage >= totalPages) cardPage = totalPages - 1;
  if(cardPage < 0) cardPage = 0;

  const startIdx = cardPage * CARDS_PER_PAGE;
  const endIdx = Math.min(startIdx + CARDS_PER_PAGE, total);

  for(let i=startIdx; i<endIdx; i++){
    const card = CARD_DECK[i];
    if(!card) continue;
    row1.insertAdjacentHTML('beforeend', makeCardHTML(card, locked));
  }

  // 翻頁箭頭
  const arrowPrev = document.getElementById('card-arrow-prev');
  const arrowNext = document.getElementById('card-arrow-next');
  if(arrowPrev) arrowPrev.classList.toggle('disabled', cardPage <= 0);
  if(arrowNext) arrowNext.classList.toggle('disabled', cardPage >= totalPages - 1);

  // dots indicator
  const indicator = document.getElementById('card-page-indicator');
  if(indicator){
    if(totalPages > 1){
      indicator.style.display = 'flex';
      indicator.innerHTML = '';
      for(let p=0; p<totalPages; p++){
        const dot = document.createElement('span');
        dot.className = 'page-dot' + (p===cardPage ? ' active' : '');
        dot.dataset.page = p;
        dot.style.cursor = 'pointer';
        dot.onclick = (e)=>{
          e.stopPropagation();
          cardPage = p;
          selectedCard = null;
          hideConfirm();
          renderCards();
        };
        indicator.appendChild(dot);
      }
    } else {
      indicator.style.display = 'none';
    }
  }

  _bindCardSwipe();
}

function makeCardHTML(c, locked=false){
  const typeCls=c.type==='atk'?'atk-card':c.type==='def'?'def-card':'spc-card';
  const isSel=selectedCard?.id===c.id;
  const cost=c.cost||0;
  const recover=c.recover||0;
  const noMp = battle && cost>0 && battle.player.mp < cost;
  const lockStyle=(locked||noMp)?'opacity:0.4;pointer-events:none;':'';
  const iconHTML=`<div class="card-icon-wrap">
    <img class="card-icon-img" src="${IMG[c.imgKey]||''}" alt="${c.name}"
      onerror="this.outerHTML='<div class=\\'card-icon-placeholder\\'>${c.name[0]}</div>'">
  </div>`;
  // cost 標籤(右上),recover 標籤(右下)
  const costBadge = cost>0 ? `<div class="card-cost-badge">${cost}</div>` : '';
  const recBadge  = recover>0 ? `<div class="card-rec-badge">+${recover}</div>` : '';
  return`<div class="battle-card ${typeCls}${isSel?' selected':''}${noMp?' no-mp':''}" style="${lockStyle}"
    onclick="event.stopPropagation();${(locked||noMp)?'':` selectCard('${c.id}')`}"
    ontouchstart="startCardHold('${c.id}')" ontouchend="endCardHold()" oncontextmenu="showTooltip('${c.id}');return false;">
    ${costBadge}${recBadge}${iconHTML}
  </div>`;
}

// E4-1b:普攻虛擬卡(沒選卡時點敵人會釋出這張)
// 注意:CARDS dict 用 cat,SKILL_DEFS.moves 用 type,executePlayerCard 認 type
//       所以兩個欄位都要設(BASIC_ATTACK 沒在 CARDS 裡,純虛擬卡)
const BASIC_ATTACK = {
  id:'_basic', name:'BASIC', type:'atk', cat:'atk', dmgMul:1.0, damageType:'slash', poise:6,
  agiCost:0, cost:0, recover:0, hits:1,
  desc:'基本攻擊', uses:null
};

function selectCard(id){
  hideTooltip();
  if(selectedCard?.id===id){
    // 再點同一張 → 取消
    selectedCard=null;
  } else {
    // 切到別張(或從無選變有選)
    selectedCard=CARD_DECK.find(x=>x.id===id) || null;
  }
  renderCards();
}

// E4-2:點敵人觸發攻擊(支援多敵人 + AOE)
function attackEnemy(slotIdx){
  if(!battle) return;
  if(battle.phase !== 'player') return;
  if(battle.phase === 'end') return;

  // 找該 slot 的活敵人
  const target = (battle.enemies || []).find(e=> e && !e.dead && e.slotIdx === slotIdx);
  if(!target) return;  // 點到空格或死敵 → 沒反應

  const card = selectedCard || BASIC_ATTACK;
  selectedCard = null;
  renderCards();

  // 設定當前目標 shim
  battle.enemy = target;
  // executePlayerCard 內若是 AOE(card.aoe 或 card.id==='whirl' 等),會 loop 全 enemies
  executePlayerCard(card);
}

// E4-2:回傳所有活敵人(給 AOE / executeEnemyTurn 用)
function _aliveEnemies(){
  return (battle && battle.enemies || []).filter(e=> e && !e.dead && e.hp > 0);
}

// E4-2:依當前 target,如果死了改取最近一隻活的(玩家選了某敵但出招前已死)
function _resolveActualTarget(){
  if(!battle) return null;
  if(battle.enemy && !battle.enemy.dead && battle.enemy.hp > 0) return battle.enemy;
  // fallback:取第一隻活的
  const alive = _aliveEnemies();
  if(alive.length === 0) return null;
  battle.enemy = alive[0];
  return alive[0];
}

// E4-2:標記某敵人為 dead 並從戰場移除(視覺 + 邏輯)
function _markEnemyDead(en){
  if(!en) return;
  en.dead = true;
  en.hp = 0;
  battleLog(`☠ ${en.name} 倒下`, 'system');
}

// E4-2:檢查全敵人死光 → 戰勝
function _checkAllEnemiesDead(){
  return _aliveEnemies().length === 0;
}

// E4-1b:showConfirm/hideConfirm 留空殼,因為已經沒有按鈕了
// 留著是因為其他地方仍呼叫(避免 ReferenceError)
function showConfirm(){}
function hideConfirm(){}

// E4-1b:confirmCard 已不被任何 onclick 呼叫,但保留以防舊碼漏改
function confirmCard(){
  if(!selectedCard||!battle)return;
  const card=selectedCard; selectedCard=null; renderCards();
  executePlayerCard(card);
}

// ── 戰鬥邏輯 ──
function executePlayerCard(card){
  if(!battle)return;
  const {player} = battle;

  // E4-2:出招前處理 — 若當前目標已死(被毒/etc),改取活敵人
  // tickStatuses 此時還沒跑(那是回合末),這裡只是確保 enemy 有效
  let enemy = _resolveActualTarget();
  if(!enemy){
    // 全死了,直接戰勝(理論上不該走到這,因為 endBattle 應該已觸發)
    endBattle(true);
    return;
  }
  battle.enemy = enemy;

  // 玩家僵直：跳過本回合
  if(player.stunned){
    player.stunned=false;player.stagger=0;
    battleLog('// 玩家僵直！跳過行動','system');
    renderAll();
    battle.phase='enemy';renderCards();
    setTimeout(()=>{
      if(!battle)return;
      executeEnemyTurn();
      if(!battle||battle.phase==='end')return;
      battle.phase='player';battle.turn++;
      renderAll();renderCards();
      battleLog(`── 第 ${battle.turn} 回合 ──`,'system');
    },700);
    return;
  }
  // PAR/STN/SLP 行動判定
  if(!tryAct(player,'玩家')){
    renderAll();
    battle.phase='enemy';renderCards();    setTimeout(()=>{
      if(!battle)return;
      executeEnemyTurn();
      if(!battle||battle.phase==='end')return;
      battle.phase='player';battle.turn++;
      renderAll();renderCards();
      battleLog(`── 第 ${battle.turn} 回合 ──`,'system');
      if(autoMode)setTimeout(()=>autoAct(),800);
    },700);
    return;
  }

  // ── MP 檢查與扣除(Phase α 能量制)──
  const cardCost = card.cost || 0;
  if(player.mp < cardCost){
    showToast(`// MP 不足 (需 ${cardCost})`);
    selectedCard = null;
    hideConfirm();
    renderCards();
    return;
  }
  player.mp = Math.max(0, player.mp - cardCost);
  const cardRecover = card.recover || 0;
  if(cardRecover > 0){
    player.mp = Math.min(player.maxMp, player.mp + cardRecover);
  }

  const s=initState();
  const prof=s.skillProf||{};
  const p=prof[card.skillKey]||0;
  const pm=profMul(p);

  gainSkillProf(s,card.skillKey,1);
  save(s);

  if(card.type==='atk'){
    const chg = hasStatus(player,'CHG') ? 2.5 : 1;
    if(hasStatus(player,'CHG')) removeStatus(player,'CHG');
    // E4-4:FCS 集中 → 暴擊率 +50pt
    const fcsBonus = hasStatus(player,'FCS') ? 50 : 0;
    if(fcsBonus) removeStatus(player,'FCS');

    // E4-2:AOE 判斷(card.aoe 或 id==='whirl')
    const isAOE = card.aoe || card.id === 'whirl';
    const targets = isAOE ? _aliveEnemies() : [enemy];

    targets.forEach(tgt=>{
      // E4-4:命中判定
      if(!_rollPhysHit(card, player, tgt)){
        spawnDmg('enemy', 0, false);
        battleLog(`${card.name} → ${tgt.name} MISS`,'system');
        return;
      }
      let total = 0;
      const hits = card.hits || 1;
      for(let i=0; i<hits; i++){
        // E4-4:暴擊(基礎 + FCS 加成,軟硬上限 70)
        const baseCrit = critRate(player);
        const totalCrit = Math.min(70, baseCrit + fcsBonus);
        const crit = Math.random() * 100 < totalCrit;
        // E4-4:物理公式 §21
        let dmg = _calcPhysDmg(card, player, tgt);
        // 多 hit 卡:傷害除以 hit 數(避免每 hit 都打全傷)
        dmg = Math.round(dmg / hits);
        // 蓄力倍率
        if(chg > 1) dmg = Math.round(dmg * chg);
        // 暴擊額外 50%(critExpected 已含暴擊期望;這裡是觸發特效視覺)
        if(crit) dmg = Math.round(dmg * 1.5);
        // PRT 守護減傷
        if(hasStatus(tgt,'PRT')) dmg = Math.round(dmg * 0.6);
        // FRZ 凍傷加傷 / SLP 受擊加傷
        dmg = calcIncomingDmg(tgt, dmg);
        dmg = Math.max(1, dmg);
        onHit(tgt);
        tgt.hp = Math.max(0, tgt.hp - dmg);
        total += dmg;
        if(crit) spawnDmg('enemy', dmg, true);
      }
      if(card.hits <= 1) spawnDmg('enemy', total, false);
      addStagger(tgt, total);
      if(card.poisonTurns) addStatus(tgt, 'PSN', card.poisonTurns);
      if(tgt.hp <= 0) _markEnemyDead(tgt);
      battleLog(`${card.name} → ${tgt.name} -${total} HP${hits>1?` (${hits}連擊)`:''}${chg>1?' [蓄力]':''}${fcsBonus?' [集中]':''}${isAOE?' [群攻]':''}`,'hit');
    });

    // selfDmg 只扣一次(不論幾隻敵人)
    if(card.selfDmg){player.hp=Math.max(1,player.hp-card.selfDmg);spawnDmg('player',card.selfDmg,false,'enemy');}

  } else if(card.type==='def'){
    if(card.healMul){
      // CRS 詛咒：封印回復
      if(hasStatus(player,'CRS')){
        battleLog(`${card.name} → 詛咒！回復無效`,'warn');
      } else {
        // E4-4:治療公式(§23)
        const h = _calcHeal(card, player);
        player.hp = Math.min(player.maxHp, player.hp + h);
        spawnDmg('player', h, false, 'heal');
        battleLog(`${card.name} → 回復 +${h} HP`,'heal');
      }
    } else if(card.shieldMul){
      // E4-4:護盾公式(§24)— 新欄位,卡牌定義中有 shieldMul 才走
      const shield = _calcShield(card, player);
      player.shield = (player.shield || 0) + shield;
      spawnDmg('player', shield, false, 'heal');
      battleLog(`${card.name} → 護盾 +${shield}`,'system');
    } else if(card.regenTurns){
      if(hasStatus(player,'CRS')){
        battleLog(`${card.name} → 詛咒！再生無效`,'warn');
      } else {
        addStatus(player,'RGN',card.regenTurns);
        battleLog(`${card.name} → 持續回血${card.regenTurns}回合`,'system');
      }
    } else if(card.stun){
      addStatus(player,'PRT_full',1);
      addStatus(enemy,'STN',1);
      battleLog(`${card.name} → 完全格擋！敵方眩暈！`,'system');
    } else {
      const reduc=card.mul+(card.profBonus||0)*pm;
      addStatus(player,'PRT',1);
      battleLog(`${card.name} → 減傷${Math.round(reduc*100)}%`,'system');
      if(card.counterMul){
        // E4-4:反擊用物理公式
        const cdmg = _calcPhysDmg({dmgMul: card.counterMul}, player, enemy);
        enemy.hp = Math.max(0, enemy.hp - cdmg);
        spawnDmg('enemy', cdmg, false);
        battleLog(`反擊 → ${enemy.name} -${cdmg} HP`,'hit');
        // E4-2:反擊擊殺判定
        if(enemy.hp <= 0) _markEnemyDead(enemy);
      }
    }

  } else if(card.type==='spc'){
    if(card.chargeMul){
      addStatus(player,'CHG',2);
      battleLog(`${card.name} → 下回合攻擊×${card.chargeMul}`,'system');
    } else if(card.poisonTurns){
      addStatus(enemy,'PSN',card.poisonTurns);
      battleLog(`${card.name} → ${enemy.name} 中毒${card.poisonTurns}回合`,'system');
    }
  }

  renderAll();
  // E4-2:全敵人死光才算贏
  if(_checkAllEnemiesDead()){endBattle(true);return;}
  if(player.hp<=0){endBattle(false);return;}
  battle.phase='enemy';
  renderCards();
  setTimeout(()=>{
    if(!battle)return;
    executeEnemyTurn();
    if(!battle||battle.phase==='end')return;
    if(player.hp<=0){endBattle(false);return;}
    // E4-2:全敵人死光才算贏
    if(_checkAllEnemiesDead()){endBattle(true);return;}
    battle.phase='player';
    battle.turn++;
    renderAll();
    renderCards();
    battleLog(`── 第 ${battle.turn} 回合 ──`,'system');
    if(autoMode)setTimeout(()=>autoAct(),800);
  },700);
}

// E4-2:executeEnemyTurn 改成所有活敵人輪流出招,tickStatuses 在末尾統一跑一次
function executeEnemyTurn(){
  if(!battle) return;
  const {player} = battle;
  const aliveList = _aliveEnemies();
  // 輪流讓每隻活敵人出招
  for(const en of aliveList){
    if(!battle || battle.phase === 'end') return;
    if(player.hp <= 0){ endBattle(false); return; }
    // 死敵跳過(可能本 turn 前面被毒死、或被反擊擊殺)
    if(en.dead || en.hp <= 0){
      if(en.hp <= 0 && !en.dead) _markEnemyDead(en);
      continue;
    }
    // 設定當前行動者(讓 tickStatuses / addStatus 等對的目標)
    battle.enemy = en;
    _executeOneEnemyAction(en);
  }
  // 全部敵人 + 玩家 tick statuses(每回合末)
  const allEnemies = (battle && battle.enemies) || [];
  tickStatuses(player);
  allEnemies.forEach(en=>{
    if(en && !en.dead){
      tickStatuses(en);
      // tick 後可能毒死
      if(en.hp <= 0) _markEnemyDead(en);
    }
  });
  renderAll();
  if(player.hp <= 0){ endBattle(false); return; }
  if(_checkAllEnemiesDead()){ endBattle(true); return; }
}

// E4-2:單隻敵人單次行動(從原 executeEnemyTurn 主體拆出來,不跑 tickStatuses)
function _executeOneEnemyAction(enemy){
  if(!battle) return;
  const {player} = battle;
  if(enemy.stunned){
    enemy.stunned = false;
    enemy.stagger = 0;
    battleLog(`${enemy.name} 僵直！跳過行動`, 'system');
    return;
  }
  if(!tryAct(enemy, enemy.name)){
    return;
  }
  const atkKey = enemy.pattern[enemy.patternIdx % enemy.pattern.length];
  const atk = ENEMY_ATTACKS_CARD[atkKey] || {name:atkKey, dmgMul:1.0};
  enemy.patternIdx++;
  if(atk.isGuard){
    addStatus(enemy, 'PRT', 1);
    battleLog(`${enemy.name} 防禦`, 'system');
    return;
  }
  if(atk.isCurseAll){
    ['BLD','PSN','BRN','FRZ','PAR','STN','SLP','CRS'].forEach(id=>addStatus(player, id, 3));
    battleLog(`💀 ${enemy.name} 萬禍降臨！所有詛咒降臨！`, 'warn');
    return;
  }
  // E4-4:敵人攻擊公式(§27)
  let rawDmg = enemy.atk * (atk.dmgMul || 1);
  if(hasStatus(player,'PRT')){ rawDmg *= 0.6; removeStatus(player,'PRT'); }
  if(hasStatus(player,'PRT_full')){
    rawDmg = 0;
    removeStatus(player,'PRT_full');
  }
  // 走玩家防護 + 元素抵抗 + 等級差
  let dmg = rawDmg > 0 ? _calcEnemyDmg(rawDmg, enemy, player) : 0;
  dmg = calcIncomingDmg(player, dmg);
  onHit(player);
  player.hp = Math.max(0, player.hp - dmg);
  addStagger(player, dmg);
  spawnDmg('player', dmg, false, 'enemy');
  battleLog(`${enemy.name} ${atk.name} → 玩家 -${dmg} HP`, 'enemy');
}

function autoAct(){
  if(!battle||battle.phase==='end')return;
  const first=CARD_DECK.find(c=>c.type==='atk');
  if(first)executePlayerCard(first);
}

function toggleAutoMode(){
  autoMode=!autoMode;
  const autoLabel=document.getElementById('rpg-auto-label');if(autoLabel)autoLabel.textContent=autoMode?'自動':'手動';
  document.getElementById('rpg-auto-toggle')?.classList.toggle('auto-on',autoMode);
  showToast(autoMode?'// AUTO ON':'// MANUAL');
}

function endBattle(result){
  if(!battle)return;
  battle.phase='end';
  hideConfirm(); // E4-1b:確認按鈕回 disabled,避免戰鬥結束殘留 enabled 狀態
  mockChar.hp = Math.max(0, battle.player.hp);
  // 寫回主檔 HP / MP
  const s=initState();
  s.character.hp=mockChar.hp;
  s.character.mp=Math.max(0, Math.min(battle.player.maxMp, battle.player.mp||0));
  save(s);
  const el=document.getElementById('battle-result');
  const title=document.getElementById('result-title');
  const detail=document.getElementById('result-detail');
  if(result===true){
    title.textContent='VICTORY';title.className='result-title win';
    // E4-2:多敵人時顯示「擊敗 N 隻」
    const enemies = battle.enemies || [];
    const enemyCount = enemies.length;
    if(enemyCount === 1){
      detail.textContent = `擊敗 ${enemies[0].name}！`;
    } else {
      detail.textContent = `擊敗 ${enemyCount} 隻敵人！`;
    }
    // E4-2:Boss 判定取 enemies array 內第一隻 isBoss 的(boss 戰通常只有 1 隻 boss)
    const boss = enemies.find(e=> e && e.isBoss);
    // Boss過關：解鎖下一層
    if(boss){
      const sf=initState();
      const floor=sf.currentFloor||1;
      if(!sf.clearedFloors) sf.clearedFloors=[];
      if(!sf.clearedFloors.includes(floor)){
        sf.clearedFloors.push(floor);
        save(sf);
        detail.textContent+=`\n第 ${floor} 層已通關！解鎖第 ${Math.min(floor+1,100)} 層`;
      }
    }
    // 種子掉落(10% 基礎 / 怪物分階決定種子池)
    if(Math.random() < 0.10){
      // E4-2:用 boss / 任一 isElite / 預設 common
      const elite = enemies.find(e=> e && e.isElite);
      const tier = boss ? 'epic' : (elite ? 'rare' : 'common');
      const seedPools = {
        common: ['seed_weed','seed_mint'],
        rare:   ['seed_moongrass','seed_rose'],
        epic:   ['seed_apple','seed_lotus'],
      };
      const pool = seedPools[tier] || seedPools.common;
      const seedKey = pool[Math.floor(Math.random()*pool.length)];
      const s2 = initState();
      bagAddMaterial(s2, seedKey, 1);
      save(s2);
      const def = (typeof getMaterialDef==='function') ? getMaterialDef(seedKey) : null;
      detail.textContent += `\n掉落：${def?.icon||'🌰'} ${def?.name||seedKey}`;
    }
  } else if(result==='flee'){
    title.textContent='ESCAPED';title.className='result-title win';detail.textContent='成功逃脫！';
  } else {
    // 死亡：復活回滿血，直接關閉戰鬥回選層
    const rs=initState();
    const mhp=maxHp(rs.character.level,rs.character);
    const mmp=maxMp(rs.character.level,rs.character);
    rs.character.hp=mhp;
    rs.character.mp=mmp;
    save(rs);
    mockChar.hp=mhp;
    battle=null;
    document.getElementById('adv-battle-map').style.display='none';
    showToast('// 你被擊倒了！復活中...');
    setTimeout(()=>{
      // 退出樓層地圖層 + 還原底部 tab(對齊 exitFloorMap 的清理)
      document.getElementById('page-map-battle').style.display='none';
      setBottomBarVisible(true);
      goPage('adventure');
      goAdvPage('map');
      renderFloorSelect();
      if(currentPage==='status')renderStatus();
    },800);
    return;
  }
  el.classList.add('show'); hideConfirm();
}

function exitBattle(){
  document.getElementById('adv-battle-map').style.display='none';
  showMap();
  updateMapHp();
  renderNextChoices();
  // 同步HP到外部版面
  if(currentPage==='status')renderStatus();
  if(currentAdvPage==='reserve')renderReserve();
}

// ── Tooltip ──
function startCardHold(id){tooltipTimer=setTimeout(()=>showTooltip(id),500);}
function endCardHold(){if(tooltipTimer){clearTimeout(tooltipTimer);tooltipTimer=null;}}
function showTooltip(id){
  const c=CARD_DECK.find(x=>x.id===id); if(!c)return;
  document.getElementById('ct-title').textContent=c.name;
  document.getElementById('ct-desc').textContent=c.desc;
  document.getElementById('ct-cd').textContent=`AP ${c.cost}`;
  document.getElementById('ct-icon-placeholder').textContent=c.name[0];
  const tag=document.getElementById('ct-tag');
  tag.textContent=c.type==='atk'?'ATK':c.type==='def'?'DEF':'SPC';
  tag.className='ct-tag'+(c.type==='def'?' tag-def':c.type==='spc'?' tag-spc':'');
  document.getElementById('card-tooltip').classList.add('show');
  setTimeout(hideTooltip,2500);
}
function hideTooltip(){document.getElementById('card-tooltip').classList.remove('show');}

// ── 浮動日誌 ──
function battleLog(msg,cls=''){
}

// ── 傷害浮字 ──
function spawnDmg(target, val, crit, type='hit'){
  const zone=document.getElementById(target==='player'?'player-zone':'enemy-zone'); if(!zone)return;
  const el=document.createElement('div');
  const color=type==='heal'?'#44ff88':type==='enemy'?'#cc88ff':'#ff4455';
  el.className='dmg-float';
  el.style.cssText=`color:${crit?'#ffcc44':color};font-size:${crit?'20':'16'}px;top:-10px;left:50%;`;
  el.textContent=(type==='heal'?'+':'-')+Math.abs(val);
  zone.appendChild(el);
  setTimeout(()=>el.remove(),900);
}




/* ════════════════════════════════════════════════════════════════════════
 * Phase 5d-3 stage 2 追加:地圖系統(連續區塊 L1798-2101)
 *
 * 內容:
 *   - 節點類型 NODE_TYPES(8 種:battle/elite/boss/chest/trap/rest/shop/hidden)
 *   - 地圖結構 MAP_FLOORS(每層 column 陣列,目前只有第 1 層 9 欄)
 *   - 狀態 mapState / currentNodeId / selectedNodeInfo
 *   - 顯示控制 showMap / hideMap / updateMapHp
 *   - 渲染 renderMap / makeNodeEl / renderNextChoices / makeShopBar / makeChoiceCard
 *   - 互動 enterNodeDirect / markNodeDone
 *   - 戰鬥啟動橋接 startBattleWith(把節點 → 戰鬥的入口)
 *
 * 依賴:
 *   - state.js: initState
 *   - storage.js: load / save
 *   - utils.js: showToast / imgOrPlaceholder
 *   - character.js: maxHp / addExp
 *   - equipment.js: getEquipItem / buildBattleDeck
 *   - battle.js 上半部:battle / mockChar / autoMode / selectedCard /
 *                       CARD_DECK / battleLog / renderAll / renderCards
 *   - 仍在 inline JS:openShop / openChestGame(寶箱小遊戲)、
 *                    openTrapGame、openHiddenRoom — 這些將於 Phase 6 抽出。
 * ════════════════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════
// 地圖系統
// ══════════════════════════════════════════

const NODE_TYPES = {
  battle:  { label:'BATTLE',  imgKey:'node_battle',  desc:'與敵人戰鬥' },
  elite:   { label:'ELITE',   imgKey:'node_elite',   desc:'強力菁英怪，掉落豐厚' },
  boss:    { label:'BOSS',    imgKey:'node_boss',    desc:'層主，擊敗後進入下一層' },
  chest:   { label:'CHEST',   imgKey:'node_chest',   desc:'寶箱，解鎖獲得道具' },
  trap:    { label:'TRAP',    imgKey:'node_trap',    desc:'陷阱箱，危機與機遇並存' },
  rest:    { label:'REST',    imgKey:'node_rest',    desc:'回復 30% HP' },
  shop:    { label:'SHOP',    imgKey:'node_shop',    desc:'購買道具與技能' },
  hidden:  { label:'HIDDEN',  imgKey:'node_hidden',  desc:'隱藏房間，需要幸運才能發現' },
};

// 地圖結構：每層是 column 陣列
// single: 單節點（上列）；fork: 兩條路（top上列/bottom下列）；wide: 合併長條
const MAP_FLOORS = [
  [
    { top:{ id:0, kind:'battle', name:'巡邏士兵' },    bottom:{ id:1, kind:'battle', name:'哥布林斥候' } },
    { top:{ id:2, kind:'elite',  name:'鐵甲武士' },    bottom:{ id:3, kind:'chest',  name:'寶箱', rarity:'common' } },
    { top:{ id:4, kind:'battle', name:'野狼群' },       bottom:{ id:5, kind:'rest',   name:'營火' } },
    { type:'merge', node:{ id:6, kind:'shop', name:'商人' } },
    { top:{ id:7, kind:'battle', name:'騎士隊長' },    bottom:{ id:8, kind:'rest',   name:'聖水泉' } },
    { top:{ id:9, kind:'chest',  name:'寶箱', rarity:'rare' }, bottom:{ id:10, kind:'elite', name:'暗影刺客' } },
    { top:{ id:11, kind:'battle', name:'石像鬼' },     bottom:{ id:12, kind:'battle', name:'食人魔' } },
    { type:'merge', node:{ id:13, kind:'shop', name:'行商' } },
    { type:'merge', node:{ id:14, kind:'boss', name:'迷失騎士', isBoss:true } },
  ],
];

let mapState = {
  floor: 0,
  currentCol: -1,       // 目前站在第幾欄（-1=還沒開始）
  chosenPath: {},       // { colIdx: 'top'|'bottom'|'single' }
};
let currentNodeId = null;
let selectedNodeInfo = null;

// ── 顯示/隱藏地圖 ──
function showMap(){
  const m=document.getElementById('page-map-battle');
  const b=document.getElementById('adv-battle-map');
  if(m){m.style.display='flex';}
  if(b){b.style.display='none';}
  renderMap();
  updateMapHp();
  renderNextChoices();
}
function hideMap(){
  const m=document.getElementById('page-map-battle');
  const b=document.getElementById('adv-battle-map');
  if(m){m.style.display='none';}
  if(b){b.style.display='flex';}
}

function updateMapHp(){
  const c=mockChar, mhp=maxHp(c.level,c), pct=Math.max(0,c.hp/mhp*100);
  const num=document.getElementById('map-hp-num');
  const bar=document.getElementById('map-hp-bar');
  const cur=document.getElementById('map-hp-cur');
  const mx=document.getElementById('map-hp-max');
  if(cur)cur.textContent=c.hp;
  if(mx)mx.textContent='/'+mhp;
  if(bar)bar.style.width=pct+'%';
  // MP 條同步(從存檔取最新值)
  const s=initState();
  const mp=s.character.mp||0, mmp=maxMp(s.character.level, s.character);
  const mcur=document.getElementById('map-mp-cur');
  const mmax=document.getElementById('map-mp-max');
  const mbar=document.getElementById('map-mp-bar');
  if(mcur)mcur.textContent=mp;
  if(mmax)mmax.textContent='/'+mmp;
  if(mbar)mbar.style.width=Math.min(100,(mp/mmp)*100)+'%';
}

// ── 渲染格子地圖 ──
function renderMap(){
  const lanes=document.getElementById('map-lanes'); if(!lanes)return;
  const cols=MAP_FLOORS[mapState.floor];
  lanes.innerHTML='';

  // 起始點（跨兩列）
  const startEl=document.createElement('div');
  startEl.className='map-start-node';
  // 換圖：startEl.innerHTML='<img src="img/map/start.png">';
  startEl.innerHTML='<div class="map-start-node-ph">S</div>';
  lanes.appendChild(startEl);

  cols.forEach((col,ci)=>{
    const isDone    = ci < mapState.currentCol;
    const isCurrent = ci === mapState.currentCol;
    const chosen    = mapState.chosenPath[ci];

    if(col.type==='merge'){
      // 長條：grid-row span 1/3，佔上下兩格
      const mergeEl=makeNodeEl(col.node, isDone||isCurrent, false, ci, 'merge');
      mergeEl.classList.add('node-tall');
      lanes.appendChild(mergeEl);
    } else {
      const topDone = isDone && chosen==='top';
      const botDone = isDone && chosen==='bottom';
      const topCur  = isCurrent && chosen==='top';
      const botCur  = isCurrent && chosen==='bottom';
      // grid-auto-flow:column 會自動填：先 row1 再 row2
      lanes.appendChild(makeNodeEl(col.top,    topDone, topCur, ci, 'top'));
      lanes.appendChild(makeNodeEl(col.bottom, botDone, botCur, ci, 'bottom'));
    }
  });

  // 樓梯（下一層）
  const stairEl=document.createElement('div');
  stairEl.className='map-stair-node';
  // 換圖：stairEl.innerHTML='<img src="img/map/stair.png">';
  stairEl.innerHTML='<div class="map-stair-node-ph">▲</div>';
  stairEl.onclick=()=>showToast('// 下一層 — 開發中');
  lanes.appendChild(stairEl);

  const lbl=document.getElementById('map-floor-label');
  if(lbl)lbl.textContent=`FLOOR ${mapState.floor+1}`;
}

function makeNodeEl(node, isDone, isCurrent, colIdx, side){
  const div=document.createElement('div');
  div.id='mnode-'+node.id;
  let cls='map-node node-'+node.kind;
  if(isDone||isCurrent) cls+=' node-done-bright';
  else cls+=' node-available';
  div.className=cls;

  // 當前位置浮動圖示
  if(isCurrent){
    const cur=document.createElement('div');
    cur.className='node-current-icon-ph';
    cur.textContent='🔷'; // 換圖：<img class="node-current-icon" src="img/current.png">
    div.appendChild(cur);
  }

  const imgEl=document.createElement('img');
  imgEl.className='node-img';
  imgEl.src=IMG['node_'+node.kind]||'';
  imgEl.alt=node.kind;
  imgEl.onerror=function(){const ph=document.createElement('div');ph.className='node-img-placeholder';ph.textContent=node.kind[0].toUpperCase();this.parentNode.replaceChild(ph,this);};
  div.appendChild(imgEl);

  return div;
}

// ── 自動顯示下一格選項 ──
function renderNextChoices(){
  const det=document.getElementById('map-detail'); if(!det)return;
  const cols=MAP_FLOORS[mapState.floor];
  const nextCol=mapState.currentCol+1;

  if(nextCol>=cols.length){
    det.innerHTML='<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:16px;letter-spacing:2px;">// 本層已完成</div>';
    return;
  }

  const col=cols[nextCol];
  det.innerHTML='';

  if(col.type==='merge'){
    if(col.node.kind==='shop'){
      // 商店：長條樣式，強制路過
      det.appendChild(makeShopBar(col.node, nextCol));
    } else {
      det.appendChild(makeChoiceCard(col.node, nextCol, 'merge'));
    }
  } else {
    if(mapState.currentCol===-1){
      det.appendChild(makeChoiceCard(col.top,    nextCol, 'top'));
      det.appendChild(makeChoiceCard(col.bottom, nextCol, 'bottom'));
    } else {
      const curSide=mapState.chosenPath[mapState.currentCol];
      const curCol=cols[mapState.currentCol];
      if(curCol&&curCol.type==='merge'){
        det.appendChild(makeChoiceCard(col.top,    nextCol, 'top'));
        det.appendChild(makeChoiceCard(col.bottom, nextCol, 'bottom'));
      } else if(curSide==='bottom'){
        det.appendChild(makeChoiceCard(col.bottom, nextCol, 'bottom'));
      } else {
        det.appendChild(makeChoiceCard(col.top, nextCol, 'top'));
      }
    }
  }
}

function makeShopBar(node, colIdx){
  const bar=document.createElement('div');
  bar.className='map-shop-bar';
  bar.innerHTML=`
    <div class="map-shop-bar-icon">🛒</div>
    <div class="map-shop-bar-body">
      <div class="map-shop-bar-title">// SHOP</div>
      <div class="map-shop-bar-sub">兩條路線皆經過　點擊進入</div>
    </div>`;
  bar.onclick=()=>enterNodeDirect(node, colIdx, 'merge');
  return bar;
}

function makeChoiceCard(node, colIdx, side){
  const nt=NODE_TYPES[node.kind]||{label:node.kind,desc:''};
  const div=document.createElement('div');
  div.className=`map-choice-card choice-${node.kind}`;

  // 精英badge
  if(node.kind==='elite'){
    const badge=document.createElement('div');
    badge.className='elite-badge';
    badge.textContent='ELITE';
    div.appendChild(badge);
  }

  // icon
  const img=document.createElement('img');
  img.className='map-choice-icon';
  img.src=IMG['node_'+node.kind]||'';
  img.alt=node.kind;
  img.onerror=function(){const ph=document.createElement('div');ph.className='map-choice-icon-ph';ph.textContent=node.kind[0].toUpperCase();this.parentNode.replaceChild(ph,this);};
  div.appendChild(img);

  // desc：戰鬥/精英不顯示敵人名稱
  const desc=document.createElement('div');
  desc.className='map-choice-desc';
  if(node.kind==='battle'){
    desc.textContent='與敵人戰鬥';
  } else if(node.kind==='elite'){
    desc.textContent='強力敵人';
  } else {
    desc.textContent=node.name+' — '+nt.desc;
  }
  div.appendChild(desc);

  div.onclick=()=>enterNodeDirect(node, colIdx, side);
  return div;
}

// ── 進入節點 ──
function enterNodeDirect(node, colIdx, side){
  mapState.chosenPath[colIdx]=side;
  mapState.currentCol=colIdx;
  currentNodeId=node.id;

  if(node.kind==='battle'||node.kind==='elite'||node.kind==='boss'){
    hideMap();
    const isBoss=node.kind==='boss';
    const isElite=node.kind==='elite';
    const currentFloor=initState().currentFloor||1;
    const isFinalBoss=isBoss&&(currentFloor>=100||currentFloor===1);
    const enemyData={
      name: node.name,
      maxHp: isBoss?400:isElite?260:180,
      atk:   isBoss?32:isElite?24:18,
      pattern: isFinalBoss?['slash','heavy','curse_all','slash','heavy','slash','guard','curse_all']:
               isBoss?['slash','heavy','slash','guard','heavy']:
               isElite?['slash','heavy','slash','guard']:
               ['slash','heavy','guard','slash'],
      _maxStagger: isBoss?150:isElite?110:80,
      isBoss,
    };
    startBattleWith(enemyData);
  } else if(node.kind==='rest'){
    const mhp=maxHp(mockChar.level,mockChar);
    mockChar.hp=Math.min(mhp, mockChar.hp+Math.round(mhp*0.3));
    showToast('// 💤 回復 30% HP');
    renderMap(); updateMapHp(); renderNextChoices();
  } else if(node.kind==='shop'){
    openShop();
  } else if(node.kind==='chest'||node.kind==='trap'){
    openChestGame(node);
  } else if(node.kind==='hidden'){
    // E4-4:LUK 已移除,等 E6 幸運系統接通
    const luk = 3;
    const chance = 0.1 + luk * 0.04;
    if(Math.random()<chance){
      showToast('// ❓ 隱藏房間發現！');
    } else {
      showToast('// 什麼都沒有...');
    }
    renderMap(); renderNextChoices();
  }
}

function markNodeDone(nodeId){
  // 已整合進 mapState.currentCol，不需額外標記
}

function startBattleWith(enemyData){
  // 從主檔initState讀取最新角色資料和裝備加成
  // E4-4:玩家屬性 12 中文 schema(_buildBattleChar 已含 maxHp/maxMp + 裝備 bonus)
  const s = initState();
  mockChar = _buildBattleChar(s);
  mockChar.hp = s.character.hp || mockChar.maxHp;
  // E4-2:依樓層難度決定敵人數
  const curFloor = (typeof mapState !== 'undefined' && mapState && mapState.floor) ? (mapState.floor + 1) : 1;
  const isBoss = !!enemyData.isBoss;
  const enemyCount = _enemyCountForFloor(curFloor, isBoss);
  const slots = _slotsForCount(enemyCount);
  // 生成 enemies array
  const enemies = slots.map((slotIdx, i)=>{
    // 隨機抽名字(boss 用 enemyData 原名;一般敵人用 NAME_POOL)
    const name = isBoss ? enemyData.name : ENEMY_NAME_POOL[Math.floor(Math.random() * ENEMY_NAME_POOL.length)];
    return {
      ...enemyData,
      name,
      hp: enemyData.maxHp,
      statuses: [],
      patternIdx: 0,
      stagger: 0,
      stunned: false,
      slotIdx,           // 0-3,UI 渲染哪格
      _enemyId: i,       // 內部 id(避免重名混淆)
      dead: false,
    };
  });

  // E4-4:player 物件直接 spread mockChar(12 中文屬性 + maxHp/maxMp 已算好)
  const player = {
    ...mockChar,
    statuses: [],
    stagger: 0,
    stunned: false,
  };
  battle={
    player,
    enemies,                  // E4-2:真正資料源(array)
    enemy: enemies[0],        // E4-2:當前目標 shim,執行卡前由 attackEnemy / executeEnemyTurn 設定
    turn:1, phase:'player',
  };
  autoMode=false; selectedCard=null;
  // 生成招式牌組
  CARD_DECK=buildBattleDeck(s);
  // ── E4-1b TEMP:測試卡牌翻頁,塞滿 8 張卡(從 CARDS 字典補齊)──
  // E4-3 接通技能系統後拿掉這段
  // E4-4 fix:CARDS dict 用 cat,executePlayerCard 認 type;補 type 對應(atk/def/spc)
  if(CARD_DECK.length < 8){
    const allCardKeys = Object.keys(CARDS);
    for(const k of allCardKeys){
      if(CARD_DECK.length >= 8) break;
      if(!CARD_DECK.find(c=>c.id===k)){
        const src = CARDS[k];
        CARD_DECK.push({
          ...src,
          type: src.type || src.cat,  // cat → type 對應
          cd: 0,
          usesLeft: src.uses,
          profMul: 1
        });
      }
    }
  }
  const ab=document.getElementById('adv-battle-map');
  if(ab){ab.style.display='flex';}
  document.getElementById('battle-result').classList.remove('show');
  battleLog(`⚔ 遭遇 ${enemies.length} 隻敵人！`,'system');
  cardPageReset();
  renderAll(); renderCards();
}

