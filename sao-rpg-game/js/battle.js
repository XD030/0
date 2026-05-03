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
const CARDS = {
  slash:  {id:'slash',  name:'SLASH',   cat:'atk', dmgMul:1.1, poise:12, agiCost:0,  desc:'基本斬擊，造成傷害並積累Poise', uses:null},
  heavy:  {id:'heavy',  name:'HEAVY',   cat:'atk', dmgMul:2.6, poise:40, agiCost:3,  desc:'強力重擊，施展後AGI -3回合', uses:2},
  flurry: {id:'flurry', name:'FLURRY',  cat:'atk', dmgMul:0.55,poise:14, agiCost:1,  desc:'三連擊，各段造成傷害', hits:3, uses:null, maxCd:2, cd:0},
  rend:   {id:'rend',   name:'REND',    cat:'atk', dmgMul:0.8, poise:20, agiCost:0,  desc:'流血攻擊，後續每回合流血傷害', dot:true, uses:null, maxCd:3, cd:0},
  focus:  {id:'focus',  name:'FOCUS',   cat:'spc', dmgMul:0,   poise:0,  agiCost:0,  desc:'集中，下回合攻擊暴擊率+50%', buff:'focus', uses:null, maxCd:2, cd:0},
  pierce: {id:'pierce', name:'PIERCE',  cat:'atk', dmgMul:1.4, poise:18, agiCost:0,  desc:'穿刺攻擊，無視部分防禦', uses:null, maxCd:2, cd:0},
  whirl:  {id:'whirl',  name:'WHIRL',   cat:'atk', dmgMul:0.7, poise:10, agiCost:0,  desc:'旋風斬，對所有敵人造成傷害', hits:2, uses:null, maxCd:3, cd:0},
  charge: {id:'charge', name:'CHARGE',  cat:'spc', dmgMul:0,   poise:0,  agiCost:0,  desc:'蓄力，下次攻擊傷害×2', buff:'CHG', uses:null, maxCd:3, cd:0},
  defend: {id:'defend', name:'DEFEND',  cat:'def', dmgMul:0,   poise:-20,agiCost:0,  desc:'防禦姿態，減傷並恢復Poise', uses:null},
  dodge:  {id:'dodge',  name:'DODGE',   cat:'def', dmgMul:0,   poise:0,  agiCost:0,  desc:'閃避，AGI決定成功率，成功完全免傷', uses:null, maxCd:2, cd:0},
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
  // 同步玩家HP
  const c = s.character;
  const mhp = maxHp(c.level, c.VIT);
  mockChar = {
    level: c.level, hp: c.hp, maxHp: mhp,
    STR: c.STR||1, AGI: c.AGI||1, DEX: c.DEX||1,
    VIT: c.VIT||1, INT: c.INT||1, LUK: c.LUK||1
  };
  // 顯示地圖
  document.getElementById('page-map-battle').style.display = 'flex';
  document.getElementById('adv-tab-bar').style.display = 'none';
  document.getElementById('map-floor-label').textContent = `FLOOR ${floorNum}`;
  showMap();
  updateMapHp();
  renderNextChoices();
}

function exitFloorMap(){
  document.getElementById('page-map-battle').style.display = 'none';
  document.getElementById('adv-tab-bar').style.display = 'flex';
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
let mockChar=(()=>{try{const s=JSON.parse(localStorage.getItem('wxrpg6')||'{}');const c=s.character||{};const lv=c.level||1;const vit=c.VIT||1;const mhp=100+lv*10+vit*20;return{level:lv,hp:c.hp||mhp,maxHp:mhp,STR:c.STR||1,AGI:c.AGI||1,DEX:c.DEX||1,VIT:vit,INT:c.INT||1,LUK:c.LUK||1};}catch{return{level:1,hp:200,maxHp:200,STR:1,AGI:1,DEX:1,VIT:1,INT:1,LUK:1};}})();

// ── 敵人 ──
const BATTLE_DEFAULT_ENEMY={
  name:'迷失騎士', maxHp:180, atk:18, imgKey:'enemy_knight',
  pattern:['slash','heavy','guard','slash','slash'], patternIdx:0,
  _maxStagger:90,
};
const ENEMY_ATTACKS_CARD={
  slash:    {name:'劍擊',   dmgMul:1.0},
  heavy:    {name:'重擊',   dmgMul:1.8, isHeavy:true},
  guard:    {name:'防禦',   dmgMul:0,   isGuard:true},
  curse_all:{name:'萬禍降臨', dmgMul:0, isCurseAll:true},
};

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
  if(el('rpg-e-hp'))el('rpg-e-hp').textContent=`${enemy.hp}/${enemy.maxHp}`;
  if(el('rpg-e-bar'))el('rpg-e-bar').style.width=Math.max(0,enemy.hp/enemy.maxHp*100)+'%';
  if(el('bp-p-cur'))el('bp-p-cur').textContent=player.hp;
  if(el('bp-p-max'))el('bp-p-max').textContent='/'+player.maxHp;
  if(el('bp-e-cur'))el('bp-e-cur').textContent=enemy.hp;
  if(el('bp-e-max'))el('bp-e-max').textContent='/'+enemy.maxHp;
  if(el('bp-p-bar'))el('bp-p-bar').style.width=Math.max(0,player.hp/player.maxHp*100)+'%';
  if(el('bp-e-bar'))el('bp-e-bar').style.width=Math.max(0,enemy.hp/enemy.maxHp*100)+'%';
  // 玩家 MP
  const pmp=player.mp||0, pmaxMp=player.maxMp||1;
  if(el('bp-p-mp-cur'))el('bp-p-mp-cur').textContent=pmp;
  if(el('bp-p-mp-max'))el('bp-p-mp-max').textContent=pmaxMp;
  if(el('bp-p-mp-bar'))el('bp-p-mp-bar').style.width=Math.min(100,(pmp/pmaxMp)*100)+'%';
  if(el('bp-turn'))el('bp-turn').textContent=battle.turn;
  // 僵直條
  const ps=el('bp-p-stagger');const es=el('bp-e-stagger');
  if(ps){const ms=calcMaxStagger(player);ps.style.width=Math.min(100,(player.stagger||0)/ms*100)+'%';ps.className='bp-stagger-bar'+(player.stunned?' full':'');}
  if(es){const ms=calcMaxStagger(enemy);es.style.width=Math.min(100,(enemy.stagger||0)/ms*100)+'%';es.className='bp-stagger-bar'+(enemy.stunned?' full':'');}
  renderStatusSlot('p-buff-slot',  player, 'buff');
  renderStatusSlot('p-debuff-slot',player, 'debuff');
  renderStatusSlot('e-buff-slot',  enemy,  'buff');
  renderStatusSlot('e-debuff-slot',enemy,  'debuff');
}

// 計算僵直上限
function calcMaxStagger(target){
  const vit=target.VIT||1, str=target.STR||1, agi=target.AGI||1;
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

function renderCards(){
  const row1=document.getElementById('cards-row-1');
  const row2=document.getElementById('cards-row-2');
  if(!row1||!row2)return;
  const locked = battle && battle.phase !== 'player';
  const atkCards=CARD_DECK.filter(c=>c.type==='atk'||c.type==='spc');
  const defCards=CARD_DECK.filter(c=>c.type==='def');
  row1.innerHTML=atkCards.map(c=>makeCardHTML(c,locked)).join('');
  row2.innerHTML=defCards.map(c=>makeCardHTML(c,locked)).join('');
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

function selectCard(id){
  hideTooltip();
  if(selectedCard?.id===id){selectedCard=null;hideConfirm();}
  else{selectedCard=CARD_DECK.find(x=>x.id===id);if(selectedCard)showConfirm();}
  renderCards();
}

function showConfirm(){
  const c=selectedCard; if(!c)return;
  document.getElementById('confirm-btn').textContent=
    c.type==='def'?'DEFEND':c.id==='spc_flee'?'FLEE':c.name.toUpperCase();
  document.getElementById('battle-overlay').classList.add('show');
}
function hideConfirm(){document.getElementById('battle-overlay').classList.remove('show');}

function confirmCard(){
  if(!selectedCard||!battle)return;
  hideConfirm();
  const card=selectedCard; selectedCard=null; renderCards();
  executePlayerCard(card);
}

// ── 戰鬥邏輯 ──
function executePlayerCard(card){
  if(!battle)return;
  const {player,enemy}=battle;
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
    const baseAtk=4+player.STR*2;
    const chg=hasStatus(player,'CHG')?2.5:1;
    if(hasStatus(player,'CHG'))removeStatus(player,'CHG');
    // FCS 集中：暴擊率 +50%，消耗
    const fcsBonus=hasStatus(player,'FCS')?0.5:0;
    if(fcsBonus)removeStatus(player,'FCS');
    let total=0;
    for(let i=0;i<(card.hits||1);i++){
      const mul=(card.mul+card.profBonus*pm)*(chg/Math.max(card.hits,1));
      const crit=Math.random()<(0.05+player.DEX*0.02+fcsBonus);
      let dmg=Math.round(baseAtk*mul*(crit?1.5:1));
      if(hasStatus(enemy,'PRT'))dmg=Math.round(dmg*0.6);
      // FRZ 受擊加傷，SLP 受擊額外+50%
      dmg=calcIncomingDmg(enemy,dmg);
      onHit(enemy);
      enemy.hp=Math.max(0,enemy.hp-dmg);
      total+=dmg;
      if(crit)spawnDmg('enemy',dmg,true);
    }
    if(card.hits<=1)spawnDmg('enemy',total,false);
    addStagger(enemy,total);
    if(card.selfDmg){player.hp=Math.max(1,player.hp-card.selfDmg);spawnDmg('player',card.selfDmg,false,'enemy');}
    if(card.poisonTurns){addStatus(enemy,'PSN',card.poisonTurns);}
    battleLog(`${card.name} → ${enemy.name} -${total} HP${card.hits>1?` (${card.hits}連擊)`:''}${chg>1?' [蓄力]':''}${fcsBonus?' [集中]':''}`,'hit');

  } else if(card.type==='def'){
    if(card.healMul){
      // CRS 詛咒：封印回復
      if(hasStatus(player,'CRS')){
        battleLog(`${card.name} → 詛咒！回復無效`,'warn');
      } else {
        const h=Math.round(player.maxHp*(card.healMul+card.profBonus*pm));
        player.hp=Math.min(player.maxHp,player.hp+h);
        spawnDmg('player',h,false,'heal');
        battleLog(`${card.name} → 回復 +${h} HP`,'heal');
      }
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
        const cdmg=Math.round((4+player.STR*2)*card.counterMul);
        enemy.hp=Math.max(0,enemy.hp-cdmg);
        spawnDmg('enemy',cdmg,false);
        battleLog(`反擊 → ${enemy.name} -${cdmg} HP`,'hit');
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
  if(enemy.hp<=0){endBattle(true);return;}
  if(player.hp<=0){endBattle(false);return;}
  battle.phase='enemy';
  renderCards();
  setTimeout(()=>{
    if(!battle)return;
    executeEnemyTurn();
    if(!battle||battle.phase==='end')return;
    if(player.hp<=0){endBattle(false);return;}
    if(enemy.hp<=0){endBattle(true);return;}
    battle.phase='player';
    battle.turn++;
    renderAll();
    renderCards();
    battleLog(`── 第 ${battle.turn} 回合 ──`,'system');
    if(autoMode)setTimeout(()=>autoAct(),800);
  },700);
}

function executeEnemyTurn(){
  if(!battle)return;
  const {player,enemy}=battle;
  if(enemy.stunned){
    enemy.stunned=false;enemy.stagger=0;
    battleLog(`${enemy.name} 僵直！跳過行動`,'system');
    tickStatuses(player);tickStatuses(enemy);renderAll();
    if(player.hp<=0){endBattle(false);return;}
    if(enemy.hp<=0){endBattle(true);return;}
    return;
  }
  if(!tryAct(enemy,enemy.name)){
    tickStatuses(player);tickStatuses(enemy);renderAll();
    if(player.hp<=0){endBattle(false);return;}
    if(enemy.hp<=0){endBattle(true);return;}
    return;
  }
  const atkKey=enemy.pattern[enemy.patternIdx%enemy.pattern.length];
  const atk=ENEMY_ATTACKS_CARD[atkKey]||{name:atkKey,dmgMul:1.0};
  enemy.patternIdx++;
  if(atk.isGuard){
    addStatus(enemy,'PRT',1);battleLog(`${enemy.name} 防禦`,'system');
    tickStatuses(player);tickStatuses(enemy);renderAll();
    if(player.hp<=0){endBattle(false);return;}
    if(enemy.hp<=0){endBattle(true);return;}
    return;
  }
  if(atk.isCurseAll){
    ['BLD','PSN','BRN','FRZ','PAR','STN','SLP','CRS'].forEach(id=>addStatus(player,id,3));
    battleLog(`💀 ${enemy.name} 萬禍降臨！所有詛咒降臨！`,'warn');
    tickStatuses(player);tickStatuses(enemy);renderAll();
    if(player.hp<=0){endBattle(false);return;}
    if(enemy.hp<=0){endBattle(true);return;}
    return;
  }
  let dmg=Math.round(enemy.atk*atk.dmgMul);
  if(hasStatus(player,'PRT')){dmg=Math.round(dmg*0.6);removeStatus(player,'PRT');}
  dmg=calcIncomingDmg(player,dmg);
  onHit(player);
  player.hp=Math.max(0,player.hp-dmg);
  addStagger(player,dmg);
  spawnDmg('player',dmg,false,'enemy');
  battleLog(`${enemy.name} ${atk.name} → 玩家 -${dmg} HP`,'enemy');
  tickStatuses(player);tickStatuses(enemy);renderAll();
  if(player.hp<=0){endBattle(false);return;}
  if(enemy.hp<=0){endBattle(true);return;}
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
    detail.textContent=`擊敗 ${battle.enemy.name}！`;
    // Boss過關：解鎖下一層
    if(battle.enemy.isBoss){
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
      const tier = battle.enemy.isBoss ? 'epic' : (battle.enemy.isElite ? 'rare' : 'common');
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
    const mhp=maxHp(rs.character.level,rs.character.VIT);
    const mmp=maxMp(rs.character.level,rs.character.INT);
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
      document.getElementById('adv-tab-bar').style.display='flex';
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
  const c=mockChar, mhp=maxHp(c.level,c.VIT), pct=Math.max(0,c.hp/mhp*100);
  const num=document.getElementById('map-hp-num');
  const bar=document.getElementById('map-hp-bar');
  const cur=document.getElementById('map-hp-cur');
  const mx=document.getElementById('map-hp-max');
  if(cur)cur.textContent=c.hp;
  if(mx)mx.textContent='/'+mhp;
  if(bar)bar.style.width=pct+'%';
  // MP 條同步(從存檔取最新值)
  const s=initState();
  const mp=s.character.mp||0, mmp=maxMp(s.character.level, s.character.INT);
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
    const mhp=maxHp(mockChar.level,mockChar.VIT);
    mockChar.hp=Math.min(mhp, mockChar.hp+Math.round(mhp*0.3));
    showToast('// 💤 回復 30% HP');
    renderMap(); updateMapHp(); renderNextChoices();
  } else if(node.kind==='shop'){
    openShop();
  } else if(node.kind==='chest'||node.kind==='trap'){
    openChestGame(node);
  } else if(node.kind==='hidden'){
    const luk=mockChar.LUK||3;
    const chance=0.1+luk*0.04;
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
  const s=initState(); const c=s.character;
  const bonus={STR:0,VIT:0,DEX:0,AGI:0,INT:0,LUK:0};
  Object.keys(s.equipment||{}).forEach(key=>{
    const item=getEquipItem(s,key);
    if(item&&item.stat){const m=item.stat.match(/([A-Z]+)\s*\+(\d+)/);if(m&&bonus[m[1]]!==undefined)bonus[m[1]]+=parseInt(m[2]);}
  });
  const mhp=maxHp(c.level,c.VIT+(bonus.VIT||0));
  // 更新mockChar
  mockChar={level:c.level,hp:c.hp,maxHp:mhp,STR:(c.STR||1)+(bonus.STR||0),AGI:(c.AGI||1)+(bonus.AGI||0),DEX:(c.DEX||1)+(bonus.DEX||0),VIT:(c.VIT||1)+(bonus.VIT||0),INT:(c.INT||1)+(bonus.INT||0),LUK:(c.LUK||1)+(bonus.LUK||0)};
  const enemy={...enemyData, hp:enemyData.maxHp, statuses:[], patternIdx:0, stagger:0, stunned:false};
  battle={
    player:{hp:mockChar.hp,maxHp:mhp,mp:c.mp||0,maxMp:maxMp(c.level,c.INT+(bonus.INT||0)),STR:mockChar.STR,AGI:mockChar.AGI,DEX:mockChar.DEX,VIT:mockChar.VIT,INT:mockChar.INT,LUK:mockChar.LUK,statuses:[],stagger:0,stunned:false},
    enemy, turn:1, phase:'player',
  };
  autoMode=false; selectedCard=null;
  // 生成招式牌組
  CARD_DECK=buildBattleDeck(s);
  const ab=document.getElementById('adv-battle-map');
  if(ab){ab.style.display='flex';}
  document.getElementById('battle-result').classList.remove('show');
  battleLog(`⚔ 遭遇 ${enemy.name}！`,'system');
  renderAll(); renderCards();
}

