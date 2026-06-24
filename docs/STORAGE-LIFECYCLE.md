**Storage Lifecycle: Preventing automatic deletion of media and documents**

- **Purpose**: Configure the Cloud Storage bucket lifecycle so only temporary or cache files are deleted automatically. This ensures uploaded media (images, videos) and documents (`.html`, `.txt`, `.pdf`, `.xlsx`, etc.) are preserved.

- **What I added**:
  - `storage-lifecycle.json`: lifecycle config that only deletes objects under temporary prefixes (e.g. `tmp/`, `temp/`, `debug-uploads/`, `backups/`, `cache/`).
  - `scripts/set-bucket-lifecycle.ps1`: PowerShell script to apply the lifecycle using `gsutil` or `gcloud`.

- **How it works**:
  - GCS lifecycle rules are inclusive: they delete objects that match rule conditions. To *prevent* deletion of media/docs, avoid creating a rule that broadly matches everything. The provided JSON only targets temporary prefixes so other paths (like `posts/`, `space_posts/`, `messages/`, `users/`, `groups/`, `events/`, `flares/`) are not affected.

- **Before you run**:
  - Install Google Cloud SDK (includes `gsutil`) and authenticate: `gcloud auth login` and `gcloud auth application-default login` when needed.
  - Ensure you have permissions to update bucket lifecycle (Storage Admin or project owner).

- **Apply the lifecycle (PowerShell)**:

```powershell
# From repository root
# Option A: pass bucket name directly
.
\scripts\set-bucket-lifecycle.ps1 -BucketName bulsuspace.firebasestorage.app

# Option B: set env var and run
$env:STORAGE_BUCKET = 'bulsuspace.firebasestorage.app';
.
\scripts\set-bucket-lifecycle.ps1
```

- **Apply the lifecycle (gsutil)**:

```powershell
# if you prefer to run gsutil directly
gsutil lifecycle set storage-lifecycle.json gs://YOUR_BUCKET_NAME
```

- **Inspect existing lifecycle rules**:

```powershell
# using gsutil
gsutil lifecycle get gs://YOUR_BUCKET_NAME

# or using gcloud (alpha storage)
gcloud alpha storage buckets describe gs://YOUR_BUCKET_NAME --format=json
```

- **If you already have a broad delete rule**:
  - `gsutil lifecycle set` replaces the entire lifecycle configuration. Make sure to capture the current rules with `gsutil lifecycle get` before changing them.
  - Adjust `storage-lifecycle.json` to include any additional exceptions or deletion targets you need.

- **Customizing**:
  - To protect additional prefixes, do nothing (they're safe unless matched by a rule).
  - To delete older files in a specific prefix, add that prefix to the `matchesPrefix` array with the desired `age` in days.

- **Notes**:
  - Lifecycle rules are applied by the storage backend and are not controlled by Firebase Storage security rules (`storage.rules`).
  - There is no negative match; rules are positive: define what to delete rather than what to keep.

If you want, I can:
- Update the `matchesPrefix` list to match the exact media paths you use (e.g., `posts/`, `space_posts/`) to explicitly keep or delete them.
- Add a safety script to back up lifecycle config before changing it.
