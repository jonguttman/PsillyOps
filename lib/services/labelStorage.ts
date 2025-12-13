// LABEL STORAGE ABSTRACTION
// Enables future migration to cloud storage (S3/R2/Vercel Blob) without schema changes

import { promises as fs } from 'fs';
import path from 'path';

// ========================================
// STORAGE INTERFACE
// ========================================

export interface LabelStorage {
  /**
   * Save a label file and return its URL/path for database storage
   */
  save(templateId: string, version: string, file: Buffer, ext: string): Promise<string>;
  
  /**
   * Load a label file by its stored URL/path
   */
  load(fileUrl: string): Promise<Buffer>;
  
  /**
   * Delete a label file (for cleanup, though versions should be immutable)
   */
  delete(fileUrl: string): Promise<void>;
  
  /**
   * Check if a file exists
   */
  exists(fileUrl: string): Promise<boolean>;
}

// ========================================
// LOCAL FILESYSTEM STORAGE
// ========================================

export class LocalLabelStorage implements LabelStorage {
  private basePath: string;

  constructor(basePath: string = './storage/labels') {
    this.basePath = basePath;
  }

  /**
   * Save file to local filesystem
   * Returns relative path for database storage
   */
  async save(templateId: string, version: string, file: Buffer, ext: string): Promise<string> {
    // Ensure extension starts with a dot
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    
    // Sanitize inputs to prevent path traversal
    const safeTemplateId = templateId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeVersion = version.replace(/[^a-zA-Z0-9._-]/g, '');
    
    // Build directory and file paths
    const templateDir = path.join(this.basePath, safeTemplateId);
    const fileName = `${safeVersion}${normalizedExt}`;
    const filePath = path.join(templateDir, fileName);
    
    // Ensure directory exists
    await fs.mkdir(templateDir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, file);
    
    // Return relative URL for database storage
    return `${safeTemplateId}/${fileName}`;
  }

  /**
   * Load file from local filesystem
   */
  async load(fileUrl: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, fileUrl);
    
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Label file not found: ${fileUrl}`);
    }
  }

  /**
   * Delete file from local filesystem
   */
  async delete(fileUrl: string): Promise<void> {
    const filePath = path.join(this.basePath, fileUrl);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if file exists
   */
  async exists(fileUrl: string): Promise<boolean> {
    const filePath = path.join(this.basePath, fileUrl);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full filesystem path for a file URL
   * Useful for debugging and direct file access
   */
  getFullPath(fileUrl: string): string {
    return path.join(this.basePath, fileUrl);
  }
}

// ========================================
// SINGLETON INSTANCE
// ========================================

// Default storage instance - can be swapped out for cloud storage later
let storageInstance: LabelStorage | null = null;

export function getLabelStorage(): LabelStorage {
  if (!storageInstance) {
    // Use environment variable or default path
    const basePath = process.env.LABEL_STORAGE_PATH || './storage/labels';
    storageInstance = new LocalLabelStorage(basePath);
  }
  return storageInstance;
}

/**
 * Set a custom storage implementation (for testing or cloud storage)
 */
export function setLabelStorage(storage: LabelStorage): void {
  storageInstance = storage;
}

// ========================================
// FILE VALIDATION UTILITIES
// ========================================

/**
 * Validate that an SVG file contains the required QR placeholder
 */
export function validateSvgPlaceholder(svgContent: string): boolean {
  // Check for the required QR placeholder element
  return svgContent.includes('id="qr-placeholder"');
}

/**
 * Get file extension from buffer content type or filename
 */
export function getFileExtension(filename: string, contentType?: string): string {
  // Try to get from filename first
  const extFromName = path.extname(filename).toLowerCase();
  if (extFromName) {
    return extFromName;
  }
  
  // Fall back to content type
  if (contentType) {
    if (contentType.includes('svg')) return '.svg';
    if (contentType.includes('pdf')) return '.pdf';
  }
  
  return '.svg'; // Default to SVG
}

/**
 * Check if file type is allowed
 */
export function isAllowedFileType(ext: string): boolean {
  const allowedExtensions = ['.svg', '.pdf'];
  return allowedExtensions.includes(ext.toLowerCase());
}

