import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SystemModule from '../models/SystemModule.js';
import { MODULE_DEFINITIONS, MODULE_KEYS } from '../config/modules.js';
import { CompanyModuleService } from '../services/CompanyModuleService.js';

// 1. Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Explicitly tell dotenv where the .env file is (root directory)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const seedModules = async () => {
  try {
    // 3. Add a quick sanity check to prevent undefined errors
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing in environment. Check your .env file path.');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const syncKeys = new Set(MODULE_KEYS);

    await CompanyModuleService.syncSystemModules();

    for (const mod of MODULE_DEFINITIONS) {
      await SystemModule.findOneAndUpdate(
        { key: mod.key },
        {
          key: mod.key,
          label: mod.label,
          description: mod.description,
          defaultEnabled: mod.defaultEnabled,
          group: mod.group || 'General'
        },
        { upsert: true, new: true }
      );
    }

    const removed = await SystemModule.deleteMany({ key: { $nin: MODULE_KEYS } });

    const syncResult = await CompanyModuleService.syncAllCompanies();
    
    console.log(`Modules seeded successfully. Removed ${removed.deletedCount || 0} stale modules.`);
    console.log(`Company sync completed for ${syncResult.syncedCompanies} companies.`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding modules:', error);
    process.exit(1);
  }
};

seedModules();