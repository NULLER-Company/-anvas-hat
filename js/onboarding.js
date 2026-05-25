/**
 * CanvasChat — Onboarding
 */

class Onboarding {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                icon: '🎨',
                iconBg: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                title: 'Добро пожаловать в CanvasChat!',
                desc: 'Это общий холст, где все рисуют вместе в реальном времени. Каждый мазок виден всем участникам мгновенно.'
            },
            {
                icon: '🖌️',
                iconBg: 'linear-gradient(135deg, #E17055, #FAB1A0)',
                title: 'Инструменты рисования',
                desc: 'Слева находится панель инструментов: кисть, ластик, фигуры, текст, выбор цвета. Выберите инструмент и начинайте рисовать!'
            },
            {
                icon: '🔍',
                iconBg: 'linear-gradient(135deg, #00B894, #55EFC4)',
                title: 'Навигация по холсту',
                desc: 'Используйте колёсико мыши для масштабирования. Зажмите Alt + ЛКМ или среднюю кнопку для перемещения по холсту.'
            },
            {
                icon: '👥',
                iconBg: 'linear-gradient(135deg, #0984E3, #74B9FF)',
                title: 'Друзья и общение',
                desc: 'Справа вы найдёте список друзей и чат. Добавляйте друзей по никнейму и общайтесь прямо во время рисования!'
            },
            {
                icon: '⏱️',
                iconBg: 'linear-gradient(135deg, #FDCB6E, #F39C12)',
                title: 'Дневной лимит',
                desc: 'У каждого пользователя есть дневной лимит мазков (100 в день). Это защищает холст от спама. Лимит обновляется каждый день.'
            }
        ];
    }

    shouldShow() {
        return !localStorage.getItem('canvaschat_onboarding_complete');
    }

    show() {
        if (!this.shouldShow()) return;

        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;

        this.currentStep = 0;
        this._render();
        overlay.classList.add('active');
    }

    _render() {
        const stepsContainer = document.getElementById('onboardingSteps');
        const dotsContainer = document.getElementById('onboardingDots');
        if (!stepsContainer || !dotsContainer) return;

        const step = this.steps[this.currentStep];

        stepsContainer.innerHTML = `
            <div class="onboarding-step active">
                <div class="onboarding-icon" style="background: ${step.iconBg}">
                    ${step.icon}
                </div>
                <h3 class="onboarding-title">${step.title}</h3>
                <p class="onboarding-desc">${step.desc}</p>
            </div>
        `;

        dotsContainer.innerHTML = this.steps.map((_, i) => `
            <div class="onboarding-dot ${i === this.currentStep ? 'active' : ''}"></div>
        `).join('');

        // Кнопки
        const actionsEl = document.getElementById('onboardingActions');
        if (actionsEl) {
            const isLast = this.currentStep === this.steps.length - 1;
            actionsEl.innerHTML = `
                <button class="btn-ghost" id="onboardingSkip">${isLast ? '' : 'Пропустить'}</button>
                <button class="btn-primary" id="onboardingNext">
                    ${isLast ? 'Начать рисовать!' : 'Далее →'}
                </button>
            `;

            document.getElementById('onboardingNext').addEventListener('click', () => {
                if (isLast) {
                    this._complete();
                } else {
                    this.currentStep++;
                    this._render();
                }
            });

            document.getElementById('onboardingSkip').addEventListener('click', () => {
                this._complete();
            });
        }
    }

    _complete() {
        localStorage.setItem('canvaschat_onboarding_complete', 'true');
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    reset() {
        localStorage.removeItem('canvaschat_onboarding_complete');
    }
}