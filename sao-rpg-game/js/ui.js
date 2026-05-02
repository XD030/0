/* ========================================================================
 * ui.js — 頁面切換與全域 UI 控制
 *
 * 內容:
 *   1. 頁面導航狀態 + secState(任務區塊摺疊狀態)
 *   2. goPage / goAdvPage / toggleSec
 *   3. 生活技能浮動按鈕 (FAB) + 弧形/扇形選單:
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
  const pageId = p==='map' ? 'page-adventure' : ('page-'+p);
  const pageEl = document.getElementById(pageId);
  if(pageEl){pageEl.classList.add('active'); pageEl.style.display='';}
  ['bag','reserve','adventure','market','smith'].forEach(t=>{
    document.getElementById('atab-'+t)?.classList.remove('active');
  });
  const tabMap={map:'adventure',bag:'bag',reserve:'reserve',market:'market',smith:'smith'};
  const activeTab = tabMap[p]||p;
  document.getElementById('atab-'+activeTab)?.classList.add('active');
  if(p==='map')      renderFloorSelect();
  if(p==='reserve')  renderReserve();
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
    goLifeSkillPage(attr);
  }
}

/* FAB 拖曳狀態 */
let _fabStartX=0, _fabStartY=0, _fabStartR=0, _fabStartB=0, _fabDragMoved=false;

function fabBtnDown(e){
  _fabDragMoved=false;
  const t = e.touches?.[0] || e;     // 觸控 or 滑鼠
  _fabStartX=t.clientX; _fabStartY=t.clientY;
  const fab=document.getElementById('life-fab');
  _fabStartR=parseInt(fab.style.right)||lifeFabPosX;
  _fabStartB=parseInt(fab.style.bottom)||lifeFabPosY;
  // 桌面滑鼠:在 document 上監聽 mousemove / mouseup,因為移動可能離開按鈕本身
  if(!e.touches){
    document.addEventListener('mousemove', fabBtnMove);
    document.addEventListener('mouseup',   _fabMouseUp, {once:true});
  }
}

function fabBtnMove(e){
  const t = e.touches?.[0] || e;
  const dx=t.clientX-_fabStartX, dy=t.clientY-_fabStartY;
  if(Math.abs(dx)>6 || Math.abs(dy)>6){
    _fabDragMoved=true;
    if(e.preventDefault) e.preventDefault();
    const fab=document.getElementById('life-fab');
    fab.style.right  = Math.max(4, Math.min(window.innerWidth-54,  _fabStartR-dx)) + 'px';
    fab.style.bottom = Math.max(74, Math.min(window.innerHeight-54, _fabStartB-dy)) + 'px';
    if(lifeFabOpen) updateRadialPos();
  }
}

// 滑鼠釋放:清掉 mousemove listener,讓後續 click 事件決定是否為「拖曳結束」
// _fabDragMoved 不在這裡 reset,留給 fabBtnTap 處理(它會看到 true 就跳過開選單)
function _fabMouseUp(){
  document.removeEventListener('mousemove', fabBtnMove);
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
  goLifeSkillPage(attr);
}


