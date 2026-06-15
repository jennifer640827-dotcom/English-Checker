# English Checker — 商務英文助理

## Context

使用者需要一個本機使用的商務英文輔助工具，支援三種模式：
1. **中→英翻譯**：將中文商務信件翻譯成英文
2. **英→中翻譯**：將英文商務信件翻譯成繁體中文
3. **英文校對**：校對英文，提供修正版本與逐條說明

工具供個人本機使用，不需要後端伺服器。核心翻譯/校對引擎使用 Google Gemini API（免費方案）。

## 設計決定

| 項目 | 決定 |
|------|------|
| 部署方式 | 本機網頁（VS Code Live Server 或 Python http.server） |
| AI 服務 | Google Gemini API（gemini-2.0-flash，免費方案） |
| 前端技術 | 純 HTML + CSS + JavaScript（無框架、無 npm） |
| 介面語言 | 繁體中文 |
| 介面風格 | 淡色背景、簡約、專業 |
| 校對呈現 | 修正後版本（主區域）+ 原文vs修改後對照表 + 折疊式建議區（點擊展開） |

---

## 檔案結構

```
d:\English Checker\
├── index.html      ← 頁面結構與 API Key 設定區
├── styles.css      ← 介面樣式
├── app.js          ← 邏輯、模式切換、Gemini API 呼叫
└── SPEC.md         ← 本設計文件
```

---

## 介面設計

### 整體版面（淡色專業風）

```
┌──────────────────────────────────────┐
│  English Checker   商務英文助理       │
│  ─────────────────────────────────── │
│  [ 中 → 英 ]  [ 英 → 中 ]  [ 英文校對 ]│  ← 模式切換按鈕（active 有底線/色塊）
├──────────────────────────────────────┤
│  輸入文字                             │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │  （貼入商務信件內容...）         │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                       [清除] [執行]  │
├──────────────────────────────────────┤
│  結果區域                             │
│  （依模式動態改變）                   │
└──────────────────────────────────────┘
```

### 翻譯模式結果區（中→英 / 英→中）

```
┌────────────────────────────────────┐
│  翻譯結果                           │
│  ─────────────────────────────     │
│  （翻譯後文字，可全選複製）          │
│                                    │
│                      [複製結果]    │
└────────────────────────────────────┘
```

### 英文校對模式結果區

```
┌──────────────────────────────────────────────────┐
│  ✅ 修正後版本                                    │
│  ───────────────────────────────────────         │
│  （修正後的完整英文文字）           [複製結果]   │
│                                                  │
│  📋 原文 vs 修改後對照                           │
│  ───────────────────────────────────────         │
│  ┌────────────────────┬────────────────────────┐ │
│  │ 原文               │ 修改後版本              │ │
│  ├────────────────────┼────────────────────────┤ │
│  │ （使用者輸入的     │ （AI 修正後的           │ │
│  │   原始英文）       │   完整英文）            │ │
│  └────────────────────┴────────────────────────┘ │
│                                                  │
│  ▶ 查看修改說明（點擊展開）                      │← 折疊式
│  ───────────────────────────────────────         │
│  📌 文法  "I has" → "I have"     （展開後）      │
│     主詞 I 搭配動詞應用 have                      │
│                                                  │
│  📌 拼字  "writen" → "written"                   │
│     過去分詞拼法錯誤                              │
│                                                  │
│  💬 整體建議：語氣正式，適合商務                 │
└──────────────────────────────────────────────────┘
```

---

## API 整合設計

### Google Gemini API 呼叫方式

```javascript
// 直接從瀏覽器呼叫 Gemini API（API key 帶在 URL 中，不需特殊標頭）
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        { role: 'user', parts: [{ text: userText }] }
      ],
      generationConfig: { maxOutputTokens: 4096 }
    })
  }
);
const data = await response.json();
const result = data.candidates[0].content.parts[0].text;
```

> **注意**：API Key 由 [Google AI Studio](https://aistudio.google.com/) 免費申請，直接帶在 URL 參數中，不需任何特殊 CORS 標頭，可直接從瀏覽器呼叫。

### 三種模式 Prompt 設計

#### 中→英（System Prompt）
```
你是一位專業的商務英文翻譯專家。
請將以下中文翻譯成正式、流暢的商務英文。
注意：
- 保持原文語氣與禮貌程度
- 使用標準商務用語
- 避免過於口語化的表達
只輸出翻譯結果，不加任何說明。
```

#### 英→中（System Prompt）
```
你是一位專業的商務翻譯專家。
請將以下英文翻譯成正式、流暢的繁體中文。
注意：
- 保持原文語氣與禮貌程度
- 使用台灣繁體中文用語（非中國大陸用語）
- 保留專業術語的適當譯法
只輸出翻譯結果，不加任何說明。
```

#### 英文校對（System Prompt，要求回傳 JSON）
```
你是一位專業的商務英文校對專家。
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

若文章無任何問題，corrections 陣列回傳空陣列，overall_suggestion 給予正面評語。
```

---

## 啟動方式

### 本機（VS Code Live Server）
1. 安裝 VS Code 的 **Live Server** 插件
2. 在 `d:\English Checker\` 資料夾中右鍵 → "Open with Live Server"
3. 瀏覽器自動開啟 `http://127.0.0.1:5500/index.html`
4. 首次使用在設定區貼入你的 Google AI Studio API Key

### 本機（Python）
```bash
cd "d:\English Checker"
python -m http.server 8080
```
然後開啟 `http://localhost:8080`

### GitHub Pages（推薦，任何裝置可用）
部署至 GitHub Pages 後，任何裝置只需開啟網址即可使用，不需安裝任何工具。API Key 存在使用者自己的瀏覽器 localStorage，不會上傳至 GitHub。

---

## 費用說明

- 使用 `gemini-2.0-flash`（Google AI Studio 免費方案）
- 免費額度：每分鐘 15 次請求、每日 1,500 次請求
- 個人日常使用完全免費，無需綁定信用卡
- API Key 在 Google AI Studio（aistudio.google.com）免費申請
