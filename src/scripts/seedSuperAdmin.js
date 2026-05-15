import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { SuperAdminService } from '../superadmin/services/superAdminService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const seedFilePath = path.resolve(__dirname, 'data/superadmin.seed.json');

const readSeedData = async () => {
  const raw = await fs.readFile(seedFilePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Super admin seed file must contain a JSON object.');
  }

  return parsed;
};

const seedSuperAdmin = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in environment.');
  }

  const seedData = await readSeedData();

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const result = await SuperAdminService.bootstrapSuperAdmin(seedData);

  console.log('Super admin seed completed');
  console.log(`User: ${result.user.email}`);
  console.log(`Company: ${result.company.name}`);

  console.log(`Company: ${result.company.name}`);
  console.log(`Role: ${result.user.role}`);
};

seedSuperAdmin()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Super admin seed failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // ignore disconnect failures
    }
    process.exit(1);
  });
