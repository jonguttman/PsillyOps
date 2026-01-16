// ASSET STORAGE ABSTRACTION
// Supports local filesystem (development) and Vercel Blob (production)
// Used for product images, COA PDFs, and other uploaded assets

import { promises as fs } from 'fs';
import path from 'path';
import { put, del } from '@vercel/blob';

// ========================================
// STORAGE INTERFACE
// ========================================

export type AssetType = 'product-image' | 'batch-coa';

export interface AssetStorage {
  /**
   * Save an asset file and return its URL for database storage
   */
  save(assetType: AssetType, entityId: string, file: Buffer, ext: string): Promise<string>;

  /**
   * Delete an asset file by its stored URL
   */
  delete(fileUrl: string): Promise<void>;
}

// ========================================
// VALIDATION UTILITIES
// ========================================

const ASSET_CONFIGS: Record<AssetType, {
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}> = {
  'product-image': {
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
  },
  'batch-coa': {
    allowedExtensions: ['pdf'],
    allowedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
  },
};

export function getAssetConfig(assetType: AssetType) {
  return ASSET_CONFIGS[assetType];
}

export function validateAssetFile(
  assetType: AssetType,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; error?: string } {
  const config = ASSET_CONFIGS[assetType];

  // Check file extension
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!config.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${config.allowedExtensions.join(', ').toUpperCase()}`,
    };
  }

  // Check MIME type
  if (!config.allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${config.allowedExtensions.join(', ').toUpperCase()}`,
    };
  }

  // Check file size
  if (sizeBytes > config.maxSizeBytes) {
    const maxMB = config.maxSizeBytes / (1024 * 1024);
    return {
      valid: false,
      error: `File too large. Maximum: ${maxMB}MB`,
    };
  }

  return { valid: true };
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

// ========================================
// LOCAL FILESYSTEM STORAGE
// ========================================

export class LocalAssetStorage implements AssetStorage {
  private basePath: string;

  constructor(basePath: string = './storage/assets') {
    this.basePath = basePath;
  }

  async save(assetType: AssetType, entityId: string, file: Buffer, ext: string): Promise<string> {
    // Ensure extension starts with a dot
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

    // Sanitize inputs to prevent path traversal
    const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Date.now();

    // Build directory and file paths
    const assetDir = path.join(this.basePath, assetType, safeEntityId);
    const fileName = `${timestamp}${normalizedExt}`;
    const filePath = path.join(assetDir, fileName);

    // Ensure directory exists
    await fs.mkdir(assetDir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, file);

    // Return relative URL for database storage
    return `${assetType}/${safeEntityId}/${fileName}`;
  }

  async delete(fileUrl: string): Promise<void> {
    // Skip if it's an HTTP URL (Vercel Blob)
    if (fileUrl.startsWith('http')) {
      return;
    }

    const filePath = path.join(this.basePath, fileUrl);

    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, ignore error
    }
  }
}

// ========================================
// VERCEL BLOB STORAGE
// ========================================

export class VercelBlobAssetStorage implements AssetStorage {
  async save(assetType: AssetType, entityId: string, file: Buffer, ext: string): Promise<string> {
    // Ensure extension starts with a dot
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

    // Sanitize entity ID
    const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Date.now();

    // Build blob path
    const blobPath = `assets/${assetType}/${safeEntityId}/${timestamp}${normalizedExt}`;

    // Determine content type
    const contentType = this.getContentType(normalizedExt);

    // Upload to Vercel Blob
    const { url } = await put(blobPath, file, {
      access: 'public',
      contentType,
    });

    return url;
  }

  async delete(fileUrl: string): Promise<void> {
    // Only delete if it's a Vercel Blob URL
    if (!fileUrl.startsWith('http')) {
      return;
    }

    try {
      await del(fileUrl);
    } catch {
      // URL may not be a valid blob URL, ignore error
    }
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    return types[ext] || 'application/octet-stream';
  }
}

// ========================================
// FACTORY FUNCTION
// ========================================

let assetStorageInstance: AssetStorage | null = null;

export function getAssetStorage(): AssetStorage {
  if (assetStorageInstance) {
    return assetStorageInstance;
  }

  // Use Vercel Blob if token is configured, otherwise local storage
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    assetStorageInstance = new VercelBlobAssetStorage();
  } else {
    const storagePath = process.env.ASSET_STORAGE_PATH || './storage/assets';
    assetStorageInstance = new LocalAssetStorage(storagePath);
  }

  return assetStorageInstance;
}
