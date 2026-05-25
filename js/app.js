/**
 * CanvasChat — Main Application (v2)
 * Полная переработка с безопасностью, темами, планами
 */

class CanvasChatApp {
    constructor() {
        this.firebase = firebaseService;
        this.canvas = null;
        this.sync = null;
        this.chat = null;
        this.friends = null;
        this.ui = new UIManager();
        this.onboarding = new Onboarding();

        this.currentUser = null;
        this.userProfile = null;

        // Таймер очистки холста (10 минут)
        this.CLEAR_INTERVAL = 10 * 60 * 1000;
        this.clearTimerInterval = null;
        this.nextClearTime = null;

        // Лимит краски
        this.DAILY_PAINT_LIMIT = 1000; // единиц краски
        this.currentPaintUsed = 0;
    }

    async init() {
        try {
            await this.firebase.init();

            this.firebase.onAuthStateChanged(async (user) => {
                if (user) {
                    this.currentUser = user;
                    await this._initApp();
                } else {
                    window.location.href = '../index.html';
                }
            });
        } catch (error) {
            console.error('[App] Критическая ошибка:', error);
            this._hideLoading();
            this.ui.showToast('Ошибка подключения к серверу', 'error');
        }
    }

    async _initApp() {
        try {
            // Загружаем профиль
            this.userProfile = await this.firebase.getUserProfile(this.currentUser.uid);
            if (!this.userProfile) {
                console.error('[App] Профиль не найден');
                await this.firebase.logout();
                return;
            }

            // Определяем лимит по плану
            this._setPlanLimits();

            // Загружаем тему
            this._loadTheme();

            // Инициализация Canvas Engine
            const canvasEl = document.getElementById('mainCanvas');
            const containerEl = document.getElementById('canvasContainer');
            this.canvas = new CanvasEngine(canvasEl, containerEl);

            // Инициализация синхронизации
            this.sync = new RealtimeSync(this.firebase, this.canvas, this.currentUser.uid);
            this.sync.paintLimit = this.DAILY_PAINT_LIMIT;
            await this.sync.start();

            // Инициализация чата
            this.chat = new ChatManager(this.firebase, this.currentUser.uid, this.userProfile);
            await this.chat.init();

            // Инициализация друзей
            this.friends = new FriendsManager(this.firebase, this.currentUser.uid, this.chat, this.ui);
            await this.friends.init();

            // Настройка UI
            this._setupUI();

            // Таймер очистки
            this._startClearTimer();

            // Присутствие
            await this.firebase._updatePresence(this.currentUser.uid);

            // Загрузочный экран
            this._hideLoading();

            // Онбординг
            this.onboarding.show();

            this.ui.showToast(`С возвращением, ${Security.escapeHtml(this.userProfile?.nickname || 'Художник')}!`, 'success');
            console.log('[App] Инициализация завершена');
        } catch (error) {
            console.error('[App] Ошибка:', error);
            this._hideLoading();
            this.ui.showToast('Ошибка загрузки приложения', 'error');
        }
    }

    _setPlanLimits() {
        const plan = this.userProfile?.plan || 'free';
        switch (plan) {
            case 'pro':
                this.DAILY_PAINT_LIMIT = 10000;
                this.CLEAR_INTERVAL = 30 * 60 * 1000;
                break;
            case 'premium':
                this.DAILY_PAINT_LIMIT = Infinity;
                this.CLEAR_INTERVAL = Infinity;
                break;
            default:
                this.DAILY_PAINT_LIMIT = 1000;
                this.CLEAR_INTERVAL = 10 * 60 * 1000;
        }
    }

    _hideLoading() {
        const loading = document.getElementById('loadingScreen');
        if (loading) {
            loading.classList.add('hidden');
            setTimeout(() => loading.remove(), 500);
        }
    }

    // ==========================================
    // Тема
    // ==========================================

    _loadTheme() {
        const saved = localStorage.getItem('canvaschat_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        const toggle = document.getElementById('themeToggle');
        if (toggle) toggle.checked = saved === 'dark';
    }

    _toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('canvaschat_theme', next);

        // Перерисовываем холст
        if (this.canvas) this.canvas.render();
    }

    // ==========================================
    // Таймер очистки холста
    // ==========================================

    _startClearTimer() {
        if (this.CLEAR_INTERVAL === Infinity) {
            const timerEl = document.getElementById('canvasTimer');
            if (timerEl) timerEl.style.display = 'none';
            return;
        }

        this.nextClearTime = Date.now() + this.CLEAR_INTERVAL;

        this.clearTimerInterval = setInterval(() => {
            const remaining = this.nextClearTime - Date.now();

            if (remaining <= 0) {
                this._clearCanvas();
                this.nextClearTime = Date.now() + this.CLEAR_INTERVAL;
                return;
            }

            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            const timerText = document.getElementById('timerText');
            const timerEl = document.getElementById('canvasTimer');

            if (timerText) {
                timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            if (timerEl) {
                timerEl.classList.toggle('warning', remaining < 60000);
            }
        }, 1000);
    }

    _clearCanvas() {
        if (this.canvas) {
            this.canvas.clear();
            this.ui.showToast('Холст очищен! Новый раунд начался 🎨', 'info');
        }
    }

    // ==========================================
    // UI Setup
    // ==========================================

    _setupUI() {
        // Тулбар
        this.ui.setupToolbar(this.canvas);

        // Сайдбар
        this.ui.setupSidebar();

        // Профиль
        this._setupProfile();

        // Тема
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('change', () => this._toggleTheme());
        }

        // Лимит краски
        this._updatePaintDisplay();

        this.sync.onStrokeCountChange = (used, limit) => {
            this.currentPaintUsed = used;
            this._updatePaintDisplay();
        };

        this.sync.onLimitReached = () => {
            this._showLimitModal();
        };

        // Онлайн пользователи
        this.sync.onOnlineUsersChange = (users) => {
            this.ui.updateOnlineUsers(users);
        };

        // Зум
        this.ui.updateZoomDisplay(this.canvas.getZoomPercent());

        // Сайдбар toggle
        document.getElementById('toggleSidebarBtn')?.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebarRight');
            if (sidebar) sidebar.classList.toggle('collapsed');
            if (window.innerWidth <= 768) {
                sidebar?.classList.toggle('active');
            }
        });

        // Глобальный чат
        document.getElementById('globalChatBtn')?.addEventListener('click', () => {
            this.chat.loadChat('global');
        });

        // Планы
        this._setupPlans();

        // Мобильные инструменты
        this._setupMobile();

        // Текстовый инструмент
        this._setupTextTool();

        // Keyboard
        this._setupKeyboard();

        // Лимит модалка
        document.getElementById('limitCloseBtn')?.addEventListener('click', () => {
            document.getElementById('limitModal')?.classList.remove('active');
        });
        document.getElementById('limitUpgradeBtn')?.addEventListener('click', () => {
            document.getElementById('limitModal')?.classList.remove('active');
            this._openPlans();
        });

        // Reset onboarding
        document.getElementById('resetOnboardingBtn')?.addEventListener('click', () => {
            const ob = new Onboarding();
            ob.reset();
            ob.show();
            document.getElementById('profileDropdown')?.classList.remove('active');
        });

        // Reset view
        document.getElementById('resetViewBtn')?.addEventListener('click', () => {
            this.canvas?.resetView();
            document.getElementById('profileDropdown')?.classList.remove('active');
        });
    }

    // ==========================================
    // Профиль
    // ==========================================

    _setupProfile() {
        const avatarBtn = document.getElementById('userAvatarBtn');
        const dropdown = document.getElementById('profileDropdown');
        const nameEl = document.getElementById('profileName');
        const emailEl = document.getElementById('profileEmail');
        const avatarEl = document.getElementById('userAvatar');
        const avatarLargeEl = document.getElementById('profileAvatarLarge');

        // Заполняем данные
        const nickname = this.userProfile?.nickname || 'Пользователь';
        const initial = nickname[0].toUpperCase();

        if (nameEl) nameEl.textContent = Security.escapeHtml(nickname);
        if (emailEl) emailEl.textContent = this.currentUser?.email || '';
        if (avatarEl) {
            if (this.userProfile?.avatar) {
                avatarEl.innerHTML = `<img src="${this.userProfile.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatarEl.textContent = initial;
            }
        }
        if (avatarLargeEl) {
            if (this.userProfile?.avatar) {
                avatarLargeEl.innerHTML = `<img src="${this.userProfile.avatar}" alt="Avatar">`;
            } else {
                avatarLargeEl.textContent = initial;
            }
        }

        // Toggle dropdown
        avatarBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!dropdown?.contains(e.target) && e.target !== avatarBtn) {
                dropdown?.classList.remove('active');
            }
        });

        // Смена аватарки
        const avatarEdit = document.getElementById('profileAvatarEdit');
        const avatarInput = document.getElementById('avatarFileInput');
        avatarEdit?.addEventListener('click', () => avatarInput?.click());
        avatarInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const validation = Security.validateImageFile(file);
            if (!validation.valid) {
                this.ui.showToast(validation.error, 'error');
                return;
            }

            try {
                const resized = await Security.resizeImage(file, 200, 200, 0.8);
                await this.firebase.updateUserProfile(this.currentUser.uid, { avatar: resized });
                this.userProfile.avatar = resized;

                if (avatarEl) avatarEl.innerHTML = `<img src="${resized}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                if (avatarLargeEl) avatarLargeEl.innerHTML = `<img src="${resized}" alt="Avatar">`;

                this.ui.showToast('Аватар обновлён!', 'success');
            } catch (err) {
                console.error('[Profile] Avatar error:', err);
                this.ui.showToast('Ошибка загрузки аватара', 'error');
            }
            avatarInput.value = '';
        });

        // Смена имени
        const editNameBtn = document.getElementById('editNameBtn');
        const editNameBlock = document.getElementById('profileEditName');
        const newNameInput = document.getElementById('newNameInput');
        const saveNameBtn = document.getElementById('saveNameBtn');
        const cancelNameBtn = document.getElementById('cancelNameBtn');

        editNameBtn?.addEventListener('click', () => {
            editNameBlock?.classList.remove('hidden');
            if (newNameInput) newNameInput.value = this.userProfile?.nickname || '';
            newNameInput?.focus();
        });

        cancelNameBtn?.addEventListener('click', () => {
            editNameBlock?.classList.add('hidden');
        });

        saveNameBtn?.addEventListener('click', async () => {
            const newName = Security.sanitizeNickname(newNameInput?.value || '');
            if (!Security.validateNickname(newName)) {
                this.ui.showToast('Никнейм: 2-20 символов, без спецсимволов', 'error');
                return;
            }

            try {
                await this.firebase.updateUserProfile(this.currentUser.uid, { nickname: newName });
                this.userProfile.nickname = newName;
                if (nameEl) nameEl.textContent = Security.escapeHtml(newName);
                editNameBlock?.classList.add('hidden');
                this.ui.showToast('Имя обновлено!', 'success');
            } catch (err) {
                this.ui.showToast('Ошибка обновления имени', 'error');
            }
        });

        // Выход
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            dropdown?.classList.remove('active');
            this._logout();
        });
    }

    // ==========================================
    // Paint display
    // ==========================================

    _updatePaintDisplay() {
        const percent = Math.max(0, Math.round((1 - this.currentPaintUsed / this.DAILY_PAINT_LIMIT) * 100));
        const fill = document.getElementById('paintFill');
        const text = document.getElementById('paintText');

        if (fill) {
            fill.style.width = percent + '%';
            fill.classList.toggle('low', percent < 30);
            fill.classList.toggle('empty', percent <= 0);
        }
        if (text) text.textContent = percent + '%';
    }

    _showLimitModal() {
        document.getElementById('limitModal')?.classList.add('active');
    }

    // ==========================================
    // Планы
    // ==========================================

    _setupPlans() {
        const plansBtn = document.getElementById('plansBtn');
        const plansDropdownBtn = document.getElementById('plansDropdownBtn');

        plansBtn?.addEventListener('click', () => this._openPlans());
        plansDropdownBtn?.addEventListener('click', () => {
            document.getElementById('profileDropdown')?.classList.remove('active');
            this._openPlans();
        });

        document.getElementById('plansCloseBtn')?.addEventListener('click', () => {
            document.getElementById('plansModal')?.classList.remove('active');
        });

        document.getElementById('plansModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'plansModal') {
                document.getElementById('plansModal')?.classList.remove('active');
            }
        });

        // Кнопки покупки
        document.querySelectorAll('.plan-buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const plan = btn.dataset.plan;
                const price = btn.dataset.price;
                this._handlePurchase(plan, price);
            });
        });
    }

    _openPlans() {
        document.getElementById('plansModal')?.classList.add('active');
    }

    _handlePurchase(plan, price) {
        // Здесь можно подключить ЮKassa или другую платёжную систему
        this.ui.showToast(`Оплата ${price} ₽ — скоро будет доступно! Свяжитесь с support@nuller.ru`, 'info');
    }

    // ==========================================
    // Мобильные инструменты
    // ==========================================

    _setupMobile() {
        // Мобильные кнопки инструментов
        document.querySelectorAll('.mobile-tool[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                if (tool === 'undo') {
                    this.canvas?.undo();
                    return;
                }

                document.querySelectorAll('.mobile-tool[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.canvas?.setTool(tool);

                // Синхронизация с desktop toolbar
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
                    b.classList.toggle('active', b.dataset.tool === tool);
                });
            });
        });

        // Мобильная палитра
        const mobileColorBtn = document.getElementById('mobileColorBtn');
        const mobileColorModal = document.getElementById('mobileColorModal');
        const mobileColorGrid = document.getElementById('mobileColorGrid');

        mobileColorBtn?.addEventListener('click', () => {
            mobileColorModal?.classList.add('active');
        });

        document.getElementById('mobileColorConfirm')?.addEventListener('click', () => {
            mobileColorModal?.classList.remove('active');
        });

        mobileColorModal?.addEventListener('click', (e) => {
            if (e.target === mobileColorModal) mobileColorModal.classList.remove('active');
        });

        // Создаём цветовую сетку
        if (mobileColorGrid) {
            const colors = [
                '#1A1A2E', '#FFFFFF', '#E17055', '#FF6B6B',
                '#0984E3', '#74B9FF', '#00B894', '#55EFC4',
                '#FDCB6E', '#E84393', '#6C5CE7', '#A29BFE',
                '#FD79A8', '#636E72', '#D63031', '#2D3436'
            ];
            colors.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'palette-color';
                btn.style.background = color;
                if (color === '#FFFFFF') btn.style.border = '1px solid #ddd';
                btn.addEventListener('click', () => {
                    this.canvas?.setColor(color);
                    document.getElementById('mobileColorDot').style.background = color;
                    document.getElementById('colorPreview').style.background = color;
                    document.getElementById('colorInput').value = color;
                });
                mobileColorGrid.appendChild(btn);
            });
        }

        // Мобильный выбор цвета
        document.getElementById('mobileColorPicker')?.addEventListener('input', (e) => {
            const color = e.target.value;
            this.canvas?.setColor(color);
            document.getElementById('mobileColorDot').style.background = color;
            document.getElementById('colorPreview').style.background = color;
        });

        // Мобильный слайдер размера
        const mobileBrush = document.getElementById('mobileBrushSlider');
        mobileBrush?.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            this.canvas?.setBrushSize(size);
            document.getElementById('mobileBrushLabel').textContent = size + 'px';
            document.getElementById('brushSizeSlider').value = size;
            document.getElementById('brushSizeLabel').textContent = size + 'px';
        });

        // Мобильное меню (гамбургер)
        document.getElementById('mobileMenuToggle')?.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebarRight');
            sidebar?.classList.toggle('active');
            sidebar?.classList.remove('collapsed');
        });
    }

    // ==========================================
    // Текстовый инструмент
    // ==========================================

    _setupTextTool() {
        const modal = document.getElementById('textInputModal');
        const input = document.getElementById('textToolInput');
        const confirmBtn = document.getElementById('textConfirmBtn');
        const cancelBtn = document.getElementById('textCancelBtn');

        this._textResolve = null;

        confirmBtn?.addEventListener('click', () => {
            const text = Security.sanitizeMessage(input?.value || '');
            if (text && this._textResolve) {
                this._textResolve(text);
            }
            modal?.classList.remove('active');
            input.value = '';
        });

        cancelBtn?.addEventListener('click', () => {
            modal?.classList.remove('active');
            input.value = '';
            if (this._textResolve) this._textResolve(null);
        });

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                if (this._textResolve) this._textResolve(null);
            }
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn?.click();
            if (e.key === 'Escape') cancelBtn?.click();
        });
    }

    promptText() {
        return new Promise((resolve) => {
            this._textResolve = resolve;
            const modal = document.getElementById('textInputModal');
            const input = document.getElementById('textToolInput');
            modal?.classList.add('active');
            input?.focus();
        });
    }

    // ==========================================
    // Keyboard shortcuts
    // ==========================================

    _setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Не обрабатываем, если фокус в input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case 'b': this._selectTool('brush'); break;
                case 'e': this._selectTool('eraser'); break;
                case 'l': this._selectTool('line'); break;
                case 'r': this._selectTool('rect'); break;
                case 'o': this._selectTool('circle'); break;
                case 'h': this._selectTool('pan'); break;
                case 't':
                    this._selectTool('text');
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.canvas?._prevTool) {
                this._selectTool(this.canvas._prevTool);
                this.canvas._prevTool = null;
            }
        });
    }

    _selectTool(tool) {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });
        document.querySelectorAll('.mobile-tool[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });
        this.canvas?.setTool(tool);
    }

    // ==========================================
    // Выход
    // ==========================================

    async _logout() {
        try {
            if (this.clearTimerInterval) clearInterval(this.clearTimerInterval);
            if (this.sync) this.sync.destroy();
            if (this.chat) this.chat.destroy();
            await this.firebase.logout();
            window.location.href = '../index.html';
        } catch (error) {
            console.error('[App] Ошибка выхода:', error);
            window.location.href = '../index.html';
        }
    }
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    const app = new CanvasChatApp();
    app.init();
    window.canvasChat = app;
});
