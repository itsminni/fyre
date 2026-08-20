import { createHash } from "node:crypto";

const ACTIVE_STATUSES = new Set(["confirmed", "promoted", "waitlisted"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "promoted"]);
const ADMIN_MUTABLE_STATUSES = new Set(["confirmed", "waitlisted", "promoted"]);
const EVENT_STATUSES = new Set(["active", "draft", "cancelled", "completed", "archived"]);
const MAX_TRANSACTION_ATTEMPTS = 4;
const TRANSACTION_TTL_SECONDS = 30;
const MAX_EVENT_CAPACITY = 500;
const DEFAULT_PARTICIPANT_PAGE_LIMIT = 50;
const MAX_PARTICIPANT_PAGE_LIMIT = 100;
const ACTIVE_REGISTRATION_PAGE_SIZE = 100;
const MAX_ACTIVE_REGISTRATION_ROWS = 1_000;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const identity = await resolveCurrentIdentity(config, req, body);
    ensureAdmin(config, identity);
    const action = asString(body.action) ?? "fetch";
    const requestedEventId = appwriteIdentifier(body.eventId);
    if (body.eventId != null && body.eventId !== "" && !requestedEventId) {
      throw eventError("events.admin.error.invalidEvent", 400);
    }
    const event = requestedEventId
      ? await getRow(config, config.eventsTableId, requestedEventId)
      : await getUpcomingEvent(config);

    const eventId = appwriteIdentifier(event?.$id);
    if (!eventId) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    if (action === "fetch") {
      return res.json(await makeAdminResponse(config, event, body), 200);
    }

    if (action === "updateEvent") {
      await updateEvent(config, eventId, body);
      const refreshed = await getRow(config, config.eventsTableId, eventId);
      return res.json(await makeAdminResponse(config, refreshed, body), 200);
    }

    if (action === "addParticipant") {
      await addParticipant(config, event, body);
      const refreshed = await getRow(config, config.eventsTableId, eventId);
      return res.json(await makeAdminResponse(config, refreshed, body), 200);
    }

    if (action === "removeParticipant") {
      await removeParticipant(config, event, body);
      const refreshed = await getRow(config, config.eventsTableId, eventId);
      return res.json(await makeAdminResponse(config, refreshed, body), 200);
    }

    return res.json({ messageKey: "events.admin.error.invalidAction" }, 400);
  } catch (err) {
    const detail = JSON.stringify({
      event: "manageeventadmin.failed",
      statusCode: err?.statusCode ?? 500,
      type: asString(err?.type) ?? "internal_error"
    });
    if (typeof error === "function") {
      error(detail);
    } else {
      console.error(detail);
    }

    if (err?.messageKey) {
      return res.json({ messageKey: err.messageKey }, err.statusCode ?? 400);
    }

    return res.json({ messageKey: "events.error.requestFailed" }, err?.statusCode ?? 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredIdentifierEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredIdentifierEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredIdentifierEnv("APPWRITE_PROFILES_TABLE_ID"),
    eventsTableId: requiredIdentifierEnv("APPWRITE_EVENTS_TABLE_ID"),
    eventRegistrationsTableId: requiredIdentifierEnv("APPWRITE_EVENT_REGISTRATIONS_TABLE_ID"),
    adminUserIds: parseIdentifierCSVEnv("APPWRITE_EVENT_ADMIN_USER_IDS"),
    adminEmails: parseCSVEnv("APPWRITE_EVENT_ADMIN_EMAILS", { lowercase: true })
  };
}

function ensureAdmin(config, identity) {
  if (config.adminUserIds.has(identity.userId)) {
    return;
  }
  if (identity.verifiedEmail && config.adminEmails.has(identity.verifiedEmail)) {
    return;
  }

  const err = new Error("Forbidden");
  err.messageKey = "events.admin.error.forbidden";
  err.statusCode = 403;
  throw err;
}

async function makeAdminResponse(config, event, body) {
  const participantLimit = validatedParticipantLimit(body.participantLimit);
  const participantCursor = optionalParticipantCursor(body.participantCursor);
  const registrationPage = await listRowsPage(config, config.eventRegistrationsTableId, [
    equal("eventId", [event.$id]),
    equal("status", Array.from(ACTIVE_STATUSES))
  ], participantCursor, participantLimit);
  const registrations = registrationPage.rows;
  const profilesByUserId = await getCanonicalProfiles(
    config,
    Array.from(new Set(registrations.map((row) => appwriteIdentifier(row.userId)).filter(Boolean)))
  );

  const participants = registrations
    .filter((registration) => ACTIVE_STATUSES.has(normalizeStatus(registration.status)))
    .map((registration) => {
      const status = normalizeStatus(registration.status);
      const userId = asString(registration.userId);
      const profile = userId ? profilesByUserId.get(userId) : null;

      return {
        registrationId: registration.$id,
        userId,
        email: asString(profile?.email) ?? asString(registration.email) ?? userId ?? "",
        firstName: asString(profile?.firstName),
        lastName: asString(profile?.lastName),
        displayName: displayName(
          asString(profile?.firstName),
          asString(profile?.lastName),
          asString(profile?.email),
          userId
        ),
        gender: asString(profile?.gender) ?? asString(registration.gender),
        status,
        createdAt: asString(registration.createdAt) ?? asString(registration.$createdAt)
      };
    });

  const maleCount = storedCounter(event.maleCount);
  const femaleCount = storedCounter(event.femaleCount);
  const waitingListCount = storedCounter(event.waitingListCount);

  return {
    isAdmin: true,
    event: {
      $id: event.$id,
      title: asString(event.title) ?? "Fyre Event",
      status: normalizeStatus(event.status),
      place: asString(event.place),
      description: asString(event.description),
      rules: asStringArray(event.rules),
      startsAt: asString(event.startsAt),
      maxParticipants: asNumber(event.maxParticipants) ?? 48,
      maleLimit: asNumber(event.maleLimit) ?? 24,
      femaleLimit: asNumber(event.femaleLimit) ?? 24,
      maleCount,
      femaleCount,
      waitingListCount,
      registrationClosesAt: asString(event.registrationClosesAt),
      cancellationClosesAt: asString(event.cancellationClosesAt)
    },
    participants,
    participantPage: {
      limit: participantLimit,
      nextCursor: registrationPage.nextCursor,
      total: maleCount + femaleCount + waitingListCount
    }
  };
}

async function updateEvent(config, eventId, body) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;
    try {
      transactionId = await createTransaction(config);
      const event = await getRow(config, config.eventsTableId, eventId, transactionId);
      const registrations = await listAllRows(
        config,
        config.eventRegistrationsTableId,
        [
          equal("eventId", [eventId]),
          equal("status", Array.from(ACTIVE_STATUSES))
        ],
        100,
        transactionId
      );
      const counters = calculateCounters(registrations);
      const payload = validatedEventUpdate(event, body, counters);
      const nextStatus = validatedEventStatus(payload.status ?? event.status);
      await updateRow(config, config.eventsTableId, eventId, {
        ...payload,
        maleCount: counters.maleCount,
        femaleCount: counters.femaleCount,
        waitingListCount: counters.waitingListCount
      }, eventPermissions(nextStatus), transactionId);
      await commitTransaction(config, transactionId);
      return;
    } catch (err) {
      if (transactionId) {
        await rollbackTransaction(config, transactionId);
      }
      if (isConflictError(err) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
}

async function addParticipant(config, event, body) {
  const lookup = asString(body.userLookup);
  const nextStatus = normalizeStatus(body.status);
  if (!lookup || !ADMIN_MUTABLE_STATUSES.has(nextStatus)) {
    const err = new Error("Invalid participant payload");
    err.messageKey = "events.admin.error.invalidParticipant";
    err.statusCode = 400;
    throw err;
  }

  const account = await findAccountByLookup(config, lookup);
  if (!account) {
    const err = new Error("Account not found");
    err.messageKey = "events.admin.error.userNotFound";
    err.statusCode = 404;
    throw err;
  }

  const userId = appwriteIdentifier(account.$id);
  let profile = null;
  if (userId) {
    try {
      profile = await getCanonicalProfile(config, userId);
    } catch (err) {
      if (err?.statusCode !== 404) {
        throw err;
      }
    }
  }
  if (!profile) {
    throw eventError("events.admin.error.userNotFound", 404);
  }
  const gender = asString(profile?.gender);
  if (!userId || (gender !== "male" && gender !== "female")) {
    const err = new Error("Unsupported profile");
    err.messageKey = "events.error.genderUnsupported";
    err.statusCode = 409;
    throw err;
  }

  await upsertParticipantWithTransaction(config, event.$id, userId, gender, nextStatus);
}

async function removeParticipant(config, event, body) {
  const registrationId = appwriteIdentifier(body.registrationId);
  if (!registrationId) {
    const err = new Error("Missing registration id");
    err.messageKey = "events.admin.error.invalidParticipant";
    err.statusCode = 400;
    throw err;
  }

  await removeParticipantWithTransaction(config, event.$id, registrationId);
}

async function upsertParticipantWithTransaction(config, eventId, userId, gender, nextStatus) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;
    try {
      transactionId = await createTransaction(config);
      const event = await getRow(config, config.eventsTableId, eventId, transactionId);
      const [registrations, existingRows] = await Promise.all([
        listAllRows(
          config,
          config.eventRegistrationsTableId,
          [
            equal("eventId", [eventId]),
            equal("status", Array.from(ACTIVE_STATUSES))
          ],
          100,
          transactionId
        ),
        listRows(config, config.eventRegistrationsTableId, [
          equal("eventId", [eventId]),
          equal("userId", [userId]),
          limit(2)
        ], transactionId)
      ]);
      const existing = existingRows.find((row) => (
        asString(row.eventId) === eventId && asString(row.userId) === userId
      ));
      const now = new Date().toISOString();
      const payload = {
        eventId,
        userId,
        gender,
        status: nextStatus,
        createdAt: asString(existing?.createdAt) ?? now,
        cancelledAt: null,
        promotedAt: nextStatus === "promoted" ? now : null
      };
      const nextRegistration = {
        ...existing,
        $id: existing?.$id ?? stableRegistrationRowId(eventId, userId),
        ...payload
      };
      const nextRegistrations = registrations
        .filter((row) => row.$id !== existing?.$id)
        .concat(nextRegistration);
      const counters = calculateCounters(nextRegistrations);

      if (CONFIRMED_STATUSES.has(nextStatus)) {
        const maxParticipants = boundedEventNumber(event.maxParticipants, 48, 2);
        const genderLimit = gender === "male"
          ? boundedEventNumber(event.maleLimit, 24)
          : boundedEventNumber(event.femaleLimit, 24);
        if (counters.confirmedCount > maxParticipants) {
          throw eventError("events.error.capacityFull", 409);
        }
        const genderCount = gender === "male" ? counters.maleCount : counters.femaleCount;
        if (genderCount > genderLimit) {
          throw eventError("events.error.capacityFull", 409);
        }
      }

      if (existing?.$id) {
        await updateRow(
          config,
          config.eventRegistrationsTableId,
          existing.$id,
          payload,
          registrationPermissions(userId),
          transactionId
        );
      } else {
        await createRow(
          config,
          config.eventRegistrationsTableId,
          stableRegistrationRowId(eventId, userId),
          payload,
          registrationPermissions(userId),
          transactionId
        );
      }
      await updateEventCounters(config, eventId, counters, transactionId);
      await commitTransaction(config, transactionId);
      return;
    } catch (err) {
      if (transactionId) {
        await rollbackTransaction(config, transactionId);
      }
      if (isConflictError(err) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
}

async function removeParticipantWithTransaction(config, eventId, registrationId) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;
    try {
      transactionId = await createTransaction(config);
      const event = await getRow(config, config.eventsTableId, eventId, transactionId);
      const registration = await getRow(
        config,
        config.eventRegistrationsTableId,
        registrationId,
        transactionId
      );
      if (asString(registration.eventId) !== eventId) {
        throw eventError("events.admin.error.invalidParticipant", 400);
      }

      const registrations = await listAllRows(
        config,
        config.eventRegistrationsTableId,
        [
          equal("eventId", [eventId]),
          equal("status", Array.from(ACTIVE_STATUSES))
        ],
        100,
        transactionId
      );
      const now = new Date().toISOString();
      const registrationUserId = asString(registration.userId);
      if (!registrationUserId) {
        throw eventError("events.admin.error.invalidParticipant", 400);
      }
      const cancelledRegistration = {
        ...registration,
        status: "cancelled",
        cancelledAt: now
      };
      let promotedCandidate = null;

      if (CONFIRMED_STATUSES.has(normalizeStatus(registration.status))) {
        promotedCandidate = registrations
          .filter((row) => (
            row.$id !== registration.$id
            &&
            normalizeStatus(row.status) === "waitlisted"
            && asString(row.gender) === asString(registration.gender)
          ))
          .sort((lhs, rhs) => {
            const left = parseDate(lhs.createdAt ?? lhs.$createdAt)?.getTime() ?? 0;
            const right = parseDate(rhs.createdAt ?? rhs.$createdAt)?.getTime() ?? 0;
            return left - right;
          })[0];
      }

      const nextRegistrations = registrations.map((row) => {
        if (row.$id === registration.$id) {
          return cancelledRegistration;
        }
        if (row.$id === promotedCandidate?.$id) {
          return { ...row, status: "promoted", cancelledAt: null, promotedAt: now };
        }
        return row;
      });
      const counters = calculateCounters(nextRegistrations);

      await updateRow(
        config,
        config.eventRegistrationsTableId,
        registration.$id,
        { status: "cancelled", cancelledAt: now },
        registrationPermissions(registrationUserId),
        transactionId
      );
      if (promotedCandidate?.$id) {
        const promotedUserId = asString(promotedCandidate.userId);
        if (!promotedUserId) {
          throw eventError("events.admin.error.invalidParticipant", 400);
        }
        await updateRow(config, config.eventRegistrationsTableId, promotedCandidate.$id, {
          status: "promoted",
          cancelledAt: null,
          promotedAt: now
        }, registrationPermissions(promotedUserId), transactionId);
      }
      await updateEventCounters(config, event.$id, counters, transactionId);

      await commitTransaction(config, transactionId);
      return;
    } catch (err) {
      if (transactionId) {
        await rollbackTransaction(config, transactionId);
      }
      if (isConflictError(err) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
}

function eventError(messageKey, statusCode) {
  const err = new Error(messageKey);
  err.messageKey = messageKey;
  err.statusCode = statusCode;
  return err;
}

async function findAccountByLookup(config, lookup) {
  if (!lookup.includes("@")) {
    try {
      if (!appwriteIdentifier(lookup)) {
        return null;
      }
      return await request(config, "GET", `/users/${pathSegment(lookup)}`);
    } catch (err) {
      if (err?.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  const normalizedEmail = normalizeEmailLookup(lookup);
  if (!normalizedEmail) {
    return null;
  }
  const payload = await request(config, "GET", "/users", undefined, [
    equal("email", [normalizedEmail]),
    limit(2)
  ]);
  const users = Array.isArray(payload.users) ? payload.users : [];
  return users.find((user) => normalizeEmailLookup(user.email) === normalizedEmail) ?? null;
}

async function getCanonicalProfile(config, userId) {
  const profile = await getRow(config, config.profilesTableId, userId);
  if (asString(profile.$id) !== userId || asString(profile.userId) !== userId) {
    throw eventError("events.admin.error.userNotFound", 404);
  }
  return profile;
}

async function getCanonicalProfiles(config, userIds) {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await listRows(config, config.profilesTableId, [
    equal("$id", userIds),
    orderAsc("$id"),
    limit(userIds.length)
  ]);
  const requestedIds = new Set(userIds);
  return new Map(
    rows
      .map((profile) => {
        const rowId = appwriteIdentifier(profile?.$id);
        const userId = appwriteIdentifier(profile?.userId);
        return rowId && rowId === userId && requestedIds.has(userId)
          ? [userId, profile]
          : null;
      })
      .filter(Boolean)
  );
}

function validatedEventUpdate(event, body, counters) {
  const payload = {};

  if (Object.hasOwn(body, "status")) {
    payload.status = validatedEventStatus(body.status);
  }
  if (Object.hasOwn(body, "title")) {
    payload.title = validatedText(body.title, "title", 200, { allowEmpty: false });
  }
  if (Object.hasOwn(body, "place")) {
    payload.place = validatedText(body.place, "place", 256, { allowEmpty: false });
  }
  if (Object.hasOwn(body, "description")) {
    payload.description = validatedText(body.description, "description", 4_000, { allowEmpty: true });
  }
  if (Object.hasOwn(body, "rules")) {
    if (!Array.isArray(body.rules) || body.rules.length > 50) {
      throw eventError("events.admin.error.invalidEvent", 400);
    }
    payload.rules = body.rules.map((rule) => validatedText(rule, "rule", 500, { allowEmpty: false }));
  }

  if (Object.hasOwn(body, "startsAt")) {
    payload.startsAt = requiredISODateString(body.startsAt);
  }
  if (Object.hasOwn(body, "maxParticipants")) {
    payload.maxParticipants = boundedInteger(body.maxParticipants, 2, MAX_EVENT_CAPACITY);
  }
  if (Object.hasOwn(body, "maleLimit")) {
    payload.maleLimit = boundedInteger(body.maleLimit, 0, MAX_EVENT_CAPACITY);
  }
  if (Object.hasOwn(body, "femaleLimit")) {
    payload.femaleLimit = boundedInteger(body.femaleLimit, 0, MAX_EVENT_CAPACITY);
  }
  if (Object.hasOwn(body, "registrationClosesAt")) {
    payload.registrationClosesAt = nullableISODateString(body.registrationClosesAt);
  }
  if (Object.hasOwn(body, "cancellationClosesAt")) {
    payload.cancellationClosesAt = nullableISODateString(body.cancellationClosesAt);
  }

  const startsAt = requiredISODateString(payload.startsAt ?? event.startsAt);
  for (const deadline of [
    Object.hasOwn(payload, "registrationClosesAt")
      ? payload.registrationClosesAt
      : event.registrationClosesAt,
    Object.hasOwn(payload, "cancellationClosesAt")
      ? payload.cancellationClosesAt
      : event.cancellationClosesAt
  ]) {
    if (deadline != null && requiredISODateString(deadline) > startsAt) {
      throw eventError("events.admin.error.invalidEvent", 400);
    }
  }

  const maxParticipants = payload.maxParticipants
    ?? boundedEventNumber(event.maxParticipants, 48, 2);
  const maleLimit = payload.maleLimit ?? boundedEventNumber(event.maleLimit, 24);
  const femaleLimit = payload.femaleLimit ?? boundedEventNumber(event.femaleLimit, 24);
  if (
    maxParticipants < counters.confirmedCount
    || maleLimit < counters.maleCount
    || femaleLimit < counters.femaleCount
  ) {
    throw eventError("events.admin.error.invalidEvent", 409);
  }

  return payload;
}

function calculateCounters(registrations) {
  let confirmedCount = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let waitingListCount = 0;

  for (const registration of registrations) {
    const status = normalizeStatus(registration.status);
    if (status === "waitlisted") {
      waitingListCount += 1;
      continue;
    }
    if (!CONFIRMED_STATUSES.has(status)) {
      continue;
    }
    confirmedCount += 1;
    if (asString(registration.gender) === "male") {
      maleCount += 1;
    } else if (asString(registration.gender) === "female") {
      femaleCount += 1;
    }
  }

  return { confirmedCount, maleCount, femaleCount, waitingListCount };
}

function storedCounter(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

async function updateEventCounters(config, eventId, counters, transactionId) {
  await updateRow(config, config.eventsTableId, eventId, {
    maleCount: counters.maleCount,
    femaleCount: counters.femaleCount,
    waitingListCount: counters.waitingListCount
  }, undefined, transactionId);
}

async function getUpcomingEvent(config) {
  const rows = await listRows(config, config.eventsTableId, [
    equal("status", ["active"]),
    greaterThanEqual("startsAt", [new Date().toISOString()]),
    orderAsc("startsAt"),
    limit(1)
  ]);
  return rows[0] ?? null;
}

function registrationPermissions(userId) {
  return [`read(\"user:${userId}\")`];
}

function eventPermissions(status) {
  return status === "active" ? ['read("users")'] : [];
}

async function getRow(config, tableId, rowId, transactionId = null) {
  return request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    undefined,
    [],
    transactionId ? { transactionId } : {}
  );
}

async function listRows(config, tableId, queries, transactionId = null) {
  const payload = await request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`,
    undefined,
    queries,
    transactionId ? { transactionId, ttl: 0 } : { ttl: 0 }
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function listAllRows(config, tableId, baseQueries, pageSize = ACTIVE_REGISTRATION_PAGE_SIZE, transactionId = null) {
  const rows = [];
  const seenIds = new Set();
  let cursor = null;
  const maximumPageCount = Math.ceil(MAX_ACTIVE_REGISTRATION_ROWS / pageSize) + 1;
  for (let page = 0; page < maximumPageCount && rows.length < MAX_ACTIVE_REGISTRATION_ROWS; page += 1) {
    const remaining = MAX_ACTIVE_REGISTRATION_ROWS - rows.length;
    const requestLimit = Math.min(pageSize, remaining);
    const batch = await listRows(config, tableId, [
      ...baseQueries,
      orderAsc("$id"),
      ...(cursor ? [cursorAfter(cursor)] : []),
      limit(requestLimit)
    ], transactionId);

    if (batch.length > requestLimit) {
      throw registrationScanError();
    }
    if (batch.length === 0) {
      return rows;
    }

    const acceptedBatch = batch.slice(0, remaining);
    for (const row of acceptedBatch) {
      const rowId = appwriteIdentifier(row?.$id);
      if (!rowId || rowId === cursor || seenIds.has(rowId)) {
        throw registrationScanError();
      }
      seenIds.add(rowId);
      rows.push(row);
    }

    if (batch.length < requestLimit) {
      return rows;
    }

    cursor = appwriteIdentifier(acceptedBatch.at(-1)?.$id);
    if (!cursor) {
      throw registrationScanError();
    }
  }
  if (rows.length === MAX_ACTIVE_REGISTRATION_ROWS && cursor) {
    const probe = await listRows(config, tableId, [
      ...baseQueries,
      orderAsc("$id"),
      cursorAfter(cursor),
      limit(1)
    ], transactionId);
    if (probe.length === 0) {
      return rows;
    }
  }
  throw registrationScanError();
}

async function listRowsPage(config, tableId, baseQueries, initialCursor, pageLimit) {
  const batch = await listRows(config, tableId, [
    ...baseQueries,
    orderAsc("$id"),
    ...(initialCursor ? [cursorAfter(initialCursor)] : []),
    limit(pageLimit)
  ]);
  if (batch.length > pageLimit) {
    throw registrationScanError();
  }
  const rows = batch.slice(0, pageLimit);
  const seenIds = new Set();
  for (const row of rows) {
    const rowId = appwriteIdentifier(row?.$id);
    if (!rowId || rowId === initialCursor || seenIds.has(rowId)) {
      throw registrationScanError();
    }
    seenIds.add(rowId);
  }
  if (rows.length < pageLimit) {
    return { rows, nextCursor: null };
  }
  const lastId = appwriteIdentifier(rows.at(-1)?.$id);
  if (!lastId) {
    throw registrationScanError();
  }
  const probe = await listRows(config, tableId, [
    ...baseQueries,
    orderAsc("$id"),
    cursorAfter(lastId),
    limit(1)
  ]);
  if (probe.length === 0) {
    return { rows, nextCursor: null };
  }
  const probeId = appwriteIdentifier(probe[0]?.$id);
  if (!probeId || probeId === lastId || seenIds.has(probeId)) {
    throw registrationScanError();
  }
  return { rows, nextCursor: lastId };
}

function registrationScanError() {
  const err = new Error("Active registration scan exceeded its safe bound or returned an invalid page");
  err.statusCode = 503;
  return err;
}

function validatedParticipantLimit(value) {
  if (value == null || value === "") {
    return DEFAULT_PARTICIPANT_PAGE_LIMIT;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PARTICIPANT_PAGE_LIMIT) {
    throw eventError("events.admin.error.invalidParticipant", 400);
  }
  return value;
}

function optionalParticipantCursor(value) {
  if (value == null || value === "") {
    return null;
  }
  const cursor = appwriteIdentifier(value);
  if (!cursor) {
    throw eventError("events.admin.error.invalidParticipant", 400);
  }
  return cursor;
}

async function createRow(config, tableId, rowId, data, permissions, transactionId = null) {
  return request(config, "POST", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`, {
    rowId,
    data,
    permissions,
    ...(transactionId ? { transactionId } : {})
  });
}

async function updateRow(config, tableId, rowId, data, permissions, transactionId = null) {
  const payload = { data };
  // Appwrite inherits the current ACL when this field is omitted. An explicit
  // empty array is therefore required when an event leaves the active state.
  if (Array.isArray(permissions)) {
    payload.permissions = permissions;
  }
  if (transactionId) {
    payload.transactionId = transactionId;
  }
  return request(
    config,
    "PATCH",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    payload
  );
}

async function createTransaction(config) {
  const transaction = await request(config, "POST", "/tablesdb/transactions", {
    ttl: TRANSACTION_TTL_SECONDS
  });
  const transactionId = appwriteIdentifier(transaction.$id);
  if (!transactionId) {
    throw new Error("Appwrite did not return a transaction id");
  }
  return transactionId;
}

async function commitTransaction(config, transactionId) {
  await request(config, "PATCH", `/tablesdb/transactions/${pathSegment(transactionId)}`, { commit: true });
}

async function rollbackTransaction(config, transactionId) {
  try {
    await request(config, "PATCH", `/tablesdb/transactions/${pathSegment(transactionId)}`, { rollback: true });
  } catch {
    // A committed, expired, or conflict-aborted transaction needs no further cleanup.
  }
}

async function request(config, method, path, body, queries = [], queryParameters = {}) {
  const url = new URL(`${config.endpoint}${path}`);
  for (const query of queries) {
    url.searchParams.append("queries[]", query);
  }
  for (const [key, value] of Object.entries(queryParameters)) {
    url.searchParams.set(key, String(value));
  }

  if (!config.apiKey) {
    throw new Error("Missing Appwrite server API key");
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Key": config.apiKey,
      "X-Appwrite-Response-Format": "1.8.0"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = parseJSONSafely(text);
  if (response.ok) {
    return payload;
  }

  const err = new Error(payload.message ?? `Request failed with status ${response.status}`);
  err.statusCode = response.status;
  err.type = asString(payload.type);
  throw err;
}

function parseBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }

  if (!req.bodyText) {
    return {};
  }

  try {
    return JSON.parse(req.bodyText);
  } catch {
    return {};
  }
}

function parseCSVEnv(name, options = {}) {
  return new Set(
    String(process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .map((value) => options.lowercase ? value.toLowerCase() : value)
      .filter(Boolean)
  );
}

function parseIdentifierCSVEnv(name) {
  const values = parseCSVEnv(name);
  for (const value of values) {
    if (!appwriteIdentifier(value)) {
      throw new Error(`Invalid environment variable ${name}`);
    }
  }
  return values;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function requiredIdentifierEnv(name) {
  const value = requiredEnv(name);
  if (!appwriteIdentifier(value)) {
    throw new Error(`Invalid environment variable ${name}`);
  }
  return value;
}

function optionalHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function resolveApiKey(req) {
  const runtimeKey = optionalHeader(req, "x-appwrite-key");
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  throw new Error("Missing Appwrite function runtime key");
}

async function resolveCurrentIdentity(config, req, body) {
  const identity = await fetchIdentityFromJwt(config);
  const headerUserId = asString(optionalHeader(req, "x-appwrite-user-id"));
  const bodyUserId = asString(body.currentUserId);

  if (
    (headerUserId && headerUserId !== identity.userId)
    || (bodyUserId && bodyUserId !== identity.userId)
  ) {
    const err = new Error("Authenticated user mismatch");
    err.messageKey = "events.admin.error.forbidden";
    err.statusCode = 403;
    throw err;
  }
  return identity;
}

async function fetchIdentityFromJwt(config) {
  if (!config.userJwt) {
    const err = new Error("Missing user JWT");
    err.statusCode = 401;
    throw err;
  }

  const response = await fetch(`${config.endpoint}/account`, {
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-JWT": config.userJwt,
      "X-Appwrite-Response-Format": "1.8.0"
    }
  });
  const payload = await response.json().catch(() => ({}));
  const userId = response.ok ? appwriteIdentifier(payload.$id) : null;
  if (!userId) {
    const err = new Error("Invalid user JWT");
    err.statusCode = 401;
    throw err;
  }
  const canonicalEmail = normalizeEmailLookup(payload.email);
  return {
    userId,
    verifiedEmail: payload.emailVerification === true && canonicalEmail
      ? canonicalEmail
      : null
  };
}

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function greaterThanEqual(field, values) {
  return JSON.stringify({ method: "greaterThanEqual", attribute: field, values });
}

function orderAsc(field) {
  return JSON.stringify({ method: "orderAsc", attribute: field });
}

function cursorAfter(value) {
  return JSON.stringify({ method: "cursorAfter", values: [value] });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function parseJSONSafely(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function displayName(firstName, lastName, email, fallback) {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (full) {
    return full;
  }
  if (email) {
    return email.split("@")[0];
  }
  return fallback ?? "Participant";
}

function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validatedEventStatus(value) {
  const status = normalizeStatus(value);
  if (!EVENT_STATUSES.has(status)) {
    throw eventError("events.admin.error.invalidEvent", 400);
  }
  return status;
}

function asString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asString).filter(Boolean);
}

function validatedText(value, _field, maxLength, options = {}) {
  if (typeof value !== "string") {
    throw eventError("events.admin.error.invalidEvent", 400);
  }
  const text = value.trim();
  if ((!options.allowEmpty && !text) || text.length > maxLength) {
    throw eventError("events.admin.error.invalidEvent", 400);
  }
  return text;
}

function normalizeEmailLookup(value) {
  return asString(value)?.toLowerCase() ?? "";
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInteger(value) {
  const parsed = asNumber(value);
  return parsed != null && Number.isInteger(parsed) ? parsed : null;
}

function boundedInteger(value, minimum, maximum) {
  const parsed = asInteger(value);
  if (parsed == null || parsed < minimum || parsed > maximum) {
    throw eventError("events.admin.error.invalidEvent", 400);
  }
  return parsed;
}

function boundedEventNumber(value, fallback, minimum = 0) {
  const parsed = asInteger(value);
  return parsed != null && parsed >= minimum && parsed <= MAX_EVENT_CAPACITY
    ? parsed
    : fallback;
}

function requiredISODateString(value) {
  const text = asString(value);
  const match = text?.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
  );
  if (!text || !match) {
    throw eventError("events.admin.error.invalidEvent", 400);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  const parsed = new Date(text);
  if (
    day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59
    || Number.isNaN(parsed.getTime())
  ) {
    throw eventError("events.admin.error.invalidEvent", 400);
  }
  return parsed.toISOString();
}

function nullableISODateString(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  return requiredISODateString(value);
}

function stableRegistrationRowId(eventId, userId) {
  return `reg_${createHash("sha256").update(`${eventId}:${userId}`).digest("hex").slice(0, 32)}`;
}

function isConflictError(err) {
  const message = String(err?.message ?? "").toLowerCase();
  const type = String(err?.type ?? "").toLowerCase();
  return (!err?.messageKey && err?.statusCode === 409)
    || type.includes("conflict")
    || message.includes("already exists");
}
