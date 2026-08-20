#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require_relative "secure_appwrite_endpoint"

ROOT = File.expand_path("..", __dir__)
APPWRITE_DIR = File.join(ROOT, "appwrite")

TABLE_IDS = {
  "profiles" => "APPWRITE_PROFILES_TABLE_ID",
  "events" => "APPWRITE_EVENTS_TABLE_ID",
  "eventregistrations" => "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID",
  "threads" => "APPWRITE_THREADS_TABLE_ID",
  "threadparticipants" => "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID",
  "messages" => "APPWRITE_MESSAGES_TABLE_ID",
  "swipe" => "APPWRITE_SWIPES_TABLE_ID",
  "matches" => "APPWRITE_MATCHES_TABLE_ID",
  "relationships" => "APPWRITE_RELATIONSHIPS_TABLE_ID"
}.freeze

BUCKET_IDS = {
  "avatars" => "APPWRITE_AVATARS_BUCKET_ID",
  "chat-attachments" => "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"
}.freeze

FUNCTION_IDS = {
  "registerforevent" => "APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID",
  "canceleventregistration" => "APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID",
  "manageeventadmin" => "APPWRITE_EVENT_ADMIN_FUNCTION_ID",
  "createorgetthread" => "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID",
  "sendmessage" => "APPWRITE_SEND_MESSAGE_FUNCTION_ID",
  "recordswipe" => "APPWRITE_RECORD_SWIPE_FUNCTION_ID",
  "discoverprofiles" => "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID",
  "manageprofile" => "APPWRITE_MANAGE_PROFILE_FUNCTION_ID",
  "managerelationship" => "APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID"
}.freeze

def read_dotenv(path)
  values = {}

  File.foreach(path).with_index(1) do |line, line_number|
    stripped = line.strip
    next if stripped.empty? || stripped.start_with?("#")

    match = stripped.match(/\A(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)\z/)
    abort("Invalid dotenv entry at #{path}:#{line_number}") unless match

    key = match[1]
    raw_value = match[2].strip
    value = if raw_value.start_with?("\"") && raw_value.end_with?("\"")
              JSON.parse(raw_value)
            elsif raw_value.start_with?("'") && raw_value.end_with?("'")
              raw_value[1...-1]
            else
              raw_value.sub(/\s+#.*\z/, "")
            end
    values[key] = value
  rescue JSON::ParserError => error
    abort("Invalid quoted value at #{path}:#{line_number}: #{error.message}")
  end

  values
end

def load_json(path)
  JSON.parse(File.read(path))
rescue JSON::ParserError => error
  abort("Invalid JSON in #{path}: #{error.message}")
end

def require_values!(environment, keys)
  missing = keys.select { |key| environment.fetch(key, "").strip.empty? }
  return if missing.empty?

  abort("Missing required Appwrite values: #{missing.join(', ')}")
end

def write_private_json(path, value)
  File.write(path, JSON.pretty_generate(value) + "\n")
  File.chmod(0o600, path)
end

def require_array!(value, label)
  abort("#{label} must be a JSON array") unless value.is_a?(Array)
end

def require_exact_ids!(resources, expected_ids, label)
  require_array!(resources, label)
  ids = resources.map { |resource| resource.is_a?(Hash) ? resource["$id"] : nil }
  missing = expected_ids - ids
  unexpected = ids.compact - expected_ids
  duplicates = ids.compact.group_by(&:itself).select { |_id, values| values.length > 1 }.keys
  return if missing.empty? && unexpected.empty? && duplicates.empty?

  details = []
  details << "missing #{missing.join(', ')}" unless missing.empty?
  details << "unexpected #{unexpected.join(', ')}" unless unexpected.empty?
  details << "duplicate #{duplicates.join(', ')}" unless duplicates.empty?
  abort("Invalid #{label} resource IDs: #{details.join('; ')}")
end

def validate_tables!(tables, database_ids)
  allowed_column_types = %w[
    string text varchar mediumtext longtext integer bigint double boolean datetime
    relationship linestring point polygon
  ].freeze

  tables.each do |table|
    table_id = table.fetch("$id")
    abort("Table #{table_id} references an unknown database") unless database_ids.include?(table.fetch("databaseId"))
    abort("Table #{table_id} must enable rowSecurity explicitly") unless [true, false].include?(table["rowSecurity"])
    abort("Table #{table_id} permissions must be an array") unless table.fetch("$permissions", []).is_a?(Array)

    columns = table.fetch("columns", [])
    require_array!(columns, "Columns for table #{table_id}")
    column_keys = columns.map { |column| column.is_a?(Hash) ? column["key"] : nil }
    duplicate_columns = column_keys.compact.group_by(&:itself).select { |_key, values| values.length > 1 }.keys
    abort("Duplicate columns in #{table_id}: #{duplicate_columns.join(', ')}") unless duplicate_columns.empty?

    columns.each do |column|
      key = column.fetch("key")
      type = column.fetch("type")
      abort("Unsupported column type #{type} for #{table_id}.#{key}") unless allowed_column_types.include?(type)
      if %w[string varchar].include?(type) && (!column["size"].is_a?(Integer) || column["size"] <= 0)
        abort("#{table_id}.#{key} requires a positive size")
      end
      if column["required"] == true && column.key?("default") && !column["default"].nil?
        abort("Required column #{table_id}.#{key} must have a null default")
      end
      if column["format"] == "enum"
        elements = column["elements"]
        abort("Enum #{table_id}.#{key} requires non-empty string elements") unless elements.is_a?(Array) && !elements.empty? && elements.all? { |item| item.is_a?(String) }
      end
    end

    indexes = table.fetch("indexes", [])
    require_array!(indexes, "Indexes for table #{table_id}")
    index_keys = indexes.map { |index| index.is_a?(Hash) ? index["key"] : nil }
    duplicate_indexes = index_keys.compact.group_by(&:itself).select { |_key, values| values.length > 1 }.keys
    abort("Duplicate indexes in #{table_id}: #{duplicate_indexes.join(', ')}") unless duplicate_indexes.empty?
    indexes.each do |index|
      referenced_columns = index.fetch("columns")
      missing_columns = referenced_columns - column_keys
      abort("Index #{table_id}.#{index.fetch('$id', index.fetch('key'))} references missing columns: #{missing_columns.join(', ')}") unless missing_columns.empty?
      orders = index.fetch("orders", [])
      if !orders.empty? && orders.length != referenced_columns.length
        abort("Index #{table_id}.#{index.fetch('key')} must provide one order per column")
      end
    end
  end
end

def validate_table_security_model!(tables)
  expected_permissions = {
    "profiles" => [],
    "events" => [],
    "eventregistrations" => [],
    "threads" => [],
    "threadparticipants" => [],
    "messages" => [],
    "swipe" => [],
    "matches" => [],
    "relationships" => []
  }.freeze

  tables.each do |table|
    table_id = table.fetch("$id")
    actual = table.fetch("$permissions", []).sort
    expected = expected_permissions.fetch(table_id).sort
    abort("Unsafe table permissions for #{table_id}: #{actual.inspect}") unless actual == expected

    abort("Unexpected rowSecurity for #{table_id}") unless table["rowSecurity"] == true
  end

  events = tables.find { |table| table["$id"] == "events" }
  event_columns = events.fetch("columns").map { |column| column.fetch("key") }
  forbidden_public_columns = %w[adminUserIds adminEmails] & event_columns
  abort("Public event table exposes admin identifiers: #{forbidden_public_columns.join(', ')}") unless forbidden_public_columns.empty?

  required_counters = %w[maleCount femaleCount waitingListCount]
  missing_counters = required_counters - event_columns
  abort("Event table is missing server counters: #{missing_counters.join(', ')}") unless missing_counters.empty?
end

def validate_buckets!(buckets)
  buckets.each do |bucket|
    bucket_id = bucket.fetch("$id")
    abort("Bucket #{bucket_id} must enable fileSecurity") unless bucket["fileSecurity"] == true
    abort("Bucket #{bucket_id} must restrict creation to authenticated users") unless bucket.fetch("$permissions", []).include?('create("users")')
    size = bucket.fetch("maximumFileSize")
    abort("Bucket #{bucket_id} has an invalid maximumFileSize") unless size.is_a?(Integer) && size.positive?
  end
end

def validate_functions!(functions)
  runtime_env = %w[APPWRITE_FUNCTION_API_ENDPOINT APPWRITE_FUNCTION_PROJECT_ID].freeze

  functions.each do |function|
    function_id = function.fetch("$id")
    abort("Function #{function_id} must use the node-22 runtime") unless function["runtime"] == "node-22"
    abort("Function #{function_id} must be executable only by authenticated users") unless function["execute"] == ["users"]
    abort("Function #{function_id} must keep production execution logging disabled") unless function["logging"] == false

    variables = function.fetch("vars", {})
    abort("Function #{function_id} vars must be a string map") unless variables.is_a?(Hash) && variables.all? { |key, value| key.is_a?(String) && value.is_a?(String) }
    scopes = function.fetch("scopes", [])
    abort("Function #{function_id} requires rows.read") unless scopes.include?("rows.read")

    function_path = File.expand_path(function.fetch("path"), APPWRITE_DIR)
    entrypoint_path = File.join(function_path, function.fetch("entrypoint"))
    abort("Missing function directory: #{function_path}") unless File.directory?(function_path)
    abort("Missing entrypoint for #{function_id}: #{entrypoint_path}") unless File.file?(entrypoint_path)

    required_env = File.read(entrypoint_path)
      .scan(/requiredEnv\(\s*["'](APPWRITE_[A-Z0-9_]+)["']\s*\)/)
      .flatten
      .uniq
    missing_env = required_env - runtime_env - variables.keys
    abort("Function #{function_id} is missing manifest vars: #{missing_env.join(', ')}") unless missing_env.empty?

    if %w[createorgetthread discoverprofiles].include?(function_id)
      ttl = variables.fetch("APPWRITE_AVATAR_TOKEN_TTL_SECONDS", "")
      abort("Function #{function_id} requires APPWRITE_AVATAR_TOKEN_TTL_SECONDS between 300 and 900") unless ttl.match?(/\A\d+\z/) && ttl.to_i.between?(300, 900)
      abort("Function #{function_id} requires APPWRITE_AVATARS_BUCKET_ID") if variables.fetch("APPWRITE_AVATARS_BUCKET_ID", "").strip.empty?
    end
  end
end


def validate_function_scopes!(functions)
  expected_scopes = {
    "registerforevent" => %w[rows.read rows.write],
    "canceleventregistration" => %w[rows.read rows.write],
    "manageeventadmin" => %w[rows.read rows.write users.read],
    "createorgetthread" => %w[rows.read rows.write tokens.write],
    "sendmessage" => %w[files.read files.write rows.read rows.write],
    "recordswipe" => %w[rows.read rows.write],
    "discoverprofiles" => %w[rows.read tokens.write],
    "manageprofile" => %w[files.read files.write rows.read rows.write],
    "managerelationship" => %w[rows.read rows.write]
  }.freeze

  functions.each do |function|
    function_id = function.fetch("$id")
    actual = function.fetch("scopes", []).sort
    expected = expected_scopes.fetch(function_id).sort
    abort("Unexpected scopes for #{function_id}: #{actual.inspect}") unless actual == expected
  end
end

check_only = ARGV.delete("--check")
env_argument = ARGV.shift || ".env"
abort("Usage: #{$PROGRAM_NAME} [--check] [path/to/.env]") unless ARGV.empty?

env_path = File.expand_path(env_argument, ROOT)
abort("Missing environment file: #{env_path}") unless File.file?(env_path)

environment = read_dotenv(env_path)
required_keys = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_DATABASE_ID",
  *TABLE_IDS.values,
  *BUCKET_IDS.values,
  *FUNCTION_IDS.values
]
require_values!(environment, required_keys)
avatar_token_ttl = environment.fetch("APPWRITE_AVATAR_TOKEN_TTL_SECONDS", "300")
abort("APPWRITE_AVATAR_TOKEN_TTL_SECONDS must be an integer between 300 and 900") unless avatar_token_ttl.match?(/\A\d+\z/) && avatar_token_ttl.to_i.between?(300, 900)
begin
  SecureAppwriteEndpoint.validate!(environment.fetch("APPWRITE_ENDPOINT"))
rescue ArgumentError => error
  abort(error.message)
end

database_id = environment.fetch("APPWRITE_DATABASE_ID")
tables_db = load_json(File.join(APPWRITE_DIR, "tables-db.json"))
tables = load_json(File.join(APPWRITE_DIR, "tables.json"))
buckets = load_json(File.join(APPWRITE_DIR, "buckets.json"))
functions = load_json(File.join(APPWRITE_DIR, "functions.json"))
root_config = load_json(File.join(ROOT, "appwrite.config.example.json"))

require_exact_ids!(tables_db, ["fyre"], "database")
require_exact_ids!(tables, TABLE_IDS.keys, "table")
require_exact_ids!(buckets, BUCKET_IDS.keys, "bucket")
require_exact_ids!(functions, FUNCTION_IDS.keys, "function")
validate_tables!(tables, tables_db.map { |database| database.fetch("$id") })
validate_table_security_model!(tables)
validate_buckets!(buckets)
validate_functions!(functions)
validate_function_scopes!(functions)

tables_db.each { |database| database["$id"] = database_id }

tables.each do |table|
  environment_key = TABLE_IDS.fetch(table.fetch("$id"))
  table["$id"] = environment.fetch(environment_key)
  table["databaseId"] = database_id
end

buckets.each do |bucket|
  environment_key = BUCKET_IDS.fetch(bucket.fetch("$id"))
  bucket["$id"] = environment.fetch(environment_key)
end

functions.each do |function|
  environment_key = FUNCTION_IDS.fetch(function.fetch("$id"))
  function["$id"] = environment.fetch(environment_key)
  function["vars"] = function.fetch("vars", {}).each_with_object({}) do |(key, fallback), resolved|
    resolved[key] = environment.fetch(key, fallback)
  end
end

root_config["projectId"] = environment.fetch("APPWRITE_PROJECT_ID")
root_config["endpoint"] = environment.fetch("APPWRITE_ENDPOINT")
root_config["includes"] = {
  "tablesDB" => "./appwrite/tables-db.local.json",
  "tables" => "./appwrite/tables.local.json",
  "buckets" => "./appwrite/buckets.local.json",
  "functions" => "./appwrite/functions.local.json"
}

resource_ids = [
  *tables.map { |table| table.fetch("$id") },
  *buckets.map { |bucket| bucket.fetch("$id") },
  *functions.map { |function| function.fetch("$id") }
]
duplicates = resource_ids.group_by(&:itself).select { |_id, values| values.length > 1 }.keys
abort("Duplicate Appwrite resource IDs: #{duplicates.join(', ')}") unless duplicates.empty?

if check_only
  puts "Appwrite configuration is valid for #{functions.length} functions, #{tables.length} tables and #{buckets.length} buckets."
  exit 0
end

write_private_json(File.join(ROOT, "appwrite.config.json"), root_config)
write_private_json(File.join(APPWRITE_DIR, "tables-db.local.json"), tables_db)
write_private_json(File.join(APPWRITE_DIR, "tables.local.json"), tables)
write_private_json(File.join(APPWRITE_DIR, "buckets.local.json"), buckets)
write_private_json(File.join(APPWRITE_DIR, "functions.local.json"), functions)

functions.each do |function|
  function_path = File.expand_path(function.fetch("path"), APPWRITE_DIR)
  abort("Missing function directory: #{function_path}") unless File.directory?(function_path)

  variables = function.fetch("vars", {}).sort.map { |key, value| "#{key}=#{value}" }.join("\n") + "\n"
  function_env_path = File.join(function_path, ".env")
  File.write(function_env_path, variables)
  File.chmod(0o600, function_env_path)
end

puts "Generated ignored Appwrite deployment files from #{env_path}."
