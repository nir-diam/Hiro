const { connectDb } = require('../src/config/db');
const jobFieldEmbeddingService = require('../src/services/jobFieldEmbeddingService');

const main = async () => {
  try {
    await connectDb();
    console.log('Database connected, rebuilding job field embeddings...');
    await jobFieldEmbeddingService.rebuildAllEmbeddings();
    console.log('Job field embeddings rebuilt successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to rebuild job field embeddings', err?.message || err);
    process.exit(1);
  }
};

main();

