# frozen_string_literal: true

require "minitest/autorun"
require_relative "merge-dependabot"

class DependabotMergeTest < Minitest::Test
  HEAD_SHA = "a" * 40
  BASE_SHA = "b" * 40
  MERGE_SHA = "c" * 40
  NEW_BASE_SHA = "d" * 40
  NEW_HEAD_SHA = "e" * 40
  NEW_MERGE_SHA = "f" * 40
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
      if %w[put post].include?(method)
        @writes << [path, body]
        return method == "put" ? { "merged" => true } : {}
      end
      response = @responses.fetch(path)
      response.respond_to?(:call) ? response.call : response
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
        "head_branch" => "dependabot/npm_and_yarn/web/web-123", "head_sha" => HEAD_SHA, "status" => "completed"
      },
      "/actions/runs/42/attempts/1/jobs" => DependabotMerge::REQUIRED_JOBS.map do |name|
        { "name" => name, "conclusion" => "success" }
      end,
      "/pulls?state=open&head=itsminni%3Adependabot%2Fnpm_and_yarn%2Fweb%2Fweb-123" => [{ "number" => 12 }],
      "/pulls/12" => {
        "number" => 12, "state" => "open", "draft" => false, "changed_files" => 2,
        "mergeable" => true, "merge_commit_sha" => MERGE_SHA,
        "user" => { "login" => DependabotMerge::BOT },
        "head" => { "sha" => HEAD_SHA, "ref" => "dependabot/npm_and_yarn/web/web-123", "repo" => { "full_name" => "itsminni/fyre" } },
        "base" => { "ref" => "main", "repo" => { "full_name" => "itsminni/fyre" } }
      },
      "/pulls/12/commits" => [{ "sha" => HEAD_SHA, "author" => { "login" => DependabotMerge::BOT },
                                "commit" => { "verification" => { "verified" => true }, "message" => update_message } }],
      "/pulls/12/files" => %w[web/package.json web/package-lock.json].map { |file| { "filename" => file, "status" => "modified" } },
      "/git/ref/heads/main" => { "object" => { "sha" => BASE_SHA } },
      "/compare/#{BASE_SHA}...#{HEAD_SHA}" => { "behind_by" => 0, "status" => "ahead" },
      "/git/commits/#{MERGE_SHA}" => { "sha" => MERGE_SHA, "parents" => [{ "sha" => BASE_SHA }, { "sha" => HEAD_SHA }] },
      "/actions/workflows/dependabot-integration.yml/runs?event=workflow_dispatch&branch=main&head_sha=#{BASE_SHA}" => []
    }
  end

  def run_merge
    @api = FakeAPI.new(@responses)
    @merge_output, = capture_io { DependabotMerge.merge(@api, { "workflow_run" => { "id" => 42 } }, "itsminni/fyre") }
    @api.writes
  end

  def use_android_wrapper_update
    files = %w[
      android/Fyre/gradle/libs.versions.toml
      android/Fyre/gradle/wrapper/gradle-wrapper.properties
      android/Fyre/gradle/wrapper/gradle-wrapper.jar
      android/Fyre/gradlew
      android/Fyre/gradlew.bat
    ]
    @responses["/pulls/12/files"] = files.map { |file| { "filename" => file, "status" => "modified" } }
    @responses["/pulls/12"]["changed_files"] = files.length
    @responses["/pulls/12/commits"].first["commit"]["message"] =
      update_message("version-update:semver-minor").gsub("vitest", "gradle-wrapper")
  end

  def test_merges_only_the_tested_head_after_all_jobs_pass
    assert_equal [["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], run_merge
  end

  def test_merges_verified_gradle_wrapper_updates_after_ci
    use_android_wrapper_update
    assert_equal [["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], run_merge
    assert_includes @merge_output, "Merged Dependabot PR #12"
  end

  def test_wrapper_updates_still_require_successful_ci_and_signed_non_major_commits
    use_android_wrapper_update
    android = @responses["/actions/runs/42/attempts/1/jobs"].find { |job| job["name"] == "Android" }
    android["conclusion"] = "failure"
    assert_empty run_merge
    assert_includes @merge_output, "Android"
    android["conclusion"] = "success"

    commit = @responses["/pulls/12/commits"].first
    commit["commit"]["verification"]["verified"] = false
    assert_empty run_merge
    commit["commit"]["verification"]["verified"] = true
    commit["commit"]["message"] = update_message("version-update:semver-major").gsub("vitest", "gradle-wrapper")
    assert_empty run_merge
    assert_includes @merge_output, "major or unclassified updates need review"
  end

  def test_wrapper_allowlist_rejects_other_scripts_and_files
    use_android_wrapper_update
    file = @responses["/pulls/12/files"].last
    %w[android/Fyre/gradlew.sh android/Fyre/gradle/wrapper/custom.jar android/Fyre/gradlew.bat/extra
       android/Fyre/gradle.properties android/Fyre/app/src/main/AndroidManifest.xml].each do |path|
      file["filename"] = path
      assert_empty run_merge
      assert_includes @merge_output, path
    end
    file["filename"] = "android/Fyre/gradlew.bat"
    file["status"] = "added"
    assert_empty run_merge
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

  def test_rejects_incomplete_file_list
    @responses["/pulls/12"]["changed_files"] = 3
    assert_empty run_merge
    assert_includes @merge_output, "changed-file list is empty or incomplete"
  end

  def test_reports_when_no_open_pull_request_matches_the_run
    @responses["/pulls?state=open&head=itsminni%3Adependabot%2Fnpm_and_yarn%2Fweb%2Fweb-123"] = []
    assert_empty run_merge
    assert_includes @merge_output, "no open pull request matches this branch"
  end

  def integration_inputs
    { "pr_number" => "12", "head_sha" => HEAD_SHA, "base_sha" => BASE_SHA, "merge_sha" => MERGE_SHA }
  end

  def dispatch_write(inputs = integration_inputs)
    ["/actions/workflows/dependabot-integration.yml/dispatches", { "ref" => "main", "inputs" => inputs }]
  end

  def stale_base
    @responses["/compare/#{BASE_SHA}...#{HEAD_SHA}"] = { "behind_by" => 1, "status" => "diverged" }
  end

  def use_integration(conclusion = "success")
    @responses["/actions/runs/42"].merge!(
      "event" => "workflow_dispatch", "head_branch" => "main", "head_sha" => BASE_SHA,
      "path" => ".github/workflows/dependabot-integration.yml", "conclusion" => conclusion,
      "display_title" => DependabotMerge.integration_title(integration_inputs)
    )
    @responses["/actions/runs/42/attempts/1/jobs"] = DependabotMerge::INTEGRATION_JOBS.map do |name|
      { "name" => name, "conclusion" => "success" }
    end
  end

  def advance_main
    @responses["/git/ref/heads/main"] = { "object" => { "sha" => NEW_BASE_SHA } }
    @responses["/pulls/12"]["merge_commit_sha"] = NEW_MERGE_SHA
    @responses["/git/commits/#{NEW_MERGE_SHA}"] = {
      "sha" => NEW_MERGE_SHA, "parents" => [{ "sha" => NEW_BASE_SHA }, { "sha" => HEAD_SHA }]
    }
    @responses["/actions/workflows/dependabot-integration.yml/runs?event=workflow_dispatch&branch=main&head_sha=#{NEW_BASE_SHA}"] = []
  end

  def test_dispatches_integration_for_a_branch_behind_main_without_merging
    stale_base
    assert_equal [dispatch_write], run_merge
    assert_includes @merge_output, "waiting before merging"
  end

  def test_full_integration_lifecycle_keeps_the_dependabot_branch_unchanged
    stale_base
    writes = run_merge
    inputs = writes.fetch(0).last.fetch("inputs")
    assert_equal MERGE_SHA, DependabotMerge.prepare_integration(FakeAPI.new(@responses), inputs, "itsminni/fyre")
    use_integration
    writes += run_merge
    assert_equal [dispatch_write, ["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], writes
  end

  def test_merges_only_the_exact_successful_integration
    use_integration
    assert_equal [["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], run_merge
  end

  def test_an_exact_merge_is_still_usable_while_github_recomputes_mergeability
    use_integration
    @responses["/pulls/12"]["mergeable"] = nil
    assert_equal MERGE_SHA, DependabotMerge.prepare_integration(FakeAPI.new(@responses), integration_inputs, "itsminni/fyre")
    assert_equal [["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], run_merge
  end

  def test_retains_all_security_gates_before_dispatching
    stale_base
    original = Marshal.dump(@responses)
    [
      -> { @responses["/pulls/12"]["user"]["login"] = "contributor" },
      -> { @responses["/pulls/12"]["head"]["repo"]["full_name"] = "attacker/fork" },
      -> { @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = false },
      -> { @responses["/pulls/12/commits"].first["commit"]["message"] = update_message("version-update:semver-major") },
      -> { @responses["/pulls/12/files"].last["filename"] = "scripts/merge-dependabot.rb" }
    ].each do |change|
      @responses = Marshal.load(original)
      change.call
      assert_empty run_merge
    end
  end

  def test_integration_cannot_bypass_signature_or_file_checks
    use_integration
    @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = false
    assert_empty run_merge
    @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = true
    @responses["/pulls/12/files"].last["filename"] = "web/src/App.tsx"
    assert_empty run_merge
  end

  def test_failed_skipped_cancelled_or_missing_integration_jobs_never_merge
    use_integration
    jobs = @responses["/actions/runs/42/attempts/1/jobs"]
    %w[failure skipped cancelled].each do |status|
      jobs.last["conclusion"] = status
      assert_empty run_merge
    end
    jobs.pop
    assert_empty run_merge
    use_integration("failure")
    assert_empty run_merge
  end

  def test_integration_needs_the_validation_job_and_each_platform
    use_integration
    jobs = @responses["/actions/runs/42/attempts/1/jobs"]
    jobs.dup.each do |job|
      jobs.delete(job)
      assert_empty run_merge
      jobs << job
    end
  end

  def test_main_advancing_during_tests_requests_new_integration
    use_integration
    advance_main
    expected = integration_inputs.merge("base_sha" => NEW_BASE_SHA, "merge_sha" => NEW_MERGE_SHA)
    assert_equal [dispatch_write(expected)], run_merge
  end

  def test_old_failed_integration_can_be_replaced_when_main_advances
    use_integration("failure")
    advance_main
    expected = integration_inputs.merge("base_sha" => NEW_BASE_SHA, "merge_sha" => NEW_MERGE_SHA)
    assert_equal [dispatch_write(expected)], run_merge
  end

  def test_updated_pr_head_never_uses_old_integration_results
    use_integration
    @responses["/pulls/12"]["head"]["sha"] = NEW_HEAD_SHA
    assert_empty run_merge
  end

  def test_main_advancing_immediately_before_merge_requests_new_tests
    use_integration
    reads = 0
    @responses["/git/ref/heads/main"] = lambda do
      reads += 1
      advance_main if reads == 2
      { "object" => { "sha" => reads == 1 ? BASE_SHA : NEW_BASE_SHA } }
    end
    expected = integration_inputs.merge("base_sha" => NEW_BASE_SHA, "merge_sha" => NEW_MERGE_SHA)
    assert_equal [dispatch_write(expected)], run_merge
  end

  def test_pr_advancing_immediately_before_merge_never_merges
    use_integration
    pr = @responses["/pulls/12"]
    reads = 0
    @responses["/pulls/12"] = lambda do
      reads += 1
      pr["head"]["sha"] = NEW_HEAD_SHA if reads == 2
      pr
    end
    assert_empty run_merge
  end

  def test_unknown_mergeability_is_refreshed_before_dispatch
    stale_base
    pr = @responses["/pulls/12"]
    reads = 0
    @responses["/pulls/12"] = lambda do
      reads += 1
      pr.merge("mergeable" => reads < 3 ? nil : true)
    end
    pauses = []
    DependabotMerge.stub(:sleep, ->(seconds) { pauses << seconds }) do
      assert_equal [dispatch_write], run_merge
    end
    assert_equal [2], pauses
  end

  def test_a_stale_merge_ref_is_not_dispatched
    stale_base
    @responses["/git/commits/#{MERGE_SHA}"]["parents"].first["sha"] = NEW_BASE_SHA
    DependabotMerge.stub(:sleep, nil) do
      assert_empty run_merge
      assert_includes @merge_output, "deferred to the next automatic check"
    end
  end

  def prepare_reconciliation
    @responses["/pulls?state=open&base=main"] = [@responses["/pulls/12"]]
    @responses["/actions/workflows/ci.yml/runs?event=pull_request&head_sha=#{HEAD_SHA}"] = [@responses["/actions/runs/42"]]
  end

  def reconcile
    @api = FakeAPI.new(@responses)
    capture_io { DependabotMerge.reconcile(@api, "itsminni/fyre") }
    @api.writes
  end

  def test_reconciliation_recovers_green_prs_without_a_new_pr_event
    prepare_reconciliation
    assert_equal [["/pulls/12/merge", { "sha" => HEAD_SHA, "merge_method" => "squash" }]], reconcile
  end

  def test_reconciliation_dispatches_tests_when_main_has_advanced
    prepare_reconciliation
    stale_base
    assert_equal [dispatch_write], reconcile
  end

  def test_reconciliation_never_falls_back_to_older_successful_ci
    prepare_reconciliation
    runs = @responses["/actions/workflows/ci.yml/runs?event=pull_request&head_sha=#{HEAD_SHA}"]
    %w[failure cancelled].each do |conclusion|
      runs << runs.first.merge("id" => 43, "conclusion" => conclusion)
      assert_empty reconcile
      runs.pop
    end
    runs << runs.first.merge("id" => 43, "status" => "in_progress", "conclusion" => nil)
    assert_empty reconcile
  end

  def test_reconciliation_ignores_forks_humans_and_unsigned_updates
    prepare_reconciliation
    @responses["/pulls/12"]["user"]["login"] = "human"
    assert_empty reconcile
    @responses["/pulls/12"]["user"]["login"] = DependabotMerge::BOT
    @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = false
    assert_empty reconcile
    @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = true
    @responses["/actions/runs/42"]["head_repository"]["full_name"] = "attacker/fork"
    assert_empty reconcile
  end

  def test_reconciliation_recovers_after_merge_ref_becomes_available
    prepare_reconciliation
    stale_base
    @responses["/git/commits/#{MERGE_SHA}"]["parents"].first["sha"] = NEW_BASE_SHA
    DependabotMerge.stub(:sleep, nil) { assert_empty reconcile }
    @responses["/git/commits/#{MERGE_SHA}"]["parents"].first["sha"] = BASE_SHA
    assert_equal [dispatch_write], reconcile
  end

  def test_a_failed_integration_does_not_block_another_pending_pr
    prepare_reconciliation
    stale_base
    path = "/actions/workflows/dependabot-integration.yml/runs?event=workflow_dispatch&branch=main&head_sha=#{BASE_SHA}"
    @responses[path] = [{ "display_title" => DependabotMerge.integration_title(integration_inputs), "conclusion" => "failure" }]
    @responses["/pulls?state=open&base=main"] << @responses["/pulls/12"].merge("number" => 13)
    visits = []
    callback = lambda do |_api, event, _repository|
      visits << event.fetch("workflow_run").fetch("id")
      raise "Integration failed" if visits.length == 1
    end
    DependabotMerge.stub(:merge, callback) { assert_empty reconcile }
    assert_equal [42, 42], visits
  end

  def test_rejects_integration_from_wrong_workflow_branch_repository_or_title
    use_integration
    run = @responses["/actions/runs/42"]
    { "path" => ".github/workflows/other.yml", "head_branch" => "other", "head_sha" => NEW_BASE_SHA,
      "head_repository" => { "full_name" => "attacker/fork" }, "display_title" => "forged title" }.each do |key, value|
      original = run[key]
      run[key] = value
      assert_empty run_merge
      run[key] = original
    end
  end

  def test_rejects_a_merge_with_different_or_extra_parents
    use_integration
    commit = @responses["/git/commits/#{MERGE_SHA}"]
    [[{ "sha" => NEW_BASE_SHA }, { "sha" => HEAD_SHA }],
     [{ "sha" => BASE_SHA }, { "sha" => NEW_HEAD_SHA }],
     [{ "sha" => BASE_SHA }, { "sha" => HEAD_SHA }, { "sha" => NEW_HEAD_SHA }]].each do |parents|
      commit["parents"] = parents
      assert_empty run_merge
    end
  end

  def test_rejects_a_different_merge_ref_even_with_the_same_parents
    use_integration
    @responses["/pulls/12"]["merge_commit_sha"] = NEW_MERGE_SHA
    assert_empty run_merge
  end

  def test_conflicts_do_not_dispatch_or_merge
    stale_base
    @responses["/pulls/12"]["mergeable"] = false
    assert_empty run_merge
    assert_includes @merge_output, "merge conflicts"
  end

  def test_duplicate_requests_do_not_start_more_ci_runs
    stale_base
    path = "/actions/workflows/dependabot-integration.yml/runs?event=workflow_dispatch&branch=main&head_sha=#{BASE_SHA}"
    %w[queued in_progress completed].each do |status|
      @responses[path] = [{ "display_title" => DependabotMerge.integration_title(integration_inputs), "status" => status,
                            "conclusion" => status == "completed" ? "success" : nil }]
      assert_empty run_merge
      assert_includes @merge_output, "already requested"
    end
  end

  def test_failed_existing_integration_is_not_retried_in_a_loop
    stale_base
    path = "/actions/workflows/dependabot-integration.yml/runs?event=workflow_dispatch&branch=main&head_sha=#{BASE_SHA}"
    @responses[path] = [{ "display_title" => DependabotMerge.integration_title(integration_inputs), "conclusion" => "failure" }]
    error = assert_raises(RuntimeError) { run_merge }
    assert_includes error.message, "failed"
    assert_empty @api.writes
  end

  def test_preparation_returns_only_the_validated_merge_sha
    assert_equal MERGE_SHA, DependabotMerge.prepare_integration(FakeAPI.new(@responses), integration_inputs, "itsminni/fyre")
  end

  def test_preparation_rejects_invalid_inputs_before_any_api_call
    %w[pr_number head_sha base_sha merge_sha].each do |key|
      error = assert_raises(RuntimeError) do
        DependabotMerge.prepare_integration(FakeAPI.new({}), integration_inputs.merge(key => "../../unsafe\nvalue"), "itsminni/fyre")
      end
      assert_match(/Invalid/, error.message)
    end
  end

  def test_preparation_rejects_changed_heads_unsigned_commits_and_forged_merges
    original = Marshal.dump(@responses)
    [
      -> { @responses["/pulls/12"]["head"]["sha"] = NEW_HEAD_SHA },
      -> { @responses["/pulls/12/commits"].first["commit"]["verification"]["verified"] = false },
      -> { @responses["/pulls/12"]["merge_commit_sha"] = NEW_MERGE_SHA },
      -> { @responses["/git/commits/#{MERGE_SHA}"]["parents"].first["sha"] = NEW_BASE_SHA }
    ].each do |change|
      @responses = Marshal.load(original)
      change.call
      assert_raises(RuntimeError) do
        DependabotMerge.prepare_integration(FakeAPI.new(@responses), integration_inputs, "itsminni/fyre")
      end
    end
  end

  def test_dispatch_accepts_an_empty_204_response
    response = Net::HTTPNoContent.new("1.1", "204", "No Content")
    response.instance_variable_set(:@read, true)
    http = Object.new
    requests = []
    http.define_singleton_method(:request) do |request|
      requests << request
      response
    end
    api = DependabotMerge::API.new("itsminni/fyre", "test-token")
    Net::HTTP.stub(:start, ->(*_args, &block) { block.call(http) }) do
      assert_equal({}, api.call("post", "/actions/workflows/dependabot-integration.yml/dispatches", { "ref" => "main" }))
    end
    assert_instance_of Net::HTTP::Post, requests.fetch(0)
    assert_equal "/repos/itsminni/fyre/actions/workflows/dependabot-integration.yml/dispatches", requests.first.path
    assert_equal({ "ref" => "main" }, JSON.parse(requests.first.body))
  end

  def test_reusable_ci_checks_the_same_sha_on_every_platform_with_read_only_permissions
    ci = YAML.load_file(File.expand_path("../.github/workflows/ci.yml", __dir__))
    integration = YAML.load_file(File.expand_path("../.github/workflows/dependabot-integration.yml", __dir__))
    caller = integration.fetch("jobs").fetch("ci")
    assert_equal "./.github/workflows/ci.yml", caller.fetch("uses")
    assert_equal ["validate"], Array(caller.fetch("needs"))
    assert_equal "${{ needs.validate.outputs.merge_sha }}", caller.fetch("with").fetch("checkout_ref")
    assert_equal({ "contents" => "read" }, caller.fetch("permissions"))
    refute caller.key?("secrets")
    names = ci.fetch("jobs").values.map { |job| "#{caller.fetch('name')} / #{job.fetch('name')}" }
    assert_equal DependabotMerge::INTEGRATION_JOBS.sort, ([integration.fetch("jobs").fetch("validate").fetch("name")] + names).sort
    assert_equal({ "contents" => "read" }, ci.fetch("permissions"))
    ci.fetch("jobs").each_value do |job|
      checkout = job.fetch("steps").find { |step| step["uses"].to_s.start_with?("actions/checkout@") }
      assert_equal "${{ inputs.checkout_ref || github.sha }}", checkout.fetch("with").fetch("ref")
      assert_equal false, checkout.fetch("with").fetch("persist-credentials")
    end
  end
end
