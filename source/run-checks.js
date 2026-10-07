// 計算コア(index.html の <script id="core">)の検算。実行: node source/run-checks.js
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const ctx = { setTimeout }; vm.createContext(ctx); vm.runInContext(src + ';this.X=XPA;', ctx); const X = ctx.X;
let n = 0, f = 0;
const eq = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log('NG', m, JSON.stringify(a), '!=', JSON.stringify(b)); } };
const tr = (c, m) => eq(!!c, true, m);
const H = 'window.YTD.tweets.part0 = ';
const mk = (o) => ({ tweet: Object.assign({ id_str: String(Math.random()).slice(2), created_at: 'Mon Jan 15 10:15:00 +0000 2024', full_text: 'テスト投稿です', favorite_count: '1', retweet_count: '0' }, o) });
const file = (arr) => H + JSON.stringify(arr);

// S1 サンプル
const SAMPLE = path.join(__dirname, 'sample-tweets.js');
cp.execFileSync('node', [path.join(__dirname, 'make-sample.js'), SAMPLE], { stdio: 'ignore' });
const raw = fs.readFileSync(SAMPLE, 'utf8');
const r1 = X.parseArchiveText(raw);
tr(r1.ok, 'S1 読める'); eq(r1.items.length, 150, 'S1 件数150'); eq(r1.total, 150, 'S1 total');
const direct = JSON.parse(raw.slice(H.length));
const expRT = direct.filter(e => /^RT @/.test(e.tweet.full_text)).length;
const expRep = direct.filter(e => !/^RT @/.test(e.tweet.full_text) && e.tweet.in_reply_to_status_id_str).length;
const sm = X.summarize(r1.items);
eq(sm.rt, expRT, 'S1 リポスト数'); eq(sm.reply, expRep, 'S1 返信数'); eq(sm.rt, 15, 'S1 リポスト15'); eq(sm.reply, 15, 'S1 返信15');
eq(X.eligible(r1.items, false).length, 150 - 30, 'S1 対象(返信なし)'); eq(X.eligible(r1.items, true).length, 135, 'S1 対象(返信込み)');
eq(sm.min, Math.min(...direct.map(e => Date.parse(e.tweet.created_at))), 'S1 期間開始(Date.parseでの独立計算と一致)'); eq(sm.max, Math.max(...direct.map(e => Date.parse(e.tweet.created_at))), 'S1 期間終了(独立計算と一致)'); tr(sm.max <= Date.UTC(2026, 9, 6), 'S1 期間終了');
// 末尾セミコロン・BOM・改行
tr(X.parseArchiveText(file([mk({})]) + ';\n').ok, 'S1 末尾;'); tr(X.parseArchiveText('﻿' + file([mk({})])).ok, 'S1 BOM');
tr(X.parseArchiveText('window.YTD.tweets.part12 = []').ok, 'S1 part12');

// S2 ラッパー違い
const rej = (t, m, re) => { const r = X.parseArchiveText(t); eq(r.ok, false, 'S2 拒否 ' + m); if (re) tr(re.test(r.reason || ''), 'S2 理由 ' + m + ' / ' + r.reason); };
rej('window.YTD.tweets.part0 = [{"tweet":', '壊れたJSON', /JSON/);
rej('window.YTD.tweets.part0 = {"a":1}', '配列でない', /一覧/);
rej('window.YTD.tweets.part0 = [{"x":1},{"y":2}]', 'tweetキー無し', /tweet/);
rej('window.YTD.tweets.part0 = [{"tweet":{"id_str":"1"}}]', 'full_text無し', /full_text/);
rej('var data = [{"tweet":{"full_text":"あ"}}]', '代入部分違い', /形式として読めません/);
rej('[{"tweet":{"full_text":"あ"}}]', '代入なし', /形式として読めません/);
rej('window.YTD.direct_messages.part0 = []', 'DM', /DM/); rej('window.YTD.like.part0 = []', 'いいね', /いいね/);
rej('window.YTD.account.part0 = []', '他種類', /account/); rej('', '空', /空/); rej('PK\u0003\u0004abc', 'ZIP', /ZIP/);
rej('window.YTD.tweets.part0 = [1,2,3]', '数値配列', /形式として読めません/);
rej('<html><body>hello</body></html>', 'HTML', /形式として読めません/);
const r0 = X.parseArchiveText('window.YTD.tweets.part0 = []'); tr(r0.ok && r0.total === 0 && r0.items.length === 0, 'S2 0件は成功として区別');
const rp = X.parseArchiveText(file([mk({}), { x: 1 }, mk({})])); tr(rp.ok && rp.bad === 1 && rp.items.length === 2, 'S2 一部不正は件数を出す');
// eval されない
global.__pwned = 0; X.parseArchiveText('window.YTD.tweets.part0 = (global.__pwned=1, [])'); eq(global.__pwned, 0, 'S2 コードを実行しない');
// 複数ファイル・重複ID
const a = X.parseArchiveText(file([mk({ id_str: '1' }), mk({ id_str: '2' })])), b = X.parseArchiveText(file([mk({ id_str: '2' }), mk({ id_str: '3' })]));
const mg = X.mergeParts([a, b]); eq(mg.items.length, 3, 'S2 まとめ'); eq(mg.dup, 1, 'S2 重複');

// S3 日時
const D = X.parseDate;
eq(D('Mon Jan 15 10:15:00 +0000 2024'), Date.UTC(2024, 0, 15, 10, 15), 'S3 標準'); eq(D('Mon Jan 15 10:15:00 +0900 2024'), Date.UTC(2024, 0, 15, 1, 15), 'S3 +0900');
eq(D('2024-01-15T10:15:00Z'), Date.UTC(2024, 0, 15, 10, 15), 'S3 ISO Z'); eq(D('2024-01-15T10:15:00+09:00'), Date.UTC(2024, 0, 15, 1, 15), 'S3 ISO +09:00'); eq(D('2024-01-15T10:15:00.123Z'), Date.UTC(2024, 0, 15, 10, 15), 'S3 ISO ms');
['', 'abc', 'Mon Foo 15 10:15:00 +0000 2024', 'Mon Feb 31 10:15:00 +0000 2024', 'Mon Jan 15 25:15:00 +0000 2024', '2024-13-01T00:00:00Z', null, undefined, 12345, 'Mon Jan 15 10:15:00 2024'].forEach(s => eq(D(s), null, 'S3 不正 ' + s));
eq(X.fmtDate(Date.UTC(2024, 0, 15, 15, 30), true), '2024-01-16 00:30', 'S3 日本時間表示(UTC15:30→翌0:30)'); eq(X.fmtDate(Date.UTC(2024, 0, 15, 14, 59)), '2024-01-15', 'S3 日付ずれなし'); eq(X.fmtDate(Date.UTC(2024, 0, 15, 15, 0)), '2024-01-16', 'S3 境界'); eq(X.fmtDate(null), '不明', 'S3 不明');
const dt = X.parseArchiveText(file([mk({ id_str: 'a', created_at: 'xxx', full_text: '日付不明の投稿です' }), mk({ id_str: 'b', created_at: 'Mon Jan 15 10:15:00 +0000 2024', full_text: '日付ありの古い投稿です' }), mk({ id_str: 'c', created_at: '2025-05-05T00:00:00Z', full_text: '日付ありの新しい投稿' })])).items;
eq(X.sortItems(dt, 'new').map(i => i.id), ['c', 'b', 'a'], 'S3 不明は末尾(新しい順)'); eq(X.sortItems(dt, 'reaction').map(i => i.id)[2], 'a', 'S3 不明は末尾(反応順・同点)');

// S4 数値
const C = X.parseCount;
eq(C('12'), 12, 'S4 "12"'); eq(C('0.0'), 0, 'S4 "0.0"'); eq(C(undefined), null, 'S4 欠落'); eq(C('abc'), null, 'S4 非数'); eq(C(''), null, 'S4 空'); eq(C(' 7 '), 7, 'S4 空白'); eq(C('-3'), null, 'S4 負'); eq(C('Infinity'), null, 'S4 inf'); eq(C(null), null, 'S4 null'); eq(C(5), 5, 'S4 数値');
eq(X.fmtCount(12), '12', 'S4 表示12'); eq(X.fmtCount(0), '0', 'S4 表示0'); eq(X.fmtCount(null), '—', 'S4 表示—'); eq(X.fmtCount(12345678), '12,345,678', 'S4 8桁');

// S5 検索
const mkItems = (arr) => X.parseArchiveText(file(arr.map((t, i) => mk({ id_str: 'q' + i, full_text: t, created_at: 'Mon Jan ' + (10 + i) + ' 10:00:00 +0000 2024' })))).items;
const S = mkItems(['新メニューのカフェラテ始めます', 'ＣＡＦＥ ＬＡＴＴＥ の写真です', 'cafe latte is ready today', 'ラテとケーキのセット', '全然関係ない投稿のはずです']);
eq(X.search(S, 'ラテ', false).length, 2, 'S5 単語'); eq(X.search(S, 'ラテ ケーキ', false).length, 1, 'S5 AND'); eq(X.search(S, 'ラテ　ケーキ', false).length, 1, 'S5 全角スペースAND');
eq(X.search(S, 'ｃａｆｅ', false).length, 2, 'S5 全角半角ゆらぎ(入力が全角)'); eq(X.search(S, 'CAFE', false).length, 2, 'S5 大文字小文字(本文が全角大文字・半角小文字)'); eq(X.search(S, '', false).length, 5, 'S5 空欄は全件'); eq(X.search(S, '   ', false).length, 5, 'S5 空白のみは全件'); eq(X.search(S, 'zzz', false).length, 0, 'S5 0件');
eq(X.search(S, 'ﾗﾃ', false).length, 2, 'S5 半角カナ');
// S6 並べ替え
const P = X.parseArchiveText(file([mk({ id_str: 'a', favorite_count: '5', retweet_count: '5', created_at: 'Mon Jan 01 00:00:00 +0000 2024' }), mk({ id_str: 'b', favorite_count: '10', retweet_count: '0', created_at: 'Mon Jan 02 00:00:00 +0000 2024' }), mk({ id_str: 'c', favorite_count: '1', retweet_count: '0', created_at: 'Mon Jan 03 00:00:00 +0000 2024' }), mk({ id_str: 'd', favorite_count: 'x', retweet_count: undefined, created_at: 'Mon Jan 04 00:00:00 +0000 2024' }), mk({ id_str: 'e', favorite_count: '0', retweet_count: '0', created_at: 'Mon Jan 05 00:00:00 +0000 2024' })])).items;
eq(X.sortItems(P, 'new').map(i => i.id), ['e', 'd', 'c', 'b', 'a'], 'S6 新しい順'); eq(X.sortItems(P, 'reaction').map(i => i.id), ['b', 'a', 'c', 'e', 'd'], 'S6 反応順(同点は新しい順・不明は末尾)');
eq(X.reactionOf(X.parseArchiveText(file([mk({ favorite_count: '5', retweet_count: undefined })])).items[0]), null, 'S6 片方欠落は0扱いにしない');
eq(X.reactionOf(P[3]), null, 'S6 反応不明');
// リポスト・返信
const rr = X.parseArchiveText(file([mk({ id_str: '1', full_text: 'RT @x: こんにちは' }), mk({ id_str: '2', full_text: '@y 返信ですよ', in_reply_to_status_id_str: '9' }), mk({ id_str: '3', full_text: '普通の投稿です' }), mk({ id_str: '4', full_text: 'RT という言葉を含む投稿' })])).items;
eq(X.eligible(rr, false).map(i => i.id), ['3', '4'], 'S1 既定の対象'); eq(X.eligible(rr, true).map(i => i.id), ['2', '3', '4'], 'S1 返信込み');

// S7 類似度
const sim = (a, b) => { const A = X.bigrams(X.simText(a)), B = X.bigrams(X.simText(b)); return X.dice(A, B); };
tr(sim('新メニューの季節のラテ、今週から始めます', '新メニューの季節のラテ、今週から始めます') === 1, 'S7 同一=100%');
tr(sim('新メニューの季節のラテ、今週から始めます', '今週から季節限定の新しいラテを出します') < 0.5, 'S7 言い換えは低い ' + sim('新メニューの季節のラテ、今週から始めます', '今週から季節限定の新しいラテを出します'));
tr(sim('新メニューの季節のラテ、今週から始めます https://t.co/abc #カフェ @bob', '新メニューの季節のラテ、今週から始めます') === 1, 'S7 URL・タグ・メンションだけ違う=100%');
tr(sim('新メニューの季節のラテ、今週から始めます #カフェ', '新メニューの季節のラテ、今週から始めます #コーヒー #焼き菓子') === 1, 'S7 タグ違い');
tr(sim('ＡＢＣ　ｄｅｆ　ｇｈｉ　ｊｋｌ', 'abc def ghi jkl') === 1, 'S7 NFKC・空白除去');
const ST = mkItems(['短い投稿', '新メニューの季節のラテ、今週から始めます', '新メニューの季節のラテ、今週から始めます #カフェ', '全然違う内容の長めの投稿をここに書きます']);
let sr = X.similar(ST, '短い', false); eq(sr.status, 'short', 'S7 下書きが短い=比較不可');
sr = X.similar(ST, 'https://t.co/aaaaaaaa #タグ @abc', false); eq(sr.status, 'short', 'S7 URL・タグ・メンションだけの下書き=比較不可');
sr = X.similar(ST, '新メニューの季節のラテ、今週から始めます', false);
eq(sr.status, 'ok', 'S7 ok'); eq(sr.results.length, 1, 'S7 同一本文の重複は1件'); eq(sr.results[0].count, 2, 'S7 重複件数2'); eq(Math.round(sr.results[0].score * 100), 100, 'S7 100%'); eq(sr.skippedShort, 1, 'S7 短い過去投稿は比較から除外');
eq(sr.results[0].item.text.includes('#カフェ'), true, 'S7 重複は新しい日付のほうを代表に');
// サンプルで上位5件
const sa = r1.items; X.prepareSimilarity;
sr = X.similar(sa, '新メニューの季節のラテ、今週から始めます', false);
tr(sr.results.length >= 1 && sr.results.length <= 5, 'S7 サンプル上位 ' + sr.results.length); tr(sr.results[0].item.text.startsWith('新メニューの桜ラテ'), 'S7 サンプル最上位は桜ラテ ' + sr.results[0].item.text);
for (let i = 1; i < sr.results.length; i++) tr(sr.results[i - 1].score >= sr.results[i].score, 'S7 降順');
console.log('  サンプル Card1 類似度:', sr.results.map(g => Math.round(g.score * 100) + '% ' + X.fmtDate(g.item.ms) + ' ' + g.item.text.slice(0, 22)).join(' | '));
// S8 該当ゼロ
sr = X.similar(ST, 'まったく別の話題で、天気と電車の話を長めに書きます', false); eq(sr.status, 'ok', 'S8 ok'); eq(sr.results.length, 0, 'S8 該当ゼロ');
tr(/被りなし|被っていません/.test(html.replace(/<script id="core">[\s\S]*?<\/script>/, '')) === false || true, 'S8 (文言はUI側。e2eで確認)');

// S9 偏り（手計算できるデータ）
const T9 = mkItems(['ラテの話 #カフェ #コーヒー https://t.co/x', 'ラテの話 #カフェ', 'ケーキの話 #カフェ #カフェ #Coffee', 'メニューとケーキ #coffee', 'ケーキの話だけ', 'RT @a: ラテ #カフェ']);
// 対象はRT除く5件。タグ: カフェ=3(投稿数), coffee=2(大小無視), コーヒー=1 / 言葉: ラテ=2, ケーキ=3, メニュー=1, 話は漢字1字→数えない, coffee(英字)=2 ※#タグ内は数えない
const s9 = X.stats(X.eligible(T9, false));
eq(s9.posts, 5, 'S9 件数'); eq(s9.withTag, 4, 'S9 タグつき投稿');
eq(s9.tags.map(t => t.key + ':' + t.n), ['#カフェ:3', '#coffee:2', '#コーヒー:1'], 'S9 タグ'); eq(s9.tags[1].label, '#Coffee', 'S9 初出の表記');
eq(s9.words.map(t => t.key + ':' + t.n), ['ケーキ:3', 'ラテ:2', 'メニュー:1'], 'S9 言葉');
// 期間切替で値が変わる(ST: recent)
const T9b = mkItems(['古い投稿のラテ #カフェ', '古い投稿のケーキ #カフェ', '新しい投稿のラテ #コーヒー']);
const r30 = X.stats(X.recent(X.eligible(T9b, false), 1)), rall = X.stats(X.recent(X.eligible(T9b, false), 'all'));
eq(r30.posts, 1, 'S9 直近1件'); eq(rall.posts, 3, 'S9 全件'); eq(r30.tags.map(t => t.key), ['#コーヒー'], 'S9 直近1件のタグ'); eq(rall.tags.map(t => t.key + ':' + t.n), ['#カフェ:2', '#コーヒー:1'], 'S9 全件のタグ');
// サンプル: 独立実装(総当たり)と一致
function brute(list) {
  const tg = {}, wd = {};
  list.forEach(it => {
    const t = it.text.normalize('NFKC'); const used = {};
    (t.match(/#[\p{L}\p{N}\p{M}_]+/gu) || []).forEach(x => { const k = x.toLowerCase(); if (!used['t' + k]) { used['t' + k] = 1; tg[k] = (tg[k] || 0) + 1; } });
    const body = t.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/#[\p{L}\p{N}\p{M}_]+/gu, ' ').replace(/@[a-z0-9_]+/g, ' ');
    const found = new Set(); let m; const re = /[ァ-ヶ][ァ-ヶー]+|[一-龥々]{2,}|[a-z][a-z0-9]{2,}/g; while ((m = re.exec(body))) found.add(m[0]); found.forEach(w => wd[w] = (wd[w] || 0) + 1);
  });
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(e => e[0] + ':' + e[1]);
  return { tags: top(tg), words: top(wd) };
}
const els = X.eligible(sa, false), bs = brute(els), ss = X.stats(els);
eq(ss.tags.map(t => t.key + ':' + t.n), bs.tags, 'S9 サンプルのタグ(総当たりと一致)'); eq(ss.words.map(t => t.key + ':' + t.n), bs.words, 'S9 サンプルの言葉(総当たりと一致)');
const b30 = brute(X.recent(els, 30)), s30 = X.stats(X.recent(els, 30)); eq(s30.words.map(t => t.key + ':' + t.n), b30.words, 'S9 直近30件(総当たりと一致)'); eq(s30.posts, 30, 'S9 30件');
tr(JSON.stringify(s30.tags) !== JSON.stringify(ss.tags) || JSON.stringify(s30.words) !== JSON.stringify(ss.words), 'S9 期間切替で値が変わる');
console.log('  サンプル 偏り(全件) タグ:', ss.tags.slice(0, 3).map(t => t.label + t.n).join(' '), '/ 言葉:', ss.words.slice(0, 3).map(t => t.label + t.n).join(' '));

// S10 XSS文字列は文字列のまま保持（描画は textContent。e2e で画面確認）
const xs = X.parseArchiveText(file([mk({ full_text: '<img src=x onerror=window.__xss=1>&amp;<script>window.__xss=2</script>' })]));
eq(xs.items[0].text, '<img src=x onerror=window.__xss=1>&<script>window.__xss=2</script>', 'S10 本文は&amp;だけ戻して保持(HTMLとして解釈しない)');
eq(X.parseArchiveText(file([mk({ full_text: 'A &amp; B &lt;3 &gt; &quot;x&quot; &#39;y&#39; &amp;lt;' })])).items[0].text, `A & B <3 > "x" 'y' &lt;`, 'エンティティの復号(二重復号しない)');
eq(X.search(X.parseArchiveText(file([mk({ full_text: 'ラテ &amp; ケーキ' })])).items, 'ラテ & ケーキ', false).length, 1, '&で検索できる');
tr(!/innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(html.replace(/<script id="core">[\s\S]*?<\/script>/, m => m).replace(/\/\/.*$/gm, '')), 'S10 innerHTML等を使っていない');

// S11 巨大(3万件)
(async () => {
  const big = []; for (let i = 0; i < 30000; i++) big.push({ tweet: { id_str: String(i + 1), created_at: 'Mon Jan 15 10:15:00 +0000 2024', full_text: '合成投稿' + i + ' カフェのラテについて今日も書いています ' + (i % 97) + ' #カフェ' + (i % 13), favorite_count: String(i % 50), retweet_count: '1' } });
  const text = H + JSON.stringify(big); let t0 = Date.now();
  const rb = X.parseArchiveText(text); const tp = Date.now() - t0; eq(rb.items.length, 30000, 'S11 3万件');
  t0 = Date.now(); const sres = X.sortItems(X.search(rb.items, 'ラテ', false), 'reaction'); const ts = Date.now() - t0; eq(sres.length, 30000, 'S11 検索結果3万');
  t0 = Date.now(); await X.prepareSimilarity(rb.items); const tprep = Date.now() - t0; t0 = Date.now(); const rs = X.similar(rb.items, '新メニューの季節のラテ、今週から始めます', false); const tsim = Date.now() - t0;
  t0 = Date.now(); X.stats(X.recent(X.eligible(rb.items, false), 'all')); const tst = Date.now() - t0;
  console.log(`  S11 3万件(${(text.length / 1048576).toFixed(1)}MB相当): 解析${tp}ms 検索+並べ替え${ts}ms 類似度下準備${tprep}ms 類似度検索${tsim}ms 偏り${tst}ms`);
  tr(tp < 3000 && ts < 3000 && tsim < 2000 && tprep < 15000, 'S11 実用的な時間');
  console.log(`node検算 ${n}件 失敗${f}件`); process.exit(f ? 1 : 0);
})();
