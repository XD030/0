/* ========================================================================
 * main.js — 遊戲啟動入口
 *
 * 載入順序:
 *   1. state.js     (定義常數 / load / save / initState / runStateMigrations)
 *   2. 其他 inline JS (定義 UI / 戰鬥 / 任務 / 生活技能等所有 render 函式)
 *   3. main.js      (本檔,執行啟動流程)
 *
 * 因此到 main.js 跑的時候,所有函式 / 資料都已備齊,DOM 也已 parse 完。
 * 之後 Phase 2~6 把 inline JS 拆成獨立檔時,只要保持 main.js 在最後載入即可。
 * ======================================================================== */
(function bootstrap(){
  // 1. 載入存檔並補齊預設值(原本在 inline JS 末段)
  initState();

  // 2. 一次性存檔遷移(原本是 inline 的 IIFE)
  runStateMigrations();

  // 3. 進入冒險模式 + 顯示 tab bar(原本是末段 <script> DOM init)
  inAdvMode=true;
  const advBar=document.getElementById('adv-tab-bar');
  if(advBar)advBar.style.display='flex';

  const fab=document.getElementById('life-fab');
  if(fab)fab.style.display='block';

  // 4. 初始化生活技能 FAB 拖曳(函式來自 inline JS,將在 Phase 3 搬到 ui.js)
  if(typeof initLifeFabDrag==='function')initLifeFabDrag();

  // 5. 預設打開地圖頁(主頁)
  if(typeof goAdvPage==='function')goAdvPage('map');

  // 6. 還原進行中的計時器(生活技能 / 狩獵)
  const s=load();
  if(typeof LIFE_TIMER_SKILLS!=='undefined' && typeof startLifeTimerTick==='function'){
    if(LIFE_TIMER_SKILLS.some(a=>s.lifeTimers?.[a]?.running))startLifeTimerTick();
  }
  if(typeof isHuntRunning==='function' && isHuntRunning()){
    if(typeof updateLifeSkillLocks==='function')updateLifeSkillLocks();
    if(typeof updateHuntCellTime==='function')updateHuntCellTime();
    if(typeof startHuntTick==='function')startHuntTick();
  }

  // 7. 讓下拉選單面板可以滾動(觸控事件代理)
  ['equip-overlay','skill-overlay','crft-overlay'].forEach(id=>{
    const overlay=document.getElementById(id);
    if(!overlay)return;
    const panel=overlay.querySelector('.dropdown-panel');
    if(!panel)return;
    overlay.addEventListener('touchmove',e=>{e.preventDefault();},{passive:false});
    panel.addEventListener('touchmove',e=>{e.stopPropagation();},{passive:true});
  });
})();
