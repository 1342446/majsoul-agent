// Original geometric tile faces. No game images, external fonts or network resources.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../extension/tiles/', import.meta.url));
const check = process.argv.includes('--check');
const positions = {
  1: [[40, 62]], 2: [[40, 37], [40, 87]], 3: [[24, 36], [40, 62], [56, 88]],
  4: [[25, 39], [55, 39], [25, 85], [55, 85]],
  5: [[25, 37], [55, 37], [40, 62], [25, 87], [55, 87]],
  6: [37, 62, 87].flatMap(y => [[25, y], [55, y]]),
  7: [[40, 28], ...[52, 74, 96].flatMap(y => [[25, y], [55, y]])],
  8: [28, 50, 74, 96].flatMap(y => [[25, y], [55, y]]),
  9: [35, 62, 89].flatMap(y => [[20, y], [40, y], [60, y]])
};
const numerals = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const honors = ['東', '南', '西', '北', '', '發', '中'];
const font = 'sans-serif';
function text(value, x, y, size, color) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="600" fill="${color}">${value}</text>`;
}
function face(code) {
  const suit = code[1], number = Number(code[0]) || 5, red = code[0] === '0';
  let art = '';
  if (suit === 'm') {
    art = text(numerals[number], 40, 54, 33, red ? '#bc3038' : '#243e57') + text('萬', 40, 96, 35, '#bc3038');
  } else if (suit === 'z') {
    art = number === 5 ? '<rect x="18" y="30" width="44" height="65" rx="3" fill="none" stroke="#526f8b" stroke-width="3"/>'
      : text(honors[number - 1], 40, 84, 48, number === 6 ? '#26764d' : number === 7 ? '#bc3038' : '#243e57');
  } else {
    art = positions[number].map(([x, y], i) => {
      const color = red ? '#bc3038' : suit === 's' ? '#26764d' : ['#355a81', '#bc3038', '#26764d'][i % 3];
      if (suit === 'p') {
        const radius = number === 1 ? 19 : number === 9 ? 7 : 8;
        return `<circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="${color}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${number === 1 ? 10 : 2}" fill="${color}"/>`;
      }
      const height = number === 1 ? 59 : 16, width = number === 1 ? 12 : 7;
      return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="2" fill="${color}"/><path d="M${x - width / 2 - 2} ${y}h${width + 4}" stroke="#fffcf3" stroke-width="2"/>`;
    }).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="129" viewBox="0 0 80 129" role="img" aria-labelledby="name"><title id="name">${code}</title><rect x="2" y="2" width="76" height="125" rx="6" fill="#fffcf3" stroke="#8e9fa8" stroke-width="2"/><path d="M7 120h66" stroke="#d1d9d7" stroke-width="3"/>${art}${text(code, 40, 115, 10, red ? '#bc3038' : '#617080')}</svg>\n`;
}
mkdirSync(destination, { recursive: true });
const codes = ['m', 'p', 's'].flatMap(suit => Array.from({ length: 10 }, (_, n) => n + suit))
  .concat(Array.from({ length: 7 }, (_, n) => n + 1 + 'z'));
for (const code of codes) {
  const path = destination + '/' + code + '.svg', content = face(code);
  if (check) {
    if (readFileSync(path, 'utf8') !== content) throw new Error('Regenerate tile: ' + code);
  } else writeFileSync(path, content);
}
console.log(`${check ? 'Verified' : 'Generated'} ${codes.length} original SVG tile faces.`);
