// Демо-режим: вымышленные данные, чтобы посмотреть интерфейс в обычном браузере без TDLib.
// Режимы: ?mock=ready (сразу чаты), ?mock=auth (вход), ?mock=fresh (первый запуск с ключами).

export function createMock(dispatch) {
  const mode = new URLSearchParams(location.search).get('mock') || 'ready';
  const now = Math.floor(Date.now() / 1000);
  const ME = 1000;
  let auth = { '@type': 'authorizationStateWaitTdlibParameters' };
  let nextId = 900000;

  const users = [
    { id: ME, first_name: 'Алекс', last_name: '', phone_number: '380501234567', usernames: { active_usernames: ['alex'] }, status: { '@type': 'userStatusOnline', expires: now + 300 } },
    { id: 11, first_name: 'Мария', last_name: 'Коваль', status: { '@type': 'userStatusOnline', expires: now + 300 } },
    { id: 12, first_name: 'Дмитрий', last_name: 'Ли', status: { '@type': 'userStatusOffline', was_online: now - 3600 } },
    { id: 13, first_name: 'Олег', last_name: '', status: { '@type': 'userStatusRecently' } },
    { id: 14, first_name: 'Анна', last_name: 'Савчук', status: { '@type': 'userStatusOffline', was_online: now - 600 } },
    { id: 15, first_name: 'Ира', last_name: 'Бондарь', status: { '@type': 'userStatusLastWeek' } },
    { id: 16, first_name: 'Погода', last_name: 'Бот', type: { '@type': 'userTypeBot' }, status: { '@type': 'userStatusEmpty' } },
  ].map(u => ({ '@type': 'user', type: { '@type': 'userTypeRegular' }, accent_color_id: u.id % 7, ...u }));

  const msg = (chat_id, id, from, text, date, extra = {}) => ({
    '@type': 'message', id, chat_id, date, is_outgoing: from === ME,
    sender_id: from < 0 ? { '@type': 'messageSenderChat', chat_id: from } : { '@type': 'messageSenderUser', user_id: from },
    content: { '@type': 'messageText', text: { '@type': 'formattedText', text, entities: [] } }, ...extra,
  });
  const fmt = (text, entities) => ({ '@type': 'messageText', text: { '@type': 'formattedText', text, entities } });

  const H = 3600, D = 86400;
  const hist = {
    11: [
      msg(11, 101, 11, 'Привет! Как дела с проектом?', now - D - 5 * H),
      msg(11, 102, ME, 'Привет! Почти готово, делаю интерфейс как на Mac 🙂', now - D - 5 * H + 60),
      msg(11, 103, 11, 'Звучит круто', now - D - 5 * H + 90),
      msg(11, 104, 11, 'Покажешь, когда будет первая версия?', now - D - 5 * H + 95),
      msg(11, 105, ME, 'Конечно', now - D - 4 * H, { interaction_info: { reactions: { reactions: [{ type: { '@type': 'reactionTypeEmoji', emoji: '❤️' }, total_count: 1, is_chosen: false }, { type: { '@type': 'reactionTypeEmoji', emoji: '🔥' }, total_count: 2, is_chosen: true }] } } }),
      msg(11, 106, 11, '', now - 40 * 60, { is_pinned: true, content: fmt('Кстати, вот ссылка на макет: figma.com/file/demo и важное: дедлайн в пятницу', [
        { '@type': 'textEntity', offset: 29, length: 19, type: { '@type': 'textEntityTypeUrl' } },
        { '@type': 'textEntity', offset: 51, length: 6, type: { '@type': 'textEntityTypeBold' } },
      ]) }),
      msg(11, 107, ME, 'Отлично, гляну вечером', now - 35 * 60, { reply_to: { '@type': 'messageReplyToMessage', chat_id: 11, message_id: 106 } }),
      msg(11, 108, 11, '👍', now - 30 * 60),
      msg(11, 113, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 800, height: 600, photo: { id: 501, size: 1, local: {} } }] }, caption: { text: 'Фото с прогулки', entities: [] } } }),
      msg(11, 114, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 600, height: 800, photo: { id: 502, size: 1, local: {} } }] }, caption: { text: '', entities: [] } } }),
      msg(11, 115, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 800, height: 800, photo: { id: 503, size: 1, local: {} } }] }, caption: { text: '', entities: [] } } }),
      msg(11, 116, 11, '', now - 28 * 60, { content: { '@type': 'messagePoll', poll: { question: { text: 'Куда пойдём в субботу?' }, is_anonymous: true, total_voter_count: 7, type: { '@type': 'pollTypeRegular' }, options: [{ text: { text: 'В горы' }, voter_count: 4, vote_percentage: 57, is_chosen: true }, { text: { text: 'На море' }, voter_count: 2, vote_percentage: 29 }, { text: { text: 'Остаться дома' }, voter_count: 1, vote_percentage: 14 }] } } }),
      msg(11, 112, 11, '', now - 26 * 60, { content: { '@type': 'messageVideo', video: { duration: 42, width: 1280, height: 720, video: { id: 79, size: 9000000, local: { is_downloading_completed: false, can_be_downloaded: true, downloaded_size: 3000000 } } }, caption: { text: 'Видео с выходных', entities: [] } } }),
      msg(11, 110, 11, '', now - 25 * 60, { content: { '@type': 'messageVoiceNote', voice_note: { duration: 14, waveform: 'AAAQIEBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygp', voice: { id: 77, size: 20000, local: { is_downloading_completed: false, can_be_downloaded: true } } } } }),
      msg(11, 111, ME, '', now - 20 * 60, { content: { '@type': 'messageAudio', audio: { duration: 187, title: 'Night Drive', performer: 'Demo Artist', file_name: 'night.mp3', audio: { id: 78, size: 4200000, local: { is_downloading_completed: false, can_be_downloaded: true } } }, caption: { text: '', entities: [] } } }),
      msg(11, 109, 11, 'И не забудь про тёмную тему', now - 3 * 60),
    ],
    12: [
      msg(12, 201, 12, 'Завтра в 10 созвон?', now - 3 * H),
      msg(12, 202, ME, 'Да, давай', now - 2 * H),
    ],
    [-100]: [
      msg(-100, 301, 13, 'Всем привет!', now - 2 * D, { content: { '@type': 'messageChatAddMembers', member_user_ids: [13] } }),
      msg(-100, 302, 13, 'Кто идёт на встречу в субботу?', now - 2 * H),
      msg(-100, 303, 14, 'Я иду', now - 2 * H + 30),
      msg(-100, 304, 14, 'Могу взять колонку', now - 2 * H + 45),
      msg(-100, 305, 15, 'Я опоздаю на полчаса', now - H),
      msg(-100, 306, ME, 'Отлично, тогда в 12 у входа', now - 50 * 60),
      msg(-100, 307, 13, 'Договорились', now - 20 * 60),
    ],
    [-200]: [
      msg(-200, 401, -200, 'Новости недели: вышло крупное обновление. Рассказываем, что изменилось и как этим пользоваться.', now - 5 * H, { interaction_info: { view_count: 12400 } }),
      msg(-200, 402, -200, 'Опрос: какую тему разобрать в следующем выпуске?', now - 2 * H, { interaction_info: { view_count: 8300 } }),
    ],
    [ME]: [msg(ME, 501, ME, 'Заметка: купить молоко', now - 4 * D)],
    13: [msg(13, 601, 13, 'Скинул файлы в облако', now - 3 * D)],
    16: [msg(16, 701, 16, 'Сегодня +18°, без осадков ☀️', now - 6 * H)],
  };

  const order = (d, pinned = false) => ({ '@type': 'chatPosition', list: { '@type': 'chatListMain' }, order: String(d * 1000 + (pinned ? 9e12 : 0)), is_pinned: pinned });
  const chats = [
    { id: 11, title: 'Мария Коваль', type: { '@type': 'chatTypePrivate', user_id: 11 }, unread_count: 2, pinned: true },
    { id: -100, title: 'Субботняя встреча', type: { '@type': 'chatTypeBasicGroup', basic_group_id: 100 }, unread_count: 1, accent_color_id: 3 },
    { id: 12, title: 'Дмитрий Ли', type: { '@type': 'chatTypePrivate', user_id: 12 }, unread_count: 0, last_read_outbox_message_id: 202 },
    { id: -200, title: 'Новости технологий', type: { '@type': 'chatTypeSupergroup', supergroup_id: 200, is_channel: true }, unread_count: 24, muted: true, accent_color_id: 5 },
    { id: 16, title: 'Погода Бот', type: { '@type': 'chatTypePrivate', user_id: 16 }, unread_count: 0 },
    { id: ME, title: 'Алекс', type: { '@type': 'chatTypePrivate', user_id: ME }, unread_count: 0 },
    { id: 13, title: 'Олег', type: { '@type': 'chatTypePrivate', user_id: 13 }, unread_count: 0, last_read_outbox_message_id: 0 },
  ].map(c => {
    const list = hist[c.id] || [];
    const last = list[list.length - 1];
    return {
      '@type': 'chat', id: c.id, title: c.title, type: c.type, unread_count: c.unread_count, unread_mention_count: 0,
      last_read_outbox_message_id: c.last_read_outbox_message_id ?? 999999, last_read_inbox_message_id: 0,
      accent_color_id: c.accent_color_id ?? Math.abs(c.id) % 7,
      notification_settings: { '@type': 'chatNotificationSettings', use_default_mute_for: !c.muted, mute_for: c.muted ? 2147483647 : 0 },
      permissions: { can_send_basic_messages: true },
      last_message: last, positions: [order(last?.date || 0, c.pinned)],
    };
  });

  const emit = u => setTimeout(() => dispatch(u), 0);
  const setAuth = s => { auth = s; emit({ '@type': 'updateAuthorizationState', authorization_state: s }); };

  function populate() {
    emit({ '@type': 'updateOption', name: 'my_id', value: { '@type': 'optionValueInteger', value: String(ME) } });
    users.forEach(user => emit({ '@type': 'updateUser', user }));
    emit({ '@type': 'updateBasicGroup', basic_group: { id: 100, member_count: 4 } });
    emit({ '@type': 'updateSupergroup', supergroup: { id: 200, member_count: 48200, is_channel: true, status: { '@type': 'chatMemberStatusMember' } } });
    chats.forEach(chat => emit({ '@type': 'updateNewChat', chat }));
    emit({ '@type': 'updateChatFolders', chat_folders: [{ id: 1, name: { text: { text: 'Личное' } } }, { id: 2, name: { text: { text: 'Работа' } } }] });
    chats.filter(c => c.type['@type'] === 'chatTypePrivate').forEach(c => emit({ '@type': 'updateChatPosition', chat_id: c.id, position: { ...c.positions[0], list: { '@type': 'chatListFolder', chat_folder_id: 1 } } }));
    [12, -100].forEach(id => { const c = chats.find(x => x.id === id); emit({ '@type': 'updateChatPosition', chat_id: id, position: { ...c.positions[0], list: { '@type': 'chatListFolder', chat_folder_id: 2 } } }); });
    emit({ '@type': 'updateChatActiveStories', active_stories: { chat_id: 12, list: { '@type': 'storyListMain' }, order: '100', max_read_story_id: 0, stories: [{ story_id: 1, date: now - 3600 }, { story_id: 2, date: now - 1800 }] } });
    emit({ '@type': 'updateChatActiveStories', active_stories: { chat_id: 13, list: { '@type': 'storyListMain' }, order: '90', max_read_story_id: 5, stories: [{ story_id: 5, date: now - 7200 }] } });
    emit({ '@type': 'updateChatActiveStories', active_stories: { chat_id: 11, list: { '@type': 'storyListMain' }, order: '95', max_read_story_id: 0, stories: [{ story_id: 9, date: now - 600, is_for_close_friends: true }] } });
    // «печатает…» и входящее сообщение через пару секунд
    setTimeout(() => emit({ '@type': 'updateChatAction', chat_id: 12, message_thread_id: 0, sender_id: { '@type': 'messageSenderUser', user_id: 12 }, action: { '@type': 'chatActionTyping' } }), 1500);
    setTimeout(() => {
      const m = msg(12, 203, 12, 'Только возьми, пожалуйста, ссылку на документ', Math.floor(Date.now() / 1000));
      hist[12].push(m);
      emit({ '@type': 'updateChatAction', chat_id: 12, message_thread_id: 0, sender_id: { '@type': 'messageSenderUser', user_id: 12 }, action: { '@type': 'chatActionCancel' } });
      emit({ '@type': 'updateNewMessage', message: m });
      const c = chats.find(x => x.id === 12);
      emit({ '@type': 'updateChatLastMessage', chat_id: 12, last_message: m, positions: [order(m.date)] });
      emit({ '@type': 'updateChatReadInbox', chat_id: 12, last_read_inbox_message_id: 202, unread_count: (c.unread_count = 1) });
    }, 5000);
  }

  const api = {
    hasCreds: mode !== 'fresh',
    restart() { setAuth({ '@type': 'authorizationStateWaitTdlibParameters' }); },
    send(raw) {
      const q = JSON.parse(raw);
      const reply = (obj, delay = 60) => setTimeout(() => dispatch({ ...obj, '@extra': q['@extra'] }), delay);
      const err = (code, message) => reply({ '@type': 'error', code, message });
      const ok = () => reply({ '@type': 'ok' });
      switch (q['@type']) {
        case 'setTdlibParameters':
          ok();
          setTimeout(() => {
            if (mode === 'ready') { setAuth({ '@type': 'authorizationStateReady' }); populate(); }
            else setAuth({ '@type': 'authorizationStateWaitPhoneNumber' });
          }, 400);
          return;
        case 'setAuthenticationPhoneNumber':
          ok();
          return setTimeout(() => setAuth({ '@type': 'authorizationStateWaitCode', code_info: { phone_number: q.phone_number, type: { '@type': 'authenticationCodeTypeTelegramMessage', length: 5 } } }), 500);
        case 'checkAuthenticationCode':
          if (q.code !== '12345') return err(400, 'PHONE_CODE_INVALID');
          ok();
          return setTimeout(() => setAuth({ '@type': 'authorizationStateWaitPassword', password_hint: 'кот' }), 300);
        case 'checkAuthenticationPassword':
          if (q.password !== 'demo') return err(400, 'PASSWORD_HASH_INVALID');
          ok();
          return setTimeout(() => { setAuth({ '@type': 'authorizationStateReady' }); populate(); }, 300);
        case 'getMe': return reply(users[0]);
        case 'loadChats': return err(404, 'Not Found');
        case 'getChatHistory': {
          const list = (hist[q.chat_id] || []).filter(m => !q.from_message_id || m.id < q.from_message_id).slice(-q.limit).reverse();
          return reply({ '@type': 'messages', total_count: list.length, messages: list }, 150);
        }
        case 'sendMessageAlbum': return reply({ '@type': 'messages', messages: [] });
        case 'sendMessage': {
          const ic = q.input_message_content;
          if (ic['@type'] !== 'inputMessageText') {
            const path = (ic.photo || ic.document || ic.video || ic.audio || ic.animation || ic.voice_note).path;
            const m = msg(q.chat_id, ++nextId, ME, '', Math.floor(Date.now() / 1000), { content: { '@type': 'messageDocument', document: { file_name: path.split('/').pop(), document: { id: nextId, size: 120000, local: {} } }, caption: ic.caption } });
            (hist[q.chat_id] ||= []).push(m);
            return reply(m, 20);
          }
          const m = msg(q.chat_id, ++nextId, ME, q.input_message_content.text.text, Math.floor(Date.now() / 1000),
            { sending_state: { '@type': 'messageSendingStatePending' }, reply_to: q.reply_to ? { '@type': 'messageReplyToMessage', chat_id: q.chat_id, message_id: q.reply_to.message_id } : undefined });
          reply(m, 20);
          setTimeout(() => {
            const done = { ...m, id: ++nextId, sending_state: undefined };
            (hist[q.chat_id] ||= []).push(done);
            dispatch({ '@type': 'updateMessageSendSucceeded', message: done, old_message_id: m.id });
            dispatch({ '@type': 'updateChatLastMessage', chat_id: q.chat_id, last_message: done, positions: [order(done.date, chats.find(c => c.id === q.chat_id)?.positions[0].is_pinned)] });
          }, 500);
          setTimeout(() => dispatch({ '@type': 'updateChatReadOutbox', chat_id: q.chat_id, last_read_outbox_message_id: nextId }), 2500);
          return;
        }
        case 'editMessageText': {
          const m = hist[q.chat_id]?.find(x => x.id === q.message_id);
          if (m) { m.content = q.input_message_content; m.edit_date = Math.floor(Date.now() / 1000); }
          reply(m || {});
          setTimeout(() => { dispatch({ '@type': 'updateMessageContent', chat_id: q.chat_id, message_id: q.message_id, new_content: q.input_message_content }); dispatch({ '@type': 'updateMessageEdited', chat_id: q.chat_id, message_id: q.message_id, edit_date: m.edit_date }); }, 80);
          return;
        }
        case 'deleteMessages':
          hist[q.chat_id] = (hist[q.chat_id] || []).filter(m => !q.message_ids.includes(m.id));
          ok();
          return setTimeout(() => dispatch({ '@type': 'updateDeleteMessages', chat_id: q.chat_id, message_ids: q.message_ids, is_permanent: true, from_cache: false }), 50);
        case 'viewMessages':
          ok();
          return setTimeout(() => dispatch({ '@type': 'updateChatReadInbox', chat_id: q.chat_id, last_read_inbox_message_id: Math.max(...q.message_ids), unread_count: 0 }), 50);
        case 'searchChats': case 'searchChatsOnServer': {
          const lq = q.query.toLowerCase();
          return reply({ '@type': 'chats', chat_ids: chats.filter(c => c.title.toLowerCase().includes(lq)).map(c => c.id) });
        }
        case 'getUserFullInfo': return reply({ '@type': 'userFullInfo', bio: { '@type': 'formattedText', text: 'Дизайнер. Люблю кофе и горы ☕️', entities: [] } }, 150);
        case 'searchChatMessages': {
          const all = (hist[q.chat_id] || []).slice().reverse();
          if (q.filter?.['@type'] === 'searchMessagesFilterPinned') return reply({ '@type': 'foundChatMessages', messages: all.filter(m => m.is_pinned), total_count: all.filter(m => m.is_pinned).length }, 100);
          if (q.query) { const r = all.filter(m => (m.content.text?.text || '').toLowerCase().includes(q.query.toLowerCase())); return reply({ '@type': 'foundChatMessages', messages: r, total_count: r.length }, 100); }
          return reply({ '@type': 'foundChatMessages', messages: [], total_count: 0 }, 150);
        }
        case 'parseMarkdown': {
          let t = q.text.text; const entities = [];
          t = t.replace(/\*\*(.+?)\*\*/g, (m0, x, off) => { entities.push({ '@type': 'textEntity', offset: off, length: x.length, type: { '@type': 'textEntityTypeBold' } }); return x; });
          return reply({ '@type': 'formattedText', text: t, entities });
        }
        case 'getStory': return reply({ '@type': 'story', id: q.story_id, content: { '@type': 'storyContentPhoto', photo: { sizes: [], minithumbnail: null } }, caption: { text: 'Вид с горы 🏔', entities: [] } }, 200);
        case 'getActiveSessions': return reply({ '@type': 'sessions', sessions: [
          { id: '1', is_current: true, application_name: 'MacTele', application_version: '0.2', device_model: 'Windows PC', platform: 'Windows', system_version: '11', country: 'Украина', last_active_date: now },
          { id: '2', application_name: 'Telegram iOS', application_version: '12.1', device_model: 'iPhone 16', platform: 'iOS', system_version: '26', country: 'Украина', ip_address: '93.x.x.x', last_active_date: now - 3600 }] }, 200);
        case 'getStorageStatisticsFast': return reply({ files_size: 734003200, file_count: 1873, database_size: 52428800 }, 100);
        case 'getUserPrivacySettingRules': return reply({ rules: [{ '@type': 'userPrivacySettingRuleAllowContacts' }] }, 100);
        case 'getPasswordState': return reply({ has_password: true }, 100);
        case 'getBlockedMessageSenders': return reply({ total_count: 3 }, 100);
        case 'getContacts': return reply({ '@type': 'users', user_ids: users.slice(1).map(u => u.id) }, 200);
        case 'createPrivateChat': return reply(chats.find(c => c.id === q.user_id) || chats[0]);
        case 'getRepliedMessage': {
          const m = Object.values(hist).flat().find(x => x.id === q.message_id);
          const rid = m?.reply_to?.message_id;
          const r = Object.values(hist).flat().find(x => x.id === rid);
          return r ? reply(r) : err(404, 'Not Found');
        }
        case 'logOut':
          ok();
          setAuth({ '@type': 'authorizationStateLoggingOut' });
          return setTimeout(() => setAuth({ '@type': 'authorizationStateClosed' }), 400);
        case 'getAuthorizationState': return reply(auth);
        default: return ok();
      }
    },
  };
  setTimeout(() => setAuth(auth), 50);
  return api;
}
