const { connectDb } = require('../src/config/db');
const tagEmbeddingService = require('../src/services/tagEmbeddingService');

const main = async () => {
  try {
    await connectDb();
    console.log('Database connected, rebuilding tag embeddings...');
    await tagEmbeddingService.rebuildAllEmbeddings();
    console.log('Tag embeddings rebuilt successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to rebuild tag embeddings', err?.message || err);
    process.exit(1);
  }
};

main();

