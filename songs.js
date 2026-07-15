// 三線練習アプリ 曲データ
//
// ここに入っているのは「枠組みだけ」の空テンプレートやんす。
// 歌詞・工工四の中身はAIが記憶や推測で埋めると間違った指使いになるリスクがあるので、
// 教科書を見ながらアプリの「入力・編集モード」で正しい内容を入力してほしいやんす。
// (入力した内容はブラウザのlocalStorageに自動保存されます。
//  「JSONを書き出す」で外部ファイルに保存し、このファイルに貼り戻すこともできます)
//
// string: 1 = 男弦（低い・太い弦） 2 = 中弦 3 = 女弦（高い・細い弦）
// fret:   0 = 開放弦（押さえない） 1〜4 = 勘所（押さえる位置。教科書の番号に合わせて調整可）
// t:      その音が鳴るタイミング（秒）。「入力・編集モード」でタップして記録する

const SONGS = {
  namida: {
    title: "涙そうそう（練習用テンプレート）",
    notes: makeEmptyNotes(16),
  },
  ojii: {
    title: "オジー自慢のオリオンビール（練習用テンプレート）",
    notes: makeEmptyNotes(16),
  },
};

function makeEmptyNotes(count) {
  const notes = [];
  for (let i = 0; i < count; i++) {
    notes.push({ lyric: "", kunkunshi: "", string: 1, fret: 0, t: null });
  }
  return notes;
}
