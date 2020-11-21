require('dotenv').config();
const Discord = require('discord.js');
const Sequelize = require('sequelize');
const bot = new Discord.Client();
const TOKEN = process.env.TOKEN;
const fetch = require('node-fetch');
const schedule = require('node-schedule');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
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
  prefix: Sequelize.STRING
});
let prefix = '.';

bot.login(TOKEN);

bot.once('ready', () => {
  console.info(`Logged in as ${bot.user.tag}!`);
  ServerConfig.sync();
});

bot.on('guildCreate', async guild => {
  await addGuild(guild.id);
});

bot.on('message', async msg => {
  if (!canPostInChannel(msg.guild, msg.channel.id)) {
    console.info(`No permission to respond in ${msg.channel.name} on ${msg.guild.name}`);
  }
  if (msg.content.toLowerCase().indexOf('janet') == 0) {
    msg.channel.send('https://tenor.com/view/smile-laugh-hype-excited-darcy-carden-gif-17311998');
  }
  let member = msg.member;
  let permissions = member.permissions;
  if (!permissions.has('MANAGE_CHANNELS')) {
    return;
  }
  let config = await ServerConfig.findOne({ where: { guild: msg.guild.id } });
  if (config && config.prefix) {
    prefix = config.prefix;
  }
  if (msg.content.indexOf(`${prefix}setchannel`) == 0) {
    let guild = msg.guild;
    let channel = msg.content.split(' ')[1].replace(/\D/g, '');
    let channels = guild.channels.map(ch => ch.id);
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
  if (msg.content.indexOf(`${prefix}setprefix`) == 0) {
    let guild = msg.guild;
    let prefix = msg.content.split(' ')[1];
    updatePrefix(guild.id, prefix, msg);
  }
  if (msg.content == `${prefix}getholidays`) {
    await getHolidays(0, msg);
  }
  if (msg.content == `${prefix}help`) {
    msg.channel.send({embed: {
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
    }});
  }
});

schedule.scheduleJob('0 10 * * *', async function() {
  console.log('Job started');
  await getHolidays();
});

getHolidays = async function(timesRetried = 0, msg) {
  console.log('Fetching holidays');
  let channels = [];
  for(let [id, guild] of bot.guilds) {
    if (msg && msg.guild.id != id) {
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
      bot.channels.get(c).send('Unable to retrieve holidays after 5 tries :(');
    }
    return;
  }
  fetch(holidayResource)
  .then(res => res.text())
  .then(body => {
    console.log('Success');
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
      bot.channels.get(c).send({embed: holidayEmbed});
    }
  })
  .catch(err =>  async function() {
    console.error(err.code);
    // Retry
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

canPostInChannel = function(guild, channelID) {
  let botID = bot.user.id;
  let botMember = guild.members.get(botID);
  let botRoles = botMember.roles;
  let canPost = true;
  for(let [id, override] of guild.channels.get(channelID).permissionOverwrites) {
    let denied = override.denied;
    let allowed = override.allowed;
    for(let [roleID, role] of botRoles) {
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
  let cellHTML = cell.innerHTML;
  let cellText = cellHTML.replace(/<br>|<a.+">|<\/a>/ig, '');
  return cellText.trim();
}