# SKYCONTROL Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: `/users/{userId}` can only be read (`get`) or written by the verified authenticated user whose `request.auth.uid == userId`. Collection listing on `/users` is explicitly forbidden (`allow list: if false`).
2. **Scenario Ownership & Query Isolation**: `/scenarios/{scenarioId}` documents must carry `ownerId == request.auth.uid`, validated on create, immutable on update, and enforced directly in `allow list` via `resource.data.ownerId == request.auth.uid`.
3. **Certification Integrity**: A controller cannot set `certified: true` unless `completedMissions` contains all 5 official mission IDs (`mission_1`..`mission_5`) alongside valid `certificateId` and `issuedAt` values.
4. **Immutable Audit Fields & Server Time**: `uid`, `id`, `ownerId`, and `createdAt` are immutable after creation. All `createdAt` and `updatedAt` timestamps must match `request.time`.
5. **Bounded Payload & Key Whitelisting**: Every create enforces `hasAll` + `hasOnly`, every update partitions mutations into action branches using `affectedKeys().hasOnly(...)`, and every string/list has strict `.size()` bounds.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read** on `/users/u1` (`request.auth == null`).
2. **Unverified email write** (`request.auth.token.email_verified == false`) on `/scenarios/s1`.
3. **Cross-user profile read** (`auth.uid = 'u2'` reading `/users/u1`).
4. **Users collection scrape** (`list /users`).
5. **Shadow ghost field injection** (`{ ...validUser, isAdmin: true }`) on create or update.
6. **Fake certification shortcut** (`certified: true` with only `['mission_1']` in `completedMissions`).
7. **Invalid mission ID injection** in `completedMissions` (`['mission_99']`).
8. **Client-forged timestamp** (`createdAt` != `request.time`).
9. **ID poisoning attack** (`scenarioId` = 200 chars or contains `$`/spaces).
10. **Cross-user scenario listing bypass** (`list /scenarios` without matching `ownerId == auth.uid`).
11. **Scenario ownership hijack on update** (attempting to change `ownerId` or `createdAt`).
12. **Out-of-bounds weather/airport injection** (`airportIcao: 'XXXX'` or `windSpeed: 999`).
