// ===== Private — 패널 테마 확장 =====
// 메모 / 인포블록 / 팩트 패널 렌더링 + CSS 변수 테마 스위칭

(function () {
  const EXT_NAME = "private";
  const SETTINGS_KEY = "private_theme";

  // =====================================================
  //  테마 정의 — 여기에 추가하면 설정 UI에 자동으로 뜸
  // =====================================================
  const THEMES = {
    default: {
      name: "기본 (화이트)",
      vars: {
        "--pv-font":              "'Pretendard','Malgun Gothic',sans-serif",
        "--pv-radius":            "8px",
        "--pv-radius-lg":         "12px",
        "--pv-text":              "#333",
        "--pv-text-strong":       "#000",
        "--pv-text-sub":          "#555",
        "--pv-memo-bg":           "#fff",
        "--pv-memo-border":       "#eaeaea",
        "--pv-info-bg":           "#fff",
        "--pv-info-border":       "#ddd",
        "--pv-tab-bg":            "#f5f5f5",
        "--pv-tab-border":        "#ddd",
        "--pv-tab-active-bg":     "#333",
        "--pv-tab-active-text":   "#fff",
        "--pv-facts-bg":          "#fff",
        "--pv-facts-border":      "#eee",
        "--pv-facts-item-bg":     "#f9f9f9",
        "--pv-facts-item-border": "#eaeaea",
      },
    },
    // ── 테마 추가 예시 ──
    // dark: {
    //   name: "다크",
    //   vars: {
    //     "--pv-text": "#ddd",
    //     "--pv-text-strong": "#fff",
    //     "--pv-text-sub": "#aaa",
    //     "--pv-memo-bg": "#1e1e1e",
    //     "--pv-memo-border": "#333",
    //     ...
    //   },
    // },
  };

  // =====================================================
  //  테마 적용
  // =====================================================
  let themeStyleEl = null;

  function applyTheme(id) {
    const theme = THEMES[id] || THEMES.default;
    if (!themeStyleEl) {
      themeStyleEl = document.createElement("style");
      themeStyleEl.id = "private-theme-vars";
      document.head.appendChild(themeStyleEl);
    }
    const lines = Object.entries(theme.vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");
    themeStyleEl.textContent = `:root {\n${lines}\n}`;
  }

  function saveTheme(id) {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) return;
    if (!ctx.extensionSettings[EXT_NAME]) ctx.extensionSettings[EXT_NAME] = {};
    ctx.extensionSettings[EXT_NAME].theme = id;
    ctx.saveSettingsDebounced?.();
  }

  function loadTheme() {
    const ctx = SillyTavern?.getContext?.();
    const saved = ctx?.extensionSettings?.[EXT_NAME]?.theme;
    return saved && THEMES[saved] ? saved : "default";
  }

  // =====================================================
  //  설정 UI 초기화
  // =====================================================
  function initSettings() {
    const container = document.getElementById("private-theme-list");
    if (!container) return;

    const current = loadTheme();

    container.innerHTML = "";
    for (const [id, theme] of Object.entries(THEMES)) {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:6px;";
      label.addEventListener("mouseenter", () => label.style.background = "rgba(0,0,0,.04)");
      label.addEventListener("mouseleave", () => label.style.background = "transparent");

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "private-theme-radio";
      radio.value = id;
      radio.checked = id === current;

      radio.addEventListener("change", () => {
        applyTheme(id);
        saveTheme(id);
        rescanAll();
      });

      const span = document.createElement("span");
      span.textContent = theme.name;

      label.appendChild(radio);
      label.appendChild(span);
      container.appendChild(label);
    }
  }

  // =====================================================
  //  메모 변환
  // =====================================================
  const PASTEL = [
    "rgba(255,179,186,.25)", "rgba(255,223,186,.25)", "rgba(255,255,186,.3)",
    "rgba(186,255,201,.25)", "rgba(186,225,255,.25)", "rgba(230,200,250,.25)",
    "rgba(255,204,229,.25)", "rgba(200,240,240,.25)", "rgba(240,240,210,.25)",
    "rgba(220,220,255,.25)", "rgba(200,255,230,.25)", "rgba(245,215,200,.25)",
  ];

  function convertMemo(details) {
    const summary = details.querySelector("summary");
    if (!summary || !summary.textContent.includes("📋")) return;

    const pre = details.querySelector("pre");
    let raw;
    if (pre) {
      raw = pre.textContent;
    } else {
      const c = details.cloneNode(true);
      c.querySelector("summary")?.remove();
      raw = c.textContent;
    }

    const lines = raw.trim().split("\n");
    const panel = document.createElement("div");
    panel.className = "memo-panel";
    const content = document.createElement("div");
    content.className = "memo-content";

    let bag = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const div = document.createElement("div");
      if (t[0] === "-") {
        const span = document.createElement("span");
        span.className = "memo-highlight";
        span.textContent = t;
        if (!bag.length) bag = PASTEL.slice();
        const i = (Math.random() * bag.length) | 0;
        span.style.setProperty("--hl", bag.splice(i, 1)[0]);
        div.appendChild(span);
      } else {
        div.textContent = t;
      }
      content.appendChild(div);
    }
    panel.appendChild(content);
    details.replaceWith(panel);
  }

  // =====================================================
  //  인포블록 변환
  // =====================================================
  function convertInfo(pre) {
    if (pre.dataset.sp === "1") return;
    const raw = pre.textContent;
    if (!raw.includes("📅") || (!raw.includes("♀️") && !raw.includes("♂️"))) return;

    const data = parseInfo(raw);
    if (!data) return;

    const el = buildInfo(data);
    pre.parentNode.insertBefore(el, pre.nextSibling);
    pre.style.display = "none";
    pre.dataset.sp = "1";
  }

  function parseInfo(text) {
    try {
      const clean = text.replace(/\r\n/g, "\n");
      const hm = clean.match(/📅.*/);
      let date = "", time = "", weather = "", location = "", temp = "";

      if (hm) {
        const p = hm[0].split("|");
        date = (p[0] || "").replace("📅", "").trim();
        time = (p[1] || "").replace(/[⏰\u{1F550}-\u{1F567}]/u, "").trim();
        weather = (p[2] || "").replace(/[☁️☀️🌧️❄️]/u, "").trim();
        location = (p[3] || "").replace("📍", "").trim();
        temp = (p[4] || "").replace("🌡", "").trim();
      }

      const scene = clean.match(/🎬\s*Scene:\s*(.*)/)?.[1]?.trim() || "";
      const mood = clean.match(/🎆\s*Background:\s*(.*)/)?.[1]?.trim() || "";

      const characters = [];
      for (const sec of clean.split(/(?=\n\s*[♀️♂️])/)) {
        const s = sec.trim();
        if (!s.startsWith("♀️") && !s.startsWith("♂️")) continue;
        const namePart = s.split("\n")[0].replace(/[♀️♂️]/g, "").trim();
        const name = namePart.split("(")[0].trim();
        const role = namePart.match(/\(([^)]+)\)/)?.[1] || "";
        const gv = (k) => s.match(new RegExp(`•\\s*${k}:\\s*(.*)`))?.[1]?.trim() || "";
        const status = gv("상태"), body = gv("신체");
        let full = status;
        if (body && body !== status) full += ` / ${body}`;
        characters.push({ name, role, outfit: gv("의상"), state: full, pose: gv("포즈") });
      }

      const npcs = [];
      for (const m of clean.matchAll(/(?:👤|🐶|🐕|🐱|🐈)\s*([^:]+):\s*(.+)/g)) {
        npcs.push({ name: m[1].trim(), desc: m[2].trim() });
      }

      if (!characters.length) return null;
      return {
        uid: "u" + Math.random().toString(36).substr(2, 6),
        date, time, weather, location, temp, mood, scene, characters, npcs,
      };
    } catch (e) {
      return null;
    }
  }

  function buildInfo(d) {
    const el = document.createElement("div");
    el.className = "simple-container";
    const row = (l, v) =>
      `<div class='simple-row'><span class='simple-label'>${l}</span><span class='simple-value'>${v}</span></div>`;

    let tabs = d.characters
      .map((c, i) => {
        const id = `t_${d.uid}_${i}`;
        return `
        <input type="radio" name="g_${d.uid}" id="${id}" class="simple-tab-input" ${i === 0 ? "checked" : ""}>
        <label for="${id}" class="simple-tab-label">${c.name}</label>
        <div class="simple-tab-content">
          ${c.role ? row("Role", c.role) : ""}
          ${row("Outfit", c.outfit)}
          ${row("Status", c.state)}
          ${row("Action", c.pose)}
        </div>`;
      })
      .join("");

    if (d.npcs.length) {
      const id = `t_${d.uid}_npc`;
      tabs += `
        <input type="radio" name="g_${d.uid}" id="${id}" class="simple-tab-input">
        <label for="${id}" class="simple-tab-label">NPCs</label>
        <div class="simple-tab-content">${d.npcs.map((n) => row(n.name, n.desc)).join("")}</div>`;
    }

    const wx = d.temp ? `${d.weather} (${d.temp})` : d.weather;
    el.innerHTML = `
      ${row("Time", `${d.date} ${d.time}`)}
      ${row("Location", d.location)}
      ${row("Weather", wx)}
      ${d.scene ? row("Scene", d.scene) : ""}
      ${d.mood ? row("Mood", d.mood) : ""}
      <div class="simple-tabs-wrapper">${tabs}</div>`;
    return el;
  }

  // =====================================================
  //  팩트 변환
  // =====================================================
  const FACTS_RE = /&lt;--- Facts Start ---&gt;([\s\S]*?)&lt;--- Facts End ---&gt;/gi;

  function processFacts(msg) {
    if (!msg) return;
    const html = msg.innerHTML || "";
    if (!html.includes("&lt;--- Facts Start ---&gt;")) {
      msg.dataset.fv = "";
      return;
    }
    if (msg.dataset.fv === "1") return;

    const walker = document.createTreeWalker(msg, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) =>
        n.tagName === "PRE" || n.tagName === "CODE"
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });

    let node,
      target = null;
    while ((node = walker.nextNode())) {
      if (node.innerHTML?.includes("&lt;--- Facts Start ---&gt;")) {
        target = node;
        break;
      }
    }
    if (!target) return;

    target.innerHTML = target.innerHTML.replace(FACTS_RE, (_, content) => {
      const decoded = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      let items = "";
      for (const r of decoded.matchAll(/\[([^\]]+)\]/g)) {
        items += `<div class="facts-item">${r[1].trim()}</div>`;
      }
      if (!items) return "";
      return `<div class="facts-container">${items}</div>`;
    });

    msg.dataset.fv = "1";
  }

  // =====================================================
  //  스캔 & Observer
  // =====================================================
  function scanNode(root) {
    if (root.nodeType !== 1) return;

    if (root.matches?.("details")) convertMemo(root);
    else root.querySelectorAll?.("details").forEach(convertMemo);

    if (root.matches?.("pre")) convertInfo(root);
    else root.querySelectorAll?.("pre").forEach(convertInfo);

    const msg =
      root.querySelector?.(".mes_text") ||
      (root.classList?.contains("mes_text") ? root : null);
    if (msg) processFacts(msg);
  }

  function rescanAll() {
    document.querySelectorAll("details").forEach(convertMemo);
    document.querySelectorAll("pre").forEach(convertInfo);
    document.querySelectorAll(".mes_text").forEach(processFacts);
  }

  function startObserver() {
    const chat = document.querySelector("#chat");
    const target = chat || document.body;

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) scanNode(node);
        if (m.type === "characterData" || m.type === "childList") {
          const msg = m.target.closest?.(".mes_text");
          if (msg) processFacts(msg);
        }
      }
    });

    mo.observe(target, { childList: true, subtree: true, characterData: true });
  }

  // =====================================================
  //  확장 진입점
  // =====================================================
  jQuery(async () => {
    // 설정 HTML 로드
    const settingsHtml = await $.get(`/scripts/extensions/third-party/${EXT_NAME}/설정.html`);
    $("#extensions_settings2").append(settingsHtml);

    // 저장된 테마 적용
    const currentTheme = loadTheme();
    applyTheme(currentTheme);

    // 설정 UI 라디오 버튼 생성
    initSettings();

    // 초기 스캔 + Observer 시작
    rescanAll();
    startObserver();
  });
})();
