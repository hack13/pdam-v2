#!/usr/bin/env node

/**
 * Manual storage reconciliation script
 * 
 * Usage:
 *   node scripts/reconcile-storage.mjs --user <userId>   # Reconcile specific user
 *   node scripts/reconcile-storage.mjs --all             # Reconcile all users
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
}

const DATABASE_URL = envVars.DATABASE_URL;
const POSTGRES_HOST = envVars.POSTGRES_HOST || 'localhost';
const POSTGRES_PORT = envVars.POSTGRES_PORT || '5432';
const POSTGRES_DB = envVars.POSTGRES_DB || 'pdam';
const POSTGRES_USER = envVars.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = envVars.POSTGRES_PASSWORD || 'postgres';

import postgres from 'postgres';
import { formatStorage } from '../src/utils/storage.js';

const sql = postgres(DATABASE_URL);

function showUsage() {
  console.log(`
Storage Reconciliation Script

Usage:
  node scripts/reconcile-storage.mjs --user <userId>   # Reconcile specific user
  node scripts/reconcile-storage.mjs --all             # Reconcile all users

Options:
  --user <id>  Reconcile storage for a specific user
  --all        Reconcile storage for all users
  --help       Show this help message
  `);
}

async function getAccounting(userId) {
  const result = await sql`
    SELECT logical_bytes_used, physical_bytes_used
    FROM storage_accounting
    WHERE user_id = ${userId}
  `;
  return result[0] || null;
}

async function getUserFiles(userId) {
  return await sql`
    SELECT * FROM user_asset_files WHERE user_id = ${userId}
  `;
}

async function getBlobStorage(blobIds) {
  if (blobIds.length === 0) return [];
  return await sql`
    SELECT * FROM blob_storage_objects WHERE blob_id = ANY(${blobIds})
  `;
}

async function updateAccounting(userId, logicalBytes, physicalBytes) {
  const existing = await getAccounting(userId);
  
  if (existing) {
    await sql`
      UPDATE storage_accounting
      SET 
        logical_bytes_used = ${logicalBytes},
        physical_bytes_used = ${physicalBytes},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  } else {
    await sql`
      INSERT INTO storage_accounting (user_id, logical_bytes_used, physical_bytes_used)
      VALUES (${userId}, ${logicalBytes}, ${physicalBytes})
    `;
  }
}

async function reconcileUser(userId) {
  console.log(`\nReconciling user ${userId}...`);
  
  const before = await getAccounting(userId);
  console.log(`  Before: logical=${formatStorage(before?.logical_bytes_used || 0)}, physical=${formatStorage(before?.physical_bytes_used || 0)}`);
  
  // Get all user files
  const files = await getUserFiles(userId);
  const logicalBytes = files.reduce((sum, f) => sum + Number(f.logical_size_bytes), 0);
  
  // Get unique blob IDs
  const blobIds = [...new Set(files.map(f => f.blob_id))];
  
  // Get storage objects
  const storageObjects = await getBlobStorage(blobIds);
  const physicalBytes = storageObjects.reduce((sum, s) => sum + Number(s.physical_size_bytes || 0), 0);
  
  // Update accounting
  await updateAccounting(userId, logicalBytes, physicalBytes);
  
  const after = await getAccounting(userId);
  console.log(`  After:  logical=${formatStorage(after.logical_bytes_used)}, physical=${formatStorage(after.physical_bytes_used)}`);
  console.log(`  Files: ${files.length}, Blobs: ${blobIds.length}, Storage objects: ${storageObjects.length}`);
  
  return { userId, logicalBytes, physicalBytes };
}

async function reconcileAll() {
  const users = await sql`SELECT id FROM auth_user`;
  console.log(`Found ${users.length} users to reconcile\n`);
  
  const results = [];
  for (const user of users) {
    const result = await reconcileUser(user.id);
    results.push(result);
  }
  
  const totalLogical = results.reduce((sum, r) => sum + r.logicalBytes, 0);
  const totalPhysical = results.reduce((sum, r) => sum + r.physicalBytes, 0);
  
  console.log('\n=== Summary ===');
  console.log(`Users reconciled: ${results.length}`);
  console.log(`Total logical: ${formatStorage(totalLogical)}`);
  console.log(`Total physical: ${formatStorage(totalPhysical)}`);
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    showUsage();
    process.exit(0);
  }
  
  if (args.includes('--user')) {
    const userIndex = args.indexOf('--user') + 1;
    const userId = args[userIndex];
    if (!userId) {
      console.error('Error: --user requires a userId argument');
      process.exit(1);
    }
    await reconcileUser(userId);
  } else if (args.includes('--all')) {
    await reconcileAll();
  } else {
    showUsage();
    process.exit(1);
  }
  
  console.log('\n✓ Reconciliation complete');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
}).finally(() => {
  sql.end();
});
