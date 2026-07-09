# Storage Accounting Reconciliation

## Overview

The reconciliation endpoint recalculates storage accounting for users by examining their actual file usage in `user_asset_files` and `blob_storage_objects` tables.

## Endpoints

### Reconcile Specific User
```
GET /api/admin/storage/reconcile?userId=<user-id>
```

Requires authentication. Only the authenticated user can reconcile their own storage.

**Response:**
```json
{
  "success": true,
  "userId": "abc123",
  "logicalBytesUsed": 1024,
  "physicalBytesUsed": 512
}
```

### Reconcile All Users
```
GET /api/admin/storage/reconcile?all=true
```

Requires authentication. ⚠️ **This should be restricted to admin users only** (TODO: add role check).

**Response:**
```json
{
  "success": true,
  "usersReconciled": 10,
  "users": [
    {
      "userId": "abc123",
      "logicalBytesUsed": 1024,
      "physicalBytesUsed": 512
    },
    ...
  ]
}
```

## When to Use

1. **Initial Setup**: If you have existing data from before the storage accounting feature was added
2. **Data Repair**: If accounting data gets out of sync due to bugs or manual database changes
3. **Migration**: After deploying the storage accounting feature to an existing database

## How It Works

The reconciliation process:
1. Queries all `user_asset_files` for the user
2. Calculates `logicalBytesUsed` by summing `logicalSizeBytes` from all files
3. Queries all `blob_storage_objects` linked to the user's blobs
4. Calculates `physicalBytesUsed` by summing `physicalSizeBytes` from storage objects
5. Updates or creates the `storage_accounting` record with accurate values

## Testing

Run the test script:
```bash
node scripts/test-storage-reconciliation.mjs
```

This will:
1. Create a test user
2. Verify the endpoint requires authentication
3. Reconcile the user's storage
4. Verify the accounting record is created
5. Test bulk reconciliation for all users

## Security Considerations

Currently, any authenticated user can:
- Reconcile their own storage (safe)
- Reconcile all users' storage if they have the `?all=true` flag (⚠️ should be admin-only)

**TODO:** Add admin role check to restrict the `?all=true` endpoint to administrators only.
