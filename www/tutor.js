/* Deck Ops tutor: guided walkthroughs and the diagrams they use.
   TUTOR[id] = { gear: [...], steps: [ { t, fig, cap, say, why, do, code, ask: [{ q, opts: [[text, ok, feedback]] }], hints, show, showCode } ] }
   ok: true = right answer, false = wrong (feedback nudges), null = a result to troubleshoot (feedback is the fix). */

/* ---------- figures ---------- */
const TF = (() => {
  const P = 18, LET = 'abcdefghij';
  const BAND = { black: '#161616', brown: '#8a4b1f', red: '#e0302a', orange: '#ff8a1e', yellow: '#ffd21e', green: '#2fae4e', blue: '#2f6fe0', violet: '#9b4fd6', grey: '#9a9a9a', white: '#f2f2f2', gold: '#c9a227' };
  const WIRE = { sig: '#ffb000', gnd: '#a9bccf', v5: '#ff5a4a', an: '#45d0ff' };
  const RES = {
    220: ['red', 'red', 'black', 'black', 'brown'],
    1000: ['brown', 'black', 'black', 'brown', 'brown'],
    10000: ['brown', 'black', 'black', 'red', 'brown']
  };
  const tw = s => s.length * 6.4 + 12;

  /* Upright board, as it sits on the bench: rows 1-63 top to bottom, a-e left of the centre gap, f-j right,
     a + and - rail down each edge (+ on the red line, left side of each rail). Wires come in from the UNO on the left. */
  function board(o) {
    const r0 = o.r0, r1 = o.r1, wired = (o.wires || []).length > 0;
    const TAG = wired ? 60 : 4, top = 24;
    const rail = [TAG + 12, TAG + 12 + P];
    const xa = rail[1] + P + 14;
    const x = l => { const i = LET.indexOf(l); return xa + i * P + (i >= 5 ? P : 0); };
    const railR = [x('j') + P + 10, x('j') + 2 * P + 10];
    const y = r => top + (r - r0) * P + P / 2;
    const yTop = top - 4, yBot = y(r1) + P / 2 + 4, W = railR[1] + P / 2 + 8, H = yBot + 6;
    const g = { x, y, W, H, rail, railR, r0, r1, TAG };
    let s = '';
    const slab = (x1, x2) => '<rect class="tf-board" x="' + x1 + '" y="' + yTop + '" width="' + (x2 - x1) + '" height="' + (yBot - yTop) + '" rx="4"/>';
    s += slab(rail[0] - P / 2 - 4, rail[1] + P / 2 + 4) + slab(x('a') - P / 2 - 12, x('e') + P / 2 + 2) + slab(x('f') - P / 2 - 2, x('j') + P / 2 + 12) + slab(railR[0] - P / 2 - 4, railR[1] + P / 2 + 4);
    s += '<rect class="tf-trench" x="' + (x('e') + P / 2 + 2) + '" y="' + yTop + '" width="' + (P - 4) + '" height="' + (yBot - yTop) + '"/>';
    (o.hl || []).forEach(h => { s += hlRect(g, h); });
    const railCols = (rx, side) => {
      let r = '<line x1="' + (rx[0] - 8) + '" y1="' + (yTop + 4) + '" x2="' + (rx[0] - 8) + '" y2="' + (yBot - 4) + '" stroke="#e0302a" stroke-width="1.4"/>' +
        '<line x1="' + (rx[1] + 8) + '" y1="' + (yTop + 4) + '" x2="' + (rx[1] + 8) + '" y2="' + (yBot - 4) + '" stroke="#2f6fe0" stroke-width="1.4"/>' +
        '<text class="tf-t" x="' + rx[0] + '" y="14" text-anchor="middle" fill="#e0302a" style="fill:#e0302a">+</text><text class="tf-t" x="' + rx[1] + '" y="14" text-anchor="middle" style="fill:#4a8cff">−</text>';
      for (let rr = r0; rr <= r1; rr++) rx.forEach(cx => { r += '<rect class="tf-h" x="' + (cx - 2) + '" y="' + (y(rr) - 2) + '" width="4" height="4"/>'; });
      return r;
    };
    s += railCols(rail) + railCols(railR);
    for (let i = 0; i < 10; i++) {
      const l = LET[i];
      s += '<text class="tf-t" x="' + x(l) + '" y="14" text-anchor="middle">' + l + '</text>';
      for (let rr = r0; rr <= r1; rr++) s += '<rect class="tf-h" x="' + (x(l) - 2) + '" y="' + (y(rr) - 2) + '" width="4" height="4"/>';
    }
    const keep = [r0, r1].concat(o.num || []), near = r => keep.some(k => k !== r && Math.abs(k - r) <= 1);
    for (let rr = r0; rr <= r1; rr++) if (keep.includes(rr) || (rr % 5 === 0 && !near(rr))) {
      s += '<text class="tf-t" x="' + (x('a') - P / 2 - 5) + '" y="' + (y(rr) + 3.5) + '" text-anchor="middle">' + rr + '</text>';
      s += '<text class="tf-t" x="' + (x('j') + P / 2 + 5) + '" y="' + (y(rr) + 3.5) + '" text-anchor="middle">' + rr + '</text>';
    }
    return { g, s };
  }
  function hlRect(g, h) {
    if (h.rail) {
      const cx = h.rail === '+' ? g.rail[0] : g.rail[1];
      return '<rect class="tf-hl' + (h.alt ? ' alt' : '') + '" x="' + (cx - P / 2 + 3) + '" y="' + (g.y(g.r0) - P / 2 + 2) + '" width="' + (P - 6) + '" height="' + ((g.r1 - g.r0 + 1) * P - 4) + '" rx="3"/>';
    }
    const a = h.half === 'bot' ? 'f' : 'a', b = h.half === 'bot' ? 'j' : 'e';
    return '<rect class="tf-hl' + (h.alt ? ' alt' : '') + '" x="' + (g.x(a) - P / 2 + 3) + '" y="' + (g.y(h.row) - P / 2 + 3) + '" width="' + (g.x(b) - g.x(a) + P - 6) + '" height="' + (P - 6) + '" rx="3"/>';
  }
  const halo = (cls, x, y, anchor, text) => '<text class="' + cls + ' halo" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">' + text + '</text>';
  const leg = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#c9ced3" stroke-width="1.6"/>';
  const pin = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="#c9ced3"/>';
  function resistor(g, l, ra, rb, val, label) {
    const xx = g.x(l), ya = g.y(ra), yb = g.y(rb), mid = (ya + yb) / 2, bh = Math.min(40, Math.abs(yb - ya) - 10);
    let s = leg(xx, ya, xx, yb) + pin(xx, ya) + pin(xx, yb);
    s += '<rect x="' + (xx - 5.5) + '" y="' + (mid - bh / 2) + '" width="11" height="' + bh + '" rx="5" fill="#b8cfe6"/>';
    const bands = RES[val] || RES[220], step = (bh - 14) / 5;
    bands.forEach((c, i) => { const by = mid - bh / 2 + 6 + i * step + (i === 4 ? step * 0.5 : 0); s += '<rect x="' + (xx - 5.5) + '" y="' + by + '" width="11" height="3" fill="' + BAND[c] + '"/>'; });
    if (label) s += halo('tf-lab', xx + 9, mid + 4, 'start', label);
    return s;
  }
  function led(g, l, ra, rk, colour) {
    const xx = g.x(l), ya = g.y(ra), yk = g.y(rk), my = (ya + yk) / 2, c = colour || '#ff3b30';
    const bx = (l === 'e' || l === 'f') ? (g.x('e') + g.x('f')) / 2 : xx + P;
    let s = leg(xx, ya, bx, my + (ya > yk ? 3 : -3)) + leg(xx, yk, bx, my + (yk > ya ? 3 : -3)) + pin(xx, ya) + pin(xx, yk);
    s += '<circle cx="' + bx + '" cy="' + my + '" r="8.5" fill="' + c + '" fill-opacity=".85" stroke="' + c + '"/>';
    const fy = my + (yk > ya ? 6.5 : -6.5);
    s += '<line x1="' + (bx - 5.5) + '" y1="' + fy + '" x2="' + (bx + 5.5) + '" y2="' + fy + '" stroke="#ffffff" stroke-width="1.6"/>';
    s += halo('tf-lab', bx + 12, ya + 4, 'start', '+ long') + halo('tf-lab', bx + 12, yk + 4, 'start', '− short');
    return s;
  }
  function button(g, ra, rb) {
    const x1 = g.x('e') - 7, x2 = g.x('f') + 7, y1 = g.y(ra) - 7, y2 = g.y(rb) + 7;
    let s = '<rect x="' + x1 + '" y="' + y1 + '" width="' + (x2 - x1) + '" height="' + (y2 - y1) + '" rx="3" fill="#2b2f33" stroke="#9aa3ab"/>';
    s += '<circle cx="' + ((x1 + x2) / 2) + '" cy="' + ((y1 + y2) / 2) + '" r="' + ((y2 - y1) / 2 - 7) + '" fill="#5d6670" stroke="#c9ced3"/>';
    [['e', ra], ['e', rb], ['f', ra], ['f', rb]].forEach(([l, r]) => { s += '<circle cx="' + g.x(l) + '" cy="' + g.y(r) + '" r="2.6" fill="#c9ced3"/>'; });
    return s;
  }
  function ldr(g, l, ra, rb) {
    const xx = g.x(l), ya = g.y(ra), yb = g.y(rb), mid = (ya + yb) / 2;
    let s = leg(xx, ya, xx, yb) + pin(xx, ya) + pin(xx, yb);
    s += '<circle cx="' + xx + '" cy="' + mid + '" r="9" fill="#e9dcc0" stroke="#b07a2e"/>';
    s += '<path d="M' + (xx - 3) + ' ' + (mid - 6) + ' v3 h6 v3 h-6 v3 h6 v3" fill="none" stroke="#b5462a" stroke-width="1.3"/>';
    return s;
  }
  function wires(g, list) {
    let s = '';
    list.forEach(w => {
      const hx = g.x(w.hole || 'a'), hy = g.y(w.row), c = WIRE[w.c] || WIRE.sig;
      s += '<line x1="' + (g.TAG - 4) + '" y1="' + hy + '" x2="' + hx + '" y2="' + hy + '" stroke="#000" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>';
      s += '<line x1="' + (g.TAG - 4) + '" y1="' + hy + '" x2="' + hx + '" y2="' + hy + '" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>';
      s += '<circle cx="' + hx + '" cy="' + hy + '" r="2.8" fill="' + c + '"/>';
      s += '<rect x="2" y="' + (hy - 9) + '" width="' + (g.TAG - 6) + '" height="18" rx="3" fill="var(--sheet)" stroke="' + c + '"/>';
      s += '<text class="tf-tag" x="' + (2 + (g.TAG - 6) / 2) + '" y="' + (hy + 4) + '" text-anchor="middle">' + w.tag + '</text>';
    });
    return s;
  }
  const svg = (W, H, body, label) => '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + label + '">' + body + '</svg>';

  function build(spec) {
    const { g, s } = board(spec);
    let b = s;
    (spec.parts || []).forEach(p => {
      if (p.res) b += resistor(g, p.res[0], p.res[1], p.res[2], p.val, p.label);
      if (p.led) b += led(g, p.led[0], p.led[1], p.led[2], p.colour);
      if (p.btn) b += button(g, p.btn[0], p.btn[1]);
      if (p.ldr) b += ldr(g, p.ldr[0], p.ldr[1], p.ldr[2]);
    });
    b += wires(g, spec.wires || []);
    return svg(g.W, g.H, b, spec.label || 'Breadboard diagram');
  }

  const F = {};
  F.bbAnatomy = () => build({ r0: 1, r1: 10, rails: 'both', num: [3], label: 'Breadboard: row 3 strips and the rails lit up',
    hl: [{ row: 3, half: 'top' }, { row: 3, half: 'bot', alt: true }, { rail: '+' }] });
  F.e2Build = () => build({ r0: 8, r1: 17, tags: true, num: [10, 11, 15], label: 'E2 wiring: pin 13 to a15, resistor c11 to c15, LED long leg e11 short leg e10, GND to a10',
    hl: [{ row: 10, half: 'top' }, { row: 11, half: 'top', alt: true }, { row: 15, half: 'top' }],
    parts: [{ res: ['c', 11, 15], val: 220, label: '220 Ω' }, { led: ['e', 11, 10] }],
    wires: [{ tag: 'pin 13', row: 15, c: 'sig' }, { tag: 'GND', row: 10, c: 'gnd' }] });
  F.e3Build = () => build({ r0: 8, r1: 21, tags: true, num: [10, 11, 15, 18, 19], label: 'E3 wiring: E2 circuit plus a 1 kΩ resistor d15 to d19 and a second LED long leg e19 short leg e18, GND to a18',
    parts: [{ res: ['c', 11, 15], val: 220, label: '220 Ω' }, { led: ['e', 11, 10] }, { res: ['d', 15, 19], val: 1000, label: '' }, { led: ['e', 19, 18], colour: '#ff3b30' }],
    wires: [{ tag: 'GND', row: 10, c: 'gnd' }, { tag: 'pin 13', row: 15, c: 'sig' }, { tag: 'GND', row: 18, c: 'gnd' }] });
  F.e4Build = () => build({ r0: 17, r1: 25, tags: true, num: [20, 22], label: 'E4 wiring: button straddling the gap in rows 20 and 22, pin 2 to a20, GND to a22',
    hl: [{ row: 20, half: 'top' }, { row: 22, half: 'top', alt: true }],
    parts: [{ btn: [20, 22] }], wires: [{ tag: 'pin 2', row: 20, c: 'sig' }, { tag: 'GND', row: 22, c: 'gnd' }] });
  F.e5Build = () => build({ r0: 24, r1: 34, tags: true, num: [26, 28, 32], label: 'E5 wiring: photoresistor c26 to c28, 10 kΩ d28 to d32, 5V to a26, A0 to a28, GND to a32',
    hl: [{ row: 28, half: 'top' }],
    parts: [{ ldr: ['c', 26, 28] }, { res: ['d', 28, 32], val: 10000, label: '10 kΩ' }],
    wires: [{ tag: '5V', row: 26, c: 'v5' }, { tag: 'A0', row: 28, c: 'an' }, { tag: 'GND', row: 32, c: 'gnd' }] });

  F.joints = () => {
    const one = (x, kind, label, sub) => {
      let q = '<rect x="' + (x - 34) + '" y="86" width="68" height="10" fill="#2e6b3a"/>' + '<rect x="' + (x - 12) + '" y="82" width="24" height="5" fill="#c9a227"/>';
      q += '<rect x="' + (x - 2) + '" y="34" width="4" height="70" fill="#c9ced3"/>';
      if (kind === 'good') q += '<path d="M' + (x - 13) + ' 83 Q' + (x - 4) + ' 78 ' + (x - 3) + ' 52 L' + (x + 3) + ' 52 Q' + (x + 4) + ' 78 ' + (x + 13) + ' 83 Z" fill="#d8dde2" stroke="#ffffff" stroke-width=".8"/>';
      if (kind === 'cold') q += '<circle cx="' + x + '" cy="66" r="10" fill="#9aa1a8" stroke="#6d747a"/>' + '<line x1="' + (x - 11) + '" y1="80" x2="' + (x + 11) + '" y2="80" stroke="#ff3b30" stroke-dasharray="2 2"/>';
      if (kind === 'bridge') q = '<rect x="' + (x - 34) + '" y="86" width="68" height="10" fill="#2e6b3a"/>' + [x - 12, x + 12].map(px => '<rect x="' + (px - 9) + '" y="82" width="18" height="5" fill="#c9a227"/><rect x="' + (px - 2) + '" y="34" width="4" height="70" fill="#c9ced3"/>').join('') + '<path d="M' + (x - 22) + ' 83 Q' + x + ' 52 ' + (x + 22) + ' 83 Z" fill="#c4c9ce" stroke="#ff3b30" stroke-width="1"/>';
      q += '<text class="tf-lab" x="' + x + '" y="20" text-anchor="middle">' + label + '</text><text class="tf-t" x="' + x + '" y="116" text-anchor="middle">' + sub + '</text>';
      return q;
    };
    return svg(300, 124, one(50, 'good', 'Good', 'shiny cone') + one(150, 'cold', 'Cold', 'ball, gap at pad') + one(250, 'bridge', 'Bridge', 'two pins joined'),
      'Solder joints side on: a good joint is a shiny cone, a cold joint is a ball that never bonded to the pad, a bridge joins two pins');
  };
  F.ledLegs = () => svg(240, 176,
    '<path d="M70 78 V42 a22 22 0 0 1 44 0 V78 Z" fill="#ff3b30" fill-opacity=".8" stroke="#ff3b30"/>' +
    '<path d="M64 78 H116 V86 H64 Z" fill="#ff3b30" fill-opacity=".9"/>' +
    '<line x1="116" y1="76" x2="116" y2="88" stroke="#ffffff" stroke-width="2"/>' +
    '<line x1="82" y1="86" x2="82" y2="164" stroke="#c9ced3" stroke-width="2.4"/>' +
    '<line x1="100" y1="86" x2="100" y2="140" stroke="#c9ced3" stroke-width="2.4"/>' +
    '<text class="tf-lab" x="76" y="160" text-anchor="end">+ long leg</text><text class="tf-t" x="76" y="172" text-anchor="end">to the pin</text>' +
    '<text class="tf-lab" x="106" y="136">− short leg</text><text class="tf-t" x="106" y="148">to GND</text>' +
    '<path d="M122 82 L150 64" stroke="var(--dim)" stroke-width="1"/><text class="tf-t" x="152" y="62">flat edge</text><text class="tf-t" x="152" y="74">= − side</text>',
    'LED: long leg is plus, short leg and flat edge are minus');

  F.resBands = () => {
    const one = (yy, body, cols, xs, digits, line) => {
      let s = '<line x1="14" y1="' + yy + '" x2="226" y2="' + yy + '" stroke="#c9ced3" stroke-width="2"/>';
      s += '<rect x="66" y="' + (yy - 11) + '" width="108" height="22" rx="10" fill="' + body + '"/>';
      cols.forEach((c, i) => { s += '<rect x="' + xs[i] + '" y="' + (yy - 11) + '" width="7" height="22" fill="' + BAND[c] + '"/>'; s += '<text class="tf-t" x="' + (xs[i] + 3.5) + '" y="' + (yy + 25) + '" text-anchor="middle">' + digits[i] + '</text>'; });
      s += '<text class="tf-lab" x="120" y="' + (yy + 40) + '" text-anchor="middle">' + line + '</text>';
      return s;
    };
    return svg(240, 176,
      one(22, '#b8cfe6', ['red', 'red', 'black', 'black', 'brown'], [78, 92, 106, 120, 150], ['2', '2', '0', '×1', '1%'], '5 bands: 220 × 1 = 220 Ω') +
      one(104, '#e3cfa3', ['red', 'red', 'brown', 'gold'], [82, 98, 114, 148], ['2', '2', '×10', '5%'], '4 bands: 22 × 10 = 220 Ω'),
      'Two 220 ohm resistors: five-band red red black black brown, four-band red red brown gold');
  };

  F.pullup = () => svg(260, 176,
    '<rect x="8" y="8" width="128" height="122" rx="4" fill="none" stroke="var(--dim)" stroke-dasharray="4 3"/>' +
    '<text class="tf-t" x="14" y="124">inside the Uno</text>' +
    '<text class="tf-lab" x="62" y="26" text-anchor="middle">5V</text>' +
    '<path d="M62 32 V44 l7 4 -14 6 14 6 -14 6 14 6 -7 4 V96" fill="none" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<text class="tf-t" x="76" y="66">weak</text><text class="tf-t" x="76" y="78">pull-up</text>' +
    '<circle cx="62" cy="96" r="3" fill="var(--hi)"/>' +
    '<line x1="62" y1="96" x2="206" y2="96" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<text class="tf-lab" x="150" y="90" text-anchor="middle">pin 2</text>' +
    '<line x1="206" y1="96" x2="206" y2="110" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<line x1="206" y1="110" x2="222" y2="128" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<circle cx="206" cy="110" r="2.4" fill="var(--ph)"/><circle cx="206" cy="134" r="2.4" fill="var(--ph)"/>' +
    '<text class="tf-t" x="226" y="124">button</text>' +
    '<line x1="206" y1="134" x2="206" y2="150" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<path d="M194 150 H218 M198 155 H214 M202 160 H210" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<text class="tf-lab" x="206" y="174" text-anchor="middle">GND</text>',
    'Pull-up: a weak resistor inside the Uno holds pin 2 at 5V; pressing the button connects pin 2 to GND');

  F.divider = () => svg(250, 196,
    '<text class="tf-lab" x="50" y="14" text-anchor="middle">5V</text>' +
    '<line x1="50" y1="20" x2="50" y2="32" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<rect x="40" y="32" width="20" height="40" fill="none" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<path d="M86 38 L66 48 M86 54 L66 64" stroke="#ffd21e" stroke-width="1.4"/><path d="M66 48 l6 -1 -3 5 Z M66 64 l6 -1 -3 5 Z" fill="#ffd21e"/>' +
    '<text class="tf-t" x="92" y="50">photoresistor</text><text class="tf-t" x="92" y="62">dark = more Ω</text>' +
    '<line x1="50" y1="72" x2="50" y2="104" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<circle cx="50" cy="88" r="3.2" fill="var(--hi)"/>' +
    '<line x1="50" y1="88" x2="150" y2="88" stroke="#45d0ff" stroke-width="1.6"/>' +
    '<text class="tf-lab" x="156" y="92">A0 reads here</text>' +
    '<rect x="40" y="104" width="20" height="40" fill="none" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<text class="tf-t" x="68" y="128">10 kΩ</text>' +
    '<line x1="50" y1="144" x2="50" y2="166" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<path d="M38 166 H62 M42 171 H58 M46 176 H54" stroke="var(--ph)" stroke-width="1.6"/>' +
    '<text class="tf-lab" x="50" y="192" text-anchor="middle">GND</text>',
    'Voltage divider: 5V, photoresistor, middle point to A0, 10 kilohm resistor, GND');

  F.loop = () => svg(260, 120,
    '<rect x="8" y="40" width="54" height="40" rx="4" fill="none" stroke="var(--ph)"/><text class="tf-lab" x="35" y="64" text-anchor="middle">pin 13</text>' +
    '<rect x="88" y="48" width="40" height="24" rx="10" fill="#b8cfe6"/><text class="tf-t" x="108" y="40" text-anchor="middle">resistor</text>' +
    '<circle cx="168" cy="60" r="12" fill="#ff3b30" fill-opacity=".85"/><text class="tf-t" x="168" y="40" text-anchor="middle">LED</text>' +
    '<text class="tf-t" x="150" y="86" text-anchor="middle">+</text><text class="tf-t" x="186" y="86" text-anchor="middle">−</text>' +
    '<rect x="204" y="40" width="48" height="40" rx="4" fill="none" stroke="var(--ph)"/><text class="tf-lab" x="228" y="64" text-anchor="middle">GND</text>' +
    '<path d="M62 60 H88 M128 60 H156 M180 60 H204" stroke="#ffb000" stroke-width="2"/>' +
    '<path d="M228 80 V104 H35 V80" fill="none" stroke="var(--dim)" stroke-dasharray="4 3"/>' +
    '<text class="tf-t" x="132" y="116" text-anchor="middle">back through the Uno: the loop is closed</text>',
    'The loop: pin 13, resistor, LED long leg then short leg, GND, back through the board');

  /* Diagrams the tutor draws in its replies: a ```breadboard JSON block. */
  const CODES = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
  function bandsFor(ohms) {
    let v = Number(ohms); if (!(v > 0)) return RES[220];
    let m = 0; while (v >= 1000) { v /= 10; m++; } while (v < 100 && m > -2) { v *= 10; m--; }
    const d = String(Math.round(v)).slice(0, 3).padStart(3, '0');
    return [CODES[+d[0]], CODES[+d[1]], CODES[+d[2]], m >= 0 ? CODES[Math.min(m, 9)] : m === -1 ? 'gold' : 'grey', 'brown'];
  }
  const ohmsLabel = v => { v = Number(v); return !(v > 0) ? '' : v >= 1e6 ? +(v / 1e6).toFixed(2) + ' MΩ' : v >= 1000 ? +(v / 1000).toFixed(2) + ' kΩ' : v + ' Ω'; };
  const escT = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).slice(0, 12);
  function twoLeg(p1, p2, body) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx) * 180 / Math.PI, mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    return { s: leg(p1.x, p1.y, p2.x, p2.y) + pin(p1.x, p1.y) + pin(p2.x, p2.y) + '<g transform="translate(' + mx + ' ' + my + ') rotate(' + ang + ')">' + body(len) + '</g>', mx, my };
  }
  function custom(src) {
    let d; try { d = JSON.parse(String(src).trim()); } catch (e) { return ''; }
    if (!d || typeof d !== 'object') return '';
    const used = [], holes = [];
    const hole = h => {
      h = String(h == null ? '' : h).trim().replace('−', '-');
      let m = /^([a-j])\s*(\d{1,2})$/i.exec(h);
      if (m && +m[2] >= 1 && +m[2] <= 63) { used.push(+m[2]); return { l: m[1].toLowerCase(), r: +m[2] }; }
      m = /^([LR])\s*([+-])\s*(\d{1,2})$/i.exec(h);
      if (m && +m[3] >= 1 && +m[3] <= 63) { used.push(+m[3]); return { rail: m[1].toUpperCase() + m[2], r: +m[3] }; }
      return null;
    };
    const parts = (Array.isArray(d.parts) ? d.parts : []).slice(0, 20).map(p => {
      const t = String((p && p.type) || '').toLowerCase();
      if (t === 'resistor' || t === 'photoresistor' || t === 'ldr') { const a = hole(p.from), b = hole(p.to); return a && b ? { t: t === 'resistor' ? 'res' : 'ldr', a, b, ohms: p.ohms } : null; }
      if (t === 'led') { const a = hole(p.long || p.anode || p.plus), k = hole(p.short || p.cathode || p.minus); return a && k ? { t: 'led', a, k, colour: p.colour || p.color } : null; }
      if (t === 'button') { const r = Array.isArray(p.rows) ? p.rows.map(Number) : []; if (r.length === 2 && r.every(x => x >= 1 && x <= 63)) { used.push(r[0], r[1]); return { t: 'btn', r: r.slice().sort((x, y) => x - y) }; } return null; }
      return null;
    }).filter(Boolean);
    const isHole = x => /^([a-j]\s*\d{1,2}|[LR]\s*[+-−]\s*\d{1,2})$/i.test(String(x || '').trim());
    const wl = (Array.isArray(d.wires) ? d.wires : []).slice(0, 20).map(w => {
      if (!w) return null;
      let from = w.from, to = w.to;
      if (!isHole(from) && isHole(to)) { const b = hole(to); return b ? { tag: escT(from), b } : null; }
      if (isHole(from) && !isHole(to)) { const b = hole(from); return b ? { tag: escT(to), b } : null; }
      const a = hole(from), b = hole(to); return a && b ? { a, b } : null;
    }).filter(Boolean);
    if (!parts.length && !wl.length) return '';
    let r0, r1;
    if (Array.isArray(d.rows) && d.rows.length === 2) { r0 = +d.rows[0]; r1 = +d.rows[1]; }
    if (!(r0 >= 1) || !(r1 >= r0)) { r0 = Math.min.apply(null, used) - 1; r1 = Math.max.apply(null, used) + 1; }
    r0 = Math.max(1, Math.min(r0, Math.min.apply(null, used.length ? used : [r0]) - 1)); r1 = Math.min(63, Math.max(r1, Math.max.apply(null, used.length ? used : [r1]) + 1));
    if (r1 - r0 < 5) r1 = Math.min(63, r0 + 5);
    if (r1 - r0 > 26) r1 = r0 + 26;
    const hl = (Array.isArray(d.highlight) ? d.highlight : []).map(Number).filter(r => r >= r0 && r <= r1).slice(0, 12).map(r => ({ row: r, half: 'top' }));
    const tagged = wl.filter(w => w.tag);
    const { g, s } = board({ r0, r1, wires: tagged, num: used.filter(r => r >= r0 && r <= r1), hl });
    const pt = h => {
      if (h.rail) return { x: h.rail === 'L+' ? g.rail[0] : h.rail === 'L-' ? g.rail[1] : h.rail === 'R+' ? g.railR[0] : g.railR[1], y: g.y(h.r) };
      return { x: g.x(h.l), y: g.y(h.r) };
    };
    const inView = h => h.r >= r0 && h.r <= r1;
    let b = s;
    parts.forEach(p => {
      if (p.t === 'btn') { if (p.r[0] >= r0 && p.r[1] <= r1) b += button(g, p.r[0], p.r[1]); return; }
      if (p.t === 'led') {
        if (!inView(p.a) || !inView(p.k)) return;
        if (p.a.l && p.k.l && p.a.l === p.k.l) { b += led(g, p.a.l, p.a.r, p.k.r, p.colour); return; }
        const A = pt(p.a), K = pt(p.k), c = p.colour || '#ff3b30', bx = (A.x + K.x) / 2 + P, by = (A.y + K.y) / 2;
        b += leg(A.x, A.y, bx, by) + leg(K.x, K.y, bx, by) + pin(A.x, A.y) + pin(K.x, K.y) + '<circle cx="' + bx + '" cy="' + by + '" r="8.5" fill="' + c + '" fill-opacity=".85" stroke="' + c + '"/>' + halo('tf-lab', A.x + 6, A.y - 5, 'start', '+') + halo('tf-lab', K.x + 6, K.y - 5, 'start', '−');
        return;
      }
      if (!inView(p.a) || !inView(p.b)) return;
      const A = pt(p.a), B = pt(p.b);
      if (p.t === 'res') {
        const bands = bandsFor(p.ohms || 220), r = twoLeg(A, B, len => { const bw = Math.min(40, len - 10), step = (bw - 14) / 5; let q = '<rect x="' + (-bw / 2) + '" y="-5.5" width="' + bw + '" height="11" rx="5" fill="#b8cfe6"/>'; bands.forEach((col, i) => { q += '<rect x="' + (-bw / 2 + 6 + i * step + (i === 4 ? step * 0.5 : 0)) + '" y="-5.5" width="3" height="11" fill="' + BAND[col] + '"/>'; }); return q; });
        b += r.s + halo('tf-lab', r.mx + 9, r.my + 4, 'start', ohmsLabel(p.ohms || 220));
      } else {
        b += twoLeg(A, B, () => '<circle r="9" fill="#e9dcc0" stroke="#b07a2e"/><path d="M-6 -3 h3 v6 h3 v-6 h3 v6 h3" fill="none" stroke="#b5462a" stroke-width="1.3"/>').s;
      }
    });
    wl.forEach(w => {
      if (w.tag) {
        if (!inView(w.b)) return;
        const B = pt(w.b), t = w.tag.toLowerCase(), c = /gnd|ground/.test(t) ? WIRE.gnd : /5v|3\.3|vin/.test(t) ? WIRE.v5 : /^a\d/.test(t) ? WIRE.an : WIRE.sig;
        b += '<line x1="' + (g.TAG - 4) + '" y1="' + B.y + '" x2="' + B.x + '" y2="' + B.y + '" stroke="#000" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>' +
          '<line x1="' + (g.TAG - 4) + '" y1="' + B.y + '" x2="' + B.x + '" y2="' + B.y + '" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/><circle cx="' + B.x + '" cy="' + B.y + '" r="2.8" fill="' + c + '"/>' +
          '<rect x="2" y="' + (B.y - 9) + '" width="' + (g.TAG - 6) + '" height="18" rx="3" fill="var(--sheet)" stroke="' + c + '"/><text class="tf-tag" x="' + (2 + (g.TAG - 6) / 2) + '" y="' + (B.y + 4) + '" text-anchor="middle">' + w.tag + '</text>';
        return;
      }
      if (!inView(w.a) || !inView(w.b)) return;
      const A = pt(w.a), B = pt(w.b), c = (w.a.rail || '').endsWith('-') || (w.b.rail || '').endsWith('-') ? WIRE.gnd : (w.a.rail || '').endsWith('+') || (w.b.rail || '').endsWith('+') ? WIRE.v5 : WIRE.sig;
      const cx = (A.x + B.x) / 2 - 14, cy = (A.y + B.y) / 2 - 14;
      b += '<path d="M' + A.x + ' ' + A.y + ' Q' + cx + ' ' + cy + ' ' + B.x + ' ' + B.y + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/><path d="M' + A.x + ' ' + A.y + ' Q' + cx + ' ' + cy + ' ' + B.x + ' ' + B.y + '" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>' +
        '<circle cx="' + A.x + '" cy="' + A.y + '" r="2.8" fill="' + c + '"/><circle cx="' + B.x + '" cy="' + B.y + '" r="2.8" fill="' + c + '"/>';
    });
    // flag two legs in one hole
    const seen = {};
    parts.forEach(p => [p.a, p.b, p.k].forEach(h => { if (h) holes.push(h); }));
    wl.forEach(w => [w.a, w.b].forEach(h => { if (h) holes.push(h); }));
    holes.forEach(h => { const k = (h.l || h.rail) + h.r; if (seen[k] && inView(h)) { const q = pt(h); b += '<circle cx="' + q.x + '" cy="' + q.y + '" r="6" fill="none" stroke="#ff3b30" stroke-width="2"/>'; } seen[k] = 1; });
    return svg(g.W, g.H, b, 'Breadboard diagram from the tutor');
  }

  return { fig: name => (F[name] ? F[name]() : ''), custom };
})();

/* ---------- walkthroughs ---------- */
const TUTOR = {
  E1: {
    gear: ['UNO R3 board and its USB cable', 'Your Windows computer'],
    steps: [
      { t: 'Get the Arduino app',
        say: 'The Arduino app (the IDE) is where you write a sketch, the program for the board. It turns your sketch into instructions the chip understands and sends them down the USB cable.',
        why: 'Every gadget in this build starts life as a sketch in this app.',
        do: ['Download Arduino IDE 2 for Windows from arduino.cc/en/software and install it.', 'Say yes when Windows asks to install drivers. They let the computer talk to the board.'],
        ask: [{ q: 'What does the Upload button (the right arrow) actually do?', opts: [
          ['Checks the sketch, converts it, and sends it to the board', true, 'Right. That conversion step is called compiling. If there\'s a typo, it stops there with an orange error.'],
          ['Saves the sketch to your computer', false, 'That\'s Save (Ctrl+S). Upload goes a step further.'],
          ['Turns the board on', false, 'The board powers up as soon as the USB cable is in. The green ON light shows that.']] }] },
      { t: 'Find the board',
        say: 'Plug the board in. The app needs two things: what kind of board it is, and which port (connection) it\'s on. On Windows, ports are called COM3, COM4 and so on.',
        do: ['Tools > Board > Arduino AVR Boards > Arduino Uno. Elegoo\'s UNO is a copy of the Arduino Uno, so this is the right choice.', 'Tools > Port: pick the COM port. Not sure which? Look at the list, unplug the board, and look again. The one that disappeared is your board.'],
        ask: [{ q: 'The green ON light is lit, but no COM port shows up. What\'s the most likely cause?', opts: [
          ['Windows is missing the driver for the board\'s USB chip', true, 'Right. Some Elegoo boards use a CH340 USB chip. Elegoo\'s site has the CH340 driver; install it and replug.'],
          ['The board is broken', false, 'Unlikely: the ON light says it\'s getting power. Think about how Windows recognizes a device.'],
          ['The Blink sketch isn\'t open', false, 'The port list doesn\'t care which sketch is open. It\'s about Windows seeing the board.']] }],
        hints: ['Try a different USB port on the computer, then check Tools > Port again.', 'Open Device Manager and look under Ports (COM & LPT). A yellow warning icon means a missing driver.'] },
      { t: 'Upload Blink',
        say: 'Blink is the hello world of hardware. It switches pin 13 on and off. The UNO has a small LED marked L wired to pin 13, so you can see it without building anything.',
        do: ['File > Examples > 01.Basics > Blink.', 'Press Upload. Wait for Done uploading at the bottom.', 'Watch the L light: on one second, off one second.'],
        ask: [{ q: 'A sketch has setup() and loop(). Which one runs over and over?', opts: [
          ['loop()', true, 'Right. setup() runs once when the board starts, then loop() repeats forever.'],
          ['setup()', false, 'setup() runs once, at power-up or reset. Look at the name of the other one.'],
          ['Both, one after the other', false, 'setup() only runs once at the start. One of them repeats.']] }] },
      { t: 'Change the timing',
        say: 'delay(1000) pauses the program. The number is in milliseconds, thousandths of a second.',
        do: ['Change both 1000s to 200 and Upload again. The light should flash fast.'],
        ask: [{ q: 'How long does delay(250) wait?', opts: [
          ['A quarter of a second', true, 'Right: 250 thousandths of a second.'],
          ['250 seconds', false, 'Delay counts in milliseconds. 1000 of them make one second.'],
          ['2.5 seconds', false, 'Close, but count again: 1000 ms is one second, so 250 ms is...']] }] },
      { t: 'Mission: SOS',
        say: 'SOS in Morse is three short flashes, three long, three short. You already know everything needed: on, wait, off, wait.',
        why: 'Turning an idea into a sequence of exact steps is what programming is.',
        do: ['Rewrite loop() so the L light flashes SOS, then pauses and repeats.'],
        hints: ['One flash is four lines: digitalWrite(13, HIGH); delay(...); digitalWrite(13, LOW); delay(...);', 'Use 200 ms for a short flash and 600 ms for a long one. Copy the four flash lines nine times and change the numbers. Add a longer delay at the very end so the SOS is grouped.'],
        show: 'Each flash is on, wait, off, short gap. A slightly longer gap separates the letters, and a long one separates each SOS.',
        showCode: 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid flash(int ms) {        // one flash, any length\n  digitalWrite(13, HIGH);\n  delay(ms);\n  digitalWrite(13, LOW);\n  delay(200);\n}\n\nvoid loop() {\n  flash(200); flash(200); flash(200);   // S\n  delay(400);\n  flash(600); flash(600); flash(600);   // O\n  delay(400);\n  flash(200); flash(200); flash(200);   // S\n  delay(1400);\n}' }
    ]
  },

  E2: {
    gear: ['UNO with your SOS sketch still on it', 'Breadboard (the big white one)', '1 LED (red is easiest to see)', '1 resistor, 220 Ω', '2 jumper wires', 'USB cable, unplugged for now'],
    steps: [
      { t: 'How the board is joined inside', fig: 'bbAnatomy',
        cap: 'Row 3 lit up. a3 to e3 is one strip; f3 to j3 is a separate strip. The rails down each edge run the full length: + beside the red line, − beside the blue.',
        say: 'Under the holes are metal clips. Each numbered row has two strips of five holes: a to e, and f to j. Anything pushed into the same strip is connected, as if you\'d twisted the wires together. The gap down the middle keeps the two strips apart. The long rails down the outside edges are for power (+) and ground (−).',
        why: 'You never solder on a breadboard. Where you push a leg decides what it connects to, so this is the one thing to get straight.',
        do: ['Stand your board up like the drawing: numbers 1 to 63 running down the sides, letters a to j across the top. Find row 3 and touch a3, then e3.'],
        ask: [
          { q: 'One wire goes into a12, another into d12. Are they connected?', opts: [
            ['Yes', true, 'Right. Same number, same side of the gap: one strip.'],
            ['No', false, 'Look at the drawing: a to e in one numbered row is a single strip.']] },
          { q: 'What about c7 and h7?', opts: [
            ['Connected', false, 'c is on one side of the gap and h is on the other. The gap splits every row in two.'],
            ['Not connected', true, 'Right. The middle gap separates them.']] }] },
      { t: 'Meet the LED', fig: 'ledLegs',
        say: 'An LED is a light that only lets current through one way. The long leg (+) goes toward the pin, the short leg (−) toward GND. If the legs have been cut, the flat edge on the LED\'s rim marks the − side.',
        why: 'Backwards, it simply stays dark. Knowing the legs saves you hunting for a fault that isn\'t there.',
        do: ['Pick up an LED and find the long leg and the flat edge.'],
        ask: [{ q: 'If you put the LED in backwards, what happens?', opts: [
          ['It stays dark and nothing is damaged', true, 'Right. Backwards, it blocks the current. Flip it and it lights.'],
          ['It burns out', false, 'Not at 5 V. Backwards, it just blocks the current.'],
          ['It glows dimmer', false, 'An LED works one way only. Backwards, there\'s no glow at all.']] }] },
      { t: 'Find a 220 Ω resistor', fig: 'resBands',
        say: 'A resistor limits how much current flows. Without one, the LED would let far too much through and burn out, and strain the pin too. 220 Ω keeps the current around 14 mA: bright and safe.',
        why: 'Every LED you ever wire needs a resistor in its path. The next lesson shows how to work out the value.',
        do: ['Count the coloured bands on your resistors. 5 bands: 220 Ω is red, red, black, black, brown. 4 bands: red, red, brown, gold.', 'If they\'re still on a paper strip or in a labelled spot in the case, the label is the easiest way to know.', 'Set one 220 Ω resistor by the board.'],
        ask: [{ q: 'Does it matter which way round the resistor goes in?', opts: [
          ['No', true, 'Right. Resistors work the same in both directions. LEDs are the fussy ones.'],
          ['Yes', false, 'Resistors have no + or − side. Only parts like LEDs care about direction.']] }],
        hints: ['Read with the lone band (the one with a bigger gap before it) on the right.', 'On 5-band resistors, 220 Ω (red, red, black, black, brown) and 10 kΩ (brown, black, black, red, brown) can look alike if you read backwards. 220 Ω starts with two reds.'] },
      { t: 'Plan the loop', fig: 'loop',
        say: 'Electricity only flows around a complete loop. Here it leaves pin 13, goes through the resistor, into the LED\'s long leg and out of its short leg, then back to GND. GND is the board\'s return path. A break anywhere in the loop means nothing lights.',
        why: 'Every circuit you\'ll ever debug comes down to this question: where is the loop broken?',
        ask: [{ q: 'In this loop, what comes right after the resistor?', opts: [
          ['The LED\'s long leg', true, 'Right. Current goes in the long (+) leg and out the short (−) leg.'],
          ['The LED\'s short leg', false, 'The short leg is the exit, toward GND.'],
          ['GND', false, 'GND is the end of the loop. The LED sits between the resistor and GND.']] }] },
      { t: 'Build it', fig: 'e2Build',
        cap: 'Pin 13 to a15. The resistor joins row 15 to row 11. The LED\'s long leg is in row 11, its short leg in row 10. Row 10 goes to GND.',
        say: 'Rows do the joining. The resistor\'s end and the LED\'s long leg share row 11, so they\'re connected without touching each other.',
        do: ['Leave the USB cable unplugged while you build, so a slip can\'t short anything.', 'Resistor: one leg in c11, the other in c15. Bend the legs to fit.', 'LED: long leg in e11, short leg in e10.', 'Jumper wire: from pin 13 on the UNO (top edge, beside GND) to a15.', 'Jumper wire: from GND (the pin right beside 13) to a10.'],
        ask: [{ q: 'Trace it: the pin 13 wire lands in row 15. What else is in row 15?', opts: [
          ['One leg of the resistor', true, 'Right. The resistor\'s other leg is in row 11, with the LED\'s long leg. That\'s the loop on the board.'],
          ['The LED', false, 'The LED\'s legs are in rows 10 and 11. Look for what else is in row 15.'],
          ['Nothing else', false, 'Check c15 in the drawing.']] }],
        hints: ['Push every leg all the way in. A part should stand up on its own.', 'Hold the board next to the drawing and check one hole at a time: c11, c15, e11, e10, a15, a10.'] },
      { t: 'Power up and test',
        say: 'The board keeps the last sketch you uploaded, even unplugged. Your SOS sketch should start as soon as it has power. The breadboard LED and the L light both flash, because they\'re both on pin 13.',
        do: ['Plug the USB cable back in.'],
        ask: [{ q: 'What happened?', opts: [
          ['Both lights flash SOS', true, 'That\'s E2 done. Mark it complete; next comes the why behind 220 Ω.'],
          ['The L light flashes but the breadboard LED doesn\'t', null, 'The loop is broken somewhere on the breadboard. First, flip the LED. Then check the long leg is in row 11, the same row as the resistor\'s end. Check the pin 13 wire is in 13, not 12, and the GND wire is in GND.'],
          ['It\'s lit but very dim', null, 'You probably grabbed a 10 kΩ (brown, black, black, red, brown). A big resistor only lets a trickle through. Swap in a 220 Ω.'],
          ['Nothing flashes at all', null, 'The sketch may not be on the board. Open your SOS sketch and press Upload again.']] }] }
    ]
  },

  E3: {
    gear: ['Your E2 circuit', 'Another LED', '1 resistor, 1 kΩ (5 bands: brown, black, black, brown, brown; 4 bands: brown, black, red, gold)', '1 jumper wire', 'Pen and paper'],
    steps: [
      { t: 'Push, flow, squeeze',
        say: 'Think of water in a hose. Voltage (volts, V) is the pressure pushing. Current (amps, A) is how much flows. Resistance (ohms, Ω) is a narrow spot in the hose that restricts the flow.',
        why: 'This one picture explains most of what a circuit does, including why your LED needed that resistor.',
        ask: [{ q: 'Same pressure, narrower hose. What happens to the flow?', opts: [
          ['Less flows', true, 'Right. More resistance, less current.'],
          ['More flows', false, 'Squeeze a hose: does more water come out, or less?'],
          ['No change', false, 'Squeezing a hose changes the flow. Which way?']] }] },
      { t: 'The equation',
        say: 'Ohm\'s law: V = I × R. Volts equal amps times ohms. Turn it around to find what you need: I = V ÷ R, or R = V ÷ I. Small currents are in milliamps: 1 mA = 0.001 A.',
        why: 'Work the units carefully. Most wrong answers come from using mA where the formula wants A.',
        ask: [{ q: 'What is 20 mA in amps?', opts: [
          ['0.02 A', true, 'Right. Divide by 1000.'],
          ['0.2 A', false, 'That would be 200 mA. Divide 20 by 1000.'],
          ['2 A', false, 'That\'s a lot of current. Divide 20 by 1000.']] }] },
      { t: 'The LED takes its share',
        say: 'An LED uses up about 2 V of the pin\'s 5 V (red ones; blue and white take about 3 V). The resistor gets whatever is left. That leftover voltage is what you use in the formula.',
        ask: [{ q: '5 V pin, red LED taking 2 V. How many volts are left across the resistor?', opts: [
          ['3 V', true, 'Right. The drops add up to the supply: 2 + 3 = 5.'],
          ['5 V', false, 'The LED has already taken 2 of the 5.'],
          ['2 V', false, 'That\'s the LED\'s share. What\'s left of the 5?']] }] },
      { t: 'Mission part 1: work it out',
        say: 'Now put it together. You want 20 mA through a red LED from a 5 V pin.',
        do: ['On paper, find the resistor value. Then pick the answer below.'],
        ask: [
          { q: 'What resistance gives 20 mA?', opts: [
            ['150 Ω', true, 'Right: 3 V ÷ 0.02 A = 150 Ω.'],
            ['250 Ω', false, 'You used 5 V. The LED takes 2 V first, so use the 3 V that\'s left.'],
            ['100 Ω', false, 'Check the volts: the resistor gets 3 V, not 2.'],
            ['60 Ω', false, 'Looks like 3 × 20. The formula divides: R = V ÷ I, and the current goes in as 0.02 A.']] },
          { q: 'Your kit has no 150 Ω, only 100 Ω and 220 Ω. Which do you use?', opts: [
            ['220 Ω', true, 'Right. Round up: slightly less current, slightly dimmer, and safe.'],
            ['100 Ω', false, 'Work it out: 3 ÷ 100 = 30 mA, more than the LED\'s 20 mA. Round up instead.']] }],
        hints: ['R = V ÷ I. You know V across the resistor (last step) and I in amps (two steps back).', '3 ÷ 0.02 = ?'],
        show: 'R = 3 V ÷ 0.02 A = 150 Ω. Your kit doesn\'t have 150, so round up to 220 Ω.' },
      { t: 'Read a resistor',
        say: 'Bands are digits, then a multiplier. On 5-band resistors the first three bands are digits and the fourth says how many zeros to add. On 4-band resistors it\'s two digits then the zeros. The last band is the tolerance, how accurate it is.',
        why: 'Labels get lost. Reading the bands means you can always find the part you need.',
        do: ['Colours to digits: black 0, brown 1, red 2, orange 3, yellow 4, green 5, blue 6, violet 7, grey 8, white 9.'],
        ask: [{ q: 'A 5-band resistor reads brown, black, black, red, brown. What value?', opts: [
          ['10 kΩ', true, 'Right. 1, 0, 0, then red adds two zeros: 10,000 Ω.'],
          ['1 kΩ', false, 'Count the digits: brown, black, black is 100. The fourth band (red) adds two zeros.'],
          ['100 Ω', false, 'That\'s the first three bands only. The fourth band (red) is the multiplier: add two zeros.']] }],
        hints: ['Write the first three bands as digits: brown, black, black = 1, 0, 0.', 'Red as the fourth band means add two zeros.'] },
      { t: 'Mission part 2: compare', fig: 'e3Build',
        cap: 'The E2 circuit plus a second branch: a 1 kΩ from row 15 to row 19, a second LED with its long leg in row 19 and short leg in row 18, and row 18 to GND.',
        say: 'Both LEDs hang off pin 13, so they flash together. One goes through 220 Ω, the other through 1 kΩ. Predict which is dimmer before you plug in.',
        do: ['Unplug USB.', '1 kΩ resistor: d15 to d19.', 'Second LED: long leg in e19, short leg in e18.', 'Jumper: a18 to one of the GND pins on the power side of the UNO (beside 5V).', 'Plug in and compare.'],
        ask: [{ q: 'Which LED is dimmer, and why?', opts: [
          ['The 1 kΩ one: more resistance, less current', true, 'Right. 3 V ÷ 1000 Ω = 3 mA, against about 14 mA through the 220 Ω.'],
          ['The 220 Ω one', false, 'Run the numbers: 3 V ÷ 220 Ω and 3 V ÷ 1000 Ω. Which gives less current?'],
          ['They look the same', null, 'Cup your hand around them to block room light. If one stays dark, check its long leg is in row 19.']] }] }
    ]
  },

  E4: {
    gear: ['Your circuit with the E2 LED on pin 13', '1 push button (small, four legs)', '2 jumper wires'],
    steps: [
      { t: 'Pins can listen',
        say: 'So far pin 13 has pushed voltage out. A pin set as an INPUT listens instead. It reports HIGH (near 5 V) or LOW (near 0 V, GND).',
        why: 'Buttons, switches and sensors all talk to the board through inputs. Your deck\'s panel switches will work this way too.',
        ask: [{ q: 'An input pin with nothing connected to it. What does it read?', opts: [
          ['Random HIGHs and LOWs', true, 'Right. A loose pin acts like a tiny antenna and picks up noise. That\'s called floating.'],
          ['Always LOW', false, 'Nothing is holding it low. With nothing connected, it drifts.'],
          ['Always HIGH', false, 'Only if something holds it there. With nothing connected, it drifts.']] }] },
      { t: 'The pull-up', fig: 'pullup',
        say: 'INPUT_PULLUP switches on a weak resistor inside the chip, between the pin and 5 V. It gently holds the pin HIGH. When you press the button, it connects the pin straight to GND. That beats the weak pull-up, and the pin reads LOW.',
        why: 'It means no floating and no extra parts: just a button between the pin and GND.',
        ask: [{ q: 'With INPUT_PULLUP, what does pin 2 read while the button is held down?', opts: [
          ['LOW', true, 'Right. Pressed means LOW. It feels backwards at first.'],
          ['HIGH', false, 'Pressing connects the pin to GND. What does GND read as?']] }] },
      { t: 'Place the button', fig: 'e4Build',
        cap: 'The button straddles the middle gap with legs in e20, e22, f20 and f22. Pressing it joins row 20 to row 22.',
        say: 'The button has four legs in two pairs. The legs facing each other across the gap are always joined. Pressing joins row 20 to row 22.',
        do: ['Unplug USB.', 'Press the button in across the middle gap: legs in e20, e22, f20 and f22. It should click in flat.'],
        ask: [{ q: 'Which rows does pressing the button connect?', opts: [
          ['Row 20 and row 22', true, 'Right. That\'s the switch.'],
          ['The e side and the f side', false, 'Those are always joined through the button\'s legs. Pressing does something else.']] }],
        hints: ['If it won\'t sit flat, turn it a quarter turn. It only fits neatly one way across the gap.'] },
      { t: 'Wire it',
        say: 'Pin 2 goes to one side of the switch, GND to the other. Press, and pin 2 is connected to GND.',
        do: ['If the second LED from E3 is still in, take it and its wires out. You\'re done with it, and it frees up a GND pin.', 'Jumper: pin 2 (top edge, near TX and RX) to a20.', 'Jumper: a GND pin on the power side of the UNO to a22.', 'Leave the E2 LED where it is.'],
        ask: [{ q: 'Pressing the button connects pin 2 to what?', opts: [
          ['GND', true, 'Right. And that\'s why pressed reads LOW.'],
          ['5 V', false, 'Look where the a22 wire goes.'],
          ['Pin 13', false, 'Pin 13 drives the LED. The button joins pin 2 to whatever row 22 is wired to.']] }] },
      { t: 'The code',
        say: 'In setup(), pin 2 becomes an input with the pull-up on and pin 13 an output. Every time round loop(), read the button and set the LED to match.',
        why: 'if and else is how a program makes decisions. You\'ll use it in every gadget.',
        code: 'void setup() {\n  pinMode(2, INPUT_PULLUP);\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  if (digitalRead(2) == LOW) {   // pressed\n    digitalWrite(13, HIGH);\n  } else {\n    digitalWrite(13, LOW);\n  }\n}',
        do: ['Open a new sketch (File > New Sketch), paste this in, plug in USB and Upload.', 'The lesson page shows a one-line version that does the same thing.'],
        ask: [{ q: 'Why does the code check for LOW to mean pressed?', opts: [
          ['Because of the pull-up: pressed connects the pin to GND', true, 'Right.'],
          ['It\'s a typo', false, 'It\'s on purpose. Think about what the pull-up does.']] }] },
      { t: 'Test it',
        do: ['Hold the button down, then let go.'],
        ask: [{ q: 'What happens?', opts: [
          ['The LED lights only while I hold the button', true, 'That\'s the mission. Try the stretch goal next, or mark E4 complete.'],
          ['The LED stays on all the time', null, 'Pin 2 is always connected to GND, so the button is probably turned the wrong way. Turn it a quarter turn so it straddles the gap as in the drawing.'],
          ['The LED never lights', null, 'Check the pin 2 wire is in pin 2 and a20, and the GND wire is in a GND pin and a22. Check the E2 LED still works by uploading your SOS sketch.'],
          ['It flickers or acts randomly', null, 'The pin is floating. Check setup() says INPUT_PULLUP, not just INPUT.']] }] },
      { t: 'Stretch: press to toggle',
        say: 'Now make each press switch the LED on or off and leave it there. Two new problems appear: the program has to remember whether the LED is on, and it has to notice the moment of a press, not just whether the button is down.',
        why: 'Remembering state and catching changes is how every menu, mode switch and counter works.',
        hints: ['Remember state with a variable above setup(): bool on = false;', 'Spot the moment of pressing by comparing this reading with the last one. A change from HIGH to LOW is a press.', 'A button\'s contacts bounce for a few milliseconds and one press can look like several. A short delay(50) after any change is the simplest fix; that\'s called debouncing.'],
        show: 'Keep the last reading. When the reading changes and the new one is LOW, flip the state. Wait 50 ms after any change to let the bounce settle.',
        showCode: 'bool on = false;\nint last = HIGH;\n\nvoid setup() {\n  pinMode(2, INPUT_PULLUP);\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  int now = digitalRead(2);\n  if (now != last) {          // the button changed\n    if (now == LOW) {         // it was just pressed\n      on = !on;\n      digitalWrite(13, on ? HIGH : LOW);\n    }\n    delay(50);                // let the bounce settle\n  }\n  last = now;\n}' }
    ]
  },

  E5: {
    gear: ['UNO and USB cable', '1 photoresistor (small disc with a squiggle on top)', '1 resistor, 10 kΩ (5 bands: brown, black, black, red, brown; 4 bands: brown, black, orange, gold)', '3 jumper wires'],
    steps: [
      { t: 'Numbers, not just on and off',
        say: 'Digital pins only know HIGH or LOW. The analog pins A0 to A5 measure a voltage between 0 and 5 V and give a number from 0 to 1023.',
        why: 'Most sensors give a voltage that rises and falls. This is how the board reads them.',
        ask: [{ q: 'analogRead gives 512. About how many volts is that?', opts: [
          ['About 2.5 V', true, 'Right. 512 is about halfway to 1023, so about halfway to 5 V.'],
          ['About 5 V', false, '5 V would read 1023. 512 is about halfway.'],
          ['512 V', false, 'The number is a scale from 0 to 1023, not volts.']] }] },
      { t: 'The photoresistor',
        say: 'A photoresistor\'s resistance changes with light: low in bright light (a few hundred ohms), high in the dark (tens of thousands). Like a resistor, it has no + or − side.',
        ask: [{ q: 'You cover it with your hand. Its resistance goes...', opts: [
          ['Up', true, 'Right. Darker means more resistance.'],
          ['Down', false, 'Bright light means low resistance. So darkness means...']] }] },
      { t: 'The voltage divider', fig: 'divider',
        say: 'The board can\'t measure resistance, only voltage. So the photoresistor and a fixed 10 kΩ resistor sit in a line between 5 V and GND. The point between them sits at a voltage set by how the two compare. A0 reads that middle point.',
        why: 'Voltage dividers turn almost any changing-resistance sensor into a voltage the board can read. You\'ll see them everywhere.',
        ask: [{ q: 'The photoresistor is on the 5 V side. When you cover it, the reading will...', opts: [
          ['Go down', true, 'Right. In the dark the photoresistor takes a bigger share of the 5 V, so less is left at the middle point.'],
          ['Go up', false, 'Darker means more resistance on the 5 V side. It takes a bigger share of the 5 V. What\'s left for the middle?']] }],
        hints: ['Picture two people splitting 5 V in proportion to their resistance. The bigger one takes more.'] },
      { t: 'Build it', fig: 'e5Build',
        cap: '5V to row 26. The photoresistor joins rows 26 and 28. The 10 kΩ joins rows 28 and 32, in column d because c28 is taken. Row 28 is the middle point, wired to A0. Row 32 goes to GND.',
        say: 'Elegoo\'s own Photocell lesson uses a 1 kΩ instead of 10 kΩ. Both work; 10 kΩ gives a bigger swing in ordinary room light.',
        do: ['Unplug USB.', 'Photoresistor: legs in c26 and c28.', '10 kΩ resistor: d28 to d32. One leg per hole: c28 already has the photoresistor, and d28 is in the same row, so they\'re joined.', 'Jumper: 5V (power side of the UNO) to a26.', 'Jumper: A0 to a28.', 'Jumper: GND to a32. You\'ve now used all three GND pins, which is when the rails earn their keep: one wire from GND to the − rail, and everything else plugs into the rail.'],
        ask: [{ q: 'Which row is the middle point that A0 reads?', opts: [
          ['Row 28', true, 'Right. It sits between the photoresistor and the 10 kΩ.'],
          ['Row 26', false, 'Row 26 is the 5 V end.'],
          ['Row 32', false, 'Row 32 is the GND end.']] }] },
      { t: 'Send readings to the computer',
        say: 'Serial.begin(9600) opens a text line to the computer over the USB cable at 9600 baud, the speed. Both ends have to use the same speed. Serial.println sends a number and starts a new line.',
        code: 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int light = analogRead(A0);\n  Serial.println(light);\n  delay(100);              // ten readings a second\n}',
        do: ['New sketch, paste, plug in, Upload.', 'Tools > Serial Monitor. Set 9600 baud in its bottom corner.'],
        ask: [{ q: 'The Serial Monitor shows garbage characters. Most likely cause?', opts: [
          ['The baud rate in the monitor doesn\'t match 9600', true, 'Right. Set the monitor to 9600 to match the sketch.'],
          ['The sensor is broken', false, 'A broken sensor gives odd numbers, not odd characters. Check the speed setting.']] }] },
      { t: 'Watch it move',
        do: ['Close the Serial Monitor and open Tools > Serial Plotter.', 'Cover the photoresistor with your hand, then shine your phone\'s flashlight on it.'],
        ask: [{ q: 'What does the line do?', opts: [
          ['It drops when covered and climbs in the flashlight', true, 'That\'s E5. Finishing it opens Mesh net (phase 5) once the deck is running.'],
          ['It sits at 0', null, 'Row 28 isn\'t getting any voltage. Check the 5V wire is in a26 and the photoresistor really bridges rows 26 and 28.'],
          ['It sits near 1023', null, 'The middle point is stuck at 5 V, so the 10 kΩ isn\'t reaching GND. Check the a32 wire goes to a GND pin.'],
          ['It jumps around randomly', null, 'A0 is floating. Check the A0 wire is in a28 and in A0 on the board, not AREF or a digital pin.']] }] }
    ]
  }
};

/* ---------- more walkthroughs ---------- */
Object.assign(TUTOR, {
  E7: {
    gear: ['Soldering iron with a stand (temperature-controlled is best)', 'Rosin-core solder, 0.6 to 0.8 mm', 'Damp sponge or brass wool', 'A practice board, or perfboard and a strip of header pins', 'Your kit\'s LCD screen and its 16-pin header', 'Safety glasses, side cutters, somewhere with moving air'],
    steps: [
      { t: 'Why solder, and why now',
        say: 'A breadboard holds parts with springy clips. That\'s perfect for trying ideas and useless in a pack that gets bounced around. Solder melts into a joint and sets, joining parts for good, electrically and mechanically.',
        why: 'From here on most of the build is soldered: header pins on boards, the panel switches and USB ports, the battery wiring. Every one of those uses the same few movements. Practise them now on parts that don\'t matter.',
        ask: [{ q: 'Which job needs solder rather than the breadboard?', opts: [
          ['Wiring the toggle switches on the deck\'s front panel', true, 'Right. It lives in the case and gets carried around; clips would shake loose.'],
          ['Trying a new sensor to see what it reads', false, 'That\'s breadboard work: quick to change, nothing permanent.']] }] },
      { t: 'What you\'re soldering',
        say: ['First, practice joints on a board that doesn\'t matter. Then a real job from your own kit: the LCD screen, the green or blue 16 × 2 character display.', 'If its 16 pins came as a separate strip, they have to be soldered on before the screen works. Pressing them into the holes only touches a pin or two. Once it\'s on, the screen can show text from the deck: a reading, a mesh message, a temperature.'],
        do: ['Find the LCD in your kit. Are its 16 pins already attached, or a loose strip?'],
        ask: [{ q: 'What did you find?', opts: [
          ['A loose strip of 16 pins', true, 'That\'s your real job for this lesson, after the practice joints.'],
          ['The pins are already soldered on', true, 'Then your real job is a strip of header pins soldered onto perfboard. Any spare board works.']] }] },
      { t: 'Get an iron',
        say: 'Two routes. The makerspace electronics bench has irons, solder and fume fans, and people who\'ll check your joints. Or set up at home: a temperature-controlled iron kit is about $30 to $50 at Canadian Tire, Princess Auto or Amazon.ca, and a learn-to-solder practice kit (a small board with LEDs and resistors) is about $12.',
        why: 'You\'ll solder all through the build, so your own iron pays for itself. The makerspace is the free option if you\'d rather wait.',
        do: ['Pick a route. Buying? Mark the soldering kit as ordered in Parts. Using the makerspace? Mark it arrived once you\'re a member.'] },
      { t: 'Safe setup',
        say: 'The tip runs at about 330 to 370 °C. Treat it like a hot piece off the fire: it goes in its stand every single time you put it down. Work where air moves so the rosin smoke drifts away from your face. Wear glasses when you clip leads, because the cut ends fly. Wash your hands after handling leaded solder.',
        ask: [{ q: 'You need both hands to hold a part steady. Where does the iron go?', opts: [
          ['In its stand', true, 'Every time. Most soldering burns come from an iron set down on the bench.'],
          ['On the bench, tip pointing away', false, 'It rolls, and the bench or a cable melts. Stand, every time.']] }] },
      { t: 'Tin the tip',
        say: 'Turn the iron on, about 350 °C if it has a dial. Wipe the hot tip on the damp sponge or brass wool, then melt a little solder onto it so it goes shiny silver. That\'s called tinning.',
        why: 'A shiny, wet tip passes heat into the joint fast. A dull black tip doesn\'t, and the solder balls up instead of flowing.',
        do: ['Tin the tip now, and re-tin it every few joints.'],
        ask: [{ q: 'Your tip has gone dull and black and solder won\'t stick to it. What now?', opts: [
          ['Wipe it clean and melt fresh solder on', true, 'Right. Clean, then re-tin.'],
          ['Turn the heat way up', false, 'More heat just burns the tip faster. Clean it and re-tin it.']] }] },
      { t: 'One good joint', fig: 'joints',
        cap: 'Side view. Good: a shiny cone wetting both the pad and the pin. Cold: a ball that never bonded to the pad. Bridge: a blob joining two pins.',
        say: 'Touch the tip so it heats the pad and the pin together. After two seconds, feed solder into the joint from the other side, not onto the iron. Let a little flow in, pull the solder away, then the iron. Hold still for three seconds while it sets.',
        why: 'Solder flows toward heat. If the pad and pin are hot, it wicks around them and bonds. If only the iron is hot, it balls up and the joint is weak.',
        do: ['Make one joint on the practice board, then look at it closely.'],
        ask: [{ q: 'Which joint is good?', opts: [
          ['Shiny and smooth, shaped like a small cone around the pin', true, 'That\'s the one: the solder wetted both the pad and the pin.'],
          ['A round ball sitting on top of the pad', false, 'That\'s a cold joint: the pad wasn\'t hot enough, so the solder never bonded. Reheat with the tip on pad and pin together.'],
          ['Dull and grainy', false, 'That\'s a disturbed or cold joint: it moved while setting, or didn\'t get hot enough. Reheat until it flows, then hold still.']] }],
        hints: ['Heat the pad and pin, not the solder.', 'Count two seconds of heat before the solder touches.'] },
      { t: 'Twenty joints',
        do: ['Make 20 practice joints.', 'After every five, inspect them: shiny cones are good; balls, gaps and grainy ones get reheated.', 'If a blob joins two pins (a bridge), drag the clean hot tip between them to split it.'],
        ask: [{ q: 'How do they look?', opts: [
          ['Mostly shiny cones', true, 'You\'re ready for the real job.'],
          ['Lots of balls sitting on top', null, 'Not enough heat on the pad. Hold the tip on pad and pin a full two seconds before adding solder, and keep the tip tinned.'],
          ['Blobs joining neighbours', null, 'Too much solder. Use less, and split bridges by dragging the clean hot tip between the pins.'],
          ['Pads coming off the board', null, 'Too much heat for too long. Two or three seconds, then away. It happens on cheap practice boards; move on.']] }] },
      { t: 'The real job: the LCD header',
        say: 'Use the breadboard as a jig. Push the long ends of the 16-pin strip into the breadboard, then drop the LCD onto the short ends so they poke up through its holes. Now it\'s held square while you work. Quick two-second joints won\'t hurt the breadboard.',
        why: 'Tacking the two end pins first means a crooked header is a two-second fix, not 16 joints to undo.',
        do: ['Long ends of the header into the breadboard, LCD on top.', 'Solder pin 1 and pin 16 first, at the two ends.', 'Check the screen sits flat and square. If it doesn\'t, reheat one end and nudge it.', 'Solder the other 14 and inspect every joint.', 'Photograph your best and worst joints for the Field log.'],
        ask: [{ q: 'Why solder the two end pins first?', opts: [
          ['To fix the header square before doing the rest', true, 'Right. Then the rest hold it there.'],
          ['They need more solder than the others', false, 'They don\'t. Think about keeping it straight.']] }],
        hints: ['Want to see it work? Elegoo\'s tutorial has an LCD lesson. Ask the tutor to walk you through wiring it to show DECK OPS.'] }
    ]
  },

  C2: {
    gear: ['Your Windows computer with a mouse (Tinkercad is fiddly on a phone)', 'A free Tinkercad account at tinkercad.com'],
    steps: [
      { t: 'What CAD is',
        say: 'CAD means drawing parts in 3D on the computer, at exact sizes, so a printer can make them. Tinkercad builds everything from simple shapes: boxes, cylinders, text. Solid shapes add material. Shapes set to Hole take it away.',
        why: 'Every bracket, frame and mount in your case starts here. The printer only makes what you draw.',
        ask: [{ q: 'You want a 4 mm hole through a plate. How?', opts: [
          ['Put a 4 mm cylinder through the plate, set it to Hole, and group them', true, 'Right. Hole plus Group is how every cut is made.'],
          ['Draw a black circle on top of it', false, 'Colour doesn\'t cut anything. It has to be a Hole shape, grouped with the plate.']] }] },
      { t: 'Set up',
        say: 'The blue grid is the workplane. Right-drag turns the view, scroll zooms, and the cube in the top left snaps to Top, Front and so on. The house button resets the view.',
        do: ['Go to tinkercad.com and sign up (free).', 'Create new design, then 3D Design.', 'Bottom right of the workplane: check the units say millimetres.'] },
      { t: 'The blank',
        say: 'Drag a Box from the shapes panel on the right onto the workplane. Click it and white handles appear. Click a size number on a handle and type the exact value.',
        why: 'Typing sizes instead of dragging is the difference between a part that fits and one that almost fits.',
        do: ['Make the box 40 long, 25 wide and 3 high (mm).'],
        ask: [{ q: 'Your box is 40 × 25 but 20 mm tall. Fix?', opts: [
          ['Click the height number and type 3', true, 'Right. Change only what\'s wrong.'],
          ['Scale the whole thing down', false, 'That shrinks the length and width too. Change only the height.']] }] },
      { t: 'Raised name',
        say: 'Drag Text onto the workplane. In its settings box, type your name and set its height to 1 mm. Size it to fit on the tag. Then lift it so it starts exactly on top of the tag: select it, click the small black cone above it, and type 3.',
        do: ['Add Text with your name, 1 mm tall.', 'Raise it 3 mm so it sits on the tag.', 'Select the tag and the text, press L to Align, and centre them.'],
        ask: [{ q: 'From above it looks right, but the name floats 2 mm over the tag. Why?', opts: [
          ['It\'s raised 5 mm instead of 3', true, 'Right. It should start exactly where the tag stops: 3 mm up.'],
          ['The text is too thin', false, 'Thickness isn\'t the problem. Look at how high it starts.']] }] },
      { t: 'The hole',
        say: 'Drag in a Cylinder. Make it 4 × 4 mm across and taller than the tag (10 mm is fine), set it to Hole, and move it to a corner with about 2 mm of plastic around it. Select everything and group it with Ctrl+G.',
        why: 'A hole needs plastic around it or it tears out. Give it at least 2 mm.',
        ask: [{ q: 'You set the cylinder to Hole, but there\'s no hole in the tag. Why?', opts: [
          ['They aren\'t grouped yet', true, 'Right. A hole only cuts once it\'s grouped with the solid.'],
          ['The hole is too small', false, 'Size isn\'t it. A hole only cuts once you group it with the tag.']] }] },
      { t: 'Export it',
        say: 'An STL file is just the shape: no colours, no settings. It\'s what slicers and printers read.',
        do: ['Export (top right), then .STL.', 'Save it where you\'ll find it, and put a copy on a USB stick for the makerspace.', 'Bring it to your printer training and print it there; that\'s lesson C3.'] }
    ]
  },

  L1: {
    gear: ['Pi 5 kit: board, aluminum case, 27 W USB-C power supply, microSD card, micro-HDMI cable', 'Keyboard and mouse', 'The HP monitor, plugged in'],
    steps: [
      { t: 'What you\'re building',
        say: 'The Raspberry Pi is a whole computer on a card-sized board: processor, memory, Wi-Fi, USB. It has no screen or keyboard of its own, and its hard drive is the microSD card. Today it becomes your bench deck.',
        ask: [{ q: 'Where does the Pi keep its operating system and your files?', opts: [
          ['On the microSD card', true, 'Right. Swap the card and you swap the whole computer.'],
          ['On the board itself', false, 'The Pi has no built-in drive. Everything lives on the card.']] }] },
      { t: 'Into the case',
        say: 'The aluminum case is also the heat sink. Thermal pads sit between the hot chips and the case so heat flows into the metal.',
        why: 'Without the pads the chip gets hot and slows itself down to protect itself.',
        do: ['Peel the film off the thermal pads and place them where the kit\'s instructions show.', 'Set the Pi in the case and screw it closed: snug, not cranked.'],
        ask: [{ q: 'What do the thermal pads do?', opts: [
          ['Carry heat from the chips into the metal case', true, 'Right.'],
          ['Hold the board in place', false, 'The screws do that. The pads move heat.']] }] },
      { t: 'Card in, cables on',
        do: ['Slide the microSD card into the slot on the underside, label facing away from the board, until it stops. The kit\'s card already has Raspberry Pi OS on it.', 'Micro-HDMI cable from the port beside the USB-C power jack to an HDMI input on the HP.', 'Keyboard and mouse into the USB ports.', 'Power in last. The Pi starts as soon as it has power.'],
        ask: [{ q: 'The monitor says no signal. First thing to check?', opts: [
          ['That the HP is set to the HDMI input the cable is plugged into', true, 'Right. Use the monitor\'s input button, then check the cable is in the port beside the power jack.'],
          ['Reinstall the operating system', false, 'Way too far. Start with the monitor\'s input setting and the cable.']] }] },
      { t: 'The setup wizard',
        do: ['Country Canada, language English, time zone Winnipeg.', 'Pick a username and a password you\'ll remember, and write the password down. You\'ll type it often.', 'Join your Wi-Fi.', 'Say yes to updates. It takes 10 to 20 minutes; let it finish.', 'Restart when it asks.'],
        ask: [{ q: 'What will the password you just made be used for?', opts: [
          ['Logging in, and approving admin commands like updates', true, 'Right. In L4, sudo asks for it every time.'],
          ['Only the Wi-Fi', false, 'That\'s a separate password. This one is your account on the Pi.']] }] },
      { t: 'Terminal, then shut down properly',
        do: ['Click the black terminal icon in the top bar. A window with a prompt opens. That\'s where most lessons happen.', 'To turn it off: Raspberry menu, then Shutdown. Wait for the green light to stop flashing, then unplug.'],
        why: 'Pulling the plug while it\'s writing to the card can corrupt it, and then you\'re rebuilding.',
        ask: [{ q: 'What do you see?', opts: [
          ['A window with a prompt like you@raspberrypi:~ $', true, 'That\'s L1 done.'],
          ['A rainbow screen and nothing else', null, 'The Pi isn\'t reading the card. Unplug, push the card in firmly until it stops, and power up again.'],
          ['A lightning bolt in the corner', null, 'That\'s the low-power warning. Use the kit\'s 27 W supply, not a phone charger.']] }] }
    ]
  },

  L2: {
    gear: ['The deck running, with a terminal open'],
    steps: [
      { t: 'Reading the prompt',
        say: 'In the terminal you type commands instead of clicking, and Enter runs them. The prompt tells you who and where you are: you@raspberrypi:~ $ means user, computer name, then folder. The ~ means your home folder. (The computer becomes deck in L6.)',
        ask: [{ q: 'In you@raspberrypi:~ $, what does ~ mean?', opts: [
          ['You\'re in your home folder', true, 'Right. Your own files live there.'],
          ['Something is wrong', false, 'It\'s just shorthand for your home folder.']] }] },
      { t: 'Where am I, what\'s here',
        do: ['Type pwd and press Enter. It prints the folder you\'re in, like /home/you.', 'Type ls and press Enter. It lists what\'s inside: Desktop, Documents and so on.'],
        ask: [{ q: 'pwd printed /home/you. What does ls show you?', opts: [
          ['The files and folders inside /home/you', true, 'Right. Only what\'s in the folder you\'re in.'],
          ['Every file on the computer', false, 'Just the folder you\'re in.']] }] },
      { t: 'Moving around',
        say: 'Capitals matter. Documents and documents are different names. Tab finishes names for you, and the up arrow brings back earlier commands.',
        do: ['cd Documents moves into Documents. Run pwd to check.', 'cd .. moves up one folder. cd ~ jumps home from anywhere.', 'Type cd Doc and press Tab. It finishes the name.'],
        ask: [{ q: 'You\'re in /home/you/Documents and type cd .. Where are you now?', opts: [
          ['/home/you', true, 'Right. Up one level.'],
          ['/', false, '.. is one level up, not all the way to the top.']] }] },
      { t: 'Make your deck folder',
        do: ['mkdir -p ~/deck/logs makes a deck folder with a logs folder inside it.', 'cd ~/deck/logs, then pwd.'],
        why: '-p makes any missing folders on the way and doesn\'t complain if they already exist.',
        ask: [{ q: 'What does pwd print?', opts: [
          ['/home/you/deck/logs', true, 'That\'s the mission done.'],
          ['No such file or directory', null, 'Check the spelling and capitals: deck, not Deck. Run the mkdir line again exactly as written.']] }] }
    ]
  },

  L3: {
    gear: ['The deck running, with a terminal open'],
    steps: [
      { t: 'Write a file with nano',
        say: 'nano is a plain text editor inside the terminal. Its shortcuts are listed along the bottom, where ^ means Ctrl.',
        do: ['nano ~/deck/notes.txt opens a new file.', 'Type three lines about today.', 'Ctrl+O then Enter saves. Ctrl+X quits.'],
        ask: [{ q: 'The bottom of nano shows ^X Exit. What do you press?', opts: [
          ['Ctrl and X together', true, 'Right. ^ is how Linux writes Ctrl.'],
          ['Shift and 6, then X', false, '^ isn\'t a key to type here. It means Ctrl.']] }] },
      { t: 'Read it back',
        do: ['cat ~/deck/notes.txt prints the file to the screen.'],
        ask: [{ q: 'cat prints nothing at all. Most likely?', opts: [
          ['The file wasn\'t saved', true, 'Right. Reopen it with nano, then Ctrl+O and Enter before Ctrl+X.'],
          ['cat is broken', false, 'cat is fine. Check that the file actually got saved.']] }] },
      { t: 'Copy, rename, delete',
        say: 'cp copies, mv moves or renames, rm deletes. rm has no trash can: the file is gone for good.',
        do: ['cd ~/deck', 'cp notes.txt notes-copy.txt, then ls to see both.', 'rm notes-copy.txt, then ls again.'],
        ask: [{ q: 'You type rm notes.txt by mistake. Can you get it back from the trash?', opts: [
          ['No, rm deletes for good', true, 'Right. That\'s why you read rm lines twice before pressing Enter.'],
          ['Yes, from the trash on the desktop', false, 'The terminal doesn\'t use the trash. rm is permanent.']] }] },
      { t: 'Check',
        do: ['ls ~/deck'],
        ask: [{ q: 'What does it show?', opts: [
          ['logs and notes.txt', true, 'That\'s L3.'],
          ['notes-copy.txt is still there', null, 'Run rm ~/deck/notes-copy.txt and check again.']] }] }
    ]
  },

  L4: {
    gear: ['The deck running on Wi-Fi, with a terminal open'],
    steps: [
      { t: 'Packages',
        say: 'Software on the Pi comes as packages from Raspberry Pi\'s servers, and apt is the tool that fetches them. Think of it as an app store you drive by typing.',
        why: 'Every tool you add from here on, from radio drivers to Python libraries, installs this way.' },
      { t: 'sudo and your password',
        say: 'Installing changes the whole system, so it needs admin rights. Putting sudo in front of a command runs it as the administrator. It asks for your password, and nothing shows as you type. That\'s on purpose.',
        ask: [{ q: 'You type your password after sudo and nothing appears on screen. What\'s happening?', opts: [
          ['It\'s hidden on purpose; finish typing and press Enter', true, 'Right. No dots, no stars, just type it.'],
          ['The keyboard stopped working', false, 'It\'s hiding the password on purpose. Type it and press Enter.']] }] },
      { t: 'Update everything',
        do: ['sudo apt update refreshes the list of what\'s available.', 'sudo apt full-upgrade installs the newer versions. When it asks "Do you want to continue? [Y/n]", press Y and Enter.'],
        ask: [{ q: 'What\'s the difference between update and full-upgrade?', opts: [
          ['update checks what\'s new; full-upgrade installs it', true, 'Right. Always in that order.'],
          ['They do the same thing', false, 'update only refreshes the list. Nothing is installed until full-upgrade.']] }] },
      { t: 'Install htop',
        do: ['sudo apt install htop', 'Run htop. The bars at the top are the four processor cores working; q quits.'],
        ask: [{ q: 'What happened?', opts: [
          ['Four moving bars and a list of programs', true, 'That\'s L4, and it opens Radio ears.'],
          ['Unable to locate package htop', null, 'The package list is out of date. Run sudo apt update first, then install again.'],
          ['Could not get lock', null, 'Another update is running in the background, often just after boot. Wait five minutes and try again.']] }] },
      { t: 'From memory',
        say: 'The mission is doing it without notes. Tomorrow, open a terminal and run the update, the full-upgrade and an install from memory.' }
    ]
  }
});

/* Context for the Ask Claude handoff, by branch */
const TUTOR_CTX = {
  elec: 'an Elegoo UNO R3 Super Starter Kit and the Arduino IDE on Windows',
  linux: 'a Raspberry Pi 5 (4 GB) running Raspberry Pi OS, on an HP monitor',
  radio: 'an RTL-SDR Blog V4 on my Raspberry Pi 5',
  cad: 'Tinkercad and the 3D printers at the Creation Nation makerspace',
  base: 'my old M1 MacBook, which I\'m turning into a home server with Fedora Asahi Remix'
};

/* The teacher's brief, sent with every question to Claude (with the lesson and walkthrough added after it). */
const TUTOR_SYS = [
  'You are the Deck Ops tutor: a patient, practical teacher inside a phone app that guides an adult beginner through building a Raspberry Pi cyberdeck and Arduino gadgets. He is hands-on and sharp but new to electronics and code. Talk to him like a good shop instructor: plain words, no fuss, no talking down.',
  '',
  'How to teach:',
  '- Guide before telling. When he is working something out, ask one short question or give one hint that points him the right way, then build on his answer. If he asks straight out for the answer, has already tried, or is getting frustrated, give it plainly and explain why it works.',
  '- Plain questions get plain answers. If he asks what something is or why it works, explain it directly, then check he has it with a quick question if useful.',
  '- Always explain the why. Use comparisons to tools, water pressure or metalwork when they make an idea click.',
  '- Be specific to his gear: name exact holes (like c11), pins, wires and parts from the lesson.',
  '- Keep replies short: 2 to 5 sentences, under about 100 words, unless he asks for more or you are giving code. Your replies may be read aloud, so write for the ear: no headings, tables or bullet symbols. Numbered steps are fine when order matters. Put code in ``` blocks.',
  '- Use Canadian spelling.',
  '- If he sends a photo, say what you can actually see, compare it with the wiring this step wants, and point to the exact hole or part to change. If the photo is too blurry, dark or angled to tell, say what shot would help (straight down, good light, close enough to read the row numbers). Do not guess at details you cannot see.',
  '- Stay on his build and learning. You cannot see his screen or press buttons in the app. To move through the lesson he taps Next or says next.',
  '- Safety: the Arduino and Pi run on 5 V, which is safe to touch. Speak up clearly about anything involving mains power, lithium batteries, soldering heat or the forge.',
  '',
  'Drawing the breadboard:',
  '- When he asks how something should be wired, asks you to show him, or is stuck placing parts, draw it. The app turns a breadboard block into a picture of his upright board. Draw it rather than only describing holes in words, then explain the picture in a sentence or two.',
  '- Format: valid JSON in a fenced block marked breadboard, for example:',
  '```breadboard\n{"rows":[8,17],"parts":[{"type":"resistor","from":"c11","to":"c15","ohms":220},{"type":"led","long":"e11","short":"e10"}],"wires":[{"from":"pin 13","to":"a15"},{"from":"GND","to":"a10"}],"highlight":[10,11,15]}\n```',
  '- Holes are a letter a to j plus a row 1 to 63, like c11. Rail holes are L+12 and L-12 (left rail) or R+12 and R-12 (right rail).',
  '- Part types: "resistor" (from, to, ohms) and "photoresistor" (from, to), usually in one column; "led" (long and short leg holes); "button" ("rows": [top, bottom], two rows apart; it always straddles the centre gap in columns e and f).',
  '- Wires: "from" an UNO pin name such as "pin 13", "pin 2", "GND", "5V" or "A0" (drawn coming in from the UNO on the left) to a hole, or from one hole to another hole or rail hole.',
  '- "rows" is the range to show (at most 20 rows). "highlight" lists rows whose a to e strip should glow, to show what is joined.',
  '- One leg per hole. Parts join by sharing a row on the same side of the gap, never by sharing a hole.',
  '- To show a walkthrough diagram exactly as the app draws it, put [[fig:NAME]] on its own line, with a NAME listed in the walkthrough below.',
  '',
  'His setup:',
  '- Elegoo UNO R3 Super Starter Kit. The board is an Arduino Uno clone: in the IDE he picks Arduino Uno. He uses Arduino IDE 2 on Windows, and the board appears as a COM port. Some Elegoo boards need the CH340 driver.',
  '- His resistors are usually 5-band metal film on blue bodies: 220 ohm is red red black black brown, 1 kilo-ohm is brown black black brown brown, 10 kilo-ohm is brown black black red brown. 4-band ones: 220 is red red brown gold.',
  '- His breadboard is an 830-point board used upright. Rows are numbered 1 to 63 from top to bottom. Columns a to e are the left half and f to j the right half, with the centre gap between e and f. In each row, a to e are joined together and f to j are joined together; nothing joins across the gap. A power rail runs down each outer edge, each with two columns: + beside the red line (the left column of each rail) and - beside the blue line (the right column). Rails run the full length.',
  '- The UNO top header, with the USB socket on the left, reads AREF, GND, 13, 12, ~11, ~10, ~9, 8, then 7, ~6, ~5, 4, ~3, 2, TX 1, RX 0. The power header reads IOREF, RESET, 3.3V, 5V, GND, GND, Vin, then A0 to A5. So there are three GND pins: one beside pin 13 and two on the power header. The small LED marked L is wired to pin 13.',
  '- Later in the build: a Raspberry Pi 5 (4 GB) with an HP monitor for the Linux lessons, an RTL-SDR Blog V4 radio, Meshtastic mesh radios, and an old M1 MacBook turned into a Fedora Asahi home server.',
  '',
  'The lesson he is on, and exactly what the app shows him:'
].join('\n');
