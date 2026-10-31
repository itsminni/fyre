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
    class Error < RuntimeError
      attr_reader :status

      def initialize(status, message)
        @status = status.to_i
        super(message)
      end
    end

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
      raise Error.new(response.code, "GitHub API #{method} #{path}: HTTP #{response.code}") unless response.is_a?(Net::HTTPSuccess)

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

  def self.integration_branch(inputs)
    "fyre-integration/pr-#{inputs.fetch('pr_number')}-#{inputs.fetch('base_sha')}-#{inputs.fetch('head_sha')}"
  end

  def self.valid_candidate?(api, pr, inputs)
    return false unless valid_merge?(api, inputs)
    return true if pr["merge_commit_sha"] == inputs["merge_sha"]

    api.call("get", "/git/ref/heads/#{integration_branch(inputs)}").dig("object", "sha") == inputs["merge_sha"]
  rescue API::Error => error
    raise unless error.status == 404

    false
  end

  def self.isolated_merge(api, inputs)
    # GitHub can leave refs/pull/N/merge on an old base indefinitely. Ask its
    # merge engine for an isolated candidate; never update the Dependabot head.
    branch = integration_branch(inputs)
    path = "/git/ref/heads/#{branch}"
    begin
      sha = api.call("get", path).dig("object", "sha")
    rescue API::Error => error
      raise unless error.status == 404

      begin
        api.call("post", "/git/refs", { "ref" => "refs/heads/#{branch}", "sha" => inputs.fetch("base_sha") })
        sha = inputs.fetch("base_sha")
      rescue API::Error => error
        raise unless error.status == 422

        sha = api.call("get", path).dig("object", "sha")
      end
    end
    if sha == inputs["base_sha"]
      result = api.call("post", "/merges", { "base" => branch, "head" => inputs.fetch("head_sha"),
                      "commit_message" => "Test Dependabot PR ##{inputs.fetch('pr_number')} against #{inputs.fetch('base_sha')}" })
      sha = result["sha"]
    end
    candidate = inputs.merge("merge_sha" => sha)
    raise "Invalid isolated merge for PR ##{inputs['pr_number']}" unless SHA.match?(sha.to_s) && valid_candidate?(api, {}, candidate)

    sha
  rescue API::Error => error
    raise unless error.status == 409

    puts "PR ##{inputs['pr_number']}: isolated merge has conflicts; human review is required."
    nil
  end

  def self.prepare_integration(api, inputs, repository)
    integration_title(inputs) # Validate every input before using it in an API path or workflow output.
    pr = api.call("get", "/pulls/#{inputs.fetch('pr_number')}")
    unless eligible_pr?(pr, repository, inputs["head_sha"]) && verified_update?(api, pr) &&
           pr["mergeable"] != false && valid_candidate?(api, pr, inputs)
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
      if current["mergeable"] == true && (!SHA.match?(inputs["merge_sha"].to_s) || !valid_merge?(api, inputs))
        inputs["merge_sha"] = isolated_merge(api, inputs)
        return unless inputs["merge_sha"]
      end
      if current["mergeable"] == true && SHA.match?(inputs["merge_sha"].to_s) && valid_merge?(api, inputs)
        title = integration_title(inputs)
        runs = api.list("/actions/workflows/#{INTEGRATION_WORKFLOW}/runs?event=workflow_dispatch&branch=main&head_sha=#{base}", "workflow_runs")
        existing = runs.find { |run| run["display_title"] == title && run["conclusion"] != "cancelled" }
        if existing
          raise "Integration CI for PR ##{pr['number']} failed; review its results before retrying." if %w[failure timed_out action_required].include?(existing["conclusion"])

          if existing["status"] == "completed" && existing["conclusion"] == "success"
            merge(api, { "workflow_run" => { "id" => existing.fetch("id") } }, repository)
            return
          end
          puts "PR ##{pr['number']}: integration already requested for these commits; waiting for its result."
          return
        end
        api.call("post", "/actions/workflows/#{INTEGRATION_WORKFLOW}/dispatches", { "ref" => "main", "inputs" => inputs })
        puts "PR ##{pr['number']}: requested CI on the exact PR + main merge; waiting before merging."
        return
      end
      sleep 2 if attempt < 4
    end
    puts "PR ##{pr['number']}: GitHub is still computing the current merge; deferred to the next automatic check."
  end

  def self.successful_jobs?(api, run, required)
    jobs = api.list("/actions/runs/#{run.fetch('id')}/attempts/#{run.fetch('run_attempt')}/jobs", "jobs")
    missing = required.reject { |name| jobs.any? { |job| job["name"] == name && job["conclusion"] == "success" } }
    return true if missing.empty? && jobs.all? { |job| job["conclusion"] == "success" }

    puts "Skipping run: all CI jobs must succeed; missing or unsuccessful required jobs: #{missing.inspect}."
    false
  end

  def self.notify_integration(api, run_id)
    raise "Invalid integration run ID" unless /\A[1-9]\d*\z/.match?(run_id.to_s)

    api.call("post", "/actions/workflows/dependabot-automerge.yml/dispatches", {
      "ref" => "main", "inputs" => { "integration_run_id" => run_id.to_s }
    })
  end

  def self.wait_for_integration(api, run_id, repository)
    raise "Invalid integration run ID" unless /\A[1-9]\d*\z/.match?(run_id.to_s)

    10.times do |attempt|
      run = api.call("get", "/actions/runs/#{run_id}")
      unless run["path"] == ".github/workflows/#{INTEGRATION_WORKFLOW}" && run["event"] == "workflow_dispatch" &&
             run["head_branch"] == "main" && run.dig("head_repository", "full_name") == repository && integration_inputs(run["display_title"])
        raise "Expected a trusted integration run."
      end
      return if run["status"] == "completed"

      sleep 2 if attempt < 9
    end
    raise "Integration notification has not finished; the periodic check will recover it."
  end

  def self.reconcile(api, repository)
    # Recover missed events and delayed merge refs without changing bot branches.
    # Always select the latest CI run for the current head, including failures.
    api.list("/pulls?state=open&base=main").each do |candidate|
      head = candidate.dig("head", "sha")
      next unless eligible_pr?(candidate, repository, head) && SHA.match?(head.to_s)

      runs = api.list("/actions/workflows/ci.yml/runs?event=pull_request&head_sha=#{head}", "workflow_runs")
      latest = runs.select do |run|
        run["head_branch"] == candidate.dig("head", "ref") && run.dig("head_repository", "full_name") == repository
      end.max_by { |run| run.fetch("id") }
      next unless latest && latest["status"] == "completed" && latest["conclusion"] == "success"

      begin
        merge(api, { "workflow_run" => { "id" => latest.fetch("id") } }, repository)
      rescue RuntimeError => error
        # A failed integration needs review, but must not block other PRs.
        warn "PR ##{candidate['number']}: #{error.message}"
      end
    end
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
        unless pr["mergeable"] != false && valid_candidate?(api, pr, integration)
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
      next if integration && !valid_candidate?(api, current, integration)
      result = api.call("put", "/pulls/#{pr.fetch('number')}/merge", { "sha" => tested_head, "merge_method" => "squash" })
      raise "GitHub did not merge PR ##{pr['number']}" unless result["merged"]

      puts "Merged Dependabot PR ##{pr['number']} after all CI jobs passed."
      if integration && current["merge_commit_sha"] != integration["merge_sha"]
        api.call("delete", "/git/refs/heads/#{integration_branch(integration)}")
      end
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
  elsif ARGV == ["--notify-integration"]
    DependabotMerge.notify_integration(api, ENV.fetch("GITHUB_RUN_ID"))
  elsif ARGV.empty?
    unless event.dig("inputs", "integration_run_id").to_s.empty?
      run_id = event.fetch("inputs").fetch("integration_run_id")
      DependabotMerge.wait_for_integration(api, run_id, repository)
      event = { "workflow_run" => { "id" => Integer(run_id) } }
    end
    if event.dig("workflow_run", "event") == "push"
      run = api.call("get", "/actions/runs/#{Integer(event.fetch('workflow_run').fetch('id'))}")
      unless run["path"] == ".github/workflows/ci.yml" && run["head_branch"] == "main" &&
             run["event"] == "push" && run["conclusion"] == "success" && run.dig("head_repository", "full_name") == repository
        abort "Expected successful CI on main."
      end
    elsif event.key?("workflow_run")
      begin
        DependabotMerge.merge(api, event, repository)
      ensure
        DependabotMerge.reconcile(api, repository)
      end
      exit
    end
    DependabotMerge.reconcile(api, repository)
  else
    abort "Unknown arguments"
  end
end
