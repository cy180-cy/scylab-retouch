/* Blend opposite intact boundaries along horizontal, vertical and diagonal lines.
   Pixels outside the mask also serve as immutable sampling anchors. */
function repairPixels(rgba, mask, width, height) {
  if (rgba.length !== width * height * 4 || mask.length !== width * height) throw Error('图像尺寸不匹配。');
  const weights = new Float32Array(mask.length);
  let marked = 0;
  for (const value of mask) if (value) marked++;
  if (!marked) throw Error('请先标记水印。');
  if (marked === mask.length) throw Error('请缩小选区，留出一些背景供修复采样。');

  function scan(x, y, dx, dy) {
    const step = dy * width + dx;
    let left = -1, run = 0, first = 0;
    function complete(right) {
      if (!run || (left < 0 && right < 0)) return;
      const a = (left >= 0 ? left : right) * 4;
      const b = (right >= 0 ? right : left) * 4;
      const twoSides = left >= 0 && right >= 0;
      const distance = (run + 1) * Math.hypot(dx, dy);
      const contrast = Math.abs(rgba[a]-rgba[b]) + Math.abs(rgba[a+1]-rgba[b+1]) + Math.abs(rgba[a+2]-rgba[b+2]);
      const weight = (twoSides ? 1 : 0.14) / (distance * distance * (1 + contrast / 180));
      for (let j = 0, p = first; j < run; j++, p += step) {
        const t = (j+1)/(run+1);
        const alpha = (1-t)*rgba[a+3] + t*rgba[b+3];
        const prior = weights[p];
        const base = 4*p;
        const oldAlpha = rgba[base+3];
        const totalAlpha = oldAlpha*prior + alpha*weight;
        for (let channel=0; channel<3; channel++) {
          const color = (1-t)*rgba[a+channel]*rgba[a+3] + t*rgba[b+channel]*rgba[b+3];
          rgba[base+channel] = totalAlpha ? (rgba[base+channel]*oldAlpha*prior + color*weight)/totalAlpha : 0;
        }
        rgba[base+3] = totalAlpha/(prior+weight);
        weights[p] += weight;
      }
    }
    while (x>=0 && y>=0 && x<width && y<height) {
      const p=y*width+x;
      if (mask[p]) {
        if (!run) first=p;
        run++;
      } else {
        complete(p);
        left=p;
        run=0;
      }
      x+=dx; y+=dy;
    }
    complete(-1);
  }
  for (let x=0;x<width;x++) { scan(x,0,0,1); scan(x,0,1,1); scan(x,0,-1,1); }
  for (let y=0;y<height;y++) {
    scan(0,y,1,0);
    if (y) { scan(0,y,1,1); scan(width-1,y,-1,1); }
  }
  // Rare mask shapes can cover all eight rays from an interior pixel.
  function propagate(p, a, b) {
    if (!mask[p] || weights[p]) return;
    const anchor = a>=0 && (!mask[a] || weights[a]) ? a : b;
    if (anchor<0 || (mask[anchor] && !weights[anchor])) return;
    rgba.copyWithin(p*4,anchor*4,anchor*4+4);
    weights[p]=1;
  }
  for (let p=0;p<mask.length;p++) propagate(p,p%width?p-1:-1,p>=width?p-width:-1);
  for (let p=mask.length-1;p>=0;p--) propagate(p,p%width<width-1?p+1:-1,p+width<mask.length?p+width:-1);
  return rgba;
}
if (typeof module==='object' && module.exports) module.exports=repairPixels;
