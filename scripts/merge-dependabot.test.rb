# frozen_string_literal: true

require "minitest/autorun"
require_relative "merge-dependabot"

class DependabotMergeTest < Minitest::Test
  def update_message(type = "version-update:semver-patch")
    "Bump vitest\n\n---\nupdated-dependencies:\n- dependency-name: vitest\n  update-type: #{type}\n...\n"
  end

  def test_allows_only_known_non_major_metadata
    assert DependabotMerge.safe_update?(update_message)
    assert DependabotMerge.safe_update?(update_message("version-update:semver-minor"))
    refute DependabotMerge.safe_update?(update_message("version-update:semver-major"))
    refute DependabotMerge.safe_update?(update_message("unknown"))
    refute DependabotMerge.safe_update?("Bump vitest from 4.1.11 to 4.1.12")
    refute DependabotMerge.safe_update?("---\nupdated-dependencies: []\n...\n")
    refute DependabotMerge.safe_update?("---\nupdated-dependencies: !!ruby/object:Object {}\n...\n")
  end

  def test_classifies_security_updates_without_explicit_update_type
    security = "Bump vitest\n\nBumps [vitest](https://example.test) from 4.1.11 to 4.1.12.\n\n---\nupdated-dependencies:\n- dependency-name: vitest\n  dependency-version: 4.1.12\n...\n"
    assert DependabotMerge.safe_update?(security)
    refute DependabotMerge.safe_update?(security.sub("to 4.1.12.", "to 5.0.3."))
    refute DependabotMerge.safe_update?(security.sub("to 4.1.12.", "to 4.1.10."))
    refute DependabotMerge.safe_update?(security.sub("to 4.1.12.", "to 4.1.12-beta.1."))
  end

  def test_group_cannot_hide_a_major_or_unclassified_update
    grouped = update_message.sub("...", "- dependency-name: vite\n  update-type: version-update:semver-major\n...")
    refute DependabotMerge.safe_update?(grouped)
    assert DependabotMerge.safe_update?(grouped.sub("semver-major", "semver-minor"))
    refute DependabotMerge.safe_update?(grouped.sub("  update-type: version-update:semver-major\n", ""))
  end

  def test_classifies_each_member_of_a_security_group
    grouped = "Updates `vitest` from 4.1.11 to 4.1.12\nUpdates `vite` from 8.2.2 to 8.3.5\n\n---\nupdated-dependencies:\n- dependency-name: vitest\n- dependency-name: vite\n...\n"
    assert DependabotMerge.safe_update?(grouped)
    refute DependabotMerge.safe_update?(grouped.sub("to 8.3.5", "to 9.0.0"))
  end

  class FakeAPI
    attr_reader :writes, :responses

    def initialize(responses)
      @responses = responses
      @writes = []
    end

    def call(method, path, body = nil)
      if method == "put"
        @writes << [path, body]
        return { "merged" => true }
      end
      @responses.fetch(path)
    end

    def list(path, key = nil)
      @responses.fetch(path)
    end
  end

  def setup
    @responses = {
      "/actions/runs/42" => {
        "id" => 42, "run_attempt" => 1, "path" => ".github/workflows/ci.yml", "event" => "pull_request",
        "conclusion" => "success", "head_repository" => { "full_name" => "itsminni/fyre" },
        "head_branch" => "dependabot/npm_and_yarn/web/web-123", "head_sha" => "tested-head"
      },
      "/actions/runs/42/attempts/1/jobs" => DependabotMerge::REQUIRED_JOBS.map do |name|
        { "name" => name, "conclusion" => "success" }
      end,
      "/pulls?state=open&head=itsminni%3Adependabot%2Fnpm_and_yarn%2Fweb%2Fweb-123" => [{ "number" => 12 }],
      "/pulls/12" => {
        "number" => 12, "state" => "open", "draft" => false, "changed_files" => 2,
        "user" => { "login" => DependabotMerge::BOT },
        "head" => { "sha" => "tested-head", "ref" => "dependabot/npm_and_yarn/web/web-123", "repo" => { "full_name" => "itsminni/fyre" } },
        "base" => { "ref" => "main", "repo" => { "full_name" => "itsminni/fyre" } }
      },
      "/pulls/12/commits" => [{ "sha" => "tested-head", "author" => { "login" => DependabotMerge::BOT },
                                "commit" => { "verification" => { "verified" => true }, "message" => update_message } }],
      "/pulls/12/files" => %w[web/package.json web/package-lock.json].map { |file| { "filename" => file, "status" => "modified" } },
      "/git/ref/heads/main" => { "object" => { "sha" => "current-main" } },
      "/compare/current-main...tested-head" => { "behind_by" => 0, "status" => "ahead" }
    }
  end

  def run_merge
    api = FakeAPI.new(@responses)
    capture_io { DependabotMerge.merge(api, { "workflow_run" => { "id" => 42 } }, "itsminni/fyre") }
    api.writes
  end

  def test_merges_only_the_tested_head_after_all_jobs_pass
    assert_equal [["/pulls/12/merge", { "sha" => "tested-head", "merge_method" => "squash" }]], run_merge
  end

  def test_rejects_failed_skipped_missing_or_cancelled_jobs
    jobs = @responses["/actions/runs/42/attempts/1/jobs"]
    %w[failure skipped cancelled].each do |status|
      jobs.last["conclusion"] = status
      assert_empty run_merge
    end
    jobs.pop
    assert_empty run_merge
  end

  def test_rejects_wrong_event_workflow_repository_or_failed_run
    run = @responses["/actions/runs/42"]
    { "event" => "push", "path" => ".github/workflows/other.yml", "conclusion" => "failure",
      "head_repository" => { "full_name" => "attacker/fork" } }.each do |key, value|
      original = run[key]
      run[key] = value
      assert_empty run_merge
      run[key] = original
    end
  end

  def test_rejects_non_bot_draft_wrong_base_fork_and_stale_head
    pr = @responses["/pulls/12"]
    { "user" => { "login" => "contributor" }, "draft" => true, "state" => "closed",
      "base" => { "ref" => "release", "repo" => { "full_name" => "itsminni/fyre" } },
      "head" => { "sha" => "replacement-head", "repo" => { "full_name" => "itsminni/fyre" } } }.each do |key, value|
      original = pr[key]
      pr[key] = value
      assert_empty run_merge
      pr[key] = original
    end
    pr["head"]["repo"]["full_name"] = "attacker/fork"
    assert_empty run_merge
  end

  def test_rejects_unsigned_or_human_commits_and_major_updates
    commit = @responses["/pulls/12/commits"].first
    commit["commit"]["verification"]["verified"] = false
    assert_empty run_merge
    commit["commit"]["verification"]["verified"] = true
    commit["commit"]["message"] = update_message("version-update:semver-major")
    assert_empty run_merge
    commit["commit"]["message"] = update_message
    commit["author"]["login"] = "contributor"
    assert_empty run_merge
  end

  def test_rejects_source_automation_and_renamed_files
    file = @responses["/pulls/12/files"].last
    %w[web/src/App.tsx scripts/merge-dependabot.rb .github/workflows/dependabot-automerge.yml].each do |path|
      file["filename"] = path
      assert_empty run_merge
    end
    file["filename"] = "web/package-lock.json"
    file["status"] = "renamed"
    assert_empty run_merge
  end

  def test_rejects_incomplete_file_list_and_base_that_moved
    @responses["/pulls/12"]["changed_files"] = 3
    assert_empty run_merge
    @responses["/pulls/12"]["changed_files"] = 2
    @responses["/compare/current-main...tested-head"] = { "behind_by" => 1, "status" => "diverged" }
    assert_empty run_merge
  end
end
