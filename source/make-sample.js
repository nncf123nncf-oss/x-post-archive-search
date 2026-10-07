// 架空のカフェ店主の架空の投稿(150件)を、想定形式の tweets.js として作る。本人の実データは一切使わない。
// 実行: node source/make-sample.js [出力パス]   既定: source/sample-tweets.js
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'sample-tweets.js'));
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20261008);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function tw(ms) { const d = new Date(ms); const p = n => (n < 10 ? '0' : '') + n; return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`; }
const START = Date.UTC(2026, 2, 2, 0, 0, 0), DAY = 86400000;

// 日付つきの固定の投稿（被り確認・検索・偏りで見せたいもの）
const fixed = [
  [2026, 3, 9, '新メニューの桜ラテ、今週から始めます。ほんのり甘い桜の香りです #カフェ #季節のメニュー', 41, 6],
  [2026, 3, 10, '桜ラテ、思ったより出ています。ありがとうございます #カフェ', 18, 2],
  [2026, 5, 20, '新メニューのレモンスカッシュ、今週から始めます。炭酸強めです #カフェ #季節のメニュー', 27, 3],
  [2026, 6, 15, '梅雨の間だけの黒糖ラテ、今週から出します #カフェ #季節のメニュー', 22, 4],
  [2026, 7, 3, '夏の限定、かき氷を今週から始めます。シロップは全部手づくり #カフェ #手作り', 63, 11],
  [2026, 4, 2, '季節のラテは、毎月1日に入れ替えています #カフェ', 15, 1],
  [2026, 8, 22, '季節のタルト、今週から始めます。ぶどうをたっぷり使っています #焼き菓子 #季節のメニュー', 35, 5],
  [2026, 9, 14, '焼き菓子の仕込みで朝が早くなってきました。秋ですね #焼き菓子', 12, 0]
];
// テンプレート（単語を差し替えて日付ごとに1本）
const subj = ['ブレンドコーヒー', 'カフェラテ', 'ほうじ茶ラテ', 'チーズケーキ', 'スコーン', 'プリン', 'フレンチトースト', 'ガトーショコラ', 'ハンドドリップ', 'アイスコーヒー', 'クッキー', 'ホットサンド'];
const tags = ['#カフェ', '#コーヒー', '#焼き菓子', '#手作り', '#季節のメニュー', '#おうちカフェ', ''];
const tmpl = [
  s => `今日の${s}は、豆の香りがいつもより立っています。`,
  s => `${s}の仕込みが終わりました。あとは開店を待つだけ。`,
  s => `お客さんから${s}の感想をいただきました。うれしい。`,
  s => `${s}、午後には売り切れそうです。お早めに。`,
  s => `${s}の味を少し変えました。気づく人はいるかな。`,
  s => `朝いちばんの${s}を試飲しています。今日も良さそうです。`,
  s => `雨の日は${s}が静かによく出ます。`,
  s => `${s}の写真を撮り忘れました。また明日。`
];
const replyT = ['ありがとうございます。また来てくださいね', 'そうなんです、少し甘めにしています', '今度試してみます。教えてくださってありがとうございます', 'お待ちしています。ゆっくりしていってください'];
const rtT = ['RT @sample_user1: 近所のパン屋さんが新作を出したそうです', 'RT @sample_user2: 豆の焙煎度について、分かりやすい解説でした', 'RT @sample_user3: 商店街のイベントのお知らせです'];
const quoteT = ['これ分かる。うちも同じことで悩んだ', 'うちも似た工夫をしています'];

const items = []; let id = 2000000000000000000n;
function push(ms, text, o) {
  o = o || {}; id += BigInt(1000 + Math.floor(R() * 500));
  const hs = (text.match(/#[^\s#]+/g) || []).map(t => ({ text: t.slice(1), indices: ['0', '0'] }));
  const t = {
    edit_info: { initial: { editTweetIds: [String(id)], editableUntil: tw(ms + 3600000), editsRemaining: '5', isEditEligible: true } },
    retweeted: false, source: '<a href="https://x.com" rel="nofollow">Twitter Web App</a>', entities: { hashtags: hs, symbols: [], user_mentions: [], urls: [] },
    display_text_range: ['0', String(text.length)], favorite_count: o.fav === undefined ? String(Math.floor(R() * 30)) : o.fav, id_str: String(id), truncated: false,
    retweet_count: o.rt === undefined ? String(Math.floor(R() * 4)) : o.rt, id: String(id), created_at: tw(ms), favorited: false, full_text: text, lang: 'ja'
  };
  if (o.reply) { t.in_reply_to_status_id_str = '1999999999999999999'; t.in_reply_to_screen_name = 'sample_user1'; }
  items.push({ tweet: t });
}
fixed.forEach(f => push(Date.UTC(f[0], f[1] - 1, f[2], 3, 30, 0), f[3], { fav: String(f[4]), rt: String(f[5]) }));
// 通常投稿 87件（日付は3月〜10月に散らす）
let n = 0, d = 0;
while (n < 87) {
  d += 1 + Math.floor(R() * 3); const ms = START + d * DAY + Math.floor(R() * 8) * 3600000 + 1800000;
  if (ms > Date.UTC(2026, 9, 5)) { d = 0; continue; }
  const s = subj[Math.floor(R() * subj.length)], tg = tags[Math.floor(R() * tags.length)];
  push(ms, tmpl[Math.floor(R() * tmpl.length)](s) + (tg ? ' ' + tg : ''));
  n++;
}
// 同じ本文の重複 3件（日付違い）
['おはようございます。今日も9時に開店します。', '本日も営業しています。お待ちしています。'].forEach((t, i) => { for (let k = 0; k < (i ? 2 : 3); k++) push(Date.UTC(2026, 4 + k * 2, 4 + i, 0, 10, 0), t, { fav: String(3 + k), rt: '0' }); });
// 返信 15件 / リポスト 15件 / 引用つき 8件（引用は自分の投稿として残る）
for (let k = 0; k < 15; k++) push(START + (10 + k * 13) * DAY + 7200000, '@sample_user1 ' + replyT[k % 4], { reply: true, fav: String(k % 3), rt: '0' });
for (let k = 0; k < 15; k++) push(START + (6 + k * 14) * DAY + 5400000, rtT[k % 3], { fav: '0', rt: String(k % 2) });
for (let k = 0; k < 8; k++) push(START + (20 + k * 25) * DAY + 3600000, quoteT[k % 2] + ' https://t.co/sampleQ' + k, {});
// 150件になるよう通常投稿で埋める
while (items.length < 150) { const ms = START + (1 + Math.floor(R() * 200)) * DAY + 4000000; push(ms, tmpl[Math.floor(R() * tmpl.length)](subj[Math.floor(R() * subj.length)])); }
// 実際のファイルのように新しい順ではなく古い順に近い並びで保存（順序に依存しないことの確認にもなる）
fs.writeFileSync(OUT, 'window.YTD.tweets.part0 = ' + JSON.stringify(items, null, 2) + '\n');
console.log('wrote', OUT, items.length, 'items');
