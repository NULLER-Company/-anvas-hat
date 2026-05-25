/**
 * CanvasChat — UI Manager
 * Управляет всем пользовательским интерфейсом приложения
 */

class UIManager {
    constructor() {
        this.toastContainer = null;
        this._initToastContainer();
    }

    _initToastContainer() {
        this.toastContainer = document.createElement('div');
        this.toastContainer.className = 'toast-container';
        document.body.appendChild(this.toastContainer);
    }

    // ==========================================
    // Toast уведомления
    // ==========================================

    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span style="font-size: 16px;">${icons[type] || icons.info}</span>
            <span>${message}</span>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, duration);
    }

    // ==========================================
    // Обновление лимита
    // ==========================================

    updateLimitIndicator(count, limit) {
        const percent = (count / limit) * 100;
        const fill = document.querySelector('.limit-fill');
        const text = document.querySelector('.limit-text');

        if (fill) {
            fill.style.width = Math.min(100, percent) + '%';
            fill.classList.toggle('warning', percent > 70);
        }

        if (text) {
            text.textContent = `${count}/${limit}`;
        }
    }

    // ==========================================
    // Онлайн пользователи
    // ==========================================

    updateOnlineUsers(users) {
        const avatarsEl = document.querySelector('.online-avatars');
        const countEl = document.querySelector('.online-count');

        if (!avatarsEl || !countEl) return;

        avatarsEl.innerHTML = '';

        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];
        const maxShow = 5;

        users.slice(0, maxShow).forEach((user, i) => {
            const avatar = document.createElement('div');
            avatar.className = 'online-avatar';
            avatar.style.background = colors[i % colors.length];
            avatar.textContent = (user.nickname || 'A')[0].toUpperCase();
            avatarsEl.appendChild(avatar);
        });

        if (users.length > maxShow) {
            const more = document.createElement('div');
            more.className = 'online-avatar';
            more.style.background = '#8B8BA8';
            more.textContent = `+${users.length - maxShow}`;
            avatarsEl.appendChild(more);
        }

        const plural = users.length === 1 ? 'пользователь' :
            users.length < 5 ? 'пользователя' : 'пользователей';
        countEl.textContent = `${users.length} ${plural} онлайн`;
    }

    // ==========================================
    // Профиль дропдаун
    // ==========================================

    setupProfileDropdown(user, onLogout) {
        const avatar = document.getElementById('userAvatarBtn');
        const dropdown = document.getElementById('profileDropdown');

        if (!avatar || !dropdown) return;

        avatar.textContent = (user.nickname || user.email || 'U')[0].toUpperCase();

        const nameEl = dropdown.querySelector('.profile-dropdown-name');
        const emailEl = dropdown.querySelector('.profile-dropdown-email');

        if (nameEl) nameEl.textContent = user.nickname || user.displayName || 'Пользователь';
        if (emailEl) emailEl.textContent = user.email || '';

        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('active');
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                dropdown.classList.remove('active');
                if (onLogout) onLogout();
            });
        }
    }

    // ==========================================
    // Zoom display
    // ==========================================

    updateZoomDisplay(percent) {
        const el = document.querySelector('.zoom-display');
        if (el) el.textContent = `${percent}%`;
    }

    // ==========================================
    // Сайдбар
    // ==========================================

    setupSidebar() {
        const tabs = document.querySelectorAll('.sidebar-tab');
        const panels = document.querySelectorAll('.sidebar-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.panel;

                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));

                tab.classList.add('active');
                const panel = document.getElementById(target);
                if (panel) panel.classList.add('active');
            });
        });
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar-right');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
    }

    // ==========================================
    // Диалог лимита
    // ==========================================

    showLimitDialog() {
        const overlay = document.querySelector('.limit-notification-overlay');
        const dialog = document.querySelector('.limit-notification');

        if (overlay) overlay.classList.add('active');
        if (dialog) dialog.classList.add('active');

        const closeBtn = dialog?.querySelector('.limit-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                overlay?.classList.remove('active');
                dialog?.classList.remove('active');
            };
        }

        if (overlay) {
            overlay.onclick = () => {
                overlay.classList.remove('active');
                dialog?.classList.remove('active');
            };
        }
    }

    // ==========================================
    // Toolbar setup
    // ==========================================

    setupToolbar(canvasEngine) {
        const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');

        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                if (tool === 'text') {
                    const text = prompt('Введите текст:');
                    if (text) {
                        const rect = document.querySelector('.canvas-container').getBoundingClientRect();
                        const x = (rect.width / 2 - canvasEngine.transform.x) / canvasEngine.transform.scale;
                        const y = (rect.height / 2 - canvasEngine.transform.y) / canvasEngine.transform.scale;
                        canvasEngine.addText(text, x, y);
                    }
                    return;
                }

                if (tool === 'image') {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            try {
                                await canvasEngine.addImage(file);
                            } catch (err) {
                                this.showToast('Ошибка загрузки изображения', 'error');
                            }
                        }
                    };
                    input.click();
                    return;
                }

                if (tool === 'undo') {
                    canvasEngine.undo();
                    return;
                }

                if (tool === 'redo') {
                    canvasEngine.redo();
                    return;
                }

                // Обычные инструменты
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                canvasEngine.setTool(tool);
            });
        });

        // Выбор цвета
        const colorPreview = document.querySelector('.color-preview');
        const colorInput = document.querySelector('.color-input');

        if (colorPreview && colorInput) {
            colorPreview.addEventListener('click', () => colorInput.click());
            colorInput.addEventListener('input', (e) => {
                const color = e.target.value;
                colorPreview.style.background = color;
                canvasEngine.setColor(color);
            });
        }

        // Быстрые цвета
        document.querySelectorAll('.quick-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                canvasEngine.setColor(color);
                if (colorPreview) colorPreview.style.background = color;
                if (colorInput) colorInput.value = color;
            });
        });

        // Размер кисти
        const brushSlider = document.querySelector('.brush-size-slider');
        const brushLabel = document.querySelector('.brush-size-label');

        if (brushSlider) {
            brushSlider.addEventListener('input', (e) => {
                const size = parseInt(e.target.value);
                canvasEngine.setBrushSize(size);
                if (brushLabel) brushLabel.textContent = size + 'px';
            });
        }

        // Zoom
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => canvasEngine.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => canvasEngine.zoomOut());
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => canvasEngine.resetView());

        canvasEngine.onZoomChange = (percent) => {
            this.updateZoomDisplay(percent);
        };
    }
}