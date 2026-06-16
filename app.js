'use strict';

const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const STORAGE_KEY = 'gemini_api_key';

const SYSTEM_PROMPTS = {
  zh2en: `你是一位專業的商務英文翻譯專家。
請將以下中文翻譯成正式、流暢的商務英文。
注意：
- 保持原文語氣與禮貌程度
- 使用標準商務用語
- 避免過於口語化的表達
只輸出翻譯結果，不加任何說明。`,

  en2zh: `你是一位專業的商務翻譯專家。
請將以下英文翻譯成正式、流暢的繁體中文。
注意：
- 保持原文語氣與禮貌程度
- 使用台灣繁體中文用語（非中國大陸用語）
- 保留專業術語的適當譯法
只輸出翻譯結果，不加任何說明。`,

  proofread: `你是一位專業的商務英文校對專家。
請分析以下英文，找出文法、拼字、用字或語氣問題，並提供修正。

請以 JSON 格式回傳（不要加 markdown 程式碼區塊標記，直接輸出純 JSON）：
{
  "corrected_text": "修正後的完整英文",
  "corrections": [
    {
      "original": "原始錯誤片段",
      "corrected": "修正後片段",
      "type": "文法 / 拼字 / 用字 / 語氣",
      "explanation": "用繁體中文解釋原因"
    }
  ],
  "overall_suggestion": "整體語氣或結構的建議（繁體中文）"
}

若文章無任何問題，corrections 陣列回傳空陣列，overall_suggestion 給予正面評語。`
};

// ── State ──

let currentMode = 'zh2en';

// ── DOM references ──

const inputText  = document.getElementById('input-text');
const btnSubmit  = document.getElementById('btn-submit');
const btnClear   = document.getElementById('btn-clear');
const resultSection = document.getElementById('result-section');
const resultArea = document.getElementById('result-area');
const apiKeyInput  = document.getElementById('api-key-input');
const btnSaveKey   = document.getElementById('btn-save-key');
const keyStatus    = document.getElementById('key-status');

// ── Auth ──

const PASSWORD = 'englishchecker0827';

function initAuth() {
  const overlay   = document.getElementById('auth-overlay');
  const authInput = document.getElementById('auth-input');
  const authBtn   = document.getElementById('auth-btn');
  const authError = document.getElementById('auth-error');

  if (sessionStorage.getItem('ec_auth') === '1') {
    overlay.classList.add('hidden');
    return;
  }

  function attempt() {
    if (authInput.value === PASSWORD) {
      sessionStorage.setItem('ec_auth', '1');
      overlay.classList.add('hidden');
    } else {
      authError.hidden = false;
      authInput.value = '';
      authInput.focus();
    }
  }

  authBtn.addEventListener('click', attempt);
  authInput.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
}

// ── Init ──

function init() {
  initAuth();

  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) {
    apiKeyInput.value = savedKey;
    keyStatus.textContent = '已儲存';
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      clearResults();
    });
  });

  btnClear.addEventListener('click', () => {
    inputText.value = '';
    clearResults();
  });

  btnSubmit.addEventListener('click', handleSubmit);

  btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    localStorage.setItem(STORAGE_KEY, key);
    keyStatus.textContent = '已儲存';
    setTimeout(() => { keyStatus.textContent = ''; }, 2000);
  });
}

function clearResults() {
  resultSection.hidden = true;
  resultArea.innerHTML = '';
}

// ── API Call ──

async function callGeminiAPI(systemPrompt, userText) {
  const apiKey = localStorage.getItem(STORAGE_KEY);
  if (!apiKey) throw new Error('尚未設定 API Key，請在頁面下方輸入 Gemini API Key 並儲存。');

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { maxOutputTokens: 4096 }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = err?.error?.code || response.status;
    const msg  = err?.error?.message || '未知錯誤';
    const status = err?.error?.status || '';
    throw new Error(`API 錯誤 ${code}（${status}）：${msg}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('API 回傳格式異常，請稍後再試。');
  return text;
}

// ── Submit ──

async function handleSubmit() {
  const text = inputText.value.trim();
  if (!text) {
    inputText.focus();
    return;
  }

  btnSubmit.disabled = true;
  resultSection.hidden = false;
  resultArea.innerHTML = renderLoading();

  try {
    const systemPrompt = SYSTEM_PROMPTS[currentMode];
    const result = await callGeminiAPI(systemPrompt, text);

    if (currentMode === 'proofread') {
      const json = parseProofreadJSON(result);
      resultArea.innerHTML = renderProofreadResult(text, json);
      attachSuggestionsToggle();
    } else {
      resultArea.innerHTML = renderTranslationResult(result);
    }
    attachCopyButtons();
  } catch (err) {
    resultArea.innerHTML = renderError(err.message);
  } finally {
    btnSubmit.disabled = false;
  }
}

// ── JSON Parsing ──

function parseProofreadJSON(raw) {
  // Strip possible markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('校對結果解析失敗，請再試一次。');
  }
}

// ── Render: Translation ──

function renderTranslationResult(text) {
  return `
    <div class="result-header">
      <span class="result-title">翻譯結果</span>
      <button class="btn-copy" data-copy="${escHtml(text)}">複製結果</button>
    </div>
    <div class="result-text">${escHtml(text)}</div>
  `;
}

// ── Render: Proofread ──

function renderProofreadResult(originalText, json) {
  const corrected = json.corrected_text || '';
  const corrections = Array.isArray(json.corrections) ? json.corrections : [];
  const overall = json.overall_suggestion || '';

  return `
    <div class="corrected-block">
      <div class="block-title">
        <span>✅ 修正後版本</span>
        <button class="btn-copy" data-copy="${escHtml(corrected)}">複製結果</button>
      </div>
      <div class="result-text">${escHtml(corrected)}</div>
    </div>

    <div class="comparison-block">
      <div class="block-title">📋 原文 vs 修改後對照</div>
      <table class="comparison-table">
        <thead>
          <tr>
            <th>原文</th>
            <th>修改後版本</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escHtml(originalText)}</td>
            <td>${escHtml(corrected)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <button class="suggestions-toggle" id="suggestions-toggle">
      <span>▾ 查看修改說明</span>
      <span class="toggle-arrow">▼</span>
    </button>
    <div class="suggestions-body" id="suggestions-body">
      ${corrections.length === 0
        ? '<p class="no-corrections">未發現需要修改的問題。</p>'
        : corrections.map(c => `
          <div class="correction-item">
            <div class="correction-meta">
              <span class="correction-type">${escHtml(c.type || '')}</span>
              <span class="correction-diff">
                <span class="orig">${escHtml(c.original || '')}</span>
                <span class="arrow">→</span>
                <span class="fixed">${escHtml(c.corrected || '')}</span>
              </span>
            </div>
            <div class="correction-explanation">${escHtml(c.explanation || '')}</div>
          </div>
        `).join('')}
      ${overall ? `
        <div class="overall-suggestion">
          <strong>💬 整體建議</strong>
          ${escHtml(overall)}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Render: Loading / Error ──

function renderLoading() {
  return `
    <div class="loading-indicator">
      <div class="spinner"></div>
      <span>處理中，請稍候...</span>
    </div>
  `;
}

function renderError(message) {
  return `<div class="error-message">⚠️ ${escHtml(message)}</div>`;
}

// ── Event Attachments ──

function attachCopyButtons() {
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = '已複製！';
        setTimeout(() => { btn.textContent = original; }, 1500);
      });
    });
  });
}

function attachSuggestionsToggle() {
  const toggle = document.getElementById('suggestions-toggle');
  const body   = document.getElementById('suggestions-body');
  if (!toggle || !body) return;

  toggle.addEventListener('click', () => {
    const isOpen = body.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.querySelector('span:first-child').textContent = isOpen ? '▴ 收合修改說明' : '▾ 查看修改說明';
  });
}

// ── Utility ──

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Start ──

init();
