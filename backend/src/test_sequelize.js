const { sequelize, Tag, Article } = require('./models');

async function test() {
  try {
    console.log('🔄 Testing connection...');
    await sequelize.authenticate();
    console.log('✅ Connection has been established successfully.');

    console.log('🔄 Checking Tag table...');
    const tagCount = await Tag.count();
    console.log(`📊 Tags count: ${tagCount}`);

    console.log('🔄 Checking Article table...');
    const articleCount = await Article.count();
    console.log(`📊 Articles count: ${articleCount}`);

    console.log('✨ All checks passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await sequelize.close();
  }
}

test();
