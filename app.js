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
  { id:'qingming_wide', name:'汴河·赛博清明上河图·横卷', file:'assets/skins/qingming_wide.jpg' },
];

const PALETTE_SIZE = 16;   // 中位切分初始主色数量
const DEDUP_THRESH = 2600; // 合并近似色的阈值（加权平方色距，约 17/通道）

const $ = id => document.getElementById(id);
const canvas = $('grid'), ctx = canvas.getContext('2d', { alpha:false });
const paletteEl = $('palette'), thumbsEl = $('thumbs');
const toastEl = $('toast'), victoryEl = $('victory');

let state = {
  skin: SKINS[0],
  cols: 45,
  palette: [],        // [{r,g,b,hex}]
  target: [],         // [idx] = palette 索引(-1 空)
  filled: [],         // [idx] = 已填色 palette 索引
  rows: 0,
  selected: -1,       // 画笔索引
  painting: false,
  hint: false,
  revealed: false,
  autoFilling: false,
};

/* ---------- Canvas 画布状态 ---------- */
let cellW = 0, cellH = 0;   // 设备像素/格
let hoverIdx = -1;
const wrongSet = new Set();
let drawScheduled = false;
const dpr = Math.max(1, window.devicePixelRatio || 1);

/* ---------- 1. 加载图片 ---------- */
function loadImage(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/* ---------- 2. 降采样到 cols×rows，返回像素数组 ---------- */
function downsample(img, cols, rowsOverride){
  const ratio = img.naturalHeight / img.naturalWidth;
  const rows = rowsOverride || Math.max(8, Math.round(cols * ratio));
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.drawImage(img, 0, 0, cols, rows);
  const data = cx.getImageData(0, 0, cols, rows).data;
  const px = new Array(cols * rows);
  for(let i=0;i<cols*rows;i++){
    px[i] = [data[i*4], data[i*4+1], data[i*4+2]];
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
  let mn=[255,255,255], mx=[0,0,0];
  for(const p of box){ for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],p[i]);mx[i]=Math.max(mx[i],p[i])} }
  return Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
}
function longestChannel(box){
  let mn=[255,255,255], mx=[0,0,0];
  for(const p of box){ for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],p[i]);mx[i]=Math.max(mx[i],p[i])} }
  const d=[mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]];
  return d.indexOf(Math.max(d[0],d[1],d[2]));
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
function colorDist(a, b){
  const r=a[0]-b[0], g=a[1]-b[1], b2=a[2]-b[2];
  return 2*r*r + 4*g*g + 3*b2*b2;
}
function nearestPalette(rgb, palette){
  let bi=0, bd=Infinity;
  for(let i=0;i<palette.length;i++){
    const d = colorDist(rgb, [palette[i].r, palette[i].g, palette[i].b]);
    if(d < bd){ bd=d; bi=i; }
  }
  return bi;
}
function dedupePalette(palette, thresh){
  const out = [];
  for(const c of palette){
    let merged = false;
    for(const o of out){
      const d = colorDist([c.r,c.g,c.b], [o.r,o.g,o.b]);
      if(d < thresh){
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
  const rect = canvas.getBoundingClientRect();
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
  if(state.hint) return { c:state.palette[t].hex, a:0.28 };
  return { c:'#1a1030', a:1 };
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
  // hover 高亮并入单格绘制，局部重绘也能带上
  if(idx === hoverIdx && !state.painting){
    ctx.strokeStyle = '#2de2e6';
    ctx.lineWidth = Math.max(1, cellW/10);
    ctx.strokeRect(x+0.5, y+0.5, cellW-1, cellH-1);
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

// 局部重绘：只刷新受影响格子（含 hover 高亮），5 万格交互也丝滑
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

// 命中测试：屏幕坐标 → 格子索引
function hitTest(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * dpr;
  const py = (clientY - rect.top) * dpr;
  const c = Math.floor(px / cellW), r = Math.floor(py / cellH);
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
  if(state.selected === -1 && state.palette.length) selectBrush(0);
}
function selectBrush(i){
  if(i<0 || i>=state.palette.length) return;
  state.selected = i;
  renderPalette();
  const p = state.palette[i];
  $('brushDot').style.background = p.hex;
  $('brushDot').style.color = p.hex;
  $('brushName').textContent = `色卡 #${(i+1).toString().padStart(2,'0')}`;
  $('brushHex').textContent = p.hex.toUpperCase();
}

/* ---------- 7. 涂色校验（按索引，Canvas 友好） ---------- */
function paintCell(idx){
  if(state.revealed || state.autoFilling) return;
  const t = state.target[idx];
  if(t === -1) return;
  if(state.filled[idx] !== undefined && state.filled[idx] !== -1) return; // 已涂
  if(state.selected === -1){ showToast('请先选择颜色'); return; }
  if(state.selected === t){
    wrongSet.delete(idx);
    state.filled[idx] = t;
    redrawCells([idx]); updateStats(); checkVictory();
  } else {
    wrongSet.add(idx);
    showToast('不能涂这个颜色！');
    redrawCells([idx]);
    setTimeout(() => { if(state.filled[idx] !== t){ wrongSet.delete(idx); redrawCells([idx]); } }, 800);
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
function onCellDown(idx){
  if(state.autoFilling) return;
  if(state.hint){ pickColor(idx); return; }
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
function setLazyDisabled(d){ $('btnFillAll').disabled = d; $('btnFillRow').disabled = d; }
// 方式一：一键涂满
function fillAllInstant(){
  if(!guardLazy()) return;
  const targets = getFillTargets();
  if(!targets.length){ showToast('该颜色已全部涂完'); return; }
  for(const idx of targets){ state.filled[idx] = state.selected; wrongSet.delete(idx); }
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
    const slice = [];
    for(let k=0;k<batch && i<targets.length;k++,i++){
      state.filled[targets[i]] = state.selected; wrongSet.delete(targets[i]);
      slice.push(targets[i]);
    }
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
  const total = state.target.filter(t => t !== -1).length;
  const done = state.filled.filter(f => f !== undefined && f !== -1).length;
  const pct = total ? Math.round(done/total*100) : 0;
  $('statPct').textContent = pct + '%';
  $('statDone').textContent = done;
  $('statTotal').textContent = total;
}

function checkVictory(){
  for(let i=0;i<state.target.length;i++){
    if(state.target[i] === -1) continue;
    if(state.filled[i] !== state.target[i]) return;
  }
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
  const idx = hitTest(e.clientX, e.clientY);
  if(idx >= 0) onCellDown(idx);
});
canvas.addEventListener('mousemove', e => {
  const idx = hitTest(e.clientX, e.clientY);
  if(state.painting && idx >= 0) paintCell(idx);
  if(idx !== hoverIdx){
    const prev = hoverIdx; hoverIdx = idx;
    const cells = [];
    if(prev >= 0) cells.push(prev);
    if(idx >= 0) cells.push(idx);
    if(cells.length) redrawCells(cells);
  }
});
canvas.addEventListener('mouseleave', () => {
  const prev = hoverIdx; hoverIdx = -1;
  if(prev >= 0) redrawCells([prev]);
});
window.addEventListener('mouseup', () => state.painting = false);
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
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

// 响应式：尺寸变化时重设画布像素并重绘
const ro = new ResizeObserver(() => resizeCanvas());
ro.observe(canvas);

/* ---------- 11. 缩略图 + 控件 ---------- */
function renderThumbs(){
  thumbsEl.innerHTML = '';
  SKINS.forEach(s => {
    const t = document.createElement('div');
    t.className = 'thumb' + (s.id===state.skin.id ? ' active' : '');
    t.innerHTML = `<img src="${s.file}" alt="${s.name}"><div class="thumb-name">${s.name.split('·')[1]||s.name}</div>`;
    t.addEventListener('click', () => loadSkin(s));
    thumbsEl.appendChild(t);
  });
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v||min))}
function readSize(){
  state.cols = clamp(+$('inCols').value, 8, 250);
  const rv = $('inRows').value.trim();
  state.rows = rv === '' ? 0 : clamp(+rv, 8, 400); // 0 = 按图片宽高比自动
  $('inCols').value = state.cols;
  if(state.rows) $('inRows').value = state.rows;
}
$('sizeSwitch').addEventListener('click', e => {
  const b = e.target.closest('.seg.preset');
  if(!b) return;
  document.querySelectorAll('#sizeSwitch .seg.preset').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $('inCols').value = b.dataset.cols;
  $('inRows').value = '';   // 预设只定列数，行数自动跟随图片宽高比
  loadSkin(state.skin);
});
$('btnApply').addEventListener('click', () => {
  document.querySelectorAll('#sizeSwitch .seg.preset').forEach(x=>x.classList.remove('active'));
  loadSkin(state.skin);
});
$('inCols').addEventListener('change', () => loadSkin(state.skin));
$('inRows').addEventListener('change', () => loadSkin(state.skin));

$('btnHint').addEventListener('click', e => {
  state.hint = !state.hint;
  e.target.classList.toggle('active', state.hint);
  scheduleDraw();
});
$('btnReveal').addEventListener('click', e => {
  state.revealed = !state.revealed;
  e.target.textContent = state.revealed ? '回到我的进度' : '查看完成图';
  e.target.classList.toggle('active', state.revealed);
  scheduleDraw();
});
$('btnFillAll').addEventListener('click', fillAllInstant);
$('btnFillRow').addEventListener('click', fillRowByRow);
$('btnReset').addEventListener('click', () => loadSkin(state.skin));
$('victoryReset').addEventListener('click', () => {
  victoryEl.classList.remove('show');
  loadSkin(SKINS[(SKINS.indexOf(state.skin)+1) % SKINS.length]);
});

/* ---------- 12. 主流程 ---------- */
async function loadSkin(skin){
  state.skin = skin;
  state.selected = -1;
  state.filled = [];
  wrongSet.clear();
  victoryEl.classList.remove('show');
  clearInterval(showVictory._t);
  state.revealed = false;
  $('btnReveal').textContent = '查看完成图';
  $('btnReveal').classList.remove('active');
  $('skinName').textContent = `载入中… ${skin.name}`;
  renderThumbs();

  try{
    readSize();
    const img = await loadImage(skin.file);
    const { px, rows } = downsample(img, state.cols, state.rows);
    state.rows = rows;

    const k = skin.paletteSize || PALETTE_SIZE;
    const raw = medianCut(px, k);
    const palette = k <= 8 ? raw : dedupePalette(raw, DEDUP_THRESH);
    palette.sort((a,b) => lum(a) - lum(b));
    state.palette = palette;

    const target = new Array(px.length);
    for(let i=0;i<px.length;i++){
      const [r,g,b] = px[i];
      const lumv = 0.2126*r + 0.7152*g + 0.0722*b;
      target[i] = lumv < 14 ? -1 : nearestPalette([r,g,b], palette);
    }
    state.target = target;

    canvas.style.aspectRatio = `${state.cols} / ${rows}`;
    $('skinName').textContent = skin.name;
    $('gridMeta').textContent = `${state.cols}×${rows} · ${palette.length}色`;

    renderPalette();
    requestAnimationFrame(resizeCanvas); // 尺寸变化后再绘制
  }catch(err){
    $('skinName').textContent = '加载失败：' + err.message;
    console.error(err);
  }
}
function lum(c){return 0.2126*c.r + 0.7152*c.g + 0.0722*c.b}

// 启动
loadSkin(SKINS[0]);
