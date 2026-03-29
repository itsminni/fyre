const ACTIVE_STATUSES = new Set(["confirmed", "promoted", "waitlisted"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "promoted"]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = requiredHeader(req, "x-appwrite-user-id");

    const profile = await getRow(config, config.profilesTableId, currentUserId);
    const gender = asString(profile.gender);
    const orientation = asString(profile.orientation);

    if (!gender) {
      return res.json({ messageKey: "events.error.genderRequired" }, 400);
    }

    if (gender !== "male" && gender !== "female") {
      return res.json({ messageKey: "events.error.genderUnsupported" }, 400);
    }

    if (orientation !== "straight") {
      return res.json({ messageKey: "events.error.orientationUnsupported" }, 400);
    }

    const event = body.eventId
      ? await getRow(config, config.eventsTableId, body.eventId)
      : await getUpcomingEvent(config);

    if (!event) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    const registrationClosesAt = parseDate(event.registrationClosesAt);
    if (registrationClosesAt && Date.now() >= registrationClosesAt.getTime()) {
      return res.json({ messageKey: "events.error.registrationClosed" }, 409);
    }

    const registrations = await listRows(config, config.eventRegistrationsTableId, [
      equal("eventId", [event.$id]),
      limit(200)
    ]);

    const existing = registrations.find((row) => row.userId === currentUserId);
    if (existing && ACTIVE_STATUSES.has(existing.status)) {
      const messageKey = existing.status === "waitlisted"
        ? "events.error.alreadyWaitlisted"
        : "events.error.alreadyRegistered";
      return res.json({ messageKey }, 409);
    }

    const confirmedRows = registrations.filter((row) => CONFIRMED_STATUSES.has(row.status));
    const maxParticipants = asNumber(event.maxParticipants) ?? 48;
    if (confirmedRows.length >= maxParticipants) {
      return res.json({ messageKey: "events.error.capacityFull" }, 409);
    }

    // Keep the gender-balance decision on the server so every client sees the same confirmed/waitlist outcome.
    const sameGenderCount = confirmedRows.filter((row) => row.gender === gender).length;
    const sameGenderLimit = gender === "male"
      ? (asNumber(event.maleLimit) ?? 24)
      : (asNumber(event.femaleLimit) ?? 24);
    const nextStatus = sameGenderCount >= sameGenderLimit ? "waitlisted" : "confirmed";
    const now = new Date().toISOString();

    if (existing) {
      await updateRow(config, config.eventRegistrationsTableId, existing.$id, {
        eventId: event.$id,
        userId: currentUserId,
        gender,
        status: nextStatus,
        createdAt: existing.createdAt ?? now,
        cancelledAt: null,
        promotedAt: null
      }, registrationPermissions(currentUserId));
    } else {
      await createRow(config, config.eventRegistrationsTableId, uniqueId(), {
        eventId: event.$id,
        userId: currentUserId,
        gender,
        status: nextStatus,
        createdAt: now,
        cancelledAt: null,
        promotedAt: null
      }, registrationPermissions(currentUserId));
    }

    return res.json({ status: nextStatus, eventId: event.$id }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ messageKey: "events.error.requestFailed" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: requiredHeader(req, "x-appwrite-key"),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredEnv("APPWRITE_PROFILES_TABLE_ID"),
    eventsTableId: requiredEnv("APPWRITE_EVENTS_TABLE_ID"),
    eventRegistrationsTableId: requiredEnv("APPWRITE_EVENT_REGISTRATIONS_TABLE_ID")
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

function requiredHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    throw new Error(`Missing header ${name}`);
  }
  return Array.isArray(value) ? value[0] : value;
}

async function getUpcomingEvent(config) {
  const rows = await listRows(config, config.eventsTableId, [orderAsc("startsAt"), limit(50)]);
  const now = Date.now();

  return rows.find((row) => {
    if (String(row.status).toLowerCase() === "cancelled") {
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
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, {
    data,
    permissions
  });
}

async function request(config, method, path, body, queries = []) {
  const url = new URL(`${config.endpoint}${path}`);
  for (const query of queries) {
    url.searchParams.append("queries[]", query);
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
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with status ${response.status}`);
  }
  return payload;
}

function equal(field, values) {
  return `equal("${field}", ${JSON.stringify(values)})`;
}

function orderAsc(field) {
  return `orderAsc("${field}")`;
}

function limit(value) {
  return `limit(${value})`;
}

function uniqueId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDate(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
