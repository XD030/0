/* ========================================================================
 * wordlist.js — 命名加成詞庫 (Task B)
 *
 * 每個詞 {word, tags}
 *   - word: 單一中文字
 *   - tags: 該詞屬於的意境 tag 陣列 (用於生成「暗牌提示」,不參與命中)
 *
 * 命中規則:嚴格逐字比對 craftNamingRule.goodWords / badWords (純字串列表)。
 * tag 只用於每天生成「今日意境偏向【XX】、避免【YY】」的提示,
 * 玩家命名打到 tag 內、但今日沒抽中的字 → 不命中。
 *
 * USER EDITABLE:加減字直接改下方 NAMING_GOOD_WORDS / NAMING_BAD_WORDS。
 * 加新 tag 要同步在 NAMING_TAG_HINTS 加描述 (給 hint 顯示用)。
 *
 * 載入順序:storage → state → wordlist → items → utils → ...
 * 本檔不依賴任何其他 module(只定義常數)。
 * ======================================================================== */

const NAMING_GOOD_WORDS = [
  // ── 神聖 ──
  {word:'神', tags:['神聖','傳奇']},
  {word:'聖', tags:['神聖']},
  {word:'光', tags:['神聖','元素']},
  {word:'輝', tags:['神聖']},
  {word:'耀', tags:['神聖','威嚴']},
  {word:'朗', tags:['神聖']},
  {word:'淨', tags:['神聖']},
  {word:'真', tags:['神聖','傳奇']},
  {word:'仁', tags:['神聖']},
  // ── 威嚴 ──
  {word:'王', tags:['威嚴','傳奇']},
  {word:'帝', tags:['威嚴']},
  {word:'皇', tags:['威嚴']},
  {word:'君', tags:['威嚴']},
  {word:'霸', tags:['威嚴','戰鬥']},
  {word:'雄', tags:['威嚴']},
  {word:'尊', tags:['威嚴']},
  {word:'統', tags:['威嚴']},
  {word:'御', tags:['威嚴']},
  // ── 戰鬥 ──
  {word:'戰', tags:['戰鬥']},
  {word:'武', tags:['戰鬥']},
  {word:'鋒', tags:['戰鬥','古典']},
  {word:'銳', tags:['戰鬥']},
  {word:'刃', tags:['戰鬥']},
  {word:'劍', tags:['戰鬥','古典']},
  {word:'槍', tags:['戰鬥']},
  {word:'戈', tags:['戰鬥','古典']},
  // ── 暗黑 ──
  {word:'暗', tags:['暗黑','元素']},
  {word:'影', tags:['暗黑']},
  {word:'夜', tags:['暗黑']},
  {word:'闇', tags:['暗黑']},
  {word:'冥', tags:['暗黑']},
  {word:'幽', tags:['暗黑']},
  {word:'幻', tags:['暗黑','傳奇']},
  // ── 速度 ──
  {word:'迅', tags:['速度']},
  {word:'疾', tags:['速度']},
  {word:'飛', tags:['速度']},
  {word:'翔', tags:['速度','凶猛']},
  {word:'翼', tags:['速度','凶猛']},
  {word:'馳', tags:['速度']},
  {word:'流', tags:['速度']},
  // ── 元素 ──
  {word:'焰', tags:['元素']},
  {word:'火', tags:['元素']},
  {word:'炎', tags:['元素']},
  {word:'雷', tags:['元素']},
  {word:'霜', tags:['元素']},
  {word:'冰', tags:['元素']},
  {word:'風', tags:['元素','速度']},
  {word:'雪', tags:['元素']},
  {word:'露', tags:['元素','自然']},
  // ── 傳奇 ──
  {word:'古', tags:['傳奇','古典']},
  {word:'玄', tags:['傳奇','暗黑']},
  {word:'秘', tags:['傳奇']},
  {word:'始', tags:['傳奇']},
  {word:'永', tags:['傳奇']},
  {word:'元', tags:['傳奇','古典']},
  {word:'奇', tags:['傳奇']},
  // ── 自然 ──
  {word:'山', tags:['自然']},
  {word:'林', tags:['自然']},
  {word:'海', tags:['自然']},
  {word:'河', tags:['自然']},
  {word:'月', tags:['自然']},
  {word:'星', tags:['自然']},
  {word:'晨', tags:['自然']},
  {word:'夢', tags:['自然','傳奇']},
  // ── 凶猛 ──
  {word:'龍', tags:['凶猛','傳奇','威嚴']},
  {word:'鳳', tags:['凶猛','傳奇']},
  {word:'虎', tags:['凶猛']},
  {word:'狼', tags:['凶猛']},
  {word:'獅', tags:['凶猛','威嚴']},
  {word:'鷹', tags:['凶猛','速度']},
  {word:'牙', tags:['凶猛','戰鬥']},
  {word:'爪', tags:['凶猛','戰鬥']},
  {word:'嘯', tags:['凶猛']},
  // ── 古典 ──
  {word:'之', tags:['古典']},
  {word:'韻', tags:['古典']},
  {word:'雅', tags:['古典']},
  {word:'麗', tags:['古典']},
  {word:'典', tags:['古典']},
  {word:'禮', tags:['古典']},
  {word:'詩', tags:['古典']},
];

const NAMING_BAD_WORDS = [
  // ── 朽壞 ──
  {word:'朽', tags:['朽壞']},
  {word:'腐', tags:['朽壞']},
  {word:'蝕', tags:['朽壞']},
  {word:'鏽', tags:['朽壞']},
  {word:'殘', tags:['朽壞','虛弱']},
  {word:'破', tags:['朽壞']},
  {word:'損', tags:['朽壞']},
  {word:'缺', tags:['朽壞']},
  // ── 虛弱 ──
  {word:'弱', tags:['虛弱']},
  {word:'空', tags:['虛弱']},
  {word:'虛', tags:['虛弱']},
  {word:'衰', tags:['虛弱','朽壞']},
  // ── 劣化 ──
  {word:'劣', tags:['劣化']},
  {word:'拙', tags:['劣化','拙劣']},
  {word:'粗', tags:['劣化']},
  {word:'鈍', tags:['劣化']},
  {word:'廢', tags:['劣化']},
  {word:'賤', tags:['劣化']},
  {word:'庸', tags:['劣化']},
  {word:'凡', tags:['劣化']},
  // ── 拙劣 ──
  {word:'偽', tags:['拙劣']},
  {word:'假', tags:['拙劣']},
  {word:'仿', tags:['拙劣']},
  {word:'冒', tags:['拙劣']},
];

// tag → 提示文字 (給暗牌 hint 用,描述意境家族而非列詞)
const NAMING_TAG_HINTS = {
  神聖: '光明、神性',
  威嚴: '帝王、王者氣息',
  戰鬥: '武者、利刃',
  暗黑: '影、夜、幽闇',
  速度: '迅捷、疾風',
  元素: '火、雷、風、霜',
  傳奇: '古老、神話',
  自然: '山川、生靈',
  凶猛: '猛獸、利齒',
  古典: '雅致、典雅',
  朽壞: '腐朽、廢墟',
  虛弱: '無力、空虛',
  劣化: '粗劣、低下',
  拙劣: '虛假、偽冒',
};
