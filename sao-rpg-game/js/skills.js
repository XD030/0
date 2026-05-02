/* ========================================================================
 * skills.js — 生活技能系統(Phase 5a:基礎層 + HUNT + LIFE_TIMER)
 *
 * 內容:
 *   1. 生活技能 EXP 公式 lifeExpReq + 升級函式 addLifeExp
 *   2. 背包寫入助手 bagAddMaterial / bagAddItem(其他模組也會用)
 *   3. 狩獵 HUNT 系統:
 *      isHuntRunning / calcHuntReward / renderHuntTimer /
 *      startHunt / stopHunt / collectHunt /
 *      updateHuntCellTime / startHuntTick / huntTimerInterval
 *   4. 生活技能計時器(GATH / CRFT 等被動掛機):
 *      LIFE_TIMER_SKILLS / LIFE_TIMER_NAME / LIFE_MAX_MS / LIFE_MIN_MS /
 *      lifeTimerInterval / calcLifeReward /
 *      startLifeTimer / stopLifeTimer / collectLifeTimer /
 *      startLifeTimerTick / renderLifeTimers
 *
 * 不在這裡(待 Phase 5b):
 *   - 採集 GATH(農田玩法):renderFarm, SEED_REGISTRY (in items.js), s.farm.plots
 *   - 挖礦小遊戲(MINE 掃雷):renderMineGame, MINE_COLS, …
 *   - 烹飪小遊戲(COOK):renderCookGame, COOK_TAGS, …
 *   - 製造小遊戲(CRFT):renderCrftGame, CRFT_ACC_PARTS(物品 def 已搬 items.js)
 *
 * 依賴:
 *   - state.js: SK / HUNT_MAX_MS / HUNT_MIN_MS / LIFE_ATTRS / LIFE_COLOR / LIFE_SKILL_NAME / initState
 *   - storage.js: load / save
 *   - utils.js: showToast / fmtTime / today
 *   - character.js: maxHp(無;這裡不需要,只有 character[attr]+= 操作)
 *   - 仍在 inline JS: renderStatus(來自 character.js,collectLifeTimer 會呼叫)
 *
 * 注意:
 *   - 原始 collectHunt 內呼叫 bagAddMaterial / addLifeExp,因此這兩者也要在 skills.js 裡。
 *   - 其他 inline JS 模組(漁/挖/烹/造)對 addLifeExp / bagAddMaterial 的呼叫不變,
 *     仍然能存取因為這裡是全域函式。
 * ======================================================================== */


/* ════════════════ 1. 生活技能 EXP 系統 ════════════════ */
function lifeExpReq(lv, attr){
  if(attr==='GATH') return 40;
  if(attr==='MINE') return 300;
  return lv*10;
}

function addLifeExp(s, attr, amt){
  if(!s.lifeSkills) s.lifeSkills={};
  if(!s.lifeSkills[attr]) s.lifeSkills[attr]={lv:1, exp:0};
  const sk=s.lifeSkills[attr];
  if(attr==='GATH' && sk.lv>=100) return; // GATH 最高 100 等
  const lvBefore=sk.lv;
  sk.exp+=amt;
  while(sk.exp>=lifeExpReq(sk.lv, attr)){
    sk.exp-=lifeExpReq(sk.lv, attr);
    sk.lv++;
    showToast(`// ${LIFE_SKILL_NAME[attr]} 升級!Lv.${sk.lv}`);
    if(attr==='GATH' && sk.lv>=100){ sk.exp=0; break; }
  }
  // GATH 升等 → 重算農田解鎖
  if(attr==='GATH' && sk.lv>lvBefore && typeof _syncFarmLocks==='function') _syncFarmLocks(s);
}


/* ════════════════ 2. 背包寫入助手 ════════════════ */
function bagAddMaterial(s, key, qty){
  qty=qty||1;
  if(!s.bag) s.bag={materials:{}, weapons:[], armors:[], items:{}};
  if(typeof getMaterialDef==='function' && !getMaterialDef(key)){
    console.warn('[bag] unknown material key:', key, '(qty:', qty, ')');
  }
  s.bag.materials[key]=(s.bag.materials[key]||0)+qty;
}

function bagAddItem(s, key, qty){
  qty=qty||1;
  if(!s.bag) s.bag={materials:{}, weapons:[], armors:[], items:{}};
  if(typeof getConsumableDef==='function' && !getConsumableDef(key)){
    console.warn('[bag] unknown consumable key:', key, '(qty:', qty, ')');
  }
  s.bag.items[key]=(s.bag.items[key]||0)+qty;
}


/* ════════════════ 3. 狩獵 HUNT 系統 ════════════════ */
let huntTimerInterval=null;

/* ════════════════ HUNT 掉落表(階段二)════════════════
 * 加新掉落物只要動 HUNT_DROP_TABLE:
 *   1. 確認該 matKey 在 items.js 的 MATERIAL_REGISTRY 已存在(沒有的話補上,source:['HUNT'])
 *   2. 在 HUNT_DROP_TABLE 加一行 {matKey, pct, lukBonus}
 *   3. 手動調整其他 pct,讓 pct 總和 = 100
 * collectHunt / calcHuntDropRates / 歷史顯示全部自動跟著變,不用改其他 code。
 *
 * lukBonus = 每點 LUK 對該物品實際 % 的加成(只 dynamic 物品用,其他填 0)
 * dynamic 物品累積機率被 LUK 加多少,static 物品就按比例被擠掉多少
 * ════════════════════════════════════════════════════════ */
const HUNT_DROP_TABLE = [
  {matKey:'rare_fang',  pct:5,  lukBonus:0.5},  // LUK 影響的稀有掉落
  {matKey:'beast_hide', pct:25, lukBonus:0  },
  {matKey:'boar_meat',  pct:70, lukBonus:0  },
];

/* ════════════════ HUNT 樓層加成(階段三)════════════════
 * 格式:{floor: [{matKey, pct, lukBonus}]}
 * - 第 N 層的 entries 會「附加」到該層的掉落表(基礎表 entries 按比例被擠壓)
 * - matKey 不應與基礎表 (HUNT_DROP_TABLE) 重複,否則機率會疊加且顯示重複行
 * - 樓層 entries 也支援 lukBonus(稀有獠牙以外想做 LUK 影響的物品時用)
 * - 加新層只要在這裡多一行,calcHuntDropRates 會自動算
 * ════════════════════════════════════════════════════════ */
const FLOOR_HUNT_BONUS = {
  1:  [{matKey:'seed_weed',      pct:8,  lukBonus:0  }],
  3:  [{matKey:'wolf_pelt',      pct:8,  lukBonus:0  },
       {matKey:'seed_mint',      pct:6,  lukBonus:0  }],
  5:  [{matKey:'seed_moongrass', pct:5,  lukBonus:0.1}],
  7:  [{matKey:'wolf_pelt',      pct:12, lukBonus:0  },
       {matKey:'seed_rose',      pct:4,  lukBonus:0.1}],
  10: [{matKey:'dragon_scale',   pct:2,  lukBonus:0.1},
       {matKey:'seed_apple',     pct:3,  lukBonus:0.1}],
  // 加新層直接在這加,例:
  // 15: [{matKey:'xxx', pct:N, lukBonus:0}],
};

/* ════════════════ HUNT 食物 buff(階段三)════════════════
 * 加新食物兩步:
 *   1. items.js 的 CONSUMABLE_REGISTRY 加新 entry,itemType:'food'
 *   2. 這裡加 {hours, rarityMul},不寫進來的 food 不能用於狩獵
 * rarityMul 套到 calcHuntDropRates 內 dynamic rows(LUK 影響的物品)的 pct
 * 多食物混吃 → 按數量加權平均 rarityMul
 * ════════════════════════════════════════════════════════ */
const HUNT_FOOD_META = {
  bread: {hours: 1, rarityMul: 1.0},
  stew:  {hours: 1, rarityMul: 1.5},
};

function getHuntableFoods(){ return Object.keys(HUNT_FOOD_META); }

// 計算多食物混吃的 rarityMul(加權平均)
function calcFoodRarityMul(foodSelections){
  let totalCount=0, weighted=0;
  for(const [k,n] of Object.entries(foodSelections||{})){
    const meta = HUNT_FOOD_META[k];
    if(!meta || n<=0) continue;
    totalCount += n;
    weighted   += meta.rarityMul * n;
  }
  return totalCount>0 ? weighted/totalCount : 1.0;
}

function calcFoodTotalHours(foodSelections){
  let hours=0;
  for(const [k,n] of Object.entries(foodSelections||{})){
    const meta = HUNT_FOOD_META[k];
    if(!meta || n<=0) continue;
    hours += meta.hours * n;
  }
  return hours;
}

// 計算當下 LUK + 樓層 + 食物加成下的實際掉落機率(顯示與 roll 共用)
function calcHuntDropRates(s, floor, rarityMul){
  const lk = (s?.character?.LUK) || 1;
  rarityMul = rarityMul || 1.0;
  floor = floor || 1;

  // 1. 基礎表 + 樓層加成,合併
  const baseRows  = HUNT_DROP_TABLE.map(r => ({...r, isFloor:false}));
  const floorRows = (FLOOR_HUNT_BONUS[floor] || []).map(r => ({
    matKey:r.matKey, pct:r.pct, lukBonus:r.lukBonus||0, isFloor:true,
  }));
  // dev warning:floor entries 不應與基礎表重複
  if(floorRows.some(fr => baseRows.some(br => br.matKey === fr.matKey))){
    console.warn('FLOOR_HUNT_BONUS['+floor+'] 有 matKey 與 HUNT_DROP_TABLE 重複,機率會疊加');
  }

  // 2. dynamic(lukBonus > 0)— 套 rarityMul
  const dynamicRows = [...baseRows, ...floorRows]
    .filter(r => r.lukBonus > 0)
    .map(r => ({
      matKey: r.matKey,
      pct: (r.pct + lk * r.lukBonus) * rarityMul,
      dynamic: true,
      isFloor: r.isFloor,
    }));
  const dynamicSum = dynamicRows.reduce((a,r) => a + r.pct, 0);

  // 3. floor static(樓層加成內 lukBonus=0)— 固定占用
  const floorStatic = floorRows.filter(r => r.lukBonus === 0).map(r => ({
    matKey: r.matKey, pct: r.pct, dynamic: false, isFloor: true,
  }));
  const floorStaticSum = floorStatic.reduce((a,r) => a + r.pct, 0);

  // 4. base static(基礎表 lukBonus=0)— 按比例擠壓到剩餘空間
  const baseStaticRaw = baseRows.filter(r => r.lukBonus === 0);
  const baseStaticBase = baseStaticRaw.reduce((a,r) => a + r.pct, 0);
  const remaining = Math.max(0, 100 - dynamicSum - floorStaticSum);
  const baseStatic = baseStaticRaw.map(r => ({
    matKey: r.matKey,
    pct: baseStaticBase > 0 ? (r.pct / baseStaticBase) * remaining : 0,
    dynamic: false,
    isFloor: false,
  }));

  // 5. 合併 + name/icon
  return [...dynamicRows, ...floorStatic, ...baseStatic].map(r => {
    const def = (typeof getMaterialDef === 'function' ? getMaterialDef(r.matKey) : null)
               || {name:r.matKey, icon:'?'};
    return {key:r.matKey, name:def.name, icon:def.icon, pct:r.pct,
            dynamic:r.dynamic, isFloor:r.isFloor};
  });
}

// 抽一次掉落,回傳 matKey(供 collectHunt 用)
function rollHuntDrop(s, floor, rarityMul){
  const rates = calcHuntDropRates(s, floor, rarityMul);
  const sumPct = rates.reduce((a,r)=>a+r.pct, 0);
  const roll = Math.random() * sumPct;  // 用實際 sum,floating-point safety
  let acc = 0;
  for(const r of rates){
    acc += r.pct;
    if(roll < acc) return r.key;
  }
  return rates[rates.length-1].key;
}

function fmtHuntRelTime(at){
  const diff = Date.now() - at;
  const mins = Math.floor(diff/60000);
  if(mins < 5)    return '剛才';
  if(mins < 60)   return mins + ' 分鐘前';
  const hours = Math.floor(mins/60);
  if(hours < 24)  return hours + ' 小時前';
  const days = Math.floor(hours/24);
  if(days < 7)    return days + ' 天前';
  return Math.floor(days/7) + ' 週前';
}

function isHuntRunning(){
  return !!(load().huntTimer?.running);
}

function calcHuntReward(ms){
  if(ms<HUNT_MIN_MS) return 0;
  return 5+Math.floor((ms-HUNT_MIN_MS)/(30*60*1000));
}

function renderHuntTimer(container){
  if(!container){
    const c1 = document.getElementById('ls-content-hunt');
    if(c1) renderHuntTimer(c1);
    return;
  }
  container.innerHTML = `
    <div class="lifeskill-page">
      <div class="hunt-action-section" id="hunt-action-section"></div>
      <div class="lifeskill-section-divider"></div>
      <div class="lifeskill-section-title">// 掉落預覽</div>
      <div class="hunt-droptable" id="hunt-droptable"></div>
      <div class="lifeskill-section-divider"></div>
      <div class="lifeskill-section-title">// 最近狩獵</div>
      <div class="hunt-history" id="hunt-history"></div>
    </div>`;
  _renderHuntAction();
  _renderHuntDropTable();
  _renderHuntHistory();
  if(load().huntTimer?.running) startHuntTick();
}

/* ════════════════ HUNT 準備頁(階段三:選樓層 + 選食物)════════════════ */
let _huntPrep = {open:false, floor:1, foodSelections:{}};

function openHuntPrep(){
  const s = load();
  const maxFloor = (typeof getMaxUnlockedFloor==='function') ? getMaxUnlockedFloor(s) : 1;
  _huntPrep = {open:true, floor: Math.min(_huntPrep.floor||1, maxFloor), foodSelections:{}};
  renderHuntPrep();
}

function closeHuntPrep(){
  _huntPrep = {open:false, floor:1, foodSelections:{}};
  const overlay = document.getElementById('hunt-prep-overlay');
  if(overlay) overlay.remove();
}

function huntPrepSelectFloor(f){
  _huntPrep.floor = f;
  renderHuntPrep();
}

function huntPrepFoodAdj(key, delta){
  const s = load();
  const owned = (s.bag?.items?.[key]) || 0;
  const cur = _huntPrep.foodSelections[key] || 0;
  const next = Math.max(0, Math.min(cur + delta, owned));
  if(next === 0) delete _huntPrep.foodSelections[key];
  else _huntPrep.foodSelections[key] = next;
  renderHuntPrep();
}

function confirmStartHunt(){
  const totalHours = calcFoodTotalHours(_huntPrep.foodSelections);
  if(totalHours <= 0){ showToast('// 至少要選 1 個食物'); return; }
  startHunt(_huntPrep.floor, _huntPrep.foodSelections);
}

function renderHuntPrep(){
  const page = document.getElementById('page-hunt');
  if(!page || !_huntPrep.open) return;
  let overlay = document.getElementById('hunt-prep-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'hunt-prep-overlay';
    overlay.className = 'hunt-prep-overlay';
    page.appendChild(overlay);
  }
  const s = load();
  const maxFloor = (typeof getMaxUnlockedFloor==='function') ? getMaxUnlockedFloor(s) : 1;
  const items = (s.bag && s.bag.items) || {};

  // 樓層選擇:1 ~ maxFloor 緊湊 grid
  const floors = [];
  for(let f=1; f<=maxFloor; f++) floors.push(f);
  const floorListHtml = `<div class="hunt-prep-floor-grid">${
    floors.map(f => `
      <div class="hunt-prep-floor-cell ${f===_huntPrep.floor?'active':''}"
           onclick="huntPrepSelectFloor(${f})">
        <span class="hunt-prep-floor-num">F${f}</span>
        ${FLOOR_HUNT_BONUS[f]?'<span class="hunt-prep-floor-mark">★</span>':''}
      </div>`).join('')
  }</div>`;

  // 食物選擇
  const huntableFoods = getHuntableFoods();
  const foodListHtml = huntableFoods.map(key => {
    const def = (typeof getConsumableDef==='function' ? getConsumableDef(key) : null) || {name:key, icon:'?'};
    const meta = HUNT_FOOD_META[key];
    const owned = items[key] || 0;
    const sel = _huntPrep.foodSelections[key] || 0;
    const buffStr = meta.rarityMul > 1 ? `稀有率 ×${meta.rarityMul}` : '無加成';
    return `<div class="hunt-prep-food-row${owned===0?' empty':''}">
      <span class="hunt-prep-food-icon">${def.icon}</span>
      <div class="hunt-prep-food-info">
        <div class="hunt-prep-food-name">${def.name}</div>
        <div class="hunt-prep-food-meta">${meta.hours}h · ${buffStr} · 持有 ${owned}</div>
      </div>
      <div class="hunt-prep-qty">
        <button class="hunt-prep-qty-btn" onclick="huntPrepFoodAdj('${key}', -1)" ${sel<=0?'disabled':''}>−</button>
        <span class="hunt-prep-qty-num">${sel}</span>
        <button class="hunt-prep-qty-btn" onclick="huntPrepFoodAdj('${key}', +1)" ${sel>=owned?'disabled':''}>+</button>
      </div>
    </div>`;
  }).join('');

  // 預覽:用選到的 floor + food rarityMul 算掉落
  const totalHours = calcFoodTotalHours(_huntPrep.foodSelections);
  const totalSel   = Object.values(_huntPrep.foodSelections).reduce((a,b)=>a+b,0);
  const previewMul = calcFoodRarityMul(_huntPrep.foodSelections);
  const previewRates = calcHuntDropRates(s, _huntPrep.floor, previewMul);
  const previewHtml = previewRates.map(r => `
    <div class="hunt-drop-row${r.dynamic?' luk':''}${r.isFloor?' floor':''}">
      <span class="hunt-drop-icon">${r.icon}</span>
      <span class="hunt-drop-name">${r.name}</span>
      <span class="hunt-drop-pct">${r.pct.toFixed(1)}%</span>
    </div>`).join('');

  const canStart = totalHours > 0;
  const lk = (s.character?.LUK) || 1;

  overlay.innerHTML = `
    <div class="hunt-prep-header">
      <span class="hunt-prep-back" onclick="closeHuntPrep()">‹ 返回</span>
      <span class="hunt-prep-title">// 狩獵準備</span>
    </div>
    <div class="hunt-prep-scroll">
      <div class="hunt-prep-section">
        <div class="hunt-prep-section-title">// 選擇樓層</div>
        ${floorListHtml}
        <div class="hunt-prep-floor-note">★ = 該層有特殊掉落</div>
      </div>
      <div class="hunt-prep-section">
        <div class="hunt-prep-section-title">// 選擇食物 ${totalSel>0?`(${totalSel} 個 = ${totalHours} 小時)`:''}</div>
        ${huntableFoods.length>0 ? foodListHtml : '<div class="hunt-prep-empty">// 沒有可用食物</div>'}
      </div>
      <div class="hunt-prep-section">
        <div class="hunt-prep-section-title">// 掉落預覽 ${previewMul>1?`<span style="color:var(--gold);">(食物加成 ×${previewMul.toFixed(2)})</span>`:''}</div>
        <div class="hunt-droptable">${previewHtml}<div class="hunt-drop-luk-note">F${_huntPrep.floor} · LUK ${lk}</div></div>
      </div>
    </div>
    <button class="hunt-prep-start ${canStart?'':'disabled'}"
            ${canStart?`onclick="confirmStartHunt()"`:'disabled'}>
      ${canStart ? `▶ 開始狩獵(${totalHours} 小時)` : '請選擇食物'}
    </button>
  `;
}

function _renderHuntAction(){
  const el = document.getElementById('hunt-action-section');
  if(!el) return;
  const s = load();
  const t = s.huntTimer || {running:false};
  const maxMs = t.maxMs || HUNT_MAX_MS;
  const elapsed = t.running ? Math.min(Date.now()-t.startAt, maxMs) : 0;
  const reward = calcHuntReward(elapsed);
  const pct = Math.min(100, (elapsed/maxMs)*100);
  const isReady = elapsed >= HUNT_MIN_MS;

  // 主次按鈕(階段四:用 lifeskill component)
  let primary, secondary = null;
  if(!t.running){
    primary = {label:'▶ 開始狩獵', onclick:'openHuntPrep()', state:''};
  } else if(isReady){
    primary   = {label:`✓ 收穫 +${reward} EXP`, onclick:'collectHunt()', state:'ready'};
    secondary = {label:'✕', onclick:'stopHunt()', title:'放棄'};
  } else {
    const remMin = Math.ceil((HUNT_MIN_MS - elapsed)/60000);
    primary   = {label:`⏱ 再等 ${remMin} 分鐘`, onclick:'', state:'waiting'};
    secondary = {label:'✕', onclick:'stopHunt()', title:'放棄'};
  }
  const btnsHtml = renderLifeSkillBtns(primary, secondary);

  // 動態刻度:ready (30min/maxMs) + 100%
  const readyPct = HUNT_MIN_MS / maxMs * 100;
  const tickHtml =
    `<div class="hunt-bar-tick ready" style="left:${Math.min(readyPct,100)}%;"></div>` +
    `<div class="hunt-bar-tick" style="left:100%;"></div>`;

  // 運行中資訊行(F{floor} · buff)
  const totalHours = Math.round(maxMs/3600000);
  const buffStr = (t.rarityMul && t.rarityMul > 1) ? ` · 食物 ×${t.rarityMul.toFixed(2)}` : '';
  const infoLine = t.running
    ? `<div class="hunt-info-line">F${t.floor||1} · 上限 ${totalHours}h${buffStr}</div>`
    : '';

  const statusText =
    !t.running ? '尚未開始' :
    isReady    ? `可收穫 +${reward} EXP` :
                 `需要 30 分鐘 · 已過 ${Math.floor(elapsed/60000)} 分鐘`;

  el.innerHTML = `
    <div class="hunt-time ${t.running?'running':''} ${isReady?'ready':''}">${t.running?fmtTime(elapsed):'--:--:--'}</div>
    <div class="hunt-status">${statusText}</div>
    ${infoLine}
    <div class="hunt-bar-wrap">
      <div class="hunt-bar ${t.running?'running':''}" style="width:${pct}%"></div>
      ${tickHtml}
    </div>
    ${btnsHtml}
  `;
}

function _renderHuntDropTable(){
  const el = document.getElementById('hunt-droptable');
  if(!el) return;
  const s = load();
  const t = s.huntTimer || {};
  const floor = t.running ? (t.floor||1) : 1;
  const mul   = t.running ? (t.rarityMul||1.0) : 1.0;
  const drops = calcHuntDropRates(s, floor, mul);
  const lk = (s.character?.LUK) || 1;
  const hasDynamic = drops.some(d => d.dynamic);
  const noteText = t.running
    ? `F${floor} · LUK ${lk}${mul>1?` · 食物加成 ×${mul.toFixed(2)}`:''}`
    : `LUK ${lk} · 影響高亮項目機率`;
  el.innerHTML = drops.map(d => `
    <div class="hunt-drop-row${d.dynamic?' luk':''}${d.isFloor?' floor':''}">
      <span class="hunt-drop-icon">${d.icon}</span>
      <span class="hunt-drop-name">${d.name}</span>
      <span class="hunt-drop-pct">${d.pct.toFixed(1)}%</span>
    </div>`).join('') + (hasDynamic ? `<div class="hunt-drop-luk-note">${noteText}</div>` : '');
}

function _renderHuntHistory(){
  const el = document.getElementById('hunt-history');
  if(!el) return;
  const s = load();
  const history = Array.isArray(s.huntHistory) ? s.huntHistory : [];
  if(history.length === 0){
    el.innerHTML = `<div class="hunt-history-empty">// 還沒有狩獵記錄</div>`;
    return;
  }
  el.innerHTML = history.map(h => {
    const dropChips = Object.entries(h.drops||{}).map(([k,v]) => {
      const def = (typeof getMaterialDef === 'function' ? getMaterialDef(k) : null)
                 || {name:k, icon:'?'};
      return `<span class="hunt-history-chip">${def.icon} ${def.name}×${v}</span>`;
    }).join('');
    return `
      <div class="hunt-history-row">
        <div class="hunt-history-line1">
          ${h.floor ? `<span class="hunt-history-floor">F${h.floor}</span>` : ''}
          <span class="hunt-history-time">${fmtHuntRelTime(h.at)}</span>
          <span class="hunt-history-dur">${fmtTime(h.ms)}</span>
          <span class="hunt-history-exp">+${h.exp} EXP</span>
        </div>
        <div class="hunt-history-line2">${dropChips || '<span style="opacity:.3;font-size:10px;">無收穫</span>'}</div>
      </div>`;
  }).join('');
}

function startHunt(floor, foodSelections){
  const s=initState();
  if(!s.bag) s.bag={};
  if(!s.bag.items) s.bag.items={};
  // 第一輪:檢查食物量足夠
  for(const [foodKey, count] of Object.entries(foodSelections||{})){
    if(count <= 0) continue;
    if((s.bag.items[foodKey]||0) < count){
      showToast(`// ${foodKey} 數量不足`); return;
    }
  }
  // 第二輪:扣食物
  for(const [foodKey, count] of Object.entries(foodSelections||{})){
    if(count <= 0) continue;
    s.bag.items[foodKey] -= count;
    if(s.bag.items[foodKey] <= 0) delete s.bag.items[foodKey];
  }
  const totalHours = calcFoodTotalHours(foodSelections);
  const rarityMul  = calcFoodRarityMul(foodSelections);
  const maxMs = totalHours * 60 * 60 * 1000;
  s.huntTimer={running:true, startAt:Date.now(), maxMs, rarityMul, floor};
  save(s);
  closeHuntPrep();
  updateHuntCellTime();
  renderHuntTimer();
  startHuntTick();
}

function stopHunt(){
  const s=initState();
  s.huntTimer={running:false, startAt:null};
  save(s);
  clearInterval(huntTimerInterval); huntTimerInterval=null;
  updateHuntCellTime(); _renderHuntAction();
}

function collectHunt(){
  const s=initState(); const t=s.huntTimer;
  if(!t?.running) return;
  const maxMs = t.maxMs || HUNT_MAX_MS;
  const elapsed = Math.min(Date.now()-t.startAt, maxMs);
  const reward=calcHuntReward(elapsed);
  if(reward<=0){ showToast('// 至少需要 30 分鐘'); return; }

  const floor = t.floor || 1;
  const rarityMul = t.rarityMul || 1.0;
  s.huntTimer={running:false, startAt:null};
  // 狩獵掉落:迴圈呼叫 rollHuntDrop,套樓層 + 食物加成
  const dropMap = {};
  for(let i=0; i<reward; i++){
    const matKey = rollHuntDrop(s, floor, rarityMul);
    bagAddMaterial(s, matKey, 1);
    dropMap[matKey] = (dropMap[matKey]||0) + 1;
  }
  addLifeExp(s, 'HUNT', reward*5);
  // 歷史紀錄(unshift,上限 20)
  if(!Array.isArray(s.huntHistory)) s.huntHistory=[];
  s.huntHistory.unshift({at: Date.now(), ms: elapsed, exp: reward*5, drops: dropMap, floor: floor});
  if(s.huntHistory.length > 20) s.huntHistory.length = 20;
  save(s);
  clearInterval(huntTimerInterval); huntTimerInterval=null;
  const dropCount = Object.values(dropMap).reduce((a,b)=>a+b,0);
  showToast(`// 狩獵完成 HUNT +${reward}${dropCount?` (+${dropCount}個物品)`:''}`);
  updateHuntCellTime();
  renderHuntTimer();   // 整頁重渲(history 多一筆、掉落表可能 LUK 變了也要重算)
  const _h = document.getElementById('ls-header-hunt');
  if(_h) renderLifeSkillHeader('HUNT', _h);
}

function updateHuntCellTime(){
  const el=document.getElementById('hunt-cell-time');
  if(!el) return;
  const s=load(); const t=s.huntTimer;
  if(t?.running){
    const elapsed=Math.min(Date.now()-t.startAt, HUNT_MAX_MS);
    el.textContent=fmtTime(elapsed);
    el.style.color=elapsed>=HUNT_MIN_MS?'#ffcc44':'#ff6644';
  } else {
    el.textContent='';
  }
}

function startHuntTick(){
  if(huntTimerInterval) return;
  huntTimerInterval=setInterval(()=>{
    const s=load();
    if(!s.huntTimer?.running){
      clearInterval(huntTimerInterval); huntTimerInterval=null;
      updateHuntCellTime();
      return;
    }
    if(Date.now()-s.huntTimer.startAt>=HUNT_MAX_MS){ collectHunt(); return; }
    _renderHuntAction(); updateHuntCellTime();
  }, 1000);
}


/* ════════════════ 4. 生活技能計時器(被動掛機)════════════════ */
const LIFE_TIMER_SKILLS=['HUNT','GATH','CRFT'];
const LIFE_TIMER_NAME={HUNT:'狩獵', GATH:'採集', CRFT:'製造'};
const LIFE_MAX_MS=24*60*60*1000;
const LIFE_MIN_MS=30*60*1000;
let lifeTimerInterval=null;

function calcLifeReward(ms){
  if(ms<LIFE_MIN_MS) return 0;
  const extra=Math.floor((ms-LIFE_MIN_MS)/(30*60*1000));
  return 5+extra;
}

function startLifeTimer(attr){
  const s=initState();
  if(!s.lifeTimers) s.lifeTimers={};
  if(s.lifeTimers[attr]?.running) return;
  s.lifeTimers[attr]={running:true, startAt:Date.now()};
  save(s);
  renderLifeTimers(); startLifeTimerTick();
}

function stopLifeTimer(attr){
  const s=initState();
  if(!s.lifeTimers?.[attr]?.running) return;
  s.lifeTimers[attr]={running:false, startAt:null};
  save(s);
  renderLifeTimers();
}

function collectLifeTimer(attr){
  const s=initState();
  const t=s.lifeTimers?.[attr];
  if(!t?.running) return;
  const elapsed=Date.now()-t.startAt;
  const reward=calcLifeReward(elapsed);
  if(reward<=0){ showToast('// 至少需要 30 分鐘'); return; }
  s.character[attr]=(s.character[attr]||0)+reward;
  s.lifeTimers[attr]={running:false, startAt:null};
  save(s);
  showToast(`// ${LIFE_TIMER_NAME[attr]} +${reward}`);
  renderLifeTimers();
  if(typeof renderStatus==='function') renderStatus();
}

function startLifeTimerTick(){
  if(lifeTimerInterval) return;
  lifeTimerInterval=setInterval(()=>{
    const s=load();
    const anyRunning=LIFE_TIMER_SKILLS.some(a=>s.lifeTimers?.[a]?.running);
    if(!anyRunning){
      clearInterval(lifeTimerInterval); lifeTimerInterval=null;
      return;
    }
    // 檢查是否超過 24hr 自動結算
    LIFE_TIMER_SKILLS.forEach(attr=>{
      const t=s.lifeTimers?.[attr];
      if(t?.running && Date.now()-t.startAt>=LIFE_MAX_MS){
        const reward=calcLifeReward(LIFE_MAX_MS);
        s.character[attr]=(s.character[attr]||0)+reward;
        s.lifeTimers[attr]={running:false, startAt:null};
        save(s);
        showToast(`// ${LIFE_TIMER_NAME[attr]} 已滿 24hr +${reward}`);
      }
    });
    renderLifeTimers();
  }, 1000);
}

function renderLifeTimers(){
  const s=load();
  const list=document.getElementById('life-timer-list');
  if(!list) return;
  list.innerHTML='';
  LIFE_TIMER_SKILLS.forEach(attr=>{
    const t=s.lifeTimers?.[attr]||{running:false};
    const elapsed=t.running?Math.min(Date.now()-t.startAt, LIFE_MAX_MS):0;
    const reward=calcLifeReward(elapsed);
    const pct=Math.min(100, (elapsed/LIFE_MAX_MS)*100);
    const isReady=elapsed>=LIFE_MIN_MS;
    const color=LIFE_COLOR[attr];

    const div=document.createElement('div');
    div.className=`life-timer-item lt-${attr}`;
    div.innerHTML=`
      <div class="life-timer-top">
        <div class="life-timer-name" style="color:${color}">${LIFE_TIMER_NAME[attr]}</div>
        <div class="life-timer-reward">${t.running?(isReady?`+${reward} 可收穫`:'未達 30 分鐘'):'未開始'}</div>
      </div>
      <div class="life-timer-display${isReady&&t.running?' ready':''}">${t.running?fmtTime(elapsed):'--:--'}</div>
      <div class="life-timer-bar-wrap">
        <div class="life-timer-bar" style="width:${pct}%;background:${color};box-shadow:0 0 6px ${color}66;"></div>
      </div>
      <div class="life-timer-btns">
        ${!t.running
          ?`<button class="lt-btn lt-btn-start" onclick="startLifeTimer('${attr}')">▶ 開始</button>`
          :`${isReady?`<button class="lt-btn lt-btn-collect" onclick="collectLifeTimer('${attr}')">✓ 收穫</button>`:''}
           <button class="lt-btn lt-btn-stop" onclick="stopLifeTimer('${attr}')">✕ 放棄</button>`
        }
      </div>`;
    list.appendChild(div);
  });
  // 如果有在跑的計時器,確保 tick 啟動
  if(LIFE_TIMER_SKILLS.some(a=>s.lifeTimers?.[a]?.running)) startLifeTimerTick();
}


/* ════════════════════════════════════════════════════════════════════════
 * Phase 5b 追加:挖礦 MINE 系統(掃雷玩法)
 *
 * 規則:9×16 格、23 顆地雷、可點擊翻開,長按 / 右鍵強挖。
 * 每天進入會延續同一份 mineState(date 比對 today())。
 * 長按炸彈 → 拿到礦物;長按安全格 → 沒收穫;短按炸彈 → 爆炸扣強挖次數。
 *
 * 依賴:initState / load / save(state.js+storage.js)、today / showToast(utils.js)、
 *        addLifeExp / bagAddMaterial(skills.js 上面已宣告)
 * ════════════════════════════════════════════════════════════════════════ */
const MINE_COLS=9, MINE_ROWS=16, MINE_BOMBS=23;

/* ════════════════ MINE 樓層礦池(階段二)════════════════
 * 加新層:在這裡多一個 floor entry。
 * 加新礦:items.js 的 MATERIAL_REGISTRY 加新 entry(source:['MINE']),這裡加 {matKey, pct, lvReq}
 * 規則:
 *   - 每層 entries 按 lvReq 由低到高排序(寫的時候保持順序)
 *   - pct 加總應 = 100
 *   - 玩家 roll 到某 entry 但 MINE Lv 不夠 → fallback 往上找(到能挖的最低 lvReq)
 *   - 全 table lvReq 都過高(理論上不會,F1 一定有 lvReq:1)→ 用 table[0].matKey 保底
 * ════════════════════════════════════════════════════════ */
const MINE_FLOOR_TABLE = {
  1:  [
    {matKey:'raw_iron',   pct:70, lvReq:1 },
    {matKey:'raw_silver', pct:25, lvReq:5 },
    {matKey:'gem_shard',  pct:5,  lvReq:10},
  ],
  3:  [
    {matKey:'raw_iron',   pct:55, lvReq:1 },
    {matKey:'raw_silver', pct:35, lvReq:5 },
    {matKey:'gem_shard',  pct:10, lvReq:10},
  ],
  5:  [
    {matKey:'raw_iron',   pct:40, lvReq:1 },
    {matKey:'raw_silver', pct:45, lvReq:5 },
    {matKey:'gem_shard',  pct:15, lvReq:10},
  ],
  10: [
    {matKey:'raw_iron',   pct:25, lvReq:1 },
    {matKey:'raw_silver', pct:40, lvReq:5 },
    {matKey:'gem_shard',  pct:25, lvReq:10},
    {matKey:'gold_ore',   pct:10, lvReq:15},
  ],
  // 加新層:在這加,例 15: [...]
};

// 取該層礦池(找不到 fallback F1)
function getMineFloorTable(floor){
  return MINE_FLOOR_TABLE[floor] || MINE_FLOOR_TABLE[1] || [];
}

// 抽一次礦物,套等級 fallback
function rollMineDrop(s, floor){
  const lv    = (s.lifeSkills?.MINE?.lv) || 1;
  const table = getMineFloorTable(floor);
  if(table.length === 0) return 'raw_iron';

  // 累積機率抽
  const roll = Math.random() * 100;
  let acc = 0, rolledIdx = table.length - 1;
  for(let i=0; i<table.length; i++){
    acc += table[i].pct;
    if(roll < acc){ rolledIdx = i; break; }
  }
  // 等級不夠 → 往低階 fallback
  while(rolledIdx >= 0 && table[rolledIdx].lvReq > lv) rolledIdx--;
  if(rolledIdx < 0) return table[0].matKey;  // 整層都門檻過高(理論上不會)
  return table[rolledIdx].matKey;
}

// 檢查首次發現 → 寫入 s.mineDiscovered + 回 boolean(是否首次)
function markMineDiscovered(s, matKey){
  if(!s.mineDiscovered) s.mineDiscovered={};
  if(s.mineDiscovered[matKey]) return false;
  s.mineDiscovered[matKey]=true;
  return true;
}

// 該層已發現多少 / 總共多少
function calcMineFloorDexCount(s, floor){
  const table = getMineFloorTable(floor);
  const disc = s.mineDiscovered || {};
  return {
    found: table.filter(e => disc[e.matKey]).length,
    total: table.length,
  };
}

function getMineState(floor){
  if(!floor) return null;
  const s=load();
  const st = s.mineStates && s.mineStates[floor];
  if(!st) return null;
  if(st.date !== today()) return null;  // 跨日 reset
  return st;
}

function initMineState(floor){
  const total=MINE_COLS*MINE_ROWS;
  const bombs=new Set();
  while(bombs.size<MINE_BOMBS) bombs.add(Math.floor(Math.random()*total));
  const cells=Array.from({length:total}, (_,i)=>bombs.has(i)?-1:0);
  // 計算數字
  for(let i=0; i<total; i++){
    if(cells[i]===-1) continue;
    let count=0;
    const r=Math.floor(i/MINE_COLS), c=i%MINE_COLS;
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      const nr=r+dr, nc=c+dc;
      if(nr>=0 && nr<MINE_ROWS && nc>=0 && nc<MINE_COLS && cells[nr*MINE_COLS+nc]===-1) count++;
    }
    cells[i]=count;
  }
  const zeroCells=cells.map((_,i)=>i).filter(i=>cells[i]===0);
  const safeCells=cells.map((_,i)=>i).filter(i=>cells[i]!==-1);
  const hintPool=zeroCells.length>0?zeroCells:safeCells;
  const safeHint=hintPool[Math.floor(Math.random()*hintPool.length)];
  const state={
    floor, date:today(), cells,
    revealed:new Array(total).fill(false),
    exploded:new Array(total).fill(false),
    mined   :new Array(total).fill(false),
    digLeft:MINE_BOMBS, done:false, safeHint,
  };
  const s=load();
  if(!s.mineStates) s.mineStates={};
  s.mineStates[floor]=state;
  save(s);
  return state;
}

function saveMineState(state){
  const s=load();
  if(!s.mineStates) s.mineStates={};
  s.mineStates[state.floor]=state;
  save(s);
}

/* ════════════════ MINE 準備頁(階段二:選樓層 + 礦物圖鑑)════════════════ */
let _minePrep = {previewFloor:null};

function selectMineFloor(floor){
  const s=initState();
  s.mineCurrentFloor=floor;
  if(!s.mineStates) s.mineStates={};
  // 跨日 reset:state 是昨天的 → 清掉
  if(s.mineStates[floor] && s.mineStates[floor].date !== today()){
    delete s.mineStates[floor];
  }
  save(s);
  // 確保該層 state 存在(initMineState 會寫回 storage)
  if(!getMineState(floor)) initMineState(floor);
  // 移除 overlay 並重渲挖礦頁
  const overlay=document.getElementById('mine-prep-overlay');
  if(overlay) overlay.remove();
  _minePrep.previewFloor=null;
  renderMineGame();
}

function _renderMinePrepPage(){
  const page=document.getElementById('page-mine');
  if(!page) return;
  let overlay=document.getElementById('mine-prep-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='mine-prep-overlay';
    overlay.className='mine-prep-overlay';
    page.appendChild(overlay);
  }
  const s=load();
  const maxFloor=(typeof getMaxUnlockedFloor==='function') ? getMaxUnlockedFloor(s) : 1;
  const lv=(s.lifeSkills?.MINE?.lv) || 1;
  const selectedFloor=_minePrep.previewFloor || s.mineCurrentFloor || 1;

  // 樓層 grid
  const floors=[];
  for(let f=1; f<=maxFloor; f++) floors.push(f);
  const floorListHtml=`<div class="mine-prep-floor-grid">${
    floors.map(f => {
      const hasTable=!!MINE_FLOOR_TABLE[f];
      const dex=calcMineFloorDexCount(s, f);
      const cls=['mine-prep-floor-cell',
                 f===selectedFloor ? 'active' : '',
                 hasTable ? '' : 'no-table'].filter(Boolean).join(' ');
      return `<div class="${cls}" onclick="_minePrep.previewFloor=${f};_renderMinePrepPage()">
        <span class="mine-prep-floor-num">F${f}</span>
        ${hasTable ? `<span class="mine-prep-floor-dex">${dex.found}/${dex.total}</span>` : ''}
      </div>`;
    }).join('')
  }</div>`;

  // 礦物圖鑑(該層礦池)
  const table=getMineFloorTable(selectedFloor);
  const disc=s.mineDiscovered || {};
  const dexHtml=`<div class="mine-prep-dex-grid">${
    table.map(e => {
      const def=(typeof getMaterialDef==='function' ? getMaterialDef(e.matKey) : null) || {name:e.matKey, icon:'?', rarity:'common'};
      const found=!!disc[e.matKey];
      const lvOk=lv >= e.lvReq;
      const cls=['mine-prep-dex-cell',
                 found ? 'found' : 'unknown',
                 !lvOk ? 'lv-locked' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}">
        <span class="mine-prep-dex-icon">${found ? def.icon : '?'}</span>
        <span class="mine-prep-dex-name">${found ? def.name : '???'}</span>
        <span class="mine-prep-dex-meta">${found ? `Lv.${e.lvReq}+ · ${e.pct}%` : `Lv.${e.lvReq}+`}${!lvOk?' 🔒':''}</span>
      </div>`;
    }).join('')
  }</div>`;

  // 進入挖礦按鈕(進準備頁時必然是「未選 / 跨日 reset」狀態,永遠顯示「進入」)
  const btnHtml=`<button class="lifeskill-btn-primary" onclick="selectMineFloor(${selectedFloor})">▶ 進入 F${selectedFloor}</button>`;

  overlay.innerHTML=`
    <div class="mine-prep-header">
      <span class="mine-prep-title">// 挖礦準備</span>
    </div>
    <div class="mine-prep-scroll">
      <div class="mine-prep-section">
        <div class="lifeskill-section-title">// 選擇樓層</div>
        ${floorListHtml}
        <div class="mine-prep-floor-note">數字 = 該層已發現/總礦種</div>
      </div>
      <div class="mine-prep-section">
        <div class="lifeskill-section-title">// F${selectedFloor} 礦物圖鑑 (MINE Lv.${lv})</div>
        ${table.length>0 ? dexHtml : '<div class="mine-prep-empty">// 該層尚未配置礦池</div>'}
      </div>
    </div>
    <div class="mine-prep-bottom">${btnHtml}</div>
  `;
}

function renderMineGame(container){
  if(!container){
    const c1=document.getElementById('ls-content-mine');
    if(c1) renderMineGame(c1);  // 不再用 querySelector('.mine-wrap') 守門,因為主頁可能在準備頁狀態
    return;
  }
  // 沒選過 / 跨日 reset → 進準備頁
  const s=load();
  const cf=s.mineCurrentFloor;
  const cfState=cf ? (s.mineStates && s.mineStates[cf]) : null;
  const validToday=cfState && cfState.date === today();
  if(!cf || !validToday){
    _renderMinePrepPage();
    return;
  }
  const floor=cf;
  let state=getMineState(floor);
  if(!state) state=initMineState(floor);
  const bombsLeft=state.cells.filter((_,i)=>state.cells[i]===-1 && !state.exploded[i] && !state.mined[i]).length;
  const dex=calcMineFloorDexCount(s, floor);

  container.innerHTML=`
    <div class="mine-wrap lifeskill-page">
      <div class="mine-statbar">
        <div class="mine-statbar-row1">
          <span class="mine-stat-floor">F${floor}</span>
          <span class="mine-stat-dex">已發現 <span class="mine-stat-dex-num">${dex.found}</span>/<span class="mine-stat-dex-total">${dex.total}</span></span>
        </div>
        <div class="mine-statbar-row2">
          <div class="mine-stat-item mine-stat-bombs">
            <span class="mine-stat-icon">💣</span>
            <span class="mine-stat-label">剩餘礦物</span>
            <span class="mine-stat-num">${bombsLeft}</span>
          </div>
          <div class="mine-stat-item mine-stat-digs">
            <span class="mine-stat-icon">⛏</span>
            <span class="mine-stat-label">強挖次數</span>
            <span class="mine-stat-num" style="color:${state.digLeft>0?'var(--cyan)':'var(--red)'};">${state.digLeft}</span>
          </div>
        </div>
      </div>
      ${state.done
        ? `<div class="mine-done">
             <div class="mine-done-icon">⛏</div>
             <div class="mine-done-title">F${floor} 已挖完</div>
             <div class="mine-done-sub">明天再來</div>
           </div>`
        : `<div class="mine-grid" id="mine-grid"></div>`}
    </div>`;
  if(!state.done) renderMineGrid(state, container);
}

function renderMineGrid(state, container){
  const grid=(container||document).querySelector('#mine-grid,.mine-grid');
  if(!grid) return;
  const numColors=['','#4488ff','#44bb44','#ff4444','#8844ff','#ff8800','#44bbbb','#888','#aaa'];
  grid.innerHTML='';
  state.cells.forEach((val, i)=>{
    const cell=document.createElement('div');
    if(state.exploded[i]){
      cell.className='mine-cell exploded';
      cell.textContent='💥';
    } else if(state.mined[i]){
      cell.className='mine-cell mined';
      cell.textContent='💎';
    } else if(state.revealed[i]){
      cell.className='mine-cell revealed';
      cell.textContent=val>0?val:'';
      if(val>0) cell.style.color=numColors[val]||'#fff';
    } else {
      cell.className='mine-cell hidden';
      // 安全提示格
      if(i===state.safeHint){
        cell.style.borderColor='rgba(0,255,150,.5)';
        cell.style.background ='rgba(0,255,150,.05)';
        cell.textContent='✓';
        cell.style.color='rgba(0,255,150,.4)';
        cell.style.fontSize='10px';
      }
      // 短按翻開
      cell.onclick=()=>mineTap(i);
      // 長按強挖(觸控)
      let pressTimer=null;
      cell.addEventListener('touchstart', ()=>{ pressTimer=setTimeout(()=>{ pressTimer=null; mineLongPress(i); }, 500); }, {passive:true});
      cell.addEventListener('touchend',   ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } });
      cell.addEventListener('touchmove',  ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } });
      // 滑鼠右鍵也可長按
      cell.oncontextmenu=(e)=>{ e.preventDefault(); mineLongPress(i); };
    }
    grid.appendChild(cell);
  });
}

function mineTap(i){
  const s=load();
  const floor=s.mineCurrentFloor || 1;
  let state=getMineState(floor); if(!state || state.done) return;
  if(state.revealed[i] || state.exploded[i] || state.mined[i]) return;
  state.revealed[i]=true;
  if(state.cells[i]===-1){
    // 踩炸彈 → 爆炸,扣強挖次數
    state.exploded[i]=true;
    state.digLeft=Math.max(0, state.digLeft-1);
    if(state.digLeft===0) state.done=true;
    showToast('// 💥 踩到炸彈!強挖 -1');
  } else if(state.cells[i]===0){
    mineFlood(state, i);
  }
  saveMineState(state);
  renderMineGame();
}

function mineLongPress(i){
  const s0=load();
  const floor=s0.mineCurrentFloor || 1;
  let state=getMineState(floor); if(!state || state.done) return;
  if(state.revealed[i] || state.exploded[i] || state.mined[i]) return;
  if(state.digLeft<=0){ showToast('// 今日強挖次數已用完'); return; }
  state.digLeft--;
  state.revealed[i]=true;
  if(state.cells[i]===-1){
    // 強挖炸彈 → 挖到礦物!
    state.mined[i]=true;
    state.revealed[i]=false;
    const ms=initState();
    const mKey=rollMineDrop(ms, floor);
    const def=(typeof getMaterialDef==='function' ? getMaterialDef(mKey) : null) || {name:mKey, icon:'?'};
    bagAddMaterial(ms, mKey, 1);
    // EXP 對照(common=5, rare=20, epic=50)— 從 MATERIAL_REGISTRY 的 rarity 推
    const rarity=def.rarity || 'common';
    const mineExp=rarity==='epic' ? 50 : rarity==='rare' ? 20 : 5;
    addLifeExp(ms, 'MINE', mineExp);
    const isNew=markMineDiscovered(ms, mKey);
    save(ms);
    showToast(isNew
      ? `// ✦ 新礦物!${def.icon} ${def.name}!MINE EXP +${mineExp}`
      : `// ${def.icon} 挖到 ${def.name}!MINE EXP +${mineExp}`);
  } else {
    showToast('// 什麼都沒有...');
  }
  if(state.digLeft===0) state.done=true;
  saveMineState(state);
  renderMineGame();
  const _h=document.getElementById('ls-header-mine');
  if(_h) renderLifeSkillHeader('MINE', _h);
}

function mineFlood(state, i){
  const r=Math.floor(i/MINE_COLS), c=i%MINE_COLS;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
    const nr=r+dr, nc=c+dc;
    if(nr>=0 && nr<MINE_ROWS && nc>=0 && nc<MINE_COLS){
      const ni=nr*MINE_COLS+nc;
      if(!state.revealed[ni] && !state.exploded[ni] && !state.mined[ni]){
        state.revealed[ni]=true;
        if(state.cells[ni]===0) mineFlood(state, ni);
      }
    }
  }
}


/* ════════════════════════════════════════════════════════════════════════
 * Phase 5b 追加:烹飪 COOK 系統(相機 → tag → 合成 → 卡片)
 *
 * 流程:capture(拍照)→ tag(選食材標籤)→ synth(orb 動畫)→ done(卡片+寫背包)
 *
 * 依賴:initState / load / save、addLifeExp / bagAddItem(skills.js 上面)
 * ════════════════════════════════════════════════════════════════════════ */
const COOK_TAGS=[
  {id:'rice',  label:'飯',   icon:'🍚', color:'#ffcc88', log:'[SYSTEM] 偵測到碳水化合物數據...'},
  {id:'noodle',label:'麵',   icon:'🍜', color:'#ffaa44', log:'[SYSTEM] 偵測到澱粉纖維結構...'},
  {id:'veg',   label:'菜',   icon:'🥦', color:'#88dd44', log:'[SYSTEM] 偵測到纖維素來源...'},
  {id:'meat',  label:'肉',   icon:'🥩', color:'#ff6644', log:'[SYSTEM] 偵測到蛋白質數據...'},
  {id:'bean',  label:'豆',   icon:'🫘', color:'#cc9955', log:'[SYSTEM] 偵測到植物性蛋白...'},
  {id:'fruit', label:'水果', icon:'🍊', color:'#ff8833', log:'[SYSTEM] 偵測到維生素複合體...'},
];
const COOK_ITEM_NAMES=['能量補給','活力料理','鮮食套餐','精製便當','特製料理','滿足全餐'];
// cookState 已搬到存檔(s.cook),這裡留 helper 從 state 讀取(selected 是 Array 不是 Set)
function _getCookState(){
  const s=load();
  if(!s.cook) s.cook={phase:'capture', photoUrl:null, selected:[], log:[], itemName:null};
  return s.cook;
}

function renderCookGame(container){
  if(!container){
    const c1=document.getElementById('ls-content-cook');
    if(c1 && c1.querySelector('.cook-wrap,.cook-card,.cook-synth')) renderCookGame(c1);
    return;
  }
  const cookState=_getCookState();

  if(cookState.phase==='capture'){
    container.innerHTML=`<div class="cook-wrap lifeskill-page">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-sub);letter-spacing:1px;">// 拍下今天的料理</div>
      <div class="cook-camera-btn" onclick="document.getElementById('cook-file-input').click()">
        <div class="cook-camera-icon">📷</div>
        <div class="cook-camera-label">CAPTURE</div>
      </div>
      <input type="file" id="cook-file-input" accept="image/*" capture style="display:none" onchange="onCookPhoto(event)"/>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);letter-spacing:1px;text-align:center;">點擊相機圖示拍攝今日料理</div>
    </div>`;
    return;
  }

  if(cookState.phase==='tag'){
    const tagBtns=COOK_TAGS.map(t=>`
      <button class="cook-tag-btn${cookState.selected.includes(t.id)?' selected':''}"
        style="border-color:${t.color}88;color:${t.color};"
        onclick="toggleCookTag('${t.id}')">
        <div class="cook-tag-icon">${t.icon}</div>
        <div>${t.label}</div>
      </button>`).join('');
    const logHTML=cookState.log.map((l, i)=>`<div class="cook-log-line" style="animation-delay:${i*0.1}s">${l}</div>`).join('');
    container.innerHTML=`<div class="cook-wrap lifeskill-page">
      <img class="cook-photo-preview" src="${cookState.photoUrl}" alt="meal"/>
      <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,136,170,.7);letter-spacing:2px;">[SYSTEM] 請標記食材組成</div>
      <div class="cook-tags">${tagBtns}</div>
      <div class="cook-log" id="cook-log">${logHTML}</div>
      ${cookState.selected.length>0 ? renderLifeSkillBtns({label:'// SYNTHESIZE', onclick:'startCookSynth()', state:''}, null) : ''}
    </div>`;
    return;
  }

  if(cookState.phase==='synth'){
    container.innerHTML=`<div class="cook-wrap lifeskill-page">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);letter-spacing:2px;">[SYSTEM] 合成中...</div>
      <div class="cook-orb"></div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-sub);letter-spacing:1px;">// 正在生成道具數據</div>
    </div>`;
    setTimeout(()=>completeCookSynth(container), 2000);
    return;
  }

  if(cookState.phase==='done'){
    const tags=cookState.selected.map(id=>COOK_TAGS.find(t=>t.id===id));
    const rarities=[
      {name:'COMMON',  color:'#aaa'},
      {name:'UNCOMMON',color:'#44dd44'},
      {name:'RARE',    color:'#44aaff'},
      {name:'EPIC',    color:'#aa55ff'},
    ];
    const rarity=rarities[Math.min(tags.length-1, 3)];
    container.innerHTML=`<div class="cook-wrap lifeskill-page">
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--cyan);letter-spacing:2px;">[SYSTEM] 道具生成完畢</div>
      <div class="cook-card">
        <img class="cook-card-photo" src="${cookState.photoUrl}" alt="meal"/>
        <div class="cook-card-overlay"></div>
        <div class="cook-card-info">
          <div class="cook-card-name">${cookState.itemName}</div>
          <div class="cook-card-tags">${tags.map(t=>t.icon+t.label).join(' ')}</div>
          <div class="cook-card-rarity" style="color:${rarity.color};">◆ ${rarity.name}</div>
        </div>
      </div>
      ${renderLifeSkillBtns({label:'// 重新烹飪', onclick:'resetCook()', state:''}, null)}
    </div>`;
  }
}

function onCookPhoto(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const s=load();
    if(!s.cook) s.cook={};
    s.cook.photoUrl=ev.target.result;
    s.cook.phase='tag';
    s.cook.selected=[];
    s.cook.log=[];
    save(s);
    renderCookGame();
  };
  reader.readAsDataURL(file);
}

function toggleCookTag(id){
  const s=load();
  if(!s.cook) s.cook={phase:'tag', photoUrl:null, selected:[], log:[], itemName:null};
  const arr=s.cook.selected||[];
  const idx=arr.indexOf(id);
  if(idx>=0){
    s.cook.selected=arr.filter(x=>x!==id);
  } else {
    arr.push(id);
    s.cook.selected=arr;
    const tag=COOK_TAGS.find(t=>t.id===id);
    if(tag) (s.cook.log=s.cook.log||[]).push(tag.log);
  }
  save(s);
  renderCookGame();
  // 自動滾到底
  setTimeout(()=>{ const l=document.getElementById('cook-log'); if(l) l.scrollTop=l.scrollHeight; }, 50);
}

function startCookSynth(){
  const s=load();
  if(!s.cook) s.cook={};
  s.cook.phase='synth';
  s.cook.itemName=COOK_ITEM_NAMES[Math.floor(Math.random()*COOK_ITEM_NAMES.length)];
  save(s);
  renderCookGame();
}

function completeCookSynth(container){
  const cs=initState();
  if(!cs.cook) cs.cook={};
  cs.cook.phase='done';
  // 依 tag 數寫入食物到背包
  const tagCount=(cs.cook.selected||[]).length;
  const foodKey=tagCount>=2?'stew':'bread';
  const foodExp=tagCount>=3?20:tagCount===2?12:6;
  bagAddItem(cs, foodKey, 1);
  addLifeExp(cs, 'COOK', foodExp);
  save(cs);
  renderCookGame(container);
}

function resetCook(){
  const s=load();
  s.cook={phase:'capture', photoUrl:null, selected:[], log:[], itemName:null};
  save(s);
  renderCookGame();
}



/* ════════════════════════════════════════════════════════════════════════
 * 採集系統 (GATH) — 農田玩法
 *
 * 設計:
 *   - s.farm.plots[] 固定 9 格(3×3),每格 {seedKey, plantedAt, locked}
 *   - 解鎖規則 farmUnlockedPlots(lv):Lv1=4 / Lv5=6 / Lv15=7 / Lv30=8 / Lv50=9
 *   - 成長以 plantedAt + seed.growthMs 對 Date.now() 計算,離線也持續
 *   - 採收必須手動點擊;成熟 plot 視覺發光提示
 *   - 種子 = matCategory:'seed' 的 material(共用 bag/market/shop 流程)
 *
 * 內容:
 *   - farmUnlockedPlots(lv) / _ensureFarm(s) / _syncFarmLocks(s)
 *   - plotPhase / plotProgressPct / plotPhaseIcon / plotRemainingMs
 *   - 種子彈窗 openSeedPicker / closeSeedPicker / plantSeed
 *   - 採收 harvestPlot
 *   - 主入口 renderFarm(container) + 1Hz tick _startFarmInterval
 * ════════════════════════════════════════════════════════════════════════ */

function farmUnlockedPlots(lv){
  if(lv >= 50) return 9;
  if(lv >= 30) return 8;
  if(lv >= 15) return 7;
  if(lv >= 5)  return 6;
  return 4;
}

function _ensureFarm(s){
  if(!s.farm) s.farm = {plots:[]};
  if(!Array.isArray(s.farm.plots) || s.farm.plots.length !== 9){
    s.farm.plots = Array.from({length:9}, ()=>({seedKey:null, plantedAt:null, locked:false}));
  }
  _syncFarmLocks(s);
  return s.farm;
}

function _syncFarmLocks(s){
  if(!s.farm || !Array.isArray(s.farm.plots)) return;
  const lv = (s.lifeSkills?.GATH?.lv) || 1;
  const unlocked = farmUnlockedPlots(lv);
  s.farm.plots.forEach((p, i) => { p.locked = (i >= unlocked); });
}

function plotPhase(plot){
  if(!plot || plot.locked) return 'locked';
  if(!plot.seedKey || !plot.plantedAt) return 'empty';
  const def = getSeedDef(plot.seedKey);
  if(!def) return 'empty';
  const elapsed = Date.now() - plot.plantedAt;
  return elapsed >= def.growthMs ? 'ripe' : 'growing';
}

function plotProgressPct(plot){
  if(!plot || !plot.seedKey || !plot.plantedAt) return 0;
  const def = getSeedDef(plot.seedKey);
  if(!def) return 0;
  const elapsed = Date.now() - plot.plantedAt;
  return Math.min(100, (elapsed / def.growthMs) * 100);
}

function plotPhaseIcon(plot){
  const def = getSeedDef(plot.seedKey);
  if(!def) return '🌱';
  const pct = plotProgressPct(plot);
  const i = pct >= 100 ? 3 : pct >= 66 ? 2 : pct >= 33 ? 1 : 0;
  return def.growthIcons[i] || '🌱';
}

function plotRemainingMs(plot){
  if(!plot || !plot.seedKey || !plot.plantedAt) return 0;
  const def = getSeedDef(plot.seedKey);
  if(!def) return 0;
  return Math.max(0, def.growthMs - (Date.now() - plot.plantedAt));
}

function _fmtFarmTime(ms){
  if(ms <= 0) return '00:00';
  const total = Math.ceil(ms/1000);
  const m = Math.floor(total/60);
  const s = total % 60;
  return (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
}


/* ── 種子彈窗 ── */
let _seedPickerPlotIdx = null;

function openSeedPicker(plotIdx){
  _seedPickerPlotIdx = plotIdx;
  _renderSeedPicker();
}

function closeSeedPicker(){
  _seedPickerPlotIdx = null;
  const overlay = document.getElementById('farm-seed-picker');
  if(overlay) overlay.remove();
}

function _renderSeedPicker(){
  const page = document.getElementById('page-gath');
  if(!page || _seedPickerPlotIdx === null) return;
  let overlay = document.getElementById('farm-seed-picker');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'farm-seed-picker';
    overlay.className = 'farm-seed-picker';
    overlay.onclick = (e) => { if(e.target === overlay) closeSeedPicker(); };
    page.appendChild(overlay);
  }
  const s = load();
  const mats = s.bag?.materials || {};
  const cards = SEED_REGISTRY.map(seed => {
    const stock = mats[seed.key] || 0;
    const def = getMaterialDef(seed.key) || {name:seed.name, icon:seed.icon};
    const dim = stock <= 0 ? ' empty' : '';
    const onclick = stock > 0 ? `onclick="plantSeed(${_seedPickerPlotIdx},'${seed.key}')"` : '';
    return `<div class="farm-seed-card${dim}" ${onclick}>
      <div class="farm-seed-card-icon">${seed.icon}</div>
      <div class="farm-seed-card-name">${def.name}</div>
      <div class="farm-seed-card-meta">⏱ ${_fmtFarmTime(seed.growthMs)} · 持有 ${stock}</div>
    </div>`;
  }).join('');
  overlay.innerHTML = `
    <div class="farm-seed-panel" onclick="event.stopPropagation()">
      <div class="farm-seed-header">
        <span class="farm-seed-title">// 選擇種子</span>
        <span class="farm-seed-close" onclick="closeSeedPicker()">✕</span>
      </div>
      <div class="farm-seed-grid">${cards}</div>
      <div class="farm-seed-hint">沒種子？去打獵 / 寶箱 / 商店找</div>
    </div>`;
}

function plantSeed(plotIdx, seedKey){
  const s = initState();
  _ensureFarm(s);
  const plot = s.farm.plots[plotIdx];
  if(!plot || plot.locked) return;
  if(plot.seedKey){ showToast('// 該格已有作物'); return; }
  const stock = (s.bag?.materials?.[seedKey]) || 0;
  if(stock <= 0){ showToast('// 種子不足'); return; }
  const def = getSeedDef(seedKey);
  if(!def){ showToast('// 未知種子'); return; }
  s.bag.materials[seedKey] = stock - 1;
  if(s.bag.materials[seedKey] <= 0) delete s.bag.materials[seedKey];
  plot.seedKey = seedKey;
  plot.plantedAt = Date.now();
  save(s);
  closeSeedPicker();
  showToast('// 種下 ' + def.name);
  renderFarm();
}

function harvestPlot(plotIdx){
  const s = initState();
  _ensureFarm(s);
  const plot = s.farm.plots[plotIdx];
  if(!plot || plotPhase(plot) !== 'ripe') return;
  const def = getSeedDef(plot.seedKey);
  if(!def){ plot.seedKey = null; plot.plantedAt = null; save(s); renderFarm(); return; }
  const out = def.output;
  const qty = out.min + Math.floor(Math.random() * (out.max - out.min + 1));
  bagAddMaterial(s, out.matKey, qty);
  addLifeExp(s, 'GATH', def.gathExp);
  plot.seedKey = null;
  plot.plantedAt = null;
  save(s);
  const matDef = getMaterialDef(out.matKey) || {name:out.matKey, icon:'🌿'};
  showToast('// 採收 ' + matDef.name + ' ×' + qty);
  renderFarm();
  // 同步 GATH header(升等時 Lv/EXP 數字即時更新)
  const _h = document.getElementById('ls-header-gath');
  if(_h && typeof renderLifeSkillHeader === 'function') renderLifeSkillHeader('GATH', _h);
}


/* ── 主渲染 ── */
function renderFarm(container){
  if(!container){
    const c1 = document.getElementById('ls-content-gath');
    if(c1) renderFarm(c1);
    return;
  }
  const s = initState();
  _ensureFarm(s);
  save(s);
  const lv = (s.lifeSkills?.GATH?.lv) || 1;
  const unlocked = farmUnlockedPlots(lv);
  const planted = s.farm.plots.filter(p => p.seedKey).length;

  const plotsHtml = s.farm.plots.map((p, i) => {
    const phase = plotPhase(p);
    if(phase === 'locked'){
      const nextLv = i < 6 ? 5 : i < 7 ? 15 : i < 8 ? 30 : 50;
      return `<div class="farm-plot locked">
        <div class="farm-plot-icon">🔒</div>
        <div class="farm-plot-meta">Lv ${nextLv}</div>
      </div>`;
    }
    if(phase === 'empty'){
      return `<div class="farm-plot empty" onclick="openSeedPicker(${i})">
        <div class="farm-plot-icon">＋</div>
      </div>`;
    }
    const icon = plotPhaseIcon(p);
    if(phase === 'ripe'){
      return `<div class="farm-plot ripe" onclick="harvestPlot(${i})">
        <div class="farm-plot-icon">${icon}</div>
        <div class="farm-plot-meta">✓ 採收</div>
      </div>`;
    }
    const pct = plotProgressPct(p);
    const remain = _fmtFarmTime(plotRemainingMs(p));
    return `<div class="farm-plot growing">
      <div class="farm-plot-icon">${icon}</div>
      <div class="farm-progress"><div class="farm-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="farm-plot-meta">${remain}</div>
    </div>`;
  }).join('');

  const mats = s.bag?.materials || {};
  const seedChips = SEED_REGISTRY
    .filter(seed => (mats[seed.key] || 0) > 0)
    .map(seed => `<span class="farm-seed-chip">${seed.icon} ${seed.name.replace('種子','')} ×${mats[seed.key]}</span>`)
    .join('');

  container.innerHTML = `
    <div class="farm-wrap lifeskill-page">
      <div class="farm-stats-bar">
        <span class="farm-stat-unlock">${unlocked}/9 已解鎖</span>
        <span class="farm-stat-planted">種了 ${planted} 格</span>
      </div>
      <div class="farm-grid">${plotsHtml}</div>
      <div class="lifeskill-section-title">// 種子庫存</div>
      <div class="farm-seed-stock">${seedChips || '<span class="farm-seed-empty">// 沒有種子,去打獵 / 寶箱 / 商店找</span>'}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button onclick="(()=>{const s=initState();_ensureFarm(s);s.farm.plots.forEach(p=>{if(p.seedKey&&p.plantedAt)p.plantedAt=Date.now()-24*60*60*1000;});save(s);renderFarm();})()" style="flex:1;padding:4px;font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.06);background:transparent;cursor:pointer;">[DEV] 全部成熟</button>
        <button onclick="(()=>{const s=initState();if(!s.lifeSkills)s.lifeSkills={};s.lifeSkills.GATH={lv:Math.min(100,(s.lifeSkills.GATH?.lv||1)+5),exp:0};_syncFarmLocks(s);save(s);const _h=document.getElementById('ls-header-gath');if(_h&&typeof renderLifeSkillHeader==='function')renderLifeSkillHeader('GATH',_h);renderFarm();})()" style="flex:1;padding:4px;font-family:var(--font-mono);font-size:8px;color:rgba(255,220,80,.3);border:1px solid rgba(255,220,80,.1);background:transparent;cursor:pointer;">[DEV] +Lv5</button>
      </div>
    </div>`;
  _startFarmInterval();
}


/* ── 1Hz tick(同 CRFT queue 套路:有事才跑、自動停)── */
let _farmInterval = null;

function _startFarmInterval(){
  if(_farmInterval) return;
  _farmInterval = setInterval(()=>{
    const s = load();
    const hasGrowing = (s.farm?.plots || []).some(p => {
      if(!p.seedKey || !p.plantedAt) return false;
      const def = getSeedDef(p.seedKey);
      if(!def) return false;
      return (Date.now() - p.plantedAt) < def.growthMs;
    });
    if(!hasGrowing){ clearInterval(_farmInterval); _farmInterval = null; return; }
    const wrap = document.querySelector('.farm-wrap');
    if(wrap) renderFarm(document.getElementById('ls-content-gath'));
  }, 1000);
}





/* ════════════════════════════════════════════════════════════════════════
 * Phase 5b 追加:製造 CRFT 系統(武器 / 裝備 / 藥水)
 *
 * 三大子系統:
 *   - 武器 weapon:9 種武器各有 blade/grip 兩部位,每部位需要不同數量的素材
 *   - 裝備 armor:7 大部位(頭/胸/褲/靴/主/副/飾品),飾品有 10 種子類
 *   - 藥水 potion:base + effect[] + modifier[] 的合成系統
 *
 * 內容:
 *   - 狀態變數 crftTab / crftWeaponType / crftSlots / crftCurrentPart /
 *               crftAccType / crftArmorSlots / crftCurrentMode / crftArmorType /
 *               crftPotionSlots / crftPotionPickTarget
 *   - 常數 CRFT_ACC_PARTS(飾品子類型,僅 craft 用)/ CRFT_TAB_LABELS
 *     (物品 def — WEAPON_TYPES / ARMOR_TYPES / MATERIAL_REGISTRY / RARITY_COLOR
 *      — 全部在 items.js,Phase D 已收斂)
 *   - 主入口 renderCrftGame + tab 切換 switchCrftTab
 *   - 武器子畫面 renderCrftWeaponHtml / selectCrftWeapon
 *   - 裝備子畫面 renderCrftArmorHtml / selectCrftArmor / crftMakeArmor
 *   - 素材選擇 crftPickMaterial / renderCrftDDList /
 *               crftQtyAdj / crftQtySet
 *   - 製造完成 crftMake
 *   - 藥水子畫面 renderCrftPotionHtml / crftPotionPick / renderCrftPotionDDList /
 *                 crftPotionQtyAdj / crftPotionQtySet / crftMakePotion
 *
 * 注意:
 *   - 製造系統的最終結果(把成品寫進背包)目前是 stub:三個 makeXXX 都只
 *     showToast('// XXX 製造功能開發中'),原檔案就如此,搬移時保留行為。
 * ════════════════════════════════════════════════════════════════════════ */

/* ── 製造 ── */
let crftTab='weapon';
let crftWeaponType=null;
let crftSlots={};        // { partKey: { matKey, qty } }
let crftCurrentPart=null; // 目前開著選單的 partKey

// CRFT dropdown:把上次選的種類持久化到 state.crftLastPick.{weapon,armor,potion}
// runtime cache(crftWeaponType / crftArmorType)在 renderCrftGame 入口從 state 還原
function _crftReadLastPick(kind){
  const s=load();
  return s.crftLastPick?.[kind]||null;
}
function _crftWriteLastPick(kind, key){
  const s=load();
  if(!s.crftLastPick) s.crftLastPick={weapon:null, armor:null, potion:null};
  s.crftLastPick[kind]=key;
  save(s);
}

// CRFT_WEAPONS / CRFT_ARMOR_PARTS / CRFT_MATERIALS / WEAPON_ICONS / ARMOR_ICONS
// 已於 Phase D 刪除,全部資料移至 items.js(WEAPON_TYPES / ARMOR_TYPES / MATERIAL_REGISTRY)。
// 取用方式:getWeaponType(key) / getArmorType(key) / getMaterialDef(key) / WEAPON_TYPES / ARMOR_TYPES / MATERIAL_REGISTRY。
// CRFT_ACC_PARTS 仍保留(飾品子類型 ring/bracelet/...,目前只有 craft 小遊戲用,未進 items.js schema)。
const CRFT_ACC_PARTS=[
  {key:'ring',     label:'戒指'},
  {key:'bracelet', label:'手環'},
  {key:'bangle',   label:'手鐲'},
  {key:'necklace', label:'項鍊'},
  {key:'pendant',  label:'墜飾'},
  {key:'brooch',   label:'胸針'},
  {key:'badge',    label:'徽章'},
  {key:'earring',  label:'耳環'},
  {key:'hairband', label:'髮帶'},
  {key:'amulet',   label:'護身符'},
];
let crftAccType=null;

let crftArmorSlots={};  // { partKey: [{matKey,qty},...] }

const CRFT_TAB_LABELS={weapon:'武器',armor:'裝備',potion:'藥水'};

// CRFT_RARITY_COLOR / POTION_RARITY_COLOR / WEAPON_ICONS / ARMOR_ICONS 已於 Phase C/D 收斂到 items.js

function renderCrftGame(container){
  if(!container){
    const c1=document.getElementById('ls-content-crft');
    if(c1 && c1.querySelector('.crft-wrap')) renderCrftGame(c1);
    return;
  }
  // CRFT dropdown:首次進場 / reload 後從 state 還原上次選擇
  // 用 ===null 哨兵(空字串 / 合法 key 都不該觸發還原)
  if(crftWeaponType===null) crftWeaponType=_crftReadLastPick('weapon');
  if(crftArmorType ===null) crftArmorType =_crftReadLastPick('armor');
  const headerTabsId='ls-crft-tabs';
  const headerTabs=document.getElementById(headerTabsId);
  if(headerTabs){
    headerTabs.style.display='flex';
    const tabsWrap=headerTabs.closest('.ls-detail-header-tabs');if(tabsWrap)tabsWrap.style.borderBottom='1px solid rgba(255,170,51,.3)';
    headerTabs.innerHTML=['weapon','armor','potion'].map(t=>`
      <div class="crft-header-tab${crftTab===t?' active':''}" onclick="switchCrftTab('${t}',this)">
        <span>${CRFT_TAB_LABELS[t]}</span>
      </div>`).join('');
  }
  // Task A:進製造頁先結算到期項(如果有,_resolveCraftEntry 會 reentrant 呼叫 renderCrftGame)
  if(typeof tickCrftQueue==='function'){
    const _s=load();
    const _q=_s.crftQueue||[];
    if(_q.some(e=>e.finishAt<=Date.now())){
      tickCrftQueue();
      return;
    }
  }
  // Task B:確保今日命名準則已生成(deterministic by today())
  if(typeof ensureNamingRule==='function') ensureNamingRule();

  if(crftTab==='weapon') container.innerHTML=renderCrftWeaponHtml();
  else if(crftTab==='armor') container.innerHTML=renderCrftArmorHtml();
  else if(crftTab==='potion') container.innerHTML=renderCrftPotionHtml();
  else container.innerHTML=`<div class="crft-empty">// COMING SOON</div>`;

  // Task A:啟動 1Hz tick(冪等;有佇列 / 待命名才會持續跑,清空自停)
  if(typeof _startCrftQueueInterval==='function') _startCrftQueueInterval();
}

function renderCrftWeaponHtml(){
  // dropdown:武器類型(原 9 個直列按鈕降格成原生 <select>)
  const opts=WEAPON_TYPES.map(w=>
    `<option value="${w.key}"${crftWeaponType===w.key?' selected':''}>${w.icon||''} ${w.name}</option>`
  ).join('');
  const dropdownHtml=`<div class="crft-picker-row">
    <span class="crft-picker-label">武器</span>
    <select class="crft-picker-select" onchange="selectCrftWeapon(this.value)">
      ${crftWeaponType?'':'<option value="" selected disabled>— 請選擇武器 —</option>'}
      ${opts}
    </select>
  </div>`;

  // 素材槽 / 製造按鈕
  let slotsHtml='';
  if(crftWeaponType){
    const w=getWeaponType(crftWeaponType);
    slotsHtml=`<div class="crft-parts">`+
      (w?.craftParts||[]).map(p=>{
        const mats=crftSlots[p.key]||[];
        const filled=mats.length>0;
        const preview=mats.map(m=>{
          const info=getMaterialDef(m.matKey);
          const color=RARITY_COLOR[info?.rarity]||'#ffaa33';
          return`<div class="crft-slot-mat-row" style="--mc:${color}">
            <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
            <span class="crft-slot-mat-qty">×${m.qty}</span>
          </div>`;
        }).join('');
        return`<div class="crft-part-row">
          <div class="crft-part-label"><span class="crft-part-label-name">${p.label}</span><span class="crft-part-label-qty">×${p.qty}</span></div>
          <div class="crft-part-slot${filled?' filled':''}" onclick="crftPickMaterial('${p.key}')">
            ${filled?preview:`<span class="crft-slot-plus">＋</span>`}
          </div>
        </div>`;
      }).join('')+
    `</div>`;

    // 算總進度:每個 craftPart 已放 qty 加總 vs 該 part 需求總量
    const totalHave=(w?.craftParts||[]).reduce((acc,p)=>
      acc+((crftSlots[p.key]||[]).reduce((a,m)=>a+m.qty,0)), 0);
    const totalNeed=(w?.craftParts||[]).reduce((acc,p)=>acc+p.qty, 0);
    const allFull=totalHave>=totalNeed;
    slotsHtml += allFull
      ? `<button class="crft-make-btn" onclick="crftMake()">▶ 製　造</button>`
      : `<button class="crft-make-btn disabled" disabled>素材不足 (${totalHave}/${totalNeed})</button>`;
  } else {
    slotsHtml=`<div class="crft-empty-hint">請從上方選擇武器種類</div>`;
  }

  // Task A:佇列(進度條 + 取消鈕)插在武器頁最上方
  // Task B:待命名 list 緊接在佇列之後
  const queueHtml=(typeof _renderCrftQueueHTML==='function')?_renderCrftQueueHTML():'';
  const pendingHtml=(typeof _renderPendingNamingHTML==='function')?_renderPendingNamingHTML():'';

  return`<div class="crft-wrap">${queueHtml}${pendingHtml}${dropdownHtml}${slotsHtml}</div>`;
}

function selectCrftWeapon(key){
  if(!key) return; // placeholder option 送空字串時忽略
  crftWeaponType=key; crftSlots={}; crftCurrentPart=null;
  _crftWriteLastPick('weapon', key);
  closeDD('crft');
  renderCrftGame();
}

let crftArmorType=null; // 目前選中的裝備部位 key

function renderCrftArmorHtml(){
  // 部位 dropdown(原 7 個直列按鈕降格成 <select>)
  const armorOpts=ARMOR_TYPES.map(p=>
    `<option value="${p.key}"${crftArmorType===p.key?' selected':''}>${p.icon||''} ${p.name}</option>`
  ).join('');
  const armorDropdown=`<div class="crft-picker-row">
    <span class="crft-picker-label">部位</span>
    <select class="crft-picker-select" onchange="selectCrftArmor(this.value)">
      ${crftArmorType?'':'<option value="" selected disabled>— 請選擇部位 —</option>'}
      ${armorOpts}
    </select>
  </div>`;

  // 沒選部位 → 只顯示 dropdown + 提示
  if(!crftArmorType){
    return`<div class="crft-wrap">${armorDropdown}<div class="crft-empty-hint">請從上方選擇部位</div></div>`;
  }

  // 飾品:多一層 ACC 子類型 dropdown
  if(crftArmorType==='acc'){
    const accOpts=CRFT_ACC_PARTS.map(p=>
      `<option value="${p.key}"${crftAccType===p.key?' selected':''}>${p.label}</option>`
    ).join('');
    const accDropdown=`<div class="crft-picker-row">
      <span class="crft-picker-label">類型</span>
      <select class="crft-picker-select" onchange="selectCrftAcc(this.value)">
        ${crftAccType?'':'<option value="" selected disabled>— 請選擇飾品 —</option>'}
        ${accOpts}
      </select>
    </div>`;

    if(!crftAccType){
      return`<div class="crft-wrap">${armorDropdown}${accDropdown}<div class="crft-empty-hint">請從上方選擇飾品種類</div></div>`;
    }

    const p=CRFT_ACC_PARTS.find(x=>x.key===crftAccType);
    const mats=crftArmorSlots[crftAccType]||[];
    const filled=mats.length>0;
    const preview=mats.map(m=>{
      const info=getMaterialDef(m.matKey);
      const color=RARITY_COLOR[info?.rarity]||'#ffaa33';
      return`<div class="crft-slot-mat-row" style="--mc:${color}">
        <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
        <span class="crft-slot-mat-qty">×${m.qty}</span>
      </div>`;
    }).join('');
    return`<div class="crft-wrap">${armorDropdown}${accDropdown}
      <div class="crft-parts">
        <div class="crft-part-row">
          <div class="crft-part-label"><span class="crft-part-label-name">${p.label}</span><span class="crft-part-label-qty">×1</span></div>
          <div class="crft-part-slot${filled?' filled':''}" onclick="crftPickMaterial('${crftAccType}','armor')">
            ${filled?preview:`<span class="crft-slot-plus">＋</span>`}
          </div>
        </div>
      </div>
      <button class="crft-make-btn" onclick="crftMakeArmor()">▶ 製　造</button>
    </div>`;
  }

  // 一般部位:dropdown + 素材槽
  const p=getArmorType(crftArmorType);
  if(!p){showToast('// 部位資料缺失:'+crftArmorType);return`<div class="crft-wrap">${armorDropdown}</div>`;}
  const mats=crftArmorSlots[p.key]||[];
  const filled=mats.length>0;
  const preview=mats.map(m=>{
    const info=getMaterialDef(m.matKey);
    const color=RARITY_COLOR[info?.rarity]||'#ffaa33';
    return`<div class="crft-slot-mat-row" style="--mc:${color}">
      <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
      <span class="crft-slot-mat-qty">×${m.qty}</span>
    </div>`;
  }).join('');
  return`<div class="crft-wrap">${armorDropdown}
    <div class="crft-parts">
      <div class="crft-part-row">
        <div class="crft-part-label"><span class="crft-part-label-name">${p.name}</span><span class="crft-part-label-qty">×1</span></div>
        <div class="crft-part-slot${filled?' filled':''}" onclick="crftPickMaterial('${p.key}','armor')">
          ${filled?preview:`<span class="crft-slot-plus">＋</span>`}
        </div>
      </div>
    </div>
    <button class="crft-make-btn" onclick="crftMakeArmor()">▶ 製　造</button>
  </div>`;
}

function selectCrftArmor(key){
  if(!key) return;
  crftArmorType=key; crftAccType=null;
  if(!crftArmorSlots[key])crftArmorSlots[key]=[];
  _crftWriteLastPick('armor', key);
  renderCrftGame();
}

function selectCrftAcc(key){
  if(!key) return;
  crftAccType=key;
  if(!crftArmorSlots[key])crftArmorSlots[key]=[];
  renderCrftGame();
}

function crftMakeArmor(){
  if(!crftArmorType){showToast('// 請先選擇部位');return;}
  const slot=crftArmorSlots[crftArmorType];
  if(!slot||slot.length===0){showToast('// 請放入素材');return;}
  showToast('// 裝備製造功能開發中');
}


let crftCurrentMode='weapon'; // 'weapon' | 'armor'

function crftPickMaterial(partKey, mode='weapon'){
  crftCurrentPart=partKey;
  crftCurrentMode=mode;
  const slots=mode==='armor'?crftArmorSlots:crftSlots;
  const parts=mode==='armor'?ARMOR_TYPES:getWeaponType(crftWeaponType)?.craftParts||[];
  const part=parts.find(p=>p.key===partKey);
  document.getElementById('crft-dd-title').textContent=`選擇素材 — ${part?.label||part?.name||partKey}`;
  renderCrftDDList();
  document.getElementById('crft-overlay').classList.add('show');
}

function renderCrftDDList(){
  const list=document.getElementById('crft-dd-list');
  if(!list||!crftCurrentPart)return;
  const slots=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
  if(!slots[crftCurrentPart])slots[crftCurrentPart]=[];
  const mats=slots[crftCurrentPart];

  // 此部位所需總數
  const parts=crftCurrentMode==='armor'?ARMOR_TYPES:getWeaponType(crftWeaponType)?.craftParts||[];
  const part=parts.find(p=>p.key===crftCurrentPart);
  const reqQty=part?.qty||1;  // armor type 沒 qty 欄位 → fallback 1
  // 目前已選總數
  const usedQty=mats.reduce((s,m)=>s+m.qty,0);
  const remaining=reqQty-usedQty; // 還剩幾格可分配

  list.innerHTML='';

  // 頂部顯示配額進度
  const quota=document.createElement('div');
  quota.style.cssText='font-family:var(--font-mono);font-size:11px;letter-spacing:2px;padding:6px var(--s3) 10px;color:var(--text-sub);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,170,51,.1);margin-bottom:6px;';
  quota.innerHTML=`<span>已選 <span style="color:${usedQty>=reqQty?'#00ff96':'#ffaa33'}">${usedQty}</span> / ${reqQty}</span>`+
    `${usedQty>=reqQty?'<span style="color:#00ff96;font-size:10px">✓ 已滿</span>':`<span style="color:var(--text-dim);font-size:10px">剩餘 ×${remaining}</span>`}`;
  list.appendChild(quota);

  // 清除全部
  if(mats.length>0){
    const clear=document.createElement('div');
    clear.className='dropdown-item crft-dd-item empty-opt';
    clear.textContent='— 清除全部 —';
    clear.onclick=()=>{
      const s=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
      s[crftCurrentPart]=[];renderCrftDDList();renderCrftGame();
    };
    list.appendChild(clear);
  }

  const __bagMats=(load().bag?.materials||{});
  MATERIAL_REGISTRY.forEach(mat=>{
    const stock=__bagMats[mat.key]||0;
    const entry=mats.find(m=>m.matKey===mat.key);
    const qty=entry?entry.qty:0;
    // Bug A:庫存 0 且未被選中 → 不顯示。已選中(qty>0)即使庫存歸 0 仍要顯示讓玩家能 -
    if(stock<=0 && qty<=0) return;
    const isSelected=qty>0;
    // 這個素材的上限 = reqQty 扣掉其他素材已佔數量,且不超過 bag 庫存
    const otherQty=mats.filter(m=>m.matKey!==mat.key).reduce((s,m)=>s+m.qty,0);
    const maxForThis=reqQty-otherQty;
    const canAdd=maxForThis>qty && stock>qty; // Bug B1:同時受 bag 庫存限制

    const row=document.createElement('div');
    row.className='crft-dd-row'+(isSelected?' selected':'');
    row.style.setProperty('--rc', RARITY_COLOR[mat.rarity]||'#aaaaaa');
    if(!canAdd&&!isSelected)row.style.opacity='0.35';

    const left=document.createElement('div');
    left.className='crft-dd-left';
    left.innerHTML=`<span class="crft-dd-name">${mat.name}</span>`;
    // 注意:click / 長按監聽器全綁到 row 上,讓「整條素材」都是有效命中區。
    // +/- 按鈕與數字輸入框已用 event.stopPropagation() 阻擋 click,但 mousedown/touchstart
    // 不會被擋,因此長按啟動時要過濾 e.target,避免長按 +/- 誤觸發清除。

    // 清除指定素材(共用)
    const _clearThisMat=()=>{
      const s=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
      const idx=(s[crftCurrentPart]||[]).findIndex(m=>m.matKey===mat.key);
      if(idx!==-1){s[crftCurrentPart].splice(idx,1);renderCrftDDList();renderCrftGame();}
    };

    // 長按計時器 + 旗標(close over,每個 row 獨立)
    let pressTimer=null;
    let holdFired=false;
    const startHold=(e)=>{
      // 在 +/− 按鈕或數字輸入框上不啟動長按(避免按住 +/− 被當清除)
      if(e && e.target && e.target.closest && e.target.closest('.crft-qty-btn, .crft-qty-input')) return;
      holdFired=false;
      if(pressTimer)clearTimeout(pressTimer);
      pressTimer=setTimeout(()=>{
        pressTimer=null;
        holdFired=true;
        _clearThisMat();
      },500);
    };
    const cancelHold=()=>{
      if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
    };

    // 點擊整條 row → +1(若剛長按完,跳過合成 click 抑制重複)
    row.onclick=(e)=>{
      if(holdFired){holdFired=false;return;}
      // 點到 +/- 或 input,讓它們自己的 stopPropagation 處理(此處不會跑到)
      if(!canAdd&&!isSelected)return;
      if(!entry){mats.push({matKey:mat.key,qty:1});}
      else if(canAdd){entry.qty++;}
      renderCrftDDList();renderCrftGame();
    };

    // 觸控
    row.addEventListener('touchstart',startHold,{passive:true});
    row.addEventListener('touchend',cancelHold);
    row.addEventListener('touchmove',cancelHold);
    row.addEventListener('touchcancel',cancelHold);
    // 滑鼠(桌面)
    row.addEventListener('mousedown',startHold);
    row.addEventListener('mouseup',cancelHold);
    row.addEventListener('mouseleave',cancelHold);
    // 桌面右鍵 = 長按等價,保留
    row.oncontextmenu=(e)=>{ e.preventDefault(); _clearThisMat(); };

    // 右側：持有 + 數量控制合併
    const right=document.createElement('div');
    right.className='crft-dd-qty-ctrl';
    right.innerHTML=
      (isSelected
        ?`<button class="crft-qty-btn" onclick="crftQtyAdj('${mat.key}',-1);event.stopPropagation()">−</button>`+
          `<input class="crft-qty-input" type="number" min="0" max="${Math.min(maxForThis, stock)}" value="${qty}" `+
            `onchange="crftQtySet('${mat.key}',this.value)" onclick="event.stopPropagation()">`+
          `<button class="crft-qty-btn" onclick="crftQtyAdj('${mat.key}',1);event.stopPropagation()" ${!canAdd?'disabled style="opacity:.3"':''}>＋</button>`
        :'')+
      `<div class="crft-dd-stock-wrap">
        <span class="crft-dd-stock-lbl">持有</span>
        <span class="crft-dd-stock-num${stock<=0?' zero':''}">${stock}</span>
      </div>`;
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
}

function crftQtyAdj(matKey, delta){
  const slots=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
  const mats=slots[crftCurrentPart];
  if(!mats)return;
  const idx=mats.findIndex(m=>m.matKey===matKey);
  if(idx===-1)return;
  if(delta>0){
    const parts=crftCurrentMode==='armor'?ARMOR_TYPES:getWeaponType(crftWeaponType)?.craftParts||[];
    const part=parts.find(p=>p.key===crftCurrentPart);
    const reqQty=part?.qty||1;  // armor type 沒 qty 欄位 → fallback 1
    const otherQty=mats.filter((_,i)=>i!==idx).reduce((s,m)=>s+m.qty,0);
    const max=reqQty-otherQty;
    if(mats[idx].qty>=max)return;
    // Bug B2:不能超過 bag 庫存
    const stock=(load().bag?.materials||{})[matKey]||0;
    if(mats[idx].qty>=stock){
      showToast('// 庫存不足');
      return;
    }
  }
  mats[idx].qty+=delta;
  if(mats[idx].qty<=0)mats.splice(idx,1);
  renderCrftDDList();renderCrftGame();
}

function crftQtySet(matKey, val){
  const slots=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
  const mats=slots[crftCurrentPart];
  if(!mats)return;
  const idx=mats.findIndex(m=>m.matKey===matKey);
  if(idx===-1)return;
  const n=parseInt(val);
  if(isNaN(n)||n<=0){mats.splice(idx,1);}
  else{
    const parts=crftCurrentMode==='armor'?ARMOR_TYPES:getWeaponType(crftWeaponType)?.craftParts||[];
    const part=parts.find(p=>p.key===crftCurrentPart);
    const reqQty=part?.qty||1;  // armor type 沒 qty 欄位 → fallback 1
    const otherQty=mats.filter((_,i)=>i!==idx).reduce((s,m)=>s+m.qty,0);
    const stock=(load().bag?.materials||{})[matKey]||0;
    mats[idx].qty=Math.min(n, reqQty-otherQty, stock); // Bug B3:三者取小
  }
  renderCrftDDList();renderCrftGame();
}

/* ════════════════ Task A:武器製造後端 ════════════════
 * 流程:crftMake()  → 立刻扣素材、進佇列(凍結 lv 與 materialScore、按下當下計時)
 *      tickCrftQueue() / _crftQueueInterval 每秒檢查 → 到期項 → _resolveCraftEntry
 *      成功:從 registry 挑同 weaponType+rarity 的 def → makeWeaponInstance(dur 浮動 ±20%)
 *           → 進 s.bag.pendingWeapons(待 Task B 命名 UI)
 *      失敗:每個素材獨立 30~70% 機率退回(依凍結 lv 線性內插)+ scrap ×1 + EXP 1
 * 注意:lv 在進佇列時凍結 (crftLvAtStart) — 邊製造邊升級不影響成功率/退材率,防作弊。
 */
function crftMake(){
  const s=initState();
  if(!crftWeaponType){showToast('// 請先選擇武器種類');return;}

  // 佇列上限
  if((s.crftQueue||[]).length>=CRFT_QUEUE_MAX){
    showToast(`// 製造佇列已滿(最多 ${CRFT_QUEUE_MAX} 把)`);
    return;
  }

  // 素材檢查:每個 craftPart 的 qty 總和必須 ≥ p.qty(完全放滿才能進佇列)。
  // UI 已用 disabled 視覺擋了大部分情境,這裡是 backend 防呆(console 直 call 也擋)。
  const w=getWeaponType(crftWeaponType);
  const missing=(w?.craftParts||[]).filter(p=>{
    const slot=crftSlots[p.key]||[];
    const have=slot.reduce((acc,m)=>acc+m.qty,0);
    return have<p.qty;
  });
  if(missing.length){
    const detail=missing.map(p=>{
      const have=(crftSlots[p.key]||[]).reduce((acc,m)=>acc+m.qty,0);
      return `${p.label} (${have}/${p.qty})`;
    }).join('、');
    showToast(`// 素材不足:${detail}`);
    return;
  }

  // 立刻扣素材(進佇列即鎖定,不可取消)
  const consumed={};
  Object.values(crftSlots).forEach(matList=>{
    (matList||[]).forEach(m=>{
      consumed[m.matKey]=(consumed[m.matKey]||0)+m.qty;
      s.bag.materials[m.matKey]=(s.bag.materials[m.matKey]||0)-m.qty;
      if(s.bag.materials[m.matKey]<=0) delete s.bag.materials[m.matKey];
    });
  });

  // 算製造時間(用按下當下的 lv,佇列每把獨立)
  const lv=s.lifeSkills?.CRFT?.lv||1;
  const lvNorm=Math.min(Math.max(lv,1), CRFT_LV_CAP);
  const craftMs= CRFT_TIME_MAX_MS -
    (CRFT_TIME_MAX_MS-CRFT_TIME_MIN_MS)*(lvNorm-1)/(CRFT_LV_CAP-1);

  if(!s.crftQueue) s.crftQueue=[];
  s.crftQueue.push({
    id:            'cq'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    weaponType:    crftWeaponType,
    consumed,
    materialScore: computeMaterialScore(crftSlots),
    crftLvAtStart: lvNorm,
    startAt:       Date.now(),
    finishAt:      Date.now()+craftMs,
  });

  // 清空 UI 狀態(讓玩家可繼續放下一把)
  crftSlots={};
  crftWeaponType=null;

  save(s);
  showToast(`// 開始製造,預計 ${Math.ceil(craftMs/60000)} 分鐘`);
  renderCrftGame();
  _startCrftQueueInterval();
}

function _resolveCraftEntry(entry){
  const s=initState();
  const lv=entry.crftLvAtStart;

  // 1. 算目標稀有度
  const targetRarity=scoreToRarity(entry.materialScore);
  const tierMap={common:0,uncommon:1,rare:2,epic:3,legendary:4};
  const tier=tierMap[targetRarity]||0;

  // 2. 算成功率
  const successRate=Math.min(CRFT_SUCCESS_MAX, Math.max(CRFT_SUCCESS_MIN,
    CRFT_BASE_SUCCESS + lv*CRFT_LV_BONUS - tier*CRFT_TIER_PENALTY));
  const success=Math.random()*100 < successRate;

  console.log('[craft] resolve',{
    weaponType:entry.weaponType, lv, score:entry.materialScore,
    targetRarity, successRate:successRate.toFixed(1), success,
  });

  if(success){
    const def=pickWeaponByTypeRarity(entry.weaponType, targetRarity);
    if(!def){
      _resolveCraftFail(s, entry, lv, '無對應武器定義');
      save(s);
      if(typeof renderCrftGame==='function') renderCrftGame();
      if(typeof renderBag==='function') renderBag();
      return;
    }
    // dur 在 baseDur ±20% 浮動(maxDur 同步)
    const durJitter=0.8+Math.random()*0.4;
    const inst=makeWeaponInstance(def.key, {
      overrides:{
        dur:    Math.max(1, Math.round(def.baseDur*durJitter)),
        maxDur: Math.max(1, Math.round(def.maxDur *durJitter)),
      },
    });
    if(!inst){
      _resolveCraftFail(s, entry, lv, 'instance 建立失敗');
      save(s);
      if(typeof renderCrftGame==='function') renderCrftGame();
      if(typeof renderBag==='function') renderBag();
      return;
    }

    if(!s.bag.pendingWeapons) s.bag.pendingWeapons=[];
    s.bag.pendingWeapons.push({
      ...inst,
      craftedAt:      Date.now(),
      _materialScore: entry.materialScore, // Task B 命名加成會用
    });

    const exp=CRFT_EXP_TABLE[targetRarity]||1;
    addLifeExp(s, 'CRFT', exp);
    showToast(`// 製造完成:【${inst.name}】(待命名) +${exp} CRFT EXP`);
  } else {
    _resolveCraftFail(s, entry, lv, '製造失敗');
  }

  save(s);
  if(typeof renderCrftGame==='function') renderCrftGame();
  if(typeof renderBag==='function') renderBag();
}

function _resolveCraftFail(s, entry, lv, reason){
  // 退材率(線性內插)
  const lvNorm=Math.min(Math.max(lv,1), CRFT_LV_CAP);
  const returnRate=CRFT_RETURN_MIN +
    (CRFT_RETURN_MAX-CRFT_RETURN_MIN)*(lvNorm-1)/(CRFT_LV_CAP-1);

  // 每個素材逐 unit 獨立判定
  let returnedCount=0;
  Object.entries(entry.consumed).forEach(([matKey, qty])=>{
    let returned=0;
    for(let i=0; i<qty; i++){
      if(Math.random()<returnRate) returned++;
    }
    if(returned>0){
      s.bag.materials[matKey]=(s.bag.materials[matKey]||0)+returned;
      returnedCount+=returned;
    }
  });

  // 必給廢料 1 個
  s.bag.materials.scrap=(s.bag.materials.scrap||0)+1;

  addLifeExp(s, 'CRFT', CRFT_EXP_FAIL);
  showToast(`// ${reason},退回 ${returnedCount} 個素材 + 廢料 ×1 +${CRFT_EXP_FAIL} CRFT EXP`);
}

function tickCrftQueue(){
  const s=initState();
  if(!s.crftQueue || s.crftQueue.length===0) return;
  const now=Date.now();
  const finished=s.crftQueue.filter(e=>e.finishAt<=now);
  if(finished.length===0) return;
  // 先從佇列移除(避免 _resolveCraftEntry 內 reentrant 重算同一筆)
  s.crftQueue=s.crftQueue.filter(e=>e.finishAt>now);
  save(s);
  finished.forEach(e=>_resolveCraftEntry(e));
}

function _renderCrftQueueHTML(){
  // Task B:本函式只負責進度條 + 取消鈕。待命名 list 由 _renderPendingNamingHTML() 另畫。
  const s=load();
  const q=s.crftQueue||[];
  if(q.length===0) return '';

  const now=Date.now();
  const rows=q.map(e=>{
    const total=Math.max(1, e.finishAt-e.startAt);
    const passed=Math.min(total, now-e.startAt);
    const pct=Math.max(0, Math.min(100, Math.round(passed/total*100)));
    const remainMs=Math.max(0, e.finishAt-now);
    const mm=String(Math.floor(remainMs/60000)).padStart(2,'0');
    const ss=String(Math.floor(remainMs%60000/1000)).padStart(2,'0');
    const wt=getWeaponType(e.weaponType);
    return `<div class="crft-queue-row">
      <span class="crft-queue-name">${(wt&&wt.icon)||'⚔'} ${(wt&&wt.name)||e.weaponType}</span>
      <div class="crft-queue-bar"><div class="crft-queue-bar-fill" style="width:${pct}%"></div></div>
      <span class="crft-queue-time">${mm}:${ss}</span>
      <button class="crft-queue-cancel" onclick="cancelCraftEntry('${e.id}')" title="取消製造">×</button>
    </div>`;
  }).join('');

  return `<div class="crft-queue-wrap">
    <div class="crft-queue-title">製造中 (${q.length}/${CRFT_QUEUE_MAX})</div>
    ${rows}
  </div>`;
}

let _crftQueueInterval=null;
function _startCrftQueueInterval(){
  if(_crftQueueInterval) return;
  _crftQueueInterval=setInterval(()=>{
    const s=load();
    const hasQueue=s.crftQueue && s.crftQueue.length>0;
    const hasPending=s.bag && s.bag.pendingWeapons && s.bag.pendingWeapons.length>0;
    if(!hasQueue && !hasPending){
      clearInterval(_crftQueueInterval); _crftQueueInterval=null;
      return;
    }
    // 結算到期
    if(hasQueue) tickCrftQueue();
    // 重畫(僅製造頁存在 .crft-wrap;其他頁靜默,僅做 tick)
    const wrap=document.querySelector('.crft-wrap');
    if(wrap){
      // 進度條(crft-queue-wrap)
      const queueHost=wrap.querySelector('.crft-queue-wrap');
      const queueHtml=_renderCrftQueueHTML();
      if(queueHost){
        if(queueHtml) queueHost.outerHTML=queueHtml;
        else queueHost.remove();
      } else if(queueHtml){
        wrap.insertAdjacentHTML('afterbegin', queueHtml);
      }
      // 待命名 list(craft-pending-wrap)— 重畫之外的位置由 renderCrftWeaponHtml 注入
      const pendingHost=wrap.querySelector('.craft-pending-wrap');
      const pendingHtml=(typeof _renderPendingNamingHTML==='function')?_renderPendingNamingHTML():'';
      if(pendingHost){
        if(pendingHtml) pendingHost.outerHTML=pendingHtml;
        else pendingHost.remove();
      }
      // pendingHost 不存在但 pendingHtml 有 → 不主動插(由全頁 render 接手,避免插錯位置)
    }
  }, 1000);
}

/* ════════════════ Task B:命名系統 / Task C:取消製造 ════════════════
 * - PRNG(FNV-1a + Mulberry32):同一天 reload 抽出的詞庫子集一致
 * - ensureNamingRule():進製造頁時呼叫,確保 s.craftNamingRule 是今天的
 * - computeNamingBonus(name, rule):逐字、每字最多 1 次、壞詞 ×NAMING_BAD_WEIGHT、保底 0
 * - applyNamingToWeapon(w, name, rule):取出 attr 類型 → stat 落點 → 套 dur 倍率 → 設 customName
 * - openNamingModal / updateNamingPreview / confirmNaming / closeNamingModal:UI 控制
 * - cancelCraftEntry(id):Task C,gConfirm → 100% 退材 + 移除佇列項 + 不給 EXP
 * - _renderPendingNamingHTML():待命名 list,點 row 開 modal
 * ══════════════════════════════════════════════════════════════════ */

function _hashStr(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619)>>>0;
  }
  return h>>>0;
}

function _seededRng(seed){
  let state=seed>>>0;
  return function(){
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15), t|1);
    t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

function _pickN(arr, n, rng){
  const copy=arr.slice();
  const out=[];
  for(let i=0;i<n && copy.length>0;i++){
    const idx=Math.floor(rng()*copy.length);
    out.push(copy.splice(idx,1)[0]);
  }
  return out;
}

function _pickDailyNamingRule(){
  const dateStr=today();
  const seed=_hashStr(dateStr);
  const rng=_seededRng(seed);
  const goodSel=_pickN(NAMING_GOOD_WORDS, NAMING_GOOD_PER_DAY, rng);
  const badSel =_pickN(NAMING_BAD_WORDS,  NAMING_BAD_PER_DAY,  rng);
  // 統計被選中詞群的 tag 出現次數(僅用於 hint 文字)
  const cnt=(sel)=>{
    const m={};
    sel.forEach(w=>(w.tags||[]).forEach(t=>m[t]=(m[t]||0)+1));
    return m;
  };
  const topTags=(m,n)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n).map(x=>x[0]);
  const goodTopTags=topTags(cnt(goodSel),3);
  const badTopTags =topTags(cnt(badSel), 2);
  const goodHint=goodTopTags.map(t=>NAMING_TAG_HINTS[t]||t).join('、');
  const badHint =badTopTags.map(t=>NAMING_TAG_HINTS[t]||t).join('、');
  const hint=`今日意境偏向【${goodHint}】,避免【${badHint}】`;
  return {
    setDate:   dateStr,
    goodWords: goodSel.map(w=>w.word),
    badWords:  badSel.map(w=>w.word),
    hint,
  };
}

function ensureNamingRule(){
  const s=initState();
  if(!s.craftNamingRule || s.craftNamingRule.setDate!==today()){
    s.craftNamingRule=_pickDailyNamingRule();
    save(s);
  }
  return s.craftNamingRule;
}

function computeNamingBonus(name, rule){
  if(!name || !rule) return {goodHits:0, badHits:0, netHits:0};
  const seen=new Set();
  let goodHits=0, badHits=0;
  for(const ch of name){
    if(seen.has(ch)) continue;
    seen.add(ch);
    if(rule.goodWords.includes(ch)) goodHits++;
    else if(rule.badWords.includes(ch)) badHits++;
  }
  const netHits=Math.max(0, Math.min(NAMING_HITS_MAX, goodHits - badHits*NAMING_BAD_WEIGHT));
  return {goodHits, badHits, netHits};
}

function applyNamingToWeapon(weapon, name, rule){
  const {netHits}=computeNamingBonus(name, rule);
  const t=netHits/NAMING_HITS_MAX;
  const range=NAMING_RARITY_RANGES[weapon.rarity]||NAMING_RARITY_RANGES.common;
  const statN=Math.round(range.statLow + (range.statHigh-range.statLow)*t);
  // 解出 stat 的 attr(STR/AGI/...);malformed → STR fallback + warn
  const m=(weapon.stat||'').match(/([A-Z]+)\s*\+/);
  const attr=m?m[1]:'STR';
  if(!m) console.warn('[naming] empty/malformed stat,fallback STR for', weapon.uid);
  const durMul=range.durLow + (range.durHigh-range.durLow)*t;
  const newMaxDur=Math.max(1, Math.round(weapon.maxDur*durMul));
  const out={
    ...weapon,
    stat:       attr+' +'+statN,
    maxDur:     newMaxDur,
    dur:        newMaxDur,  // 命名完滿耐久
    customName: name,        // 命名一次鎖定:後續判斷靠這欄位非 null
  };
  // 清掉 Task A 暫存欄位
  delete out._materialScore;
  delete out.craftedAt;
  return out;
}

function _renderPendingNamingHTML(){
  const s=load();
  const pending=(s.bag && s.bag.pendingWeapons)||[];
  if(pending.length===0) return '';
  const rows=pending.map(w=>{
    const wt=getWeaponType(w.weaponType);
    const rColor=RARITY_COLOR[w.rarity]||'#aaa';
    return `<div class="craft-pending-row" onclick="openNamingModal('${w.uid}')">
      <span class="craft-pending-icon">${(wt&&wt.icon)||'⚔'}</span>
      <span class="craft-pending-name" style="color:${rColor};text-shadow:0 0 6px ${rColor}55">${w.name}</span>
      <span class="craft-pending-rarity r-${w.rarity}">${(w.rarity||'').toUpperCase()}</span>
      <span class="craft-pending-arrow">›</span>
    </div>`;
  }).join('');
  return `<div class="craft-pending-wrap">
    <div class="craft-pending-title">待命名 ×${pending.length}</div>
    ${rows}
  </div>`;
}

let _namingTargetUid=null;

function openNamingModal(uid){
  const s=initState();
  const weapon=(s.bag && s.bag.pendingWeapons || []).find(w=>w.uid===uid);
  if(!weapon){ showToast('// 找不到該武器'); return; }
  // 防呆:已命名武器不該再開命名 modal(UI 走不到這條,但 state 異常時保險)
  if(weapon.customName){ showToast('// 該武器已命名'); return; }
  _namingTargetUid=uid;
  const rule=ensureNamingRule();
  const wt=getWeaponType(weapon.weaponType);
  const rColor=RARITY_COLOR[weapon.rarity]||'#aaa';

  document.getElementById('naming-modal-body').innerHTML=`
    <div class="naming-weapon-info">
      <div class="naming-weapon-row">
        <span style="font-size:24px">${(wt&&wt.icon)||'⚔'}</span>
        <span style="color:${rColor};font-weight:600;text-shadow:0 0 8px ${rColor}66">${weapon.name}</span>
        <span class="r-${weapon.rarity}" style="margin-left:auto;font-size:10px;letter-spacing:1px">${(weapon.rarity||'').toUpperCase()}</span>
      </div>
    </div>
    <div class="naming-hint">${rule.hint}</div>
    <div class="naming-input-wrap">
      <input id="naming-input" type="text" maxlength="${NAMING_NAME_MAX}"
             placeholder="輸入名稱(最多 ${NAMING_NAME_MAX} 字)"
             oninput="updateNamingPreview()">
      <span class="naming-counter" id="naming-counter">0/${NAMING_NAME_MAX}</span>
    </div>
    <div class="naming-buttons">
      <button class="naming-btn-cancel" onclick="closeNamingModal()">取消</button>
      <button class="naming-btn-confirm" onclick="confirmNaming()">確認命名</button>
    </div>
  `;
  document.getElementById('naming-overlay').classList.add('show');
  updateNamingPreview();
  setTimeout(()=>{
    const el=document.getElementById('naming-input');
    if(el) el.focus();
  }, 50);
}

function closeNamingModal(){
  _namingTargetUid=null;
  const ov=document.getElementById('naming-overlay');
  if(ov) ov.classList.remove('show');
}

function updateNamingPreview(){
  // Patch:預覽區拔掉,只剩 counter 字數計數。
  // applyNamingToWeapon / computeNamingBonus 仍在後台計算,玩家盲打。
  const inp=document.getElementById('naming-input');
  const counter=document.getElementById('naming-counter');
  if(!inp || !counter) return;
  counter.textContent=inp.value.length+'/'+NAMING_NAME_MAX;
}

function confirmNaming(){
  const inp=document.getElementById('naming-input');
  const name=((inp&&inp.value)||'').trim();
  if(!name){ showToast('// 請輸入名稱'); return; }
  if(name.length>NAMING_NAME_MAX){ showToast('// 名稱最多 '+NAMING_NAME_MAX+' 字'); return; }
  const s=initState();
  const idx=(s.bag && s.bag.pendingWeapons || []).findIndex(w=>w.uid===_namingTargetUid);
  if(idx===-1){ showToast('// 找不到該武器'); closeNamingModal(); return; }
  const rule=s.craftNamingRule||ensureNamingRule();
  const original=s.bag.pendingWeapons[idx];
  const finalized=applyNamingToWeapon(original, name, rule);
  s.bag.pendingWeapons.splice(idx,1);
  if(!s.bag.weapons) s.bag.weapons=[];
  s.bag.weapons.push(finalized);
  save(s);
  closeNamingModal();
  showToast('// 命名完成:【'+name+'】 ('+finalized.stat+')');
  if(typeof renderCrftGame==='function') renderCrftGame();
  if(typeof renderBag==='function') renderBag();
}

/* ── Task C:取消製造 ── */
function cancelCraftEntry(id){
  const s=initState();
  const entry=(s.crftQueue||[]).find(e=>e.id===id);
  if(!entry){ showToast('// 找不到該製造項'); return; }
  const wt=getWeaponType(entry.weaponType);
  const tName=(wt&&wt.name)||entry.weaponType;
  gConfirm(
    '取消製造【'+tName+'】?<br><span style="font-size:11px;color:rgba(255,255,255,.55);">素材會 100% 退回,但已花費的時間不會退,也不會獲得 EXP。</span>',
    ok=>{
      if(!ok) return;
      const s2=initState();
      const e=(s2.crftQueue||[]).find(x=>x.id===id);
      if(!e) return; // 邊界:取消過程中已被 tick 結算掉
      // 退材 100%
      if(!s2.bag.materials) s2.bag.materials={};
      Object.entries(e.consumed||{}).forEach(([matKey, qty])=>{
        s2.bag.materials[matKey]=(s2.bag.materials[matKey]||0)+qty;
      });
      // 移除佇列項(不給 EXP、不扣 EXP)
      s2.crftQueue=(s2.crftQueue||[]).filter(x=>x.id!==id);
      save(s2);
      showToast('// 已取消製造【'+tName+'】,素材已退回');
      if(typeof renderCrftGame==='function') renderCrftGame();
    }
  );
}


// ── 藥水資料 ──
const POTION_BASES=[
  {key:'water',  name:'普通水', rarity:'common', range:[10,30],  icon:'💧'},
  {key:'spring', name:'礦泉水', rarity:'rare',   range:[30,60],  icon:'🌊'},
  {key:'holy',   name:'聖水',   rarity:'epic',   range:[60,100], icon:'✨'},
];
// CRFT_RARITY_COLOR / POTION_RARITY_COLOR 已收斂到 items.js 的全域 RARITY_COLOR(Phase C)

// 藥水三個槽都用 [{matKey,qty},...] 結構，base 只能單選
let crftPotionSlots={base:null, effect:[], modifier:[]};
let crftPotionPickTarget=null;

function renderCrftPotionHtml(){
  const base=crftPotionSlots.base?POTION_BASES.find(b=>b.key===crftPotionSlots.base):null;

  // 預覽
  let previewHtml='';
  if(base){
    const [lo,hi]=base.range;
    const rc=RARITY_COLOR[base.rarity];
    previewHtml=`<div class="potion-preview">
      <div class="potion-preview-label">// 預覽產出</div>
      <div class="potion-preview-stat">
        <span style="color:${rc}">◆ ${base.rarity.toUpperCase()}</span>
        <span class="potion-preview-range">　${lo}～${hi}</span>
      </div>
    </div>`;
  }

  const mkMatSlot=(target, mats, label)=>{
    const filled=mats.length>0;
    const preview=mats.map(m=>{
      const info=getMaterialDef(m.matKey);
      const color=RARITY_COLOR[info?.rarity]||'#ffaa33';
      return`<div class="crft-slot-mat-row" style="--mc:${color}">
        <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
        <span class="crft-slot-mat-qty">×${m.qty}</span>
      </div>`;
    }).join('');
    return`<div class="potion-slot-row" onclick="crftPotionPick('${target}')">
      <div class="potion-slot-label">${label}</div>
      <div class="potion-slot${filled?' filled':''}" style="min-height:52px;flex-direction:column;align-items:flex-start;padding:10px 14px;gap:8px;">
        ${filled?preview:`<span class="potion-slot-empty" style="align-self:center;margin:auto">＋ 放入素材</span>`}
      </div>
    </div>`;
  };

  // 基底槽（單選）
  const baseSlot=`<div class="potion-slot-row" onclick="crftPotionPick('base')">
    <div class="potion-slot-label">基底</div>
    <div class="potion-slot${base?' filled':''}" style="min-height:52px;flex-direction:column;align-items:flex-start;padding:10px 14px;gap:8px;">
      ${base
        ?`<div class="crft-slot-mat-row" style="--mc:${RARITY_COLOR[base.rarity]}">
            <span class="crft-slot-mat-name">${base.name}</span>
          </div>`
        :`<span class="potion-slot-empty" style="align-self:center;margin:auto">＋ 選擇基底</span>`}
    </div>
  </div>`;

  return`<div class="crft-wrap">
    ${baseSlot}
    <div class="potion-arrow">↓</div>
    ${mkMatSlot('effect',   crftPotionSlots.effect,   '效果')}
    <div class="potion-arrow">↓</div>
    ${mkMatSlot('modifier', crftPotionSlots.modifier, '修飾（可選）')}
    ${previewHtml}
    <button class="crft-make-btn" onclick="crftMakePotion()">▶ 製　造</button>
  </div>`;
}

function crftPotionPick(target){
  crftPotionPickTarget=target;
  const title=document.getElementById('crft-dd-title');
  const list=document.getElementById('crft-dd-list');
  list.innerHTML='';

  if(target==='base'){
    title.textContent='選擇基底';
    POTION_BASES.forEach(b=>{
      const rc=RARITY_COLOR[b.rarity];
      const isSel=crftPotionSlots.base===b.key;
      const row=document.createElement('div');
      row.className='crft-dd-row'+(isSel?' selected':'');
      row.style.setProperty('--rc',rc);
      row.innerHTML=`<div class="crft-dd-left" style="padding-left:10px">
        <span style="font-size:18px;margin-right:8px">${b.icon}</span>
        <span class="crft-dd-name">${b.name}</span>
      </div>`;
      row.onclick=()=>{crftPotionSlots.base=b.key;closeDD('crft');renderCrftGame();};
      list.appendChild(row);
    });
  } else {
    // effect / modifier → 跟武器素材一樣的多選混搭選單
    const labelMap={effect:'選擇效果素材', modifier:'選擇修飾素材'};
    title.textContent=labelMap[target]||'選擇素材';
    const mats=crftPotionSlots[target];
    const reqQty=99; // 藥水素材無上限

    // 配額列
    const usedQty=mats.reduce((s,m)=>s+m.qty,0);
    const quota=document.createElement('div');
    quota.style.cssText='font-family:var(--font-mono);font-size:11px;letter-spacing:2px;padding:6px var(--s3) 10px;color:var(--text-sub);border-bottom:1px solid rgba(255,170,51,.1);margin-bottom:6px;';
    quota.innerHTML=`已放入 <span style="color:#ffaa33">${usedQty}</span> 個素材`;
    list.appendChild(quota);

    // 清除全部
    if(mats.length>0){
      const clear=document.createElement('div');
      clear.className='dropdown-item crft-dd-item empty-opt';
      clear.textContent='— 清除全部 —';
      clear.onclick=()=>{crftPotionSlots[target]=[];renderCrftPotionDDList();renderCrftGame();};
      list.appendChild(clear);
    }

    MATERIAL_REGISTRY.forEach(mat=>{
      const entry=mats.find(m=>m.matKey===mat.key);
      const qty=entry?entry.qty:0;
      const isSelected=qty>0;
      const row=document.createElement('div');
      row.className='crft-dd-row'+(isSelected?' selected':'');
      row.style.setProperty('--rc',RARITY_COLOR[mat.rarity]||'#aaaaaa');

      const left=document.createElement('div');
      left.className='crft-dd-left';
      left.innerHTML=`<span class="crft-dd-name">${mat.name}</span>`;
      left.onclick=()=>{
        if(!entry){mats.push({matKey:mat.key,qty:1});}
        else{entry.qty++;}
        renderCrftPotionDDList();renderCrftGame();
      };

      const right=document.createElement('div');
      right.className='crft-dd-qty-ctrl';
      right.innerHTML=
        `<div class="crft-dd-stock-wrap">
          <span class="crft-dd-stock-lbl">持有</span>
          <span class="crft-dd-stock-num${mat.stock<=0?' zero':''}">${mat.stock}</span>
        </div>`+
        (isSelected
          ?`<button class="crft-qty-btn" onclick="crftPotionQtyAdj('${target}','${mat.key}',-1);event.stopPropagation()">−</button>`+
            `<input class="crft-qty-input" type="number" min="0" max="99" value="${qty}" `+
              `onchange="crftPotionQtySet('${target}','${mat.key}',this.value)" onclick="event.stopPropagation()">`+
            `<button class="crft-qty-btn" onclick="crftPotionQtyAdj('${target}','${mat.key}',1);event.stopPropagation()">＋</button>`
          :'');

      // 長按清除
      let pressTimer=null;
      left.addEventListener('touchstart',()=>{pressTimer=setTimeout(()=>{
        pressTimer=null;
        const idx=mats.findIndex(m=>m.matKey===mat.key);
        if(idx!==-1){mats.splice(idx,1);renderCrftPotionDDList();renderCrftGame();}
      },500);},{passive:true});
      left.addEventListener('touchend',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
      left.addEventListener('touchmove',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
      left.oncontextmenu=(e)=>{e.preventDefault();
        const idx=mats.findIndex(m=>m.matKey===mat.key);
        if(idx!==-1){mats.splice(idx,1);renderCrftPotionDDList();renderCrftGame();}
      };

      row.appendChild(left);row.appendChild(right);
      list.appendChild(row);
    });
  }
  document.getElementById('crft-overlay').classList.add('show');
}

function renderCrftPotionDDList(){
  if(crftPotionPickTarget) crftPotionPick(crftPotionPickTarget);
}

function crftPotionQtyAdj(target, matKey, delta){
  const mats=crftPotionSlots[target];
  const idx=mats.findIndex(m=>m.matKey===matKey);
  if(idx===-1)return;
  mats[idx].qty+=delta;
  if(mats[idx].qty<=0)mats.splice(idx,1);
  renderCrftPotionDDList();renderCrftGame();
}

function crftPotionQtySet(target, matKey, val){
  const mats=crftPotionSlots[target];
  const idx=mats.findIndex(m=>m.matKey===matKey);
  if(idx===-1)return;
  const n=parseInt(val);
  if(isNaN(n)||n<=0)mats.splice(idx,1);
  else mats[idx].qty=n;
  renderCrftPotionDDList();renderCrftGame();
}

function crftMakePotion(){
  if(!crftPotionSlots.base){showToast('// 請選擇基底');return;}
  if(!crftPotionSlots.effect.length){showToast('// 請放入效果素材');return;}
  showToast('// 藥水製造功能開發中');
}

// 切換 tab:dropdown 接管後,runtime cache(crftWeaponType / crftArmorType /
// crftPotionSlots)跨 tab 保留,renderCrftGame 會從 state.crftLastPick 還原
function switchCrftTab(tab, el){
  crftTab=tab;
  const container=document.getElementById('ls-content-crft');
  if(container)renderCrftGame(container);
  else renderCrftGame();
}
