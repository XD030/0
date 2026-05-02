/* ========================================================================
 * character.js — 角色屬性、等級、EXP、屬性分配、雷達圖
 *
 * 內容:
 *   1. 等級 / EXP / HP 計算:expReq / maxHp / calcSlots / nextSlot / addExp /
 *      applyHpPenalty / isExpHalved
 *   2. 細屬性定義(SUB_ATTRS / SUB_ABBR / SUB_SUFFIX) + 計算公式 calcSubAttrs / fmtSubVal
 *   3. 屬性分配狀態:reserveAlloc / subAttrView
 *   4. 屬性分配互動:reserveAdj / confirmAlloc / allocate / openSubAttr* / closeSubAttr
 *   5. 角色狀態頁渲染:renderStatus(主頁狀態)
 *   6. 冒險面板狀態頁渲染:renderReserve / renderReserveWithPrefix
 *   7. 雷達圖繪製:drawRadar(生活6屬性) / drawRadar2(戰鬥6屬性) /
 *      drawRadar2WithPrefix / drawSubRadar2 / drawSubRadar2WithPrefix
 *   8. 裝備/技能 tab 切換:switchGear / switchGear2
 *
 * 依賴:
 *   - state.js:ATTRS / ATTR_COLOR / SLOT_UNLOCKS / LIFE_ATTRS / LIFE_COLOR / SKILL_DEFS / currentAdvPage / initState / load / save
 *   - utils.js:today / showToast / hexEmpty
 *   - equipment.js:hexEquip / durBar / getEquipItem / openEquipDD / openSkillDD
 *   - 仍在 inline JS:renderLifeTimers / lifeExpReq(已搬到 skills.js,執行期可呼叫到)
 * ======================================================================== */


/* ════════════════ 1. 等級 / EXP / HP 公式 ════════════════ */
function expReq(lv){return lv*lv*5;}
function maxHp(lv, vit){return 100+lv*10+vit*20;}
// MP 上限公式 — 注意:state.js 的 mp migration 內聯了同樣公式,改公式時兩處要同步
function maxMp(lv, int){return 20 + (int||1)*2;}
function calcSlots(lv){return SLOT_UNLOCKS.filter(l=>lv>=l).length;}
function nextSlot(lv){return SLOT_UNLOCKS.find(l=>l>lv)||null;}

function addExp(s, amt){
  s.character.exp+=amt;
  while(s.character.level<100){
    const n=expReq(s.character.level);
    if(s.character.exp>=n){
      s.character.exp-=n;
      s.character.level++;
      s.character.pendingPoints+=3;
      const ns=calcSlots(s.character.level);
      if(ns>s.character.skillSlots) s.character.skillSlots=ns;
    } else break;
  }
  if(s.character.level>=100) s.character.exp=0;
}

function applyHpPenalty(s, pct){
  const mhp=maxHp(s.character.level, s.character.VIT);
  let dmg=0;
  if(pct>=0.8) dmg=0;
  else if(pct>=0.5) dmg=Math.round(mhp*0.05);
  else if(pct>0) dmg=Math.round(mhp*0.10);
  else dmg=Math.round(mhp*0.15);
  s.character.hp=Math.max(0, s.character.hp-dmg);
  if(s.character.hp<=0){
    s.character.deathUntil=Date.now()+86400000;
    showToast('// HP歸零!24小時EXP減半');
  }
  return dmg;
}

function isExpHalved(s){
  return s.character.deathUntil && Date.now()<s.character.deathUntil;
}


/* ════════════════ 2. 細屬性定義 ════════════════ */
const SUB_ATTRS={
  STR:['物理攻擊','破甲','爆擊傷害','武器熟練','負重'],
  VIT:['最大HP','物理防禦','回復力','異常抵抗','韌性'],
  DEX:['命中率','爆擊率','連擊率','技能冷卻','暴擊迴避'],
  AGI:['行動速度','攻速','迴避率','先制','逃跑成功率'],
  INT:['—','—','—','—','—'],
  LUK:['掉寶率','爆擊加成','狀態觸發率','商店折扣','稀有遭遇'],
};
/* 雷達圖用縮寫 */
const SUB_ABBR={
  STR:['ATK','PEN','CDMG','WPN','WGT'],
  VIT:['HP','DEF','RGN','RES','TGH'],
  DEX:['HIT','CRIT','COMBO','CD','CDODGE'],
  AGI:['SPD','ASPD','EVA','INIT','ESC'],
  INT:['—','—','—','—','—'],
  LUK:['DROP','CBONUS','PROC','DISC','RARE'],
};
/* suffix: ''=純數值, '%'=百分比, 'd'=小數(1位) */
const SUB_SUFFIX={
  STR:['','d','d','',''],
  VIT:['','','d','d',''],
  DEX:['%','%','%','d','%'],
  AGI:['','d','%','','%'],
  INT:['','','','',''],
  LUK:['%','d','%','%','%'],
};

function calcSubAttrs(attr, c, equipBonus){
  const v=a=>(c[a]||0)+(equipBonus[a]||0);
  const STR=v('STR'), VIT=v('VIT'), DEX=v('DEX'), AGI=v('AGI'), INT=v('INT'), LUK=v('LUK');
  const raw={
    STR:[
      STR*1.5+DEX*0.2,
      (STR*0.8+DEX*0.3)*0.1,
      (STR*0.8+DEX*0.4)*0.1,
      STR*1.0+AGI*0.2,
      STR*1.2+VIT*0.3,
    ],
    VIT:[
      VIT*5+STR*1,
      VIT*1.2+STR*0.3,
      (VIT*0.8+LUK*0.3)*0.1,
      (VIT*1.0+LUK*0.4)*0.1,
      VIT*1.0+STR*0.2,
    ],
    DEX:[
      DEX*1.2+AGI*0.3,
      DEX*0.8+LUK*0.5,
      DEX*0.6+AGI*0.4,
      (DEX*1.0+AGI*0.2)*0.1,
      DEX*0.6+LUK*0.3,
    ],
    AGI:[
      AGI*1.2+DEX*0.2,
      (AGI*1.0+DEX*0.3)*0.1,
      AGI*0.8+LUK*0.4,
      AGI*1.2+LUK*0.3,
      AGI*1.2+LUK*0.2,
    ],
    INT:[0,0,0,0,0],
    LUK:[
      LUK*1.2+DEX*0.2,
      (LUK*0.8+STR*0.3)*0.1,
      LUK*1.0+DEX*0.3,
      LUK*0.8+INT*0.2,
      LUK*1.5,
    ],
  };
  return (raw[attr]||[0,0,0,0,0]);
}

function fmtSubVal(attr, i, val){
  const s=(SUB_SUFFIX[attr]||[])[i]||'';
  if(s==='%') return Math.round(val)+'%';
  if(s==='d') return val.toFixed(1);
  return Math.round(val)+'';
}


/* ════════════════ 3. 屬性分配狀態 ════════════════ */
let reserveAlloc={STR:0, VIT:0, DEX:0, AGI:0, INT:0, LUK:0};
let subAttrView=null; // null=主視圖, 'STR'/'VIT'/...=細屬性視圖


/* ════════════════ 4. 屬性分配互動 ════════════════ */
function reserveAdj(attr, delta, p){
  const s=initState(); const c=s.character;
  const total=Object.values(reserveAlloc).reduce((s,v)=>s+v, 0);
  if(delta>0 && total>=c.pendingPoints) return;
  if(delta<0 && (reserveAlloc[attr]||0)<=0) return;
  reserveAlloc[attr]=(reserveAlloc[attr]||0)+delta;
  if(p) renderReserveWithPrefix(p); else renderReserve();
}

function confirmAlloc(p){
  const s=initState(); const c=s.character;
  ATTRS.forEach(attr=>{ c[attr]=(c[attr]||0)+(reserveAlloc[attr]||0); });
  const total=Object.values(reserveAlloc).reduce((s,v)=>s+v, 0);
  c.pendingPoints=Math.max(0, c.pendingPoints-total);
  reserveAlloc={STR:0, VIT:0, DEX:0, AGI:0, INT:0, LUK:0};
  save(s);
  if(p) renderReserveWithPrefix(p); else renderReserve();
  showToast('// 屬性分配完成');
}

function allocate(attr){
  const s=initState();
  if(!s.character.pendingPoints) return;
  s.character[attr]++;
  s.character.pendingPoints--;
  const nm=maxHp(s.character.level, s.character.VIT);
  if(s.character.hp>nm) s.character.hp=nm;
  save(s);
  if(currentAdvPage==='reserve') renderReserve();
  else renderStatus();
}

function openSubAttr(attr){
  subAttrView=attr;
  renderReserve();
}
function openSubAttrPrefix(p, attr){
  subAttrView=attr;
  renderReserveWithPrefix(p);
}
function closeSubAttr(p){
  subAttrView=null;
  if(p) renderReserveWithPrefix(p); else renderReserve();
}


/* ════════════════ 5. 角色狀態頁渲染(舊主頁,目前 page-status 沿用) ════════════════ */
function renderStatus(){
  const s=initState(); const c=s.character; const mhp=maxHp(c.level, c.VIT);
  const nameEl=document.getElementById('s-name'); if(nameEl) nameEl.textContent=c.name;
  const lvEl2=document.getElementById('s-level'); if(lvEl2) lvEl2.textContent=c.level;
  const hpBar=document.getElementById('s-hp-bar'); const hpEl=document.getElementById('s-hp');
  if(hpBar) hpBar.style.width=Math.min(100,(c.hp/mhp)*100)+'%';
  if(hpEl)  hpEl.textContent=`${c.hp}/${mhp}`;
  const mpBar=document.getElementById('s-mp-bar'); const mpEl=document.getElementById('s-mp');
  if(mpBar) mpBar.style.width='100%';
  if(mpEl)  mpEl.textContent='100/100';
  const needed=c.level<100?expReq(c.level):1;
  const expBar=document.getElementById('s-exp-bar'); const expEl=document.getElementById('s-exp');
  if(expBar) expBar.style.width=(c.level>=100?100:Math.min(100,(c.exp/needed)*100))+'%';
  if(expEl)  expEl.textContent=c.level>=100?'MAX':`${c.exp}/${needed}`;
  const ptsBanner=document.getElementById('pts-banner');
  if(ptsBanner) ptsBanner.classList.remove('show');
  document.getElementById('attr-list')?.remove(); // 防止舊殘留

  // 來自 inline JS / skills.js,Phase 5 才會搬出
  if(typeof renderLifeTimers==='function') renderLifeTimers();

  // 更新生活技能卡等級和 EXP 條
  LIFE_ATTRS.forEach(attr=>{
    const sk=(s.lifeSkills||{})[attr]||{lv:1, exp:0};
    const req=lifeExpReq(sk.lv, attr);
    const lvEl=document.getElementById('ls-lv-'+attr);
    const expEl=document.getElementById('ls-exp-'+attr);
    const lblEl=document.getElementById('ls-exp-label-'+attr);
    if(lvEl)  lvEl.textContent='Lv.'+sk.lv;
    if(expEl) expEl.style.width=Math.min(100, Math.round((sk.exp/req)*100))+'%';
    if(lblEl) lblEl.textContent=sk.exp+'/'+req;
  });
}

/* 裝備 / 技能 tab 切換(舊版,單一前綴)*/
function switchGear(tab){
  ['equip','skill'].forEach(t=>{
    document.getElementById('gear-tab-'+t)?.classList.toggle('active', t===tab);
    document.getElementById('gear-panel-'+t)?.classList.toggle('active', t===tab);
  });
}


/* ════════════════ 6. 冒險面板狀態頁渲染 ════════════════ */
function renderReserve(){
  const s=initState(); const c=s.character; const mhp=maxHp(c.level, c.VIT);
  document.getElementById('r-name').textContent=c.name;
  document.getElementById('r-level').textContent=c.level;
  document.getElementById('r-hp-bar').style.width=Math.min(100,(c.hp/mhp)*100)+'%';
  document.getElementById('r-hp').textContent=`${c.hp}/${mhp}`;
  const mmp=maxMp(c.level, c.INT);
  const _rmpb=document.getElementById('r-mp-bar');
  if(_rmpb) _rmpb.style.width=Math.min(100,((c.mp||0)/mmp)*100)+'%';
  const _rmp=document.getElementById('r-mp');
  if(_rmp) _rmp.textContent=(c.mp||0)+'/'+mmp;
  const needed=c.level<100?expReq(c.level):1;
  document.getElementById('r-exp-bar').style.width=(c.level>=100?100:Math.min(100,(c.exp/needed)*100))+'%';
  document.getElementById('r-exp').textContent=c.level>=100?'MAX':`${c.exp}/${needed}`;
  const hasPts=c.pendingPoints>0;
  document.getElementById('r-pts-banner').classList.toggle('show', hasPts);
  const equipBonus={STR:0,VIT:0,DEX:0,AGI:0,INT:0,LUK:0};
  Object.keys(s.equipment||{}).forEach(key=>{
    const item=getEquipItem(s, key);
    if(item && item.stat){
      const m=item.stat.match(/([A-Z]+)\s*\+(\d+)/);
      if(m && equipBonus[m[1]]!==undefined) equipBonus[m[1]]+=parseInt(m[2]);
    }
  });
  const al=document.getElementById('r-attr-list'); al.innerHTML='';
  const rSvg=document.getElementById('r-radar-svg');
  if(subAttrView){
    const subVals=calcSubAttrs(subAttrView, c, equipBonus);
    drawSubRadar2(subAttrView, subVals);
    if(rSvg){
      rSvg.style.cursor='pointer';
      rSvg.style.outline='none';
      rSvg.setAttribute('tabindex','0');
      rSvg.onclick=(e)=>{
        const t=e.target;
        if(t===rSvg||t.tagName==='polygon'||t.tagName==='line'||t.tagName==='defs'||t.tagName==='filter')
          closeSubAttr();
      };
    }
    const color=ATTR_COLOR[subAttrView]||'#fff';
    const subMax=Math.max(...subVals, 1);
    (SUB_ATTRS[subAttrView]||[]).forEach((name, i)=>{
      const val=subVals[i]||0;
      const pct=Math.min(100, Math.round(val/subMax*100));
      const disp=fmtSubVal(subAttrView, i, val);
      const row=document.createElement('div'); row.className='r-attr-row';
      row.innerHTML=
        `<div class="r-attr-top">`+
          `<span class="r-attr-key" style="color:${color};">${name}</span>`+
          `<span class="r-attr-num">${disp}</span>`+
        `</div>`+
        `<div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:${pct}%;background:${color};box-shadow:0 0 4px ${color}88;"></div></div>`;
      al.appendChild(row);
    });
  } else {
    if(rSvg){
      rSvg.style.cursor='default';
      rSvg.onclick=null;
      rSvg.parentElement.querySelectorAll('.sub-radar-label').forEach(el=>el.remove());
    }
    drawRadar2(ATTRS.map(a=>(c[a]||0)+(equipBonus[a]||0)+(reserveAlloc[a]||0)));
    const maxVal=50;
    const totalAllocated=Object.values(reserveAlloc).reduce((s,v)=>s+v, 0);
    const remaining=c.pendingPoints-totalAllocated;
    if(hasPts){
      document.getElementById('r-pts-num').textContent=remaining;
      document.getElementById('r-confirm-btn').style.display=totalAllocated>0?'block':'none';
    } else {
      document.getElementById('r-confirm-btn').style.display='none';
    }
    ATTRS.forEach(attr=>{
      const val=c[attr]||0; const bonus=equipBonus[attr]||0;
      const pending=reserveAlloc[attr]||0;
      const display=val+pending;
      const pct=Math.min(100, Math.round((display/maxVal)*100));
      const color=ATTR_COLOR[attr]||'#fff';
      const row=document.createElement('div'); row.className='r-attr-row';
      if(hasPts){
        row.innerHTML=
          `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">`+
            `<button class="r-alloc-btn" onclick="reserveAdj('${attr}',-1)" ${pending<=0?'disabled':''}>−</button>`+
            `<span class="r-attr-key" style="color:${color}">${attr}</span>`+
            `<button class="r-alloc-btn" onclick="reserveAdj('${attr}',1)" ${remaining<=0?'disabled':''}>＋</button>`+
            `<span style="flex:1"></span>`+
            `<span style="display:inline-flex;align-items:center;justify-content:flex-end;min-width:80px;">`+
              `<span class="r-alloc-val" style="color:${pending>0?'var(--cyan)':'#fff'};min-width:28px;text-align:right;">${display}</span>`+
              `<span class="r-attr-bonus" style="min-width:44px;text-align:left;">${bonus>0?`+${bonus}`:''}</span>`+
            `</span>`+
          `</div>`+
          `<div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:${pct}%;background:${color};box-shadow:0 0 4px ${color}88;"></div></div>`;
      } else {
        row.innerHTML=
          `<div class="r-attr-top">`+
            `<span class="r-attr-key" style="color:${color}">${attr}</span>`+
            `<span><span class="r-attr-num">${val}</span>${bonus>0?`<span class="r-attr-bonus">+${bonus}</span>`:''}</span>`+
          `</div>`+
          `<div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:${pct}%;background:${color};box-shadow:0 0 4px ${color}88;"></div></div>`;
      }
      al.appendChild(row);
    });
  }
  const col1=document.getElementById('r-equip-col-1');
  const col2=document.getElementById('r-equip-col-2');
  col1.innerHTML=''; col2.innerHTML='';
  const COL1=[{key:'helmet',name:'HELMET'},{key:'chest',name:'CHEST'},{key:'pants',name:'PANTS'},{key:'boots',name:'BOOTS'}];
  const COL2=[{key:'main',name:'MAIN HAND'},{key:'off',name:'OFF HAND'},{key:'acc1',name:'ACC SLOT 1'},{key:'acc2',name:'ACC SLOT 2'}];
  [...COL1.map(s=>({...s,col:col1})),...COL2.map(s=>({...s,col:col2}))].forEach(({key,name,col})=>{
    const itemData=getEquipItem(s, key);
    if(itemData){
      const dur=itemData.durability||6; const rar=itemData.rarity||'common';
      const nameColor={common:'#cccccc',rare:'#00c8ff',epic:'#cc88ff'}[rar]||'#cccccc';
      const slot=document.createElement('div'); slot.className='equip-slot equipped';
      const maxDur=itemData.maxDurability||dur;
      slot.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;gap:3px;">${hexEquip(36, rar, dur)}${durBar(dur, maxDur, 36)}</div><div class="equip-info"><div class="equip-item-name" style="color:${nameColor};text-shadow:0 0 8px ${nameColor}44">${getDisplayName(itemData)}</div><div class="equip-stat">${itemData.stat||''}</div></div>`;
      slot.onclick=()=>openEquipDD(key, name, renderReserve);
      col.appendChild(slot);
    } else {
      const empty=document.createElement('div'); empty.className='equip-slot empty';
      empty.innerHTML=`<div class="equip-hex">${hexEmpty(32)}</div><div class="equip-info"><div class="equip-slot-name">${name}</div></div>`;
      empty.onclick=()=>openEquipDD(key, name, renderReserve);
      col.appendChild(empty);
    }
  });
  const sl=document.getElementById('r-slots-list'); sl.innerHTML='';
  SLOT_UNLOCKS.forEach((lv, i)=>{
    const ok=c.level>=lv;
    const skillKey=s.skills[i];
    const def=skillKey?SKILL_DEFS[skillKey]:null;
    const p=((s.skillProf||{})[skillKey]||0);
    const div=document.createElement('div');
    const cls=['slot-strip'];
    if(!ok) cls.push('locked');
    else if(skillKey) cls.push('unlocked','has-skill');
    else cls.push('unlocked','empty-slot');
    div.className=cls.join(' ');
    if(skillKey && def){
      const ul=(s.unlockedMoves||{})[skillKey]||[];
      const latestMove=[...def.moves].filter(m=>m.profReq===0||ul.includes(m.id)||(((s.skillProf||{})[skillKey]||0)>=m.profReq)).pop();
      const moveName=latestMove?latestMove.name:def.name;
      div.innerHTML=`<div class="slot-bar"></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="font-family:var(--font-mono);font-size:12px;color:#dd99ff;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${moveName}</span><span style="font-family:var(--font-mono);font-size:10px;color:rgba(170,136,255,.5);flex-shrink:0;margin-left:8px;">${p}/1000</span></div><div style="height:2px;background:rgba(119,85,255,.15);border-radius:2px;margin-top:5px;"><div style="height:100%;width:${p/10}%;background:linear-gradient(90deg,#aa88ff,#dd99ff);border-radius:2px;transition:width .3s;"></div></div></div>`;
    } else {
      div.innerHTML=`<div class="slot-num">SLOT ${i+1}</div><div class="slot-bar"></div><div class="slot-status">${ok?'── OPEN ──':'LV '+lv}</div>`;
    }
    if(ok) div.onclick=()=>openSkillDD(i, renderReserve);
    sl.appendChild(div);
  });
  const _rnh=document.getElementById('r-next-hint');
  if(_rnh) _rnh.textContent=nextSlot(c.level)?`次一槽解鎖:LV ${nextSlot(c.level)}`:'// ALL SLOTS UNLOCKED';
  if(typeof renderEssenceGrid==='function') renderEssenceGrid('r-');
}

/* ADV 面板用的 renderReserve(可指定前綴,目前只有 r- 在用,但保留多前綴介面) */
function renderReserveWithPrefix(p){
  const g=id=>document.getElementById(p+id);
  const s=initState(); const c=s.character; const mhp=maxHp(c.level, c.VIT);
  if(!g('name')) return;
  g('name').textContent=c.name;
  g('level').textContent=c.level;
  g('hp-bar').style.width=Math.min(100,(c.hp/mhp)*100)+'%';
  g('hp').textContent=c.hp+'/'+mhp;
  const mmp=maxMp(c.level, c.INT);
  if(g('mp-bar')) g('mp-bar').style.width=Math.min(100,((c.mp||0)/mmp)*100)+'%';
  if(g('mp')) g('mp').textContent=(c.mp||0)+'/'+mmp;
  const needed=c.level<100?expReq(c.level):1;
  g('exp-bar').style.width=(c.level>=100?100:Math.min(100,(c.exp/needed)*100))+'%';
  g('exp').textContent=c.level>=100?'MAX':c.exp+'/'+needed;
  const hasPts=c.pendingPoints>0;
  g('pts-banner').classList.toggle('show', hasPts);
  const equipBonus={STR:0,VIT:0,DEX:0,AGI:0,INT:0,LUK:0};
  Object.keys(s.equipment||{}).forEach(key=>{
    const item=getEquipItem(s, key);
    if(item && item.stat){
      const m=item.stat.match(/([A-Z]+)\s*\+(\d+)/);
      if(m && equipBonus[m[1]]!==undefined) equipBonus[m[1]]+=parseInt(m[2]);
    }
  });
  drawRadar2WithPrefix(p, ATTRS.map(a=>(c[a]||0)+(equipBonus[a]||0)+(reserveAlloc[a]||0)));
  const al=g('attr-list'); al.innerHTML='';
  const pSvg=document.getElementById(p+'radar-svg');
  if(subAttrView){
    const subVals=calcSubAttrs(subAttrView, c, equipBonus);
    drawSubRadar2WithPrefix(p, subAttrView, subVals);
    if(pSvg){
      pSvg.style.cursor='pointer';
      pSvg.onclick=(e)=>{
        if(e.target===pSvg||e.target.tagName==='polygon'||e.target.tagName==='line') closeSubAttr(p);
      };
    }
    const color=ATTR_COLOR[subAttrView]||'#fff';
    const subMax=Math.max(...subVals, 1);
    (SUB_ATTRS[subAttrView]||[]).forEach((name, i)=>{
      const val=subVals[i]||0;
      const pct=Math.min(100, Math.round(val/subMax*100));
      const disp=fmtSubVal(subAttrView, i, val);
      const row=document.createElement('div'); row.className='r-attr-row';
      row.style.flex='1';
      row.innerHTML='<div class="r-attr-top">'+
        '<span class="r-attr-key" style="color:'+color+';">'+name+'</span>'+
        '<span class="r-attr-num">'+disp+'</span>'+
        '</div>'+
        '<div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:'+pct+'%;background:'+color+';box-shadow:0 0 4px '+color+'88;"></div></div>';
      al.appendChild(row);
    });
  } else {
    if(pSvg){
      pSvg.style.cursor='default'; pSvg.onclick=null;
      pSvg.parentElement.querySelectorAll('.sub-radar-label').forEach(el=>el.remove());
    }
    const totalAllocated=Object.values(reserveAlloc).reduce((s,v)=>s+v, 0);
    const remaining=c.pendingPoints-totalAllocated;
    if(hasPts){
      g('pts-num').textContent=remaining;
      g('confirm-btn').style.display=totalAllocated>0?'block':'none';
    } else {
      g('confirm-btn').style.display='none';
    }
    ATTRS.forEach(attr=>{
      const val=c[attr]||0; const bonus=equipBonus[attr]||0; const pending=reserveAlloc[attr]||0;
      const display=val+pending;
      const pct=Math.min(100, Math.round((display/50)*100));
      const color=ATTR_COLOR[attr]||'#fff';
      const row=document.createElement('div'); row.className='r-attr-row';
      if(hasPts){
        row.innerHTML='<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'+
          '<button class="r-alloc-btn" onclick="reserveAdj(\u0022'+attr+'\u0022,-1,\u0022'+p+'\u0022)" '+(pending<=0?'disabled':'')+'>−</button>'+
          '<span class="r-attr-key" style="color:'+color+'">'+attr+'</span>'+
          '<button class="r-alloc-btn" onclick="reserveAdj(\u0022'+attr+'\u0022,1,\u0022'+p+'\u0022)" '+(remaining<=0?'disabled':'')+'>＋</button>'+
          '<span style="flex:1"></span>'+
          '<span class="r-alloc-val" style="color:'+(pending>0?'var(--cyan)':'#fff')+'">'+display+'</span>'+
          (bonus>0?'<span class="r-attr-bonus">+'+bonus+'</span>':'')+
          '</div>'+
          '<div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:'+pct+'%;background:'+color+';"></div></div>';
      } else {
        row.innerHTML='<div class="r-attr-top"><span class="r-attr-key" style="color:'+color+'">'+attr+'</span>'+
          '<span><span class="r-attr-num">'+val+'</span>'+(bonus>0?'<span class="r-attr-bonus">+'+bonus+'</span>':'')+
          '</span></div><div class="r-attr-bar-track"><div class="r-attr-bar-fill" style="width:'+pct+'%;background:'+color+';"></div></div>';
      }
      al.appendChild(row);
    });
  }
  const col1=g('equip-col-1'); const col2=g('equip-col-2');
  col1.innerHTML=''; col2.innerHTML='';
  const COL1=[{key:'helmet',name:'HELMET'},{key:'chest',name:'CHEST'},{key:'pants',name:'PANTS'},{key:'boots',name:'BOOTS'}];
  const COL2=[{key:'main',name:'MAIN HAND'},{key:'off',name:'OFF HAND'},{key:'acc1',name:'ACC SLOT 1'},{key:'acc2',name:'ACC SLOT 2'}];
  [...COL1.map(x=>({...x,col:col1})),...COL2.map(x=>({...x,col:col2}))].forEach(({key,name,col})=>{
    const itemData=getEquipItem(s, key);
    if(itemData){
      const dur=itemData.durability||6; const rar=itemData.rarity||'common';
      const maxDur=itemData.maxDurability||dur;
      const nameColor={common:'#cccccc',rare:'#00c8ff',epic:'#cc88ff'}[rar]||'#cccccc';
      const slot=document.createElement('div'); slot.className='equip-slot equipped';
      slot.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;gap:3px;">'+hexEquip(36, rar, dur)+durBar(dur, maxDur, 36)+'</div>'+
        '<div class="equip-info"><div class="equip-item-name" style="color:'+nameColor+'">'+getDisplayName(itemData)+'</div><div class="equip-stat">'+(itemData.stat||'')+'</div></div>';
      slot.onclick=()=>openEquipDD(key, name, ()=>renderReserveWithPrefix(p));
      col.appendChild(slot);
    } else {
      const empty=document.createElement('div'); empty.className='equip-slot empty';
      empty.innerHTML='<div class="equip-hex">'+hexEmpty(32)+'</div><div class="equip-info"><div class="equip-slot-name">'+name+'</div></div>';
      empty.onclick=()=>openEquipDD(key, name, ()=>renderReserveWithPrefix(p));
      col.appendChild(empty);
    }
  });
  const sl=g('slots-list'); sl.innerHTML='';
  SLOT_UNLOCKS.forEach((lv, i)=>{
    const ok=c.level>=lv;
    const skillKey=s.skills[i];
    const def=skillKey?SKILL_DEFS[skillKey]:null;
    const prof=((s.skillProf||{})[skillKey]||0);
    const div=document.createElement('div');
    const cls=['slot-strip'];
    if(!ok) cls.push('locked');
    else if(skillKey) cls.push('unlocked','has-skill');
    else cls.push('unlocked','empty-slot');
    div.className=cls.join(' ');
    if(skillKey && def){
      const ul=(s.unlockedMoves||{})[skillKey]||[];
      const latestMove=[...def.moves].filter(m=>m.profReq===0||ul.includes(m.id)||(prof>=m.profReq)).pop();
      const moveName=latestMove?latestMove.name:def.name;
      div.innerHTML='<div class="slot-bar"></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="font-family:var(--font-mono);font-size:12px;color:#dd99ff;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+moveName+'</span><span style="font-family:var(--font-mono);font-size:10px;color:rgba(170,136,255,.5);flex-shrink:0;margin-left:8px;">'+prof+'/1000</span></div><div style="height:2px;background:rgba(119,85,255,.15);border-radius:2px;margin-top:5px;"><div style="height:100%;width:'+(prof/10)+'%;background:linear-gradient(90deg,#aa88ff,#dd99ff);border-radius:2px;"></div></div></div>';
    } else {
      div.innerHTML='<div class="slot-num">SLOT '+(i+1)+'</div><div class="slot-bar"></div><div class="slot-status">'+(ok?'── OPEN ──':'LV '+lv)+'</div>';
    }
    if(ok) div.onclick=()=>openSkillDD(i, ()=>renderReserveWithPrefix(p));
    sl.appendChild(div);
  });
  g('next-hint').textContent=nextSlot(c.level)?'次一槽解鎖:LV '+nextSlot(c.level):'// ALL SLOTS UNLOCKED';
  if(typeof renderEssenceGrid==='function') renderEssenceGrid(p);
}

/* 裝備 / 技能 / 精髓 tab 切換(ADV 面板用,可帶前綴)*/
function switchGear2(tab, p){
  const prefix=p||'r-';
  ['equip','skill','essence'].forEach(t=>{
    document.getElementById(prefix+'gear-tab-'+t)?.classList.toggle('active', t===tab);
    document.getElementById(prefix+'gear-panel-'+t)?.classList.toggle('active', t===tab);
  });
  // 精髓 panel 不在 renderReserve 流程內,切到 essence 時主動 render
  if(tab==='essence' && typeof renderEssenceGrid==='function') renderEssenceGrid(prefix);
}


/* ════════════════ 7. 雷達圖繪製 ════════════════ */

/* drawRadar:生活技能(6 個 LIFE_ATTRS)的雷達圖,渲染到 #radar-svg */
function drawRadar(vals){
  const svg=document.getElementById('radar-svg');
  const cx=68, cy=68, r=48, n=6;
  const mv=Math.max(...vals, 5);
  const angle=i=>i*2*Math.PI/n-Math.PI/2;
  const pt=(i, ratio)=>[cx+r*ratio*Math.cos(angle(i)), cy+r*ratio*Math.sin(angle(i))];
  let h='<defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  [.33,.66,1].forEach(ratio=>{
    const ps=LIFE_ATTRS.map((_,i)=>pt(i, ratio).join(',')).join(' ');
    h+=`<polygon points="${ps}" fill="none" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  LIFE_ATTRS.forEach((_, i)=>{
    const [x,y]=pt(i, 1);
    h+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  const vps=vals.map((v, i)=>pt(i, Math.min(v/mv, 1)).join(',')).join(' ');
  h+=`<polygon points="${vps}" fill="rgba(0,200,255,.1)" stroke="rgba(0,200,255,.75)" stroke-width="1.5" filter="url(#glow)"/>`;
  LIFE_ATTRS.forEach((attr, i)=>{
    const [x,y]=pt(i, 1.28);
    h+=`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" font-size="10" fill="${LIFE_COLOR[attr]}" letter-spacing="1">${attr}</text>`;
  });
  svg.innerHTML=h;
}

/* drawRadar2:戰鬥屬性(6 個 ATTRS)的雷達圖,渲染到 #r-radar-svg */
function drawRadar2(vals){
  const svg=document.getElementById('r-radar-svg');
  const cx=68, cy=68, r=48, n=6;
  const mv=Math.max(...vals, 10);
  const angle=i=>i*2*Math.PI/n-Math.PI/2;
  const pt=(i, ratio)=>[cx+r*ratio*Math.cos(angle(i)), cy+r*ratio*Math.sin(angle(i))];
  let h='<defs><filter id="glow2"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  [.33,.66,1].forEach(ratio=>{
    const ps=ATTRS.map((_,i)=>pt(i, ratio).join(',')).join(' ');
    h+=`<polygon points="${ps}" fill="none" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  ATTRS.forEach((_, i)=>{
    const [x,y]=pt(i, 1);
    h+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  const vps=vals.map((v, i)=>pt(i, Math.min(v/mv, 1)).join(',')).join(' ');
  h+=`<polygon points="${vps}" fill="rgba(0,200,255,.1)" stroke="rgba(0,200,255,.75)" stroke-width="1.5" filter="url(#glow2)"/>`;
  ATTRS.forEach((attr, i)=>{
    const [x,y]=pt(i, 1.28);
    h+=`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" font-size="10" fill="${ATTR_COLOR[attr]}" letter-spacing="1" style="cursor:pointer;" onclick="openSubAttr('${attr}')">${attr}</text>`;
  });
  svg.innerHTML=h;
}

/* drawRadar2WithPrefix:同 drawRadar2 但 SVG ID 帶前綴(支援多面板)*/
function drawRadar2WithPrefix(p, vals){
  const svg=document.getElementById(p+'radar-svg');
  if(!svg) return;
  const cx=68, cy=68, r=48, n=6;
  const mv=Math.max(...vals, 10);
  const angle=i=>i*2*Math.PI/n-Math.PI/2;
  const pt=(i, ratio)=>[cx+r*ratio*Math.cos(angle(i)), cy+r*ratio*Math.sin(angle(i))];
  let h='<defs><filter id="glow2p"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  [.33,.66,1].forEach(ratio=>{
    const ps=ATTRS.map((_,i)=>pt(i, ratio).join(',')).join(' ');
    h+='<polygon points="'+ps+'" fill="none" stroke="rgba(200,220,240,.12)" stroke-width="1"/>';
  });
  ATTRS.forEach((_, i)=>{
    const [x,y]=pt(i, 1);
    h+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x+'" y2="'+y+'" stroke="rgba(200,220,240,.12)" stroke-width="1"/>';
  });
  const vps=vals.map((v, i)=>pt(i, Math.min(v/mv, 1)).join(',')).join(' ');
  h+='<polygon points="'+vps+'" fill="rgba(0,200,255,.1)" stroke="rgba(0,200,255,.75)" stroke-width="1.5" filter="url(#glow2p)"/>';
  ATTRS.forEach((attr, i)=>{
    const [x,y]=pt(i, 1.28);
    h+='<text x="'+x+'" y="'+y+'" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono,monospace" font-size="10" fill="'+ATTR_COLOR[attr]+'" letter-spacing="1" style="cursor:pointer;" onclick="openSubAttrPrefix(\''+p+'\',\''+attr+'\')">'+attr+'</text>';
  });
  svg.innerHTML=h;
}

/* drawSubRadar2:細屬性 5 軸雷達(主面板版)*/
function drawSubRadar2(attr, vals){
  const svg=document.getElementById('r-radar-svg');
  const W=136, H=136, cx=W/2, cy=H/2, r=48, n=5;
  const mv=Math.max(...vals, 1);
  const angle=i=>i*2*Math.PI/n-Math.PI/2;
  const pt=(i, ratio)=>[cx+r*ratio*Math.cos(angle(i)), cy+r*ratio*Math.sin(angle(i))];
  const color=ATTR_COLOR[attr]||'#00c8ff';
  const glowId='glow-sub-'+attr;
  let h=`<defs><filter id="${glowId}"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  [.33,.66,1].forEach(ratio=>{
    const ps=Array.from({length:n}, (_,i)=>pt(i, ratio).join(',')).join(' ');
    h+=`<polygon points="${ps}" fill="none" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  Array.from({length:n}, (_,i)=>{
    const [x,y]=pt(i, 1);
    h+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(200,220,240,.12)" stroke-width="1"/>`;
  });
  const vps=vals.map((v,i)=>pt(i, Math.min(v/mv, 1)).join(',')).join(' ');
  h+=`<polygon points="${vps}" fill="${color}1a" stroke="${color}" stroke-width="1.5" filter="url(#${glowId})"/>`;
  svg.innerHTML=h;
  // HTML 標籤覆蓋
  const wrap=svg.parentElement;
  wrap.querySelectorAll('.sub-radar-label').forEach(el=>el.remove());
  const scaleX=150/W, scaleY=150/H;
  (SUB_ABBR[attr]||[]).forEach((name, i)=>{
    const [x,y]=pt(i, 1.32);
    const lbl=document.createElement('span');
    lbl.className='sub-radar-label';
    lbl.textContent=name;
    lbl.style.cssText=`position:absolute;font-family:var(--font-mono);font-size:9px;color:${color};letter-spacing:1px;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;left:${x*scaleX}px;top:${y*scaleY}px;`;
    wrap.appendChild(lbl);
  });
}

/* drawSubRadar2WithPrefix:同上,SVG ID 帶前綴 */
function drawSubRadar2WithPrefix(p, attr, vals){
  const svg=document.getElementById(p+'radar-svg');
  if(!svg) return;
  const W=136, H=136, cx=W/2, cy=H/2, r=48, n=5;
  const mv=Math.max(...vals, 1);
  const angle=i=>i*2*Math.PI/n-Math.PI/2;
  const pt=(i, ratio)=>[cx+r*ratio*Math.cos(angle(i)), cy+r*ratio*Math.sin(angle(i))];
  const color=ATTR_COLOR[attr]||'#00c8ff';
  const glowId='glow-subp-'+attr;
  let h='<defs><filter id="'+glowId+'"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  [.33,.66,1].forEach(ratio=>{
    const ps=Array.from({length:n}, (_,i)=>pt(i, ratio).join(',')).join(' ');
    h+='<polygon points="'+ps+'" fill="none" stroke="rgba(200,220,240,.12)" stroke-width="1"/>';
  });
  Array.from({length:n}, (_,i)=>{
    const [x,y]=pt(i, 1);
    h+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x+'" y2="'+y+'" stroke="rgba(200,220,240,.12)" stroke-width="1"/>';
    return null;
  });
  const vps=vals.map((v,i)=>pt(i, Math.min(v/mv, 1)).join(',')).join(' ');
  h+='<polygon points="'+vps+'" fill="'+color+'1a" stroke="'+color+'" stroke-width="1.5" filter="url(#'+glowId+')"/>';
  svg.innerHTML=h;
  // HTML 標籤覆蓋
  const wrap=svg.parentElement;
  wrap.querySelectorAll('.sub-radar-label').forEach(el=>el.remove());
  const scaleX=150/W, scaleY=150/H;
  (SUB_ABBR[attr]||[]).forEach((name, i)=>{
    const [x,y]=pt(i, 1.32);
    const lbl=document.createElement('span');
    lbl.className='sub-radar-label';
    lbl.textContent=name;
    lbl.style.cssText='position:absolute;font-family:var(--font-mono);font-size:9px;color:'+color+';letter-spacing:1px;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;left:'+(x*scaleX)+'px;top:'+(y*scaleY)+'px;';
    wrap.appendChild(lbl);
  });
}


/* ════════════════ 9. 精髓 grid 渲染(Phase 1:UI 框架)════════════════
 * 純槽位 UI、單頁顯示 20 格(5 col × 4 row)、tier 顏色預覽
 * 點空格 toast「// 精髓系統開發中」,點鎖格 toast 等級提示
 */
function renderEssenceGrid(prefix){
  const grid = document.getElementById(prefix+'essence-grid');
  if(!grid) return;
  const s = initState();
  const lv = s.character.level;
  const unlocked = essenceUnlocked(lv);
  let h = '';
  for(let i=0; i<ESSENCE_MAX; i++){
    const ess = (s.essences||[])[i];
    if(i >= unlocked){
      const reqLv = i * ESSENCE_UNLOCK_STEP;
      h += `<div class="essence-cell locked" data-idx="${i}" onclick="essenceCellClick(${i},'locked')">`+
        `<div class="essence-cell-lock-lv">LV ${reqLv}</div>`+
      `</div>`;
    } else if(!ess){
      h += `<div class="essence-cell empty" data-idx="${i}" onclick="essenceCellClick(${i},'empty')"></div>`;
    } else {
      const tier = Math.max(1, Math.min(9, ess.tier|0));
      h += `<div class="essence-cell filled tier-${tier}" data-idx="${i}" onclick="essenceCellClick(${i},'filled')">`+
        `<div class="essence-cell-tier">T${tier}</div>`+
        `<div class="essence-cell-name">${ess.name||''}</div>`+
      `</div>`;
    }
  }
  grid.innerHTML = h;
  const hint = document.getElementById(prefix+'essence-hint');
  if(hint){
    const nxt = nextEssenceLv(lv);
    hint.textContent = nxt
      ? `次一格解鎖:LV ${nxt}(已開 ${unlocked}/${ESSENCE_MAX})`
      : `// ALL ESSENCE SLOTS UNLOCKED (${unlocked}/${ESSENCE_MAX})`;
  }
}

function essenceCellClick(idx, kind){
  if(kind==='locked'){
    const reqLv = idx * ESSENCE_UNLOCK_STEP;
    showToast(`// LV ${reqLv} 解鎖此格`);
  } else {
    showToast('// 精髓系統開發中');
  }
}
