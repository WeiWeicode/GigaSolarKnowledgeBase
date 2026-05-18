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

# 跨部門管理權限
狀態: 實作中
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
實際測試:
實際調整項目:
完成日期:
