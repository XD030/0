# CLAUDE.md

Read this **before** touching anything in this repo.

> **新增物品(武器/防具/素材/道具)看 [`docs/ADD_ITEM.md`](docs/ADD_ITEM.md)**,不是這份。  
> 這份是「不要踩雷」清單,`ADD_ITEM.md` 是「正向操作手冊」。

## What this is

SAO RPG Habit Tracker — single-page web app. Habit tracker fused with RPG (level / equipment / battle / life skills). Pure browser, **no build step, no framework, no package.json**. Open `index.html` in a server (Live Server, `python3 -m http.server`) and it runs.

State lives in `localStorage.wxrpg6` (single JSON blob). User language is **Traditional Chinese (zh-TW)** — keep all UI strings, comments, and toasts in zh-TW.

## How to run / test

There is **no test suite, no linter, no build**. The user cannot run a browser in the sandbox. To validate a change:

1. **Syntax check** — concatenate all JS files and run `node --check`:
   ```bash
   python3 -c "
   from pathlib import Path
   parts = [Path(f).read_text() for f in [
     'js/storage.js','js/state.js','js/wordlist.js','js/items.js','js/utils.js','js/character.js',
     'js/equipment.js','js/battle.js','js/quest.js','js/skills.js','js/lifeskill.js',
     'js/bag.js','js/market.js','js/chest.js','js/shop.js',
     'js/panel.js','js/ui.js','js/main.js']]
   Path('/tmp/_combined.js').write_text('\n;\n'.join(parts))
   " && node --check /tmp/_combined.js
   ```
   Exit 0 = pass. **Always run this before declaring a task done.**
2. Hand off to user for browser testing. They report bugs back.

## Architecture in 30 seconds

- 18 JS files + 7 CSS files, all loaded as plain `<script src=...>` in global scope.
- No imports/exports. Functions and `const`s declared at top level are visible across files.
- Load order is in `index.html` and **must not be reordered casually**:
  ```
  storage → state → wordlist → items → utils → character → equipment → battle →
    quest → skills → lifeskill → bag → market → chest → shop → panel → ui → main
  ```
- State flow: `const s = initState(); s.x = ...; save(s); renderXxx();`
- No reactive UI. Every state mutation must be followed by an explicit render call.
- Page switch is `display: none/flex` on `#page-quest` / `#page-status` / `#page-adv` etc., orchestrated by `goPage()` / `goAdvPage()` in `ui.js`.

## File ownership (don't violate)

| File | Owns |
|---|---|
| `storage.js` | `load()` / `save(s)`. **Only file touching `localStorage` directly.** |
| `state.js` | All global constants (`SK`, `DATA_VER`, `ATTRS`, `LIFE_ATTRS`, `SLOT_UNLOCKS`, `EQUIP_OPTIONS`, `SKILL_DEFS`, `SKILL_OPTIONS`, `HUNT_MAX_MS`, **製造平衡 `CRFT_*`、命名加成 `NAMING_*`**), `initState()`(預設 `bag.pendingWeapons` / `crftQueue` / `craftNamingRule`), `runStateMigrations()`(內含 Phase D 的 itemSchemaV migration:dark_crystal2 rename、舊 instance.key 重映射、stat 補齊)。**`EQUIP_OPTIONS` 仍保留**(equipment.js `migrateEquipVal` 對 `src:'static'` 的舊存檔還在用)。 |
| `wordlist.js` | **命名加成詞庫(Task B)**。`NAMING_GOOD_WORDS`(70 個好詞,每個 `{word, tags[]}`)、`NAMING_BAD_WORDS`(24 個壞詞)、`NAMING_TAG_HINTS`(tag → zh-TW 意境描述)。每個詞 1 個中文字。命中規則嚴格逐字比對 `craftNamingRule.goodWords/badWords` 純字串列表;tag 只用於每日 hint 文字生成,不參與命中。**加減字直接編這份**,加新 tag 要同步在 `NAMING_TAG_HINTS` 加 description。本檔不依賴任何其他 module。 |
| `items.js` | **物品 def 唯一來源**(Phase A 引入,Phase D 收斂完畢)。`RARITIES`/`RARITY_COLOR`(5 級含 legendary)/`RARITY_ORDER`、`WEAPON_TYPES`/`ARMOR_TYPES`、`MATERIAL_REGISTRY`/`WEAPON_REGISTRY`/`ARMOR_REGISTRY`/`CONSUMABLE_REGISTRY`(每個 def 含 `source:['market'\|'shop'\|...]`)、查詢函式 `getMaterialDef`/`getWeaponDef`/`getArmorDef`/`getConsumableDef`/`getWeaponType`/`getArmorType`/`getConsumableSafe`、動態 view `getMarketBuyList()`、Factory `newUid`/`makeWeaponInstance`/`makeArmorInstance`。**新增物品只動這份**——沒別的地方有 def。 |
| `utils.js` | `today()`, `fmtTime()`, `showToast()`, `gConfirm()`, `closeDD()`, `imgOrPlaceholder()`, `hexEmpty()`, `attachDragScroll()` |
| `character.js` | Status page, attribute allocation, radar SVG, equip-grid render. Has `renderStatus()` and `renderReserveWithPrefix(prefix)` for dual rendering (status page + battle side panel) |
| `equipment.js` | `EQUIP_SLOT_TYPE`, `getEquipItem`, `migrateEquipVal`, `hexEquip`, `durBar`, `equipFromBag`, `unequipItem`, `openEquipDD`, `openSkillDD`, `isUidEquipped`. Also battle proficiency: `buildBattleDeck`, `profMul`, `gainSkillProf` |
| `battle.js` | 1176 lines, biggest. `CARDS`, `STATUS_DEF`, `STATUS_ICON`, `IMG`, `BATTLE_DEFAULT_ENEMY`, `ENEMY_ATTACKS_CARD`, full battle loop, plus map system (`MAP_FLOORS`, `mapState`, `renderMap`, `enterNodeDirect`, `startBattleWith`). Also `isInBattle()` — used by other modules to gate actions |
| `quest.js` | Quest definitions, render, mark/add/remove |
| `skills.js` | 5 life skills (HUNT/GATH/MINE/COOK/CRFT) + 4 minigames + GATH 農田系統(`SEED_REGISTRY` 在 items.js / `farmUnlockedPlots` / `_ensureFarm` / `_syncFarmLocks` / `plotPhase` / `plantSeed` / `harvestPlot` / `renderFarm` / `_startFarmInterval`,1Hz tick,離線成長,點擊採收;種子 = `matCategory:'seed'` material,共用 bag/market/shop/chest 流程)。`bagAddMaterial` / `bagAddItem`(寫入 bag,Phase B 加了 unknown key warn)。craft 小遊戲讀 items.js 的 `WEAPON_TYPES` / `ARMOR_TYPES` / `MATERIAL_REGISTRY`,自己只剩 `CRFT_ACC_PARTS`(飾品子類型 ring/bracelet/...,目前未進 items.js schema)/`CRFT_TAB_LABELS`。**Task A**:武器製造後端(`crftMake` / `tickCrftQueue` / `_resolveCraftEntry` / `_resolveCraftFail` / `_renderCrftQueueHTML` / `_startCrftQueueInterval`,1Hz interval,佇列上限 4)。**Task B**:命名系統(`ensureNamingRule` daily PRNG / `computeNamingBonus` / `applyNamingToWeapon` / `_renderPendingNamingHTML` / `openNamingModal` / `confirmNaming`)。**Task C**:`cancelCraftEntry` 100% 退材取消製造。`crftMakeArmor` / `crftMakePotion` 仍是 stub(`// 開發中`)。烹飪狀態 `s.cook`(phase / photoUrl / selected[] / log[] / itemName)現在持久化到存檔(原 module-level `cookState` 已搬到 state.js)。 |
| `lifeskill.js` | 生活技能獨立 page 控制(5 個技能各自一個 `#page-hunt` / `#page-mine` / `#page-gath` / `#page-cook` / `#page-crft`)。`goLifeSkillPage(attr)`:由 FAB 觸發,記住來源 page 後切到目標技能 page,渲染 header + 呼叫對應 `renderXxxGame`。`closeLifeSkillPage()`:回到呼叫者 page。`renderLifeSkillHeader(attr, container)`:Lv/EXP 排版(舊 `openLifeSkill` 的 header 部分)+ CRFT 專屬 sub-tab 容器(`#ls-crft-tabs`)。狩獵中鎖在 `goLifeSkillPage` 入口處理(showToast 後 return),不再用 DOM class。 |
| `bag.js` | Main backpack page (4 sub-tabs)。物品 def 一律從 items.js 取(`getWeaponType` / `getArmorType` / `getConsumableSafe` / `MATERIAL_REGISTRY`)。 |
| `market.js` | Main market (buy/sell tabs, multi-select via long-press)。物品列表動態從 `getMarketBuyList()` 組;新增物品在 items.js 的 `*_REGISTRY` 加 def + `source:['market']` 即自動上市集。 |
| `chest.js` | Chest minigames (QTE / 4-digit code / color-wheel) |
| `shop.js` | Map-node shop (different from market)。`SHOP_BUY_ITEMS` 是 `[{key, stock, price?}]` 精簡 stock entries(配合 `_resolveShopStock` + items.js def 動態組 render 物件);新增地圖節點商品改這份。 |
| `panel.js` | In-battle slide-out panel (bag/status sub-tabs, uses `ap-` prefix DOM ids)。物品 def 同 bag.js 從 items.js 取。 |
| `ui.js` | Page switching, FAB, navigation, life-skill drawer |
| `main.js` | Bootstrap on `DOMContentLoaded` |

## State schema (`localStorage.wxrpg6`)

```js
{
  character: { level, hp, exp, STR, AGI, DEX, VIT, INT, LUK,
               HUNT, GATH, MINE, COOK, CRFT,    // life attrs (reset by runStateMigrations)
               unspent, allocated },
  equipment: { main, off, helmet, chest, pants, boots, acc1, acc2 },
    // each = null OR { src:'bag'|'static', uid?, name, rarity, stat, durability, maxDurability }
  bag: { materials:{key→qty}, weapons:[{uid,...}], armors:[{uid,...}], items:{key→qty} },
  skills: { 0..3 → SKILL_DEFS key },
  skillProf: { skillKey → 0..1000 },
  unlockedMoves: { skillKey → [moveId, ...] },
  lifeSkills: { HUNT|GATH|MINE|COOK|CRFT → {lv, exp} },
  lifeTimers: { HUNT|GATH|CRFT → {running, startAt} },
  huntTimer: { running, startAt },
  gold, questDefs, questLog,
  mineStates, mineDiscovered, mineCurrentFloor, // mine per-floor state + dex
  farm: { plots:[{seedKey, plantedAt, locked}, ...] }, // GATH 9-plot farm
  crftLastPick: { weapon, armor, potion },  // CRFT dropdown:記住三個 tab 上次選的種類
  mapState, // minigame state
}
```

`runStateMigrations()` runs on every load to clean dropped fields, dedup equipment uids, and reset life attrs.

## Hard rules — landmines that already bit us

These are bugs we already fixed. Don't re-create them.

1. **`Date.now()` for uids collides** — buying 2 items in a tight loop produces identical uids in the same millisecond. Always use `'w'+Date.now()+'_'+Math.random().toString(36).slice(2,8)`. There are 4 sites; if you add a 5th, follow the same pattern.

2. **`isUidEquipped(s, uid, exceptKey)` before any equip operation** — same uid must never appear in 2 slots. `equipFromBag` and `openEquipDD` both check this. If you write a new equip path, do too.

3. **Touch events ≠ mouse events** — `ontouchstart`/`ontouchend` does NOT fire on desktop. If a feature involves long-press, drag, or tap-and-hold, you must add the parallel `onmousedown`/`onmouseup`/`onmouseleave` (and often `onmousemove` for drag). Synthetic `click` after `touchend`/`mouseup` will fire your tap handler — guard with a `_xxxFired` flag if long-press should suppress the tap. See `market.js startMarketHold` and `ui.js fabBtnDown` for the pattern.

4. **Function-declaration shadowing** — JS hoists `function foo(){}` and the **last declaration wins** silently. The original repo had two `hexEquip`s and two sets of `addStatus/removeStatus/hasStatus/tickStatuses`. Both got cleaned up in Phase 5d-2. If you find yourself writing a function that already exists, search globally first.

5. **Don't reproduce dead-code**. Several `function xxx(){/* removed */}` stubs were deleted because they were referenced only by HTML `onclick` handlers that were also dead. If you delete an `onclick` site, also delete its handler — and vice versa.

6. **`renderXxx` calls are not idempotent for free** — most renderers blow away and rebuild DOM. Don't store transient state (selection, scroll, focus) in DOM only; some renderers preserve scroll explicitly with `requestAnimationFrame`. If you add a new render, decide whether scroll preservation matters.

7. **Adventure page uses `position: absolute` inside `.phone` (390px)** — many in-battle elements were originally `position: fixed` and broke out of the phone container on desktop. Phase 4 changed most of them to `absolute`. New overlays for in-battle UI should be `absolute` too. Things that should still be `fixed`: `.toast`, `.scanline`, generic dropdown/detail overlays.

8. **物品 def 唯一寫入點是 `make*Instance` factory** — 所有 push 進 `s.bag.weapons` / `s.bag.armors` 的點都必須走 `makeWeaponInstance(key)` / `makeArmorInstance(key)`(items.js)。直接拼物件(`{uid:'w'+Date.now()...}`)被禁止 — 會繞過 stat 帶上、key 對應、uid 隨機後綴等保證,留下 Phase D 修過的同一類 bug。新增物品:在 `items.js` 對應 `*_REGISTRY` 加 def,設 `source` 含 `'market'` 就會自動上市集。

9. **Forbidden references** — these are removed; do not re-introduce:
   - `#ld-detail-content`, `#ld-crft-tabs`, `.life-drawer*` (left drawer was deleted)
   - Right-edge swipe gesture (deleted)
   - Long-press to exit adventure mode (deleted)
   - FISH life skill (deleted entirely — not just hidden)
   - GATH 花牌系統(`GATH_DECK` / `GATH_SUITS` / `GATH_COMBOS` / `harvSession` / `renderHanaGame` / `gathUpgradePlant` / `gathUpgradeCombo` / `gathBestCombo` / `harvPlay` / `harvDiscard` / `gathCardHTML` / `loadGathData` / `saveGath` / `loadHarv` / `saveHarv` / `gathUnlockedPool` / `gathOnLevelUp` 等)— 已換成農田玩法,改用 `SEED_REGISTRY` (in items.js) + `s.farm.plots` + `renderFarm`。
   - `.harv-*` CSS class — 已換成 `.farm-*`。
   - Heat-map / stats page stubs (`bgClass`, `txtClass`, `heatView`, `selectedDays`, `currentMode`, `currentCount`, `renderStatsPage`, `switchHeat`, `renderHeat`, `openDetail`, `closeDetail`, `switchMode`, `addPersonalTask`, `previewAttr`, `toggleDay`, `setPreset`, `renderRecent`)
   - **Phase D 刪除的物品系統舊 const**:`MARKET_ITEMS` / `SHOP_BUY_ITEMS`(舊 shape)/ `CRFT_WEAPONS` / `CRFT_ARMOR_PARTS` / `CRFT_MATERIALS` / `WEAPON_ICONS` / `ARMOR_ICONS` / `CRFT_RARITY_COLOR` / `POTION_RARITY_COLOR` / `PANEL_RARITY_COLOR` / `PANEL_CRFT_MATERIALS` / `PANEL_BAG_WEAPONS` / `PANEL_BAG_ARMORS` / `PANEL_BAG_ITEMS`。所有功能已遷至 `items.js` 的 registry / helper。**不要復活這些** — 看到舊註解或舊檔提到它們是 stale,以 `items.js` 為準。
   - **Phase D 改名的欄位**:bag 武器/防具 instance 的 `statStr` → `stat`(從未被任何寫入點實際 set 過,Phase D migration 已從 def 補上)。`mat.category` → `mat.matCategory`(material def 用 matCategory 區分 ore/plant/mob/craft)。
   - **Phase D 改名的 key**:`dark_crystal2` → `shadow_crystal`(舊存檔由 migration 自動轉)。
   - **CRFT 武器 / 裝備清單樣式**:`.crft-type-row` / `.crft-type-btn` / `.crft-type-btn::before` / `.crft-type-btn.active` / `.crft-type-icon` / `.crft-type-name` / `.crft-armor-grid` —— 武器與裝備 tab 進場已改成 `<select>` dropdown(`crft-picker-row` / `crft-picker-select` / `crft-empty-hint`),選擇值持久化到 `s.crftLastPick.{weapon,armor}`。藥水 tab 沒有類型清單(base/effect/modifier 三段式),不受影響。

10. **`if(!s.character.gold)` treats legitimate `0` as "field missing"** — use `== null` instead, otherwise a player who spent all their gold and reloads gets auto-refilled to 500g (infinite gold bug). Same applies to other numeric fields that can legitimately be 0 (exp, mp, hp).

11. **Commit message ≠ actual code state** — `9a23904 feat: 市集 UX 改成點+1/長按toggle/右鍵清除` claimed "click=+1, long-press=toggle, right-click=clear", but actual code kept stepper UI; "+1" was supplied by stepper, row click was toggle. Before cleaning up a UI element, grep to confirm what interaction it actually carries — don't assume from commit message.

12. **Spec function name vs main repo can be out of sync** — when given a spec like "delete function X", first grep main repo to verify X exists and content matches spec expectations. If X doesn't exist or content differs significantly, stop and report. Don't substitute "similarly-named" alternatives.

13. **`git rm --cached <gitlink>` 之後不要跑 `git add -A`** — `git rm --cached` 已經 staged 該檔案的 deletion,直接 `git commit` 即可。如果再跑 `git add -A`,untracked 的 nested worktree 目錄(裡面有 `.git` 檔)會被偵測成 embedded git repository、重新加進 index 變新的 gitlink,等於原地復活剛清掉的問題。Task 5 dry-run 抓到這個雷,正式做的時候跳過 `git add -A` 才沒踩進去。

## Conventions

- **Strings in zh-TW**, comments mix zh-TW and English, code identifiers in English. Toasts start with `'// '` prefix (e.g. `showToast('// 裝備 ' + name)`).
- **Inline styles are rife** — many components have `style="..."` in template strings. We're not refactoring those; match local style when extending.
- **Layout container is fixed-width 390px (`.phone`)**. Test changes look right at that width.
- **No `npm install`-able libraries.** Everything is hand-rolled.
- **Don't introduce ES modules**, build tools, or bundlers. The user wants this to stay openable as a static file.
- **Prefer extending existing files over creating new ones.** A new file means updating the load-order list in `index.html` and CLAUDE.md and figuring out where it fits in the dependency graph.

## When the user reports a bug

1. **Don't assume the refactor caused it.** Many bugs predate the refactor. Check `/mnt/user-data/uploads/sao_rpg_mvp_v5-3-2-2-2.html` (original 8160-line file) if available — if the bug is also there, it's pre-existing. Document this in your reply but still fix it.
2. **Reproduce mentally first.** Trace from the user action through the event handler to the state mutation to the render. Most bugs are at one of three points: (a) event not bound on desktop (touch-only), (b) state mutated but no render call, (c) render reads stale state because cache wasn't refreshed.
3. **Search before patching.** A function might be defined twice or called from somewhere unexpected. Always `grep -n` the identifier across `js/` and `index.html` first.
4. **Fix the root cause, not the symptom.** The "two daggers in two slots" bug looked like a UI filter problem — it was actually `Date.now()` collision producing identical uids. Always ask "why does this state exist?" not "how do I hide it?"

## Refactor history (so you understand the layout)

The repo started as a single 8160-line `index.html` with everything inline. Modularized over 6 phases:

- **Phase 1-3**: base/state/utils/components/UI shell
- **Phase 4**: character.js, quest.js + adventure-page `position: fixed → absolute` fix
- **Phase 5**: equipment, battle, skills (incl. 4 minigames), 5 life skills
- **Phase 6**: bag, market, chest, shop, panel + dead-code purge
- **Phase A–D(item-schema unification,已完成)**:
  - **Phase A**:引入 `items.js` 為物品 def 唯一來源(WEAPON_TYPES / ARMOR_TYPES / MATERIAL/WEAPON/ARMOR/CONSUMABLE_REGISTRY + factory + 查詢函式)。與舊資料並存。
  - **Phase B**:bag 寫入點(market.js / shop.js / state.js initState)全部收斂到 `make*Instance` factory。修 bug 1-1(shop 把 zh 字串寫進 weaponType)。
  - **Phase C**:讀取 / render 端切到 registry。修 bug 1-2(`statStr` 從未寫入 → equipment.js 改讀 `w.stat`,factory 從 def 帶 stat 上來)、bug 1-5(WEAPON_ICONS keys 大多對不上 → 改用 `getWeaponType().icon`)。RARITY_COLOR 三表(shop/panel/skills CRFT/skills POTION)收斂到 items.js 全域版,uncommon 藥水從黃色 fallback 改回正確綠色。
  - **Phase D**:刪除 `MARKET_ITEMS` / `CRFT_WEAPONS` / `CRFT_ARMOR_PARTS` / `CRFT_MATERIALS` / `WEAPON_ICONS` / `ARMOR_ICONS` / `PANEL_*` 5 個死碼 const。`runStateMigrations` 加 itemSchemaV migration(dark_crystal2 → shadow_crystal、10 條 LEGACY_KEY_MAP 對舊 instance.key 重映射、stat 從 def 補齊)。**不 bump DATA_VER**(避免清空玩家進度),走 itemSchemaV 旗標跳過已遷移存檔。orphan key 一律 warn 不刪。

Result(Task A/B/C 後): `index.html` ~920 lines, 17 JS files totalling ~7800 lines, 7 CSS files totalling ~1300 lines。

If you spot remaining cruft (orphan IIFEs, duplicate selectors, unreferenced HTML), it's fair game to clean up — but flag it in your response, don't silently delete.

## When making a change

1. Read the relevant module(s) in full before editing. They're small enough.
2. Run `node --check` after editing (see "How to run / test" above).
3. If you added a new identifier, `grep` the codebase to make sure you didn't shadow an existing one.
4. If you added a new file, update:
   - `index.html` `<script src=...>` list (correct position in dep order)
   - The "File ownership" table above
   - The load-order diagram above
5. Report what you changed in zh-TW (user's language). Be specific about file:line. Show before/after for non-trivial logic. End with a short test checklist for the user.
6. **探索期的中間版本,working tree 覆蓋,不要 commit。** 一個 task 中如果使用者反覆說「再大一點 / 再小一點 / 換個位置」,中間每一版都不要 commit — 直接 str_replace 覆蓋現有改動,只 commit 最終決定的版本。理由:中間版本從未真的「活過」(使用者沒採用就被覆蓋),commit 進 history 等於對歷史撒謊,git blame 找「為什麼是 280px」會看到「先改 80→140→280」三個 commit 但其實只有 280 真的落地過。把 iteration 成本壓在 working tree、不要污染 git history。

## Things to NOT do

- Don't add a `package.json` / `node_modules` / build pipeline.
- Don't switch to ES modules, TypeScript, JSX, or any framework.
- Don't add a CSS preprocessor.
- Don't add tracking / analytics / external CDN scripts.
- Don't translate UI strings to English.
- Don't add `localStorage` access outside `storage.js`.
- Don't add new global state without putting it on the `state` object (so it survives reload).
- Don't reorder `<script>` tags without checking the dep graph.
- Don't use `position: fixed` for in-battle UI without checking it stays inside `.phone`.
- Don't `console.log` debug output that ships to users — strip it before declaring done.
- Don't use `git worktree`. All edits must happen in the main repo working directory. The worktree mechanism caused a multi-hour session of confused state where edits to sandbox copies didn't reach the main repo, while reports claimed they did.
- Don't use `cp` / file copy from sandbox to main repo. Use `view` + `str_replace` / `create_file` directly on the main repo's absolute path.
- After every edit, verify with `git diff <path>` and report the diff to the user. Do not rely on tool return messages — they don't prove the file was actually written.
- Before claiming "X function deleted", grep main repo to confirm X exists with content matching the spec. If X doesn't exist, or content differs from spec, stop and report. Don't guess at "similar named" alternatives.
