// 投稿カード用の実画面を撮る(Chrome headless / CDP)。サンプルは架空のカフェ店主の架空の投稿。
// 実行: node source/shoot.js <出力フォルダ> [YYYY-MM-DD]
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http'), os = require('os');
const OUT = path.resolve(process.argv[2]); const DATE = process.argv[3] || '2026-10-08';
fs.mkdirSync(OUT, { recursive: true });
const PAGE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xpa-shoot-'));
cp.execFileSync('node', [path.join(__dirname, 'make-sample.js'), path.join(TMP, 'tweets.js')], { stdio: 'ignore' });
fs.writeFileSync(path.join(TMP, 'direct-message.js'), 'window.YTD.direct_messages.part0 = [{"dmConversation":{"conversationId":"1-2","messages":[]}}]');
(async () => {
  const chrome = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=9352', '--user-data-dir=' + path.join(TMP, 'prof'), '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 50; i++) { try { t = await getJson('http://127.0.0.1:9352/json'); if (t.length) break; } catch (e) { } await sleep(200); }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = {}; ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result.result.value;
  await send('Page.enable'); await send('DOM.enable');
  async function open(w, h, dpr, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await send('Page.navigate', { url: PAGE }); for (let i = 0; i < 60; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(100); } await sleep(300);
  }
  async function pick(f) { const doc = (await send('DOM.getDocument')).result.root.nodeId; const q = (await send('DOM.querySelector', { nodeId: doc, selector: '#file' })).result.nodeId; await send('DOM.setFileInputFiles', { nodeId: q, files: [f] }); await sleep(700); }
  const setv = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();return 1})()`);
  async function shot(file, y0, y1, w) {
    const r = JSON.parse(await ev(`JSON.stringify({y0:${y0},y1:${y1}})`));
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: r.y0, width: w, height: r.y1 - r.y0, scale: 1 } });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(s.result.data, 'base64')); console.log('wrote', file, r);
  }
  const TOP = 'document.querySelector("h1").getBoundingClientRect().top+scrollY-12';
  // Card1: デスクトップ1000px・被り確認タブ・下書きを入れた直後
  await open(1000, 900, 2, false); await pick(path.join(TMP, 'tweets.js'));
  await ev('document.getElementById("tabDraft").click()'); await setv('#draft', '新メニューの季節のラテ、今週から始めます'); await sleep(600);
  await shot('01-desktop-draft-' + DATE + '.png', TOP, 'Math.max(document.querySelector(".col-out").getBoundingClientRect().bottom,document.querySelector(".col-in").getBoundingClientRect().bottom)+scrollY+8', 1000);
  await shot('source-desktop-full.png', '0', 'document.documentElement.scrollHeight', 1000);
  // Card2候補A: 375px・DMのファイルを選んだときのエラー
  await open(375, 900, 2, true); await pick(path.join(TMP, 'direct-message.js'));
  await shot('02a-mobile375-error-' + DATE + '.png', TOP, 'document.getElementById("fileLabel").closest(".card").getBoundingClientRect().bottom+scrollY+8', 375);
  // Card2候補B: 375px・読み込み成功後の検索（ラテ・反応が多い順）
  await open(375, 900, 2, true); await pick(path.join(TMP, 'tweets.js'));
  await setv('#q', 'ラテ'); await ev('(()=>{const s=document.getElementById("sort");s.value="reaction";s.dispatchEvent(new Event("change"))})()'); await sleep(500);
  await shot('02b-mobile375-search-' + DATE + '.png', TOP, 'document.querySelectorAll("#resSearch .tw")[2].getBoundingClientRect().bottom+scrollY+8', 375);
  await shot('source-mobile375-search-full.png', '0', 'document.documentElement.scrollHeight', 375);
  ws.close(); chrome.kill(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } setTimeout(() => process.exit(0), 300);
})();
