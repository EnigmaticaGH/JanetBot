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
      updateChannel(guild.id, channel, msg);
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
    await getHolidays();
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

getHolidays = async function(timesRetried = 0) {
  console.log('Fetching holidays');
  let channels = [];
  for(let [id, guild] of bot.guilds) {
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
    channel.send('Unable to retrieve holidays after 5 tries :(');
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
      let cellHTML = theCellWeCareAbout.innerHTML;
      let cellText = cellHTML.replace(/<br>|<a.+">|<\/a>/ig, '');
      if (cellText == 'Holiday name') { // We don't care about the header
        continue;
      }
      holidayEmbed.fields.push({
        name: '\u200b',
        value: cellText
      });
    }
    holidayEmbed.fields.push({
      name: '\u200b',
			value: '\u200b'
    });
    for(let c of channels) {
      bot.channels.get(c).send({embed: holidayEmbed});
    }
  })
  .catch(err =>  async function() {
    console.error(err.code);
    // Retry
    await getHolidays(timesRetried++)
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
  const affectedRows = await ServerConfig.update({ channel: channel }, { where: { guild: guild } });
  if (affectedRows > 0) {
    return msg.channel.send(`Channel <#${channel}> set.`);
  }
  console.log(affectedRows);
  return msg.channel.send('Something went wrong with setting the channel.');
}

updatePrefix = async function(guild, prefix, msg) {
  const affectedRows = await ServerConfig.update({ prefix: prefix }, { where: { guild: guild } });
  if (affectedRows > 0) {
    return msg.channel.send(`Prefix changed to: ${prefix}`);
  }
  console.log(affectedRows);
  return msg.channel.send('Something went wrong with changing the prefix.');
}