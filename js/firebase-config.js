/**
 * CanvasChat — Firebase Configuration
 * Замените значения на свои из Firebase Console
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqbexDcbA_g82ZTlXCur6O8Ap9kGkLt6A",
  authDomain: "canvaschat-52708.firebaseapp.com",
  databaseURL: "https://canvaschat-52708-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "canvaschat-52708",
  storageBucket: "canvaschat-52708.firebasestorage.app",
  messagingSenderId: "35319703560",
  appId: "1:35319703560:web:658e82c88bee0d70c609bd",
  measurementId: "G-P3X7TH7G70"
};

// Инициализация Firebase (CDN подход для GitHub Pages)
class FirebaseService {
    constructor() {
        this.app = null;
        this.auth = null;
        this.db = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Ждём загрузки Firebase SDK
            if (typeof firebase === 'undefined') {
                await this._loadFirebaseSDK();
            }

            this.app = firebase.initializeApp(FIREBASE_CONFIG);
            this.auth = firebase.auth();
            this.db = firebase.database();

            // Настройка persistence
            this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

            this.initialized = true;
            console.log('[Firebase] Инициализирован успешно');
        } catch (error) {
            console.error('[Firebase] Ошибка инициализации:', error);
            throw error;
        }
    }

    async _loadFirebaseSDK() {
        const scripts = [
            'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
            'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
            'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
        ];

        for (const src of scripts) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }

    // ==========================================
    // Авторизация
    // ==========================================

    async registerWithEmail(email, password, nickname) {
        const credential = await this.auth.createUserWithEmailAndPassword(email, password);
        const user = credential.user;

        await user.updateProfile({ displayName: nickname });

        // Сохраняем профиль в базе
        await this.db.ref(`users/${user.uid}`).set({
            uid: user.uid,
            nickname: nickname,
            email: email,
            avatar: null,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            online: true,
            dailyStrokes: 0,
            lastStrokeReset: new Date().toDateString(),
            friends: {}
        });

        return user;
    }

    async loginWithEmail(email, password) {
        const credential = await this.auth.signInWithEmailAndPassword(email, password);
        await this._updatePresence(credential.user.uid);
        return credential.user;
    }

    async loginWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        const credential = await this.auth.signInWithPopup(provider);
        const user = credential.user;

        // Проверяем, новый ли пользователь
        const snapshot = await this.db.ref(`users/${user.uid}`).once('value');
        if (!snapshot.exists()) {
            await this.db.ref(`users/${user.uid}`).set({
                uid: user.uid,
                nickname: user.displayName || 'Пользователь',
                email: user.email,
                avatar: user.photoURL,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                online: true,
                dailyStrokes: 0,
                lastStrokeReset: new Date().toDateString(),
                friends: {}
            });
        } else {
            await this._updatePresence(user.uid);
        }

        return user;
    }

    async logout() {
        const uid = this.auth.currentUser?.uid;
        if (uid) {
            await this.db.ref(`users/${uid}/online`).set(false);
            await this.db.ref(`users/${uid}/lastSeen`).set(firebase.database.ServerValue.TIMESTAMP);
        }
        return this.auth.signOut();
    }

    async _updatePresence(uid) {
        await this.db.ref(`users/${uid}`).update({
            online: true,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Автоматический offline при отключении
        this.db.ref(`users/${uid}/online`).onDisconnect().set(false);
        this.db.ref(`users/${uid}/lastSeen`).onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    }

    onAuthStateChanged(callback) {
        return this.auth.onAuthStateChanged(callback);
    }

    getCurrentUser() {
        return this.auth.currentUser;
    }

    // ==========================================
    // Профиль пользователя
    // ==========================================

    async getUserProfile(uid) {
        const snapshot = await this.db.ref(`users/${uid}`).once('value');
        return snapshot.val();
    }

    async updateUserProfile(uid, data) {
        return this.db.ref(`users/${uid}`).update(data);
    }

    async searchUsers(query) {
        const snapshot = await this.db.ref('users')
            .orderByChild('nickname')
            .startAt(query)
            .endAt(query + '\uf8ff')
            .limitToFirst(20)
            .once('value');

        const results = [];
        snapshot.forEach(child => {
            results.push(child.val());
        });
        return results;
    }

    // ==========================================
    // Друзья
    // ==========================================

    async sendFriendRequest(fromUid, toUid) {
        const batch = {};
        batch[`friendRequests/${toUid}/${fromUid}`] = {
            from: fromUid,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: 'pending'
        };
        return this.db.ref().update(batch);
    }

    async acceptFriendRequest(myUid, friendUid) {
        const batch = {};
        batch[`users/${myUid}/friends/${friendUid}`] = true;
        batch[`users/${friendUid}/friends/${myUid}`] = true;
        batch[`friendRequests/${myUid}/${friendUid}`] = null;
        return this.db.ref().update(batch);
    }

    async removeFriend(myUid, friendUid) {
        const batch = {};
        batch[`users/${myUid}/friends/${friendUid}`] = null;
        batch[`users/${friendUid}/friends/${myUid}`] = null;
        return this.db.ref().update(batch);
    }

    onFriendRequests(uid, callback) {
        return this.db.ref(`friendRequests/${uid}`).on('value', snapshot => {
            const requests = [];
            snapshot.forEach(child => {
                requests.push({ ...child.val(), uid: child.key });
            });
            callback(requests);
        });
    }

    // ==========================================
    // Холст (Strokes)
    // ==========================================

    async addStroke(stroke) {
        const ref = this.db.ref('canvas/strokes').push();
        stroke.id = ref.key;
        stroke.timestamp = firebase.database.ServerValue.TIMESTAMP;
        await ref.set(stroke);
        return stroke;
    }

    async loadCanvasStrokes(limit = 2000) {
        const snapshot = await this.db.ref('canvas/strokes')
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');

        const strokes = [];
        snapshot.forEach(child => {
            strokes.push(child.val());
        });
        return strokes;
    }

    onNewStroke(callback) {
        const ref = this.db.ref('canvas/strokes')
            .orderByChild('timestamp')
            .startAt(Date.now());

        ref.on('child_added', snapshot => {
            callback(snapshot.val());
        });

        return () => ref.off();
    }

    async undoStroke(strokeId) {
        return this.db.ref(`canvas/strokes/${strokeId}`).remove();
    }

    onStrokeRemoved(callback) {
        this.db.ref('canvas/strokes').on('child_removed', snapshot => {
            callback(snapshot.key);
        });
    }

    // ==========================================
    // Курсоры
    // ==========================================

    updateCursor(uid, data) {
        this.db.ref(`cursors/${uid}`).set({
            ...data,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        this.db.ref(`cursors/${uid}`).onDisconnect().remove();
    }

    onCursors(callback) {
        this.db.ref('cursors').on('value', snapshot => {
            const cursors = {};
            snapshot.forEach(child => {
                cursors[child.key] = child.val();
            });
            callback(cursors);
        });
    }

    // ==========================================
    // Чат
    // ==========================================

    async sendMessage(chatId, message) {
        const ref = this.db.ref(`chats/${chatId}/messages`).push();
        message.id = ref.key;
        message.timestamp = firebase.database.ServerValue.TIMESTAMP;
        await ref.set(message);

        // Обновляем last message
        await this.db.ref(`chats/${chatId}/lastMessage`).set({
            text: message.text,
            senderId: message.senderId,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        return message;
    }

    async loadMessages(chatId, limit = 100) {
        const snapshot = await this.db.ref(`chats/${chatId}/messages`)
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');

        const messages = [];
        snapshot.forEach(child => {
            messages.push(child.val());
        });
        return messages;
    }

    onNewMessage(chatId, callback) {
        const ref = this.db.ref(`chats/${chatId}/messages`)
            .orderByChild('timestamp')
            .startAt(Date.now());

        ref.on('child_added', snapshot => {
            callback(snapshot.val());
        });

        return () => ref.off();
    }

    // Глобальный чат
    async sendGlobalMessage(message) {
        return this.sendMessage('global', message);
    }

    async loadGlobalMessages(limit = 100) {
        return this.loadMessages('global', limit);
    }

    onNewGlobalMessage(callback) {
        return this.onNewMessage('global', callback);
    }

    // ==========================================
    // Лимит мазков
    // ==========================================

    async getStrokeCount(uid) {
        const snapshot = await this.db.ref(`users/${uid}`).once('value');
        const data = snapshot.val();

        if (!data) return { count: 0, limit: 100 };

        const today = new Date().toDateString();
        if (data.lastStrokeReset !== today) {
            // Новый день — сброс
            await this.db.ref(`users/${uid}`).update({
                dailyStrokes: 0,
                lastStrokeReset: today
            });
            return { count: 0, limit: 100 };
        }

        return { count: data.dailyStrokes || 0, limit: 100 };
    }

    async incrementStrokeCount(uid) {
        const ref = this.db.ref(`users/${uid}/dailyStrokes`);
        return ref.transaction(current => (current || 0) + 1);
    }

    // ==========================================
    // Онлайн пользователи
    // ==========================================

    onOnlineUsers(callback) {
        this.db.ref('users')
            .orderByChild('online')
            .equalTo(true)
            .on('value', snapshot => {
                const users = [];
                snapshot.forEach(child => {
                    users.push(child.val());
                });
                callback(users);
            });
    }
}

// Глобальный экземпляр
const firebaseService = new FirebaseService();
