// Copies the simulator from preview/Factory_Simulator.html (the file that is
// edited) to public/simulator/index.html (what the site serves), themed to the
// site on the way: simulator-theme.css is added, and the colours drawn in its
// canvases are mapped onto the site's tokens (src/styles/tokens.css). Runs
// before `dev` and `build`. preview/ is not in git, so where it is missing
// (e.g. the GitHub Pages build) the committed copy is kept as is.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../preview/Factory_Simulator.html');
const dest = resolve(here, '../public/simulator/index.html');
const theme = readFileSync(resolve(here, 'simulator-theme.css'), 'utf8');

// Simulator colour -> site token (hex). base64 has no '#', so the embedded
// image is never touched.
const HEX = {
  '#1f4fe0': '#1f1d18', // accent blue -> ink
  '#2a86d8': '#2a78d6', // water -> site blue
  '#f07a1a': '#eb6834', // orange -> site orange
  '#d4463c': '#a8431c', // "worse" red -> dark orange (red is reserved)
  '#16866b': '#1b7c61', // "better" green
  '#d68c28': '#c0731f', // warning amber
  '#c27a12': '#c0731f',
  '#7c3aed': '#6754bd', // hypothesis violet -> site violet
  '#d9ccf7': '#ddd5f0',
  '#fdfdfd': '#f2ece0', // ground -> sand
  '#1d2330': '#1f1d18', // ink
  '#566070': '#4a463c',
  '#98a0ad': '#7b7566',
  '#e4e7ec': '#ddd5c4',
  '#c9ced8': '#cfc6b4',
};
// Canvas colours set as RGB triples, and the projection's white-ground image.
const SHIFT_UP = 60; // the building moves up this much (stage px), to sit centred on the screen
const PATCHES = [
  // Layout: the building (and its right-hand cards) up, so it sits in the middle.
  ['const SZ=0.86,OX=410,OY=150;', `const SZ=0.86,OX=410,OY=${150 - SHIFT_UP};`],
  ['const CARD_Y={4:-999,3:350,2:590,1:800};', `const CARD_Y={4:-999,3:${350 - SHIFT_UP},2:${590 - SHIFT_UP},1:${800 - SHIFT_UP}};`],
  ['#scene{position:absolute;left:410px;top:150px;', `#scene{position:absolute;left:410px;top:${150 - SHIFT_UP}px;`],
  // No shipping distance: its slider (the Logistics box), preset and route label go.
  ["{id:'shipping_distance',floor:0,name:'Shipping distance'", "{id:'shipping_distance',floor:0,hidden:true,name:'Shipping distance'"],
  [" {name:'Longer shipping route',set:{shipping_distance:1.50},tip:'Shipping distance ×1.50'},\n", ''],
  ["c.fillText('supplier · ×'+X.shipping_distance.toFixed(2),ex-8,ey+4);", ''],
  // …and the dashed supplier route it stretched (the coins to the supplier keep their path).
  ["c.setLineDash([5,5]);c.lineDashOffset=-t/60;c.strokeStyle=rgb(BLUE,.7);c.lineWidth=2;c.beginPath();c.moveTo(sx,sy);c.lineTo(ex,ey);c.stroke();c.setLineDash([]);", ''],
  ["c.fillStyle='#fff';c.strokeStyle=rgb(BLUE);c.lineWidth=2;c.beginPath();c.arc(ex,ey,5,0,7);c.fill();c.stroke();", ''],
  ['const BLUE=[31,79,224],WATER=[42,134,216],ORANGE=[240,122,26],GOOD=[22,134,107],BAD=[212,70,60],INK=[29,35,48],AMBER=[214,140,40];',
   'const BLUE=[74,70,60],WATER=[42,120,214],ORANGE=[235,104,52],GOOD=[27,124,97],BAD=[168,67,28],INK=[31,29,24],AMBER=[192,115,31];'],
  ["const CONFCOL={empirical:[22,134,107],calibrated:[120,128,142],placeholder:[226,110,30],output:[160,166,178],hypothesis:[124,58,237]};",
   "const CONFCOL={empirical:[27,124,97],calibrated:[123,117,102],placeholder:[192,115,31],output:[160,153,138],hypothesis:[103,84,189]};"],
  ["const CONFCOL_CSS={empirical:'22,134,107',calibrated:'120,128,142',placeholder:'226,110,30',output:'160,166,178',hypothesis:'124,58,237'};",
   "const CONFCOL_CSS={empirical:'27,124,97',calibrated:'123,117,102',placeholder:'192,115,31',output:'160,153,138',hypothesis:'103,84,189'};"],
  ['if(img.complete)c.drawImage(img,OX,OY,780*SZ,1068*SZ);',
   "if(img.complete){c.globalCompositeOperation='multiply';c.drawImage(img,OX,OY,780*SZ,1068*SZ);c.globalCompositeOperation='source-over';}"],
  ['<span><i class="dot" style="background:rgb(22,134,107)"></i>empirical</span><span><i class="dot" style="background:rgb(120,128,142)"></i>calibrated</span><span><i class="dot" style="background:rgb(226,110,30)"></i>placeholder</span><span><i class="dot" style="background:rgb(124,58,237)"></i>hypothesis</span>',
   '<span><i class="dot" style="background:rgb(27,124,97)"></i>empirical</span><span><i class="dot" style="background:rgb(123,117,102)"></i>calibrated</span><span><i class="dot" style="background:rgb(192,115,31)"></i>placeholder</span><span><i class="dot" style="background:rgb(103,84,189)"></i>hypothesis</span>'],
];
const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">';

function themed(html) {
  let out = html;
  for (const [from, to] of PATCHES) {
    if (!out.includes(from)) throw new Error(`sync:sim  the simulator changed; update this theme patch:\n  ${from.slice(0, 90)}…`);
    out = out.split(from).join(to);
  }
  for (const [from, to] of Object.entries(HEX)) out = out.replace(new RegExp(from, 'gi'), to);
  if (!out.includes('</head>')) throw new Error('sync:sim  no </head> in the simulator');
  out = out.replace('</head>', `${FONTS}\n<style id="site-theme">\n${theme}</style>\n</head>`);
  return out.replace('<!doctype html>', '<!doctype html>\n<!-- Generated by site/scripts/sync-simulator.mjs from preview/Factory_Simulator.html. Do not edit. -->');
}

if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, themed(readFileSync(src, 'utf8')));
  console.log('sync:sim  preview/Factory_Simulator.html -> site/public/simulator/index.html (site theme)');
} else if (existsSync(dest)) {
  console.log('sync:sim  preview/ not found; keeping the committed public/simulator/index.html');
} else {
  console.error('sync:sim  no simulator: preview/Factory_Simulator.html is missing');
  process.exit(1);
}
