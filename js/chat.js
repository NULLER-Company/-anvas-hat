/**
 * CanvasChat — Chat System
 */

class ChatManager {
    constructor(firebaseService, userId, userProfile) {
        this.firebase = firebaseService;
        this.userId = userId;
        this.userProfile = userProfile;

        this.currentChatId = 'global';
        this.currentChatPartner = null;

        this._unsubscribers = [];
    }

    async init() {
        // Загружаем глобальный чат
        await this.loadChat('global');
        this._setupInputHandlers();
    }

    async loadChat(chatId, partnerProfile = null) {
        // Очищаем предыдущую подписку
        this._unsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this._unsubscribers = [];

        this.currentChatId = chatId;
        this.currentChatPartner = partnerProfile;

        const messagesEl = document.querySelector('.chat-messages');
        if (!messagesEl) return;

        // Обновляем заголовок
        const headerName = document.querySelector('.chat-header-name');
        const headerStatus = document.querySelector('.chat-header-status');
        if (headerName) {
            headerName.textContent = partnerProfile ? partnerProfile.nickname : 'Общий чат';
        }
        if (headerStatus) {
            headerStatus.textContent = partnerProfile
                ? (partnerProfile.online ? 'В сети' : 'Не в сети')
                : 'Все пользователи';
        }

        // Очищаем сообщения
        messagesEl.innerHTML = '';

        try {
            // Загружаем историю
            const messages = await this.firebase.loadMessages(chatId);
            messages.forEach(msg => this._renderMessage(msg));
            this._scrollToBottom();

            // Подписываемся на новые
            const unsub = this.firebase.onNewMessage(chatId, msg => {
                this._renderMessage(msg);
                this._scrollToBottom();
            });
            this._unsubscribers.push(unsub);
        } catch (error) {
            console.error('[Chat] Ошибка загрузки:', error);
        }
    }

    _setupInputHandlers() {
        const input = document.querySelector('.chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');

        if (!input || !sendBtn) return;

        const send = async () => {
            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            sendBtn.disabled = true;

            try {
                await this.firebase.sendMessage(this.currentChatId, {
                    text: text,
                    senderId: this.userId,
                    senderName: this.userProfile?.nickname || 'Аноним'
                });
            } catch (error) {
                console.error('[Chat] Ошибка отправки:', error);
                input.value = text;
            }

            sendBtn.disabled = false;
            input.focus();
        };

        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });

        // Активация кнопки
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
        });
    }

    _renderMessage(msg) {
        const messagesEl = document.querySelector('.chat-messages');
        if (!messagesEl) return;

        // Убираем пустое состояние
        const empty = messagesEl.querySelector('.chat-empty');
        if (empty) empty.remove();

        const isOwn = msg.senderId === this.userId;
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';

        const div = document.createElement('div');
        div.className = `message ${isOwn ? 'own' : 'other'}`;
        div.innerHTML = `
            ${!isOwn ? `<span class="message-sender">${this._escapeHtml(msg.senderName || 'Аноним')}</span>` : ''}
            <div class="message-bubble">${this._escapeHtml(msg.text)}</div>
            <span class="message-time">${time}</span>
        `;

        messagesEl.appendChild(div);
    }

    _scrollToBottom() {
        const messagesEl = document.querySelector('.chat-messages');
        if (messagesEl) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getChatIdForFriend(friendUid) {
        // Создаём уникальный chatId для пары пользователей
        const ids = [this.userId, friendUid].sort();
        return `dm_${ids[0]}_${ids[1]}`;
    }

    async openFriendChat(friendUid, friendProfile) {
        const chatId = this.getChatIdForFriend(friendUid);
        await this.loadChat(chatId, friendProfile);

        // Переключаем на таб чата
        const chatTab = document.querySelector('[data-panel="chatPanel"]');
        if (chatTab) chatTab.click();
    }

    destroy() {
        this._unsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
    }
}