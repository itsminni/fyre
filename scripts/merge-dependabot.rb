# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require "yaml"

module DependabotMerge
  BOT = "dependabot[bot]"
  REQUIRED_JOBS = ["Web, shared contracts and functions", "Android", "iOS"].freeze
  ALLOWED_TYPES = %w[version-update:semver-patch version-update:semver-minor].freeze
  ALLOWED_FILES = %r{\A(?:
    web/package(?:-lock)?\.json|
    functions/(?:[a-z]+/)?package(?:-lock)?\.json|
    android/Fyre/(?:
      gradle/libs\.versions\.toml|
      gradle/wrapper/gradle-wrapper\.(?:jar|properties)|
      gradlew(?:\.bat)?|
      (?:app/)?build\.gradle\.kts|settings\.gradle\.kts
    )|
    \.github/workflows/ci\.yml
  )\z}x

  def self.safe_update?(message)
    fragment = message.match(/^---\n(.*?)^\.\.\.\s*$/m)
    return false unless fragment

    data = YAML.safe_load(fragment[1])
    dependencies = data.is_a?(Hash) && data["updated-dependencies"]
    return false unless dependencies.is_a?(Array) && !dependencies.empty?

    dependencies.all? do |dependency|
      next false unless dependency.is_a?(Hash) && dependency["dependency-name"].is_a?(String)

      type = dependency["update-type"]
      unless type
        name = Regexp.escape(dependency["dependency-name"])
        versions = message.match(/^Updates `#{name}` from (\S+) to (\S+)$/) ||
                   (dependencies.length == 1 && message.match(/^Bumps .* from (v?\d[^\s]*) to (v?\d[^\s]*)\.$/))
        next false unless versions

        previous = versions[1].match(/\Av?(\d+)\.(\d+)\.(\d+)\z/)
        current = versions[2].match(/\Av?(\d+)\.(\d+)\.(\d+)\z/)
        next false unless previous && current && previous[1] == current[1]

        next (current.captures.map(&:to_i) <=> previous.captures.map(&:to_i)) == 1
      end
      ALLOWED_TYPES.include?(type)
    end
  rescue Psych::Exception
    false
  end

  class API
    def initialize(repository, token)
      @root = "#{ENV.fetch('GITHUB_API_URL', 'https://api.github.com')}/repos/#{repository}"
      @token = token
    end

    def call(method, path, body = nil)
      uri = URI("#{@root}#{path}")
      request = Net::HTTP.const_get(method.capitalize).new(uri)
      request["Authorization"] = "Bearer #{@token}"
      request["Accept"] = "application/vnd.github+json"
      request["X-GitHub-Api-Version"] = "2022-11-28"
      request["User-Agent"] = "fyre-dependabot-merge"
      if body
        request["Content-Type"] = "application/json"
        request.body = JSON.generate(body)
      end
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 15, read_timeout: 30) do |http|
        http.request(request)
      end
      raise "GitHub API #{method} #{path}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      response.body.to_s.empty? ? {} : JSON.parse(response.body)
    end

    def list(path, key = nil)
      items = []
      page = 1
      loop do
        result = call("get", "#{path}#{path.include?('?') ? '&' : '?'}per_page=100&page=#{page}")
        batch = key ? result.fetch(key) : result
        items.concat(batch)
        break if batch.length < 100

        page += 1
      end
      items
    end
  end

  INTEGRATION_WORKFLOW = "dependabot-integration.yml"
  INTEGRATION_JOBS = (["Validate integration"] + REQUIRED_JOBS.map { |name| "CI / #{name}" }).freeze
  SHA = /\A[0-9a-f]{40}\z/
  INTEGRATION_TITLE = /\ADependabot integration PR #([1-9]\d*) head=([0-9a-f]{40}) base=([0-9a-f]{40}) merge=([0-9a-f]{40})\z/

  def self.integration_title(inputs)
    raise "Invalid PR number" unless /\A[1-9]\d*\z/.match?(inputs.fetch("pr_number").to_s)
    %w[head_sha base_sha merge_sha].each do |key|
      raise "Invalid #{key}" unless SHA.match?(inputs.fetch(key).to_s)
    end
    "Dependabot integration PR ##{inputs['pr_number']} head=#{inputs['head_sha']} base=#{inputs['base_sha']} merge=#{inputs['merge_sha']}"
  end

  def self.integration_inputs(title)
    match = INTEGRATION_TITLE.match(title.to_s)
    match && %w[pr_number head_sha base_sha merge_sha].zip(match.captures).to_h
  end

  def self.eligible_pr?(pr, repository, head)
    pr["state"] == "open" && !pr["draft"] && pr.dig("user", "login") == BOT &&
      pr.dig("head", "repo", "full_name") == repository && pr.dig("base", "repo", "full_name") == repository &&
      pr.dig("base", "ref") == "main" && pr.dig("head", "sha") == head
  end

  def self.verified_update?(api, pr)
    commits = api.list("/pulls/#{pr.fetch('number')}/commits")
    verified = !commits.empty? && commits.last["sha"] == pr.dig("head", "sha") && commits.all? do |commit|
      commit.dig("author", "login") == BOT && commit.dig("commit", "verification", "verified") == true &&
        safe_update?(commit.dig("commit", "message").to_s)
    end
    unless verified
      puts "Skipping PR ##{pr['number']}: commits must be signed Dependabot patch/minor updates; major or unclassified updates need review."
      return false
    end

    files = api.list("/pulls/#{pr.fetch('number')}/files")
    if files.empty? || files.length != pr["changed_files"]
      puts "Skipping PR ##{pr['number']}: changed-file list is empty or incomplete."
      return false
    end
    rejected = files.reject { |file| file["status"] == "modified" && ALLOWED_FILES.match?(file.fetch("filename")) }
    unless rejected.empty?
      puts "Skipping PR ##{pr['number']}: files outside the permitted dependency updates: #{rejected.map { |file| file['filename'] }.inspect}."
      return false
    end
    true
  end

  def self.valid_merge?(api, inputs)
    commit = api.call("get", "/git/commits/#{inputs.fetch('merge_sha')}")
    commit["sha"] == inputs["merge_sha"] &&
      commit.fetch("parents").map { |parent| parent.fetch("sha") } == inputs.values_at("base_sha", "head_sha")
  end

  def self.prepare_integration(api, inputs, repository)
    integration_title(inputs) # Validate every input before using it in an API path or workflow output.
    pr = api.call("get", "/pulls/#{inputs.fetch('pr_number')}")
    unless eligible_pr?(pr, repository, inputs["head_sha"]) && verified_update?(api, pr) &&
           pr["mergeable"] != false && pr["merge_commit_sha"] == inputs["merge_sha"] && valid_merge?(api, inputs)
      raise "The integration no longer matches a verified Dependabot PR and its exact merge parents."
    end
    inputs.fetch("merge_sha")
  end

  def self.request_integration(api, pr, repository)
    # GitHub computes mergeability asynchronously. Refresh both refs together;
    # never dispatch a candidate whose parents belong to an older main.
    5.times do |attempt|
      base = api.call("get", "/git/ref/heads/main").fetch("object").fetch("sha")
      current = api.call("get", "/pulls/#{pr.fetch('number')}")
      unless eligible_pr?(current, repository, pr.dig("head", "sha"))
        puts "Skipping PR ##{pr['number']}: the PR changed before integration could be requested."
        return
      end
      if current["mergeable"] == false
        puts "Skipping PR ##{pr['number']}: merge conflicts need human review."
        return
      end
      inputs = { "pr_number" => pr.fetch("number").to_s, "head_sha" => pr.dig("head", "sha"),
                 "base_sha" => base, "merge_sha" => current["merge_commit_sha"] }
      if current["mergeable"] == true && SHA.match?(inputs["merge_sha"].to_s) && valid_merge?(api, inputs)
        title = integration_title(inputs)
        runs = api.list("/actions/workflows/#{INTEGRATION_WORKFLOW}/runs?event=workflow_dispatch&branch=main&head_sha=#{base}", "workflow_runs")
        existing = runs.find { |run| run["display_title"] == title && run["conclusion"] != "cancelled" }
        if existing
          raise "Integration CI for PR ##{pr['number']} failed; review its results before retrying." if %w[failure timed_out action_required].include?(existing["conclusion"])

          puts "PR ##{pr['number']}: integration already requested for these commits; waiting for its result."
          return
        end
        api.call("post", "/actions/workflows/#{INTEGRATION_WORKFLOW}/dispatches", { "ref" => "main", "inputs" => inputs })
        puts "PR ##{pr['number']}: requested CI on the exact PR + main merge; waiting before merging."
        return
      end
      sleep 2 if attempt < 4
    end
    raise "GitHub has not produced a merge matching the current PR and main; retry this workflow."
  end

  def self.successful_jobs?(api, run, required)
    jobs = api.list("/actions/runs/#{run.fetch('id')}/attempts/#{run.fetch('run_attempt')}/jobs", "jobs")
    missing = required.reject { |name| jobs.any? { |job| job["name"] == name && job["conclusion"] == "success" } }
    return true if missing.empty? && jobs.all? { |job| job["conclusion"] == "success" }

    puts "Skipping run: all CI jobs must succeed; missing or unsuccessful required jobs: #{missing.inspect}."
    false
  end

  def self.merge(api, event, repository)
    run = api.call("get", "/actions/runs/#{Integer(event.fetch('workflow_run').fetch('id'))}")
    integration = run["event"] == "workflow_dispatch" && run["path"] == ".github/workflows/#{INTEGRATION_WORKFLOW}" &&
                  run["head_branch"] == "main" && integration_inputs(run["display_title"])
    normal = run["event"] == "pull_request" && run["path"] == ".github/workflows/ci.yml" && run["conclusion"] == "success"
    unless (normal || integration) && run.dig("head_repository", "full_name") == repository
      puts "Skipping run: expected CI for a pull request or a trusted integration from this repository."
      return
    end
    return if normal && !successful_jobs?(api, run, REQUIRED_JOBS)

    tested_head = integration ? integration.fetch("head_sha") : run.fetch("head_sha")
    candidates = if integration
                   [{ "number" => Integer(integration.fetch("pr_number")) }]
                 else
                   head = URI.encode_www_form_component("#{repository.split('/').first}:#{run.fetch('head_branch')}")
                   api.list("/pulls?state=open&head=#{head}")
                 end
    puts "Skipping run: no open pull request matches this branch." if candidates.empty?
    candidates.each do |candidate|
      pr = api.call("get", "/pulls/#{candidate.fetch('number')}")
      unless eligible_pr?(pr, repository, tested_head) && (integration || pr.dig("head", "ref") == run["head_branch"])
        puts "Skipping PR ##{pr['number']}: expected an open, non-draft Dependabot PR to main at the tested head in this repository."
        next
      end
      next unless verified_update?(api, pr)

      base = api.call("get", "/git/ref/heads/main").fetch("object").fetch("sha")
      if integration
        if integration["base_sha"] != base
          request_integration(api, pr, repository)
          next
        end
        unless run["conclusion"] == "success" && run["head_sha"] == base && successful_jobs?(api, run, INTEGRATION_JOBS)
          puts "Skipping PR ##{pr['number']}: integration CI did not pass for this main commit."
          next
        end
        unless pr["mergeable"] != false && pr["merge_commit_sha"] == integration["merge_sha"] && valid_merge?(api, integration)
          puts "Skipping PR ##{pr['number']}: the tested merge does not match the current PR."
          next
        end
      else
        comparison = api.call("get", "/compare/#{base}...#{tested_head}")
        if comparison.fetch("behind_by") > 0 && comparison["status"] == "diverged"
          request_integration(api, pr, repository)
          next
        end
        unless comparison["behind_by"] == 0 && comparison["status"] == "ahead"
          puts "Skipping PR ##{pr['number']}: expected dependency commits ahead of main."
          next
        end
      end

      # Recheck immediately before the merge. The API's SHA precondition also
      # rejects a head update racing this request; branch protections still apply.
      current = api.call("get", "/pulls/#{pr.fetch('number')}")
      next unless eligible_pr?(current, repository, tested_head)
      if api.call("get", "/git/ref/heads/main").dig("object", "sha") != base
        request_integration(api, current, repository)
        next
      end
      next if integration && current["merge_commit_sha"] != integration["merge_sha"]
      result = api.call("put", "/pulls/#{pr.fetch('number')}/merge", { "sha" => tested_head, "merge_method" => "squash" })
      raise "GitHub did not merge PR ##{pr['number']}" unless result["merged"]

      puts "Merged Dependabot PR ##{pr['number']} after all CI jobs passed."
    end
  end
end

if $PROGRAM_NAME == __FILE__
  repository = ENV.fetch("GITHUB_REPOSITORY")
  api = DependabotMerge::API.new(repository, ENV.fetch("GH_TOKEN"))
  event = JSON.parse(File.read(ENV.fetch("GITHUB_EVENT_PATH")))
  if ARGV == ["--prepare-integration"]
    sha = DependabotMerge.prepare_integration(api, event.fetch("inputs"), repository)
    File.open(ENV.fetch("GITHUB_OUTPUT"), "a") { |file| file.puts("merge_sha=#{sha}") }
  elsif ARGV.empty?
    DependabotMerge.merge(api, event, repository)
  else
    abort "Unknown arguments"
  end
end
