const { SlashCommandBuilder } = require('@discordjs/builders');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-birthday-channel')
    .addChannelOption(option => option.setName('channel').setDescription('Channel where to post birthdays').setRequired(true))
    .setDescription('Sets the birthday channel :)'),
  async execute(interaction) {
    console.log(interaction.options.get('channel'));
    let guild = interaction.guild;
    let channel = interaction.options.get('channel');
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
    await interaction.reply(`Pong!`);
  },
};