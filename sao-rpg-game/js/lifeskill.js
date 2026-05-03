/* ========================================================================
 * lifeskill.js — 生活技能獨立 page 控制
 *
 * 內容:
 *   - goLifeSkillPage(attr):FAB 選了技能 → 切到對應 page
 *   - closeLifeSkillPage():關閉鍵 → 回到呼叫者頁
 *   - renderLifeSkillHeader(attr, container):從舊 openLifeSkill 抽出來的
 *     Lv/EXP header 渲染(放在每個技能 page 的 lifeskill-page-header 容器內)
 *
 * 依賴:
 *   - state.js: LIFE_COLOR / LIFE_SKILL_NAME
 *   - storage.js: load
 *   - utils.js: showToast
 *   - skills.js: isHuntRunning / lifeExpReq / renderHuntTimer /
 *                renderMineGame / renderHanaGame / renderCookGame / renderCrftGame
 * ======================================================================== */

let _lifeSkillPrevPage = null;

const _LIFE_SKILL_PAGES = ['page-hunt','page-mine','page-gath','page-cook','page-crft'];

function goLifeSkillPage(attr){
  if(typeof isHuntRunning==='function' && isHuntRunning() && attr!=='HUNT'){
    showToast('// 狩獵中,無法使用其他技能'); return;
  }
  const active=document.querySelector('.page.active');
  if(active && !_LIFE_SKILL_PAGES.includes(active.id)){
    _lifeSkillPrevPage=active.id;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const target=document.getElementById('page-'+attr.toLowerCase());
  if(!target){ console.error('lifeskill page not found:', attr); return; }
  target.classList.add('active');
  renderLifeSkillHeader(attr, document.getElementById('ls-header-'+attr.toLowerCase()));
  const content=document.getElementById('ls-content-'+attr.toLowerCase());
  if(attr==='HUNT')      renderHuntTimer(content);
  else if(attr==='MINE') renderMineGame(content);
  else if(attr==='GATH') renderFarm(content);
  else if(attr==='COOK') renderCookGame(content);
  else if(attr==='CRFT') renderCrftGame(content);
}

function closeLifeSkillPage(){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const back=_lifeSkillPrevPage || 'page-adventure';
  const target=document.getElementById(back);
  if(target) target.classList.add('active');
  else document.getElementById('page-adventure').classList.add('active');
  _lifeSkillPrevPage=null;
}

function renderLifeSkillHeader(attr, container){
  if(!container) return;
  const s=load();
  const sk=(s.lifeSkills && s.lifeSkills[attr]) || {lv:1, exp:0};
  const lv=sk.lv, exp=sk.exp;
  const req=lifeExpReq(lv, attr);
  const pct=Math.min(100, Math.round(exp/req*100));
  const color=LIFE_COLOR[attr]||'#aaa';
  const gradStart={GATH:'#44ff88',HUNT:'#ffaa44',CRFT:'#ffdd66',MINE:'#dddddd',COOK:'#ff44aa'}[attr]||'#ffffff';
  const skillName=LIFE_SKILL_NAME[attr]||attr;
  const skillSub={GATH:'GATHERING',HUNT:'HUNTING',CRFT:'CRAFTING',MINE:'MINING',COOK:'COOKING'}[attr]||'LIFE SKILL';
  container.innerHTML=`
    <div class="lifeskill-header-top">
      <div class="lifeskill-close" onclick="closeLifeSkillPage()">✕</div>
      <div class="lifeskill-header-main">
        <div class="lifeskill-header-title-wrap">
          <div class="lifeskill-header-title">${skillName}</div>
          <div class="lifeskill-header-sub" style="color:${color};">${skillSub}</div>
        </div>
        <div class="lifeskill-header-lv-wrap">
          <div class="lifeskill-header-lv" style="color:${color};text-shadow:0 0 20px ${color}88;">${lv}</div>
          <div class="lifeskill-header-lv-label" style="color:${color};">LEVEL</div>
        </div>
      </div>
    </div>
    <div class="lifeskill-header-exp-row">
      <span class="lifeskill-header-exp-label" style="color:${color};">EXP</span>
      <span class="lifeskill-header-exp-num" style="color:${color};">${exp} / ${req}</span>
    </div>
    <div class="lifeskill-header-exp-track">
      <div class="lifeskill-header-exp-fill" style="width:${pct}%;background:linear-gradient(to right,${gradStart},${color});box-shadow:0 0 8px ${color}88;"></div>
    </div>
  `;
}

/* ════════════════ 階段四:共用 component helper ════════════════
 * 用法:
 *   primary  = {label:'▶ 開始', onclick:'startHunt()', state:''|'ready'|'waiting'}
 *   secondary= {label:'✕', onclick:'stopHunt()', title:'放棄'} 或 null
 * 回傳 html 字串,呼叫者直接塞進容器。
 * ═══════════════════════════════════════════════════════════════ */
function renderLifeSkillBtns(primary, secondary){
  if(!primary) return '';
  const stateCls = primary.state ? ' '+primary.state : '';
  const disabled = (primary.state === 'waiting') ? 'disabled' : '';
  const onclick  = disabled ? '' : `onclick="${primary.onclick}"`;
  const primaryHtml = `<button class="lifeskill-btn-primary${stateCls}" ${onclick} ${disabled}>${primary.label}</button>`;
  const secondaryHtml = secondary
    ? `<button class="lifeskill-btn-secondary" onclick="${secondary.onclick}" title="${secondary.title||''}">${secondary.label}</button>`
    : '';
  return `<div class="lifeskill-btns">${primaryHtml}${secondaryHtml}</div>`;
}
