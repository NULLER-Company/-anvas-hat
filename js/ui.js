/**
 * CanvasChat — UI Manager (v2)
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

    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        toast.innerHTML = `
            <span style="font-size:16px;">${icons[type] || icons.info}</span>
            <span>${Security.escapeHtml(message)}</span>
        `;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    updateOnlineUsers(users) {
        const avatarsEl = document.getElementById('onlineAvatars');
        const countEl = document.getElementById('onlineCount');
        if (!avatarsEl || !countEl) return;

        avatarsEl.innerHTML = '';
        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];
        const maxShow = 5;

        users.slice(0, maxShow).forEach((user, i) => {
            const avatar = document.createElement('div');
            avatar.className = 'online-avatar';
            avatar.style.background = colors[i % colors.length];

            if (user.avatar) {
                avatar.innerHTML = `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatar.textContent = (user.nickname || 'A')[0].toUpperCase();
            }
            avatarsEl.appendChild(avatar);
        });

        if (users.length > maxShow) {
            const more = document.createElement('div');
            more.className = 'online-avatar';
            more.style.background = '#8B8BA8';
            more.textContent = `+${users.length - maxShow}`;
            avatarsEl.appendChild(more);
        }

        // Правильное склонение
        const n = users.length;
        let word;
        if (n % 10 === 1 && n % 100 !== 11) word = 'пользователь';
        else if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) word = 'пользователя';
        else word = 'пользователей';

        countEl.textContent = `${n} ${word} онлайн`;
    }

    updateZoomDisplay(percent) {
        const el = document.getElementById('zoomDisplay');
        if (el) el.textContent = `${percent}%`;
    }

    setupSidebar() {
        const tabs = document.querySelectorAll('.sidebar-tab');
        const panels = document.querySelectorAll('.sidebar-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.panel;
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(target)?.classList.add('active');
            });
        });
    }

    setupToolbar(canvasEngine) {
        const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');

        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                if (tool === 'text') {
                    if (window.canvasChat) {
                        window.canvasChat.promptText().then(text => {
                            if (text) {
                                const rect = document.getElementById('canvasContainer').getBoundingClientRect();
                                const x = (rect.width / 2 - canvasEngine.transform.x) / canvasEngine.transform.scale;
                                const y = (rect.height / 2 - canvasEngine.transform.y) / canvasEngine.transform.scale;
                                canvasEngine.addText(text, x, y);
                            }
                        });
                    }
                    return;
                }

                if (tool === 'image') {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        const validation = Security.validateImageFile(file);
                        if (!validation.valid) {
                            this.showToast(validation.error, 'error');
                            return;
                        }

                        try {
                            await canvasEngine.addImage(file);
                            this.showToast('Изображение добавлено!', 'success');
                        } catch (err) {
                            this.showToast('Ошибка загрузки изображения', 'error');
                        }
                    };
                    input.click();
                    return;
                }

                if (tool === 'undo') { canvasEngine.undo(); return; }
                if (tool === 'redo') { canvasEngine.redo(); return; }

                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                canvasEngine.setTool(tool);
            });
        });

        // Цвет
        const colorPreview = document.getElementById('colorPreview');
        const colorInput = document.getElementById('colorInput');

        colorPreview?.addEventListener('click', () => colorInput?.click());
        colorInput?.addEventListener('input', (e) => {
            const color = Security.sanitizeColor(e.target.value);
            colorPreview.style.background = color;
            canvasEngine.setColor(color);
            document.getElementById('mobileColorDot').style.background = color;
        });

        // Палитра
        document.querySelectorAll('.palette-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = Security.sanitizeColor(btn.dataset.color);
                canvasEngine.setColor(color);
                if (colorPreview) colorPreview.style.background = color;
                if (colorInput) colorInput.value = color;
                document.getElementById('mobileColorDot').style.background = color;

                document.querySelectorAll('.palette-color').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Размер кисти
        const brushSlider = document.getElementById('brushSizeSlider');
        const brushLabel = document.getElementById('brushSizeLabel');
        const brushDot = document.getElementById('brushDot');

        brushSlider?.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            canvasEngine.setBrushSize(size);
            if (brushLabel) brushLabel.textContent = size + 'px';
            if (brushDot) {
                brushDot.style.width = Math.min(24, Math.max(2, size)) + 'px';
                brushDot.style.height = Math.min(24, Math.max(2, size)) + 'px';
            }
        });

        // Прозрачность
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');

        opacitySlider?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            canvasEngine.opacity = val / 100;
            if (opacityValue) opacityValue.textContent = val + '%';
        });

        // Zoom
        document.getElementById('zoomInBtn')?.addEventListener('click', () => canvasEngine.zoomIn());
        document.getElementById('zoomOutBtn')?.addEventListener('click', () => canvasEngine.zoomOut());
        document.getElementById('zoomResetBtn')?.addEventListener('click', () => canvasEngine.resetView());

        canvasEngine.onZoomChange = (percent) => this.updateZoomDisplay(percent);
    }
}
