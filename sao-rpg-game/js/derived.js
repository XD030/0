/* ========================================================================
 * derived.js — 衍生值計算函式群(E3)
 *
 * 純函式,無副作用。每個函式接收 character 物件 c,回傳衍生值(數字)。
 * 屬性使用「有效值」(§0):0-60 1:1,61-80 ×0.6,81-100 ×0.3。
 *
 * Load order:state.js → derived.js → wordlist.js → items.js → utils.js → ...
 * derived.js 不依賴 wordlist/items/utils,只需要 ATTRS 等(state.js)。
 *
 * DERIVED_DEFS:每個衍生值的 {label, fn, kind} 描述,給 character.js 子屬性頁 render
 * ATTR_INFLUENCES:每個主屬性 → 它影響的衍生值 key 列表
 * fmtDerived / pctDerived:render helper
 *
 * 公式來源:能力值表 v2(交叉依賴版,土屬性已改岩屬性)
 * ======================================================================== */

/* ════════════════ §0 有效值換算 ════════════════ */
function effectiveAttr(raw){
  raw = raw||0;
  if(raw <= 60) return raw;
  if(raw <= 80) return 60 + (raw - 60) * 0.6;
  return 72 + (Math.min(raw, 100) - 80) * 0.3;
}
function eff(c, attr){return effectiveAttr(c[attr]||0);}

/* ════════════════ helper:軟硬上限 / 純夾 ════════════════ */
function softCap(raw, soft, hard, retain){
  if(raw <= soft) return Math.max(0, raw);
  return Math.min(hard, soft + (raw - soft) * retain);
}
function clamp(val, min, max){return Math.max(min, Math.min(max, val));}

/* ════════════════ §3 核心分數 ════════════════ */
function physScore(c){
  return eff(c,'力量')*3.6 + eff(c,'技巧')*1.8 + eff(c,'敏捷')*0.9 + eff(c,'感知')*0.5;
}
function magicScore(c){
  return eff(c,'理智')*3.6 + eff(c,'靈力')*1.7 + eff(c,'專注')*1.3 + eff(c,'親和')*0.5;
}
function bluntScore(c){
  return eff(c,'力量')*2.8 + eff(c,'體魄')*1.6 + eff(c,'反應')*1.0 + eff(c,'理智')*0.7 + eff(c,'靈力')*0.4;
}
function slashScore(c){
  return eff(c,'技巧')*2.8 + eff(c,'敏捷')*1.6 + eff(c,'力量')*0.9 + eff(c,'理智')*0.7 + eff(c,'專注')*0.7;
}
function pierceScore(c){
  return eff(c,'感知')*2.6 + eff(c,'技巧')*1.9 + eff(c,'專注')*1.5 + eff(c,'理智')*0.8 + eff(c,'力量')*0.4;
}

/* ════════════════ §4 威力倍率 ════════════════ */
function physPower(c){const s=physScore(c); return 1 + s/(s+320);}
function magicPower(c){const s=magicScore(c); return 1 + s/(s+280);}
function bluntMastery(c){const s=bluntScore(c); return 1 + s/(s+520);}
function slashMastery(c){const s=slashScore(c); return 1 + s/(s+700);}
function pierceMastery(c){const s=pierceScore(c); return 1 + s/(s+850);}

/* ════════════════ §5 暴擊 ════════════════ */
function critRate(c){
  const raw = 5 + eff(c,'技巧')*0.16 + eff(c,'感知')*0.14 + eff(c,'敏捷')*0.07 + eff(c,'專注')*0.04;
  return softCap(raw, 45, 70, 0.5);
}
function critDamageScore(c){
  return eff(c,'力量')*3.5 + eff(c,'專注')*2.0 + eff(c,'技巧')*1.2 + eff(c,'感知')*0.8;
}
function critDamage(c){
  const s = critDamageScore(c);
  const raw = 150 + 100 * s/(s+550);
  return softCap(raw, 220, 280, 0.5);
}
function critExpected(c){
  return 1 + (critRate(c)/100) * (critDamage(c)/100 - 1);
}

/* ════════════════ §6 穿透 ════════════════ */
function penetration(c){
  const raw = eff(c,'力量')*0.10 + eff(c,'理智')*0.10 + eff(c,'感知')*0.10 + eff(c,'專注')*0.05;
  return softCap(raw, 30, 50, 0.5);
}

/* ════════════════ §7 HP / MP / 資源 ════════════════ */
function hpMul(c){
  return 1 + eff(c,'體魄')*0.011 + eff(c,'意志')*0.004 + eff(c,'肉體抗性')*0.004 + eff(c,'力量')*0.002;
}
function mpMul(c){
  return 1 + eff(c,'靈力')*0.011 + eff(c,'理智')*0.004 + eff(c,'專注')*0.004 + eff(c,'親和')*0.002;
}
function regenMul(c){
  return 1 + eff(c,'靈力')*0.005 + eff(c,'專注')*0.005 + eff(c,'體魄')*0.003 + eff(c,'意志')*0.003;
}

/* ════════════════ §8 防護 ════════════════ */
function physDef(c){
  const raw = eff(c,'體魄')*0.14 + eff(c,'肉體抗性')*0.10 + eff(c,'意志')*0.07 + eff(c,'反應')*0.04;
  return softCap(raw, 35, 60, 0.4);
}
function magicDef(c){
  const raw = eff(c,'意志')*0.12 + eff(c,'專注')*0.09 + eff(c,'肉體抗性')*0.07 + eff(c,'親和')*0.06 + eff(c,'理智')*0.04;
  return softCap(raw, 35, 60, 0.4);
}

/* ════════════════ §9 肉體值 / 精神值 ════════════════ */
function bodyVal(c){
  return eff(c,'體魄')*1.3 + eff(c,'肉體抗性')*1.2 + eff(c,'意志')*0.6 + eff(c,'力量')*0.35 + eff(c,'反應')*0.25;
}
function mindVal(c){
  return eff(c,'意志')*1.3 + eff(c,'專注')*1.0 + eff(c,'親和')*0.8 + eff(c,'理智')*0.5 + eff(c,'感知')*0.3;
}

/* ════════════════ §10 異常 ════════════════ */
function statusApply(c){
  const raw = 10 + eff(c,'親和')*0.20 + eff(c,'感知')*0.14 + eff(c,'專注')*0.12 + eff(c,'理智')*0.05;
  return softCap(raw, 55, 85, 0.5);
}
function statusResist(c){
  const raw = eff(c,'肉體抗性')*0.16 + eff(c,'意志')*0.14 + eff(c,'親和')*0.08 + eff(c,'專注')*0.05;
  return softCap(raw, 45, 75, 0.5);
}

/* ════════════════ §11 行動 / 命中 / 迴避 ════════════════ */
function actSpeed(c){
  const raw = eff(c,'敏捷')*0.42 + eff(c,'反應')*0.32 + eff(c,'感知')*0.20 + eff(c,'專注')*0.06;
  return softCap(raw, 60, 120, 0.5);
}
function hitRate(c){
  const v = 85 + eff(c,'技巧')*0.11 + eff(c,'感知')*0.11 + eff(c,'專注')*0.07 + eff(c,'敏捷')*0.03;
  return clamp(v, 40, 98);
}
function magicHit(c){
  const v = 85 + eff(c,'專注')*0.12 + eff(c,'理智')*0.09 + eff(c,'感知')*0.08 + eff(c,'親和')*0.04;
  return clamp(v, 40, 98);
}
function evasion(c){
  const raw = eff(c,'反應')*0.15 + eff(c,'敏捷')*0.09 + eff(c,'感知')*0.06 + eff(c,'專注')*0.03;
  return softCap(raw, 35, 60, 0.5);
}

/* ════════════════ §12 詠唱效率 ════════════════ */
function castEff(c){
  const raw = eff(c,'專注')*0.15 + eff(c,'理智')*0.08 + eff(c,'靈力')*0.07 + eff(c,'意志')*0.04;
  return softCap(raw, 60, 100, 0.5);
}

/* ════════════════ §14 無屬性耐性 ════════════════ */
function neutralSource(c){
  return eff(c,'體魄')*0.8 + eff(c,'肉體抗性')*0.6 + eff(c,'反應')*0.3;
}
function neutralResist(c){
  const raw = neutralSource(c) / 3.2;
  return softCap(raw, 35, 50, 0.5);
}

/* ════════════════ §15 元素感應 / 抵抗 ════════════════
 * 9 元素:火/水/冰/雷/風/岩/神聖/混沌/黑暗
 * 感應 = 感應分數 × 0.45 → 軟 60 / 硬 120 / 過軟 50%
 * 抵抗:每元素獨特公式 → 軟 35 / 硬 50 / 過軟 50%
 * ════════════════════════════════════════════════ */

// helper:每元素特有「耐性 / 適應」分數
function _heatTol(c){return eff(c,'體魄')*0.70 + eff(c,'肉體抗性')*0.70 + eff(c,'意志')*0.25 + eff(c,'靈力')*0.10;}
function _coldTol(c){return eff(c,'體魄')*0.60 + eff(c,'肉體抗性')*0.70 + eff(c,'專注')*0.35 + eff(c,'意志')*0.15;}
function _shockTol(c){return eff(c,'肉體抗性')*0.60 + eff(c,'反應')*0.55 + eff(c,'專注')*0.30 + eff(c,'體魄')*0.15;}
function _fluidAdapt(c){return eff(c,'靈力')*0.50 + eff(c,'意志')*0.35 + eff(c,'肉體抗性')*0.25 + eff(c,'反應')*0.15;}
function _mindTol(c){return eff(c,'意志')*0.75 + eff(c,'專注')*0.45 + eff(c,'親和')*0.25 + eff(c,'理智')*0.15;}
function _mindStable(c){return eff(c,'意志')*0.50 + eff(c,'理智')*0.55 + eff(c,'親和')*0.35 + eff(c,'專注')*0.20;}

// 感應分數
function _fireSenseScore(c){return eff(c,'親和')*0.75 + eff(c,'理智')*0.50 + eff(c,'靈力')*0.30 + eff(c,'專注')*0.10;}
function _waterSenseScore(c){return eff(c,'親和')*0.70 + eff(c,'靈力')*0.55 + eff(c,'意志')*0.20 + eff(c,'專注')*0.15;}
function _iceSenseScore(c){return eff(c,'親和')*0.70 + eff(c,'理智')*0.45 + eff(c,'專注')*0.35 + eff(c,'靈力')*0.15;}
function _thunderSenseScore(c){return eff(c,'親和')*0.60 + eff(c,'專注')*0.55 + eff(c,'反應')*0.25 + eff(c,'理智')*0.20;}
function _windSenseScore(c){return eff(c,'親和')*0.55 + eff(c,'敏捷')*0.45 + eff(c,'感知')*0.35 + eff(c,'反應')*0.20;}
function _rockSenseScore(c){return eff(c,'親和')*0.50 + eff(c,'體魄')*0.50 + eff(c,'力量')*0.30 + eff(c,'意志')*0.20;}
function _holySenseScore(c){return eff(c,'親和')*0.65 + eff(c,'意志')*0.55 + eff(c,'理智')*0.35 + eff(c,'專注')*0.20;}
function _chaosSenseScore(c){return eff(c,'親和')*0.75 + eff(c,'理智')*0.45 + eff(c,'感知')*0.30 + eff(c,'意志')*0.15;}
function _darkSenseScore(c){return eff(c,'親和')*0.65 + eff(c,'意志')*0.45 + eff(c,'感知')*0.40 + eff(c,'理智')*0.15;}

// 抵抗分數
function _fireResistScore(c){return eff(c,'肉體抗性')*0.75 + eff(c,'體魄')*0.50 + eff(c,'意志')*0.25 + eff(c,'親和')*0.10;}
function _waterResistScore(c){return eff(c,'肉體抗性')*0.60 + eff(c,'意志')*0.45 + eff(c,'靈力')*0.30 + eff(c,'親和')*0.15;}
function _iceResistScore(c){return eff(c,'肉體抗性')*0.70 + eff(c,'體魄')*0.45 + eff(c,'專注')*0.30 + eff(c,'意志')*0.15;}
function _thunderResistScore(c){return eff(c,'肉體抗性')*0.60 + eff(c,'反應')*0.50 + eff(c,'專注')*0.25 + eff(c,'意志')*0.15;}
function _windResistScore(c){return eff(c,'肉體抗性')*0.50 + eff(c,'敏捷')*0.40 + eff(c,'反應')*0.35 + eff(c,'感知')*0.15;}
function _rockResistScore(c){return eff(c,'肉體抗性')*0.50 + eff(c,'體魄')*0.55 + eff(c,'力量')*0.25 + eff(c,'意志')*0.20;}
function _holyResistScore(c){return eff(c,'意志')*0.70 + eff(c,'親和')*0.45 + eff(c,'肉體抗性')*0.20 + eff(c,'理智')*0.15;}
function _chaosResistScore(c){return eff(c,'意志')*0.50 + eff(c,'理智')*0.50 + eff(c,'親和')*0.35 + eff(c,'專注')*0.20;}
function _darkResistScore(c){return eff(c,'意志')*0.60 + eff(c,'親和')*0.45 + eff(c,'感知')*0.25 + eff(c,'專注')*0.20;}

// 元素感應(對外)
function fireSense(c){return softCap(_fireSenseScore(c)*0.45, 60, 120, 0.5);}
function waterSense(c){return softCap(_waterSenseScore(c)*0.45, 60, 120, 0.5);}
function iceSense(c){return softCap(_iceSenseScore(c)*0.45, 60, 120, 0.5);}
function thunderSense(c){return softCap(_thunderSenseScore(c)*0.45, 60, 120, 0.5);}
function windSense(c){return softCap(_windSenseScore(c)*0.45, 60, 120, 0.5);}
function rockSense(c){return softCap(_rockSenseScore(c)*0.45, 60, 120, 0.5);}
function holySense(c){return softCap(_holySenseScore(c)*0.45, 60, 120, 0.5);}
function chaosSense(c){return softCap(_chaosSenseScore(c)*0.45, 60, 120, 0.5);}
function darkSense(c){return softCap(_darkSenseScore(c)*0.45, 60, 120, 0.5);}

// 元素抵抗(對外)
function fireResist(c){
  const raw = (0.60*_fireResistScore(c) + 0.05*_fireSenseScore(c) + 0.35*_heatTol(c)) / 3.0;
  return softCap(raw, 35, 50, 0.5);
}
function waterResist(c){
  const raw = (0.65*_waterResistScore(c) + 0.15*_waterSenseScore(c) + 0.20*_fluidAdapt(c)) / 3.2;
  return softCap(raw, 35, 50, 0.5);
}
function iceResist(c){
  const raw = (0.60*_iceResistScore(c) + 0.05*_iceSenseScore(c) + 0.35*_coldTol(c)) / 3.0;
  return softCap(raw, 35, 50, 0.5);
}
function thunderResist(c){
  const raw = (0.60*_thunderResistScore(c) + 0.05*_thunderSenseScore(c) + 0.35*_shockTol(c)) / 3.0;
  return softCap(raw, 35, 50, 0.5);
}
function windResist(c){
  const raw = (0.60*_windResistScore(c) + 0.05*_windSenseScore(c) + 0.30*neutralSource(c)) / 3.2;
  return softCap(raw, 35, 50, 0.5);
}
function rockResist(c){
  const raw = (0.60*_rockResistScore(c) + 0.05*_rockSenseScore(c) + 0.30*neutralSource(c)) / 3.2;
  return softCap(raw, 35, 50, 0.5);
}
function holyResist(c){
  const raw = (0.50*_holyResistScore(c) + 0.25*_holySenseScore(c) + 0.25*_mindTol(c)) / 3.0;
  return softCap(raw, 35, 50, 0.5);
}
function chaosResist(c){
  const raw = (0.50*_chaosResistScore(c) + 0.20*_chaosSenseScore(c) + 0.30*_mindStable(c)) / 3.2;
  return softCap(raw, 35, 50, 0.5);
}
function darkResist(c){
  const raw = (0.50*_darkResistScore(c) + 0.20*_darkSenseScore(c) + 0.30*_mindTol(c)) / 3.0;
  return softCap(raw, 35, 50, 0.5);
}

/* ════════════════ DERIVED_DEFS ════════════════ */
const DERIVED_DEFS = {
  physScore:    {label:'物理分數',     fn:physScore,     kind:'score'},
  magicScore:   {label:'法術分數',     fn:magicScore,    kind:'score'},
  bluntScore:   {label:'擊打分數',     fn:bluntScore,    kind:'score'},
  slashScore:   {label:'切割分數',     fn:slashScore,    kind:'score'},
  pierceScore:  {label:'貫穿分數',     fn:pierceScore,   kind:'score'},
  physPower:    {label:'物理威力',     fn:physPower,     kind:'mult'},
  magicPower:   {label:'法術威力',     fn:magicPower,    kind:'mult'},
  bluntMastery: {label:'擊打熟練',     fn:bluntMastery,  kind:'mult'},
  slashMastery: {label:'切割熟練',     fn:slashMastery,  kind:'mult'},
  pierceMastery:{label:'貫穿熟練',     fn:pierceMastery, kind:'mult'},
  critRate:     {label:'暴擊率',       fn:critRate,      kind:'pct'},
  critDamage:   {label:'暴擊傷害',     fn:critDamage,    kind:'pct'},
  critExpected: {label:'暴擊期望倍率', fn:critExpected,  kind:'mult'},
  penetration:  {label:'穿透',         fn:penetration,   kind:'pct'},
  hpMul:        {label:'最大 HP 倍率', fn:hpMul,         kind:'mult'},
  mpMul:        {label:'最大 MP 倍率', fn:mpMul,         kind:'mult'},
  regenMul:     {label:'資源回復倍率', fn:regenMul,      kind:'mult'},
  physDef:      {label:'物理防護',     fn:physDef,       kind:'pct'},
  magicDef:     {label:'法術防護',     fn:magicDef,      kind:'pct'},
  bodyVal:      {label:'肉體值',       fn:bodyVal,       kind:'flat'},
  mindVal:      {label:'精神值',       fn:mindVal,       kind:'flat'},
  statusApply:  {label:'異常附加率',   fn:statusApply,   kind:'pct'},
  statusResist: {label:'異常抵抗率',   fn:statusResist,  kind:'pct'},
  actSpeed:     {label:'行動速度',     fn:actSpeed,      kind:'pct'},
  hitRate:      {label:'命中率',       fn:hitRate,       kind:'pct'},
  magicHit:     {label:'法術命中',     fn:magicHit,      kind:'pct'},
  evasion:      {label:'迴避 / 反擊',  fn:evasion,       kind:'pct'},
  castEff:      {label:'詠唱效率',     fn:castEff,       kind:'pct'},
  neutralResist:{label:'無屬性耐性',   fn:neutralResist, kind:'pct'},
  fireSense:    {label:'火屬性感應',   fn:fireSense,     kind:'pct'},
  waterSense:   {label:'水屬性感應',   fn:waterSense,    kind:'pct'},
  iceSense:     {label:'冰屬性感應',   fn:iceSense,      kind:'pct'},
  thunderSense: {label:'雷屬性感應',   fn:thunderSense,  kind:'pct'},
  windSense:    {label:'風屬性感應',   fn:windSense,     kind:'pct'},
  rockSense:    {label:'岩屬性感應',   fn:rockSense,     kind:'pct'},
  holySense:    {label:'神聖感應',     fn:holySense,     kind:'pct'},
  chaosSense:   {label:'混沌感應',     fn:chaosSense,    kind:'pct'},
  darkSense:    {label:'黑暗感應',     fn:darkSense,     kind:'pct'},
  fireResist:   {label:'火屬性抵抗',   fn:fireResist,    kind:'pct'},
  waterResist:  {label:'水屬性抵抗',   fn:waterResist,   kind:'pct'},
  iceResist:    {label:'冰屬性抵抗',   fn:iceResist,     kind:'pct'},
  thunderResist:{label:'雷屬性抵抗',   fn:thunderResist, kind:'pct'},
  windResist:   {label:'風屬性抵抗',   fn:windResist,    kind:'pct'},
  rockResist:   {label:'岩屬性抵抗',   fn:rockResist,    kind:'pct'},
  holyResist:   {label:'神聖抵抗',     fn:holyResist,    kind:'pct'},
  chaosResist:  {label:'混沌抵抗',     fn:chaosResist,   kind:'pct'},
  darkResist:   {label:'黑暗抵抗',     fn:darkResist,    kind:'pct'},
};

/* ════════════════ ATTR_INFLUENCES ════════════════
 * 每個主屬性 → 它在新表公式中直接出現的衍生值列表
 * E3.5:元素 sense/resist 全部移到「元素」tab,這裡只留非元素衍生值(neutralResist 留下)
 */
const ATTR_INFLUENCES = {
  '力量':[
    'physScore','bluntScore','slashScore','pierceScore',
    'physPower','bluntMastery','slashMastery','pierceMastery',
    'critDamage','penetration',
    'hpMul','bodyVal',
  ],  // 12
  '敏捷':[
    'physScore','slashScore',
    'physPower','slashMastery',
    'critRate','actSpeed','hitRate','evasion',
  ],  // 8
  '反應':[
    'bluntScore','bluntMastery',
    'physDef','actSpeed','evasion',
    'bodyVal','neutralResist',
  ],  // 7
  '體魄':[
    'bluntScore','bluntMastery',
    'hpMul','regenMul','physDef','bodyVal','neutralResist',
  ],  // 7
  '技巧':[
    'physScore','slashScore','pierceScore',
    'physPower','slashMastery','pierceMastery',
    'critRate','critDamage','hitRate',
  ],  // 9
  '肉體抗性':[
    'physDef','magicDef','bodyVal','statusResist','neutralResist',
  ],  // 5
  '靈力':[
    'magicScore','bluntScore',
    'magicPower','bluntMastery',
    'mpMul','regenMul','castEff',
  ],  // 7
  '理智':[
    'magicScore','bluntScore','slashScore','pierceScore',
    'magicPower','bluntMastery','slashMastery','pierceMastery',
    'penetration','mpMul','magicDef','magicHit','castEff',
  ],  // 13
  '專注':[
    'magicScore','slashScore','pierceScore',
    'magicPower','slashMastery','pierceMastery',
    'critRate','critDamage','penetration',
    'mpMul','regenMul','magicDef',
    'actSpeed','hitRate','magicHit','evasion','castEff',
    'statusApply','statusResist',
  ],  // 19
  '意志':[
    'hpMul','regenMul','physDef','magicDef','bodyVal','mindVal','statusResist','castEff',
  ],  // 8
  '感知':[
    'physScore','pierceScore',
    'physPower','pierceMastery',
    'critRate','critDamage','penetration',
    'hitRate','magicHit','evasion','actSpeed',
    'statusApply','mindVal',
  ],  // 13
  '親和':[
    'magicScore','magicPower',
    'mpMul','magicDef','magicHit','mindVal',
    'statusApply','statusResist',
  ],  // 8
};

/* ════════════════ ELEM_DETAIL ════════════════
 * 9 元素的細節頁 spec。每個元素有:
 *   label / color / sense (DERIVED_DEFS key) / resist (DERIVED_DEFS key)
 *   detail: 細節頁要列的中間值(只保留輔助耐性 — sense/resist 分數對最終效果權重小,
 *           列了反而干擾配點決策)
 * 元素 tab 主視圖會列 9 row(只顯示 sense + resist 最終值);
 * 點 row 進細節頁顯示 detail(輔助耐性)+ sense + resist 最終值
 */
const ELEM_DETAIL = {
  fire: {
    label:'火',     color:'#ff6644',
    sense:'fireSense',  resist:'fireResist',
    detail:[
      {label:'耐熱', fn:_heatTol, kind:'score'},
    ],
  },
  water: {
    label:'水',     color:'#4488ff',
    sense:'waterSense', resist:'waterResist',
    detail:[
      {label:'流體適應', fn:_fluidAdapt, kind:'score'},
    ],
  },
  ice: {
    label:'冰',     color:'#88ddff',
    sense:'iceSense',   resist:'iceResist',
    detail:[
      {label:'耐冰', fn:_coldTol, kind:'score'},
    ],
  },
  thunder: {
    label:'雷',     color:'#ffdd44',
    sense:'thunderSense', resist:'thunderResist',
    detail:[
      {label:'電擊耐性', fn:_shockTol, kind:'score'},
    ],
  },
  wind: {
    label:'風',     color:'#88ffaa',
    sense:'windSense',  resist:'windResist',
    detail:[
      {label:'無屬性耐性', fn:neutralSource, kind:'score'},
    ],
  },
  rock: {
    label:'岩',     color:'#aa7744',
    sense:'rockSense',  resist:'rockResist',
    detail:[
      {label:'無屬性耐性', fn:neutralSource, kind:'score'},
    ],
  },
  holy: {
    label:'神聖',   color:'#ffeecc',
    sense:'holySense',  resist:'holyResist',
    detail:[
      {label:'精神耐性', fn:_mindTol, kind:'score'},
    ],
  },
  chaos: {
    label:'混沌',   color:'#ff44ee',
    sense:'chaosSense', resist:'chaosResist',
    detail:[
      {label:'理智穩定', fn:_mindStable, kind:'score'},
    ],
  },
  dark: {
    label:'黑暗',   color:'#aa44dd',
    sense:'darkSense',  resist:'darkResist',
    detail:[
      {label:'精神耐性', fn:_mindTol, kind:'score'},
    ],
  },
};

const ELEM_KEYS = ['fire','water','ice','thunder','wind','rock','holy','chaos','dark'];

/* ════════════════ render helper(給 character.js 用) ════════════════ */
// 衍生值依 kind 轉顯示字串
function fmtDerived(val, kind){
  if(kind === 'mult')  return val.toFixed(3) + '×';
  if(kind === 'pct')   return val.toFixed(1) + '%';
  if(kind === 'flat')  return Math.round(val) + '';
  if(kind === 'score') return Math.round(val) + '';
  return String(val);
}
// 衍生值依 kind 算進度條長度(0~100%);等戰鬥公式接通有實際區間後,E5 再調 normalize 基準
function pctDerived(val, kind){
  if(kind === 'mult')  return Math.min(100, Math.max(0, (val-1)*100));
  if(kind === 'pct')   return Math.min(100, Math.max(0, val/60*100));
  if(kind === 'flat')  return Math.min(100, Math.max(0, val/200*100));
  if(kind === 'score') return Math.min(100, Math.max(0, val/800*100));
  return 0;
}
