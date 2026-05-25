/**
 * CanvasChat — Auth Handler (Landing Page)
 */

document.addEventListener('DOMContentLoaded', () => {
    firebaseService.init().then(() => {
        firebaseService.onAuthStateChanged(user => {
            if (user) {
                // ИСПРАВЛЕНО: новый путь
                window.location.href = 'app/';
            }
        });
    }).catch(err => {
        console.warn('[Auth] Firebase не инициализирован:', err.message);
    });

    // Форма входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const errorEl = document.getElementById('loginError');

            try {
                errorEl.classList.remove('visible');
                await firebaseService.loginWithEmail(email, password);
                // ИСПРАВЛЕНО
                window.location.href = 'app/';
            } catch (error) {
                errorEl.textContent = getAuthErrorMessage(error.code);
                errorEl.classList.add('visible');
            }
        });
    }

    // Форма регистрации
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nickname = document.getElementById('regNickname').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const passwordConfirm = document.getElementById('regPasswordConfirm').value;
            const errorEl = document.getElementById('registerError');

            if (password !== passwordConfirm) {
                errorEl.textContent = 'Пароли не совпадают';
                errorEl.classList.add('visible');
                return;
            }

            if (nickname.length < 2) {
                errorEl.textContent = 'Никнейм должен быть не менее 2 символов';
                errorEl.classList.add('visible');
                return;
            }

            try {
                errorEl.classList.remove('visible');
                await firebaseService.registerWithEmail(email, password, nickname);
                // ИСПРАВЛЕНО
                window.location.href = 'app/';
            } catch (error) {
                errorEl.textContent = getAuthErrorMessage(error.code);
                errorEl.classList.add('visible');
            }
        });
    }

    document.getElementById('googleLoginBtn')?.addEventListener('click', googleAuth);
    document.getElementById('googleRegBtn')?.addEventListener('click', googleAuth);

    async function googleAuth() {
        try {
            await firebaseService.loginWithGoogle();
            // ИСПРАВЛЕНО
            window.location.href = 'app/';
        } catch (error) {
            console.error('[Auth] Google auth error:', error);
            const errorEl = document.getElementById('loginError') || document.getElementById('registerError');
            if (errorEl) {
                errorEl.textContent = getAuthErrorMessage(error.code);
                errorEl.classList.add('visible');
            }
        }
    }

    function getAuthErrorMessage(code) {
        const messages = {
            'auth/user-not-found': 'Пользователь не найден',
            'auth/wrong-password': 'Неверный пароль',
            'auth/email-already-in-use': 'Этот email уже зарегистрирован',
            'auth/weak-password': 'Пароль слишком слабый (минимум 6 символов)',
            'auth/invalid-email': 'Некорректный email',
            'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
            'auth/popup-closed-by-user': 'Окно авторизации было закрыто',
            'auth/network-request-failed': 'Ошибка сети. Проверьте подключение',
            'auth/invalid-credential': 'Неверные учётные данные'
        };
        return messages[code] || 'Произошла ошибка. Попробуйте снова.';
    }
});
