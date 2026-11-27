'use strict';
const $ = id => document.getElementById(id);
const view = $('view'), original = $('original'), overlay = $('mask');
const sheet = $('sheet'), stage = $('stage'), outline = $('selection');
const ctx = view.getContext('2d', {willReadFrequently: true});
let filename = '', mode = 'select', selection = null, drag = null;
let customFilename = '';
let edited = false, comparing = false, busy = false, fileVersion = 0;

function message(text) { $('feedback').textContent = text; }

function displayedCanvas() {
  return comparing ? original : view;
}

function fit() {
  const css = getComputedStyle(stage);
  const availableWidth = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const availableHeight = stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
  const canvas = displayedCanvas();
  const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  sheet.style.width = Math.max(1, canvas.width * scale) + 'px';
  sheet.style.height = Math.max(1, canvas.height * scale) + 'px';
}
new ResizeObserver(fit).observe(stage);

function showSelection(box) {
  outline.hidden = !box;
  if (!box) return;
  const canvas = displayedCanvas();
  outline.style.left = (100 * box.x / canvas.width) + '%';
  outline.style.top = (100 * box.y / canvas.height) + '%';
  outline.style.width = (100 * box.w / canvas.width) + '%';
  outline.style.height = (100 * box.h / canvas.height) + '%';
}

function update() {
  const canvas = displayedCanvas();
  const box = selection?.source === canvas ? selection : null;
  $('dims').textContent = canvas.width + ' × ' + canvas.height;
  $('state').textContent = comparing ? '原图对照' : box ? '已选区域' : edited ? '处理结果' : '原图';
  $('crop').setAttribute('aria-pressed', String(mode === 'crop'));
  $('select').setAttribute('aria-pressed', String(mode === 'select'));
  $('confirm').hidden = !box || !!drag;
  $('confirm').disabled = busy;
  $('confirm').textContent = busy ? '正在处理…' : mode === 'crop' ? '确认裁剪' : '确认去水印';
  $('export').disabled = (!edited && !customFilename) || !$('nameForm').hidden || comparing || busy || !!selection || !!drag;
  $('compare').disabled = !edited || busy || !!drag;
  $('compare').textContent = comparing ? '查看处理结果' : '查看原图';
  $('compare').setAttribute('aria-pressed', String(comparing));
  for (const id of ['crop', 'select', 'open', 'demo', 'file', 'rename']) $(id).disabled = busy;
  overlay.dataset.mode = mode;
  showSelection(box);
}

function showCanvas() {
  view.hidden = comparing;
  original.hidden = !comparing;
  fit();
}

function resetImage(image, name) {
  filename = name;
  customFilename = '';
  $('nameForm').hidden = true;
  $('nameDisplay').hidden = false;
  mode = 'select';
  selection = drag = null;
  edited = comparing = false;
  for (const canvas of [original, view]) {
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
  }
  $('filename').textContent = filename;
  showCanvas();
  update();
}

const nameInput = $('nameInput');

$('rename').onclick = () => {
  nameInput.value = (customFilename || filename).replace(/\.[^.]+$/, '');
  nameInput.setCustomValidity('');
  $('nameDisplay').hidden = true;
  $('nameForm').hidden = false;
  update();
  nameInput.focus();
  nameInput.select();
};

function finishNaming() {
  $('nameForm').hidden = true;
  $('nameDisplay').hidden = false;
  $('filename').textContent = customFilename || filename;
  update();
  $('rename').focus();
}

nameInput.oninput = () => nameInput.setCustomValidity('');
$('nameForm').onsubmit = event => {
  event.preventDefault();
  const stem = nameInput.value.trim().replace(/(?:\.(?:png|jpe?g|webp))+$/i, '').trim();
  const pngName = stem + '.png';
  let error = '';
  if (!stem || /^\.+$/.test(stem)) error = '请输入图片名称。';
  else if (/[<>:"/\\|?*\u0000-\u001f]/.test(stem) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) error = '这个名称无法用于文件，请换一个。';
  else if (new TextEncoder().encode(pngName).length > 255) error = '文件名过长，请缩短后保存。';
  nameInput.setCustomValidity(error);
  if (!nameInput.reportValidity()) return;
  customFilename = pngName;
  finishNaming();
};
$('cancelName').onclick = finishNaming;
$('nameForm').onkeydown = event => {
  if (event.key === 'Escape' && !event.isComposing) {
    event.stopPropagation();
    finishNaming();
  }
};

function point(event) {
  const rect = overlay.getBoundingClientRect();
  const canvas = displayedCanvas();
  return {
    x: Math.max(0, Math.min(canvas.width, Math.round((event.clientX - rect.left) * canvas.width / rect.width))),
    y: Math.max(0, Math.min(canvas.height, Math.round((event.clientY - rect.top) * canvas.height / rect.height)))
  };
}

function boxBetween(start, end) {
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  if (!w || !h) return null;
  return {x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h};
}

overlay.addEventListener('pointerdown', event => {
  if (busy || drag || event.button !== 0) return;
  drag = {id: event.pointerId, start: point(event)};
  overlay.setPointerCapture(event.pointerId);
  update();
  showSelection(null);
});
overlay.addEventListener('pointermove', event => {
  if (drag && drag.id === event.pointerId) showSelection(boxBetween(drag.start, point(event)));
});
function endDrag(event) {
  if (!drag || drag.id !== event.pointerId) return;
  if (event.type === 'pointerup') {
    const box = boxBetween(drag.start, point(event));
    if (box) {
      selection = {...box, source: displayedCanvas()};
      const action = mode === 'crop'
        ? '将保留框内的 ' + box.w + ' × ' + box.h + ' 像素。拖动可重选。'
        : '确认后将修复框内水印。拖动可重选。';
      message(comparing ? '将在原图上处理并替换上次结果。' + action : action);
    }
  }
  drag = null;
  update();
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) overlay.addEventListener(event, endDrag);

for (const tool of ['crop', 'select']) $(tool).onclick = () => {
  mode = tool;
  drag = selection = null;
  message(tool === 'crop' ? '拖出要保留的画面范围。' : '拖动框住水印和它的阴影。');
  update();
};
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || busy || !(drag || selection)) return;
  drag = selection = null;
  message('已取消选区，可重新框选。');
  update();
});
$('compare').onclick = () => {
  comparing = !comparing;
  message(comparing ? '正在查看原图。' : '正在查看上次确认的结果。');
  showCanvas();
  update();
};

async function loadFile(file) {
  if (!file || busy) return;
  const version=++fileVersion;
  if (!/^(image\/(png|jpeg|webp))$/i.test(file.type) && !(file.type==='' && /\.(png|jpe?g|webp)$/i.test(file.name))) { message('请选择 JPG、PNG 或 WebP 图片。');return; }
  const url=URL.createObjectURL(file);
  try {
    const img=new Image(); img.src=url; await img.decode();
    if(version!==fileVersion || busy)return;
    if(img.naturalWidth*img.naturalHeight>16000000 || Math.max(img.naturalWidth,img.naturalHeight)>10000) throw Error('这张图太大，请选择 1600 万像素以内、长边不超过 10000 像素的图片。');
    resetImage(img,file.name||'粘贴图片.png');
    message('拖动框住水印，再点击「确认去水印」。');
  } catch(e){ if(version===fileVersion)message(e.name==='EncodingError'?'图片无法读取，请重新选择。':e.message); }
  finally{URL.revokeObjectURL(url);}
}
$('open').onclick=()=>$('file').click();
$('file').onchange=e=>{loadFile(e.target.files[0]); e.target.value='';};
window.addEventListener('paste',e=>{const img=Array.from(e.clipboardData?.items||[]).find(i=>i.kind==='file' && i.type.startsWith('image/')); if(img){e.preventDefault(); loadFile(img.getAsFile());}});
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')) {e.preventDefault();stage.classList.add('drag');}});
window.addEventListener('dragleave',e=>{if(!e.relatedTarget)stage.classList.remove('drag');});
window.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag');loadFile(e.dataTransfer.files[0]);});

async function runRepair(pixels, mask, w, h) {
  let worker, url;
  try {
    const workerCode=repairPixels.toString()+'\nonmessage = ({data}) => {try{const pixels=repairPixels(...data);postMessage({pixels},[pixels.buffer]);}catch(e){postMessage({error:e.message});}};';
    url=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
    worker=new Worker(url);
  } catch { if(url)URL.revokeObjectURL(url);return repairPixels(pixels,mask,w,h); }
  try {
    return await new Promise((resolve,reject)=>{
      worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.pixels);
      worker.onerror=()=>reject(Error('修复过程被浏览器中断，请缩小选区后重试。'));
      worker.postMessage([pixels,mask,w,h],[pixels.buffer,mask.buffer]);
    });
  } finally {worker.terminate();URL.revokeObjectURL(url);}
}

async function removeWatermark(source, box) {
  const x = Math.max(0, box.x - 5), y = Math.max(0, box.y - 5);
  const width = Math.min(source.width, box.x + box.w + 5) - x;
  const height = Math.min(source.height, box.y + box.h + 5) - y;
  const patch = source.getContext('2d').getImageData(x, y, width, height);
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < box.h; row++) {
    const start = (box.y - y + row) * width + box.x - x;
    mask.fill(1, start, start + box.w);
  }
  const pixels = await runRepair(patch.data, mask, width, height);
  const repaired = new ImageData(pixels, width, height);
  if (source !== view) {
    view.width = source.width;
    view.height = source.height;
    ctx.drawImage(source, 0, 0);
  }
  ctx.putImageData(repaired, x, y);
}

$('confirm').onclick = async () => {
  const source = displayedCanvas();
  if (selection?.source !== source || drag || busy) return;
  busy = true;
  ++fileVersion;
  update();
  try {
    if (mode === 'crop') {
      const {x, y, w, h} = selection;
      const cropped = source.getContext('2d').getImageData(x, y, w, h);
      view.width = w;
      view.height = h;
      ctx.putImageData(cropped, 0, 0);
      message('已裁剪为 ' + w + ' × ' + h + ' 像素，可下载 PNG。');
    } else {
      await removeWatermark(source, selection);
      message('已去除选区水印，可继续框选或下载 PNG。');
    }
    edited = true;
    comparing = false;
    selection = null;
    mode = 'select';
    showCanvas();
  } catch (error) {
    message(error.message || '处理失败，请重新选择区域。');
  } finally {
    busy = false;
    update();
  }
};

$('export').onclick=()=>{
  if ($('export').disabled) return;
  const exportName=customFilename || filename.replace(/\.[^.]+$/,'')+'-已处理.png';
  view.toBlob(blob=>{
    if(!blob){message('导出失败，请重试。');return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=exportName;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  },'image/png');
};

function demo() {
  ++fileVersion;
  const c=document.createElement('canvas');c.width=1200;c.height=800;
  const d=c.getContext('2d');
  const sky=d.createLinearGradient(0,0,0,680);sky.addColorStop(0,'#a4bfcc');sky.addColorStop(.61,'#efc6a6');sky.addColorStop(1,'#f3ddba');
  d.fillStyle=sky;d.fillRect(0,0,1200,800);
  d.fillStyle='#ffdcaa';d.beginPath();d.arc(830,195,84,0,Math.PI*2);d.fill();
  let seed=73;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function ridge(line,color,jitter) {
    d.beginPath();d.moveTo(0,800);
    line.forEach(([x,y],i)=>{
      if(i){const [a,b]=line[i-1];for(let k=a+4;k<x;k+=4)d.lineTo(k,b+(y-b)*(k-a)/(x-a)+(random()-.5)*jitter);}
      d.lineTo(x,y);
    });
    d.lineTo(1200,800);d.closePath();d.fillStyle=color;d.fill();
  }
  ridge([[0,434],[112,398],[205,425],[308,364],[365,374],[450,318],[516,342],[623,272],[679,312],[720,298],[813,355],[895,315],[956,327],[1076,260],[1200,305]],'#a5a6a6',5);
  ridge([[0,465],[120,430],[193,452],[308,395],[395,450],[492,389],[574,360],[615,383],[709,327],[786,398],[865,368],[957,421],[1052,357],[1112,390],[1200,337]],'#777f87',7);
  ridge([[0,433],[119,462],[207,516],[331,490],[449,554],[563,493],[699,445],[749,467],[856,407],[950,443],[1073,396],[1200,434]],'#485961',6);
  ridge([[0,552],[102,512],[233,549],[384,607],[491,585],[591,610],[741,558],[884,584],[1048,518],[1200,535]],'#334950',7);
  ridge([[0,650],[217,683],[373,651],[505,677],[665,637],[804,655],[1009,590],[1200,610]],'#263c42',4);
  d.fillStyle='#fff4de';d.font='bold 24px sans-serif';d.fillText('SCY / 山谷样片',938,734);
  resetImage(c,'山谷样片.png');
  message('拖动框住示例图右下角的水印。');
}
$('demo').onclick=demo;
demo();
