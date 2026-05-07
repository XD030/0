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
| 卡牌資源 = SP cost(微) | SP / MP 雙池,戰鬥內不回 |

---

## 設計決策(已敲)

### 戰鬥流程

| # | 領域 | 決策 |
| --- | --- | --- |
| 1 | 普攻 hit-type | 武器決定(劍 → slash / 弓 → pierce / 錘 → blunt) |
| 2 | 法術 hit-type | 法術 def 自帶 `damageType` |
| 3 | 普攻打誰 | 玩家點敵人設定主目標,普攻自動打主目標 |
| 4 | 普攻 cost | **設計目標**:消耗武器耐久 -1/下;**E6 過渡**:每 5 下消耗 1(等武器耐久重構獨立 task 完成後合併) |
| 5 | 主動技 cost | SP(物理)or MP(法術),戰鬥內不回 |
| 6 | 主動技 cooldown | 無,只看 SP/MP cost |
| 7 | 主動技施放 | 玩家手動,任何回合可放(夠 cost 即可) |
| 8 | 被動技觸發 | 自動,寫死 condition 庫(不做 DSL) |
| 9 | 被動技類型 | 永久 buff + 條件觸發混合 |
| 10 | 被動觸發回饋 | 戰鬥日誌(現有 `battleLog`) |
| 11 | 戰鬥中換武器 | 不可,戰鬥前固定 |
| 12 | 4 主動 + 4 被動槽 | 不可重複(每槽不同技能) |
| 13 | 戰鬥中換技能 | 不可,戰鬥前固定 |

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
| 18 | SP 戰外回 | 食物 / 營火 |
| 19 | MP 戰外回 | 藥水 / 營火 |

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
// 現有
{
  id, name, type:'phys'|'magic', damageType, baseMul, mpCost, ...
}

// E6 新增
{
  id, name,
  category: 'active' | 'passive',         // 必填
  // active 才有的欄位:
  costType: 'sp' | 'mp',                  // active only
  cost: 10,                               // active only
  // passive 才有的欄位:
  triggerCondition: 'ON_HP_LOW' | 'ON_HIT' | 'ON_TURN_START' | 'ALWAYS',
  effect: { ... }                         // passive only
}
```

### 玩家 state schema 擴展

```js
// 現有
s.skills = { 0: skillKey, 1: skillKey, 2: skillKey, 3: skillKey }

// E6
s.activeSkills = { 0, 1, 2, 3 }     // 4 個主動技槽
s.passiveSkills = { 0, 1, 2, 3 }    // 4 個被動技槽
s.character.sp = N                  // 新增 SP 池
s.character.maxSp = N               // 新增 maxSP
s.mainTargetIdx = 0..3              // 戰鬥中主目標
```

### ENEMY_DEFS / ENEMY_ATTACKS_CARD 擴展

```js
// ENEMY_ATTACKS_CARD 招式 schema 加
isTelegraphed: true,                  // 出招前 1 回合預警
telegraphIcon: '⚡',                  // 預警 emoji
telegraphAnim: 'shake'|'glow-red'|'pulse',  // CSS 動畫名
telegraphSprite: 'enemy_xxx_charge',  // 蓄力 sprite key(可選,有 PNG 才用)
```

### CARDS 遷移(E6-3 task 內逐張議定)

E4 / E5 的 11 張 CARDS,大部分轉成「主動技」,部分轉成「被動」:

| 原 CARD | E6 角色 | 備註 |
| --- | --- | --- |
| slash / heavy / pierce / etc. | **主動技**(物理 / 耗 SP) | 數量縮 |
| guard | **被動技** | trigger `ON_HP_LOW` 自動格擋 |
| heal | **主動技**(法術 / 耗 MP) |  |
| buff | **被動技** ALWAYS |  |
| ...(逐張議定) |  |  |

---

## UI 設計(實作 spec 階段細化)

```
┌─────────────────────┐
│ 玩家 sprite + 主目標 │  上半:視覺與狀態
│ HP/SP/MP bar         │
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
- 4 個技能按鈕灰階 = SP/MP 不夠
- 普攻每回合自動執行,不需點

---

## 拆 Sub-Task 規劃

| Task | 範圍 | 依賴 |
| --- | --- | --- |
| **E6-1** Schema + state migration | `SKILL_DEFS` / `s.activeSkills` / `s.passiveSkills` / `s.character.sp` 加 schema | 無 |
| **E6-2** 戰鬥主迴圈重寫 | `battle.js` 從「點卡 → 結算」改成「auto 普攻 + tick + 主動技 trigger + 被動 condition」 | E6-1 |
| **E6-3** 主動技 / 被動技內容遷移 | `CARDS` 11 張拆 / `SKILL_DEFS` 加 `category` | E6-1 |
| **E6-4** UI 重做(4 按鈕條) | `character.js` / `battle.js` UI 部分,砍翻頁卡牌 | E6-2 |
| **E6-5** 敵人預警系統(CSS-only fallback) | `ENEMY_ATTACKS_CARD` 加 `isTelegraphed` / sprite CSS 動效 + emoji overlay。**美術 PNG 替換是後續 asset swap,不算 dev task** | E6-2 |
| **E6-6** SP/MP 戰外回復(食物 / 藥水 / 營火)+ 感知偵察 reveal + 平衡調校 | `items.js` 新增食物 effect / 藥水分 SP/MP 兩種 / 地圖節點 hint 系統 / 1F 全雜兵 + boss 重新 balance | E6-1 ~ E6-5 |

每個 task 獨立 session,結束 commit 一次,合回 main 後再開下一個。

---

## 風險清單

1. **既有 11 張 CARDS 拆解後內容不夠** — 主動 / 被動每邊至少要 8-10 個讓玩家有 build 選項。可能需要新設計 5-10 個技能填補。E6-3 sub-task 會逐張盤點。
2. **被動疊加平衡** — 4 個 ALWAYS 被動同時觸發容易破壞平衡,要在 schema 加「同類被動互斥」或「最多 2 個觸發類」限制。E6-1 schema 設計時定平衡規則。
3. **戰鬥節奏變鬆 → 戰鬥變短 → 體驗變淺** — 設計上要刻意拉長戰鬥(boss 25 回合而不是 10),否則普攻自動完成後,玩家發揮主動 / 被動的機會太少。E6-6 平衡時驗證。
4. **sprite 預警動效美術依賴** — 目前只有 `player_idle.png` 一張圖,enemy 全是 placeholder。E6-5 先做 CSS-only 方案(顏色 / 抖動 / overlay),不依賴美術資源。**美術 PNG 補上後直接 swap**,程式邏輯不需動。
5. **武器耐久基底太低** — 現有 maxDur 6-10,如果直接套「普攻 -1/下」武器秒斷。E6 過渡用「每 5 下消耗 1」,等待**獨立的武器耐久重構 task**(不在 E6 範圍)合併後改回 -1/下。
6. **「不可換武器 + 隨機 spawn」運氣感** — 用感知屬性 reveal 系統補償,玩家堆感知換情報。但 1F 玩家感知屬性可能仍 0 → reveal 全是問號 → 純運氣。E6-6 平衡時要確認 1F 雜兵的 hit-type 多樣性不要極端(避免「武器選錯就打不動」)。

---

## 進入 sub-task 前必須完成

- [x] 細節 #18-19 拍板(SP/MP 戰外回機制) — 18: 食物 / 營火;19: 藥水 / 營火
- [x] 偵察機制設計 — 純感知屬性閾值,地圖節點階段 reveal
- [x] 普攻 cost 過渡方案 — 每 5 下消耗 1 耐久
- [ ] CARDS 11 張的拆解表(每張 → 主動 / 被動 / 棄用)— 列入 **E6-3 task 第一步**
- [ ] 至少 5-10 個新技能設計(填補主動 / 被動池)— E6-3
- [ ] 被動疊加平衡規則(互斥組 / 觸發次數上限)— **E6-1 schema 階段**
- [ ] 主目標 UI 視覺方案 — E6-4

---

## 變更歷史

- **2026-05-07**:初稿。整合 13 條戰鬥流程決策、3 條敵人預警、3 條資源系統、3 條偵察分級、6 個 sub-task。
