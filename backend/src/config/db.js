const mongoose = require('mongoose');

const connectDb = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hiro';
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

module.exports = { connectDb };

