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

    const registrations = await listAllRows(config, config.eventRegistrationsTableId, [
      equal("eventId", [event.$id])
    ]);

    const currentRegistration = registrations.find((row) => {
      const rowUserId = resolveUserId(row);
      return rowUserId === currentUserId && ACTIVE_STATUSES.has(normalizeStatus(row.status));
    });
    if (!currentRegistration) {
      return res.json({ messageKey: "events.error.notRegistered" }, 404);
    }

    const cancellationClosesAt = parseDate(event.cancellationClosesAt);
    if (!force && cancellationClosesAt && Date.now() >= cancellationClosesAt.getTime()) {
      return res.json({ messageKey: "events.error.cancellationClosed" }, 409);
    }

    const now = new Date().toISOString();
    await updateRow(config, config.eventRegistrationsTableId, currentRegistration.$id, {
      status: "cancelled",
      cancelledAt: now
    });

    if (CONFIRMED_STATUSES.has(normalizeStatus(currentRegistration.status))) {
      // Promote the oldest waitlisted person of the same gender to preserve the event balance rules.
      const candidate = selectPromotionCandidate(registrations, currentRegistration);

      if (candidate) {
        try {
          await updateRow(config, config.eventRegistrationsTableId, candidate.$id, {
            status: "promoted",
            cancelledAt: null,
            promotedAt: now
          });
        } catch (promotionError) {
          const detail = `Waitlist promotion skipped: ${String(promotionError?.message ?? promotionError)}`;
          if (typeof error === "function") {
            error(detail);
          } else {
            console.warn(detail);
          }
        }
      }
    }

    return res.json({ status: "cancelled", eventId: event.$id }, 200);
  } catch (err) {
    const detail = String(err?.stack ?? err);
    if (typeof error === "function") {
      error(detail);
    } else {
      console.error(detail);
    }
    return res.json({
      messageKey: "events.error.requestFailed",
      message: String(err?.message ?? err)
    }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
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

async function getUpcomingEvent(config) {
  const rows = await listRows(config, config.eventsTableId, [orderAsc("startsAt")]);
  const now = Date.now();

  return rows.find((row) => {
    if (String(row.status).toLowerCase() === "cancelled") {
      return false;
    }
    const startsAt = parseDate(row.startsAt);
    return !startsAt || startsAt.getTime() >= now;
  }) ?? null;
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

async function listAllRows(config, tableId, baseQueries, pageSize = 100) {
  const rows = [];
  let page = 0;

  while (true) {
    const batch = await listRows(config, tableId, [
      ...baseQueries,
      limit(pageSize),
      offset(page * pageSize)
    ]);
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }

    page += 1;
  }
}

async function updateRow(config, tableId, rowId, data) {
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, {
    data
  });
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

  if (authModes.length === 0) {
    throw new Error("Missing Appwrite auth context (user JWT or API key)");
  }

  let lastStatus = 500;
  let lastPayload = {};

  for (const authMode of authModes) {
    const headers = {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Response-Format": "1.8.0"
    };

    if (authMode === "jwt") {
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

  throw new Error(lastPayload.message ?? `Request failed with status ${lastStatus}`);
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

function orderAsc(field) {
  return JSON.stringify({ method: "orderAsc", attribute: field });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function offset(value) {
  return JSON.stringify({ method: "offset", values: [value] });
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

function parseDate(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
