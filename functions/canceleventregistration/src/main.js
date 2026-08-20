const ACTIVE_STATUSES = new Set(["confirmed", "promoted", "waitlisted"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "promoted"]);
const INACTIVE_EVENT_STATUSES = new Set(["cancelled", "canceled", "inactive", "archived", "draft", "completed"]);
const MAX_TRANSACTION_ATTEMPTS = 4;
const TRANSACTION_TTL_SECONDS = 30;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);

    const rawRequestedEventId = asString(body.eventId);
    const requestedEventId = appwriteIdentifier(rawRequestedEventId);
    if (body.eventId != null && body.eventId !== "" && !requestedEventId) {
      return res.json({ messageKey: "events.error.requestFailed" }, 400);
    }
    const event = requestedEventId
      ? await getRow(config, config.eventsTableId, requestedEventId)
      : await getUpcomingEvent(config);

    const eventId = appwriteIdentifier(event?.$id);
    if (!eventId || !isActiveFutureEvent(event)) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    const result = await cancelWithTransaction(config, eventId, currentUserId);
    return res.json(result.payload, result.statusCode);
  } catch (err) {
    const detail = JSON.stringify({
      event: "canceleventregistration.failed",
      statusCode: err?.statusCode ?? 500,
      type: asString(err?.type) ?? "internal_error"
    });
    if (typeof error === "function") {
      error(detail);
    } else {
      console.error(detail);
    }
    const statusCode = err?.statusCode === 401 || err?.statusCode === 403
      ? err.statusCode
      : 500;
    return res.json({ messageKey: "events.error.requestFailed" }, statusCode);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredIdentifierEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredIdentifierEnv("APPWRITE_DATABASE_ID"),
    eventsTableId: requiredIdentifierEnv("APPWRITE_EVENTS_TABLE_ID"),
    eventRegistrationsTableId: requiredIdentifierEnv("APPWRITE_EVENT_REGISTRATIONS_TABLE_ID")
  };
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

async function resolveCurrentUserId(config, req, body) {
  const userId = await fetchUserIdFromJwt(config);
  const headerUserId = asString(optionalHeader(req, "x-appwrite-user-id"));
  const bodyUserId = asString(body.currentUserId);

  if ((headerUserId && headerUserId !== userId) || (bodyUserId && bodyUserId !== userId)) {
    throw authError("Authenticated user mismatch");
  }
  return userId;
}

async function fetchUserIdFromJwt(config) {
  if (!config.userJwt) {
    throw authError("Missing user JWT", 401);
  }

  const response = await fetch(`${config.endpoint}/account`, {
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-JWT": config.userJwt,
      "X-Appwrite-Response-Format": "1.8.0"
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw authError("Invalid user JWT", 401);
  }
  const userId = appwriteIdentifier(payload.$id);
  if (!userId) {
    throw authError("Invalid user JWT", 401);
  }
  return userId;
}

function authError(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function cancelWithTransaction(config, eventId, currentUserId) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;

    try {
      transactionId = await createTransaction(config);
      const event = await getRow(config, config.eventsTableId, eventId, transactionId);
      if (!isActiveFutureEvent(event)) {
        await rollbackTransaction(config, transactionId);
        return { payload: { messageKey: "events.error.notRegistered" }, statusCode: 404 };
      }

      const registrations = await listAllRows(
        config,
        config.eventRegistrationsTableId,
        [equal("eventId", [eventId])],
        100,
        transactionId
      );
      const currentRegistration = registrations.find((row) => (
        resolveUserId(row) === currentUserId
        && ACTIVE_STATUSES.has(normalizeStatus(row.status))
      ));
      if (!currentRegistration) {
        await rollbackTransaction(config, transactionId);
        return { payload: { messageKey: "events.error.notRegistered" }, statusCode: 404 };
      }

      // Deliberately ignore body.force: only server state decides whether cancellation is open.
      const cancellationClosesAt = parseDate(event.cancellationClosesAt);
      if (cancellationClosesAt && Date.now() >= cancellationClosesAt.getTime()) {
        await rollbackTransaction(config, transactionId);
        return { payload: { messageKey: "events.error.cancellationClosed" }, statusCode: 409 };
      }

      const now = new Date().toISOString();
      const candidate = CONFIRMED_STATUSES.has(normalizeStatus(currentRegistration.status))
        ? selectPromotionCandidate(registrations, currentRegistration)
        : null;
      const projectedRegistrations = registrations.map((registration) => {
        if (registration.$id === currentRegistration.$id) {
          return { ...registration, status: "cancelled" };
        }
        if (candidate?.$id && registration.$id === candidate.$id) {
          return { ...registration, status: "promoted" };
        }
        return registration;
      });
      const counters = eventCounters(projectedRegistrations);
      await updateRow(
        config,
        config.eventsTableId,
        eventId,
        counters,
        transactionId
      );
      await updateRow(config, config.eventRegistrationsTableId, currentRegistration.$id, {
        status: "cancelled",
        cancelledAt: now
      }, transactionId);

      if (candidate?.$id) {
        await updateRow(config, config.eventRegistrationsTableId, candidate.$id, {
          status: "promoted",
          cancelledAt: null,
          promotedAt: now
        }, transactionId);
      }

      await commitTransaction(config, transactionId);
      return { payload: { status: "cancelled", eventId, counters }, statusCode: 200 };
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

  throw new Error("Unable to commit cancellation transaction");
}

async function getUpcomingEvent(config) {
  const rows = await listRows(config, config.eventsTableId, [
    equal("status", ["active"]),
    greaterThanEqual("startsAt", [new Date().toISOString()]),
    orderAsc("startsAt"),
    limit(1)
  ]);
  return rows.find((row) => isActiveFutureEvent(row)) ?? null;
}

export function eventCounters(registrations) {
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
    if (asString(registration.gender) === "male") {
      maleCount += 1;
    } else if (asString(registration.gender) === "female") {
      femaleCount += 1;
    }
  }
  return { maleCount, femaleCount, waitingListCount };
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

async function listAllRows(config, tableId, baseQueries, pageSize = 100, transactionId = null) {
  const rows = [];
  let page = 0;

  while (true) {
    const batch = await listRows(config, tableId, [
      ...baseQueries,
      limit(pageSize),
      offset(page * pageSize)
    ], transactionId);
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }

    page += 1;
  }
}

async function updateRow(config, tableId, rowId, data, transactionId = null) {
  return request(config, "PATCH", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`, {
    data,
    ...(transactionId ? { transactionId } : {})
  });
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

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function greaterThanEqual(field, values) {
  return JSON.stringify({ method: "greaterThanEqual", attribute: field, values });
}

function orderAsc(field) {
  return JSON.stringify({ method: "orderAsc", attribute: field });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function offset(value) {
  return JSON.stringify({ method: "offset", values: [value] });
}

function isConflictError(err) {
  const type = String(err?.type ?? "").toLowerCase();
  return err?.statusCode === 409 || type.includes("conflict");
}

function isActiveFutureEvent(event, now = Date.now()) {
  if (!event || INACTIVE_EVENT_STATUSES.has(normalizeStatus(event.status))) {
    return false;
  }
  const startsAt = parseDate(event.startsAt);
  return Boolean(startsAt && startsAt.getTime() > now);
}

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function selectPromotionCandidate(registrations, cancelledRegistration) {
  return registrations
    .filter((row) => (
      normalizeStatus(row.status) === "waitlisted"
      && row.gender === cancelledRegistration.gender
    ))
    .sort((lhs, rhs) => {
      const left = parseDate(lhs.createdAt ?? lhs.$createdAt)?.getTime() ?? 0;
      const right = parseDate(rhs.createdAt ?? rhs.$createdAt)?.getTime() ?? 0;
      return left - right;
    })[0] ?? null;
}

function resolveUserId(row) {
  return asString(row?.userId) ?? asString(row?.userid);
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function parseDate(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
