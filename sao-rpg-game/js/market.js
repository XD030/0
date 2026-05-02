/* ========================================================================
 * market.js — 市集系統(Phase 6)
 *
 * 內容:
 *   1. 狀態 marketTab / marketFilter / marketSubFilter / sellStep /
 *           sellCategory / sellItem / sellWeaponFilter / marketBuyMulti /
 *           marketBuySelected / marketSellMulti / marketSellSelected
 *   2. 視覺常數 MARKET_CAT_COLORS / MARKET_BUY_SUB(商品定義已搬至 items.js)
 *   3. Tab / 篩選器 switchMarketTab / buildMarketFilterBar /
 *                    updateMarketFilterBar / marketSetFilter / marketSetSubFilter /
 *                    switchMarketFilter / switchMarketSubFilter / renderMarketFilterBar
 *   4. 主渲染 renderMarket
 *   5. 購買流程
 *      - long-press: startMarketHold / endMarketHold / marketBuyTap /
 *                    marketBuyCancel
 *      - 數量調整: mktQtyStep / mktQtyInput / startMktQty / stopMktQty
 *      - 確認購買: marketBuyConfirm / execMarketBuySelected / marketBuyItem
 *   6. 販賣流程
 *      - 列表渲染: renderSellFromBag
 *      - long-press: startMarketSellHold / endMarketSellHold /
 *                    marketSellTap / marketSellCancel
 *      - 數量調整: mktSellQtyStep / mktSellQtyInput / startMktSellQty /
 *                  stopMktSellQty
 *      - 確認賣出: marketSellConfirm / updateSellConfirmTotal /
 *                  confirmSellWithPrices / cancelSellConfirm /
 *                  execMarketSellSelected(customPrices)
 *      - 舊單品流: sellSelectItem / confirmSell
 *
 * 依賴:
 *   - state.js / storage.js / utils.js 基礎
 *   - bag.js: bagAddMaterial / bagAddItem(其實在 skills.js)
 *   - 仍 inline:無
 * ======================================================================== */


// ── 市集 ──
let marketTab='buy';
let marketFilter='all';
let marketSubFilter='all';
let sellStep=0; // 0=選分類 1=選物品 2=輸入價格
let sellCategory=null;
let sellItem=null;
let sellWeaponFilter='all';

// MARKET_ITEMS 已於 Phase D 刪除,改由 items.js 的 getMarketBuyList()(動態 view)提供。
// 新增市集物品:在 items.js 對應 *_REGISTRY 加 def 並設 source 含 'market' 即可。

function switchMarketTab(tab, el){
  marketTab=tab; marketFilter='all'; marketSubFilter='all'; sellStep=0; sellCategory=null; sellItem=null;
  marketBuyMulti=false; marketBuySelected=new Map();
  marketSellMulti=false; marketSellSelected=new Map();
  syncMarketTabVisual();
  renderMarket();
}

/* 同步上排 tab 的 active class + inline 顏色到 marketTab 變數現值
 * 進場 / renderMarket 都會呼叫,避免跳到別頁回來時殘留上次離開的視覺。 */
function syncMarketTabVisual(){
  const tabs=document.querySelectorAll('#market-tabs .bag-tab');
  if(!tabs.length)return;
  tabs.forEach(t=>{
    t.classList.remove('active');
    t.style.color='';t.style.borderBottomColor='';t.style.textShadow='';
  });
  const active=document.querySelector(`#market-tabs .bag-tab[data-tab="${marketTab}"]`);
  if(active){
    active.classList.add('active');
    if(marketTab==='buy'){
      active.style.color='var(--blue)';active.style.borderBottomColor='var(--blue)';active.style.textShadow='0 0 10px rgba(0,200,255,.5)';
    } else {
      active.style.color='#ffaa33';active.style.borderBottomColor='#ffaa33';active.style.textShadow='0 0 10px rgba(255,170,51,.5)';
    }
  }
  const filterRow=document.getElementById('market-filter-row');
  if(filterRow){
    if(marketTab==='buy'){
      filterRow.style.display='flex';
      buildMarketFilterBar();
    } else {
      filterRow.style.display='none';
    }
  }
}

const MARKET_CAT_COLORS={weapon:{on:'background:rgba(0,200,255,.12);color:#00c8ff;border-color:rgba(0,200,255,.5);',off:'color:rgba(0,200,255,.4);border-color:rgba(0,200,255,.2);'},armor:{on:'background:rgba(255,170,51,.12);color:#ffaa33;border-color:rgba(255,170,51,.5);',off:'color:rgba(255,170,51,.4);border-color:rgba(255,170,51,.2);'},material:{on:'background:rgba(0,255,150,.12);color:#00ff96;border-color:rgba(0,255,150,.5);',off:'color:rgba(0,255,150,.4);border-color:rgba(0,255,150,.2);'},item:{on:'background:rgba(180,100,255,.12);color:#b464ff;border-color:rgba(180,100,255,.5);',off:'color:rgba(180,100,255,.4);border-color:rgba(180,100,255,.2);}'}};
const MARKET_BUY_SUB={material:[{key:'ore',label:'礦物'},{key:'plant',label:'植物'},{key:'mob',label:'怪物素材'}],weapon:()=>WEAPON_TYPES.map(w=>({key:w.key,label:w.name})),armor:()=>ARMOR_TYPES.map(p=>({key:p.key,label:p.name})),item:[{key:'potion',label:'藥水'},{key:'food',label:'食物'},{key:'scroll',label:'卷軸'},{key:'tool',label:'工具'},{key:'other',label:'其他'}]};

function buildMarketFilterBar(){
  const filterRow=document.getElementById('market-filter-row');
  if(!filterRow)return;
  if(marketFilter!=='all'){
    const subDef=MARKET_BUY_SUB[marketFilter];
    const subs=subDef?(typeof subDef==='function'?subDef():subDef):[];
    const cc=MARKET_CAT_COLORS[marketFilter]||{on:'',off:''};
    filterRow.innerHTML=
      `<div class="bag-filter-row-inner">`+
      subs.map(s=>`<div class="bag-filter" data-val="${s.key}" style="flex-shrink:0;${cc.off}" onclick="marketSetSubFilter('${s.key}',this)">${s.label}</div>`).join('')+
      `</div>`+
      `<div class="bag-filter" style="flex-shrink:0;background:rgba(255,100,100,.12);color:#ff6464;border-color:#ff6464;" onclick="marketSetFilter('all',this)">清除</div>`;
  } else {
    filterRow.innerHTML=
      `<div class="bag-filter-row-inner">`+
      `<div class="bag-filter" data-val="all" style="background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue);" onclick="marketSetFilter('all',this)">全部</div>`+
      ['material','weapon','armor','item'].map(cat=>{
        const label={material:'素材',weapon:'武器',armor:'裝備',item:'道具'}[cat];
        const cc=MARKET_CAT_COLORS[cat]||{on:'',off:''};
        return`<div class="bag-filter" data-val="${cat}" style="flex-shrink:0;${cc.off}" onclick="marketSetFilter('${cat}',this)">${label}</div>`;
      }).join('')+
      `</div>`;
  }
  updateMarketFilterBar();
}

function updateMarketFilterBar(){
  const filterRow=document.getElementById('market-filter-row');
  if(!filterRow)return;
  const inner=filterRow.querySelector('.bag-filter-row-inner')||filterRow;
  if(marketFilter!=='all'){
    const cc=MARKET_CAT_COLORS[marketFilter]||{on:'',off:''};
    inner.querySelectorAll('.bag-filter[data-val]').forEach(el=>{
      el.style.cssText='flex-shrink:0;'+(marketSubFilter===el.dataset.val?cc.on:cc.off);
    });
  } else {
    inner.querySelectorAll('.bag-filter[data-val]').forEach(el=>{
      const val=el.dataset.val;
      if(val==='all'){
        el.style.cssText=marketFilter==='all'?'background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue);':'background:transparent;color:rgba(0,200,255,.3);border-color:rgba(0,200,255,.15);';
      } else {
        const cc=MARKET_CAT_COLORS[val]||{on:'',off:''};
        el.style.cssText='flex-shrink:0;'+(marketFilter===val?cc.on:cc.off);
      }
    });
  }
}

function marketSetFilter(cat, el){
  const inner=document.querySelector('#market-filter-row .bag-filter-row-inner');
  const savedScroll=inner?inner.scrollLeft:0;
  marketFilter=cat; marketSubFilter='all';
  buildMarketFilterBar();
  renderMarket();
  const newInner=document.querySelector('#market-filter-row .bag-filter-row-inner');
  if(newInner) newInner.scrollLeft=savedScroll;
}

function marketSetSubFilter(sub, el){
  const inner=document.querySelector('#market-filter-row .bag-filter-row-inner');
  const savedScroll=inner?inner.scrollLeft:0;
  marketSubFilter=sub;
  updateMarketFilterBar();
  renderMarket();
  const newInner=document.querySelector('#market-filter-row .bag-filter-row-inner');
  if(newInner) newInner.scrollLeft=savedScroll;
}

function switchMarketFilter(cat){ marketSetFilter(cat, null); }
function switchMarketSubFilter(sub){ marketSetSubFilter(sub, null); }
function renderMarketFilterBar(){ updateMarketFilterBar(); }

let marketBuyMulti=false;
let marketBuySelected=new Map(); // key+'|'+cat -> qty
let _mktHoldTimer=null;
let _mktHoldInterval=null;
let marketSellMulti=false;
let marketSellSelected=new Map(); // uid+'|'+cat+'|'+key -> qty

function renderMarket(){
  const list=document.getElementById('market-list');
  if(!list){showToast('// market-list not found');return;}
  try{
  // Tab 視覺同步:跳到別頁回來時,把上排 tab + filter bar 對齊到 marketTab 現值,不讓殘留樣式遺留
  syncMarketTabVisual();
  // 同步顯示實際金幣
  const _s=initState();
  const goldEl=document.getElementById('market-gold');
  if(goldEl)goldEl.textContent=(_s.character.gold||0).toLocaleString()+' G';
  const mpage=document.getElementById('page-market');
  const scrollY=mpage?mpage.scrollTop:0;
  const rarityOrder=RARITY_ORDER;
  const buyList=getMarketBuyList();

  if(marketTab==='buy'){
    updateMarketFilterBar();
    let items=[];
    if(marketFilter==='all') Object.values(buyList).forEach(arr=>items.push(...arr));
    else items=buyList[marketFilter]||[];
    if(marketSubFilter!=='all'){
      if(marketFilter==='weapon') items=items.filter(i=>i.weaponType===marketSubFilter);
      else if(marketFilter==='armor') items=items.filter(i=>i.armorType===marketSubFilter);
      else if(marketFilter==='item') items=items.filter(i=>i.itemType===marketSubFilter);
      else if(marketFilter==='material') items=items.filter(i=>i.matCategory===marketSubFilter);
    }
    items.sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));
    if(!items.length){list.innerHTML=`<div class="bag-empty">// 空</div>`;return;}

    // 多選模式頂部條
    const totalCost=[...marketBuySelected.entries()].reduce((sum,[k,qty])=>{
      const[key,cat]=k.split('|');
      const item=buyList[cat]?.find(i=>i.key===key);
      return sum+(item?item.price*qty:0);
    },0);
    const multiBar=marketBuyMulti?`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(3,8,15,.95);border-bottom:1px solid rgba(255,170,51,.25);flex-shrink:0;">
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,170,51,.8);">${marketBuySelected.size}件 · ${totalCost} G</span>
      <div style="display:flex;gap:6px;">
        <div onclick="marketBuyCancel()" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--text-dim);padding:3px 10px;border:1px solid rgba(255,255,255,.12);border-radius:2px;cursor:pointer;">取消</div>
        <div onclick="marketBuyConfirm()" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:#44dd88;padding:3px 10px;border:1px solid rgba(68,221,136,.4);border-radius:2px;cursor:pointer;">購買</div>
      </div>
    </div>`:'';

    list.innerHTML=multiBar+items.map(item=>{
      const color=RARITY_COLOR[item.rarity]||'#aaa';
      const hasGear=item.category==='weapon'||item.category==='armor';
      const selKey=item.key+'|'+item.category;
      const qty=marketBuySelected.get(selKey)||0;
      const isSel=qty>0;
      const canQty=!hasGear; // 素材/道具可調數量
      const qtyCtrl=marketBuyMulti&&isSel&&canQty?`<div class="mkt-qty-ctrl" style="display:flex;align-items:center;gap:0;flex-shrink:0;" onclick="event.stopPropagation()">
        <div ontouchstart="startMktQty('${selKey}',-1,event)" ontouchend="stopMktQty()" ontouchcancel="stopMktQty()"
             onmousedown="startMktQty('${selKey}',-1,event)" onmouseup="stopMktQty()" onmouseleave="stopMktQty()"
             onclick="event.stopPropagation()"
          style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.15);border-radius:3px 0 0 3px;color:#fff;font-size:16px;cursor:pointer;user-select:none;">−</div>
        <input type="number" class="mkt-qty-input" min="1" value="${qty}" oninput="mktQtyInput('${selKey}',this.value)" onclick="event.stopPropagation()"
          style="width:36px;height:26px;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-left:none;border-right:none;color:#fff;font-family:var(--font-mono);font-size:12px;outline:none;">
        <div ontouchstart="startMktQty('${selKey}',1,event)" ontouchend="stopMktQty()" ontouchcancel="stopMktQty()"
             onmousedown="startMktQty('${selKey}',1,event)" onmouseup="stopMktQty()" onmouseleave="stopMktQty()"
             onclick="event.stopPropagation()"
          style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.15);border-radius:0 3px 3px 0;color:#fff;font-size:16px;cursor:pointer;user-select:none;">＋</div>
      </div>`:
      '';

      return`<div class="bag-item" style="cursor:pointer;${isSel?'background:rgba(255,170,51,.06);':''}"
        onclick="marketBuyTap('${item.key}','${item.category}')"
        ontouchstart="startMarketHold('${item.key}','${item.category}',event)"
        ontouchend="endMarketHold()" ontouchcancel="endMarketHold()" ontouchmove="endMarketHold()"
        onmousedown="startMarketHold('${item.key}','${item.category}',event)"
        onmouseup="endMarketHold()" onmouseleave="endMarketHold()"
        oncontextmenu="marketBuyCtxClear('${item.key}','${item.category}',event)">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        ${isSel?`<div style="width:16px;height:16px;border-radius:50%;background:#ffaa33;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:#000;font-weight:bold;margin-right:-2px;">✓</div>`:''}
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${item.category==='weapon'?'⚔️':item.category==='armor'?'🛡️':item.category==='item'?(item.itemType==='potion'?'🧪':item.itemType==='food'?'🍖':'📦'):(()=>{try{const p=Object.values(GATH_DECK).flat().find(([,k])=>k===item.key);return p?p[3]:'📦';}catch(e){return'📦';}})()}</div>
        <div style="flex:1;min-width:0;margin-left:8px;">
          <div class="bag-item-name">${item.name}${hasGear&&item.enhance>0?`<span style="font-family:var(--font-mono);font-size:14px;color:#ffaa33;margin-left:6px;">+${item.enhance}</span>`:''}</div>
          ${hasGear?`<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">${durBar(item.dur,item.maxDur,60)}<span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);">${item.dur}/${item.maxDur}</span></div>`:''}
        </div>
        ${qtyCtrl}
        <div style="font-family:var(--font-mono);font-size:13px;color:#ffaa33;flex-shrink:0;width:72px;text-align:right;">${item.price} G</div>
      </div>`;
    }).join('');

  } else {
    // 賣：從s.bag讀取實際物品
    renderSellFromBag();
  }

  if(mpage) requestAnimationFrame(()=>{mpage.scrollTop=scrollY;});
  }catch(e){showToast('// 市集錯誤: '+e.message);console.error(e);}
}

// ── 市集：購買寫入s.bag ──
// 新模型(對齊 CRFT 素材選擇):點一下 = 加 1 進車,長按 = 從車移除,實際付款仍走多選列上方「購買」鈕。
let _marketHoldTimer=null;
let _marketHoldFired=false; // 長按已觸發 → 抑制隨後的 click(避免清除完又被當成 +1)
function startMarketHold(key,cat,e){
  // 排除 +/- 按鈕與 input(避免長按連加被誤觸發)
  if(e && e.target && e.target.closest && e.target.closest('.mkt-qty-ctrl')) return;
  _marketHoldFired=false;
  if(_marketHoldTimer)clearTimeout(_marketHoldTimer);
  _marketHoldTimer=setTimeout(()=>{
    _marketHoldTimer=null;
    _marketHoldFired=true; // 長按觸發 → 抑制後續合成 click
    const selKey=key+'|'+cat;
    if(marketBuySelected.has(selKey)){
      // 已在車內 → 清除該項
      marketBuySelected.delete(selKey);
      if(marketBuySelected.size===0)marketBuyMulti=false;
    } else {
      // 不在車內 → 加入車 ×1(進多選模式)
      marketBuyMulti=true;
      marketBuySelected.set(selKey,1);
    }
    renderMarket();
  },500);
}
function endMarketHold(){
  if(_marketHoldTimer){clearTimeout(_marketHoldTimer);_marketHoldTimer=null;}
}
function marketBuyTap(key,cat){
  // 剛才是長按完的合成 click,跳過
  if(_marketHoldFired){_marketHoldFired=false; return;}
  const item=getMarketBuyList()[cat]?.find(i=>i.key===key);
  if(!item)return;
  const hasGear=cat==='weapon'||cat==='armor';
  const selKey=key+'|'+cat;
  marketBuyMulti=true;
  if(!marketBuySelected.has(selKey)){
    marketBuySelected.set(selKey,1);
  } else if(!hasGear){
    // 素材/道具可疊;裝備類 uid 單件保持 1
    marketBuySelected.set(selKey, marketBuySelected.get(selKey)+1);
  }
  renderMarket();
}
function marketBuyCtxClear(key, cat, e){
  // 在 +/- 控制器或 input 上的右鍵 → 放行(讓原生 context menu 出來,例如 input 貼上)
  if(e && e.target && e.target.closest && e.target.closest('.mkt-qty-ctrl')) return;
  e.preventDefault();
  const selKey=key+'|'+cat;
  if(marketBuySelected.has(selKey)){
    marketBuySelected.delete(selKey);
    if(marketBuySelected.size===0)marketBuyMulti=false;
    renderMarket();
  }
  // 不在車內就靜默 no-op
}
function marketBuyCancel(){
  marketBuyMulti=false;marketBuySelected.clear();renderMarket();
}
function mktQtyStep(selKey,delta){
  const cur=marketBuySelected.get(selKey)||1;
  const nv=Math.max(1,cur+delta);
  marketBuySelected.set(selKey,nv);
  renderMarket();
}
function mktQtyInput(selKey,val){
  const nv=Math.max(1,parseInt(val)||1);
  marketBuySelected.set(selKey,nv);
}
function startMktQty(selKey,delta,e){
  e.stopPropagation();
  mktQtyStep(selKey,delta);
  _mktHoldTimer=setTimeout(()=>{
    _mktHoldInterval=setInterval(()=>mktQtyStep(selKey,delta),120);
  },400);
}
function stopMktQty(){
  if(_mktHoldTimer){clearTimeout(_mktHoldTimer);_mktHoldTimer=null;}
  if(_mktHoldInterval){clearInterval(_mktHoldInterval);_mktHoldInterval=null;}
}
function marketBuyConfirm(){
  if(!marketBuySelected.size)return;
  const s=initState();
  let totalCost=0;
  const items=[];
  marketBuySelected.forEach((qty,selKey)=>{
    const[key,cat]=selKey.split('|');
    const item=getMarketBuyList()[cat]?.find(i=>i.key===key);
    if(item){totalCost+=item.price*qty;items.push({...item,qty});}
  });
  if((s.character.gold||0)<totalCost){showToast(`// G 不足（需 ${totalCost} G）`);return;}
  let dlg=document.getElementById('sell-confirm-dlg');
  if(!dlg){dlg=document.createElement('div');dlg.id='sell-confirm-dlg';document.body.appendChild(dlg);}
  const nameList=items.length===1?`${items[0].name}${items[0].qty>1?' ×'+items[0].qty:''}`:items.slice(0,3).map(i=>`${i.name}${i.qty>1?' ×'+i.qty:''}`).join('、')+(items.length>3?` 等${items.length}種`:'');
  gConfirm(`購買 ${nameList}？\n-${totalCost} G`, ok=>{if(ok)execMarketBuySelected();});
}
function execMarketBuySelected(){
  marketBuySelected.forEach((qty,selKey)=>{
    const[key,cat]=selKey.split('|');
    for(let i=0;i<qty;i++)marketBuyItem(key,cat);
  });
  marketBuyMulti=false;marketBuySelected.clear();
}
function marketBuyItem(key, category){
  const s=initState();
  const item=getMarketBuyList()[category]?.find(i=>i.key===key); if(!item) return;
  if((s.character.gold||0)<item.price){showToast('// G 不足');return;}
  s.character.gold-=item.price;
  if(!s.bag) s.bag={materials:{},weapons:[],armors:[],items:{}};
  if(category==='material'){
    s.bag.materials[key]=(s.bag.materials[key]||0)+1;
  } else if(category==='weapon'){
    const inst=makeWeaponInstance(key);
    if(inst) s.bag.weapons.push(inst);
    else { showToast('// 武器資料缺失:'+key); return; }
  } else if(category==='armor'){
    const inst=makeArmorInstance(key);
    if(inst) s.bag.armors.push(inst);
    else { showToast('// 防具資料缺失:'+key); return; }
  } else if(category==='item'){
    s.bag.items[key]=(s.bag.items[key]||0)+1;
  }
  save(s);
  showToast(`// ${item.name} 購入 -${item.price} G`);
  renderMarket();
}

// ── 市集：販賣從s.bag讀取 ──
function renderSellFromBag(){
  const s=initState();
  const bag=s.bag||{materials:{},weapons:[],armors:[],items:{}};
  const list=document.getElementById('market-list'); if(!list) return;
  const rarityOrder=RARITY_ORDER;
  const rc=RARITY_COLOR;
  const SELL_CATS=['material','weapon','armor','item'];
  const CAT_LABELS={material:'素材',weapon:'武器',armor:'裝備',item:'道具'};

  // 分類篩選列
  const CAT_COLORS={weapon:'rgba(0,200,255',armor:'rgba(255,170,51',material:'rgba(0,255,150',item:'rgba(180,100,255'};
  const filterHTML='<div style="display:flex;gap:8px;padding:10px var(--s3);overflow-x:auto;flex-shrink:0;">'+
    SELL_CATS.map(cat=>{
      const active=sellCategory===cat;
      const cc=CAT_COLORS[cat];
      const style=active
        ?'background:'+cc+',.12);color:'+cc.replace('rgba','rgb')+');border-color:'+cc+',.5);'
        :'color:'+cc+',.4);border-color:'+cc+',.2);';
      return '<div class="bag-filter" style="flex-shrink:0;'+style+'" onclick="sellCategory=\''+cat+'\';renderMarket()">'+CAT_LABELS[cat]+'</div>';
    }).join('')+
  '</div>';

  let items=[];
  if(!sellCategory||sellCategory==='material'){
    items=MATERIAL_REGISTRY.map(m=>({...m,qty:bag.materials[m.key]||0,_cat:'material',price:m.basePrice})).filter(m=>m.qty>0);
  } else if(sellCategory==='weapon'){
    items=(bag.weapons||[]).map(w=>({...w,qty:1,_cat:'weapon',_uid:w.uid}));
  } else if(sellCategory==='armor'){
    items=(bag.armors||[]).map(a=>({...a,qty:1,_cat:'armor',_uid:a.uid}));
  } else if(sellCategory==='item'){
    items=Object.entries(bag.items||{}).map(([key,qty])=>{
      const def=getConsumableSafe(key);
      return{...def,qty,_cat:'item',price:def.basePrice||0,sellPrice:Math.floor((def.basePrice||0)*0.5)};
    }).filter(i=>i.qty>0);
  }
  items.sort((a,b)=>(rarityOrder[a.rarity]??9)-(rarityOrder[b.rarity]??9));

  const itemHTML=items.length?items.map(item=>{
    const color=rc[item.rarity]||'#aaa';
    const sellPrice=item.sellPrice||Math.floor((item.price||50)*0.5);
    const hasGear=item._cat==='weapon'||item._cat==='armor';
    const uid=item._uid||item.key;
    const selKey=uid+'|'+item._cat+'|'+item.key;
    const qty=marketSellSelected.get(selKey)||0;
    const isSel=qty>0;
    const canQty=!hasGear;
    const qtyCtrl=marketSellMulti&&isSel&&canQty?`<div class="mkt-qty-ctrl" style="display:flex;align-items:center;gap:4px;flex-shrink:0;" onclick="event.stopPropagation()">
      <div ontouchstart="startMktSellQty('${selKey}',${item.qty},-1,event)" ontouchend="stopMktSellQty()" ontouchcancel="stopMktSellQty()"
           onmousedown="startMktSellQty('${selKey}',${item.qty},-1,event)" onmouseup="stopMktSellQty()" onmouseleave="stopMktSellQty()"
           onclick="event.stopPropagation()"
        style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(68,221,136,.3);background:transparent;color:#44dd88;font-size:16px;cursor:pointer;user-select:none;line-height:1;">−</div>
      <input type="number" class="mkt-qty-input" min="1" max="${item.qty}" value="${qty}" oninput="mktSellQtyInput('${selKey}',${item.qty},this.value)" onclick="event.stopPropagation()"
        style="width:40px;height:28px;text-align:center;background:rgba(0,0,0,.4);border:1px solid rgba(68,221,136,.25);color:#44dd88;font-family:var(--font-mono);font-size:13px;outline:none;">
      <div ontouchstart="startMktSellQty('${selKey}',${item.qty},1,event)" ontouchend="stopMktSellQty()" ontouchcancel="stopMktSellQty()"
           onmousedown="startMktSellQty('${selKey}',${item.qty},1,event)" onmouseup="stopMktSellQty()" onmouseleave="stopMktSellQty()"
           onclick="event.stopPropagation()"
        style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(68,221,136,.3);background:transparent;color:#44dd88;font-size:16px;cursor:pointer;user-select:none;line-height:1;">＋</div>
    </div>`:'';
    if(!hasGear){
      // 非裝備類(material/item)→ 對齊 CRFT picker 樣式:無 ✓ checkmark、無 emoji icon、持有/N 直立堆疊
      return`<div class="bag-item" style="cursor:pointer;${isSel?'background:rgba(68,221,136,.05);':''}"
        onclick="marketSellTap('${uid}','${item._cat}','${item.key}')"
        ontouchstart="startMarketSellHold('${uid}','${item._cat}','${item.key}',event)"
        ontouchend="endMarketSellHold()" ontouchcancel="endMarketSellHold()" ontouchmove="endMarketSellHold()"
        onmousedown="startMarketSellHold('${uid}','${item._cat}','${item.key}',event)"
        onmouseup="endMarketSellHold()" onmouseleave="endMarketSellHold()"
        oncontextmenu="marketSellCtxClear('${uid}','${item._cat}','${item.key}',event)">
        <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
        <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${item._cat==='item'?(item.itemType==='potion'?'🧪':item.itemType==='food'?'🍖':'📦'):(()=>{try{const p=Object.values(GATH_DECK).flat().find(([,k])=>k===item.key);return p?p[3]:'📦';}catch(e){return'📦';}})()}</div>
        <div class="bag-item-name" style="${isSel?'color:#44dd88;':''}">${getDisplayName(item)}</div>
        ${item.qty>1?`<div class="bag-item-qty" style="margin-right:6px;">×${item.qty}</div>`:''}
        ${qtyCtrl}
        <div style="font-family:var(--font-mono);font-size:13px;color:#44dd88;flex-shrink:0;">${sellPrice} G</div>
      </div>`;
    }
    // 裝備類:保留原樣式(durability 條 + 強化 +N 仍重要)
    return`<div class="bag-item" style="cursor:pointer;${isSel?'background:rgba(68,221,136,.05);':''}"
      onclick="marketSellTap('${uid}','${item._cat}','${item.key}')"
      ontouchstart="startMarketSellHold('${uid}','${item._cat}','${item.key}',event)"
      ontouchend="endMarketSellHold()" ontouchcancel="endMarketSellHold()" ontouchmove="endMarketSellHold()"
      onmousedown="startMarketSellHold('${uid}','${item._cat}','${item.key}',event)"
      onmouseup="endMarketSellHold()" onmouseleave="endMarketSellHold()"
      oncontextmenu="marketSellCtxClear('${uid}','${item._cat}','${item.key}',event)">
      <div class="bag-item-rarity" style="background:${color};box-shadow:0 0 6px ${color}88;"></div>
      ${isSel?`<div style="width:16px;height:16px;border-radius:50%;background:#44dd88;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:#000;font-weight:bold;margin-right:-2px;">✓</div>`:''}
      <div style="width:32px;height:32px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;margin-left:6px;">${item._cat==='weapon'?'⚔️':item._cat==='armor'?'🛡️':item._cat==='item'?(item.itemType==='potion'?'🧪':item.itemType==='food'?'🍖':'📦'):(()=>{try{const p=Object.values(GATH_DECK).flat().find(([,k])=>k===item.key);return p?p[3]:'📦';}catch(e){return'📦';}})()}</div>
      <div style="flex:1;min-width:0;margin-left:8px;">
        <div class="bag-item-name">${getDisplayName(item)}${hasGear&&item.enhance>0?`<span style="font-family:var(--font-mono);font-size:13px;color:#ffaa33;margin-left:4px;">+${item.enhance}</span>`:''}</div>
        ${hasGear?`<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">${durBar(item.dur,item.maxDur,60)}<span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);">${item.dur}/${item.maxDur}</span></div>`:''}
      </div>
      ${item.qty>1?`<div class="bag-item-qty" style="margin-right:6px;">×${item.qty}</div>`:''}
      ${qtyCtrl}
      <div style="font-family:var(--font-mono);font-size:13px;color:#44dd88;flex-shrink:0;">${sellPrice} G</div>
    </div>`;
  }).join(''):`<div class="bag-empty">// 背包無物品</div>`;

  const totalEarn=[...marketSellSelected.entries()].reduce((sum,[k,qty])=>{
    const[uid,cat,key]=k.split('|');
    const item=items.find(i=>(i._uid||i.key)===uid);
    const sp=item?(item.sellPrice||Math.floor((item.price||50)*0.5)):0;
    return sum+sp*qty;
  },0);
  const sellMultiBar=marketSellMulti?`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(3,8,15,.95);border-bottom:1px solid rgba(68,221,136,.25);flex-shrink:0;">
    <span style="font-family:var(--font-mono);font-size:11px;color:rgba(68,221,136,.8);">${marketSellSelected.size}件 · +${totalEarn} G</span>
    <div style="display:flex;gap:6px;">
      <div onclick="marketSellCancel()" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--text-dim);padding:3px 10px;border:1px solid rgba(255,255,255,.12);border-radius:2px;cursor:pointer;">取消</div>
      <div onclick="marketSellConfirm()" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:#44dd88;padding:3px 10px;border:1px solid rgba(68,221,136,.4);border-radius:2px;cursor:pointer;">售出</div>
    </div>
  </div>`:'';

  list.innerHTML=filterHTML+sellMultiBar+itemHTML;
}

// ── 市集販賣多選 ──
// 新模型(對齊 CRFT 素材選擇):點一下 = 加 1 進車,長按 = 從車移除,實際售出仍走多選列上方「售出」鈕。
let _mktSellHoldTimer=null;
let _mktSellHoldTimer2=null;
let _mktSellHoldInterval=null;
let _mktSellHoldFired=false; // 長按已觸發 → 抑制隨後的 click
// 售出確認模態的 transient buffer:marketSellConfirm 開啟時填入,confirm/cancel 後清為 null
let _sellConfirmList=null;
function startMarketSellHold(uid,cat,key,e){
  if(e && e.target && e.target.closest && e.target.closest('.mkt-qty-ctrl')) return;
  _mktSellHoldFired=false;
  if(_mktSellHoldTimer)clearTimeout(_mktSellHoldTimer);
  _mktSellHoldTimer=setTimeout(()=>{
    _mktSellHoldTimer=null;
    _mktSellHoldFired=true;
    const selKey=uid+'|'+cat+'|'+key;
    if(marketSellSelected.has(selKey)){
      // 已在車內 → 清除
      marketSellSelected.delete(selKey);
      if(marketSellSelected.size===0)marketSellMulti=false;
    } else {
      // 不在車內 → 加入車 ×1
      marketSellMulti=true;
      marketSellSelected.set(selKey,1);
    }
    renderMarket();
  },500);
}
function endMarketSellHold(){
  if(_mktSellHoldTimer){clearTimeout(_mktSellHoldTimer);_mktSellHoldTimer=null;}
}
function marketSellTap(uid,cat,key){
  if(_mktSellHoldFired){_mktSellHoldFired=false; return;}
  const selKey=uid+'|'+cat+'|'+key;
  const hasGear=cat==='weapon'||cat==='armor';
  // 取背包該物品最大可賣量(裝備固定 1;素材/道具看 bag 庫存)
  let maxQty=1;
  if(!hasGear){
    const s=load();
    if(cat==='material') maxQty=(s.bag?.materials?.[key])||1;
    else if(cat==='item') maxQty=(s.bag?.items?.[key])||1;
  }
  marketSellMulti=true;
  if(!marketSellSelected.has(selKey)){
    marketSellSelected.set(selKey,1);
  } else if(!hasGear){
    const cur=marketSellSelected.get(selKey);
    if(cur<maxQty) marketSellSelected.set(selKey, cur+1);
    // 已達庫存上限就靜默不動(配合既有 +/- 連加邏輯一致)
  }
  renderMarket();
}
function marketSellCtxClear(uid, cat, key, e){
  if(e && e.target && e.target.closest && e.target.closest('.mkt-qty-ctrl')) return;
  e.preventDefault();
  const selKey=uid+'|'+cat+'|'+key;
  if(marketSellSelected.has(selKey)){
    marketSellSelected.delete(selKey);
    if(marketSellSelected.size===0)marketSellMulti=false;
    renderMarket();
  }
}
function marketSellCancel(){marketSellMulti=false;marketSellSelected.clear();renderMarket();}
function mktSellQtyStep(selKey,max,delta){
  const cur=marketSellSelected.get(selKey)||1;
  const nv=Math.max(1,Math.min(max,cur+delta));
  marketSellSelected.set(selKey,nv);renderMarket();
}
function mktSellQtyInput(selKey,max,val){
  const nv=Math.max(1,Math.min(max,parseInt(val)||1));
  marketSellSelected.set(selKey,nv);
}
function startMktSellQty(selKey,max,delta,e){
  e.stopPropagation();
  mktSellQtyStep(selKey,max,delta);
  _mktSellHoldTimer2=setTimeout(()=>{
    _mktSellHoldInterval=setInterval(()=>mktSellQtyStep(selKey,max,delta),120);
  },400);
}
function stopMktSellQty(){
  if(_mktSellHoldTimer2){clearTimeout(_mktSellHoldTimer2);_mktSellHoldTimer2=null;}
  if(_mktSellHoldInterval){clearInterval(_mktSellHoldInterval);_mktSellHoldInterval=null;}
}
function marketSellConfirm(){
  if(!marketSellSelected.size)return;
  const s=initState();
  // 收集車內每筆 → 計算預設單價、抓顯示名稱(武器走 getDisplayName 含 customName,並補 +N 強化)
  const sellList=[];
  marketSellSelected.forEach((qty,selKey)=>{
    const[uid,cat,key]=selKey.split('|');
    let sp=0,name='';
    if(cat==='material'){const def=getMaterialDef(key);sp=Math.floor((def?.basePrice||50)*0.5)||20;name=def?.name||key;}
    else if(cat==='weapon'){const w=(s.bag?.weapons||[]).find(w=>w.uid===uid);sp=w?.sellPrice||100;name=(getDisplayName(w)||key)+(w?.enhance>0?` +${w.enhance}`:'');}
    else if(cat==='armor'){const a=(s.bag?.armors||[]).find(a=>a.uid===uid);sp=a?.sellPrice||80;name=(a?.name||key)+(a?.enhance>0?` +${a.enhance}`:'');}
    else if(cat==='item'){const mi=getConsumableDef(key);sp=Math.floor((mi?.basePrice||50)*0.5)||25;name=mi?.name||key;}
    sellList.push({selKey,uid,cat,key,qty,name,sp});
  });
  _sellConfirmList=sellList;
  const totalDefault=sellList.reduce((sum,i)=>sum+i.sp*i.qty,0);

  let dlg=document.getElementById('sell-confirm-dlg');
  if(!dlg){dlg=document.createElement('div');dlg.id='sell-confirm-dlg';document.body.appendChild(dlg);}
  dlg.style.display='block'; // index.html 那個 <div id="sell-confirm-dlg"> 自帶 inline display:none,要顯式打開
  dlg.innerHTML=`<div style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#060e1a;border:1px solid rgba(68,221,136,.35);border-radius:12px;padding:18px 16px;width:100%;max-width:340px;max-height:80vh;display:flex;flex-direction:column;">
      <div style="font-family:var(--font-mono);font-size:13px;color:#44dd88;letter-spacing:2px;text-align:center;margin-bottom:12px;">// 售出物品</div>
      <div id="sell-confirm-list" style="overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;padding-right:4px;">
        ${sellList.map((it,idx)=>`<div style="display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:rgba(68,221,136,.04);border:1px solid rgba(68,221,136,.15);border-radius:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="font-family:var(--font-zh);font-size:14px;color:#fff;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.name}</span>
            ${it.qty>1?`<span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.6);flex-shrink:0;">×${it.qty}</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);letter-spacing:1px;">單價</span>
            <input class="sell-price-input mkt-qty-input" data-idx="${idx}" type="number" min="0" value="${it.sp}" oninput="updateSellConfirmTotal()"
              style="width:64px;height:24px;text-align:right;background:rgba(0,0,0,.4);border:1px solid rgba(68,221,136,.35);color:#44dd88;font-family:var(--font-mono);font-size:12px;outline:none;padding:0 5px;">
            <span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.4);">G</span>
            <span style="flex:1;text-align:right;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.5);">小計 <span class="sell-subtotal" data-idx="${idx}">${it.sp*it.qty}</span> G</span>
          </div>
        </div>`).join('')}
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.5);letter-spacing:1px;">總計</span>
        <span id="sell-confirm-total" style="font-family:var(--font-mono);font-size:16px;color:#44dd88;letter-spacing:1px;font-weight:bold;">+${totalDefault} G</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button onclick="cancelSellConfirm()" style="flex:1;padding:10px;font-family:var(--font-mono);font-size:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:var(--text-sub);border-radius:8px;cursor:pointer;letter-spacing:1px;">取消</button>
        <button onclick="confirmSellWithPrices()" style="flex:1;padding:10px;font-family:var(--font-mono);font-size:12px;background:rgba(68,221,136,.15);border:1px solid rgba(68,221,136,.4);color:#44dd88;border-radius:8px;cursor:pointer;letter-spacing:1px;">確認售出</button>
      </div>
    </div>
  </div>`;
}

function updateSellConfirmTotal(){
  if(!_sellConfirmList)return;
  const inputs=document.querySelectorAll('#sell-confirm-list .sell-price-input');
  let total=0;
  inputs.forEach(inp=>{
    const idx=parseInt(inp.dataset.idx);
    const it=_sellConfirmList[idx];if(!it)return;
    const price=Math.max(0,parseInt(inp.value)||0);
    const sub=price*it.qty;
    total+=sub;
    const subEl=document.querySelector(`#sell-confirm-list .sell-subtotal[data-idx="${idx}"]`);
    if(subEl)subEl.textContent=sub;
  });
  const totalEl=document.getElementById('sell-confirm-total');
  if(totalEl)totalEl.textContent='+'+total+' G';
}

function confirmSellWithPrices(){
  if(!_sellConfirmList){cancelSellConfirm();return;}
  // 從 input 抽出每筆自訂單價
  const customPrices=new Map();
  document.querySelectorAll('#sell-confirm-list .sell-price-input').forEach(inp=>{
    const idx=parseInt(inp.dataset.idx);
    const it=_sellConfirmList[idx];if(!it)return;
    const price=Math.max(0,parseInt(inp.value)||0);
    customPrices.set(it.selKey,price);
  });
  const dlg=document.getElementById('sell-confirm-dlg');
  if(dlg){dlg.innerHTML='';dlg.style.display='none';}
  _sellConfirmList=null;
  execMarketSellSelected(customPrices);
}

function cancelSellConfirm(){
  const dlg=document.getElementById('sell-confirm-dlg');
  if(dlg){dlg.innerHTML='';dlg.style.display='none';}
  _sellConfirmList=null;
  // 不清 marketSellSelected,讓玩家可重新打開 modal 修改價格
}

function execMarketSellSelected(customPrices){
  const s=initState();
  let totalEarn=0;
  marketSellSelected.forEach((qty,selKey)=>{
    const[uid,cat,key]=selKey.split('|');
    const useCustom=customPrices&&customPrices.has(selKey);
    const customUnit=useCustom?customPrices.get(selKey):0;
    for(let i=0;i<qty;i++){
      if(cat==='material'){
        if((s.bag.materials[key]||0)>0){
          s.bag.materials[key]--;if(!s.bag.materials[key])delete s.bag.materials[key];
          totalEarn+=useCustom?customUnit:(Math.floor((getMaterialDef(key)?.basePrice||50)*0.5)||20);
        }
      } else if(cat==='weapon'){
        const idx=(s.bag.weapons||[]).findIndex(w=>w.uid===uid);
        if(idx>=0){totalEarn+=useCustom?customUnit:(s.bag.weapons[idx].sellPrice||100);s.bag.weapons.splice(idx,1);break;}
      } else if(cat==='armor'){
        const idx=(s.bag.armors||[]).findIndex(a=>a.uid===uid);
        if(idx>=0){totalEarn+=useCustom?customUnit:(s.bag.armors[idx].sellPrice||80);s.bag.armors.splice(idx,1);break;}
      } else if(cat==='item'){
        if((s.bag.items[key]||0)>0){
          s.bag.items[key]--;if(!s.bag.items[key])delete s.bag.items[key];
          totalEarn+=useCustom?customUnit:(Math.floor((getConsumableDef(key)?.basePrice||50)*0.5)||25);
        }
      }
    }
  });
  s.character.gold=(s.character.gold||0)+totalEarn;
  save(s);showToast(`// 售出 +${totalEarn} G`);
  marketSellMulti=false;marketSellSelected.clear();renderMarket();
}

function sellSelectCat(cat){
  sellCategory=cat; sellStep=1; renderMarket();
}
function sellSelectItem(key, cat){
  sellItem=getMarketBuyList()[cat]?.find(x=>x.key===key)||null;
  sellStep=2; renderMarket();
}
function confirmSell(){
  const price=document.getElementById('sell-price-input')?.value||sellItem.price;
  const qtyEl=document.getElementById('sell-qty-input');
  const qty=qtyEl?Math.max(1,parseInt(qtyEl.value)||1):1;
  const qtyStr=(sellCategory==='material'||sellCategory==='item')?` ×${qty}`:'';
  showToast(`// ${sellItem.name}${qtyStr} 以 ${price} G 上架`);
  sellStep=0; sellCategory=null; sellItem=null;
  renderMarket();
}
