import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Company from '../models/Company.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_SEED_FILE = path.resolve(__dirname, 'data/users.seed.json');
const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'lead_manager', 'sales_head', 'support_staff', 'user']);
const ALLOWED_STATUS = new Set(['active', 'inactive', 'suspended']);

const readArgValue = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const seedFilePathArg = readArgValue('--file');
const seedFilePath = seedFilePathArg ? path.resolve(process.cwd(), seedFilePathArg) : DEFAULT_SEED_FILE;

const parseSeedFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Seed file must contain a JSON array of users.');
  }

  return parsed;
};

const normalizeText = (value) => String(value || '').trim();

const validateRow = (row, index) => {
  const fullName = normalizeText(row.fullName);
  const email = normalizeText(row.email).toLowerCase();
  const password = String(row.password || '');
  const companyName = normalizeText(row.companyName);
  const companyId = normalizeText(row.companyId);
  const role = normalizeText(row.role || 'user');
  const status = normalizeText(row.status || 'active');

  if (!fullName || !email || !password) {
    throw new Error(`Row ${index + 1}: fullName, email, and password are required.`);
  }

  if (!companyName && !companyId) {
    throw new Error(`Row ${index + 1}: provide either companyName or companyId.`);
  }

  if (password.length < 6) {
    throw new Error(`Row ${index + 1}: password must be at least 6 characters.`);
  }

  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(`Row ${index + 1}: invalid role '${role}'.`);
  }

  if (!ALLOWED_STATUS.has(status)) {
    throw new Error(`Row ${index + 1}: invalid status '${status}'.`);
  }

  return {
    fullName,
    email,
    password,
    companyName,
    companyId,
    role,
    status,
    phone: normalizeText(row.phone) || null,
    bio: normalizeText(row.bio) || null,
    plan: normalizeText(row.plan || 'enterprise') || 'enterprise',
    industry: normalizeText(row.industry || 'other') || 'other',
    setAsCompanyOwner: Boolean(row.setAsCompanyOwner),
  };
};

const findCompany = async ({ companyId, companyName }) => {
  if (companyId) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error(`Invalid companyId '${companyId}'.`);
    }
    const byId = await Company.findById(companyId);
    if (!byId) {
      throw new Error(`Company not found for companyId '${companyId}'.`);
    }
    return byId;
  }

  return Company.findOne({ name: companyName });
};

const addMemberIfMissing = async (companyId, userId, ownerId = null) => {
  const update = {
    $addToSet: { members: userId },
  };

  if (ownerId) {
    update.$set = { owner: ownerId };
  }

  await Company.updateOne({ _id: companyId }, update);
};

const seedUsers = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in environment.');
  }

  const rows = await parseSeedFile(seedFilePath);

  console.log(`Loaded ${rows.length} records from ${seedFilePath}`);

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const summary = {
    total: rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 1;

    try {
      const row = validateRow(rows[i], i);
      const existingUser = await User.findOne({ email: row.email }).select('_id email');

      if (existingUser) {
        summary.skipped += 1;
        console.log(`SKIP row ${rowNumber}: email already exists (${row.email})`);
        continue;
      }

      let company = await findCompany(row);
      let user;

      if (!company) {
        const companyId = new mongoose.Types.ObjectId();
        user = await User.create({
          fullName: row.fullName,
          email: row.email,
          password: row.password,
          role: row.role || 'admin',
          status: row.status,
          phone: row.phone,
          bio: row.bio,
          company: companyId,
          lastLogin: new Date(),
        });

        company = new Company({
          _id: companyId,
          name: row.companyName,
          owner: user._id,
          members: [user._id],
          plan: row.plan,
          industry: row.industry,
        });

        await company.save();

        summary.created += 1;
        console.log(`CREATED row ${rowNumber}: ${row.email} + new company ${company.name}`);
        continue;
      }

      user = await User.create({
        fullName: row.fullName,
        email: row.email,
        password: row.password,
        role: row.role,
        status: row.status,
        phone: row.phone,
        bio: row.bio,
        company: company._id,
        lastLogin: new Date(),
      });

      const shouldSetOwner = row.setAsCompanyOwner || !company.owner;
      await addMemberIfMissing(company._id, user._id, shouldSetOwner ? user._id : null);

      summary.created += 1;
      console.log(`CREATED row ${rowNumber}: ${row.email} in company ${company.name}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`FAILED row ${rowNumber}: ${error.message}`);
    }
  }

  console.log('\nSeed summary');
  console.log(`Total:   ${summary.total}`);
  console.log(`Created: ${summary.created}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Failed:  ${summary.failed}`);
};

seedUsers()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Seed failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // ignore disconnect failures
    }
    process.exit(1);
  });
