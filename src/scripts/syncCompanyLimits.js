import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from '../models/Company.js';
import { PLANS } from '../config/plans.js';

dotenv.config();

const syncLimits = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const companies = await Company.find();
    console.log(`Found ${companies.length} companies. Syncing limits...`);

    for (const company of companies) {
      const planLimits = PLANS[company.plan] || PLANS.free;
      company.maxUsers = planLimits.maxUsers;
      company.maxLeads = planLimits.maxLeads;
      await company.save();
      console.log(`Updated limits for: ${company.name} (${company.plan})`);
    }

    console.log('All companies synced successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error syncing limits:', error);
    process.exit(1);
  }
};

syncLimits();
