/* ========================================================================
 * equipment.js — 裝備系統(Phase 5c)
 *
 * 內容:
 *   1. 裝備格類型對照 EQUIP_SLOT_TYPE
 *   2. 舊存檔遷移 migrateEquipVal(處理 string → object 格式)
 *   3. 讀取裝備物件 getEquipItem
 *   4. 視覺輔助 hexEquip(六邊形 SVG)/ durBar(耐久度條)
 *   5. 確認對話框 confirmEquip / confirmUnequip
 *   6. 動作 equipFromBag / unequipItem
 *   7. 下拉選單 openEquipDD / openSkillDD
 *
 * 裝備資料結構:
 *   s.equipment[slotKey] = {
 *     src:'bag'|'static',
 *     uid?,                 // bag 來源才有
 *     name, rarity, stat,
 *     durability, maxDurability,
 *   } | null;
 *   slotKey ∈ {main, off, helmet, chest, pants, boots, acc1, acc2}
 *
 * 依賴:
 *   - state.js: EQUIP_OPTIONS, SKILL_DEFS, SKILL_OPTIONS, initState
 *   - storage.js: load, save
 *   - utils.js: showToast, gConfirm, closeDD
 *   - 仍在 inline JS: isInBattle, renderBag, renderStatus(透過 cb 或 guard 呼叫)
 *
 * 注意:
 *   - 原始檔案有兩份 hexEquip / durBar 宣告(L1079 與 L3874)。
 *     JS 函式宣告後者覆蓋前者,所以實際運行的是 L3874 那份(較簡版,
 *     hexEquip 沒 glow filter、durBar 內條沒 box-shadow)。本檔保留實際運行版本。
 * ======================================================================== */


/* ════════════════ 1. 裝備格類型對照 ════════════════ */
const EQUIP_SLOT_TYPE={
  main:'weapon', off:'weapon',
  helmet:'armor', chest:'armor', pants:'armor', boots:'armor',
  acc1:'armor', acc2:'armor',
};

// 判斷某個 uid 是否已裝備在任何一個槽(可選排除某槽,例如下拉本身的 key)
function isUidEquipped(s, uid, exceptKey){
  if(!uid) return false;
  const eq=s.equipment||{};
  for(const k of Object.keys(EQUIP_SLOT_TYPE)){
    if(k===exceptKey) continue;
    if(eq[k]?.uid===uid) return true;
  }
  return false;
}


/* ════════════════ 2. 存檔遷移 + 讀取 ════════════════ */
// 舊存檔可能是 string,新格式是 object;讀取時即時修復
function migrateEquipVal(key, val){
  if(!val) return null;
  if(typeof val==='object') return val; // 已是新格式
  // 舊格式:uid 開頭 w/a 或靜態 name
  const s=load(); const bag=s.bag||{};
  const w=(bag.weapons||[]).find(x=>x.uid===val);
  if(w) return {src:'bag', uid:w.uid, name:w.name, customName:w.customName||null, rarity:w.rarity, stat:w.stat||'', durability:w.dur, maxDurability:w.maxDur};
  const a=(bag.armors||[]).find(x=>x.uid===val);
  if(a) return {src:'bag', uid:a.uid, name:a.name, rarity:a.rarity, stat:a.stat||'', durability:a.dur, maxDurability:a.maxDur};
  const staticItem=(EQUIP_OPTIONS[key]||[]).find(i=>i.name===val);
  if(staticItem) return {src:'static', name:staticItem.name, rarity:staticItem.rarity, stat:staticItem.stat||'', durability:staticItem.durability||6, maxDurability:staticItem.maxDurability||8};
  return null;
}

function getEquipItem(s, key){
  const raw=s.equipment?.[key];
  return migrateEquipVal(key, raw);
}


/* ════════════════ 3. 視覺輔助 ════════════════ */
function hexEquip(sz=36, rarity='common'){
  const cx=sz/2, cy=sz/2, r=sz*.4;
  const pts=Array.from({length:6},(_,i)=>{
    const a=Math.PI/6+i*Math.PI/3;
    return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;
  }).join(' ');
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><polygon points="${pts}" fill="rgba(200,80,20,.45)" stroke="none"/><polygon points="${pts}" fill="none" stroke="#ff6633" stroke-width="1.5"/></svg>`;
}

function durBar(dur, maxDur, width=36){
  const pct=Math.max(0, Math.min(1, dur/maxDur));
  const barW=Math.round(width*pct);
  const hue=Math.round(pct*120);
  const color=`hsl(${hue},100%,55%)`;
  return `<div style="width:${width}px;height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;"><div style="width:${barW}px;height:100%;background:${color};"></div></div>`;
}


/* ════════════════ 4. 確認對話框 ════════════════ */
function confirmEquip(type, uid, name){
  if(isInBattle()){ showToast('// 戰鬥中無法更換裝備'); return; }
  if(!confirm(`是否裝備【${name}】?`)) return;
  equipFromBag(type, uid);
}

function confirmUnequip(slotKey, name){
  if(isInBattle()){ showToast('// 戰鬥中無法更換裝備'); return; }
  if(!confirm(`是否卸下【${name}】?`)) return;
  unequipItem(slotKey);
}


/* ════════════════ 5. 裝備動作 ════════════════ */
function equipFromBag(type, uid){
  if(isInBattle()){ showToast('// 戰鬥中無法更換裝備'); return; }
  const s=initState();
  // 已裝備中 → 拒絕(避免同一把武器同時裝到主副手 / 同一個飾品裝到 acc1 acc2)
  if(isUidEquipped(s, uid)){
    showToast('// 此裝備已裝備中');
    return;
  }
  const bag=s.bag||{};
  let item=null, slotKey=null;
  if(type==='weapon'){
    item=(bag.weapons||[]).find(w=>w.uid===uid);
    if(!item){ showToast('// 找不到裝備'); return; }
    // 空槽優先:main → off,都滿則替換 main
    if(!s.equipment.main)      slotKey='main';
    else if(!s.equipment.off)  slotKey='off';
    else                       slotKey='main';
  } else {
    item=(bag.armors||[]).find(a=>a.uid===uid);
    if(!item) return;
    const typeToSlot={helmet:'helmet', chest:'chest', pants:'pants', boots:'boots', acc:'acc1'};
    slotKey=typeToSlot[item.armorType]||item.armorType;
    if(slotKey==='acc1' && s.equipment.acc1) slotKey='acc2';
  }
  if(!item){ showToast('// 找不到裝備'); return; }
  s.equipment[slotKey]={
    src:'bag', uid:item.uid, name:item.name, customName:item.customName||null, rarity:item.rarity,
    stat:item.stat||'', durability:item.dur, maxDurability:item.maxDur,
  };
  save(s);
  showToast(`// 裝備 ${getDisplayName(item)}`);
  if(typeof renderBag==='function') renderBag();
  if(typeof renderStatus==='function') renderStatus();
  // 從 panel(戰鬥/地圖 overlay)裝備時要同步重繪 panel 列表;沒開時不跑無謂渲染。
  if(typeof renderBattlePanel==='function'){
    const ov=document.getElementById('map-panel-overlay');
    if(ov && ov.classList.contains('show')) renderBattlePanel();
  }
}

function unequipItem(slotKey){
  if(isInBattle()){ showToast('// 戰鬥中無法更換裝備'); return; }
  const s=initState();
  if(!s.equipment[slotKey]){ showToast('// 該槽位為空'); return; }
  const name=getDisplayName(s.equipment[slotKey])||'裝備';
  s.equipment[slotKey]=null;
  save(s);
  showToast(`// 卸下 ${name}`);
  if(typeof renderBag==='function') renderBag();
  if(typeof renderStatus==='function') renderStatus();
  if(typeof renderBattlePanel==='function'){
    const ov=document.getElementById('map-panel-overlay');
    if(ov && ov.classList.contains('show')) renderBattlePanel();
  }
}


/* ════════════════ 6. 下拉選單(裝備 / 技能)════════════════ */
function openEquipDD(key, name, cb){
  const s=initState();
  const bag=s.bag||{materials:{}, weapons:[], armors:[], items:{}};
  document.getElementById('equip-dd-title').textContent='SELECT — '+name.replace('\n', ' ');
  const list=document.getElementById('equip-dd-list');
  list.innerHTML='';

  // 卸下選項
  const e=document.createElement('div');
  e.className='dropdown-item empty-opt';
  e.textContent='— UNEQUIP —';
  e.onclick=()=>{
    s.equipment[key]=null;
    save(s);
    closeDD('equip');
    (cb||renderStatus)();
  };
  list.appendChild(e);

  const slotType=EQUIP_SLOT_TYPE[key]||'weapon';
  const bagItems=slotType==='weapon'?(bag.weapons||[]):(bag.armors||[]);
  bagItems.forEach(item=>{
    // 過濾已裝備在其他槽的(避免同 uid 同時裝在多格)
    if(isUidEquipped(s, item.uid, key)) return;
    if(slotType==='armor' && item.armorType && item.armorType!==key
       && !((key==='acc1'||key==='acc2') && item.armorType==='acc')) return;
    const d=document.createElement('div');
    d.className='dropdown-item';
    const durStr=item.dur!==undefined?` <span style="color:var(--text-dim);font-size:10px;">${item.dur}/${item.maxDur}</span>`:'';
    d.innerHTML=`<span style="color:#ddd">${getDisplayName(item)}</span>${durStr}<span class="dropdown-rarity r-${item.rarity}">${(item.rarity||'').toUpperCase()}</span>`;
    d.onclick=()=>{
      s.equipment[key]={
        src:'bag', uid:item.uid, name:item.name, customName:item.customName||null, rarity:item.rarity,
        stat:item.stat||'', durability:item.dur, maxDurability:item.maxDur,
      };
      save(s);
      closeDD('equip');
      (cb||renderStatus)();
    };
    list.appendChild(d);
  });
  // 靜態預設已移除,背包為唯一來源
  document.getElementById('equip-overlay').classList.add('show');
}

function openSkillDD(idx, cb){
  const s=initState();
  document.getElementById('skill-dd-title').textContent=`SLOT ${idx+1} — SELECT SKILL`;
  const list=document.getElementById('skill-dd-list');
  list.innerHTML='';

  // 移除技能
  const e=document.createElement('div');
  e.className='dropdown-item skill-dd-item empty-opt';
  e.textContent='— REMOVE SKILL —';
  e.onclick=()=>{
    const oldKey=s.skills[idx];
    if(!oldKey){ closeDD('skill'); return; }
    const oldName=SKILL_OPTIONS.find(sk=>sk.key===oldKey)?.name||oldKey;
    closeDD('skill');
    gConfirm('移除技能<span style="color:#aa88ff;">【'+oldName+'】</span>?<br><span style="font-size:12px;color:rgba(255,255,255,.4);">熟練度將歸零</span>', ok=>{
      if(!ok) return;
      const s2=initState();
      if(s2.skillProf) s2.skillProf[oldKey]=0;
      delete s2.skills[idx];
      save(s2);
      (cb||renderStatus)();
    });
  };
  list.appendChild(e);

  const equipped=Object.values(s.skills||{}).filter(Boolean);
  SKILL_OPTIONS.forEach(sk=>{
    if(equipped.includes(sk.key)) return;
    const d=document.createElement('div');
    d.className='dropdown-item skill-dd-item';
    const prof=(s.skillProf||{})[sk.key]||0;
    const moves=SKILL_DEFS[sk.key]?.moves||[];
    const unlocked=moves.filter(m=>prof>=m.profReq).length;
    const profBar='<div style="height:2px;background:rgba(170,136,255,.15);border-radius:1px;margin-top:3px;width:80px;display:inline-block;vertical-align:middle;"><div style="height:100%;width:'+(prof/10)+'%;background:#aa88ff;border-radius:1px;"></div></div>';
    d.innerHTML='<div style="flex:1;"><div style="font-size:13px;color:#ddd;">'+sk.name+'</div><div style="font-size:10px;color:var(--text-dim);margin-top:2px;">'+sk.desc+' · '+unlocked+'/'+moves.length+'招 '+profBar+' '+prof+'/1000</div></div>';
    d.onclick=()=>{
      const oldKey=s.skills[idx];
      closeDD('skill');
      if(oldKey && oldKey!==sk.key){
        const oldName=SKILL_OPTIONS.find(x=>x.key===oldKey)?.name||oldKey;
        gConfirm('將<span style="color:#aa88ff;">【'+oldName+'】</span>替換為<span style="color:#aa88ff;">【'+sk.name+'】</span>?<br><span style="font-size:12px;color:#ff4466;text-shadow:0 0 8px #ff446688;">舊技能熟練度將歸零</span>', ok=>{
          if(!ok) return;
          const s2=initState();
          if(s2.skillProf) s2.skillProf[oldKey]=0;
          s2.skills[idx]=sk.key;
          save(s2);
          (cb||renderStatus)();
        });
      } else {
        const s2=initState();
        s2.skills[idx]=sk.key;
        save(s2);
        (cb||renderStatus)();
      }
    };
    list.appendChild(d);
  });
  document.getElementById('skill-overlay').classList.add('show');
}


/* ════════════════════════════════════════════════════════════════════════
 * 戰鬥技能熟練度系統(Phase 5d 補回 — 原始檔 L1675-1716)
 *
 * 這 3 個函式在某個 Phase 不小心被一起刪掉,沒有實際從原檔搬來,
 * 導致進戰鬥時 CARD_DECK=buildBattleDeck(s) 拋 ReferenceError、
 * 卡片池為空,使用者看到「沒東西可選」。
 *
 * 內容:
 *   - buildBattleDeck(s):依 s.skills(裝備中的 4 個技能)+ unarmed,
 *     收集所有「熟練度已達 profReq」或「已永久解鎖」的招式作為當前牌組
 *   - profMul(profVal):熟練度 0~1000 → 0.5x ~ 1.0x 的傷害加成
 *   - gainSkillProf(s, skillKey, amt):打牌後增加熟練度,
 *     並在跨過解鎖閾值時把招式 push 到 s.unlockedMoves(永久解鎖)
 *
 * 依賴:state.js: SKILL_DEFS / utils.js: showToast
 * ════════════════════════════════════════════════════════════════════════ */

// 取得玩家當前招式池(體術 unarmed 永遠包含)
function buildBattleDeck(s){
  const prof=s.skillProf||{};
  const unlocked=s.unlockedMoves||{};
  const equipped=Object.values(s.skills||{}).filter(Boolean);
  const skillKeys=['unarmed', ...equipped];
  const moves=[];
  skillKeys.forEach(key=>{
    const def=SKILL_DEFS[key]; if(!def) return;
    const p=prof[key]||0;
    const ul=unlocked[key]||[];
    def.moves.forEach(m=>{
      // profReq=0 的基礎招式永遠有,或已永久解鎖,或當前熟練度夠
      if(m.profReq===0 || ul.includes(m.id) || p>=m.profReq){
        moves.push({...m, skillKey:key});
      }
    });
  });
  return moves;
}

// 熟練度加成係數(0~1000 → 0.5~1.0 倍額外加成)
function profMul(profVal){
  return 0.5 + 0.5*(Math.min(profVal, 1000)/1000);
}

// 增加熟練度並檢查解鎖
function gainSkillProf(s, skillKey, amt){
  if(!s.skillProf) s.skillProf={};
  if(!s.unlockedMoves) s.unlockedMoves={};
  const old=s.skillProf[skillKey]||0;
  if(old>=1000) return;
  s.skillProf[skillKey]=Math.min(1000, old+amt);
  const nw=s.skillProf[skillKey];
  const def=SKILL_DEFS[skillKey];
  if(!def) return;
  // 檢查新解鎖招式,永久記錄
  def.moves.forEach(m=>{
    if(old<m.profReq && nw>=m.profReq){
      if(!s.unlockedMoves[skillKey]) s.unlockedMoves[skillKey]=[];
      if(!s.unlockedMoves[skillKey].includes(m.id)) s.unlockedMoves[skillKey].push(m.id);
      showToast(`// 【${def.name}】解鎖新招式:${m.name}!`);
    }
  });
}
