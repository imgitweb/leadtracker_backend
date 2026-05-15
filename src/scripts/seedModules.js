import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemModule from '../models/SystemModule.js';
import { MODULE_DEFINITIONS } from '../config/modules.js';

dotenv.config();

const seedModules = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

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
    
    console.log('Modules seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding modules:', error);
    process.exit(1);
  }
};

seedModules();
