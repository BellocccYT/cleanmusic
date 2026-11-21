'use strict';

// Capture CleanMusic marketing screenshots in Electron, using an isolated
// disposable profile and local demo fixtures only.
// Run from the repository root: npx electron marketing/capture-screenshots.js

const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'screenshots');
const PROFILE = path.join(app.getPath('temp'), 'cleanmusic-marketing-capture');
const W = 1920;
const H = 1080;

// This named profile belongs only to this capture script, never to the user.
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', PROFILE);
app.on('will-quit', () => fs.rmSync(PROFILE, { recursive: true, force: true }));

const demoCover = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5b8cff"/><stop offset="1" stop-color="#35e0c0"/></linearGradient><radialGradient id="r"><stop stop-color="#e8ecf3" stop-opacity=".38"/><stop offset="1" stop-color="#080a0e" stop-opacity="0"/></radialGradient></defs>
    <rect width="800" height="800" rx="80" fill="#0b0e14"/><circle cx="400" cy="400" r="330" fill="url(#g)"/><circle cx="400" cy="400" r="300" fill="none" stroke="#e8ecf3" stroke-opacity=".24" stroke-width="3"/><circle cx="400" cy="400" r="230" fill="none" stroke="#080a0e" stroke-opacity=".3" stroke-width="4"/><circle cx="400" cy="400" r="150" fill="url(#r)"/><circle cx="400" cy="400" r="34" fill="#080a0e"/><circle cx="400" cy="400" r="10" fill="#e8ecf3"/><text x="400" y="680" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="42" font-weight="700" fill="#e8ecf3">CLEANMUSIC · DEMO</text>
  </svg>`)}`;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(win, name) {
  let image;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pause(attempt ? 650 : 500);
    image = await win.webContents.capturePage();
    if (!image.isEmpty()) break;
  }
  if (!image || image.isEmpty()) throw new Error(`Electron returned an empty capture for ${name}`);
  const output = image.getSize().width === W && image.getSize().height === H
    ? image
    : image.resize({ width: W, height: H, quality: 'best' });
  fs.writeFileSync(path.join(OUT, name), output.toPNG());
  console.log(`CAPTURE_OK ${name} ${W}x${H}`);
}

async function main() {
  // No page request leaves Electron. Artwork is a self-created SVG fixture.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: true,
    frame: false,
    backgroundColor: '#080a0e',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setZoomFactor(1);
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  await pause(1800);

  const fixtureCss = `
    .capture-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:12px 0 22px}
    .capture-card{min-width:0;padding:12px;border:1px solid #232c3a;border-radius:16px;background:#11161f;color:#e8ecf3}
    .capture-cover{aspect-ratio:1/1;border-radius:11px;background-image:url('${demoCover}');background-size:cover;background-position:center}
    .capture-card strong{display:block;margin-top:10px;font-size:15px}.capture-card span{display:block;color:#8d99ac;font-size:12px}
    .capture-wave-panel{margin:16px 0;padding:18px;border:1px solid #232c3a;border-radius:16px;background:#11161f}
    .capture-wave-panel h3{margin:0 0 12px}.capture-wave{display:block;width:100%;height:190px;border-radius:12px;background:#0b0e14}
    .capture-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.capture-tags span{padding:6px 10px;border:1px solid #232c3a;border-radius:99px;color:#8d99ac;font-size:12px}
    .capture-overlay-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:22px}
    .capture-overlay{min-height:118px;display:flex;align-items:center;gap:15px;padding:17px;border:1px solid #232c3a;border-radius:18px;background:#11161f;color:#e8ecf3;box-shadow:0 12px 32px rgba(8,10,14,.38)}
    .capture-overlay .disc{width:62px;height:62px;flex:none;border-radius:50%;background:radial-gradient(circle,#080a0e 0 8%,#35e0c0 9% 12%,#11161f 13% 35%,#5b8cff 36%);box-shadow:0 0 0 4px #232c3a}
    .capture-overlay .meta{min-width:0}.capture-overlay b{display:block;font-size:17px}.capture-overlay small{color:#8d99ac}
    .capture-overlay .bar{height:4px;margin-top:10px;border-radius:5px;background:linear-gradient(90deg,#5b8cff,#35e0c0)}
    .capture-overlay.bar{min-height:82px;border-radius:999px}.capture-overlay.bar .disc{width:42px;height:42px}
    .capture-overlay.neon{border-color:#5b8cff;box-shadow:0 0 22px rgba(91,140,255,.3)}.capture-overlay.glass{background:linear-gradient(135deg,#1b2230,#11161f)}
    .capture-overlay.ticker{border-radius:7px;background:linear-gradient(90deg,#5b8cff,#35e0c0)}
    .capture-overlay.ticker small{color:#080a0e}.capture-overlay.minimal{background:transparent;border-color:transparent;box-shadow:none}
    .capture-overlay.eq .eq-bars{display:flex;align-items:center;gap:4px;height:26px;margin-top:8px}.capture-overlay.eq .eq-bars i{width:5px;height:var(--h);border-radius:5px;background:#35e0c0}
    .capture-overlay.square{flex-direction:column;align-items:flex-start;min-height:155px}.capture-overlay.square .disc{width:48px;height:48px}
    .capture-overlay.lyrics{display:block}.capture-overlay.lyrics .disc{display:none}
    .capture-wave-marker{stroke:#ffbf5e;stroke-width:3;stroke-dasharray:7 6}
    .fs-next.capture-next{display:block!important;position:absolute;right:38px;bottom:48px;width:300px;padding:16px;border:1px solid #232c3a;border-radius:18px;background:#11161f;color:#e8ecf3}
    .fs-next.capture-next h3{margin:0 0 10px;color:#35e0c0}.fs-next.capture-next p{margin:8px 0;color:#8d99ac;font-size:13px}
    #fs-lyrics.capture-lyrics{display:block!important;position:relative;max-width:850px;min-height:300px;margin-top:34px;overflow:visible;-webkit-mask-image:none;mask-image:none}
    #fs-lyrics.capture-lyrics .ly-kinetic{display:grid;gap:16px;align-content:center;height:100%}
    #fs-lyrics.capture-lyrics .ly-k-line{margin:0;color:#e8ecf3;font-size:clamp(34px,4vw,64px);font-weight:900;line-height:1.08;letter-spacing:-.04em;text-transform:uppercase}
    #fs-lyrics.capture-lyrics .ly-k-line span{display:inline-block;margin-right:.26em;text-shadow:0 8px 25px rgba(8,10,14,.7)}
    #fs-lyrics.capture-lyrics .ly-k-line span.hl{color:#35e0c0;text-shadow:0 0 22px rgba(53,224,192,.65)}
    #fs-lyrics.capture-lyrics .ly-k-next{margin:8px 0 0;color:#8d99ac;font-size:20px}
  `;

  await win.webContents.executeJavaScript(`(() => {
    const style=document.createElement('style');style.textContent=${JSON.stringify(fixtureCss)};document.head.append(style);
    const onboarding=document.querySelector('#onboarding');if(onboarding)onboarding.hidden=true;
    document.querySelectorAll('#service-nav .svc-badge').forEach((node)=>node.remove());
    document.querySelectorAll('.service-card .svc-badge').forEach((node)=>node.remove());
    window.__cmDemoCover=${JSON.stringify(demoCover)};
    window.__cmAddCards=(host,count=4)=>{host.innerHTML='<div class="capture-cards">'+Array.from({length:count},(_,i)=>'<article class="capture-card"><div class="capture-cover"></div><strong>'+(i===0?'Fluffing a Duck':'Demo-Datensatz')+'</strong><span>'+(i===0?'Kevin MacLeod · CC BY 4.0':'Eigene Platzhalterdaten · Demo')+'</span></article>').join('')+'</div>';};
  })()`);

  // Home: use local-only fictional fixture cards; the real shell and layout remain.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.setTheme('nacht');window.CleanMusic.showView('home');
    const rec=document.querySelector('#home-recs');if(rec)window.__cmAddCards(rec,4);
    const charts=document.querySelector('#home-charts');if(charts)window.__cmAddCards(charts,4);
    document.querySelectorAll('#view-home .charts-empty').forEach((el)=>el.remove());
    document.querySelectorAll('#view-home .service-card').forEach((el)=>el.style.display='none');
    document.querySelectorAll('#view-home .status-chip').forEach((el)=>el.remove());
  })()`);
  await capture(win, 'startseite.png');

  // Fullscreen turntable and particle-look visualization, with original artwork.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.setVinyl(true);window.CleanMusic.openFullscreen();
    const img=document.querySelector('#fs-cover-img');img.src=window.__cmDemoCover;img.hidden=false;document.querySelector('#fs-cover-letter').hidden=true;
    document.querySelector('#fs-title').textContent='Fluffing a Duck';document.querySelector('#fs-artist').textContent='Kevin MacLeod';
    const badge=document.querySelector('#fs-badge');badge.textContent='VOLL · CC BY 4.0';badge.hidden=false;
    document.documentElement.classList.add('cover-vinyl','is-playing');
    document.querySelectorAll('#fs-styles button').forEach((b)=>b.classList.toggle('active',b.dataset.fsStyle==='particles'));
    const canvas=document.querySelector('#fs-viz');const ctx=canvas.getContext('2d');canvas.width=1920;canvas.height=1080;ctx.clearRect(0,0,1920,1080);
    for(let i=0;i<125;i++){const a=i*2.399,r=130+(i%17)*25,x=960+Math.cos(a)*r,y=500+Math.sin(a)*r;ctx.beginPath();ctx.arc(x,y,2+(i%4),0,Math.PI*2);ctx.fillStyle=i%2?'rgba(53,224,192,.8)':'rgba(91,140,255,.82)';ctx.fill();}
    const next=document.querySelector('#fs-next');next.hidden=false;next.classList.add('capture-next');next.innerHTML='<h3>ALS NÄCHSTES</h3><p>♪ &nbsp; Sneaky Snitch · Kevin MacLeod</p><p>♪ &nbsp; Local Forecast · Kevin MacLeod</p><p>Demo-Warteschlange</p>';
  })()`);
  await capture(win, 'vollbild-plattenspieler.png');

  // Motion lyrics use original demo copy, not published song lyrics.
  await win.webContents.executeJavaScript(`(() => {
    const host=document.querySelector('#fs-lyrics');host.hidden=false;host.classList.add('capture-lyrics');host.dataset.effect='kinetic';host.dataset.fx='kinetic';host.dataset.align='left';host.dataset.size='xl';
    host.innerHTML='<div class="ly-kinetic"><div class="ly-k-line"><span>LICHT</span><span class="hl">AN,</span><span>DER</span><span>WEG</span></div><div class="ly-k-line"><span>FÜHRT</span><span class="hl">WEITER</span></div><p class="ly-k-next">Demo-Text · eigens geschrieben</p></div>';
    document.querySelector('#fs-lyrics-tools').hidden=false;document.querySelector('#fs-lyrics-tools').innerHTML='<button>Effekt: Motion</button><button>Großansicht</button>';
    document.querySelector('#fs-lyrics-btn').classList.add('active');
  })()`);
  await capture(win, 'songtext-motion.png');
  await win.webContents.executeJavaScript('window.CleanMusic.closeFullscreen()');

  // Cutter screenshot: app shell plus a clearly labeled, locally drawn waveform fixture.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.setTheme('nacht');window.CleanMusic.setCreator('classics','all');
    const list=document.querySelector('#creator-list');
    if(list){list.innerHTML='<div class="results-head"><span>Demo-Auswahl · freie Musik</span><span class="muted small">Kevin MacLeod · CC BY 4.0</span></div><div class="capture-wave-panel"><h3>Fluffing a Duck <span class="muted small">· Tempo-Filter · CC BY 4.0</span></h3><svg class="capture-wave" viewBox="0 0 1200 190" preserveAspectRatio="none"><defs><linearGradient id="waveG"><stop stop-color="#5b8cff"/><stop offset="1" stop-color="#35e0c0"/></linearGradient></defs><rect width="1200" height="190" rx="12" fill="#0b0e14"/><path d="${'M0 95 '+Array.from({length:120},(_,i)=>`L${i*10} ${95+Math.sin(i*1.3)*((i%7)*9+9)}`).join(' ')}" fill="none" stroke="url(#waveG)" stroke-width="5"/><path d="M260 20V170M890 20V170" class="capture-wave-marker"/><rect x="260" y="25" width="630" height="140" fill="rgba(53,224,192,.08)"/><text x="260" y="184" fill="#ffbf5e" font-size="13">IN-MARKE</text><text x="835" y="184" fill="#ffbf5e" font-size="13">OUT-MARKE</text></svg><div class="capture-tags"><span>BPM-Filter</span><span>Schnittmarken setzen</span><span>WAV-Ausschnitt · Credit inklusive</span></div></div><div class="song-row"><div class="song-art"><img src="${demoCover}" alt=""></div><div class="song-main"><strong>Fluffing a Duck</strong><small>Kevin MacLeod · CC BY 4.0</small></div><span class="source-tag">CC BY</span><button class="btn ghost small">Credit kopieren</button></div>';}
    const credits=document.querySelector('#creator-credits');if(credits)credits.innerHTML='<div class="credits-head"><h3>Video-Credits</h3><span class="credits-count">Demo</span></div><p class="muted small">Credits der gewählten freien Titel sammeln und gesammelt übernehmen.</p><ol class="credits-list"><li><div><strong>Fluffing a Duck</strong><span>Kevin MacLeod · CC BY 4.0</span></div></li></ol><div class="row"><button class="btn primary small">Alle kopieren</button></div>';
    const cut=document.querySelector('#cut-panel');if(cut)cut.hidden=true;
    document.querySelectorAll('#service-nav .svc-badge').forEach((node)=>node.remove());
  })()`);
  await pause(500);
  await capture(win, 'cutter-wellenform.png');

  // Overlay styles: original UI illustration, not a screenshot of OBS branding.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.showView('home');const home=document.querySelector('#view-home');
    const styles=[['Karte mit Cover','card'],['Schmale Leiste','bar'],['Nur Text','minimal'],['Plattenspieler','vinyl'],['Neon','neon'],['Glas','glass'],['Equalizer','eq'],['Laufschrift','ticker'],['Großes Cover','square'],['Songtext','lyrics']];
    home.innerHTML='<div class="page"><div class="page-head"><div><div class="eyebrow">Optionales Plugin · lokale Vorschau</div><h2>OBS-Overlay · 10 Stile</h2><p>Now Playing und „Als Nächstes“ als separate Browserquellen.</p></div></div><div class="capture-overlay-grid">'+styles.map(([name,style],i)=>'<div class="capture-overlay '+style+'"><div class="disc"></div><div class="meta"><b>'+(i===0?'Fluffing a Duck':'Gerade läuft')+'</b><small>Kevin MacLeod · '+name+'</small><div class="bar"></div>'+(style==='eq'?'<div class="eq-bars"><i style="--h:45%"></i><i style="--h:90%"></i><i style="--h:60%"></i><i style="--h:100%"></i><i style="--h:55%"></i></div>':'')+(style==='lyrics'?'<small>LICHT AN, DER WEG FÜHRT WEITER</small>':'')+'</div></div>').join('')+'</div></div>';
    document.querySelectorAll('#service-nav .svc-badge').forEach((node)=>node.remove());
  })()`);
  await capture(win, 'obs-overlay.png');

  // No synthetic statistics: show the honest first-run empty state.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.showView('review');
    const head=document.querySelector('#view-review .page-head');if(head){const note=document.createElement('p');note.className='muted small';note.textContent='Demo-Profil ohne echte Hör-Daten';head.querySelector('div').append(note);}
    document.querySelectorAll('#service-nav .svc-badge').forEach((node)=>node.remove());
  })()`);
  await capture(win, 'dein-rueckblick.png');

  // Native palette gallery: actual 16-theme panel, no third-party imagery.
  await win.webContents.executeJavaScript(`(() => {
    window.CleanMusic.showView('settings');window.CleanMusic.setTheme('nacht');
    const panel=document.querySelector('#theme-panel');if(panel)panel.scrollIntoView({block:'start'});
    document.querySelectorAll('#service-nav .svc-badge').forEach((node)=>node.remove());
  })()`);
  await capture(win, 'themes-raster.png');

  win.destroy();
  app.quit();
}

app.whenReady().then(() => main().catch((error) => {
  console.error('CAPTURE_FAIL', error && error.stack || error);
  app.exit(1);
}));
