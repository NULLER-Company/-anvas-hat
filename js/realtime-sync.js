/**
 * CanvasChat — Realtime Sync (v2)
 * С расчётом краски, защитой от перекрытий, таймером очистки
 */

class RealtimeSync {
    constructor(firebaseService, canvasEngine, userId) {
        this.firebase = firebaseService;
        this.canvas = canvasEngine;
        this.userId = userId;
        this.userProfile = null;
        this._unsubscribers = [];
        this._lastCursorUpdate = 0;
        this._cursorInterval = 50;

        this.onOnlineUsersChange = null;
        this.onRemoteCursorUpdate = null;
        this.onLimitReached = null;
        this.onStrokeCountChange = null;

        this.paintLimit = 1000;
        this.paintUsed = 0;
    }

    async start() {
        try {
            this.userProfile = await this.firebase.getUserProfile(this.userId);

            // Лимит краски
            const limitInfo = await this.firebase.getStrokeCount(this.userId);
            this.paintUsed = limitInfo.count || 0;

            // Загрузка мазков
            const strokes = await this.firebase.loadCanvasStrokes();
            this.canvas.loadStrokes(strokes);

            this._setupStrokeSync();
            this._setupCursorSync();
            this._setupOnlineUsers();
            this._setupCanvasCallbacks();

            console.log('[Sync] Запущен');
        } catch (error) {
            console.error('[Sync] Ошибка:', error);
            throw error;
        }
    }

    _setupStrokeSync() {
        const unsub = this.firebase.onNewStroke(stroke => {
            if (stroke.userId === this.userId) return;
            if (!Security.validateStroke(stroke)) return;
            this.canvas.addRemoteStroke(stroke);
        });
        this._unsubscribers.push(unsub);

        this.firebase.onStrokeRemoved(strokeId => {
            this.canvas.removeStroke(strokeId);
        });
    }

    _setupCursorSync() {
        this.firebase.onCursors(cursors => {
            const container = document.getElementById('canvasContainer');
            if (!container) return;

            const existingIds = new Set();

            Object.entries(cursors).forEach(([uid, data]) => {
                if (uid === this.userId) return;
                existingIds.add(uid);

                let el = document.getElementById(`cursor-${uid}`);
                if (!el) {
                    el = this._createCursorElement(uid, data);
                    container.appendChild(el);
                }

                const screenX = data.x * this.canvas.transform.scale + this.canvas.transform.x;
                const screenY = data.y * this.canvas.transform.scale + this.canvas.transform.y;
                el.style.left = screenX + 'px';
                el.style.top = screenY + 'px';
            });

            container.querySelectorAll('.remote-cursor').forEach(el => {
                const uid = el.id.replace('cursor-', '');
                if (!existingIds.has(uid)) el.remove();
            });
        });
    }

    _createCursorElement(uid, data) {
        const el = document.createElement('div');
        el.className = 'remote-cursor';
        el.id = `cursor-${uid}`;

        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];
        const color = colors[uid.charCodeAt(0) % colors.length];
        const name = Security.escapeHtml(data.nickname || 'Аноним');

        el.innerHTML = `
            <svg class="remote-cursor-icon" width="16" height="16" viewBox="0 0 16 16">
                <polygon points="0,0 0,12 4,9 7,15 9,14 6,8 11,8" fill="${color}"/>
            </svg>
            <span class="remote-cursor-name" style="background: ${color}">${name}</span>
        `;
        return el;
    }

    _setupOnlineUsers() {
        this.firebase.onOnlineUsers(users => {
            if (this.onOnlineUsersChange) this.onOnlineUsersChange(users);
        });
    }

    _setupCanvasCallbacks() {
        this.canvas.onStrokeComplete = async (stroke) => {
            // Rate limit
            if (!Security.checkStrokeSpam(this.userId)) {
                this.canvas.undo();
                return;
            }

            // Расчёт стоимости краски
            const cost = Security.calculatePaintCost(stroke);

            // Проверка лимита
            if (this.paintUsed + cost > this.paintLimit) {
                if (this.onLimitReached) this.onLimitReached();
                this.canvas.undo();
                return;
            }

            // Проверка перекрытия чужих рисунков
            if (Security.isOverlappingOtherUser(stroke, this.canvas.strokes, this.userId)) {
                // Показываем предупреждение
                const warning = document.getElementById('canvasWarning');
                if (warning) {
                    warning.classList.remove('hidden');
                    setTimeout(() => warning.classList.add('hidden'), 3000);
                }
                this.canvas.undo();
                return;
            }

            stroke.userId = this.userId;
            stroke.nickname = Security.sanitizeNickname(this.userProfile?.nickname || 'Аноним');
            stroke.paintCost = cost;

            try {
                const saved = await this.firebase.addStroke(stroke);
                const local = this.canvas.strokes[this.canvas.strokes.length - 1];
                if (local) local.id = saved.id;

                // Обновляем использование краски
                this.paintUsed += cost;
                await this.firebase.updateUserProfile(this.userId, {
                    dailyStrokes: this.paintUsed
                });

                if (this.onStrokeCountChange) {
                    this.onStrokeCountChange(this.paintUsed, this.paintLimit);
                }
            } catch (error) {
                console.error('[Sync] Ошибка сохранения:', error);
            }
        };

        this.canvas.onStrokeUndo = async (strokeId) => {
            if (strokeId) {
                try {
                    await this.firebase.undoStroke(strokeId);
                } catch (e) {
                    console.error('[Sync] Undo error:', e);
                }
            }
        };

        this.canvas.onCursorMove = (x, y) => {
            const now = Date.now();
            if (now - this._lastCursorUpdate < this._cursorInterval) return;
            this._lastCursorUpdate = now;

            this.firebase.updateCursor(this.userId, {
                x, y,
                nickname: this.userProfile?.nickname || 'Аноним'
            });
        };
    }

    getStrokeInfo() {
        return {
            count: this.paintUsed,
            limit: this.paintLimit,
            percent: (this.paintUsed / this.paintLimit) * 100
        };
    }

    destroy() {
        this._unsubscribers.forEach(u => { if (typeof u === 'function') u(); });
        this.firebase.db?.ref(`cursors/${this.userId}`).remove();
    }
}
