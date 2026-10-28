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
    { id: 16, first_name: 'Погода', last_name: 'Бот', usernames: { active_usernames: ['weather_demo_bot'] }, type: { '@type': 'userTypeBot' }, status: { '@type': 'userStatusEmpty' } },
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
      msg(11, 113, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 800, height: 600, photo: { id: 501, size: 1, local: { can_be_downloaded: true } } }] }, caption: { text: 'Фото с прогулки', entities: [] } } }),
      msg(11, 114, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 600, height: 800, photo: { id: 502, size: 1, local: { can_be_downloaded: true } } }] }, caption: { text: '', entities: [] } } }),
      msg(11, 115, 11, '', now - 29 * 60, { media_album_id: '777', content: { '@type': 'messagePhoto', photo: { sizes: [{ type: 'x', width: 800, height: 800, photo: { id: 503, size: 1, local: { can_be_downloaded: true } } }] }, caption: { text: '', entities: [] } } }),
      msg(11, 116, 11, '', now - 28 * 60, { content: { '@type': 'messagePoll', poll: { question: { text: 'Куда пойдём в субботу?' }, is_anonymous: true, total_voter_count: 7, type: { '@type': 'pollTypeRegular' }, options: [{ text: { text: 'В горы' }, voter_count: 4, vote_percentage: 57, is_chosen: true }, { text: { text: 'На море' }, voter_count: 2, vote_percentage: 29 }, { text: { text: 'Остаться дома' }, voter_count: 1, vote_percentage: 14 }] } } }),
      msg(11, 117, 11, '', now - 27 * 60, { content: { '@type': 'messageVideoNote', video_note: { duration: 12, length: 384, thumbnail: { format: { '@type': 'thumbnailFormatJpeg' }, width: 384, height: 384, file: { id: 81, size: 1, local: { can_be_downloaded: true } } }, video: { id: 80, size: 900000, local: { is_downloading_completed: false, can_be_downloaded: true } } } } }),
      msg(11, 112, 11, '', now - 26 * 60, { content: { '@type': 'messageVideo', video: { duration: 42, width: 1280, height: 720, thumbnail: { format: { '@type': 'thumbnailFormatJpeg' }, width: 320, height: 180, file: { id: 82, size: 1, local: { can_be_downloaded: true } } }, video: { id: 79, size: 9000000, local: { is_downloading_completed: false, can_be_downloaded: true, downloaded_size: 3000000 } } }, caption: { text: 'Видео с выходных', entities: [] } } }),
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
      msg(-100, 308, 14, 'Во Львове завтра +21°, солнечно ☀️', now - 10 * 60, { via_bot_user_id: 16, forward_info: { origin: { '@type': 'messageOriginUser', sender_user_id: 11 }, date: now - D } }),
    ],
    [-200]: [
      msg(-200, 401, -200, 'Новости недели: вышло крупное обновление. Рассказываем, что изменилось и как этим пользоваться.', now - 5 * H, { interaction_info: { view_count: 12400, reply_info: { reply_count: 3, recent_replier_ids: [{ '@type': 'messageSenderUser', user_id: 11 }, { '@type': 'messageSenderUser', user_id: 14 }, { '@type': 'messageSenderUser', user_id: 13 }], last_message_id: 8003, last_read_inbox_message_id: 8001 } } }),
      msg(-200, 402, -200, 'Опрос: какую тему разобрать в следующем выпуске?', now - 2 * H, { interaction_info: { view_count: 8300, reply_info: { reply_count: 0, recent_replier_ids: [], last_message_id: 0, last_read_inbox_message_id: 0 } } }),
    ],
    [ME]: [msg(ME, 501, ME, 'Заметка: купить молоко', now - 4 * D)],
    // обсуждение канала: ветки комментариев к постам 401 (ветка 8000) и 402 (ветка 8100)
    [-201]: [
      msg(-201, 8000, -200, 'Новости недели: вышло крупное обновление.', now - 5 * H),
      msg(-201, 8001, 11, 'Наконец-то! Давно ждала', now - 4 * H, { topic_id: { '@type': 'messageTopicThread', message_thread_id: 8000 } }),
      msg(-201, 8002, 14, 'А тёмная тема стала лучше?', now - 3 * H, { topic_id: { '@type': 'messageTopicThread', message_thread_id: 8000 } }),
      msg(-201, 8003, 13, 'Да, и шрифты поправили 👍', now - 2 * H, { topic_id: { '@type': 'messageTopicThread', message_thread_id: 8000 }, reply_to: { '@type': 'messageReplyToMessage', chat_id: -201, message_id: 8002 } }),
      msg(-201, 8100, -200, 'Опрос: какую тему разобрать?', now - 2 * H),
    ],
    [-300]: [
      msg(-300, 9001, 12, 'Всем привет! Это общий чат клуба', now - 2 * D, { topic_id: { '@type': 'messageTopicForum', forum_topic_id: 1 } }),
      msg(-300, 9002, 14, 'Новые иконки для настроек — посмотрите, пожалуйста', now - 3 * H, { topic_id: { '@type': 'messageTopicForum', forum_topic_id: 2 } }),
      msg(-300, 9003, 11, 'Мне нравятся, только тени чуть мягче бы', now - 2 * H, { topic_id: { '@type': 'messageTopicForum', forum_topic_id: 2 } }),
      msg(-300, 9004, 13, 'Версия 0.6 собрана, можно тестировать', now - 50 * 60, { topic_id: { '@type': 'messageTopicForum', forum_topic_id: 3 } }),
      msg(-300, 9005, 15, 'При перетаскивании папок иногда мигает', now - 15 * 60, { topic_id: { '@type': 'messageTopicForum', forum_topic_id: 4 } }),
    ],
    13: [msg(13, 601, 13, 'Скинул файлы в облако', now - 3 * D)],
    16: [msg(16, 700, ME, '/start', now - 6 * H - 60, { content: fmt('/start', [{ '@type': 'textEntity', offset: 0, length: 6, type: { '@type': 'textEntityTypeBotCommand' } }]) }),
      msg(16, 701, 16, '', now - 6 * H, { content: fmt('Сегодня +18°, без осадков ☀️\nНажмите /forecast, чтобы узнать прогноз на неделю.', [{ '@type': 'textEntity', offset: 37, length: 9, type: { '@type': 'textEntityTypeBotCommand' } }]),
        reply_markup: { '@type': 'replyMarkupInlineKeyboard', rows: [[{ text: 'Завтра', type: { '@type': 'inlineKeyboardButtonTypeCallback', data: 'MQ==' } }, { text: 'Неделя', type: { '@type': 'inlineKeyboardButtonTypeCallback', data: 'Mg==' } }], [{ text: 'Открыть сайт', type: { '@type': 'inlineKeyboardButtonTypeUrl', url: 'https://example.com' } }]] } }),
      msg(16, 702, 16, 'Выберите город:', now - 6 * H + 30, { reply_markup: { '@type': 'replyMarkupShowKeyboard', rows: [[{ text: 'Киев', type: { '@type': 'keyboardButtonTypeText' } }, { text: 'Львов', type: { '@type': 'keyboardButtonTypeText' } }], [{ text: 'Отправить мой номер', type: { '@type': 'keyboardButtonTypeRequestPhoneNumber' } }]], resize_keyboard: true } })],
  };
  // Музыка для мини-плеера: аудио-посты в канале и в чате (файлы — window.__mockFiles[950…]).
  const song = (chat, id, performer, title, dur, ago) => msg(chat, id, chat, '', now - ago, { content: { '@type': 'messageAudio', caption: { text: '', entities: [] }, audio: {
    duration: dur, title, performer, file_name: `${performer} - ${title}.mp3`, mime_type: 'audio/mpeg', album_cover_minithumbnail: null,
    album_cover_thumbnail: { format: { '@type': 'thumbnailFormatJpeg' }, width: 90, height: 90, file: { id: 960 + (id % 5), size: 1, local: { can_be_downloaded: true } } },
    external_album_covers: [], audio: { id: 950, size: 1, local: { can_be_downloaded: true } } } } });
  // «публичный» музыкальный канал, на который вы не подписаны (для поиска трека по каналам)
  hist[-900] = [song(-900, 901, 'Playboi Carti', 'CRUSH (sped up)', 120, 9 * H), song(-900, 902, 'Playboi Carti', 'CRUSH', 174, 8 * H), song(-900, 903, 'Tyla', 'IS IT LOVE', 190, 7 * H)];
  hist[-200].push(song(-200, 410, 'Daft Punk', 'Instant Crush', 337, 3 * H), song(-200, 411, 'The Weeknd', 'Blinding Lights', 200, 2.5 * H),
    song(-200, 412, 'Daft Punk', 'Get Lucky', 369, 2 * H), song(-200, 413, 'Arctic Monkeys', 'Do I Wanna Know?', 272, 1.5 * H), song(-200, 414, 'Daft Punk', 'One More Time', 320, H));
  // Проверка скорости: ?mock=ready&long=400 — длинная лента в канале и в группе; &wall=1 — фото-фон (window.__mockFiles[900]).
  const qs = new URLSearchParams(location.search), longN = +qs.get('long') || 0;
  if (longN) {
    const words = 'стекло прокрутка сообщение канал обновление интерфейс macOS быстро красиво проверка лента пузырь фон'.split(' ');
    const text = i => Array.from({ length: 4 + (i * 7) % 26 }, (_, k) => words[(i + k * 3) % words.length]).join(' ');
    const base = hist[-200] || [], g = hist[-100] || [];
    for (let i = 0; i < longN; i++) {
      base.unshift(msg(-200, 7000 - i, -200, text(i), now - 6 * H - i * 1800, { interaction_info: { view_count: 100 + i, reply_info: i % 3 ? null : { reply_count: i % 7, recent_replier_ids: [], last_message_id: 0, last_read_inbox_message_id: 0 } } }));
      g.unshift(msg(-100, 6000 - i, [11, 12, ME, 13][i % 4], text(i), now - 6 * H - i * 900));
    }
  }

  const order = (d, pinned = false) => ({ '@type': 'chatPosition', list: { '@type': 'chatListMain' }, order: String(d * 1000 + (pinned ? 9e12 : 0)), is_pinned: pinned });
  const chats = [
    { id: 11, title: 'Мария Коваль', type: { '@type': 'chatTypePrivate', user_id: 11 }, unread_count: 2, pinned: true },
    { id: -100, title: 'Субботняя встреча', type: { '@type': 'chatTypeBasicGroup', basic_group_id: 100 }, unread_count: 1, accent_color_id: 3 },
    { id: 12, title: 'Дмитрий Ли', type: { '@type': 'chatTypePrivate', user_id: 12 }, unread_count: 0, last_read_outbox_message_id: 202 },
    { id: -200, title: 'Новости технологий', type: { '@type': 'chatTypeSupergroup', supergroup_id: 200, is_channel: true }, unread_count: 24, muted: true, accent_color_id: 5 },
    { id: 16, title: 'Погода Бот', type: { '@type': 'chatTypePrivate', user_id: 16 }, unread_count: 0, reply_markup_message_id: 702 },
    { id: ME, title: 'Алекс', type: { '@type': 'chatTypePrivate', user_id: ME }, unread_count: 0 },
    { id: 13, title: 'Олег', type: { '@type': 'chatTypePrivate', user_id: 13 }, unread_count: 0, last_read_outbox_message_id: 0 },
    { id: -300, title: 'Клуб разработчиков', type: { '@type': 'chatTypeSupergroup', supergroup_id: 300, is_channel: false }, unread_count: 3, accent_color_id: 2 },
  ].map(c => {
    const list = hist[c.id] || [];
    const last = list[list.length - 1];
    return {
      '@type': 'chat', id: c.id, title: c.title, type: c.type, unread_count: c.unread_count, unread_mention_count: 0,
      last_read_outbox_message_id: c.last_read_outbox_message_id ?? 999999, last_read_inbox_message_id: 0, reply_markup_message_id: c.reply_markup_message_id || 0,
      accent_color_id: c.accent_color_id ?? Math.abs(c.id) % 7,
      notification_settings: { '@type': 'chatNotificationSettings', use_default_mute_for: !c.muted, mute_for: c.muted ? 2147483647 : 0 },
      permissions: { can_send_basic_messages: true },
      last_message: last, positions: [order(last?.date || 0, c.pinned)],
    };
  });

  const emit = u => setTimeout(() => dispatch(u), 0);
  const folderTpl = title => ({ name: { '@type': 'chatFolderName', text: { '@type': 'formattedText', text: title, entities: [] } }, icon: null, color_id: -1, pinned_chat_ids: [], included_chat_ids: [], excluded_chat_ids: [],
    exclude_muted: false, exclude_read: false, exclude_archived: false, include_contacts: false, include_non_contacts: false, include_bots: false, include_groups: false, include_channels: false });
  const folders = { 1: { ...folderTpl('Личное'), include_contacts: true, include_non_contacts: true }, 2: { ...folderTpl('Работа'), included_chat_ids: [12, -100, -300] } };
  let folderOrder = [1, 2];
  const emitFolders = () => emit({ '@type': 'updateChatFolders', chat_folders: folderOrder.map(id => ({ id, name: folders[id].name })) });
  const topic = (id, name, color, extra = {}) => ({ info: { chat_id: -300, forum_topic_id: id, name, icon: { color, custom_emoji_id: '0' }, is_general: id === 1, is_closed: false, ...extra }, order: String(100 - id), unread_count: 0, unread_mention_count: 0, last_read_inbox_message_id: 0 });
  const topics = [topic(1, 'Общий', 0), { ...topic(2, 'Дизайн', 0xFF93B2), unread_count: 2 }, topic(3, 'Релизы', 0x6FB9F0, { is_closed: true }), { ...topic(4, 'Баги', 0xFB6F5F), unread_count: 1 }];
  const setAuth = s => { auth = s; emit({ '@type': 'updateAuthorizationState', authorization_state: s }); };

  function populate() {
    if (qs.get('wall')) emit({ '@type': 'updateSelectedBackground', for_dark_theme: false, background: { '@type': 'background', id: '900', type: { '@type': 'backgroundTypeWallpaper', is_blurred: false, is_moving: false }, document: { document: { id: 900, size: 1, local: { can_be_downloaded: true } } } } });
    emit({ '@type': 'updateOption', name: 'my_id', value: { '@type': 'optionValueInteger', value: String(ME) } });
    users.forEach(user => emit({ '@type': 'updateUser', user }));
    emit({ '@type': 'updateBasicGroup', basic_group: { id: 100, member_count: 4 } });
    emit({ '@type': 'updateSupergroup', supergroup: { id: 200, member_count: 48200, is_channel: true, status: { '@type': 'chatMemberStatusMember' } } });
    emit({ '@type': 'updateSupergroup', supergroup: { id: 201, member_count: 950, is_channel: false, status: { '@type': 'chatMemberStatusMember' } } });
    emit({ '@type': 'updateSupergroup', supergroup: { id: 300, member_count: 312, is_channel: false, is_forum: true, status: { '@type': 'chatMemberStatusAdministrator', can_be_edited: false, rights: { can_change_info: true, can_restrict_members: true, can_invite_users: true, can_pin_messages: true, can_promote_members: false } } } });
    emit({ '@type': 'updateBasicGroup', basic_group: { id: 100, member_count: 4, status: { '@type': 'chatMemberStatusCreator', is_member: true } } });
    emit({ '@type': 'updateNewChat', chat: { '@type': 'chat', id: -201, title: 'Новости технологий — чат', type: { '@type': 'chatTypeSupergroup', supergroup_id: 201, is_channel: false }, positions: [], permissions: { can_send_basic_messages: true }, accent_color_id: 4, notification_settings: { use_default_mute_for: true } } });
    chats.forEach(chat => emit({ '@type': 'updateNewChat', chat }));
    emitFolders();
    chats.filter(c => c.type['@type'] === 'chatTypePrivate').forEach(c => emit({ '@type': 'updateChatPosition', chat_id: c.id, position: { ...c.positions[0], list: { '@type': 'chatListFolder', chat_folder_id: 1 } } }));
    [12, -100, -300].forEach(id => { const c = chats.find(x => x.id === id); emit({ '@type': 'updateChatPosition', chat_id: id, position: { ...c.positions[0], list: { '@type': 'chatListFolder', chat_folder_id: 2 } } }); });
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
        case 'setDefaultBackground': { const bg = { '@type': 'background', id: String(Date.now()), type: q.type || { '@type': 'backgroundTypeFill', fill: { '@type': 'backgroundFillSolid', color: 0xdddddd } }, document: null }; reply(bg); return emit({ '@type': 'updateDefaultBackground', for_dark_theme: q.for_dark_theme, background: bg }); }
        case 'deleteDefaultBackground': ok(); return emit({ '@type': 'updateDefaultBackground', for_dark_theme: q.for_dark_theme, background: null });
        case 'getMessageAvailableReactions': return reply({ '@type': 'availableReactions', top_reactions: ['👍', '❤️', '🔥', '🎉', '😁', '🤔', '👏', '😢'].map(emoji => ({ type: { '@type': 'reactionTypeEmoji', emoji }, needs_premium: false })), recent_reactions: [], popular_reactions: [] }, 80);
        // ── ветки комментариев и темы форума ──
        case 'getMessageThread': {
          const tid = q.message_id === 401 ? 8000 : 8100;
          const post = hist[-200].find(m => m.id === q.message_id);
          return reply({ '@type': 'messageThreadInfo', chat_id: -201, message_thread_id: tid, reply_info: post?.interaction_info?.reply_info, unread_message_count: 0, messages: [hist[-201].find(m => m.id === tid)] }, 120);
        }
        case 'getMessageThreadHistory': {
          const list = hist[-201].filter(m => m.topic_id?.message_thread_id === q.message_id && (!q.from_message_id || m.id < q.from_message_id)).reverse();
          return reply({ '@type': 'messages', total_count: list.length, messages: list }, 150);
        }
        case 'getForumTopics': return reply({ '@type': 'forumTopics', total_count: topics.length, topics: topics.map(tp => {
          const ms = hist[-300].filter(m => m.topic_id?.forum_topic_id === tp.info.forum_topic_id);
          return { ...tp, last_message: ms[ms.length - 1] };
        }) }, 150);
        case 'getForumTopicHistory': {
          const list = hist[-300].filter(m => m.topic_id?.forum_topic_id === q.forum_topic_id && (!q.from_message_id || m.id < q.from_message_id)).reverse();
          return reply({ '@type': 'messages', total_count: list.length, messages: list }, 150);
        }
        // ── папки ──
        case 'getChatFolder': return folders[q.chat_folder_id] ? reply({ '@type': 'chatFolder', ...folders[q.chat_folder_id] }) : err(400, 'CHAT_FOLDER_NOT_FOUND');
        case 'createChatFolder': { const id = Math.max(0, ...Object.keys(folders).map(Number)) + 1; folders[id] = q.folder; folderOrder.push(id); emitFolders(); return reply({ '@type': 'chatFolderInfo', id, name: q.folder.name }); }
        case 'editChatFolder': folders[q.chat_folder_id] = q.folder; emitFolders(); return reply({ '@type': 'chatFolderInfo', id: q.chat_folder_id, name: q.folder.name });
        case 'deleteChatFolder': delete folders[q.chat_folder_id]; folderOrder = folderOrder.filter(x => x !== q.chat_folder_id); emitFolders(); return ok();
        case 'reorderChatFolders': folderOrder = q.chat_folder_ids.slice(); emitFolders(); return ok();
        case 'getRecommendedChatFolders': return reply({ '@type': 'recommendedChatFolders', chat_folders: [
          { folder: { ...folderTpl('Новые'), include_contacts: true, include_non_contacts: true, include_groups: true, include_channels: true, include_bots: true, exclude_read: true }, description: 'Новые сообщения из всех чатов' },
          { folder: { ...folderTpl('Каналы'), include_channels: true }, description: 'Сообщения из каналов' },
        ] }, 200);
        // ── группы и каналы ──
        case 'getBasicGroupFullInfo': return reply({ '@type': 'basicGroupFullInfo', description: 'Планируем встречи по субботам', creator_user_id: ME,
          invite_link: { invite_link: 'https://t.me/+DemoInviteLink123' },
          members: [ME, 13, 14, 15].map(id => ({ member_id: { '@type': 'messageSenderUser', user_id: id }, status: id === ME ? { '@type': 'chatMemberStatusCreator' } : id === 13 ? { '@type': 'chatMemberStatusAdministrator', can_be_edited: true, rights: {} } : { '@type': 'chatMemberStatusMember' } })) }, 150);
        case 'getSupergroupFullInfo': return reply({ '@type': 'supergroupFullInfo', description: q.supergroup_id === 300 ? 'Клуб разработчиков: дизайн, релизы, баги' : 'Главное о технологиях за неделю', member_count: q.supergroup_id === 300 ? 312 : 48200, administrator_count: 3, can_get_members: true,
          invite_link: q.supergroup_id === 300 ? { invite_link: 'https://t.me/+ClubDemo42' } : null, linked_chat_id: q.supergroup_id === 200 ? -201 : 0 }, 150);
        case 'getSupergroupMembers': {
          const all = users.map((u, i) => ({ member_id: { '@type': 'messageSenderUser', user_id: u.id }, status: i === 1 ? { '@type': 'chatMemberStatusCreator' } : i < 3 ? { '@type': 'chatMemberStatusAdministrator', can_be_edited: i === 2, rights: {} } : { '@type': 'chatMemberStatusMember' } }));
          const f = q.filter?.['@type'];
          let list = f === 'supergroupMembersFilterAdministrators' ? all.filter(m => m.status['@type'] !== 'chatMemberStatusMember') : all;
          if (f === 'supergroupMembersFilterSearch') list = list.filter(m => { const u = users.find(x => x.id === m.member_id.user_id); return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q.filter.query.toLowerCase()); });
          return reply({ '@type': 'chatMembers', total_count: q.supergroup_id === 300 ? 312 : list.length, members: list }, 150);
        }
        case 'setChatPermissions': ok(); return emit({ '@type': 'updateChatPermissions', chat_id: q.chat_id, permissions: q.permissions });
        case 'setChatTitle': ok(); return emit({ '@type': 'updateChatTitle', chat_id: q.chat_id, title: q.title });
        case 'loadChats': return err(404, 'Not Found');
        case 'getChatHistory': {
          const list = (hist[q.chat_id] || []).filter(m => !q.from_message_id || m.id < q.from_message_id).slice(-q.limit).reverse();
          return reply({ '@type': 'messages', total_count: list.length, messages: list }, 150);
        }
        case 'sendMessageAlbum': return reply({ '@type': 'messages', messages: [] });
        case 'sendMessage': {
          const ic = q.input_message_content;
          if (ic['@type'] !== 'inputMessageText') {
            const wrap = ic.photo || ic.document || ic.video || ic.audio || ic.animation || ic.voice_note; const path = (wrap.photo || wrap.document || wrap.video || wrap.audio || wrap.animation || wrap.voice_note || wrap).path;
            const m = msg(q.chat_id, ++nextId, ME, '', Math.floor(Date.now() / 1000), { content: { '@type': 'messageDocument', document: { file_name: path.split('/').pop(), document: { id: nextId, size: 120000, local: { can_be_downloaded: true } } }, caption: ic.caption } });
            (hist[q.chat_id] ||= []).push(m);
            return reply(m, 20);
          }
          const m = msg(q.chat_id, ++nextId, ME, q.input_message_content.text.text, Math.floor(Date.now() / 1000),
            { sending_state: { '@type': 'messageSendingStatePending' }, topic_id: q.topic_id || undefined, reply_to: q.reply_to ? { '@type': 'messageReplyToMessage', chat_id: q.chat_id, message_id: q.reply_to.message_id } : undefined });
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
        case 'getUserFullInfo': return reply({ '@type': 'userFullInfo', bio: { '@type': 'formattedText', text: 'Дизайнер. Люблю кофе и горы ☕️', entities: [] },
          bot_info: q.user_id === 16 ? { description: 'Погода в вашем городе каждое утро. Нажмите «Начать».', commands: [{ command: 'start', description: 'Начать' }, { command: 'forecast', description: 'Прогноз на неделю' }, { command: 'city', description: 'Сменить город' }], menu_button: null } : null }, 150);
        case 'getCallbackQueryAnswer': return reply({ '@type': 'callbackQueryAnswer', text: 'Завтра +21°, солнечно', show_alert: false, url: '' }, 200);
        case 'createPrivateChat': {
          let c = chats.find(x => x.type.user_id === q.user_id);
          const u = users.find(x => x.id === q.user_id);
          if (!c && u) { c = { '@type': 'chat', id: u.id, title: `${u.first_name} ${u.last_name || ''}`.trim(), type: { '@type': 'chatTypePrivate', user_id: u.id }, positions: [], permissions: { can_send_basic_messages: true }, notification_settings: { use_default_mute_for: true }, accent_color_id: u.id % 7 }; chats.push(c); dispatch({ '@type': 'updateNewChat', chat: c }); }
          return c ? reply(c) : err(400, 'USER_NOT_FOUND');
        }
        case 'getChat': { const c = chats.find(x => x.id === q.chat_id); return c ? reply(c) : err(400, 'CHAT_NOT_FOUND'); }
        case 'searchPublicChats': return reply({ '@type': 'chats', total_count: 1, chat_ids: q.query ? [-900] : [] }, 200);
        case 'getPublicPostSearchLimits': return reply({ '@type': 'publicPostSearchLimits', daily_free_query_count: 0, remaining_free_query_count: 0, next_free_query_in: 3600, star_count: 10, is_current_query_free: false });
        case 'getMessage': { const m = (hist[q.chat_id] || []).find(x => x.id === q.message_id); return m ? reply(m) : err(404, 'Not Found'); }
        case 'searchChatMessages': {
          const all = (hist[q.chat_id] || []).slice().reverse();
          if (q.filter?.['@type'] === 'searchMessagesFilterAudio') { const w = (q.query || '').toLowerCase(); const r = all.filter(m => m.content['@type'] === 'messageAudio' && `${m.content.audio.performer} ${m.content.audio.title}`.toLowerCase().includes(w)); return reply({ '@type': 'foundChatMessages', messages: r, total_count: r.length }, 150); }
          if (q.filter?.['@type'] === 'searchMessagesFilterPinned') return reply({ '@type': 'foundChatMessages', messages: all.filter(m => m.is_pinned), total_count: all.filter(m => m.is_pinned).length }, 100);
          if (q.query) { const r = all.filter(m => (m.content.text?.text || '').toLowerCase().includes(q.query.toLowerCase())); return reply({ '@type': 'foundChatMessages', messages: r, total_count: r.length }, 100); }
          return reply({ '@type': 'foundChatMessages', messages: [], total_count: 0 }, 150);
        }
        case 'parseMarkdown': {
          let t = q.text.text; const entities = [];
          t = t.replace(/\*\*(.+?)\*\*/g, (m0, x, off) => { entities.push({ '@type': 'textEntity', offset: off, length: x.length, type: { '@type': 'textEntityTypeBold' } }); return x; });
          return reply({ '@type': 'formattedText', text: t, entities });
        }
        case 'getStory': return reply({ '@type': 'story', id: q.story_id, content: { '@type': 'storyContentPhoto', photo: { sizes: window.__mockFiles?.[601] ? [{ type: 'x', width: 1080, height: 1920, photo: { id: 601, size: 1, local: { can_be_downloaded: true } } }] : [], minithumbnail: null } }, caption: { text: 'Вид с горы 🏔', entities: [] } }, 200);
        case 'getActiveSessions': return reply({ '@type': 'sessions', sessions: [
          { id: '1', is_current: true, application_name: 'macgram', application_version: '0.3.0', device_model: 'Windows PC', platform: 'Windows', system_version: '11', country: 'Украина', last_active_date: now },
          { id: '2', application_name: 'Telegram iOS', application_version: '12.1', device_model: 'iPhone 16', platform: 'iOS', system_version: '26', country: 'Украина', ip_address: '93.x.x.x', last_active_date: now - 3600 }] }, 200);
        case 'searchMessages': {
          if (q.filter?.['@type'] !== 'searchMessagesFilterAudio') return reply({ '@type': 'foundMessages', total_count: 0, messages: [], next_offset: '' });
          const words = (q.query || '').toLowerCase().split(/\s+/).filter(Boolean);
          const all = Object.entries(hist).filter(([k]) => k !== '-900').map(([, v]) => v).flat().filter(m => m.content['@type'] === 'messageAudio')
            .filter(m => words.every(w => `${m.content.audio.performer} ${m.content.audio.title}`.toLowerCase().includes(w))).sort((a, b) => b.date - a.date);
          return reply({ '@type': 'foundMessages', total_count: all.length, messages: all.slice(0, q.limit), next_offset: '' }, 180);
        }
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
        // Демо-файлы (для показа и промо-роликов): window.__mockFiles = { id: 'путь' }.
        case 'downloadFile': {
          const p = window.__mockFiles?.[q.file_id];
          if (p) return reply({ '@type': 'file', id: q.file_id, size: 1, expected_size: 1, local: { path: p, is_downloading_completed: true, can_be_downloaded: true, downloaded_size: 1 }, remote: { is_uploading_completed: true } }, 60);
          return err(404, 'Not Found');
        }
        default: return ok();
      }
    },
  };
  setTimeout(() => setAuth(auth), 50);
  return api;
}
