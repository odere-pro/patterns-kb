---
title: Object Storage
description: "Store large unstructured blobs in a purpose-built store, keep only a reference in the database"
area: distributed-scale
owner: Oleksandr Derechei
tags: [persistence, durability, data-access]
status: stable
aliases: [blob storage, object store, S3]
solves: [my database backups take forever and the disk is full of user-uploaded images, storing PDFs and videos as blobs in Postgres has made every query slow, I need somewhere cheap to keep terabytes of files I only look up by id, users upload large videos and my app servers choke proxying the bytes, where do I put profile pictures and attachments so a CDN can serve them]
favourite: true
---

# Object Storage

A store built for large, unstructured binary objects — images, video, backups — each addressed by a key over HTTP. The database keeps a small reference; the bytes live here, cheap, durable, and ready for a CDN (content delivery network) to serve.

## What it is
<!--meta block=description-->

Someone uploads a 40 MB video. Keep it in your database and every backup, every restore and every query that never touches that video gets slower, because the bytes sit in the same pages the rest of your data has to move past. Send the bytes to a store built for exactly this instead: hand it a whole file, get back a short key, present the key later and get the whole file back. Your database keeps the key — a few dozen characters — and stays small and quick.

**Object storage** keeps data as opaque objects — a blob of bytes, a bundle of metadata, and a unique key — in a flat namespace, retrieved by key over an HTTP API rather than by a filesystem path or a database row. Each object is written and read whole: you don't append to one or edit part of it, you replace it. It is purpose-built to hold large, unstructured binary data — images, video, backups, logs, static assets, ML datasets — cheaply and at effectively unbounded scale.

The force it resolves is a mismatch of jobs. A relational or document database is built for many small, structured, frequently updated records with rich queries and transactions. Push large binary blobs into it and everything suffers: rows bloat, backups balloon, the buffer cache thrashes, and every query slows for data it never touches. Object storage takes the blobs out of that hot path — the database keeps only a small reference (a key or URL), and the bytes live in a store designed for exactly this: durable, cheap per gigabyte, horizontally scalable, and directly addressable over HTTP.

Objects live in buckets (containers), each object named by a key, with per-object authorization on an HTTP interface. Because an object is reachable by URL, it pairs naturally with a [CDN](./cdn.md) in front to cache it at the edge, and with a [Valet Key](./valet-key.md) — a short-lived pre-signed URL — so a client can upload or download the bytes directly without routing them through your servers. The price of that simplicity is a narrow interface: no in-place edits, no filesystem semantics, and consistency that varies by store — the flagship clouds are now strongly consistent even for overwrites and listings, but a portable design cannot assume that of every S3-compatible store.

## Explained
<!--meta block=explain-->

Object storage keeps files as whole objects, each a block of bytes with metadata and a unique key, and you read or write one by key over an HTTP API. You store big files such as videos and backups there and keep only the key in your database. Without it, a 40 MB video in a database row makes every backup, restore and unrelated query slower, because the bytes sit in the same pages as your other data. The store is cheap per gigabyte, copies each object across devices for durability, and grows without you provisioning capacity. Choose it over a database for large files you write once and read whole, and over a file system when you do not need renames, appends or locks. An object is replaced, never edited in place, and you cannot query inside it. It costs four things. Latency is higher than a local disk, so put a CDN in front of hot objects. Consistency varies between stores, so check the guarantee of the one you run. A public bucket or a leaked signed link exposes data, so block public access and keep signed links short. And the database row and the object drift apart, so write the row first and run a sweep that finds orphans in both directions.

**Example.** Users upload 1,000 videos of 40 MB a day, 40 GB in all. Each client uploads straight to the store with a signed link that expires in 10 minutes, and your database keeps one row with a key of about 60 characters. The row is written first, marked pending. If 2% of uploads are abandoned, 20 a day leave 800 MB of bytes with no finished row. Without a sweep that is about 292 GB a year paid for and never read. The sweep deletes pending rows and objects older than 1 hour that have no match.

## How it works
<!--meta block=structure-->

```mermaid caption="How does a 40 MB upload get in and out without passing through your database or your app servers? Only the key crosses into your systems, at step 2; the bytes travel between the browser and the bucket."
flowchart LR
    Client["Browser"]
    subgraph Own["Your servers — keys only, never bytes"]
        App["App server"]
        DB[("Database")]
    end
    Bucket[("Object store bucket")]:::ext
    CDN["CDN edge cache"]:::ext
    Client -->|"1 ask to upload"| App
    App -->|"2 store the key"| DB
    App -->|"3 hand back a signed URL"| Client
    Client -->|"4 put the bytes"| Bucket
    Client -->|"5 read later"| CDN
    CDN -->|"6 fetch on a miss"| Bucket
    classDef ext stroke-dasharray:4 4
```

```mermaid caption="The database holds a small reference; the bytes live in the object store, served to clients through a CDN or transferred directly with a pre-signed URL."
flowchart LR
    App["App server"] -->|"1 · write blob → key"| OS["Object store (bucket)"]
    App -->|"2 · store key / URL"| DB[("Database")]
    OS -->|"origin fetch"| CDN["CDN — edge cache"]
    CDN -->|"serve bytes"| Client["Client"]
    Client -.->|"pre-signed URL: transfer bytes directly"| OS
```

## Variations
<!--meta block=variations-->

- **Storage classes & tiers** — Hot, infrequent-access, and archive (cold) tiers trade retrieval latency and cost. Lifecycle rules move rarely-read objects to cheaper cold storage automatically, and expire them when they age out.
- **Pre-signed URLs (direct transfer)** — Hand the client a short-lived signed URL so it uploads or downloads straight from the store, keeping large payloads off your app servers. This is the [Valet Key](./valet-key.md) pattern applied to blobs.
- **Multipart / resumable upload** — Split a large object into parts uploaded in parallel and reassembled server-side, so a dropped connection retries one part instead of the whole file.
- **Versioning & [immutability](../../functional/immutability.md)** — Keep every version of a key, or lock objects write-once-read-many (WORM) for compliance and ransomware resistance, instead of overwriting in place.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Cheap per gigabyte and effectively unbounded** — scales to petabytes with no capacity to provision.
- **Very high durability**, through internal replication or erasure coding across devices and often data centres.
- **Keeps large-object traffic off** the database and app servers, so their hot paths stay fast.
- **Objects are HTTP-addressable**, so a CDN in front and direct client transfer drop in naturally.

### Cons
<!--meta polarity=con-->

- **No filesystem or transactional semantics** — you replace whole objects, can't edit in place, and can't query their contents.
- **Higher per-request latency** than local disk or a database, especially first-byte from a cold tier.
- **Consistency varies by store** — the flagship clouds are now strongly consistent, but overwrites and listings can still lag on other S3-compatible stores and across regions. Pin the guarantee you depend on to the store you actually run, and never let a read-after-overwrite be load-bearing across a replica.
- **A public bucket or a leaked pre-signed URL** is a data-exposure risk; access control is easy to misconfigure — block public access at the account level, and keep signed lifetimes in minutes rather than days.
- **Nothing joins the metadata row to the object**, so the two drift: an abandoned upload leaves a row with no bytes, and a deleted row leaves bytes nobody will ever ask for again but you keep paying for. Write the row first, and give a sweep the job of reconciling both directions.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **You're storing large or unstructured binary data** — user uploads, images, video, backups, logs, datasets.
- **The data is written once** (or seldom) and read whole, and you only ever look it up by a key.
- **You want to serve** that data through a CDN, or let clients upload and download it directly.

### Avoid when
<!--meta polarity=avoid-->

- **The data is small**, highly structured, frequently updated, or queried by its contents — that's a database's job.
- **You need transactions**, partial updates, or low-latency random access into the data.
- **You need real filesystem semantics** — rename, append, directory locks — in which case reach for a file store.

The rule of thumb: keep the structured reference in your database and the bytes in object storage. Blurring that line is how databases bloat and buckets leak.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — the bytes go to the store, the key goes in the row"
// Upload: the file goes to the store, the database only learns its key.
const key = `avatars/${userId}.jpg`;
await store.put(key, bytes, "image/jpeg");
await db.users.update(userId, { avatarKey: key });

// Read: hand out a short-lived URL instead of the bytes, so the image
// travels browser ↔ store and never through your servers.
const url = await store.presignedGet(key, 300);   // usable for five minutes
```

```typescript summary="TypeScript — an ID photo in the bucket, only its key in the database"
// The object store speaks keys and bytes; the database never sees the image.
interface ObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  presignedGet(key: string, ttlSeconds: number): Promise<string>; // short-lived URL
}

// The metadata row is written BEFORE any byte exists, so the reference is there
// even if the onboardee never finishes the upload — a missing object, not a lost row.
async function reserveIdPhoto(flowId: string, personaId: string, db: Db): Promise<string> {
  const storageKey = `id-photos/${personaId}/${crypto.randomUUID()}.jpg`;
  await db.documents.insert({ flowId, personaId, storageKey, uploadedAt: null });
  return storageKey;              // the onboardee gets a presigned upload URL for this key
}

// The bytes went browser → bucket directly; the worker only ever holds the key.
async function idPhotoUrl(flowId: string, store: ObjectStore, db: Db): Promise<string | null> {
  const doc = await db.documents.findByFlow(flowId);
  if (!doc?.uploadedAt) return null;   // reserved, never uploaded
  return store.presignedGet(doc.storageKey, 300);
}

```

## In the wild
<!--meta block=wild-->

- **Amazon Simple Storage Service (S3)** — The original object store; buckets, keys, storage classes, and pre-signed URLs are its vocabulary. {#wild-amazon-s3}
- **Google Cloud Storage** — GCPs object store, same bucket/object model with lifecycle tiers. {#wild-gcs}
- **Azure Blob Storage** — Microsofts object store, with hot, cool, and archive access tiers. {#wild-azure-blob}
- **MinIO** — Self-hosted, S3-API-compatible object storage you run on your own hardware. {#wild-minio}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Storage class / tier** — Per-object hot, infrequent-access, or archive tier, set directly or by lifecycle rule. Colder classes cost less per gigabyte and more per read, so choose from how often an object is actually fetched rather than from how old it is.
- **Lifecycle rules** — The age or prefix conditions that move objects to a colder class or delete them outright. They are what keeps the bill tracking what you serve instead of everything you have ever kept.
- **Multipart threshold & part size** — Above what size an upload splits, and how large each part is. Smaller parts make a dropped connection cheap to retry and cost more requests; larger parts do the reverse.
- **Versioning** — Whether a write keeps the previous version of a key, or objects are locked write-once. A bad overwrite becomes recoverable, and every superseded version keeps billing until a lifecycle rule clears it.
- **Bucket policy & encryption** — Public-access block, identity and access management (IAM) and bucket policy, and server-side encryption at rest. This is the surface where one permissive statement turns a private bucket into a public one.

### Signals to watch
<!--meta polarity=signal-->

- **Request rate & error mix** — 4xx/5xx trend, especially 403 denials that signal a policy or key problem.
- **First-byte latency by tier** — Cold-tier reads are far slower than hot, and an archived object cannot be read at all until it is restored. A rising cold share is a tiering rule that went further than the access pattern justified.
- **Egress bandwidth & cost** — The line item that surprises teams serving without a CDN.
- **Objects & bytes stored** — Count and total size, per bucket and per prefix. Growth that outruns traffic is either a lifecycle rule that never fired or reconciliation nobody wrote.
- **Replication lag** — Time for a write to reach another region, where replication is enabled. It bounds how stale a cross-region read can be, which is what a failover plan is really promising.

### Failure modes under load
<!--meta polarity=failure-->

- **Hot-prefix throttling** — Requests concentrated on one key prefix get rate-limited.
- **Egress cost blowout** — Serving large objects straight to users instead of through a CDN.
- **Public-bucket exposure** — A misconfigured policy leaks private data.
- **Stale read after overwrite** — The major clouds now read an overwrite back immediately, and their listings are strongly consistent too — the caveat survives in cross-region replicas read before replication catches up, and in S3-compatible stores that still settle writes or listings asynchronously.
- **Cold-tier retrieval spike** — Objects aged into archive must be restored before they can be read.

### Readiness checklist
<!--meta polarity=check-->

- Block public access by default; grant reads via a CDN or pre-signed URL
- Enable encryption at rest and enforce Transport Layer Security (TLS) in transit
- Put a CDN in front of read-heavy public assets to cap egress and latency
- Use pre-signed URLs for client upload/download so bytes skip your servers
- Reconciliation runs in both directions — a row with no object, and an object with no row — and somebody owns what it finds
- Scope bucket IAM to least privilege and audit for public grants

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [System Design Interview](../../../themes/system-design-interview.md) — Keep large blobs out of the database {#fluency-system-design-interview}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [CDN](./cdn.md) — A CDN caches and serves the store's public objects from the edge, near the user.
- [Valet Key](./valet-key.md) — A pre-signed URL is a valet key: scoped, expiring, direct access to one object.
- [Claim Check](../../messaging/claim-check.md) — Store the large payload here; the message carries only its key.
- [Sweeper](../coordination/sweeper.md) — Nothing joins the metadata row to the object, so a sweep reconciles the drift in both directions
- [Prefer Managed Services](../../../principles/managed-services.md) — Object storage is the clearest case for renting rather than running
- [Vertical Partitioning](./vertical-partitioning.md) — Holding the bulky fields of an entity is the everyday use, with the database row keeping only the key

**Prevents**

- [Monolithic Persistence](../../../hazards/monolithic-persistence.md) — The right home for blobs that would otherwise sit as rows, crowding out indexed lookups

**Demonstrated by**

- [Web Crawler](../../../designs/web-crawler.md) — large immutable blobs are kept in cheap durable object storage rather than a database or queue
- [Instagram](../../../designs/instagram.md) — the design leans on an object store for 750PB of media with cold-tier aging to cheaper storage
- [Facebook Post Search](../../../designs/fb-post-search.md) — cold-tiering the long tail into object storage is how the design affords 3.6 PB of index
- [Google News](../../../designs/google-news.md) — article images live as objects referenced by URL from the metadata row, the canonical blobs-belong-in-object-storage split
- [Strava](../../../designs/strava.md) — cold GPS archives on object storage is the archival tier of a hot/warm/cold layout
- [WhatsApp](../../../designs/whatsapp.md) — serving large immutable binaries by reference is precisely what object storage exists for
- [Dropbox](../../../designs/dropbox.md) — Dropbox offloads virtually unlimited, durable file storage to a blob store and keeps only metadata in its own database
- [YouTube](../../../designs/youtube.md) — petabyte-scale immutable media addressed by URL is the canonical object-storage workload
- [Persona Identification & Sanction Check](../../../designs/persona-identification.md) — storing a submitted ID photo as an encrypted blob reached by presigned upload, referenced by key from a metadata row written before the upload
- [Persona Identification & Sanction Check (V2)](../../../designs/persona-identification-v2.md) — a store whose lifecycle rule is deliberately demoted to a backstop, because the retention clock starts at relationship close rather than at object age
- [Job Scheduler](../../../designs/job-scheduler.md) — Object storage as the cold tier for history that is rarely read

**Implemented by**

- [Storage](../../../capabilities/storage.md) — Bought rather than built: object storage is the one capability every cloud ships in the same shape.
- [Object stores](../../../comparisons/object-stores.md) — Which blob store to rent or run — S3 and its self-hosted alternatives, compared.
- [Data & Analytics](../../../capabilities/data-analytics.md) — The lake tier of every analytics stack is the same object store, so table formats and query engines read straight out of it.

<!-- relationships:end -->
