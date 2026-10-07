// 実ブラウザ(Chrome headless / CDP)での検算。実行: node source/e2e.js
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http'), os = require('os');
const PAGE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = u => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('NG', m); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xpa-e2e-'));
const H = 'window.YTD.tweets.part0 = ';
const wf = (name, text) => { const p = path.join(TMP, name); fs.writeFileSync(p, text); return p; };
cp.execFileSync('node', [path.join(__dirname, 'make-sample.js'), path.join(TMP, 'tweets.js')], { stdio: 'ignore' });
const SAMPLE = path.join(TMP, 'tweets.js');
const mk = (o) => ({ tweet: Object.assign({ id_str: String(Math.random()).slice(2), created_at: 'Mon Jan 15 10:15:00 +0000 2024', full_text: 'テスト投稿です', favorite_count: '1', retweet_count: '0' }, o) });
(async () => {
  const prof = path.join(TMP, 'prof');
  const chrome = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=9351', '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 50; i++) { try { t = await getJson('http://127.0.0.1:9351/json'); if (t.length) break; } catch (e) { } await sleep(200); }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = {}; const errs = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async x => { const r = (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
  async function open(w, h, scheme) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme || 'light' }] });
    await send('Page.navigate', { url: PAGE }); for (let i = 0; i < 60; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(100); } await sleep(200);
  }
  async function pick(files) { const doc = (await send('DOM.getDocument')).result.root.nodeId; const q = (await send('DOM.querySelector', { nodeId: doc, selector: '#file' })).result.nodeId; await send('DOM.setFileInputFiles', { nodeId: q, files }); }
  async function waitIdle(ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev('!document.getElementById("fileLabel").hasAttribute("aria-disabled")') && !(await ev('document.getElementById("status").textContent.startsWith("読み込み中")'))) return; await sleep(50); } }
  const setv = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
  const txt = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const cnt = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

  // 通信・保存を記録する
  const HOOK = `window.__net=[];['fetch'].forEach(k=>{const o=window[k];window[k]=function(){window.__net.push(k+':'+String(arguments[0]));return o.apply(this,arguments)}});
    const ox=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){window.__net.push('xhr:'+arguments[1]);return ox.apply(this,arguments)};
    const sb=navigator.sendBeacon;navigator.sendBeacon=function(){window.__net.push('beacon:'+arguments[0]);return true};
    window.__ls=[];const sset=Storage.prototype.setItem;Storage.prototype.setItem=function(){window.__ls.push(arguments[0]);return sset.apply(this,arguments)};`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

  // ===== デスクトップ =====
  await open(1000, 900);
  ok(await ev('getComputedStyle(document.querySelector(".layout")).display') === 'grid', '880px以上は2カラム');
  ok(await ev('!document.getElementById("resEmpty").hidden'), '初期は「まだ読み込んでいません」');
  ok(await ev('document.getElementById("file").hasAttribute("accept")') === false, 'accept属性なし');
  ok(await ev('document.getElementById("file").multiple'), '複数選択可');

  // S2(UI): 間違ったファイルは理由つきで拒否
  await pick([wf('dm.js', 'window.YTD.direct_messages.part0 = [{"dmConversation":{}}]')]); await waitIdle();
  let st = await txt('#status'); ok(st.includes('読み込めませんでした') && st.includes('DM'), 'DMファイル拒否 ' + st);
  ok(await ev('document.getElementById("status").classList.contains("err")'), 'エラー表示のスタイル'); ok(await ev('document.getElementById("sum").hidden'), 'エラー時は件数を出さない');
  await pick([wf('broken.js', 'window.YTD.tweets.part0 = [{"tweet":')]); await waitIdle(); ok((await txt('#status')).includes('JSON'), '壊れたJSON拒否');
  await pick([wf('empty.js', 'window.YTD.tweets.part0 = []')]); await waitIdle(); st = await txt('#sum'); ok(st.includes('0件') && st.includes('投稿は0件'), '0件は「読み込めたが0件」 ' + st);
  ok((await txt('#resSearch')).includes('0件'), '0件の検索結果');

  // S1/S3(UI): サンプル
  await pick([SAMPLE]); await waitIdle(); await sleep(300);
  st = await txt('#sum'); ok(st.includes('150件を読み込みました') && st.includes('リポスト15件を除外') && st.includes('返信 15件') && /期間 2026-03-\d\d 〜 2026-\d\d-\d\d（日本時間）/.test(st), '読み込み結果 ' + st);
  ok(await ev('document.getElementById("status").hidden'), '成功後はステータス欄を消す');
  ok((await txt('#resSearch')).includes('全 120件を表示'), '既定は返信を除いた120件 ' + (await txt('#resSearch')).slice(0, 80));
  await click('#incReplies'); ok((await txt('#resSearch')).includes('全 135件を表示'), '返信込み135件');
  await click('#incReplies'); ok((await txt('#resSearch')).includes('全 120件を表示'), '返信を戻すと120件');
  // S5(UI)
  await setv('#q', 'ラテ'); await sleep(250); let c1 = await cnt('#resSearch .tw'); ok(c1 > 0 && (await txt('#resSearch .count')).includes('件見つかりました'), '検索 ' + c1);
  const allHave = await ev('[...document.querySelectorAll("#resSearch .tw .body")].every(b=>b.textContent.includes("ラテ"))'); ok(allHave, '全件にキーワードを含む');
  await setv('#q', 'ラテ 季節'); await sleep(250); const c2 = await cnt('#resSearch .tw'); ok(c2 < c1 && c2 > 0, 'AND検索で減る ' + c2);
  await setv('#q', 'ｌａｔｔｅｚｚ'); await sleep(250); ok((await txt('#resSearch')).includes('該当する投稿はありません'), '該当0件の表示');
  await setv('#q', ''); await sleep(250);
  // S6(UI)
  await ev('(()=>{const s=document.getElementById("sort");s.value="reaction";s.dispatchEvent(new Event("change"))})()'); await sleep(100);
  const favs = await ev('[...document.querySelectorAll("#resSearch .tw")].map(a=>{const f=a.querySelectorAll(".foot span");return parseInt(f[0].textContent.replace(/\\D/g,""))+parseInt(f[1].textContent.replace(/\\D/g,""))})');
  ok(favs.every((v, i) => i === 0 || favs[i - 1] >= v), '反応順は降順 ' + favs.slice(0, 6)); ok((await txt('#resSearch')).includes('いいね数とリポスト数の合計'), '反応順の説明文');
  await ev('(()=>{const s=document.getElementById("sort");s.value="new";s.dispatchEvent(new Event("change"))})()');
  const dates = await ev('[...document.querySelectorAll("#resSearch .tw .d")].map(e=>e.textContent)'); ok(dates.every((v, i) => i === 0 || dates[i - 1] >= v), '新しい順は降順');

  // S7/S8(UI): 被り確認
  await click('#tabDraft'); ok(await ev('document.getElementById("tabDraft").getAttribute("aria-selected")') === 'true' && await ev('!document.getElementById("inDraft").hidden && document.getElementById("inSearch").hidden'), 'タブ切替');
  await setv('#draft', '新メニューの季節のラテ、今週から始めます'); await sleep(500);
  let dr = await txt('#resDraft'); ok(dr.includes('類似度 61%') && dr.includes('2026-03-09') && dr.includes('桜ラテ') && dr.includes('文字の重なりの目安'), '被り警告 Card1 ' + dr.slice(0, 160));
  const nDraft = await cnt('#resDraft .tw'); ok(nDraft >= 1 && nDraft <= 5, '最大5件 ' + nDraft);
  await setv('#draft', '短い'); await sleep(400); ok((await txt('#resDraft')).includes('短すぎて比較できません'), '10文字未満');
  await setv('#draft', '電車の遅延と天気について、長めの文章をここに書いてみます'); await sleep(400);
  dr = await txt('#resDraft'); ok(dr.includes('似た投稿は見つかりませんでした') && dr.includes('言い回しが違う同じ話は拾えません') && !dr.includes('被りなし') && !dr.includes('被っていません'), 'S8 被りなしと書かない ' + dr.slice(0, 120));
  await setv('#draft', ''); await sleep(300); ok((await txt('#resDraft')).includes('下書きを入れると'), '空欄の案内');
  // S9(UI)
  await click('#tabStats'); await sleep(100);
  let s30 = await txt('#resStats'); ok(s30.includes('対象 30件') && s30.includes('よく使うハッシュタグ 上位10') && s30.includes('よく出る言葉 上位10'), '偏り30件 ' + s30.slice(0, 100));
  const rows30 = await ev('[...document.querySelectorAll("#resStats .bars li")].map(l=>l.textContent)');
  await ev('(()=>{const s=document.getElementById("period");s.value="all";s.dispatchEvent(new Event("change"))})()');
  const sAll = await txt('#resStats'); ok(sAll.includes('対象 120件'), '全件 ' + sAll.slice(0, 60)); const rowsAll = await ev('[...document.querySelectorAll("#resStats .bars li")].map(l=>l.textContent)'); ok(JSON.stringify(rows30) !== JSON.stringify(rowsAll), '期間切替で値が変わる');
  ok(rowsAll.every(r => /\d+件$/.test(r)), '数値を文字で併記');
  // 通信・保存
  ok((await ev('window.__net.filter(x=>!/cloudflareinsights/.test(x))')).length === 0, '外部通信なし(計測以外): ' + JSON.stringify(await ev('window.__net')));
  ok((await ev('window.__ls')).length === 0, 'localStorage等に保存しない'); ok(errs.length === 0, 'JS例外なし ' + errs.join('|'));

  // S10: XSS
  const xss = '<img src=x onerror=window.__xss=1><script>window.__xss=2<\/script>&lt;b&gt;';
  await open(1000, 900);
  await pick([wf('xss.js', H + JSON.stringify([mk({ id_str: '1', full_text: xss }), mk({ id_str: '2', full_text: '<svg onload=window.__xss=3> 通常の長さの投稿です' })]))]); await waitIdle(); await sleep(200);
  ok(await ev('window.__xss===undefined'), 'XSSが実行されない'); ok(await cnt('#resSearch img, #resSearch svg, #resSearch script') === 0, 'XSS要素が作られない');
  ok((await txt('#resSearch .tw .body')).includes('<img src=x onerror=window.__xss=1>') || (await txt('#resSearch')).includes('<img src=x'), 'タグが文字として表示される');
  await click('#tabDraft'); await setv('#draft', xss + xss); await sleep(400); ok(await ev('window.__xss===undefined'), '下書き経由でも実行されない');

  // 全角・大きいファイル警告(合成の確認は小さく: 100MB超は実ファイルを作らず挙動をコードで確認)
  // S11: 3万件
  const big = []; for (let i = 0; i < 30000; i++) big.push({ tweet: { id_str: String(i + 1), created_at: 'Mon Jan 15 10:15:00 +0000 2024', full_text: '合成投稿' + i + ' カフェのラテについて今日も書いています ' + (i % 97) + ' #カフェ' + (i % 13), favorite_count: String(i % 50), retweet_count: '1' } });
  const bigPath = wf('big.js', H + JSON.stringify(big));
  await open(1000, 900);
  await ev(`window.__hist=[];new MutationObserver(()=>window.__hist.push(document.getElementById("status").textContent.slice(0,12))).observe(document.getElementById("status"),{childList:true,subtree:true,characterData:true,attributes:true});window.__t0=0;1`);
  const t0 = Date.now(); await pick([bigPath]); await waitIdle(30000); const tl = Date.now() - t0; await sleep(300);
  const hist = await ev('window.__hist'); ok(hist.some(h => h.startsWith('読み込み中')), 'S11 読み込み中表示 ' + JSON.stringify(hist.slice(0, 3)));
  ok((await txt('#sum')).includes('30,000件を読み込みました'), 'S11 3万件読み込み'); ok(await cnt('#resSearch .tw') === 200, 'S11 200件で打ち切り ' + await cnt('#resSearch .tw'));
  ok((await txt('#resSearch .count')).includes('先頭の200件だけ表示'), 'S11 打ち切りの注記 ' + (await txt('#resSearch .count')));
  const t1 = Date.now(); await setv('#q', 'ラテ'); await sleep(300); const tq = Date.now() - t1; ok(await cnt('#resSearch .tw') === 200, 'S11 検索も200件');
  await click('#tabDraft'); await setv('#draft', '新メニューの季節のラテ、今週から始めます'); await sleep(1500); ok(!(await txt('#resDraft')).includes('下準備中'), 'S11 類似度が出る');
  console.log(`  S11 ブラウザ: 3万件の選択→表示まで ${tl}ms / 検索入力→表示 約${tq}ms(待機込み)`);

  // ===== S12 375px =====
  async function measure(label) {
    const r = await ev(`(()=>{const W=document.documentElement.clientWidth;const out={W:W,sw:document.documentElement.scrollWidth,over:[],small:[],small16:[]};
      document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent!==null&&(r.right>W+0.5||r.left<-0.5)&&!e.closest('.vh'))out.over.push(e.tagName+'.'+e.className+' '+Math.round(r.right));});
      document.querySelectorAll('button,.filebtn,select,input[type=search],textarea,.chk').forEach(e=>{if(e.offsetParent===null)return;const r=e.getBoundingClientRect();if(r.height<43.5)out.small.push(e.tagName+'.'+e.className+' '+Math.round(r.width)+'x'+Math.round(r.height));
        if(/INPUT|SELECT|TEXTAREA/.test(e.tagName)&&e.type!=='checkbox'&&parseFloat(getComputedStyle(e).fontSize)<16)out.small16.push(e.id);});
      return out})()`);
    ok(r.sw <= r.W, label + ' 横スクロールなし sw=' + r.sw + ' W=' + r.W); ok(r.over.length === 0, label + ' はみ出し ' + r.over.slice(0, 3)); ok(r.small.length === 0, label + ' 44px未満 ' + r.small.slice(0, 3)); ok(r.small16.length === 0, label + ' 16px未満の入力欄 ' + r.small16);
  }
  const long280 = 'あ'.repeat(40) + 'ラテ'.repeat(10) + 'Ｗ'.repeat(10) + '長い単語ほげほげほげほげほげほげほげ'.repeat(5) + 'http://example.com/' + 'a'.repeat(60) + ' #' + 'とても長いハッシュタグ'.repeat(4) + ' ' + 'x'.repeat(80);
  const longP = wf('long.js', H + JSON.stringify([mk({ id_str: '1', full_text: long280.slice(0, 280), favorite_count: '99999999', retweet_count: '12345678' }), mk({ id_str: '2', full_text: '改行つき\n\n投稿です。とても長いですね'.repeat(8).slice(0, 280) + ' #' + 'ロング'.repeat(15), favorite_count: '12', retweet_count: '3' })].concat(Array.from({ length: 6 }, (_, i) => mk({ id_str: 'z' + i, full_text: '新メニューの季節のラテ、今週から始めます ' + 'あいうえお'.repeat(i + 3) })))));
  for (const scheme of ['light', 'dark']) {
    await open(375, 800, scheme);
    await measure('375 初期(' + scheme + ')');
    await pick([wf('dm2.js', 'window.YTD.direct_messages.part0 = []')]); await waitIdle(); await measure('375 エラー(' + scheme + ')');
    await pick([longP]); await waitIdle(); await sleep(300); await measure('375 検索(' + scheme + ')');
    await click('.tw .more'); await measure('375 全文展開(' + scheme + ')');
    await click('#tabDraft'); await setv('#draft', '新メニューの季節のラテ、今週から始めます'); await sleep(500); await measure('375 被り確認(' + scheme + ')'); ok(await cnt('#resDraft .tw') >= 1, '375 被り結果あり');
    await click('#tabStats'); await sleep(100); await measure('375 偏り(' + scheme + ')');
    await pick([SAMPLE]); await waitIdle(); await sleep(300); await measure('375 サンプル偏り(' + scheme + ')');
    await click('#tabSearch'); await measure('375 サンプル検索(' + scheme + ')');
    const tabw = await ev('[...document.querySelectorAll(".tabs button")].map(b=>Math.round(b.getBoundingClientRect().width)+"x"+Math.round(b.getBoundingClientRect().height))'); if (scheme === 'light') console.log('  375 タブ', tabw.join(' '));
    const fb = await ev('(()=>{const r=document.getElementById("fileLabel").getBoundingClientRect();return Math.round(r.width)+"x"+Math.round(r.height)})()'); if (scheme === 'light') console.log('  375 ファイルを選ぶボタン', fb);
  }
  // 素性表記
  ok(await ev('!!document.querySelector(".mw-footer") && document.querySelector(".mw-footer").textContent.includes("みちAIワークス")'), 'mw-footerと屋号');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(!/href="#"/.test(htmlSrc) && !/forms\.gle|lin\.ee|bit\.ly/.test(htmlSrc), '短縮URL・href="#"なし');
  ok(errs.length === 0, '最終 JS例外なし ' + errs.join('|'));
  console.log(`e2e検算 ${pass + fail}件 失敗${fail}件`);
  ws.close(); chrome.kill(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } setTimeout(() => process.exit(fail ? 1 : 0), 300);
})();
