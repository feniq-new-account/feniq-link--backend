(() => {
  "use strict";

  // Responsive navigation: explicit state, Escape, link selection and resize.
  const menuToggle = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  if (menuToggle && mobileMenu) {
    const closeMenu = () => {
      mobileMenu.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "افتح قائمة الموقع");
    };
    menuToggle.addEventListener("click", () => {
      const opening = mobileMenu.hidden;
      mobileMenu.hidden = !opening;
      menuToggle.setAttribute("aria-expanded", String(opening));
      menuToggle.setAttribute("aria-label", opening ? "أغلق قائمة الموقع" : "افتح قائمة الموقع");
    });
    mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !mobileMenu.hidden) { closeMenu(); menuToggle.focus(); }
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 760 && !mobileMenu.hidden) closeMenu();
    });
  }

  // ── the cabinet demo ────────────────────────────────────
  // Sixteen drawers, lettered like a pharmacy's shelf. Items come from
  // demo-catalog.json: real trade names from the Syrian MoH register.
  const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H–I", "J–K", "L", "M", "N–O", "P", "Q–R", "S", "T–Z"];
  const groupOf = (name) => {
    const c = (name.match(/[A-Z]/i) || ["Z"])[0].toUpperCase();
    return GROUPS.findIndex((g) => {
      const [a, b = a] = g.split("–");
      return c >= a && c <= b;
    });
  };

  const $ = (id) => document.getElementById(id);
  const drawersEl = $("drawers");
  const outEl = $("drawer-out");
  const outLabel = $("drawer-out-label");
  const itemsEl = $("items");
  const q = $("q");
  const slipList = $("slip-list");
  const slipCount = $("slip-count");
  const sendBtn = $("send");
  const track = $("track");

  let catalog = null;
  let loading = null;
  let openIdx = -1;
  const order = new Map(); // name -> {item, qty}

  // Arabic aliases apply only to this demonstration catalog, never to live orders.
  const normalizeSearch = (value) => String(value).normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
    .toLowerCase().replace(/\s+/g, " ").trim();
  const aliases = [
    ["باراسيتامول", "باراسيتامول", "paracetamol"],
    ["باراسيتامول", "باراسيتامول", "acetaminophen"],
    ["اموكسيسيلين", "اموكسيسيلين", "amoxicillin"],
    ["اموكسيلين", "اموكسيسيلين", "amoxicillin"],
    ["فيتامين د", "فيتامين د", "vitamin d3"],
    ["ايبوبروفين", "ايبوبروفين", "ibuprofen"],
    ["سالبوتامول", "سالبوتامول", "salbutamol"]
  ];
  const matchesSearch = (item, term) => {
    const text = normalizeSearch([item.n, item.c, item.m].join(" "));
    return text.includes(term) || aliases.some(([ar, , en]) => ar.includes(term) && normalizeSearch(item.c).includes(en));
  };

  const loadCatalog = () => {
    if (catalog) return Promise.resolve(catalog);
    if (!loading) {
      loading = fetch("demo-catalog.json")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
        .then((list) => {
          catalog = list.map((it) => ({ ...it, g: groupOf(it.n) }));
          const counts = GROUPS.map((_, i) => catalog.filter((it) => it.g === i).length);
          drawersEl.querySelectorAll(".drawer").forEach((d, i) => {
            d.classList.toggle("is-empty", counts[i] === 0);
            // The drawer front shows a real box from inside it.
            const pictured = catalog.find((it) => it.g === i && it.image);
            const photo = d.querySelector(".drawer__photo");
            if (pictured && photo) {
              photo.style.backgroundImage = `url("${pictured.image}")`;
              d.classList.add("has-photo");
            }
            d.setAttribute("aria-label", `درج ${GROUPS[i]}، ${counts[i] ? items(counts[i]) : "فارغ"}`);
          });
          return catalog;
        });
    }
    return loading;
  };

  GROUPS.forEach((g, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "drawer";
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", "drawer-out");
    b.innerHTML = `<span class="drawer__photo" aria-hidden="true"></span><span class="drawer__label">${g}</span>`;
    b.addEventListener("click", () => {
      if (openIdx === i) return closeDrawer();
      q.value = "";
      loadCatalog().then(() => openDrawer(i));
    });
    drawersEl.appendChild(b);
  });

  // Arabic count agreement: 1 صنف، 2 صنفان، 3–10 أصناف، 11+ صنفاً
  const items = (n) => (n === 1 ? "صنف واحد" : n === 2 ? "صنفان" : n <= 10 ? `${n} أصناف` : `${n} صنفاً`);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const renderItems = (list, emptyMsg) => {
    if (!list.length) {
      itemsEl.innerHTML = `<li class="items__empty">${emptyMsg}</li>`;
      return;
    }
    itemsEl.innerHTML = list
      .slice(0, 40)
      .map((it) => {
        const inOrder = order.has(it.n);
        const pack = it.p ? ` · عبوة ${it.p}` : "";
        return `<li class="item${it.image ? " item--pictured" : ""}">
          ${it.image ? `<img class="item__image" src="${esc(it.image)}" alt="علبة ${esc(it.n)}" width="80" height="80" loading="lazy">` : ""}
          <span class="item__name">${esc(it.n)}</span>
          <span class="item__meta">${esc(it.f)}${pack} · ${esc(it.m)}<br><bdi>${esc(it.c)} ${esc(it.s)}</bdi></span>
          <button type="button" class="add" data-n="${esc(it.n)}" aria-pressed="${inOrder}">${inOrder ? "أُضيف" : "أضف"}</button>
        </li>`;
      })
      .join("");
  };

  const setOpen = (i) => {
    openIdx = i;
    drawersEl.querySelectorAll(".drawer").forEach((d, j) => d.setAttribute("aria-expanded", String(j === i)));
  };

  const showOut = () => {
    if (outEl.hidden) {
      outEl.hidden = false;
    } else {
      // replay the pull when switching drawers
      outEl.style.animation = "none";
      void outEl.offsetWidth;
      outEl.style.animation = "";
    }
  };

  const openDrawer = (i) => {
    setOpen(i);
    outLabel.textContent = `درج ${GROUPS[i]}`;
    renderItems(catalog.filter((it) => it.g === i), "هذا الدرج فارغ في التجربة.");
    showOut();
  };

  const closeDrawer = () => {
    setOpen(-1);
    outEl.hidden = true;
  };
  $("drawer-close").addEventListener("click", closeDrawer);

  let t;
  const search = () => {
    const term = normalizeSearch(q.value);
    if (term.length < 2) {
      if (!term) closeDrawer();
      return;
    }
    loadCatalog().then(() => {
      if (normalizeSearch(q.value) !== term) return;
      const hits = catalog.filter((it) => matchesSearch(it, term));
      hits.sort((a, b) => (normalizeSearch(b.n).startsWith(term) ? 1 : 0) - (normalizeSearch(a.n).startsWith(term) ? 1 : 0));
      setOpen(hits.length ? hits[0].g : -1);
      outLabel.textContent = hits.length ? items(hits.length) : "لا نتائج";
      renderItems(hits, "ما لقينا هالاسم بالكتالوج التجريبي المحدود. جرّب أحد الأسماء الجاهزة فوق، أو الاسم بالإنجليزية.");
      showOut();
    });
  };
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(search, 160);
  });
  document.querySelectorAll("[data-search]").forEach((button) => {
    button.addEventListener("click", () => {
      clearTimeout(t);
      q.value = button.dataset.search;
      search();
    });
  });
  q.addEventListener("focus", loadCatalog, { once: true });
  // The first drawer opens by itself when the demo scrolls into view, so a
  // visitor sees the boxes and photos without having to guess that the
  // drawers open. Only if nothing has been opened or searched yet.
  const demoEl = $("demo");
  if (demoEl && "IntersectionObserver" in window) {
    const peek = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      peek.disconnect();
      loadCatalog().then(() => {
        if (openIdx === -1 && !q.value) openDrawer(0);
      });
    }, { threshold: 0.25 });
    // Fetch the catalog a little before the demo arrives, so the drawer
    // photos are already in place when it scrolls into view.
    const early = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      early.disconnect();
      loadCatalog();
    }, { rootMargin: "600px 0px" });
    early.observe(demoEl);
    peek.observe(demoEl);
  }

  $("labeler").addEventListener("submit", (e) => {
    e.preventDefault();
    search();
  });

  // ── the order slip ──────────────────────────────────────
  const renderSlip = () => {
    const n = order.size;
    slipCount.textContent = n ? items(n) : "فارغة";
    slipList.innerHTML = [...order.values()]
      .map(({ item, qty }) => `<li><span>${esc(item.n)}</span><span class="qty">× ${qty}</span></li>`)
      .join("");
    sendBtn.disabled = n === 0;
  };

  itemsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".add");
    if (!b) return;
    const name = b.dataset.n;
    const item = catalog.find((it) => it.n === name);
    if (order.has(name)) {
      order.get(name).qty += 1;
    } else {
      order.set(name, { item, qty: 1 });
    }
    b.setAttribute("aria-pressed", "true");
    b.textContent = "أُضيف";
    track.hidden = true;
    sendBtn.textContent = "أرسل الطلبية للمستودع";
    renderSlip();
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sendBtn.addEventListener("click", () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "أُرسلت";
    track.hidden = false;
    const steps = [...track.children];
    steps.forEach((s) => s.classList.remove("on"));
    steps.forEach((s, i) => setTimeout(() => s.classList.add("on"), reduce ? 0 : 250 + i * 900));
    setTimeout(() => {
      order.clear();
      renderSlip();
      sendBtn.textContent = "أرسل الطلبية للمستودع";
      itemsEl.querySelectorAll(".add").forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.textContent = "أضف";
      });
    }, reduce ? 1200 : 250 + steps.length * 900 + 1400);
  });

  // ── approved APK download: fail closed on legacy/incomplete manifests ──
  // The historical site build only had {apk,build,date,size}; never advertise
  // that legacy file as the current signed production release.
  const apk = $("apk");
  const meta = $("apk-meta");
  const apkLabel = $("apk-label");
  const contactHref = apk.href;
  const isVerifiedManifest = (v) => {
    if (!v || v.apk !== true || v.applicationId !== "com.feniq.link") return false;
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v.versionName || "")) return false;
    if (!/^[0-9a-f]{64}$/i.test(v.sha256 || "") || !/^[0-9a-f:]{64,95}$/i.test(v.certificateSha256 || "")) return false;
    const build = String(v.build || "");
    return /^[1-9][0-9]{0,9}$/.test(build) &&
      typeof v.size === "number" && v.size > 1000000 &&
      v.file === "releases/" + build + "-" + v.sha256.slice(0, 12) + ".apk";
  };
  fetch("version.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null)
    .then((v) => {
      if (!isVerifiedManifest(v)) {
        apk.removeAttribute("download");
        apk.href = contactHref;
        apkLabel.textContent = "اطلب رابط النسخة المعتمدة";
        meta.textContent = "التنزيل المباشر يُتاح بعد اعتماد نسخة موقّعة؛ لا نعرض إصداراً قديماً على أنه أحدث نسخة.";
        return;
      }
      apk.href = "feniq.apk";
      apk.setAttribute("download", "feniq.apk");
      apkLabel.textContent = "نزّل تطبيق فينيق";
      const size = (v.size / 1048576).toFixed(0) + " ميغابايت";
      const date = v.date ? " · " + new Date(v.date).toLocaleDateString("ar-SY-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }) : "";
      meta.textContent = "الإصدار " + v.versionName + " · Build " + v.build + " · " + size + date;
    });

  // ── فيديو التعريف ───────────────────────────────────────
  // القسم مخفي حتى يوجد الملف: ضع الفيديو في site/video/feniq.mp4 (H.264 + AAC، أقل من ~10 ميغا) وبيظهر لحاله.
  const videoSection = $("video");
  if (videoSection) {
    fetch("video/feniq.mp4", { method: "HEAD", cache: "no-store" })
      .then((r) => {
        if (!r.ok || !/video/.test(r.headers.get("content-type") || "")) return;
        $("vid-el").src = "video/feniq.mp4";
        videoSection.hidden = false;
      })
      .catch(() => {});
  }
})();
