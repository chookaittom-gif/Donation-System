/**
 * ระบบบริจาค (Donation System)
 * Backend - Google Apps Script
 * V8 Runtime Compatible
 * 
 * @author System
 * @version 1.0.0
 */

// ===== CONFIGURATION =====
const CONFIG = {
  SHEETS: {
    SETTINGS: 'Settings',
    DONATIONS: 'Donations',
    BANK_ACCOUNTS: 'BankAccounts',
    USERS: 'Users'
  },
  DEFAULT_SETTINGS: {
    ProjectName: 'โครงการบริจาค',
    ProjectDescription: 'รายละเอียดโครงการ',
    ProjectType: 'การศึกษา & เยาวชน',
    Tags: '#บริจาค',
    StartDate: '',
    EndDate: '',
    TargetAmount: '0',
    DriveFolderId: '',
    ProjectCoverUrl: '',
    SidebarTitle: 'Your Gift Matters',
    ContactPerson: '',
    ContactPhone: '',
    ContactEmail: '',
    ContactAttendanceType: 'Onsite',
    AdminPassword: '',
    CacheTTL: '5',
    AutoApproveEnabled: 'false',
    AutoApproveWithSlip: 'false',
    AutoApproveReturning: 'false',
    AutoApproveAll: 'false',
    AutoApproveAmount: '0',
    EventStatus: 'OPEN',
    AutoUpdateEventStatus: 'false'
  },
  DONATION_HEADERS: [
    'ID', 'Timestamp', 'DonorName', 'DonorPhone', 'Amount',
    'TransferDate', 'BankCode', 'SlipFileId', 'SlipUrl',
    'Status', 'ApprovedBy', 'ApprovedDate', 'Note',
    'Position', 'Organization', 'AttendanceType', 'BankName'
  ],
  BANK_HEADERS: [
    'ID', 'BankCode', 'BankName', 'AccountNumber', 'AccountName',
    'Branch', 'AccountType', 'IsActive', 'DisplayOrder',
    'PromptPayId', 'QRCodeType', 'QRCodeUrl'
  ],
  BANK_ICONS: {
    KBANK: { name: 'ธนาคารกสิกรไทย', color: '#138F2D' },
    SCB: { name: 'ธนาคารไทยพาณิชย์', color: '#4E2E7F' },
    BBL: { name: 'ธนาคารกรุงเทพ', color: '#1E4598' },
    KTB: { name: 'ธนาคารกรุงไทย', color: '#1BA5E0' },
    TMB: { name: 'ธนาคารทหารไทยธนชาต', color: '#1279BE' },
    TTB: { name: 'ธนาคารทหารไทยธนชาต', color: '#1279BE' },
    BAY: { name: 'ธนาคารกรุงศรีอยุธยา', color: '#FEC43B' },
    GSB: { name: 'ธนาคารออมสิน', color: '#EB198D' },
    BAAC: { name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', color: '#4BA648' },
    CIMBT: { name: 'ธนาคารซีไอเอ็มบี ไทย', color: '#C41230' },
    UOB: { name: 'ธนาคารยูโอบี', color: '#0033A0' },
    LHBANK: { name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', color: '#2E3092' },
    KKP: { name: 'ธนาคารเกียรตินาคินภัทร', color: '#005C8A' },
    PROMPTPAY: { name: 'พร้อมเพย์', color: '#1A4B9C' },
    OTHER: { name: 'อื่นๆ', color: '#666666' }
  },
  userHeaders: [
    'UserID', 'Username', 'DisplayName', 'Password', 'Role', 
    'IsActive', 'LastLogin', 'CreatedAt', 'UpdatedAt', 'Note'
  ]
};

// ===== CACHE CONFIGURATION =====
const CACHE_KEYS = {
  DASHBOARD: 'dashboard_data_v1'
};

/**
 * ดึงค่า Cache TTL จาก Settings (ค่าเริ่มต้น 5 นาที, ช่วง 1-30 นาที)
 */
function getCacheTTL() {
  try {
    // ใช้ SpreadsheetApp โดยตรงเพื่อหลีกเลี่ยงปัญหา circular dependency
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
    if (!sheet) return 300;
    
    const data = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'CacheTTL') {
        const minutes = parseInt(data[i][1]) || 5;
        return Math.max(1, Math.min(30, minutes)) * 60; // แปลงเป็นวินาที
      }
    }
    return 300; // ค่าเริ่มต้น 5 นาที
  } catch (error) {
    console.error('getCacheTTL error:', error);
    return 300;
  }
}

/**
 * ดึงข้อมูลจาก Cache
 */
function getCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('getCache error:', error);
    return null;
  }
}

/**
 * บันทึกข้อมูลลง Cache
 */
function setCache(key, data) {
  try {
    const cache = CacheService.getScriptCache();
    const ttl = getCacheTTL();
    const jsonData = JSON.stringify(data);
    // CacheService มี limit 100KB ต่อ key
    if (jsonData.length > 100000) {
      console.warn('Cache data too large, skipping cache');
      return;
    }
    cache.put(key, jsonData, ttl);
  } catch (error) {
    console.error('setCache error:', error);
  }
}

/**
 * ลบ Cache Dashboard (เรียกเมื่อข้อมูลเปลี่ยน)
 */
function clearDashboardCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(CACHE_KEYS.DASHBOARD);
  } catch (error) {
    console.error('clearDashboardCache error:', error);
  }
}

/**
 * ล้าง Cache ทั้งหมดของแอปพลิเคชัน
 */
function clearAppCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      'SETTINGS',
      'PUBLIC_PROJECT_INFO',
      'DASHBOARD_STATS',
      'DASHBOARD_DATA_ALL',
      'BANK_ACCOUNTS',
      'dashboard_data_v1'
    ]);
  } catch (error) {
    console.error('clearAppCache error:', error);
  }
}

// ===== CORE FUNCTIONS =====

/**
 * Entry point สำหรับ Web App
 */
function doGet(e) {
  initializeSheets();
  const htmlText = include('index');
  const styleContent = include('style');
  const scriptContent = include('script');
  
  const processedHtml = htmlText
    .replace('<link rel="stylesheet" href="/style.css">', styleContent)
    .replace('<script src="/script.js"></script>', scriptContent);
    
  return HtmlService.createHtmlOutput(processedHtml)
    .setTitle('ระบบบริจาคออนไลน์')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Endpoint สำหรับประมวลผล POST requests จาก Vercel (API Router)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'No data received'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const args = requestData.args || [];

    const allowedActions = [
      'getPublicProjectInfo',
      'getDashboardDataAll',
      'getSettings',
      'saveSettings',
      'getBankAccounts',
      'createBankAccount',
      'updateBankAccount',
      'deleteBankAccount',
      'getDonations',
      'approveDonation',
      'rejectDonation',
      'deleteDonation',
      'getUsers',
      'saveUser',
      'deleteUser',
      'submitDonation',
      'createDonation',
      'saveFileFromBase64',
      'loginUser',
      'getDashboardStats',
      'getChartData',
      'getRecentDonations',
      'getTopDonors',
      'getDonorsSummary',
      'generateDonationReport'
    ];

    if (!allowedActions.includes(action)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Action not allowed'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const result = globalThis[action](...args);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: result
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Include HTML files
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ดึง Active Spreadsheet
 */
function getSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss;
}

/**
 * ดึง Sheet ตามชื่อ
 */
function getSheet(sheetName) {
  const ss = getSheets();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeSheet(sheet, sheetName);
  }
  
  return sheet;
}

/**
 * Initialize sheet with headers
 */
function initializeSheet(sheet, sheetName) {
  switch (sheetName) {
    case CONFIG.SHEETS.SETTINGS:
      // Settings sheet uses key-value pairs
      Object.entries(CONFIG.DEFAULT_SETTINGS).forEach(([key, value], index) => {
        sheet.getRange(index + 1, 1).setValue(key);
        sheet.getRange(index + 1, 2).setValue(value);
      });
      break;
      
    case CONFIG.SHEETS.DONATIONS:
      sheet.getRange(1, 1, 1, CONFIG.DONATION_HEADERS.length)
        .setValues([CONFIG.DONATION_HEADERS])
        .setFontWeight('bold')
        .setBackground('#F5A623')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      break;
      
    case CONFIG.SHEETS.BANK_ACCOUNTS:
      sheet.getRange(1, 1, 1, CONFIG.BANK_HEADERS.length)
        .setValues([CONFIG.BANK_HEADERS])
        .setFontWeight('bold')
        .setBackground('#F5A623')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      break;

    case CONFIG.SHEETS.USERS:
      sheet.getRange(1, 1, 1, CONFIG.userHeaders.length)
        .setValues([CONFIG.userHeaders])
        .setFontWeight('bold')
        .setBackground('#F5A623')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      
      const now = new Date();
      const seedData = [
        ['U001', 'admin', 'ผู้ดูแลระบบ', 'admin123', 'admin', true, '', now, now, 'บัญชีแอดมินเริ่มต้น'],
        ['U002', 'staff', 'เจ้าหน้าที่', 'staff123', 'staff', true, '', now, now, 'บัญชีเจ้าหน้าที่เริ่มต้น']
      ];
      sheet.getRange(2, 1, seedData.length, seedData[0].length).setValues(seedData);
      break;
  }
}

/**
 * Initialize all sheets if not exists
 */
function initializeSheets() {
  Object.values(CONFIG.SHEETS).forEach(sheetName => {
    const sheet = getSheet(sheetName);
    
    // Auto-migration for Donation sheet headers
    if (sheetName === CONFIG.SHEETS.DONATIONS) {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const missingHeaders = CONFIG.DONATION_HEADERS.filter(h => !currentHeaders.includes(h));
        if (missingHeaders.length > 0) {
          // Append missing headers at the end
          const newHeaders = [...currentHeaders, ...missingHeaders];
          sheet.getRange(1, 1, 1, newHeaders.length)
            .setValues([newHeaders])
            .setFontWeight('bold')
            .setBackground('#F5A623')
            .setFontColor('#FFFFFF');
        }
      }
    }

    if (sheetName === CONFIG.SHEETS.USERS) {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const missingHeaders = CONFIG.userHeaders.filter(h => !currentHeaders.includes(h));
        if (missingHeaders.length > 0) {
          const newHeaders = [...currentHeaders, ...missingHeaders];
          sheet.getRange(1, 1, 1, newHeaders.length)
            .setValues([newHeaders])
            .setFontWeight('bold')
            .setBackground('#F5A623')
            .setFontColor('#FFFFFF');
        }
      }
    }
  });
}

/**
 * Generate UUID
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Format date to Thai format
 */
function formatThaiDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return d.toLocaleDateString('th-TH', options);
}

// ===== SETTINGS FUNCTIONS =====

/**
 * ดึงค่า Settings ทั้งหมด
 */
function getSettings() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.SETTINGS);
    const data = sheet.getDataRange().getValues();
    const settings = {};
    
    data.forEach(row => {
      if (row[0]) {
        let val = row[1];
        // Google Sheets auto-coerces date-like values to Date objects
        // Convert them back to ISO string to prevent JSON serialization errors
        if (val instanceof Date) {
          val = val ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
        } else {
          val = (val === null || val === undefined) ? '' : String(val);
        }
        settings[row[0]] = val;
      }
    });
    
    // Merge with defaults (defaults fill only missing keys)
    return { ...CONFIG.DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('getSettings error:', error);
    return CONFIG.DEFAULT_SETTINGS;
  }
}


/**
 * บันทึก Settings
 */
function saveSettings(data, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'settings.edit');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  try {
    const sheet = getSheet(CONFIG.SHEETS.SETTINGS);
    const values = sheet.getDataRange().getValues();

    const keyRowMap = {};
    values.forEach((row, index) => {
      if (row[0]) keyRowMap[String(row[0]).trim()] = index + 1;
    });

    Object.keys(data).forEach(key => {
      const row = keyRowMap[key];
      if (row) {
        sheet.getRange(row, 2).setValue(data[key]);
      } else {
        sheet.appendRow([key, data[key]]);
      }
    });

    clearAppCache();

    // Force write changes to the sheet immediately
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'บันทึกการตั้งค่าเรียบร้อย',
      settings: getSettings()
    };
  } catch (error) {
    console.error('saveSettings error:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * ดึง Drive Folder ID
 */
function getDriveFolderId() {
  const settings = getSettings();
  return settings.DriveFolderId || '';
}

// ===== BANK ACCOUNTS FUNCTIONS =====

/**
 * ดึงรายการบัญชีธนาคาร
 */
function getBankAccounts() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.BANK_ACCOUNTS);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    const headers = data[0];
    const accounts = data.slice(1).map(row => {
      const account = {};
      headers.forEach((header, index) => {
        account[header] = row[index];
      });
      // Add bank info
      const bankInfo = CONFIG.BANK_ICONS[account.BankCode] || CONFIG.BANK_ICONS.OTHER;
      account.BankDisplayName = bankInfo.name;
      account.BankColor = bankInfo.color;
      return account;
    }).filter(account => account.ID); // Filter out empty rows
    
    // Sort by DisplayOrder
    accounts.sort((a, b) => (a.DisplayOrder || 999) - (b.DisplayOrder || 999));
    
    return accounts;
  } catch (error) {
    console.error('getBankAccounts error:', error);
    return [];
  }
}

/**
 * ดึงเฉพาะบัญชีที่เปิดใช้งาน
 */
function getActiveBankAccounts() {
  const accounts = getBankAccounts();
  return accounts.filter(account => 
    account.IsActive === true || 
    account.IsActive === 'TRUE' || 
    account.IsActive === 'true'
  );
}

/**
 * เพิ่มบัญชีธนาคาร
 */
function createBankAccount(data, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'bank.edit');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  try {
    const sheet = getSheet(CONFIG.SHEETS.BANK_ACCOUNTS);
    const id = generateUUID();
    
    // Generate QR URL based on type
    const qrCodeType = data.QRCodeType || 'none';
    let qrCodeUrl = data.QRCodeUrl || '';
    
    // If auto mode and has PromptPayId, generate URL from promptpay.io
    if (qrCodeType === 'auto' && data.PromptPayId) {
      qrCodeUrl = `https://promptpay.io/${data.PromptPayId.replace(/-/g, '')}`;
    }
    
    const row = [
      id,
      data.BankCode || '',
      data.BankName || '',
      data.AccountNumber || '',
      data.AccountName || '',
      data.Branch || '',
      data.AccountType || 'savings',
      data.IsActive !== false,
      data.DisplayOrder || 999,
      data.PromptPayId || '',
      qrCodeType,
      qrCodeUrl
    ];
    
    sheet.appendRow(row);
    
    // Invalidate cache
    clearAppCache();
    
    return { success: true, message: 'เพิ่มบัญชีธนาคารเรียบร้อย', id: id };
  } catch (error) {
    console.error('createBankAccount error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * แก้ไขบัญชีธนาคาร
 */
function updateBankAccount(id, data, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'bank.edit');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  try {
    const sheet = getSheet(CONFIG.SHEETS.BANK_ACCOUNTS);
    const dataRange = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, message: 'ไม่พบบัญชีธนาคาร' };
    }
    
    // Generate QR URL based on type
    const qrCodeType = data.QRCodeType || 'none';
    let qrCodeUrl = data.QRCodeUrl || '';
    
    // If auto mode and has PromptPayId, generate URL from promptpay.io
    if (qrCodeType === 'auto' && data.PromptPayId) {
      qrCodeUrl = `https://promptpay.io/${data.PromptPayId.replace(/-/g, '')}`;
    }
    
    const row = [
      id,
      data.BankCode || '',
      data.BankName || '',
      data.AccountNumber || '',
      data.AccountName || '',
      data.Branch || '',
      data.AccountType || 'savings',
      data.IsActive !== false,
      data.DisplayOrder || 999,
      data.PromptPayId || '',
      qrCodeType,
      qrCodeUrl
    ];
    
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    
    // Invalidate cache
    clearAppCache();
    
    return { success: true, message: 'แก้ไขบัญชีธนาคารเรียบร้อย' };
  } catch (error) {
    console.error('updateBankAccount error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * ลบบัญชีธนาคาร
 */
function deleteBankAccount(id, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'bank.edit');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  try {
    const sheet = getSheet(CONFIG.SHEETS.BANK_ACCOUNTS);
    const dataRange = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, message: 'ไม่พบบัญชีธนาคาร' };
    }
    
    sheet.deleteRow(rowIndex);
    
    // Invalidate cache
    clearAppCache();
    
    return { success: true, message: 'ลบบัญชีธนาคารเรียบร้อย' };
  } catch (error) {
    console.error('deleteBankAccount error:', error);
    return { success: false, message: error.message };
  }
}

// ===== DONATIONS FUNCTIONS =====

/**
 * ตรวจสอบว่าควร Auto-approve รายการบริจาคหรือไม่
 * @param {Object} data - ข้อมูลการบริจาค
 * @returns {boolean} - true ถ้าควร auto-approve
 */
function shouldAutoApprove(data) {
  try {
    const settings = getSettings();
    
    // Helper function to check boolean-like values
    const isTruthy = (val) => val === true || val === 'true' || val === 'on' || val === '1';
    
    // ถ้าไม่เปิด Auto-approve → return false
    if (!isTruthy(settings.AutoApproveEnabled)) {
      return false;
    }
    
    // เงื่อนไข 1: อนุมัติทุกรายการ
    if (isTruthy(settings.AutoApproveAll)) {
      return true;
    }
    
    // เงื่อนไข 2: อนุมัติเฉพาะยอด ≤ X บาท
    const amount = parseFloat(data.Amount) || 0;
    const maxAmount = parseFloat(settings.AutoApproveAmount) || 0;
    if (maxAmount > 0 && amount <= maxAmount) {
      return true;
    }
    
    // เงื่อนไข 3: อนุมัติเมื่อแนบสลิป
    if (isTruthy(settings.AutoApproveWithSlip) && data.SlipUrl && data.SlipUrl.trim()) {
      return true;
    }
    
    // เงื่อนไข 4: อนุมัติผู้บริจาคซ้ำ (เบอร์เดียวกัน)
    if (isTruthy(settings.AutoApproveReturning) && data.DonorPhone) {
      const phone = String(data.DonorPhone || '').trim();
      if (phone) {
        // ตรวจสอบว่าเบอร์นี้เคยบริจาคมาก่อนหรือไม่
        const existingDonations = getDonations();
        const isReturningDonor = existingDonations.some(d => {
          const existingPhone = String(d.DonorPhone || '').replace(/^'/, '').trim();
          return existingPhone === phone && (d.Status || '').toLowerCase() === 'approved';
        });
        if (isReturningDonor) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('shouldAutoApprove error:', error);
    return false;
  }
}

/**
 * สร้างรายการบริจาคใหม่
 */
function createDonation(data) {
  const lock = LockService.getScriptLock();
  try {
    // รอ lock สูงสุด 10 วินาที
    lock.waitLock(10000);
    
    const settings = getSettings();
    const status = getEffectiveEventStatus(settings);
    if (status === 'CLOSED') {
      throw new Error('ขออภัย โครงการนี้ปิดรับการสนับสนุนแล้ว');
    }
    
    let attendanceType = String(data.AttendanceType || '').trim();
    let contributionType = String(data.ContributionType || 'NEW').trim().toUpperCase();
    let previousDonationReference = String(data.PreviousDonationReference || '').trim();
    let donationPhase = 'EVENT_PERIOD';
    
    if (status === 'OPEN') {
      donationPhase = 'EVENT_PERIOD';
      if (attendanceType !== 'Onsite' && attendanceType !== 'Online') {
        throw new Error('กรุณาเลือกรูปแบบการเข้าร่วมกิจกรรม (Onsite หรือ Online)');
      }
      contributionType = 'NEW';
      previousDonationReference = '';
    } else if (status === 'POST_EVENT') {
      donationPhase = 'POST_EVENT';
      attendanceType = 'PostEvent';
      if (contributionType !== 'NEW' && contributionType !== 'ADDITIONAL') {
        throw new Error('กรุณาเลือกลักษณะการสนับสนุน');
      }
      if (contributionType === 'NEW') {
        previousDonationReference = '';
      } else {
        if (previousDonationReference.length > 200) {
          previousDonationReference = previousDonationReference.substring(0, 200);
        }
      }
    }
    
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    
    // ตรวจสอบและอัปเดต Header ในชีตเพื่อป้องกันคอลัมน์ซ้ำ/เรียงผิด
    let lastCol = sheet.getLastColumn();
    let currentHeaders = [];
    if (lastCol > 0) {
      currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    }
    const newHeadersToMigrate = ['ContributionType', 'PreviousDonationReference', 'DonationPhase'];
    const missingHeaders = newHeadersToMigrate.filter(h => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      const finalHeaders = [...currentHeaders, ...missingHeaders];
      sheet.getRange(1, 1, 1, finalHeaders.length)
        .setValues([finalHeaders])
        .setFontWeight('bold')
        .setBackground('#F5A623')
        .setFontColor('#FFFFFF');
      currentHeaders = finalHeaders;
      SpreadsheetApp.flush();
    }
    
    const id = generateUUID();
    const timestamp = new Date();
    
    // Auto-populate BankCode and BankName if missing
    if (!data.BankCode) {
      const activeAccounts = getActiveBankAccounts();
      if (activeAccounts && activeAccounts.length > 0) {
        const defaultAccount = activeAccounts[0];
        data.BankCode = defaultAccount.BankCode || 'OTHER';
        data.BankName = defaultAccount.BankDisplayName || defaultAccount.BankName || '';
      }
    }
    
    // Add apostrophe prefix to preserve leading zeros in phone numbers
    const donorPhone = data.DonorPhone ? "'" + data.DonorPhone.toString() : '';
    
    // ตรวจสอบ Auto-approve
    const autoApprove = shouldAutoApprove(data);
    const donationStatus = autoApprove ? 'approved' : 'pending';
    const approvedBy = autoApprove ? 'Auto-Approved' : '';
    const approvedDate = autoApprove ? timestamp : '';
    
    const donationData = {
      ID: id,
      Timestamp: timestamp,
      DonorName: data.DonorName || 'ไม่ประสงค์ออกนาม',
      DonorPhone: donorPhone,
      Amount: parseFloat(data.Amount) || 0,
      TransferDate: data.TransferDate || timestamp,
      BankCode: data.BankCode || '',
      SlipFileId: data.SlipFileId || '',
      SlipUrl: data.SlipUrl || '',
      Status: donationStatus,
      ApprovedBy: approvedBy,
      ApprovedDate: approvedDate,
      Note: data.Note || '',
      Position: data.Position || '',
      Organization: data.Organization || '',
      AttendanceType: attendanceType,
      BankName: data.BankName || '',
      ContributionType: contributionType,
      PreviousDonationReference: previousDonationReference,
      DonationPhase: donationPhase
    };
    
    const row = currentHeaders.map(header => donationData[header] !== undefined ? donationData[header] : '');
    sheet.appendRow(row);
    
    // ลบ cache เพื่อให้ Dashboard โหลดข้อมูลใหม่
    clearDashboardCache();
    
    const message = autoApprove 
      ? 'บริจาคเรียบร้อย อนุมัติอัตโนมัติ' 
      : 'แจ้งโอนเงินบริจาคเรียบร้อย รอการตรวจสอบ';
    
    return { 
      success: true, 
      message: message, 
      id: id,
      autoApproved: autoApprove
    };
  } catch (error) {
    console.error('createDonation error:', error);
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงรายการบริจาค
 */
function getDonations(filter = {}) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    const headers = data[0];
    let donations = data.slice(1).map(row => {
      const donation = {};
      headers.forEach((header, index) => {
        let value = row[index];
        // Convert Date objects to ISO string for proper serialization
        if (value instanceof Date) {
          value = value.toISOString();
        }
        donation[header] = value;
      });
      
      // Fallback for old data
      if (donation.ContributionType === undefined || donation.ContributionType === '') {
        donation.ContributionType = 'NEW';
      }
      if (donation.PreviousDonationReference === undefined || donation.PreviousDonationReference === '') {
        donation.PreviousDonationReference = '';
      }
      if (donation.DonationPhase === undefined || donation.DonationPhase === '') {
        const attType = String(donation.AttendanceType || '').trim();
        if (attType === 'Onsite' || attType === 'Online') {
          donation.DonationPhase = 'EVENT_PERIOD';
        } else if (attType === 'PostEvent') {
          donation.DonationPhase = 'POST_EVENT';
        } else {
          donation.DonationPhase = 'EVENT_PERIOD';
        }
      }
      
      // Format dates
      donation.TimestampFormatted = formatThaiDate(donation.Timestamp);
      donation.TransferDateFormatted = formatThaiDate(donation.TransferDate);
      // Add bank info
      const bankInfo = CONFIG.BANK_ICONS[donation.BankCode] || CONFIG.BANK_ICONS.OTHER;
      donation.BankDisplayName = (donation.BankCode === 'OTHER' && donation.BankName) ? donation.BankName : bankInfo.name;
      donation.BankColor = bankInfo.color;
      return donation;
    }).filter(d => d.ID); // Filter out empty rows
    
    // Apply filters
    if (filter.status) {
      donations = donations.filter(d => d.Status === filter.status);
    }
    
    if (filter.contributionType) {
      donations = donations.filter(d => d.ContributionType === filter.contributionType);
    }
    
    if (filter.donationPhase) {
      donations = donations.filter(d => d.DonationPhase === filter.donationPhase);
    }
    
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      donations = donations.filter(d => 
        (d.DonorName || '').toLowerCase().includes(searchLower) ||
        (d.DonorPhone || '').includes(filter.search) ||
        (d.ID || '').toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by timestamp (newest first)
    donations.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    
    // Pagination
    if (filter.page && filter.limit) {
      const start = (filter.page - 1) * filter.limit;
      const end = start + filter.limit;
      return {
        data: donations.slice(start, end),
        total: donations.length,
        page: filter.page,
        totalPages: Math.ceil(donations.length / filter.limit)
      };
    }
    
    return donations;
  } catch (error) {
    console.error('getDonations error:', error);
    return [];
  }
}

/**
 * ดึงรายการบริจาคตาม ID
 */
function getDonation(id) {
  try {
    const donations = getDonations();
    return donations.find(d => d.ID === id) || null;
  } catch (error) {
    console.error('getDonation error:', error);
    return null;
  }
}

/**
 * แก้ไขรายการบริจาค
 */
function updateDonation(id, data) {
  const lock = LockService.getScriptLock();
  try {
    // รอ lock สูงสุด 10 วินาที
    lock.waitLock(10000);
    
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    const dataRange = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, message: 'ไม่พบรายการบริจาค' };
    }
    
    const existingRow = dataRange[rowIndex - 1];
    
    const row = [
      id,
      existingRow[1], // Keep original timestamp
      data.DonorName || existingRow[2],
      data.DonorPhone || existingRow[3],
      parseFloat(data.Amount) || existingRow[4],
      data.TransferDate || existingRow[5],
      data.BankCode || existingRow[6],
      data.SlipFileId || existingRow[7],
      data.SlipUrl || existingRow[8],
      data.Status || existingRow[9],
      data.ApprovedBy || existingRow[10],
      data.ApprovedDate || existingRow[11],
      data.Note || existingRow[12],
      data.Position !== undefined ? data.Position : (existingRow[13] || ''),
      data.Organization !== undefined ? data.Organization : (existingRow[14] || ''),
      data.AttendanceType !== undefined ? data.AttendanceType : (existingRow[15] || ''),
      data.BankName !== undefined ? data.BankName : (existingRow[16] || ''),
      data.ContributionType !== undefined ? data.ContributionType : (existingRow[17] || 'NEW'),
      data.PreviousDonationReference !== undefined ? data.PreviousDonationReference : (existingRow[18] || ''),
      data.DonationPhase !== undefined ? data.DonationPhase : (existingRow[19] || 'EVENT_PERIOD')
    ];
    
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    
    // ลบ cache เพื่อให้ Dashboard โหลดข้อมูลใหม่
    clearDashboardCache();
    
    return { success: true, message: 'แก้ไขรายการบริจาคเรียบร้อย' };
  } catch (error) {
    console.error('updateDonation error:', error);
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลบรายการบริจาค
 */
function deleteDonation(id, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'donations.delete');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  const lock = LockService.getScriptLock();
  try {
    // รอ lock สูงสุด 10 วินาที
    lock.waitLock(10000);
    
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    const dataRange = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] === id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, message: 'ไม่พบรายการบริจาค' };
    }
    
    sheet.deleteRow(rowIndex);
    
    // ลบ cache เพื่อให้ Dashboard โหลดข้อมูลใหม่
    clearDashboardCache();
    
    return { success: true, message: 'ลบรายการบริจาคเรียบร้อย' };
  } catch (error) {
    console.error('deleteDonation error:', error);
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * อนุมัติรายการบริจาค
 */
function approveDonation(id, sessionOrName) {
  let approverName = 'Admin';
  if (sessionOrName && typeof sessionOrName === 'object' && sessionOrName.sessionToken) {
    requirePermission(sessionOrName, 'donations.approve');
    approverName = sessionOrName.displayName || 'Admin';
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
    if (typeof sessionOrName === 'string') {
      approverName = sessionOrName;
    }
  }
  try {
    return updateDonation(id, {
      Status: 'approved',
      ApprovedBy: approverName,
      ApprovedDate: new Date()
    });
  } catch (error) {
    console.error('approveDonation error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * ปฏิเสธรายการบริจาค
 */
function rejectDonation(id, note = '', sessionOrName) {
  let approverName = 'Admin';
  if (sessionOrName && typeof sessionOrName === 'object' && sessionOrName.sessionToken) {
    requirePermission(sessionOrName, 'donations.reject');
    approverName = sessionOrName.displayName || 'Admin';
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
    if (typeof sessionOrName === 'string') {
      approverName = sessionOrName;
    }
  }
  try {
    return updateDonation(id, {
      Status: 'rejected',
      ApprovedBy: approverName,
      ApprovedDate: new Date(),
      Note: note
    });
  } catch (error) {
    console.error('rejectDonation error:', error);
    return { success: false, message: error.message };
  }
}

// ===== DASHBOARD FUNCTIONS =====

/**
 * ดึงข้อมูล Dashboard ทั้งหมดในครั้งเดียว (รวม 4 APIs)
 * ใช้ CacheService เพื่อเพิ่มประสิทธิภาพ
 */
function getDashboardDataAll() {
  try {
    // ตรวจสอบ cache ก่อน
    const cached = getCache(CACHE_KEYS.DASHBOARD);
    if (cached) {
      return cached;
    }
    
    // อ่าน Sheet เพียง 1 ครั้ง
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    const data = sheet.getDataRange().getValues();
    const settings = getSettings();
    
    // แปลงข้อมูลเป็น donations array
    let donations = [];
    if (data.length > 1) {
      const headers = data[0];
      donations = data.slice(1).map(row => {
        const donation = {};
        headers.forEach((header, index) => {
          let value = row[index];
          if (value instanceof Date) {
            value = value.toISOString();
          }
          donation[header] = value;
        });
        
        // Fallback for old data
        if (donation.ContributionType === undefined || donation.ContributionType === '') {
          donation.ContributionType = 'NEW';
        }
        if (donation.PreviousDonationReference === undefined || donation.PreviousDonationReference === '') {
          donation.PreviousDonationReference = '';
        }
        if (donation.DonationPhase === undefined || donation.DonationPhase === '') {
          const attType = String(donation.AttendanceType || '').trim();
          if (attType === 'Onsite' || attType === 'Online') {
            donation.DonationPhase = 'EVENT_PERIOD';
          } else if (attType === 'PostEvent') {
            donation.DonationPhase = 'POST_EVENT';
          } else {
            donation.DonationPhase = 'EVENT_PERIOD';
          }
        }

        donation.TimestampFormatted = formatThaiDate(donation.Timestamp);
        donation.TransferDateFormatted = formatThaiDate(donation.TransferDate);
        const bankInfo = CONFIG.BANK_ICONS[donation.BankCode] || CONFIG.BANK_ICONS.OTHER;
        donation.BankDisplayName = bankInfo.name;
        donation.BankColor = bankInfo.color;
        return donation;
      }).filter(d => d.ID);
      
      donations.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    }
    
    const approvedDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
    const pendingDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'pending');
    
    // ===== คำนวณ Stats =====
    const totalAmount = approvedDonations.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    const targetAmount = parseFloat(String(settings.TargetAmount || '').replace(/,/g, '')) || 0;
    
    const eventPeriodAmount = approvedDonations
      .filter(d => d.DonationPhase === 'EVENT_PERIOD')
      .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
    const postEventAmount = approvedDonations
      .filter(d => d.DonationPhase === 'POST_EVENT')
      .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
    const additionalCount = approvedDonations
      .filter(d => d.ContributionType === 'ADDITIONAL')
      .length;
    
    const donorKeys = approvedDonations.map(d => {
      const phone = String(d.DonorPhone || '').trim();
      if (phone) return 'phone:' + phone;
      const name = String(d.DonorName || '').trim();
      if (name && name !== 'ไม่ประสงค์ออกนาม') return 'name:' + name;
      return 'id:' + d.ID;
    });
    const uniqueDonors = new Set(donorKeys).size;
    
    const averageAmount = approvedDonations.length > 0 ? totalAmount / approvedDonations.length : 0;
    const progress = targetAmount > 0 ? Math.min((totalAmount / targetAmount) * 100, 100) : 0;
    
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const lastMonthTotal = approvedDonations.filter(d => {
      const date = new Date(d.Timestamp);
      return date >= lastMonth && date < thisMonthStart;
    }).reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    
    const thisMonthTotal = approvedDonations.filter(d => {
      return new Date(d.Timestamp) >= thisMonthStart;
    }).reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    
    const growthPercent = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
    
    const stats = {
      totalAmount,
      totalDonors: uniqueDonors,
      pendingCount: pendingDonations.length,
      averageAmount: Math.round(averageAmount),
      targetAmount,
      progress: Math.round(progress * 10) / 10,
      growthPercent: Math.round(growthPercent),
      remainingAmount: Math.max(0, targetAmount - totalAmount),
      eventPeriodAmount,
      postEventAmount,
      additionalCount
    };
    
    // ===== คำนวณ Chart Data (7 วัน) =====
    const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    const labels = [];
    const chartValues = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayTotal = approvedDonations.filter(d => {
        const dDate = new Date(d.Timestamp);
        return dDate >= date && dDate < nextDate;
      }).reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
      labels.push(thaiDays[date.getDay()]);
      chartValues.push(dayTotal);
    }
    
    const chartData = { labels, data: chartValues };
    
    // ===== Recent Donations (5 รายการ) =====
    const recentDonations = donations.slice(0, 5);
    
    // ===== Top Donors (5 คน) =====
    const donorMap = {};
    approvedDonations.forEach(d => {
      const key = String(d.DonorPhone || '').trim() || String(d.DonorName || '').trim() || 'anonymous';
      if (!donorMap[key]) {
        donorMap[key] = {
          name: d.DonorName || 'ไม่ประสงค์ออกนาม',
          phone: d.DonorPhone,
          total: 0,
          count: 0,
          lastDonation: d.Timestamp
        };
      }
      donorMap[key].total += parseFloat(d.Amount) || 0;
      donorMap[key].count++;
      if (new Date(d.Timestamp) > new Date(donorMap[key].lastDonation)) {
        donorMap[key].lastDonation = d.Timestamp;
      }
    });
    
    const topDonors = Object.values(donorMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(donor => ({
        ...donor,
        lastDonationFormatted: formatThaiDate(donor.lastDonation)
      }));
    
    // รวมผลลัพธ์
    const result = {
      stats,
      chartData,
      recentDonations,
      topDonors
    };
    
    // บันทึก cache
    setCache(CACHE_KEYS.DASHBOARD, result);
    
    return result;
  } catch (error) {
    console.error('getDashboardDataAll error:', error);
    return {
      stats: { totalAmount: 0, totalDonors: 0, pendingCount: 0, averageAmount: 0, targetAmount: 0, progress: 0, growthPercent: 0, remainingAmount: 0 },
      chartData: { labels: [], data: [] },
      recentDonations: [],
      topDonors: []
    };
  }
}

/**
 * สถิติสำหรับ Dashboard
 */
function getDashboardStats() {
  try {
    const donations = getDonations();
    const approvedDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
    const pendingDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'pending');
    const settings = getSettings();
    
    const totalAmount = approvedDonations.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    const targetAmount = parseFloat(String(settings.TargetAmount || '').replace(/,/g, '')) || 0;
    
    const eventPeriodAmount = approvedDonations
      .filter(d => d.DonationPhase === 'EVENT_PERIOD')
      .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
    const postEventAmount = approvedDonations
      .filter(d => d.DonationPhase === 'POST_EVENT')
      .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
    const additionalCount = approvedDonations
      .filter(d => d.ContributionType === 'ADDITIONAL')
      .length;
    
    // Calculate unique donors - use ID as fallback to count anonymous donors separately
    const donorKeys = approvedDonations.map(d => {
      // If has phone, use phone as key (แปลงเป็น string ก่อน)
      const phone = String(d.DonorPhone || '').trim();
      if (phone) {
        return 'phone:' + phone;
      }
      // If has name, use name as key (แปลงเป็น string ก่อน)
      const name = String(d.DonorName || '').trim();
      if (name && name !== 'ไม่ประสงค์ออกนาม') {
        return 'name:' + name;
      }
      // Anonymous or empty - use donation ID as unique key
      return 'id:' + d.ID;
    });
    const uniqueDonors = new Set(donorKeys).size;
    
    // Calculate average
    const averageAmount = approvedDonations.length > 0 
      ? totalAmount / approvedDonations.length 
      : 0;
    
    // Calculate progress
    const progress = targetAmount > 0 
      ? Math.min((totalAmount / targetAmount) * 100, 100) 
      : 0;
    
    // Calculate growth (compare with last month)
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const lastMonthDonations = approvedDonations.filter(d => {
      const date = new Date(d.Timestamp);
      return date >= lastMonth && date < thisMonthStart;
    });
    
    const thisMonthDonations = approvedDonations.filter(d => {
      const date = new Date(d.Timestamp);
      return date >= thisMonthStart;
    });
    
    const lastMonthTotal = lastMonthDonations.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    const thisMonthTotal = thisMonthDonations.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
    
    const growthPercent = lastMonthTotal > 0 
      ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 
      : 0;
    
    return {
      totalAmount,
      totalDonors: uniqueDonors,
      pendingCount: pendingDonations.length,
      averageAmount: Math.round(averageAmount),
      targetAmount,
      progress: Math.round(progress * 10) / 10,
      growthPercent: Math.round(growthPercent),
      remainingAmount: Math.max(0, targetAmount - totalAmount),
      eventPeriodAmount,
      postEventAmount,
      additionalCount
    };
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return {
      totalAmount: 0,
      totalDonors: 0,
      pendingCount: 0,
      averageAmount: 0,
      targetAmount: 0,
      progress: 0,
      growthPercent: 0,
      remainingAmount: 0
    };
  }
}

/**
 * ข้อมูลสำหรับกราฟ
 */
function getChartData(days = 7) {
  try {
    const donations = getDonations();
    const approvedDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
    
    const now = new Date();
    const labels = [];
    const data = [];
    
    const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayDonations = approvedDonations.filter(d => {
        const dDate = new Date(d.Timestamp);
        return dDate >= date && dDate < nextDate;
      });
      
      const dayTotal = dayDonations.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
      
      labels.push(thaiDays[date.getDay()]);
      data.push(dayTotal);
    }
    
    return { labels, data };
  } catch (error) {
    console.error('getChartData error:', error);
    return { labels: [], data: [] };
  }
}

/**
 * รายการล่าสุด
 */
function getRecentDonations(limit = 5) {
  try {
    const donations = getDonations();
    return donations.slice(0, limit);
  } catch (error) {
    console.error('getRecentDonations error:', error);
    return [];
  }
}

/**
 * ผู้บริจาคยอดเยี่ยม
 */
function getTopDonors(limit = 5) {
  try {
    const donations = getDonations();
    const approvedDonations = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
    
    // Group by donor
    const donorMap = {};
    approvedDonations.forEach(d => {
      const key = String(d.DonorPhone || '').trim() || String(d.DonorName || '').trim() || 'anonymous';
      if (!donorMap[key]) {
        donorMap[key] = {
          name: d.DonorName || 'ไม่ประสงค์ออกนาม',
          phone: d.DonorPhone,
          total: 0,
          count: 0,
          lastDonation: d.Timestamp
        };
      }
      donorMap[key].total += parseFloat(d.Amount) || 0;
      donorMap[key].count++;
      if (new Date(d.Timestamp) > new Date(donorMap[key].lastDonation)) {
        donorMap[key].lastDonation = d.Timestamp;
      }
    });
    
    // Sort by total amount and format dates
    const topDonors = Object.values(donorMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
      .map(donor => ({
        ...donor,
        lastDonationFormatted: formatThaiDate(donor.lastDonation)
      }));
    
    return topDonors;
  } catch (error) {
    console.error('getTopDonors error:', error);
    return [];
  }
}

// ===== FILE UPLOAD FUNCTIONS =====

/**
 * Get OAuth Token for file upload
 */
function getOAuthToken() {
  return ScriptApp.getOAuthToken();
}

/**
 * Get folder for uploads
 */
function getUploadFolder() {
  try {
    const folderId = getDriveFolderId();
    
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        console.warn('Folder not found, using root');
      }
    }
    
    // Use root folder if no folder specified
    return DriveApp.getRootFolder();
  } catch (error) {
    console.error('getUploadFolder error:', error);
    return DriveApp.getRootFolder();
  }
}

/**
 * Save file from base64
 */
function saveFileFromBase64(base64Data, fileName, mimeType) {
  try {
    const settings = getSettings();
    if (getEffectiveEventStatus(settings) === 'CLOSED') {
      throw new Error('ขออภัย โครงการนี้ปิดรับการสนับสนุนแล้ว');
    }
    const folder = getUploadFolder();
    
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Content),
      mimeType,
      fileName
    );
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileId: file.getId(),
      fileUrl: `https://lh3.googleusercontent.com/d/${file.getId()}`
    };
  } catch (error) {
    console.error('saveFileFromBase64 error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Get resumable upload URL for large files
 */
function getResumableUploadUrl(fileName, mimeType, fileSize) {
  try {
    const folder = getUploadFolder();
    const token = ScriptApp.getOAuthToken();
    
    const metadata = {
      name: fileName,
      parents: [folder.getId()]
    };
    
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': fileSize
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const uploadUrl = response.getHeaders()['Location'] || response.getHeaders()['location'];
      return {
        success: true,
        uploadUrl: uploadUrl,
        token: token
      };
    } else {
      return { 
        success: false, 
        message: 'Failed to get upload URL: ' + response.getContentText() 
      };
    }
  } catch (error) {
    console.error('getResumableUploadUrl error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Set file sharing after upload
 */
function setFileSharing(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileId: fileId,
      fileUrl: `https://lh3.googleusercontent.com/d/${fileId}`
    };
  } catch (error) {
    console.error('setFileSharing error:', error);
    return { success: false, message: error.message };
  }
}

// ===== AUTHENTICATION =====

const rolePermissions = {
  admin: [
    'dashboard',
    'donations.view', 'donations.approve', 'donations.reject', 'donations.delete',
    'slip.view', 'slip.verify',
    'report.export', 'report.pdf', 'report.excel',
    'settings.view', 'settings.edit',
    'bank.edit',
    'users.manage'
  ],
  staff: [
    'dashboard',
    'donations.view', 'donations.approve', 'donations.reject',
    'slip.view', 'slip.verify',
    'report.export', 'report.pdf', 'report.excel'
  ]
};

function getRolePermissions(role) {
  const normRole = String(role || '').toLowerCase();
  return rolePermissions[normRole] || [];
}

function hasPermission(session, permission) {
  if (!session || !session.sessionToken) {
    return false;
  }
  
  try {
    const cache = CacheService.getScriptCache();
    const cachedSessionStr = cache.get(session.sessionToken);
    if (!cachedSessionStr) {
      return false;
    }
    
    const cachedSession = JSON.parse(cachedSessionStr);
    if (cachedSession.username !== session.username || cachedSession.role !== session.role) {
      return false;
    }
    
    const permissions = getRolePermissions(cachedSession.role);
    return permissions.includes(permission);
  } catch (error) {
    console.error('hasPermission error:', error);
    return false;
  }
}

function requirePermission(session, permission) {
  if (!hasPermission(session, permission)) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงหรือดำเนินการในส่วนนี้ (Unauthorized)');
  }
}

function loginUser(username, password) {
  try {
    const targetUser = String(username || 'admin').trim();
    const targetPass = String(password || '').trim();
    
    if (!targetPass) {
      return { success: false, message: 'กรุณากรอกรหัสผ่าน' };
    }
    
    const sheet = getSheet(CONFIG.SHEETS.USERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const usernameCol = headers.indexOf('Username');
    const passwordCol = headers.indexOf('Password');
    const isActiveCol = headers.indexOf('IsActive');
    const displayNameCol = headers.indexOf('DisplayName');
    const roleCol = headers.indexOf('Role');
    const lastLoginCol = headers.indexOf('LastLogin');
    
    let userFoundRow = -1;
    let userData = null;
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][usernameCol]).trim().toLowerCase() === targetUser.toLowerCase()) {
        userFoundRow = i + 1;
        userData = values[i];
        break;
      }
    }
    
    if (userFoundRow !== -1 && userData) {
      const isActive = String(userData[isActiveCol]).toUpperCase() === 'TRUE' || userData[isActiveCol] === true;
      if (!isActive) {
        return { success: false, message: 'บัญชีนี้ถูกปิดใช้งาน' };
      }
      
      const correctPassword = String(userData[passwordCol]).trim();
      if (targetPass === correctPassword) {
        // อัปเดตเวลาเข้าใช้งานล่าสุด
        const now = new Date();
        sheet.getRange(userFoundRow, lastLoginCol + 1).setValue(now);
        SpreadsheetApp.flush();
        
        const sessionToken = generateUUID();
        const session = {
          username: String(userData[usernameCol]).trim(),
          displayName: String(userData[displayNameCol]).trim(),
          role: String(userData[roleCol]).trim(),
          permissions: getRolePermissions(String(userData[roleCol]).trim()),
          loginAt: now.toISOString(),
          sessionToken: sessionToken
        };
        
        const cache = CacheService.getScriptCache();
        cache.put(sessionToken, JSON.stringify(session), 21600); // 6 ชั่วโมง
        
        return { success: true, session: session, message: 'เข้าสู่ระบบสำเร็จ' };
      }
    }
    
    // Fallback: ตรวจสอบรหัสผ่านแอดมินเดิมจาก Settings
    if (targetUser.toLowerCase() === 'admin') {
      const settings = getSettings();
      const adminSettingsPassword = settings.AdminPassword || '';
      if (adminSettingsPassword && targetPass === adminSettingsPassword) {
        const now = new Date();
        const sessionToken = generateUUID();
        const session = {
          username: 'admin',
          displayName: 'ผู้ดูแลระบบ (ชั่วคราว)',
          role: 'admin',
          permissions: getRolePermissions('admin'),
          loginAt: now.toISOString(),
          sessionToken: sessionToken
        };
        
        const cache = CacheService.getScriptCache();
        cache.put(sessionToken, JSON.stringify(session), 21600);
        
        return { success: true, session: session, message: 'เข้าสู่ระบบสำเร็จ (โหมดจำลอง)' };
      }
    }
    
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  } catch (error) {
    console.error('loginUser error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * ตรวจสอบรหัสผ่าน Admin (Legacy Wrapper)
 */
function verifyAdminPassword(password) {
  try {
    const loginResult = loginUser('admin', password);
    if (loginResult.success) {
      return { success: true, message: 'เข้าสู่ระบบสำเร็จ', session: loginResult.session };
    } else {
      return { success: false, message: loginResult.message };
    }
  } catch (error) {
    console.error('verifyAdminPassword error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Hash password (SHA-256)
 */
function hashPassword(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return rawHash.map(byte => {
    const hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * ดึงรายการผู้ใช้ทั้งหมด (ตรวจสอบสิทธิ์ users.manage)
 */
function getUsers(session) {
  try {
    requirePermission(session, 'users.manage');
    const sheet = getSheet(CONFIG.SHEETS.USERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const users = [];
    
    for (let i = 1; i < values.length; i++) {
      const user = {};
      headers.forEach((header, index) => {
        let val = values[i][index];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        }
        user[header] = val;
      });
      users.push(user);
    }
    
    return { success: true, users: users };
  } catch (error) {
    console.error('getUsers error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * สร้างหรือแก้ไขข้อมูลผู้ใช้ (ตรวจสอบสิทธิ์ users.manage)
 */
function saveUser(user, session) {
  try {
    requirePermission(session, 'users.manage');
    
    const targetUser = user || {};
    const username = String(targetUser.Username || '').trim();
    const password = String(targetUser.Password || '').trim();
    const role = String(targetUser.Role || 'staff').trim();
    const displayName = String(targetUser.DisplayName || '').trim();
    const isActive = targetUser.IsActive === true || String(targetUser.IsActive).toUpperCase() === 'TRUE';
    const note = String(targetUser.Note || '').trim();
    
    if (!username || !password || !displayName) {
      return { success: false, message: 'กรุณากรอกข้อมูล Username, Password และ DisplayName ให้ครบถ้วน' };
    }
    
    const sheet = getSheet(CONFIG.SHEETS.USERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const idCol = headers.indexOf('UserID');
    const usernameCol = headers.indexOf('Username');
    const displayNameCol = headers.indexOf('DisplayName');
    const passwordCol = headers.indexOf('Password');
    const roleCol = headers.indexOf('Role');
    const isActiveCol = headers.indexOf('IsActive');
    const createdAtCol = headers.indexOf('CreatedAt');
    const updatedAtCol = headers.indexOf('UpdatedAt');
    const noteCol = headers.indexOf('Note');
    
    const targetId = String(targetUser.UserID || '').trim();
    let foundRowIndex = -1;
    
    // ตรวจสอบ Username ซ้ำ
    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][idCol]).trim();
      const rowUsername = String(values[i][usernameCol]).trim().toLowerCase();
      
      if (rowUsername === username.toLowerCase() && rowId !== targetId) {
        return { success: false, message: 'มีชื่อผู้ใช้นี้ (Username) อยู่ในระบบแล้ว' };
      }
      
      if (rowId === targetId && targetId !== '') {
        foundRowIndex = i + 1;
      }
    }
    
    const now = new Date();
    if (foundRowIndex !== -1) {
      // อัปเดตข้อมูลผู้ใช้งานเดิม
      sheet.getRange(foundRowIndex, displayNameCol + 1).setValue(displayName);
      sheet.getRange(foundRowIndex, passwordCol + 1).setValue(password);
      sheet.getRange(foundRowIndex, roleCol + 1).setValue(role);
      sheet.getRange(foundRowIndex, isActiveCol + 1).setValue(isActive);
      sheet.getRange(foundRowIndex, updatedAtCol + 1).setValue(now);
      sheet.getRange(foundRowIndex, noteCol + 1).setValue(note);
    } else {
      // คำนวณหา UserID ใหม่ (U00X)
      let maxNum = 0;
      for (let i = 1; i < values.length; i++) {
        const rowId = String(values[i][idCol]).trim();
        if (rowId.startsWith('U')) {
          const num = parseInt(rowId.substring(1)) || 0;
          if (num > maxNum) maxNum = num;
        }
      }
      const nextId = 'U' + String(maxNum + 1).padStart(3, '0');
      
      // เพิ่มแถวผู้ใช้งานใหม่
      const newRow = [];
      headers.forEach(header => {
        if (header === 'UserID') newRow.push(nextId);
        else if (header === 'Username') newRow.push(username);
        else if (header === 'DisplayName') newRow.push(displayName);
        else if (header === 'Password') newRow.push(password);
        else if (header === 'Role') newRow.push(role);
        else if (header === 'IsActive') newRow.push(isActive);
        else if (header === 'LastLogin') newRow.push('');
        else if (header === 'CreatedAt') newRow.push(now);
        else if (header === 'UpdatedAt') newRow.push(now);
        else if (header === 'Note') newRow.push(note);
        else newRow.push('');
      });
      sheet.appendRow(newRow);
    }
    
    SpreadsheetApp.flush();
    return { success: true, message: 'บันทึกข้อมูลผู้ใช้งานเรียบร้อย' };
  } catch (error) {
    console.error('saveUser error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * ลบผู้ใช้ (ตรวจสอบสิทธิ์ users.manage และป้องกันการลบตัวเอง)
 */
function deleteUser(userId, session) {
  try {
    requirePermission(session, 'users.manage');
    const targetId = String(userId || '').trim();
    
    if (!targetId) {
      return { success: false, message: 'ไม่พบ ID ผู้ใช้งานที่ต้องการลบ' };
    }
    
    const sheet = getSheet(CONFIG.SHEETS.USERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const idCol = headers.indexOf('UserID');
    const usernameCol = headers.indexOf('Username');
    
    let foundRowIndex = -1;
    let targetUsername = '';
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]).trim() === targetId) {
        foundRowIndex = i + 1;
        targetUsername = String(values[i][usernameCol]).trim();
        break;
      }
    }
    
    if (foundRowIndex === -1) {
      return { success: false, message: 'ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ' };
    }
    
    // ป้องกันการลบตัวเอง
    if (session && session.username && session.username.toLowerCase() === targetUsername.toLowerCase()) {
      return { success: false, message: 'ไม่สามารถลบบัญชีผู้ใช้งานของตัวเองที่กำลังใช้งานอยู่ได้' };
    }
    
    sheet.deleteRow(foundRowIndex);
    SpreadsheetApp.flush();
    
    return { success: true, message: 'ลบผู้ใช้งานเรียบร้อย' };
  } catch (error) {
    console.error('deleteUser error:', error);
    return { success: false, message: error.message };
  }
}

// ===== PUBLIC API =====

/**
 * คำนวณ EventStatus จริงโดยคำนวณจาก EndDate และ AutoUpdateEventStatus
 */
function getEffectiveEventStatus(settings) {
  if (!settings) settings = getSettings();
  const eventStatus = settings.EventStatus || 'OPEN';
  if (eventStatus === 'CLOSED') return 'CLOSED';
  
  const isAuto = settings.AutoUpdateEventStatus === true || settings.AutoUpdateEventStatus === 'true';
  if (isAuto && settings.EndDate) {
    try {
      const parts = settings.EndDate.split('-');
      if (parts.length === 3) {
        // นับถึง 23:59:59 ใน Timezone ของระบบ
        const endDateTime = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999);
        return new Date() > endDateTime ? 'POST_EVENT' : 'OPEN';
      }
    } catch (e) {
      console.error('getEffectiveEventStatus parse EndDate error:', e);
    }
  }
  return eventStatus;
}

/**
 * Get public project info for landing page
 */
function getPublicProjectInfo() {
  try {
    const settings = getSettings();
    const stats = getDashboardStats();
    const bankAccounts = getActiveBankAccounts();
    const recentDonors = getRecentDonations(200);
    
    return {
      project: {
        name: settings.ProjectName || 'โครงการบริจาค',
        description: settings.ProjectDescription || '',
        type: settings.ProjectType || '',
        tags: settings.Tags || '',
        coverUrl: settings.ProjectCoverUrl || '',
        sidebarTitle: settings.SidebarTitle || '',
        startDate: settings.StartDate || '',
        endDate: settings.EndDate || '',
        contactPerson: settings.ContactPerson || '',
        contactPhone: settings.ContactPhone || '',
        contactEmail: settings.ContactEmail || '',
        effectiveEventStatus: getEffectiveEventStatus(settings)
      },
      stats: {
        totalAmount: stats.totalAmount,
        targetAmount: stats.targetAmount,
        remainingAmount: stats.remainingAmount,
        progress: stats.progress,
        totalDonors: stats.totalDonors
      },
      bankAccounts: bankAccounts,
      recentDonors: recentDonors
        .filter(d => (d.Status || '').toLowerCase() === 'approved')
        .slice(0, 200)
        .map(d => ({
          name: d.DonorName || 'ไม่ประสงค์ออกนาม',
          amount: d.Amount,
          date: d.TimestampFormatted
        }))
    };
  } catch (error) {
    console.error('getPublicProjectInfo error:', error);
    return null;
  }
}

/**
 * Get bank icons config
 */
function getBankIcons() {
  return CONFIG.BANK_ICONS;
}

/**
 * DEBUG: ตรวจสอบข้อมูล donations
 * เรียกใช้ใน Script Editor: เลือก debugDonations แล้วกด Run
 */
function debugDonations() {
  const donations = getDonations();
  console.log('Total donations:', donations.length);
  
  donations.forEach((d, i) => {
    console.log(`[${i}] ID: ${d.ID}, Status: "${d.Status}", Amount: ${d.Amount}, Name: ${d.DonorName}`);
  });
  
  const approved = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
  console.log('Approved donations:', approved.length);
  
  const totalAmount = approved.reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
  console.log('Total amount:', totalAmount);
  
  return {
    totalDonations: donations.length,
    approvedCount: approved.length,
    totalAmount: totalAmount,
    statuses: donations.map(d => d.Status)
  };
}

/**
 * FIX: แก้ไขเบอร์โทรศัพท์เก่าให้มี ' นำหน้า
 * เรียกใช้ใน Script Editor: เลือก fixPhoneNumbers แล้วกด Run
 * 
 * ฟังก์ชันนี้จะ:
 * 1. อ่านข้อมูลทั้งหมดจาก Donations sheet
 * 2. หาคอลัมน์ DonorPhone
 * 3. เพิ่ม ' นำหน้าถ้ายังไม่มี
 * 4. บันทึกกลับลง Sheet
 */
function fixPhoneNumbers() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.DONATIONS);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      console.log('No data to fix');
      return { success: true, message: 'ไม่มีข้อมูลที่ต้องแก้ไข', fixed: 0 };
    }
    
    const headers = data[0];
    const phoneColIndex = headers.indexOf('DonorPhone');
    
    if (phoneColIndex === -1) {
      console.log('DonorPhone column not found');
      return { success: false, message: 'ไม่พบคอลัมน์ DonorPhone' };
    }
    
    let fixedCount = 0;
    
    // Loop through each row (skip header)
    for (let i = 1; i < data.length; i++) {
      let phone = data[i][phoneColIndex];
      
      // Skip if empty
      if (!phone) continue;
      
      // Convert to string
      let phoneStr = String(phone);
      
      // Check if already has apostrophe prefix
      if (phoneStr.startsWith("'")) {
        console.log(`Row ${i + 1}: Already has prefix: ${phoneStr}`);
        continue;
      }
      
      // Add apostrophe prefix
      const newPhone = "'" + phoneStr;
      
      // Update the cell (column is 1-indexed)
      sheet.getRange(i + 1, phoneColIndex + 1).setValue(newPhone);
      
      console.log(`Row ${i + 1}: Fixed ${phoneStr} -> ${newPhone}`);
      fixedCount++;
    }
    
    console.log(`Fixed ${fixedCount} phone numbers`);
    
    return { 
      success: true, 
      message: `แก้ไขเบอร์โทรศัพท์เรียบร้อย ${fixedCount} รายการ`,
      fixed: fixedCount
    };
  } catch (error) {
    console.error('fixPhoneNumbers error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * TEST: ทดสอบระบบ Auto-approve
 * เรียกใช้ใน Script Editor: เลือก testAutoApprove แล้วกด Run
 */
function testAutoApprove() {
  const settings = getSettings();
  
  console.log('=== Auto-Approve Settings ===');
  console.log('AutoApproveEnabled:', settings.AutoApproveEnabled);
  console.log('AutoApproveAll:', settings.AutoApproveAll);
  console.log('AutoApproveAmount:', settings.AutoApproveAmount);
  console.log('AutoApproveWithSlip:', settings.AutoApproveWithSlip);
  console.log('AutoApproveReturning:', settings.AutoApproveReturning);
  
  // ทดสอบกับข้อมูลจำลอง
  const testData = {
    Amount: 100,
    SlipUrl: '',
    DonorPhone: '0812345678'
  };
  
  console.log('\n=== Test Data ===');
  console.log('Amount:', testData.Amount);
  console.log('SlipUrl:', testData.SlipUrl);
  console.log('DonorPhone:', testData.DonorPhone);
  
  const result = shouldAutoApprove(testData);
  console.log('\n=== Result ===');
  console.log('Should Auto-approve:', result);
  
  return {
    settings: {
      AutoApproveEnabled: settings.AutoApproveEnabled,
      AutoApproveAll: settings.AutoApproveAll,
      AutoApproveAmount: settings.AutoApproveAmount,
      AutoApproveWithSlip: settings.AutoApproveWithSlip,
      AutoApproveReturning: settings.AutoApproveReturning
    },
    testData: testData,
    result: result
  };
}

/**
 * ดึงข้อมูลสรุปผู้บริจาค (Task 2)
 */
function getDonorsSummary(filter = {}) {
  try {
    const donations = getDonations();
    const approvedOnly = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
    
    const donorGroups = {};
    approvedOnly.forEach(d => {
      const phone = String(d.DonorPhone || '').replace(/^'/, '').trim();
      const name = String(d.DonorName || '').trim();
      const key = phone ? ('phone:' + phone) : ('name:' + name);
      
      if (!donorGroups[key]) {
        donorGroups[key] = {
          name: name || 'ไม่ประสงค์ออกนาม',
          phone: phone,
          count: 0,
          totalAmount: 0,
          lastDonationDate: d.Timestamp,
          donations: []
        };
      }
      
      donorGroups[key].count++;
      donorGroups[key].totalAmount += parseFloat(d.Amount) || 0;
      donorGroups[key].donations.push({
        id: d.ID,
        timestamp: d.Timestamp,
        timestampFormatted: d.TimestampFormatted,
        amount: d.Amount,
        bankDisplayName: d.BankDisplayName,
        bankColor: d.BankColor,
        slipUrl: d.SlipUrl,
        status: d.Status,
        note: d.Note
      });
      
      if (new Date(d.Timestamp) > new Date(donorGroups[key].lastDonationDate)) {
        donorGroups[key].lastDonationDate = d.Timestamp;
      }
    });
    
    let donors = Object.values(donorGroups);
    
    donors.forEach(donor => {
      donor.lastDonationDateFormatted = formatThaiDate(donor.lastDonationDate);
      donor.donations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });
    
    // Apply search filter
    if (filter.search) {
      const searchLower = String(filter.search).toLowerCase();
      donors = donors.filter(d => 
        d.name.toLowerCase().includes(searchLower) ||
        d.phone.includes(searchLower)
      );
    }
    
    // Apply tab filters
    if (filter.type === 'returning') {
      donors = donors.filter(d => d.count > 1);
    }
    
    // Apply sorting
    if (filter.type === 'top') {
      donors.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (filter.type === 'recent') {
      donors.sort((a, b) => new Date(b.lastDonationDate) - new Date(a.lastDonationDate));
    } else {
      // Default: recent
      donors.sort((a, b) => new Date(b.lastDonationDate) - new Date(a.lastDonationDate));
    }
    
    return donors;
  } catch (error) {
    console.error('getDonorsSummary error:', error);
    return [];
  }
}

/**
 * ฟังก์ชันสำหรับรัน Unit Test ระบบเพื่อตรวจเช็คการทำงานของ flow ข้อมูลและการล้าง Cache
 */
function runAppTests() {
  console.log('=== เริ่มต้นการทดสอบระบบ (Sync Fix Unit Tests) ===');
  
  // 1. สำรองข้อมูล Settings ปัจจุบัน
  console.log('1. กำลังสำรองข้อมูล Settings ปัจจุบัน...');
  let originalSettings = null;
  try {
    originalSettings = getSettings();
    console.log('   - สำรองข้อมูล Settings สำเร็จ');
  } catch (e) {
    console.error('   - เกิดข้อผิดพลาดในการสำรองข้อมูล:', e);
    return;
  }
  
  try {
    // 2. ทดสอบการล้าง Cache
    console.log('2. ทดสอบการล้าง Cache (clearAppCache)...');
    clearAppCache();
    console.log('   - เรียกใช้งาน clearAppCache() สำเร็จโดยไม่มีข้อผิดพลาด');
    
    // 3. ทดสอบบันทึก Settings แบบปลอดภัย (ไม่เคลียร์ชีต)
    console.log('3. ทดสอบการบันทึก Settings (saveSettings)...');
    const testData = {
      ProjectName: 'โครงการทดสอบระบบอัตโนมัติ',
      ProjectDescription: 'รายละเอียดสำหรับการทดสอบระบบ',
      TargetAmount: '1,500,000', // ทดสอบการจัดการลูกน้ำ
      Tags: '#TestTag',
      ProjectCoverUrl: 'https://images.unsplash.com/photo-test'
    };
    
    const saveResult = saveSettings(testData);
    if (!saveResult.success) {
      throw new Error('การบันทึกการตั้งค่าล้มเหลว: ' + saveResult.message);
    }
    console.log('   - บันทึก Settings จำลองสำเร็จ:', JSON.stringify(saveResult));
    
    // 4. ทดสอบความถูกต้องหลังบันทึก
    console.log('4. ตรวจสอบการดึงข้อมูลโครงการและล้าง cache หลังบันทึก...');
    const updatedSettings = getSettings();
    
    if (updatedSettings.ProjectName !== testData.ProjectName) {
      throw new Error('ชื่อโครงการไม่อัปเดต! ได้รับ: ' + updatedSettings.ProjectName);
    }
    if (updatedSettings.ProjectDescription !== testData.ProjectDescription) {
      throw new Error('รายละเอียดโครงการไม่อัปเดต!');
    }
    const cleanUpdatedTarget = String(updatedSettings.TargetAmount || '').replace(/,/g, '');
    const cleanTestTarget = String(testData.TargetAmount || '').replace(/,/g, '');
    if (cleanUpdatedTarget !== cleanTestTarget) {
      throw new Error('TargetAmount ไม่อัปเดต! ได้รับ: ' + updatedSettings.TargetAmount);
    }
    console.log('   - ข้อมูลการตั้งค่าอัปเดตและดึงขึ้นมาถูกต้อง');
    
    // 5. ทดสอบการแปลงค่า TargetAmount และ Progress
    console.log('5. ทดสอบการแปลงยอดเงินเป้าหมายและลบจุลภาค (TargetAmount Parsing)...');
    const stats = getDashboardStats();
    if (stats.targetAmount !== 1500000) {
      throw new Error('แปลง TargetAmount ผิดพลาด! ควรเป็น 1500000 แต่ได้รับ: ' + stats.targetAmount);
    }
    console.log('   - แปลงเป้าหมายบริจาค "1,500,000" เป็นตัวเลข 1500000 สำเร็จ');
    if (isNaN(stats.progress) || stats.progress < 0 || stats.progress > 100) {
      throw new Error('คำนวณ progress ผิดพลาด! progress: ' + stats.progress);
    }
    console.log('   - คำนวณ progress และยอดเงินคงเหลือถูกต้อง ปลอดภัยจาก NaN');
    
    // 6. ทดสอบการดึงข้อมูลเพื่อแสดงผลหน้า Public (getPublicProjectInfo)
    console.log('6. ทดสอบโครงสร้างข้อมูล getPublicProjectInfo()...');
    const publicInfo = getPublicProjectInfo();
    if (!publicInfo) {
      throw new Error('getPublicProjectInfo() คืนค่า null!');
    }
    if (!publicInfo.project || publicInfo.project.name !== testData.ProjectName) {
      throw new Error('getPublicProjectInfo project name ไม่ถูกต้อง!');
    }
    if (publicInfo.stats.targetAmount !== 1500000) {
      throw new Error('getPublicProjectInfo stats targetAmount ไม่ถูกต้อง!');
    }
    console.log('   - โครงสร้างข้อมูล publicInfo ครบถ้วน ถูกต้องตามสัญญา API');
    
    console.log('✔ การทดสอบทั้งหมดผ่านการตรวจสอบเรียบร้อย (ALL TESTS PASSED)');
  } catch (error) {
    console.error('❌ การทดสอบล้มเหลว:', error.message);
  } finally {
    // 7. คืนค่าข้อมูลดั้งเดิมเพื่อความปลอดภัย
    if (originalSettings) {
      console.log('7. กำลังคืนค่าข้อมูล Settings ดั้งเดิมกลับสู่ตารางเพื่อความปลอดภัย...');
      try {
        saveSettings(originalSettings);
        console.log('   - คืนค่าข้อมูลเดิมเรียบร้อย');
      } catch (e) {
        console.error('   - เกิดข้อผิดพลาดในการคืนค่าข้อมูลเดิม:', e);
      }
    }
    console.log('=== จบการทดสอบระบบ ===');
  }
}

// ===== PDF REPORT GENERATION MODULE =====

const REPORT_CONFIG = {
  TEMPLATE_ID: '1lfvdHjb7yhoMPz2VWBpLF9i5Kx58xChBB0eaUiMkQo0',
  OUTPUT_FOLDER_ID: '1YnyL85nxKQ5zuA5HFB1-XNqR7Ytgc-jN',
  ROWS_PER_PAGE: 25,
  REPORT_FOLDER_NAME: 'report',
  VERSION: '1.0.0'
};

const REPORT_LAYOUT = {
  PT_PER_CM: 28.3464567,
  MARGIN_TOP_CM: 1.5,
  MARGIN_BOTTOM_CM: 1.5,
  MARGIN_LEFT_CM: 1.8,
  MARGIN_RIGHT_CM: 1.8,
  FONT_FAMILY: 'TH Sarabun New',
  TITLE_FONT_SIZE: 18,
  SECTION_FONT_SIZE: 16,
  BODY_FONT_SIZE: 13,
  TABLE_FONT_SIZE: 13,
  FOOTER_FONT_SIZE: 10,
  MIN_FONT_SIZE: 13,
  FOOTER_HEIGHT_PT: 72
};

/**
 * ฟังก์ชันหลักในการสร้างรายงาน PDF
 */
function generateDonationReport(options = {}, session) {
  if (session && typeof session === 'object' && session.sessionToken) {
    requirePermission(session, 'report.export');
  } else {
    const settings = getSettings();
    if (settings.AdminPassword) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ (Unauthorized)');
    }
  }
  try {
    console.log(`[Report Gen] Starting PDF Report Generation...`);
    console.log(`[Report Gen] Google Docs Template ID: ${REPORT_CONFIG.TEMPLATE_ID}`);
    
    const now = new Date();
    const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const fileName = `Donation_Report_${timestamp}.pdf`;
    
    // 1. รวบรวมข้อมูลทั้งหมด
    const reportData = collectReportData(options);
    
    // 2. คัดลอก Template Google Docs
    const templateFile = DriveApp.getFileById(REPORT_CONFIG.TEMPLATE_ID);
    const tempFile = templateFile.makeCopy('temp_report_' + timestamp);
    const documentId = tempFile.getId();
    console.log(`[Report Gen] Copied Google Doc ID: ${documentId}`);
    
    const document = DocumentApp.openById(documentId);
    
    // 3. สร้างเนื้อหาใน Temp Doc ใหม่เพื่อไม่รับ page break/footer body จาก template
    buildGoogleDocDonationReport(document, reportData, options);
    
    // 4. บันทึกเอกสารและหน่วงเวลาเพื่อป้องกันการดีเลย์
    document.saveAndClose();
    Utilities.sleep(1000);
    
    // 5. Export เป็น PDF
    const pdfBlob = exportGoogleDocToPdf(documentId, fileName);
    
    // 6. บันทึกไฟล์ลงโฟลเดอร์ปลายทาง
    const reportFolder = getOrCreateReportFolder();
    const pdfFile = reportFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    console.log(`[Report Gen] PDF File ID: ${pdfFile.getId()}`);
    
    // 7. ลบไฟล์ Google Docs จำลอง
    try {
      tempFile.setTrashed(true);
    } catch (e) {
      console.warn('Failed to delete temp doc:', e);
    }
    
    return {
      success: true,
      pdfId: pdfFile.getId(),
      pdfUrl: pdfFile.getUrl(),
      fileName: fileName
    };
    
  } catch (error) {
    console.error('generateDonationReport error:', error);
    return {
      success: false,
      message: error.message || 'เกิดข้อผิดพลาดในการสร้างรายงาน PDF'
    };
  }
}

/**
 * รวบรวมและจัดรูปแบบข้อมูลสำหรับสร้างรายงาน
 */
function collectReportData(options) {
  const settings = getSettings();
  const dashboard = getDashboardDataAll();
  let donations = getDonations();
  
  // กรองข้อมูลช่วงเวลา
  let startDateText = 'ตั้งแต่เริ่มโครงการ';
  let endDateText = 'ปัจจุบัน';
  
  if (options.startDate) {
    const start = new Date(options.startDate);
    start.setHours(0, 0, 0, 0);
    donations = donations.filter(d => {
      const date = d.TransferDate ? new Date(d.TransferDate) : new Date(d.Timestamp);
      return date >= start;
    });
    startDateText = formatThaiDate(options.startDate);
  }
  
  if (options.endDate) {
    const end = new Date(options.endDate);
    end.setHours(23, 59, 59, 999);
    donations = donations.filter(d => {
      const date = d.TransferDate ? new Date(d.TransferDate) : new Date(d.Timestamp);
      return date <= end;
    });
    endDateText = formatThaiDate(options.endDate);
  }
  
  // เรียงข้อมูลผู้บริจาคใหม่ ตามวันที่ทำรายการ (เก่าไปใหม่) สำหรับหน้ารายละเอียด
  donations.sort((a, b) => {
    const dateA = a.TransferDate ? new Date(a.TransferDate) : new Date(a.Timestamp);
    const dateB = b.TransferDate ? new Date(b.TransferDate) : new Date(b.Timestamp);
    return dateA - dateB;
  });
  
  const reportPeriod = options.startDate || options.endDate 
    ? `${startDateText} ถึง ${endDateText}`
    : 'ข้อมูลทั้งหมด ณ ปัจจุบัน';
    
  const topDonorsLimit = getTopDonors(10);
  
  const approvedFiltered = donations.filter(d => (d.Status || '').toLowerCase() === 'approved');
  const eventPeriodAmount = approvedFiltered
    .filter(d => d.DonationPhase === 'EVENT_PERIOD')
    .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
  const postEventAmount = approvedFiltered
    .filter(d => d.DonationPhase === 'POST_EVENT')
    .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
  const additionalCount = approvedFiltered
    .filter(d => d.ContributionType === 'ADDITIONAL')
    .length;

  return {
    projectName: settings.ProjectName || 'โครงการบริจาค',
    projectDescription: settings.ProjectDescription || 'ไม่มีรายละเอียดโครงการ',
    projectType: settings.ProjectType || 'การศึกษา & เยาวชน',
    reportDate: formatThaiDate(new Date()),
    reportPeriod: reportPeriod,
    totalAmount: formatNumberForReport(dashboard.stats.totalAmount),
    totalDonors: dashboard.stats.totalDonors,
    totalRecords: donations.length,
    targetAmount: formatNumberForReport(dashboard.stats.targetAmount),
    progress: dashboard.stats.progress,
    summary: generateExecutiveSummary(dashboard.stats, settings, donations),
    topDonorTableText: formatTopDonorsTable(topDonorsLimit),
    contactPerson: settings.ContactPerson || '-',
    contactPhone: settings.ContactPhone || '-',
    contactEmail: settings.ContactEmail || '-',
    contactPosition: settings.ContactPosition || '-',
    contactOrganization: settings.ContactOrganization || '-',
    contactAttendanceType: settings.ContactAttendanceType || '-',
    note: options.note || '-',
    publicUrl: 'https://donation-system-beige.vercel.app',
    chartData: dashboard.chartData || null,
    donations: donations,
    settings: settings,
    eventPeriodAmount: formatNumberForReport(eventPeriodAmount),
    postEventAmount: formatNumberForReport(postEventAmount),
    additionalCount: additionalCount
  };
}

/**
 * แทนที่ Placeholders ข้อความใน Presentation ทั้งหมด
 */
function replaceTextPlaceholders(presentation, data) {
  const mappings = {
    '{{PROJECT_NAME}}': data.projectName,
    '{{PROJECT_DESCRIPTION}}': data.projectDescription,
    '{{PROJECT_TYPE}}': data.projectType,
    '{{REPORT_DATE}}': data.reportDate,
    '{{REPORT_PERIOD}}': data.reportPeriod,
    '{{TOTAL_AMOUNT}}': data.totalAmount + ' บาท',
    '{{TOTAL_DONORS}}': data.totalDonors + ' คน',
    '{{TOTAL_RECORDS}}': data.totalRecords + ' รายการ',
    '{{TARGET_AMOUNT}}': data.targetAmount + ' บาท',
    '{{PROGRESS}}': data.progress + '%',
    '{{SUMMARY}}': data.summary,
    '{{TOP_DONOR_TABLE}}': data.topDonorTableText,
    '{{CONTACT_PERSON}}': data.contactPerson,
    '{{CONTACT_PHONE}}': data.contactPhone,
    '{{CONTACT_EMAIL}}': data.contactEmail,
    '{{PUBLIC_URL}}': data.publicUrl,
    '{{NOTE}}': data.note
  };
  
  Object.keys(mappings).forEach(placeholder => {
    replaceAllTextInPresentation(presentation, placeholder, mappings[placeholder]);
  });
}

/**
 * แทนที่และแทรกรูปภาพ (Logo, Project Image, Chart, QR Code)
 */
function replaceImagePlaceholders(presentation, reportData, options) {
  const slides = presentation.getSlides();
  if (slides.length === 0) return;
  
  const slide1 = slides[0];
  const slide2 = slides.length > 1 ? slides[1] : null;
  
  // 1. Logo
  const logoBlob = getLogoBlob(reportData.settings);
  if (logoBlob) {
    replaceImagePlaceholder(slide1, 'LOGO', logoBlob);
  } else {
    slide1.replaceAllText('LOGO', '');
  }
  
  // 2. Project Image (Cover Image)
  const projectImageBlob = getLogoBlob(reportData.settings);
  let replacedCover = false;
  if (projectImageBlob) {
    replacedCover = replaceImagePlaceholder(slide1, '{{PROJECT_IMAGE}}', projectImageBlob);
    if (!replacedCover && slide2) {
      replacedCover = replaceImagePlaceholder(slide2, '{{PROJECT_IMAGE}}', projectImageBlob);
    }
  }
  if (!replacedCover) {
    presentation.replaceAllText('{{PROJECT_IMAGE}}', 'ไม่มีรูปภาพโครงการ');
  }
  
  // 3. Chart
  if (options.chartImageBase64) {
    const chartBlob = getBlobFromBase64(options.chartImageBase64, 'chart.png');
    replaceImagePlaceholder(slide1, '{{CHART_IMAGE}}', chartBlob);
  } else {
    presentation.replaceAllText('{{CHART_IMAGE}}', 'ไม่มีข้อมูลกราฟ');
  }
  
  // 4. QR Code
  if (slide2) {
    const qrBlob = getQRCodeBlob();
    if (qrBlob) {
      replaceImagePlaceholder(slide2, '{{QR_CODE}}', qrBlob);
    } else {
      presentation.replaceAllText('{{QR_CODE}}', 'ไม่มี QR Code');
    }
  }
}

/**
 * ทำการ duplicate slide 3 และกรอกข้อมูลผู้บริจาคแบบแบ่งหน้า
 */
function buildDonationDetailSlides(presentation, donations, reportPeriod) {
  const slides = presentation.getSlides();
  if (slides.length < 3) return;
  
  const detailTemplate = slides[2]; // Slide 3 (0-based)
  const pageSize = REPORT_CONFIG.ROWS_PER_PAGE || 25;
  const chunks = chunkArray(donations, pageSize);
  
  if (chunks.length === 0) {
    // ถ้าไม่มีข้อมูลผู้บริจาคเลย
    fillDonationDetailSlide(detailTemplate, [], 0, pageSize, reportPeriod);
    return;
  }
  
  // สร้างและเก็บสไลด์ทั้งหมดที่ต้องใช้
  const detailSlides = [detailTemplate];
  let lastSlide = detailTemplate;
  for (let i = 1; i < chunks.length; i++) {
    const dup = lastSlide.duplicate();
    lastSlide = dup;
    detailSlides.push(dup);
  }
  
  chunks.forEach((chunk, pageIndex) => {
    const slide = detailSlides[pageIndex];
    fillDonationDetailSlide(slide, chunk, pageIndex, pageSize, reportPeriod);
  });
}

/**
 * กรอกรายละเอียดข้อความลงในสไลด์ตารางผู้บริจาค
 */
function fillDonationDetailSlide(slide, rows, pageIndex, pageSize, reportPeriod) {
  slide.replaceAllText('{{REPORT_PERIOD}}', reportPeriod || '-');
  
  for (let i = 1; i <= pageSize; i++) {
    const row = rows[i - 1];
    const no = String(i).padStart(2, '0');
    
    if (row) {
      let dateVal = '-';
      if (row.TransferDate) {
        dateVal = formatThaiDate(row.TransferDate);
      } else if (row.Timestamp) {
        dateVal = formatThaiDate(row.Timestamp);
      }
      
      const displayNo = String(pageIndex * pageSize + i);
      const nameVal = row.DonorName || 'ไม่ประสงค์ออกนาม';
      const bankVal = row.BankDisplayName || '-';
      const amountVal = formatNumberForReport(row.Amount);
      const statusVal = translateStatus(row.Status);
      
      replaceAllTextInSlide(slide, `{{NO_${no}}}`, displayNo);
      replaceAllTextInSlide(slide, `{{DATE_${no}}}`, dateVal);
      replaceAllTextInSlide(slide, `{{NAME_${no}}}`, nameVal);
      replaceAllTextInSlide(slide, `{{PHONE_${no}}}`, '');
      replaceAllTextInSlide(slide, `{{BANK_${no}}}`, bankVal);
      replaceAllTextInSlide(slide, `{{AMOUNT_${no}}}`, amountVal);
      replaceAllTextInSlide(slide, `{{STATUS_${no}}}`, statusVal);
    } else {
      // แถวที่ไม่มีข้อมูล ให้แทนค่าด้วยช่องว่าง
      // หากหน้าแรก 0 รายการ ให้แสดงข้อความแจ้งแถวแรก
      if (rows.length === 0 && i === 1) {
        replaceAllTextInSlide(slide, `{{NO_${no}}}`, '-');
        replaceAllTextInSlide(slide, `{{DATE_${no}}}`, '-');
        replaceAllTextInSlide(slide, `{{NAME_${no}}}`, 'ไม่มีข้อมูลผู้บริจาคในช่วงเวลาที่เลือก');
        replaceAllTextInSlide(slide, `{{PHONE_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{BANK_${no}}}`, '-');
        replaceAllTextInSlide(slide, `{{AMOUNT_${no}}}`, '-');
        replaceAllTextInSlide(slide, `{{STATUS_${no}}}`, '-');
      } else {
        replaceAllTextInSlide(slide, `{{NO_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{DATE_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{NAME_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{PHONE_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{BANK_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{AMOUNT_${no}}}`, '');
        replaceAllTextInSlide(slide, `{{STATUS_${no}}}`, '');
      }
    }
  }
}

/**
 * อัปเดตเลขหน้า {{PAGE}} / {{TOTAL_PAGES}} ของสไลด์ทุกหน้า
 */
function updateFooterPageNumbers(presentation) {
  const slides = presentation.getSlides();
  const totalPages = slides.length;
  
  slides.forEach((slide, idx) => {
    replaceAllTextInSlide(slide, '{{PAGE}}', String(idx + 1));
    replaceAllTextInSlide(slide, '{{TOTAL_PAGES}}', String(totalPages));
  });
}

/**
 * ส่งออก Google Slides เป็นไฟล์ PDF Blob
 */
function exportSlidesToPdf(presentationId, fileName) {
  const url = 'https://docs.google.com/presentation/d/' + presentationId + '/export/pdf';
  const response = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error('ไม่สามารถแปลงรายงานเป็น PDF ได้: ' + response.getContentText());
  }
  
  const blob = response.getBlob().setName(fileName);
  return blob;
}

/**
 * ส่งออก Google Docs เป็นไฟล์ PDF Blob
 */
function exportGoogleDocToPdf(documentId, fileName) {
  const url = 'https://docs.google.com/document/d/' + documentId + '/export?format=pdf';
  const response = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error('ไม่สามารถแปลงรายงานเป็น PDF ได้: ' + response.getContentText());
  }
  
  return response.getBlob().setName(fileName);
}

/**
 * ค้นหาหรือสร้างโฟลเดอร์ report ในโฟลเดอร์หลักของระบบ
 */
function getOrCreateReportFolder() {
  if (REPORT_CONFIG.OUTPUT_FOLDER_ID) {
    return DriveApp.getFolderById(REPORT_CONFIG.OUTPUT_FOLDER_ID);
  }
  
  const parentFolder = getUploadFolder();
  const folders = parentFolder.getFoldersByName(REPORT_CONFIG.REPORT_FOLDER_NAME || 'report');
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    const newFolder = parentFolder.createFolder(REPORT_CONFIG.REPORT_FOLDER_NAME || 'report');
    return newFolder;
  }
}

/**
 * สร้างรายงานใน Google Docs temp file แบบ flow layout เพื่อกัน footer ลอยและ page break เกิน
 */
function buildGoogleDocDonationReport(document, data, options) {
  const body = document.getBody();
  body.clear();
  normalizeDocumentPageSetup(body);
  
  const imageBlobs = getReportImageBlobs(data, options);
  appendExecutiveSummaryPage(body, data, imageBlobs);
  appendProjectInformationPage(body, data, imageBlobs);
  body.appendPageBreak();
  appendDonationDetailPage(body, data);
}

function normalizeDocumentPageSetup(body) {
  try {
    body.setPageWidth(595.28);
    body.setPageHeight(841.89);
    body.setMarginTop(72);
    body.setMarginBottom(72);
    body.setMarginLeft(72);
    body.setMarginRight(72);
  } catch (e) {
    console.warn('[Report Gen] Unable to set page setup:', e);
  }
}

function getReportImageBlobs(data, options) {
  options = options || {};
  const projectImageBlob = getValidatedReportImageBlob(getLogoBlob(data.settings), 'PROJECT_IMAGE');
  const qrBlob = getValidatedReportImageBlob(getQRCodeBlob(), 'QR_CODE');
  const chartBlob = hasSufficientReportChartData(data) ? (
    getValidatedReportImageBlob(
      options.chartImageBase64 ? getBlobFromBase64(options.chartImageBase64, 'chart.png') : null,
      'CHART_IMAGE'
    ) || createFallbackDonationChartBlob(data)
  ) : null;
  
  return {
    projectImage: projectImageBlob,
    qr: qrBlob,
    chart: chartBlob
  };
}

function hasSufficientReportChartData(data) {
  const values = data && data.chartData && Array.isArray(data.chartData.data)
    ? data.chartData.data.map(value => parseReportNumber(value))
    : [];
  const nonZeroValues = values.filter(value => value > 0);
  return values.length > 1 && nonZeroValues.length > 0;
}

function getValidatedReportImageBlob(blob, label) {
  if (!blob) {
    console.warn(`[Report Gen] ${label} blob is null`);
    return null;
  }
  
  const contentType = blob.getContentType();
  const byteLength = blob.getBytes().length;
  console.log(`[Report Gen] ${label} contentType=${contentType}, bytes=${byteLength}`);
  
  if (byteLength <= 0) {
    console.warn(`[Report Gen] ${label} blob is empty`);
    return null;
  }
  
  if (contentType !== 'image/png' && contentType !== 'image/jpeg' && contentType !== 'image/jpg') {
    console.warn(`[Report Gen] ${label} unsupported contentType=${contentType}`);
    return null;
  }
  
  return blob;
}

function createFallbackDonationChartBlob(data) {
  try {
    const chartData = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, 'รายการ')
      .addColumn(Charts.ColumnType.NUMBER, 'จำนวนเงิน')
      .addRow(['ยอดบริจาค', parseReportNumber(data.totalAmount)])
      .addRow(['เป้าหมาย', parseReportNumber(data.targetAmount)])
      .build();
    
    const chart = Charts.newBarChart()
      .setDataTable(chartData)
      .setDimensions(640, 240)
      .setLegendPosition(Charts.Position.NONE)
      .setTitle('Donation Summary')
      .build();
    
    const blob = chart.getAs('image/png').setName('donation-chart.png');
    return getValidatedReportImageBlob(blob, 'CHART_IMAGE_FALLBACK');
  } catch (e) {
    console.error('[Report Gen] Failed to create fallback chart:', e);
    return null;
  }
}

function parseReportNumber(value) {
  const num = parseFloat(String(value || '0').replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function appendExecutiveSummaryPage(body, data, images) {
  appendReportParagraph(body, 'มหาวิทยาลัยสวนดุสิต ศูนย์การศึกษาลำปาง', 12, false, DocumentApp.HorizontalAlignment.CENTER);
  appendReportParagraph(body, 'SDU Lampang Online Donation System', 12, false, DocumentApp.HorizontalAlignment.CENTER);
  const reportTitle = appendReportParagraph(body, 'DONATION SUMMARY REPORT', REPORT_LAYOUT.TITLE_FONT_SIZE, true, DocumentApp.HorizontalAlignment.CENTER);
  reportTitle.setSpacingBefore(2).setSpacingAfter(4);
  appendReportParagraph(body, 'วันที่ออกรายงาน : ' + data.reportDate, 12, false, DocumentApp.HorizontalAlignment.CENTER);
  appendReportSpacer(body, 2);
  
  appendReportHeading(body, 'ข้อมูลโครงการ');
  appendReportLabelValue(body, 'ชื่อโครงการ', data.projectName);
  appendReportLabelValue(body, 'รายละเอียดโครงการ', data.projectDescription);
  
  appendReportHeading(body, 'รูปภาพโครงการ');
  appendReportImage(body, images.projectImage, 326, 112, 'ไม่มีรูปภาพโครงการ');
  
  appendReportHeading(body, 'Summary');
  const summaryTable = body.appendTable([
    ['💰 ยอดเงินบริจาครวมทั้งหมด', data.totalAmount + ' บาท'],
    ['📅 ยอดระหว่างกิจกรรม', data.eventPeriodAmount + ' บาท'],
    ['🕒 ยอดหลังจบกิจกรรม', data.postEventAmount + ' บาท'],
    ['➕ จำนวนรายการสนับสนุนเพิ่มเติม', data.additionalCount + ' รายการ'],
    ['👥 ผู้บริจาคทั้งหมด', data.totalDonors + ' คน'],
    ['🧾 จำนวนรายการ', data.totalRecords + ' รายการ'],
    ['🎯 เป้าหมาย', data.targetAmount + ' บาท'],
    ['📈 ความสำเร็จ', data.progress + '%']
  ]);
  styleCompactReportTable(summaryTable, false);
  
  appendReportHeading(body, 'Chart');
  appendReportImage(body, images.chart, 340, 113, 'ข้อมูลยังไม่เพียงพอสำหรับสร้างกราฟ', 13);
  
  appendReportHeading(body, 'Executive Summary');
  const summaryParagraph = appendReportParagraph(body, data.summary, 13, false, DocumentApp.HorizontalAlignment.LEFT);
  try {
    summaryParagraph.setIndentFirstLine(REPORT_LAYOUT.PT_PER_CM * 0.5);
    summaryParagraph.setIndentEnd(96);
  } catch (e) { /* best-effort */ }
}

function appendProjectInformationPage(body, data, images) {
  const sectionTitle = appendReportParagraph(body, 'PROJECT INFORMATION', REPORT_LAYOUT.SECTION_FONT_SIZE, true, DocumentApp.HorizontalAlignment.CENTER);
  sectionTitle.setSpacingBefore(4).setSpacingAfter(5);
  appendReportSpacer(body, 2);
  
  appendReportHeading(body, 'ข้อมูลโครงการ');
  const projectTable = body.appendTable([
    ['ชื่อโครงการ', data.projectName],
    ['ประเภทโครงการ', data.projectType],
    ['เป้าหมาย', data.targetAmount + ' บาท'],
    ['ช่วงเวลารายงาน', data.reportPeriod],
    ['เว็บไซต์', formatReportUrlForWrap(data.publicUrl)]
  ]);
  styleCompactReportTable(projectTable, false);
  
  appendReportHeading(body, 'QR Code');
  appendReportImage(body, images.qr, 113, 113, 'ไม่มี QR Code');
  appendReportParagraph(body, 'สแกนเพื่อเข้าหน้าโครงการ', REPORT_LAYOUT.BODY_FONT_SIZE, false, DocumentApp.HorizontalAlignment.CENTER);
  
  appendReportHeading(body, 'ผู้ประสานงาน');
  const contactTable = body.appendTable([
    ['ชื่อ', data.contactPerson],
    ['โทรศัพท์', data.contactPhone],
    ['Email', data.contactEmail],
    ['เข้าร่วมกิจกรรม', data.contactAttendanceType]
  ]);
  styleCompactReportTable(contactTable, false);
  
  appendReportHeading(body, 'หมายเหตุ');
  appendReportParagraph(body, normalizeReportNote(data.note), 15, false, DocumentApp.HorizontalAlignment.LEFT);
}

function appendDonationDetailPage(body, data) {
  const rowsPerPage = REPORT_CONFIG.ROWS_PER_PAGE || 25;
  const totalPagesEstimate = Math.max(3, 2 + Math.ceil((data.donations || []).length / rowsPerPage));
  
  const sectionTitle = appendReportParagraph(body, 'DONATION DETAIL', REPORT_LAYOUT.SECTION_FONT_SIZE, true, DocumentApp.HorizontalAlignment.CENTER);
  sectionTitle.setSpacingBefore(4).setSpacingAfter(5);
  appendReportSpacer(body, 2);
  appendReportLabelValue(body, 'ช่วงข้อมูล', data.reportPeriod);
  
  const tableData = buildDonationTableData(data.donations || []);
  const table = body.appendTable(tableData);
  styleDonationDetailTable(table);
  appendFinalReportFooter(body, data, totalPagesEstimate);
}

function appendReportHeading(body, text) {
  const paragraph = appendReportParagraph(body, text, 12, true, DocumentApp.HorizontalAlignment.LEFT);
  paragraph.setSpacingBefore(text === 'Executive Summary' ? 5 : 2).setSpacingAfter(2);
  return paragraph;
}

function appendReportLabelValue(body, label, value) {
  const textValue = String(value || '-');
  const paragraph = appendReportParagraph(body, label + '\n' + textValue, REPORT_LAYOUT.BODY_FONT_SIZE, false, DocumentApp.HorizontalAlignment.LEFT);
  paragraph.setSpacingBefore(0).setSpacingAfter(1);
  const text = paragraph.editAsText();
  const labelLen = String(label).length;
  text.setFontSize(0, Math.max(0, labelLen - 1), 12);
  text.setBold(0, Math.max(0, labelLen - 1), false);
  if (textValue.length > 0) {
    const valueStart = labelLen + 1; // +1 for the \n
    text.setFontSize(valueStart, valueStart + textValue.length - 1, REPORT_LAYOUT.BODY_FONT_SIZE);
    text.setBold(valueStart, valueStart + textValue.length - 1, false);
  }
  return paragraph;
}

function appendReportParagraph(body, text, fontSize, bold, alignment) {
  const paragraph = body.appendParagraph(String(text || ''));
  paragraph.setAlignment(alignment || DocumentApp.HorizontalAlignment.LEFT);
  paragraph.setSpacingBefore(0).setSpacingAfter(1).setLineSpacing(1.1);
  paragraph.editAsText()
    .setFontFamily(REPORT_LAYOUT.FONT_FAMILY)
    .setFontSize(fontSize)
    .setBold(!!bold);
  return paragraph;
}

function appendReportSpacer(body, fontSize) {
  appendReportParagraph(body, '', fontSize || 4, false, DocumentApp.HorizontalAlignment.LEFT);
}

function appendReportImage(body, imageBlob, maxWidth, maxHeight, fallbackText, fallbackFontSize) {
  const paragraph = body.appendParagraph('');
  paragraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  paragraph.setSpacingBefore(0).setSpacingAfter(2).setLineSpacing(1);
  
  if (!imageBlob) {
    paragraph.appendText(fallbackText || '-');
    paragraph.editAsText()
      .setFontFamily(REPORT_LAYOUT.FONT_FAMILY)
      .setFontSize(fallbackFontSize || REPORT_LAYOUT.BODY_FONT_SIZE)
      .setBold(false);
    return null;
  }
  
  const image = paragraph.appendInlineImage(imageBlob);
  fitDocumentInlineImage(image, maxWidth, maxHeight);
  return image;
}

function normalizeReportNote(note) {
  const text = String(note || '').trim();
  return (!text || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined')
    ? 'ไม่มีหมายเหตุ'
    : text;
}

function formatReportUrlForWrap(url) {
  const text = String(url || '-');
  if (text === '-') return text;
  return text.replace(/([/?&=_-])/g, '$1\u200B');
}

function styleCompactReportTable(table, headerRow) {
  try {
    table.setBorderColor('#cbd5e1');
    table.setBorderWidth(0.5);
  } catch (e) {
    // Border styling is best-effort in DocumentApp.
  }
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(3).setPaddingRight(3);
      try {
        cell.setWidth(c === 0 ? 293 : 158);
        cell.setVerticalAlignment(DocumentApp.VerticalAlignment.MIDDLE);
      } catch (e) {
        // Fixed width / vertical alignment are best-effort in DocumentApp.
      }
      
      for (let i = 0; i < cell.getNumChildren(); i++) {
        const child = cell.getChild(i);
        if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
          const para = child.asParagraph();
          para.setAlignment(c === 1 ? DocumentApp.HorizontalAlignment.RIGHT : DocumentApp.HorizontalAlignment.LEFT);
          para.setSpacingBefore(1).setSpacingAfter(1).setLineSpacing(1.1);
        }
      }
      
      const text = cell.editAsText();
      const cellText = String(text.getText());
      text.setFontFamily(REPORT_LAYOUT.FONT_FAMILY);
      text.setFontSize(cellText.indexOf('http') !== -1 ? 11 : (c === 0 ? 12 : REPORT_LAYOUT.TABLE_FONT_SIZE));
      text.setBold(false);
    }
  }
}

/**
 * แทนที่ Placeholders ข้อความใน Google Docs
 */
function replaceDocumentTextPlaceholders(document, data) {
  const totalPagesEstimate = Math.max(3, 2 + Math.ceil((data.donations || []).length / (REPORT_CONFIG.ROWS_PER_PAGE || 25)));
  const mappings = {
    '{{PROJECT_NAME}}': data.projectName,
    '{{PROJECT_DESCRIPTION}}': data.projectDescription,
    '{{PROJECT_TYPE}}': data.projectType,
    '{{REPORT_DATE}}': data.reportDate,
    '{{REPORT_PERIOD}}': data.reportPeriod,
    '{{TOTAL_AMOUNT}}': data.totalAmount + ' บาท',
    '{{TOTAL_DONORS}}': data.totalDonors + ' คน',
    '{{TOTAL_RECORDS}}': data.totalRecords + ' รายการ',
    '{{TARGET_AMOUNT}}': data.targetAmount + ' บาท',
    '{{PROGRESS}}': data.progress + '%',
    '{{SUMMARY}}': data.summary,
    '{{CONTACT_PERSON}}': data.contactPerson,
    '{{CONTACT_PHONE}}': data.contactPhone,
    '{{CONTACT_EMAIL}}': data.contactEmail,
    '{{PUBLIC_URL}}': data.publicUrl,
    '{{NOTE}}': data.note,
    '{{PAGE}}': '3',
    '{{TOTAL_PAGES}}': String(totalPagesEstimate)
  };
  
  const body = document.getBody();
  Object.keys(mappings).forEach(placeholder => {
    body.replaceText(escapeReportRegex(placeholder), String(mappings[placeholder] || ''));
  });
}

/**
 * แทรกรูปภาพลงตำแหน่ง Placeholder ใน Google Docs
 */
function replaceDocumentImagePlaceholders(document, reportData, options) {
  const body = document.getBody();
  const logoBlob = getLogoBlob(reportData.settings);
  const projectImageBlob = getLogoBlob(reportData.settings);
  const chartBlob = options.chartImageBase64 ? getBlobFromBase64(options.chartImageBase64, 'chart.png') : null;
  const qrBlob = getQRCodeBlob();
  
  replaceDocumentInlineImage(body, 'LOGO', logoBlob, 80, 80, '');
  replaceDocumentInlineImage(body, '{{PROJECT_IMAGE}}', projectImageBlob, 420, 180, 'ไม่มีรูปภาพโครงการ');
  replaceDocumentInlineImage(body, '{{CHART_IMAGE}}', chartBlob, 420, 180, 'ไม่มีข้อมูลกราฟ');
  replaceDocumentInlineImage(body, '{{QR_CODE}}', qrBlob, 150, 150, 'ไม่มี QR Code');
}

function replaceDocumentInlineImage(body, placeholder, imageBlob, maxWidth, maxHeight, fallbackText) {
  const found = body.findText(escapeReportRegex(placeholder));
  if (!found) return false;
  
  const text = found.getElement().asText();
  const start = found.getStartOffset();
  const end = found.getEndOffsetInclusive();
  const parent = text.getParent();
  text.deleteText(start, end);
  
  if (!imageBlob) {
    if (fallbackText) {
      text.insertText(start, fallbackText);
    }
    return false;
  }
  
  if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
    const paragraph = parent.asParagraph();
    const image = paragraph.appendInlineImage(imageBlob);
    fitDocumentInlineImage(image, maxWidth, maxHeight);
    return true;
  }
  
  const paragraph = body.appendParagraph('');
  const image = paragraph.appendInlineImage(imageBlob);
  fitDocumentInlineImage(image, maxWidth, maxHeight);
  return true;
}

function fitDocumentInlineImage(image, maxWidth, maxHeight) {
  const width = image.getWidth();
  const height = image.getHeight();
  if (!width || !height) return;
  
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  image.setWidth(Math.max(1, Math.round(width * scale)));
  image.setHeight(Math.max(1, Math.round(height * scale)));
}

/**
 * สร้างตาราง Donation Detail จริงแทน <<DONATION_TABLE>>
 */
function insertDonationDetailTable(document, donations) {
  const body = document.getBody();
  const found = body.findText('<<DONATION_TABLE>>');
  if (!found) return false;
  
  const text = found.getElement().asText();
  const start = found.getStartOffset();
  const end = found.getEndOffsetInclusive();
  const paragraph = text.getParent().asParagraph();
  const paragraphIndex = body.getChildIndex(paragraph);
  text.deleteText(start, end);
  
  const tableData = buildDonationTableData(donations || []);
  const table = body.insertTable(paragraphIndex + 1, tableData);
  styleDonationDetailTable(table);
  return true;
}

function buildDonationTableData(donations) {
  const rows = [['ลำดับ', 'วันที่', 'ชื่อผู้บริจาค', 'ธนาคาร', 'ยอดเงิน', 'เข้าร่วมกิจกรรม', 'ลักษณะการสนับสนุน', 'ช่วงการบริจาค']];
  
  if (!donations || donations.length === 0) {
    rows.push(['-', '-', 'ไม่มีข้อมูลผู้บริจาคในช่วงเวลาที่เลือก', '-', '-', '-', '-', '-']);
    return rows;
  }
  
  donations.forEach((row, idx) => {
    let dateVal = '-';
    if (row.TransferDate) {
      dateVal = formatThaiDate(row.TransferDate);
    } else if (row.Timestamp) {
      dateVal = formatThaiDate(row.Timestamp);
    }
    
    // Backward compatibility & PostEvent check
    let attendanceTypeVal = row.AttendanceType || '-';
    if (attendanceTypeVal === 'PostEvent') {
      attendanceTypeVal = '—';
    }
    
    // Translate ContributionType
    let contributionTypeVal = 'บริจาคครั้งแรก';
    if (row.ContributionType === 'ADDITIONAL') {
      contributionTypeVal = 'สนับสนุนเพิ่มเติม';
      if (row.PreviousDonationReference) {
        contributionTypeVal += '\n(' + row.PreviousDonationReference + ')';
      }
    }
    
    // Translate DonationPhase
    let donationPhaseVal = 'กิจกรรมหลัก';
    if (row.DonationPhase === 'POST_EVENT') {
      donationPhaseVal = 'หลังจบกิจกรรม';
    }
    
    let donorNameWithDetails = row.DonorName || 'ไม่ประสงค์ออกนาม';
    const position = row.Position ? String(row.Position).trim() : '';
    const organization = row.Organization ? String(row.Organization).trim() : '';
    if (position || organization) {
      const details = [];
      if (position) details.push(position);
      if (organization) details.push(organization);
      donorNameWithDetails += '\n(' + details.join(', ') + ')';
    }
    
    rows.push([
      String(idx + 1),
      dateVal,
      donorNameWithDetails,
      row.BankDisplayName || '-',
      formatNumberForReport(row.Amount),
      attendanceTypeVal,
      contributionTypeVal,
      donationPhaseVal
    ]);
  });
  
  return rows;
}

function styleDonationDetailTable(table) {
  const headerBg = '#f1f5f9';
  
  // Set column widths to prevent text overflow and wrap nicely
  // Total width ~ 445pt
  const colWidths = [25, 75, 95, 65, 50, 50, 50, 40];
  
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(2).setPaddingRight(2);
      if (r === 0) {
        cell.setBackgroundColor(headerBg);
      }
      
      // Alignments: Header row, index, AttendanceType, ContributionType, Phase centered
      let alignment = DocumentApp.HorizontalAlignment.LEFT;
      if (r === 0 || c === 0 || c === 5 || c === 6 || c === 7) {
        alignment = DocumentApp.HorizontalAlignment.CENTER;
      }
      
      for (let i = 0; i < cell.getNumChildren(); i++) {
        const child = cell.getChild(i);
        if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
          child.asParagraph()
            .setAlignment(alignment)
            .setSpacingBefore(0)
            .setSpacingAfter(0)
            .setLineSpacing(1.1);
        }
      }
      // Format donor details or reference on a new line
      if (c === 2 && r > 0) {
        const text = cell.editAsText();
        const cellText = String(text.getText());
        text.setFontFamily(REPORT_LAYOUT.FONT_FAMILY);
        text.setFontSize(10.5);
        text.setBold(false);
        
        const newLineIdx = cellText.indexOf('\n');
        if (newLineIdx !== -1) {
          text.setFontSize(newLineIdx, cellText.length - 1, 9.0);
          text.setForegroundColor(newLineIdx, cellText.length - 1, '#64748b'); // Slate gray
          text.setBold(newLineIdx, cellText.length - 1, false);
        }
      } else if (c === 6 && r > 0) {
        const text = cell.editAsText();
        const cellText = String(text.getText());
        text.setFontFamily(REPORT_LAYOUT.FONT_FAMILY);
        text.setFontSize(10);
        text.setBold(false);
        
        const newLineIdx = cellText.indexOf('\n');
        if (newLineIdx !== -1) {
          text.setFontSize(newLineIdx, cellText.length - 1, 8.5);
          text.setForegroundColor(newLineIdx, cellText.length - 1, '#f59e0b'); // Amber color for reference
          text.setBold(newLineIdx, cellText.length - 1, false);
        }
      } else {
        const text = cell.editAsText();
        const cellText = String(text.getText());
        text.setFontFamily(REPORT_LAYOUT.FONT_FAMILY);
        text.setFontSize(cellText.indexOf('ไม่มีข้อมูลผู้บริจาค') !== -1 ? 10 : (r === 0 ? 10 : 10.5));
        text.setBold(false);
      }
    }
  }
  
  // Apply column widths
  colWidths.forEach((width, index) => {
    if (index < table.getRow(0).getNumCells()) {
      table.setColumnWidth(index, width);
    }
  });
}

function appendFinalReportFooter(body, data, totalPagesEstimate) {
  const reportData = data || {};
  
  // คำนวณความสูงและ Spacer สำหรับดัน Footer ลงไปอยู่ท้ายหน้า 3 อย่างพอดี
  const rowCount = (reportData.donations || []).length + 1;
  const tableHeightEstimate = rowCount * 20.5; // ความสูงเฉลี่ยรวม padding ต่อแถว
  const otherElementsHeight = 90; // หัวเรื่อง DONATION DETAIL และ ช่วงข้อมูล
  const footerHeight = 60; // ความสูงข้อความ Footer 4 บรรทัด
  const targetPrintableHeight = 540; // ความสูงปลอดภัยของหน้า A4 ที่ต้องการลบขอบ
  
  const remainingHeight = targetPrintableHeight - tableHeightEstimate - otherElementsHeight - footerHeight;
  const spacerSize = Math.max(12, remainingHeight);
  
  appendReportSpacer(body, spacerSize);
  
  const lines = [
    `SDU Lampang Online Donation System (Version ${REPORT_CONFIG.VERSION})`,
    'พัฒนาโดย นายชูเกียรติ กุศลสถิตย์ มหาวิทยาลัยสวนดุสิต ศูนย์การศึกษาลำปาง',
    'Copyright © 2026 All Rights Reserved.',
    `Generated: ${reportData.reportDate || '-'}`
  ];
  
  lines.forEach(line => {
    const paragraph = body.appendParagraph(line);
    paragraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    paragraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    paragraph.editAsText()
      .setFontFamily(REPORT_LAYOUT.FONT_FAMILY)
      .setFontSize(REPORT_LAYOUT.FOOTER_FONT_SIZE)
      .setBold(false);
  });
}

function escapeReportRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * จัดตำแหน่ง Placeholder รายงานให้ใช้ Safe Area ของ A4 Portrait ก่อนแทนค่าจริง
 */
function applyReportTemplateLayout(presentation, reportData) {
  const slides = presentation.getSlides();
  const metrics = getReportPageMetrics(presentation);
  if (slides.length > 0) {
    layoutExecutiveSummarySlide(slides[0], metrics, reportData);
  }
  if (slides.length > 1) {
    layoutProjectInformationSlide(slides[1], metrics, reportData);
  }
  if (slides.length > 2) {
    layoutDonationDetailSlide(slides[2], metrics);
  }
}

function getReportPageMetrics(presentation) {
  const width = presentation.getPageWidth();
  const height = presentation.getPageHeight();
  const left = REPORT_LAYOUT.MARGIN_LEFT_CM * REPORT_LAYOUT.PT_PER_CM;
  const right = width - (REPORT_LAYOUT.MARGIN_RIGHT_CM * REPORT_LAYOUT.PT_PER_CM);
  const top = REPORT_LAYOUT.MARGIN_TOP_CM * REPORT_LAYOUT.PT_PER_CM;
  const bottom = height - (REPORT_LAYOUT.MARGIN_BOTTOM_CM * REPORT_LAYOUT.PT_PER_CM);
  const footerTop = bottom - REPORT_LAYOUT.FOOTER_HEIGHT_PT;
  return {
    width: width,
    height: height,
    left: left,
    right: right,
    top: top,
    bottom: bottom,
    contentWidth: right - left,
    contentBottom: footerTop - 10,
    footerTop: footerTop,
    footerHeight: REPORT_LAYOUT.FOOTER_HEIGHT_PT
  };
}

function layoutExecutiveSummarySlide(slide, metrics, data) {
  const gap = 10;
  const availableHeight = metrics.contentBottom - metrics.top;
  const headerHeight = Math.max(92, availableHeight * 0.15);
  const cardHeight = 62;
  const progressHeight = 54;
  const chartHeight = Math.max(160, availableHeight * 0.30);
  const summaryTop = metrics.top + headerHeight + 12 + cardHeight + 14 + progressHeight + 14 + chartHeight + 14;
  const summaryHeight = Math.max(80, metrics.contentBottom - summaryTop);
  const logoWidth = metrics.contentWidth * 0.15;
  const dateWidth = metrics.contentWidth * 0.30;
  const titleWidth = metrics.contentWidth - logoWidth - dateWidth - (gap * 2);
  const titleLeft = metrics.left + logoWidth + gap;
  const dateLeft = titleLeft + titleWidth + gap;
  const cardsTop = metrics.top + headerHeight + 12;
  const cardWidth = (metrics.contentWidth - (gap * 3)) / 4;
  const progressTop = cardsTop + cardHeight + 14;
  const visualTop = progressTop + progressHeight + 14;
  const chartWidth = (metrics.contentWidth - gap) * 0.60;
  const donorWidth = metrics.contentWidth - chartWidth - gap;

  layoutReportTextBox(slide, 'LOGO', { left: metrics.left, top: metrics.top, width: logoWidth, height: headerHeight }, 14, true, data.projectName);
  layoutReportTextBox(slide, '{{PROJECT_NAME}}', { left: titleLeft, top: metrics.top, width: titleWidth, height: headerHeight * 0.45 }, REPORT_LAYOUT.TITLE_FONT_SIZE, true, data.projectName);
  layoutReportTextBox(slide, '{{PROJECT_DESCRIPTION}}', { left: titleLeft, top: metrics.top + (headerHeight * 0.45), width: titleWidth, height: headerHeight * 0.55 }, REPORT_LAYOUT.BODY_FONT_SIZE, false, data.projectDescription);
  layoutReportTextBox(slide, '{{REPORT_DATE}}', { left: dateLeft, top: metrics.top, width: dateWidth, height: headerHeight }, REPORT_LAYOUT.BODY_FONT_SIZE, false, data.reportDate);

  ['{{TOTAL_AMOUNT}}', '{{TOTAL_DONORS}}', '{{TOTAL_RECORDS}}', '{{TARGET_AMOUNT}}'].forEach((marker, idx) => {
    const value = idx === 0 ? data.totalAmount : idx === 1 ? data.totalDonors : idx === 2 ? data.totalRecords : data.targetAmount;
    layoutReportTextBox(slide, marker, {
      left: metrics.left + ((cardWidth + gap) * idx),
      top: cardsTop,
      width: cardWidth,
      height: cardHeight
    }, REPORT_LAYOUT.BODY_FONT_SIZE, false, value);
  });

  layoutReportTextBox(slide, '{{PROGRESS}}', { left: metrics.left, top: progressTop, width: metrics.contentWidth, height: progressHeight }, REPORT_LAYOUT.BODY_FONT_SIZE, true, data.progress);
  layoutReportTextBox(slide, '{{CHART_IMAGE}}', { left: metrics.left, top: visualTop, width: chartWidth, height: chartHeight }, REPORT_LAYOUT.BODY_FONT_SIZE, false, '');
  layoutReportTextBox(slide, '{{TOP_DONOR_TABLE}}', { left: metrics.left + chartWidth + gap, top: visualTop, width: donorWidth, height: chartHeight }, REPORT_LAYOUT.TABLE_FONT_SIZE, false, data.topDonorTableText);
  layoutReportTextBox(slide, '{{SUMMARY}}', { left: metrics.left, top: summaryTop, width: metrics.contentWidth, height: summaryHeight }, REPORT_LAYOUT.BODY_FONT_SIZE, false, data.summary);
}

function layoutProjectInformationSlide(slide, metrics, data) {
  const titleHeight = 34;
  const gap = 18;
  const bodyTop = metrics.top + titleHeight + 16;
  const leftWidth = (metrics.contentWidth - gap) * 0.65;
  const rightWidth = metrics.contentWidth - leftWidth - gap;
  const rowGap = 9;
  let fieldHeight = 48;
  const labelValueMarkers = [
    ['{{PROJECT_NAME}}', data.projectName],
    ['{{PROJECT_DESCRIPTION}}', data.projectDescription],
    ['{{PROJECT_TYPE}}', data.projectType],
    ['{{TARGET_AMOUNT}}', data.targetAmount],
    ['{{PUBLIC_URL}}', data.publicUrl],
    ['{{CONTACT_PERSON}}', data.contactPerson],
    ['{{CONTACT_PHONE}}', data.contactPhone],
    ['{{CONTACT_EMAIL}}', data.contactEmail],
    ['{{NOTE}}', data.note]
  ];

  layoutReportTextBox(slide, 'Project Information', { left: metrics.left, top: metrics.top, width: metrics.contentWidth, height: titleHeight }, REPORT_LAYOUT.TITLE_FONT_SIZE, true, 'Project Information');

  fieldHeight = Math.min(fieldHeight, (metrics.contentBottom - bodyTop - (rowGap * (labelValueMarkers.length - 1))) / labelValueMarkers.length);
  labelValueMarkers.forEach((item, idx) => {
    layoutReportTextBox(slide, item[0], {
      left: metrics.left,
      top: bodyTop + ((fieldHeight + rowGap) * idx),
      width: leftWidth,
      height: fieldHeight
    }, REPORT_LAYOUT.BODY_FONT_SIZE, false, item[1]);
  });

  const qrSize = 5 * REPORT_LAYOUT.PT_PER_CM;
  const qrLeft = metrics.left + leftWidth + gap + ((rightWidth - qrSize) / 2);
  const qrTop = bodyTop + 20;
  layoutReportTextBox(slide, '{{QR_CODE}}', { left: qrLeft, top: qrTop, width: qrSize, height: qrSize }, REPORT_LAYOUT.BODY_FONT_SIZE, false, '');
  layoutReportTextBox(slide, 'สแกนเพื่อเข้าชมโครงการ', { left: metrics.left + leftWidth + gap, top: qrTop + qrSize + 10, width: rightWidth, height: 28 }, REPORT_LAYOUT.BODY_FONT_SIZE, false, 'สแกนเพื่อเข้าชมโครงการ');
}

function layoutDonationDetailSlide(slide, metrics) {
  const titleHeight = 30;
  const periodHeight = 32;
  const headerHeight = 22;
  const tableTop = metrics.top + titleHeight + periodHeight + 34;
  const tableBottom = metrics.contentBottom - 12;
  const rowHeight = Math.min(22, (tableBottom - tableTop - headerHeight) / REPORT_CONFIG.ROWS_PER_PAGE);
  const tableHeight = headerHeight + (rowHeight * REPORT_CONFIG.ROWS_PER_PAGE);
  const columns = [
    ['NO', 0.08],
    ['DATE', 0.16],
    ['NAME', 0.28],
    ['BANK', 0.18],
    ['AMOUNT', 0.15],
    ['STATUS', 0.15]
  ];
  let currentLeft = metrics.left;

  layoutReportTextBox(slide, 'Donation Detail', { left: metrics.left, top: metrics.top, width: metrics.contentWidth, height: titleHeight }, REPORT_LAYOUT.TITLE_FONT_SIZE, true, 'Donation Detail');
  layoutReportTextBox(slide, '{{REPORT_PERIOD}}', { left: metrics.left, top: metrics.top + titleHeight, width: metrics.contentWidth, height: periodHeight }, REPORT_LAYOUT.BODY_FONT_SIZE, false, '');
  layoutReportTableByText(slide, '{{NO_01}}', { left: metrics.left, top: tableTop, width: metrics.contentWidth, height: tableHeight });

  columns.forEach(col => {
    const colWidth = metrics.contentWidth * col[1];
    for (let i = 1; i <= REPORT_CONFIG.ROWS_PER_PAGE; i++) {
      const no = String(i).padStart(2, '0');
      layoutReportTextBox(slide, `{{${col[0]}_${no}}}`, {
        left: currentLeft,
        top: tableTop + headerHeight + ((i - 1) * rowHeight),
        width: colWidth,
        height: rowHeight
      }, REPORT_LAYOUT.TABLE_FONT_SIZE, false, '');
    }
    currentLeft += colWidth;
  });

  for (let i = 1; i <= REPORT_CONFIG.ROWS_PER_PAGE; i++) {
    const no = String(i).padStart(2, '0');
    layoutReportTextBox(slide, `{{PHONE_${no}}}`, { left: metrics.left, top: tableBottom, width: 1, height: 1 }, REPORT_LAYOUT.MIN_FONT_SIZE, false, '');
  }
}

function layoutReportTextBox(slide, marker, bounds, fontSize, bold, sampleText) {
  const shapes = findReportShapesByText(slide, marker);
  shapes.forEach(shape => {
    setReportElementBounds(shape, bounds);
    styleReportTextShape(shape, getFittedReportFontSize(sampleText, bounds, fontSize), bold);
  });
}

function layoutReportTableByText(slide, marker, bounds) {
  const tables = findReportTablesByText(slide, marker);
  tables.forEach(table => {
    setReportElementBounds(table, bounds);
    styleReportTable(table, REPORT_LAYOUT.TABLE_FONT_SIZE);
  });
}

function findReportShapesByText(slide, marker) {
  const result = [];
  slide.getPageElements().forEach(el => collectReportShapesByText(el, marker, result));
  return result;
}

function findReportTablesByText(slide, marker) {
  const result = [];
  slide.getTables().forEach(table => {
    try {
      for (let r = 0; r < table.getNumRows(); r++) {
        for (let c = 0; c < table.getNumColumns(); c++) {
          if (table.getCell(r, c).getText().asString().indexOf(marker) !== -1) {
            result.push(table);
            return;
          }
        }
      }
    } catch (e) {
      // Ignore malformed table cells.
    }
  });
  return result;
}

function collectReportShapesByText(el, marker, result) {
  try {
    const type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) {
      const shape = el.asShape();
      if (shape.getText && shape.getText().asString().indexOf(marker) !== -1) {
        result.push(shape);
      }
    } else if (type === SlidesApp.PageElementType.GROUP) {
      el.asGroup().getChildren().forEach(child => collectReportShapesByText(child, marker, result));
    }
  } catch (e) {
    // Ignore non-text elements.
  }
}

function setReportElementBounds(el, bounds) {
  try {
    el.setLeft(bounds.left);
    el.setTop(bounds.top);
    el.setWidth(bounds.width);
    el.setHeight(bounds.height);
  } catch (e) {
    // Some grouped elements cannot be resized independently.
  }
}

function styleReportTextShape(shape, fontSize, bold) {
  try {
    const textRange = shape.getText();
    textRange.getTextStyle()
      .setFontFamily(REPORT_LAYOUT.FONT_FAMILY)
      .setFontSize(fontSize)
      .setBold(!!bold);
    textRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
    shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  } catch (e) {
    // Keep generation running even if a placeholder has no editable text style.
  }
}

function styleReportTable(table, fontSize) {
  try {
    for (let r = 0; r < table.getNumRows(); r++) {
      for (let c = 0; c < table.getNumColumns(); c++) {
        const textRange = table.getCell(r, c).getText();
        textRange.getTextStyle()
          .setFontFamily(REPORT_LAYOUT.FONT_FAMILY)
          .setFontSize(fontSize)
          .setBold(r === 0);
        textRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
      }
    }
  } catch (e) {
    // Keep generation running if table styling is partially unavailable.
  }
}

function getFittedReportFontSize(text, bounds, preferredSize) {
  const val = String(text || '');
  if (!val) return preferredSize;
  const maxChars = Math.max(12, Math.floor(bounds.width / Math.max(6, preferredSize * 0.35)) * Math.max(1, Math.floor(bounds.height / Math.max(14, preferredSize * 1.2))));
  if (val.length <= maxChars) return preferredSize;
  const fitted = Math.floor(preferredSize * (maxChars / val.length));
  return Math.max(REPORT_LAYOUT.MIN_FONT_SIZE, Math.min(preferredSize, fitted));
}

function normalizeReportFooters(presentation) {
  const slides = presentation.getSlides();
  const metrics = getReportPageMetrics(presentation);
  const totalPages = slides.length;
  slides.forEach((slide, idx) => {
    const footerShapes = getReportFooterShapes(slide);
    removeDuplicateReportFooterShapes(footerShapes);
    const remaining = getReportFooterShapes(slide);
    if (remaining.length === 0) {
      insertReportFooter(slide, metrics, idx + 1, totalPages);
    } else {
      remaining.forEach(shape => {
        const text = shape.getText().asString();
        const isPageLine = text.indexOf('Page ') !== -1 && text.indexOf('SDU Lampang Online Donation System') === -1;
        const bounds = isPageLine
          ? { left: metrics.left, top: metrics.footerTop + metrics.footerHeight - 16, width: metrics.contentWidth, height: 16 }
          : { left: metrics.left, top: metrics.footerTop, width: metrics.contentWidth, height: metrics.footerHeight };
        setReportElementBounds(shape, bounds);
        styleReportTextShape(shape, REPORT_LAYOUT.FOOTER_FONT_SIZE, false);
      });
    }
  });
}

function getReportFooterShapes(slide) {
  const markers = [
    'SDU Lampang Online Donation System',
    'พัฒนาโดย',
    'Copyright',
    'Page '
  ];
  const result = [];
  slide.getPageElements().forEach(el => {
    try {
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        const shape = el.asShape();
        const text = shape.getText().asString();
        if (markers.some(marker => text.indexOf(marker) !== -1)) {
          result.push(shape);
        }
      }
    } catch (e) {
      // Ignore non-text elements.
    }
  });
  return result;
}

function removeDuplicateReportFooterShapes(shapes) {
  const byText = {};
  shapes.forEach(shape => {
    const text = shape.getText().asString().trim();
    if (!byText[text] || shape.getTop() > byText[text].getTop()) {
      if (byText[text]) {
        byText[text].remove();
      }
      byText[text] = shape;
    } else {
      shape.remove();
    }
  });
}

function insertReportFooter(slide, metrics, pageNumber, totalPages) {
  const footerText = [
    `SDU Lampang Online Donation System (Version ${REPORT_CONFIG.VERSION})`,
    'พัฒนาโดย นายชูเกียรติ กุศลสถิตย์ มหาวิทยาลัยสวนดุสิต ศูนย์การศึกษาลำปาง',
    'Copyright © 2026 All Rights Reserved.',
    `Page ${pageNumber} of ${totalPages}`
  ].join('\n');
  const shape = slide.insertTextBox(footerText, metrics.left, metrics.footerTop, metrics.contentWidth, metrics.footerHeight);
  styleReportTextShape(shape, REPORT_LAYOUT.FOOTER_FONT_SIZE, false);
}

// ===== HELPER FUNCTIONS FOR REPORT =====

/**
 * แยกข้อมูลอาร์เรย์ออกเป็นชุดละตามจำนวนที่กำหนด
 */
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * ค้นหาตำแหน่งและแทนที่ Shape ที่มีข้อความ placeholder ด้วยรูปภาพ
 */
function replaceImagePlaceholder(slide, placeholderText, imageBlob) {
  if (!imageBlob) {
    console.log(`[Report Gen] Image Blob is null for ${placeholderText} (false)`);
    return false;
  }
  
  const pageElements = slide.getPageElements();

  for (const el of pageElements) {
    try {
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        const shape = el.asShape();
        const text = shape.getText().asString();

        if (text.indexOf(placeholderText) !== -1) {
          const left = el.getLeft();
          const top = el.getTop();
          const width = el.getWidth();
          const height = el.getHeight();

          el.remove();

          const image = slide.insertImage(imageBlob);
          fitReportImageInBounds(image, left, top, width, height);

          console.log(`[Report Gen] Found and replaced image placeholder: ${placeholderText} (true)`);
          return true;
        }
      }
    } catch (err) {
      // skip non-text element
    }
  }

  console.log(`[Report Gen] Image placeholder NOT found: ${placeholderText} (false)`);
  return false;
}

function fitReportImageInBounds(image, left, top, width, height) {
  const originalWidth = image.getWidth();
  const originalHeight = image.getHeight();
  if (!originalWidth || !originalHeight) {
    image.setLeft(left);
    image.setTop(top);
    image.setWidth(width);
    image.setHeight(height);
    return;
  }

  const scale = Math.min(width / originalWidth, height / originalHeight);
  const fittedWidth = originalWidth * scale;
  const fittedHeight = originalHeight * scale;
  image.setWidth(fittedWidth);
  image.setHeight(fittedHeight);
  image.setLeft(left + ((width - fittedWidth) / 2));
  image.setTop(top + ((height - fittedHeight) / 2));
}

/**
 * แปลง Base64 String เป็น Image Blob
 */
function getBlobFromBase64(base64Data, fileName) {
  try {
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const bytes = Utilities.base64Decode(base64Content);
    return Utilities.newBlob(bytes, 'image/png', fileName);
  } catch (e) {
    console.error('Error decoding base64 image:', e);
    return null;
  }
}

/**
 * ค้นหาและดึง Blob ของโลโก้
 */
function getLogoBlob(settings) {
  const url = settings.ProjectCoverUrl;
  if (!url) return null;
  
  try {
    let cleanUrl = url;
    if (url.indexOf('drive.google.com') !== -1) {
      const match = url.match(/id=([^&]+)/) || url.match(/\/file\/d\/([^/]+)/);
      if (match && match[1]) {
        cleanUrl = 'https://docs.google.com/uc?export=download&id=' + match[1];
      }
    }
    
    const resp = UrlFetchApp.fetch(cleanUrl, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      return resp.getBlob();
    }
  } catch (e) {
    console.error('Error fetching logo image:', e);
  }
  return null;
}

/**
 * ค้นหาหรือสร้าง QR Code จากข้อมูลบัญชี PromptPay
 */
function getQRCodeBlob() {
  try {
    const activeAccounts = getActiveBankAccounts();
    if (activeAccounts && activeAccounts.length > 0) {
      const account = activeAccounts[0];
      let qrUrl = '';
      
      if (account.QRCodeUrl && account.QRCodeUrl.startsWith('http')) {
        qrUrl = account.QRCodeUrl;
      } else if (account.PromptPayId) {
        qrUrl = 'https://promptpay.io/' + String(account.PromptPayId).trim() + '.png';
      }
      
      if (qrUrl) {
        let cleanUrl = qrUrl;
        if (qrUrl.indexOf('drive.google.com') !== -1) {
          const match = qrUrl.match(/id=([^&]+)/) || qrUrl.match(/\/file\/d\/([^/]+)/);
          if (match && match[1]) {
            cleanUrl = 'https://docs.google.com/uc?export=download&id=' + match[1];
          }
        }
        
        const resp = UrlFetchApp.fetch(cleanUrl, { muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) {
          return resp.getBlob();
        }
      }
    }
  } catch (e) {
    console.error('Error fetching QR code:', e);
  }
  return null;
}

/**
 * จัดรูปแบบตัวเลขสำหรับแสดงในรายงาน เช่น 1234567.89 -> "1,234,567.89"
 */
function formatNumberForReport(val) {
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return '0';
  if (num % 1 === 0) {
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

/**
 * แปลงสถานะรายการบริจาคเป็นภาษาไทย
 */
function translateStatus(status) {
  const s = String(status || '').toLowerCase().trim();
  const map = {
    'approved': 'อนุมัติ',
    'pending': 'รอตรวจสอบ',
    'rejected': 'ไม่อนุมัติ'
  };
  return map[s] || status || '-';
}

/**
 * สร้างบทวิเคราะห์รายงานบริจาคแบบย่ออัตโนมัติ (Executive Summary)
 */
function generateExecutiveSummary(stats, settings, donations) {
  const projName = settings.ProjectName || 'โครงการบริจาค';
  const totalAmount = formatNumberForReport(stats.totalAmount);
  const totalDonors = stats.totalDonors;
  const totalRecords = donations.length;
  const targetAmount = formatNumberForReport(stats.targetAmount);
  const progress = stats.progress;
  
  let text = `รายงานสรุปยอดเงินบริจาคโครงการ "${projName}"\n`;
  text += `มียอดเงินบริจาครวมทั้งสิ้น ${totalAmount} บาท จากผู้บริจาคทั้งหมด ${totalDonors} คน `;
  text += `รวมเป็นจำนวนรายการโอนเงิน ${totalRecords} รายการ\n`;
  
  if (stats.targetAmount > 0) {
    text += `คิดเป็น ${progress}% ของเป้าหมายโครงการที่ตั้งไว้ที่ ${targetAmount} บาท `;
    if (stats.totalAmount >= stats.targetAmount) {
      text += `ซึ่งบรรลุยอดเงินเป้าหมายโครงการเรียบร้อยแล้ว ขอขอบพระคุณผู้บริจาคทุกท่านเป็นอย่างสูง`;
    } else {
      const remaining = formatNumberForReport(stats.remainingAmount);
      text += `โดยยังขาดอีกจำนวน ${remaining} บาท จะบรรลุเป้าหมายโครงการ`;
    }
  } else {
    text += `ขอขอบพระคุณผู้บริจาคทุกท่านเป็นอย่างสูงที่ร่วมสนับสนุนโครงการของเรา`;
  }
  return text;
}

/**
 * แทนที่ข้อความ Mapping ทั้งหมดภายใน Presentation
 */
function replaceAllTextInPresentation(presentation, placeholder, value) {
  const valStr = (value === null || value === undefined) ? '' : String(value);
  presentation.getSlides().forEach(slide => {
    replaceAllTextInSlide(slide, placeholder, valStr);
  });
}

/**
 * แทนที่ข้อความภายในสไลด์เดียว (รองรับ Shapes, Tables, และ Groups)
 */
function replaceAllTextInSlide(slide, placeholder, value) {
  const valStr = (value === null || value === undefined) ? '' : String(value);
  
  // 1. ตรวจสอบ Shapes
  slide.getShapes().forEach(shape => {
    if (shape.getText()) {
      shape.getText().replaceAllText(placeholder, valStr);
    }
  });
  
  // 2. ตรวจสอบ Tables
  slide.getTables().forEach(table => {
    for (let r = 0; r < table.getNumRows(); r++) {
      for (let c = 0; c < table.getNumColumns(); c++) {
        const cell = table.getCell(r, c);
        if (cell.getText()) {
          cell.getText().replaceAllText(placeholder, valStr);
        }
      }
    }
  });
  
  // 3. ตรวจสอบ Groups
  slide.getGroups().forEach(group => {
    replaceTextInGroup(group, placeholder, valStr);
  });
}

/**
 * แทนที่ข้อความภายใน Group แบบ recursive
 */
function replaceTextInGroup(group, placeholder, value) {
  group.getChildren().forEach(child => {
    const type = child.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) {
      const shape = child.asShape();
      if (shape.getText()) {
        shape.getText().replaceAllText(placeholder, value);
      }
    } else if (type === SlidesApp.PageElementType.TABLE) {
      const table = child.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        for (let c = 0; c < table.getNumColumns(); c++) {
          const cell = table.getCell(r, c);
          if (cell.getText()) {
            cell.getText().replaceAllText(placeholder, value);
          }
        }
      }
    } else if (type === SlidesApp.PageElementType.GROUP) {
      replaceTextInGroup(child.asGroup(), placeholder, value);
    }
  });
}

/**
 * จัดรูปแบบตาราง Top Donors เป็นข้อความหลายบรรทัด
 */
function formatTopDonorsTable(topDonors) {
  if (!topDonors || topDonors.length === 0) return 'ไม่มีข้อมูลผู้บริจาคสูงสุด';
  return topDonors.map((d, idx) => {
    const name = d.name || 'ไม่ประสงค์ออกนาม';
    const amount = formatNumberForReport(d.total);
    const count = d.count;
    return `${idx + 1}. ${name} - ยอดรวม ${amount} บาท (${count} ครั้ง)`;
  }).join('\n');
}

/**
 * ฟังก์ชันทดสอบระบบสร้างรายงาน PDF
 * เรียกใช้ใน Script Editor: เลือก runReportTests แล้วกด Run
 */
function runReportTests() {
  console.log('=== เริ่มต้นทดสอบการสร้างรายงาน PDF ===');
  try {
    const options = {
      startDate: null,
      endDate: null,
      note: 'ทดสอบสร้างรายงานอัตโนมัติ (Integration Test)',
      chartImageBase64: null // จำลองแบบไม่มีรูปชาร์ต
    };
    
    console.log('1. กำลังรัน generateDonationReport...');
    const result = generateDonationReport(options);
    
    console.log('2. ผลลัพธ์การรัน:', JSON.stringify(result));
    if (result.success) {
      console.log('✔ ทดสอบการสร้างรายงาน PDF สำเร็จ!');
      console.log('   - ID ไฟล์ PDF:', result.pdfId);
      console.log('   - URL ไฟล์ PDF:', result.pdfUrl);
      console.log('   - ชื่อไฟล์:', result.fileName);
    } else {
      throw new Error('การสร้างรายงานล้มเหลว: ' + result.message);
    }
  } catch (error) {
    console.error('❌ การทดสอบล้มเหลว:', error.message);
  }
  console.log('=== สิ้นสุดการทดสอบ ===');
}

/**
 * Wrapper สำหรับการบันทึกรายการบริจาค
 */
function saveDonation(data) {
  return createDonation(data);
}

/**
 * Wrapper สำหรับการส่งรายการบริจาค
 */
function submitDonation(data) {
  return createDonation(data);
}

/**
 * Wrapper สำหรับการสร้างรายงาน
 */
function generateReport(options) {
  return generateDonationReport(options);
}


