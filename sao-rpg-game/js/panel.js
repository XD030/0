/* ========================================================================
 * panel.js — 戰鬥中側拉狀態面板(Phase 6)
 *
 * 在地圖 / 戰鬥畫面右下叫出的面板,有 2 個 tab(背包 / 狀態)。
 * 跟主背包共用資料源,但 UI 較精簡(用 ap- 前綴的 DOM 節點)。
 *
 * 內容:
 *   - panelBagTab:面板背包當前的 sub-tab
 *   - renderPanelBag:渲染面板背包 body
 *   - panelCurrentTab:bag 或 status
 *   - openBattlePanel / closeBattlePanel:開關面板 overlay
 *   - renderBattlePanel:依 panelCurrentTab 渲染對應內容
 *
 * 依賴:
 *   - state.js / storage.js / utils.js
 *   - character.js: renderReserveWithPrefix
 *   - equipment.js: hexEquip / durBar / getEquipItem
 * ======================================================================== */


// PANEL_RARITY_COLOR / PANEL_CRFT_MATERIALS / PANEL_BAG_WEAPONS / PANEL_BAG_ARMORS / PANEL_BAG_ITEMS
// 已於 Phase D 全部刪除。它們是早期 demo 假資料,renderPanelBag 從 Phase 6 起就改讀
// s.bag + items.js registry,從未實際讀過這些 const,確認屬死碼。

// ── 面板開關 ──
let panelCurrentTab='bag';

function openBattlePanel(tab){
  panelCurrentTab=tab;
  reserveAlloc={STR:0,VIT:0,DEX:0,AGI:0,INT:0,LUK:0};
  const titles={bag:'// BAG', status:'// STATUS'};
  document.getElementById('map-panel-title').textContent=titles[tab]||'//';
  document.getElementById('map-panel-overlay').classList.add('show');
  renderBattlePanel();
}

function closeBattlePanel(){
  document.getElementById('map-panel-overlay').classList.remove('show');
}

// 點 panel 內 tab → 切 bag.js 的全域 bagTab(主背包/panel 共享狀態)+ reset filter,重渲
function panelSwitchBagTab(t){
  bagTab=t; bagFilter='all';
  renderBattlePanel();
}

function renderBattlePanel(){
  const body=document.getElementById('map-panel-body');if(!body)return;
  if(panelCurrentTab==='bag'){
    // 直接複用 bag.js 的 _renderBagListInto(共用 bagTab/bagFilter 全域變數)。
    // panel 不顯示篩選列(空間不夠)、用 panel-bag-list 不同 id 避免跟主背包 #bag-list 衝突。
    const labels={material:'素材',weapon:'武器',armor:'裝備',item:'道具'};
    const tabHTML=`<div class="bag-tabs" style="padding-top:8px;">`+
      Object.keys(labels).map(t=>`<div class="bag-tab${bagTab===t?' active':''}" onclick="panelSwitchBagTab('${t}')">${labels[t]}</div>`).join('')+
    `</div>`;
    body.innerHTML=tabHTML+`<div class="bag-list" id="panel-bag-list" style="padding:8px 0;"></div>`;
    _renderBagListInto(document.getElementById('panel-bag-list'));
  } else if(panelCurrentTab==='status'){
    body.innerHTML=`
    <div style="padding:16px 16px 80px;">
      <div class="char-card">
        <div class="card-top">
          <div><div class="char-name-s" id="ap-name">—</div><div class="char-sub">PLAYER STATUS</div></div>
          <div class="level-box"><div class="level-num" id="ap-level">1</div><div class="level-lbl">LEVEL</div></div>
        </div>
        <div class="bars-s">
          <div><div class="bar-row"><span class="bar-label">HP</span><span style="font-family:var(--font-mono);font-size:10px;color:#ff6655" id="ap-hp">—</span></div><div class="bar-track"><div class="hp-bar" id="ap-hp-bar" style="width:100%"></div></div></div>
          <div><div class="bar-row"><span class="bar-label">MP</span><span style="font-family:var(--font-mono);font-size:10px;color:#00ffaa" id="ap-mp">—</span></div><div class="bar-track"><div class="hp-bar bp-mp-bar" id="ap-mp-bar" style="width:100%"></div></div></div>
          <div><div class="bar-row"><span class="bar-label">EXP</span><span style="font-family:var(--font-mono);font-size:10px;color:#00ffcc" id="ap-exp">—</span></div><div class="bar-track"><div class="exp-bar" id="ap-exp-bar" style="width:0%"></div></div></div>
        </div>
        <div class="pts-banner" id="ap-pts-banner"><span class="pts-big" id="ap-pts-num">0</span><span>屬性點待分配</span></div>
        <div class="gear-tabs" id="ap-attr-tabs" style="margin:6px 0 8px;">
          <div class="gear-tab attr-tab active" id="ap-attr-tab-phys" onclick="setAttrTab('phys')">肉體</div>
          <div class="gear-tab attr-tab" id="ap-attr-tab-mind" onclick="setAttrTab('mind')">精神</div>
          <div class="gear-tab attr-tab" id="ap-attr-tab-elem" onclick="setAttrTab('elem')">元素</div>
        </div>
        <div class="radar-section" style="justify-content:center;">
          <svg id="ap-radar-svg" width="150" height="150" viewBox="0 0 136 136"></svg>
          <div class="r-attr-list" id="ap-attr-list"></div>
        </div>
        <button class="r-confirm-btn" id="ap-confirm-btn" style="display:none;" onclick="confirmAlloc('ap-')">✓ 確認分配</button>
      </div>
      <div class="gear-card">
        <div class="gear-tabs">
          <div class="gear-tab equip-tab active" id="ap-gear-tab-equip" onclick="switchGear2('equip','ap-')">EQUIPMENT</div>
          <div class="gear-tab skill-tab" id="ap-gear-tab-skill" onclick="switchGear2('skill','ap-')">SKILL SLOTS</div>
          <div class="gear-tab essence-tab" id="ap-gear-tab-essence" onclick="switchGear2('essence','ap-')">ESSENCE</div>
        </div>
        <div class="gear-panel active" id="ap-gear-panel-equip">
          <div class="equip-grid-v">
            <div class="equip-col" id="ap-equip-col-1"></div>
            <div class="equip-col" id="ap-equip-col-2"></div>
          </div>
        </div>
        <div class="gear-panel" id="ap-gear-panel-skill">
          <div class="slots-list" id="ap-slots-list"></div>
          <div class="next-hint" id="ap-next-hint"></div>
        </div>
        <div class="gear-panel" id="ap-gear-panel-essence">
          <div class="essence-grid" id="ap-essence-grid"></div>
          <div class="next-hint" id="ap-essence-hint"></div>
        </div>
      </div>
    </div>`;
    renderReserveWithPrefix('ap-');
  }
}
