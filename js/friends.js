/**
 * CanvasChat — Friends System
 */

class FriendsManager {
    constructor(firebaseService, userId, chatManager, uiManager) {
        this.firebase = firebaseService;
        this.userId = userId;
        this.chat = chatManager;
        this.ui = uiManager;

        this.friends = [];
        this.friendRequests = [];
    }

    async init() {
        await this._loadFriends();
        this._setupSearch();
        this._setupAddFriend();
        this._listenFriendRequests();
    }

    async _loadFriends() {
        const profile = await this.firebase.getUserProfile(this.userId);
        if (!profile || !profile.friends) {
            this._renderFriendsList([]);
            return;
        }

        const friendUids = Object.keys(profile.friends);
        const friends = [];

        for (const uid of friendUids) {
            const friendProfile = await this.firebase.getUserProfile(uid);
            if (friendProfile) {
                friends.push(friendProfile);
            }
        }

        this.friends = friends;
        this._renderFriendsList(friends);
    }

    _renderFriendsList(friends) {
        const list = document.querySelector('.friends-list');
        if (!list) return;

        list.innerHTML = '';

        if (friends.length === 0) {
            list.innerHTML = `
                <div class="chat-empty" style="padding: 40px 20px;">
                    <div class="chat-empty-icon">👥</div>
                    <p>У вас пока нет друзей</p>
                    <p style="font-size: 12px;">Найдите друзей по никнейму</p>
                </div>
            `;
            return;
        }

        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];

        friends.forEach((friend, i) => {
            const el = document.createElement('div');
            el.className = 'friend-item';
            el.innerHTML = `
                <div class="friend-avatar" style="background: ${colors[i % colors.length]}">
                    ${(friend.nickname || 'U')[0].toUpperCase()}
                    <div class="friend-status ${friend.online ? 'online' : 'offline'}"></div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">${this._escapeHtml(friend.nickname || 'Пользователь')}</div>
                    <div class="friend-last-msg">${friend.online ? 'В сети' : 'Не в сети'}</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn chat-btn" title="Написать" data-uid="${friend.uid}">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M2 3H14V11H4L2 13V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="friend-action-btn remove-btn" title="Удалить" data-uid="${friend.uid}">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            `;

            // Написать в чат
            el.querySelector('.chat-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.chat.openFriendChat(friend.uid, friend);
            });

            // Удалить друга
            el.querySelector('.remove-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Удалить ${friend.nickname} из друзей?`)) {
                    try {
                        await this.firebase.removeFriend(this.userId, friend.uid);
                        this.ui.showToast(`${friend.nickname} удалён из друзей`, 'info');
                        await this._loadFriends();
                    } catch (error) {
                        this.ui.showToast('Ошибка удаления', 'error');
                    }
                }
            });

            // Клик на элемент — открыть чат
            el.addEventListener('click', () => {
                this.chat.openFriendChat(friend.uid, friend);
            });

            list.appendChild(el);
        });
    }

    _setupSearch() {
        const input = document.querySelector('.search-input');
        if (!input) return;

        let debounce = null;

        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(async () => {
                const query = input.value.trim();
                if (query.length < 2) {
                    this._renderFriendsList(this.friends);
                    return;
                }

                try {
                    const results = await this.firebase.searchUsers(query);
                    // Фильтруем себя
                    const filtered = results.filter(u => u.uid !== this.userId);
                    this._renderSearchResults(filtered);
                } catch (error) {
                    console.error('[Friends] Ошибка поиска:', error);
                }
            }, 300);
        });
    }

    _renderSearchResults(users) {
        const list = document.querySelector('.friends-list');
        if (!list) return;

        list.innerHTML = '';

        if (users.length === 0) {
            list.innerHTML = `
                <div class="chat-empty" style="padding: 40px 20px;">
                    <div class="chat-empty-icon">🔍</div>
                    <p>Никого не найдено</p>
                </div>
            `;
            return;
        }

        const colors = ['#6C5CE7', '#E17055', '#00B894', '#FDCB6E', '#0984E3', '#E84393'];
        const friendUids = new Set(this.friends.map(f => f.uid));

        users.forEach((user, i) => {
            const isFriend = friendUids.has(user.uid);
            const el = document.createElement('div');
            el.className = 'friend-item';
            el.innerHTML = `
                <div class="friend-avatar" style="background: ${colors[i % colors.length]}">
                    ${(user.nickname || 'U')[0].toUpperCase()}
                    <div class="friend-status ${user.online ? 'online' : 'offline'}"></div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">${this._escapeHtml(user.nickname || 'Пользователь')}</div>
                    <div class="friend-last-msg">${isFriend ? '✓ Друг' : user.online ? 'В сети' : 'Не в сети'}</div>
                </div>
                <div class="friend-actions" style="opacity: 1;">
                    ${!isFriend ? `
                        <button class="btn-sm btn-primary add-friend-btn" data-uid="${user.uid}">
                            Добавить
                        </button>
                    ` : ''}
                </div>
            `;

            const addBtn = el.querySelector('.add-friend-btn');
            if (addBtn) {
                addBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await this.firebase.sendFriendRequest(this.userId, user.uid);
                        addBtn.textContent = 'Отправлено';
                        addBtn.disabled = true;
                        this.ui.showToast(`Запрос дружбы отправлен ${user.nickname}`, 'success');
                    } catch (error) {
                        this.ui.showToast('Ошибка отправки запроса', 'error');
                    }
                });
            }

            list.appendChild(el);
        });
    }

    _setupAddFriend() {
        const form = document.querySelector('.add-friend-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = form.querySelector('input');
            const nickname = input?.value.trim();
            if (!nickname) return;

            try {
                const results = await this.firebase.searchUsers(nickname);
                const user = results.find(u => u.nickname === nickname && u.uid !== this.userId);

                if (!user) {
                    this.ui.showToast('Пользователь не найден', 'warning');
                    return;
                }

                await this.firebase.sendFriendRequest(this.userId, user.uid);
                this.ui.showToast(`Запрос дружбы отправлен ${nickname}`, 'success');
                input.value = '';
            } catch (error) {
                this.ui.showToast('Ошибка', 'error');
            }
        });
    }

    _listenFriendRequests() {
        this.firebase.onFriendRequests(this.userId, async (requests) => {
            this.friendRequests = requests;

            // Обновляем бейдж
            const badge = document.querySelector('.friend-requests-badge');
            if (badge) {
                badge.textContent = requests.length;
                badge.style.display = requests.length > 0 ? 'inline' : 'none';
            }

            // Показываем уведомления
            for (const req of requests) {
                const sender = await this.firebase.getUserProfile(req.uid);
                if (sender) {
                    this.ui.showToast(
                        `${sender.nickname} хочет добавить вас в друзья`,
                        'info'
                    );

                    // Авто-принятие для демо (можно заменить на UI)
                    // В реальном приложении показать кнопки "Принять" / "Отклонить"
                    if (confirm(`${sender.nickname} хочет добавить вас в друзья. Принять?`)) {
                        await this.firebase.acceptFriendRequest(this.userId, req.uid);
                        this.ui.showToast(`${sender.nickname} теперь ваш друг!`, 'success');
                        await this._loadFriends();
                    }
                }
            }
        });
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}