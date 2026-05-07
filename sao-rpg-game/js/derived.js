/* ========================================================================
 * derived.js — 衍生值計算函式群(E0:8 屬性翻新 + 雙資源 + 破勢 + 6 元素反應)
 *
 * 純函式,無副作用。每個函式接收 character 物件 c,回傳衍生值(數字)。
 * 屬性使用「有效值」(§0):0-60 1:1,61-80 ×0.6,81-100 ×0.3。
 *
 * Load order:state.js → derived.js → wordlist.js → items.js → utils.js → ...
 * derived.js 不依賴 wordlist/items/utils,只需要 ATTRS 等(state.js)。
 *
 * 結構:
 *   §0  effectiveAttr / eff
 *   §1  公式 helper:softHard / clamp
 *   §2  基礎資源(maxHp/maxStamina/staminaGainOnAction/maxSpirit/spiritGainOnReaction)
 *   §3  行動 / 普攻(actionSpeed/autoAttackDamage/hitRate/evasionRate)
 *   §4  暴擊(critRateE0/critDamage/critExpected)— critRate 是 stub 用舊公式(§12)
 *   §5  破勢(breakDamage/maxBreak/incomingBreakTaken/collapseDamage)
 *   §6  被動格擋反擊(guardRate/perfectGuardRate/counterRate/counterDamage/counterBreak)
 *   §7  連擊(comboRate/comboHits/comboDamagePerHit/comboStaminaGain)
 *   §8  劍技元素技配套(swordSkillDamage/Break / staminaCostMul / elementSkillDamage / auraStrength / spiritCostMul)
 *   §9  防禦抗性(physMitigation/elementMitigation/statusResist)
 *   §10 攻擊條(playerPressureMod/gaugeDelayAmount)
 *   §11 ELEMENT_REACTIONS_DEF + reactionScore/reactionPower
 *   §12 E5 兼容 stub(physScore/magicScore/9 sense/9 resist/critRate ...,E6-2 砍)
 *   §13 DERIVED_DEFS:玩家面板顯示新衍生值(stub 不上)
 *   §14 ATTR_INFLUENCES:8 屬性 → 影響的衍生值反查
 *   §15 fmtDerived / pctDerived:render helper
 *
 * 公式來源:E0_ATTRIBUTE_REDESIGN.md §4(衍生值)、§5(7 元素反應)
 * ======================================================================== */

/* ════════════════ §0 有效值 ════════════════ */
function effectiveAttr(raw){
  raw = raw||0;
  if(raw <= 60) return raw;
  if(raw <= 80) return 60 + (raw - 60) * 0.6;
  return 72 + (Math.min(raw, 100) - 80) * 0.3;
}
function eff(c, attr){return effectiveAttr(c[attr]||0);}

/* ════════════════ §1 公式 helper ════════════════ */
function softHard(value, softCap, hardCap, afterSoftRate){
  if(value <= softCap) return Math.max(0, value);
  return Math.min(hardCap, softCap + (value - softCap) * afterSoftRate);
}
function clamp(val, min, max){return Math.max(min, Math.min(max, val));}

/* ════════════════ §2 基礎資源 ════════════════ */
function maxHp(c){
  // 主 耐力 / 副 抗性 / 輔 力量
  // 公式跟 state.js initState + runStateMigrations 對齊,改要兩邊同步
  const lv = c.level || 1;
  const score = eff(c,'耐力')*0.50 + eff(c,'抗性')*0.30 + eff(c,'力量')*0.20;
  return Math.round((120 + lv*48) * (1 + score/(score+260) * 0.85));
}
function maxStamina(c){
  // 主 耐力 / 副 敏捷 / 輔 反應
  const lv = c.level || 1;
  const score = eff(c,'耐力')*0.50 + eff(c,'敏捷')*0.30 + eff(c,'反應')*0.20;
  return Math.round((40 + lv*6) * (1 + score/(score+240) * 0.80));
}
function staminaGainOnAction(c){
  // 主 敏捷 / 副 耐力 / 輔 反應 — 範圍 3-10
  const score = eff(c,'敏捷')*0.50 + eff(c,'耐力')*0.30 + eff(c,'反應')*0.20;
  return 3 + score/(score+180) * 7;
}
function maxSpirit(c){
  // 主 精神 / 副 抗性 / 輔 感知
  const lv = c.level || 1;
  const score = eff(c,'精神')*0.50 + eff(c,'抗性')*0.30 + eff(c,'感知')*0.20;
  return Math.round((35 + lv*7) * (1 + score/(score+240) * 0.85));
}
function spiritGainOnReaction(c){
  // 主 精神 / 副 感知 / 輔 抗性 — 範圍 4-12,打元素反應才回
  const score = eff(c,'精神')*0.50 + eff(c,'感知')*0.30 + eff(c,'抗性')*0.20;
  return 4 + score/(score+180) * 8;
}

/* ════════════════ §3 行動 / 普攻 ════════════════ */
function actionSpeed(c){
  // 主 敏捷 / 副 反應 / 輔 技巧 — 倍率 1.0-1.55
  const score = eff(c,'敏捷')*0.50 + eff(c,'反應')*0.30 + eff(c,'技巧')*0.20;
  const raw = 1 + score/(score+260) * 0.55;
  return softHard(raw, 1.35, 1.55, 0.35);
}
function autoAttackDamage(c){
  // 主 力量 / 副 技巧 / 輔 敏捷 — 回倍率;呼叫端 × weaponBaseDamage
  const score = eff(c,'力量')*0.50 + eff(c,'技巧')*0.30 + eff(c,'敏捷')*0.20;
  return 1 + score/(score+220) * 1.10;
}
function hitRate(c){
  // 主 技巧 / 副 感知 / 輔 敏捷 — 不減 enemyEvasion(由呼叫端處理)
  const score = eff(c,'技巧')*0.50 + eff(c,'感知')*0.30 + eff(c,'敏捷')*0.20;
  const raw = 82 + score*0.22;
  return clamp(softHard(raw, 95, 98, 0.25), 55, 98);
}
function evasionRate(c){
  // 主 敏捷 / 副 感知 / 輔 反應 — 不減 enemyAccuracyBonus(由呼叫端處理)
  const score = eff(c,'敏捷')*0.50 + eff(c,'感知')*0.30 + eff(c,'反應')*0.20;
  const raw = score*0.22;
  return softHard(raw, 30, 40, 0.35);
}

/* ════════════════ §4 暴擊 ════════════════
 * critRate dual-name:E0 過渡期 stub `critRate` 用舊公式釘住 E5 1F 平衡(§12);
 * 新 `critRateE0` 走新公式,DERIVED_DEFS 顯示給玩家。E6-2 砍 stub 後 critRateE0 → critRate。
 *
 * critExpected 用 stub critRate 算(讓 battle.js critRate random check 跟 critExpected 倍率一致)。
 * 玩家面板看到的 critRate 是新版 27.5% / critExpected 是 stub 21% based — 過渡期數字不一致,
 * 故 critExpected 不上 DERIVED_DEFS(避免玩家困惑)。E6-2 砍 stub 後一致。
 * ════════════════════════════════════════════════ */
function critRateE0(c){
  // 主 技巧 / 副 感知 / 輔 敏捷
  const score = eff(c,'技巧')*0.50 + eff(c,'感知')*0.30 + eff(c,'敏捷')*0.20;
  const raw = 5 + score*0.45;
  return softHard(raw, 45, 80, 0.35);
}
function critDamage(c){
  // 主 力量 / 副 技巧 / 輔 感知
  const score = eff(c,'力量')*0.50 + eff(c,'技巧')*0.30 + eff(c,'感知')*0.20;
  const raw = 150 + score*1.10;
  return softHard(raw, 210, 250, 0.35);
}
function critExpected(c){
  // 用 stub critRate(§12)— 跟 battle.js critRate random check 一致
  return 1 + (critRate(c)/100) * (critDamage(c)/100 - 1);
}

/* ════════════════ §5 破勢 ════════════════ */
function breakDamage(c){
  // 主 力量 / 副 技巧 / 輔 反應 — 回倍率;呼叫端 × skillBreakBase
  const score = eff(c,'力量')*0.50 + eff(c,'技巧')*0.30 + eff(c,'反應')*0.20;
  return 1 + score/(score+220) * 1.20;
}
function maxBreak(c){
  // 主 抗性 / 副 耐力 / 輔 反應 — 軟 120 / 硬 160
  const lv = c.level || 1;
  const score = eff(c,'抗性')*0.50 + eff(c,'耐力')*0.30 + eff(c,'反應')*0.20;
  const raw = 50 + lv*2 + score/(score+240) * 75;
  return Math.round(softHard(raw, 120, 160, 0.5));
}
function incomingBreakTaken(c){
  // 主 抗性 / 副 反應 / 輔 耐力 — 倍率 < 1 = 受破勢減少
  const score = eff(c,'抗性')*0.50 + eff(c,'反應')*0.30 + eff(c,'耐力')*0.20;
  return 100 / (100 + score);
}
function collapseDamage(c){
  // 主 抗性 / 副 耐力 / 輔 反應 — 倍率 < 1 = 破勢崩潰傷害減少
  const score = eff(c,'抗性')*0.50 + eff(c,'耐力')*0.30 + eff(c,'反應')*0.20;
  return 100 / (100 + score);
}

/* ════════════════ §6 被動格擋 / 反擊 ════════════════
 * 完全自動觸發,不佔被動技槽。判定流程(E0 doc §4.5):
 *   敵人攻擊命中 → 閃避 → 命中 → guardRate → 成功
 *     → perfectGuardRate(精準格擋)→ counterRate(反擊)
 * 反擊 / 連擊 觸發 → comboDamagePerHit / counterBreak 算傷害與破勢
 * ════════════════════════════════════════════════ */
function guardRate(c){
  // 主 反應 / 副 耐力 / 輔 抗性
  const score = eff(c,'反應')*0.50 + eff(c,'耐力')*0.30 + eff(c,'抗性')*0.20;
  const raw = score*0.28;
  return softHard(raw, 35, 55, 0.35);
}
function perfectGuardRate(c){
  // 主 反應 / 副 感知 / 輔 技巧
  const score = eff(c,'反應')*0.50 + eff(c,'感知')*0.30 + eff(c,'技巧')*0.20;
  const raw = score*0.22;
  return softHard(raw, 25, 40, 0.35);
}
function counterRate(c){
  // 主 反應 / 副 技巧 / 輔 力量
  const score = eff(c,'反應')*0.50 + eff(c,'技巧')*0.30 + eff(c,'力量')*0.20;
  const raw = score*0.25;
  return softHard(raw, 30, 50, 0.35);
}
function counterDamage(c){
  // 主 反應 / 副 技巧 / 輔 力量 — 回倍率;呼叫端 × weaponBaseDamage × 0.75
  const score = eff(c,'反應')*0.50 + eff(c,'技巧')*0.30 + eff(c,'力量')*0.20;
  return 1 + score/(score+220) * 1.10;
}
function counterBreak(c){
  // 主 反應 / 副 技巧 / 輔 力量 — 回倍率;呼叫端 × 10
  const score = eff(c,'反應')*0.50 + eff(c,'技巧')*0.30 + eff(c,'力量')*0.20;
  return 1 + score/(score+200) * 1.20;
}

/* ════════════════ §7 連擊 ════════════════
 * 只在三種情況有機率觸發:敵人 BREAK / 成功反擊 / 技能打斷敵人攻擊條。
 * 條件加成:BREAK +15% / 反擊 +10% / 打斷 +8%(由戰鬥引擎 E6-2 處理)。
 * ════════════════════════════════════════════════ */
function comboRate(c){
  // 主 技巧 / 副 敏捷 / 輔 感知
  const score = eff(c,'技巧')*0.50 + eff(c,'敏捷')*0.30 + eff(c,'感知')*0.20;
  const raw = 12 + score*0.26;
  return softHard(raw, 45, 70, 0.35);
}
function comboHits(c){
  // 主 技巧 / 副 敏捷 / 輔 感知 — 段數 1-3
  const score = eff(c,'技巧')*0.50 + eff(c,'敏捷')*0.30 + eff(c,'感知')*0.20;
  return clamp(1 + Math.floor(score/42), 1, 3);
}
function comboDamagePerHit(c){
  // 主 技巧 / 副 敏捷 / 輔 感知 — 回倍率;呼叫端 × weaponBaseDamage × 0.45
  const score = eff(c,'技巧')*0.50 + eff(c,'敏捷')*0.30 + eff(c,'感知')*0.20;
  return 1 + score/(score+240) * 1.00;
}
function comboStaminaGain(c){
  // 主 技巧 / 副 敏捷 / 輔 感知 — 連擊回體力,讓連擊變「節奏恢復」
  const score = eff(c,'技巧')*0.50 + eff(c,'敏捷')*0.30 + eff(c,'感知')*0.20;
  return 4 + score/(score+180) * 8;
}

/* ════════════════ §8 劍技 / 元素技配套 ════════════════ */
function swordSkillDamage(c){
  // 主 力量 / 副 技巧 / 輔 反應 — 回倍率;呼叫端 × skillBaseDamage
  const score = eff(c,'力量')*0.50 + eff(c,'技巧')*0.30 + eff(c,'反應')*0.20;
  return 1 + score/(score+220) * 1.25;
}
function swordSkillBreak(c){
  // 主 技巧 / 副 力量 / 輔 反應 — 回倍率;呼叫端 × skillBaseBreak
  const score = eff(c,'技巧')*0.50 + eff(c,'力量')*0.30 + eff(c,'反應')*0.20;
  return 1 + score/(score+210) * 1.30;
}
function staminaCostMul(c){
  // 主 耐力 / 副 技巧 / 輔 敏捷 — 倍率 0.65-1.0 (cost 折扣)
  const score = eff(c,'耐力')*0.50 + eff(c,'技巧')*0.30 + eff(c,'敏捷')*0.20;
  return Math.max(0.65, 100/(100+score));
}
function elementSkillDamage(c){
  // 主 精神 / 副 感知 / 輔 技巧 — 回倍率
  const score = eff(c,'精神')*0.50 + eff(c,'感知')*0.30 + eff(c,'技巧')*0.20;
  return 1 + score/(score+220) * 1.25;
}
function auraStrength(c){
  // 主 精神 / 副 感知 / 輔 抗性 — 元素附著強度倍率
  const score = eff(c,'精神')*0.50 + eff(c,'感知')*0.30 + eff(c,'抗性')*0.20;
  return 1 + score/(score+240) * 1.00;
}
function spiritCostMul(c){
  // 主 精神 / 副 感知 / 輔 抗性 — 倍率 0.65-1.0
  const score = eff(c,'精神')*0.50 + eff(c,'感知')*0.30 + eff(c,'抗性')*0.20;
  return Math.max(0.65, 100/(100+score));
}

/* ════════════════ §9 防禦抗性 ════════════════ */
function physMitigation(c){
  // 主 耐力 / 副 抗性 / 輔 力量 — 倍率 < 1 = 受傷減少
  const score = eff(c,'耐力')*0.50 + eff(c,'抗性')*0.30 + eff(c,'力量')*0.20;
  return 100 / (100 + score);
}
function elementMitigation(c){
  // 主 抗性 / 副 精神 / 輔 耐力 — 倍率 < 1 = 元素受傷減少
  const score = eff(c,'抗性')*0.50 + eff(c,'精神')*0.30 + eff(c,'耐力')*0.20;
  return 100 / (100 + score);
}
function statusResist(c){
  // 主 抗性 / 副 精神 / 輔 感知 — 倍率 < 1 = 異常觸發降低
  const score = eff(c,'抗性')*0.50 + eff(c,'精神')*0.30 + eff(c,'感知')*0.20;
  return 100 / (100 + score);
}

/* ════════════════ §10 攻擊條 ════════════════ */
function playerPressureMod(c){
  // 主 敏捷 / 副 反應 / 輔 感知 — 倍率 0.82-1.05(玩家壓制敵人攻擊條)
  const score = eff(c,'敏捷')*0.50 + eff(c,'反應')*0.30 + eff(c,'感知')*0.20;
  const raw = 1 - score/(score+300) * 0.22;
  return clamp(raw, 0.82, 1.05);
}
function gaugeDelayAmount(c){
  // 主 反應 / 副 技巧 / 輔 感知 — 回倍率;呼叫端 × skillDelayBase
  const score = eff(c,'反應')*0.50 + eff(c,'技巧')*0.30 + eff(c,'感知')*0.20;
  return 1 + score/(score+220) * 0.80;
}

/* ════════════════ §11 元素反應 ════════════════
 * 6 元素:火/水/冰/雷/風/岩。每敵人最多附著 1 主元素 + 1 殘留(避免狀態爆炸)。
 * 7 反應(統一 CD 3 回合,同類反應冷卻不影響其他類):
 *   蒸發 / 融化 / 超導 / 感電 / 超載 / 擴散 / 共鳴
 * 元素抗性走 elementMitigation(§9),不再有 elementSense / elementResist 衍生值。
 * E0 階段只放 schema + reactionScore/Power,實際觸發邏輯 E6-2 戰鬥重做才實作。
 * ════════════════════════════════════════════════ */
const ELEMENT_REACTIONS_DEF = {
  vaporize: {                         // 火 + 水
    name: '蒸發',
    triggers: ['fire+water', 'water+fire'],
    type: 'damage',
    multiplierBase: 1.35,
    multiplierBonus: 0.35,             // × score/(score+260) 加成
    multiplierK: 260,
    cooldown: 3,
  },
  melt: {                             // 火 + 冰
    name: '融化',
    triggers: ['fire+ice', 'ice+fire'],
    type: 'damage_break',
    multiplierBase: 1.30,
    multiplierBonus: 0.35,
    multiplierK: 280,
    breakBonusBase: 8,                 // × reactionPower
    cooldown: 3,
  },
  superconduct: {                     // 雷 + 冰
    name: '超導',
    triggers: ['thunder+ice', 'ice+thunder'],
    type: 'debuff',
    durationBase: 6,
    durationBonus: 4,                  // 秒
    physMitigationDownBase: 0.12,
    physMitigationDownBonus: 0.16,     // 12%-28%
    cooldown: 3,
  },
  electroCharge: {                    // 雷 + 水
    name: '感電',
    triggers: ['thunder+water', 'water+thunder'],
    type: 'dot_gauge',
    dotMultiplier: 0.35,               // × elementBaseDamage × reactionPower(每秒 tick)
    duration: 5,
    gaugeDrainMul: 0.88,               // 持續 4 秒
    cooldown: 3,
  },
  overload: {                         // 火 + 雷
    name: '超載',
    triggers: ['fire+thunder', 'thunder+fire'],
    type: 'damage_break_gauge',
    damageMul: 0.80,
    breakBase: 14,
    gaugeDelay: 0.10,
    cooldown: 3,
  },
  swirl: {                            // 風 + 火/水/冰/雷
    name: '擴散',
    triggers: ['wind+fire','wind+water','wind+ice','wind+thunder',
               'fire+wind','water+wind','ice+wind','thunder+wind'],
    type: 'spread',
    multiSwirlMul: 0.35,               // 多敵人:擴散到最多 2 個
    bossSwirlMul: 0.45,                // 單體 boss
    bossExtendSec: 2,
    spreadStrengthMul: 0.65,
    cooldown: 3,
  },
  resonance: {                        // 岩 + 任一元素
    name: '共鳴',
    triggers: ['rock+*', '*+rock'],
    type: 'break_gauge',
    breakBase: 16,
    gaugeDelayBase: 0.10,
    gaugeDelayMul: 1.0,                // × reactionPower,clamp 0.10-0.18
    selfBreakReduce: 0.10,
    selfBreakDuration: 4,
    cooldown: 3,
  },
};

const ELEMENT_KEYS_E0 = ['fire','water','ice','thunder','wind','rock'];   // 6 元素(舊 9 砍 holy/chaos/dark)

function reactionScore(c){
  // 主 感知 / 副 精神 / 輔 技巧
  return eff(c,'感知')*0.50 + eff(c,'精神')*0.30 + eff(c,'技巧')*0.20;
}
function reactionPower(c){
  // 倍率 1.00-2.00
  const s = reactionScore(c);
  return 1 + s/(s+220) * 1.00;
}

/* ════════════════ §12 E5 兼容 stub(E6-2 戰鬥重寫時砍)════════════════
 * battle.js 仍 call 舊 derived 函式名(physScore / physPower / 9 sense / 9 resist 等),
 * stub 用新 8 屬性近似舊行為,讓 _calcPhysDmg / _calcMagicDmg 仍能跑出合理數字。
 *
 * 5 合 1 stub 採「對齊中等配點」:N 軸合 1 → 係數加總 / N
 *   舊「靈力/理智/專注/意志/親和」(magicScore 4 軸)→ 新「精神」(0.0775 加總/4)
 *
 * 9 sense / 9 resist 全砍,stub 回常數中性值(中等配點水準)。
 * critRate 留舊公式 stub 釘住 E5 1F 平衡(critRateE0 是新版,§4)。
 * ════════════════════════════════════════════════ */

// 5 個 score(stub 內部 helper,被 mastery / power 用)
function physScore(c){
  return eff(c,'力量')*3.6 + eff(c,'技巧')*1.8 + eff(c,'敏捷')*0.9 + eff(c,'感知')*0.5;
}
function magicScore(c){
  // 4 軸合 1:理智(3.6)+靈力(1.7)+專注(1.3)+親和(0.5) = 7.1, /4 = 1.775
  return eff(c,'精神')*1.775 + eff(c,'感知')*0.5;
}
function bluntScore(c){
  // 2 軸合 1:理智(0.7)+靈力(0.4) = 1.1, /2 = 0.55
  return eff(c,'力量')*2.8 + eff(c,'耐力')*1.6 + eff(c,'反應')*1.0 + eff(c,'精神')*0.55;
}
function slashScore(c){
  // 2 軸合 1:理智(0.7)+專注(0.7) = 1.4, /2 = 0.70
  return eff(c,'技巧')*2.8 + eff(c,'敏捷')*1.6 + eff(c,'力量')*0.9 + eff(c,'精神')*0.70;
}
function pierceScore(c){
  // 2 軸合 1:專注(1.5)+理智(0.8) = 2.3, /2 = 1.15
  return eff(c,'感知')*2.6 + eff(c,'技巧')*1.9 + eff(c,'精神')*1.15 + eff(c,'力量')*0.4;
}

// 5 個 mastery / power(沿用舊公式)
function physPower(c){const s=physScore(c); return 1 + s/(s+320);}
function magicPower(c){const s=magicScore(c); return 1 + s/(s+280);}
function bluntMastery(c){const s=bluntScore(c); return 1 + s/(s+520);}
function slashMastery(c){const s=slashScore(c); return 1 + s/(s+700);}
function pierceMastery(c){const s=pierceScore(c); return 1 + s/(s+850);}

// penetration(舊「理智」→精神)
function penetration(c){
  const raw = eff(c,'力量')*0.10 + eff(c,'感知')*0.10 + eff(c,'精神')*0.05;
  return softHard(raw, 30, 50, 0.5);
}

// physDef / magicDef(舊公式直翻 + 5 合 1)
function physDef(c){
  // 舊「體魄」→耐力,「肉體抗性」→抗性,「意志」→精神(1 軸,係數不變)
  const raw = eff(c,'耐力')*0.14 + eff(c,'抗性')*0.10 + eff(c,'精神')*0.07 + eff(c,'反應')*0.04;
  return softHard(raw, 35, 60, 0.4);
}
function magicDef(c){
  // 4 軸合 1:意志(0.12)+專注(0.09)+親和(0.06)+理智(0.04) = 0.31, /4 = 0.0775
  // 舊「肉體抗性」(0.07) → 抗性(係數不變)
  const raw = eff(c,'精神')*0.0775 + eff(c,'抗性')*0.07;
  return softHard(raw, 35, 60, 0.4);
}

// regenMul(3 軸合 1:靈力(0.005)+專注(0.005)+意志(0.003) = 0.013, /3 ≈ 0.0043;舊「體魄」→耐力)
function regenMul(c){return 1 + eff(c,'精神')*0.0043 + eff(c,'耐力')*0.003;}

// critRate stub:舊公式釘 E5 1F 平衡(舊「專注」→精神;新版是 critRateE0)
function critRate(c){
  const raw = 5 + eff(c,'技巧')*0.16 + eff(c,'感知')*0.14
                + eff(c,'敏捷')*0.07 + eff(c,'精神')*0.04;
  return softHard(raw, 45, 70, 0.5);
}

// 9 元素 sense / resist:全砍,stub 回中等配點水準常數
// 舊滿配 sense ≈ 軟 60,中等 30-50;舊滿配 resist ≈ 軟 35,中等 15-25
function fireSense(c){return 30;}
function waterSense(c){return 30;}
function iceSense(c){return 30;}
function thunderSense(c){return 30;}
function windSense(c){return 30;}
function rockSense(c){return 30;}
function holySense(c){return 30;}
function chaosSense(c){return 30;}
function darkSense(c){return 30;}
function fireResist(c){return 20;}
function waterResist(c){return 20;}
function iceResist(c){return 20;}
function thunderResist(c){return 20;}
function windResist(c){return 20;}
function rockResist(c){return 20;}
function holyResist(c){return 20;}
function chaosResist(c){return 20;}
function darkResist(c){return 20;}

/* ════════════════ §13 DERIVED_DEFS(玩家面板顯示新衍生值)════════════════
 * stub 27 個不上 DERIVED_DEFS — 玩家面板不會看到 physScore / fireSense 等死碼。
 * critRate key 指向 critRateE0(新公式給玩家看,stub critRate 給 battle.js)。
 * critExpected 不上(stub vs 新版數字不一致,過渡期避免玩家困惑)。
 * ════════════════════════════════════════════════ */
const DERIVED_DEFS = {
  // §2 基礎資源
  maxHp:                 {label:'最大 HP',        fn:maxHp,                 kind:'flat'},
  maxStamina:            {label:'最大體力',       fn:maxStamina,            kind:'flat'},
  staminaGainOnAction:   {label:'行動回體力',     fn:staminaGainOnAction,   kind:'flat'},
  maxSpirit:             {label:'最大靈力',       fn:maxSpirit,             kind:'flat'},
  spiritGainOnReaction:  {label:'反應回靈力',     fn:spiritGainOnReaction,  kind:'flat'},
  // §3 行動 / 普攻
  actionSpeed:           {label:'行動速度',       fn:actionSpeed,           kind:'mult'},
  autoAttackDamage:      {label:'普攻傷害倍率',   fn:autoAttackDamage,      kind:'mult'},
  hitRate:               {label:'命中率',         fn:hitRate,               kind:'pct'},
  evasionRate:           {label:'迴避率',         fn:evasionRate,           kind:'pct'},
  // §4 暴擊(critRate 指向 critRateE0;critExpected 不上)
  critRate:              {label:'暴擊率',         fn:critRateE0,            kind:'pct'},
  critDamage:            {label:'暴擊傷害',       fn:critDamage,            kind:'pct'},
  // §5 破勢
  breakDamage:           {label:'破勢傷害倍率',   fn:breakDamage,           kind:'mult'},
  maxBreak:              {label:'最大破勢',       fn:maxBreak,              kind:'flat'},
  incomingBreakTaken:    {label:'破勢承受倍率',   fn:incomingBreakTaken,    kind:'mult'},
  collapseDamage:        {label:'崩潰傷害倍率',   fn:collapseDamage,        kind:'mult'},
  // §6 被動格擋反擊
  guardRate:             {label:'格擋率',         fn:guardRate,             kind:'pct'},
  perfectGuardRate:      {label:'精準格擋率',     fn:perfectGuardRate,      kind:'pct'},
  counterRate:           {label:'反擊率',         fn:counterRate,           kind:'pct'},
  counterDamage:         {label:'反擊傷害倍率',   fn:counterDamage,         kind:'mult'},
  counterBreak:          {label:'反擊破勢倍率',   fn:counterBreak,          kind:'mult'},
  // §7 連擊
  comboRate:             {label:'連擊率',         fn:comboRate,             kind:'pct'},
  comboHits:             {label:'連擊段數',       fn:comboHits,             kind:'flat'},
  comboDamagePerHit:     {label:'連擊每段倍率',   fn:comboDamagePerHit,     kind:'mult'},
  comboStaminaGain:      {label:'連擊回體力',     fn:comboStaminaGain,      kind:'flat'},
  // §8 劍技 / 元素技配套
  swordSkillDamage:      {label:'劍技傷害倍率',   fn:swordSkillDamage,      kind:'mult'},
  swordSkillBreak:       {label:'劍技破勢倍率',   fn:swordSkillBreak,       kind:'mult'},
  staminaCostMul:        {label:'體力消耗倍率',   fn:staminaCostMul,        kind:'mult'},
  elementSkillDamage:    {label:'元素技傷害倍率', fn:elementSkillDamage,    kind:'mult'},
  auraStrength:          {label:'附著強度倍率',   fn:auraStrength,          kind:'mult'},
  spiritCostMul:         {label:'靈力消耗倍率',   fn:spiritCostMul,         kind:'mult'},
  // §9 防禦抗性
  physMitigation:        {label:'物理減傷',       fn:physMitigation,        kind:'mult'},
  elementMitigation:     {label:'元素減傷',       fn:elementMitigation,     kind:'mult'},
  statusResist:          {label:'異常抵抗',       fn:statusResist,          kind:'mult'},
  // §10 攻擊條
  playerPressureMod:     {label:'攻擊條壓制',     fn:playerPressureMod,     kind:'mult'},
  gaugeDelayAmount:      {label:'技能延遲倍率',   fn:gaugeDelayAmount,      kind:'mult'},
};

/* ════════════════ §14 ATTR_INFLUENCES(8 屬性 → 影響的衍生值)════════════════
 * 從 §13 的衍生值反查每屬性出現在哪些(主/副/輔皆算)。
 * 給 character.js 子屬性頁(subAttrView)顯示用。stub 衍生值不上(玩家不看)。
 * ════════════════════════════════════════════════ */
const ATTR_INFLUENCES = {
  '力量':[
    'maxHp','autoAttackDamage','critDamage','breakDamage',
    'counterDamage','counterBreak','swordSkillDamage','swordSkillBreak',
    'physMitigation',
  ],  // 9
  '技巧':[
    'actionSpeed','autoAttackDamage','hitRate','critRate','critDamage',
    'breakDamage','perfectGuardRate','counterRate','counterDamage','counterBreak',
    'comboRate','comboHits','comboDamagePerHit','comboStaminaGain',
    'swordSkillDamage','swordSkillBreak','staminaCostMul','elementSkillDamage',
    'gaugeDelayAmount',
  ],  // 19
  '敏捷':[
    'maxStamina','staminaGainOnAction','actionSpeed','autoAttackDamage',
    'hitRate','evasionRate','critRate',
    'comboRate','comboHits','comboDamagePerHit','comboStaminaGain',
    'staminaCostMul','playerPressureMod',
  ],  // 13
  '反應':[
    'maxStamina','staminaGainOnAction','actionSpeed','evasionRate',
    'breakDamage','maxBreak','incomingBreakTaken','collapseDamage',
    'guardRate','perfectGuardRate','counterRate','counterDamage','counterBreak',
    'swordSkillDamage','swordSkillBreak','playerPressureMod','gaugeDelayAmount',
  ],  // 17
  '耐力':[
    'maxHp','maxStamina','staminaGainOnAction',
    'maxBreak','incomingBreakTaken','collapseDamage','guardRate',
    'staminaCostMul','physMitigation','elementMitigation',
  ],  // 10
  '抗性':[
    'maxHp','maxSpirit','spiritGainOnReaction',
    'maxBreak','incomingBreakTaken','collapseDamage','guardRate',
    'auraStrength','spiritCostMul',
    'physMitigation','elementMitigation','statusResist',
  ],  // 12
  '精神':[
    'maxSpirit','spiritGainOnReaction',
    'elementSkillDamage','auraStrength','spiritCostMul',
    'elementMitigation','statusResist',
  ],  // 7
  '感知':[
    'maxSpirit','spiritGainOnReaction',
    'hitRate','evasionRate','critRate','critDamage',
    'perfectGuardRate',
    'comboRate','comboHits','comboDamagePerHit','comboStaminaGain',
    'elementSkillDamage','auraStrength','spiritCostMul','statusResist',
    'playerPressureMod','gaugeDelayAmount',
  ],  // 17
};

/* ════════════════ §15 render helper(沿用 E3 版,區間配合新衍生值微調)════════════════ */
function fmtDerived(val, kind){
  if(kind === 'mult')  return val.toFixed(3) + '×';
  if(kind === 'pct')   return val.toFixed(1) + '%';
  if(kind === 'flat')  return Math.round(val) + '';
  if(kind === 'score') return Math.round(val) + '';
  return String(val);
}
function pctDerived(val, kind){
  if(kind === 'mult')  return Math.min(100, Math.max(0, (val-1)*100));
  if(kind === 'pct')   return Math.min(100, Math.max(0, val/60*100));
  if(kind === 'flat')  return Math.min(100, Math.max(0, val/200*100));
  if(kind === 'score') return Math.min(100, Math.max(0, val/800*100));
  return 0;
}
