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
 *   - 採集小遊戲(GATH / 花牌系統):renderHanaGame, GATH_DECK, GATH_COMBOS, …
 *   - 挖礦小遊戲(MINE 掃雷):renderMineGame, MINE_COLS, …
 *   - 烹飪小遊戲(COOK):renderCookGame, COOK_TAGS, …
 *   - 製造小遊戲(CRFT):renderCrftGame, CRFT_WEAPONS, CRFT_ARMOR_PARTS, …
 *
 * 依賴:
 *   - state.js: SK / HUNT_MAX_MS / HUNT_MIN_MS / LIFE_ATTRS / LIFE_COLOR / LIFE_SKILL_NAME / initState
 *   - storage.js: load / save
 *   - utils.js: showToast / fmtTime / today
 *   - character.js: maxHp(無;這裡不需要,只有 character[attr]+= 操作)
 *   - 仍在 inline JS: updateLifeSkillLocks(會被搬到 skills.js 將來)、
 *                    renderStatus(來自 character.js,collectLifeTimer 會呼叫)
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
  sk.exp+=amt;
  while(sk.exp>=lifeExpReq(sk.lv, attr)){
    sk.exp-=lifeExpReq(sk.lv, attr);
    sk.lv++;
    showToast(`// ${LIFE_SKILL_NAME[attr]} 升級!Lv.${sk.lv}`);
    if(attr==='GATH' && sk.lv>=100){ sk.exp=0; break; }
  }
}


/* ════════════════ 2. 背包寫入助手 ════════════════ */
function bagAddMaterial(s, key, qty){
  qty=qty||1;
  if(!s.bag) s.bag={materials:{}, weapons:[], armors:[], items:{}};
  s.bag.materials[key]=(s.bag.materials[key]||0)+qty;
}

function bagAddItem(s, key, qty){
  qty=qty||1;
  if(!s.bag) s.bag={materials:{}, weapons:[], armors:[], items:{}};
  s.bag.items[key]=(s.bag.items[key]||0)+qty;
}


/* ════════════════ 3. 狩獵 HUNT 系統 ════════════════ */
let huntTimerInterval=null;

function isHuntRunning(){
  return !!(load().huntTimer?.running);
}

function calcHuntReward(ms){
  if(ms<HUNT_MIN_MS) return 0;
  return 5+Math.floor((ms-HUNT_MIN_MS)/(30*60*1000));
}

function renderHuntTimer(container){
  const s=load(); const t=s.huntTimer||{running:false};
  const elapsed=t.running?Math.min(Date.now()-t.startAt, HUNT_MAX_MS):0;
  const reward=calcHuntReward(elapsed);
  const pct=Math.min(100, (elapsed/HUNT_MAX_MS)*100);
  const isReady=elapsed>=HUNT_MIN_MS;
  const html=`<div class="hunt-timer-wrap">`+
    `<div class="hunt-time${isReady&&t.running?' hunt-ready':''}">${t.running?fmtTime(elapsed):'--:--'}</div>`+
    `<div class="hunt-reward${isReady?' show':''}">${t.running?(isReady?`可收穫 +${reward} HUNT`:'需要 30 分鐘'):'開始狩獵計時'}</div>`+
    `<div class="hunt-bar-wrap"><div class="hunt-bar" style="width:${pct}%"></div></div>`+
    `<div class="hunt-btns">${!t.running
      ?`<button class="hunt-btn hunt-btn-start" onclick="startHunt()">▶ 開始狩獵</button>`
      :(isReady?`<button class="hunt-btn hunt-btn-collect" onclick="collectHunt()">✓ 收穫</button>`:'')
       +`<button class="hunt-btn hunt-btn-stop" onclick="stopHunt()">✕ 放棄</button>`
    }</div></div>`;
  if(container){
    container.innerHTML=html;
  } else {
    const c1=document.getElementById('ls-detail-content');
    if(c1 && c1.querySelector('.hunt-timer-wrap')) c1.innerHTML=html;
  }
  if(t.running) startHuntTick();
}

function startHunt(){
  const s=initState();
  s.huntTimer={running:true, startAt:Date.now()};
  save(s);
  updateLifeSkillLocks(); updateHuntCellTime(); renderHuntTimer(); startHuntTick();
}

function stopHunt(){
  const s=initState();
  s.huntTimer={running:false, startAt:null};
  save(s);
  clearInterval(huntTimerInterval); huntTimerInterval=null;
  updateLifeSkillLocks(); updateHuntCellTime(); renderHuntTimer();
}

function collectHunt(){
  const s=initState(); const t=s.huntTimer;
  if(!t?.running) return;
  const elapsed=Math.min(Date.now()-t.startAt, HUNT_MAX_MS);
  const reward=calcHuntReward(elapsed);
  if(reward<=0){ showToast('// 至少需要 30 分鐘'); return; }

  s.huntTimer={running:false, startAt:null};
  // 狩獵掉落:每點 reward 對應掉落,LUK 影響稀有率
  const lk=(s.character?.LUK||1);
  const drops=[];
  for(let i=0; i<reward; i++){
    const r=Math.random()*100;
    if(r<5+lk*0.5){ bagAddMaterial(s,'rare_fang',1); drops.push('稀有獠牙'); }
    else if(r<30){ bagAddMaterial(s,'beast_hide',1); drops.push('獸皮'); }
    else { bagAddMaterial(s,'boar_meat',1); drops.push('野豬肉'); }
  }
  addLifeExp(s, 'HUNT', reward*5);
  save(s);
  clearInterval(huntTimerInterval); huntTimerInterval=null;
  const dropStr=drops.length?` (+${drops.length}個物品)`:'';
  showToast(`// 狩獵完成 HUNT +${reward}${dropStr}`);
  updateLifeSkillLocks(); updateHuntCellTime(); renderHuntTimer();
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
    renderHuntTimer(); updateHuntCellTime();
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

function getMineState(){
  const s=load();
  if(!s.mineState) return null;
  // 不同天 → 重新開始
  if(s.mineState.date!==today()) return null;
  return s.mineState;
}

function initMineState(){
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
  // No-guessing 模式:給一個安全提示格(優先選 0 = 翻開會展開大片)
  const zeroCells=cells.map((_,i)=>i).filter(i=>cells[i]===0);
  const safeCells=cells.map((_,i)=>i).filter(i=>cells[i]!==-1);
  const hintPool=zeroCells.length>0?zeroCells:safeCells;
  const safeHint=hintPool[Math.floor(Math.random()*hintPool.length)];
  const state={
    date:today(),
    cells,
    revealed:new Array(total).fill(false),
    exploded:new Array(total).fill(false),
    mined   :new Array(total).fill(false),
    digLeft:MINE_BOMBS,
    done:false,
    safeHint,
  };
  const s=load(); s.mineState=state; save(s);
  return state;
}

function saveMineState(state){
  const s=load(); s.mineState=state; save(s);
}

function renderMineGame(container){
  if(!container){
    const c1=document.getElementById('ls-detail-content');
    if(c1 && c1.querySelector('.mine-wrap')) renderMineGame(c1);
    return;
  }
  let state=getMineState();
  if(!state) state=initMineState();
  const bombsLeft=state.cells.filter((_,i)=>state.cells[i]===-1 && !state.exploded[i] && !state.mined[i]).length;
  container.innerHTML=`
    <div class="mine-wrap">
      <div class="mine-info">
        <span>💣 剩餘礦物 <span class="mine-info-val" style="color:#ffaa33">${bombsLeft}</span></span>
        <span>⛏ 強挖次數 <span class="mine-info-val" style="color:${state.digLeft>0?'var(--cyan)':'var(--red)'}">${state.digLeft}</span></span>
      </div>
      ${state.done?`<div class="mine-done">// 今日已挖礦完畢<br>// 請明天再來</div>`:`<div class="mine-grid" id="mine-grid"></div>`}
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
  let state=getMineState(); if(!state || state.done) return;
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
  let state=getMineState(); if(!state || state.done) return;
  if(state.revealed[i] || state.exploded[i] || state.mined[i]) return;
  if(state.digLeft<=0){ showToast('// 今日強挖次數已用完'); return; }
  state.digLeft--;
  state.revealed[i]=true;
  if(state.cells[i]===-1){
    // 強挖炸彈 → 挖到礦物!
    state.mined[i]=true;
    state.revealed[i]=false;
    const ms=initState();
    const lk2=ms.character?.LUK||1;
    const mRoll=Math.random()*100;
    let mKey, mName;
    if(mRoll<5+lk2*0.5){ mKey='gem_shard';  mName='寶石碎片'; }
    else if(mRoll<25)  { mKey='raw_silver'; mName='粗銀塊'; }
    else               { mKey='raw_iron';   mName='粗鐵塊'; }
    bagAddMaterial(ms, mKey, 1);
    const mineExp=mKey==='gem_shard'?50:mKey==='raw_silver'?20:5;
    addLifeExp(ms, 'MINE', mineExp);
    save(ms);
    showToast(`// 💎 挖到 ${mName}!MINE EXP +${mineExp}`);
  } else {
    showToast('// 什麼都沒有...');
  }
  if(state.digLeft===0) state.done=true;
  saveMineState(state);
  renderMineGame();
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
let cookState={phase:'capture', photoUrl:null, selected:new Set(), log:[], itemName:null};

function renderCookGame(container){
  if(!container){
    const c1=document.getElementById('ls-detail-content');
    if(c1 && c1.querySelector('.cook-wrap,.cook-card,.cook-synth')) renderCookGame(c1);
    return;
  }

  if(cookState.phase==='capture'){
    container.innerHTML=`<div class="cook-wrap">
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
      <button class="cook-tag-btn${cookState.selected.has(t.id)?' selected':''}"
        style="border-color:${t.color}88;color:${t.color};"
        onclick="toggleCookTag('${t.id}')">
        <div class="cook-tag-icon">${t.icon}</div>
        <div>${t.label}</div>
      </button>`).join('');
    const logHTML=cookState.log.map((l, i)=>`<div class="cook-log-line" style="animation-delay:${i*0.1}s">${l}</div>`).join('');
    container.innerHTML=`<div class="cook-wrap">
      <img class="cook-photo-preview" src="${cookState.photoUrl}" alt="meal"/>
      <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,136,170,.7);letter-spacing:2px;">[SYSTEM] 請標記食材組成</div>
      <div class="cook-tags">${tagBtns}</div>
      <div class="cook-log" id="cook-log">${logHTML}</div>
      ${cookState.selected.size>0?`<button class="cook-ok-btn" onclick="startCookSynth()">// SYNTHESIZE</button>`:''}
    </div>`;
    return;
  }

  if(cookState.phase==='synth'){
    container.innerHTML=`<div class="cook-wrap">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);letter-spacing:2px;">[SYSTEM] 合成中...</div>
      <div class="cook-orb"></div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-sub);letter-spacing:1px;">// 正在生成道具數據</div>
    </div>`;
    setTimeout(()=>completeCookSynth(container), 2000);
    return;
  }

  if(cookState.phase==='done'){
    const tags=Array.from(cookState.selected).map(id=>COOK_TAGS.find(t=>t.id===id));
    const rarities=[
      {name:'COMMON',  color:'#aaa'},
      {name:'UNCOMMON',color:'#44dd44'},
      {name:'RARE',    color:'#44aaff'},
      {name:'EPIC',    color:'#aa55ff'},
    ];
    const rarity=rarities[Math.min(tags.length-1, 3)];
    container.innerHTML=`<div class="cook-wrap">
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
      <button class="cook-ok-btn" onclick="resetCook()">// 重新烹飪</button>
    </div>`;
  }
}

function onCookPhoto(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    cookState.photoUrl=ev.target.result;
    cookState.phase='tag';
    cookState.selected=new Set();
    cookState.log=[];
    renderCookGame();
  };
  reader.readAsDataURL(file);
}

function toggleCookTag(id){
  if(cookState.selected.has(id)){
    cookState.selected.delete(id);
  } else {
    cookState.selected.add(id);
    const tag=COOK_TAGS.find(t=>t.id===id);
    if(tag) cookState.log.push(tag.log);
  }
  renderCookGame();
  // 自動滾到底
  setTimeout(()=>{ const l=document.getElementById('cook-log'); if(l) l.scrollTop=l.scrollHeight; }, 50);
}

function startCookSynth(){
  cookState.phase='synth';
  cookState.itemName=COOK_ITEM_NAMES[Math.floor(Math.random()*COOK_ITEM_NAMES.length)];
  renderCookGame();
}

function completeCookSynth(container){
  cookState.phase='done';
  // 依 tag 數寫入食物到背包
  const tagCount=cookState.selected?cookState.selected.size:0;
  const cs=initState();
  const foodKey=tagCount>=2?'stew':'bread';
  const foodExp=tagCount>=3?20:tagCount===2?12:6;
  bagAddItem(cs, foodKey, 1);
  addLifeExp(cs, 'COOK', foodExp);
  save(cs);
  renderCookGame(container);
}

function resetCook(){
  cookState={phase:'capture', photoUrl:null, selected:new Set(), log:[], itemName:null};
  renderCookGame();
}



/* ════════════════════════════════════════════════════════════════════════
 * Phase 5b 追加:採集 GATH 系統(花牌 / 撲克牌型)
 *
 * 玩法:
 *   - 4 色(spade=樹木 / heart=葉 / club=花 / diamond=果),每色 13 張(1-13)
 *   - 玩家手牌池=已解鎖的牌,從中隨機抽 8 張組成手牌
 *   - 每天最多打 4 次牌、3 次棄牌
 *   - 出牌時組成牌型(高牌/對子/兩對/三條/順子/同花/葫蘆/四條/同花順),
 *     依牌型強化等級獲得不同 EXP
 *   - 升級每 odd 等選新植物解鎖,every even 等升級牌型,每 20 等可額外強化
 *
 * 內容:
 *   - 常數 GATH_SUITS / GATH_DECK / GATH_COMBOS
 *   - 持久層 loadGathData / saveGath / loadHarv / saveHarv
 *   - 解鎖池 gathUnlockedPool / gathOnLevelUp / gathUpgradePlant / gathUpgradeCombo
 *   - 牌型偵測 gathGroupByNum / gathGroupBySuit / gathDetectStraight /
 *              gathDetectStraightFlush / gathBestCombo
 *   - 場景狀態 harvSession + 互動 harvToggleCard / harvPlay / harvDiscard
 *   - 渲染輔助 gathCardHTML / renderHanaGame
 *
 * 依賴:initState / load / save / today / showToast / addLifeExp / bagAddMaterial
 *      (前述 Phase 都在了)
 * ════════════════════════════════════════════════════════════════════════ */



// ── 採集系統 (GATH) ──
// 4色定義
const GATH_SUITS=[
  {id:'spade',  sym:'♠', label:'樹木', color:'#64a0ff', icon:'🌲'},
  {id:'heart',  sym:'♥', label:'葉子', color:'#ff6464', icon:'🌿'},
  {id:'club',   sym:'♣', label:'花朵', color:'#64dc64', icon:'🌸'},
  {id:'diamond',sym:'♦', label:'果實', color:'#ffc832', icon:'🍎'},
];
// 各色13種植物（數字1~13）
const GATH_DECK={
  spade:[
    [1,'twig','細枝','🌿'],[2,'woodchip','木片','🪵'],[3,'oak_wood','橡木','🌳'],
    [4,'pine_wood','松木','🌲'],[5,'maple_wood','楓木','🍁'],[6,'cherry_wood','櫻木','🌸'],
    [7,'dark_wood','黑木','🖤'],[8,'iron_wood','鐵木','⚙️'],[9,'dragonblood_wood','龍血木','🔴'],
    [10,'star_wood','星木','⭐'],[11,'laurel_wood','月桂木','🏆'],[12,'spirit_wood','靈木','💚'],[13,'yggdrasil_bark','世界樹幹','🌍'],
  ],
  heart:[
    [1,'weed','雜草','🌱'],[2,'mint','薄荷葉','🌿'],[3,'moongrass','月光草','🌙'],
    [4,'basil','羅勒','🍃'],[5,'eucalyptus','尤加利','🌿'],[6,'spirit_herb','靈藥草','✨'],
    [7,'silver_herb','銀葉草','🪄'],[8,'star_moss','星光苔','💫'],[9,'dragon_tongue','龍舌草','🐉'],
    [10,'dream_leaf','幻夢葉','💤'],[11,'eternal_leaf','不老葉','♾️'],[12,'divine_leaf','神木葉','🙏'],[13,'mandragora','曼陀羅','🌺'],
  ],
  club:[
    [1,'wildflower','野花','🌼'],[2,'daisy','雛菊','🌻'],[3,'sunflower','太陽花','🌻'],
    [4,'lavender','薰衣草','💜'],[5,'rose','玫瑰','🌹'],[6,'lotus','蓮花','🪷'],
    [7,'night_bloom','夜來香','🌙'],[8,'star_flower','星辰花','⭐'],[9,'higanbana','彼岸花','🌺'],
    [10,'phantom_flower','幻光花','👻'],[11,'sacred_lily','神聖百合','⚜️'],[12,'soul_flower','靈魂花','💠'],[13,'eternal_rose','永恆薔薇','🌹'],
  ],
  diamond:[
    [1,'wild_berry','野莓','🫐'],[2,'apple','蘋果','🍎'],[3,'blueberry','藍莓','🫐'],
    [4,'peach','蜜桃','🍑'],[5,'kumquat','金柑','🍊'],[6,'star_fruit','星果','⭐'],
    [7,'moon_pear','月梨','🍐'],[8,'dragon_eye','龍眼','👁️'],[9,'phoenix_pine','鳳梨','🍍'],
    [10,'dream_grape','夢幻葡萄','🍇'],[11,'immortal_peach','仙桃','🍑'],[12,'spirit_fruit','靈果','💎'],[13,'golden_apple','金蘋果','🍏'],
  ],
};
// 牌型定義（小→大）
const GATH_COMBOS=[
  {id:'high',    name:'高牌',   rank:1},
  {id:'pair',    name:'對子',   rank:2},
  {id:'twopair', name:'兩對',   rank:3},
  {id:'three',   name:'三條',   rank:4},
  {id:'straight',name:'順子',   rank:5},
  {id:'flush',   name:'同花',   rank:6},
  {id:'fullhouse',name:'葫蘆',  rank:7},
  {id:'four',    name:'四條',   rank:8},
  {id:'strflush',name:'同花順', rank:9},
];

// 讀取採集持久資料
function loadGathData(){
  const s=load();
  if(!s.gath){
    // 初始化：四色各1號牌已解鎖，牌型全lv0，強化預設值
    s.gath={
      unlocked:{spade:[1],heart:[1],club:[1],diamond:[]},
      comboLv:{},   // {pair:0, three:1 ...}
      plays:4, discards:3, handMax:8,
      // 待處理升等事件
      pendingPlant:false,  // 奇數等，需選花色
      pendingCombo:false,  // 偶數等，需選牌型
      pendingBonus:false,  // 每20等強化
    };
    // 初始4張：spade1,heart1,club1,diamond1
    s.gath.unlocked.diamond=[1];
    save(s);
  }
  return s;
}
function saveGath(s){save(s);}

// 取得玩家已解鎖的牌（陣列of card object）
function gathUnlockedPool(s){
  const pool=[];
  const g=s.gath;
  GATH_SUITS.forEach(suit=>{
    const nums=g.unlocked[suit.id]||[];
    nums.forEach(num=>{
      const row=GATH_DECK[suit.id][num-1];
      if(row)pool.push({suit:suit.id,num:row[0],key:row[1],name:row[2],icon:row[3]});
    });
  });
  // 鬼牌
  const gathLv=(s.lifeSkills&&s.lifeSkills.GATH)?s.lifeSkills.GATH.lv:1;
  if(gathLv>=69)pool.push({suit:'wild',num:0,key:'joker',name:'鬼牌',icon:'🃏',wild:true});
  if(gathLv>=99)pool.push({suit:'wild',num:0,key:'joker2',name:'鬼牌',icon:'🃏',wild:true});
  return pool;
}

// 今日採集session
function loadHarv(){
  const s=loadGathData();
  if(!s.harv)s.harv={};
  const h=s.harv;
  const g=s.gath;
  if(h.date!==today()){
    h.date=today();
    h.playsLeft=g.plays||4;
    h.discardsLeft=g.discards||3;
    h.hand=[];
    save(s);
  }
  h.hand=(h.hand||[]).filter(c=>!c.played);
  const handMax=g.handMax||8;
  if(h.hand.length<handMax){
    const pool=gathUnlockedPool(s);
    const need=handMax-h.hand.length;
    for(let i=0;i<need;i++){
      const c={...pool[Math.floor(Math.random()*pool.length)]};
      c._id=Math.random().toString(36).slice(2);
      h.hand.push(c);
    }
    s.harv=h;save(s);
  }
  return{h,s};
}
function saveHarv(h,s){s.harv=h;save(s);}

// 升等檢查：每次 GATH 升等後呼叫
function gathOnLevelUp(newLv, s){
  const g=s.gath;
  if(newLv%20===0){
    // 每20等：給所有已解鎖植物素材（20等×2，40等×4...）
    const qty=(newLv/20)*2;
    const pool=gathUnlockedPool(s);
    if(!s.bag)s.bag={materials:{},weapons:[],armors:[],items:{}};
    if(!s.bag.materials)s.bag.materials={};
    const given=[];
    pool.forEach(c=>{
      if(c.wild)return;
      s.bag.materials[c.key]=(s.bag.materials[c.key]||0)+qty;
      given.push(c.name);
    });
    showToast(`// Lv${newLv} 里程碑！獲得各植物 ×${qty}`);
  } else if(newLv%2===0){g.pendingCombo=true;}
  else{g.pendingPlant=true;}
  save(s);
}

// 升植物（選擇花色）
function gathUpgradePlant(suitId){
  const s=loadGathData();
  const g=s.gath;
  if(!g.pendingPlant)return;
  const nums=g.unlocked[suitId]||[];
  const next=nums.length>0?Math.max(...nums)+1:1;
  if(next>13){showToast('// 該花色已滿等');return;}
  g.unlocked[suitId]=[...nums,next];
  g.pendingPlant=false;
  save(s);
  showToast(`// 解鎖 ${GATH_SUITS.find(x=>x.id===suitId)?.label} ${next}號牌！`);
  renderHanaGame();
}

// 升牌型（選擇牌型）
function gathUpgradeCombo(comboId){
  const s=loadGathData();
  const g=s.gath;
  if(!g.pendingCombo)return;
  if(!g.comboLv)g.comboLv={};
  const cur=g.comboLv[comboId]||0;
  if(cur>=5){showToast('// 該牌型已滿等Lv5');return;}
  g.comboLv[comboId]=cur+1;
  g.pendingCombo=false;
  save(s);
  showToast(`// ${GATH_COMBOS.find(x=>x.id===comboId)?.name} 升至 Lv${cur+1}！`);
  renderHanaGame();
}

// 每20等改為自動給素材，不再需要選擇

// 牌型偵測
function gathGroupByNum(h){
  const m={};
  h.filter(c=>!c.wild).forEach(c=>(m[c.num]=m[c.num]||[]).push(c));
  return Object.values(m).sort((a,b)=>b.length-a.length);
}
function gathGroupBySuit(h){
  const m={};
  h.filter(c=>!c.wild).forEach(c=>(m[c.suit]=m[c.suit]||[]).push(c));
  return Object.values(m).sort((a,b)=>b.length-a.length);
}
function gathDetectStraight(h){
  const wilds=h.filter(c=>c.wild);
  const nums=[...new Set(h.filter(c=>!c.wild).map(c=>c.num))].sort((a,b)=>a-b);
  for(let i=0;i<nums.length;i++){
    let seq=[nums[i]];let gap=0;
    for(let j=i+1;j<nums.length;j++){
      const d=nums[j]-seq[seq.length-1];
      if(d===1)seq.push(nums[j]);
      else if(d>1&&gap+d-1<=wilds.length){gap+=d-1;seq.push(nums[j]);}
      if(seq.length>=5)break;
    }
    if(seq.length+wilds.length-gap>=5){
      return{ok:true,cards:h.filter(c=>seq.includes(c.num)||c.wild).slice(0,5)};
    }
  }
  return{ok:false};
}
function gathDetectStraightFlush(h){
  for(const suit of [...new Set(h.filter(c=>!c.wild).map(c=>c.suit))]){
    const r=gathDetectStraight([...h.filter(c=>c.suit===suit),...h.filter(c=>c.wild)]);
    if(r.ok)return r;
  }
  return{ok:false};
}
function gathBestCombo(sel){
  const wilds=sel.filter(c=>c.wild);
  const g=gathGroupByNum(sel);
  const gs=gathGroupBySuit(sel);
  // 同花順
  const sf=gathDetectStraightFlush(sel);
  if(sf.ok)return{combo:GATH_COMBOS[8],cards:sf.cards};
  // 四條
  const four=(g[0]||[]).length+wilds.length>=4;
  if(four){const c=[...(g[0]||[]),...wilds].slice(0,4);return{combo:GATH_COMBOS[7],cards:c};}
  // 葫蘆
  const hasThree=(g[0]||[]).length>=3||(g[0]||[]).length+wilds.length>=3;
  const hasPair=(g[1]||[]).length>=2;
  if(hasThree&&hasPair)return{combo:GATH_COMBOS[6],cards:[...(g[0]||[]).slice(0,3),...(g[1]||[]).slice(0,2)]};
  // 同花
  const flush=(gs[0]||[]).length+wilds.length>=5;
  if(flush)return{combo:GATH_COMBOS[5],cards:[...(gs[0]||[]),...wilds].slice(0,5)};
  // 順子
  const st=gathDetectStraight(sel);
  if(st.ok)return{combo:GATH_COMBOS[4],cards:st.cards};
  // 三條
  if((g[0]||[]).length+wilds.length>=3){const c=[...(g[0]||[]),...wilds].slice(0,3);return{combo:GATH_COMBOS[3],cards:c};}
  // 兩對
  if((g[0]||[]).length>=2&&(g[1]||[]).length>=2)return{combo:GATH_COMBOS[2],cards:[...(g[0]||[]).slice(0,2),...(g[1]||[]).slice(0,2)]};
  // 對子
  if((g[0]||[]).length+wilds.length>=2){const c=[...(g[0]||[]),...wilds].slice(0,2);return{combo:GATH_COMBOS[1],cards:c};}
  return{combo:GATH_COMBOS[0],cards:sel.slice(0,1)};
}

let harvSession={staged:[],tab:'play'}; // tab: 'play' | 'combo'

function harvToggleCard(id){
  const idx=harvSession.staged.findIndex(c=>c._id===id);
  if(idx>=0){
    harvSession.staged.splice(idx,1);
  } else {
    if(harvSession.staged.length>=5){showToast('// 最多選5張');return;}
    const {h}=loadHarv();
    const card=h.hand.find(c=>c._id===id);
    if(card)harvSession.staged.push(card);
  }
  renderHanaGame();
}

function harvPlay(){
  if(!harvSession.staged.length)return;
  const {h,s}=loadHarv();
  if(h.playsLeft<=0){showToast('// 今日出牌次數已用完');return;}
  const sel=harvSession.staged;
  const {combo,cards}=gathBestCombo(sel);
  const g=s.gath;
  const comboLv=(g.comboLv&&g.comboLv[combo.id])||0;
  const mult=comboLv+1;
  const drops={};
  cards.forEach(c=>{if(!c.wild)drops[c.key]=(drops[c.key]||0)+mult;});
  if(!s.bag)s.bag={materials:{},weapons:[],armors:[],items:{}};
  if(!s.bag.materials)s.bag.materials={};
  Object.entries(drops).forEach(([k,v])=>s.bag.materials[k]=(s.bag.materials[k]||0)+v);
  const playedIds=new Set(sel.map(c=>c._id));
  h.hand=h.hand.filter(c=>!playedIds.has(c._id));
  h.playsLeft--;
  // 出牌次數用完，清空手牌（明天重新補發）；否則補牌至上限
  if(h.playsLeft<=0){
    h.hand=[];
  } else {
    const need=(g.handMax||8)-h.hand.length;
    if(need>0){
      const pool=gathUnlockedPool(s);
      for(let i=0;i<need;i++){
        const c={...pool[Math.floor(Math.random()*pool.length)]};
        c._id=Math.random().toString(36).slice(2);
        h.hand.push(c);
      }
    }
  }
  harvSession.staged=[];
  if(!harvSession.log)harvSession.log=[];
  harvSession.log.unshift({combo:combo.name,mult,drops,comboLv});
  // EXP 在當天出牌全用完時才給（見 harvPlay 結尾判斷）
  // GATH 每出一牌 +1 EXP，每40點升1等，最高Lv100
  const lvBefore=(s.lifeSkills&&s.lifeSkills.GATH)?s.lifeSkills.GATH.lv:1;
  addLifeExp(s,'GATH',1);
  const lvAfter=s.lifeSkills.GATH.lv;
  for(let lv=lvBefore+1;lv<=lvAfter;lv++)gathOnLevelUp(lv,s);
  saveHarv(h,s);
  renderHanaGame();
  // 更新內頁 EXP header
  const _eh=document.getElementById('ls-exp-header');if(_eh)openLifeSkill('GATH');
}

function harvDiscard(){
  if(!harvSession.staged.length)return;
  const {h,s}=loadHarv();
  if(h.playsLeft<=0){showToast('// 今日採集已結束');return;}
  if(h.discardsLeft<=0){showToast('// 今日棄牌次數已用完');return;}
  const toDiscard=harvSession.staged.slice(0,5);
  if(harvSession.staged.length>5)showToast('// 單次最多棄5張');
  const ids=new Set(toDiscard.map(c=>c._id));
  h.hand=h.hand.filter(c=>!ids.has(c._id));
  const pool=gathUnlockedPool(s);
  for(let i=0;i<ids.size;i++){
    const c={...pool[Math.floor(Math.random()*pool.length)]};
    c._id=Math.random().toString(36).slice(2);
    h.hand.push(c);
  }
  h.discardsLeft--;
  harvSession.staged=[];
  saveHarv(h,s);
  renderHanaGame();
}

function gathCardHTML(c, idx, total, fanMode, noGlow, isCombo){
  const isSel=noGlow?false:harvSession.staged.some(x=>x._id===c._id);
  const hasSel=harvSession.staged.length>0;
  const isDimmed=false;
  const suitCls=c.wild?'suit-wild':`suit-${c.suit}`;
  const suit=GATH_SUITS.find(x=>x.id===c.suit);
  const sym=c.wild?'🃏':(suit?.sym||'');
  const numStr=c.wild?'★':(c.num<=10?String(c.num):['J','Q','K'][c.num-11]||c.num);
  const numCls=c.wild?'wild':(c.suit||'spade');
  let fanStyle='';
  if(false&&fanMode&&total>0){
    const t=(total<=1)?0.5:(idx/(total-1));
    const maxAngle=32;
    const angle=-maxAngle + t*maxAngle*2;
    const rad=angle*Math.PI/180;
    // 底部固定點在螢幕中央下方，用較大半徑展開
    const screenW=window.innerWidth-60;
    const cx=screenW/2-22;
    const radius=220;
    const x=cx + Math.sin(rad)*radius*0.7;
    const y=4+(1-Math.cos(Math.abs(rad)))*radius*0.12;
    fanStyle=`left:${x.toFixed(0)}px;bottom:${y.toFixed(0)}px;transform:rotate(${angle.toFixed(1)}deg);transform-origin:bottom center;z-index:${isSel?50:idx+1};`;
  }
  return`<div class="harv-card ${suitCls}${isSel?' selected':''}${isDimmed?' dimmed':''}${isCombo?' combo-card':''}" style="${fanStyle}" onclick="harvToggleCard('${c._id}')">
    <div class="harv-card-tl"><span class="harv-card-num ${numCls}">${numStr}</span></div>
    <div class="harv-card-center"><span class="harv-card-icon">${c.icon}</span><span class="harv-card-name">${c.name}</span></div>
    <div class="harv-card-br"><span class="harv-card-num ${numCls}">${numStr}</span></div>
  </div>`;
}

function renderHanaGame(container){
  if(!container){
    const c1=document.getElementById('ls-detail-content');
    if(c1 && c1.dataset.skill==='GATH') renderHanaGame(c1);
    return;
  }
  container.dataset.skill='GATH';
  const {h,s}=loadHarv();
  const g=s.gath;
  const gathExp=(s.lifeSkills&&s.lifeSkills.GATH)?s.lifeSkills.GATH.exp:0;
  const gathLv=(s.lifeSkills&&s.lifeSkills.GATH)?s.lifeSkills.GATH.lv:1;
  const staged=harvSession.staged;
  const hasPending=g.pendingPlant||g.pendingCombo;

  // 四色進度條（頂部）
  const suitBarHTML=GATH_SUITS.map(suit=>{
    const nums=g.unlocked[suit.id]||[];
    const maxNum=nums.length>0?Math.max(...nums):0;
    const canUp=g.pendingPlant&&maxNum<13;
    return`<div onclick="${canUp?`gathUpgradePlant('${suit.id}')`:''}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:${canUp?'pointer':'default'};">
      <span style="font-size:${canUp?'22px':'18px'};transition:.2s;${canUp?'animation:suitGlow .7s ease-in-out infinite alternate;filter:drop-shadow(0 0 6px '+suit.color+');':''}">${suit.icon}</span>
      <span style="font-family:var(--font-mono);font-size:8px;color:${canUp?suit.color:'rgba(255,255,255,.4)'};letter-spacing:1px;${canUp?'animation:gathGlow .7s ease-in-out infinite alternate;':''}">${suit.label}</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,.5);">${maxNum}/13</span>
    </div>`;
  }).join('');

  // Tab
  const tab=harvSession.tab||'play';
  const tabHTML=`<div style="width:100%;display:flex;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px;">
    <div onclick="harvSession.tab='play';renderHanaGame()" style="flex:1;text-align:center;padding:6px 0;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;cursor:pointer;${tab==='play'?'color:#88dd44;border-bottom:2px solid #88dd44;':'color:rgba(255,255,255,.3);'}">採集</div>
    <div onclick="harvSession.tab='combo';renderHanaGame()" style="flex:1;text-align:center;padding:6px 0;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;cursor:pointer;${tab==='combo'?'color:#88dd44;border-bottom:2px solid #88dd44;':g.pendingCombo?'color:#ffdc50;animation:gathGlow .7s ease-in-out infinite alternate;':'color:rgba(255,255,255,.3);'}">牌型${g.pendingCombo?' ▲':''}</div>
  </div>`;

  // 待處理強化提示
  let pendingHTML='';

  if(tab==='combo'){
    // 牌型頁
    const comboHTML=GATH_COMBOS.map(c=>{
      const lv=(g.comboLv&&g.comboLv[c.id])||0;
      const canUp=g.pendingCombo&&lv<5;
      return`<div onclick="${canUp?`gathUpgradeCombo('${c.id}')`:''}" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:3px;cursor:${canUp?'pointer':'default'};background:${canUp?'rgba(255,220,80,.04)':'transparent'};${canUp?'border-color:rgba(255,220,80,.4);':''}">
        <span style="font-family:var(--font-mono);font-size:11px;color:${canUp?'#ffdc50':'rgba(255,255,255,.7)'};letter-spacing:1px;">${c.name}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,.35);">×${lv+1}</span>
          <div style="display:flex;gap:2px;">${[0,1,2,3,4].map(i=>`<div style="width:8px;height:8px;border-radius:50%;background:${i<lv?'#ffdc50':'rgba(255,255,255,.1)'};"></div>`).join('')}</div>
          ${canUp?`<span style="font-family:var(--font-mono);font-size:8px;color:#ffdc50;">▲ 升等</span>`:''}
        </div>
      </div>`;
    }).join('');
    container.innerHTML=`<div class="harv-wrap">
      <div style="display:flex;gap:8px;width:100%;justify-content:space-around;padding:4px 0;">${suitBarHTML}</div>
      ${tabHTML}
      ${pendingHTML}
      <div style="width:100%;display:flex;flex-direction:column;gap:4px;">${comboHTML}</div>
      <div class="harv-stat-row"><span>GATH Lv${gathLv} <span style="color:rgba(136,221,68,.5);">${gathLv<100?`${gathExp}/40 EXP`:'MAX'}</span></span><span>出牌${g.plays||4} 棄牌${g.discards||3} 手牌${g.handMax||8}</span></div>
      <button onclick="(()=>{const s=load();if(s.harv){s.harv.date='';s.harv.hand=[];}save(s);harvSession.staged=[];harvSession.log=[];renderHanaGame();})()" style="flex:1;padding:4px;font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.06);background:transparent;cursor:pointer;">[DEV] 重置今日</button>
      <button onclick="(()=>{const s=load();if(!s.lifeSkills)s.lifeSkills={};s.lifeSkills.GATH={lv:19,exp:39};if(s.harv){s.harv.date='';s.harv.hand=[];}save(s);harvSession.staged=[];harvSession.log=[];renderHanaGame();})()" style="flex:1;padding:4px;font-family:var(--font-mono);font-size:8px;color:rgba(255,220,80,.3);border:1px solid rgba(255,220,80,.1);background:transparent;cursor:pointer;">[DEV] 升至Lv19+1</button>
    </div>`;
    return;
  }

  // 採集頁
  let comboTag='';
  let comboCardIds=new Set();
  if(staged.length){
    const{combo,cards}=gathBestCombo(staged);
    const lv=(g.comboLv&&g.comboLv[combo.id])||0;
    comboTag=`<div class="harv-combo-tag">🎴 ${combo.name} · Lv${lv} · ×${lv+1}</div>`;
    comboCardIds=new Set(cards.map(c=>c._id));
  } else {
    comboTag=`<div class="harv-combo-tag" style="color:rgba(255,220,80,.3);border-color:rgba(255,220,80,.15);">— 無 —</div>`;
  }
  const playedZoneHTML=staged.length
    ?staged.map(c=>{
      const isCombo=comboCardIds.has(c._id);
      return gathCardHTML(c,0,0,false,true,isCombo);
    }).join('')
    :`<span style="font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,.15);">選牌後在此顯示</span>`;
  const handCards=h.hand||[];
  const handHTML=handCards.map((c,i)=>gathCardHTML(c,i,handCards.length,true)).join('');
  const plantLookup={};
  Object.entries(GATH_DECK).forEach(([suit,arr])=>arr.forEach(([num,key,name,icon])=>{plantLookup[key]={name,icon,num,suit};}));
  const suitBg={spade:'linear-gradient(160deg,#e8f0ff,#d0e0ff)',heart:'linear-gradient(160deg,#ffe8e8,#ffd0d0)',club:'linear-gradient(160deg,#e8ffe8,#d0ffd0)',diamond:'linear-gradient(160deg,#fff8e0,#fff0b0)'};
  const suitNumColor={spade:'#2244aa',heart:'#cc2222',club:'#226622',diamond:'#aa6600'};

  const logHTML=(harvSession.log||[]).length?
    `<div style="display:flex;flex-direction:column;gap:8px;width:100%;">${
      (harvSession.log||[]).map(l=>{
        const cards=Object.entries(l.drops).map(([k,v])=>{
          const p=plantLookup[k]||{name:k,icon:'🌿',num:'?',suit:'club'};
          const bg=suitBg[p.suit]||suitBg.club;
          return`<div style="position:relative;width:40px;height:40px;border-radius:3px;background:${bg};border:2px solid rgba(0,0,0,.25);box-shadow:inset 0 0 0 1px rgba(255,255,255,.4),2px 2px 0 rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
            <span style="font-size:22px;line-height:1;">${p.icon}</span>
            <span style="position:absolute;bottom:1px;right:3px;font-family:Georgia,serif;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000;">${v}</span>
          </div>`;
        }).join('');
        const roundNum=(harvSession.log||[]).length - (harvSession.log||[]).indexOf(l);
        return`<div style="width:100%;display:flex;align-items:center;gap:8px;">
          <div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.3);min-width:18px;text-align:right;">${roundNum}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${cards}</div>
        </div>`;
      }).join('')
    }</div>`:'';
  const canPlay=h.playsLeft>0&&staged.length>0;
  const canDiscard=h.playsLeft>0&&h.discardsLeft>0&&staged.length>0;

  container.innerHTML=`<div class="harv-wrap">
    <div style="display:flex;gap:8px;width:100%;justify-content:space-around;padding:4px 0;">${suitBarHTML}</div>
    ${tabHTML}
    ${pendingHTML}
    <div class="harv-topbar">
      <span style="letter-spacing:2px;">// 採集</span>
      <span style="color:#88dd44;">出牌 ${h.playsLeft} · 棄牌 ${h.discardsLeft}</span>
    </div>
    <div class="harv-played-zone"><span class="harv-played-zone-label">// 選中</span>${playedZoneHTML}</div>
    ${comboTag}
    <div class="harv-acts">
      <button class="harv-btn" onclick="harvPlay()" ${canPlay?'':'disabled'}>✓ 出牌</button>
      <button class="harv-btn discard" onclick="harvDiscard()" ${canDiscard?'':'disabled'}>✕ 棄牌</button>
    </div>
    <div class="harv-hand-zone">${handHTML}</div>
    ${logHTML?`<div class="harv-log">${logHTML}</div>`:''}
    <button onclick="(()=>{const s=load();if(s.harv){s.harv.date='';s.harv.hand=[];}save(s);harvSession.staged=[];harvSession.log=[];renderHanaGame();})()" style="width:100%;padding:4px;font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.06);background:transparent;cursor:pointer;">[DEV] 重置今日</button>
  </div>`;
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
 *   - 常數 CRFT_WEAPONS / CRFT_ARMOR_PARTS / CRFT_ACC_PARTS /
 *           CRFT_TAB_LABELS / CRFT_RARITY_COLOR / WEAPON_ICONS / ARMOR_ICONS /
 *           CRFT_MATERIALS
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
 *   - CRFT_MATERIALS 是佔位資料(暫存武器/裝備材料清單),實際會與
 *     bag 中的 materials 對齊。
 *   - 已順手清掉 renderCrftGame / switchCrftTab 內對舊 ld-detail-content /
 *     ld-crft-tabs(已移除的左側抽屜)的 null 檢查死碼。
 * ════════════════════════════════════════════════════════════════════════ */

/* ── 製造 ── */
let crftTab='weapon';
let crftWeaponType=null;
let crftSlots={};        // { partKey: { matKey, qty } }
let crftCurrentPart=null; // 目前開著選單的 partKey

const CRFT_WEAPONS={
  sword1:  {name:'單手劍',icon:'⚔️', parts:[{key:'blade',label:'劍刃',qty:11},{key:'grip',label:'劍柄',qty:5}]},
  dagger:  {name:'匕首',  icon:'🗡️', parts:[{key:'blade',label:'刀刃',qty:6}, {key:'grip',label:'刀柄',qty:4}]},
  rapier:  {name:'細劍',  icon:'🤺', parts:[{key:'blade',label:'劍身',qty:10},{key:'grip',label:'護手',qty:4}]},
  greatsword:{name:'大劍',icon:'🔱', parts:[{key:'blade',label:'巨刃',qty:18},{key:'grip',label:'劍柄',qty:6}]},
  mace:    {name:'單手錘',icon:'🔨', parts:[{key:'blade',label:'錘頭',qty:10},{key:'grip',label:'錘柄',qty:6}]},
  tachi:   {name:'太刀',  icon:'⛩️', parts:[{key:'blade',label:'刀身',qty:17},{key:'grip',label:'刀柄',qty:4}]},
  spear:   {name:'長槍',  icon:'🏹', parts:[{key:'blade',label:'槍頭',qty:6}, {key:'grip',label:'槍桿',qty:12}]},
  axe:     {name:'雙手斧',icon:'🪓', parts:[{key:'blade',label:'斧刃',qty:8}, {key:'grip',label:'斧柄',qty:14}]},
  shield:  {name:'盾牌',  icon:'🛡️', parts:[{key:'blade',label:'盾面',qty:12},{key:'grip',label:'盾框',qty:4}]},
};

// 裝備八部位，每部位一格（qty=1）
const CRFT_ARMOR_PARTS=[
  {key:'helmet', label:'頭盔', icon:'⛑️', qty:1},
  {key:'chest',  label:'上衣', icon:'🥻', qty:1},
  {key:'pants',  label:'褲子', icon:'👖', qty:1},
  {key:'boots',  label:'靴子', icon:'👢', qty:1},
  {key:'main',   label:'主手', icon:'⚔️', qty:1},
  {key:'off',    label:'副手', icon:'🛡️', qty:1},
  {key:'acc',    label:'飾品', icon:'💍', qty:1, sub:true},
];
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

// 武器/防具圖示
const WEAPON_ICONS={one_sword:'🗡️',dagger:'🔪',rapier:'⚡',katana:'🌸',two_sword:'⚔️',spear:'🔱',axe:'🪓',mace:'🔨',bow:'🏹',staff:'🪄'};
const ARMOR_ICONS={helmet:'⛑️',chest:'🛡️',pants:'🦺',boots:'👢',acc:'💍'};
const CRFT_RARITY_COLOR={common:'#aaaaaa',rare:'#4499ff',epic:'#aa66ff'};

function renderCrftGame(container){
  if(!container){
    const c1=document.getElementById('ls-detail-content');
    if(c1 && c1.querySelector('.crft-wrap')) renderCrftGame(c1);
    return;
  }
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
  if(crftTab==='weapon') container.innerHTML=renderCrftWeaponHtml();
  else if(crftTab==='armor') container.innerHTML=renderCrftArmorHtml();
  else if(crftTab==='potion') container.innerHTML=renderCrftPotionHtml();
  else container.innerHTML=`<div class="crft-empty">// COMING SOON</div>`;
}

function renderCrftWeaponHtml(){
  const typeRow=Object.entries(CRFT_WEAPONS).map(([k,w])=>`
    <div class="crft-type-btn${crftWeaponType===k?' active':''}" onclick="selectCrftWeapon('${k}')">
      <span class="crft-type-name">${w.name}</span>
    </div>`).join('');

  let slotsHtml='';
  if(crftWeaponType){
    const w=CRFT_WEAPONS[crftWeaponType];
    slotsHtml=`<div style="display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4) var(--s2);border-bottom:1px solid rgba(255,170,51,.12);margin-bottom:var(--s2);">
      <span style="font-family:var(--font-mono);font-size:13px;color:var(--blue);cursor:pointer;letter-spacing:1px;" onclick="crftWeaponType=null;crftSlots={};renderCrftGame()">‹ 返回</span>
      <span style="font-family:var(--font-mono);font-size:13px;color:#fff;letter-spacing:2px;">${w.icon} ${w.name}</span>
    </div>`+
    `<div class="crft-parts">`+
      w.parts.map(p=>{
        const mats=crftSlots[p.key]||[];
        const filled=mats.length>0;
        const preview=mats.map(m=>{
          const info=CRFT_MATERIALS.find(x=>x.key===m.matKey);
          const color=CRFT_RARITY_COLOR[info?.rarity]||'#ffaa33';
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
    `</div><button class="crft-make-btn" onclick="crftMake()">▶ 製　造</button>`;
  }

  if(crftWeaponType){
    return`<div class="crft-wrap">${slotsHtml}</div>`;
  }
  return`<div class="crft-wrap">
    <div class="crft-type-row">${typeRow}</div>
  </div>`;
}

function selectCrftWeapon(key){
  crftWeaponType=key; crftSlots={}; crftCurrentPart=null;
  closeDD('crft');
  renderCrftGame();
}

let crftArmorType=null; // 目前選中的裝備部位 key

function renderCrftArmorHtml(){
  // 第三層：飾品子項目選好後的素材放入頁
  if(crftArmorType==='acc'&&crftAccType){
    const p=CRFT_ACC_PARTS.find(x=>x.key===crftAccType);
    const mats=crftArmorSlots[crftAccType]||[];
    const filled=mats.length>0;
    const preview=mats.map(m=>{
      const info=CRFT_MATERIALS.find(x=>x.key===m.matKey);
      const color=CRFT_RARITY_COLOR[info?.rarity]||'#ffaa33';
      return`<div class="crft-slot-mat-row" style="--mc:${color}">
        <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
        <span class="crft-slot-mat-qty">×${m.qty}</span>
      </div>`;
    }).join('');
    return`<div class="crft-wrap">
      <div style="display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4) var(--s2);border-bottom:1px solid rgba(255,170,51,.12);margin-bottom:var(--s2);">
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--blue);cursor:pointer;letter-spacing:1px;" onclick="crftAccType=null;renderCrftGame()">‹ 返回</span>
        <span style="font-family:var(--font-mono);font-size:13px;color:#fff;letter-spacing:2px;">${p.label}</span>
      </div>
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

  // 第二層：飾品子項目列表
  if(crftArmorType==='acc'){
    const accRow=CRFT_ACC_PARTS.map(p=>`
      <div class="crft-type-btn" onclick="crftAccType='${p.key}';renderCrftGame()">
        <span class="crft-type-name">${p.label}</span>
      </div>`).join('');
    return`<div class="crft-wrap">
      <div style="display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4) var(--s2);border-bottom:1px solid rgba(255,170,51,.12);margin-bottom:var(--s2);">
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--blue);cursor:pointer;letter-spacing:1px;" onclick="crftArmorType=null;renderCrftGame()">‹ 返回</span>
        <span style="font-family:var(--font-mono);font-size:13px;color:#fff;letter-spacing:2px;">飾品</span>
      </div>
      <div class="crft-type-row">${accRow}</div>
    </div>`;
  }

  // 第二層：一般部位素材放入頁
  if(crftArmorType){
    const p=CRFT_ARMOR_PARTS.find(x=>x.key===crftArmorType);
    const mats=crftArmorSlots[p.key]||[];
    const filled=mats.length>0;
    const preview=mats.map(m=>{
      const info=CRFT_MATERIALS.find(x=>x.key===m.matKey);
      const color=CRFT_RARITY_COLOR[info?.rarity]||'#ffaa33';
      return`<div class="crft-slot-mat-row" style="--mc:${color}">
        <span class="crft-slot-mat-name">${info?.name||m.matKey}</span>
        <span class="crft-slot-mat-qty">×${m.qty}</span>
      </div>`;
    }).join('');
    return`<div class="crft-wrap">
      <div style="display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4) var(--s2);border-bottom:1px solid rgba(255,170,51,.12);margin-bottom:var(--s2);">
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--blue);cursor:pointer;letter-spacing:1px;" onclick="crftArmorType=null;renderCrftGame()">‹ 返回</span>
        <span style="font-family:var(--font-mono);font-size:13px;color:#fff;letter-spacing:2px;">${p.label}</span>
      </div>
      <div class="crft-parts">
        <div class="crft-part-row">
          <div class="crft-part-label"><span class="crft-part-label-name">${p.label}</span><span class="crft-part-label-qty">×${p.qty}</span></div>
          <div class="crft-part-slot${filled?' filled':''}" onclick="crftPickMaterial('${p.key}','armor')">
            ${filled?preview:`<span class="crft-slot-plus">＋</span>`}
          </div>
        </div>
      </div>
      <button class="crft-make-btn" onclick="crftMakeArmor()">▶ 製　造</button>
    </div>`;
  }

  // 第一層：部位列表
  const typeRow=CRFT_ARMOR_PARTS.map(p=>`
    <div class="crft-type-btn" onclick="selectCrftArmor('${p.key}')">
      <span class="crft-type-name">${p.label}</span>
    </div>`).join('');
  return`<div class="crft-wrap"><div class="crft-type-row">${typeRow}</div></div>`;
}

function selectCrftArmor(key){
  crftArmorType=key; crftAccType=null;
  if(!crftArmorSlots[key])crftArmorSlots[key]=[];
  renderCrftGame();
}

function crftMakeArmor(){
  if(!crftArmorType){showToast('// 請先選擇部位');return;}
  const slot=crftArmorSlots[crftArmorType];
  if(!slot||slot.length===0){showToast('// 請放入素材');return;}
  showToast('// 裝備製造功能開發中');
}


// 佔位素材清單
const CRFT_MATERIALS=[
  {key:'iron_ore',     name:'鐵礦石',   rarity:'common', stock:12, category:'craft'},
  {key:'steel_ingot',  name:'精鋼錠',   rarity:'rare',   stock:5,  category:'craft'},
  {key:'dark_crystal', name:'暗黑晶石', rarity:'epic',   stock:2,  category:'craft'},
  {key:'oak_wood',     name:'橡木',     rarity:'common', stock:8,  category:'craft'},
  {key:'bone_handle',  name:'獸骨柄',   rarity:'rare',   stock:3,  category:'craft'},
  {key:'iron_plate',   name:'鐵板',     rarity:'common', stock:7,  category:'craft'},
  {key:'mithril',      name:'秘銀板',   rarity:'rare',   stock:1,  category:'craft'},
  {key:'crystal_core', name:'水晶芯',   rarity:'rare',   stock:4,  category:'craft'},
  {key:'moongrass',    name:'月光草',   rarity:'common', stock:6,  category:'plant'},
  {key:'sunflower',    name:'太陽花',   rarity:'common', stock:3,  category:'plant'},
  // ── 採集植物（樹木♠）──
  {key:'twig',             name:'細枝',     rarity:'common', stock:0, category:'plant'},
  {key:'woodchip',         name:'木片',     rarity:'common', stock:0, category:'plant'},
  {key:'oak_wood',         name:'橡木',     rarity:'common', stock:0, category:'plant'},
  {key:'pine_wood',        name:'松木',     rarity:'common', stock:0, category:'plant'},
  {key:'maple_wood',       name:'楓木',     rarity:'common', stock:0, category:'plant'},
  {key:'cherry_wood',      name:'櫻木',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'dark_wood',        name:'黑木',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'iron_wood',        name:'鐵木',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'dragonblood_wood', name:'龍血木',   rarity:'rare',   stock:0, category:'plant'},
  {key:'star_wood',        name:'星木',     rarity:'rare',   stock:0, category:'plant'},
  {key:'laurel_wood',      name:'月桂木',   rarity:'rare',   stock:0, category:'plant'},
  {key:'spirit_wood',      name:'靈木',     rarity:'epic',   stock:0, category:'plant'},
  {key:'yggdrasil_bark',   name:'世界樹幹', rarity:'epic',   stock:0, category:'plant'},
  // ── 採集植物（葉子♥）──
  {key:'weed',         name:'雜草',   rarity:'common', stock:0, category:'plant'},
  {key:'mint',         name:'薄荷葉', rarity:'common', stock:0, category:'plant'},
  {key:'basil',        name:'羅勒',   rarity:'common', stock:0, category:'plant'},
  {key:'eucalyptus',   name:'尤加利', rarity:'common', stock:0, category:'plant'},
  {key:'spirit_herb',  name:'靈藥草', rarity:'uncommon',stock:0,category:'plant'},
  {key:'silver_herb',  name:'銀葉草', rarity:'uncommon',stock:0,category:'plant'},
  {key:'star_moss',    name:'星光苔', rarity:'uncommon',stock:0,category:'plant'},
  {key:'dragon_tongue',name:'龍舌草', rarity:'rare',   stock:0, category:'plant'},
  {key:'dream_leaf',   name:'幻夢葉', rarity:'rare',   stock:0, category:'plant'},
  {key:'eternal_leaf', name:'不老葉', rarity:'rare',   stock:0, category:'plant'},
  {key:'divine_leaf',  name:'神木葉', rarity:'epic',   stock:0, category:'plant'},
  {key:'mandragora',   name:'曼陀羅', rarity:'epic',   stock:0, category:'plant'},
  // ── 採集植物（花朵♣）──
  {key:'wildflower',     name:'野花',     rarity:'common', stock:0, category:'plant'},
  {key:'daisy',          name:'雛菊',     rarity:'common', stock:0, category:'plant'},
  {key:'lavender',       name:'薰衣草',   rarity:'common', stock:0, category:'plant'},
  {key:'rose',           name:'玫瑰',     rarity:'common', stock:0, category:'plant'},
  {key:'lotus',          name:'蓮花',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'night_bloom',    name:'夜來香',   rarity:'uncommon',stock:0,category:'plant'},
  {key:'star_flower',    name:'星辰花',   rarity:'uncommon',stock:0,category:'plant'},
  {key:'higanbana',      name:'彼岸花',   rarity:'rare',   stock:0, category:'plant'},
  {key:'phantom_flower', name:'幻光花',   rarity:'rare',   stock:0, category:'plant'},
  {key:'sacred_lily',    name:'神聖百合', rarity:'rare',   stock:0, category:'plant'},
  {key:'soul_flower',    name:'靈魂花',   rarity:'epic',   stock:0, category:'plant'},
  {key:'eternal_rose',   name:'永恆薔薇', rarity:'epic',   stock:0, category:'plant'},
  // ── 採集植物（果實♦）──
  {key:'wild_berry',     name:'野莓',     rarity:'common', stock:0, category:'plant'},
  {key:'apple',          name:'蘋果',     rarity:'common', stock:0, category:'plant'},
  {key:'blueberry',      name:'藍莓',     rarity:'common', stock:0, category:'plant'},
  {key:'peach',          name:'蜜桃',     rarity:'common', stock:0, category:'plant'},
  {key:'kumquat',        name:'金柑',     rarity:'common', stock:0, category:'plant'},
  {key:'star_fruit',     name:'星果',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'moon_pear',      name:'月梨',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'dragon_eye',     name:'龍眼',     rarity:'uncommon',stock:0,category:'plant'},
  {key:'phoenix_pine',   name:'鳳梨',     rarity:'rare',   stock:0, category:'plant'},
  {key:'dream_grape',    name:'夢幻葡萄', rarity:'rare',   stock:0, category:'plant'},
  {key:'immortal_peach', name:'仙桃',     rarity:'rare',   stock:0, category:'plant'},
  {key:'spirit_fruit',   name:'靈果',     rarity:'epic',   stock:0, category:'plant'},
  {key:'golden_apple',   name:'金蘋果',   rarity:'epic',   stock:0, category:'plant'},
  {key:'spirit_herb',  name:'靈藥草',   rarity:'rare',   stock:2,  category:'plant'},
  {key:'copper_ore',   name:'銅礦',     rarity:'common', stock:9,  category:'ore'},
  {key:'silver_ore',   name:'銀礦',     rarity:'rare',   stock:4,  category:'ore'},
  {key:'gold_ore',     name:'金礦',     rarity:'rare',   stock:1,  category:'ore'},
  {key:'goblin_fang',  name:'哥布林獠牙',rarity:'common',stock:5,  category:'mob'},
  {key:'wolf_pelt',    name:'狼皮',     rarity:'common', stock:3,  category:'mob'},
  {key:'dragon_scale', name:'龍鱗',     rarity:'epic',   stock:1,  category:'mob'},
  // 狩獵掉落
  {key:'boar_meat',    name:'野豬肉',   rarity:'common', stock:0,  category:'mob'},
  {key:'beast_hide',   name:'獸皮',     rarity:'common', stock:0,  category:'mob'},
  {key:'rare_fang',    name:'稀有獠牙', rarity:'rare',   stock:0,  category:'mob'},
  // 挖礦掉落
  {key:'raw_iron',     name:'粗鐵塊',   rarity:'common', stock:0,  category:'ore'},
  {key:'raw_silver',   name:'粗銀塊',   rarity:'rare',   stock:0,  category:'ore'},
  {key:'gem_shard',    name:'寶石碎片', rarity:'rare',   stock:0,  category:'ore'},
  // 採集掉落
  {key:'star_crystal', name:'星晶',     rarity:'common', stock:0,  category:'plant'},
  {key:'fire_crystal', name:'火晶',     rarity:'rare',   stock:0,  category:'plant'},
  {key:'dark_crystal2',name:'暗晶',     rarity:'rare',   stock:0,  category:'plant'},
  {key:'wind_crystal', name:'風晶',     rarity:'rare',   stock:0,  category:'plant'},
  {key:'earth_crystal',name:'土晶',     rarity:'common', stock:0,  category:'plant'},
];

let crftCurrentMode='weapon'; // 'weapon' | 'armor'

function crftPickMaterial(partKey, mode='weapon'){
  crftCurrentPart=partKey;
  crftCurrentMode=mode;
  const slots=mode==='armor'?crftArmorSlots:crftSlots;
  const parts=mode==='armor'?CRFT_ARMOR_PARTS:CRFT_WEAPONS[crftWeaponType]?.parts||[];
  const part=parts.find(p=>p.key===partKey);
  document.getElementById('crft-dd-title').textContent=`選擇素材 — ${part?.label||partKey}`;
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
  const parts=crftCurrentMode==='armor'?CRFT_ARMOR_PARTS:CRFT_WEAPONS[crftWeaponType]?.parts||[];
  const part=parts.find(p=>p.key===crftCurrentPart);
  const reqQty=part?.qty||1;
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

  CRFT_MATERIALS.forEach(mat=>{
    const entry=mats.find(m=>m.matKey===mat.key);
    const qty=entry?entry.qty:0;
    const isSelected=qty>0;
    // 這個素材的上限 = reqQty 扣掉其他素材已佔數量
    const otherQty=mats.filter(m=>m.matKey!==mat.key).reduce((s,m)=>s+m.qty,0);
    const maxForThis=reqQty-otherQty;
    const canAdd=maxForThis>qty; // 還能再加

    const row=document.createElement('div');
    row.className='crft-dd-row'+(isSelected?' selected':'');
    row.style.setProperty('--rc', CRFT_RARITY_COLOR[mat.rarity]||'#aaaaaa');
    if(!canAdd&&!isSelected)row.style.opacity='0.35';

    const left=document.createElement('div');
    left.className='crft-dd-left';
    left.innerHTML=`<span class="crft-dd-name">${mat.name}</span>`;
    left.onclick=()=>{
      if(!canAdd&&!isSelected)return;
      if(!entry){mats.push({matKey:mat.key,qty:1});}
      else if(canAdd){entry.qty++;}
      renderCrftDDList();renderCrftGame();
    };
    // 長按清除該素材
    let pressTimer=null;
    left.addEventListener('touchstart',()=>{
      pressTimer=setTimeout(()=>{
        pressTimer=null;
        const s=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
        const idx=(s[crftCurrentPart]||[]).findIndex(m=>m.matKey===mat.key);
        if(idx!==-1){s[crftCurrentPart].splice(idx,1);renderCrftDDList();renderCrftGame();}
      },500);
    },{passive:true});
    left.addEventListener('touchend',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    left.addEventListener('touchmove',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    left.oncontextmenu=(e)=>{
      e.preventDefault();
      const s=crftCurrentMode==='armor'?crftArmorSlots:crftSlots;
      const idx=(s[crftCurrentPart]||[]).findIndex(m=>m.matKey===mat.key);
      if(idx!==-1){s[crftCurrentPart].splice(idx,1);renderCrftDDList();renderCrftGame();}
    };

    // 右側：持有 + 數量控制合併
    const right=document.createElement('div');
    right.className='crft-dd-qty-ctrl';
    right.innerHTML=
      (isSelected
        ?`<button class="crft-qty-btn" onclick="crftQtyAdj('${mat.key}',-1);event.stopPropagation()">−</button>`+
          `<input class="crft-qty-input" type="number" min="0" max="${maxForThis}" value="${qty}" `+
            `onchange="crftQtySet('${mat.key}',this.value)" onclick="event.stopPropagation()">`+
          `<button class="crft-qty-btn" onclick="crftQtyAdj('${mat.key}',1);event.stopPropagation()" ${!canAdd?'disabled style="opacity:.3"':''}>＋</button>`
        :'')+
      `<div class="crft-dd-stock-wrap">
        <span class="crft-dd-stock-lbl">持有</span>
        <span class="crft-dd-stock-num${mat.stock<=0?' zero':''}">${mat.stock}</span>
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
    const parts=crftCurrentMode==='armor'?CRFT_ARMOR_PARTS:CRFT_WEAPONS[crftWeaponType]?.parts||[];
    const part=parts.find(p=>p.key===crftCurrentPart);
    const reqQty=part?.qty||1;
    const otherQty=mats.filter((_,i)=>i!==idx).reduce((s,m)=>s+m.qty,0);
    const max=reqQty-otherQty;
    if(mats[idx].qty>=max)return;
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
    const parts=crftCurrentMode==='armor'?CRFT_ARMOR_PARTS:CRFT_WEAPONS[crftWeaponType]?.parts||[];
    const part=parts.find(p=>p.key===crftCurrentPart);
    const reqQty=part?.qty||1;
    const otherQty=mats.filter((_,i)=>i!==idx).reduce((s,m)=>s+m.qty,0);
    mats[idx].qty=Math.min(n, reqQty-otherQty);
  }
  renderCrftDDList();renderCrftGame();
}

function crftMake(){
  if(!crftWeaponType){showToast('// 請先選擇武器種類');return;}
  const w=CRFT_WEAPONS[crftWeaponType];
  const missing=w.parts.filter(p=>!(crftSlots[p.key]?.length>0));
  if(missing.length){showToast(`// 缺少素材：${missing.map(p=>p.label).join('、')}`);return;}
  showToast(`// ${w.name} — 製造功能開發中`);
}

// ── 藥水資料 ──
const POTION_BASES=[
  {key:'water',  name:'普通水', rarity:'common', range:[10,30],  icon:'💧'},
  {key:'spring', name:'礦泉水', rarity:'rare',   range:[30,60],  icon:'🌊'},
  {key:'holy',   name:'聖水',   rarity:'epic',   range:[60,100], icon:'✨'},
];
const POTION_RARITY_COLOR={common:'#aaaaaa',rare:'#4499ff',epic:'#aa66ff'};

// 藥水三個槽都用 [{matKey,qty},...] 結構，base 只能單選
let crftPotionSlots={base:null, effect:[], modifier:[]};
let crftPotionPickTarget=null;

function renderCrftPotionHtml(){
  const base=crftPotionSlots.base?POTION_BASES.find(b=>b.key===crftPotionSlots.base):null;

  // 預覽
  let previewHtml='';
  if(base){
    const [lo,hi]=base.range;
    const rc=POTION_RARITY_COLOR[base.rarity];
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
      const info=CRFT_MATERIALS.find(x=>x.key===m.matKey);
      const color=CRFT_RARITY_COLOR[info?.rarity]||'#ffaa33';
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
        ?`<div class="crft-slot-mat-row" style="--mc:${POTION_RARITY_COLOR[base.rarity]}">
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
      const rc=POTION_RARITY_COLOR[b.rarity];
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

    CRFT_MATERIALS.forEach(mat=>{
      const entry=mats.find(m=>m.matKey===mat.key);
      const qty=entry?entry.qty:0;
      const isSelected=qty>0;
      const row=document.createElement('div');
      row.className='crft-dd-row'+(isSelected?' selected':'');
      row.style.setProperty('--rc',CRFT_RARITY_COLOR[mat.rarity]||'#aaaaaa');

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

// 切換 tab 時重置藥水
function switchCrftTab(tab, el){
  crftTab=tab;
  if(tab==='weapon'){crftWeaponType=null;crftSlots={};}
  if(tab==='armor'){crftArmorType=null;}
  if(tab==='potion'){crftPotionSlots={base:null,effect:[],modifier:[]};}
  const tabsId=el.closest('#ls-crft-tabs')?'ls-detail-content':null;
  const container=tabsId?document.getElementById(tabsId):null;
  if(container)renderCrftGame(container);
  else renderCrftGame();
}
