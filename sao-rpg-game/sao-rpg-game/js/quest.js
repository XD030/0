/* ========================================================================
 * quest.js — 任務 / 習慣系統
 *
 * 內容:
 *   1. DAILY_TARGETS 預設目標值
 *   2. sliderCtx 滑桿狀態
 *   3. renderQuest(目前是 stub,page-quest 已從 HTML 移除)
 *   4. 滑桿輸入 UI:buildSlider / closeSlider /
 *      openDailySlider / openPersonalSlider / openTimedSlider
 *   5. 提交與計算:submitSlider(處理 daily/personal/timed 三種)
 *   6. 點擊計數:tapCount / tapTimedCount / completeTimedTask
 *   7. 任務管理:deleteTask / resetDaily
 *
 * 依賴:
 *   - state.js:SK / initState
 *   - storage.js:load / save
 *   - utils.js:today / showToast
 *   - character.js:addExp / applyHpPenalty / isExpHalved
 *
 * 注意:
 *   - 原始 HTML 的 page-quest 已移除,renderQuest 保留為 no-op stub
 *     僅供其他地方呼叫不出錯。submitSlider / tapCount 等仍會更新存檔,
 *     使資料層保持一致(將來可以重建任務頁時直接接回來)。
 * ======================================================================== */

/* Daily 預設目標值 */
const DAILY_TARGETS={
  d1:{max:8,    min:0, unit:'hr'},
  d2:{max:2000, min:0, unit:'ml'},
  d3:{max:30,   min:0, unit:'min'},
  d4:{max:5,    min:0, unit:'份'},
  d5:{max:60,   min:0, unit:'min'},
};

/* 滑桿狀態 */
let sliderCtx=null;


/* page-quest 已移除,保留函式避免其他地方呼叫出錯 */
function renderQuest(){
  // page-quest 已移除
}


/* ════════════════ 滑桿 UI ════════════════ */
function buildSlider(title, curVal, minVal, maxVal, unit){
  const old=document.getElementById('slider-overlay'); if(old) old.remove();
  const el=document.createElement('div');
  el.id='slider-overlay';
  el.style.cssText='position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;';
  el.onclick=closeSlider;
  el.innerHTML=`<div id="slider-panel-inner" style="width:100%;max-width:390px;background:#060e1a;border-top:1px solid rgba(0,200,255,.18);border-left:1px solid rgba(0,200,255,.18);border-right:1px solid rgba(0,200,255,.18);padding:20px 16px 40px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:2px;color:#00c8ff;">
      <span>${title}</span>
      <div onclick="closeSlider()" style="font-size:14px;color:#7aaac8;cursor:pointer;padding:2px 8px;border:1px solid #1a3a5a;">✕</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
      <div><span id="slider-cur" style="font-family:'Share Tech Mono',monospace;font-size:28px;color:#fff;">${curVal}</span><span style="font-family:'Share Tech Mono',monospace;font-size:13px;color:#7aaac8;margin-left:6px;">${unit}</span></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#7aaac8;">目標 ${maxVal}${unit}</div>
    </div>
    <div style="display:flex;justify-content:center;">
      <input type="range" id="slider-input" min="${minVal}" max="${maxVal}" value="${curVal}" oninput="document.getElementById('slider-cur').textContent=this.value" style="width:80%;-webkit-appearance:none;height:4px;background:rgba(0,200,255,.2);outline:none;margin:12px 0;cursor:pointer;">
    </div>
    <style>#slider-input::-webkit-slider-thumb{-webkit-appearance:none;width:4px;height:20px;background:#fff;border:none;cursor:pointer;border-radius:0;}#slider-input::-moz-range-thumb{width:4px;height:20px;background:#fff;border:none;cursor:pointer;border-radius:0;}</style>
    <div style="display:flex;justify-content:space-between;width:80%;margin:0 auto;font-family:'Share Tech Mono',monospace;font-size:11px;color:#7aaac8;"><span>${minVal}</span><span>${maxVal}</span></div>
    <div id="slider-presets" style="display:flex;gap:8px;justify-content:center;margin-top:12px;"></div>
    <button onclick="submitSlider()" style="width:100%;padding:16px;background:rgba(0,200,255,.1);border:1px solid #00c8ff;color:#00c8ff;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;cursor:pointer;margin-top:16px;">✓ SUBMIT</button>
  </div>`;
  document.body.appendChild(el);
  document.getElementById('slider-panel-inner').onclick=e=>e.stopPropagation();

  // Quick preset buttons (25/50/75/100%)
  const presetDiv=document.getElementById('slider-presets');
  const sl=document.getElementById('slider-input');
  [25,50,75,100].forEach(p=>{
    const v=Math.round(minVal+(maxVal-minVal)*p/100);
    const btn=document.createElement('button');
    btn.textContent=p+'%';
    btn.style.cssText='flex:1;padding:6px 0;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.25);color:#7aaac8;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;';
    btn.onclick=()=>{ sl.value=v; document.getElementById('slider-cur').textContent=v; };
    presetDiv.appendChild(btn);
  });
}

function closeSlider(){
  const el=document.getElementById('slider-overlay');
  if(el){ el.style.cssText=''; el.className=''; el.innerHTML=''; }
  sliderCtx=null;
}

function openDailySlider(id){
  showToast('// OPENING: '+id);
  const s=load();
  const t=(s.dailyTasks||[]).find(t=>t.id===id);
  if(!t){ showToast('// NOT FOUND'); return; }
  const tgt=DAILY_TARGETS[id]||{max:1, min:0, unit:''};
  sliderCtx={type:'daily', id};
  buildSlider(t.name, t.todayValue||tgt.min, tgt.min, tgt.max, tgt.unit);
}

function openPersonalSlider(id){
  const s=load();
  const t=(s.personalTasks||[]).find(t=>t.id===id);
  if(!t) return;
  sliderCtx={type:'personal', id};
  buildSlider(t.name, t.todayValue||(t.compMin||0), t.compMin||0, t.compMax||100, t.compUnit||'');
}

function openTimedSlider(id){
  const s=load();
  const t=(s.timedTasks||[]).find(t=>t.id===id);
  if(!t) return;
  sliderCtx={type:'timed', id};
  buildSlider(t.name, t.todayValue||(t.compMin||0), t.compMin||0, t.compMax||100, t.compUnit||'');
}


/* ════════════════ 提交滑桿 ════════════════ */
function submitSlider(){
  if(!sliderCtx) return;
  const inp=document.getElementById('slider-input');
  if(!inp) return;
  const val=parseInt(inp.value);
  const s=initState();
  if(sliderCtx.type==='daily'){
    const t=s.dailyTasks.find(t=>t.id===sliderCtx.id); if(!t) return;
    const tgt=DAILY_TARGETS[t.id]||{max:1};
    t.todayValue=val; t.submitted=true;
    const pct=val/tgt.max;
    const dmg=applyHpPenalty(s, pct);
    if(pct>0) addExp(s, isExpHalved(s)?0:1);
    // 寫入 completionLog
    const k=today();
    if(!s.completionLog) s.completionLog={};
    if(!s.completionLog[k]) s.completionLog[k]={daily:0, total:5, personal:0, taskLog:[], personalLog:[]};
    const log=s.completionLog[k];
    const doneCount=s.dailyTasks.filter(t=>t.submitted).length;
    log.daily=doneCount;
    log.taskLog=s.dailyTasks.map(t=>({id:t.id, name:t.name, done:t.submitted}));
    if(s.dailyTasks.every(t=>t.submitted)){ addExp(s, isExpHalved(s)?5:10); showToast('// ALL DAILY DONE'); }
    else showToast(dmg>0?`// HP -${dmg}`:'// SUBMITTED');
  } else if(sliderCtx.type==='personal'){
    const t=s.personalTasks.find(t=>t.id===sliderCtx.id); if(!t) return;
    t.todayValue=val;
    t.todaySubmitted=true;
    const pct=val/(t.compMax||1);
    if(pct>=1){
      t.todayDone=true; s.character[t.attr]+=1; addExp(s, isExpHalved(s)?0:1);
      const k=today();
      if(!s.completionLog) s.completionLog={};
      if(!s.completionLog[k]) s.completionLog[k]={daily:0, total:5, personal:0, taskLog:[], personalLog:[]};
      s.completionLog[k].personal=(s.completionLog[k].personal||0)+1;
      s.completionLog[k].personalLog=s.completionLog[k].personalLog||[];
      s.completionLog[k].personalLog.push({id:t.id, name:t.name, done:true});
      showToast(`// ${t.attr} +1`);
    } else {
      const dmg=applyHpPenalty(s, pct);
      showToast(dmg>0?`// HP -${dmg}`:'// SUBMITTED');
    }
  } else if(sliderCtx.type==='timed'){
    const t=s.timedTasks.find(t=>t.id===sliderCtx.id); if(!t) return;
    t.todayValue=val;
    const pct=val/(t.compMax||1);
    if(pct>=1){
      t.status='done'; s.character[t.attr]+=1; addExp(s, isExpHalved(s)?0:1);
      showToast(`// TIMED COMPLETE ${t.attr} +1`);
    } else {
      showToast(`// ${val}${t.compUnit||''} / ${t.compMax||100}${t.compUnit||''}`);
    }
  }
  save(s); closeSlider(); renderQuest();
}


/* ════════════════ 點擊計數 ════════════════ */
function tapCount(id){
  const s=initState(); const t=s.personalTasks.find(t=>t.id===id);
  if(!t || t.todayDone) return;
  t.todayCount=(t.todayCount||0)+1;
  if(t.todayCount>=(t.targetCount||1)){
    t.todayDone=true; s.character[t.attr]+=1; addExp(s, isExpHalved(s)?0:1);
    const k=today();
    if(!s.completionLog) s.completionLog={};
    if(!s.completionLog[k]) s.completionLog[k]={daily:0, total:5, personal:0, taskLog:[], personalLog:[]};
    s.completionLog[k].personal=(s.completionLog[k].personal||0)+1;
    s.completionLog[k].personalLog=s.completionLog[k].personalLog||[];
    s.completionLog[k].personalLog.push({id:t.id, name:t.name, done:true});
    showToast(`// ${t.attr} +1`);
  } else {
    showToast(`// ${t.todayCount}/${t.targetCount||1}`);
  }
  save(s); renderQuest();
}

function tapTimedCount(id){
  const s=initState(); const t=s.timedTasks.find(t=>t.id===id);
  if(!t || t.status!=='active') return;
  t.todayCount=(t.todayCount||0)+1;
  if(t.todayCount>=(t.targetCount||1)){
    t.status='done'; s.character[t.attr]+=1; addExp(s, isExpHalved(s)?0:1);
    showToast(`// TIMED COMPLETE ${t.attr} +1`);
  } else {
    showToast(`// ${t.todayCount}/${t.targetCount}`);
  }
  save(s); renderQuest();
}

function completeTimedTask(id){
  const s=initState();
  const t=s.timedTasks.find(t=>t.id===id);
  if(!t || t.status!=='active') return;
  t.status='done';
  s.character[t.attr]+=1;
  addExp(s, isExpHalved(s)?0:1);
  showToast(`// TIMED COMPLETE ${t.attr} +1`);
  save(s); renderQuest();
}


/* ════════════════ 任務管理 ════════════════ */
function deleteTask(type, id){
  const s=initState();
  if(type==='personal') s.personalTasks=s.personalTasks.filter(t=>t.id!==id);
  if(type==='timed')    s.timedTasks   =s.timedTasks   .filter(t=>t.id!==id);
  save(s); renderQuest();
}

function resetDaily(){
  const s=load(); if(!s) return;
  s.lastDailyDate='';
  localStorage.setItem(SK, JSON.stringify(s));
  initState(); renderQuest();
  showToast('// DAILY RESET');
}
