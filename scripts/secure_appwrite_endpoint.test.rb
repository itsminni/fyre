# frozen_string_literal: true

require "minitest/autorun"
require_relative "secure_appwrite_endpoint"

class SecureAppwriteEndpointTest < Minitest::Test
  def test_accepts_https_for_remote_hosts
    assert_equal "example.test", SecureAppwriteEndpoint.validate!("https://example.test/v1").host
  end

  def test_accepts_http_only_for_loopback
    %w[http://localhost/v1 http://127.0.0.42/v1 http://[::1]/v1].each do |endpoint|
      assert SecureAppwriteEndpoint.validate!(endpoint)
    end
  end

  def test_rejects_remote_http_and_embedded_credentials
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("http://example.test/v1") }
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("https://user:secret@example.test/v1") }
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("https://example.test/v1?token=value") }
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("https://example.test/v1#fragment") }
  end

  def test_rejects_non_http_and_relative_urls
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("ftp://example.test/v1") }
    assert_raises(ArgumentError) { SecureAppwriteEndpoint.validate!("/v1") }
  end
end
