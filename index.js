// =============================================================
//  Private v2 — 패널 테마 확장 (테마별 HTML 구조 분리)
// =============================================================

(function () {
  const EXT_NAME = "private";

  // ─── 테마 레지스트리 ───
  // 새 테마 추가: THEMES에 키 추가 + buildMemo/buildInfo/buildFacts 구현
  const THEMES = {
    default: {
      name: "기본 (화이트)",
      buildMemo: buildMemoDefault,
      buildInfo: buildInfoDefault,
      buildFacts: null, // null = 공통 processFacts 사용
    },
    skyblue: {
      name: "스카이블루 미니멀",
      buildMemo: buildMemoSkyblue,
      buildInfo: buildInfoSkyblue,
      buildFacts: null, // null = 공통 processFacts 사용 (테마 CSS로 스타일링)
    },
  };

  let currentTheme = "default";

  // ─── 테마 저장/로드 ───
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

  function applyTheme(id) {
    currentTheme = id;
    document.body.setAttribute("data-pv-theme", id);
  }

  // ─── 설정 UI ───
  function initSettings() {
    const container = document.getElementById("private-theme-list");
    if (!container) return;
    const current = loadTheme();
    container.innerHTML = "";

    for (const [id, theme] of Object.entries(THEMES)) {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:6px;";
      label.addEventListener("mouseenter", () => (label.style.background = "rgba(0,0,0,.04)"));
      label.addEventListener("mouseleave", () => (label.style.background = "transparent"));

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "private-theme-radio";
      radio.value = id;
      radio.checked = id === current;
      radio.addEventListener("change", () => {
        applyTheme(id);
        saveTheme(id);
        rebuildAll();
      });

      const span = document.createElement("span");
      span.textContent = theme.name;
      label.appendChild(radio);
      label.appendChild(span);
      container.appendChild(label);
    }
  }

  // =========================================================
  //  DEFAULT 테마 빌더
  // =========================================================

  const PASTEL = [
    "rgba(255,179,186,.25)", "rgba(255,223,186,.25)", "rgba(255,255,186,.3)",
    "rgba(186,255,201,.25)", "rgba(186,225,255,.25)", "rgba(230,200,250,.25)",
    "rgba(255,204,229,.25)", "rgba(200,240,240,.25)", "rgba(240,240,210,.25)",
    "rgba(220,220,255,.25)", "rgba(200,255,230,.25)", "rgba(245,215,200,.25)",
  ];

  function buildMemoDefault(lines) {
    const panel = document.createElement("div");
    panel.className = "memo-panel";
    const content = document.createElement("div");
    content.className = "memo-content";

    let bag = [];
    for (const t of lines) {
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
    return panel;
  }

  function buildInfoDefault(d) {
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

  // =========================================================
  //  SKYBLUE 테마 빌더
  // =========================================================

  const SKYBLUE_HL = "rgba(81,160,222,.18)";

  function buildMemoSkyblue(lines) {
    const panel = document.createElement("div");
    panel.className = "pv-memo";
    const content = document.createElement("div");
    content.className = "pv-memo-content";

    for (const t of lines) {
      if (!t) continue;
      const div = document.createElement("div");
      if (t[0] === "-") {
        const span = document.createElement("span");
        span.className = "pv-memo-highlight";
        span.textContent = t;
        span.style.setProperty("--hl", SKYBLUE_HL);
        div.appendChild(span);
      } else {
        div.textContent = t;
      }
      content.appendChild(div);
    }
    panel.appendChild(content);
    return panel;
  }

  function buildInfoSkyblue(d) {
    const el = document.createElement("div");
    el.className = "pv-info";

    // 상단 정보 rows (태그형)
    const wx = d.temp ? `${d.weather} (${d.temp})` : d.weather;
    const infoRows = [
      ["Time", `${d.date} ${d.time}`],
      ["Location", d.location],
      ["Weather", wx],
    ];
    if (d.scene) infoRows.push(["Scene", d.scene]);
    if (d.mood) infoRows.push(["Mood", d.mood]);

    let rowsHtml = infoRows
      .map(
        ([l, v]) =>
          `<div class="pv-info-row"><span class="pv-info-label">${l}</span><span class="pv-info-value">${v}</span></div>`
      )
      .join("");

    // 캐릭터 탭
    let tabs = d.characters
      .map((c, i) => {
        const id = `t_${d.uid}_${i}`;
        const charRows = [];
        if (c.role) charRows.push(["Role", c.role]);
        charRows.push(["Outfit", c.outfit]);
        charRows.push(["Status", c.state]);
        charRows.push(["Action", c.pose]);

        const charHtml = `<div class="pv-info-rows">${charRows
          .map(
            ([l, v]) =>
              `<div class="pv-char-row"><span class="pv-char-label">${l}</span><span class="pv-char-value">${v}</span></div>`
          )
          .join("")}</div>`;

        return `
          <input type="radio" name="g_${d.uid}" id="${id}" class="pv-tab-input" ${i === 0 ? "checked" : ""}>
          <label for="${id}" class="pv-tab-label">${c.name}</label>
          <div class="pv-tab-content">${charHtml}</div>`;
      })
      .join("");

    if (d.npcs.length) {
      const id = `t_${d.uid}_npc`;
      const npcHtml = `<div class="pv-info-rows">${d.npcs
        .map(
          (n) =>
            `<div class="pv-char-row"><span class="pv-char-label">${n.name}</span><span class="pv-char-value">${n.desc}</span></div>`
        )
        .join("")}</div>`;
      tabs += `
        <input type="radio" name="g_${d.uid}" id="${id}" class="pv-tab-input">
        <label for="${id}" class="pv-tab-label">NPCs</label>
        <div class="pv-tab-content">${npcHtml}</div>`;
    }

    el.innerHTML = `
      <div class="pv-info-rows">${rowsHtml}</div>
      <div class="pv-tabs-wrapper">${tabs}</div>`;
    return el;
  }

  // =========================================================
  //  공통 파서 (테마 무관)
  // =========================================================

  function extractMemoLines(details) {
    const summary = details.querySelector("summary");
    if (!summary || !summary.textContent.includes("📋")) return null;

    const pre = details.querySelector("pre");
    let raw;
    if (pre) {
      raw = pre.textContent;
    } else {
      const c = details.cloneNode(true);
      c.querySelector("summary")?.remove();
      raw = c.textContent;
    }
    return raw
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
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
        const status = gv("상태"),
          body = gv("신체");
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

  // =========================================================
  //  변환 함수 (테마에 따라 빌더 선택)
  // =========================================================

  function convertMemo(details) {
    if (details.dataset.pvDone === "1") return;
    const lines = extractMemoLines(details);
    if (!lines) return;

    const theme = THEMES[currentTheme];
    const el = theme.buildMemo(lines);
    details.replaceWith(el);
  }

  function convertInfo(pre) {
    if (pre.dataset.sp === "1") return;
    const raw = pre.textContent;
    if (!raw.includes("📅") || (!raw.includes("♀️") && !raw.includes("♂️"))) return;

    const data = parseInfo(raw);
    if (!data) return;

    const theme = THEMES[currentTheme];
    const el = theme.buildInfo(data);
    pre.parentNode.insertBefore(el, pre.nextSibling);
    pre.style.display = "none";
    pre.dataset.sp = "1";
  }

  // 팩트: 테마별 CSS 클래스 분기
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

    let node, target = null;
    while ((node = walker.nextNode())) {
      if (node.innerHTML?.includes("&lt;--- Facts Start ---&gt;")) {
        target = node;
        break;
      }
    }
    if (!target) return;

    const isSkyblue = currentTheme === "skyblue";
    const containerClass = isSkyblue ? "pv-facts" : "facts-container";
    const itemClass = isSkyblue ? "pv-facts-item" : "facts-item";

    target.innerHTML = target.innerHTML.replace(FACTS_RE, (_, content) => {
      const decoded = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      let items = "";
      for (const r of decoded.matchAll(/\[([^\]]+)\]/g)) {
        items += `<div class="${itemClass}">${r[1].trim()}</div>`;
      }
      if (!items) return "";
      return `<div class="${containerClass}">${items}</div>`;
    });

    msg.dataset.fv = "1";
  }

  // =========================================================
  //  스캔 & 리빌드
  // =========================================================

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

  // 테마 전환 시: 이미 변환된 요소 제거 → 원본 복원은 불가하므로 재스캔
  function rebuildAll() {
    // 인포블록: 숨긴 pre 다시 보이고 생성된 요소 제거
    document.querySelectorAll("pre[data-sp='1']").forEach((pre) => {
      const next = pre.nextElementSibling;
      if (
        next &&
        (next.classList.contains("simple-container") || next.classList.contains("pv-info"))
      ) {
        next.remove();
      }
      pre.style.display = "";
      pre.dataset.sp = "";
    });

    // 팩트: 플래그만 리셋 (HTML 교체는 processFacts가 다시 처리)
    document.querySelectorAll(".mes_text[data-fv='1']").forEach((msg) => {
      msg.dataset.fv = "";
    });

    // 메모는 원본 details가 replaceWith로 교체되어 복원 불가
    // → 이미 변환된 메모는 유지, 새 메시지에만 새 테마 적용

    rescanAll();
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

  // =========================================================
  //  진입점
  // =========================================================

  jQuery(async () => {
    const settingsHtml = await $.get(
      `/scripts/extensions/third-party/${EXT_NAME}/settings.html`
    );
    $("#extensions_settings2").append(settingsHtml);

    currentTheme = loadTheme();
    applyTheme(currentTheme);
    initSettings();
    rescanAll();
    startObserver();
  });
})();
