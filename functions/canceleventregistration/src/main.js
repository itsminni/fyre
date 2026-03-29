const ACTIVE_STATUSES = new Set(["confirmed", "promoted", "waitlisted"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "promoted"]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = requiredHeader(req, "x-appwrite-user-id");
    const force = body.force === true;

    const event = body.eventId
      ? await getRow(config, config.eventsTableId, body.eventId)
      : await getUpcomingEvent(config);

    if (!event) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    const registrations = await listRows(config, config.eventRegistrationsTableId, [
      equal("eventId", [event.$id]),
      limit(200)
    ]);

    const currentRegistration = registrations.find((row) => row.userId === currentUserId && ACTIVE_STATUSES.has(row.status));
    if (!currentRegistration) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    const cancellationClosesAt = parseDate(event.cancellationClosesAt);
    if (!force && cancellationClosesAt && Date.now() >= cancellationClosesAt.getTime()) {
      return res.json({ messageKey: "events.error.cancellationClosed" }, 409);
    }

    const now = new Date().toISOString();
    await updateRow(config, config.eventRegistrationsTableId, currentRegistration.$id, {
      eventId: event.$id,
      userId: currentUserId,
      gender: currentRegistration.gender,
      status: "cancelled",
      createdAt: currentRegistration.createdAt ?? now,
      cancelledAt: now,
      promotedAt: currentRegistration.promotedAt ?? null
    }, registrationPermissions(currentUserId));

    if (CONFIRMED_STATUSES.has(currentRegistration.status)) {
      // Promote the oldest waitlisted person of the same gender to preserve the event balance rules.
      const candidate = registrations
        .filter((row) => row.status === "waitlisted" && row.gender === currentRegistration.gender)
        .sort((lhs, rhs) => {
          const left = parseDate(lhs.createdAt)?.getTime() ?? 0;
          const right = parseDate(rhs.createdAt)?.getTime() ?? 0;
          return left - right;
        })[0];

      if (candidate) {
        await updateRow(config, config.eventRegistrationsTableId, candidate.$id, {
          eventId: event.$id,
          userId: candidate.userId,
          gender: candidate.gender,
          status: "promoted",
          createdAt: candidate.createdAt ?? now,
          cancelledAt: null,
          promotedAt: now
        }, registrationPermissions(candidate.userId));
      }
    }

    return res.json({ status: "cancelled", eventId: event.$id }, 200);
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

function parseDate(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
