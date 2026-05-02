# 如何新增物品

> 這是正向操作手冊。  
> 「不要踩雷」清單請看 [../CLAUDE.md](../CLAUDE.md)。

---

## TL;DR

**所有物品 def 都在 [`js/items.js`](../js/items.js) 一個檔。** 不要去 `market.js` / `shop.js` / `state.js` / `skills.js` 加(那些地方原本各有一份重複資料,Phase D 全刪掉了)。

加新武器/防具/素材/道具的步驟一律是:

1. 打開 `js/items.js`
2. 找對應 registry(`WEAPON_REGISTRY` / `ARMOR_REGISTRY` / `MATERIAL_REGISTRY` / `CONSUMABLE_REGISTRY`)
3. 新增一筆 entry,填好欄位
4. 想讓它在主市集上架 → `source` 含 `'market'`
5. 想讓它在地圖節點商店上架 → 還要去 `js/shop.js` 的 `SHOP_BUY_ITEMS` 加一筆 `{key, stock, price?}`(price 可選,沒寫就用 def 的 basePrice)
6. 不需要重新編譯,reload 瀏覽器即可

不會自動發生:
- bag 不會憑空長出物品(玩家要從市集 / shop / craft 取得)
- 既有玩家的存檔不會自動拿到新物品(要自己買 / 撿 / 製造)

---

## 1. 新增武器

### 欄位

```js
{
  key:         'iron_sword',     // 唯一識別碼,英文小寫底線。一旦 ship 就不要改(會破存檔)
  name:        '鐵劍',            // zh-TW 顯示名。同名 OK(同名不同 def 視為不同物品,例如 market vs shop 的兩種「鐵劍」)
  rarity:      'common',         // 'common'|'uncommon'|'rare'|'epic'|'legendary'
  weaponType:  'sword1',         // 必須是 WEAPON_TYPES 的 key(影響圖示、子分類過濾、craft 部位)
  baseDur:     8,                // 製造 / 購入時的耐久(integer)
  maxDur:      10,               // 最大耐久(integer)
  baseEnhance: 0,                // 製造 / 購入時的 +N 強化等級
  basePrice:   300,              // 市集 / shop 預設買價(整數,sellPrice 自動 = basePrice * 0.5)
  stat:        'STR +3',         // 屬性加成。**格式必須是 "ATTR +N"**,大寫屬性 + 一個空格 + 加號 + 數字
                                 // ATTR 可選:STR / AGI / DEX / VIT / INT / LUK
                                 // character.js / battle.js 用 regex /([A-Z]+)\s*\+(\d+)/ 解析
  source:      ['market'],       // 在哪些商店販售。array,可同時 ['market','shop']
                                 // 'market' = 主市集 / 'shop' = 地圖節點商店 / 'state_default' = 玩家初始 bag
                                 // 想要不販售只能撿 / 製造 → 留空 array []
  sellable:    true,             // 玩家可否在市集 sell tab 賣出。多數情況 true
}
```

### `weaponType` 的 9 個合法值

(定義在 `WEAPON_TYPES`,影響圖示與 craft 部位)

| key | 中文 | icon | slot | craftParts |
|---|---|---|---|---|
| `sword1` | 單手劍 | ⚔️ | main | 劍刃 ×11 + 劍柄 ×5 |
| `dagger` | 匕首 | 🗡️ | main | 刀刃 ×6 + 刀柄 ×4 |
| `rapier` | 細劍 | 🤺 | main | 劍身 ×10 + 護手 ×4 |
| `greatsword` | 大劍 | 🔱 | both | 巨刃 ×18 + 劍柄 ×6 |
| `mace` | 單手錘 | 🔨 | main | 錘頭 ×10 + 錘柄 ×6 |
| `tachi` | 太刀 | ⛩️ | main | 刀身 ×17 + 刀柄 ×4 |
| `spear` | 長槍 | 🏹 | both | 槍頭 ×6 + 槍桿 ×12 |
| `axe` | 雙手斧 | 🪓 | both | 斧刃 ×8 + 斧柄 ×14 |
| `shield` | 盾牌 | 🛡️ | off | 盾面 ×12 + 盾框 ×4 |

要加新的武器類別(例如「弓」)→ 先到 `WEAPON_TYPES` 加 entry,再到 `WEAPON_REGISTRY` 用它。

### 完整範例

新增一把 epic 大劍叫「破曉」,只在主市集賣,8000g:

```js
// js/items.js,WEAPON_REGISTRY 內找個位置貼進去
{
  key:'dawnbreaker', name:'破曉', rarity:'epic', weaponType:'greatsword',
  baseDur:5, maxDur:8, baseEnhance:3, basePrice:8000, stat:'STR +14',
  source:['market'], sellable:true
},
```

reload 瀏覽器 → 主市集 → 武器分類 → 出現「破曉」,5000G。**不需要動 market.js / shop.js / 任何其他檔**。

---

## 2. 新增防具

### 欄位

```js
{
  key:         'iron_helmet',    // 同武器
  name:        '鐵頭盔',          // 同武器
  rarity:      'common',         // 同武器
  armorType:   'helmet',         // 必須是 ARMOR_TYPES 的 key(決定裝備到哪個槽)
  baseDur:     8,                // 同武器
  maxDur:      10,               // 同武器
  baseEnhance: 0,                // 同武器
  basePrice:   200,              // 同武器
  stat:        'VIT +2',         // 同武器(格式 "ATTR +N")
  source:      ['market'],       // 同武器
  sellable:    true,             // 同武器
}
```

### `armorType` 的 7 個合法值

| key | 中文 | icon | 對應 s.equipment 槽 |
|---|---|---|---|
| `helmet` | 頭盔 | ⛑️ | `helmet` |
| `chest` | 上衣 | 🥻 | `chest` |
| `pants` | 褲子 | 👖 | `pants` |
| `boots` | 靴子 | 👢 | `boots` |
| `main` | 主手 | ⚔️ | `main` |
| `off` | 副手 | 🛡️ | `off` |
| `acc` | 飾品 | 💍 | `acc1` 或 `acc2`(空槽優先,`equipFromBag` 自動處理) |

`acc` 比較特別:玩家有兩個飾品槽(acc1/acc2),它們共用一個 def `armorType:'acc'`。一個飾品物品同時間只能裝一個槽(`isUidEquipped` 防雙裝)。

### 完整範例

新增一個 legendary 戒指叫「神祕指環」,主市集 + shop 都賣,15000g,加 INT +12:

```js
// js/items.js,ARMOR_REGISTRY
{
  key:'mystic_ring', name:'神祕指環', rarity:'legendary', armorType:'acc',
  baseDur:5, maxDur:6, baseEnhance:0, basePrice:15000, stat:'INT +12',
  source:['market','shop'], sellable:true
},
```

要讓 shop 真的列上去 → 還要去 `js/shop.js` 的 `SHOP_BUY_ITEMS.armor` 加一筆 stock entry:

```js
// js/shop.js
const SHOP_BUY_ITEMS = {
  armor: [
    // ... 既有的 ...
    {key:'mystic_ring', stock:1, price:15000},  // price 可省略,省了會用 def 的 basePrice
  ],
  // ...
};
```

---

## 3. 新增素材 / 道具

素材跟道具差別:
- **素材** (Material):堆疊型,bag 中存為 `bag.materials[key] = qty`(整數)。製造 / 採集 / 怪物掉落用。
- **道具** (Consumable):堆疊型,bag 中存為 `bag.items[key] = qty`(整數)。可用 / 可裝備外掛效果(藥水 / 食物 / 卷軸 / 工具)。

### 3a. 新增素材

```js
{
  key:         'iron_ore',       // 唯一識別碼
  name:        '鐵礦石',          // zh-TW 顯示名
  icon:        '⛏️',            // emoji 一個字元(bag 顯示用,GATH_DECK 有定義時優先用 GATH 圖示)
  rarity:      'common',         // 5 級
  matCategory: 'ore',            // 'ore'(礦) | 'plant'(植物) | 'mob'(怪物素材) | 'craft'(中間產物)
  basePrice:   50,               // 市集販售價;0 = 不在市集賣
  source:      ['market','MINE'],// 哪些系統會掉這項。informational(除錯/篩選用),不影響邏輯
                                 // 常見值:'market' | 'shop' | 'MINE' | 'GATH' | 'HUNT' | 'COOK' | 'CRFT'
  desc:        '常見的鐵礦原石',  // 可選,給 tooltip 用
}
```

`matCategory` 的差異(影響 bag 素材分頁的子分類過濾):
- `ore` → 礦物分類
- `plant` → 植物分類(採集系統的所有掉落都歸這)
- `mob` → 怪物素材(狩獵掉落)
- `craft` → 中間產物(像 steel_ingot 是用 iron_ore 煉的)

### 3b. 新增道具

```js
{
  key:         'hp_s',           // 唯一識別碼
  name:        '初級回復藥',      // zh-TW 顯示名
  icon:        '🧪',            // emoji
  rarity:      'common',         // 5 級
  itemType:    'potion',         // 'potion' | 'food' | 'scroll' | 'tool' | 'other'(影響顯示分類)
  basePrice:   80,               // 市集販售價
  stack:       true,             // 可堆疊;目前實際全部 true,先佔位
  effect:      {kind:'heal', amount:50},  // 結構化效果(下方詳述)
  source:      ['market','shop'],
  sellable:    true,
}
```

### `effect.kind` 的 6 種值

```js
// 1. 'heal' — 恢復 HP(最常見)
effect: {kind:'heal', amount:50}        // 補 50 HP

// 2. 'cure' — 解狀態
effect: {kind:'cure', status:'poison'}  // 解中毒
effect: {kind:'cure', status:'all'}     // 解所有狀態(萬能藥)

// 3. 'escape' — 戰鬥逃脫
effect: {kind:'escape'}                  // 沒 amount

// 4. 'identify' — 鑑定(展示物品隱藏屬性)
effect: {kind:'identify'}                // 沒 amount

// 5. 'buff' — 暫時加屬性(目前還沒實作 use 端,先佔位)
effect: {kind:'buff', attr:'STR', delta:5, duration:3}  // 3 回合 STR +5

// 6. 'noop' — 純收藏品 / 任務道具,直接用沒效果
effect: {kind:'noop'}
```

### 完整範例

新增一份高級食物「鳳梨」,主市集賣 800g,fresh 玩家用了補 200 HP:

```js
// js/items.js,CONSUMABLE_REGISTRY
{
  key:'phoenix_pine_dish', name:'鳳梨大餐', icon:'🍍', rarity:'rare', itemType:'food',
  basePrice:800, stack:true, effect:{kind:'heal', amount:200},
  source:['market'], sellable:true
},
```

新增一份素材「龍鱗碎片」,只能從怪物掉,不在市集賣:

```js
// js/items.js,MATERIAL_REGISTRY
{
  key:'dragon_scale_shard', name:'龍鱗碎片', icon:'🐉', rarity:'rare',
  matCategory:'mob', basePrice:0, source:['HUNT']
},
```

---

## 加完物品後的測試清單

reload 瀏覽器,跑一遍:

1. 主市集 → 你想要它出現的分類 → 看到新物品(若 source 含 'market' 且 basePrice > 0)
2. 地圖節點商店 → 同上(若進了 SHOP_BUY_ITEMS)
3. 買一份 → 背包顯示正常(名稱、圖示、+N、耐久、稀有度顏色)
4. 武器 / 防具:裝備上身 → 狀態頁顯示對應 stat
5. 道具 / 食物:點擊 use → effect 正確觸發(目前只 heal 有實際效果)
6. Console 不該出現 `[bag] unknown material/consumable key:` warn —— 出現代表 def key 拼錯
7. `node --check` pass(用 [CLAUDE.md](../CLAUDE.md) 「How to run / test」那段一條龍指令)

## 常見錯誤

- **stat 寫錯格式**:`'STR+3'`(沒空格)、`'+3 STR'`(順序錯)、`'STR +3-5'`(範圍)都不會被解析,角色 stat bar 不會加。固定 `"ATTR +N"`。
- **weaponType / armorType 拼錯**:bag 顯示 fallback ⚔️ / 🛡️,但能裝備能買賣。一檢查就知道。
- **key 重複**:已存在的 key 後 def 會被前 def 蓋掉(`getXxxDef` 用 first match)。新 key 命名前先 grep。
- **基本價設 0 但 source 含 'market'**:不會顯示在市集(filter 是 `source.includes('market') && basePrice > 0`)。
- **想新增武器類別卻直接寫 weaponType:'bow'**:`bow` 不在 WEAPON_TYPES,圖示會 fallback、craft 拿不到部位。要先加進 WEAPON_TYPES。
