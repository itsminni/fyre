export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const currentUserId = requiredHeader(req, "x-appwrite-user-id");

    // Build a minimal discover payload server-side so the client does not need full profile read access.
    const [profiles, swipes, matches] = await Promise.all([
      listRows(config, config.profilesTableId, [limit(100)]),
      listRows(config, config.swipesTableId, [
        equal("fromUserId", [currentUserId]),
        limit(200)
      ]),
      listRows(config, config.matchesTableId, [limit(200)])
    ]);

    const excludedUserIds = new Set();
    for (const swipe of swipes) {
      if (typeof swipe.toUserId === "string" && swipe.toUserId.length > 0) {
        excludedUserIds.add(swipe.toUserId);
      }
    }

    for (const match of matches) {
      if (match.userAId === currentUserId && typeof match.userBId === "string") {
        excludedUserIds.add(match.userBId);
      } else if (match.userBId === currentUserId && typeof match.userAId === "string") {
        excludedUserIds.add(match.userAId);
      }
    }

    const discoverProfiles = profiles
      .filter((row) => row.userId && row.userId !== currentUserId && !excludedUserIds.has(row.userId))
      .map((row) => ({
        userId: row.userId,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        birthDate: row.birthDate ?? null,
        gender: row.gender ?? null,
        lookingFor: row.lookingFor ?? null,
        passions: row.passions ?? null,
        hobbies: row.hobbies ?? null
      }));

    return res.json({ profiles: discoverProfiles }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: "Unable to fetch discover profiles" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredEnv("APPWRITE_PROFILES_TABLE_ID"),
    swipesTableId: requiredEnv("APPWRITE_SWIPES_TABLE_ID"),
    matchesTableId: requiredEnv("APPWRITE_MATCHES_TABLE_ID")
  };
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

function resolveApiKey(req) {
  const runtimeKey = process.env.APPWRITE_FUNCTION_API_KEY ?? process.env.APPWRITE_API_KEY;
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  return requiredHeader(req, "x-appwrite-key");
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
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}
