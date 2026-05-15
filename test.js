import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemModule from './src/models/SystemModule.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const mods = await SystemModule.find().lean();
  console.log(mods.length, mods[0]);
  process.exit(0);
});
