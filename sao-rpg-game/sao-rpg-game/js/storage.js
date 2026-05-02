/* ========================================================================
 * storage.js — localStorage 存檔讀檔
 *
 * 內容:
 *   - load()  讀取整份存檔(JSON);格式錯誤回傳空物件
 *   - save(s) 把整份存檔寫入 localStorage
 *
 * 注意:
 *   - 鍵值常數 SK 由 state.js 定義,storage.js 載入時 SK 還沒存在,
 *     但只要使用 load/save 的時機 SK 已宣告即可(實際呼叫都發生在頁面互動之後)。
 *   - 之後若要加入存檔 export / import / 多版本備份,集中放這個檔案即可。
 * ======================================================================== */

function load(){
  try{ return JSON.parse(localStorage.getItem(SK)||'{}'); }
  catch{ return {}; }
}

function save(s){
  localStorage.setItem(SK, JSON.stringify(s));
}
