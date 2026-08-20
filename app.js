/* ============================================================
   拼豆工坊 · 核心管线（Canvas 渲染版）
   加载图 → 降采样 → 中位切分量化 → 目标网格 → 涂色校验
   用 <canvas> 取代万级 DOM 格子，超大网格也丝滑
============================================================ */

const SKINS = [
  { id:'simple',   name:'极简·四色',  file:'assets/skins/simple.jpg', paletteSize: 4 },
  { id:'diaochan', name:'霓裳·貂蝉',  file:'assets/skins/diaochan.jpg' },
  { id:'libai',    name:'剑仙·李白',  file:'assets/skins/libai.jpg' },
  { id:'hanxin',   name:'神枪·韩信',  file:'assets/skins/hanxin.jpg' },
  { id:'daji',     name:'九尾·妲己',  file:'assets/skins/daji.jpg' },
  { id:'wukong',   name:'齐天·悟空',  file:'assets/skins/wukong.jpg' },
  { id:'qingming', name:'汴河·赛博清明上河图', file:'assets/skins/qingming.jpg' },
  { id:'qingming_wide', name:'汴河·赛博清明上河图·横卷', file:'assets/skins/qingming_wide.jpg', wide: true },
];

const PALETTE_SIZE = 16;   // 中位切分初始主色数量
const DEDUP_THRESH = 2600; // 合并近似色的阈值（加权平方色距，约 17/通道）
const PLUS_COLS = 200;     // PLUS 档列数阈值
const PLUS_PALETTE_CUT = 28; // PLUS 初始中位切分色数
const PLUS_PALETTE_MIN = 20; // PLUS 去重后至少保留色数

const $ = id => document.getElementById(id);
const canvas = $('grid'), ctx = canvas.getContext('2d', { alpha:false });
const paletteEl = $('palette'), thumbsEl = $('thumbs');
const toastEl = $('toast'), victoryEl = $('victory');
const brushDot = $('brushDot'), brushName = $('brushName'), brushHex = $('brushHex');
const skinNameEl = $('skinName'), gridMetaEl = $('gridMeta');
const btnReveal = $('btnReveal'), btnFillAll = $('btnFillAll'), btnFillRow = $('btnFillRow');
const inCols = $('inCols'), inRows = $('inRows');
const statPct = $('statPct'), statDoneEl = $('statDone'), statTotalEl = $('statTotal');

let state = {
  skin: SKINS[0],
  cols: 45,
  palette: [],        // [{r,g,b,hex}]
  target: [],         // [idx] = palette 索引(-1 空)
  filled: [],         // [idx] = 已填色 palette 索引
  rows: 0,
  selected: -1,       // 画笔索引
  painting: false,
  hint: true,         // 默认显示底图，否则空格看不出该涂哪色
  revealed: false,
  autoFilling: false,
  total: 0,           // 可涂格子数（增量维护）
  done: 0,            // 已涂格子数（增量维护）
};

/* ---------- Canvas 画布状态 ---------- */
let cellW = 0, cellH = 0;   // 设备像素/格
const wrongSet = new Set();
const wrongTimers = new Map();
let drawScheduled = false;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let canvasRect = null;      // 命中测试用，resize/scroll 时失效
let loadGen = 0;            // 丢弃过期的异步 loadSkin 结果
let thumbsBuilt = false;
const imageCache = new Map();
const dsCanvas = document.createElement('canvas');
const dsCtx = dsCanvas.getContext('2d', { willReadFrequently: true });

function invalidateCanvasRect(){ canvasRect = null; }
function getCanvasRect(){
  if(!canvasRect) canvasRect = canvas.getBoundingClientRect();
  return canvasRect;
}
function clearWrongTimers(){
  for(const t of wrongTimers.values()) clearTimeout(t);
  wrongTimers.clear();
}

/* ---------- 1. 加载图片（按路径缓存） ---------- */
function loadImage(src){
  const hit = imageCache.get(src);
  if(hit) return Promise.resolve(hit);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { imageCache.set(src, img); res(img); };
    img.onerror = rej;
    img.src = src;
  });
}

/* ---------- 2. 降采样到 cols×rows，返回像素数组 ---------- */
function downsample(img, cols, rowsOverride){
  const ratio = img.naturalHeight / img.naturalWidth;
  const rows = rowsOverride || Math.max(8, Math.round(cols * ratio));
  dsCanvas.width = cols;
  dsCanvas.height = rows;
  dsCtx.imageSmoothingEnabled = true;
  dsCtx.drawImage(img, 0, 0, cols, rows);
  const data = dsCtx.getImageData(0, 0, cols, rows).data;
  const n = cols * rows;
  const px = new Array(n);
  for(let i=0;i<n;i++){
    const o = i * 4;
    px[i] = [data[o], data[o+1], data[o+2]];
  }
  return { px, rows };
}

/* ---------- 3. 中位切分量化 ---------- */
function medianCut(pixels, k){
  let boxes = [pixels.slice()];
  while(boxes.length < k){
    let bi = -1, best = -1;
    for(let i=0;i<boxes.length;i++){
      if(boxes[i].length < 2) continue;
      const r = boxRange(boxes[i]);
      if(r > best){ best = r; bi = i; }
    }
    if(bi === -1) break;
    const box = boxes[bi];
    const ch = longestChannel(box);
    box.sort((a,b)=> a[ch]-b[ch]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(avg).filter(Boolean);
}
function boxRange(box){
  if(!box.length) return 0;
  let rMin=255,gMin=255,bMin=255,rMax=0,gMax=0,bMax=0;
  for(const p of box){
    const r=p[0], g=p[1], b=p[2];
    if(r<rMin) rMin=r; if(r>rMax) rMax=r;
    if(g<gMin) gMin=g; if(g>gMax) gMax=g;
    if(b<bMin) bMin=b; if(b>bMax) bMax=b;
  }
  return Math.max(rMax-rMin, gMax-gMin, bMax-bMin);
}
function longestChannel(box){
  let rMin=255,gMin=255,bMin=255,rMax=0,gMax=0,bMax=0;
  for(const p of box){
    const r=p[0], g=p[1], b=p[2];
    if(r<rMin) rMin=r; if(r>rMax) rMax=r;
    if(g<gMin) gMin=g; if(g>gMax) gMax=g;
    if(b<bMin) bMin=b; if(b>bMax) bMax=b;
  }
  const dr=rMax-rMin, dg=gMax-gMin, db=bMax-bMin;
  return dr >= dg && dr >= db ? 0 : (dg >= db ? 1 : 2);
}
function avg(box){
  if(!box.length) return null;
  let r=0,g=0,b=0;
  for(const p of box){r+=p[0];g+=p[1];b+=p[2]}
  const n=box.length;
  r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
  return { r, g, b, hex:'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('') };
}

/* ---------- 4. 加权 RGB 色差 ---------- */
function colorDistRGB(r1,g1,b1,r2,g2,b2){
  const r=r1-r2, g=g1-g2, b=b1-b2;
  return 2*r*r + 4*g*g + 3*b*b;
}
function nearestPalette(rgb, palette){
  let bi=0, bd=Infinity;
  const r=rgb[0], g=rgb[1], b=rgb[2];
  for(let i=0;i<palette.length;i++){
    const p = palette[i];
    const d = colorDistRGB(r, g, b, p.r, p.g, p.b);
    if(d < bd){ bd=d; bi=i; }
  }
  return bi;
}
function dedupePalette(palette, thresh, minKeep = 0){
  const out = [];
  for(let i = 0; i < palette.length; i++){
    const c = palette[i];
    let merged = false;
    const remainAfter = palette.length - i - 1;
    for(const o of out){
      const d = colorDistRGB(c.r,c.g,c.b, o.r,o.g,o.b);
      if(d < thresh){
        // PLUS：合并后即便吃掉后续全部，也不得少于 minKeep
        if(minKeep && out.length + remainAfter < minKeep) break;
        o.r = Math.round((o.r + c.r)/2);
        o.g = Math.round((o.g + c.g)/2);
        o.b = Math.round((o.b + c.b)/2);
        o.hex = '#' + [o.r,o.g,o.b].map(x=>x.toString(16).padStart(2,'0')).join('');
        merged = true; break;
      }
    }
    if(!merged) out.push({ r:c.r, g:c.g, b:c.b, hex:c.hex });
  }
  return out;
}

/* ---------- 5. Canvas 绘制 ---------- */
function resizeCanvas(){
  dpr = Math.max(1, window.devicePixelRatio || 1);
  invalidateCanvasRect();
  const rect = getCanvasRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if(canvas.width !== w) canvas.width = w;
  if(canvas.height !== h) canvas.height = h;
  cellW = canvas.width / state.cols;
  cellH = canvas.height / state.rows;
  drawAll();
}

// 单格颜色解析
function cellColor(idx){
  const t = state.target[idx];
  if(t === -1) return { c:'#0d0820', a:1 };
  if(state.revealed) return { c:state.palette[t].hex, a:1 };
  const f = state.filled[idx];
  if(f !== undefined && f !== -1) return { c:state.palette[f].hex, a:1 };
  if(state.hint) return { c:state.palette[t].hex, a:0.42 };
  return { c:state.palette[t].hex, a:0.18 };
}

function drawCell(idx, inset){
  const c = idx % state.cols, r = (idx / state.cols) | 0;
  const x = c * cellW, y = r * cellH;
  const w = cellW - inset*2, h = cellH - inset*2;
  const { c:col, a } = cellColor(idx);
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.fillRect(x + inset, y + inset, w, h);
  ctx.globalAlpha = 1;
  if(wrongSet.has(idx)){
    ctx.strokeStyle = '#ff3b6b';
    ctx.lineWidth = Math.max(1, cellW/14);
    ctx.strokeRect(x+inset, y+inset, w, h);
    ctx.beginPath();
    ctx.moveTo(x+inset+2, y+inset+2);
    ctx.lineTo(x+inset+w-2, y+inset+h-2);
    ctx.moveTo(x+inset+w-2, y+inset+2);
    ctx.lineTo(x+inset+2, y+inset+h-2);
    ctx.stroke();
  }
}

function drawAll(){
  if(!state.palette.length || !state.cols || !cellW) return;
  ctx.fillStyle = '#0d0820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const inset = Math.max(0.5, Math.min(cellW * 0.07, 2));
  const n = state.cols * state.rows;
  for(let i=0;i<n;i++) drawCell(i, inset);
}

// 局部重绘：只刷新受影响格子，5 万格交互也丝滑
function redrawCells(idxs){
  if(!state.palette.length || !cellW) return;
  const inset = Math.max(0.5, Math.min(cellW * 0.07, 2));
  const n = state.cols * state.rows;
  for(const idx of idxs){
    if(idx < 0 || idx >= n) continue;
    const c = idx % state.cols, r = (idx / state.cols) | 0;
    const x = c * cellW, y = r * cellH;
    ctx.fillStyle = '#0d0820';
    ctx.fillRect(x, y, cellW, cellH);
    drawCell(idx, inset);
  }
}

// rAF 批量重绘，避免每帧多次重画
function scheduleDraw(){
  if(drawScheduled) return;
  drawScheduled = true;
  requestAnimationFrame(() => { drawScheduled = false; drawAll(); });
}

// 命中测试：用 CSS 盒比例换算，避免 dpr / 画布像素取整造成点偏
function hitTest(clientX, clientY){
  const rect = getCanvasRect();
  if(rect.width <= 0 || rect.height <= 0 || !state.cols || !state.rows) return -1;
  const c = Math.floor((clientX - rect.left) / rect.width * state.cols);
  const r = Math.floor((clientY - rect.top) / rect.height * state.rows);
  if(c<0 || c>=state.cols || r<0 || r>=state.rows) return -1;
  return r * state.cols + c;
}

/* ---------- 6. 色板 / 画笔 ---------- */
function renderPalette(){
  paletteEl.innerHTML = '';
  state.palette.forEach((p, i) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (i===state.selected ? ' active' : '');
    s.style.background = p.hex;
    s.title = p.hex;
    s.addEventListener('click', () => selectBrush(i));
    paletteEl.appendChild(s);
  });
  if(state.selected === -1 && state.palette.length){
    const counts = new Array(state.palette.length).fill(0);
    for(const t of state.target) if(t >= 0) counts[t]++;
    let best = 0, bestN = -1;
    for(let i = 0; i < counts.length; i++) if(counts[i] > bestN){ bestN = counts[i]; best = i; }
    selectBrush(best);
  }
}
function selectBrush(i){
  if(i<0 || i>=state.palette.length) return;
  state.selected = i;
  const swatches = paletteEl.children;
  for(let j=0;j<swatches.length;j++){
    swatches[j].classList.toggle('active', j === i);
  }
  const p = state.palette[i];
  brushDot.style.background = p.hex;
  brushDot.style.color = p.hex;
  brushName.textContent = `色卡 #${(i+1).toString().padStart(2,'0')}`;
  brushHex.textContent = p.hex.toUpperCase();
}

/* ---------- 7. 涂色校验（按索引，Canvas 友好） ---------- */
function paintCell(idx){
  if(state.revealed || state.autoFilling) return;
  const t = state.target[idx];
  if(t === -1) return;
  if(state.filled[idx] !== undefined && state.filled[idx] !== -1) return; // 已涂
  if(state.selected === -1){ showToast('请先选择颜色'); return; }
  if(state.selected === t){
    const wt = wrongTimers.get(idx);
    if(wt){ clearTimeout(wt); wrongTimers.delete(idx); }
    wrongSet.delete(idx);
    state.filled[idx] = t;
    state.done++;
    redrawCells([idx]); updateStats(); checkVictory();
  } else {
    wrongSet.add(idx);
    showToast('不能涂这个颜色！');
    redrawCells([idx]);
    const prev = wrongTimers.get(idx);
    if(prev) clearTimeout(prev);
    wrongTimers.set(idx, setTimeout(() => {
      wrongTimers.delete(idx);
      if(state.filled[idx] !== t){ wrongSet.delete(idx); redrawCells([idx]); }
    }, 800));
  }
}

// 显示底图时：点击格子 → 把该格目标色定位到取色板
function pickColor(idx){
  const t = state.target[idx];
  if(t === -1) return;
  const f = state.filled[idx];
  const pick = (f !== undefined && f !== -1) ? f : t;
  selectBrush(pick);
  showToast(`已定位 ${state.palette[pick].hex.toUpperCase()}`);
}
function onCellDown(idx, e){
  if(state.autoFilling) return;
  // 右键 / Alt / Shift：从格子取色；左键始终涂色（显示底图时也能画）
  if(e && (e.altKey || e.shiftKey || e.button === 2)){
    pickColor(idx);
    return;
  }
  state.painting = true;
  paintCell(idx);
}

/* ---------- 8. 一键偷懒 ---------- */
function getFillTargets(){
  const {cols, rows, selected} = state;
  const out = [];
  for(let i=0;i<rows*cols;i++){
    if(state.target[i]===selected && state.filled[i]!==selected) out.push(i);
  }
  return out;
}
function guardLazy(){
  if(state.selected === -1){ showToast('请先选择颜色'); return false; }
  if(state.revealed){ showToast('请先回到我的进度'); return false; }
  if(state.autoFilling) return false;
  return true;
}
function setLazyDisabled(d){ btnFillAll.disabled = d; btnFillRow.disabled = d; }
// 方式一：一键涂满
function fillAllInstant(){
  if(!guardLazy()) return;
  const targets = getFillTargets();
  if(!targets.length){ showToast('该颜色已全部涂完'); return; }
  for(const idx of targets){ state.filled[idx] = state.selected; wrongSet.delete(idx); }
  state.done += targets.length;
  scheduleDraw(); updateStats(); checkVictory();
}
// 方式二：逐行模拟手动点击（自适应批量，恒定约 3 秒播完）
function fillRowByRow(){
  if(!guardLazy()) return;
  const targets = getFillTargets();
  if(!targets.length){ showToast('该颜色已全部涂完'); return; }
  state.autoFilling = true; setLazyDisabled(true);
  const batch = Math.max(1, Math.ceil(targets.length / 300));
  let i = 0;
  const step = () => {
    if(!state.autoFilling) return;
    const slice = [];
    for(let k=0;k<batch && i<targets.length;k++,i++){
      state.filled[targets[i]] = state.selected; wrongSet.delete(targets[i]);
      slice.push(targets[i]);
    }
    state.done += slice.length;
    redrawCells(slice); updateStats();
    if(i >= targets.length){ state.autoFilling=false; setLazyDisabled(false); checkVictory(); return; }
    setTimeout(step, 10);
  };
  step();
}

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1100);
}

function updateStats(){
  const total = state.total;
  const done = state.done;
  const pct = total ? Math.round(done/total*100) : 0;
  statPct.textContent = pct + '%';
  statDoneEl.textContent = done;
  statTotalEl.textContent = total;
}

function checkVictory(){
  if(!state.total || state.done < state.total) return;
  showVictory();
}

/* ---------- 9. 彩蛋：彩虹屁鼓励 ---------- */
const PRAISES = [
  "天呐！你是被像素之神亲吻过的手吗！",
  "这手速，单身三十年练出来的吧（褒义）！",
  "艺术界震怒：又一个达芬奇被迫来写代码！",
  "涂得比我前任变脸还快！",
  "建议立刻去卢浮宫办个展，就现在！",
  "毕加索看了连夜复学三年！",
  "你的色感，比甲方需求还精准！",
  "这一刻，你把王者荣耀按在地上摩擦！",
  "像素见了你都得喊一声老师！",
  "确认过手速，是不拖延的狠人！",
];
const CONFETTI_EMOJI = ["✨","🌟","💫","🎨","🦄","🌈","💎","🔥","🎉"];
function spawnConfetti(){
  const box = $('confetti');
  box.innerHTML = '';
  for(let i=0;i<18;i++){
    const s = document.createElement('span');
    s.textContent = CONFETTI_EMOJI[Math.floor(Math.random()*CONFETTI_EMOJI.length)];
    s.style.left = Math.random()*100 + '%';
    s.style.animationDelay = (Math.random()*0.6)+'s';
    s.style.animationDuration = (1.8 + Math.random()*1.6)+'s';
    s.style.fontSize = (12 + Math.random()*16)+'px';
    box.appendChild(s);
  }
}
function showVictory(){
  const el = $('rainbowFart');
  let i = Math.floor(Math.random()*PRAISES.length);
  el.textContent = PRAISES[i];
  victoryEl.classList.add('show');
  spawnConfetti();
  clearInterval(showVictory._t);
  showVictory._t = setInterval(()=>{
    i = (i+1)%PRAISES.length;
    el.textContent = PRAISES[i];
  }, 2600);
}

/* ---------- 10. 交互事件（Canvas 命中测试） ---------- */
canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  invalidateCanvasRect();
  const idx = hitTest(e.clientX, e.clientY);
  if(idx >= 0) onCellDown(idx, e);
});
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  invalidateCanvasRect();
  const idx = hitTest(e.clientX, e.clientY);
  if(idx >= 0) pickColor(idx);
});
canvas.addEventListener('mousemove', e => {
  if(!state.painting) return;
  const idx = hitTest(e.clientX, e.clientY);
  if(idx >= 0) paintCell(idx);
});
window.addEventListener('mouseup', () => state.painting = false);
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  invalidateCanvasRect();
  const idx = hitTest(t.clientX, t.clientY);
  if(idx >= 0) onCellDown(idx);
  e.preventDefault();
}, {passive:false});
canvas.addEventListener('touchmove', e => {
  if(!state.painting) return;
  const t = e.touches[0];
  const idx = hitTest(t.clientX, t.clientY);
  if(idx >= 0) paintCell(idx);
  e.preventDefault();
}, {passive:false});
window.addEventListener('touchend', () => state.painting = false);
window.addEventListener('scroll', invalidateCanvasRect, true);

// 响应式：尺寸变化时重设画布像素并重绘
const ro = new ResizeObserver(() => resizeCanvas());
ro.observe(canvas);

/* ---------- 11. 缩略图 + 控件 ---------- */
function renderThumbs(){
  if(!thumbsBuilt){
    thumbsEl.innerHTML = '';
    SKINS.forEach(s => {
      const t = document.createElement('div');
      t.className = 'thumb' + (s.wide ? ' wide' : '');
      t.dataset.id = s.id;
      const img = document.createElement('img');
      img.src = s.file;
      img.alt = s.name;
      // 未标注时按实际宽高比决定是否占两格
      if(!s.wide){
        img.addEventListener('load', () => {
          if(img.naturalWidth > img.naturalHeight) t.classList.add('wide');
        }, { once:true });
      }
      const name = document.createElement('div');
      name.className = 'thumb-name';
      name.textContent = s.name.split('·')[1] || s.name;
      t.append(img, name);
      t.addEventListener('click', () => loadSkin(s));
      thumbsEl.appendChild(t);
    });
    thumbsBuilt = true;
  }
  const id = state.skin.id;
  for(const t of thumbsEl.children){
    t.classList.toggle('active', t.dataset.id === id);
  }
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v||min))}
function readSize(){
  state.cols = clamp(+inCols.value, 8, 250);
  const rv = inRows.value.trim();
  state.rows = rv === '' ? 0 : clamp(+rv, 8, 400); // 0 = 按图片宽高比自动
  inCols.value = state.cols;
  if(state.rows) inRows.value = state.rows;
}
$('sizeSwitch').addEventListener('click', e => {
  const b = e.target.closest('.seg.preset');
  if(!b) return;
  document.querySelectorAll('#sizeSwitch .seg.preset').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  inCols.value = b.dataset.cols;
  inRows.value = '';   // 预设只定列数，行数自动跟随图片宽高比
  loadSkin(state.skin);
});
$('btnApply').addEventListener('click', () => {
  document.querySelectorAll('#sizeSwitch .seg.preset').forEach(x=>x.classList.remove('active'));
  loadSkin(state.skin);
});
inCols.addEventListener('change', () => loadSkin(state.skin));
inRows.addEventListener('change', () => loadSkin(state.skin));

$('btnHint').addEventListener('click', e => {
  state.hint = !state.hint;
  e.target.classList.toggle('active', state.hint);
  scheduleDraw();
});
btnReveal.addEventListener('click', e => {
  state.revealed = !state.revealed;
  e.target.textContent = state.revealed ? '回到我的进度' : '查看完成图';
  e.target.classList.toggle('active', state.revealed);
  scheduleDraw();
});
btnFillAll.addEventListener('click', fillAllInstant);
btnFillRow.addEventListener('click', fillRowByRow);
$('btnReset').addEventListener('click', () => loadSkin(state.skin));
$('victoryReset').addEventListener('click', () => {
  victoryEl.classList.remove('show');
  loadSkin(SKINS[(SKINS.indexOf(state.skin)+1) % SKINS.length]);
});

/* ---------- 12. 主流程 ---------- */
async function loadSkin(skin){
  const gen = ++loadGen;
  state.skin = skin;
  state.selected = -1;
  state.filled = [];
  state.done = 0;
  state.total = 0;
  state.autoFilling = false;
  setLazyDisabled(false);
  wrongSet.clear();
  clearWrongTimers();
  victoryEl.classList.remove('show');
  clearInterval(showVictory._t);
  state.revealed = false;
  btnReveal.textContent = '查看完成图';
  btnReveal.classList.remove('active');
  skinNameEl.textContent = `载入中… ${skin.name}`;
  renderThumbs();
  updateStats();

  try{
    readSize();
    const img = await loadImage(skin.file);
    if(gen !== loadGen) return;

    const { px, rows } = downsample(img, state.cols, state.rows);
    if(gen !== loadGen) return;
    state.rows = rows;

    const isPlus = state.cols >= PLUS_COLS;
    // 显式 paletteSize（如极简四色）仍尊重；其余 PLUS 提高切分并至少保留 20 色
    let k = skin.paletteSize || PALETTE_SIZE;
    if(isPlus && !skin.paletteSize) k = Math.max(k, PLUS_PALETTE_CUT);
    const raw = medianCut(px, k);
    const minKeep = (isPlus && !skin.paletteSize) ? PLUS_PALETTE_MIN : 0;
    const palette = k <= 8 ? raw : dedupePalette(raw, DEDUP_THRESH, minKeep);
    palette.sort((a,b) => lum(a) - lum(b));
    state.palette = palette;

    const target = new Array(px.length);
    let total = 0;
    for(let i=0;i<px.length;i++){
      const [r,g,b] = px[i];
      const lumv = 0.2126*r + 0.7152*g + 0.0722*b;
      if(lumv < 14){
        target[i] = -1;
      } else {
        target[i] = nearestPalette([r,g,b], palette);
        total++;
      }
    }
    if(gen !== loadGen) return;
    state.target = target;
    state.total = total;
    state.done = 0;

    canvas.style.aspectRatio = `${state.cols} / ${rows}`;
    skinNameEl.textContent = skin.name;
    gridMetaEl.textContent = `${state.cols}×${rows} · ${palette.length}色`;

    renderPalette();
    updateStats();
    requestAnimationFrame(resizeCanvas); // 尺寸变化后再绘制
  }catch(err){
    if(gen !== loadGen) return;
    skinNameEl.textContent = '加载失败：' + err.message;
    console.error(err);
  }
}
function lum(c){return 0.2126*c.r + 0.7152*c.g + 0.0722*c.b}

// 启动
loadSkin(SKINS[0]);
