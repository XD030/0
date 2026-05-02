/* ========================================================================
 * shop.js — 地圖節點商店系統(Phase 6)
 *
 * 走到地圖 shop 節點時的買賣介面,跟 market.js 不同
 * (market 是主畫面市集,shop 是冒險中遭遇的小型商店)。
 *
 * 內容:
 *   1. 稀有度 / 分類色表 RARITY_COLOR / SHOP_CAT_COLOR / CAT_LABEL
 *   2. 商品池 SHOP_BUY_ITEMS
 *   3. 背包橋接 getShopBag / removeFromShopBag(讀寫主背包)
 *   4. 狀態 shopState
 *   5. 主流程 openShop / closeShop
 *   6. Tab / 篩選 switchShopTab / buildShopFilterBar / shopSetFilter / renderShop
 *   7. 賣出多選
 *      - long-press: shopStartLongPress / shopClearLongPress / shopSellLongPress
 *      - tap: shopSellTap / shopSellCancel / shopSellConfirm
 *      - 確認對話框: showSellConfirmDialog / closeSellDlg / executeSell
 *   8. 買入 shopBuyItem
 *
 * 依賴:
 *   - state.js / storage.js / utils.js
 *   - bag.js: bagAddMaterial / bagAddItem(實際在 skills.js)
 *   - battle.js: renderMap / updateMapHp / renderNextChoices(關閉商店時刷地圖)
 * ======================================================================== */



// 商店系統
// ══════════════════════════════════════════

// 稀有度色表
// ══════════════════════════════════════════

// RARITY_COLOR 已移到 items.js(Phase A);本檔 L209/258 直接讀全域 RARITY_COLOR。
// epic 色從原本 '#cc88ff' 改為 items.js 版本 '#aa66ff',統一三表色差。

// 分類顏色
const SHOP_CAT_COLOR = {
  weapon:   { on:'background:rgba(0,200,255,.12);color:#00c8ff;border-color:rgba(0,200,255,.5);',   off:'color:rgba(0,200,255,.4);border-color:rgba(0,200,255,.2);'   },
  armor:    { on:'background:rgba(255,170,51,.12);color:#ffaa33;border-color:rgba(255,170,51,.5);', off:'color:rgba(255,170,51,.4);border-color:rgba(255,170,51,.2);' },
  item:     { on:'background:rgba(180,100,255,.12);color:#b464ff;border-color:rgba(180,100,255,.5);',off:'color:rgba(180,100,255,.4);border-color:rgba(180,100,255,.2);'},
  material: { on:'background:rgba(0,255,150,.12);color:#00ff96;border-color:rgba(0,255,150,.5);',   off:'color:rgba(0,255,150,.4);border-color:rgba(0,255,150,.2);'   },
};
const CAT_LABEL = { weapon:'武器', armor:'裝備', item:'道具', material:'素材' };

// 商品池(Phase C 精簡 stock entries)
// 每個 entry:{key, stock?, price?} — 沒寫 price 就用 def.basePrice。
// def 由 items.js 的 *_REGISTRY 提供;_resolveShopStock 把 stock entry + def 合成 render-friendly 物件。
const SHOP_BUY_ITEMS = {
  weapon: [
    {key:'cheap_iron_sword', stock:1, price:150},  // 鐵劍(便宜版)
    {key:'steel_sword',      stock:1, price:1200}, // 精鋼劍(等於 def.basePrice)
    {key:'dark_blade',       stock:1, price:5000}, // 暗黑刃
    {key:'short_dagger',     stock:1, price:130},  // 短刀
  ],
  armor: [
    {key:'leather_armor', stock:1, price:120},  // 皮甲
    {key:'steel_chest',   stock:1, price:800},  // 精鋼胸甲
    {key:'dragon_ring',   stock:1, price:3000}, // 龍骨戒指
    {key:'light_boots',   stock:1, price:100},  // 輕步靴
  ],
  item: [
    {key:'hp_s',     stock:1, price:50},  // 初級回復藥(shop 比 market 80g 便宜)
    {key:'hp_m',     stock:1, price:100}, // 中級回復藥
    {key:'hp_l',     stock:1, price:200}, // 高級回復藥
    {key:'antidote', stock:1, price:40},
    {key:'elixir',   stock:1, price:180},
  ],
  material: [
    {key:'iron_ore',       stock:1, price:20},   // shop 賣 20g(market basePrice 50g)
    {key:'steel_ingot',    stock:1, price:200},
    {key:'mithril',        stock:1, price:500},
    {key:'spirit_herb',    stock:1, price:300},
    {key:'dragon_scale',   stock:1, price:2000},
    // 農田種子(每次開店隨機 1 個出貨,沿用 _resolveShopStock 的隨機抽樣)
    {key:'seed_weed',      stock:1, price:30},
    {key:'seed_mint',      stock:1, price:50},
    {key:'seed_moongrass', stock:1, price:120},
    {key:'seed_rose',      stock:1, price:200},
  ],
};

// 把 stock entry({key, stock?, price?})+ def → render-friendly 物件(維持舊 shopState.buyItems shape)
function _resolveShopStock(stockEntry, cat){
  const def = cat==='weapon'   ? getWeaponDef(stockEntry.key)
            : cat==='armor'    ? getArmorDef(stockEntry.key)
            : cat==='item'     ? getConsumableDef(stockEntry.key)
            : cat==='material' ? getMaterialDef(stockEntry.key)
            : null;
  if(!def){ console.warn('[shop] unknown def key:', stockEntry.key, 'cat:', cat); return null; }
  const out = {
    id:     def.key,                          // shopBuyItem 由此查 def
    name:   def.name,
    rarity: def.rarity,
    price:  stockEntry.price ?? def.basePrice,
    _cat:   cat,
  };
  if(cat==='weapon'){
    const wt=getWeaponType(def.weaponType);
    out.sub=wt?.name||def.weaponType;
    out.icon=wt?.icon||'⚔️';
    out.dur=def.baseDur; out.maxDur=def.maxDur; out.enhance=def.baseEnhance||0;
  } else if(cat==='armor'){
    const at=getArmorType(def.armorType);
    out.sub=at?.name||def.armorType;
    out.icon=at?.icon||'🛡️';
    out.dur=def.baseDur; out.maxDur=def.maxDur; out.enhance=def.baseEnhance||0;
  } else if(cat==='item'){
    out.sub=def.itemType==='potion'||def.itemType==='food'?'回復':(def.itemType==='scroll'||def.itemType==='tool'?'工具':'狀態');
    out.icon=def.icon||'📦';
  } else if(cat==='material'){
    out.sub={ore:'礦物',plant:'植物',mob:'怪物',craft:'素材'}[def.matCategory]||'素材';
    out.icon=def.icon||'📦';
  }
  return out;
}

// mock 背包（之後整合時替換成真實背包資料）
// playerBag 改為從 s.bag 動態讀取
function getShopBag(){
  const s=initState();
  const bag=s.bag||{materials:{},weapons:[],armors:[],items:{}};
  const items=[];
  // 素材
  MATERIAL_REGISTRY.forEach(m=>{
    const qty=bag.materials[m.key]||0;
    if(qty>0) items.push({id:m.key,cat:'material',name:m.name,rarity:m.rarity,sellPrice:Math.floor((m.basePrice||30)*0.5),qty,icon:m.icon||'📦'});
  });
  // 武器
  (bag.weapons||[]).forEach(w=>{
    const icon=getWeaponType(w.weaponType)?.icon||'⚔️';
    items.push({id:w.uid,cat:'weapon',name:getDisplayName(w),rarity:w.rarity,sellPrice:w.sellPrice||100,dur:w.dur,maxDur:w.maxDur,enhance:w.enhance,qty:1,_uid:w.uid,icon});
  });
  // 裝備
  (bag.armors||[]).forEach(a=>{
    const icon=getArmorType(a.armorType)?.icon||'🛡️';
    items.push({id:a.uid,cat:'armor',name:a.name,rarity:a.rarity,sellPrice:a.sellPrice||80,dur:a.dur,maxDur:a.maxDur,enhance:a.enhance,qty:1,_uid:a.uid,icon});
  });
  // 道具
  Object.entries(bag.items||{}).forEach(([key,qty])=>{
    if(qty<=0)return;
    const def=getConsumableSafe(key);
    items.push({id:key,cat:'item',name:def.name,rarity:def.rarity,sellPrice:Math.floor((def.basePrice||50)*0.5),qty,icon:def.icon||'📦'});
  });
  return items;
}

function removeFromShopBag(id, cat, qty=1){
  const s=initState();
  if(!s.bag) return;
  if(cat==='material'){ s.bag.materials[id]=Math.max(0,(s.bag.materials[id]||0)-qty); if(!s.bag.materials[id]) delete s.bag.materials[id]; }
  else if(cat==='weapon'){ s.bag.weapons=(s.bag.weapons||[]).filter(w=>w.uid!==id); }
  else if(cat==='armor'){ s.bag.armors=(s.bag.armors||[]).filter(a=>a.uid!==id); }
  else if(cat==='item'){ s.bag.items[id]=Math.max(0,(s.bag.items[id]||0)-qty); if(!s.bag.items[id]) delete s.bag.items[id]; }
  s.character.gold=(s.character.gold||0); // gold已在executeSell加過
  save(s);
}
let shopState = {
  gold: 500,
  tab: 'buy',
  filter: 'all',
  buyItems: [],
  boughtIds: new Set(),
  sellMulti: false,
  sellSelected: new Set(),
};

function openShop(){
  const s=initState();
  shopState.gold=s.character.gold||0;
  const selected=[];
  Object.entries(SHOP_BUY_ITEMS).forEach(([cat,pool])=>{
    const shuffled=[...pool].sort(()=>Math.random()-.5);
    shuffled.slice(0,cat==='item'?2:1).forEach(stockEntry=>{
      const item=_resolveShopStock(stockEntry, cat);
      if(item) selected.push(item);
    });
  });
  // 補足 5 件:從所有未選的 stock entry 中隨機補
  const allPool=Object.entries(SHOP_BUY_ITEMS).flatMap(([cat,arr])=>arr.map(e=>({...e,_cat:cat})));
  while(selected.length<5){
    const rem=allPool.filter(p=>!selected.find(s=>s.id===p.key));
    if(!rem.length)break;
    const p=rem[Math.floor(Math.random()*rem.length)];
    const item=_resolveShopStock(p, p._cat);
    if(item) selected.push(item);
  }
  shopState.buyItems=selected;
  shopState.boughtIds=new Set();
  shopState.tab='buy';
  shopState.filter='all';
  document.querySelectorAll('#shop-tabs .bag-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('shop-gold-display').textContent=shopState.gold+' G';
  buildShopFilterBar();
  renderShop();
  document.getElementById('shop-overlay').classList.add('show');
}

function switchShopTab(tab, el){
  shopState.tab = tab;
  shopState.filter = 'all';
  shopState.sellMulti = false;
  shopState.sellSelected = new Set();
  document.querySelectorAll('#shop-tabs .bag-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  buildShopFilterBar();
  renderShop();
}

function buildShopFilterBar(){
  const row = document.getElementById('shop-filter-row');
  if(!row) return;
  const allStyle = shopState.filter==='all'
    ? 'background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue);'
    : 'color:rgba(0,200,255,.35);border-color:rgba(0,200,255,.18);';
  const cats = ['weapon','armor','item','material'];
  row.innerHTML = `<div class="bag-filter-row-inner">
    <div class="bag-filter" style="flex-shrink:0;${allStyle}" onclick="shopSetFilter('all')">全部</div>` +
    cats.map(cat=>{
      const cc = SHOP_CAT_COLOR[cat];
      const style = shopState.filter===cat ? cc.on : cc.off;
      return `<div class="bag-filter" style="flex-shrink:0;${style}" onclick="shopSetFilter('${cat}')">${CAT_LABEL[cat]}</div>`;
    }).join('') +
  `</div>`;
}

function shopSetFilter(cat){
  shopState.filter = cat;
  buildShopFilterBar();
  renderShop();
}

function renderShop(){
  const list = document.getElementById('shop-list');
  if(!list) return;

  if(shopState.tab === 'buy'){
    // ── 購買 ──
    // shopState.buyItems 每個 entry 都有 _cat 欄位(由 _resolveShopStock 設),直接用 _cat 過濾
    let items = shopState.filter==='all'
      ? shopState.buyItems
      : shopState.buyItems.filter(i => i._cat===shopState.filter);

    if(!items.length){ list.innerHTML=`<div class="bag-empty">// 無商品</div>`; return; }
    const rarityOrder = RARITY_ORDER;
    items = [...items].sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));

    list.innerHTML = items.map(item => {
      const color = RARITY_COLOR[item.rarity] || '#aaa';
      const bought = shopState.boughtIds.has(item.id);
      const hasGear = !!(item.dur);
      const enhance = item.enhance ? `<span class="bag-item-enhance">+${item.enhance}</span>` : '';
      return `<div class="bag-item${bought?' sold':''}" onclick="shopBuyItem('${item.id}')">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${item.icon||'📦'}</div>
        <div style="flex:1;min-width:0;margin-left:8px;">
          <div class="bag-item-name">${item.name}${enhance}</div>
          <div class="bag-item-sub">${item.sub}</div>
        </div>
        ${hasGear ? `<div class="bag-item-dur">${item.dur}/${item.maxDur}</div>` : ''}
        <div class="bag-item-price">${item.price} G</div>
      </div>`;
    }).join('');

  } else {
    // ── 販賣 ──
    let items = shopState.filter==='all'
      ? getShopBag()
      : getShopBag().filter(i => i.cat===shopState.filter);

    if(!items.length){ list.innerHTML=`<div class="bag-empty">// 背包無物品</div>`; return; }

    const isMulti = shopState.sellMulti;
    const sel = shopState.sellSelected;

    // 確認列（多選模式才顯示）
    let confirmBar = '';
    if(isMulti && sel.size > 0){
      const totalG = [...sel].reduce((sum,id)=>{
        const it = getShopBag().find(i=>i.id===id);
        return sum + (it ? it.sellPrice : 0);
      }, 0);
      confirmBar = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;background:rgba(255,200,50,.05);">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-sub);">已選 ${sel.size} 件　合計</span>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-family:var(--font-mono);font-size:15px;color:var(--gold);font-weight:bold;">+${totalG} G</span>
          <div onclick="shopSellConfirm()" style="padding:5px 16px;border:1px solid var(--gold);color:var(--gold);font-family:var(--font-mono);font-size:11px;letter-spacing:1px;cursor:pointer;background:rgba(255,200,50,.08);">確認售出</div>
          <div onclick="shopSellCancel()" style="padding:5px 12px;border:1px solid rgba(255,255,255,.15);color:var(--text-sub);font-family:var(--font-mono);font-size:11px;cursor:pointer;">取消</div>
        </div>
      </div>`;
    } else if(isMulti){
      confirmBar = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;">
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-sub);">點選物品加入選單</span>
        <div onclick="shopSellCancel()" style="padding:5px 12px;border:1px solid rgba(255,255,255,.15);color:var(--text-sub);font-family:var(--font-mono);font-size:11px;cursor:pointer;">取消</div>
      </div>`;
    }

    list.innerHTML = confirmBar + items.map(item => {
      const color = RARITY_COLOR[item.rarity] || '#aaa';
      const hasGear = !!(item.dur);
      const enhance = item.enhance ? `<span class="bag-item-enhance">+${item.enhance}</span>` : '';
      const checked = isMulti && sel.has(item.id);
      const checkedStyle = checked ? 'background:rgba(255,200,50,.07);' : '';
      const checkBox = isMulti
        ? `<div style="width:20px;height:20px;border-radius:50%;border:1.5px solid ${checked?'var(--gold)':'rgba(255,255,255,.2)'};background:${checked?'rgba(255,200,50,.25)':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:4px;">
            ${checked?`<div style="width:8px;height:8px;border-radius:50%;background:var(--gold);"></div>`:''}
           </div>`
        : '';
      return `<div class="bag-item" style="${checkedStyle}cursor:pointer;"
          onclick="shopSellTap('${item.id}')"
          oncontextmenu="shopSellLongPress('${item.id}');return false;"
          ontouchstart="shopStartLongPress('${item.id}',event)"
          ontouchend="shopClearLongPress()"
          ontouchmove="shopClearLongPress()">
        ${checkBox}
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${item.icon||'📦'}</div>
        <div style="flex:1;min-width:0;margin-left:8px;">
          <div class="bag-item-name">${item.name}${enhance}</div>
          <div class="bag-item-sub">${item.sub||''}</div>
        </div>
        ${hasGear ? `<div class="bag-item-dur">${item.dur}/${item.maxDur}</div>` : ''}
        ${item.qty > 1 ? `<div class="bag-item-qty" style="margin-right:4px;">×${item.qty}</div>` : ''}
        <div class="bag-item-price">${item.sellPrice} G</div>
      </div>`;
    }).join('');
  }
}

// ── 長按計時器 ──
let _lpTimer = null;
function shopStartLongPress(id, e){
  _lpTimer = setTimeout(()=>{ shopSellLongPress(id); }, 500);
}
function shopClearLongPress(){ clearTimeout(_lpTimer); _lpTimer=null; }
function shopSellLongPress(id){
  if(!shopState.sellMulti){
    shopState.sellMulti = true;
    shopState.sellSelected = new Set();
  }
  shopState.sellSelected.add(id);
  renderShop();
}

// ── 點擊邏輯 ──
function shopSellTap(id){
  if(shopState.sellMulti){
    // 多選模式：切換選取
    if(shopState.sellSelected.has(id)) shopState.sellSelected.delete(id);
    else shopState.sellSelected.add(id);
    // 若全部取消選取則離開多選模式
    if(shopState.sellSelected.size === 0) shopState.sellMulti = false;
    renderShop();
  } else {
    // 單選：直接二次確認
    const sb=getShopBag(); const item = sb.find(i=>i.id===id); if(!item) return;
    showSellConfirmDialog([id]);
  }
}

function shopSellCancel(){
  shopState.sellMulti = false;
  shopState.sellSelected = new Set();
  renderShop();
}

function shopSellConfirm(){
  const ids = [...shopState.sellSelected];
  shopState.sellMulti = false;
  shopState.sellSelected = new Set();
  showSellConfirmDialog(ids);
}

// ── 二次確認 dialog ──
let _pendingSellIds = [];

function showSellConfirmDialog(ids){
  const _sb=getShopBag(); const items = ids.map(id=>_sb.find(i=>i.id===id)).filter(Boolean);
  if(!items.length) return;
  _pendingSellIds = ids;
  const totalG = items.reduce((s,i)=>s+i.sellPrice, 0);
  const nameList = items.length===1
    ? items[0].name
    : items.slice(0,3).map(i=>i.name).join('、') + (items.length>3?` 等${items.length}件`:'');

  let dlg = document.getElementById('sell-confirm-dlg');
  if(!dlg){ dlg=document.createElement('div'); dlg.id='sell-confirm-dlg'; document.querySelector('.phone').appendChild(dlg); }
  dlg.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;';
  dlg.innerHTML=`<div style="width:280px;background:#060e1a;border:1px solid rgba(255,200,50,.3);padding:24px 20px;display:flex;flex-direction:column;gap:16px;">
    <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:3px;color:var(--text-sub);">// 確認售出</div>
    <div style="font-family:var(--font-zh);font-size:14px;color:var(--text);line-height:1.6;">${nameList}</div>
    <div style="font-family:var(--font-mono);font-size:20px;color:var(--gold);text-align:right;">+${totalG} G</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <div onclick="closeSellDlg()" style="padding:8px 20px;border:1px solid rgba(255,255,255,.15);color:var(--text-sub);font-family:var(--font-mono);font-size:12px;cursor:pointer;">取消</div>
      <div onclick="executeSell()" style="padding:8px 20px;border:1px solid var(--gold);color:var(--gold);font-family:var(--font-mono);font-size:12px;cursor:pointer;background:rgba(255,200,50,.08);">售出</div>
    </div>
  </div>`;
}

function closeSellDlg(){
  const dlg=document.getElementById('sell-confirm-dlg');
  if(dlg) dlg.style.display='none';
}

function executeSell(){
  const ids = _pendingSellIds;
  _pendingSellIds = [];
  closeSellDlg();
  const sb=getShopBag();
  let total=0;
  const s=initState();
  ids.forEach(id=>{
    const item=sb.find(i=>i.id===id); if(!item) return;
    total+=item.sellPrice;
    removeFromShopBag(id, item.cat, 1);
  });
  shopState.gold+=total;
  s.character.gold=shopState.gold;
  save(s);
  document.getElementById('shop-gold-display').textContent=shopState.gold+' G';
  showToast(`// 售出 +${total} G`);
  renderShop();
}

// Phase C 起,buyItems 的 i.id 已等同 def key(由 _resolveShopStock 設定),
// 不再需要 SHOP_ID_TO_DEF 對映表。i._cat 標明分類。
function shopBuyItem(id){
  const item = shopState.buyItems.find(i=>i.id===id); if(!item) return;
  if(shopState.boughtIds.has(id)){ showToast('// 已購買'); return; }
  if(shopState.gold < item.price){ showToast('// G 不足'); return; }
  shopState.gold -= item.price;
  shopState.boughtIds.add(id);
  // 寫入 s.bag
  const s=initState();
  s.character.gold=shopState.gold;
  if(!s.bag) s.bag={materials:{},weapons:[],armors:[],items:{}};
  const cat = item._cat;
  const defKey = item.id;
  if(cat==='material'){ s.bag.materials[defKey]=(s.bag.materials[defKey]||0)+1; }
  else if(cat==='weapon'){
    const inst=makeWeaponInstance(defKey);
    if(inst) s.bag.weapons.push(inst);
    else { showToast('// 武器資料缺失:'+defKey); return; }
  }
  else if(cat==='armor'){
    const inst=makeArmorInstance(defKey);
    if(inst) s.bag.armors.push(inst);
    else { showToast('// 防具資料缺失:'+defKey); return; }
  }
  else if(cat==='item'){ s.bag.items[defKey]=(s.bag.items[defKey]||0)+1; }
  save(s);
  document.getElementById('shop-gold-display').textContent = shopState.gold + ' G';
  showToast(`// ${item.name} 購買成功`);
  renderShop();
}

function closeShop(){
  shopSellCancel();
  closeSellDlg();
  document.getElementById('shop-overlay').classList.remove('show');
  renderMap(); renderNextChoices();
}
