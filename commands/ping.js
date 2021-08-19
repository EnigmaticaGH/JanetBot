const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .addStringOption(option => option.setName('option1').setDescription('Test Option Please Ignore'))
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    console.log(interaction.options.get('option1'));
    await interaction.reply(`Pong!`);
  },
};