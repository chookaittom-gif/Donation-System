    /**
     * ระบบบริจาค - Client-side JavaScript
     * @version 1.0.0
     */

    // ===== GLOBAL STATE =====
    const activeRequests = new Map();
    const AppState = {
        currentPage: 'public',
        currentAdminPage: 'dashboard',
        isAdmin: false,
        session: null, // เพิ่มฟิลด์เก็บเซสชัน
        isLoading: false,
        settings: null,
        bankAccounts: [],
        donations: [],
        recentDonors: [], // เพิ่มฟิลด์เก็บรายชื่อผู้บริจาคล่าสุดสาธารณะ
        donorsLimit: 20, // จำนวนเริ่มต้นที่จะแสดงใน Modal
        currentVisibleDonors: 20, // จำนวนปัจจุบันที่แสดงใน Modal
        editingId: null,
        uploadedFile: null,
        projectCoverFile: null,
        projectCoverPreviewUrl: null,
        chart: null
    };

    // ===== DOM READY =====
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
    });

    // ===== INITIALIZATION =====
    async function initApp() {
        showPublicSkeleton();

        try {
            // Load public data
            await loadPublicData();

            // ดึงเซสชันจาก localStorage (อายุ 6 ชั่วโมง)
            const sessionStr = localStorage.getItem('donationAdminSession');
            if (sessionStr) {
                try {
                    const restoredSession = JSON.parse(sessionStr);
                    const now = new Date().getTime();
                    if (restoredSession && restoredSession.expiresAt && now < restoredSession.expiresAt) {
                        AppState.session = restoredSession;
                        AppState.isAdmin = true;
                        applySessionPermissions(restoredSession);
                        navigateTo('admin');
                        navigateAdmin('dashboard');
                        showToast('ยินดีต้อนรับกลับ, ' + restoredSession.displayName, 'success');
                    } else {
                        localStorage.removeItem('donationAdminSession');
                        AppState.session = null;
                        AppState.isAdmin = false;
                        window.location.hash = '';
                        navigateTo('public');
                        showAlert('เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่', 'warning');
                    }
                } catch (e) {
                    console.error('Session restore error:', e);
                    localStorage.removeItem('donationAdminSession');
                }
            } else if (window.location.hash === '#admin') {
                showAdminLogin();
            }

            // Setup event listeners
            setupEventListeners();

        } catch (error) {
            console.error('Init error:', error);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        } finally {
            hidePublicSkeleton();
        }
    }

    // ===== EVENT LISTENERS =====
    function setupEventListeners() {
        // Load More Donors handler
        const btnLoadMore = document.getElementById('btnLoadMoreDonors');
        if (btnLoadMore) {
            btnLoadMore.addEventListener('click', () => {
                const totalDonors = AppState.recentDonors ? AppState.recentDonors.length : 0;
                AppState.currentVisibleDonors += AppState.donorsLimit;
                
                renderAllDonorsList(AppState.currentVisibleDonors);
                
                if (AppState.currentVisibleDonors >= totalDonors) {
                    btnLoadMore.style.display = 'none';
                }
            });
        }

        // Sticky Header CTA scroll handler (UX Optimization)
        const navCta = document.querySelector('.public-nav .nav-cta');
        if (navCta) {
            window.addEventListener('scroll', () => {
                if (AppState.currentPage === 'public') {
                    if (window.scrollY >= 250) {
                        navCta.classList.add('visible');
                    } else {
                        navCta.classList.remove('visible');
                    }
                } else {
                    navCta.classList.remove('visible');
                }
            }, { passive: true });
        }

        // Modal close ONLY by buttons (Cancel/X), NOT by backdrop click
        // Removed backdrop click handler - Modal can only be closed by Cancel or X button

        // File upload drag and drop
        setupFileUpload();
        setupProjectCoverUpload();

        // Form submissions
        setupFormHandlers();

        // Hash change for navigation
        window.addEventListener('hashchange', handleHashChange);


        // Key bindings for userModal (Esc = Cancel, Enter = Save)
        document.addEventListener('keydown', function(e) {
            const userModal = document.getElementById('userModal');
            if (userModal && userModal.classList.contains('active')) {
                if (e.key === 'Escape') {
                    if (typeof isSavingUser === 'undefined' || !isSavingUser) {
                        e.preventDefault();
                        closeModal('userModal');
                    }
                } else if (e.key === 'Enter') {
                    if (typeof isSavingUser !== 'undefined' && !isSavingUser) {
                        e.preventDefault();
                        saveUser();
                    }
                }
            }
        });
    }

    // ===== LOADING FUNCTIONS =====
    function showLoading(message = 'กำลังโหลด...', soft = false) {
        AppState.isLoading = true;
        const overlay = document.getElementById('loadingOverlay');
        const text = overlay.querySelector('.loading-text');
        if (text) text.textContent = message;
        overlay.classList.toggle('soft', !!soft);
        overlay.classList.add('active');
    }

    function hideLoading() {
        AppState.isLoading = false;
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.classList.remove('soft');
        }
    }

    function showPublicSkeleton() {
        document.getElementById('publicSkeleton')?.classList.add('active');
        const publicSection = document.getElementById('publicSection');
        if (publicSection) {
            publicSection.classList.add('content-hidden');
            publicSection.classList.remove('content-visible');
        }
    }

    function hidePublicSkeleton() {
        const skeleton = document.getElementById('publicSkeleton');
        const publicSection = document.getElementById('publicSection');

        if (skeleton) {
            skeleton.style.opacity = '0';
            skeleton.style.transition = 'opacity 0.25s ease';

            setTimeout(() => {
                skeleton.classList.remove('active');
                skeleton.style.opacity = '';
                skeleton.style.transition = '';
            }, 250);
        }

        if (publicSection) {
            publicSection.classList.remove('content-hidden');
            publicSection.classList.add('content-visible');
        }

        hideLoading();
    }

    // Set button loading state to prevent double-click
    function setButtonLoading(btn, isLoading, loadingText = '⏳ กำลังบันทึก...') {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = loadingText;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || '💾 บันทึก';
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    }

    // ===== TOAST / ALERT FUNCTIONS =====
    function showToast(message, type = 'success') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });

        Toast.fire({
            icon: type,
            title: message
        });
    }

    function showAlert(title, text, type = 'info') {
        return Swal.fire({
            title: title,
            text: text,
            icon: type,
            confirmButtonText: 'ตกลง'
        });
    }

    function showConfirm(title, text, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก') {
        return Swal.fire({
            title: title,
            text: text,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#F5A623',
            cancelButtonColor: '#666',
            confirmButtonText: confirmText,
            cancelButtonText: cancelText
        });
    }

    // ===== API WRAPPER =====
    async function callApi(functionName, ...args) {
        // แซงแทรกเพื่อเติม session อัตโนมัติในฟังก์ชันที่ต้องกั้นสิทธิ์หลังบ้าน
        const protectedApis = [
            'saveSettings',
            'uploadProjectCover',
            'createBankAccount',
            'updateBankAccount',
            'deleteBankAccount',
            'deleteDonation',
            'approveDonation',
            'rejectDonation',
            'generateDonationReport',
            'getUsers',
            'saveUser',
            'deleteUser'
        ];
        if (protectedApis.includes(functionName)) {
            args.push(AppState.session);
        }

        // กัน double submit / duplicate request
        const requestKey = JSON.stringify({ functionName, args });
        if (activeRequests.has(requestKey)) {
            return activeRequests.get(requestKey);
        }

        const requestPromise = (async () => {
            try {
                // Check if running within Google Apps Script sandbox
                if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run[functionName] === 'function') {
                    return await new Promise((resolve, reject) => {
                        google.script.run
                            .withSuccessHandler((result) => {
                                resolve(result);
                            })
                            .withFailureHandler((error) => {
                                reject(error);
                            })[functionName](...args);
                    });
                }

                // Fallback to Vercel API proxy
                const response = await fetch('/api/gas', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: functionName,
                        args: args
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                if (result.success) {
                    return result.data;
                } else {
                    throw new Error(result.message || 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล');
                }
            } catch (error) {
                console.error(`API Error on ${functionName}:`, error);
                throw error;
            } finally {
                activeRequests.delete(requestKey);
            }
        })();

        activeRequests.set(requestKey, requestPromise);
        return requestPromise;
    }

    /**
     * API Wrapper พร้อม Retry Logic
     * @param {string} functionName - ชื่อฟังก์ชัน
     * @param {Array} args - arguments สำหรับฟังก์ชัน
     * @param {number} maxRetries - จำนวนครั้งที่ลองใหม่ (default: 3)
     */
    async function callApiWithRetry(functionName, args = [], maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await callApi(functionName, ...args);
            } catch (error) {
                console.warn(`API call ${functionName} failed (attempt ${attempt + 1}/${maxRetries}):`, error);
                if (attempt === maxRetries - 1) {
                    throw error;
                }
                // Exponential backoff: 1s, 2s, 4s...
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    // ===== DATA LOADING =====
    async function loadPublicData() {
        try {
            const data = await callApi('getPublicProjectInfo');
            if (data) {
                AppState.settings = data.project;
                AppState.bankAccounts = data.bankAccounts;
                renderPublicPage(data);
            }
        } catch (error) {
            console.error('loadPublicData error:', error);
        }
    }

    async function loadDashboardData() {
        try {
            showLoading('กำลังโหลดข้อมูล Dashboard...');

            // เรียก API เดียวแทน 4 APIs (เร็วขึ้น 60-75%)
            let data = null;
            try {
                data = await callApiWithRetry('getDashboardDataAll');
            } catch (err) {
                console.warn('getDashboardDataAll failed, trying fallback...', err);
            }

            if (data && data.stats) {
                renderDashboard(data.stats, data.chartData, data.recentDonations, data.topDonors);
            } else {
                // Fallback: ใช้ API เดิมถ้า getDashboardDataAll ล้มเหลว
                console.warn('Using fallback APIs...');
                const [stats, chartData, recentDonations, topDonors] = await Promise.all([
                    callApi('getDashboardStats'),
                    callApi('getChartData', 7),
                    callApi('getRecentDonations', 5),
                    callApi('getTopDonors', 5)
                ]);
                renderDashboard(stats, chartData, recentDonations, topDonors);
            }
        } catch (error) {
            console.error('loadDashboardData error:', error);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        } finally {
            hideLoading();
        }
    }

    async function loadDonations(filter = {}) {
        try {
            showLoading('กำลังโหลดรายการบริจาค...');
            AppState.donations = await callApi('getDonations', filter);
            renderDonationsList(AppState.donations);
        } catch (error) {
            console.error('loadDonations error:', error);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        } finally {
            hideLoading();
        }
    }

    async function loadBankAccounts() {
        try {
            AppState.bankAccounts = await callApi('getBankAccounts');
            renderBankAccountsList();
            renderBankSelector();
        } catch (error) {
            console.error('loadBankAccounts error:', error);
        }
    }

    async function loadSettings() {
        try {
            showLoading('กำลังโหลดการตั้งค่า...');
            const settings = await callApi('getSettings');
            AppState.settings = settings || {};
            renderSettingsForm(AppState.settings);
            await loadBankAccounts();
        } catch (error) {
            console.error('loadSettings error:', error);
            showToast('เกิดข้อผิดพลาดในการโหลดการตั้งค่า', 'error');
        } finally {
            hideLoading();
        }
    }

    // ===== RENDER FUNCTIONS =====
    function getProjectCoverDisplayUrl(url) {
        const text = String(url || '').trim();
        if (text.indexOf('drive.google.com') === -1 && text.indexOf('docs.google.com') === -1) return text;
        const match = text.match(/[?&]id=([^&]+)/) || text.match(/\/file\/d\/([^/]+)/);
        if (!match) return text;

        const fileId = match[1];
        return 'https://lh3.googleusercontent.com/d/' + fileId;
    }

    function renderPublicPage(data) {
        const project = data.project || {};
        const stats = data.stats || {};

        const projectName = project.name || 'โครงการบริจาค';
        const projectDescription = project.description || '';
        const projectCoverUrl = getProjectCoverDisplayUrl(project.coverUrl || '');
        const projectTags = project.tags || '';

        document.querySelectorAll('.project-name').forEach(el => el.textContent = projectName);
        document.querySelectorAll('.project-description').forEach(el => el.textContent = projectDescription);

        const projectTitle = document.getElementById('projectTitle');
        if (projectTitle) projectTitle.textContent = projectName;

        const projectDesc = document.getElementById('projectDescription');
        if (projectDesc) projectDesc.textContent = projectDescription;

        const tagsEl = document.getElementById('projectTags');
        if (tagsEl) {
            tagsEl.textContent = projectTags || '#Donation';
            tagsEl.style.display = projectTags ? '' : 'none';
        }

        const coverImage = document.getElementById('projectCoverImage');
        if (coverImage) {
            coverImage.dataset.coverToken = projectCoverUrl;
            coverImage.onerror = () => {
                if (coverImage.dataset.coverToken === projectCoverUrl) coverImage.style.display = 'none';
            };
            if (projectCoverUrl) {
                coverImage.src = projectCoverUrl;
                coverImage.style.display = '';
            } else {
                coverImage.removeAttribute('src');
                coverImage.style.display = 'none';
            }
        }

        const copyrightText = document.getElementById('copyrightText');
        if (copyrightText) {
            const year = new Date().getFullYear() + 543; // พ.ศ.
            copyrightText.innerHTML = `&copy; ${year} ${projectName}. All rights reserved.`;
        }

        const sidebarImage = document.getElementById('sidebarCoverImage');
        if (sidebarImage) {
            sidebarImage.dataset.coverToken = projectCoverUrl;
            sidebarImage.onerror = () => {
                if (sidebarImage.dataset.coverToken === projectCoverUrl) sidebarImage.style.display = 'none';
            };
            if (projectCoverUrl) {
                sidebarImage.src = projectCoverUrl;
                sidebarImage.style.display = '';
            } else {
                sidebarImage.removeAttribute('src');
                sidebarImage.style.display = 'none';
            }
        }

        const sidebarTitleEl = document.getElementById('sidebarTitle');
        if (sidebarTitleEl) {
            sidebarTitleEl.textContent = project.sidebarTitle || 'Your Gift Matters';
        }

        const sidebarDesc = document.getElementById('sidebarDescription');
        if (sidebarDesc) {
            sidebarDesc.textContent = projectDescription;
        }

        // Stats
        document.querySelectorAll('.total-amount').forEach(el => {
            el.textContent = formatCurrency(stats.projectTotalAmount || stats.totalAmount || 0);
        });

        document.querySelectorAll('.target-amount').forEach(el => {
            el.textContent = formatCurrency(stats.targetAmount || 0);
        });

        document.querySelectorAll('.total-donors').forEach(el => {
            el.textContent = (stats.totalDonors || 0) + ' คน';
        });

        document.querySelectorAll('.remaining-amount').forEach(el => {
            el.textContent = formatCurrency(stats.remainingAmount || 0);
        });

        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = (stats.progress || 0) + '%';
        }

        const progressPercent = document.querySelector('.progress-percent');
        if (progressPercent) {
            progressPercent.textContent = (stats.progress || 0) + '%';
        }

        // Render Footer Contact Info
        const contactPerson = project.contactPerson || '';
        const contactPhone = project.contactPhone || '';
        const contactEmail = project.contactEmail || '';

        document.querySelectorAll('.footerContactInfo').forEach(el => {
            if (contactPerson || contactPhone || contactEmail) {
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        });

        document.querySelectorAll('.footerContactPerson').forEach(el => {
            el.textContent = contactPerson;
        });

        document.querySelectorAll('.footerContactPhone').forEach(el => {
            el.textContent = contactPhone;
            el.href = `tel:${contactPhone}`;
        });

        document.querySelectorAll('.footerContactEmail').forEach(el => {
            if (contactEmail) {
                el.textContent = contactEmail;
                el.href = `mailto:${contactEmail}`;
            }
        });

        document.querySelectorAll('.footerContactEmailWrapper').forEach(el => {
            if (contactEmail) {
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });

        // Bank accounts for public
        renderPublicBankAccounts(data.bankAccounts);

        // Recent donors
        AppState.recentDonors = data.recentDonors || [];
        renderRecentDonors(data.recentDonors);

        // Bank selector in form
        renderBankSelector(data.bankAccounts);

        // Handle Status Controls (OPEN, POST_EVENT, CLOSED)
        const status = project.effectiveEventStatus || 'OPEN';
        const bannerEl = document.getElementById('statusBanner');
        const navCtaBtn = document.getElementById('navCtaBtn');
        const heroCtaBtn = document.getElementById('heroCtaBtn');

        if (status === 'CLOSED') {
            // Hide CTA buttons
            if (navCtaBtn) navCtaBtn.style.display = 'none';
            if (heroCtaBtn) heroCtaBtn.style.display = 'none';
            
            // Show CLOSED banner
            if (bannerEl) {
                bannerEl.className = 'status-banner closed';
                bannerEl.innerHTML = '🚫 ขณะนี้โครงการปิดรับการสนับสนุนแล้ว ขอบคุณทุกท่านที่ร่วมสนับสนุน';
                bannerEl.style.display = '';
            }
        } else if (status === 'POST_EVENT') {
            // Show "บริจาคเพิ่มเติม" and display POST_EVENT banner
            if (navCtaBtn) {
                navCtaBtn.style.display = '';
                navCtaBtn.textContent = 'บริจาคเพิ่มเติม';
            }
            if (heroCtaBtn) {
                heroCtaBtn.style.display = '';
                heroCtaBtn.innerHTML = '🎁 บริจาคเพิ่มเติม';
            }
            if (bannerEl) {
                bannerEl.className = 'status-banner post-event';
                bannerEl.innerHTML = '🕒 กิจกรรมสิ้นสุดแล้ว แต่ยังเปิดรับการสนับสนุนเพิ่มเติม';
                bannerEl.style.display = 'none';
            }
            
            // Set up form fields for POST_EVENT phase
            setupDonationFormForStatus('POST_EVENT');
        } else {
            // OPEN status
            if (navCtaBtn) {
                navCtaBtn.style.display = '';
                navCtaBtn.textContent = 'บริจาคเลย';
            }
            if (heroCtaBtn) {
                heroCtaBtn.style.display = '';
                heroCtaBtn.innerHTML = '🎁 บริจาคเลย';
            }
            if (bannerEl) {
                bannerEl.style.display = 'none';
            }
            
            // Set up form fields for OPEN phase
            setupDonationFormForStatus('OPEN');
        }
    }

    function setupDonationFormForStatus(status) {
        const attendanceContainer = document.getElementById('attendanceTypeContainer');
        const onsiteInput = document.querySelector('input[name="AttendanceType"][value="Onsite"]');
        const onlineInput = document.querySelector('input[name="AttendanceType"][value="Online"]');
        
        const contributionContainer = document.getElementById('contributionTypeContainer');
        const prevRefContainer = document.getElementById('previousReferenceContainer');
        const prevRefInput = document.querySelector('input[name="PreviousDonationReference"]');
        const noticeEl = document.getElementById('donationFormStatusNotice');
        
        if (noticeEl) {
            if (status === 'POST_EVENT') {
                noticeEl.className = 'status-banner post-event';
                noticeEl.innerHTML = '🕒 กิจกรรมหลักสิ้นสุดแล้ว · ยังเปิดรับการสนับสนุนเพิ่มเติม';
                noticeEl.style.display = 'block';
            } else {
                noticeEl.style.display = 'none';
            }
        }
        
        if (status === 'POST_EVENT') {
            if (attendanceContainer) attendanceContainer.style.display = 'none';
            if (onsiteInput) onsiteInput.required = false;
            if (onlineInput) onlineInput.required = false;
            if (contributionContainer) contributionContainer.style.display = '';
            
            // Setup change listeners for ContributionType radio buttons
            const radios = document.querySelectorAll('input[name="ContributionType"]');
            radios.forEach(radio => {
                radio.onchange = function() {
                    if (this.value === 'ADDITIONAL') {
                        if (prevRefContainer) prevRefContainer.style.display = '';
                    } else {
                        if (prevRefContainer) prevRefContainer.style.display = 'none';
                        if (prevRefInput) prevRefInput.value = '';
                    }
                };
            });
            // Trigger initial visibility
            const selectedRadio = document.querySelector('input[name="ContributionType"]:checked');
            if (selectedRadio && selectedRadio.value === 'ADDITIONAL') {
                if (prevRefContainer) prevRefContainer.style.display = '';
            } else {
                if (prevRefContainer) prevRefContainer.style.display = 'none';
            }
        } else {
            if (attendanceContainer) attendanceContainer.style.display = '';
            if (onsiteInput) onsiteInput.required = true;
            if (onlineInput) onlineInput.required = true;
            if (contributionContainer) contributionContainer.style.display = 'none';
            if (prevRefContainer) prevRefContainer.style.display = 'none';
            if (prevRefInput) prevRefInput.value = '';
        }
    }

    function renderPublicBankAccounts(accounts) {
        const container = document.getElementById('bankAccountsContainer');
        if (!container || !accounts) return;

        container.innerHTML = accounts.map(acc => {
            const bankColor = acc.bankColor || acc.BankColor || '#1A4B9C';
            const bankName = acc.bankName || acc.BankName || acc.BankDisplayName || 'ธนาคาร';
            const accountName = acc.accountName || acc.AccountName || '';
            const accountNumber = acc.accountNumber || acc.AccountNumber || '';
            const branch = acc.branch || acc.Branch || '-';
            const accountType = acc.accountType || acc.AccountType || 'savings';
            
            return `
                <div class="bank-info-box" style="background: linear-gradient(135deg, ${bankColor} 0%, ${adjustColor(bankColor, -30)} 100%);">
                    <div class="bank-info-content" style="display: flex; align-items: center; gap: 24px;">
                        <div class="bank-info-left" style="flex: 1;">
                            <div class="bank-title">${bankName}</div>
                            <div class="bank-name">ชื่อบัญชี: ${accountName}</div>
                            <div class="account-number">
                                ${formatAccountNumber(accountNumber)}
                                <button class="copy-btn" onclick="copyToClipboard('${accountNumber}')" title="คัดลอก">
                                    📋
                                </button>
                            </div>
                            <div class="bank-details">
                                <span>สาขา: ${branch}</span>
                                <span>ประเภท: ${getAccountTypeText(accountType)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render compact bank account for sidebar in donation form
    function renderSidebarBankAccounts() {
        const container = document.getElementById('sidebarBankAccounts');
        if (!container) return;

        const allAccounts = AppState.bankAccounts || [];
        const accounts = allAccounts.filter(acc => acc.IsActive === true || acc.IsActive === 'TRUE' || acc.IsActive === 'true' || acc.isActive === true);

        // Get primary account (first one or lowest DisplayOrder)
        const primaryAccount = accounts.length > 0 ?
            accounts.sort((a, b) => (a.DisplayOrder || 999) - (b.DisplayOrder || 999))[0] : null;

        if (!primaryAccount) {
            container.innerHTML = `
                <div class="text-center text-muted" style="padding: 20px;">
                    <p>ไม่พบข้อมูลบัญชีธนาคาร</p>
                </div>
            `;
            return;
        }

        // Use camelCase or PascalCase field names
        const bankName = primaryAccount.bankName || primaryAccount.BankName || 'ธนาคาร';
        const accountName = primaryAccount.accountName || primaryAccount.AccountName || '-';
        const accountNumber = primaryAccount.accountNumber || primaryAccount.AccountNumber || '-';
        const bankColor = primaryAccount.bankColor || primaryAccount.BankColor || '#1976D2';
        const branch = primaryAccount.branch || primaryAccount.Branch || '-';
        const accountType = primaryAccount.accountType || primaryAccount.AccountType || 'savings';
        const qrCodeUrl = primaryAccount.qrCodeUrl || primaryAccount.QRCodeUrl || '';

        container.innerHTML = `
            <div class="sidebar-bank-card" style="
                background: linear-gradient(135deg, ${bankColor} 0%, ${adjustColor(bankColor, -30)} 100%);
                border-radius: 12px;
                padding: 20px;
                color: white;
            ">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div class="bank-logo-badge" style="background-color: white; color: ${bankColor}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        ${(primaryAccount.bankCode || primaryAccount.BankCode || 'OTHER').substring(0, 2)}
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 600;">${bankName}</div>
                </div>
                <div style="font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">ชื่อบัญชี: ${accountName}</div>
                <div style="font-size: 1.4rem; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px;">
                    ${formatAccountNumber(accountNumber)}
                    <button class="copy-btn" onclick="copyToClipboard('${accountNumber}')" 
                        style="background: rgba(255,255,255,0.2); border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; color: white; font-size: 0.8rem; margin-left: 8px;" 
                        title="คัดลอกเลขบัญชี">📋</button>
                </div>
                <div style="font-size: 0.75rem; opacity: 0.8; display: flex; gap: 16px; margin-bottom: 16px;">
                    <span>สาขา: ${branch}</span>
                    <span>ประเภท: ${getAccountTypeText(accountType)}</span>
                </div>
                ${qrCodeUrl ? `
                <div class="sidebar-qr-container" style="text-align: center; background: white; padding: 12px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto; width: fit-content;">
                    <img src="${qrCodeUrl}" alt="QR Code พร้อมเพย์" class="sidebar-qr-image" style="object-fit: contain; border-radius: 8px;">
                    <div class="qr-label" style="color: #333; font-size: 0.75rem; margin-top: 8px; font-weight: 600;">สแกน QR เพื่อโอนเงิน</div>
                </div>
                ` : ''}
            </div>
        `;
    }



    function renderBankSelector(accounts) {
        // ไม่มีผลการทำงานเนื่องจากเปลี่ยนมาใช้ Dropdown List แบบคงตัวแทนแล้ว
    }

    function selectBank(bankCode) {
        // ไม่มีผลการทำงานเนื่องจากใช้ event change ของ select element แทน
    }

    function renderRecentDonors(donors) {
        const container = document.getElementById('recentDonorsList');
        if (!container || !donors) return;

        if (donors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>ยังไม่มีผู้บริจาค</p></div>';
            return;
        }

        const colors = ['#F5A623', '#4CAF50', '#2196F3', '#9C27B0', '#FF5722'];
        // แสดงสูงสุดเพียง 5 รายชื่อในหน้าแรก
        const displayDonors = donors.slice(0, 5);

        container.innerHTML = displayDonors.map((donor, index) => `
    <div class="donor-item">
      <div class="donor-avatar" style="background-color: ${colors[index % colors.length]}20; color: ${colors[index % colors.length]}">
        ${(donor.name || 'ไ').charAt(0).toUpperCase()}
      </div>
      <div class="donor-info">
        <div class="donor-name">${donor.name || 'ไม่ประสงค์ออกนาม'}</div>
        <div class="donor-time">${donor.date || ''}</div>
      </div>
      <div class="donor-amount">+฿${formatNumber(donor.amount)}</div>
    </div>
  `).join('');
    }

    function renderDashboard(stats, chartData, recentDonations, topDonors) {
        document.querySelector('.stat-total-amount').textContent = '฿' + formatNumber(stats.projectTotalAmount || stats.totalAmount || 0);
        document.querySelector('.stat-total-donors').textContent = stats.totalDonors + ' คน';
        document.querySelector('.stat-pending-count').textContent = stats.pendingCount + ' รายการ';
        document.querySelector('.stat-average-amount').textContent = '฿' + formatNumber(stats.averageAmount);
        
        // New stats fields
        const eventPeriodEl = document.querySelector('.stat-event-period-amount');
        if (eventPeriodEl) eventPeriodEl.textContent = '฿' + formatNumber(stats.eventPeriodAmount || 0);
        
        const postEventEl = document.querySelector('.stat-post-event-amount');
        if (postEventEl) postEventEl.textContent = '฿' + formatNumber(stats.postEventAmount || 0);
        
        const additionalEl = document.querySelector('.stat-additional-count');
        if (additionalEl) additionalEl.textContent = (stats.additionalCount || 0) + ' รายการ';

        // Update notification badge with pending count
        updatePendingBadge(stats.pendingCount);

        // Growth percentage
        const growthEl = document.querySelector('.stat-growth');
        if (growthEl) {
            const isPositive = stats.growthPercent >= 0;
            growthEl.className = `stat-change ${isPositive ? 'positive' : 'negative'}`;
            growthEl.innerHTML = `${isPositive ? '↑' : '↓'} ${Math.abs(stats.growthPercent)}% จากเดือนก่อน`;
        }

        // Chart
        renderChart(chartData);

        // Recent donations
        renderRecentDonationsTable(recentDonations);

        // Top donors
        renderTopDonorsList(topDonors);
    }

    function updatePendingBadge(count) {
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            badge.textContent = count || 0;
            // ซ่อน badge ถ้าไม่มีรายการรอตรวจสอบ
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function renderChart(chartData) {
        const ctx = document.getElementById('donationChart');
        if (!ctx) return;

        // Destroy existing chart
        if (AppState.chart) {
            AppState.chart.destroy();
        }

        AppState.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'ยอดบริจาค',
                    data: chartData.data,
                    borderColor: '#F5A623',
                    backgroundColor: 'rgba(245, 166, 35, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#F5A623',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, family: 'Kanit' },
                        bodyFont: { size: 13, family: 'Kanit' },
                        callbacks: {
                            label: function (context) {
                                return '฿' + formatNumber(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Kanit' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { family: 'Kanit' },
                            callback: function (value) {
                                return '฿' + formatNumber(value);
                            }
                        }
                    }
                }
            }
        });
    }

    function renderRecentDonationsTable(donations) {
        const tbody = document.getElementById('recentDonationsTable');
        if (!tbody) return;

        if (!donations || donations.length === 0) {
            tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center p-lg">
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-title">ยังไม่มีรายการบริจาค</div>
          </div>
        </td>
      </tr>
    `;
            return;
        }

        tbody.innerHTML = donations.map(d => `
    <tr>
      <td>${d.TimestampFormatted || ''}</td>
      <td>
        <div class="d-flex align-center gap-sm">
          <div class="donor-avatar" style="width: 32px; height: 32px; font-size: 0.8rem; background: ${d.BankColor}20; color: ${d.BankColor}">
            ${(d.DonorName || 'ไ').charAt(0)}
          </div>
          ${d.DonorName || 'ไม่ประสงค์ออกนาม'}
        </div>
      </td>
      <td>
        ${d.SlipUrl ? `<button onclick="viewSlip('${d.SlipUrl}')" class="btn btn-sm btn-secondary">🖼️ ดูสลิป</button>` : '-'}
      </td>
      <td><strong>฿${formatNumber(d.Amount)}</strong></td>
      <td>
        <span class="status-badge ${d.Status}">
          ${getStatusText(d.Status)}
        </span>
      </td>
      <td>
        <div class="actions">
          ${d.Status === 'pending' ? `
            <button class="action-btn approve" onclick="approveDonation('${d.ID}')" title="อนุมัติ">✓</button>
            <button class="action-btn reject" onclick="rejectDonation('${d.ID}')" title="ปฏิเสธ">✗</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
    }

    function renderTopDonorsList(donors) {
        const container = document.getElementById('topDonorsList');
        if (!container) return;

        if (!donors || donors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>ยังไม่มีข้อมูล</p></div>';
            return;
        }

        const colors = ['#F5A623', '#4CAF50', '#2196F3', '#9C27B0', '#FF5722'];

        container.innerHTML = donors.map((donor, index) => `
    <div class="donor-item">
      <div class="donor-avatar" style="background-color: ${colors[index % colors.length]}20; color: ${colors[index % colors.length]}">
        ${(donor.name || 'ไ').charAt(0).toUpperCase()}
      </div>
      <div class="donor-info">
        <div class="donor-name">${donor.name}</div>
        <div class="donor-time">${donor.lastDonationFormatted || ''}</div>
      </div>
      <div class="donor-amount">+฿${formatNumber(donor.total)}</div>
    </div>
  `).join('');
    }

    function renderDonationsList(donations) {
        const tbody = document.getElementById('donationsTableBody');
        if (!tbody) return;

        if (!donations || donations.length === 0) {
            tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center p-lg">
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-title">ไม่พบรายการบริจาค</div>
            <div class="empty-text">ยังไม่มีรายการบริจาคในระบบ</div>
          </div>
        </td>
      </tr>
    `;
            return;
        }

        const role = String(AppState.session?.role || 'staff').toLowerCase();

        tbody.innerHTML = donations.map(d => `
    <tr>
      <td>${d.TimestampFormatted || ''}</td>
      <td>
        <div>
          <strong>${d.DonorName || 'ไม่ประสงค์ออกนาม'}</strong>
          <div class="text-muted" style="font-size: 0.8rem">${d.DonorPhone || '-'}</div>
          <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;">
              <span class="phase-badge ${d.DonationPhase === 'POST_EVENT' ? 'post-event' : 'event-period'}">
                  ${d.DonationPhase === 'POST_EVENT' ? 'หลังจบกิจกรรม' : 'กิจกรรมหลัก'}
              </span>
              ${d.ContributionType === 'ADDITIONAL' ? `
                  <span class="phase-badge post-event" style="background-color: #f3e8ff; color: #7e22ce;">สนับสนุนเพิ่มเติม</span>
                  ${d.PreviousDonationReference ? `<div class="ref-text" title="อ้างอิง: ${d.PreviousDonationReference}">🔗 ${d.PreviousDonationReference}</div>` : ''}
              ` : ''}
          </div>
        </div>
      </td>
      <td>
        <span style="color: ${d.BankColor}">${d.BankDisplayName || d.BankCode}</span>
      </td>
      <td>
        ${d.SlipUrl ? `<button onclick="viewSlip('${d.SlipUrl}')" class="btn btn-sm btn-secondary">🖼️ ดูสลิป</button>` : '-'}
      </td>
      <td><strong>฿${formatNumber(d.Amount)}</strong></td>
      <td>
        <span class="status-badge ${d.Status}">
          ${getStatusText(d.Status)}
        </span>
      </td>
      <td>
        <div class="actions">
          ${d.Status === 'pending' ? `
            <button class="action-btn approve" onclick="approveDonation('${d.ID}')" title="อนุมัติ">✓</button>
            <button class="action-btn reject" onclick="rejectDonation('${d.ID}')" title="ปฏิเสธ">✗</button>
          ` : ''}
          <button class="action-btn" onclick="viewDonation('${d.ID}')" title="ดูรายละเอียด" style="background: var(--info-light); color: var(--info-color);">👁</button>
          ${role === 'admin' ? `
            <button class="action-btn reject" onclick="deleteDonation('${d.ID}')" title="ลบ">🗑</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
    }

    function renderBankAccountsList() {
        const container = document.getElementById('bankAccountsList');
        if (!container) return;

        if (!AppState.bankAccounts || AppState.bankAccounts.length === 0) {
            container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏦</div>
        <div class="empty-title">ยังไม่มีบัญชีธนาคาร</div>
        <div class="empty-text">เพิ่มบัญชีธนาคารเพื่อรับเงินบริจาค</div>
        <button class="btn btn-primary" onclick="openBankAccountModal()">+ เพิ่มบัญชี</button>
      </div>
    `;
            return;
        }

        container.innerHTML = AppState.bankAccounts.map(acc => {
            const bankCode = acc.BankCode || 'OTHER';
            const bankColor = acc.BankColor || '#666';
            const bankName = acc.BankDisplayName || acc.BankName || bankCode;
            const accountNumber = acc.AccountNumber || '';
            const accountName = acc.AccountName || '';
            const isActive = acc.IsActive === true || acc.IsActive === 'TRUE' || acc.IsActive === 'true';

            return `
                <div class="bank-account-item">
                    <div class="bank-account-info">
                        <div class="bank-account-icon" style="background-color: ${bankColor}">
                            ${bankCode.substring(0, 2)}
                        </div>
                        <div class="bank-account-details">
                            <h4>${bankName}</h4>
                            <p>${formatAccountNumber(accountNumber)} - ${accountName}</p>
                        </div>
                    </div>
                    <div class="bank-account-actions">
                        <label class="toggle-label">
                            <input type="checkbox" class="toggle-input" ${isActive ? 'checked' : ''} onchange="toggleBankAccount('${acc.ID}', this.checked)">
                            <span class="toggle-switch"></span>
                        </label>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="editBankAccount('${acc.ID}')">แก้ไข</button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deleteBankAccount('${acc.ID}')">ลบ</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSettingsForm(settings) {
        if (!settings) return;

        const toBoolean = (val) => val === true || val === 'true' || val === 'on' || val === '1';
        const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toISOString().split('T')[0];
            } catch (e) {
                return dateStr;
            }
        };
        const setInputValue = (name, val) => {
            const el = document.querySelector(`#settingsForm [name="${name}"]`);
            if (el) el.value = val;
        };
        const setCheckboxValue = (name, checked) => {
            const el = document.querySelector(`#settingsForm [name="${name}"]`);
            if (el) el.checked = checked;
        };

        setInputValue('ProjectName', settings.ProjectName || '');
        setInputValue('ProjectDescription', settings.ProjectDescription || '');
        setInputValue('ProjectType', settings.ProjectType || '');
        setInputValue('Tags', settings.Tags || '');
        setInputValue('ProjectCoverUrl', settings.ProjectCoverUrl || '');
        renderProjectCoverPreview(getProjectCoverDisplayUrl(settings.ProjectCoverUrl || ''));
        const projectCoverInput = document.getElementById('projectCoverFile');
        if (projectCoverInput) projectCoverInput.value = '';
        if (AppState.projectCoverPreviewUrl) {
            URL.revokeObjectURL(AppState.projectCoverPreviewUrl);
            AppState.projectCoverPreviewUrl = null;
        }
        AppState.projectCoverFile = null;
        const projectCoverStatus = document.getElementById('projectCoverUploadStatus');
        if (projectCoverStatus) {
            projectCoverStatus.textContent = settings.ProjectCoverUrl
                ? 'ภาพปกพร้อมใช้งานในหน้าโครงการและรายงาน'
                : 'ระบบจะบีบอัดภาพเป็น JPEG ไม่เกินประมาณ 1 MB ก่อนอัปโหลด Google Drive';
        }
        setInputValue('SidebarTitle', settings.SidebarTitle || '');
        setInputValue('TargetAmount', settings.TargetAmount || '');
        setInputValue('OpeningBalance', settings.OpeningBalance || '');
        setInputValue('StartDate', formatDateForInput(settings.StartDate));
        setInputValue('EndDate', formatDateForInput(settings.EndDate));
        setInputValue('DriveFolderId', settings.DriveFolderId || '');
        setInputValue('ContactPerson', settings.ContactPerson || '');
        setInputValue('ContactPhone', settings.ContactPhone || '');
        setInputValue('ContactEmail', settings.ContactEmail || '');
        setInputValue('ContactAttendanceType', settings.ContactAttendanceType || 'Onsite');

        setCheckboxValue('AutoApproveEnabled', toBoolean(settings.AutoApproveEnabled));
        setCheckboxValue('AutoApproveWithSlip', toBoolean(settings.AutoApproveWithSlip));
        setCheckboxValue('AutoApproveReturning', toBoolean(settings.AutoApproveReturning));
        setCheckboxValue('AutoApproveAll', toBoolean(settings.AutoApproveAll));
        setInputValue('AutoApproveAmount', settings.AutoApproveAmount || '');
        setInputValue('CacheTTL', settings.CacheTTL || '');
        setInputValue('EventStatus', settings.EventStatus || 'OPEN');
        setCheckboxValue('AutoUpdateEventStatus', toBoolean(settings.AutoUpdateEventStatus));
    }

    function collectSettingsFormData() {
        const getInputValue = (name) => {
            const el = document.querySelector(`#settingsForm [name="${name}"]`);
            return el ? el.value : '';
        };
        const getCheckboxValue = (name) => {
            const el = document.querySelector(`#settingsForm [name="${name}"]`);
            return el ? (el.checked ? 'true' : 'false') : 'false';
        };

        return {
            ProjectName: getInputValue('ProjectName'),
            ProjectDescription: getInputValue('ProjectDescription'),
            ProjectType: getInputValue('ProjectType'),
            Tags: getInputValue('Tags'),
            ProjectCoverUrl: getInputValue('ProjectCoverUrl'),
            SidebarTitle: getInputValue('SidebarTitle'),
            TargetAmount: getInputValue('TargetAmount'),
            OpeningBalance: getInputValue('OpeningBalance'),
            StartDate: getInputValue('StartDate'),
            EndDate: getInputValue('EndDate'),
            DriveFolderId: getInputValue('DriveFolderId'),
            AdminPassword: getInputValue('AdminPassword'),
            CacheTTL: getInputValue('CacheTTL'),
            AutoApproveEnabled: getCheckboxValue('AutoApproveEnabled'),
            AutoApproveWithSlip: getCheckboxValue('AutoApproveWithSlip'),
            AutoApproveReturning: getCheckboxValue('AutoApproveReturning'),
            AutoApproveAll: getCheckboxValue('AutoApproveAll'),
            AutoApproveAmount: getInputValue('AutoApproveAmount'),
            ContactPerson: getInputValue('ContactPerson'),
            ContactPhone: getInputValue('ContactPhone'),
            ContactEmail: getInputValue('ContactEmail'),
            ContactAttendanceType: getInputValue('ContactAttendanceType'),
            EventStatus: getInputValue('EventStatus'),
            AutoUpdateEventStatus: getCheckboxValue('AutoUpdateEventStatus')
        };
    }

    function renderProjectCoverPreview(url) {
        const preview = document.getElementById('projectCoverPreview');
        const name = document.getElementById('projectCoverUploadName');
        if (!preview) return;

        const previewToken = url || '';
        preview.dataset.previewToken = previewToken;
        preview.onerror = () => {
            if (preview.dataset.previewToken === previewToken) {
                preview.style.display = 'none';
            }
        };

        if (url) {
            preview.src = url;
            preview.style.display = 'block';
            if (name && !AppState.projectCoverFile) name.textContent = 'ภาพปกปัจจุบัน';
        } else {
            preview.removeAttribute('src');
            preview.style.display = 'none';
            if (name && !AppState.projectCoverFile) name.textContent = 'ยังไม่ได้เลือกภาพใหม่';
        }
    }

    function setupProjectCoverUpload() {
        const input = document.getElementById('projectCoverFile');
        if (!input || input.dataset.bound === 'true') return;

        input.dataset.bound = 'true';
        input.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                input.value = '';
                showAlert('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ JPG, PNG หรือ WEBP', 'warning');
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                input.value = '';
                showAlert('ไฟล์ใหญ่เกินไป', 'กรุณาเลือกภาพขนาดไม่เกิน 10 MB', 'warning');
                return;
            }

            if (AppState.projectCoverPreviewUrl) {
                URL.revokeObjectURL(AppState.projectCoverPreviewUrl);
            }

            AppState.projectCoverFile = file;
            AppState.projectCoverPreviewUrl = URL.createObjectURL(file);
            renderProjectCoverPreview(AppState.projectCoverPreviewUrl);

            const name = document.getElementById('projectCoverUploadName');
            if (name) name.textContent = `${file.name} (${formatFileSize(file.size)})`;
        });
    }

    async function compressProjectCover(file) {
        const dataUrl = await fileToBase64(file);
        const image = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('ไม่สามารถอ่านภาพปกได้'));
            image.src = dataUrl;
        });

        const maxWidth = 1200;
        const maxHeight = 630;
        const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

        const context = canvas.getContext('2d');
        if (!context) throw new Error('ไม่สามารถเตรียมพื้นที่บีบอัดภาพได้');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const qualities = [0.82, 0.72, 0.62];
        for (const quality of qualities) {
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', quality);
            });

            if (blob && (blob.size <= 1024 * 1024 || quality === qualities[qualities.length - 1])) {
                return new File([blob], 'project-cover.jpg', { type: 'image/jpeg' });
            }
        }

        throw new Error('ไม่สามารถบีบอัดภาพปกได้');
    }

    // ===== NAVIGATION =====
    function navigateTo(page) {
        if (page === 'donate' && AppState.settings && AppState.settings.effectiveEventStatus === 'CLOSED') {
            showToast('ขออภัย โครงการนี้ปิดรับการสนับสนุนแล้ว', 'error');
            page = 'public';
        }

        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.remove('active');
        });

        const targetSection = document.getElementById(`${page}Section`);
        if (targetSection) {
            targetSection.classList.add('active');
            AppState.currentPage = page;
        }

        // Render sidebar bank account and contact when navigating to donate page
        if (page === 'donate') {
            renderSidebarBankAccounts();
            const currentStatus = (AppState.settings && AppState.settings.effectiveEventStatus) || 'OPEN';
            setupDonationFormForStatus(currentStatus);
        }

        // Update Header CTA visibility instantly upon navigation
        const navCta = document.querySelector('.public-nav .nav-cta');
        if (navCta) {
            if (page === 'public') {
                if (window.scrollY >= 250) {
                    navCta.classList.add('visible');
                } else {
                    navCta.classList.remove('visible');
                }
            } else {
                navCta.classList.remove('visible');
            }
        }
    }

    function navigateAdmin(page) {
        const role = String(AppState.session?.role || 'staff').toLowerCase();
        if (role !== 'admin' && (page === 'settings' || page === 'users')) {
            showToast('คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้', 'error');
            return;
        }

        document.querySelectorAll('.admin-page').forEach(p => {
            p.classList.remove('active');
        });

        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            item.classList.remove('active');
        });

        const targetPage = document.getElementById(`admin${capitalize(page)}`);
        const menuItem = document.querySelector(`.menu-item[data-page="${page}"]`);

        if (targetPage) {
            targetPage.classList.add('active');
            AppState.currentAdminPage = page;
        }

        if (menuItem) {
            menuItem.classList.add('active');
        }

        // Load data for page
        switch (page) {
            case 'dashboard':
                loadDashboardData();
                break;
            case 'donations':
                loadDonations();
                break;
            case 'donors':
                loadDonors();
                break;
            case 'settings':
                loadSettings();
                break;
            case 'users':
                loadUsers();
                break;
        }
    }

    function handleHashChange() {
        const hash = window.location.hash;
        if (hash === '#admin') {
            if (!AppState.isAdmin) {
                showAdminLogin();
            }
        } else if (hash === '#donate') {
            navigateTo('donate');
        } else {
            navigateTo('public');
        }
    }

    // ===== ADMIN AUTH =====
    function showAdminLogin() {
        Swal.fire({
            title: 'เข้าสู่ระบบ',
            html: `
                <input type="text" id="swalUsername" class="swal2-input" placeholder="ชื่อผู้ใช้งาน (Username)" style="margin-bottom: 10px; width: 80%; box-sizing: border-box;">
                <div style="position: relative; width: 80%; margin: 0 auto; display: flex; align-items: center; box-sizing: border-box;">
                    <input type="password" id="swalPassword" class="swal2-input" placeholder="รหัสผ่าน (Password)" style="width: 100%; margin: 0; padding-right: 44px; box-sizing: border-box;">
                    <button type="button" id="togglePasswordBtn" aria-label="แสดงรหัสผ่าน" style="
                        position: absolute;
                        right: 8px;
                        background: none;
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 44px;
                        height: 44px;
                        min-width: 44px;
                        min-height: 44px;
                        z-index: 10;
                        outline: none;
                        color: #666;
                    "></button>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'เข้าสู่ระบบ',
            cancelButtonText: 'ยกเลิก',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                const toggleBtn = document.getElementById('togglePasswordBtn');
                const passwordInput = document.getElementById('swalPassword');
                if (toggleBtn && passwordInput) {
                    const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                    const eyeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
                    
                    toggleBtn.innerHTML = eyeSvg;
                    
                    const handleToggle = () => {
                        if (passwordInput.type === 'password') {
                            passwordInput.type = 'text';
                            toggleBtn.innerHTML = eyeOffSvg;
                            toggleBtn.setAttribute('aria-label', 'ซ่อนรหัสผ่าน');
                        } else {
                            passwordInput.type = 'password';
                            toggleBtn.innerHTML = eyeSvg;
                            toggleBtn.setAttribute('aria-label', 'แสดงรหัสผ่าน');
                        }
                    };
                    
                    toggleBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        handleToggle();
                        passwordInput.focus();
                    });
                    
                    toggleBtn.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggle();
                            passwordInput.focus();
                        }
                    });
                }
            },
            preConfirm: () => {
                const username = document.getElementById('swalUsername').value.trim();
                const password = document.getElementById('swalPassword').value.trim();
                if (!username) {
                    Swal.showValidationMessage('กรุณากรอกชื่อผู้ใช้งาน');
                    return false;
                }
                if (!password) {
                    Swal.showValidationMessage('กรุณากรอกรหัสผ่าน');
                    return false;
                }
                return { username: username, password: password };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                showLoading('กำลังตรวจสอบ...');
                try {
                    const response = await callApi('loginUser', result.value.username, result.value.password);
                    if (response.success) {
                        AppState.isAdmin = true;
                        AppState.session = response.session;
                        
                        // Save session to localStorage (expires in 6 hours)
                        const loginAtTime = new Date(response.session.loginAt || new Date()).getTime();
                        const expiresAt = loginAtTime + (6 * 60 * 60 * 1000); // 6 hours
                        const sessionData = {
                            username: response.session.username,
                            displayName: response.session.displayName,
                            role: response.session.role,
                            permissions: response.session.permissions,
                            loginAt: response.session.loginAt,
                            expiresAt: expiresAt,
                            sessionToken: response.session.sessionToken
                        };
                        localStorage.setItem('donationAdminSession', JSON.stringify(sessionData));
                        
                        applySessionPermissions(response.session);
                        navigateTo('admin');
                        navigateAdmin('dashboard');
                        showToast('เข้าสู่ระบบสำเร็จ', 'success');
                    } else {
                        window.location.hash = '';
                        showAlert('ไม่สำเร็จ', response.message || 'รหัสผ่านไม่ถูกต้อง', 'error');
                    }
                } catch (error) {
                    window.location.hash = '';
                    showAlert('ข้อผิดพลาด', error.message, 'error');
                } finally {
                    hideLoading();
                }
            } else {
                window.location.hash = '';
            }
        });
    }

    function applySessionPermissions(session) {
        if (!session) return;
        
        const role = String(session.role || 'staff').toLowerCase();
        
        // เปลี่ยนชื่อโปรไฟล์และบทบาทมุมขวาบน
        const displaySpan = document.getElementById('loggedInUserDisplay');
        const avatarDiv = document.getElementById('loggedInUserAvatar');
        
        if (displaySpan) {
            displaySpan.textContent = `${session.displayName} (${role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'})`;
        }
        if (avatarDiv) {
            avatarDiv.textContent = session.displayName ? session.displayName.substring(0, 1).toUpperCase() : 'U';
        }
        
        // เปิด/ปิด การแสดงผลปุ่มเมนูสิทธิ์ต่างๆ
        const menuItemUsers = document.getElementById('menuItemUsers');
        if (menuItemUsers) {
            menuItemUsers.style.display = role === 'admin' ? 'flex' : 'none';
        }
        
        const menuItemSettings = document.querySelector('.menu-item[data-page="settings"]');
        if (menuItemSettings) {
            menuItemSettings.style.display = role === 'admin' ? 'flex' : 'none';
        }
    }

    function logout() {
        showConfirm('ออกจากระบบ', 'คุณต้องการออกจากระบบใช่หรือไม่?', 'ออกจากระบบ', 'ยกเลิก')
            .then((result) => {
                if (result.isConfirmed) {
                    AppState.isAdmin = false;
                    AppState.session = null;
                    localStorage.removeItem('donationAdminSession');
                    
                    // Reset user display and hide admin-only menus
                    const displaySpan = document.getElementById('loggedInUserDisplay');
                    const avatarDiv = document.getElementById('loggedInUserAvatar');
                    if (displaySpan) {
                        displaySpan.textContent = 'ระบบ (admin)';
                    }
                    if (avatarDiv) {
                        avatarDiv.textContent = 'A';
                    }
                    const menuItemUsers = document.getElementById('menuItemUsers');
                    if (menuItemUsers) {
                        menuItemUsers.style.display = 'none';
                    }
                    const menuItemSettings = document.querySelector('.menu-item[data-page="settings"]');
                    if (menuItemSettings) {
                        menuItemSettings.style.display = 'none';
                    }

                    window.location.hash = '';
                    navigateTo('public');
                    showToast('ออกจากระบบเรียบร้อย', 'success');
                }
            });
    }

    // ===== DONATION ACTIONS =====
    async function approveDonation(id) {
        const result = await showConfirm('อนุมัติรายการ', 'คุณต้องการอนุมัติรายการบริจาคนี้ใช่หรือไม่?', 'อนุมัติ', 'ยกเลิก');

        if (result.isConfirmed) {
            showLoading('กำลังอนุมัติ...');
            try {
                const response = await callApi('approveDonation', id);
                if (response.success) {
                    showToast('อนุมัติรายการเรียบร้อย', 'success');
                    loadDashboardData();
                    loadDonations();
                } else {
                    showAlert('ไม่สำเร็จ', response.message, 'error');
                }
            } catch (error) {
                showAlert('ข้อผิดพลาด', error.message, 'error');
            } finally {
                hideLoading();
            }
        }
    }

    async function rejectDonation(id) {
        const { value: note } = await Swal.fire({
            title: 'ปฏิเสธรายการ',
            input: 'textarea',
            inputLabel: 'เหตุผลในการปฏิเสธ (ไม่บังคับ)',
            inputPlaceholder: 'กรอกเหตุผล...',
            showCancelButton: true,
            confirmButtonText: 'ปฏิเสธ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#F44336'
        });

        if (note !== undefined) {
            showLoading('กำลังดำเนินการ...');
            try {
                const response = await callApi('rejectDonation', id, note);
                if (response.success) {
                    showToast('ปฏิเสธรายการเรียบร้อย', 'success');
                    loadDashboardData();
                    loadDonations();
                } else {
                    showAlert('ไม่สำเร็จ', response.message, 'error');
                }
            } catch (error) {
                showAlert('ข้อผิดพลาด', error.message, 'error');
            } finally {
                hideLoading();
            }
        }
    }

    async function deleteDonation(id) {
        const role = String(AppState.session?.role || 'staff').toLowerCase();
        if (role !== 'admin') {
            showAlert('สิทธิ์การใช้งาน', 'เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ลบรายการบริจาค', 'error');
            return;
        }

        const result = await showConfirm('ลบรายการ', 'คุณต้องการลบรายการบริจาคนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้', 'ลบ', 'ยกเลิก');

        if (result.isConfirmed) {
            showLoading('กำลังลบ...');
            try {
                const response = await callApi('deleteDonation', id);
                if (response.success) {
                    showToast('ลบรายการเรียบร้อย', 'success');
                    loadDonations();
                } else {
                    showAlert('ไม่สำเร็จ', response.message, 'error');
                }
            } catch (error) {
                showAlert('ข้อผิดพลาด', error.message, 'error');
            } finally {
                hideLoading();
            }
        }
    }

    function viewSlip(url) {
        if (!url) return;
        Swal.fire({
            title: 'หลักฐานการโอนเงิน',
            imageUrl: url,
            imageAlt: 'สลิปโอนเงิน',
            imageHeight: 500,
            imageWidth: 'auto',
            confirmButtonText: 'ปิด',
            confirmButtonColor: 'var(--primary-color, #4CAF50)'
        });
    }

    async function viewDonation(id) {
        const donation = AppState.donations.find(d => d.ID === id);
        if (!donation) return;

        // Translate details for modal display
        const phaseText = donation.DonationPhase === 'POST_EVENT' ? 'หลังจบกิจกรรม' : 'กิจกรรมหลัก';
        const contribText = donation.ContributionType === 'ADDITIONAL' ? 'สนับสนุนเพิ่มเติม' : 'บริจาคครั้งแรก';
        const attendanceText = donation.AttendanceType === 'PostEvent' ? '— (หลังจบกิจกรรม)' : (donation.AttendanceType || '-');

        Swal.fire({
            title: 'รายละเอียดการบริจาค',
            html: `
      <div style="text-align: left; font-family: 'Kanit', sans-serif;">
        <p><strong>ชื่อผู้บริจาค:</strong> ${donation.DonorName || 'ไม่ประสงค์ออกนาม'}</p>
        <p><strong>ตำแหน่ง:</strong> ${donation.Position || '-'}</p>
        <p><strong>หน่วยงาน:</strong> ${donation.Organization || '-'}</p>
        <p><strong>เบอร์โทร:</strong> ${donation.DonorPhone || '-'}</p>
        <p><strong>เข้าร่วมกิจกรรม:</strong> ${attendanceText}</p>
        <p><strong>ลักษณะการสนับสนุน:</strong> ${contribText}</p>
        ${donation.ContributionType === 'ADDITIONAL' && donation.PreviousDonationReference ? `<p><strong>อ้างอิงรายการเดิม:</strong> ${donation.PreviousDonationReference}</p>` : ''}
        <p><strong>ช่วงการบริจาค:</strong> ${phaseText}</p>
        <p><strong>จำนวนเงิน:</strong> ฿${formatNumber(donation.Amount)}</p>
        <p><strong>ธนาคาร:</strong> ${donation.BankDisplayName || donation.BankCode}</p>
        <p><strong>วันที่โอน:</strong> ${donation.TransferDateFormatted || '-'}</p>
        <p><strong>สถานะ:</strong> <span class="status-badge ${donation.Status}">${getStatusText(donation.Status)}</span></p>
        ${donation.SlipUrl ? `<p><strong>สลิป:</strong> <button onclick="viewSlip('${donation.SlipUrl}')" class="btn btn-sm btn-secondary" style="margin-left: 5px;">🖼️ ดูสลิป</button></p>` : ''}
        ${donation.Note ? `<p><strong>หมายเหตุ:</strong> ${donation.Note}</p>` : ''}
      </div>
    `,
            confirmButtonText: 'ปิด'
        });
    }

    // ===== BANK ACCOUNT ACTIONS =====
    function openBankAccountModal(account = null) {
        try {
            AppState.editingId = account?.ID || null;

            const modal = document.getElementById('bankAccountModal');
            const form = document.getElementById('bankAccountForm');

            if (!modal || !form) {
                console.error('Modal or form not found');
                return;
            }

            const title = modal.querySelector('.modal-title');
            if (title) {
                title.textContent = account ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีธนาคาร';
            }
            form.reset();

            if (account) {
                // Safely set form values
                const setFieldValue = (name, value) => {
                    const field = form.querySelector(`[name="${name}"]`);
                    if (field) field.value = value || '';
                };

                setFieldValue('BankCode', account.BankCode);
                setFieldValue('BankName', account.BankName);
                setFieldValue('AccountNumber', account.AccountNumber);
                setFieldValue('AccountName', account.AccountName);
                setFieldValue('Branch', account.Branch);
                setFieldValue('AccountType', account.AccountType || 'savings');
                setFieldValue('QRCodeType', account.QRCodeType || 'none');
                setFieldValue('PromptPayId', account.PromptPayId);
                setFieldValue('QRCodeUrl', account.QRCodeUrl);
                setFieldValue('DisplayOrder', account.DisplayOrder || 1);
            }

            // Toggle QR fields based on selected type
            if (typeof toggleQRCodeFields === 'function') {
                toggleQRCodeFields();
            }

            openModal('bankAccountModal');
        } catch (error) {
            console.error('openBankAccountModal error:', error);
            showAlert('ข้อผิดพลาด', 'ไม่สามารถเปิดหน้าต่างแก้ไขได้: ' + error.message, 'error');
        }
    }

    function editBankAccount(id) {
        const account = AppState.bankAccounts.find(a => a.ID === id);
        if (account) {
            openBankAccountModal(account);
        }
    }

    async function toggleBankAccount(id, isActive) {
        try {
            const account = AppState.bankAccounts.find(a => a.ID === id);
            if (account) {
                await callApi('updateBankAccount', id, { ...account, IsActive: isActive });
                showToast(isActive ? 'เปิดใช้งานบัญชี' : 'ปิดใช้งานบัญชี', 'success');
                await loadPublicData();
                await loadBankAccounts();
            }
        } catch (error) {
            showAlert('ข้อผิดพลาด', error.message, 'error');
            loadBankAccounts(); // Refresh to revert
        }
    }

    async function deleteBankAccount(id) {
        const role = String(AppState.session?.role || 'staff').toLowerCase();
        if (role !== 'admin') {
            showAlert('สิทธิ์การใช้งาน', 'เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ลบบัญชีธนาคาร', 'error');
            return;
        }

        const result = await showConfirm('ลบบัญชีธนาคาร', 'คุณต้องการลบบัญชีธนาคารนี้ใช่หรือไม่?', 'ลบ', 'ยกเลิก');

        if (result.isConfirmed) {
            showLoading('กำลังลบ...');
            try {
                const response = await callApi('deleteBankAccount', id);
                if (response.success) {
                    showToast('ลบบัญชีธนาคารเรียบร้อย', 'success');
                    await loadPublicData();
                    await loadBankAccounts();
                } else {
                    showAlert('ไม่สำเร็จ', response.message, 'error');
                }
            } catch (error) {
                showAlert('ข้อผิดพลาด', error.message, 'error');
            } finally {
                hideLoading();
            }
        }
    }

    async function saveBankAccount() {
        const form = document.getElementById('bankAccountForm');
        const btn = event?.target || document.querySelector('[onclick="saveBankAccount()"]');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if (!data.BankCode || !data.AccountNumber || !data.AccountName) {
            showAlert('กรุณากรอกข้อมูลให้ครบ', 'รหัสธนาคาร เลขบัญชี และชื่อบัญชี เป็นข้อมูลที่จำเป็น', 'warning');
            return;
        }

        setButtonLoading(btn, true);
        showLoading('กำลังบันทึก...');

        try {
            let response;
            if (AppState.editingId) {
                response = await callApi('updateBankAccount', AppState.editingId, data);
            } else {
                response = await callApi('createBankAccount', data);
            }

            if (response.success) {
                showToast(response.message, 'success');
                closeModal('bankAccountModal');
                await loadPublicData();
                await loadBankAccounts();
            } else {
                showAlert('ไม่สำเร็จ', response.message, 'error');
            }
        } catch (error) {
            showAlert('ข้อผิดพลาด', error.message, 'error');
        } finally {
            setButtonLoading(btn, false);
            hideLoading();
        }
    }

    // ===== SETTINGS ACTIONS =====
    async function saveSettings(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        const btn = event?.submitter || document.querySelector('#settingsForm button[type="submit"]') || document.querySelector('[onclick="saveSettings()"]');
        const hasProjectCoverChange = Boolean(AppState.projectCoverFile);
        setButtonLoading(btn, true, '⏳ กำลังบันทึก...');

        try {
            const data = collectSettingsFormData();

            if (AppState.projectCoverFile) {
                const uploadStatus = document.getElementById('projectCoverUploadStatus');
                if (uploadStatus) uploadStatus.textContent = 'กำลังบีบอัดภาพปก...';
                const compressedFile = await compressProjectCover(AppState.projectCoverFile);
                if (uploadStatus) uploadStatus.textContent = 'กำลังอัปโหลดภาพไป Google Drive...';

                const base64 = await fileToBase64(compressedFile);
                const uploadResult = await callApi(
                    'uploadProjectCover',
                    base64,
                    compressedFile.type
                );

                if (!uploadResult || !uploadResult.success || !uploadResult.fileUrl) {
                    throw new Error(uploadResult?.message || 'อัปโหลดภาพปกไป Google Drive ไม่สำเร็จ');
                }

                data.ProjectCoverUrl = uploadResult.fileUrl;
                if (uploadStatus) uploadStatus.textContent = 'กำลังบันทึกลิงก์ภาพปก...';
            }

            const response = await callApi('saveSettings', data);

            if (!response || !response.success) {
                const uploadStatus = document.getElementById('projectCoverUploadStatus');
                if (hasProjectCoverChange && uploadStatus) uploadStatus.textContent = 'บันทึกภาพปกไม่สำเร็จ กรุณาลองใหม่';
                showAlert('ไม่สำเร็จ', response?.message || 'บันทึกไม่สำเร็จ', 'error');
                return;
            }

            AppState.settings = response.settings || data;

            renderSettingsForm(AppState.settings);

            await loadPublicData();

            if (AppState.currentAdminPage === 'dashboard') {
                await loadDashboardData();
            }

            showToast(response.message || 'บันทึกการตั้งค่าเรียบร้อย', 'success');
        } catch (error) {
            console.error('saveSettings error:', error);
            const uploadStatus = document.getElementById('projectCoverUploadStatus');
            if (hasProjectCoverChange && uploadStatus) uploadStatus.textContent = 'อัปโหลดหรือบันทึกภาพปกไม่สำเร็จ กรุณาลองใหม่';
            showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    }

    // ===== FILE UPLOAD =====
    function setupFileUpload() {
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('slipFile');

        if (!dropZone || !fileInput) return;

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });
    }

    function handleFiles(files) {
        if (files.length === 0) return;

        const file = files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showAlert('ไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์รูปภาพ (JPG, PNG)', 'warning');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            showAlert('ไฟล์ใหญ่เกินไป', 'ขนาดไฟล์ต้องไม่เกิน 5MB', 'warning');
            return;
        }

        AppState.uploadedFile = file;
        showFilePreview(file);
    }

    function showFilePreview(file) {
        const previewContainer = document.getElementById('filePreview');
        const dropZone = document.getElementById('fileDropZone');

        if (!previewContainer) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `
      <div class="file-preview">
        <img src="${e.target.result}" alt="Preview">
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${formatFileSize(file.size)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeFile()">ลบ</button>
      </div>
    `;
            previewContainer.classList.remove('d-none');
            dropZone.classList.add('d-none');
        };
        reader.readAsDataURL(file);
    }

    function removeFile() {
        AppState.uploadedFile = null;
        document.getElementById('slipFile').value = '';
        document.getElementById('filePreview').classList.add('d-none');
        document.getElementById('fileDropZone').classList.remove('d-none');
    }

    // ===== FORM HANDLERS =====
    function setupFormHandlers() {
        // Donation form
        const donationForm = document.getElementById('donationForm');
        if (donationForm) {
            donationForm.addEventListener('submit', handleDonationSubmit);
        }
    }

    async function handleDonationSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Validation based on status
        const isPostEvent = AppState.settings && AppState.settings.effectiveEventStatus === 'POST_EVENT';

        if (!data.Amount || parseFloat(data.Amount) <= 0) {
            showAlert('กรุณากรอกจำนวนเงิน', '', 'warning');
            return;
        }

        if (!data.Position || !data.Position.trim()) {
            showAlert('กรุณากรอกตำแหน่งของคุณ', '', 'warning');
            return;
        }

        if (!data.Organization || !data.Organization.trim()) {
            showAlert('กรุณากรอกหน่วยงานของคุณ', '', 'warning');
            return;
        }

        if (!isPostEvent) {
            if (!data.AttendanceType) {
                showAlert('กรุณาเลือกรูปแบบการเข้าร่วมกิจกรรม', '', 'warning');
                return;
            }
        } else {
            // Validate ContributionType
            if (!data.ContributionType) {
                showAlert('กรุณาเลือกลักษณะการสนับสนุน', '', 'warning');
                return;
            }
            if (data.ContributionType === 'ADDITIONAL' && data.PreviousDonationReference && data.PreviousDonationReference.length > 200) {
                showAlert('ข้อมูลอ้างอิงรายการเดิมยาวเกินไป', 'ความยาวต้องไม่เกิน 200 ตัวอักษร', 'warning');
                return;
            }
        }

        setButtonLoading(submitBtn, true, '⏳ กำลังบันทึก...');
        showLoading('กำลังบันทึกข้อมูล...');

        try {
            // Upload file first if exists
            if (AppState.uploadedFile) {
                const base64 = await fileToBase64(AppState.uploadedFile);
                const uploadResult = await callApi('saveFileFromBase64', base64, AppState.uploadedFile.name, AppState.uploadedFile.type);

                if (uploadResult.success) {
                    data.SlipFileId = uploadResult.fileId;
                    data.SlipUrl = uploadResult.fileUrl;
                }
            }

            // Save donation
            const response = await callApi('createDonation', data);

            if (response.success) {
                await Swal.fire({
                    icon: 'success',
                    title: 'ขอบคุณสำหรับการบริจาค!',
                    text: response.message,
                    confirmButtonText: 'ตกลง'
                });

                form.reset();
                removeFile();
                const otherBankGroup = document.getElementById('otherBankGroup');
                if (otherBankGroup) otherBankGroup.style.display = 'none';
                document.querySelectorAll('.bank-option').forEach(opt => opt.classList.remove('selected'));

                // Refresh public data
                await loadPublicData();
                navigateTo('public');
            } else {
                showAlert('ไม่สำเร็จ', response.message, 'error');
            }
        } catch (error) {
            showAlert('ข้อผิดพลาด', error.message, 'error');
        } finally {
            setButtonLoading(submitBtn, false);
            hideLoading();
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ===== MODAL FUNCTIONS =====
    function openModal(modalId) {
        document.getElementById('modalBackdrop').classList.add('active');
        document.getElementById(modalId).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        document.getElementById('modalBackdrop').classList.remove('active');
        document.body.style.overflow = '';
        AppState.editingId = null;
    }

    function closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.getElementById('modalBackdrop').classList.remove('active');
        document.body.style.overflow = '';
        AppState.editingId = null;
    }

    function openAllDonorsModal() {
        // รีเซ็ตจำนวนที่แสดงเริ่มต้นให้กลับไปเป็น 20
        AppState.currentVisibleDonors = AppState.donorsLimit;
        
        // เรนเดอร์รายชื่อผู้บริจาคทั้งหมดตามจำนวนที่จำกัด
        renderAllDonorsList(AppState.currentVisibleDonors);
        
        // แสดง / ซ่อนปุ่มโหลดเพิ่มเติม
        const btnLoadMore = document.getElementById('btnLoadMoreDonors');
        if (btnLoadMore) {
            const totalDonors = AppState.recentDonors ? AppState.recentDonors.length : 0;
            if (totalDonors > AppState.currentVisibleDonors) {
                btnLoadMore.style.display = 'block';
            } else {
                btnLoadMore.style.display = 'none';
            }
        }

        openModal('allDonorsModal');
    }

    function renderAllDonorsList(visibleCount) {
        const container = document.getElementById('allDonorsList');
        if (!container) return;

        const donors = AppState.recentDonors || [];
        if (donors.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>ยังไม่มีผู้บริจาค</p></div>';
            return;
        }

        const colors = ['#F5A623', '#4CAF50', '#2196F3', '#9C27B0', '#FF5722'];
        // ดึงมาแสดงตามจำนวนที่กำหนด
        const displayDonors = donors.slice(0, visibleCount);

        container.innerHTML = displayDonors.map((donor, index) => `
            <div class="donor-item">
                <div class="donor-avatar" style="background-color: ${colors[index % colors.length]}20; color: ${colors[index % colors.length]}">
                    ${(donor.name || 'ไ').charAt(0).toUpperCase()}
                </div>
                <div class="donor-info">
                    <div class="donor-name" title="${donor.name || 'ไม่ประสงค์ออกนาม'}">${donor.name || 'ไม่ประสงค์ออกนาม'}</div>
                    <div class="donor-time">${donor.date || ''}</div>
                </div>
                <div class="donor-amount">+฿${formatNumber(donor.amount)}</div>
            </div>
        `).join('');
    }

    // Expose to window scope just in case
    window.openAllDonorsModal = openAllDonorsModal;
    window.renderAllDonorsList = renderAllDonorsList;

    // ===== UTILITY FUNCTIONS =====
    function formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return Number(num).toLocaleString('th-TH');
    }

    function formatCurrency(num) {
        if (num === null || num === undefined) return '฿0';
        return '฿' + Number(num).toLocaleString('th-TH');
    }

    function formatAccountNumber(num) {
        if (!num) return '';
        const str = num.toString();
        // Format based on length
        if (str.length === 10) {
            // Thai bank account: xxx-x-xxxxx-x
            return str.replace(/(\d{3})(\d{1})(\d{5})(\d{1})/, '$1-$2-$3-$4');
        } else if (str.length === 13) {
            // Thai ID: x-xxxx-xxxxx-xx-x
            return str.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5');
        }
        return str;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatThaiDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ===== THAI DATE (พ.ศ.) FUNCTIONS =====
    function setCurrentDateTime() {
        const now = new Date();
        const thaiYear = now.getFullYear() + 543; // Convert to Buddhist Era

        document.getElementById('transferDay').value = now.getDate();
        document.getElementById('transferMonth').value = String(now.getMonth() + 1).padStart(2, '0');
        document.getElementById('transferYear').value = thaiYear;
        document.getElementById('transferTime').value =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');

        // Update hidden field
        updateTransferDateHidden();
    }

    function updateTransferDateHidden() {
        const day = document.getElementById('transferDay')?.value;
        const month = document.getElementById('transferMonth')?.value;
        const yearBE = document.getElementById('transferYear')?.value;
        const time = document.getElementById('transferTime')?.value;

        if (day && month && yearBE && time) {
            const yearCE = parseInt(yearBE) - 543; // Convert พ.ศ. to ค.ศ.
            const dateStr = `${yearCE}-${month}-${String(day).padStart(2, '0')}T${time}`;
            document.getElementById('transferDateHidden').value = dateStr;
        }
    }

    // Add event listeners for date fields
    document.addEventListener('DOMContentLoaded', () => {
        ['transferDay', 'transferMonth', 'transferYear', 'transferTime'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', updateTransferDateHidden);
            }
        });
    });

    function getStatusText(status) {
        const statusMap = {
            'pending': '⏳ รอตรวจสอบ',
            'approved': '✓ อนุมัติ',
            'rejected': '✗ ปฏิเสธ'
        };
        return statusMap[status] || status;
    }

    function getAccountTypeText(type) {
        const typeMap = {
            'savings': 'ออมทรัพย์',
            'current': 'กระแสรายวัน',
            'promptpay': 'พร้อมเพย์'
        };
        return typeMap[type] || type;
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function adjustColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text.replace(/-/g, '')).then(() => {
            showToast('คัดลอกเลขบัญชีแล้ว', 'success');
        }).catch(() => {
            showToast('ไม่สามารถคัดลอกได้', 'error');
        });
    }

    // ===== DONATION FILTER =====
    let currentDonationStatus = 'all';

    function filterDonations(status) {
        currentDonationStatus = status;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (event && event.target) {
            event.target.classList.add('active');
        }

        applyFilters();
    }

    function searchDonations() {
        applyFilters();
    }

    function applyFilters() {
        const searchInput = document.getElementById('donationSearch');
        const phaseSelect = document.getElementById('filterDonationPhase');
        const contribSelect = document.getElementById('filterContributionType');

        const filter = {};
        if (currentDonationStatus !== 'all') {
            filter.status = currentDonationStatus;
        }
        if (searchInput && searchInput.value.trim()) {
            filter.search = searchInput.value.trim();
        }
        if (phaseSelect && phaseSelect.value) {
            filter.donationPhase = phaseSelect.value;
        }
        if (contribSelect && contribSelect.value) {
            filter.contributionType = contribSelect.value;
        }

        loadDonations(filter);
    }

    window.filterDonations = filterDonations;
    window.searchDonations = searchDonations;
    window.applyFilters = applyFilters;

    // ===== EXPORT FUNCTION =====
    function exportReportChartImage(chart) {
        if (!chart || !chart.canvas) return null;

        const canvas = chart.canvas;
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        const originalStyleWidth = canvas.style.width;
        const originalStyleHeight = canvas.style.height;

        try {
            chart.resize(1200, 800);
            return chart.toBase64Image('image/png', 1);
        } finally {
            canvas.style.width = originalStyleWidth;
            canvas.style.height = originalStyleHeight;
            canvas.width = originalWidth;
            canvas.height = originalHeight;
            chart.resize();
        }
    }

    async function exportDonations() {
        const btn = document.querySelector('button[onclick="exportDonations()"]') || (event && event.target);
        const { value: formValues } = await Swal.fire({
            title: '📥 ส่งออกรายงาน PDF (A4 Landscape)',
            html: `
                <div style="text-align: left; font-family: 'Kanit', sans-serif;">
                    <div class="mb-3">
                        <label for="swal-start-date" class="form-label" style="font-weight: 500; display: block; margin-bottom: 6px;">วันเริ่มต้น:</label>
                        <input type="text" id="swal-start-date" placeholder="วว/ดด/พ.ศ. (เช่น 14/7/2569)" class="form-control" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
                    </div>
                    <div class="mb-3" style="margin-top: 12px;">
                        <label for="swal-end-date" class="form-label" style="font-weight: 500; display: block; margin-bottom: 6px;">วันสิ้นสุด:</label>
                        <input type="text" id="swal-end-date" placeholder="วว/ดด/พ.ศ. (เช่น 14/7/2569)" class="form-control" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
                    </div>
                    <div style="margin-top: 12px; display: flex; align-items: center;">
                        <input type="checkbox" id="swal-all-time" style="width: 18px; height: 18px; margin-right: 8px; cursor: pointer;">
                        <label for="swal-all-time" style="user-select: none; cursor: pointer; font-size: 0.95rem;">
                            แสดงข้อมูลทั้งหมด (ไม่กรองช่วงเวลา)
                        </label>
                    </div>
                    <div class="mb-3" style="margin-top: 16px;">
                        <label for="swal-note" class="form-label" style="font-weight: 500; display: block; margin-bottom: 6px;">หมายเหตุแนบท้ายรายงาน (ไม่บังคับ):</label>
                        <input type="text" id="swal-note" class="form-control" placeholder="เช่น รายงานประจำปีการศึกษา..." style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonColor: '#F5A623',
            cancelButtonColor: '#666',
            confirmButtonText: 'สร้างรายงาน',
            cancelButtonText: 'ยกเลิก',
            didOpen: () => {
                const allTimeCheck = document.getElementById('swal-all-time');
                const startInput = document.getElementById('swal-start-date');
                const endInput = document.getElementById('swal-end-date');
                
                // ตั้งค่าเริ่มต้นวันสิ้นสุดเป็นวันนี้
                const today = new Date();
                
                // ตั้งค่าเริ่มต้นวันเริ่มต้นเป็น 30 วันที่แล้ว
                const lastMonth = new Date();
                lastMonth.setDate(lastMonth.getDate() - 30);
                
                const pickerOptions = {
                    dateFormat: "d/m/Y",
                    locale: "th",
                    formatDate: (date) => {
                        const day = date.getDate();
                        const month = date.getMonth() + 1;
                        const year = date.getFullYear() + 543;
                        return `${day}/${month}/${year}`;
                    },
                    parseDate: (datestr) => {
                        const parts = datestr.split('/');
                        if (parts.length === 3) {
                            const day = parseInt(parts[0]);
                            const month = parseInt(parts[1]) - 1;
                            const year = parseInt(parts[2]) - 543;
                            return new Date(year, month, day);
                        }
                        return new Date(datestr);
                    }
                };

                const startPicker = flatpickr(startInput, {
                    ...pickerOptions,
                    defaultDate: lastMonth
                });

                const endPicker = flatpickr(endInput, {
                    ...pickerOptions,
                    defaultDate: today
                });
                
                window.activeStartPicker = startPicker;
                window.activeEndPicker = endPicker;
                
                allTimeCheck.addEventListener('change', () => {
                    const checked = allTimeCheck.checked;
                    startInput.disabled = checked;
                    endInput.disabled = checked;
                    
                    if (checked) {
                        startInput.style.pointerEvents = 'none';
                        endInput.style.pointerEvents = 'none';
                        startInput.style.backgroundColor = '#f0f0f0';
                        endInput.style.backgroundColor = '#f0f0f0';
                        startPicker.clear();
                        endPicker.clear();
                    } else {
                        startInput.style.pointerEvents = 'auto';
                        endInput.style.pointerEvents = 'auto';
                        startInput.style.backgroundColor = '#ffffff';
                        endInput.style.backgroundColor = '#ffffff';
                        startPicker.setDate(lastMonth);
                        endPicker.setDate(today);
                    }
                });
            },
            preConfirm: () => {
                const allTime = document.getElementById('swal-all-time').checked;
                const startPicker = window.activeStartPicker;
                const endPicker = window.activeEndPicker;
                
                let startDate = null;
                let endDate = null;
                
                if (!allTime) {
                    if (startPicker && startPicker.selectedDates[0]) {
                        const d = startPicker.selectedDates[0];
                        startDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    }
                    if (endPicker && endPicker.selectedDates[0]) {
                        const d = endPicker.selectedDates[0];
                        endDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    }
                }
                
                const note = document.getElementById('swal-note').value;
                
                if (!allTime && (!startDate || !endDate)) {
                    Swal.showValidationMessage('กรุณาระบุวันเริ่มต้นและสิ้นสุด หรือติ๊กแสดงข้อมูลทั้งหมด');
                    return false;
                }
                
                delete window.activeStartPicker;
                delete window.activeEndPicker;
                
                return {
                    startDate: startDate,
                    endDate: endDate,
                    note: note
                };
            },
            willClose: () => {
                delete window.activeStartPicker;
                delete window.activeEndPicker;
            }
        });

        if (!formValues) return; // User cancelled

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ กำลังสร้างรายงาน...';
        }
        showLoading('กำลังส่งออกรายงาน PDF...');

        try {
            const response = await callApi('generateDonationReport', {
                startDate: formValues.startDate,
                endDate: formValues.endDate,
                note: formValues.note
            });

            if (response && response.success) {
                await Swal.fire({
                    title: '🎉 สร้างรายงานสำเร็จ',
                    html: `
                        <div style="font-family: 'Kanit', sans-serif; text-align: center;">
                            <p style="margin-bottom: 15px;">ไฟล์รายงานของคุณถูกจัดทำเป็น PDF เรียบร้อยแล้ว</p>
                            <p style="font-size: 0.9rem; color: #666; word-break: break-all; margin-bottom: 20px;">
                                <b>ชื่อไฟล์:</b> ${response.fileName}
                            </p>
                            <a href="${response.pdfUrl}" target="_blank" class="btn btn-primary" style="display: inline-block; padding: 10px 24px; font-weight: bold; background-color: #F5A623; border-color: #F5A623; color: white; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(245, 166, 35, 0.3);">
                                📥 เปิดดูรายงาน PDF
                            </a>
                        </div>
                    `,
                    icon: 'success',
                    showConfirmButton: true,
                    confirmButtonText: 'เสร็จสิ้น',
                    confirmButtonColor: '#666'
                });
            } else {
                throw new Error(response ? response.message : 'ไม่ได้รับข้อมูลตอบกลับที่ถูกต้องจากเซิร์ฟเวอร์');
            }
        } catch (error) {
            console.error('Export report error:', error);
            showAlert('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถสร้างรายงาน PDF ได้สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            hideLoading();
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '📥 ส่งออกรายงาน';
            }
        }
    }

    // ===== SIDEBAR TOGGLE (MOBILE) =====
    function toggleSidebar() {
        const sidebar = document.querySelector('.admin-sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    function closeSidebar() {
        const sidebar = document.querySelector('.admin-sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    // ===== QR CODE FIELD TOGGLE =====
    function toggleQRCodeFields() {
        const qrType = document.getElementById('qrCodeTypeSelect')?.value || 'none';
        const autoFields = document.getElementById('qrAutoFields');
        const customFields = document.getElementById('qrCustomFields');

        if (autoFields) {
            autoFields.style.display = qrType === 'auto' ? 'block' : 'none';
        }
        if (customFields) {
            customFields.style.display = qrType === 'custom' ? 'block' : 'none';
        }
    }

    // ===== DONORS PAGE FUNCTIONS (Task 2) =====
    const donorFilter = {
        type: 'all',
        search: ''
    };

    async function loadDonors() {
        try {
            showLoading('กำลังโหลดรายชื่อผู้บริจาค...');
            const donors = await callApi('getDonorsSummary', donorFilter);
            AppState.donors = donors;
            renderDonorsList(donors);
        } catch (error) {
            console.error('loadDonors error:', error);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้บริจาค', 'error');
        } finally {
            hideLoading();
        }
    }

    function renderDonorsList(donors) {
        const tbody = document.getElementById('donorsTableBody');
        if (!tbody) return;

        if (!donors || donors.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center p-lg">
                        <div class="empty-state">
                            <div class="empty-icon">👥</div>
                            <div class="empty-title">ไม่พบรายชื่อผู้บริจาค</div>
                            <div class="empty-text">ไม่มีข้อมูลผู้บริจาคที่ตรงตามเงื่อนไข</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = donors.map(donor => `
            <tr>
                <td><strong>${donor.name}</strong></td>
                <td>${donor.phone || '-'}</td>
                <td>${donor.count} ครั้ง</td>
                <td><strong style="color: var(--success-color);">฿${formatNumber(donor.totalAmount)}</strong></td>
                <td>${donor.lastDonationDateFormatted || ''}</td>
                <td><span class="status-badge approved">Active</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="showDonorDetail('${donor.phone}', '${donor.name}')" style="min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                        👁️ ดูประวัติ
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function searchDonors() {
        const searchInput = document.getElementById('donorSearch');
        if (searchInput) {
            donorFilter.search = searchInput.value;
            loadDonors();
        }
    }

    function filterDonors(type) {
        document.querySelectorAll('.donor-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (event && event.target) {
            event.target.classList.add('active');
        }
        donorFilter.type = type;
        loadDonors();
    }

    function showDonorDetail(phone, name) {
        if (!AppState.donors) return;
        const donor = AppState.donors.find(d => (d.phone || '') === (phone || '') && d.name === name);
        if (!donor) return;

        document.getElementById('detailDonorName').textContent = donor.name;
        document.getElementById('detailDonorPhone').textContent = donor.phone || '-';
        document.getElementById('detailDonorCount').textContent = donor.count + ' ครั้ง';
        document.getElementById('detailDonorTotal').textContent = '฿' + formatNumber(donor.totalAmount);

        const tbody = document.getElementById('donorDonationsTableBody');
        if (tbody) {
            tbody.innerHTML = donor.donations.map(d => `
                <tr>
                    <td>${d.timestampFormatted || ''}</td>
                    <td><strong>฿${formatNumber(d.amount)}</strong></td>
                    <td><span style="color: ${d.bankColor}">${d.bankDisplayName}</span></td>
                    <td>
                        ${d.slipUrl ? `<a href="${d.slipUrl}" target="_blank" class="btn btn-sm btn-secondary" style="min-height: 36px; padding: 4px 8px; display: inline-flex; align-items: center;">🖼️ สลิป</a>` : '-'}
                    </td>
                    <td>
                        <span class="status-badge ${d.status}">
                            ${getStatusText(d.status)}
                        </span>
                    </td>
                </tr>
            `).join('');
        }

        openModal('donorDetailModal');
    }

    // ===== USER MANAGEMENT FUNCTIONS (Task 7) =====
    let usersDataList = [];
    let isUsersLoading = false;

    async function loadUsers() {
        if (isUsersLoading) return;
        isUsersLoading = true;
        try {
            showLoading('กำลังโหลดข้อมูลผู้ใช้งาน...');
            const response = await callApi('getUsers');
            if (response.success) {
                usersDataList = response.users || [];
                renderUsersList(usersDataList);
            } else {
                showAlert('ไม่สำเร็จ', response.message, 'error');
            }
        } catch (error) {
            showAlert('ข้อผิดพลาด', error.message, 'error');
        } finally {
            hideLoading();
            isUsersLoading = false;
        }
    }

    function formatThaiDate(dateStr) {
        if (!dateStr || String(dateStr).trim() === '' || String(dateStr) === '-') {
            return '—';
        }
        
        try {
            let date;
            if (dateStr instanceof Date) {
                date = dateStr;
            } else {
                const normalizedDateStr = String(dateStr).replace(' ', 'T');
                date = new Date(normalizedDateStr);
            }
            
            if (isNaN(date.getTime())) {
                return '—';
            }
            
            const thaiMonths = [
                'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
            ];
            
            const day = date.getDate();
            const month = thaiMonths[date.getMonth()];
            const year = date.getFullYear() + 543;
            
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${day} ${month} ${year}<br><span style="font-size: 0.85rem; color: var(--text-muted); font-weight: normal;">${hours}:${minutes} น.</span>`;
        } catch (e) {
            console.error('Error formatting date:', e);
            return '—';
        }
    }

    function renderUsersList(users) {
        const tbody = document.getElementById('usersListTable');
        if (!tbody) return;
        
        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center;" class="p-lg">
                        <div class="empty-state">
                            <div class="empty-icon">👥</div>
                            <div class="empty-title">ไม่พบรายชื่อผู้ใช้งาน</div>
                            <div class="empty-text">ยังไม่มีบัญชีผู้ใช้ในระบบ</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        const currentUsername = String(AppState.session?.username || '').toLowerCase();
        
        tbody.innerHTML = users.map(user => {
            const isActive = user.IsActive === true || String(user.IsActive).toUpperCase() === 'TRUE';
            const isSelf = String(user.Username).toLowerCase() === currentUsername;
            
            let statusClass = 'suspended';
            let statusText = 'Suspended';
            
            if (isActive) {
                statusClass = 'active';
                statusText = 'Active';
            } else {
                const noteLower = String(user.Note || '').toLowerCase();
                if (noteLower.includes('inactive')) {
                    statusClass = 'inactive';
                    statusText = 'Inactive';
                } else {
                    statusClass = 'suspended';
                    statusText = 'Suspended';
                }
            }
            
            return `
                <tr>
                    <td data-label="UserID">${user.UserID}</td>
                    <td data-label="ชื่อผู้ใช้ (Username)" title="${user.Username}"><strong>${user.Username}</strong></td>
                    <td data-label="ชื่อที่แสดง" title="${user.DisplayName}">${user.DisplayName}</td>
                    <td data-label="บทบาท">
                        <span class="role-badge ${String(user.Role).toLowerCase()}">
                            ${user.Role}
                        </span>
                    </td>
                    <td data-label="สถานะ">
                        <span class="status-badge-user ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td data-label="ใช้งานล่าสุด">${formatThaiDate(user.LastLogin)}</td>
                    <td>
                        <div class="user-action-group">
                            <button type="button" class="btn btn-secondary" onclick="openUserModal('${user.UserID}')">แก้ไข</button>
                            ${!isSelf ? `<button type="button" class="btn btn-danger" onclick="deleteUser('${user.UserID}')">ลบ</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function openUserModal(userId = '') {
        const modal = document.getElementById('userModal');
        const titleEl = document.getElementById('userModalTitle');
        const form = document.getElementById('userForm');
        
        if (!modal || !form) return;
        
        form.reset();
        document.getElementById('userFormId').value = '';
        
        const usernameInput = document.getElementById('userFormUsername');
        if (usernameInput) usernameInput.disabled = false;
        
        if (userId) {
            titleEl.textContent = 'แก้ไขผู้ใช้งาน';
            const user = usersDataList.find(u => u.UserID === userId);
            if (user) {
                document.getElementById('userFormId').value = user.UserID;
                if (usernameInput) {
                    usernameInput.value = user.Username;
                    usernameInput.disabled = true;
                }
                document.getElementById('userFormDisplayName').value = user.DisplayName;
                document.getElementById('userFormPassword').value = user.Password;
                document.getElementById('userFormRole').value = user.Role;
                
                const isActive = user.IsActive === true || String(user.IsActive).toUpperCase() === 'TRUE';
                document.getElementById('userFormIsActive').value = isActive ? 'true' : 'false';
                document.getElementById('userFormNote').value = user.Note || '';
            }
        } else {
            titleEl.textContent = 'เพิ่มผู้ใช้งาน';
        }
        
        openModal('userModal');
        setupUserPasswordToggle();
    }

    function setupUserPasswordToggle() {
        const passwordInput = document.getElementById('userFormPassword');
        const toggleButton = document.getElementById('userFormPasswordToggle');
        if (!passwordInput || !toggleButton) return;

        const eyeIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        const eyeOffIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        const updateToggleState = (isVisible) => {
            passwordInput.type = isVisible ? 'text' : 'password';
            toggleButton.innerHTML = isVisible ? eyeOffIcon : eyeIcon;
            toggleButton.setAttribute('aria-label', isVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
            toggleButton.setAttribute('aria-pressed', String(isVisible));
        };

        if (toggleButton.dataset.bound !== 'true') {
            toggleButton.addEventListener('click', () => {
                updateToggleState(passwordInput.type === 'password');
                passwordInput.focus();
            });
            toggleButton.dataset.bound = 'true';
        }

        updateToggleState(false);
    }

    let isSavingUser = false;

    async function saveUser() {
        if (isSavingUser) return;
        
        const form = document.getElementById('userForm');
        if (!form) return;
        
        const username = document.getElementById('userFormUsername').value.trim();
        const displayName = document.getElementById('userFormDisplayName').value.trim();
        const password = document.getElementById('userFormPassword').value.trim();
        
        if (!username || !displayName || !password) {
            showToast('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน', 'warning');
            return;
        }

        if (username.includes('_')) {
            showToast('Username ห้ามมีขีดล่าง (_)', 'warning');
            return;
        }
        
        const userId = document.getElementById('userFormId').value;
        const role = document.getElementById('userFormRole').value;
        const isActive = document.getElementById('userFormIsActive').value === 'true';
        const note = document.getElementById('userFormNote').value.trim();
        
        const userData = {
            UserID: userId,
            Username: username,
            DisplayName: displayName,
            Password: password,
            Role: role,
            IsActive: isActive,
            Note: note
        };
        
        const btn = document.querySelector('[onclick="saveUser()"]');
        setButtonLoading(btn, true, '⏳ กำลังบันทึก...');
        showLoading('กำลังบันทึกข้อมูล...');
        isSavingUser = true;
        
        try {
            const response = await callApi('saveUser', userData);
            if (response.success) {
                showToast(response.message, 'success');
                closeModal('userModal');
                await loadUsers();
            } else {
                showAlert('ไม่สำเร็จ', response.message, 'error');
            }
        } catch (error) {
            showAlert('ข้อผิดพลาด', error.message, 'error');
        } finally {
            setButtonLoading(btn, false);
            hideLoading();
            isSavingUser = false;
        }
    }

    let isDeletingUser = false;

    async function deleteUser(userId) {
        if (isDeletingUser) return;
        const result = await showConfirm('ลบผู้ใช้งาน', 'คุณต้องการลบบัญชีผู้ใช้งานนี้ใช่หรือไม่?', 'ลบ', 'ยกเลิก');
        
        if (result.isConfirmed) {
            showLoading('กำลังลบผู้ใช้งาน...');
            isDeletingUser = true;
            try {
                const response = await callApi('deleteUser', userId);
                if (response.success) {
                    showToast(response.message, 'success');
                    await loadUsers();
                } else {
                    showAlert('ไม่สำเร็จ', response.message, 'error');
                }
            } catch (error) {
                showAlert('ข้อผิดพลาด', error.message, 'error');
            } finally {
                hideLoading();
                isDeletingUser = false;
            }
        }
    }
