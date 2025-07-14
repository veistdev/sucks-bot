const { Telegraf, Markup } = require('telegraf');
const mysql = require('mysql2');
const path = require('path');

const bot = new Telegraf('BOT_TOKEN');
const ADMINS = [];

const db = mysql.createPool({
  host: 'host',
  user: 'name',
  password: 'password',
  database: 'suck_bot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.query(`
  CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    username VARCHAR(64),
    balance INT DEFAULT 0,
    throat_level INT DEFAULT 1,
    big_clients_unlocked BOOLEAN DEFAULT FALSE,
    sucks_count INT DEFAULT 0,
    last_suck_time BIGINT DEFAULT 0,
    dildo_level INT DEFAULT 0,
    dildo_last_income BIGINT DEFAULT 0
  )
`);

function registerUser(user_id, username) {
  db.query(
    'INSERT IGNORE INTO users (user_id, username) VALUES (?, ?)',
    [user_id, username || 'unknown']
  );
}

bot.start((ctx) => {
  registerUser(ctx.from.id, ctx.from.username);
  ctx.reply(
    "👋 Привет! Я бот для прокачки минет-скиллов!\n\n" +
    "💦 Ты можешь сосать каждые 20 минут (или 15, если купишь улучшение).\n" +
    "📏 Клиенты приходят с разными размерами, и чем глубже ты сможешь взять, тем больше монет получишь!\n\n" +
    "🔹 /suck - Сделать минет\n" +
    "🔹 /shop - Магазин улучшений\n" +
    "🔹 /top - Топ игроков\n"
  );
});

bot.command('suck', (ctx) => {
  const user_id = ctx.from.id;
  registerUser(user_id, ctx.from.username);

  db.query('SELECT last_suck_time, big_clients_unlocked FROM users WHERE user_id = ?', [user_id], (err, results) => {
    if (!results || !results[0]) return;
    const last_suck_time = results[0].last_suck_time || 0;
    const big_clients_unlocked = !!results[0].big_clients_unlocked;

    const isAdmin = ADMINS.includes(user_id);
    const cooldown = isAdmin ? 0 : (big_clients_unlocked ? 5 * 60 : 10 * 60);

    const now = Math.floor(Date.now() / 1000);
    if (!isAdmin && now - last_suck_time < cooldown) {
      const remaining = cooldown - (now - last_suck_time);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      ctx.reply(`⏳ Ты устал! Отдохни ещё ${minutes} минут ${seconds} секунд.`);
      return;
    }

    const client_size = Math.floor(Math.random() * 26) + 5; 
    db.query('SELECT throat_level FROM users WHERE user_id = ?', [user_id], (err, results2) => {
      const throat_level = results2[0]?.throat_level || 1;
      const max_depth = throat_level * 5;
      let depth, reward, result_msg;

      reward = Math.floor(Math.random() * 16) + 5; 

      if (max_depth >= client_size) {
        depth = client_size;
        result_msg = `✅ Ты смог взять ВЕСЬ ${client_size} см! +${reward} монет.`;
      } else {
        depth = max_depth;
        result_msg = `😮 Ты смог взять только ${depth} см из ${client_size} см... +${reward} монет.`;
      }

      db.query(
        `UPDATE users SET balance = balance + ?, sucks_count = sucks_count + 1, last_suck_time = ? WHERE user_id = ?`,
        [reward, now, user_id],
        () => {
          db.query('SELECT sucks_count, balance FROM users WHERE user_id = ?', [user_id], (err, results3) => {
            ctx.reply(
              `🍆 Размер у клиента: ${client_size} см\n` +
              `${result_msg}\n` +
              `💦 Всего минетов: ${results3[0].sucks_count}\n` +
              `💰 Баланс: ${results3[0].balance} монет`
            );
          });
        }
      );
    });
  });
});

bot.command('givemoney', (ctx) => {
  const admin_id = ctx.from.id;
  if (!ADMINS.includes(admin_id)) {
    ctx.reply('⛔ Нет доступа.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply('Используй: /givemoney <user_id> <amount>');
    return;
  }

  const target_id = parseInt(args[0]);
  const amount = parseInt(args[1]);
  if (isNaN(target_id) || isNaN(amount) || amount <= 0) {
    ctx.reply('Некорректные параметры.');
    return;
  }

  db.query('UPDATE users SET balance = balance + ? WHERE user_id = ?', [amount, target_id], function (err, results) {
    if (err) {
      ctx.reply('Ошибка при выдаче монет.');
      return;
    }
    if (results.affectedRows === 0) {
      ctx.reply('Пользователь не найден.');
    } else {
      ctx.reply(`✅ Выдано ${amount} монет пользователю с id ${target_id}.`);
    }
  });
});

bot.command('shop', (ctx) => {
  const user_id = ctx.from.id;
  registerUser(user_id, ctx.from.username);

  db.query('SELECT balance, throat_level, big_clients_unlocked, dildo_level FROM users WHERE user_id = ?', [user_id], (err, results) => {
    if (!results || !results[0]) return;
    const { balance, throat_level, big_clients_unlocked, dildo_level } = results[0];
    const next_throat_cost = throat_level * 50;
    const dildo_cost = 300 + dildo_level * 200; // цена увеличивается с уровнем

    const buttons = [
      [
        Markup.button.callback(
          `🔼 Улучшить глотку (Ур. ${throat_level}→${throat_level + 1}) - ${next_throat_cost} монет`,
          `upgrade_throat_${next_throat_cost}_${user_id}`
        )
      ]
    ];

    if (!big_clients_unlocked) {
      buttons.push([
        Markup.button.callback(
          "🔽 Клиенты с большими... 200 монет",
          `buy_big_clients_200_${user_id}`
        )
      ]);
    } else {
      buttons.push([
        Markup.button.callback(
          "✅ Большие клиенты уже разблокированы",
          `already_bought_${user_id}`
        )
      ]);
    }

    buttons.push([
      Markup.button.callback(
        dildo_level > 0
          ? `🍆 Резиновый член (ур. ${dildo_level}) — приносит ${dildo_level * 10} монет/час (улучшить за ${dildo_cost} монет)`
          : `🍆 Купить резиновый член — 300 монет`,
        `buy_dildo_${dildo_cost}_${user_id}`
      )
    ]);

    ctx.reply(
      `🛒 Магазин улучшений\n💰 Твой баланс: ${balance} монет`,
      Markup.inlineKeyboard(buttons)
    );
  });
});

bot.on('callback_query', (ctx) => {
  const user_id = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const chat_id = ctx.chat ? ctx.chat.id : (ctx.update.callback_query.message.chat.id);

  const parts = data.split('_');
  const owner_id = parseInt(parts[parts.length - 1]);
  if (user_id !== owner_id) {
    ctx.answerCbQuery();
    ctx.reply('Только тот, кто вызвал магазин, может использовать эти кнопки.');
    return;
  }

  ctx.answerCbQuery();

if (data.startsWith("upgrade_throat_")) {
  const cost = parseInt(parts[2]);
  db.query('SELECT balance FROM users WHERE user_id = ?', [user_id], (err, results) => {
    if (results[0].balance >= cost) {
      db.query('UPDATE users SET balance = balance - ?, throat_level = throat_level + 1 WHERE user_id = ?', [cost, user_id], () => {
        ctx.editMessageReplyMarkup();
        ctx.reply('✅ Глотка улучшена! Теперь ты можешь брать глубже.');
      });
    } else {
      ctx.reply("❌ Недостаточно монет!");
    }
  });
} else if (data.startsWith("buy_big_clients_")) {
  const cost = parseInt(parts[3]);
  db.query('SELECT balance, big_clients_unlocked FROM users WHERE user_id = ?', [user_id], (err, results) => {
    if (results[0].big_clients_unlocked) {
      ctx.reply("❌ У тебя уже есть это улучшение!");
      return;
    }
    if (results[0].balance >= cost) {
      db.query('UPDATE users SET balance = balance - ?, big_clients_unlocked = 1 WHERE user_id = ?', [cost, user_id], () => {
        ctx.editMessageReplyMarkup();
        ctx.reply('✅ Теперь у тебя большие клиенты! КД уменьшено до 15 минут.');
      });
    } else {
      ctx.reply("❌ Недостаточно монет!");
    }
  });
} else if (data.startsWith("already_bought_")) {
  ctx.reply("❌ У тебя уже есть это улучшение!");
} else if (data.startsWith("buy_dildo_")) {
  const cost = parseInt(parts[2]);
  db.query('SELECT balance, dildo_level FROM users WHERE user_id = ?', [user_id], (err, results) => {
    if (!results || !results[0]) return;
    const { balance, dildo_level } = results[0];
    if (balance >= cost) {
      db.query(
        'UPDATE users SET balance = balance - ?, dildo_level = dildo_level + 1, dildo_last_income = ? WHERE user_id = ?',
        [cost, Math.floor(Date.now() / 1000), user_id],
        () => {
          ctx.editMessageReplyMarkup();
          ctx.reply(`✅ Резиновый член куплен/улучшен! Теперь он приносит ${((dildo_level + 1) * 10)} монет каждый час.`);
        }
      );
    } else {
      ctx.reply("❌ Недостаточно монет!");
    }
  });
}
});

bot.command('profile', (ctx) => {
  const user_id = ctx.from.id;
  registerUser(user_id, ctx.from.username);

  db.query(
    'SELECT username, balance, throat_level, big_clients_unlocked, sucks_count, dildo_level FROM users WHERE user_id = ?',
    [user_id],
    (err, results) => {
      if (!results || !results[0]) {
        ctx.reply('Профиль не найден.');
        return;
      }
      const {
        username,
        balance,
        throat_level,
        big_clients_unlocked,
        sucks_count,
        dildo_level
      } = results[0];

      ctx.reply(
        `👤 Профиль @${username || 'unknown'}\n` +
        `\n💰 Баланс: ${balance} монет` +
        `\n💦 Минетов сделано: ${sucks_count}` +
        `\n👅 Глубина глотки: ${throat_level * 5} см (ур. ${throat_level})` +
        `\n🍆 Резиновый член: ${dildo_level > 0 ? `ур. ${dildo_level} (+${dildo_level * 10} монет/час)` : 'нет'}` +
        `\n📏 Клиенты с большими членами: ${big_clients_unlocked ? 'разблокированы' : 'нет'}`
      );
    }
  );
});

bot.command('top', (ctx) => {
  db.query('SELECT username, sucks_count FROM users ORDER BY sucks_count DESC LIMIT 10', (err, top_sucks) => {
    db.query('SELECT username, balance FROM users ORDER BY balance DESC LIMIT 10', (err, top_balance) => {
      db.query('SELECT username, throat_level FROM users ORDER BY throat_level DESC LIMIT 10', (err, top_throat) => {
        let top_msg = "🏆 **Топ игроков** 🏆\n\n";

        top_msg += "🔝 **По количеству минетов:**\n";
        top_sucks.forEach((u, i) => {
          top_msg += `${i + 1}. @${u.username} — ${u.sucks_count} раз\n`;
        });

        top_msg += "\n💰 **По балансу монет:**\n";
        top_balance.forEach((u, i) => {
          top_msg += `${i + 1}. @${u.username} — ${u.balance} монет\n`;
        });

        top_msg += "\n👅 **По глубине глотки:**\n";
        top_throat.forEach((u, i) => {
          top_msg += `${i + 1}. @${u.username} — ${u.throat_level * 5} см\n`;
        });

        ctx.reply(top_msg, { parse_mode: "Markdown" });
      });
    });
  });
});

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  db.query('SELECT user_id, dildo_level, dildo_last_income FROM users WHERE dildo_level > 0', (err, users) => {
    if (!users) return;
    users.forEach(user => {
      const { user_id, dildo_level, dildo_last_income } = user;
      if (dildo_level > 0 && now - dildo_last_income >= 3600) { // 1 час
        const hours = Math.floor((now - dildo_last_income) / 3600);
        const income = dildo_level * 10 * hours;
        db.query(
          'UPDATE users SET balance = balance + ?, dildo_last_income = ? WHERE user_id = ?',
          [income, dildo_last_income + hours * 3600, user_id]
        );
      }
    });
  });
}, 60 * 1000); 

console.log('Бот запущен');
bot.launch();

process.on('unhandledRejection', (reason, promise) => {
  if (
    reason &&
    reason.response &&
    reason.response.error_code === 400 &&
    typeof reason.response.description === 'string' &&
    reason.response.description.includes('query is too old')
  ) {
    return;
  }
  console.error('Unhandled Rejection:', reason);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));