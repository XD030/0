/* ========================================================================
 * bag.js — 背包系統(Phase 6)
 *
 * 內容:
 *   1. 狀態 bagTab / bagFilter / bagSubFilter
 *   2. 子分類定義 BAG_SUB_DEFS / BAG_CAT_COLORS
 *   3. 物品操作 confirmUseItem / useItem(治療品 等)
 *   4. 篩選列 buildBagFilterBar / renderBagFilterBar /
 *               updateBagFilterBar / bagSetFilter
 *   5. tab 系統 BAG_TAB_COLORS / updateBagTabColors /
 *                switchBagTab / switchBagFilter
 *   6. 標籤對映 BAG_RARITY_LABEL / BAG_CAT_LABEL
 *   7. 主渲染 renderBag(4 大 tab:material / weapon / armor / item)
 *
 * 不在這裡:
 *   - 背包寫入助手 bagAddMaterial / bagAddItem(在 skills.js,因為 Phase 5a
 *     第一個用到的是 HUNT collectHunt)
 *   - in-battle panel 用的 renderPanelBag(用同份背包資料,但 UI 不同,
 *     之後 Phase 6 panel 抽出時一起搬)
 *
 * 依賴:
 *   - state.js: initState
 *   - storage.js: load / save
 *   - utils.js: showToast / gConfirm
 *   - character.js: maxHp
 *   - equipment.js: getEquipItem(displayName)、confirmEquip / confirmUnequip
 *   - items.js: WEAPON_TYPES / ARMOR_TYPES(BAG_SUB_DEFS 動態子分類)
 *   - 仍 inline:isInBattle(會搬到 battle.js 但目前已在 battle.js 了)
 * ======================================================================== */


// ── 背包 ──
let bagTab='material';
let bagFilter='all';
let bagSubFilter='all';

const BAG_SUB_DEFS={
  material:[{key:'ore',label:'礦物'},{key:'plant',label:'植物'},{key:'mob',label:'怪物素材'},{key:'seed',label:'種子'}],
  weapon:()=>WEAPON_TYPES.map(w=>({key:w.key,label:w.name})),
  armor:()=>ARMOR_TYPES.map(p=>({key:p.key,label:p.name})),
  item:[{key:'potion',label:'藥水'},{key:'food',label:'食物'},{key:'other',label:'其他'}],
};

const BAG_CAT_COLORS={weapon:{on:'background:rgba(0,200,255,.12);color:#00c8ff;border-color:rgba(0,200,255,.5);',off:'color:rgba(0,200,255,.4);border-color:rgba(0,200,255,.2);'},armor:{on:'background:rgba(255,170,51,.12);color:#ffaa33;border-color:rgba(255,170,51,.5);',off:'color:rgba(255,170,51,.4);border-color:rgba(255,170,51,.2);'},material:{on:'background:rgba(0,255,150,.12);color:#00ff96;border-color:rgba(0,255,150,.5);',off:'color:rgba(0,255,150,.4);border-color:rgba(0,255,150,.2);'},item:{on:'background:rgba(180,100,255,.12);color:#b464ff;border-color:rgba(180,100,255,.5);',off:'color:rgba(180,100,255,.4);border-color:rgba(180,100,255,.2);'}};

function buildBagFilterBar(){
  // 重建HTML（只在tab切換時呼叫）
  const filterRow=document.getElementById('bag-filter-row');
  if(!filterRow)return;
  const subDef=BAG_SUB_DEFS[bagTab];
  const subs=subDef?(typeof subDef==='function'?subDef():subDef):[];
  const cc=BAG_CAT_COLORS[bagTab]||{on:'',off:''};
  filterRow.innerHTML=
    `<div class="bag-filter-row-inner">`+
    `<div class="bag-filter" data-val="all" style="background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue);" onclick="bagSetFilter('all','all',this)">全部</div>`+
    subs.map(s=>`<div class="bag-filter" data-val="${s.key}" style="flex-shrink:0;${cc.off}" onclick="bagSetFilter('${s.key}','all',this)">${s.label}</div>`).join('')+
    `</div>`+
    (subs.length?`<div class="bag-filter" style="flex-shrink:0;background:rgba(255,100,100,.12);color:#ff6464;border-color:#ff6464;margin-right:var(--s3);" onclick="bagSetFilter('all','all',this)">清除</div>`:'');
  filterRow.style.display=subs.length?'flex':'none';
}

function bagSetFilter(filter, sub, el){
  const inner=document.querySelector('#bag-filter-row .bag-filter-row-inner');
  const savedScroll=inner?inner.scrollLeft:0;
  bagFilter=filter; bagSubFilter=sub;
  updateBagFilterBar();
  renderBag();
  if(inner) inner.scrollLeft=savedScroll;
}


// ── 背包物品操作 ──
function confirmUseItem(key, name, heal){
  const s=initState();
  const mhp=maxHp(s.character.level,s.character.VIT);
  const curHp=s.character.hp;
  const afterHp=Math.min(mhp,curHp+heal);
  const got=afterHp-curHp;
  const pct=Math.round(curHp/mhp*100);
  const afterPct=Math.round(afterHp/mhp*100);
  const msgEl=document.getElementById('g-confirm-msg');
  if(msgEl){
    msgEl.innerHTML=`
      <div style="margin-bottom:12px;">是否使用【${name}】？</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
        <span style="font-size:11px;color:rgba(0,200,255,.7);letter-spacing:2px;">HP</span>
        <span style="font-size:11px;letter-spacing:2px;color:rgba(0,200,255,.7);">${curHp}/${mhp}</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;margin-bottom:12px;position:relative;">
        <div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:linear-gradient(90deg,#ff2244,#ff6644);border-radius:3px;box-shadow:0 0 6px #ff4433aa;"></div>
        <div style="position:absolute;left:${pct}%;top:0;height:100%;width:${Math.max(0,afterPct-pct)}%;background:rgba(68,221,136,.18);border-radius:0 3px 3px 0;border-top:1px solid rgba(68,221,136,.7);border-right:1px solid rgba(68,221,136,.7);border-bottom:1px solid rgba(68,221,136,.7);box-shadow:0 0 8px rgba(68,221,136,.4);"></div>
      </div>
      <div style="color:#44dd88;font-size:15px;letter-spacing:1px;">HP +${got}</div>`;
  }
  const overlay=document.getElementById('g-confirm-overlay');
  if(overlay)overlay.style.display='flex';
  _gConfirmCb=ok=>{if(ok)useItem(key);};
}



function useItem(key){
  const s=initState();
  const def=getConsumableDef(key);
  if(!def){showToast('// 無法使用');return;}
  if(!s.bag.items[key]||s.bag.items[key]<=0){showToast('// 數量不足');return;}
  const heal=(def.effect?.kind==='heal')?(def.effect.amount||0):0;
  if(heal>0){
    const mhp=maxHp(s.character.level,s.character.VIT);
    const before=s.character.hp;
    s.character.hp=Math.min(mhp,s.character.hp+heal);
    const got=s.character.hp-before;
    s.bag.items[key]--;
    if(s.bag.items[key]<=0)delete s.bag.items[key];
    save(s);
    showToast(`// HP +${got} (${s.character.hp}/${mhp})`);
  } else {
    showToast('// 此道具無法直接使用');
    return;
  }
  renderBag();
  renderStatus&&renderStatus();
}



function renderBagFilterBar(){
  updateBagFilterBar();
}

function updateBagFilterBar(){
  // 只更新樣式，不重建HTML（保留scrollLeft）
  const filterRow=document.getElementById('bag-filter-row');
  if(!filterRow)return;
  const subDef=BAG_SUB_DEFS[bagTab];
  const subs=subDef?(typeof subDef==='function'?subDef():subDef):[];
  const cc=BAG_CAT_COLORS[bagTab]||{on:'',off:''};
  const inner2=filterRow.querySelector('.bag-filter-row-inner')||filterRow;
  inner2.querySelectorAll('.bag-filter[data-val]').forEach(el=>{
    const val=el.dataset.val;
    if(val==='all'){
      const active=bagFilter==='all';
      el.style.cssText=active?'background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue);':'background:transparent;color:rgba(0,200,255,.3);border-color:rgba(0,200,255,.15);';
    } else {
      const active=bagFilter===val;
      el.style.cssText='flex-shrink:0;'+(active?cc.on:cc.off);
    }
  });
}

const BAG_TAB_COLORS={
  material:{color:'#00ff96',border:'rgba(0,255,150,.6)',shadow:'rgba(0,255,150,.5)'},
  weapon:  {color:'#00c8ff',border:'rgba(0,200,255,.6)',shadow:'rgba(0,200,255,.5)'},
  armor:   {color:'#ffaa33',border:'rgba(255,170,51,.6)',shadow:'rgba(255,170,51,.5)'},
  item:    {color:'#b464ff',border:'rgba(180,100,255,.6)',shadow:'rgba(180,100,255,.5)'},
};

function updateBagTabColors(){
  document.querySelectorAll('#bag-tabs .bag-tab').forEach(t=>{
    const tab=t.dataset.tab;
    const tc=BAG_TAB_COLORS[tab];
    const isActive=tab===bagTab;
    t.classList.toggle('active', isActive);
    if(isActive&&tc){
      t.style.color=tc.color;
      t.style.borderBottomColor=tc.border;
      t.style.textShadow=`0 0 10px ${tc.shadow}`;
    } else {
      t.style.color='';t.style.borderBottomColor='';t.style.textShadow='';
    }
  });
}

function switchBagTab(tab, el){
  bagTab=tab; bagFilter='all'; bagSubFilter='all';
  document.querySelectorAll('#bag-tabs .bag-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  updateBagTabColors();
  buildBagFilterBar();
  renderBag();
}

function switchBagFilter(cat){
  bagFilter=cat; bagSubFilter='all';
  renderBagFilterBar();
  renderBag();
}

const BAG_RARITY_LABEL={common:'普通',rare:'稀有',epic:'史詩'};
const BAG_CAT_LABEL={ore:'礦物',plant:'植物',mob:'怪物素材',craft:'素材'};

// 核心 list render(讀全域 bagTab / bagFilter)。
// 主背包頁的 renderBag 跟戰鬥/地圖 panel 共用此 helper,DOM 容器由 caller 提供。
function _renderBagListInto(listEl){
  if(!listEl)return;
  const s=initState();
  const bag=s.bag||{materials:{},weapons:[],armors:[],items:{}};
  const rarityOrder=RARITY_ORDER;
  const rc=RARITY_COLOR;

  if(bagTab==='material'){
    const mats=MATERIAL_REGISTRY.filter(m=>{
      if(bagFilter!=='all'&&m.matCategory!==bagFilter) return false;
      return true;
    }).map(m=>({...m,stock:bag.materials[m.key]||0}))
      .filter(m=>m.stock>0)
      .sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));
    if(!mats.length){listEl.innerHTML=`<div class="bag-empty">// 空</div>`;return;}
    listEl.innerHTML=mats.map(m=>{
      const color=rc[m.rarity]||'#aaa';
      const icon=m.icon||'📦';
      return`<div class="bag-item">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${icon}</div>
        <div style="flex:1;margin-left:8px;"><div class="bag-item-name">${m.name}</div></div>
        <div class="bag-item-qty">×${m.stock}</div>
      </div>`;
    }).join('');

  } else if(bagTab==='weapon'){
    const weapons=(bag.weapons||[]).filter(w=>bagFilter==='all'||w.weaponType===bagFilter)
      .sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));
    if(!weapons.length){listEl.innerHTML=`<div class="bag-empty">// 空</div>`;return;}
    const equippedWeaponUids=Object.values(s.equipment||{}).filter(e=>e?.src==='bag').map(e=>e.uid);
    listEl.innerHTML=weapons.map(w=>{
      const color=rc[w.rarity]||'#aaa';
      const wType=getWeaponType(w.weaponType);
      const isEquipped=equippedWeaponUids.includes(w.uid);
      const eSlot=Object.entries(s.equipment||{}).find(([,v])=>v?.uid===w.uid)?.[0]||null;
      const action=isEquipped?`unequipItem('${eSlot}')`:`equipFromBag('weapon','${w.uid}')`;
      return`<div class="bag-item" onclick="${action}" style="cursor:pointer;">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${wType?.icon||'⚔️'}</div>
        <div style="flex:1;margin-left:8px;">
          <div class="bag-item-name" style="color:${isEquipped?'#ffaa33':''};">${getDisplayName(w)}${w.enhance>0?`<span style="font-family:var(--font-mono);font-size:14px;color:#ffaa33;margin-left:6px;">+${w.enhance}</span>`:''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">${durBar(w.dur,w.maxDur,60)}<span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);">${w.dur}/${w.maxDur}</span></div>
        </div>
      </div>`;
    }).join('');

  } else if(bagTab==='armor'){
    const armors=(bag.armors||[]).filter(a=>bagFilter==='all'||a.armorType===bagFilter)
      .sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));
    if(!armors.length){listEl.innerHTML=`<div class="bag-empty">// 空</div>`;return;}
    const equippedArmorUids=Object.values(s.equipment||{}).filter(e=>e?.src==='bag').map(e=>e.uid);
    listEl.innerHTML=armors.map(a=>{
      const color=rc[a.rarity]||'#aaa';
      const aType=getArmorType(a.armorType);
      const isEquipped=equippedArmorUids.includes(a.uid);
      const eSlot=Object.entries(s.equipment||{}).find(([,v])=>v?.uid===a.uid)?.[0]||null;
      const action=isEquipped?`unequipItem('${eSlot}')`:`equipFromBag('armor','${a.uid}')`;
      return`<div class="bag-item" onclick="${action}" style="cursor:pointer;">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${aType?.icon||'🛡️'}</div>
        <div style="flex:1;margin-left:8px;">
          <div class="bag-item-name" style="color:${isEquipped?'#ffaa33':''};">${a.name}${a.enhance>0?`<span style="font-family:var(--font-mono);font-size:14px;color:#ffaa33;margin-left:6px;">+${a.enhance}</span>`:''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">${durBar(a.dur,a.maxDur,60)}<span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);">${a.dur}/${a.maxDur}</span></div>
        </div>
      </div>`;
    }).join('');

  } else if(bagTab==='item'){
    const typeLabel={potion:'藥水',food:'食物',scroll:'卷軸',tool:'工具',other:'其他'};
    const allItems=Object.entries(bag.items||{})
      .map(([key,qty])=>({...getConsumableSafe(key),qty}))
      .filter(i=>i.qty>0&&(bagFilter==='all'||i.itemType===bagFilter))
      .sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));
    if(!allItems.length){listEl.innerHTML=`<div class="bag-empty">// 空</div>`;return;}
    listEl.innerHTML=allItems.map(i=>{
      const color=rc[i.rarity]||'#aaa';
      const healAmt=(i.effect?.kind==='heal')?(i.effect.amount||0):0;
      const canUse=(i.itemType==='potion'||i.itemType==='food')&&healAmt>0;
      const onclick=canUse?`confirmUseItem('${i.key}','${i.name}',${healAmt})`:'';
      return`<div class="bag-item" ${onclick?`onclick="${onclick}" style="cursor:pointer;"`:''}>
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${i.icon||'📦'}</div>
        <div style="flex:1;margin-left:8px;">
          <div class="bag-item-name">${i.name}</div>
          <div class="bag-item-sub">${typeLabel[i.itemType]||i.itemType||''}${i.heal?` · HP+${i.heal}`:''}</div>
        </div>
        <div class="bag-item-qty">×${i.qty}</div>
      </div>`;
    }).join('');
  }
}

function renderBag(){
  const list=document.getElementById('bag-list');
  if(!list)return;
  const page=document.getElementById('page-bag');
  const scrollY=page?page.scrollTop:0;
  renderBagFilterBar();
  _renderBagListInto(list);
  if(page) requestAnimationFrame(()=>{page.scrollTop=scrollY;});
}
