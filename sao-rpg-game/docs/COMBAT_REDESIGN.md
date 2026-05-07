# E6 戰鬥系統重做設計文件

> 跟 [`ADD_ITEM.md`](./ADD_ITEM.md) 不同 —— 這份是「設計拍板紀錄」,進 sub-task spec 前必須讀這份才能對齊整體方向。  
> 開發中(2026-05-07 起草)。Sub-task 開始後若需要改決策,直接編輯這份 doc + commit,**不要在 sub-task spec 裡偷偷改架構**。  
> 「不要踩雷」清單請看 [`../CLAUDE.md`](../CLAUDE.md)。

---

## 立論

現有戰鬥系統(E4 完成 + E5 平衡):

- 8 張卡牌每回合手動點 1 張
- 80×120 翻頁 UI 在 390px 寬幕緊張
- 大量「儀式性無決策回合」(普攻打 8 招都點切割卡)
- 卡牌只能主動技,沒有被動 build 空間

E6 目標:**降低操作頻次,提高決策密度,擴展 build 深度**。

---

## 核心轉向

| 現有 (E4 / E5) | E6 |
| --- | --- |
| 8 張卡牌全手動點 | 普攻自動 + 4 主動技手動 + 4 被動自動觸發 |
| 每回合做選擇 | 只在「該放技能」時做選擇 |
| 翻頁 80×120 卡牌 UI | 4 個主動技按鈕 + 玩家 / 敵人 sprite + log |
| 4 卡技能槽 | 4 主動 + 4 被動 = 8 build slot |
| 卡牌資源 = SP cost(微) | 體力 / 靈力 / 破勢 三條,戰鬥內不靠時間回 |

---

## 設計決策(已敲)

### 戰鬥流程

| # | 領域 | 決策 |
| --- | --- | --- |
| 1 | 普攻 hit-type | 武器決定(劍 → slash / 弓 → pierce / 錘 → blunt) |
| 2 | 法術 hit-type | 法術 def 自帶 `damageType` |
| 3 | 普攻打誰 | 玩家點敵人設定主目標,普攻自動打主目標 |
| 4 | 普攻 cost | **設計目標**:消耗武器耐久 -1/下;**E6 過渡**:每 5 下消耗 1(等武器耐久重構獨立 task 完成後合併);此外戰鬥內每次普攻消耗體力(數字 E6-3 拍) |
| 5 | 主動技 cost | 體力(物理 / 劍技)or 靈力(元素技 / 法術),schema 名 `stamina` / `spirit`,戰鬥內不靠時間回 |
| 6 | 主動技 cooldown | 有 cooldown,以回合為單位;不被 actionSpeed 直接縮(透過行動間隔自然加速,見 E0 §4.2) |
| 7 | 主動技施放 | 玩家手動,任何回合可放(夠 cost 即可) |
| 8 | 被動技觸發 | 自動,寫死 condition 庫(不做 DSL) |
| 9 | 被動技類型 | 事件型 / 狀態型 雙軌條件觸發(細節見下方 §9 補注) |
| 10 | 被動觸發回饋 | 戰鬥日誌(現有 `battleLog`) |
| 11 | 戰鬥中換武器 | 不可,戰鬥前固定 |
| 12 | 4 主動 + 4 被動槽 | 不可重複(每槽不同技能) |
| 13 | 戰鬥中換技能 | 不可,戰鬥前固定 |

#### §9 補注(2026-05-07,銜接 E0 §4.5)

被動技槽 4 個,每槽放一個被動技。被動技 schema 為「**事件 / 狀態雙軌**」,trigger 求值單位為**回合**。

**Schema 形狀(雙軌)**

```js
// 事件型 — 一次性 trigger,引擎在 hook 點 emit 事件
{
  triggerKind: 'event',
  event: 'ON_HIT' | 'ON_CRIT_TAKEN' | 'ON_HIT_DEAL' | ...,  // 完整 enum E6-1 定
  filter?: { ... },                    // 可選,事件 payload 篩選
  procChance?: 30,                     // 可選,觸發機率(0-100)
  cooldown?: N,                        // 可選,回合冷卻
  effect: { type: 'rewrite' | 'instant', ... }
}

// 狀態型 — 持續比對,符合 → 生效;不符合 → 失效
{
  triggerKind: 'state',
  predicate: { hpRatioBelow: 0.3 },    // 條件原語,可組合;完整清單 E6-1 定
  effect: { type: 'buff', ... }        // 限維持型 buff
}
```

**求值單位 = 回合**

- 狀態型 predicate **回合開始時**重評估;回合內條件變化不影響本回合結果。
- 事件型在事件發生的當回合內處理(ON_HIT 即時 dispatch),不跨回合排隊。

**範例**

| 名稱 | triggerKind | trigger / predicate | effect |
| --- | --- | --- | --- |
| 消力 | event | `event: 'ON_HIT'` | `{ type: 'rewrite', incomingDamage: 1 }` |
| 運氣調息 | event | `event: 'ON_CRIT_TAKEN'`,`procChance: 30` | `{ type: 'instant', healPctOfDamage: 10 }` |
| 背水 | state | `predicate: { hpRatioBelow: 0.3 }` | `{ type: 'buff', atkMul: 1.25 }` |
| 火戰 | state | `predicate: { enemyHasElement: 'fire' }` | `{ type: 'buff', swordSkillDamageMul: 1.20 }` |
| 連殺勢 | event | `event: 'ON_KILL'` | `{ type: 'instant', addStatus: { type: 'rage', duration: 3 } }` |

**設計守則**

- **不收永久 buff**:`triggerKind: 'state'` + `predicate: {}` 的等價永久態不允許。靜態數值加成(火傷 +30% / 毒抗 +50%)屬**裝備屬性**(weapon / armor instance stat / affix),不佔被動技槽。
- **狀態型 effect 必為 `type: 'buff'`**:不允許狀態型搭即時 / 改寫(否則「條件成立每回合改寫一次」會無限觸發)。
- **元素反應 / buff / debuff 條件**:統一用 `event: 'ON_REACTION_TRIGGERED' / 'ON_STATUS_APPLIED'` + filter,或 `predicate: { enemyHasStatus / playerHasStatus / enemyHasElement }`。**加新條件 = 加 hook 點或 predicate key,既有被動技 def 不動。**

**排除清單**(E0 §4.5 已設為屬性衍生機率,**不**佔被動技槽):

- `guardRate` / `perfectGuardRate`
- `counterRate` / `counterDamage` / `counterBreak`
- `comboRate` / `comboHits` / `comboDamagePerHit` / `comboStaminaGain`

這些靠堆「反應 / 技巧 / 感知」屬性自動觸發。

**待 E6-1 schema 階段定**

- `event` 完整 enum + 每事件 payload 形狀
- `predicate` 原語完整清單 + 是否支援 `and` / `or` / `not` 組合
- `effect.type` 完整 enum(`rewrite` / `instant` / `buff`)+ 每類欄位形狀
- 引擎 hook 點清單(回合開始 / 結束 / 命中 / 暴擊 / ...)
- 機率 / cooldown 上下限
- 被動疊加平衡規則(同 event 互斥組?狀態型同時觸發數上限?)

### 敵人預警

| # | 領域 | 決策 |
| --- | --- | --- |
| 14 | 預警形式 | 換不同 PNG sprite(蓄力 / 防禦 / 普通);過渡期用 CSS 動效 + emoji overlay 替代(見 E6-5) |
| 15 | 哪些招預警 | 特殊招(蓄力 / 大招 / debuff)出招前 1 回合預警;普攻不預警,但敵人頭上有「攻擊條」隨時間縮短 |
| 16 | 預警時機 | 出招前 1 回合 |

### 資源系統

| # | 領域 | 決策 |
| --- | --- | --- |
| 17 | HP 戰外回 | 藥水 / 營火 / 食物 |
| 18 | 體力 戰外回 | 食物 / 營火 |
| 19 | 靈力 戰外回 | 藥水 / 營火 |

### 偵察(感知屬性閾值)

| # | 領域 | 決策 |
| --- | --- | --- |
| 20 | 觸發方式 | **純感知屬性閾值**,不佔技能槽、無道具、無主動觸發 |
| 21 | reveal 時機 | 地圖節點點選時(戰鬥前)直接顯示 hint |
| 22 | 分級 | 0:問號 / 1-30:名字 / 31-60:名字 + lv + 大致 HP 區間 / 61-90:名字 + lv + HP + 弱點 type ×1 |

> 為什麼「不可換武器」+「隨機 spawn」不是純運氣賭 — 玩家可以堆感知屬性換情報,情報換武器選擇。RPG「資訊不全的選擇」設計核心。

---

## Schema 變動

### SKILL_DEFS 擴展

```js
// E6 SKILL_DEFS schema(取代 E4 / E5 的 type/baseMul/mpCost 形狀)
{
  id, name,
  category: 'active' | 'passive',         // 必填

  // ── active 才有的欄位 ──
  costType: 'stamina' | 'spirit',         // 體力 / 靈力
  cost: 10,
  cooldown: N,                            // 回合數,以回合為單位
  damageType: 'slash' | 'pierce' | 'blunt' | 'fire' | ... ,
  baseMul: 1.0,

  // ── passive 才有的欄位(雙軌)──
  // 事件型
  triggerKind: 'event',
  event: 'ON_HIT' | 'ON_CRIT_TAKEN' | 'ON_HIT_DEAL' | ...,  // 完整 enum E6-1 定
  filter?: { ... },                       // 可選
  procChance?: 30,                        // 可選,0-100
  passiveCooldown?: N,                    // 可選,回合
  effect: { type: 'rewrite' | 'instant', ... }

  // 狀態型(同欄位、不同 triggerKind)
  triggerKind: 'state',
  predicate: { ... },                     // 條件原語,完整清單 E6-1 定
  effect: { type: 'buff', ... }           // 限 buff
}
```

> 詳見 §9 補注。`'ALWAYS'` 不存在(永久 buff 進裝備屬性,不佔被動技槽)。

### 玩家 state schema 擴展

```js
// 現有(E4 / E5)
s.skills = { 0: skillKey, 1: skillKey, 2: skillKey, 3: skillKey }

// E6(取代 s.skills)
s.activeSkills = { 0, 1, 2, 3 }      // 4 個主動技槽
s.passiveSkills = { 0, 1, 2, 3 }     // 4 個被動技槽

// E6 + E0 資源池(取代 mp / maxMp)
s.character.stamina    = N           // 體力,戰鬥內不靠時間回
s.character.maxStamina = N           // 體力上限(衍生值,即時算)
s.character.spirit     = N           // 靈力,戰鬥內不靠時間回
s.character.maxSpirit  = N           // 靈力上限
s.character.break      = N           // 破勢條(玩家也有,第 4 條資源)
s.character.maxBreak   = N           // 破勢上限

// E6 戰鬥目標
s.mainTargetIdx = 0..3               // 戰鬥中主目標

// E6 + E0 屬性 schema 旗標(細節 E0 §2)
s.attrSchemaV2 = 1                   // E6-1 引入
```

> 舊 `mp / maxMp` 處理見 E0 §8 + E6-1 spec(此 doc 不展開)。

### ENEMY_DEFS / ENEMY_ATTACKS_CARD 擴展

```js
// ENEMY_ATTACKS_CARD 招式 schema 加
isTelegraphed: true,                  // 出招前 1 回合預警
telegraphIcon: '⚡',                  // 預警 emoji
telegraphAnim: 'shake'|'glow-red'|'pulse',  // CSS 動畫名
telegraphSprite: 'enemy_xxx_charge',  // 蓄力 sprite key(可選,有 PNG 才用)
```

### CARDS 遷移(E6-3 task 內逐張議定)

E4 / E5 的 11 張 CARDS,**guard 移到屬性衍生(E0 §4.5),剩 10 張**;大部分轉成「主動技」,部分轉成「被動」:

| 原 CARD | E6 角色 | 備註 |
| --- | --- | --- |
| slash / heavy / pierce / etc. | **主動技**(物理 / 耗體力) | 數量縮 |
| guard | **砍掉** | 改由 `guardRate` 屬性衍生機率自動觸發(E0 §4.5) |
| heal | **主動技**(法術 / 耗靈力) |  |
| buff | **被動技 / 狀態型** | predicate 與 effect E6-3 議定 |
| ...(逐張議定,完整盤點 E6-3) |  |  |

---

## UI 設計(實作 spec 階段細化)

```
┌─────────────────────┐
│ 玩家 sprite + 主目標 │  上半:視覺與狀態
│ HP/體力/靈力/破勢 bar │
│ 敵人 sprite ×4 (slot) │
├─────────────────────┤
│ 戰鬥 log(自動滾動)  │  中間:被動觸發、敵人動作預警
├─────────────────────┤
│ [技1] [技2] [技3] [技4] │  下半:4 主動技按鈕
│         普攻自動         │  (顯示 cost / icon / 可用性)
│ [背包] [道具]            │  小條:輔助操作(無「換武器」— 不可換)
└─────────────────────┘
```

關鍵互動:

- 點敵人 sprite → 設為主目標,有視覺標記(框 / 箭頭)
- 4 個技能按鈕灰階 = 體力 / 靈力 不夠
- 普攻每回合自動執行,不需點

---

## 拆 Sub-Task 規劃

| Task | 範圍 | 依賴 |
| --- | --- | --- |
| **E6-1** Schema + state migration | `SKILL_DEFS`(雙軌 trigger)/ `s.activeSkills` / `s.passiveSkills` / `s.character.{stamina,spirit,break}` + 對應 max + 8 屬性 + `attrSchemaV2` flag 加 schema;舊 `mp/maxMp` migration 見 E0 §8 | 無 |
| **E6-2** 戰鬥主迴圈重寫 | `battle.js` 從「點卡 → 結算」改成「auto 普攻 + tick + 主動技 trigger + 被動 condition」 | E6-1 |
| **E6-3** 主動技 / 被動技內容遷移 | `CARDS` 10 張拆(11 - guard,見 §風險 #1)/ `SKILL_DEFS` 加 `category` | E6-1 |
| **E6-4** UI 重做(4 按鈕條) | `character.js` / `battle.js` UI 部分,砍翻頁卡牌 | E6-2 |
| **E6-5** 敵人預警系統(CSS-only fallback) | `ENEMY_ATTACKS_CARD` 加 `isTelegraphed` / sprite CSS 動效 + emoji overlay。**美術 PNG 替換是後續 asset swap,不算 dev task** | E6-2 |
| **E6-6** 體力 / 靈力 戰外回復(食物 / 藥水 / 營火)+ 感知偵察 reveal + 平衡調校 | `items.js` 新增食物 effect / 藥水分體力 / 靈力兩種 / 地圖節點 hint 系統 / 1F 全雜兵 + boss 重新 balance | E6-1 ~ E6-5 |

每個 task 獨立 session,結束 commit 一次,合回 main 後再開下一個。

---

## 風險清單

1. **既有 10 張 CARDS(11 - guard,guard 移到 E0 §4.5 屬性衍生)拆解後內容不夠** — 主動 / 被動每邊至少要 8-10 個讓玩家有 build 選項。可能需要新設計 5-10 個技能填補。E6-3 sub-task 會逐張盤點。
2. **被動疊加平衡** — 被動已收斂為事件 / 狀態雙軌條件觸發(無 ALWAYS),但 4 個狀態型 predicate 同時 true 仍可疊;事件型同回合多 trigger 也需排序。要在 schema 加「同類被動互斥」或「同回合觸發數上限」限制。E6-1 schema 設計時定平衡規則。
3. **戰鬥節奏變鬆 → 戰鬥變短 → 體驗變淺** — 設計上要刻意拉長戰鬥(boss 25 回合而不是 10),否則普攻自動完成後,玩家發揮主動 / 被動的機會太少。E6-6 平衡時驗證。
4. **sprite 預警動效美術依賴** — 目前只有 `player_idle.png` 一張圖,enemy 全是 placeholder。E6-5 先做 CSS-only 方案(顏色 / 抖動 / overlay),不依賴美術資源。**美術 PNG 補上後直接 swap**,程式邏輯不需動。
5. **武器耐久基底太低** — 現有 maxDur 6-10,如果直接套「普攻 -1/下」武器秒斷。E6 過渡用「每 5 下消耗 1」,等待**獨立的武器耐久重構 task**(不在 E6 範圍)合併後改回 -1/下。
6. **「不可換武器 + 隨機 spawn」運氣感** — 用感知屬性 reveal 系統補償,玩家堆感知換情報。但 1F 玩家感知屬性可能仍 0 → reveal 全是問號 → 純運氣。E6-6 平衡時要確認 1F 雜兵的 hit-type 多樣性不要極端(避免「武器選錯就打不動」)。

---

## 進入 sub-task 前必須完成

- [x] **E0 屬性系統拍板**(見 [`E0_ATTRIBUTE_REDESIGN.md`](./E0_ATTRIBUTE_REDESIGN.md))
- [x] **被動技槽 schema 拍板**:事件 / 狀態雙軌條件觸發(以回合為求值單位,見 §9 補注)
- [x] 細節 #18-19 拍板(體力 / 靈力 戰外回機制) — 18: 食物 / 營火;19: 藥水 / 營火
- [x] 偵察機制設計 — 純感知屬性閾值,地圖節點階段 reveal
- [x] 普攻 cost 過渡方案 — 每 5 下消耗 1 耐久
- [ ] CARDS 10 張的拆解表(每張 → 主動 / 被動 / 棄用)— 列入 **E6-3 task 第一步**
- [ ] 至少 5-10 個新技能設計(填補主動 / 被動池)— E6-3
- [ ] 被動疊加平衡規則(互斥組 / 觸發次數上限)— **E6-1 schema 階段**
- [ ] 主目標 UI 視覺方案 — E6-4

---

## 變更歷史

- **2026-05-07**:初稿。整合 13 條戰鬥流程決策、3 條敵人預警、3 條資源系統、3 條偵察分級、6 個 sub-task。
- **2026-05-07(同日二改)**:§11 銜接 E0 落 doc。SP/MP → 體力/靈力,加破勢條,被動技槽改雙軌條件觸發(事件 / 狀態,以回合為求值單位),CARDS 11→10。
