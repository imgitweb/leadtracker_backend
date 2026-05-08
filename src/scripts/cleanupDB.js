import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const cleanDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    // Clean Users
    console.log('Cleaning legacy fields from Users...');
    const userResult = await mongoose.connection.collection('users').updateMany(
      {},
      { 
        $unset: { 
          isEmailVerified: "", 
          twoFactorEnabled: "", 
          twoFactorSecret: "",
          teams: ""
        } 
      }
    );
    console.log(`Updated ${userResult.modifiedCount} user documents.`);

    // Clean Companies
    console.log('Cleaning legacy fields from Companies...');
    const companyResult = await mongoose.connection.collection('companies').updateMany(
      {},
      { 
        $unset: { 
          "settings.twoFactorRequired": "", 
          "settings.webhooksEnabled": "", 
          maxTeams: "" 
        } 
      }
    );
    console.log(`Updated ${companyResult.modifiedCount} company documents.`);

    console.log('Database cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();
