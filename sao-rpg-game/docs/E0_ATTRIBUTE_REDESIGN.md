# E0 屬性系統重設設計文件

> E6 戰鬥重做的前置 task。E6-1 schema migration 開動前必須完成這份。  
> 設計來源:用戶提供的「8 主屬性 + 雙資源 + 元素反應」設計案,2026-05-07 拍板。  
> 「不要踩雷」清單請看 [`../CLAUDE.md`](../CLAUDE.md)。  
> 跟 [`COMBAT_REDESIGN.md`](./COMBAT_REDESIGN.md) 互補:這份管屬性 / 衍生值,那份管戰鬥流程 / ability schema。

---

## 立論

舊 12 屬性系統的問題:

- 47 個衍生值(含 9 元素 ×2),認知負擔過重
- 屬性影響數量極不均(專注 19 條 vs 肉體抗性 5 條,差 4 倍)
- 屬性間沒有明確「機會成本」,堆某些屬性可同時拿多種收益
- 9 元素獨立 sense + resist + 9 個輔助耐性 helper,過度細碎

E0 目標:**8 主屬性 / ~30 衍生值 / 統一公式框架(Growth/Taken/Chance)/ 強機會成本 / 6 元素反應系統**。

---

## 1. 屬性

### 8 主屬性(取代舊 12)

```
力量 STR   技巧 TEC   敏捷 AGI   反應 REA
耐力 END   抗性 RES   精神 MND   感知 PER
```

舊 12 → 新 8 對應:

| 舊屬性 | 新屬性 | 備註 |
| --- | --- | --- |
| 力量 | 力量 | 不變 |
| 敏捷 | 敏捷 | 不變 |
| 反應 | 反應 | 不變 |
| 體魄 | 耐力 | 改名 |
| 技巧 | 技巧 | 不變 |
| 肉體抗性 | 抗性 | 縮短 |
| 靈力 / 理智 / 專注 / 意志 / 親和 | 精神 | **5 合 1** |
| 感知 | 感知 | 不變 |

### 配點機制

- 每升級給 **3 點 unspent**(玩家自由分配)
- lv1 起始 +3 點
- lv1-100 累計拿到 **300 點**(含 lv1 起始)
- 每屬性上限 100,8×100=800 → 玩家最多配 300/800 = 37.5%
- 平均 37 點 / 屬性 → 落在邊際遞減第一段(0-60 線性) → 機會成本顯著

### 有效值換算(沿用舊版)

```
eff(raw)
  raw ≤ 60:        eff = raw
  61 ≤ raw ≤ 80:   eff = 60 + (raw - 60) × 0.6
  81 ≤ raw ≤ 100:  eff = 72 + (raw - 80) × 0.3
  raw 上限 100, eff 上限 78
```

所有衍生值公式吃 eff 值,不吃 raw。

---

## 2. Migration 策略

舊存檔處理:

| 機制 | 做法 |
| --- | --- |
| **DATA_VER** | **不 bump**(避免清存檔) |
| **子 schema flag** | 新增 `attrSchemaV2 = 1`,標記已遷移 |
| **舊 12 屬性點** | 全退進 `s.character.unspent`,玩家重配 |
| **舊衍生值快取** | 不存,即時算,migration 不需處理 |
| **舊 ATTRS 陣列** | `state.js` 的 `ATTRS` 從 12 改 8,`ATTRS_PHYS / ATTRS_MIND` 重組 |

```js
// runStateMigrations() 內加
const ATTR_SCHEMA_V2 = 1;
if((s.attrSchemaV2 || 0) < ATTR_SCHEMA_V2){
  if(s.character){
    const c = s.character;
    // 1. 舊 12 屬性點全退
    const oldAttrs = ['力量','敏捷','反應','體魄','技巧','肉體抗性',
                      '靈力','理智','專注','意志','感知','親和'];
    let refund = 0;
    oldAttrs.forEach(a => {
      refund += (c[a] || 0);
      delete c[a];
    });
    c.unspent = (c.unspent || 0) + refund;
    
    // 2. 新 8 屬性初始化為 0
    const newAttrs = ['力量','技巧','敏捷','反應','耐力','抗性','精神','感知'];
    newAttrs.forEach(a => { if(typeof c[a] !== 'number') c[a] = 0; });
  }
  s.attrSchemaV2 = ATTR_SCHEMA_V2;
}
```

⚠️ 注意:
- 「力量 / 敏捷 / 反應 / 技巧 / 感知」舊新同名 → 上面 oldAttrs 退完 delete,新版同 key 從 0 重設(玩家點數退進 unspent 不會重複加進新屬性)
- 舊「體魄」改「耐力」是新 key,舊「體魄」delete 後不影響
- 舊「肉體抗性」改「抗性」同理

---

## 3. 統一公式框架

所有衍生值用三類公式:

### A. Growth(成長型倍率)— 用於傷害、資源

```
score = 主屬性 × 0.50 + 副屬性 × 0.30 + 輔屬性 × 0.20
raw   = base × (1 + score / (score + K) × scale)
final = softHard(raw, soft, hard, afterSoftRate)
```

### B. Taken(防禦型減傷)— 用於物理 / 元素 / 破勢減免

```
score = ...
final = incoming × 100 / (100 + score)
```

### C. Chance(機率型)— 用於命中、閃避、格擋、暴擊等

```
score = ...
raw   = base + score × rate
final = softHard(raw, soft, hard, afterSoftRate)
```

### softHard(統一上限規則)

```js
function softHard(value, softCap, hardCap, afterSoftRate){
  if(value <= softCap) return Math.max(0, value);
  return Math.min(hardCap, softCap + (value - softCap) * afterSoftRate);
}
```

建議 `afterSoftRate`:

- 大部分機率:0.5
- 高價值機率(暴擊、閃避):0.35
- 防禦類:0.45

---

## 4. 衍生值清單

每個衍生值含「主 / 副 / 輔」3 屬性。同屬性不同公式可重複出現,但同一公式內 3 屬性不能重複。

### 4.1 基礎資源

| 衍生值 | 主 | 副 | 輔 | 公式 |
| --- | --- | --- | --- | --- |
| `maxHp` | END | RES | STR | `(120 + lv×48) × (1 + score/(score+260) × 0.85)`,無硬上限 |
| `maxStamina` | END | AGI | REA | `(40 + lv×6) × (1 + score/(score+240) × 0.80)`,無硬上限 |
| `staminaGainOnAction` | AGI | END | REA | `3 + score/(score+180) × 7`(範圍 3-10) |
| `maxSpirit` | MND | RES | PER | `(35 + lv×7) × (1 + score/(score+240) × 0.85)` |
| `spiritGainOnReaction` | MND | PER | RES | `4 + score/(score+180) × 8`(打元素反應才回) |

> 體力 / 靈力戰鬥內**不靠時間回**,只靠「行動」(體力)/「反應」(靈力)。  
> 戰鬥外靠藥水 / 食物 / 營火(見 `COMBAT_REDESIGN.md` #18-19)。

### 4.2 行動速度與普攻

| 衍生值 | 主 | 副 | 輔 | 公式 |
| --- | --- | --- | --- | --- |
| `actionSpeed` | AGI | REA | TEC | `1 + score/(score+260) × 0.55`,軟 1.35 / 硬 1.55 / 0.35 |
| `autoAttackDamage` | STR | TEC | AGI | `weaponBaseDamage × (1 + score/(score+220) × 1.10)` |
| `hitRate` | TEC | PER | AGI | `82 + score×0.22 - enemyEvasion`,軟 95 / 硬 98 / 0.25,clamp 55-98 |
| `evasionRate` | AGI | PER | REA | `score×0.22 - enemyAccuracyBonus`,軟 30 / 硬 40 / 0.35,Boss 重擊 ×0.35 |

### actionSpeed 影響清單

```
1. 自動行動間隔        autoActionInterval = baseInterval / actionSpeed
                       baseInterval = 2.0 秒, 最低 1.25 秒
2. 體力回復頻率        (action 觸發時回體力,actionSpeed 高 = 觸發快)
3. 攻擊條互動頻率      (玩家對 enemy 攻擊條的壓力速度)
```

> ⚠️ **不影響「主動技 cooldown 數字」**(避免敏捷流雙重收益)。actionSpeed 透過縮短「回合間隔」自然讓 cooldown 等待時間在現實時間上變短。

### 4.3 暴擊

| 衍生值 | 主 | 副 | 輔 | 公式 |
| --- | --- | --- | --- | --- |
| `critRate` | TEC | PER | AGI | `5 + score×0.45`,軟 45 / 硬 80 / 0.35 |
| `critDamage` | STR | TEC | PER | `150 + score×1.10`,軟 210 / 硬 250 / 0.35 |
| `critExpected` | (組合) | | | `1 + (critRate/100) × (critDamage/100 - 1)` |

#### 暴擊倍率分技能型別套用(critExpected efficiency)

依 ability `type` 套不同的 critExpected 比例:

| ability.type | critExpected 倍率 |
| --- | --- |
| `'auto_attack'` | × 1.0(普攻 100%) |
| `'sword_skill'` | × 0.8 |
| `'element_skill'` | × 0.5 |
| `'element_reaction'` | × 0.0(完全不吃) |

戰鬥引擎 `_calcDmg(ability, ...)` 看 `ability.type` 決定吃多少 critExpected。

### 4.4 破勢

破勢 = 第 4 條資源(玩家也有,跟 HP/體力/靈力 並列):

| 衍生值 | 主 | 副 | 輔 | 公式 |
| --- | --- | --- | --- | --- |
| `breakDamage` | STR | TEC | REA | `skillBreakBase × (1 + score/(score+220) × 1.20)` |
| `maxBreak` | RES | END | REA | `50 + lv×2 + score/(score+240) × 75`,軟 120 / 硬 160 |
| `incomingBreakTaken` | RES | REA | END | `enemyBreakDamage × 100/(100 + score)` |
| `collapseDamage` | RES | END | REA | `baseCollapseDamage × 100/(100 + score)` |

破勢條滿時:**1 回合不能行動 + 不能施放技能**(玩家);敵人滿時:破勢狀態 + 連擊 trigger(見 4.7)。

### 4.5 被動格擋 / 反擊

完全自動觸發,**不佔被動技槽**(屬於屬性堆出來的衍生機率):

| 衍生值 | 主 | 副 | 輔 | 公式 | 備註 |
| --- | --- | --- | --- | --- | --- |
| `guardRate` | REA | END | RES | `score×0.28`,軟 35 / 硬 55 / 0.35 | 觸發 → 受傷 ×0.60、受破勢 ×0.70 |
| `perfectGuardRate` | REA | PER | TEC | `score×0.22`,軟 25 / 硬 40 / 0.35 | 格擋成功後再判定;觸發 → 受傷 ×0.25、受破勢 ×0.30、敵破勢 +18、敵攻擊條重置 100% |
| `counterRate` | REA | TEC | STR | `score×0.25`,軟 30 / 硬 50 / 0.35 | 格擋成功時可觸發;精準格擋時 +20% |
| `counterDamage` | REA | TEC | STR | `weaponBaseDamage × 0.75 × (1 + score/(score+220) × 1.10)` | (反擊傷害,沿用 counterScore) |
| `counterBreak` | REA | TEC | STR | `10 × (1 + score/(score+200) × 1.20)` | (反擊破勢,沿用 counterScore) |

判定流程:

```
敵人攻擊命中
  → 判定閃避(evasionRate)→ 命中
  → 判定格擋(guardRate)→ 成功
    → 判定精準格擋(perfectGuardRate)
    → 判定反擊(counterRate)
```

### 4.6 連擊

只在以下三種情況有機率觸發(其他時候**不會**觸發):

```
敵人 BREAK 時
成功反擊時
技能打斷敵人攻擊條時
```

| 衍生值 | 主 | 副 | 輔 | 公式 | 備註 |
| --- | --- | --- | --- | --- | --- |
| `comboRate` | TEC | AGI | PER | `12 + score×0.26`,軟 45 / 硬 70 / 0.35 | 條件加成:BREAK +15% / 反擊 +10% / 打斷攻擊條 +8%;最終不超過 80% |
| `comboHits` | TEC | AGI | PER | `1 + floor(score/42)`,clamp 1-3 | 連擊段數 |
| `comboDamagePerHit` | TEC | AGI | PER | `weaponBaseDamage × 0.45 × (1 + score/(score+240) × 1.00)` | 每段傷害 |
| `comboStaminaGain` | TEC | AGI | PER | `4 + score/(score+180) × 8` | 連擊回體力,讓連擊變「節奏恢復」 |

### 4.7 劍技 / 元素技 配套

| 衍生值 | 主 | 副 | 輔 | 公式 | 備註 |
| --- | --- | --- | --- | --- | --- |
| `swordSkillDamage` | STR | TEC | REA | `skillBaseDamage × (1 + score/(score+220) × 1.25)` | |
| `swordSkillBreak` | TEC | STR | REA | `skillBaseBreak × (1 + score/(score+210) × 1.30)` | |
| `staminaCostMul` | END | TEC | AGI | `100 / (100 + score)`,最低 0.65 | 體力消耗縮減 |
| `elementSkillDamage` | MND | PER | TEC | `skillBaseDamage × (1 + score/(score+220) × 1.25)` | |
| `auraStrength` | MND | PER | RES | `skillAuraBase × (1 + score/(score+240) × 1.00)` | 元素附著強度 |
| `spiritCostMul` | MND | PER | RES | `100 / (100 + score)`,最低 0.65 | 靈力消耗縮減 |

### 4.8 防禦與抗性

| 衍生值 | 主 | 副 | 輔 | 公式 |
| --- | --- | --- | --- | --- |
| `physMitigation` | END | RES | STR | `incoming × 100/(100 + score)` |
| `elementMitigation` | RES | MND | END | `incoming × 100/(100 + score)` |
| `statusResist` | RES | MND | PER | `enemyStatusChance × 100/(100 + score)` |

### 4.9 攻擊條控制

| 衍生值 | 主 | 副 | 輔 | 公式 | 備註 |
| --- | --- | --- | --- | --- | --- |
| `playerPressureMod` | AGI | REA | PER | `1 - score/(score+300) × 0.22`,clamp 0.82 - 1.05 | 玩家最多讓 boss 攻擊條慢 18% |
| `gaugeDelayAmount` | REA | TEC | PER | `skillDelayBase × (1 + score/(score+220) × 0.80)` | 單次延遲最高 35% |

敵人攻擊條:

```
enemyGaugeDrainPerSec = enemyBaseSpeed × actionMod × playerPressureMod
actionMod:
  普通攻擊 1.00 / 重擊 0.65 / 施法 0.75 / 反制姿態 0.90 / 狂暴技能 1.25
```

---

## 5. 元素系統(6 元素,降級)

從舊 9 元素降到 **6 元素**:

```
火 / 水 / 冰 / 雷 / 風 / 岩
(舊「神聖 / 混沌 / 黑暗」全砍)
```

每敵人最多保留:

```
主附著元素 1 個
殘留元素 1 個
```

(避免狀態爆炸)

### 元素感應 / 抵抗(簡化)

舊 9 元素 ×2(sense + resist)= 18 個衍生值 + 9 個輔助耐性 helper → **全砍**。

新版**不再有 elementSense / elementResist 衍生值**。元素抵抗統一走 `elementMitigation`(4.8 §)。

特定元素弱點 / 抗性放在敵人 def 上(`elementAffinity`),不從玩家屬性衍生。

### 元素反應

獨立 schema `ELEMENT_REACTIONS_DEF`(不放 `ABILITY_DEFS`):

```js
const ELEMENT_REACTIONS_DEF = {
  vaporize: {                        // 火 + 水
    name: '蒸發',
    triggers: ['fire+water', 'water+fire'],
    type: 'damage',
    multiplierBase: 1.35,
    multiplierBonus: 0.35,           // 加 score/(score+260) 倍率
    multiplierK: 260,
    cooldown: 3,                     // 統一 3 回合
  },
  melt: {                            // 火 + 冰
    name: '融化',
    triggers: ['fire+ice', 'ice+fire'],
    type: 'damage_break',
    multiplierBase: 1.30,
    multiplierBonus: 0.35,
    multiplierK: 280,
    breakBonusBase: 8,               // × reactionPower
    cooldown: 3,
  },
  superconduct: {                    // 雷 + 冰
    name: '超導',
    triggers: ['thunder+ice', 'ice+thunder'],
    type: 'debuff',
    durationBase: 6,
    durationBonus: 4,                // 秒,score/(score+200) 加成
    physMitigationDownBase: 0.12,
    physMitigationDownBonus: 0.16,   // 12% ~ 28%
    cooldown: 3,
  },
  electroCharge: {                   // 雷 + 水
    name: '感電',
    triggers: ['thunder+water', 'water+thunder'],
    type: 'dot_gauge',
    dotMultiplier: 0.35,             // × elementBaseDamage × reactionPower,每秒 tick
    duration: 5,
    gaugeDrainMul: 0.88,             // 持續 4 秒
    cooldown: 3,
  },
  overload: {                        // 火 + 雷
    name: '超載',
    triggers: ['fire+thunder', 'thunder+fire'],
    type: 'damage_break_gauge',
    damageMul: 0.80,
    breakBase: 14,
    gaugeDelay: 0.10,
    cooldown: 3,
  },
  swirl: {                           // 風 + 火/水/冰/雷
    name: '擴散',
    triggers: ['wind+fire','wind+water','wind+ice','wind+thunder',
               'fire+wind','water+wind','ice+wind','thunder+wind'],
    type: 'spread',
    multiSwirlMul: 0.35,             // 多敵人:擴散到最多 2 個
    bossSwirlMul: 0.45,              // 單體 boss
    bossExtendSec: 2,
    spreadStrengthMul: 0.65,
    cooldown: 3,
  },
  resonance: {                       // 岩 + 任一元素
    name: '共鳴',
    triggers: ['rock+*', '*+rock'],  // 跟所有元素
    type: 'break_gauge',
    breakBase: 16,
    gaugeDelayBase: 0.10,
    gaugeDelayMul: 1.0,              // × reactionPower,clamp 0.10-0.18
    selfBreakReduce: 0.10,
    selfBreakDuration: 4,
    cooldown: 3,
  },
};

// 元素反應分數(衍生值,玩家屬性算)
function reactionScore(c){
  return PER × 0.50 + MND × 0.30 + TEC × 0.20;
}
function reactionPower(c){
  return 1 + reactionScore(c) / (reactionScore(c) + 220) × 1.00;  // 1.00 - 2.00
}
```

> 元素反應不佔玩家 ability 槽。玩家用 element_skill 疊敵人元素狀態 + 觸發條件成立 + 該反應 cooldown 為 0 → 自動結算。  
> CD 進入後 3 回合該反應不再觸發(同類反應冷卻 — `vaporize` 正在 CD 不影響 `melt`)。

---

## 6. 流派與機會成本(設計守則)

| 流派 | 核心屬性 | 強 | 弱 |
| --- | --- | --- | --- |
| **物理普攻流** | STR / TEC / AGI | 穩定輸出、暴擊、行動速度 | 元素弱、破勢控制普通 |
| **劍技破勢流** | STR / TEC / REA | 破勢、打斷、boss 攻擊條壓制 | 體力壓力高 |
| **反擊格擋流** | REA / END / RES | 被動格擋 / 精準格擋 / 反擊 / 抗破勢 | 主動輸出低 |
| **元素反應流** | MND / PER / TEC | 元素傷害 / 反應 / 附著 | 物理承受差 |
| **高速閃避流** | AGI / PER / REA | 閃避 / 行動速度 / 攻擊條壓制 | 怕高抗性 boss |

每屬性的「機會成本 / 強項弱項」:

| 屬性 | 強 | 弱 |
| --- | --- | --- |
| **力量** | 物理傷害 | 不提高命中、體力、靈力 |
| **技巧** | 命中、暴擊、連擊 | 不提高生存 |
| **敏捷** | 行動速度、閃避 | 不直接大幅提高傷害 |
| **反應** | 格擋、反擊、攻擊條控制 | 不提高資源上限 |
| **耐力** | HP、體力、生存 | 元素能力弱 |
| **抗性** | 元素防禦、破勢承受 | 輸出弱 |
| **精神** | 靈力 + 元素技 | 物理能力弱 |
| **感知** | 命中、反應效率、元素反應 | 單獨投資傷害不高 |

→ 不存在「堆 1 屬性全包」的可能。每流派必須投資 3 屬性以上。

---

## 7. 衍生值總清單(對照舊版)

| 大類 | 舊版數量 | 新版數量 | 變動 |
| --- | --- | --- | --- |
| 核心分數 | 5(physScore / magicScore / blunt/slash/pierce Score) | 0(內聯到各 score 變數) | 砍 |
| 威力倍率 | 5 | 0(內聯) | 砍 |
| 暴擊 | 4 | 3(critRate / critDamage / critExpected) | -1 |
| 穿透 | 1 | 0 | 砍(設計簡化,不做穿透) |
| HP/MP/Regen | 3 | 5(maxHp / maxStamina / maxSpirit / staminaGain / spiritGain) | +2(體力 / 靈力分離) |
| 防禦 | 2(physDef / magicDef) | 3(physMitigation / elementMitigation / statusResist) | +1 |
| 肉體 / 精神值 | 2 | 0 | 砍 |
| 異常 | 2(apply / resist) | 1(statusResist) | -1 |
| 行動 / 命中 / 迴避 | 4 | 4(actionSpeed / autoAttackDamage / hitRate / evasionRate) | 持平 |
| 詠唱效率 | 1 | 0(merge 到 spiritCostMul) | 砍 |
| 無屬性耐性 | 2 | 0 | 砍(merge 到 elementMitigation) |
| 元素感應 | 9 | 0 | **全砍** |
| 元素抵抗 | 9 | 0(merge 到 elementMitigation) | **全砍** |
| 破勢系統 | 0 | 4(breakDamage / maxBreak / incomingBreakTaken / collapseDamage) | **新增** |
| 被動格擋 / 反擊 | 0 | 5(guardRate / perfectGuardRate / counterRate / counterDamage / counterBreak) | **新增** |
| 連擊 | 0 | 4(comboRate / comboHits / comboDamagePerHit / comboStaminaGain) | **新增** |
| 劍技 / 元素技配套 | 0 | 6(swordSkillDamage / Break / staminaCostMul / elementSkillDamage / auraStrength / spiritCostMul) | **新增** |
| 攻擊條控制 | 0 | 2(playerPressureMod / gaugeDelayAmount) | **新增** |
| **合計** | **47** | **~37** | 結構大改但總數沒少很多 |

> 雖然總數沒大砍,但**舊版 47 個多是元素 + 內部 helper**(玩家面板看不到 score / mastery),  
> 新版 37 個**全是玩家面板看得到的「實感」衍生值**(破勢 / 格擋 / 連擊 / 反應)。

---

## 8. Schema 變動(state)

```js
// 8 屬性
ATTRS = ['力量','技巧','敏捷','反應','耐力','抗性','精神','感知'];
ATTRS_PHYS = ['力量','技巧','敏捷','反應','耐力','抗性'];   // 6 條物理流派
ATTRS_MIND = ['精神','感知'];                                // 2 條心智(暫定)

// s.character 欄位
{
  level, exp,
  hp,    maxHp,         // 動態算
  stamina, maxStamina,  // ← 取代 mp,新欄位
  spirit,  maxSpirit,   // ← 取代另一條 mp,新欄位
  break,   maxBreak,    // ← 第 4 條資源,新欄位
  unspent,
  力量, 技巧, 敏捷, 反應, 耐力, 抗性, 精神, 感知,
  ...
}

// s.character 移除欄位(migration 清掉)
{
  mp, maxMp,                            // ← 改 spirit
  體魄, 肉體抗性, 靈力, 理智, 專注, 意志, 親和,  // ← 退進 unspent
}
```

---

## 9. 風險清單

1. **8 屬性 reset migration 體驗** — 玩家進遊戲看到「你的屬性點全退了,請重配 X 點」會困惑。要在重配 UI 加說明:「E0 改版,屬性系統重設,你的 N 點屬性已退回」。
2. **「精神」5 合 1 太強** — 舊「靈力 / 理智 / 專注 / 意志 / 親和」5 條軸併成 1 條,可能讓「精神」屬性變超強(吃 maxSpirit / spiritGain / elementSkillDamage / auraStrength / spiritCostMul / elementMitigation)。E6-6 平衡時驗證,若失衡可拆出「意志」獨立軸。
3. **6 元素降級可能讓元素流變單調** — 從 9 元素降到 6,元素反應 7 種是否夠玩家有「組合」深度?E6-6 觀察。
4. **破勢條 UI 擠 4 條 bar** — HP / 體力 / 靈力 / 破勢 在手機 390px 寬幕上要塞下 4 條。E6-4 UI 設計要思考(可能破勢條不放主視野,放敵人頭上才顯示玩家也在累積)。
5. **元素反應 cooldown 統一 3 回合可能太強或太弱** — 7 種反應全 3 CD,實戰可能讓玩家持續一直觸發、或反應流派沒空間。E6-6 平衡時依數據調整。
6. **8 屬性 / 300 點 / 上限 100 的數值膨脹率沒實測** — lv1-100 拿到 300 點 = 平均每屬性 37 點,看起來剛好在邊際遞減第一段。但實戰是否「lv50 已經太強 / lv100 沒成長」沒測試,E6-6 task 內驗證後可調 score K 值微調。

---

## 10. 進入 E6-1 前必須完成

- [x] 8 屬性表 + 中文名拍板
- [x] 配點機制(每升級 +3、lv1 起始 +3)
- [x] migration 策略(舊 12 屬性點全退到 unspent)
- [x] 衍生值清單(40 個 with 主副輔屬性 + 公式)
- [x] 元素降級(9 → 6)+ 元素反應 schema(`ELEMENT_REACTIONS_DEF` 獨立表)
- [x] 流派與機會成本表
- [x] state schema 變動表
- [x] code 命名(stamina / spirit,棄 mp)

> 全部勾完 → 直接進 E6-1 schema migration 設計。

---

## 11. 與 [`COMBAT_REDESIGN.md`](./COMBAT_REDESIGN.md) 的銜接

E0 拍完後,COMBAT_REDESIGN.md 部分章節要更新(下次 commit 時順手):

| COMBAT_REDESIGN # | 原內容 | 更新方向 |
| --- | --- | --- |
| #4 普攻 cost | 「普攻 -1 耐久 / 下」 | 加註:「同時消耗體力(數字 E6-3 拍)」 |
| #5 主動技 cost | 「SP / MP」 | 改「體力 / 靈力」(中文)+ schema `stamina / spirit` |
| #6 主動技 cooldown | 「無 cooldown」 | 改「有 cooldown,不被 actionSpeed 直接縮(透過行動間隔自然加速)」 |
| #9 被動技類型 | 「永久 buff + 條件觸發」 | 加註:「被動格擋 / 反擊 / 連擊不在被動技槽,屬於屬性衍生機率自動觸發。被動技槽留給特化加成(火傷 +30% 等)」 |
| §資源系統 #17-19 | HP / SP / MP | 改 HP / 體力 / 靈力 |
| §風險 #1 CARDS 拆解 | 「11 張」 | 改「10 張」,且要重新審視:guard / parry 變屬性衍生不該繼續當被動技 |

---

## 12. 變更歷史

- **2026-05-07**:E0 起草。8 屬性 / 雙資源(體力 + 靈力)/ 破勢條 / 6 元素反應 / 衍生值統一公式框架。
