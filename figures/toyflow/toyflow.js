/*
 * The toy normalizing flow, animated on its slide.
 *
 * Reads window.TOYFLOW (toyflow_data.js, written by train_toyflow.py): the
 * position of 1800 base samples after each coupling layer, their log-weights,
 * a local Metropolis chain and the sector probabilities.
 *
 * The slide drives it with fragments of class .tf-step and data-step=0,1,2:
 *   (none)  z ~ N(0,1): the base cloud on the base density
 *   0       push through the layers, one at a time (each moves x OR y)
 *   1       colour and size every sample by its weight w = p/q, show the ESS
 *   2       a local Metropolis chain of the same length, and P(Q) bars
 * Any navigation (forward, back, jump) just sets new targets; the state eases
 * towards them. Under automation (decktape) it snaps, so the PDF is final.
 */
(function () {
  const D = window.TOYFLOW;
  if (!D) return;

  const C = {
    easy: [59, 126, 161], bulk: [35, 55, 59], ink: '#33474b', muted: '#55696f',
    defect: [235, 129, 27], target: [156, 22, 42], faint: '#c9d2d5',
  };
  const W = 1200, H = 1000;
  const X0 = -3.9, X1 = 3.9, Y0 = -3.25, Y1 = 3.25;
  const K = D.nlayers, N = D.n, P = D.params;
  const px = (x) => (x - X0) / (X1 - X0) * W;
  const py = (y) => (Y1 - y) / (Y1 - Y0) * H;
  const snapMode = navigator.webdriver && !/tfanim/.test(location.search);

  // ---- weights: w / <w>, as colour and radius --------------------------------
  const w = D.logw.map(Math.exp);
  const wbar = w.reduce((a, b) => a + b, 0) / N;
  const r = w.map((v) => Math.log10(v / wbar));

  // ---- the two densities, painted once into small offscreen canvases --------
  function heat(fn, rgb, amax) {
    const gw = 240, gh = 180, cv = document.createElement('canvas');
    cv.width = gw; cv.height = gh;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(gw, gh);
    const vals = new Float32Array(gw * gh);
    let vmax = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = X0 + (i + 0.5) / gw * (X1 - X0), y = Y1 - (j + 0.5) / gh * (Y1 - Y0);
      const v = fn(x, y); vals[j * gw + i] = v; if (v > vmax) vmax = v;
    }
    for (let k = 0; k < gw * gh; k++) {
      const a = Math.sqrt(vals[k] / vmax);            // sqrt: faint tails stay visible
      img.data[4 * k] = rgb[0]; img.data[4 * k + 1] = rgb[1]; img.data[4 * k + 2] = rgb[2];
      img.data[4 * k + 3] = Math.round(255 * amax * a);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  const S = (x, y) => P.beta * (1 - Math.cos(2 * Math.PI * x / P.d)) + x * x / (2 * P.sx * P.sx)
    + Math.pow(y - P.kappa * x * x + P.y0, 2) / (2 * P.sy * P.sy);
  const baseHeat = heat((x, y) => Math.exp(-(x * x + y * y) / 2), C.easy, 0.30);
  const targHeat = heat((x, y) => Math.exp(-S(x, y)), C.bulk, 0.30);

  // ---- state: three numbers easing towards their targets ----------------------
  const st = { lay: 0, wmix: 0, mc: 0 }, tg = { lay: 0, wmix: 0, mc: 0 };
  const SPEED = { lay: 1 / 0.62, wmix: 1 / 0.7, mc: 1 / 2.6 };   // units per second

  function setTargets(step) {
    tg.lay = step >= 0 ? K : 0;
    tg.wmix = step >= 1 ? 1 : 0;
    tg.mc = step >= 2 ? 1 : 0;
  }

  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));

  function weightColour(rv) {
    const t = Math.max(-1, Math.min(1, rv / 0.35));
    const grey = [138, 154, 160];
    return t < 0 ? mix(grey, [190, 205, 212], -t)
      : t < 0.6 ? mix(grey, C.defect, t / 0.6) : mix(C.defect, C.target, (t - 0.6) / 0.4);
  }


  // the layer strip: what the flow is made of, and where we are in it.
  // Drawn last, on a light panel, so samples never cover it.
  function strip(ctx) {
    const bx = 28, by = 24, bw = 54, gap = 10;
    ctx.fillStyle = 'rgba(241,241,241,0.88)';
    ctx.fillRect(bx - 12, by - 10, K * (bw + gap) + 470, bw + 20);
    ctx.font = "400 32px 'Fira Sans', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < K; k++) {
      const done = Math.max(0, Math.min(1, st.lay - k));
      const x = bx + k * (bw + gap);
      ctx.fillStyle = `rgba(59,126,161,${0.10 + 0.78 * done})`;
      ctx.fillRect(x, by, bw, bw);
      ctx.strokeStyle = 'rgba(59,126,161,0.85)'; ctx.lineWidth = 2.5;
      ctx.strokeRect(x, by, bw, bw);
      ctx.fillStyle = done > 0.5 ? '#fff' : C.ink;
      ctx.fillText(D.moves[k], x + bw / 2, by + bw / 2 + 1);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = C.ink;
    ctx.font = "300 34px 'Fira Sans', sans-serif";
    const lab = st.lay <= 0.001 ? 'z ~ N(0, 1)' : st.lay >= K - 0.001 ? `x = f(z), ${K} layers`
      : `layer ${Math.min(K, Math.floor(st.lay) + 1)}: moves ${D.moves[Math.min(K - 1, Math.floor(st.lay))]}`;
    ctx.fillText(lab, bx + K * (bw + gap) + 12, by + bw / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ---- drawing ------------------------------------------------------------
  function draw(ctx) {
    ctx.clearRect(0, 0, W, H);
    const prog = st.lay / K;

    ctx.globalAlpha = 1 - smooth(Math.min(1, prog * 1.6));
    ctx.drawImage(baseHeat, 0, 0, W, H);
    ctx.globalAlpha = smooth(Math.min(1, prog));
    ctx.drawImage(targHeat, 0, 0, W, H);
    ctx.globalAlpha = 1;

    // frame
    ctx.strokeStyle = C.faint; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // samples: interpolate between the outputs of consecutive layers
    const i = Math.min(K - 1, Math.floor(st.lay)), f = smooth(Math.max(0, Math.min(1, st.lay - i)));
    const A = D.layers[i], B = D.layers[i + 1];
    const fade = 1 - 0.55 * st.mc;
    for (let n = 0; n < N; n++) {
      const x = lerp(A[2 * n], B[2 * n], f), y = lerp(A[2 * n + 1], B[2 * n + 1], f);
      let col = C.easy, rad = 4.2, alpha = 0.62;
      if (st.wmix > 0) {
        col = mix(C.easy, weightColour(r[n]), st.wmix);
        rad = lerp(4.2, 4.2 * Math.max(0.55, Math.min(2.4, Math.sqrt(w[n] / wbar))), st.wmix);
        alpha = lerp(0.62, 0.8, st.wmix);
      }
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * fade})`;
      ctx.beginPath(); ctx.arc(px(x), py(y), rad, 0, 2 * Math.PI); ctx.fill();
    }

    const wa = st.wmix * (1 - st.mc);          // the weights step fades when the chains come in
    if (wa > 0) {
      ctx.globalAlpha = wa; ctx.textAlign = 'right';
      ctx.font = "500 40px 'Fira Sans', sans-serif"; ctx.fillStyle = C.ink;
      ctx.fillText(`ESS = ${(100 * D.ess).toFixed(0)} %`, W - 28, 130);
      ctx.font = "300 30px 'Fira Sans', sans-serif"; ctx.fillStyle = 'rgb(156,22,42)';
      ctx.fillText('large, red: w > ⟨w⟩', W - 28, 170);
      ctx.fillStyle = C.muted;
      ctx.fillText('small, grey: w < ⟨w⟩', W - 28, 206);
      ctx.globalAlpha = 1;
      bars(ctx, smooth(wa));
    }

    // the local Metropolis chain in the plane, drawn as it runs
    if (st.mc > 0) {
      const M = D.local.path, g = Math.min(1, st.mc), m = Math.floor(M.length / 2 * g);
      ctx.strokeStyle = 'rgba(156,22,42,0.8)'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k < m; k++) {
        const X = px(M[2 * k]), Y = py(M[2 * k + 1]);
        k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.stroke();
      if (m > 0) {
        ctx.fillStyle = 'rgb(156,22,42)';
        ctx.beginPath(); ctx.arc(px(M[2 * m - 2]), py(M[2 * m - 1]), 8, 0, 2 * Math.PI); ctx.fill();
      }
      traces(ctx, g);
    }
    // sector labels, once the target has formed
    const qa = smooth(Math.max(0, Math.min(1, (st.lay - K + 1.5) / 1.5)));
    if (qa > 0) {
      ctx.globalAlpha = qa; ctx.textAlign = 'center';
      ctx.font = "500 36px 'Fira Sans', sans-serif";
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(241,241,241,0.9)'; ctx.fillStyle = C.ink;
      for (let q = -D.qmax; q <= D.qmax; q++) {
        const x = q * P.d, y = P.kappa * x * x - P.y0;
        const t = `Q = ${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q)}`;
        ctx.strokeText(t, px(x), py(y - 0.62));
        ctx.fillText(t, px(x), py(y - 0.62));
      }
      ctx.globalAlpha = 1;
    }

    strip(ctx);
  }

  // P(Q): what the flow produces (hollow), after reweighting (solid), exact (tick)
  function bars(ctx, g) {
    const base = -2.9, scale = 1.30, bw = 0.27;
    ctx.globalAlpha = g;
    for (let q = -D.qmax; q <= D.qmax; q++) {
      const k = q + D.qmax, xc = q * P.d;
      [[D.p_flow[k], false], [D.p_rew[k], true]].forEach(([p, solid], j) => {
        const x = xc + (j - 0.5) * (bw + 0.05) - bw / 2;
        const y0 = py(base), y1 = py(base + p * scale);
        if (solid) { ctx.fillStyle = 'rgba(59,126,161,0.88)'; ctx.fillRect(px(x), y1, px(x + bw) - px(x), y0 - y1); }
        else { ctx.strokeStyle = 'rgba(59,126,161,0.95)'; ctx.lineWidth = 3; ctx.strokeRect(px(x) + 1.5, y1, px(x + bw) - px(x) - 3, y0 - y1); }
      });
      const ye = py(base + D.p_exact[k] * scale);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(px(xc - bw - 0.1), ye); ctx.lineTo(px(xc + bw + 0.1), ye); ctx.stroke();
    }
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px(-3.3), py(base)); ctx.lineTo(px(3.3), py(base)); ctx.stroke();
    ctx.font = "400 32px 'Fira Sans', sans-serif"; ctx.textAlign = 'left'; ctx.fillStyle = C.ink;
    ctx.fillText('P(Q)', px(-3.75), py(base + 0.62));
    ctx.font = "300 29px 'Fira Sans', sans-serif";
    let lx = px(-3.75);
    const ly = py(base - 0.2);
    [['hollow', 'flow, raw'], ['solid', 'flow, reweighted'], ['tick', 'exact']].forEach(([kind, txt]) => {
      if (kind === 'solid') { ctx.fillStyle = 'rgba(59,126,161,0.88)'; ctx.fillRect(lx, ly - 11, 22, 22); }
      else if (kind === 'hollow') { ctx.strokeStyle = 'rgba(59,126,161,0.95)'; ctx.lineWidth = 3; ctx.strokeRect(lx + 1.5, ly - 9.5, 19, 19); }
      else { ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 24, ly); ctx.stroke(); }
      ctx.fillStyle = C.muted; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 32, ly + 1);
      ctx.textBaseline = 'alphabetic';
      lx += 32 + ctx.measureText(txt).width + 34;
    });
    ctx.globalAlpha = 1;
  }

  // text with subscripts: segs = [[string, sub?], ...], font = [weight, px]
  function rich(ctx, segs, x, y, font, align) {
    const f = (s) => `${font[0]} ${s ? Math.round(font[1] * 0.68) : font[1]}px 'Fira Sans', sans-serif`;
    let wtot = 0;
    segs.forEach(([s, sub]) => { ctx.font = f(sub); wtot += ctx.measureText(s).width; });
    let cx = align === 'right' ? x - wtot : align === 'center' ? x - wtot / 2 : x;
    ctx.textAlign = 'left';
    segs.forEach(([s, sub]) => {
      ctx.font = f(sub);
      ctx.fillText(s, cx, sub ? y + font[1] * 0.22 : y);
      cx += ctx.measureText(s).width;
    });
  }

  // Q(t) of the two chains, same beta, same number of steps, both started in Q = 0
  const fmtTau = (t) => t >= 1000 ? `${Math.round(t / 1000)} 000` : t.toFixed(1);
  function traces(ctx, g) {
    const xL = -3.75, xR = 3.8, lev = 0.1;
    const rows = [
      { tr: D.flowchain.trace, mid: -1.98, lab: -1.62, rgb: '59,126,161',
        txt: [['flow + accept/reject:  τ', 0], ['int', 1], [`(Q) ≈ ${fmtTau(D.flowchain.tau)}`, 0]] },
      { tr: D.local.trace, mid: -2.81, lab: -2.45, rgb: '156,22,42',
        txt: [['local Metropolis:  τ', 0], ['int', 1], [`(Q) ≈ ${fmtTau(D.local.tau)}`, 0]] },
    ];
    const a = smooth(Math.min(1, g * 3));
    ctx.globalAlpha = a;
    rows.forEach((r) => {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(px(xL), py(r.mid + 0.27), px(xR) - px(xL), py(r.mid - 0.27) - py(r.mid + 0.27));
      ctx.strokeStyle = C.faint; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px(xL), py(r.mid)); ctx.lineTo(px(xR), py(r.mid)); ctx.stroke();
      ctx.fillStyle = `rgb(${r.rgb})`;
      rich(ctx, r.txt, px(xL), py(r.lab), [500, 30], 'left');
      // the history, step by step, up to the current time
      const n = r.tr.length, m = Math.max(1, Math.floor(n * g));
      ctx.strokeStyle = `rgba(${r.rgb},0.9)`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < m; k++) {
        const x0 = px(xL + (xR - xL) * k / n), x1 = px(xL + (xR - xL) * (k + 1) / n);
        const y = py(r.mid + lev * r.tr[k]);
        k ? ctx.lineTo(x0, y) : ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    });
    ctx.font = "300 27px 'Fira Sans', sans-serif"; ctx.textAlign = 'right'; ctx.fillStyle = C.muted;
    ctx.fillText(`Monte Carlo time: ${D.tshow / 1000} 000 steps each →`, px(xR), py(-1.62));
    ctx.globalAlpha = 1;

    // the headline, where the ESS was
    ctx.globalAlpha = smooth(Math.min(1, Math.max(0, g * 2 - 0.6)));
    const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹', e = Math.round(Math.log10(D.local.tau / D.flowchain.tau));
    ctx.fillStyle = C.ink;
    rich(ctx, [['τ', 0], ['int', 1], [`(Q)  ×10${sup[e]} shorter`, 0]], W - 28, 132, [500, 42], 'right');
    ctx.font = "300 29px 'Fira Sans', sans-serif"; ctx.textAlign = 'right'; ctx.fillStyle = C.muted;
    ctx.fillText('same β, same number of steps', W - 28, 172);
    ctx.globalAlpha = 1;
  }

  // ---- wiring to reveal --------------------------------------------------------
  function init() {
    const root = document.querySelector('.toyflow');
    if (!root) return;
    const canvas = root.querySelector('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const section = root.closest('section');

    const currentStep = () => {
      let s = -1;
      section.querySelectorAll('.tf-step.visible').forEach((el) => {
        s = Math.max(s, parseInt(el.dataset.step, 10));
      });
      return s;
    };
    const snap = () => { Object.assign(st, tg); draw(ctx); };

    let last = null, running = false;
    function frame(t) {
      const dt = last === null ? 0 : Math.min(0.05, (t - last) / 1000);
      last = t;
      let moving = false;
      for (const k in st) {
        const d = tg[k] - st[k];
        if (Math.abs(d) > 1e-4) {
          const back = d < 0 ? (k === 'lay' ? 3.5 : 2) : 1;   // rewind faster
          const stp = SPEED[k] * back * dt;
          st[k] = Math.abs(d) <= stp ? tg[k] : st[k] + Math.sign(d) * stp;
          moving = true;
        }
      }
      draw(ctx);
      if (moving) requestAnimationFrame(frame);
      else { running = false; last = null; }
    }
    function update(animate) {
      setTargets(currentStep());
      if (!animate || snapMode) { snap(); return; }
      if (!running) { running = true; last = null; requestAnimationFrame(frame); }
    }

    Reveal.on('fragmentshown', (e) => { if (section.contains(e.fragment)) update(true); });
    Reveal.on('fragmenthidden', (e) => { if (section.contains(e.fragment)) update(true); });
    Reveal.on('slidechanged', (e) => {
      if (e.currentSlide === section) {
        // arriving from the next slide: already in the final state, no replay
        update(false);
      }
    });
    update(false);
    // fonts may arrive after the first paint
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw(ctx));
  }

  (function wire() {
    if (window.Reveal && Reveal.isReady && Reveal.isReady()) init();
    else if (window.Reveal && Reveal.on) Reveal.on('ready', init);
    else setTimeout(wire, 100);
  })();
})();
