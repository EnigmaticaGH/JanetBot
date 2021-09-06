require('dotenv').config();
const fs = require('fs');
const { Client, Intents, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const Sequelize = require('sequelize');
const intents = new Intents([
  Intents.FLAGS.GUILD_MEMBERS,
  Intents.FLAGS.GUILD_MESSAGES, 
  Intents.FLAGS.GUILDS
]);
const bot = new Client({ intents: intents });
const TOKEN = process.env.TOKEN;
const fetch = require('node-fetch');
const schedule = require('node-schedule');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const striptags = require('striptags');
const holidayResource = 'http://www.holidayscalendar.com/';
const holidayEmbed = {
  color: 0x0099ff,
  title: "Today's Holidays",
  description: 'Includes all national and international holidays',
  fields: [],
  timestamp: new Date(),
};
const sequelize = new Sequelize('database', 'user', 'password', {
  host: 'localhost',
  dialect: 'sqlite',
  logging: false,
  // SQLite only
  storage: 'database.sqlite',
});
const ServerConfig = sequelize.define('serverconfig', {
  guild: {
    type: Sequelize.STRING,
    unique: true,
  },
  channel: Sequelize.STRING,
  prefix: Sequelize.STRING,
  birthdayChannel: Sequelize.STRING
});
//birthday module: data
const Birthdays = sequelize.define('birthdays', {
  discordUserID: {
    type: Sequelize.STRING,
    unique: true,
  },
  userBirthday: Sequelize.DATE,
  doMention: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
});
let prefix = '.';

bot.commands = new Collection();
const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	commands.push(command.data.toJSON());
	bot.commands.set(command.data.name, command);
}

const rest = new REST({ version: '9' }).setToken(TOKEN);

bot.login(TOKEN);

bot.once('ready', () => {
  console.info(`Logged in as ${bot.user.tag}!`);
  ServerConfig.sync({ alter: true });
  Birthdays.sync({ alter: true });
  for(let [guildId, guild] of bot.guilds.cache) {
    registerCommands(guild);
  }
});

// Bot was invited to new discord server, to add it to the database
bot.on('guildCreate', async guild => {
  registerCommands(guild);
  await addGuild(guild.id);
});

bot.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = bot.commands.get(interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

bot.on('messageCreate', async msg => {
  let config = await ServerConfig.findOne({ where: { guild: msg.guild.id } });
  let member = msg.member;
  if (config && config.prefix) {
    prefix = config.prefix;
  }

  // Check to see if the bot can reply to the message in the channel
  if (!canPostInChannel(msg.guild, msg.channel.id)) {
    console.info(`No permission to respond in ${msg.channel.name} on ${msg.guild.name}`);
    return;
  }

  // Fun GIF reply :)
  if (msg.content.toLowerCase().indexOf('janet') == 0) {
    msg.channel.send('https://tenor.com/view/smile-laugh-hype-excited-darcy-carden-gif-17311998');
  }

  // Birthday command
  if (msg.content.indexOf(`${prefix}setbirthday`) == 0) {
    let userID = member.id;
    let params = msg.content.split(' ');
    let bdate = params[1];
    let mentionOpt;
    let userBDate = new Date(bdate);

    //validate date
    if (userBDate == 'Invalid Date') {
      msg.channel.send(`Invalid date. Check the format (MM/DD/YYYY)!`)
    } else {
      mentionOpt = params[2] == 'mention';
      
      await addBirthday(userID, userBDate, mentionOpt);
      msg.channel.send(`Birthday added!`)
    }
  }

  // For bot administrative commands, check permission of sender to make sure they can use the commands
  if (!member) {
    console.log(`Message in guild ${msg.guild.name} has no member attached.`);
    return;
  }
  // Server mods/admins will usually have the Manage Channel permission. No other reason I specifically picked this one ;)
  let permissions = member.permissions;
  if (!permissions.has('MANAGE_CHANNELS')) {
    return;
  }
  
  if (msg.content.indexOf(`${prefix}setchannel`) == 0) {
    let guild = msg.guild;
    let channel = msg.content.split(' ')[1].replace(/\D/g, '');
    let channels = guild.channels.cache.map(ch => ch.id);
    if (channels.includes(channel)) {
      if (canPostInChannel(guild, channel)) {
        updateChannel(guild.id, channel, msg);
      } else {
        msg.channel.send("I can't post in that channel!");
      }
    } else {
      msg.channel.send('Invalid channel!');
    }
  }

  // Birthday mod - TODO: move to its own command later
  if (msg.content.indexOf(`${prefix}setupbirthdaychannel`) == 0) {
    let guild = msg.guild;
    let channel = msg.content.split(' ')[1].replace(/\D/g, '');
    let channels = guild.channels.cache.map(ch => ch.id);
    if (channels.includes(channel)) {
      if (canPostInChannel(guild, channel)) {
        updateBirthdayChannel(guild.id, channel, msg);
      } else {
        msg.channel.send("I can't post in that channel!");
      }
    } else {
      msg.channel.send('Invalid channel!');
    }
  }

  if (msg.content.indexOf(`${prefix}setprefix`) == 0) {
    let guild = msg.guild;
    let prefix = msg.content.split(' ')[1];
    updatePrefix(guild.id, prefix, msg);
  }
  // 'Hidden' commands, mostly for testing
  if (msg.content == `${prefix}getholidays`) {
    await getHolidays(0, msg);
  }
  if (msg.content == `${prefix}getbirthdays`) {
    let birthdays = await getBirthdays();
    let responseEmbed = {
      color: 0x0099ff,
      title: "Birthdays",
      description: 'List of birthdays',
      fields: []
    };

    for (let bday of birthdays) {
      let member = await msg.guild.members.fetch(bday.discordUserID);
      let memberbday = new Date(bday.userBirthday).toLocaleDateString('en-US');
      responseEmbed.fields.push({
        name: member.displayName,
        value: memberbday
      });
    }

    msg.channel.send({embeds: [responseEmbed]});
  }

  if (msg.content == `${prefix}help`) {
    msg.channel.send({embeds: [{
      color: 0x0099ff,
      title: "Bot Help",
      description: 'Commands',
      fields: [{
        name: `${prefix}help`,
        value: 'Lists commands'
      },{
        name: `${prefix}setchannel <channel>`,
        value: 'Sets the desired holiday channel'
      },{
        name: `${prefix}setprefix <prefix>`,
        value: 'Sets the desired bot prefix for commands'
      }]
    }]});
  }
});

schedule.scheduleJob('0 10 * * *', async function() {
  console.log('Job started');
  await getHolidays();
  await checkBirthdays(); 
});

// Fetch holidays from website, attempt 5 times before giving up
// If second parameter msg is populated, it's a test command and should not message all available servers in database
getHolidays = async function(timesRetried = 0, msg) {
  console.log('Fetching holidays');
  let channels = [];
  for(let [id, guild] of bot.guilds) {
    if (msg && msg.guild.id != id) {
      // If msg parameter is specified, only include the server the message came from
      continue;
    }
    config = await ServerConfig.findOne({ where: { guild: id } });
    if (config && config.channel) {
      channel = config.channel;
      console.log(`Channel <#${channel}> found for ${guild.name}`);
      channels.push(channel);
    } else {
      console.log(`No channel set for ${guild.name}`);
    }
  }
  if (timesRetried >= 5) {
    console.error('Failed after 5 retries. Aborting...');
    for(let c of channels) {
      bot.channels.fetch(c).then(ch => {
        ch.send('Unable to retrieve holidays after 5 tries :(');
      });
    }
    return;
  }
  fetch(holidayResource)
  .then(res => res.text())
  .then(body => {
    console.log('Success');
    holidayEmbed.timestamp = new Date();
    holidayEmbed.fields = [];
    const dom = new JSDOM(body);
    const table = dom.window.document.getElementsByClassName('wphc_table')[0];
    const rows = table.rows;
    for(let row of rows) {
      let cells = row.cells;
      let theCellWeCareAbout = cells[0];
      let theOtherCellWeKindaCareAbout = cells[1];
      let holidayName = getCellText(theCellWeCareAbout);
      let location = getCellText(theOtherCellWeKindaCareAbout);
      if (holidayName == 'Holiday name') { // We don't care about the header
        continue;
      }
      holidayEmbed.fields.push({
        name: holidayName,
        value: location
      });
    }
    for(let c of channels) {
      bot.channels.fetch(c).then(ch => {
        ch.send({embeds: [holidayEmbed]});
      })
    }
  })
  .catch(err =>  async function() {
    console.error(err.code);
    await getHolidays(timesRetried++, msg)
  });
}

addGuild = async function(guild) {
  try {
    await ServerConfig.create({
      guild: guild
    });
    console.log('New guild added to database');
    return;
  }
  catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      // Guild already exists in config, so do nothing
      console.log('Guild already exists in database');
      return;
    }
    console.log(e);
  }
}

updateChannel = async function(guild, channel, msg) {
  try {
    const affectedRows = await ServerConfig.update({ channel: channel }, { where: { guild: guild } });
    if (affectedRows > 0) {
      if (!canPostInChannel(msg.guild, msg.channel.id)) {
        console.info(`No permission to respond in ${msg.channel.name} on ${msg.guild.name}`);
        return;
      } else {
        return msg.channel.send(`Channel <#${channel}> set.`);
      }
    } else {
      await addGuild(guild);
      await updateChannel(guild, channel, msg);
    }
  }
  catch (e) {
    console.log(e.name);
  }
}

updateBirthdayChannel = async function(guild, channel, msg) {
  try {
    const affectedRows = await ServerConfig.update({ birthdayChannel: channel }, { where: { guild: guild } });
    if (affectedRows > 0) {
      if (!canPostInChannel(msg.guild, msg.channel.id)) {
        console.info(`No permission to respond in ${msg.channel.name} on ${msg.guild.name}`);
        return;
      } else {
        return msg.channel.send(`Channel <#${channel}> set.`);
      }
    } else {
      await addGuild(guild);
      await updateBirthdayChannel(guild, channel, msg);
    }
  }
  catch (e) {
    console.log(e.name);
  }
}

updatePrefix = async function(guild, prefix, msg) {
  try {
    const affectedRows = await ServerConfig.update({ prefix: prefix }, { where: { guild: guild } });
    if (affectedRows > 0) {
      if (!canPostInChannel(msg.guild, msg.channel.id)) {
        console.info(`No permission to respond in ${msg.channel.name} on ${msg.guild.name}`);
        return;
      } else {
        return msg.channel.send(`Prefix changed to: ${prefix}`);
      }
    } else {
      await addGuild(guild);
      await updatePrefix(guild, prefix, msg);
    }
  }
  catch (e) {
    console.log(e.name);
  }
}

canPostInChannel = async function(guild, channelID) {
  let botID = bot.user.id;
  let botMember = await guild.members.fetch(botID);
  let botRoles = botMember.roles;
  let canPost = true;
  let ch = await guild.channels.fetch(channelID);
  for(let [id, override] of ch.permissionOverwrites.cache) {
    let denied = override.deny;
    let allowed = override.allow;
    for(let [roleID, role] of botRoles.cache) {
      if (id == roleID) {
        if (denied.any(['VIEW_CHANNEL', 'SEND_MESSAGES'])) {
          canPost = false;
        }
        if (allowed.any(['VIEW_CHANNEL', 'SEND_MESSAGES'])) {
          canPost = true;
        }
      }
    }
    if (id == botID) {
      if (denied.any(['VIEW_CHANNEL', 'SEND_MESSAGES'])) {
        canPost = false;
      }
      if (allowed.any(['VIEW_CHANNEL', 'SEND_MESSAGES'])) {
        canPost = true;
      }
    }
  }
  return canPost;
}

getCellText = function(cell) {
  let cellText = striptags(cell.innerHTML);
  return cellText.trim();
}

// Birthday module
addBirthday = async function(userID, birthday, doMention) {
  try {
    await Birthdays.create({
      discordUserID: userID,
      userBirthday: birthday,
      doMention: doMention
    });
    console.log('New birthday added to database');
    return;
  }
  catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      // Birthday already exists in the database, update it
      console.log('Birthday already exists in database. Updating values...');
      try {
        await Birthdays.update({
          userBirthday: birthday,
          doMention: doMention
        },{
          where: {
            discordUserID: userID
          }
        });
      } catch (err) {
        console.log(err);
      }
      return;
    }
    console.log(e);
  }
}

registerCommands = async function(guild) {
	try {
    let botId = bot.user.id;
    let guildId = guild.id;
		console.log(`Started refreshing application (/) commands for guild ${guild.name}.`);

		await rest.put(
			Routes.applicationGuildCommands(botId, guildId),
			{ body: commands },
		);

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
};

getBirthdays = async function() {
  let bdays;
  try {
    bdays = await Birthdays.findAll({raw: true});
    checkBirthdays();
  } catch (err) {
    console.log(err);
  }
  return bdays;
}

checkBirthdays = async function() {
  console.log('Checking birthdays!\n--\nGetting birthdays');
  let bdquery = "SELECT discordUserID AS userid, strftime('%m%d', userBirthday) AS bdate, doMention FROM birthdays WHERE bdate = strftime('%m%d', 'now');";
  const [results, metadata] = await sequelize.query(bdquery);
  console.log('result: ', results);
  console.log('metadata: ', metadata);

  if(results.length > 0) {
    let channels = [];
    console.log('--\nGetting channels');
    for(let [id, guild] of bot.guilds.cache) {
      config = await ServerConfig.findOne({ where: { guild: id } });
      if (config && config.birthdayChannel) {
        channel = config.birthdayChannel;
        console.log(`Channel <#${channel}> found for ${guild.name}`);
        channels.push(channel);
      } else {
        console.log(`No channel set for ${guild.name}`);
      }
    }
    
    console.log(`--\nTrying to post birthdays on channels\nChannel size: ${channels.length}\n--`);
    for(let ch of channels) {
      let botChannel = await bot.channels.fetch(ch);
      let guild = botChannel.guild;
      for(let bd of results) {
        try {
          let member = await guild.members.fetch(bd.userid);
          let displayName = member.displayName;
          //mention option
          if(bd.doMention)
            displayName = `<@${bd.userid}>`;
          //random emoji
          let emojiRoulette = ['🥳', '🎁', '🎂', '🎉', '🎊'];
          let bdayEmoji = emojiRoulette[Math.floor(Math.random() * emojiRoulette.length)];
  
          //post message
          bot.channels.fetch(ch).then(ch => {
            ch.send(`Happy Birthday ${displayName}! ${bdayEmoji}`);
          })
        } catch (err) {
          console.log(err);
          console.log('Member probs not found, do nothing (for now)...\n--');
        }
      }
    }
  } else {
    console.log('No birthdays today!\n--');
  }
  console.log('Finished!\n--')
}