/* ========================================================================
 * ui.js — 頁面切換與全域 UI 控制
 *
 * 內容:
 *   1. 頁面導航狀態 + secState(任務區塊摺疊狀態)
 *   2. goPage / goAdvPage / toggleSec
 *   3. 生活技能詳情頁(在主頁覆蓋顯示):openLifeSkill / closeLifeSkill /
 *      updateLifeSkillLocks
 *   4. 生活技能浮動按鈕 (FAB) + 弧形/扇形選單:
 *      LIFE_FAB_SKILLS / lifeFabOpen / lifeFabPosX/Y / FAB_R / FAB_BTN_R / FAB_START / FAB_END
 *      updateRadialPos / openFabMenu / _fabOutsideTap / closeFabMenu
 *      fabBtnDown / fabBtnMove / fabBtnTap
 *      initLifeFabDrag / renderLifeFab / lifeFabSelect
 *      renderFabSvg / toggleLifeFab (no-op stubs)
 *   (右滑開啟抽屜手勢、生活技能左側抽屜整體已移除)
 *
 * 依賴:
 *   - state.js:currentPage / currentAdvPage / inAdvMode / LIFE_ATTRS / LIFE_COLOR /
 *              LIFE_SKILL_NAME / HUNT_MAX_MS / HUNT_MIN_MS
 *   - storage.js:load / save
 *   - utils.js:closeDD / showToast / fmtTime
 *   - 仍在 inline JS:isHuntRunning / lifeExpReq / renderHuntTimer /
 *                    renderMineGame / renderHanaGame / renderCookGame / renderCrftGame /
 *                    renderFloorSelect / renderReserve / renderStatus /
 *                    bagTab/bagFilter/bagSubFilter / updateBagTabColors / buildBagFilterBar /
 *                    renderBag / marketTab/marketFilter/marketSubFilter / sellStep / sellCategory /
 *                    sellItem / sellWeaponFilter / buildMarketFilterBar / renderMarket /
 *                    LIFE_MAX_MS / LIFE_MIN_MS / subAttrView
 *   這些將在 Phase 4~5 隨各自 feature 檔案搬出來,介接點不會變。
 * ======================================================================== */

/* ════════════════ 任務區塊摺疊狀態 ════════════════ */
const secState = {daily:true, personal:true, timed:false};

function toggleSec(name){
  const wasOpen = secState[name];
  ['daily','personal','timed'].forEach(n=>{
    secState[n]=false;
    document.getElementById('col-'+n)?.classList.remove('open');
    document.getElementById('chev-'+n)?.classList.remove('open');
  });
  if(!wasOpen){
    secState[name]=true;
    document.getElementById('col-'+name)?.classList.add('open');
    document.getElementById('chev-'+name)?.classList.add('open');
  }
}

/* ════════════════ 頁面導航 ════════════════ */

function goPage(p){
  if(p===currentPage)return;
  subAttrView=null;
  closeDD('equip'); closeDD('skill'); closeDD('crft');
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el=>el.classList.remove('active'));
  if(p==='adventure'){
    inAdvMode=true;
    const _fab1=document.getElementById('life-fab'); if(_fab1)_fab1.style.display='block';
    currentPage=p;
    goAdvPage(currentAdvPage);
    return;
  }
  if(inAdvMode){
    inAdvMode=false;
    // fab 保持顯示,不隱藏
  }
  document.getElementById('page-'+p).classList.add('active');
  document.getElementById('tab-'+p)?.classList.add('active');
  currentPage=p;
  // quest removed
  if(p==='status') renderStatus();
  // stats removed
  // new removed
}

function goAdvPage(p){
  currentAdvPage=p;
  closeDD('equip'); closeDD('skill'); closeDD('crft');
  document.querySelectorAll('.page').forEach(el=>{el.classList.remove('active'); el.style.display='';});
  const pageId = p==='map' ? 'page-adventure' : (p==='lifeskill' ? 'page-status' : ('page-'+p));
  const pageEl = document.getElementById(pageId);
  if(pageEl){pageEl.classList.add('active'); pageEl.style.display='';}
  ['bag','reserve','adventure','market','smith'].forEach(t=>{
    document.getElementById('atab-'+t)?.classList.remove('active');
  });
  const tabMap={map:'adventure',bag:'bag',reserve:'reserve',market:'market',smith:'smith',lifeskill:'smith'};
  const activeTab = tabMap[p]||p;
  document.getElementById('atab-'+activeTab)?.classList.add('active');
  if(p==='map')      renderFloorSelect();
  if(p==='reserve')  renderReserve();
  if(p==='lifeskill')renderStatus();
  if(p==='bag'){
    bagTab='material'; bagFilter='all'; bagSubFilter='all';
    updateBagTabColors(); buildBagFilterBar(); renderBag();
  }
  if(p==='market'){
    marketTab='buy'; marketFilter='all'; marketSubFilter='all';
    sellStep=0; sellCategory=null; sellItem=null; sellWeaponFilter='all';
    document.querySelectorAll('#market-tabs .bag-tab').forEach((t,i)=>t.classList.toggle('active', i===0));
    const mfr=document.getElementById('market-filter-row'); if(mfr)mfr.style.display='flex';
    buildMarketFilterBar(); renderMarket();
  }
}

/* exitAdvMode / advTabTouchStart / advTabTouchEnd / _advTabLpTimer 已移除
 * (使用者移除了「長按底部 Tab 返回任務頁」的功能) */

/* ════════════════ 生活技能詳情頁(在 #page-status 上覆蓋) ════════════════ */
function openLifeSkill(attr){
  if(isHuntRunning() && attr!=='HUNT'){ showToast('// 狩獵中,無法使用其他技能'); return; }
  // 切換前清掉製造的 tabs
  const _ct=document.getElementById('ls-crft-tabs');
  if(_ct){
    _ct.style.display='none'; _ct.innerHTML='';
    const _tw=_ct.closest('.ls-detail-header-tabs'); if(_tw)_tw.style.borderBottom='none';
  }
  const placeholder=document.getElementById('settings-placeholder');
  const detail=document.getElementById('life-skill-detail');
  const title=document.getElementById('ls-detail-title');
  if(!detail) return;
  if(placeholder) placeholder.style.display='none';
  detail.style.display='block';
  if(title){ title.style.display='none'; }// 標題改在 header 內自己渲染
  // 渲染 Lv/EXP header(參考 PLAYER STATUS 排版)
  const s=load();
  const sk=(s.lifeSkills && s.lifeSkills[attr]) || {lv:1, exp:0};
  const lv=sk.lv, exp=sk.exp;
  const req=lifeExpReq(lv, attr);
  const pct=Math.min(100, Math.round(exp/req*100));
  const color=LIFE_COLOR[attr]||'#aaa';
  const gradStart={GATH:'#44ff88',HUNT:'#ffaa44',CRFT:'#ffdd66',MINE:'#dddddd',COOK:'#ff44aa'}[attr]||'#ffffff';
  const skillName=LIFE_SKILL_NAME[attr]||attr;
  const skillSub={GATH:'GATHERING',HUNT:'HUNTING',CRFT:'CRAFTING',MINE:'MINING',COOK:'COOKING'}[attr]||'LIFE SKILL';
  let expHeader=document.getElementById('ls-exp-header');
  if(!expHeader){
    expHeader=document.createElement('div');
    expHeader.id='ls-exp-header';
    expHeader.style.cssText='padding:8px 16px 8px;border-bottom:1px solid rgba(255,255,255,.07);';
    detail.querySelector('.ls-detail-header').after(expHeader);
  }
  expHeader.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-family:var(--font-mono);font-size:18px;color:#fff;letter-spacing:2px;line-height:1.1;">${skillName}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:${color};letter-spacing:3px;margin-top:4px;opacity:.8;">${skillSub}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--font-mono);font-size:30px;font-weight:bold;color:${color};line-height:1;text-shadow:0 0 20px ${color}88;">${lv}</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:${color};letter-spacing:3px;opacity:.7;margin-top:2px;">LEVEL</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <span style="font-family:var(--font-mono);font-size:12px;color:${color};letter-spacing:3px;opacity:.8;">EXP</span>
      <span style="font-family:var(--font-mono);font-size:13px;color:${color};letter-spacing:1px;">${exp} / ${req}</span>
    </div>
    <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:linear-gradient(to right,${gradStart},${color});border-radius:2px;box-shadow:0 0 8px ${color}88;transition:width .4s;"></div>
    </div>`;
  const content=document.getElementById('ls-detail-content');
  if(attr==='HUNT')      renderHuntTimer(content);
  else if(attr==='MINE') renderMineGame(content);
  else if(attr==='GATH') renderHanaGame(content);
  else if(attr==='COOK') renderCookGame(content);
  else if(attr==='CRFT') renderCrftGame(content);
  else                   content.innerHTML=`<div class="btab-empty">// COMING SOON</div>`;
}

function closeLifeSkill(){
  const placeholder=document.getElementById('settings-placeholder');
  const detail=document.getElementById('life-skill-detail');
  if(!detail) return;
  if(placeholder) placeholder.style.display='flex';
  detail.style.display='none';
  const ht=document.getElementById('ls-crft-tabs');
  if(ht){ ht.style.display='none'; const wrap=document.querySelector('.ls-detail-header-tabs'); if(wrap)wrap.style.borderBottom='none'; }
  updateLifeSkillLocks();
}

function updateLifeSkillLocks(){
  const locked=isHuntRunning();
  ['GATH','CRFT','MINE','COOK'].forEach(attr=>{
    document.querySelectorAll(`[onclick="openLifeSkill('${attr}')"]`).forEach(c=>c.classList.toggle('locked', locked));
  });
}

/* ════════════════ 生活技能 FAB(浮動按鈕)+ 扇形選單 ════════════════ */

const LIFE_FAB_SKILLS = [
  {attr:'GATH', icon:'🌿', label:'採集'},
  {attr:'HUNT', icon:'🏹', label:'狩獵'},
  {attr:'MINE', icon:'⛏️', label:'挖礦'},
  {attr:'CRFT', icon:'🔨', label:'製造'},
  {attr:'COOK', icon:'🍳', label:'烹飪'},
];

let lifeFabOpen = false;
let lifeFabDragging = false;
let lifeFabDragStartX = 0, lifeFabDragStartY = 0;
let lifeFabPosX = 16, lifeFabPosY = 90; // distance from right / bottom

const FAB_R = 130;       // 扇形半徑
const FAB_BTN_R = 25;    // 中心死區半徑
const FAB_START = -150, FAB_END = -30;
let fabHoverIdx = -1;

function updateRadialPos(){
  const fab=document.getElementById('life-fab');
  const radial=document.getElementById('life-radial');
  if(!fab||!radial) return;
  const rect=fab.getBoundingClientRect();
  const cx=rect.left+rect.width/2;
  const cy=rect.top+rect.height/2;
  radial.style.left=cx+'px';
  radial.style.top=cy+'px';
  radial.style.width='0';
  radial.style.height='0';
}

function openFabMenu(){
  lifeFabOpen=true;
  const btn=document.getElementById('life-fab-btn');
  const radial=document.getElementById('life-radial');
  if(btn) btn.classList.add('open');
  updateRadialPos();
  renderLifeFab();
  if(radial) radial.classList.add('open');
  // 點其他地方自動收起(支援桌面滑鼠 + 手機觸控)
  setTimeout(()=>{
    document.addEventListener('touchstart', _fabOutsideTap, {passive:true, once:true});
    document.addEventListener('mousedown',  _fabOutsideTap, {passive:true, once:true});
  }, 50);
}

function _fabOutsideTap(e){
  const fab=document.getElementById('life-fab');
  const radial=document.getElementById('life-radial');
  if(fab && fab.contains(e.target)) return;
  if(radial && radial.contains(e.target)) return;
  if(lifeFabOpen) closeFabMenu(-1);
  // 一個事件觸發後,把另一種事件的 listener 也清掉(避免殘留)
  document.removeEventListener('touchstart', _fabOutsideTap);
  document.removeEventListener('mousedown',  _fabOutsideTap);
}

function closeFabMenu(selectIdx){
  lifeFabOpen=false;
  fabHoverIdx=-1;
  const btn=document.getElementById('life-fab-btn');
  const radial=document.getElementById('life-radial');
  if(btn) btn.classList.remove('open');
  if(radial){ radial.classList.remove('open'); radial.innerHTML=''; }
  if(selectIdx>=0){
    const attr=LIFE_FAB_SKILLS[selectIdx].attr;
    goAdvPage('lifeskill');
    setTimeout(()=>openLifeSkill(attr), 100);
  }
}

/* FAB 拖曳狀態 */
let _fabStartX=0, _fabStartY=0, _fabStartR=0, _fabStartB=0, _fabDragMoved=false;

function fabBtnDown(e){
  _fabDragMoved=false;
  const t=e.touches[0];
  _fabStartX=t.clientX; _fabStartY=t.clientY;
  const fab=document.getElementById('life-fab');
  _fabStartR=parseInt(fab.style.right)||lifeFabPosX;
  _fabStartB=parseInt(fab.style.bottom)||lifeFabPosY;
}

function fabBtnMove(e){
  const t=e.touches[0];
  const dx=t.clientX-_fabStartX, dy=t.clientY-_fabStartY;
  if(Math.abs(dx)>6 || Math.abs(dy)>6){
    _fabDragMoved=true;
    e.preventDefault();
    const fab=document.getElementById('life-fab');
    fab.style.right  = Math.max(4, Math.min(window.innerWidth-54,  _fabStartR-dx)) + 'px';
    fab.style.bottom = Math.max(74, Math.min(window.innerHeight-54, _fabStartB-dy)) + 'px';
    if(lifeFabOpen) updateRadialPos();
  }
}

let _fabLastTapAt = 0;

function fabBtnTap(e){
  e.preventDefault();
  // 防抖:手機 touchend 後可能會再觸發合成 click,300ms 內忽略第二次
  const now = Date.now();
  if(now - _fabLastTapAt < 300) return;
  _fabLastTapAt = now;

  if(_fabDragMoved){
    const fab=document.getElementById('life-fab');
    lifeFabPosX=parseInt(fab.style.right);
    lifeFabPosY=parseInt(fab.style.bottom);
    _fabDragMoved=false;
    return;
  }
  if(lifeFabOpen) closeFabMenu(-1);
  else            openFabMenu();
}

function initLifeFabDrag(){
  const fab=document.getElementById('life-fab');
  if(!fab) return;
  fab.style.right  = lifeFabPosX+'px';
  fab.style.bottom = lifeFabPosY+'px';
}

function renderFabSvg(hoverIdx){}// 不使用(保留命名空間,避免 onclick 中可能的引用斷裂)

function renderLifeFab(){
  const radial=document.getElementById('life-radial');
  if(!radial) return;
  const s=load();
  const GAP=54; // 圓圈間距
  radial.innerHTML=LIFE_FAB_SKILLS.map((sk,i)=>{
    const lv=(s.lifeSkills && s.lifeSkills[sk.attr])?s.lifeSkills[sk.attr].lv:1;
    const color=LIFE_COLOR[sk.attr]||'#aaa';
    const x=-22; // 對齊按鈕中心
    const y=-(i+1)*GAP-22;
    return`<div class="life-radial-item" onclick="lifeFabSelect('${sk.attr}')" style="position:absolute;left:${x}px;top:${y}px;">
      <div class="life-radial-item-circle" style="border-color:${color};">
        <span class="life-radial-item-icon">${sk.icon}</span>
        <span class="life-radial-item-lv" style="color:${color};">Lv${lv}</span>
      </div>
    </div>`;
  }).join('');
}

function toggleLifeFab(){}// 不再使用

function lifeFabSelect(attr){
  lifeFabOpen=false;
  const btn=document.getElementById('life-fab-btn');
  const radial=document.getElementById('life-radial');
  if(btn) btn.classList.remove('open');
  if(radial){ radial.classList.remove('open'); radial.innerHTML=''; }
  goAdvPage('lifeskill');
  setTimeout(()=>openLifeSkill(attr), 100);
}


