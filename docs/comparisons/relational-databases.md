---
title: Relational databases
description: "Which SQL engine to run — the license, the scale story and who operates it for you"
area: comparisons
owner: Oleksandr Derechei
tags: [persistence, cloud]
status: stable
aliases: [postgres, postgresql, mysql, mariadb, sqlite, cockroachdb, rds, aurora]
solves: [I cannot choose a database engine for a new service and the options all look alike, we have outgrown a single database node and writes are the bottleneck, which managed database will not lock us into one cloud, I cannot tell whether one big database server will do or we must spread data over many, the database license changed and now we may owe money for it]
---

# Relational databases

The SQL engines you would actually pick between — PostgreSQL, MySQL, MariaDB, SQLite and CockroachDB — what each one's license and scaling story commits you to, and which of them the clouds will run for you.

## What this compares
<!--meta block=description-->

Every engine here gives you tables, joins and a transaction that either commits whole or not at all. The choice between them is not about SQL. It is about the license you inherit, what happens when one machine stops being enough, and who will run it for you — the [managed database capability](../capabilities/databases.md) covers what the cloud sells; this page compares the engines underneath.

Four of the five are servers you reach over a socket. SQLite is not: it runs inside your process and keeps the database in one file. That single difference removes the network hop, the failover plan and the backup daemon from your design, and charges you one writer at a time for it.

The other split is how each engine grows past one node. PostgreSQL, MySQL and MariaDB take every write on one primary and scale reads with copies, so growing the write path is work you do. CockroachDB puts consensus under each write instead: any node accepts one, and you pay in commit latency.

## Explained
<!--meta block=explain-->

A relational database gives you tables, joins and a transaction that either commits whole or not at all. The engines differ in license, in how they grow past one machine, and in who runs them. Default to PostgreSQL and make yourself argue for leaving it: its license constrains nothing, every major cloud rents it, and your next need, such as map queries or vector search, often arrives as an extension rather than a second system. Choose MySQL when your team and runbooks already know it. Choose SQLite, a database that is a file inside your own process, when the data fits on one machine with one writer, since it removes the server, the failover plan and the backups. Choose CockroachDB only when you need writes in more than one region with full SQL, and try cheaper answers first. Replicas add read capacity but lag the primary, so send a user's reads to the primary briefly after that user writes. Sharding, splitting data across machines by key, adds write capacity but makes you route every query by key. Distributed SQL does both for you and charges commit latency plus a license.

**Example.** A PostgreSQL primary takes 2,000 writes a second and can handle 5,000, but reads are 20,000 a second, so you add 2 replicas. They lag the primary by about 1 second. A user saves a profile, the page reloads from a replica, and the old profile shows. The fix is to read from the primary for 5 seconds after that user's write. The cost is that those reads, a small share of 20,000, load the primary, which you must leave headroom for.

## The contenders
<!--meta block=contenders-->

- **PostgreSQL** — The strict, extensible default, under the permissive PostgreSQL License. Amazon RDS (Relational Database Service) and Aurora, Azure Database for PostgreSQL and Google Cloud SQL and AlloyDB all run it for you, so choosing it costs you no cloud options.
- **MySQL** — The most widely deployed server of the five, GPLv2 and owned by Oracle, with InnoDB underneath and mature replication around it. Amazon RDS and Aurora, Azure Database for MySQL and Google Cloud SQL all offer it managed.
- **SQLite** — Public domain, in-process, no server — the database is a file your application opens. It is the do-less contender: nothing to operate, and nothing to fail over.
- **MariaDB** — The GPLv2 community fork of MySQL, mostly compatible and steadily diverging in features. Amazon RDS runs it as an engine; the other two major clouds do not, so check managed availability before you commit.
- **CockroachDB** — Distributed SQL that speaks the PostgreSQL wire protocol and keeps serving when a node disappears. Source-available under the CockroachDB enterprise license since November 2024 — free under $10M annual revenue, paid above — and run by its vendor rather than sold as a first-party cloud engine.

## How they compare
<!--meta block=matrix-->

| Criterion | PostgreSQL | MySQL | MariaDB | SQLite | CockroachDB |
| --- | --- | --- | --- | --- | --- |
| License | PostgreSQL License, permissive | GPLv2, Oracle-owned | GPLv2, community fork | Public domain | Source-available, enterprise license |
| What you run | A server process | A server process | A server process | A library in your process | A cluster of nodes |
| Write scale past one node | Split the data yourself | Split the data yourself | Split the data yourself | One writer, by design | Any node accepts writes |
| Managed by the big three clouds | All three | All three | Amazon RDS; not everywhere | Nothing to manage | Vendor-operated service |
| Extension ecosystem | Widest: PostGIS, pgvector | Plugins, narrower | MySQL plugins plus its own | Built-in modules only | Wire protocol, not the extensions |
| What compatibility buys you | The protocol others copy | MariaDB and its forks speak it | Mostly MySQL, drifting | A file format readable anywhere | Your driver ports; your SQL may not |
| Self-hosted ops burden | Backups and failover are yours | Backups and failover are yours | Backups and failover are yours | Copy the file | Rebalancing is automatic, the cluster is not |
| Reads at scale | Async replicas, lag included | Async replicas, lag included | Async replicas, lag included | Local reads, no lag to have | Follower reads, slightly stale |
| Transactions spanning regions | One primary; remote writes pay the trip | One primary; remote writes pay the trip | One primary; remote writes pay the trip | Out of scope | Quorum per commit; latency is the bill |
| Cost as you grow | License free at any size | License free at any size | License free at any size | License free at any size | Paid above $10M annual revenue |

## Choosing between them
<!--meta block=choosing-->

Default to PostgreSQL and make yourself argue for leaving it. The license constrains nothing, every major cloud rents it managed, and the extension ecosystem means the next requirement — geospatial queries, vector search — usually arrives as an extension instead of a second datastore to operate.

Choose MySQL when the team, the ORM (object-relational mapper) and the runbooks are already there, because that familiarity outweighs any feature you would gain by switching. Choose SQLite when the whole database fits on one machine with one writer: you delete the server, the connection pool and the failover story in one move, and you get back a file you can copy. Reach for MariaDB when you want the MySQL you know under community governance, and treat today's compatibility as a fact rather than a promise.

Take CockroachDB only when you genuinely need writes in more than one region with SQL semantics intact. Exhaust the cheaper answers first: [replication](../patterns/distributed/coordination/replication.md) buys read capacity and a standby you can promote, and [sharding](../patterns/distributed/routing/sharding.md) buys write capacity for the price of routing every query by key. Distributed SQL is those two done for you, and it charges commit latency and a license for the service.

The cloud's own compatible engines are the third trade. Aurora and AlloyDB keep the PostgreSQL or MySQL engine and replace the storage layer, buying failover and scaling you cannot reproduce on your own hardware. Azure SQL Database is a different question again: it runs the Microsoft SQL Server engine, so moving to it is a migration rather than a managed version of what you already have.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Replication](../patterns/distributed/coordination/replication.md) — Read replicas are how the single-writer engines grow before you shard.
- [Sharding](../patterns/distributed/routing/sharding.md) — Splitting by key is the write-scale answer the single-writer engines leave to you.

**Specializes**

- [Databases](../capabilities/databases.md) — The engines behind the managed relational offerings — license, scale story and exit cost.

**Implements**

- [Quorum & Consensus](../patterns/distributed/coordination/quorum-consensus.md) — A transaction spanning regions costs a quorum round trip per commit, which is the line between one primary and many.
- [Write-Ahead Log](../patterns/distributed/coordination/write-ahead-log.md) — Every engine here writes its intent to a log before the page, which is what makes crash recovery and replication possible at all.

<!-- relationships:end -->
