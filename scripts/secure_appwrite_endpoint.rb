# frozen_string_literal: true

require "ipaddr"
require "uri"

module SecureAppwriteEndpoint
  module_function

  def validate!(value, label: "APPWRITE_ENDPOINT")
    uri = URI.parse(value)
    host = uri.host&.delete_prefix("[")&.delete_suffix("]")
    scheme = uri.scheme&.downcase

    valid = uri.absolute? && !host.to_s.empty? && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil? && (
      scheme == "https" || (scheme == "http" && loopback_host?(host))
    )
    return uri if valid

    raise ArgumentError, "#{label} must use HTTPS; HTTP is allowed only for localhost or a loopback IP"
  rescue URI::InvalidURIError
    raise ArgumentError, "#{label} must be a valid absolute URL"
  end

  def loopback_host?(host)
    normalized = host.to_s.downcase
    return true if normalized == "localhost"

    address = IPAddr.new(normalized)
    return IPAddr.new("127.0.0.0/8").include?(address) if address.ipv4?

    address == IPAddr.new("::1")
  rescue IPAddr::InvalidAddressError
    false
  end
end
