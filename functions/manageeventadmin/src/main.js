const ACTIVE_STATUSES = new Set(["confirmed", "promoted", "waitlisted"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "promoted"]);
const ADMIN_MUTABLE_STATUSES = new Set(["confirmed", "waitlisted", "promoted"]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = requiredHeader(req, "x-appwrite-user-id");
    const currentProfile = await getRow(config, config.profilesTableId, currentUserId);
    const action = asString(body.action) ?? "fetch";
    const event = body.eventId
      ? await getRow(config, config.eventsTableId, body.eventId)
      : await getUpcomingEvent(config);

    ensureAdmin(config, currentUserId, currentProfile, event);

    if (!event) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    if (action === "fetch") {
      return res.json(await makeAdminResponse(config, event), 200);
    }

    if (action === "updateEvent") {
      await updateEvent(config, event.$id, body);
      const refreshed = await getRow(config, config.eventsTableId, event.$id);
      return res.json(await makeAdminResponse(config, refreshed), 200);
    }

    if (action === "addParticipant") {
      await addParticipant(config, event, body);
      const refreshed = await getRow(config, config.eventsTableId, event.$id);
      return res.json(await makeAdminResponse(config, refreshed), 200);
    }

    if (action === "removeParticipant") {
      await removeParticipant(config, event, body);
      const refreshed = await getRow(config, config.eventsTableId, event.$id);
      return res.json(await makeAdminResponse(config, refreshed), 200);
    }

    return res.json({ messageKey: "events.admin.error.invalidAction" }, 400);
  } catch (err) {
    const detail = String(err?.stack ?? err);
    if (typeof error === "function") {
      error(detail);
    } else {
      console.error(detail);
    }

    if (err?.messageKey) {
      return res.json({ messageKey: err.messageKey }, err.statusCode ?? 400);
    }

    return res.json({
      messageKey: "events.error.requestFailed",
      message: String(err?.message ?? err)
    }, err?.statusCode ?? 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredEnv("APPWRITE_PROFILES_TABLE_ID"),
    eventsTableId: requiredEnv("APPWRITE_EVENTS_TABLE_ID"),
    eventRegistrationsTableId: requiredEnv("APPWRITE_EVENT_REGISTRATIONS_TABLE_ID"),
    adminUserIds: parseCSVEnv("APPWRITE_EVENT_ADMIN_USER_IDS"),
    adminEmails: parseCSVEnv("APPWRITE_EVENT_ADMIN_EMAILS")
  };
}

function ensureAdmin(config, currentUserId, currentProfile, event) {
  const currentEmail = asString(currentProfile.email)?.toLowerCase();
  const scopedUserIds = parseCSVValue(event?.adminUserIds);
  const scopedEmails = parseCSVValue(event?.adminEmails, { lowercase: true });

  if (scopedUserIds.size || scopedEmails.size) {
    if (scopedUserIds.has(currentUserId)) {
      return;
    }
    if (currentEmail && scopedEmails.has(currentEmail)) {
      return;
    }
  } else {
    if (config.adminUserIds.has(currentUserId)) {
      return;
    }
    if (currentEmail && config.adminEmails.has(currentEmail)) {
      return;
    }
  }

  const err = new Error("Forbidden");
  err.messageKey = "events.admin.error.forbidden";
  err.statusCode = 403;
  throw err;
}

async function makeAdminResponse(config, event) {
  const registrations = await listRows(config, config.eventRegistrationsTableId, [
    equal("eventId", [event.$id]),
    limit(500)
  ]);

  const participants = [];
  for (const registration of registrations) {
    const status = normalizeStatus(registration.status);
    if (!ACTIVE_STATUSES.has(status)) {
      continue;
    }

    const userId = asString(registration.userId);
    let profile = null;
    if (userId) {
      try {
        profile = await getRow(config, config.profilesTableId, userId);
      } catch {
        profile = null;
      }
    }

    participants.push({
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
    });
  }

  participants.sort((lhs, rhs) => {
    if (sortOrder(lhs.status) === sortOrder(rhs.status)) {
      return String(lhs.createdAt ?? "").localeCompare(String(rhs.createdAt ?? ""));
    }
    return sortOrder(lhs.status) - sortOrder(rhs.status);
  });

  return {
    isAdmin: true,
    event: {
      $id: event.$id,
      title: asString(event.title) ?? "Fyre Event",
      startsAt: asString(event.startsAt),
      maxParticipants: asNumber(event.maxParticipants) ?? 48,
      maleLimit: asNumber(event.maleLimit) ?? 24,
      femaleLimit: asNumber(event.femaleLimit) ?? 24,
      registrationClosesAt: asString(event.registrationClosesAt),
      cancellationClosesAt: asString(event.cancellationClosesAt),
      adminUserIds: csvStringFromValue(event.adminUserIds),
      adminEmails: csvStringFromValue(event.adminEmails, { lowercase: true })
    },
    participants
  };
}

async function updateEvent(config, eventId, body) {
  const payload = {};
  const title = asString(body.title);
  if (title) {
    payload.title = title;
  }

  const startsAt = asDateString(body.startsAt);
  if (startsAt) {
    payload.startsAt = startsAt;
  }

  const maxParticipants = asInteger(body.maxParticipants);
  if (maxParticipants != null) {
    payload.maxParticipants = maxParticipants;
  }

  const maleLimit = asInteger(body.maleLimit);
  if (maleLimit != null) {
    payload.maleLimit = maleLimit;
  }

  const femaleLimit = asInteger(body.femaleLimit);
  if (femaleLimit != null) {
    payload.femaleLimit = femaleLimit;
  }

  payload.adminUserIds = nullableCSVText(body.adminUserIds);
  payload.adminEmails = nullableCSVText(body.adminEmails, { lowercase: true });
  payload.registrationClosesAt = body.registrationClosesAt ? asDateString(body.registrationClosesAt) : null;
  payload.cancellationClosesAt = body.cancellationClosesAt ? asDateString(body.cancellationClosesAt) : null;

  await updateRow(config, config.eventsTableId, eventId, payload);
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

  const profile = await findProfileByLookup(config, lookup);
  if (!profile) {
    const err = new Error(`Profile not found for lookup: ${lookup}`);
    err.messageKey = "events.admin.error.userNotFound";
    err.statusCode = 404;
    throw err;
  }

  const userId = asString(profile.userId) ?? asString(profile.$id);
  const gender = asString(profile.gender);
  if (!userId || (gender !== "male" && gender !== "female")) {
    const err = new Error("Unsupported profile");
    err.messageKey = "events.error.genderUnsupported";
    err.statusCode = 409;
    throw err;
  }

  const registrations = await listRows(config, config.eventRegistrationsTableId, [
    equal("eventId", [event.$id]),
    limit(500)
  ]);
  const existing = registrations.find((row) => asString(row.userId) === userId);
  const now = new Date().toISOString();

  if (existing?.$id) {
    await updateRow(config, config.eventRegistrationsTableId, existing.$id, {
      eventId: event.$id,
      userId,
      gender,
      status: nextStatus,
      createdAt: asString(existing.createdAt) ?? now,
      cancelledAt: null,
      promotedAt: nextStatus === "promoted" ? now : null
    }, registrationPermissions(userId));
    return;
  }

  await createRow(config, config.eventRegistrationsTableId, uniqueId(), {
    eventId: event.$id,
    userId,
    gender,
    status: nextStatus,
    createdAt: now,
    cancelledAt: null,
    promotedAt: nextStatus === "promoted" ? now : null
  }, registrationPermissions(userId));
}

async function removeParticipant(config, event, body) {
  const registrationId = asString(body.registrationId);
  if (!registrationId) {
    const err = new Error("Missing registration id");
    err.messageKey = "events.admin.error.invalidParticipant";
    err.statusCode = 400;
    throw err;
  }

  const registration = await getRow(config, config.eventRegistrationsTableId, registrationId);
  if (asString(registration.eventId) !== event.$id) {
    const err = new Error("Registration mismatch");
    err.messageKey = "events.admin.error.invalidParticipant";
    err.statusCode = 400;
    throw err;
  }

  const now = new Date().toISOString();
  await updateRow(config, config.eventRegistrationsTableId, registration.$id, {
    status: "cancelled",
    cancelledAt: now
  });

  if (CONFIRMED_STATUSES.has(normalizeStatus(registration.status))) {
    const registrations = await listRows(config, config.eventRegistrationsTableId, [
      equal("eventId", [event.$id]),
      limit(500)
    ]);
    const candidate = registrations
      .filter((row) => normalizeStatus(row.status) === "waitlisted" && asString(row.gender) === asString(registration.gender))
      .sort((lhs, rhs) => {
        const left = parseDate(lhs.createdAt ?? lhs.$createdAt)?.getTime() ?? 0;
        const right = parseDate(rhs.createdAt ?? rhs.$createdAt)?.getTime() ?? 0;
        return left - right;
      })[0];

    if (candidate?.$id) {
      await updateRow(config, config.eventRegistrationsTableId, candidate.$id, {
        status: "promoted",
        cancelledAt: null,
        promotedAt: now
      });
    }
  }
}

async function findProfileByLookup(config, lookup) {
  if (lookup.includes("@")) {
    return await findProfileByEmail(config, lookup);
  }

  try {
    return await getRow(config, config.profilesTableId, lookup);
  } catch {
    const rows = await listRows(config, config.profilesTableId, [
      equal("userId", [lookup]),
      limit(1)
    ]);
    return rows[0] ?? null;
  }
}

async function findProfileByEmail(config, lookup) {
  const normalizedLookup = normalizeEmailLookup(lookup);
  const exactMatches = [];

  if (normalizedLookup) {
    exactMatches.push(normalizedLookup);
  }
  if (lookup !== normalizedLookup) {
    exactMatches.push(lookup);
  }

  for (const candidate of exactMatches) {
    const rows = await listRows(config, config.profilesTableId, [
      equal("email", [candidate]),
      limit(1)
    ]);
    if (rows[0]) {
      return rows[0];
    }
  }

  // Legacy rows may contain emails with unexpected casing or spacing.
  const fallbackRows = await listRows(config, config.profilesTableId, [limit(500)]);
  return fallbackRows.find((row) => normalizeEmailLookup(row.email) === normalizedLookup) ?? null;
}

async function getUpcomingEvent(config) {
  const rows = await listRows(config, config.eventsTableId, [orderAsc("startsAt")]);
  const now = Date.now();

  return rows.find((row) => {
    if (normalizeStatus(row.status) === "cancelled") {
      return false;
    }
    const startsAt = parseDate(row.startsAt);
    return !startsAt || startsAt.getTime() >= now;
  }) ?? null;
}

function registrationPermissions(userId) {
  return [
    "read(\"users\")",
    `update(\"user:${userId}\")`,
    `delete(\"user:${userId}\")`
  ];
}

async function getRow(config, tableId, rowId) {
  return request(config, "GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
}

async function listRows(config, tableId, queries) {
  const payload = await request(
    config,
    "GET",
    `/tablesdb/${config.databaseId}/tables/${tableId}/rows`,
    undefined,
    queries
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function createRow(config, tableId, rowId, data, permissions) {
  return request(config, "POST", `/tablesdb/${config.databaseId}/tables/${tableId}/rows`, {
    rowId,
    data,
    permissions
  });
}

async function updateRow(config, tableId, rowId, data, permissions) {
  const payload = { data };
  if (permissions) {
    payload.permissions = permissions;
  }
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, payload);
}

async function request(config, method, path, body, queries = []) {
  const url = new URL(`${config.endpoint}${path}`);
  for (const query of queries) {
    url.searchParams.append("queries[]", query);
  }

  const authModes = [];
  if (config.userJwt) {
    authModes.push("jwt");
  }
  if (config.apiKey) {
    authModes.push("key");
  }

  if (!authModes.length) {
    throw new Error("Missing Appwrite auth context (user JWT or API key)");
  }

  let lastStatus = 500;
  let lastPayload = {};

  for (const mode of authModes) {
    const headers = {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Response-Format": "1.8.0"
    };

    if (mode === "jwt") {
      headers["X-Appwrite-JWT"] = config.userJwt;
    } else {
      headers["X-Appwrite-Key"] = config.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const payload = parseJSONSafely(text);

    if (response.ok) {
      return payload;
    }

    lastStatus = response.status;
    lastPayload = payload;
  }

  const err = new Error(lastPayload.message ?? `Request failed with status ${lastStatus}`);
  err.statusCode = lastStatus;
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

function parseCSVEnv(name) {
  return new Set(
    String(process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseCSVValue(value, options = {}) {
  const lowercase = options.lowercase === true;
  const values = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",");

  return new Set(
    values
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .map((item) => lowercase ? item.toLowerCase() : item)
      .filter(Boolean)
  );
}

function csvStringFromValue(value, options = {}) {
  return Array.from(parseCSVValue(value, options)).join(", ");
}

function nullableCSVText(value, options = {}) {
  return csvStringFromValue(value, options) || null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function requiredHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    throw new Error(`Missing header ${name}`);
  }
  return Array.isArray(value) ? value[0] : value;
}

function optionalHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function resolveApiKey(req) {
  const runtimeKey = process.env.APPWRITE_FUNCTION_API_KEY ?? process.env.APPWRITE_API_KEY;
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  return optionalHeader(req, "x-appwrite-key");
}

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function orderAsc(field) {
  return JSON.stringify({ method: "orderAsc", attribute: field });
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

function sortOrder(status) {
  switch (status) {
    case "confirmed":
      return 0;
    case "promoted":
      return 1;
    case "waitlisted":
      return 2;
    default:
      return 3;
  }
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

function asString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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
  return parsed == null ? null : Math.round(parsed);
}

function asDateString(value) {
  const parsed = parseDate(asString(value) ?? "");
  return parsed ? parsed.toISOString() : null;
}

function uniqueId() {
  return "unique()";
}
