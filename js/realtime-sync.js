/**
 * CanvasChat — Realtime Synchronization
 * Управляет синхронизацией холста, курсоров и чата через Firebase
 */

class RealtimeSync {
    constructor(firebaseService, canvasEngine, userId) {
        this.firebase = firebaseService;
        this.canvas = canvasEngine;
        this.userId = userId;
        this.userProfile = null;

        this._unsubscribers = [];
        this._cursorThrottle = null;
        this._cursorUpdateInterval = 50; // ms
        this._lastCursorUpdate = 0;

        // Калбэки
        this.onOnlineUsersChange = null;
        this.onRemoteCursorUpdate = null;
        this.onLimitReached = null;

        this.strokeLimit = 100;
        this.currentStrokeCount = 0;
    }

    async start() {
        try {
            // Загружаем профиль
            this.userProfile = await this.firebase.getUserProfile(this.userId);

            // Проверяем и сбрасываем дневной лимит
            const limitInfo = await this.firebase.getStrokeCount(this.userId);
            this.currentStrokeCount = limitInfo.count;
            this.strokeLimit = limitInfo.limit;

            // Загружаем существующие мазки
            const strokes = await this.firebase.loadCanvasStrokes();
            this.canvas.loadStrokes(strokes);

            // Подписываемся на новые мазки
            this._setupStrokeSync();

            // Подписываемся на курсоры
            this._setupCursorSync();

            // Подписываемся на онлайн пользователей
            this._setupOnlineUsers();

            // Настраиваем калбэки канваса
            this._setupCanvasCallbacks();

            console.log('[Sync] Синхронизация запущена');
        } catch (error) {
            console.error('[Sync] Ошибка запуска:', error);
            throw error;
        }
    }

    _setupStrokeSync() {
        // Слушаем новые мазки
        const unsub = this.firebase.onNewStroke(stroke => {
            // Игнорируем свои мазки (уже отрисованы локально)
            if (stroke.userId === this.userId) return;
            this.canvas.addRemoteStroke(stroke);
        });
        this._unsubscribers.push(unsub);

        // Слушаем удаление мазков (undo)
        this.firebase.onStrokeRemoved(strokeId => {
            this.canvas.removeStroke(strokeId);
        });
    }

    _setupCursorSync() {
        this.firebase.onCursors(cursors => {
            const cursorElements = document.querySelectorAll('.remote-cursor');
            const existingIds = new Set();

            Object.entries(cursors).forEach(([uid, data]) => {
                if (uid === this.userId) return; // Пропускаем свой курсор
                existingIds.add(uid);

                let el = document.getElementById(`cursor-${uid}`);
                if (!el) {
                    el = this._createCursorElement(uid, data);
                    document.querySelector('.canvas-container').appendChild(el);
                }

                // Позиция с учётом трансформации канваса
                const screenX = data.x * this.canvas.transform.scale + this.canvas.transform.x;
                const screenY = data.y * this.canvas.transform.scale + this.canvas.transform.y;

                el.style.left = screenX + 'px';
                el.style.top = screenY + 'px';
            });

            // Удаляем курсоры отключившихся пользователей
            cursorElements.forEach(el => {
                const uid = el.id.replace('cursor-', '');
                if (!existingIds.has(uid)) {
                    el.remove();
                }
            });

            if (this.onRemoteCursorUpdate) {
                this.onRemoteCursorUpdate(cursors);
            }
        });
    }

    _createCursorElement(uid, data) {
        const el = document.createElement('div');
        el.className = 'remote-cursor';
        el.id = `cursor-${uid}`;

        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];
        const color = colors[uid.charCodeAt(0) % colors.length];

        el.innerHTML = `
            <svg class="remote-cursor-icon" width="16" height="16" viewBox="0 0 16 16">
                <polygon points="0,0 0,12 4,9 7,15 9,14 6,8 11,8" fill="${color}"/>
            </svg>
            <span class="remote-cursor-name" style="background: ${color}">
                ${data.nickname || 'Аноним'}
            </span>
        `;

        return el;
    }

    _setupOnlineUsers() {
        this.firebase.onOnlineUsers(users => {
            if (this.onOnlineUsersChange) {
                this.onOnlineUsersChange(users);
            }
        });
    }

    _setupCanvasCallbacks() {
        // При завершении мазка
        this.canvas.onStrokeComplete = async (stroke) => {
            // Проверяем лимит
            if (this.currentStrokeCount >= this.strokeLimit) {
                if (this.onLimitReached) {
                    this.onLimitReached();
                }
                // Откатываем мазок
                this.canvas.undo();
                return;
            }

            // Добавляем userId
            stroke.userId = this.userId;
            stroke.nickname = this.userProfile?.nickname || 'Аноним';

            try {
                // Сохраняем в Firebase
                const saved = await this.firebase.addStroke(stroke);
                // Обновляем ID мазка в локальном массиве
                const localStroke = this.canvas.strokes[this.canvas.strokes.length - 1];
                if (localStroke) localStroke.id = saved.id;

                // Инкрементируем лимит
                await this.firebase.incrementStrokeCount(this.userId);
                this.currentStrokeCount++;

                // Калбэк для обновления UI
                if (this.onStrokeCountChange) {
                    this.onStrokeCountChange(this.currentStrokeCount, this.strokeLimit);
                }
            } catch (error) {
                console.error('[Sync] Ошибка сохранения мазка:', error);
            }
        };

        // При undo
        this.canvas.onStrokeUndo = async (strokeId) => {
            if (strokeId) {
                try {
                    await this.firebase.undoStroke(strokeId);
                } catch (error) {
                    console.error('[Sync] Ошибка undo:', error);
                }
            }
        };

        // При движении курсора
        this.canvas.onCursorMove = (x, y) => {
            const now = Date.now();
            if (now - this._lastCursorUpdate < this._cursorUpdateInterval) return;
            this._lastCursorUpdate = now;

            this.firebase.updateCursor(this.userId, {
                x, y,
                nickname: this.userProfile?.nickname || 'Аноним'
            });
        };
    }

    getStrokeInfo() {
        return {
            count: this.currentStrokeCount,
            limit: this.strokeLimit,
            percent: (this.currentStrokeCount / this.strokeLimit) * 100
        };
    }

    destroy() {
        this._unsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        // Удаляем курсор
        this.firebase.db.ref(`cursors/${this.userId}`).remove();
    }
}