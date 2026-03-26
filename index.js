/**
 * Private 📦 — SillyTavern Extension
 */

import { event_types } from '../../../events.js';

const EXT_NAME = 'private';
const VERSION = '1.1.0';

const DEFAULTS = {
    version: VERSION,
    items: [],
    // items: [{ id, name, description, location, keywords: [] }]
    apiSource: 'main',
    connectionProfileId: '',
};

let ctx = null;

function save() { ctx.saveSettingsDebounced(); }
function getSettings() { return ctx.extensionSettings[EXT_NAME]; }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── INIT ──────────────────────────────────────────────────────
async function init() {
    console.log(`[${EXT_NAME}] 초기화 시작...`);
    ctx = SillyTavern.getContext();

    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = structuredClone(DEFAULTS);
    }
    const s = getSettings();
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    // 기존 아이템에 keywords 필드 없으면 추가
    s.items.forEach(item => {
        if (!Array.isArray(item.keywords)) item.keywords = [];
    });

    loadSettingsUI();
    addMagicButton();
    updatePromptByKeyword();
    bindChatEvent();

    console.log(`[${EXT_NAME}] 초기화 완료 ✓`);
}

// ── CHAT EVENT: 매 메시지마다 키워드 매칭 ─────────────────────
function bindChatEvent() {
    ctx.eventSource.on(event_types.MESSAGE_RECEIVED, () => updatePromptByKeyword());
    ctx.eventSource.on(event_types.MESSAGE_SENT, () => updatePromptByKeyword());
    ctx.eventSource.on(event_types.CHAT_CHANGED, () => updatePromptByKeyword());
}

// ── KEYWORD MATCHING → PROMPT INJECTION ──────────────────────
function updatePromptByKeyword() {
    const s = getSettings();
    if (!s.items.length) {
        if (ctx.setExtensionPrompt) ctx.setExtensionPrompt(EXT_NAME, '', 1, 0);
        return;
    }

    // 최근 메시지 1개 텍스트
    const chat = ctx.chat;
    const lastMsg = chat?.[chat.length - 1];
    const text = (lastMsg?.mes || '').toLowerCase();

    if (!text) {
        if (ctx.setExtensionPrompt) ctx.setExtensionPrompt(EXT_NAME, '', 1, 0);
        return;
    }

    // 키워드 매칭
    const matched = s.items.filter(item => {
        if (!item.keywords || !item.keywords.length) return false;
        return item.keywords.some(kw => kw && text.includes(kw.toLowerCase()));
    });

    if (!matched.length) {
        if (ctx.setExtensionPrompt) ctx.setExtensionPrompt(EXT_NAME, '', 1, 0);
        return;
    }

    // 매칭된 아이템만 영어로 프롬프트 구성
    let prompt = '\n[INVENTORY — Active Items]\n';
    prompt += `Items currently relevant to the scene that {{user}} possesses:\n`;
    matched.forEach((item, i) => {
        prompt += `${i + 1}. ${item.name}`;
        if (item.description) prompt += ` — ${item.description}`;
        if (item.location) prompt += ` (location: ${item.location})`;
        prompt += '\n';
    });
    prompt += `Maintain consistency with these items in the current scene.\n`;

    if (ctx.setExtensionPrompt) {
        ctx.setExtensionPrompt(EXT_NAME, prompt, 1, 0);
    }
}

// ── CONNECTION PROFILE ───────────────────────────────────────
function discoverProfiles() {
    const cmrs = ctx.ConnectionManagerRequestService;
    if (!cmrs) return [];

    const knownMethods = ['getConnectionProfiles', 'getAllProfiles', 'getProfiles', 'listProfiles'];
    for (const m of knownMethods) {
        if (typeof cmrs[m] === 'function') {
            try {
                const result = cmrs[m]();
                if (Array.isArray(result) && result.length) return result;
            } catch (e) { console.log(`[${EXT_NAME}] ${m}() 실패:`, e); }
        }
    }

    try {
        const proto = Object.getPrototypeOf(cmrs);
        const dynamicMethods = Object.getOwnPropertyNames(proto)
            .filter(k => typeof cmrs[k] === 'function' && /rofile/i.test(k) && !knownMethods.includes(k));
        for (const m of dynamicMethods) {
            try {
                const result = cmrs[m]();
                if (Array.isArray(result) && result.length) return result;
            } catch {}
        }
    } catch {}

    const paths = [
        ctx.extensionSettings?.connectionManager?.profiles,
        ctx.extensionSettings?.ConnectionManager?.profiles,
        ctx.extensionSettings?.connection_manager?.profiles,
    ];
    for (const p of paths) {
        if (!p) continue;
        const arr = Array.isArray(p) ? p : Object.values(p);
        if (arr.length) return arr;
    }

    return [];
}

function getProfileId(p) { return p.id || p.profileId || p.profile_id || p.uuid || ''; }
function getProfileName(p) { return p.name || p.profileName || p.profile_name || p.displayName || getProfileId(p); }

async function sendProfileRequest(msgs, maxTokens) {
    const cmrs = ctx.ConnectionManagerRequestService;
    if (!cmrs) throw new Error('Connection Manager 미로드');

    const s = getSettings();
    const optionSets = [
        { stream: false, extractData: true, includePreset: false, includeInstruct: false },
        { streaming: false, extractData: true, includePreset: false, includeInstruct: false },
        { stream: false, extractData: true },
        { streaming: false },
    ];

    let lastError = null;
    for (const opts of optionSets) {
        try {
            const resp = await cmrs.sendRequest(s.connectionProfileId, msgs, maxTokens, opts);
            if (typeof resp === 'string') return resp;
            if (resp?.choices?.[0]?.message) {
                const m = resp.choices[0].message;
                return m.reasoning_content || m.content || '';
            }
            if (resp?.content) return resp.content;
            if (resp?.message) return resp.message;
            lastError = new Error('응답 형식 인식 실패');
        } catch (e) {
            lastError = e;
            console.log(`[${EXT_NAME}] sendRequest 옵션 실패:`, opts, e.message);
        }
    }
    throw new Error(`Profile 오류: ${lastError?.message || '알 수 없는 오류'}`);
}

// ── SETTINGS UI ───────────────────────────────────────────────
function loadSettingsUI() {
    const s = getSettings();

    let profileOptions = '';
    try {
        const profiles = discoverProfiles();
        profiles.forEach(p => {
            const id = getProfileId(p);
            const name = getProfileName(p);
            if (id) profileOptions += `<option value="profile:${id}">${escHtml(name)}</option>`;
        });
    } catch (e) { console.log(`[${EXT_NAME}] 프로필 목록 로드 실패:`, e); }

    const currentVal = s.apiSource === 'profile' && s.connectionProfileId
        ? `profile:${s.connectionProfileId}` : 'main';

    const html = `
    <div id="priv-settings-block">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📦 Private v${VERSION}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p style="font-size:12px;color:#888;margin:8px 0;">확장 메뉴(✨)에서 인벤토리를 열 수 있습니다.</p>
                <p style="font-size:11px;color:#666;margin:4px 0;">키워드 매칭: 최근 메시지에서 한국어 키워드가 감지되면 해당 아이템이 자동으로 프롬프트에 삽입됩니다.</p>

                <label style="font-size:12px;font-weight:600;margin-top:8px;display:block;">API 소스 (AI 파싱용)</label>
                <select id="priv-api-source" class="text_pole" style="font-size:12px;margin-top:4px;">
                    <option value="main">Main API (generateRaw)</option>
                    ${profileOptions}
                </select>

                <div id="priv-item-count" style="font-size:12px;color:#666;margin-top:8px;">아이템: 0개</div>
                <div style="margin-top:10px;">
                    <button id="priv-open-btn" class="menu_button" style="width:100%;">📦 팝업 열기</button>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings').append(html);
    $('#priv-api-source').val(currentVal);

    $('#priv-api-source').on('change', function () {
        const val = $(this).val();
        const s = getSettings();
        if (val === 'main') {
            s.apiSource = 'main';
            s.connectionProfileId = '';
        } else {
            s.apiSource = 'profile';
            s.connectionProfileId = val.replace('profile:', '');
        }
        save();
    });

    updateSettingsCount();
    $('#priv-open-btn').on('click', openPopup);
}

function updateSettingsCount() {
    const s = getSettings();
    $('#priv-item-count').text(`아이템: ${s.items.length}개`);
}

// ── MAGIC BUTTON ──────────────────────────────────────────────
function addMagicButton() {
    if (document.getElementById('priv-magic-btn')) return;

    const tryAdd = () => {
        const menu = document.querySelector('#extensionsMenu');
        if (!menu) { setTimeout(tryAdd, 1500); return; }
        if (document.getElementById('priv-magic-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'priv-magic-btn';
        btn.className = 'list-group-item flex-container flexGap5 interactable';
        btn.title = '인벤토리';
        btn.innerHTML = '<i class="fa-solid fa-box-open"></i> 인벤토리';
        btn.addEventListener('click', () => {
            $('#extensionsMenu').hide();
            openPopup();
        });

        menu.appendChild(btn);
        console.log(`[${EXT_NAME}] 확장 메뉴에 버튼 추가됨`);
    };

    tryAdd();
}

// ── POPUP ─────────────────────────────────────────────────────
function openPopup() {
    if (document.getElementById('priv-overlay')) { closePopup(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'priv-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    const popup = document.createElement('div');
    popup.id = 'priv-popup';
    popup.style.position = 'relative';

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    renderInventory(popup);
}

function closePopup() {
    document.getElementById('priv-overlay')?.remove();
}

// ── RENDER: INVENTORY LIST ───────────────────────────────────
function renderInventory(popup) {
    const s = getSettings();

    const itemsHTML = s.items.length === 0
        ? `<div class="priv-empty">
            <i class="fa-solid fa-box-open"></i>
            인벤토리가 비어있습니다.<br/>아이템을 추가하거나 AI 파싱을 해보세요.
           </div>`
        : s.items.map((item, i) => `
            <div class="priv-item" data-idx="${i}">
                <div class="priv-item-top">
                    <div class="priv-item-name">${escHtml(item.name)}</div>
                    <div class="priv-item-actions">
                        <button class="priv-edit-btn" data-idx="${i}" title="수정">
                            <i class="fa-solid fa-pen" style="font-size:10px;"></i>
                        </button>
                        <button class="priv-del-btn" data-idx="${i}" title="삭제">
                            <i class="fa-solid fa-trash" style="font-size:10px;"></i>
                        </button>
                    </div>
                </div>
                ${item.description ? `<div class="priv-item-desc">${escHtml(item.description)}</div>` : ''}
                ${item.location ? `<div class="priv-item-loc"><i class="fa-solid fa-location-dot"></i>${escHtml(item.location)}</div>` : ''}
                <div class="priv-item-kw">
                    <i class="fa-solid fa-key" style="font-size:9px;margin-right:4px;color:#7c9ef7;"></i>
                    ${(item.keywords || []).length > 0
                        ? item.keywords.map(kw => `<span class="priv-kw-tag">${escHtml(kw)}</span>`).join('')
                        : '<span style="color:#555;font-size:10px;">키워드 없음</span>'}
                </div>
            </div>`).join('');

    popup.innerHTML = `
    <div class="priv-screen">
        <div class="priv-topbar">
            <div class="priv-header">
                <span style="font-size:18px;">📦</span>
                <span class="priv-title">Inventory</span>
            </div>
            <div class="priv-close" id="priv-close">✕</div>
        </div>
        <div class="priv-count">보유 아이템 <span>${s.items.length}</span>개</div>
        <div class="priv-item-list">${itemsHTML}</div>
        <div class="priv-divider"></div>
        <div class="priv-btn-row">
            <button class="priv-sync-btn" id="priv-sync">
                <i class="fa-solid fa-rotate"></i> AI 파싱
            </button>
            <button class="priv-add-btn" id="priv-add">
                <i class="fa-solid fa-plus"></i> 추가
            </button>
        </div>
    </div>`;

    popup.querySelector('#priv-close').addEventListener('click', closePopup);

    popup.querySelector('#priv-add').addEventListener('click', () => {
        showEditModal(popup, null);
    });

    popup.querySelector('#priv-sync').addEventListener('click', async function () {
        const s = getSettings();
        if (s.apiSource === 'profile' && !s.connectionProfileId) {
            alert('설정에서 Connection Profile을 선택하세요.');
            return;
        }
        this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 파싱 중...';
        this.disabled = true;
        const result = await parseItemsFromChat();
        if (result && result.length > 0) {
            mergeItems(result);
            updatePromptByKeyword();
            updateSettingsCount();
            renderInventory(popup);
        } else {
            this.innerHTML = '파싱 결과 없음';
            setTimeout(() => {
                this.innerHTML = '<i class="fa-solid fa-rotate"></i> AI 파싱';
                this.disabled = false;
            }, 1500);
        }
    });

    popup.querySelectorAll('.priv-edit-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditModal(popup, parseInt(el.dataset.idx));
        });
    });

    popup.querySelectorAll('.priv-del-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.idx);
            const item = s.items[idx];
            if (confirm(`"${item.name}" 삭제?`)) {
                s.items.splice(idx, 1);
                save();
                updatePromptByKeyword();
                updateSettingsCount();
                renderInventory(popup);
            }
        });
    });
}

// ── EDIT / ADD MODAL ─────────────────────────────────────────
function showEditModal(popup, idx) {
    const s = getSettings();
    const isEdit = idx !== null;
    const item = isEdit ? s.items[idx] : { name: '', description: '', location: '', keywords: [] };

    popup.querySelector('.priv-edit-overlay')?.remove();

    const modal = document.createElement('div');
    modal.className = 'priv-edit-overlay';
    modal.innerHTML = `
    <div class="priv-edit-box">
        <div class="priv-edit-title">${isEdit ? '아이템 수정' : '아이템 추가'}</div>
        <div class="priv-edit-field">
            <label>이름 (영어)</label>
            <input id="priv-ed-name" type="text" value="${escAttr(item.name)}" placeholder="Iron Sword" />
        </div>
        <div class="priv-edit-field">
            <label>설명 (영어)</label>
            <input id="priv-ed-desc" type="text" value="${escAttr(item.description)}" placeholder="A rusty iron sword" />
        </div>
        <div class="priv-edit-field">
            <label>위치 (영어)</label>
            <input id="priv-ed-loc" type="text" value="${escAttr(item.location)}" placeholder="backpack / inventory" />
        </div>
        <div class="priv-edit-field">
            <label>키워드 (한국어, 쉼표로 구분)</label>
            <input id="priv-ed-kw" type="text" value="${escAttr((item.keywords || []).join(', '))}" placeholder="철검, 검, 무기" />
        </div>
        <div class="priv-edit-btns">
            <button class="priv-edit-cancel">취소</button>
            <button class="priv-edit-save">${isEdit ? '저장' : '추가'}</button>
        </div>
    </div>`;

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('.priv-edit-cancel').addEventListener('click', () => modal.remove());

    modal.querySelector('.priv-edit-save').addEventListener('click', () => {
        const name = modal.querySelector('#priv-ed-name').value.trim();
        if (!name) { modal.querySelector('#priv-ed-name').focus(); return; }

        const desc = modal.querySelector('#priv-ed-desc').value.trim();
        const loc = modal.querySelector('#priv-ed-loc').value.trim();
        const kwRaw = modal.querySelector('#priv-ed-kw').value;
        const keywords = kwRaw.split(',').map(k => k.trim()).filter(Boolean);

        if (isEdit) {
            s.items[idx].name = name;
            s.items[idx].description = desc;
            s.items[idx].location = loc;
            s.items[idx].keywords = keywords;
        } else {
            s.items.push({ id: genId(), name, description: desc, location: loc, keywords });
        }

        save();
        updatePromptByKeyword();
        updateSettingsCount();
        modal.remove();
        renderInventory(popup);
    });

    modal.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') modal.querySelector('.priv-edit-save').click();
        });
    });

    popup.appendChild(modal);
    setTimeout(() => modal.querySelector('#priv-ed-name').focus(), 50);
}

// ── AI PARSE ──────────────────────────────────────────────────
async function parseItemsFromChat() {
    try {
        const chat = ctx.chat;
        if (!chat || chat.length === 0) return null;

        const s = getSettings();
        const messages = chat.slice(-30).map(m => `${m.name}: ${m.mes}`).join('\n');

        const systemPrompt = 'You are an item extractor for roleplay. Return ONLY valid JSON array. No explanation, no markdown.';
        const userPrompt = `다음 롤플레이 대화에서 {{user}}가 소유하거나 소지하고 있는 아이템을 모두 추출하세요.
획득했다가 잃어버리거나 사용하여 소멸한 아이템은 제외하세요.

각 아이템에 대해:
- name: 아이템 이름 (영어)
- description: 짧은 설명 한 줄 (영어)
- location: 현재 위치 (영어, 예: backpack, pocket, home, worn)
- keywords: 이 아이템이 대화에서 언급될 때 사용될 수 있는 한국어 키워드 배열 (동의어, 별칭, 줄임말 포함)

응답은 반드시 JSON 배열만 반환하세요. 설명이나 마크다운 없이 순수 JSON만.
[{"name":"Iron Sword","description":"A well-forged iron sword","location":"belt","keywords":["철검","검","칼","무기"]}]

아이템이 없으면 빈 배열 []을 반환하세요.

대화:
${messages}`;

        let raw = '';

        if (s.apiSource === 'profile' && s.connectionProfileId) {
            const msgs = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ];
            raw = await sendProfileRequest(msgs, 4000);
        } else {
            raw = await ctx.generateRaw({
                systemPrompt,
                prompt: userPrompt,
                streaming: false,
            });
        }

        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) return null;

        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed)) return null;

        return parsed.filter(item => item && typeof item.name === 'string' && item.name.trim());
    } catch (e) {
        console.error(`[${EXT_NAME}] parseItemsFromChat error:`, e);
        return null;
    }
}

// ── MERGE: 기존 아이템 매칭 + 업데이트 ───────────────────────
function mergeItems(parsed) {
    const s = getSettings();
    const existing = s.items;

    for (const newItem of parsed) {
        const name = newItem.name.trim();
        if (!name) continue;

        const match = existing.find(e => e.name.toLowerCase() === name.toLowerCase());

        if (match) {
            // 기존 아이템 → 변경분 업데이트
            if (newItem.description && newItem.description.trim()) {
                match.description = newItem.description.trim();
            }
            if (newItem.location && newItem.location.trim()) {
                match.location = newItem.location.trim();
            }
            // 키워드: 기존 + 새 키워드 합침 (중복 제거)
            if (Array.isArray(newItem.keywords) && newItem.keywords.length) {
                const merged = [...new Set([
                    ...(match.keywords || []),
                    ...newItem.keywords.map(k => k.trim()).filter(Boolean),
                ])];
                match.keywords = merged;
            }
        } else {
            // 새 아이템 추가
            existing.push({
                id: genId(),
                name: name,
                description: (newItem.description || '').trim(),
                location: (newItem.location || '').trim(),
                keywords: Array.isArray(newItem.keywords)
                    ? newItem.keywords.map(k => k.trim()).filter(Boolean)
                    : [],
            });
        }
    }

    save();
}

// ── UTIL ──────────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── ENTRY POINT ───────────────────────────────────────────────
jQuery(async () => {
    await init();
});
