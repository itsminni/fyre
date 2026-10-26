# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require "yaml"

module DependabotMerge
  BOT = "dependabot[bot]"
  REQUIRED_JOBS = ["Web, shared contracts and functions", "Android", "iOS"].freeze
  ALLOWED_TYPES = %w[version-update:semver-patch version-update:semver-minor].freeze
  ALLOWED_FILES = %r{\A(?:web/package(?:-lock)?\.json|functions/(?:[a-z]+/)?package(?:-lock)?\.json|android/Fyre/(?:gradle/libs\.versions\.toml|(?:app/)?build\.gradle\.kts|settings\.gradle\.kts)|\.github/workflows/ci\.yml)\z}

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

      JSON.parse(response.body)
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

  def self.merge(api, event, repository)
    run = api.call("get", "/actions/runs/#{Integer(event.fetch('workflow_run').fetch('id'))}")
    return unless run["event"] == "pull_request" && run["conclusion"] == "success" &&
                  run["path"] == ".github/workflows/ci.yml" && run.dig("head_repository", "full_name") == repository

    jobs = api.list("/actions/runs/#{run.fetch('id')}/attempts/#{run.fetch('run_attempt')}/jobs", "jobs")
    return unless REQUIRED_JOBS.all? { |name| jobs.any? { |job| job["name"] == name && job["conclusion"] == "success" } }
    return unless jobs.all? { |job| job["conclusion"] == "success" }

    # Query by head as workflow_run.pull_requests can be empty.
    owner = repository.split("/").first
    head = URI.encode_www_form_component("#{owner}:#{run.fetch('head_branch')}")
    api.list("/pulls?state=open&head=#{head}").each do |candidate|
      pr = api.call("get", "/pulls/#{candidate.fetch('number')}")
      next unless pr["state"] == "open" && !pr["draft"] && pr.dig("user", "login") == BOT &&
                  pr.dig("head", "repo", "full_name") == repository &&
                  pr.dig("base", "repo", "full_name") == repository && pr.dig("base", "ref") == "main" &&
                  pr.dig("head", "ref") == run["head_branch"] && pr.dig("head", "sha") == run["head_sha"]

      commits = api.list("/pulls/#{pr.fetch('number')}/commits")
      next unless !commits.empty? && commits.last["sha"] == run["head_sha"] && commits.all? do |commit|
        commit.dig("author", "login") == BOT && commit.dig("commit", "verification", "verified") == true &&
          safe_update?(commit.dig("commit", "message").to_s)
      end

      files = api.list("/pulls/#{pr.fetch('number')}/files")
      next unless !files.empty? && files.length == pr["changed_files"] && files.all? do |file|
        file["status"] == "modified" && ALLOWED_FILES.match?(file.fetch("filename"))
      end

      base = api.call("get", "/git/ref/heads/main").fetch("object").fetch("sha")
      comparison = api.call("get", "/compare/#{base}...#{run.fetch('head_sha')}")
      unless comparison["behind_by"] == 0 && comparison["status"] == "ahead"
        puts "PR ##{pr['number']} needs a Dependabot rebase onto main before merging."
        next
      end

      # GitHub enforces branch rules. The expected head prevents merging a
      # replacement commit that arrived after the successful CI run.
      result = api.call("put", "/pulls/#{pr.fetch('number')}/merge", { "sha" => run.fetch("head_sha"), "merge_method" => "squash" })
      raise "GitHub did not merge PR ##{pr['number']}" unless result["merged"]

      puts "Merged Dependabot PR ##{pr['number']} after all CI jobs passed."
    end
  end
end

if $PROGRAM_NAME == __FILE__
  DependabotMerge.merge(
    DependabotMerge::API.new(ENV.fetch("GITHUB_REPOSITORY"), ENV.fetch("GH_TOKEN")),
    JSON.parse(File.read(ENV.fetch("GITHUB_EVENT_PATH"))),
    ENV.fetch("GITHUB_REPOSITORY")
  )
end
