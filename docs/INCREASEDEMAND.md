# 新增需求名稱
## 範本
狀態:
新增需求日期:
預期功能:
預期調整項目:
規劃調整內容:
實際測試:
實際調整項目:
完成日期:

---

# 優化標籤功能
狀態: 待規劃
新增需求日期: 2026-05-18
預期功能:
1. 新增部門：標籤需綁定多個部門，供跨部門使用（使用陣列，建立時順便寫入）。
2. 自訂排序：於部門文件狀態下，支援主管自訂標籤排序。
3. 熱度排序：於公開文件狀態下，根據點擊次數進行排序（點擊次數越多排越前）。
4. 公開標籤：支援設定標籤是否於公開文件中顯示並可被點擊。
5. 前端設定：於前端「設定」頁面新增標籤管理 Tab，提供主管建立標籤、設定相關部門、自訂排序及是否公開等功能。
預期調整項目:
- 資料庫 `tags` Table 新增欄位：
  - `departments` (JSON): 紀錄綁定的部門陣列。
  - `custom_order` (INT): 紀錄自訂排序。
  - `click_count` (INT): 紀錄公開文件中的點擊次數。
  - `is_public` (BIT): 標示是否為公開標籤。
- 後端 API：
  - 更新標籤相關 CRUD API，支援寫入及更新上述新增欄位。
  - 新增 API 處理公開標籤點擊次數累加功能。
- 前端調整：
  - `SettingsView.vue` 新增「標籤管理」Tab（僅 MANAGER 可見）。
  - 實作標籤的建立、編輯介面（含部門選擇、自訂排序輸入、是否公開切換）。
  - 標籤顯示邏輯調整：部門文件依 `custom_order` 排序，公開文件依 `click_count` 排序。
規劃調整內容:
1. **DB Schema**:
   修改 `tags` Table，擴充 `departments` (NVARCHAR(MAX))、`custom_order` (INT, default 0)、`click_count` (INT, default 0)、`is_public` (BIT, default 0) 等欄位。
2. **Backend**:
   - 更新 Model `Tag.js`。
   - 更新 Controller `tagController.js` 支援新增欄位的 CRUD，並加入 `incrementClickCount` 功能。
   - 更新 Route `tags.js` 的路由驗證。
3. **Frontend**:
   - `api.js` 擴充標籤 API 的串接。
   - 更新 `SettingsView.vue` 以支援「標籤管理」Tab 介面。
   - 更新既有顯示標籤的元件，依照部門狀態或公開狀態呈現不同的排序方式。
實際測試:
實際調整項目:
完成日期:

---

# 跨部門管理權限
狀態: ✅ 完成
新增需求日期: 2026-05-18
預期功能:
因為主管或同仁有跨部門管理需求，需要手動新增管理部門。原本前端前三碼篩選機制也要保留，並增加資料庫 Table 專門手動建立。預計在「個人設定」裡面手動加入，並且只有主管角色（MANAGER）能建立。
預期調整項目:
- 資料庫新增 Table `user_extra_departments` 紀錄跨部門權限。
- 後端新增 `/api/v1/cross-departments` 相關 API (取得、新增、刪除)。
- 前端 `SettingsView.vue` 新增「跨部門管理」設定分頁 (僅主管可見)。
- 前端 `TheHeader.vue` 下拉選單在既有的「前三碼篩選」基礎上，聯集顯示自訂新增的部門。
規劃調整內容:
1. **DB Schema**:
   新增 `user_extra_departments` (id, account, org_oid, dept_code, dept_name, created_by, created_at)。
   由 Sequelize `sync` 自動建立（`alter: false`，首次同步建表）。
2. **Backend**:
   - Model `UserExtraDepartment.js`。
   - Controller `crossDepartmentController.js` 提供查、增、刪功能。
   - Route `crossDepartments.js`，所有路由需 `authMiddleware + requireRole('MANAGER')`。
   - 刪除只允許 `created_by = req.user.員工工號`，防止跨人刪除。
   - 掛載至 `backend/src/index.js`，路徑 `/api/v1/cross-departments`。
3. **Frontend**:
   - `api.js` 新增 `crossDeptService`（getByAccount、getAll、create、remove）。
   - `SettingsView.vue` 新增「跨部門管理」Tab（僅 MANAGER 可見）：
     - 下拉選擇公司全部同仁（`account`），選擇目標公司與部門，新增授權。
     - 表格列出自己建立的授權紀錄，可刪除。
   - `TheHeader.vue` 在 `onMounted` 時額外呼叫 `crossDeptService.getAll()`，
     取得當前使用者（`account = 自己`）的跨部門清單，與前三碼篩選結果聯集後顯示。
規格確認（2026-05-18）:
- API 路徑統一用 `/api/v1/cross-departments`。
- MANAGER 授權對象為公司全部同仁，全部角色的同仁都可以被授權。
- ADMIN 暫不開放此功能（無對應 Table 欄位），僅 MANAGER 可操作。
- 刪除只能刪自己建立的紀錄（`created_by = 自己工號`）。
- 建表方式：Sequelize sync（自動建立）。
實際調整項目:
**後端**
- `backend/src/models/UserExtraDepartment.js`（新增）：Table `user_extra_departments`，無 FK 約束，`timestamps: false`。
- `backend/src/models/index.js`：註冊 `UserExtraDepartment`，export 給 controller 使用。
- `backend/src/index.js`：加入 `UserExtraDepartment.sync({ force: false })` 自動建表；掛載 `/api/v1/cross-departments` 路由。
- `backend/src/controllers/crossDepartmentController.js`（新增）：`getMyGrants`（全角色）、`getCreated`（MANAGER）、`create`（含重複檢查）、`remove`（僅 created_by 可刪）。
- `backend/src/routes/crossDepartments.js`（新增）：`GET /my-grants` 僅 authMiddleware；其他端點加 `requireRole('MANAGER')`。
- `backend/src/helpers/accessHelper.js`：`canAccess` 新增第三參數 `extraDeptCodes`，部門判斷加入「前三碼 prefix」與「跨部門授權」兩層；人員比對改為 type-safe `String()` 比較。
- `backend/src/controllers/articleController.js`：新增 `getUserExtraDeptCodes` helper；`getAllArticles`、`getArticleById`、`searchArticles` 均傳入 `extraDeptCodes` 給 `canAccess`。
- `backend/src/controllers/attachmentController.js`：同上，`getAllAttachments`、`getAttachmentById` 加入 `extraDeptCodes`。

**前端**
- `frontend/src/services/api.js`：新增 `crossDeptService`（`getMyGrants`、`getCreated`、`create`、`remove`）。
- `frontend/src/views/SettingsView.vue`：
  - 新增「跨部門管理」Tab（v-if `role === MANAGER`）。
  - 目標部門下拉選項顯示「部門名稱（部門代碼）」，支援中文名稱與代碼雙向搜尋。
  - 已建立授權紀錄表格「被授權同仁」欄顯示姓名＋工號。
  - Tab 首次切換時 lazy-load 資料。
- `frontend/src/components/layout/TheHeader.vue`：`onMounted` 及 `onCompanyChange` 時呼叫 `crossDeptService.getMyGrants()`，聯集前三碼篩選部門與跨部門授權部門，去除重複後顯示。
- `frontend/src/views/ArticleView.vue`：
  - `onMounted` 取得 `myGrantedDepts`（跨部門授權清單）。
  - 完整重寫存取判斷邏輯：`is_public=true` 全員通過；非公開時「指定人員」優先，無指定人員則依前三碼＋跨部門授權；以上 AND 職級門檻；不符合則 `router.push('/') + ElMessage.warning`。
  - 修正 Bug B：`form.hasAccess.部門` 預設值不再 fallback 至登入者部門代碼，避免儲存時汙染 `access_dept`。
  - 移除 `accessDenied` ref 與 Banner 樣板，改為直接跳首頁。
- `frontend/src/components/directory/DirectoryTree.vue`：
  - `onMounted` 取得 `myGrantedDepts`。
  - `checkItemAccess` 重寫為與 `ArticleView.vue` 一致的邏輯：指定人員優先 → 前三碼＋跨部門 → AND 職級，結果為 `primaryAccess && passLevel`。
實際測試:
完成日期: 2026-05-18
