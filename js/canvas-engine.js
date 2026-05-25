/**
 * CanvasChat — Canvas Drawing Engine
 * Полнофункциональный движок рисования с поддержкой
 * панорамирования, масштабирования и множества инструментов
 */

class CanvasEngine {
    constructor(canvasElement, container) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.container = container;

        // Состояние трансформации
        this.transform = {
            x: 0,
            y: 0,
            scale: 1
        };

        // Состояние инструментов
        this.tool = 'brush';
        this.color = '#1A1A2E';
        this.brushSize = 4;
        this.opacity = 1;

        // Состояние рисования
        this.isDrawing = false;
        this.isPanning = false;
        this.currentStroke = null;
        this.strokes = [];
        this.undoStack = [];
        this.redoStack = [];

        // Буферный канвас для оптимизации
        this.bufferCanvas = document.createElement('canvas');
        this.bufferCtx = this.bufferCanvas.getContext('2d');

        // Debounce
        this._strokeBuffer = [];
        this._flushTimeout = null;

        // Удалённые курсоры
        this.remoteCursors = {};

        // Калбэки
        this.onStrokeComplete = null;
        this.onStrokeUndo = null;
        this.onCursorMove = null;

        // Инициализация
        this._setupCanvas();
        this._bindEvents();

        // Начальная отрисовка
        this.render();
    }

    // ==========================================
    // Инициализация
    // ==========================================

    _setupCanvas() {
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);

        // Буферный канвас
        this.bufferCanvas.width = 4000;
        this.bufferCanvas.height = 4000;

        this.render();
    }

    // ==========================================
    // Обработка событий
    // ==========================================

    _bindEvents() {
        // Предотвращаем контекстное меню
        this.container.addEventListener('contextmenu', e => e.preventDefault());

        // Мышь
        this.container.addEventListener('mousedown', e => this._handlePointerDown(e));
        window.addEventListener('mousemove', e => this._handlePointerMove(e));
        window.addEventListener('mouseup', e => this._handlePointerUp(e));

        // Тач
        this.container.addEventListener('touchstart', e => this._handleTouchStart(e), { passive: false });
        this.container.addEventListener('touchmove', e => this._handleTouchMove(e), { passive: false });
        this.container.addEventListener('touchend', e => this._handleTouchEnd(e));

        // Масштабирование колёсиком
        this.container.addEventListener('wheel', e => this._handleWheel(e), { passive: false });

        // Клавиши
        document.addEventListener('keydown', e => this._handleKeyDown(e));
    }

    _getPointerPos(e) {
        const rect = this.container.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
        const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;

        // Позиция на экране
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        // Позиция на холсте (с учётом трансформации)
        const canvasX = (screenX - this.transform.x) / this.transform.scale;
        const canvasY = (screenY - this.transform.y) / this.transform.scale;

        return { screenX, screenY, canvasX, canvasY };
    }

    _handlePointerDown(e) {
        if (e.button === 1 || (e.button === 0 && (e.altKey || this.tool === 'pan'))) {
            // Панорамирование
            this.isPanning = true;
            this._panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
            this.container.classList.add('panning');
            return;
        }

        if (e.button !== 0) return;

        const pos = this._getPointerPos(e);
        this._startDrawing(pos);
    }

    _handlePointerMove(e) {
        const pos = this._getPointerPos(e);

        // Отправка позиции курсора
        if (this.onCursorMove) {
            this.onCursorMove(pos.canvasX, pos.canvasY);
        }

        if (this.isPanning) {
            this.transform.x = e.clientX - this._panStart.x;
            this.transform.y = e.clientY - this._panStart.y;
            this.render();
            return;
        }

        if (this.isDrawing) {
            this._continueDrawing(pos);
        }
    }

    _handlePointerUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.container.classList.remove('panning');
            return;
        }

        if (this.isDrawing) {
            this._endDrawing();
        }
    }

    _handleTouchStart(e) {
        e.preventDefault();

        if (e.touches.length === 2) {
            // Pinch zoom
            this._pinchStart = this._getPinchDistance(e.touches);
            this._pinchScaleStart = this.transform.scale;
            return;
        }

        if (e.touches.length === 1) {
            if (this.tool === 'pan') {
                this.isPanning = true;
                this._panStart = {
                    x: e.touches[0].clientX - this.transform.x,
                    y: e.touches[0].clientY - this.transform.y
                };
                return;
            }
            const pos = this._getPointerPos(e);
            this._startDrawing(pos);
        }
    }

    _handleTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 2 && this._pinchStart) {
            const dist = this._getPinchDistance(e.touches);
            const scale = (dist / this._pinchStart) * this._pinchScaleStart;
            this.setZoom(Math.max(0.1, Math.min(5, scale)));
            return;
        }

        if (this.isPanning && e.touches.length === 1) {
            this.transform.x = e.touches[0].clientX - this._panStart.x;
            this.transform.y = e.touches[0].clientY - this._panStart.y;
            this.render();
            return;
        }

        if (this.isDrawing && e.touches.length === 1) {
            const pos = this._getPointerPos(e);
            this._continueDrawing(pos);
        }
    }

    _handleTouchEnd(e) {
        this._pinchStart = null;

        if (this.isPanning) {
            this.isPanning = false;
            return;
        }

        if (this.isDrawing) {
            this._endDrawing();
        }
    }

    _getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = this.transform.scale * delta;

        if (newScale < 0.1 || newScale > 5) return;

        const rect = this.container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Зум к точке курсора
        this.transform.x = mx - (mx - this.transform.x) * delta;
        this.transform.y = my - (my - this.transform.y) * delta;
        this.transform.scale = newScale;

        this.render();
        this._emitZoomChange();
    }

    _handleKeyDown(e) {
        // Ctrl+Z — Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
        }
        // Ctrl+Shift+Z или Ctrl+Y — Redo
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            this.redo();
        }
        // Space — toggle pan
        if (e.code === 'Space' && !e.repeat) {
            this._prevTool = this.tool;
            this.tool = 'pan';
            this.container.classList.add('panning');
        }
    }

    // ==========================================
    // Рисование
    // ==========================================

    _startDrawing(pos) {
        this.isDrawing = true;

        if (this.tool === 'eraser') {
            this.currentStroke = {
                tool: 'eraser',
                color: '#FFFFFF',
                size: this.brushSize * 3,
                points: [{ x: pos.canvasX, y: pos.canvasY }],
                userId: null,
                timestamp: Date.now()
            };
        } else if (this.tool === 'brush') {
            this.currentStroke = {
                tool: 'brush',
                color: this.color,
                size: this.brushSize,
                points: [{ x: pos.canvasX, y: pos.canvasY }],
                userId: null,
                timestamp: Date.now()
            };
        } else if (this.tool === 'line' || this.tool === 'rect' || this.tool === 'circle') {
            this.currentStroke = {
                tool: this.tool,
                color: this.color,
                size: this.brushSize,
                startX: pos.canvasX,
                startY: pos.canvasY,
                endX: pos.canvasX,
                endY: pos.canvasY,
                points: [],
                userId: null,
                timestamp: Date.now()
            };
        } else if (this.tool === 'fill') {
            // Flood fill на текущем месте
            this._floodFill(Math.round(pos.canvasX), Math.round(pos.canvasY), this.color);
            this.isDrawing = false;
            return;
        }
    }

    _continueDrawing(pos) {
        if (!this.currentStroke) return;

        if (this.currentStroke.tool === 'brush' || this.currentStroke.tool === 'eraser') {
            this.currentStroke.points.push({ x: pos.canvasX, y: pos.canvasY });
            // Оптимизация: рисуем только последний сегмент
            this._drawStrokeSegment(this.currentStroke);
        } else if (['line', 'rect', 'circle'].includes(this.currentStroke.tool)) {
            this.currentStroke.endX = pos.canvasX;
            this.currentStroke.endY = pos.canvasY;
            this.render(); // Полная перерисовка для preview фигур
        }
    }

    _endDrawing() {
        this.isDrawing = false;

        if (!this.currentStroke) return;

        // Минимальная длина мазка
        if (this.currentStroke.tool === 'brush' || this.currentStroke.tool === 'eraser') {
            if (this.currentStroke.points.length < 2) {
                // Точка
                this.currentStroke.points.push({
                    x: this.currentStroke.points[0].x + 0.5,
                    y: this.currentStroke.points[0].y + 0.5
                });
            }
        }

        // Сохраняем
        this.strokes.push(this.currentStroke);
        this.undoStack.push(this.currentStroke);
        this.redoStack = [];

        // Калбэк
        if (this.onStrokeComplete) {
            this.onStrokeComplete({ ...this.currentStroke });
        }

        this.currentStroke = null;
        this.render();
    }

    // ==========================================
    // Рендеринг
    // ==========================================

    render() {
        const ctx = this.ctx;
        const rect = this.container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        ctx.clearRect(0, 0, w, h);

        // Фон
        ctx.fillStyle = '#F8F9FE';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(this.transform.x, this.transform.y);
        ctx.scale(this.transform.scale, this.transform.scale);

        // Сетка
        this._drawGrid(ctx, w, h);

        // Все мазки
        for (const stroke of this.strokes) {
            this._drawStroke(ctx, stroke);
        }

        // Текущий мазок (preview)
        if (this.currentStroke) {
            this._drawStroke(ctx, this.currentStroke);
        }

        ctx.restore();

        // Удалённые курсоры
        this._drawRemoteCursors();
    }

    _drawGrid(ctx, viewW, viewH) {
        const gridSize = 40;
        const startX = Math.floor(-this.transform.x / this.transform.scale / gridSize) * gridSize - gridSize;
        const startY = Math.floor(-this.transform.y / this.transform.scale / gridSize) * gridSize - gridSize;
        const endX = startX + (viewW / this.transform.scale) + gridSize * 2;
        const endY = startY + (viewH / this.transform.scale) + gridSize * 2;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.lineWidth = 1 / this.transform.scale;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    _drawStroke(ctx, stroke) {
        if (!stroke) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = stroke.opacity || 1;

        if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
            if (stroke.points.length < 2) {
                ctx.restore();
                return;
            }

            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;

            if (stroke.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
            }

            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

            // Smooth curves
            if (stroke.points.length === 2) {
                ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
            } else {
                for (let i = 1; i < stroke.points.length - 1; i++) {
                    const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
                    const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
                    ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
                }
                const last = stroke.points[stroke.points.length - 1];
                ctx.lineTo(last.x, last.y);
            }

            ctx.stroke();
        } else if (stroke.tool === 'line') {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            ctx.beginPath();
            ctx.moveTo(stroke.startX, stroke.startY);
            ctx.lineTo(stroke.endX, stroke.endY);
            ctx.stroke();
        } else if (stroke.tool === 'rect') {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            const x = Math.min(stroke.startX, stroke.endX);
            const y = Math.min(stroke.startY, stroke.endY);
            const w = Math.abs(stroke.endX - stroke.startX);
            const h = Math.abs(stroke.endY - stroke.startY);
            ctx.strokeRect(x, y, w, h);
        } else if (stroke.tool === 'circle') {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            const cx = (stroke.startX + stroke.endX) / 2;
            const cy = (stroke.startY + stroke.endY) / 2;
            const rx = Math.abs(stroke.endX - stroke.startX) / 2;
            const ry = Math.abs(stroke.endY - stroke.startY) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (stroke.tool === 'text') {
            ctx.fillStyle = stroke.color;
            ctx.font = `${stroke.size * 4}px Inter, sans-serif`;
            ctx.fillText(stroke.text || '', stroke.startX, stroke.startY);
        }

        ctx.restore();
    }

    _drawStrokeSegment(stroke) {
        if (!stroke || stroke.points.length < 2) return;

        const ctx = this.ctx;
        ctx.save();
        ctx.translate(this.transform.x, this.transform.y);
        ctx.scale(this.transform.scale, this.transform.scale);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;

        if (stroke.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        }

        const len = stroke.points.length;
        const p1 = stroke.points[len - 2];
        const p2 = stroke.points[len - 1];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.restore();
    }

    _drawRemoteCursors() {
        // Рисуются через DOM элементы для плавности
    }

    _floodFill(x, y, fillColor) {
        // Упрощённая заливка — добавляем как прямоугольник
        const stroke = {
            tool: 'rect',
            color: fillColor,
            size: 2,
            startX: x - 50,
            startY: y - 50,
            endX: x + 50,
            endY: y + 50,
            points: [],
            userId: null,
            timestamp: Date.now(),
            filled: true
        };
        this.strokes.push(stroke);
        this.undoStack.push(stroke);
        if (this.onStrokeComplete) this.onStrokeComplete(stroke);
        this.render();
    }

    // ==========================================
    // Инструменты управления
    // ==========================================

    setTool(tool) {
        this.tool = tool;
        this.container.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    }

    setColor(color) {
        this.color = color;
    }

    setBrushSize(size) {
        this.brushSize = Math.max(1, Math.min(50, size));
    }

    setZoom(scale) {
        const rect = this.container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const ratio = scale / this.transform.scale;

        this.transform.x = centerX - (centerX - this.transform.x) * ratio;
        this.transform.y = centerY - (centerY - this.transform.y) * ratio;
        this.transform.scale = scale;

        this.render();
        this._emitZoomChange();
    }

    zoomIn() {
        this.setZoom(Math.min(5, this.transform.scale * 1.2));
    }

    zoomOut() {
        this.setZoom(Math.max(0.1, this.transform.scale / 1.2));
    }

    resetView() {
        this.transform = { x: 0, y: 0, scale: 1 };
        this.render();
        this._emitZoomChange();
    }

    getZoomPercent() {
        return Math.round(this.transform.scale * 100);
    }

    // ==========================================
    // Undo / Redo
    // ==========================================

    undo() {
        if (this.undoStack.length === 0) return;
        const stroke = this.undoStack.pop();
        this.redoStack.push(stroke);

        // Удаляем из strokes
        const idx = this.strokes.indexOf(stroke);
        if (idx > -1) this.strokes.splice(idx, 1);

        if (this.onStrokeUndo && stroke.id) {
            this.onStrokeUndo(stroke.id);
        }

        this.render();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const stroke = this.redoStack.pop();
        this.undoStack.push(stroke);
        this.strokes.push(stroke);

        if (this.onStrokeComplete) {
            this.onStrokeComplete({ ...stroke });
        }

        this.render();
    }

    // ==========================================
    // Загрузка удалённых мазков
    // ==========================================

    loadStrokes(strokes) {
        this.strokes = strokes;
        this.render();
    }

    addRemoteStroke(stroke) {
        this.strokes.push(stroke);
        this.render();
    }

    removeStroke(strokeId) {
        this.strokes = this.strokes.filter(s => s.id !== strokeId);
        this.render();
    }

    // ==========================================
    // Удалённые курсоры
    // ==========================================

    updateRemoteCursor(userId, data) {
        this.remoteCursors[userId] = data;
    }

    removeRemoteCursor(userId) {
        delete this.remoteCursors[userId];
    }

    // ==========================================
    // Вспомогательные
    // ==========================================

    _emitZoomChange() {
        if (this.onZoomChange) {
            this.onZoomChange(this.getZoomPercent());
        }
    }

    clear() {
        this.strokes = [];
        this.undoStack = [];
        this.redoStack = [];
        this.render();
    }

    // Загрузка изображения
    async addImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Рисуем на холсте в текущей позиции
                    const centerX = (-this.transform.x + this.container.clientWidth / 2) / this.transform.scale;
                    const centerY = (-this.transform.y + this.container.clientHeight / 2) / this.transform.scale;

                    const stroke = {
                        tool: 'image',
                        src: e.target.result,
                        x: centerX - img.width / 2,
                        y: centerY - img.height / 2,
                        width: img.width,
                        height: img.height,
                        timestamp: Date.now()
                    };

                    this.strokes.push(stroke);
                    this.render();
                    resolve(stroke);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Текстовый инструмент
    addText(text, x, y) {
        const stroke = {
            tool: 'text',
            text: text,
            color: this.color,
            size: this.brushSize,
            startX: x,
            startY: y,
            points: [],
            userId: null,
            timestamp: Date.now()
        };
        this.strokes.push(stroke);
        this.undoStack.push(stroke);
        if (this.onStrokeComplete) this.onStrokeComplete(stroke);
        this.render();
    }

    destroy() {
        window.removeEventListener('resize', this._resize);
        // Remove event listeners
    }
}