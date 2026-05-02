/* ========================================================================
 * utils.js — 共用工具函式
 *
 * 內容:
 *   1. 日期 / 時間:getDateStr / today / pToday / fmtTime
 *   2. 視覺 / SVG:hexEmpty / hexFilled / progColor
 *   3. 影像 fallback:imgOrPlaceholder
 *   4. UI 行為:closeDD / showToast / gConfirm / gConfirmResolve
 *   5. 文字 / 屬性分類:guessAttr / getDayLabel
 *   6. 玩家名稱對話框:editPlayerName / closeNameEdit / confirmNameEdit
 *
 * 注意:
 *   - 取代了原始檔中分散且重複定義的版本(以最後生效版為準)。
 *   - 凡是與單一 feature 強耦合的 helper(例如 hexEquip / durBar 屬於裝備),
 *     不放這裡;那些將在 Phase 5 隨 equipment.js 一起搬。
 * ======================================================================== */

/* ════════════════ 日期 / 時間 ════════════════ */
function getDateStr(d){return d.toISOString().slice(0,10);}
function today(){return getDateStr(new Date());}
/* pToday 是 today() 的別名,原始檔有兩個名字並存,沿用以維持相容 */
function pToday(){return new Date().toISOString().slice(0,10);}

function fmtTime(ms){
  const s=Math.floor(ms/1000);
  const h=Math.floor(s/3600);
  const m=Math.floor((s%3600)/60);
  const sec=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* ════════════════ SVG / 視覺 helper ════════════════ */
/* 空六邊形(用於格子佔位) */
function hexEmpty(sz=32){
  const cx=sz/2, cy=sz/2, r=sz*.42;
  const pts=Array.from({length:6},(_,i)=>{const a=Math.PI/6+i*Math.PI/3;return`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(' ');
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" fill="none"><polygon points="${pts}" stroke="rgba(255,102,51,.3)" stroke-width="1.5" fill="none"/></svg>`;
}

/* 填色六邊形(技能格 / 裝備格 active 狀態) */
function hexFilled(s=32){
  const cx=s/2, cy=s/2, r=s*.42;
  const pts=Array.from({length:6},(_,i)=>{const a=Math.PI/6+i*Math.PI/3;return`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(' ');
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><defs><filter id="hg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><polygon points="${pts}" stroke="rgba(255,140,80,.85)" stroke-width="1.5" fill="rgba(255,100,50,.22)" filter="url(#hg)"/></svg>`;
}

/* 進度條顏色:80%↑ 青 / 50%↑ 金 / 其餘紅 */
function progColor(pct){
  if(pct>=0.8) return 'var(--cyan)';
  if(pct>=0.5) return 'var(--gold)';
  return 'var(--red)';
}

/* 圖片 helper:抓 IMG[key] 路徑,失敗時自動換成同名 placeholder div。
 * IMG 字典在主 inline JS 中定義(Phase 6 會搬進 assets/icons 與 stats.js / battle.js)。
 */
function imgOrPlaceholder(key, cls, alt){
  return `<img class="${cls}" src="${IMG[key]||''}" alt="${alt}" onerror="this.outerHTML='<div class=\\'${cls}-placeholder\\'>${alt}</div>'" >`;
}

/* ════════════════ 通用 UI ════════════════ */

/* 關閉指定下拉面板 */
function closeDD(t){
  const ov = document.getElementById(t+'-overlay');
  if(ov) ov.classList.remove('show');
}

/* 全域 Toast 通知(原始有兩個版本,這裡採生效的版本:
   會自動把開頭的 // 與 // 空格 移除,使呼叫端不論寫不寫前綴都能正常顯示) */
function showToast(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg.replace(/^\/\//,'').replace(/^\/\/ /,'').trim();
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

/* 通用確認框(取代原生 confirm,用 g-confirm-overlay DOM)
 *   gConfirm(訊息, callback) → 用 callback(true|false) 接收結果 */
let _gConfirmCb=null;
function gConfirm(msg, cb){
  const overlay=document.getElementById('g-confirm-overlay');
  const msgEl=document.getElementById('g-confirm-msg');
  if(!overlay||!msgEl) return;
  msgEl.innerHTML=msg.replace(/\n/g,'<br>');
  overlay.style.display='flex';
  _gConfirmCb=cb;
}
function gConfirmResolve(ok){
  const overlay=document.getElementById('g-confirm-overlay');
  if(overlay) overlay.style.display='none';
  if(_gConfirmCb){ _gConfirmCb(ok); _gConfirmCb=null; }
}

/* ════════════════ 文字 / 分類 ════════════════ */

/* 透過 ATTR_KW(在 state.js 定義)猜測任務名稱對應的生活屬性。
 * 找不到就隨機選一個生活屬性。 */
function guessAttr(n){
  for(const [a,kws] of Object.entries(ATTR_KW)){
    if(kws.some(k=>n.includes(k))) return a;
  }
  return LIFE_ATTRS[Math.floor(Math.random()*LIFE_ATTRS.length)];
}

/* 把週幾陣列(0~6)轉成「每日 / 平日 / 週末」或「一三五」 */
function getDayLabel(days){
  const s=[...days].sort();
  if(JSON.stringify(s)==='[0,1,2,3,4,5,6]') return '每日';
  if(JSON.stringify(s)==='[1,2,3,4,5]')     return '平日';
  if(JSON.stringify(s)==='[0,6]')           return '週末';
  return s.map(d=>['日','一','二','三','四','五','六'][d]).join('');
}

/* ════════════════ 玩家名稱對話框 ════════════════ */
function editPlayerName(){
  const s=initState();
  const input=document.getElementById('name-edit-input');
  input.value=s.character.name||'無名俠客';
  const ov=document.getElementById('name-edit-overlay');
  ov.style.display='flex';
  setTimeout(()=>input.focus(),100);
  input.onkeydown=(e)=>{
    if(e.key==='Enter') confirmNameEdit();
    if(e.key==='Escape') closeNameEdit();
  };
}
function closeNameEdit(){
  document.getElementById('name-edit-overlay').style.display='none';
}
function confirmNameEdit(){
  const input=document.getElementById('name-edit-input');
  const name=input.value.trim().slice(0,12);
  if(!name) return;
  const s=initState();
  s.character.name=name;
  save(s);
  ['q-name','s-name','r-name'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent=name;
  });
  closeNameEdit();
}
