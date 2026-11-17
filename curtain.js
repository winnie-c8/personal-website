// Leaf curtain: a stream of falling leaves that hides the projects page while it loads.
//
// How it fits together:
//  1. On the homepage, clicking a link with data-leaves starts the leaves falling and
//     fades in a thick leaf-pile backdrop behind them, then goes to that page.
//  2. The projects page carries on the SAME fall without a pause: the leaves are laid out
//     from a fixed "seed" so they're identical on both pages, and the time the fall
//     started is remembered, so every leaf continues from exactly where it was.
//  3. When the projects page is ready, script.js calls leafCurtain.reveal(): the backdrop
//     fades away and each leaf finishes the fall it's on, then stops.
//
// This file is loaded at the very top of <body> on the projects page so the curtain
// exists before anything else on the page is drawn.
(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // EDIT HERE - LEAVES: how many, their width range (px) and which pictures to use.
  // The pictures are in assets/leaves (each .png has a matching .svg you can edit and
  // re-export). List a picture more than once to use it more often.
  const COUNT = 110;
  const MIN_SIZE = 80, MAX_SIZE = 150;
  const IMAGES = [
    "leaf-pad", "leaf-pad", "leaf-vine", "leaf-vine",
    "leaf-deep", "leaf-slim", "leaf-slim", "petal",
  ].map((name) => `url("assets/leaves/${name}.png")`);
  const MIN_FALL = 0.9, MAX_FALL = 1.5;  // seconds for one leaf to fall top to bottom
  const COVER_TIME = 600;   // ms of falling on the homepage before the page changes
  const STORE_KEY = "leafFallStart";  // where the fall's start time is remembered

  // A tiny "random" number maker that always gives the same sequence,
  // so the leaves are the same on both pages.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Build the curtain: a leaf-pile backdrop (its ::before) plus all the falling leaves.
  // Each leaf gets its column, size, tilt, spin, sideways drift, fall speed,
  // start delay and picture as CSS variables.
  const curtain = document.createElement("div");
  curtain.className = "leaf-curtain";
  curtain.setAttribute("aria-hidden", "true");
  for (let i = 0; i < COUNT; i++) {
    const fall = MIN_FALL + rand() * (MAX_FALL - MIN_FALL);
    const leaf = document.createElement("span");
    leaf.className = "leaf";
    leaf.style.cssText =
      `--x:${(rand() * 110 - 5).toFixed(1)}vw;` +
      `--s:${Math.round(MIN_SIZE + rand() * (MAX_SIZE - MIN_SIZE))}px;` +
      `--r:${Math.round(rand() * 360)}deg;` +
      `--spin:${Math.round(rand() * 300 - 150)}deg;` +
      `--drift:${Math.round(rand() * 160 - 80)}px;` +
      `--dur:${fall.toFixed(2)}s;` +
      `--d:${Math.round(rand() * fall * 1000)}ms;` +   // staggered so they don't all start together
      `--img:${IMAGES[Math.floor(rand() * IMAGES.length)]};`;
    curtain.appendChild(leaf);
  }
  document.body.prepend(curtain);

  // Reading/saving the start time can fail in private windows, so both are wrapped
  const saveStart = () => { try { sessionStorage.setItem(STORE_KEY, String(Date.now())); } catch (e) {} };
  const takeStart = () => {
    try {
      const t = Number(sessionStorage.getItem(STORE_KEY));
      sessionStorage.removeItem(STORE_KEY);
      return t;
    } catch (e) { return 0; }
  };

  // Projects page (still loading): carry on the fall that started on the homepage.
  // --elapsed winds every leaf forward by the time that has passed, so nothing jumps.
  // If the visitor came straight here, pretend it's been falling a while so the
  // screen is already full of leaves.
  if (root.classList.contains("is-loading") && !reduceMotion) {
    const start = takeStart();
    const elapsed = start && Date.now() - start < 10000 ? Date.now() - start : 6000;
    curtain.style.setProperty("--elapsed", `${elapsed}ms`);
    // no-fade: the backdrop is already fully on, so don't fade it in again
    curtain.classList.add("is-on", "is-shaded", "no-fade");
    requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove("no-fade")));
  }

  // Homepage: start the leaves falling and fade in the backdrop, then run `done`
  function cover(done) {
    if (reduceMotion) return done();
    saveStart();
    curtain.style.setProperty("--elapsed", "0ms");
    curtain.classList.add("is-on");
    requestAnimationFrame(() => curtain.classList.add("is-shaded"));
    setTimeout(done, COVER_TIME);
  }

  // Projects page is ready: fade the backdrop and let each leaf finish its current fall
  function reveal() {
    if (!curtain.classList.contains("is-on")) return;
    curtain.classList.remove("is-shaded");
    const endings = [...curtain.querySelectorAll(".leaf")].map((leaf) => {
      const anim = leaf.getAnimations()[0];
      if (!anim) return Promise.resolve();
      // stop after the fall it's on (leaves that haven't started yet just don't start)
      const now = anim.effect.getComputedTiming().currentIteration;
      anim.effect.updateTiming({ iterations: now === null ? 0 : now + 1 });
      return anim.finished.catch(() => {});
    });
    // once every leaf has fallen off the screen, switch the curtain off
    Promise.all(endings).then(() => curtain.classList.remove("is-on"));
  }

  window.leafCurtain = { cover, reveal };

  // Homepage: links marked data-leaves play the curtain before changing page.
  // Ctrl/Cmd-click or middle-click (open in new tab) is left alone.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-leaves]");
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    cover(() => { window.location.href = link.href; });
  });

  // Pressing Back to return to the homepage can show it exactly as it was left,
  // still covered in falling leaves. If that happens, clear them away.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) curtain.classList.remove("is-on", "is-shaded");
  });
})();
