// Smooth background drift that follows the mouse.
// Skipped for touch devices and for people who prefer reduced motion.
(function () {
  const bg = document.querySelector(".hero-bg");
  if (!bg) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (reduceMotion || !finePointer) return;

  const STRENGTH = 15;  // total pixels of movement; raise for a stronger effect
  const EASE = 0.06;    // 0.02 = slow and dreamy, 0.15 = snappy

  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;
  let running = false;

  window.addEventListener("mousemove", (e) => {
    // move opposite the cursor for a sense of depth
    targetX = (e.clientX / window.innerWidth - 0.5) * -STRENGTH;
    targetY = (e.clientY / window.innerHeight - 0.5) * -STRENGTH;

    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });

  function tick() {
    currentX += (targetX - currentX) * EASE;
    currentY += (targetY - currentY) * EASE;

    bg.style.transform =
      `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;

    // keep animating until it has settled, then stop to save battery
    const settled =
      Math.abs(targetX - currentX) < 0.05 &&
      Math.abs(targetY - currentY) < 0.05;

    if (settled) {
      running = false;
    } else {
      requestAnimationFrame(tick);
    }
  }
  
})();

// "lets connect!" dropdown
(function () {
  const btn = document.querySelector(".connect-btn");
  const menu = document.getElementById("connect-menu");
  if (!btn || !menu) return;

  function setOpen(open) {
    btn.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
  }

  btn.addEventListener("click", () => {
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  // close when clicking anywhere else
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".connect")) setOpen(false);
  });

  // close with Escape and return focus to the button
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      btn.focus();
    }
  });
})();


// Projects page: vines that grow along their own lines as you scroll.
// .vines[data-src] is the drawing (assets/vines.svg). .vines[data-guides] has one plain
// stroked line per vine, in the same layer order, drawn from where the vine starts
// growing out to its tip. Each guide line becomes a mask over its vine and is drawn
// on bit by bit, so the vine is uncovered along its own route, curls and all.
(function () {
  // Find the pond (the whole projects area) and the box the vines go in.
  // If either is missing we're not on the projects page, so do nothing.
  const pond = document.querySelector(".pond");
  const holder = document.querySelector(".vines[data-src]");
  if (!pond || !holder) return;

  // Settings you can tweak.
  const REACH = 0.8;       // vines grow to 80% of the way down the screen
  const EASE = 0.08;       // how quickly vines catch up to the scroll position
  const SAMPLES = 300;     // points measured along each guide line
  const MASK_WIDTH = 50;   // how wide each guide line uncovers, in drawing units; raise it if vine edges get clipped

  // Things set up once: the SVG "namespace" (needed to create SVG elements),
  // the lily pads and flowers, and whether the visitor has asked for less motion.
  const NS = "http://www.w3.org/2000/svg";
  const decos = [...pond.querySelectorAll(".deco")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Things that change while the page is open.
  let vines = [];          // { line, vine, sx, sy, length, reach, shown, target }
  let running = false;     // whether the animation loop is currently going
  let pullBack = 0;        // extra px scrolled "up past the top"; shrinks the vines further

  // Download a file and hand back its text. A missing file counts as an error,
  // rather than quietly giving us the text of an error page.
  const load = (url) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.url}`);
    return res.text();
  });

  // Download the vine drawing and the guide lines at the same time,
  // and only carry on once both have arrived.
  Promise.all([load(holder.dataset.src), load(holder.dataset.guides)])
    .then(([artText, guideText]) => {
      // Put the vine drawing into the page.
      holder.innerHTML = artText;
      const svg = holder.querySelector("svg");
      if (!svg) throw new Error("no <svg> in " + holder.dataset.src);

      // stretch the drawing over the whole page, whatever size it was exported at
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "none");

      // Read the guide file without showing it on the page;
      // we only need the shapes of its lines.
      const guideSvg = new DOMParser().parseFromString(guideText, "image/svg+xml").querySelector("svg");
      if (!guideSvg) throw new Error("no <svg> in " + holder.dataset.guides);
      const guides = [...guideSvg.querySelectorAll("path")];

      // the guide file may be exported at a slightly different size, so scale it onto the drawing
      const art = svg.viewBox.baseVal, g = guideSvg.viewBox.baseVal;
      const sx = g.width ? art.width / g.width : 1;
      const sy = g.height ? art.height / g.height : 1;

      // Find (or make) the drawing's storage area for masks, then list every
      // visible shape in the drawing in order: these are the vines.
      const defs = svg.querySelector("defs") ||
        svg.insertBefore(document.createElementNS(NS, "defs"), svg.firstChild);
      const shapes = [...svg.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect")]
        .filter((el) => !el.closest("defs, clipPath, mask, symbol, pattern, marker"));

      // Pair each vine with the guide line in the same position (1st with 1st, and so on).
      shapes.forEach((vine, i) => {
        const guide = guides[i];
        if (!guide) return;  // no guide line for this one, so it just stays visible

        // Make a mask from the guide line: a thick white copy of it.
        // In a mask, white means "show", so the vine only appears
        // where this white line has been drawn.
        const mask = document.createElementNS(NS, "mask");
        mask.id = `vine-grow-${i}`;
        const line = document.createElementNS(NS, "path");
        line.setAttribute("d", guide.getAttribute("d"));
        line.setAttribute("transform", `scale(${sx} ${sy})`);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", "#fff");
        line.setAttribute("stroke-width", MASK_WIDTH);
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("stroke-linejoin", "round");

        // Store the mask in the drawing and tell the vine to use it.
        mask.appendChild(line);
        defs.appendChild(mask);
        vine.setAttribute("mask", `url(#${mask.id})`);

        // Turn the line into one dash as long as the whole line, so sliding
        // that dash along later makes the line (and so the vine) grow.
        // Every vine starts fully hidden (shown: 0).
        const length = line.getTotalLength();
        line.style.strokeDasharray = `${length} ${length}`;
        vines.push({ line, vine, sx, sy, length, reach: [], shown: 0, target: 0 });
      });

      // Work out where everything is now, and again whenever the page
      // changes size (at most once per frame, so resizing stays smooth).
      measure();
      let resizeQueued = false;
      new ResizeObserver(() => {
        if (resizeQueued) return;
        resizeQueued = true;  
        requestAnimationFrame(() => { resizeQueued = false; measure(); });
      }).observe(pond);
    })
    .catch((err) => console.warn("Could not load the vines:", err));

  // reach[i] = lowest point (px down the page) the guide line has touched by sample i,
  // so a vine is only drawn as far as the screen has scrolled
  function measure() {
    const pondTop = pond.getBoundingClientRect().top;
    vines.forEach((v) => {
      // a mask line has no position on screen of its own; it shares its vine's coordinates
      const m = v.vine.getScreenCTM();
      let maxY = -Infinity;
      v.reach = [];
      // Walk along the line in small steps. For each step, find how far down the
      // page that point is, and remember the lowest point reached so far.
      for (let s = 0; s <= SAMPLES; s++) {
        const p = v.line.getPointAtLength((s / SAMPLES) * v.length);
        const x = p.x * v.sx, y = p.y * v.sy;
        maxY = Math.max(maxY, m.b * x + m.d * y + m.f - pondTop);
        v.reach.push(maxY);
      }
    });
    update();
    draw();
  }

  // Show each vine as far as it has grown: slide the dash along its mask line
  // by the amount shown, and fully hide vines that haven't started yet
  // (so a round line end doesn't leave a dot showing).
  function draw() {
    vines.forEach((v) => {
      v.line.style.strokeDashoffset = v.length - v.shown;
      v.line.style.visibility = v.shown < 0.5 ? "hidden" : "visible";
    });
  }

  // How much of a vine's line sits above a given point on the page.
  // Finds the answer quickly by repeatedly halving the list of measured points.
  function lengthUpTo(v, limitY) {
    if (limitY >= v.reach[SAMPLES]) return v.length;
    let lo = 0, hi = SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v.reach[mid] > limitY) hi = mid; else lo = mid + 1;
    }
    return (lo / SAMPLES) * v.length;
  }

  // Runs on every scroll. Works out how far down the page the vines may reach
  // right now (80% of the way down the screen, minus any pull-back), then sets
  // how long each vine should grow to and which flowers should be open.
  function update() {
    if (window.scrollY > 0) pullBack = 0;  // pull-back only exists while sitting at the top
    const top = pond.getBoundingClientRect().top;
    // At the very bottom of the page, or with reduced motion, show everything.
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const limitY =
      reduceMotion || atBottom ? Infinity : window.innerHeight * REACH - top - pullBack;

    // Set each vine's target length. With reduced motion, jump straight there.
    vines.forEach((v) => { v.target = lengthUpTo(v, limitY); });
    if (reduceMotion) {
      vines.forEach((v) => { v.shown = v.target; });
      draw();
    }

    // Open the lily pads and flowers the vines have reached; close the rest.
    decos.forEach((el) => {
      const r = el.getBoundingClientRect();
      el.classList.toggle("is-in", (r.top + r.bottom) / 2 - top < limitY);
    });

    // Start the animation loop if it isn't already going.
    if (!running && !reduceMotion) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  // The animation loop, once per frame: move each vine a small fraction of the
  // way towards its target, which makes the growing smooth instead of jumpy.
  function tick() {
    let moving = false;
    vines.forEach((v) => {
      const diff = v.target - v.shown;
      if (Math.abs(diff) > 0.5) {
        v.shown += diff * EASE;
        moving = true;
      } else {
        v.shown = v.target;
      }
    });
    draw();

    // stop animating once everything has caught up
    if (moving) requestAnimationFrame(tick); else running = false;
  }

  // Scrolling up while already at the top can't move the page, so no "scroll"
  // event fires. Catch the raw wheel / finger movement instead and use it to
  // pull the vines back. Scrolling down regrows them before the page moves.
  // dy > 0 means "scroll down", dy < 0 means "scroll up".
  function pull(dy, e) {
    if (reduceMotion || window.scrollY > 0) return;
    // Scrolling inside an open project pop-up is for the pop-up, not the vines
    if (e.target.closest && e.target.closest("dialog[open]")) return;
    const max = window.innerHeight * REACH;  // enough to pull every vine back to nothing
    const next = Math.min(max, Math.max(0, pullBack - dy));
    if (next === pullBack) return;   // nothing to shrink or regrow, so scroll normally
    if (dy > 0) e.preventDefault();  // hold the page still until the vines have regrown
    pullBack = next;
    update();
  }

  // Mouse wheel and trackpad: pass the scroll amount to pull(), in pixels.
  window.addEventListener("wheel", (e) => {
    // some mice report lines or pages instead of pixels
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    pull(e.deltaY * unit, e);
  }, { passive: false });

  // Touch screens: remember where the finger was, and pass how far it moved to pull().
  let touchY = null;
  window.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const y = e.touches[0].clientY;
    pull(touchY - y, e);  // finger moving down the screen = scrolling up
    touchY = y;
  }, { passive: false });

  // Set the starting state (so the lily pads and flowers work even before the
  // vines load), then keep everything up to date as the visitor scrolls.
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("load", update);  // images now have their real size
})();

// Projects page: clickable project stamps.
// Hovering a stamp (or tabbing to it) plays its preview video; clicking it opens
// the pop-up whose id matches the stamp's data-dialog. Clicking outside the
// pop-up closes it.
(function () {
  const stamps = document.querySelectorAll(".stamp[data-dialog]");
  if (!stamps.length) return;

  // People who prefer less motion don't get videos starting on their own
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  stamps.forEach((stamp) => {
    const video = stamp.querySelector("video");
    const dialog = document.getElementById(stamp.dataset.dialog);

    // Start the preview from the beginning. play() fails if there's no video
    // file yet, so catch that quietly and leave the plain window showing.
    // The video only becomes visible once it's really playing.
    const start = () => {
      if (!video || reduceMotion) return;
      video.currentTime = 0;
      video.play()
        .then(() => video.classList.add("is-playing"))
        .catch(() => {});
    };

    // Stop the preview and hide it again
    const stop = () => {
      if (!video) return;
      video.pause();
      video.classList.remove("is-playing");
    };

    // Mouse arriving / leaving, and keyboard focus arriving / leaving
    stamp.addEventListener("mouseenter", start);
    stamp.addEventListener("mouseleave", stop);
    stamp.addEventListener("focus", start);
    stamp.addEventListener("blur", stop);

    // Clicking the stamp stops the preview and opens its pop-up.
    // showModal() centres it, dims the page behind, and lets Esc close it.
    if (!dialog) return;
    stamp.addEventListener("click", () => {
      stop();
      dialog.showModal();
    });
  });

  // Close a pop-up when clicking outside it. Clicks on the dimmed backdrop are
  // reported as clicks on the <dialog> itself, while clicks on anything inside
  // (text, links, buttons) are reported on that thing instead. The position check
  // makes sure it was really outside the box, not on its edge.
  document.querySelectorAll("dialog.project-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right ||
                      e.clientY < r.top || e.clientY > r.bottom;
      if (outside) dialog.close();
    });
  });
})();

// Projects page: click any image inside a project pop-up to see it bigger.
// One shared viewer (<dialog class="image-viewer"> in projects.html) is filled
// with the clicked picture and its caption, then opened on top of the pop-up.
(function () {
  const viewer = document.querySelector(".image-viewer");
  if (!viewer) return;
  const bigImg = viewer.querySelector(".image-viewer-img");
  const caption = viewer.querySelector(".image-viewer-caption");

  // Copy the clicked picture (and its caption, if it has one) into the viewer
  // and open it. Opening it with showModal() puts it above the project pop-up,
  // and Esc then closes just the viewer, leaving the project pop-up open.
  function enlarge(img) {
    bigImg.src = img.currentSrc || img.src;
    bigImg.alt = img.alt;
    const figcaption = img.closest("figure")?.querySelector("figcaption");
    caption.textContent = figcaption ? figcaption.textContent : "";
    viewer.showModal();
  }

  document.querySelectorAll(".dialog-figure img").forEach((img) => {
    // Let keyboard users reach each picture with Tab, and have screen readers
    // announce it as something that can be pressed
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", "Enlarge image: " + img.alt);

    // Clicking, or pressing Enter / Space while it's selected, opens it bigger
    img.addEventListener("click", () => enlarge(img));
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();  // stop Space from scrolling the pop-up
        enlarge(img);
      }
    });
  });

  // Close the viewer when clicking outside the picture, the same way as the
  // project pop-ups: backdrop clicks are reported on the <dialog> itself, and
  // the position check makes sure the click really was outside the picture.
  viewer.addEventListener("click", (e) => {
    if (e.target !== viewer) return;
    const r = viewer.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right ||
                    e.clientY < r.top || e.clientY > r.bottom;
    if (outside) viewer.close();
  });
})();
