/* ========================================================================
 * chest.js — 寶箱小遊戲系統(Phase 6)
 *
 * 5 種稀有度 × 3 種小遊戲玩法:
 *   - common (qte)   : 旋轉指針停在綠區
 *   - rare/epic (code): 4位密碼 5次猜測
 *   - legend/myth (color): 記憶顏色 + 在色輪選同色
 *
 * 內容:
 *   1. 設定 CHEST_RARITY(各稀有度的玩法、難度、獎勵)
 *   2. 狀態 chestState
 *   3. 主入口 openChestGame / closeChestGame
 *   4. 共用 randomHSV / hsvToHex
 *   5. Color minigame:
 *      - 流程 startMemorizePhase / startPickPhase / chestConfirmColor / showChestResult
 *      - 互動 updatePickLabel / drawColorWheel / setupWheelInteraction
 *   6. Code minigame:
 *      - 流程 startCodeGame / codeSubmit
 *      - 渲染 renderCodeInput / renderCodeNumpad
 *      - 鍵盤 codeInputDigit / codeDeleteDigit
 *   7. QTE minigame:
 *      - 狀態 qteRAF / qteAngle / qteSpeed / qteZoneStart / qteZoneSize
 *      - 流程 startQteGame / qteLoop / drawQte / qteTap
 *   8. 陷阱 triggerTrap(寶箱失敗或陷阱節點)
 *
 * 依賴:
 *   - state.js / storage.js / utils.js
 *   - bag.js: bagAddMaterial / bagAddItem(實際在 skills.js)
 *   - battle.js: renderMap / updateMapHp / renderNextChoices(關閉後刷新地圖)
 * ======================================================================== */


// ══════════════════════════════════════════
// 寶箱小遊戲系統
// ══════════════════════════════════════════

const CHEST_RARITY = {
  common: { gameType:'qte',   label:'普通寶箱' },
  rare:   { gameType:'code',  digits:4, guesses:5, label:'稀有寶箱' },
  epic:   { gameType:'code',  digits:4, guesses:5, label:'史詩寶箱' },
  legend: { gameType:'color', colors:1, memTime:5000, label:'傳說寶箱' },
  myth:   { gameType:'color', colors:1, memTime:5000, label:'神話寶箱' },
};

/* 寶箱掉落表(階段:農田整合):每階寶箱掉 1-2 顆素材 + 機率掉 1 顆種子。
 * perfect = true 時種子機率 100%(完美 color game)。 */
const CHEST_LOOT = {
  common: { matPool:['iron_ore','copper_ore','wolf_pelt'],            seedPool:['seed_weed','seed_mint'],          seedPct:60 },
  rare:   { matPool:['steel_ingot','spirit_herb','beast_hide'],       seedPool:['seed_moongrass','seed_rose'],     seedPct:70 },
  epic:   { matPool:['mithril','spirit_herb','dragon_scale'],         seedPool:['seed_apple','seed_lotus'],        seedPct:80 },
  legend: { matPool:['mithril','dragon_scale','shadow_crystal'],      seedPool:['seed_spirit_herb'],               seedPct:90 },
  myth:   { matPool:['shadow_crystal','dragon_scale'],                seedPool:['seed_golden_apple'],              seedPct:100 },
};

function _rollChestRewards(rarity, perfect){
  const cfg = CHEST_LOOT[rarity] || CHEST_LOOT.common;
  const drops = [];
  // 1-2 顆素材
  const matCount = 1 + (Math.random() < 0.5 ? 1 : 0);
  for(let i=0; i<matCount; i++){
    const k = cfg.matPool[Math.floor(Math.random()*cfg.matPool.length)];
    const existing = drops.find(d => d.key === k);
    if(existing) existing.qty += 1;
    else drops.push({key:k, qty:1});
  }
  // 機率掉 1 顆種子(perfect 強制給)
  if(perfect || Math.random()*100 < cfg.seedPct){
    const sk = cfg.seedPool[Math.floor(Math.random()*cfg.seedPool.length)];
    drops.push({key:sk, qty:1});
  }
  return drops;
}

let chestState = {
  node: null, rarity: null, cfg: null,
  isTrap: false, trapPhase: null,
  // color game
  targetColors: [], pickedColors: [], currentPick: 0,
  currentHSV: {h:0, s:1, v:1},
  // code game
  secretCode: [], currentInput: [], history: [], attemptsLeft: 5,
  phase: 'idle',
};

function openChestGame(node){
  const rarity = node.rarity || 'common';
  const cfg = CHEST_RARITY[rarity] || CHEST_RARITY.common;
  const luk = mockChar.LUK || 3;
  const trapChance = node.kind==='trap' ? 0.7 : Math.max(0.05, 0.25 - luk*0.02);
  const isTrap = Math.random() < trapChance;
  let trapPhase = null;
  if(isTrap){ trapPhase = Math.random()<0.5 ? 'during' : 'after'; }

  chestState = {
    node, rarity, cfg, isTrap, trapPhase,
    targetColors:[], pickedColors:[], currentPick:0, currentHSV:{h:0,s:1,v:1},
    secretCode:[], currentInput:[], history:[], attemptsLeft: cfg.guesses||5,
    phase:'start',
  };

  document.getElementById('chest-title').textContent = `// ${cfg.label}`;
  document.getElementById('chest-overlay').classList.add('show');

  if(cfg.gameType==='qte'){
    startQteGame();
  } else if(cfg.gameType==='code'){
    chestState.secretCode = Array.from({length:cfg.digits}, ()=>Math.floor(Math.random()*10));
    startCodeGame();
  } else {
    chestState.targetColors = Array.from({length:cfg.colors}, ()=>randomHSV());
    startMemorizePhase(cfg.memTime);
  }
}

function randomHSV(){
  return { h: Math.random()*360, s: 0.5+Math.random()*0.5, v: 0.6+Math.random()*0.4 };
}

function hsvToHex(h, s, v){
  let r,g,b;
  const i=Math.floor(h/60)%6, f=h/60-Math.floor(h/60);
  const p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  [r,g,b]=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}

function startMemorizePhase(duration){
  chestState.phase='memorize';
  document.getElementById('chest-memorize-phase').style.display='';
  document.getElementById('chest-pick-phase').style.display='none';
  document.getElementById('chest-result-phase').style.display='none';

  // 顯示目標顏色
  const wrap=document.getElementById('chest-target-colors');
  wrap.innerHTML=chestState.targetColors.map(c=>{
    const hex=hsvToHex(c.h,c.s,c.v);
    return `<div class="chest-color-swatch" style="background:${hex};"></div>`;
  }).join('');

  // 計時條動畫
  const bar=document.getElementById('chest-mem-bar');
  bar.style.transition='none'; bar.style.width='100%';
  requestAnimationFrame(()=>{
    bar.style.transition=`width ${duration}ms linear`;
    bar.style.width='0%';
  });

  // 陷阱：during 在記憶階段中途觸發
  if(chestState.isTrap && chestState.trapPhase==='during'){
    setTimeout(()=>triggerTrap(), duration*0.5);
    return;
  }

  setTimeout(()=>startPickPhase(), duration);
}

function startPickPhase(){
  chestState.phase='pick';
  chestState.currentPick=0;
  chestState.pickedColors=[];
  document.getElementById('chest-memorize-phase').style.display='none';
  const pp=document.getElementById('chest-pick-phase');
  pp.style.display='flex';

  // 建立選色佔位格
  const sels=document.getElementById('chest-selections');
  sels.innerHTML=chestState.targetColors.map((_,i)=>
    `<div class="chest-sel-swatch" id="chest-sel-${i}"></div>`
  ).join('');

  updatePickLabel();
  drawColorWheel();
  setupWheelInteraction();
}

function updatePickLabel(){
  const total=chestState.targetColors.length;
  const cur=chestState.currentPick+1;
  document.getElementById('chest-pick-label').textContent=`重現顏色 ${cur}/${total}`;
}

function drawColorWheel(){
  const canvas=document.getElementById('chest-wheel');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const cx=110, cy=110, r=105;
  // 色相環
  for(let a=0;a<360;a++){
    const rad=a*Math.PI/180;
    const g=ctx.createLinearGradient(cx,cy,cx+r*Math.cos(rad),cy+r*Math.sin(rad));
    g.addColorStop(0,'white');
    g.addColorStop(1,`hsl(${a},100%,50%)`);
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,rad,(a+2)*Math.PI/180);
    ctx.fillStyle=g;
    ctx.fill();
  }
  // 中心黑色漸層
  const dark=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  dark.addColorStop(0,'rgba(0,0,0,1)');
  dark.addColorStop(0.5,'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=dark;
  ctx.fill();
}

function setupWheelInteraction(){
  const canvas=document.getElementById('chest-wheel');
  const dot=document.getElementById('chest-picker-dot');
  if(!canvas)return;

  function pick(e){
    const rect=canvas.getBoundingClientRect();
    const scaleX=220/rect.width, scaleY=220/rect.height;
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    const x=(cx-rect.left)*scaleX-110;
    const y=(cy-rect.top)*scaleY-110;
    const r=Math.sqrt(x*x+y*y);
    if(r>105)return;
    const h=((Math.atan2(y,x)*180/Math.PI)+360)%360;
    const s=r/105;
    const v=1-r/220;
    chestState.currentHSV={h,s,v};
    // 移動點
    dot.style.display='';
    dot.style.left=(110+x)+'px';
    dot.style.top=(110+y)+'px';
    dot.style.background=hsvToHex(h,s,v);
    // 預覽當前格
    const sel=document.getElementById('chest-sel-'+chestState.currentPick);
    if(sel)sel.style.background=hsvToHex(h,s,v);
  }

  canvas.ontouchstart=canvas.ontouchmove=e=>{e.preventDefault();pick(e);};
  canvas.onmousedown=canvas.onmousemove=e=>{if(e.buttons)pick(e);};
}

function chestConfirmColor(){
  const {h,s,v}=chestState.currentHSV;
  chestState.pickedColors.push({h,s,v});
  chestState.currentPick++;

  if(chestState.currentPick>=chestState.targetColors.length){
    // 計算分數
    let totalScore=0;
    chestState.targetColors.forEach((t,i)=>{
      const p=chestState.pickedColors[i];
      const dh=Math.min(Math.abs(t.h-p.h),360-Math.abs(t.h-p.h))/180;
      const ds=Math.abs(t.s-p.s);
      const dv=Math.abs(t.v-p.v);
      totalScore+=1-(dh*0.5+ds*0.3+dv*0.2);
    });
    const avg=totalScore/chestState.targetColors.length;
    showChestResult(avg);
  } else {
    updatePickLabel();
    // 重置色輪點
    document.getElementById('chest-picker-dot').style.display='none';
  }
}

function showChestResult(score){
  document.getElementById('chest-pick-phase').style.display='none';
  document.getElementById('chest-qte-phase').style.display='none';
  if(qteRAF){cancelAnimationFrame(qteRAF);qteRAF=null;}
  const rp=document.getElementById('chest-result-phase');
  rp.style.display='flex';
  const msg=document.getElementById('chest-result-msg');

  if(chestState.isTrap && chestState.trapPhase==='after'){
    triggerTrap(true);
    return;
  }

  const isColorGame=chestState.cfg.gameType==='color';
  const success=isColorGame?(score>=0.8):(score>=1.0);

  if(success){
    const perfect = isColorGame && score>=0.95;
    const drops = _rollChestRewards(chestState.rarity || 'common', perfect);
    const s = initState();
    drops.forEach(d => bagAddMaterial(s, d.key, d.qty));
    save(s);
    msg.className='chest-result success';
    const txt = drops.map(d => {
      const def = (typeof getMaterialDef==='function') ? getMaterialDef(d.key) : null;
      return `${def?.icon||'📦'} ${def?.name||d.key} ×${d.qty}`;
    }).join(', ');
    msg.textContent = (perfect ? '// 完美！' : '// 成功！') + ' 獲得：' + (txt || '空');
  } else {
    msg.className='chest-result fail';
    msg.textContent='// 失敗... 空箱';
    if(chestState.isTrap){triggerTrap(true);return;}
  }
}

function triggerTrap(showResult=false){
  const dmg=Math.round(maxHp(mockChar.level,mockChar.VIT)*0.15);
  mockChar.hp=Math.max(1, mockChar.hp-dmg);
  updateMapHp();
  if(showResult){
    const rp=document.getElementById('chest-result-phase');
    rp.style.display='flex';
    const msg=document.getElementById('chest-result-msg');
    msg.className='chest-result fail';
    msg.textContent=`// 陷阱！受到 ${dmg} 傷害！`;
  } else {
    closeChestGame();
    showToast(`// ⚠ 陷阱箱！-${dmg} HP`);
  }
}

// ── 數字密碼遊戲 ──
function startCodeGame(){
  chestState.phase='code';
  document.getElementById('chest-memorize-phase').style.display='none';
  document.getElementById('chest-pick-phase').style.display='none';
  document.getElementById('chest-result-phase').style.display='none';

  // 用 pick-phase div 顯示密碼遊戲（重用overlay空間）
  const pp=document.getElementById('chest-pick-phase');
  pp.style.display='flex';
  pp.innerHTML=`
    <div class="code-attempts" id="code-attempts">剩餘 ${chestState.attemptsLeft} 次</div>
    <div class="code-history" id="code-history"></div>
    <div class="code-input-row" id="code-input-row"></div>
    <div class="code-numpad" id="code-numpad"></div>`;

  renderCodeInput();
  renderCodeNumpad();
}

function renderCodeInput(){
  const row=document.getElementById('code-input-row'); if(!row)return;
  const digits=chestState.cfg.digits;
  row.innerHTML=Array.from({length:digits},(_,i)=>{
    const val=chestState.currentInput[i];
    const isActive=i===chestState.currentInput.length;
    return `<div class="code-digit${isActive?' active':''}">${val!==undefined?val:'_'}</div>`;
  }).join('');
}

function renderCodeNumpad(){
  const pad=document.getElementById('code-numpad'); if(!pad)return;
  pad.innerHTML='';
  // 0-9
  for(let n=0;n<=9;n++){
    const btn=document.createElement('div');
    btn.className='code-numpad-btn';
    btn.textContent=n;
    btn.onclick=()=>codeInputDigit(n);
    btn.ontouchend=(e)=>{e.preventDefault();codeInputDigit(n);};
    pad.appendChild(btn);
  }
  // 刪除
  const del=document.createElement('div');
  del.className='code-numpad-btn del';
  del.textContent='⌫';
  del.onclick=()=>codeDeleteDigit();
  del.ontouchend=(e)=>{e.preventDefault();codeDeleteDigit();};
  pad.appendChild(del);
  // 確認
  const ok=document.createElement('div');
  ok.className='code-numpad-btn confirm';
  ok.textContent='✓';
  ok.onclick=()=>codeSubmit();
  ok.ontouchend=(e)=>{e.preventDefault();codeSubmit();};
  pad.appendChild(ok);
}

function codeInputDigit(n){
  if(chestState.currentInput.length>=chestState.cfg.digits)return;
  chestState.currentInput.push(n);
  renderCodeInput();
}

function codeDeleteDigit(){
  chestState.currentInput.pop();
  renderCodeInput();
}

function codeSubmit(){
  if(chestState.currentInput.length<chestState.cfg.digits)return;
  const guess=[...chestState.currentInput];
  const secret=chestState.secretCode;
  // 計算 A B
  let a=0,b=0;
  const usedSecret=Array(secret.length).fill(false);
  const usedGuess=Array(guess.length).fill(false);
  // A: 位置和數字都對
  guess.forEach((d,i)=>{if(d===secret[i]){a++;usedSecret[i]=true;usedGuess[i]=true;}});
  // B: 數字對但位置錯
  guess.forEach((d,i)=>{
    if(usedGuess[i])return;
    const j=secret.findIndex((s,si)=>!usedSecret[si]&&s===d);
    if(j!==-1){b++;usedSecret[j]=true;}
  });

  chestState.attemptsLeft--;
  chestState.history.push({guess,a,b});
  chestState.currentInput=[];

  // 更新歷史
  const hist=document.getElementById('code-history');
  if(hist){
    const row=document.createElement('div');
    row.className='code-hist-row';
    row.innerHTML=`<div class="code-hist-digits">${guess.join(' ')}</div>
      <div class="code-hist-result"><span class="code-hist-a">${a}A</span> <span class="code-hist-b">${b}B</span></div>`;
    hist.appendChild(row);
    hist.scrollTop=hist.scrollHeight;
  }

  const attEl=document.getElementById('code-attempts');
  if(attEl)attEl.textContent=`剩餘 ${chestState.attemptsLeft} 次`;

  if(a===secret.length){
    // 成功！
    showChestResult(1.0);
  } else if(chestState.attemptsLeft<=0){
    // 失敗
    showChestResult(0);
  } else {
    renderCodeInput();
  }
}

// ── QTE 旋轉指針遊戲 ──
let qteRAF = null;
let qteAngle = 0;
let qteSpeed = 2.2; // 度/frame
let qteZoneStart = 0;
let qteZoneSize = 0;

function startQteGame(){
  chestState.phase='qte';
  document.getElementById('chest-memorize-phase').style.display='none';
  document.getElementById('chest-pick-phase').style.display='none';
  document.getElementById('chest-result-phase').style.display='none';
  document.getElementById('chest-qte-phase').style.display='flex';

  // 隨機綠色區域（45~90度寬）
  qteZoneSize = 50 + Math.random()*30;
  qteZoneStart = Math.random()*360;
  qteAngle = 0;
  qteSpeed = 2.2;

  // 陷阱：during → 突然加速
  if(chestState.isTrap && chestState.trapPhase==='during'){
    setTimeout(()=>{qteSpeed=5.5;}, 1200);
  }

  drawQte();
  qteRAF=requestAnimationFrame(qteLoop);
}

function qteLoop(){
  qteAngle=(qteAngle+qteSpeed)%360;
  drawQte();
  qteRAF=requestAnimationFrame(qteLoop);
}

function drawQte(){
  const canvas=document.getElementById('qte-canvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const cx=110, cy=110, r=100;
  ctx.clearRect(0,0,220,220);

  // 背景圓環
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,.08)';
  ctx.lineWidth=18;
  ctx.stroke();

  // 綠色成功區域
  const zStart=(qteZoneStart-90)*Math.PI/180;
  const zEnd=(qteZoneStart+qteZoneSize-90)*Math.PI/180;
  ctx.beginPath();
  ctx.arc(cx,cy,r,zStart,zEnd);
  ctx.strokeStyle='rgba(68,221,136,.7)';
  ctx.lineWidth=18;
  ctx.stroke();

  // 指針
  const rad=(qteAngle-90)*Math.PI/180;
  const px=cx+r*Math.cos(rad);
  const py=cy+r*Math.sin(rad);
  ctx.beginPath();
  ctx.moveTo(cx,cy);
  ctx.lineTo(px,py);
  ctx.strokeStyle='#fff';
  ctx.lineWidth=3;
  ctx.stroke();
  // 指針頭
  ctx.beginPath();
  ctx.arc(px,py,6,0,Math.PI*2);
  ctx.fillStyle='#fff';
  ctx.fill();

  // 中心圓
  ctx.beginPath();
  ctx.arc(cx,cy,10,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,.3)';
  ctx.fill();
}

function qteTap(){
  if(qteRAF){cancelAnimationFrame(qteRAF);qteRAF=null;}

  // 判斷指針是否在綠色區域內
  let angle=qteAngle%360;
  let zEnd=(qteZoneStart+qteZoneSize)%360;
  let inZone=false;
  if(qteZoneStart<=zEnd){
    inZone=angle>=qteZoneStart&&angle<=zEnd;
  } else {
    inZone=angle>=qteZoneStart||angle<=zEnd;
  }

  showChestResult(inZone?1.0:0);
}

function closeChestGame(){
  document.getElementById('chest-overlay').classList.remove('show');
  renderMap(); updateMapHp(); renderNextChoices();
}
