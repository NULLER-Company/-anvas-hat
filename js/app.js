/**
 * CanvasChat — Main Application
 * Точка входа и инициализация всех модулей
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
    }

    async init() {
        try {
            // Инициализация Firebase
            await this.firebase.init();

            // Проверяем авторизацию
            this.firebase.onAuthStateChanged(async (user) => {
                if (user) {
                    this.currentUser = user;
                    await this._initApp();
                } else {
                    // Редирект на лендинг
                    window.location.href = 'index.html';
                }
            });
        } catch (error) {
            console.error('[App] Критическая ошибка:', error);
            this.ui.showToast('Ошибка инициализации. Попробуйте обновить страницу.', 'error');
        }
    }

    async _initApp() {
        try {
            // Загружаем профиль
            this.userProfile = await this.firebase.getUserProfile(this.currentUser.uid);

            // Инициализация Canvas Engine
            const canvasEl = document.getElementById('mainCanvas');
            const containerEl = document.querySelector('.canvas-container');
            this.canvas = new CanvasEngine(canvasEl, containerEl);

            // Инициализация синхронизации
            this.sync = new RealtimeSync(this.firebase, this.canvas, this.currentUser.uid);
            await this.sync.start();

            // Инициализация чата
            this.chat = new ChatManager(this.firebase, this.currentUser.uid, this.userProfile);
            await this.chat.init();

            // Инициализация друзей
            this.friends = new FriendsManager(this.firebase, this.currentUser.uid, this.chat, this.ui);
            await this.friends.init();

            // Настройка UI
            this._setupUI();

            // Обновляем присутствие
            await this.firebase._updatePresence(this.currentUser.uid);

            // Показываем онбординг
            this.onboarding.show();

            this.ui.showToast(`Добро пожаловать, ${this.userProfile?.nickname || 'Художник'}!`, 'success');

            console.log('[App] Приложение инициализировано');
        } catch (error) {
            console.error('[App] Ошибка инициализации:', error);
            this.ui.showToast('Ошибка загрузки. Обновите страницу.', 'error');
        }
    }

    _setupUI() {
        // Тулбар
        this.ui.setupToolbar(this.canvas);

        // Сайдбар
        this.ui.setupSidebar();

        // Профиль дропдаун
        this.ui.setupProfileDropdown(
            { ...this.currentUser, nickname: this.userProfile?.nickname },
            () => this._logout()
        );

        // Обновление лимита
        const strokeInfo = this.sync.getStrokeInfo();
        this.ui.updateLimitIndicator(strokeInfo.count, strokeInfo.limit);

        this.sync.onStrokeCountChange = (count, limit) => {
            this.ui.updateLimitIndicator(count, limit);
        };

        // Достижение лимита
        this.sync.onLimitReached = () => {
            this.ui.showLimitDialog();
            this.ui.showToast('Дневной лимит мазков исчерпан!', 'warning');
        };

        // Онлайн пользователи
        this.sync.onOnlineUsersChange = (users) => {
            this.ui.updateOnlineUsers(users);
        };

        // Zoom display
        this.ui.updateZoomDisplay(this.canvas.getZoomPercent());

        // Toggle sidebar button
        const toggleBtn = document.getElementById('toggleSidebarBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.ui.toggleSidebar());
        }

        // Глобальный чат кнопка
        const globalChatBtn = document.getElementById('globalChatBtn');
        if (globalChatBtn) {
            globalChatBtn.addEventListener('click', () => {
                this.chat.loadChat('global');
            });
        }

        // Keyboard listener для Space (pan mode)
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                if (this.canvas._prevTool) {
                    this.canvas.setTool(this.canvas._prevTool);
                    this.canvas._prevTool = null;
                    this.canvas.container.classList.remove('panning');

                    // Обновляем активную кнопку
                    document.querySelectorAll('.tool-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.tool === this.canvas.tool);
                    });
                }
            }
        });
    }

    async _logout() {
        try {
            if (this.sync) this.sync.destroy();
            if (this.chat) this.chat.destroy();
            await this.firebase.logout();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('[App] Ошибка выхода:', error);
            this.ui.showToast('Ошибка выхода', 'error');
        }
    }
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    const app = new CanvasChatApp();
    app.init();

    // Глобальный доступ для отладки
    window.canvasChat = app;
});