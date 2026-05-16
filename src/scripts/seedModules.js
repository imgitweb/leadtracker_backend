import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemModule from '../models/SystemModule.js';
import { MODULE_DEFINITIONS, MODULE_KEYS } from '../config/modules.js';
import { CompanyModuleService } from '../services/CompanyModuleService.js';

dotenv.config();

const seedModules = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const syncKeys = new Set(MODULE_KEYS);

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
