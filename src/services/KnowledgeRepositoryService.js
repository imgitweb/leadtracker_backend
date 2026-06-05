import KnowledgeRepositoryItem from '../models/KnowledgeRepositoryItem.js';
import AuditLog from '../models/AuditLog.js';

const DEFAULT_FOLDERS = [
  {
    key: 'company',
    title: 'Company Information',
    description: 'Core company profile and trust assets',
    iconKey: 'company',
    color: '#0ea5e9',
  },
  {
    key: 'product',
    title: 'Product & Service Documents',
    description: 'Product stories and service collateral',
    iconKey: 'product',
    color: '#2563eb',
  },
  {
    key: 'sales',
    title: 'Sales Enablement Documents',
    description: 'Ready-to-use material for sales and lead handling',
    iconKey: 'sales',
    color: '#6366f1',
  },
  {
    key: 'proposal',
    title: 'Proposal & Quotation Templates',
    description: 'Commercial templates for fast closing',
    iconKey: 'proposal',
    color: '#f59e0b',
  },
  {
    key: 'legal',
    title: 'Contracts & Legal',
    description: 'Standard legal and agreement documents',
    iconKey: 'legal',
    color: '#ef4444',
  },
  {
    key: 'call-centre',
    title: 'Call Centre Resources',
    description: 'Lead calling and follow-up playbooks',
    iconKey: 'call-centre',
    color: '#0ea5e9',
  },
];

const toDocumentNode = (item) => ({
  _id: item._id,
  id: item._id,
  title: item.title,
  description: item.description || '',
  fileName: item.fileName,
  fileUrl: item.fileUrl,
  mimeType: item.mimeType,
  fileSize: item.fileSize,
  updatedAt: item.updatedAt,
  createdAt: item.createdAt,
});

const dedupeByKey = (items, keyResolver) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyResolver(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeText = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const cleanupLegacyRepository = async (companyId) => {
  const activeItems = await KnowledgeRepositoryItem.find({ companyId, isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 });

  const duplicateFolderKeys = new Set();
  const folderGroups = new Map();

  activeItems
    .filter((item) => item.type === 'folder' && !item.parentId)
    .forEach((folder) => {
      const key = `${folder.parentId ? folder.parentId.toString() : 'root'}:${normalizeText(folder.title)}`;
      if (!folderGroups.has(key)) {
        folderGroups.set(key, folder);
        return;
      }
      duplicateFolderKeys.add(folder._id.toString());
    });

  const legacyDocumentIds = activeItems
    .filter((item) => item.type === 'document' && item?.meta?.uploaded !== true)
    .map((item) => item._id);

  if (duplicateFolderKeys.size > 0) {
    await KnowledgeRepositoryItem.deleteMany(
      { _id: { $in: Array.from(duplicateFolderKeys) }, companyId },
    );
  }

  if (legacyDocumentIds.length > 0) {
    await KnowledgeRepositoryItem.deleteMany(
      { _id: { $in: legacyDocumentIds }, companyId },
    );
  }
};

const buildTree = (items) => {
  const itemsByParent = items.reduce((accumulator, item) => {
    const parentKey = item.parentId ? item.parentId.toString() : 'root';
    if (!accumulator[parentKey]) accumulator[parentKey] = [];
    accumulator[parentKey].push(item);
    return accumulator;
  }, {});

  const buildFolderNode = (folder) => {
    const folderId = folder._id.toString();
    const directChildren = itemsByParent[folderId] || [];
    const childFolders = dedupeByKey(
      directChildren.filter((item) => item.type === 'folder'),
      (item) => `${item.parentId ? item.parentId.toString() : 'root'}:${item.type}:${item.title.trim().toLowerCase()}`,
    ).map(buildFolderNode);
    const documents = dedupeByKey(
      directChildren.filter((item) => item.type === 'document' && item?.meta?.uploaded === true),
      (item) => `${item.parentId ? item.parentId.toString() : 'root'}:${item.type}:${item.title.trim().toLowerCase()}`,
    ).map(toDocumentNode);

    return {
      _id: folder._id,
      id: folder._id,
      key: folderId,
      type: 'folder',
      title: folder.title,
      description: folder.description || '',
      iconKey: folder.iconKey || 'folder',
      color: folder.color || '#2563eb',
      parentId: folder.parentId,
      sortOrder: folder.sortOrder || 0,
      documents,
      folders: childFolders,
      items: documents.map((doc) => doc.title),
      nodeCount: documents.length + childFolders.length,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  };

  const rootFolders = dedupeByKey(
    (itemsByParent.root || []).filter((item) => item.type === 'folder'),
    (item) => `${item.parentId ? item.parentId.toString() : 'root'}:${item.type}:${item.title.trim().toLowerCase()}`,
  ).map(buildFolderNode);

  return rootFolders;
};

const getRootFolders = async (companyId) => {
  return KnowledgeRepositoryItem.find({ companyId, type: 'folder', parentId: null, isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 });
};

const seedDefaultRepository = async (companyId, userId) => {
  const existingFolders = await KnowledgeRepositoryItem.countDocuments({ companyId, type: 'folder' });
  if (existingFolders > 0) return;

  for (let index = 0; index < DEFAULT_FOLDERS.length; index += 1) {
    const folderSeed = DEFAULT_FOLDERS[index];
    await KnowledgeRepositoryItem.findOneAndUpdate(
      {
        companyId,
        type: 'folder',
        parentId: null,
        title: folderSeed.title,
      },
      {
        $setOnInsert: {
          companyId,
          type: 'folder',
          title: folderSeed.title,
          description: folderSeed.description,
          iconKey: folderSeed.iconKey,
          color: folderSeed.color,
          sortOrder: index,
          parentId: null,
          createdBy: userId || null,
          updatedBy: userId || null,
        },
      },
      { upsert: true, new: true },
    );
  }
};

const normalizeTitle = (title) => title.trim();

const buildDocumentPayload = ({ title, description, parentId, file }, companyId, userId) => ({
  companyId,
  type: 'document',
  title: normalizeTitle(title),
  description: description?.trim() || '',
  parentId,
  fileName: file ? file.originalname : null,
  fileUrl: file ? `/uploads/knowledge-repository/${file.filename}` : null,
  mimeType: file ? file.mimetype : null,
  fileSize: file ? file.size : null,
  meta: {
    uploaded: true,
    originalName: file ? file.originalname : null,
  },
  createdBy: userId || null,
  updatedBy: userId || null,
});

export class KnowledgeRepositoryService {
  static async getTree(companyId, userId = null) {
    await seedDefaultRepository(companyId, userId);
    await cleanupLegacyRepository(companyId);

    const folders = await getRootFolders(companyId);
    const allItems = await KnowledgeRepositoryItem.find({ companyId, isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 });

    return {
      groups: buildTree(allItems),
      totals: {
        folders: allItems.filter((item) => item.type === 'folder').length,
        documents: allItems.filter((item) => item.type === 'document' && item?.meta?.uploaded === true).length,
      },
      rootFolderCount: folders.length,
    };
  }

  static async createFolder(companyId, userId, payload) {
    const title = normalizeTitle(payload.title || '');
    if (!title) {
      throw new Error('Folder title is required');
    }

    const parentId = payload.parentId || null;
    if (parentId) {
      const parentFolder = await KnowledgeRepositoryItem.findOne({ _id: parentId, companyId, type: 'folder', isActive: true });
      if (!parentFolder) {
        throw new Error('Parent folder not found');
      }
    }

    const existingFolder = await KnowledgeRepositoryItem.findOne({
      companyId,
      type: 'folder',
      parentId,
      title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      isActive: true,
    });
    if (existingFolder) {
      throw new Error('Folder already exists');
    }

    const folder = await KnowledgeRepositoryItem.create({
      companyId,
      type: 'folder',
      title,
      description: payload.description?.trim() || '',
      parentId,
      iconKey: payload.iconKey || 'folder',
      color: payload.color || '#2563eb',
      sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
      createdBy: userId,
      updatedBy: userId,
    });

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'knowledge_folder_created',
      resourceId: folder._id,
      status: 'success',
      details: { title: folder.title },
    });

    return folder;
  }

  static async createDocument(companyId, userId, payload, file = null) {
    const title = normalizeTitle(payload.title || '');
    if (!title) {
      throw new Error('Document title is required');
    }

    if (!file) {
      throw new Error('Document upload is required');
    }

    const parentId = payload.parentId || null;
    if (!parentId) {
      throw new Error('Destination folder is required');
    }

    const parentFolder = await KnowledgeRepositoryItem.findOne({ _id: parentId, companyId, type: 'folder', isActive: true });
    if (!parentFolder) {
      throw new Error('Destination folder not found');
    }

    const existingDocument = await KnowledgeRepositoryItem.findOne({
      companyId,
      type: 'document',
      parentId,
      title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      isActive: true,
    });
    if (existingDocument) {
      throw new Error('Document already exists in this folder');
    }

    const document = await KnowledgeRepositoryItem.create({
      ...buildDocumentPayload({ title, description: payload.description, parentId, file }, companyId, userId),
      sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
    });

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'knowledge_document_created',
      resourceId: document._id,
      status: 'success',
      details: { title: document.title, parentId },
    });

    return document;
  }

  static async deleteItem(companyId, userId, itemId) {
    const item = await KnowledgeRepositoryItem.findOne({ _id: itemId, companyId, isActive: true });
    if (!item) {
      throw new Error('Knowledge item not found');
    }

    if (item.type === 'folder') {
      const childCount = await KnowledgeRepositoryItem.countDocuments({ companyId, parentId: item._id, isActive: true });
      if (childCount > 0) {
        throw new Error('Folder is not empty');
      }
    }

    await KnowledgeRepositoryItem.deleteOne({ _id: itemId, companyId });

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: item.type === 'folder' ? 'knowledge_folder_deleted' : 'knowledge_document_deleted',
      resourceId: item._id,
      status: 'success',
      details: { title: item.title },
    });

    return { message: `${item.type === 'folder' ? 'Folder' : 'Document'} deleted successfully` };
  }

  static async updateItem(companyId, userId, itemId, payload) {
    const item = await KnowledgeRepositoryItem.findOne({ _id: itemId, companyId, isActive: true });
    if (!item) {
      throw new Error('Knowledge item not found');
    }

    if (payload.title !== undefined) item.title = normalizeTitle(payload.title);
    if (payload.description !== undefined) item.description = payload.description?.trim() || '';
    if (payload.iconKey !== undefined) item.iconKey = payload.iconKey;
    if (payload.color !== undefined) item.color = payload.color;
    if (payload.sortOrder !== undefined) item.sortOrder = Number(payload.sortOrder) || 0;

    if (item.type === 'document' && payload.parentId !== undefined) {
      const parentFolder = payload.parentId
        ? await KnowledgeRepositoryItem.findOne({ _id: payload.parentId, companyId, type: 'folder', isActive: true })
        : null;
      if (payload.parentId && !parentFolder) {
        throw new Error('Destination folder not found');
      }
      item.parentId = payload.parentId || null;
    }

    item.updatedBy = userId;
    await item.save();

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: item.type === 'folder' ? 'knowledge_folder_updated' : 'knowledge_document_updated',
      resourceId: item._id,
      status: 'success',
      details: { title: item.title },
    });

    return item;
  }
}

export default KnowledgeRepositoryService;