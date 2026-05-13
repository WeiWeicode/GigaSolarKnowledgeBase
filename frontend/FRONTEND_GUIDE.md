# GigaSolar 知識庫 — Frontend 導覽文件

> 給 AI 與開發者快速掌握此前端專案的結構、元件功能與資料流。

---

## 技術棧

| 項目 | 版本 / 說明 |
|------|------------|
| 框架 | Vue 3 (Composition API `<script setup>`) |
| 建置工具 | Vite + TypeScript（入口為 `main.ts`，實際邏輯為 `main.js`） |
| 路由 | Vue Router 4（`src/router/index.js`） |
| 狀態管理 | Pinia（`src/store/`） |
| UI 元件庫 | Element Plus |
| Markdown 編輯器 | Vditor（IR 模式，支援圖片上傳） |
| HTTP | Axios（`src/services/api.js`），目前為 Mock 模式 |
| 部署 | Docker + Nginx（`Dockerfile`、`nginx.conf`、`docker-compose.yml`） |

---

## 目錄結構總覽

```
frontend/
├── src/
│   ├── App.vue              # 根元件，只有 <router-view />
│   ├── main.ts              # 入口（目前仍為 Vite 預設 demo，實際邏輯在 main.js）
│   ├── main.js              # 真正的 Vue app 入口：createApp + Pinia + Router
│   ├── style.css            # 全域樣式（CSS 變數定義）
│   ├── router/
│   │   └── index.js         # 路由設定 + Navigation Guard
│   ├── store/
│   │   ├── auth.js          # 使用者登入狀態
│   │   ├── directory.js     # 目錄樹狀態
│   │   └── notification.js  # 通知狀態
│   ├── services/
│   │   ├── api.js           # 所有 API 呼叫（含 Mock 實作）
│   │   └── mockData.js      # Mock 資料來源
│   ├── utils/
│   │   └── dateFormat.js    # timeAgo / formatDateTime / formatFileSize
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.vue      # 主版面（Header + NavSidebar + TreeSidebar + Main）
│   │   │   ├── TheHeader.vue      # 頂部導覽列
│   │   │   └── TheSidebar.vue     # 左側功能導覽列
│   │   ├── directory/
│   │   │   └── DirectoryTree.vue  # 目錄樹元件
│   │   └── panels/
│   │       ├── AiChatPanel.vue         # AI 助手側板
│   │       ├── CommentPanel.vue        # 評論側板
│   │       └── VersionHistoryPanel.vue # 版本歷史側板
│   └── views/
│       ├── LoginView.vue       # 登入頁
│       ├── HomeView.vue        # 首頁（搜尋 + 通知）
│       ├── ArticleView.vue     # 文章查看 / 編輯 / 新增
│       ├── AttachmentView.vue  # 附件查看 / 編輯 / 新增
│       ├── SettingsView.vue    # 個人設定
│       └── AdminView.vue       # 管理員後台
├── index.html
├── vite.config.js
├── tsconfig.json
├── package.json
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

---

## 路由設計（`src/router/index.js`）

| 路徑 | 元件 | 說明 |
|------|------|------|
| `/login` | `LoginView` | 不需驗證 |
| `/home` | `HomeView` | 預設首頁 |
| `/article/new` | `ArticleView` | mode='create' |
| `/article/:id` | `ArticleView` | mode='view' |
| `/article/:id/edit` | `ArticleView` | mode='edit' |
| `/attachment/new` | `AttachmentView` | mode='create' |
| `/attachment/:id` | `AttachmentView` | mode='view' |
| `/attachment/:id/edit` | `AttachmentView` | mode='edit' |
| `/settings` | `SettingsView` | 個人設定 |
| `/admin` | `AdminView` | 需 `requiresAdmin: true` |

**Navigation Guard 邏輯：**
1. 路由不需驗證（`requiresAuth: false`）→ 直接放行
2. 沒有 token → 導向 `/login`
3. 有 token 但 user 為空 → 呼叫 `auth.fetchCurrentUser()`，失敗則導向 `/login`
4. 需要 Admin 但非 Admin → 導向 `/home`

---

## Pinia Store

### `store/auth.js`
- **state**：`user`（使用者物件）、`token`（sessionStorage `kb_token`）
- **computed**：`isLoggedIn`、`role`（ADMIN / MANAGER / MEMBER / GUEST）、`isAdmin`、`isManager`
- **actions**：`login(employeeId, password)`、`fetchCurrentUser()`、`logout()`

### `store/directory.js`
- **state**：`tree`（完整目錄樹）、`loading`、`searchHighlightIds`、`viewScope`（'public' | 'dept'）、`currentCompany`、`currentDept`
- **computed**：`filteredTree`（依 viewScope 過濾）
- **actions**：`fetchTree(組織OID, 部門代碼)`、`setSearchHighlight(ids)`
- 目錄樹節點 type 共有：`company`、`department`、`directory`、`article`、`attachment`、`trash`

### `store/notification.js`
- **state**：`notifications`（所有通知）
- **computed**：`myNotifications`（過濾 `targetUserId === 我`）、`unread`、`read`
- **actions**：`fetchAll()`、`markAsRead(id)`（用 `splice` 觸發 Vue 響應）

---

## 元件說明

### Layout 層

#### `AppLayout.vue`
整個應用的版面骨架，包含：
- `TheHeader`（頂部）
- `TheSidebar`（左側功能導覽）
- `DirectoryTree`（左側目錄樹）
- `<router-view>`（主內容區）

`onMounted` 時呼叫 `dirStore.fetchTree(auth.user.組織OID, auth.user.部門代碼)`。

#### `TheHeader.vue`
- 顯示品牌名、公司/部門選擇器（切換後重新 fetchTree）
- 通知 Bell icon（hover 出現 Popover，顯示前 5 則未讀）
- 使用者姓名、角色 Tag、登出按鈕

#### `TheSidebar.vue`
- 顯示「公開文件 / 部門文件」範圍切換選擇器
- 導覽項目：首頁、建立文章、上傳文件（公開範圍時只顯示首頁）
- 底部固定：設定、管理員設定（限 Admin）

---

### Directory 層

#### `DirectoryTree.vue`
- 使用 Element Plus `<el-tree>` 渲染 `dirStore.filteredTree`
- 支援**拖曳排序**：只有 `directory` 節點可拖，只能拖入 `directory` / `department` 內或 directory 前後
- 點擊 article / attachment 節點 → 路由跳轉（含存取權限檢查）
- Manager 以上可看「⋯」下拉選單：新增子目錄、重新命名、移除目錄
- 上方按鈕：重新整理、新增最上層目錄（Manager 限定）
- `highlightedIds` 由 searchHighlightIds 驅動，highlight 搜尋結果節點

---

### Panels 層（右側滑出側板）

#### `AiChatPanel.vue`
- v-model 控制顯示/隱藏，從右側滑入
- 三種模式：**AI 問答**（搜尋知識庫回答）、**產生文章**（依提示詞生成）、**校正文章**（傳入目前文章內容）
- 支援 `contextContent` prop 作為文章上下文
- Streaming 效果（Mock：每 18ms 輸出一個字元）
- 回應使用 Vditor `md2html` 渲染 Markdown
- emit `apply` 事件，可將 AI 產生的內容套用至編輯器

#### `CommentPanel.vue`
- 顯示特定文章的留言列表
- 支援 **@mention 自動補全**（輸入 `@` 後彈出同部門同仁選單）
- 留言中的 `@姓名` 自動高亮顯示
- 被 `@tag 到自己` 的留言顯示「已查看」按鈕，標記後同步更新 notificationStore
- 使用 `splice` 替換 item 確保 Vue 偵測巢狀屬性變更

#### `VersionHistoryPanel.vue`
- 顯示文章版本列表（版本號、編輯者、時間、修改說明）
- 點擊「預覽」emit `preview(articleId, versionNumber)` 事件，由父層導向 `/article/:id?version=N`

---

### Views 層

#### `LoginView.vue`
- 員工工號 + 密碼登入（對接 BPM 帳號，系統不自行管理密碼）
- 預填 demo 帳號：`GV112001` / `demo`
- 登入成功後跳轉 `/home`

#### `HomeView.vue`
- **搜尋區**：關鍵字搜尋 + 標籤篩選（debounce 300ms），呼叫 `articleService.search`
- **AI 模式**按鈕 → 打開 `AiChatPanel`
- **通知區**：左欄「未讀通知」、右欄「已讀通知（近 30 天）」
  - 未讀卡片有「已查看」按鈕
  - 點擊卡片跳轉至對應文章

#### `ArticleView.vue`
最複雜的 View，功能：
- **三種 mode**：`view`（查看）、`edit`（編輯）、`create`（新建）
- 使用 **Vditor** IR 模式作為 Markdown 編輯器，支援圖片上傳
- 切換 view↔edit 時 init/destroy Vditor，`renderPreview` 用 `Vditor.preview` 渲染
- **版本歷史預覽**：讀取 `?version=N` query，載入對應快照內容（唯讀）
- **表單欄位**：
  - 分類資訊：所屬目錄（Tree Picker）、關聯附件（Table Picker）、標籤
  - 權限設定：是否公開、編輯者（Checkbox Picker）、存取人員、職級門檻（10/8/6/4）
  - 其他：文件上架/下架（下架自動移至垃圾桶目錄）、修改說明（textarea）
- 存取權限：依 `hasAccess.部門 / 人員 / 職級` 三層判斷，不合格顯示 access-denied 頁
- **canEdit** 邏輯：Admin/Manager 皆可；一般人員需在 `editorIds` 內或為建立者
- 右側面板：評論（CommentPanel）、版本歷史（VersionHistoryPanel）、AI 助手（AiChatPanel）
- 每 60 秒自動暫存草稿到 sessionStorage

#### `AttachmentView.vue`
與 ArticleView 結構相同，差異：
- 附件本體為檔案列表（支援多檔上傳，drag & drop）
- 有「附件說明」textarea（顯示在獨立 kb-card）
- 關聯對象為**文章**（反向於 ArticleView 關聯附件）
- 無 Vditor，無 AI 助手面板

#### `SettingsView.vue`
分三個 tab：
- **個人資訊**：來源 BPM，唯讀顯示（姓名、工號、職稱、級職、部門、Email、主管、角色）
- **通知設定**：@提及通知開關
- **預設顯示**：預設公司/部門（唯讀，由 BPM 決定）

#### `AdminView.vue`
分七個左側 tab（限 Admin）：
- **公司管理**：顯示集團公司清單
- **使用者管理**：角色升降級（GUEST→MEMBER→MANAGER→ADMIN）
- **垃圾桶管理**：已下架內容，可永久刪除
- **標籤管理**：全域標籤，可新增/刪除
- **系統日誌**：操作紀錄 Timeline
- **AI 設定**：Ollama Endpoint、模型、System Prompt
- **檔案儲存**：Docker Volume 使用量顯示

---

## Services（`src/services/api.js`）

目前全部為 **Mock 模式**，不實際打後端 API（使用 delay 模擬延遲）。

| Service | 主要方法 |
|---------|---------|
| `authService` | `login` / `logout` / `getCurrentUser` |
| `directoryService` | `getTree` / `createNode` / `moveNode` / `renameNode` |
| `articleService` | `getById` / `create` / `update` / `search` / `getAll` |
| `attachmentService` | `getAll` / `getById` / `create` / `update` / `uploadFiles` |
| `notificationService` | `getAll` / `markAsRead` |
| `commentService` | `getByArticleId` / `create` / `markAsRead` |
| `versionService` | `getByArticleId` / `rollback` |
| `tagService` | `getAll` / `create` |
| `colleagueService` | `getAll` |
| `metaService` | `getCompanies` / `getDepartments` |

**目錄樹操作**：
- `createNode`：新目錄插入到父節點「垃圾桶之前」，並重算 `sortOrder`
- `moveNode`：真正從 mockDirectoryTree 中取出節點再插入目標位置，支援 `inner` / `before` / `after`

---

## 工具函式（`src/utils/dateFormat.js`）

| 函式 | 說明 |
|------|------|
| `timeAgo(dateStr)` | 相對時間（剛剛 / N 分鐘前 / N 小時前 / N 天前） |
| `formatDateTime(dateStr)` | 格式化為 `YYYY-MM-DD HH:mm` |
| `formatFileSize(bytes)` | 自動轉換 B / KB / MB |

---

## 存取權限設計

文章與附件都有 `hasAccess` 物件：
```json
{
  "部門": "部門代碼",
  "人員": ["員工工號A", "員工工號B"],
  "職級": 10
}
```
**判斷邏輯**（三項全過才可存取）：
1. `isPublic === true` OR `hasAccess.部門 === 使用者部門代碼`
2. `isPublic === true` OR `hasAccess.人員` 為空 OR 使用者在人員清單內
3. `hasAccess.職級` 為空 OR `使用者.級職 <= 職級門檻`

職級門檻選項：
- 10 = 一般人員（全員可見）
- 8 = 課級以上
- 6 = 理級以上
- 4 = 處級以上

**Admin 永遠略過所有存取檢查。**

---

## 版面 CSS 變數

定義於 `src/style.css`（部分名稱供 AI 參考）：

| 變數 | 用途 |
|------|------|
| `--header-height` | 頂部 Header 高度 |
| `--sidebar-nav-width` | 左側功能導覽寬度 |
| `--sidebar-tree-width` | 目錄樹側欄寬度 |
| `--main-content-padding` | 主內容區 padding |
| `--color-primary` | 主色（藍紫） |
| `--color-surface` / `--color-surface-2` | 卡片背景 |
| `--color-border` | 邊框色 |
| `--color-text-primary` / `secondary` / `muted` | 文字層級 |
| `--border-radius` / `--border-radius-sm` / `--border-radius-lg` | 圓角 |
| `--shadow` / `--shadow-lg` | 陰影 |
| `--transition` | 過場速度 |
| `--color-unread-bg` / `--color-unread-accent` | 未讀通知卡顏色 |
| `--color-read-bg` / `--color-read-accent` | 已讀通知卡顏色 |
| `--header-bg` / `--sidebar-nav-bg` / `--sidebar-tree-bg` | 各區域背景 |

---

## 已知 TODO / 注意事項

1. `main.ts` 目前仍為 Vite 預設 demo 頁（`setupCounter`），真正的 Vue app 啟動應在 `main.js`，請確認 `index.html` 的 script src 指向正確。
2. `services/api.js` 全為 Mock，串接真實後端時需將每個 service 方法改為 `http.get / post / put / delete`。
3. `AiChatPanel` 的 streaming 為前端 Mock 模擬，真實串接需對接後端 SSE 或 Ollama streaming API。
4. `AdminView` 中部分資料（使用者角色、系統日誌、儲存量）為 hardcode，需串接後端。
5. `counter.ts` 為 Vite 預設範本殘留，可刪除。
