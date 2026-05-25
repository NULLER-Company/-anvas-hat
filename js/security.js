/**
 * CanvasChat — Security Module
 * Защита от XSS, спама, инъекций и злоупотреблений
 */

const Security = {
    // ==========================================
    // Санитизация
    // ==========================================

    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        const map = {
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#039;', '/': '&#x2F;'
        };
        return str.replace(/[&<>"'/]/g, c => map[c]);
    },

    sanitizeNickname(name) {
        if (typeof name !== 'string') return '';
        return name
            .replace(/[<>'"&\/\\]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 20);
    },

    sanitizeMessage(msg) {
        if (typeof msg !== 'string') return '';
        return msg
            .replace(/[<>]/g, '')
            .trim()
            .substring(0, 500);
    },

    sanitizeColor(color) {
        if (typeof color !== 'string') return '#000000';
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
        if (/^#[0-9A-Fa-f]{3}$/.test(color)) return color;
        return '#000000';
    },

    // ==========================================
    // Rate Limiting
    // ==========================================

    _rateLimits: {},

    rateLimit(key, maxCalls, periodMs) {
        const now = Date.now();
        if (!this._rateLimits[key]) {
            this._rateLimits[key] = [];
        }

        // Очищаем старые вызовы
        this._rateLimits[key] = this._rateLimits[key].filter(t => now - t < periodMs);

        if (this._rateLimits[key].length >= maxCalls) {
            return false; // Лимит превышен
        }

        this._rateLimits[key].push(now);
        return true; // OK
    },

    // ==========================================
    // Валидация данных
    // ==========================================

    validateEmail(email) {
        if (typeof email !== 'string') return false;
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(email) && email.length <= 254;
    },

    validatePassword(password) {
        if (typeof password !== 'string') return false;
        return password.length >= 6 && password.length <= 128;
    },

    validateNickname(nickname) {
        if (typeof nickname !== 'string') return false;
        const clean = nickname.trim();
        return clean.length >= 2 && clean.length <= 20 && !/[<>"'&\\]/.test(clean);
    },

    validateStroke(stroke) {
        if (!stroke || typeof stroke !== 'object') return false;

        // Проверяем обязательные поля
        if (!stroke.tool || !stroke.userId) return false;

        // Проверяем инструмент
        const validTools = ['brush', 'eraser', 'line', 'rect', 'circle', 'text', 'image'];
        if (!validTools.includes(stroke.tool)) return false;

        // Проверяем цвет
        if (stroke.color && !/^#[0-9A-Fa-f]{3,6}$/.test(stroke.color)) return false;

        // Проверяем размер
        if (stroke.size && (stroke.size < 1 || stroke.size > 50)) return false;

        // Проверяем массив точек
        if (stroke.points) {
            if (!Array.isArray(stroke.points)) return false;
            if (stroke.points.length > 10000) return false; // Защита от огромных мазков

            for (const p of stroke.points) {
                if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
                if (!isFinite(p.x) || !isFinite(p.y)) return false;
            }
        }

        return true;
    },

    // ==========================================
    // Расчёт стоимости краски
    // ==========================================

    calculatePaintCost(stroke) {
        if (!stroke) return 0;

        let cost = 0;
        const thickness = Math.max(1, stroke.size || 4);

        if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
            if (!stroke.points || stroke.points.length < 2) return 1;

            // Длина мазка
            let totalLength = 0;
            for (let i = 1; i < stroke.points.length; i++) {
                const dx = stroke.points[i].x - stroke.points[i - 1].x;
                const dy = stroke.points[i].y - stroke.points[i - 1].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }

            // Стоимость = длина × толщина × множитель
            cost = Math.ceil((totalLength / 50) * (thickness / 4));
        } else if (stroke.tool === 'line') {
            const dx = (stroke.endX || 0) - (stroke.startX || 0);
            const dy = (stroke.endY || 0) - (stroke.startY || 0);
            const len = Math.sqrt(dx * dx + dy * dy);
            cost = Math.ceil((len / 50) * (thickness / 4));
        } else if (stroke.tool === 'rect' || stroke.tool === 'circle') {
            const w = Math.abs((stroke.endX || 0) - (stroke.startX || 0));
            const h = Math.abs((stroke.endY || 0) - (stroke.startY || 0));
            const perimeter = 2 * (w + h);
            cost = Math.ceil((perimeter / 50) * (thickness / 4));
        } else if (stroke.tool === 'text') {
            cost = Math.ceil(thickness * 2);
        } else if (stroke.tool === 'image') {
            cost = 50; // Загрузка изображения = 50 единиц
        }

        return Math.max(1, Math.min(cost, 200)); // Минимум 1, максимум 200
    },

    // ==========================================
    // Проверка перекрытия рисунков
    // ==========================================

    isOverlappingOtherUser(stroke, existingStrokes, userId) {
        if (!stroke || !stroke.points || stroke.points.length === 0) return false;

        const checkRadius = (stroke.size || 4) * 2;

        for (const existing of existingStrokes) {
            if (existing.userId === userId) continue; // Свои рисунки можно перекрывать
            if (!existing.points || existing.points.length === 0) continue;

            // Проверяем ближайшие точки
            for (const newPoint of stroke.points) {
                for (const oldPoint of existing.points) {
                    const dx = newPoint.x - oldPoint.x;
                    const dy = newPoint.y - oldPoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < checkRadius + (existing.size || 4)) {
                        return true; // Перекрытие!
                    }
                }
            }
        }

        return false;
    },

    // ==========================================
    // Защита от спама
    // ==========================================

    checkMessageSpam(userId) {
        return this.rateLimit(`msg_${userId}`, 5, 10000); // 5 сообщений за 10 сек
    },

    checkStrokeSpam(userId) {
        return this.rateLimit(`stroke_${userId}`, 30, 10000); // 30 мазков за 10 сек
    },

    checkSearchSpam(userId) {
        return this.rateLimit(`search_${userId}`, 10, 30000); // 10 поисков за 30 сек
    },

    // ==========================================
    // Очистка файлов (аватары)
    // ==========================================

    validateImageFile(file) {
        if (!file) return { valid: false, error: 'Файл не выбран' };

        const maxSize = 2 * 1024 * 1024; // 2 MB
        if (file.size > maxSize) {
            return { valid: false, error: 'Файл слишком большой (макс. 2 МБ)' };
        }

        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            return { valid: false, error: 'Допускаются только JPG, PNG, WebP, GIF' };
        }

        return { valid: true };
    },

    async resizeImage(file, maxWidth = 200, maxHeight = 200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;

                    if (w > maxWidth || h > maxHeight) {
                        const ratio = Math.min(maxWidth / w, maxHeight / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsDataURL(file);
        });
    }
};

// Заморозить объект для безопасности
Object.freeze(Security);
