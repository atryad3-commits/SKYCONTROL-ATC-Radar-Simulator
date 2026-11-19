# SKYCONTROL Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: `/users/{userId}`, `/users/{userId}/settings/preferences`, and `/users/{userId}/activities/{activityId}` can only be read (`get`/`list` where permitted) or written by the verified authenticated user whose `request.auth.uid == userId`. Collection listing on `/users` and `/users/{userId}/settings` is explicitly forbidden (`allow list: if false`).
2. **Master Gate Relational Sync**: All writes into `/users/{userId}/settings/{settingId}` and `/users/{userId}/activities/{activityId}` verify `exists(/databases/$(database)/documents/users/$(userId))` and `get(...).data.uid == request.auth.uid`.
3. **Scenario Ownership & Query Isolation**: `/scenarios/{scenarioId}` documents must carry `ownerId == request.auth.uid`, validated on create, immutable on update, and enforced directly in `allow list` via `resource.data.ownerId == request.auth.uid`. All 16 supported airport ICAOs are whitelisted explicitly.
4. **Certification Integrity**: A controller cannot set `certified: true` unless `completedMissions` contains all 5 official mission IDs (`mission_1`..`mission_5`) alongside valid `certificateId` and `issuedAt` values.
5. **Immutable Audit Fields & Server Time**: `uid`, `id`, `ownerId`, `authProvider`, and `createdAt` are immutable after creation. All `createdAt` and `updatedAt` timestamps must match `request.time`. Activity logbook entries are append-only (no `update` allowed).
6. **Bounded Payload & Key Whitelisting**: Every create enforces `hasAll` + `hasOnly`, every update partitions mutations into action branches using `affectedKeys().hasOnly(...)`, and every string, map, and list has strict `.size()` and key whitelist bounds.

## 2. Adversarial "Dirty Dozen+" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read** on `/users/u1` or `/users/u1/settings/preferences` (`request.auth == null`).
2. **Unverified email write** (`request.auth.token.email_verified == false`) on `/users/u1` or `/scenarios/s1`.
3. **Cross-user profile, settings, or logbook read** (`auth.uid = 'u2'` reading `/users/u1`, `/users/u1/settings/preferences`, or listing `/users/u1/activities`).
4. **Users collection scrape** (`list /users` or `list /users/u1/settings`).
5. **Shadow ghost field injection** (`{ ...validUser, isAdmin: true }` or extra keys inside `radarLayers` or `perAirportVisibility`) on create or update.
6. **Fake certification shortcut** (`certified: true` with only `['mission_1']` in `completedMissions`).
7. **Invalid mission ID injection** in `completedMissions` (`['mission_99']`).
8. **Client-forged timestamp** (`createdAt` != `request.time`).
9. **ID poisoning attack** (`activityId` or `scenarioId` = 200 chars or contains `$`/spaces).
10. **Cross-user scenario listing bypass** (`list /scenarios` without matching `ownerId == auth.uid`).
11. **Scenario or activity tampering on update** (attempting to update `/users/u1/activities/act_1`, change `ownerId`, or alter `createdAt`).
12. **Arbitrary settings document creation** (`/users/u1/settings/arbitrary_key`) or out-of-bounds airport/weather injection (`airportIcao: 'XXXX'`, `audioVolume: 5`, `windSpeed: 999`).
13. **Orphaned subcollection write** creating `/users/u1/activities/a1` before parent `/users/u1` exists.
